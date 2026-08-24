from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from chiron_api.db.models import (
    Booking,
    Course,
    CourseSession,
    Location,
    Subscription,
    User,
    subscription_expiry_date,
)


def calculate_expiry_date(starts_on: date, duration_days: int) -> date:
    return subscription_expiry_date(starts_on, duration_days)


def is_subscription_active_on(starts_on: date, duration_days: int, target_date: date) -> bool:
    return starts_on <= target_date <= calculate_expiry_date(starts_on, duration_days)


def latest_user_subscription(db: Session, user_id: UUID) -> Subscription | None:
    return db.scalar(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.starts_on.desc(), Subscription.created_at.desc()),
    )


def user_has_booking_in_location(db: Session, *, user_id: UUID, location_id: UUID) -> bool:
    return (
        db.scalar(
            select(Booking.id)
            .join(CourseSession, Booking.course_session_id == CourseSession.id)
            .join(Course, CourseSession.course_id == Course.id)
            .join(Location, Course.location_id == Location.id)
            .where(Booking.user_id == user_id, Location.id == location_id)
            .limit(1),
        )
        is not None
    )


def list_subscriptions(
    db: Session,
    *,
    expires_before: date | None = None,
    location_id: UUID | None = None,
) -> list[tuple[Subscription, User]]:
    rows = db.execute(
        select(Subscription, User)
        .join(User, Subscription.user_id == User.id)
        .order_by(Subscription.starts_on.desc(), User.email),
    ).all()

    filtered_rows: list[tuple[Subscription, User]] = []
    for subscription, user in rows:
        if expires_before is not None and subscription.expires_on >= expires_before:
            continue
        if location_id is not None and not user_has_booking_in_location(
            db,
            user_id=user.id,
            location_id=location_id,
        ):
            continue
        filtered_rows.append((subscription, user))

    return filtered_rows
