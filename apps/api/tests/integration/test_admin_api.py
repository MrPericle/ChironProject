from collections.abc import Generator
from datetime import date, time

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chiron_api.auth.tokens import create_access_token
from chiron_api.config import get_settings
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
    UserRole,
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
                    status=BookingStatus.CONFIRMED,
                ),
                Booking(
                    user_id=second_member.id,
                    course_session_id=course_session.id,
                    status=BookingStatus.WAITLISTED,
                ),
                Subscription(user_id=first_member.id, starts_on=date(2026, 8, 1)),
            ],
        )
        session.commit()

    response = client.get("/admin/stats", headers=headers_for(staff))

    assert response.status_code == 200
    payload = response.json()
    assert payload["active_members"] == 1
    assert payload["courses"][0]["name"] == "Calisthenics"
    assert payload["courses"][0]["member_count"] == 2
    assert payload["locations"][0]["name"] == "Chiron Roma"
    assert payload["locations"][0]["member_count"] == 2
