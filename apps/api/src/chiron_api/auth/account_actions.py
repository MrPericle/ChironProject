import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from chiron_api.db.models import AccountActionToken, User, utc_now

EMAIL_VERIFICATION_PURPOSE = "email_verification"
EMAIL_CHANGE_VERIFICATION_PURPOSE = "email_change_verification"
PASSWORD_RESET_PURPOSE = "password_reset"


def hash_account_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def issue_account_token(
    db: Session,
    *,
    user: User,
    purpose: str,
    expires_in: timedelta,
) -> str:
    now = utc_now()
    db.execute(
        update(AccountActionToken)
        .where(
            AccountActionToken.user_id == user.id,
            AccountActionToken.purpose == purpose,
            AccountActionToken.used_at.is_(None),
        )
        .values(used_at=now),
    )
    raw_token = secrets.token_urlsafe(48)
    db.add(
        AccountActionToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_account_token(raw_token),
            expires_at=now + expires_in,
        ),
    )
    db.flush()
    return raw_token


def consume_account_token(db: Session, *, raw_token: str, purpose: str) -> User | None:
    token = db.scalar(
        select(AccountActionToken)
        .where(
            AccountActionToken.token_hash == hash_account_token(raw_token),
            AccountActionToken.purpose == purpose,
            AccountActionToken.used_at.is_(None),
        )
        .with_for_update(),
    )
    if token is None:
        return None

    expires_at = token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        return None

    token.used_at = utc_now()
    db.add(token)
    return token.user
