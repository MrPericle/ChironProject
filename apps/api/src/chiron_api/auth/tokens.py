import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from chiron_api.config import Settings
from chiron_api.db.models import RefreshToken, User, UserRole, UserStatus, utc_now

ACCESS_TOKEN_TYPE = "access"
TWO_FACTOR_SETUP_TOKEN_TYPE = "2fa_setup"
TWO_FACTOR_CHALLENGE_TOKEN_TYPE = "2fa_challenge"


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_access_token(user: User, settings: Settings) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "iss": settings.auth_token_issuer,
        "sub": str(user.id),
        "role": user.role.value,
        "typ": ACCESS_TOKEN_TYPE,
        "exp": expires_at,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")


def create_two_factor_setup_token(user: User, settings: Settings) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=10)
    payload = {
        "iss": settings.auth_token_issuer,
        "sub": str(user.id),
        "role": user.role.value,
        "typ": TWO_FACTOR_SETUP_TOKEN_TYPE,
        "exp": expires_at,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")


def create_two_factor_challenge_token(user: User, settings: Settings) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=5)
    payload = {
        "iss": settings.auth_token_issuer,
        "sub": str(user.id),
        "role": user.role.value,
        "typ": TWO_FACTOR_CHALLENGE_TOKEN_TYPE,
        "exp": expires_at,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm="HS256")


def decode_token(token: str, settings: Settings, *, expected_type: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.app_secret_key,
            algorithms=["HS256"],
            issuer=settings.auth_token_issuer,
        )
    except InvalidTokenError as exc:
        raise ValueError("Invalid token") from exc

    if payload.get("typ") != expected_type:
        raise ValueError("Invalid token type")

    return payload


def issue_token_pair(db: Session, user: User, settings: Settings) -> dict[str, str]:
    raw_refresh_token = secrets.token_urlsafe(48)
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(refresh_token)
    db.commit()

    return {
        "access_token": create_access_token(user, settings),
        "refresh_token": raw_refresh_token,
        "token_type": "bearer",
    }


def consume_refresh_token(db: Session, raw_token: str) -> User | None:
    token_hash = hash_refresh_token(raw_token)
    refresh_token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    now = utc_now()

    expires_at = refresh_token.expires_at if refresh_token is not None else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if (
        refresh_token is None
        or refresh_token.revoked_at is not None
        or expires_at <= now
        or refresh_token.user.status != UserStatus.ACTIVE
    ):
        return None

    refresh_token.revoked_at = now
    db.add(refresh_token)
    db.flush()

    return refresh_token.user


def revoke_refresh_token(db: Session, raw_token: str) -> bool:
    token_hash = hash_refresh_token(raw_token)
    refresh_token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if refresh_token is None or refresh_token.revoked_at is not None:
        return False

    refresh_token.revoked_at = utc_now()
    db.add(refresh_token)
    db.commit()
    return True


def revoke_user_refresh_tokens(db: Session, user_id: UUID) -> None:
    refresh_tokens = db.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        ),
    ).all()
    now = utc_now()
    for refresh_token in refresh_tokens:
        refresh_token.revoked_at = now
        db.add(refresh_token)


def is_backoffice_role(role: UserRole) -> bool:
    return role in {UserRole.ADMIN, UserRole.STAFF}
