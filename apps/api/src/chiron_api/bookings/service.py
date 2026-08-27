from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chiron_api.config import Settings
from chiron_api.courses.scheduling import (
    local_today,
    occurrence_start_at,
    sunday_based_weekday,
)
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    CourseSession,
    CourseStatus,
    User,
    utc_now,
)
from chiron_api.subscriptions.service import user_has_active_subscription


def confirmed_booking_count(db: Session, course_session_id: UUID, occurs_on: date) -> int:
    return (
        db.scalar(
            select(func.count(Booking.id)).where(
                Booking.course_session_id == course_session_id,
                Booking.occurs_on == occurs_on,
                Booking.status == BookingStatus.CONFIRMED,
            ),
        )
        or 0
    )


def max_confirmed_booking_count(db: Session, course_session_id: UUID) -> int:
    counts = db.scalars(
        select(func.count(Booking.id))
        .where(
            Booking.course_session_id == course_session_id,
            Booking.status == BookingStatus.CONFIRMED,
        )
        .group_by(Booking.occurs_on),
    ).all()
    return max(counts, default=0)


def cancellation_deadline(
    course_session: CourseSession,
    occurs_on: date,
    settings: Settings,
) -> datetime:
    session_start = occurrence_start_at(
        occurs_on,
        course_session.starts_at,
        settings.app_timezone,
    )
    return session_start - timedelta(hours=course_session.cancellation_deadline_hours)


def ensure_booking_can_be_cancelled(
    course_session: CourseSession,
    occurs_on: date,
    settings: Settings,
) -> None:
    if utc_now() > cancellation_deadline(course_session, occurs_on, settings):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancellation deadline has passed",
        )


def get_locked_course_session(db: Session, course_session_id: UUID) -> CourseSession:
    course_session = db.scalar(
        select(CourseSession).where(CourseSession.id == course_session_id).with_for_update(),
    )
    if course_session is None or not course_session.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course session not found",
        )
    if course_session.course.status != CourseStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Course is not bookable")
    return course_session


def validate_occurrence_date(
    course_session: CourseSession,
    occurs_on: date,
    settings: Settings,
) -> None:
    today = local_today(settings.app_timezone)
    horizon = today + timedelta(days=settings.booking_horizon_days)
    if occurs_on < today or occurs_on > horizon:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Occurrence date is outside the booking window",
        )
    if sunday_based_weekday(occurs_on) != course_session.weekday:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Occurrence date does not match the course schedule",
        )
    if occurrence_start_at(occurs_on, course_session.starts_at, settings.app_timezone) <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Occurrence has already started",
        )


def get_existing_booking(
    db: Session,
    user_id: UUID,
    course_session_id: UUID,
    occurs_on: date,
) -> Booking | None:
    return db.scalar(
        select(Booking).where(
            Booking.user_id == user_id,
            Booking.course_session_id == course_session_id,
            Booking.occurs_on == occurs_on,
        ),
    )


def create_booking(
    db: Session,
    *,
    user: User,
    course_session_id: UUID,
    occurs_on: date,
    settings: Settings,
) -> Booking:
    if not user_has_active_subscription(db, user.id, target_date=occurs_on):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active subscription required",
        )

    course_session = get_locked_course_session(db, course_session_id)
    validate_occurrence_date(course_session, occurs_on, settings)
    existing_booking = get_existing_booking(db, user.id, course_session_id, occurs_on)
    if existing_booking is not None and existing_booking.status != BookingStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking already exists")

    booked_spots = confirmed_booking_count(db, course_session_id, occurs_on)
    if booked_spots < course_session.capacity:
        booking_status = BookingStatus.CONFIRMED
    elif settings.waitlist_enabled:
        booking_status = BookingStatus.WAITLISTED
    else:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Course session is full")

    if existing_booking is None:
        booking = Booking(
            user_id=user.id,
            course_session_id=course_session_id,
            occurs_on=occurs_on,
            status=booking_status,
        )
    else:
        booking = existing_booking
        booking.status = booking_status
        booking.cancelled_at = None
        booking.created_at = utc_now()

    db.add(booking)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Booking already exists",
        ) from exc

    db.refresh(booking)
    return booking


def cancel_booking(
    db: Session,
    *,
    user: User,
    booking_id: UUID,
    settings: Settings,
) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None or booking.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.status == BookingStatus.CANCELLED:
        return booking

    ensure_booking_can_be_cancelled(booking.course_session, booking.occurs_on, settings)
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = utc_now()
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def cancel_active_user_bookings(
    db: Session,
    *,
    user_id: UUID,
    settings: Settings,
) -> int:
    bookings = db.scalars(
        select(Booking).where(
            Booking.user_id == user_id,
            Booking.occurs_on >= local_today(settings.app_timezone),
            Booking.status.in_((BookingStatus.CONFIRMED, BookingStatus.WAITLISTED)),
        ),
    ).all()
    cancelled_at = utc_now()
    for booking in bookings:
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = cancelled_at
        db.add(booking)
    return len(bookings)


def list_user_bookings(db: Session, *, user: User) -> list[Booking]:
    return list(
        db.scalars(
            select(Booking)
            .where(Booking.user_id == user.id)
            .order_by(Booking.occurs_on.desc(), Booking.created_at.desc()),
        ).all(),
    )
