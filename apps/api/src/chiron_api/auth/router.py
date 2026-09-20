import logging
import smtplib
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chiron_api.auth.account_actions import (
    EMAIL_VERIFICATION_PURPOSE,
    PASSWORD_RESET_PURPOSE,
    consume_account_token,
    issue_account_token,
)
from chiron_api.auth.dependencies import get_current_user, require_roles
from chiron_api.auth.email_messages import password_reset_email, verification_email
from chiron_api.auth.passwords import hash_password, verify_password
from chiron_api.auth.rate_limit import AuthRateLimiter, auth_rate_limit_key
from chiron_api.auth.schemas import (
    EmailRequest,
    EmailVerificationRequest,
    EmailVerificationRequiredResponse,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    PasswordResetRequest,
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
from chiron_api.bookings.service import cancel_active_user_bookings
from chiron_api.config import Settings, get_settings
from chiron_api.db.models import AdminTwoFactor, User, UserProfile, UserRole, UserStatus
from chiron_api.db.session import get_db_session
from chiron_api.email import EmailSender

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def get_auth_rate_limiter(request: Request) -> AuthRateLimiter:
    return request.app.state.auth_rate_limiter


def get_email_sender(request: Request) -> EmailSender:
    return request.app.state.email_sender


def rate_limit_key(request: Request, scope: str, identity: str) -> str:
    client_host = request.client.host if request.client is not None else None
    return auth_rate_limit_key(scope, identity, client_host)


def raise_if_rate_limited(limiter: AuthRateLimiter, key: str) -> None:
    retry_after = limiter.retry_after(key)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts",
            headers={"Retry-After": str(retry_after)},
        )


def record_auth_failure(limiter: AuthRateLimiter, key: str) -> None:
    retry_after = limiter.record_failure(key)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts",
            headers={"Retry-After": str(retry_after)},
        )


def normalize_email(email: str) -> str:
    return email.strip().lower()


def build_token_response(db: Session, user: User, settings: Settings) -> TokenPairResponse:
    token_pair = issue_token_pair(db, user, settings)
    return TokenPairResponse(**token_pair, user=UserResponse.model_validate(user))


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def send_verification_message(
    sender: EmailSender,
    settings: Settings,
    user: User,
    raw_token: str,
) -> None:
    first_name = user.profile.first_name if user.profile is not None else ""
    sender.send(
        verification_email(
            recipient=user.email,
            first_name=first_name,
            frontend_base_url=settings.frontend_base_url,
            token=raw_token,
        ),
    )


def send_password_reset_message(
    sender: EmailSender,
    settings: Settings,
    user: User,
    raw_token: str,
) -> None:
    first_name = user.profile.first_name if user.profile is not None else ""
    sender.send(
        password_reset_email(
            recipient=user.email,
            first_name=first_name,
            frontend_base_url=settings.frontend_base_url,
            token=raw_token,
        ),
    )


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


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    sender: EmailSender = Depends(get_email_sender),
) -> MessageResponse:
    user = User(email=normalize_email(payload.email), password_hash=hash_password(payload.password))
    user.profile = UserProfile(first_name=payload.first_name, last_name=payload.last_name)

    db.add(user)
    try:
        db.flush()
        user.email_verified_at = None
        raw_token = issue_account_token(
            db,
            user=user,
            purpose=EMAIL_VERIFICATION_PURPOSE,
            expires_in=timedelta(hours=settings.email_verification_expire_hours),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from exc

    db.refresh(user)
    try:
        send_verification_message(sender, settings, user, raw_token)
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Unable to deliver verification email for user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account created, but the verification email could not be sent. Try again.",
        ) from exc
    return MessageResponse(message="Controlla la posta per confermare il tuo account.")


@router.post("/email/verify", response_model=MessageResponse)
def verify_email(
    payload: EmailVerificationRequest,
    db: Session = Depends(get_db_session),
) -> MessageResponse:
    user = consume_account_token(
        db,
        raw_token=payload.token,
        purpose=EMAIL_VERIFICATION_PURPOSE,
    )
    if user is None or user.status != UserStatus.ACTIVE:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or expired",
        )

    user.email_verified_at = datetime.now(UTC)
    db.add(user)
    db.commit()
    return MessageResponse(message="Email confermata. Ora puoi accedere.")


