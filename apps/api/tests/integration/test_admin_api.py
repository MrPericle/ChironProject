from collections.abc import Generator
from datetime import date, time, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chiron_api.auth.tokens import create_access_token
from chiron_api.config import get_settings
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
    UserProfile,
    UserRole,
    UserStatus,
)
from chiron_api.db.session import get_db_session
from chiron_api.main import create_app


def make_client() -> tuple[TestClient, sessionmaker[Session]]:
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

    app = create_app()
    app.dependency_overrides[get_db_session] = override_get_db_session

    return TestClient(app), testing_session_local


def create_user(
    session_factory: sessionmaker[Session],
    *,
    email: str,
    role: UserRole = UserRole.USER,
) -> User:
    with session_factory() as session:
        user = User(email=email, password_hash="test-hash", role=role)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


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


def test_admin_can_manage_users_and_subscriptions() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, email="admin@example.com", role=UserRole.ADMIN)

    create_response = client.post(
        "/admin/users",
        json={
            "email": "member@example.com",
            "password": "password-segreta",
            "first_name": "Mattia",
            "last_name": "Rossi",
            "role": "user",
        },
        headers=headers_for(admin),
    )
    assert create_response.status_code == 201
    member_id = create_response.json()["id"]

    update_response = client.patch(
        f"/admin/users/{member_id}",
        json={"first_name": "Matteo", "status": "active"},
        headers=headers_for(admin),
    )
    assert update_response.status_code == 200
    assert update_response.json()["first_name"] == "Matteo"

    subscription_response = client.post(
        f"/admin/users/{member_id}/subscriptions",
        json={"starts_on": "2026-08-01", "duration_days": 45},
        headers=headers_for(admin),
    )
    assert subscription_response.status_code == 201
    assert subscription_response.json()["expires_on"] == "2026-09-15"

    users_response = client.get("/admin/users", headers=headers_for(admin))
    assert users_response.status_code == 200
    payload = users_response.json()
    assert [user["email"] for user in payload] == ["admin@example.com", "member@example.com"]
    assert payload[1]["subscription"]["duration_days"] == 45

    delete_response = client.delete(f"/admin/users/{member_id}", headers=headers_for(admin))
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "deleted"


