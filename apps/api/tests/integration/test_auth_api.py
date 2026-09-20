from collections.abc import Generator
from datetime import date, time, timedelta
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chiron_api.auth.passwords import hash_password
from chiron_api.auth.rate_limit import AuthRateLimiter
from chiron_api.auth.tokens import issue_token_pair
from chiron_api.auth.totp import generate_totp_code
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
    User,
    UserRole,
)
from chiron_api.db.session import get_db_session
from chiron_api.email import TransactionalEmail
from chiron_api.main import create_app


class RecordingEmailSender:
    def __init__(self) -> None:
        self.messages: list[TransactionalEmail] = []

    def send(self, message: TransactionalEmail) -> None:
        self.messages.append(message)


def verification_token(message: TransactionalEmail) -> str:
    url = next(part for part in message.text_body.split() if part.startswith("http"))
    return parse_qs(urlparse(url).query)["token"][0]


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


def next_occurrence_date(weekday: int) -> date:
    return next(
        occurrence_dates(
            weekday,
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=7),
        ),
    )


def test_register_login_me_refresh_and_logout_flow() -> None:
    client, _ = make_client()
    sender = RecordingEmailSender()
    client.app.state.email_sender = sender

    register_response = client.post(
        "/auth/register",
        json={
            "email": "athlete@example.com",
            "password": "StrongerPass123!",
            "first_name": "Ada",
            "last_name": "Lovelace",
        },
    )
    assert register_response.status_code == 202
    assert len(sender.messages) == 1

    login_before_verification = client.post(
        "/auth/login",
        json={"email": "athlete@example.com", "password": "StrongerPass123!"},
    )
    assert login_before_verification.status_code == 403
    assert login_before_verification.json() == {"requires_email_verification": True}

    raw_token = verification_token(sender.messages[0])
    verify_response = client.post("/auth/email/verify", json={"token": raw_token})
    assert verify_response.status_code == 200

    reused_verification = client.post("/auth/email/verify", json={"token": raw_token})
    assert reused_verification.status_code == 400

    login_response = client.post(
        "/auth/login",
        json={"email": "athlete@example.com", "password": "StrongerPass123!"},
    )
    assert login_response.status_code == 200
    tokens = login_response.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["user"]["email"] == "athlete@example.com"

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


def test_verification_resend_is_generic_and_invalidates_the_previous_link() -> None:
    client, _ = make_client()
    sender = RecordingEmailSender()
    client.app.state.email_sender = sender
    client.post(
        "/auth/register",
        json={
            "email": "verify@example.com",
            "password": "StrongerPass123!",
            "first_name": "Ada",
            "last_name": "Lovelace",
        },
    )
    first_token = verification_token(sender.messages[0])

    missing_response = client.post(
        "/auth/email/resend",
        json={"email": "missing@example.com"},
    )
    resend_response = client.post(
        "/auth/email/resend",
        json={"email": "verify@example.com"},
    )

    assert missing_response.status_code == 202
    assert resend_response.status_code == 202
    assert missing_response.json() == resend_response.json()
    assert len(sender.messages) == 2
    assert client.post("/auth/email/verify", json={"token": first_token}).status_code == 400
    second_token = verification_token(sender.messages[1])
    assert client.post("/auth/email/verify", json={"token": second_token}).status_code == 200