@router.post("/email/resend", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def resend_verification_email(
    payload: EmailRequest,
    request: Request,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
    sender: EmailSender = Depends(get_email_sender),
) -> MessageResponse:
    normalized_email = normalize_email(payload.email)
    limiter_key = rate_limit_key(request, "email-resend", normalized_email)
    raise_if_rate_limited(limiter, limiter_key)
    record_auth_failure(limiter, limiter_key)

    user = get_user_by_email(db, normalized_email)
    if user is not None and user.status == UserStatus.ACTIVE and user.email_verified_at is None:
        raw_token = issue_account_token(
            db,
            user=user,
            purpose=EMAIL_VERIFICATION_PURPOSE,
            expires_in=timedelta(hours=settings.email_verification_expire_hours),
        )
        db.commit()
        try:
            send_verification_message(sender, settings, user, raw_token)
        except (OSError, smtplib.SMTPException):
            logger.exception("Unable to resend verification email for user %s", user.id)

    return MessageResponse(
        message="Se l'account richiede conferma, riceverai una nuova email.",
    )


@router.post(
    "/password/forgot",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def forgot_password(
    payload: EmailRequest,
    request: Request,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
    sender: EmailSender = Depends(get_email_sender),
) -> MessageResponse:
    normalized_email = normalize_email(payload.email)
    limiter_key = rate_limit_key(request, "password-forgot", normalized_email)
    raise_if_rate_limited(limiter, limiter_key)
    record_auth_failure(limiter, limiter_key)

    user = get_user_by_email(db, normalized_email)
    if user is not None and user.status == UserStatus.ACTIVE and user.email_verified_at is not None:
        raw_token = issue_account_token(
            db,
            user=user,
            purpose=PASSWORD_RESET_PURPOSE,
            expires_in=timedelta(minutes=settings.password_reset_expire_minutes),
        )
        db.commit()
        try:
            send_password_reset_message(sender, settings, user, raw_token)
        except (OSError, smtplib.SMTPException):
            logger.exception("Unable to send password reset email for user %s", user.id)

    return MessageResponse(
        message="Se esiste un account verificato, riceverai le istruzioni via email.",
    )


@router.post("/password/reset", response_model=MessageResponse)
def reset_password(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db_session),
) -> MessageResponse:
    user = consume_account_token(
        db,
        raw_token=payload.token,
        purpose=PASSWORD_RESET_PURPOSE,
    )
    if (
        user is None
        or user.status != UserStatus.ACTIVE
        or user.email_verified_at is None
    ):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset link is invalid or expired",
        )

    user.password_hash = hash_password(payload.password)
    revoke_user_refresh_tokens(db, user.id)
    db.add(user)
    db.commit()
    return MessageResponse(message="Password aggiornata. Ora puoi accedere.")


@router.post(
    "/login",
    response_model=(
        TokenPairResponse
        | TwoFactorRequiredResponse
        | TwoFactorSetupRequiredResponse
        | EmailVerificationRequiredResponse
    ),
)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> (
    TokenPairResponse
    | TwoFactorRequiredResponse
    | TwoFactorSetupRequiredResponse
    | EmailVerificationRequiredResponse
):
    normalized_email = normalize_email(payload.email)
    limiter_key = rate_limit_key(request, "login", normalized_email)
    raise_if_rate_limited(limiter, limiter_key)

    user = get_user_by_email(db, payload.email)
    if user is None or user.status != UserStatus.ACTIVE:
        record_auth_failure(limiter, limiter_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user.password_hash):
        record_auth_failure(limiter, limiter_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    limiter.reset(limiter_key)
    if user.email_verified_at is None:
        response.status_code = status.HTTP_403_FORBIDDEN
        return EmailVerificationRequiredResponse()

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
    request: Request,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPairResponse:
    limiter_key = rate_limit_key(request, "2fa-verify", payload.challenge_token)
    raise_if_rate_limited(limiter, limiter_key)
    try:
        user = user_from_two_factor_token(
            db,
            payload.challenge_token,
            settings,
            expected_type=TWO_FACTOR_CHALLENGE_TOKEN_TYPE,
        )
    except HTTPException:
        record_auth_failure(limiter, limiter_key)
        raise
    two_factor = user.admin_2fa
    if two_factor is None or two_factor.confirmed_at is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA challenge",
        )

    secret = decrypt_secret(two_factor.secret_encrypted, settings.app_secret_key)
    if not verify_totp_code(secret, payload.totp_code):
        record_auth_failure(limiter, limiter_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    limiter.reset(limiter_key)
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
    settings: Settings = Depends(get_settings),
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

    cancel_active_user_bookings(db, user_id=current_user.id, settings=settings)
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
    request: Request,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPairResponse:
    limiter_key = rate_limit_key(request, "2fa-confirm", payload.setup_token)
    raise_if_rate_limited(limiter, limiter_key)
    try:
        user = user_from_setup_token(db, payload.setup_token, settings)
    except HTTPException:
        record_auth_failure(limiter, limiter_key)
        raise
    two_factor = user.admin_2fa
    if two_factor is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA setup missing")

    secret = decrypt_secret(two_factor.secret_encrypted, settings.app_secret_key)
    if not verify_totp_code(secret, payload.totp_code):
        record_auth_failure(limiter, limiter_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    limiter.reset(limiter_key)
    two_factor.confirmed_at = datetime.now(UTC)
    db.add(two_factor)
    db.commit()
    db.refresh(user)

    return build_token_response(db, user, settings)
