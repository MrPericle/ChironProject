from collections.abc import Generator
from datetime import time

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chiron_api.auth.passwords import hash_password
from chiron_api.auth.totp import generate_totp_code
from chiron_api.db.base import Base
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    Course,
    CourseSession,
    CourseStatus,
    Location,
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
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=engine)

    def override_get_db_session() -> Generator[Session]:
        with TestingSessionLocal() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db_session] = override_get_db_session

    return TestClient(app), TestingSessionLocal


def create_user(
    session_factory: sessionmaker[Session],
    *,
    email: str,
    password: str,
    role: UserRole = UserRole.USER,
) -> User:
    with session_factory() as session:
        user = User(email=email, password_hash=hash_password(password), role=role)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def test_register_login_me_refresh_and_logout_flow() -> None:
    client, _ = make_client()

    register_response = client.post(
        "/auth/register",
        json={
            "email": "athlete@example.com",
            "password": "StrongerPass123!",
            "first_name": "Ada",
            "last_name": "Lovelace",
        },
    )
    assert register_response.status_code == 201
    tokens = register_response.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["user"]["email"] == "athlete@example.com"
    assert tokens["access_token"]
    assert tokens["refresh_token"]

    me_response = client.get("/auth/me", headers=auth_headers(tokens["access_token"]))
    assert me_response.status_code == 200
    assert me_response.json()["role"] == "user"

    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refresh_response.status_code == 200
    refreshed_tokens = refresh_response.json()
    assert refreshed_tokens["refresh_token"] != tokens["refresh_token"]

    reused_refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert reused_refresh_response.status_code == 401

    logout_response = client.post(
        "/auth/logout",
        json={"refresh_token": refreshed_tokens["refresh_token"]},
    )
    assert logout_response.status_code == 200
    assert logout_response.json() == {"revoked": True}


def test_login_rejects_invalid_password() -> None:
    client, session_factory = make_client()
    create_user(session_factory, email="user@example.com", password="CorrectPass123!")

    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "WrongPass123!"},
    )

    assert response.status_code == 401


def test_backoffice_session_requires_staff_or_admin_role() -> None:
    client, session_factory = make_client()
    create_user(session_factory, email="member@example.com", password="MemberPass123!")

    login_response = client.post(
        "/auth/login",
        json={"email": "member@example.com", "password": "MemberPass123!"},
    )
    access_token = login_response.json()["access_token"]

    response = client.get("/auth/backoffice/session", headers=auth_headers(access_token))

    assert response.status_code == 403


def test_admin_must_complete_2fa_before_backoffice_access() -> None:
    client, session_factory = make_client()
    create_user(
        session_factory,
        email="admin@example.com",
        password="AdminPass123!",
        role=UserRole.ADMIN,
    )

    login_response = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "AdminPass123!"},
    )
    assert login_response.status_code == 403
    setup_token = login_response.json()["setup_token"]

    setup_response = client.post("/auth/2fa/setup", json={"setup_token": setup_token})
    assert setup_response.status_code == 200
    secret = setup_response.json()["secret"]

    confirm_response = client.post(
        "/auth/2fa/confirm",
        json={"setup_token": setup_token, "totp_code": generate_totp_code(secret)},
    )
    assert confirm_response.status_code == 200
    access_token = confirm_response.json()["access_token"]

    backoffice_response = client.get(
        "/auth/backoffice/session",
        headers=auth_headers(access_token),
    )
    assert backoffice_response.status_code == 200
    assert backoffice_response.json()["role"] == "admin"

    password_only_response = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "AdminPass123!"},
    )
    assert password_only_response.status_code == 202
    assert password_only_response.json()["requires_2fa"] is True
    challenge_token = password_only_response.json()["challenge_token"]

    totp_login_response = client.post(
        "/auth/2fa/verify",
        json={
            "challenge_token": challenge_token,
            "totp_code": generate_totp_code(secret),
        },
    )
    assert totp_login_response.status_code == 200
    assert totp_login_response.json()["user"]["role"] == "admin"


def test_delete_me_anonymizes_account_and_releases_bookings() -> None:
    client, session_factory = make_client()
    tokens = client.post(
        "/auth/register",
        json={
            "email": "privacy@example.com",
            "password": "PrivacyPass123!",
            "first_name": "Privacy",
            "last_name": "User",
        },
    ).json()

    with session_factory() as session:
        user = session.scalar(select(User).where(User.email == "privacy@example.com"))
        location = Location(name="MAKA Roma", address="Via Roma 1", city="Roma")
        course = Course(location=location, title="Calisthenics", status=CourseStatus.PUBLISHED)
        course_session = CourseSession(
            course=course,
            weekday=1,
            starts_at=time(18, 0),
            ends_at=time(19, 0),
            capacity=10,
        )
        booking = Booking(
            user_id=user.id,
            course_session=course_session,
            status=BookingStatus.CONFIRMED,
        )
        session.add_all([location, course, course_session, booking])
        session.commit()
        booking_id = booking.id

    response = client.delete("/auth/me", headers=auth_headers(tokens["access_token"]))

    assert response.status_code == 200
    assert response.json() == {"deleted": True}

    me_response = client.get("/auth/me", headers=auth_headers(tokens["access_token"]))
    assert me_response.status_code == 401
    with session_factory() as session:
        booking = session.get(Booking, booking_id)
        assert booking.status == BookingStatus.CANCELLED
        assert booking.cancelled_at is not None
