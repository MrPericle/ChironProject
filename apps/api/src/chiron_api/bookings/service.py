from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chiron_api.config import Settings
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    CourseSession,
    CourseStatus,
    User,
    utc_now,
)


def confirmed_booking_count(db: Session, course_session_id: UUID) -> int:
    return (
        db.scalar(
            select(func.count(Booking.id)).where(
                Booking.course_session_id == course_session_id,
                Booking.status == BookingStatus.CONFIRMED,
            ),
        )
        or 0
    )


def next_session_start(course_session: CourseSession, *, now: datetime | None = None) -> datetime:
    current_time = now or utc_now()
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=UTC)

    days_until_session = (course_session.weekday - current_time.weekday()) % 7
    session_date = current_time.date() + timedelta(days=days_until_session)
    candidate = datetime.combine(session_date, course_session.starts_at, tzinfo=UTC)
    if candidate <= current_time:
        candidate += timedelta(days=7)
    return candidate


def cancellation_deadline(
    course_session: CourseSession,
    *,
    now: datetime | None = None,
) -> datetime:
    return next_session_start(course_session, now=now) - timedelta(
        hours=course_session.cancellation_deadline_hours,
    )


def ensure_booking_can_be_cancelled(course_session: CourseSession) -> None:
    if utc_now() > cancellation_deadline(course_session):
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


def get_existing_booking(db: Session, user_id: UUID, course_session_id: UUID) -> Booking | None:
    return db.scalar(
        select(Booking).where(
            Booking.user_id == user_id,
            Booking.course_session_id == course_session_id,
        ),
    )


def create_booking(
    db: Session,
    *,
    user: User,
    course_session_id: UUID,
    settings: Settings,
) -> Booking:
    course_session = get_locked_course_session(db, course_session_id)
    existing_booking = get_existing_booking(db, user.id, course_session_id)
    if existing_booking is not None and existing_booking.status != BookingStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking already exists")

    booked_spots = confirmed_booking_count(db, course_session_id)
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


def cancel_booking(db: Session, *, user: User, booking_id: UUID) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None or booking.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.status == BookingStatus.CANCELLED:
        return booking

    ensure_booking_can_be_cancelled(booking.course_session)
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = utc_now()
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def list_user_bookings(db: Session, *, user: User) -> list[Booking]:
    return list(
        db.scalars(
            select(Booking).where(Booking.user_id == user.id).order_by(Booking.created_at.desc()),
        ).all(),
    )