def test_password_reset_is_generic_one_time_and_revokes_existing_sessions() -> None:
    client, session_factory = make_client()
    sender = RecordingEmailSender()
    client.app.state.email_sender = sender
    create_user(
        session_factory,
        email="reset@example.com",
        password="OriginalPass123!",
    )
    login_response = client.post(
        "/auth/login",
        json={"email": "reset@example.com", "password": "OriginalPass123!"},
    )
    refresh_token = login_response.json()["refresh_token"]

    missing_response = client.post(
        "/auth/password/forgot",
        json={"email": "missing@example.com"},
    )
    forgot_response = client.post(
        "/auth/password/forgot",
        json={"email": "reset@example.com"},
    )

    assert missing_response.status_code == 202
    assert forgot_response.status_code == 202
    assert missing_response.json() == forgot_response.json()
    assert len(sender.messages) == 1

    raw_token = verification_token(sender.messages[0])
    reset_response = client.post(
        "/auth/password/reset",
        json={"token": raw_token, "password": "UpdatedPass123!"},
    )
    assert reset_response.status_code == 200
    assert client.post(
        "/auth/password/reset",
        json={"token": raw_token, "password": "AnotherPass123!"},
    ).status_code == 400
    assert client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
    ).status_code == 401
    assert client.post(
        "/auth/login",
        json={"email": "reset@example.com", "password": "OriginalPass123!"},
    ).status_code == 401
    assert client.post(
        "/auth/login",
        json={"email": "reset@example.com", "password": "UpdatedPass123!"},
    ).status_code == 200


def test_login_rejects_invalid_password() -> None:
    client, session_factory = make_client()
    create_user(session_factory, email="user@example.com", password="CorrectPass123!")

    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "WrongPass123!"},
    )

    assert response.status_code == 401


def test_login_is_rate_limited_after_repeated_failures() -> None:
    client, session_factory = make_client()
    client.app.state.auth_rate_limiter = AuthRateLimiter(max_attempts=3, window_seconds=60)
    create_user(session_factory, email="limited@example.com", password="CorrectPass123!")

    responses = [
        client.post(
            "/auth/login",
            json={"email": "limited@example.com", "password": "WrongPass123!"},
        )
        for _ in range(3)
    ]

    assert [response.status_code for response in responses] == [401, 401, 429]
    assert responses[-1].headers["Retry-After"]

    blocked_valid_login = client.post(
        "/auth/login",
        json={"email": "limited@example.com", "password": "CorrectPass123!"},
    )
    assert blocked_valid_login.status_code == 429


def test_api_security_headers_and_cors_policy() -> None:
    client, _ = make_client()

    auth_response = client.post(
        "/auth/login",
        json={"email": "missing@example.com", "password": "WrongPass123!"},
    )
    assert auth_response.headers["X-Content-Type-Options"] == "nosniff"
    assert auth_response.headers["X-Frame-Options"] == "DENY"
    assert auth_response.headers["Referrer-Policy"] == "no-referrer"
    assert auth_response.headers["Cache-Control"] == "no-store"

    allowed_preflight = client.options(
        "/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert allowed_preflight.status_code == 200
    assert allowed_preflight.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert "Access-Control-Allow-Credentials" not in allowed_preflight.headers

    rejected_preflight = client.options(
        "/auth/login",
        headers={
            "Origin": "https://malicious.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "Access-Control-Allow-Origin" not in rejected_preflight.headers


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


def test_two_factor_confirmation_is_rate_limited() -> None:
    client, session_factory = make_client()
    client.app.state.auth_rate_limiter = AuthRateLimiter(max_attempts=3, window_seconds=60)
    create_user(
        session_factory,
        email="limited-admin@example.com",
        password="AdminPass123!",
        role=UserRole.ADMIN,
    )

    login_response = client.post(
        "/auth/login",
        json={"email": "limited-admin@example.com", "password": "AdminPass123!"},
    )
    setup_token = login_response.json()["setup_token"]
    assert client.post("/auth/2fa/setup", json={"setup_token": setup_token}).status_code == 200

    responses = [
        client.post(
            "/auth/2fa/confirm",
            json={"setup_token": setup_token, "totp_code": "000000"},
        )
        for _ in range(3)
    ]

    assert [response.status_code for response in responses] == [401, 401, 429]
    assert responses[-1].headers["Retry-After"]


def test_delete_me_anonymizes_account_and_releases_bookings() -> None:
    client, session_factory = make_client()
    user = create_user(
        session_factory,
        email="privacy@example.com",
        password="PrivacyPass123!",
    )
    with session_factory() as session:
        user_record = session.get(User, user.id)
        tokens = issue_token_pair(session, user_record, get_settings())

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
            occurs_on=next_occurrence_date(course_session.weekday),
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
