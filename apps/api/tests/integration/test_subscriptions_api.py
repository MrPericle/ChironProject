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


def create_subscription(
    session_factory: sessionmaker[Session],
    *,
    user: User,
    starts_on: date = date(2026, 8, 1),
    duration_days: int = 30,
) -> Subscription:
    with session_factory() as session:
        subscription = Subscription(
            user_id=user.id,
            starts_on=starts_on,
            duration_days=duration_days,
        )
        session.add(subscription)
        session.commit()
        session.refresh(subscription)
        return subscription


def attach_user_to_location(
    session_factory: sessionmaker[Session],
    *,
    user: User,
    location: Location,
) -> None:
    with session_factory() as session:
        location = session.merge(location)
        user = session.merge(user)
        course = Course(location=location, title="Calisthenics", status=CourseStatus.PUBLISHED)
        course_session = CourseSession(
            course=course,
            weekday=1,
            starts_at=time(18, 0),
            ends_at=time(19, 0),
            capacity=10,
        )
        session.add_all([course, course_session])
        session.flush()

        session.add(
            Booking(
                user_id=user.id,
                course_session_id=course_session.id,
                status=BookingStatus.CONFIRMED,
            ),
        )
        session.commit()


def test_user_can_read_own_subscription_expiry() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, email="member@example.com")
    create_subscription(session_factory, user=user, starts_on=date(2026, 8, 1), duration_days=30)

    response = client.get("/subscriptions/me", headers=headers_for(user))

    assert response.status_code == 200
    assert response.json() == {
        "starts_on": "2026-08-01",
        "duration_days": 30,
        "expires_on": "2026-08-31",
        "is_active": True,
    }


def test_user_without_subscription_gets_empty_payload() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, email="member@example.com")

    response = client.get("/subscriptions/me", headers=headers_for(user))

    assert response.status_code == 200
    assert response.json() is None


def test_admin_can_list_subscriptions_with_expiry_filter() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, email="admin@example.com", role=UserRole.ADMIN)
    active_user = create_user(session_factory, email="active@example.com")
    expired_user = create_user(session_factory, email="expired@example.com")
    create_subscription(
        session_factory,
        user=active_user,
        starts_on=date(2026, 8, 1),
        duration_days=30,
    )
    create_subscription(
        session_factory,
        user=expired_user,
        starts_on=date(2026, 7, 1),
        duration_days=15,
    )

    response = client.get(
        "/admin/subscriptions",
        params={"expires_before": "2026-08-01"},
        headers=headers_for(admin),
    )

    assert response.status_code == 200
    payload = response.json()
    assert [item["user_email"] for item in payload] == ["expired@example.com"]
    assert payload[0]["expires_on"] == "2026-07-16"
    assert "payment_status" not in payload[0]


def test_admin_can_filter_subscriptions_by_location() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, email="admin@example.com", role=UserRole.ADMIN)
    roma_user = create_user(session_factory, email="roma@example.com")
    milano_user = create_user(session_factory, email="milano@example.com")

    with session_factory() as session:
        roma = Location(name="Chiron Roma", address="Via Roma 1", city="Roma")
        milano = Location(name="Chiron Milano", address="Via Milano 1", city="Milano")
        session.add_all([roma, milano])
        session.commit()
        session.refresh(roma)
        session.refresh(milano)

    create_subscription(session_factory, user=roma_user)
    create_subscription(session_factory, user=milano_user)
    attach_user_to_location(session_factory, user=roma_user, location=roma)
    attach_user_to_location(session_factory, user=milano_user, location=milano)

    response = client.get(
        "/admin/subscriptions",
        params={"location_id": str(roma.id)},
        headers=headers_for(admin),
    )

    assert response.status_code == 200
    assert [item["user_email"] for item in response.json()] == ["roma@example.com"]
