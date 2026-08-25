from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chiron_api.auth.dependencies import get_current_user, require_roles
from chiron_api.auth.passwords import hash_password, verify_password
from chiron_api.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenPairResponse,
    TwoFactorConfirmRequest,
    TwoFactorRequiredResponse,
    TwoFactorSetupRequest,
    TwoFactorSetupRequiredResponse,
    TwoFactorSetupResponse,
    TwoFactorVerifyRequest,
    UserResponse,
)
from chiron_api.auth.secret_store import decrypt_secret, encrypt_secret
from chiron_api.auth.tokens import (
    TWO_FACTOR_CHALLENGE_TOKEN_TYPE,
    TWO_FACTOR_SETUP_TOKEN_TYPE,
    consume_refresh_token,
    create_two_factor_challenge_token,
    create_two_factor_setup_token,
    decode_token,
    is_backoffice_role,
    issue_token_pair,
    revoke_refresh_token,
    revoke_user_refresh_tokens,
)
from chiron_api.auth.totp import build_otpauth_uri, generate_totp_secret, verify_totp_code
from chiron_api.config import Settings, get_settings
from chiron_api.db.models import AdminTwoFactor, User, UserProfile, UserRole, UserStatus
from chiron_api.db.session import get_db_session

router = APIRouter(prefix="/auth", tags=["auth"])


def normalize_email(email: str) -> str:
    return email.strip().lower()


def build_token_response(db: Session, user: User, settings: Settings) -> TokenPairResponse:
    token_pair = issue_token_pair(db, user, settings)
    return TokenPairResponse(**token_pair, user=UserResponse.model_validate(user))


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def user_from_two_factor_token(
    db: Session,
    token: str,
    settings: Settings,
    *,
    expected_type: str,
) -> User:
    try:
        payload = decode_token(token, settings, expected_type=expected_type)
        user_id = UUID(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid setup token",
        ) from exc

    user = db.get(User, user_id)
    if user is None or user.status != UserStatus.ACTIVE or not is_backoffice_role(user.role):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid setup token")

    return user


def user_from_setup_token(db: Session, setup_token: str, settings: Settings) -> User:
    return user_from_two_factor_token(
        db,
        setup_token,
        settings,
        expected_type=TWO_FACTOR_SETUP_TOKEN_TYPE,
    )


@router.post("/register", response_model=TokenPairResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> TokenPairResponse:
    user = User(email=normalize_email(payload.email), password_hash=hash_password(payload.password))
    user.profile = UserProfile(first_name=payload.first_name, last_name=payload.last_name)

    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from exc

    db.refresh(user)
    return build_token_response(db, user, settings)


@router.post(
    "/login",
    response_model=(
        TokenPairResponse | TwoFactorRequiredResponse | TwoFactorSetupRequiredResponse
    ),
)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> TokenPairResponse | TwoFactorRequiredResponse | TwoFactorSetupRequiredResponse:
    user = get_user_by_email(db, payload.email)
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if is_backoffice_role(user.role):
        two_factor = user.admin_2fa
        if two_factor is None or two_factor.confirmed_at is None:
            response.status_code = status.HTTP_403_FORBIDDEN
            return {
                "requires_2fa_setup": True,
                "setup_token": create_two_factor_setup_token(user, settings),
            }

        response.status_code = status.HTTP_202_ACCEPTED
        return TwoFactorRequiredResponse(
            challenge_token=create_two_factor_challenge_token(user, settings),
        )

    return build_token_response(db, user, settings)


@router.post("/2fa/verify", response_model=TokenPairResponse)
def verify_two_factor(
    payload: TwoFactorVerifyRequest,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> TokenPairResponse:
    user = user_from_two_factor_token(
        db,
        payload.challenge_token,
        settings,
        expected_type=TWO_FACTOR_CHALLENGE_TOKEN_TYPE,
    )
    two_factor = user.admin_2fa
    if two_factor is None or two_factor.confirmed_at is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA challenge",
        )

    secret = decrypt_secret(two_factor.secret_encrypted, settings.app_secret_key)
    if not verify_totp_code(secret, payload.totp_code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    return build_token_response(db, user, settings)


@router.post("/refresh", response_model=TokenPairResponse)
def refresh(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> TokenPairResponse:
    user = consume_refresh_token(db, payload.refresh_token)
    if user is None:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    return build_token_response(db, user, settings)


@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_db_session)) -> dict[str, bool]:
    revoked = revoke_refresh_token(db, payload.refresh_token)
    return {"revoked": revoked}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.delete("/me")
def delete_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> dict[str, bool]:
    current_user.email = f"deleted-{current_user.id}@deleted.local"
    current_user.password_hash = "deleted"
    current_user.status = UserStatus.DELETED
    current_user.deleted_at = datetime.now(UTC)

    if current_user.profile is not None:
        current_user.profile.first_name = "Deleted"
        current_user.profile.last_name = "User"
        current_user.profile.phone = None
        current_user.profile.birth_date = None
        db.add(current_user.profile)

    revoke_user_refresh_tokens(db, current_user.id)
    db.add(current_user)
    db.commit()
    return {"deleted": True}


@router.get("/backoffice/session", response_model=UserResponse)
def backoffice_session(
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.STAFF)),
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def setup_two_factor(
    payload: TwoFactorSetupRequest,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> TwoFactorSetupResponse:
    user = user_from_setup_token(db, payload.setup_token, settings)
    if user.admin_2fa is not None and user.admin_2fa.confirmed_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="2FA already configured")

    secret = generate_totp_secret()
    encrypted_secret = encrypt_secret(secret, settings.app_secret_key)

    if user.admin_2fa is None:
        user.admin_2fa = AdminTwoFactor(user_id=user.id, secret_encrypted=encrypted_secret)
    else:
        user.admin_2fa.secret_encrypted = encrypted_secret
        user.admin_2fa.confirmed_at = None

    db.add(user)
    db.commit()

    return TwoFactorSetupResponse(
        secret=secret,
        otpauth_uri=build_otpauth_uri(secret, account_name=user.email),
    )


@router.post("/2fa/confirm", response_model=TokenPairResponse)
def confirm_two_factor(
    payload: TwoFactorConfirmRequest,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> TokenPairResponse:
    user = user_from_setup_token(db, payload.setup_token, settings)
    two_factor = user.admin_2fa
    if two_factor is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA setup missing")

    secret = decrypt_secret(two_factor.secret_encrypted, settings.app_secret_key)
    if not verify_totp_code(secret, payload.totp_code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    two_factor.confirmed_at = datetime.now(UTC)
    db.add(two_factor)
    db.commit()
    db.refresh(user)

    return build_token_response(db, user, settings)