def test_disabling_user_releases_confirmed_and_waitlisted_bookings() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, email="admin@example.com", role=UserRole.ADMIN)
    member = create_user(session_factory, email="member@example.com")

    with session_factory() as session:
        location = Location(name="MAKA Roma", address="Via Roma 1", city="Roma")
        course = Course(location=location, title="Calisthenics", status=CourseStatus.PUBLISHED)
        confirmed_session = CourseSession(
            course=course,
            weekday=1,
            starts_at=time(18, 0),
            ends_at=time(19, 0),
            capacity=10,
        )
        waitlisted_session = CourseSession(
            course=course,
            weekday=3,
            starts_at=time(18, 0),
            ends_at=time(19, 0),
            capacity=10,
        )
        session.add_all([confirmed_session, waitlisted_session])
        session.flush()
        session.add_all(
            [
                Booking(
                    user_id=member.id,
                    course_session_id=confirmed_session.id,
                    occurs_on=next_occurrence_date(confirmed_session.weekday),
                    status=BookingStatus.CONFIRMED,
                ),
                Booking(
                    user_id=member.id,
                    course_session_id=waitlisted_session.id,
                    occurs_on=next_occurrence_date(waitlisted_session.weekday),
                    status=BookingStatus.WAITLISTED,
                ),
            ],
        )
        session.commit()

    response = client.patch(
        f"/admin/users/{member.id}",
        json={"status": "disabled"},
        headers=headers_for(admin),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "disabled"
    with session_factory() as session:
        bookings = session.scalars(
            select(Booking).where(Booking.user_id == member.id).order_by(Booking.created_at),
        ).all()
        assert [booking.status for booking in bookings] == [
            BookingStatus.CANCELLED,
            BookingStatus.CANCELLED,
        ]
        assert all(booking.cancelled_at is not None for booking in bookings)
        assert session.get(User, member.id).status == UserStatus.DISABLED


def test_staff_can_read_admin_stats() -> None:
    client, session_factory = make_client()
    staff = create_user(session_factory, email="staff@example.com", role=UserRole.STAFF)
    first_member = create_user(session_factory, email="first@example.com")
    second_member = create_user(session_factory, email="second@example.com")

    with session_factory() as session:
        location = Location(name="Chiron Roma", address="Via Roma 1", city="Roma")
        course = Course(
            location=location,
            title="Calisthenics",
            status=CourseStatus.PUBLISHED,
        )
        course_session = CourseSession(
            course=course,
            weekday=1,
            starts_at=time(18, 0),
            ends_at=time(19, 0),
            capacity=10,
        )
        session.add_all([location, course, course_session])
        session.flush()
        session.add_all(
            [
                Booking(
                    user_id=first_member.id,
                    course_session_id=course_session.id,
                    occurs_on=next_occurrence_date(course_session.weekday),
                    status=BookingStatus.CONFIRMED,
                ),
                Booking(
                    user_id=second_member.id,
                    course_session_id=course_session.id,
                    occurs_on=next_occurrence_date(course_session.weekday),
                    status=BookingStatus.WAITLISTED,
                ),
                Subscription(user_id=first_member.id, starts_on=date(2026, 8, 1)),
                Subscription(user_id=first_member.id, starts_on=date(2026, 8, 2)),
                Subscription(user_id=second_member.id, starts_on=date(2026, 8, 1)),
            ],
        )
        second_member_record = session.get(User, second_member.id)
        second_member_record.status = UserStatus.DISABLED
        session.commit()

    response = client.get("/admin/stats", headers=headers_for(staff))

    assert response.status_code == 200
    payload = response.json()
    assert payload["active_members"] == 1
    assert payload["courses"][0]["name"] == "Calisthenics"
    assert payload["courses"][0]["member_count"] == 1
    assert payload["locations"][0]["name"] == "Chiron Roma"
    assert payload["locations"][0]["member_count"] == 1


def test_staff_can_list_active_course_session_attendees() -> None:
    client, session_factory = make_client()
    staff = create_user(session_factory, email="staff@example.com", role=UserRole.STAFF)
    member = create_user(session_factory, email="member@example.com")
    waitlisted = create_user(session_factory, email="waitlist@example.com")
    cancelled = create_user(session_factory, email="cancelled@example.com")

    with session_factory() as session:
        session.add_all(
            [
                UserProfile(user_id=member.id, first_name="Anna", last_name="Rossi"),
                UserProfile(user_id=waitlisted.id, first_name="Luca", last_name="Bianchi"),
            ],
        )
        location = Location(name="MAKA Roma", address="Via Roma 1", city="Roma")
        course = Course(location=location, title="Calisthenics", status=CourseStatus.PUBLISHED)
        course_session = CourseSession(
            course=course,
            weekday=1,
            starts_at=time(18, 0),
            ends_at=time(19, 0),
            capacity=10,
        )
        session.add(course_session)
        session.flush()
        occurs_on = next_occurrence_date(course_session.weekday)
        session.add_all(
            [
                Booking(
                    user_id=member.id,
                    course_session_id=course_session.id,
                    occurs_on=occurs_on,
                    status=BookingStatus.CONFIRMED,
                ),
                Booking(
                    user_id=waitlisted.id,
                    course_session_id=course_session.id,
                    occurs_on=occurs_on,
                    status=BookingStatus.WAITLISTED,
                ),
                Booking(
                    user_id=cancelled.id,
                    course_session_id=course_session.id,
                    occurs_on=occurs_on,
                    status=BookingStatus.CANCELLED,
                ),
            ],
        )
        session.commit()
        course_session_id = course_session.id

    response = client.get(
        f"/admin/course-sessions/{course_session_id}/attendees",
        params={"occurs_on": occurs_on.isoformat()},
        headers=headers_for(staff),
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "booking_id": response.json()[0]["booking_id"],
            "user_id": str(member.id),
            "email": "member@example.com",
            "first_name": "Anna",
            "last_name": "Rossi",
            "status": "confirmed",
        },
        {
            "booking_id": response.json()[1]["booking_id"],
            "user_id": str(waitlisted.id),
            "email": "waitlist@example.com",
            "first_name": "Luca",
            "last_name": "Bianchi",
            "status": "waitlisted",
        },
    ]


def test_member_cannot_list_course_session_attendees() -> None:
    client, session_factory = make_client()
    member = create_user(session_factory, email="member@example.com")

    response = client.get(
        "/admin/course-sessions/00000000-0000-0000-0000-000000000000/attendees",
        params={"occurs_on": date.today().isoformat()},
        headers=headers_for(member),
    )

    assert response.status_code == 403
