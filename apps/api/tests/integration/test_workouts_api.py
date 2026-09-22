from collections.abc import Generator
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chiron_api.auth.tokens import create_access_token
from chiron_api.config import get_settings
from chiron_api.db.base import Base
from chiron_api.db.models import User, UserRole
from chiron_api.db.session import get_db_session
from chiron_api.main import create_app


def make_client() -> tuple[TestClient, sessionmaker[Session]]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    Base.metadata.create_all(bind=engine)

    def override_get_db_session() -> Generator[Session]:
        with session_factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db_session] = override_get_db_session
    return TestClient(app), session_factory


def create_user(session_factory: sessionmaker[Session], role: UserRole, email: str) -> User:
    with session_factory() as session:
        user = User(email=email, password_hash="test-hash", role=role)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def headers_for(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user, get_settings())}"}


def plan_payload(title: str = "Forza base") -> dict:
    return {
        "title": title,
        "description": "Tre giorni di lavoro.",
        "status": "draft",
        "days": [
            {
                "label": "Giorno A",
                "title": "Parte superiore",
                "exercises": [
                    {
                        "name": "Panca piana",
                        "sets_planned": 3,
                        "reps_planned": "8-10",
                        "rest_seconds": 90,
                        "notes": "Movimento controllato",
                    },
                ],
            },
        ],
    }


def test_user_cannot_write_workout_plans_and_published_plan_is_visible_only_when_assigned() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, UserRole.ADMIN, "admin-workout@example.com")
    user = create_user(session_factory, UserRole.USER, "member-workout@example.com")

    forbidden = client.post("/admin/workout-plans", json=plan_payload(), headers=headers_for(user))
    assert forbidden.status_code == 403

    created = client.post("/admin/workout-plans", json=plan_payload(), headers=headers_for(admin))
    assert created.status_code == 201
    plan = created.json()
    assert plan["status"] == "draft"
    assert client.get("/workouts/plans", headers=headers_for(user)).json() == []

    published = client.post(
        f"/admin/workout-plans/{plan['id']}/publish",
        headers=headers_for(admin),
    )
    assert published.status_code == 200
    visible = client.get("/workouts/plans", headers=headers_for(user))
    assert visible.status_code == 200
    assert visible.json() == []

    assigned = client.post(
        f"/admin/workout-plans/{plan['id']}/assignments",
        json={"user_id": str(user.id)},
        headers=headers_for(admin),
    )
    assert assigned.status_code == 201
    assert assigned.json()["user_id"] == str(user.id)
    visible = client.get("/workouts/plans", headers=headers_for(user))
    assert visible.status_code == 200
    assert visible.json()[0]["days"][0]["exercises"][0]["name"] == "Panca piana"


def test_workout_logs_are_private_editable_and_keep_snapshots_after_archive() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, UserRole.ADMIN, "admin-history@example.com")
    user = create_user(session_factory, UserRole.USER, "member-history@example.com")
    other_user = create_user(session_factory, UserRole.USER, "other-history@example.com")

    plan = client.post(
        "/admin/workout-plans", json=plan_payload(), headers=headers_for(admin)
    ).json()
    plan = client.post(
        f"/admin/workout-plans/{plan['id']}/publish", headers=headers_for(admin)
    ).json()
    assignment = client.post(
        f"/admin/workout-plans/{plan['id']}/assignments",
        json={"user_id": str(user.id)},
        headers=headers_for(admin),
    )
    assert assignment.status_code == 201
    day = plan["days"][0]
    exercise = day["exercises"][0]
    log_payload = {
        "plan_id": plan["id"],
        "day_id": day["id"],
        "workout_date": date.today().isoformat(),
        "general_note": "Buona sessione",
        "rating": 4,
        "entries": [
            {
                "exercise_id": exercise["id"],
                "exercise_name_snapshot": "Nome ignorato dal server",
                "set_number": 1,
                "repetitions": 8,
                "load_kg": 22.5,
                "note": None,
            },
        ],
    }
    created = client.post("/workouts/logs", json=log_payload, headers=headers_for(user))
    assert created.status_code == 201
    log = created.json()
    assert log["entries"][0]["exercise_name_snapshot"] == "Panca piana"
    assert client.get("/workouts/logs", headers=headers_for(other_user)).json() == []
    assert (
        client.get(f"/workouts/logs/{log['id']}", headers=headers_for(other_user)).status_code
        == 404
    )

    changed_plan = {
        **plan_payload(),
        "status": "published",
        "days": [
            {
                **day,
                "exercises": [{**exercise, "name": "Panca inclinata"}],
            }
        ],
    }
    updated_plan = client.patch(
        f"/admin/workout-plans/{plan['id']}",
        json=changed_plan,
        headers=headers_for(admin),
    )
    assert updated_plan.status_code == 200

    archived = client.post(f"/admin/workout-plans/{plan['id']}/archive", headers=headers_for(admin))
    assert archived.status_code == 200
    history = client.get(f"/workouts/logs/{log['id']}", headers=headers_for(user))
    assert history.status_code == 200
    assert history.json()["entries"][0]["exercise_name_snapshot"] == "Panca piana"

    edited = client.put(
        f"/workouts/logs/{log['id']}",
        json={**log_payload, "general_note": "Aggiornato", "rating": 5},
        headers=headers_for(user),
    )
    assert edited.status_code == 200
    assert edited.json()["general_note"] == "Aggiornato"


def test_assigned_plan_cannot_be_used_by_another_user() -> None:
    client, session_factory = make_client()
    admin = create_user(session_factory, UserRole.ADMIN, "admin-private@example.com")
    assigned_user = create_user(session_factory, UserRole.USER, "assigned@example.com")
    other_user = create_user(session_factory, UserRole.USER, "not-assigned@example.com")

    plan = client.post(
        "/admin/workout-plans", json=plan_payload(), headers=headers_for(admin)
    ).json()
    plan = client.post(
        f"/admin/workout-plans/{plan['id']}/publish", headers=headers_for(admin)
    ).json()
    client.post(
        f"/admin/workout-plans/{plan['id']}/assignments",
        json={"user_id": str(assigned_user.id)},
        headers=headers_for(admin),
    )
    day = plan["days"][0]
    exercise = day["exercises"][0]
    payload = {
        "plan_id": plan["id"],
        "day_id": day["id"],
        "workout_date": date.today().isoformat(),
        "entries": [
            {
                "exercise_id": exercise["id"],
                "exercise_name_snapshot": exercise["name"],
                "set_number": 1,
                "repetitions": 8,
                "load_kg": 20,
            }
        ],
    }
    assert client.get("/workouts/plans", headers=headers_for(other_user)).json() == []
    assert (
        client.post("/workouts/logs", json=payload, headers=headers_for(other_user)).status_code
        == 404
    )


def test_workout_log_validation_rejects_sensible_limits() -> None:
    client, session_factory = make_client()
    user = create_user(session_factory, UserRole.USER, "member-validation@example.com")
    response = client.post(
        "/workouts/logs",
        json={
            "plan_id": "00000000-0000-0000-0000-000000000001",
            "day_id": "00000000-0000-0000-0000-000000000002",
            "workout_date": date.today().isoformat(),
            "rating": 8,
            "entries": [],
        },
        headers=headers_for(user),
    )
    assert response.status_code == 422
