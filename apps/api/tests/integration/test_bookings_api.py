from collections.abc import Generator
from datetime import date, time, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chiron_api.auth.tokens import create_access_token
from chiron_api.config import Settings, get_settings
from chiron_api.courses.scheduling import occurrence_dates
from chiron_api.db.base import Base
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    Course,
    CourseSession,
    CourseStatus,
    Location,
    Subscription,
    User,
)
from chiron_api.db.session import get_db_session
from chiron_api.main import create_app


def make_client(*, waitlist_enabled: bool = False) -> tuple[TestClient, sessionmaker[Session]]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=engine)

    def override_get_db_session() -> Generator[Session]:
        with testing_session_local() as session:
            yield session

    def override_get_settings() -> Settings:
        return Settings(WAITLIST_ENABLED=waitlist_enabled)

    app = create_app()
    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_settings] = override_get_settings

    return TestClient(app), testing_session_local


def create_user(
    session_factory: sessionmaker[Session],
    email: str,
    *,
    with_active_subscription: bool = True,
) -> User:
    with session_factory() as session:
        user = User(email=email, password_hash="test-hash")
        session.add(user)
        session.flush()
        if with_active_subscription:
            session.add(
                Subscription(
                    user_id=user.id,
                    starts_on=date.today() - timedelta(days=1),
                    duration_days=30,
                ),
            )
        session.commit()
        session.refresh(user)
        return user


def create_course_session(
    session_factory: sessionmaker[Session],
    *,
    capacity: int = 1,
) -> CourseSession:
    with session_factory() as session:
        location = Location(name="Chiron Roma", address="Via Pelio 1", city="Roma")
        course = Course(
            location=location,
            title="Calisthenics",
            status=CourseStatus.PUBLISHED,
        )
        course_session = CourseSession(
            course=course,
            weekday=6,
            starts_at=time(23, 59),
            ends_at=time(23, 59, 59),
            capacity=capacity,
            cancellation_deadline_hours=0,
        )
        session.add_all([location, course, course_session])
        session.commit()
        session.refresh(course_session)
        return course_session


def headers_for(user: User) -> dict[str, str]:
    token = create_access_token(user, get_settings())
    return {"Authorization": f"Bearer {token}"}


def next_occurrence_date(weekday: int) -> date:
    return next(
        occurrence_dates(
            weekday,
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=7),
        ),
    )


def booking_payload(course_session: CourseSession, *, weeks_ahead: int = 0) -> dict[str, str]:
    occurs_on = next_occurrence_date(course_session.weekday) + timedelta(days=7 * weeks_ahead)
    return {
        "course_session_id": str(course_session.id),
        "occurs_on": occurs_on.isoformat(),
    }


def test_user_can_create_and_cancel_booking() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, "member@example.com")
    course_session = create_course_session(session_factory)

    create_response = client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(user),
    )
    assert create_response.status_code == 201
    booking = create_response.json()
    assert booking["status"] == "confirmed"
    assert booking["course_session_id"] == str(course_session.id)
    assert booking["occurs_on"] == booking_payload(course_session)["occurs_on"]

    history_response = client.get("/bookings/me", headers=headers_for(user))
    assert history_response.status_code == 200
    assert len(history_response.json()) == 1

    cancel_response = client.delete(f"/bookings/{booking['id']}", headers=headers_for(user))
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"


def test_user_needs_an_active_subscription_to_book() -> None:
    client, session_factory = make_client()
    user = create_user(
        session_factory,
        "inactive@example.com",
        with_active_subscription=False,
    )
    course_session = create_course_session(session_factory)

    response = client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(user),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Active subscription required"


def test_booking_full_session_returns_conflict_without_waitlist() -> None:
    client, session_factory = make_client()
    first_user = create_user(session_factory, "first@example.com")
    second_user = create_user(session_factory, "second@example.com")
    course_session = create_course_session(session_factory, capacity=1)

    first_response = client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(first_user),
    )
    assert first_response.status_code == 201

    second_response = client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(second_user),
    )
    assert second_response.status_code == 409


def test_waitlist_can_be_enabled_for_full_session() -> None:
    client, session_factory = make_client(waitlist_enabled=True)
    first_user = create_user(session_factory, "first@example.com")
    second_user = create_user(session_factory, "second@example.com")
    course_session = create_course_session(session_factory, capacity=1)

    client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(first_user),
    )
    response = client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(second_user),
    )

    assert response.status_code == 201
    assert response.json()["status"] == "waitlisted"


def test_user_cannot_duplicate_active_booking() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, "member@example.com")
    course_session = create_course_session(session_factory, capacity=2)

    client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(user),
    )
    response = client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(user),
    )

    assert response.status_code == 409


def test_cancel_booking_after_deadline_is_rejected() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, "member@example.com")

    with session_factory() as session:
        location = Location(name="Chiron Milano", address="Via Pelio 2", city="Milano")
        course = Course(location=location, title="Pole", status=CourseStatus.PUBLISHED)
        course_session = CourseSession(
            course=course,
            weekday=0,
            starts_at=time(0, 1),
            ends_at=time(1, 0),
            capacity=1,
            cancellation_deadline_hours=24 * 14,
        )
        booking = Booking(
            user_id=user.id,
            course_session=course_session,
            occurs_on=next_occurrence_date(course_session.weekday),
            status=BookingStatus.CONFIRMED,
        )
        session.add_all([location, course, course_session, booking])
        session.commit()
        session.refresh(booking)
        booking_id = str(booking.id)

    response = client.delete(f"/bookings/{booking_id}", headers=headers_for(user))

    assert response.status_code == 409


def test_user_can_book_the_same_schedule_on_different_dates() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, "member@example.com")
    course_session = create_course_session(session_factory, capacity=1)

    first_response = client.post(
        "/bookings",
        json=booking_payload(course_session),
        headers=headers_for(user),
    )
    second_response = client.post(
        "/bookings",
        json=booking_payload(course_session, weeks_ahead=1),
        headers=headers_for(user),
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_response.json()["occurs_on"] != second_response.json()["occurs_on"]
