from datetime import date

from sqlalchemy import CheckConstraint, UniqueConstraint

from chiron_api.db.base import Base
from chiron_api.db.models import (
    Booking,
    CourseSession,
    Subscription,
    subscription_expiry_date,
)


def constraint_names(model: type) -> set[str]:
    return {constraint.name for constraint in model.__table__.constraints if constraint.name}


def test_core_tables_are_registered() -> None:
    assert {
        "admin_2fa",
        "audit_logs",
        "bookings",
        "course_sessions",
        "courses",
        "locations",
        "subscriptions",
        "user_profiles",
        "users",
    }.issubset(Base.metadata.tables.keys())


def test_booking_prevents_duplicate_user_session_dates() -> None:
    constraints = Booking.__table__.constraints

    assert any(
        isinstance(constraint, UniqueConstraint)
        and set(constraint.columns.keys()) == {"user_id", "course_session_id", "occurs_on"}
        for constraint in constraints
    )


def test_course_session_has_capacity_and_schedule_constraints() -> None:
    constraints = CourseSession.__table__.constraints

    assert "ck_course_sessions_capacity_positive" in constraint_names(CourseSession)
    assert "ck_course_sessions_weekday_range" in constraint_names(CourseSession)
    assert "ck_course_sessions_time_order" in constraint_names(CourseSession)
    assert any(isinstance(constraint, CheckConstraint) for constraint in constraints)


def test_subscription_expiry_is_calculated_from_start_and_duration() -> None:
    assert subscription_expiry_date(date(2026, 1, 10), duration_days=30) == date(2026, 2, 9)

    subscription = Subscription(starts_on=date(2026, 1, 10), duration_days=30)

    assert subscription.expires_on == date(2026, 2, 9)


def test_subscription_model_does_not_include_payment_state() -> None:
    forbidden_columns = {"paid", "is_paid", "payment_status", "stripe_id", "transaction_id"}

    assert forbidden_columns.isdisjoint(Subscription.__table__.columns.keys())
