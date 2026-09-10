from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from chiron_api.auth.passwords import verify_password
from chiron_api.cli import create_or_promote_admin
from chiron_api.db.base import Base
from chiron_api.db.models import User, UserRole, UserStatus


def test_create_admin_is_idempotent() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as session:
        created = create_or_promote_admin(
            session,
            email=" Admin@Example.com ",
            password="a-secure-password",
            first_name="Mattia",
            last_name="MAKA",
        )
        user = session.query(User).one()
        original_password_hash = user.password_hash

        assert created.action == "created"
        assert created.email == "admin@example.com"
        assert user.role == UserRole.ADMIN
        assert user.status == UserStatus.ACTIVE
        assert user.profile.first_name == "Mattia"
        assert verify_password("a-secure-password", user.password_hash)

        unchanged = create_or_promote_admin(
            session,
            email="admin@example.com",
            password=None,
        )

        assert unchanged.action == "unchanged"
        assert user.password_hash == original_password_hash


def test_existing_user_is_promoted_and_reactivated() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as session:
        user = User(
            email="member@example.com",
            password_hash="existing-hash",
            role=UserRole.USER,
            status=UserStatus.DISABLED,
        )
        session.add(user)
        session.commit()

        result = create_or_promote_admin(
            session,
            email=user.email,
            password=None,
            first_name="Existing",
            last_name="Member",
        )

        assert result.action == "promoted"
        assert user.role == UserRole.ADMIN
        assert user.status == UserStatus.ACTIVE
        assert user.profile.first_name == "Existing"
        assert user.password_hash == "existing-hash"
