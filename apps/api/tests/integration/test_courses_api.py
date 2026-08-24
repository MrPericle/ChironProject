from collections.abc import Generator
from datetime import time

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


def create_user(session_factory: sessionmaker[Session], role: UserRole) -> User:
    with session_factory() as session:
        user = User(
            email=f"{role.value}@example.com",
            password_hash="test-hash",
            role=role,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def headers_for(user: User) -> dict[str, str]:
    token = create_access_token(user, get_settings())
    return {"Authorization": f"Bearer {token}"}


def test_staff_can_manage_locations() -> None:
    client, session_factory = make_client()
    staff = create_user(session_factory, UserRole.STAFF)

    create_response = client.post(
        "/admin/locations",
        json={"name": "Chiron Roma", "address": "Via del Movimento 1", "city": "Roma"},
        headers=headers_for(staff),
    )
    assert create_response.status_code == 201
    location_id = create_response.json()["id"]

    update_response = client.patch(
        f"/admin/locations/{location_id}",
        json={"name": "Chiron Roma Centro"},
        headers=headers_for(staff),
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Chiron Roma Centro"

    list_response = client.get("/admin/locations", headers=headers_for(staff))
    assert list_response.status_code == 200
    assert list_response.json()[0]["city"] == "Roma"

    deactivate_response = client.delete(
        f"/admin/locations/{location_id}",
        headers=headers_for(staff),
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False


def test_user_cannot_access_backoffice_crud() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, UserRole.USER)

    response = client.post(
        "/admin/locations",
        json={"name": "Hidden", "address": "Via Test 1", "city": "Roma"},
        headers=headers_for(user),
    )

    assert response.status_code == 403


def test_admin_can_manage_courses_and_sessions() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, UserRole.ADMIN)

    location_response = client.post(
        "/admin/locations",
        json={"name": "Chiron Milano", "address": "Via Agon 2", "city": "Milano"},
        headers=headers_for(admin),
    )
    location_id = location_response.json()["id"]

    course_response = client.post(
        "/admin/courses",
        json={
            "location_id": location_id,
            "title": "Calisthenics Base",
            "description": "Forza, controllo e tecnica.",
            "status": "published",
        },
        headers=headers_for(admin),
    )
    assert course_response.status_code == 201
    course_id = course_response.json()["id"]

    session_response = client.post(
        f"/admin/courses/{course_id}/sessions",
        json={
            "weekday": 1,
            "starts_at": "18:00:00",
            "ends_at": "19:30:00",
            "capacity": 12,
            "cancellation_deadline_hours": 24,
        },
        headers=headers_for(admin),
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    update_session_response = client.patch(
        f"/admin/course-sessions/{session_id}",
        json={"capacity": 14},
        headers=headers_for(admin),
    )
    assert update_session_response.status_code == 200
    assert update_session_response.json()["capacity"] == 14

    update_course_response = client.patch(
        f"/admin/courses/{course_id}",
        json={"title": "Calisthenics Fundamentals"},
        headers=headers_for(admin),
    )
    assert update_course_response.status_code == 200
    assert update_course_response.json()["title"] == "Calisthenics Fundamentals"


def test_catalog_filters_courses_by_location_weekday_and_availability() -> None:
    client, session_factory = make_client()
    member = create_user(session_factory, UserRole.USER)

    with session_factory() as session:
        location = Location(name="Chiron Torino", address="Via Pelio 3", city="Torino")
        course = Course(
            location=location,
            title="Pole Flow",
            description="Tecnica e controllo.",
            status=CourseStatus.PUBLISHED,
        )
        course_session = CourseSession(
            course=course,
            weekday=3,
            starts_at=time(19, 0),
            ends_at=time(20, 0),
            capacity=1,
        )
        full_course = Course(
            location=location,
            title="Martial Conditioning",
            status=CourseStatus.PUBLISHED,
        )
        full_session = CourseSession(
            course=full_course,
            weekday=3,
            starts_at=time(20, 0),
            ends_at=time(21, 0),
            capacity=1,
        )
        session.add_all([location, course, course_session, full_course, full_session])
        session.commit()
        session.refresh(location)
        session.refresh(course_session)
        session.refresh(full_session)
        session.add(
            Booking(
                user_id=member.id,
                course_session_id=full_session.id,
                status=BookingStatus.CONFIRMED,
            ),
        )
        session.commit()

        location_id = str(location.id)

    response = client.get(
        "/courses",
        params={"location_id": location_id, "weekday": 3, "available": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [course["title"] for course in payload] == ["Pole Flow"]
    assert payload[0]["sessions"][0]["available_spots"] == 1

