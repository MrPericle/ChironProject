from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from chiron_api.db.models import UserRole


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=256)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class TwoFactorSetupRequest(BaseModel):
    setup_token: str = Field(min_length=32)


class TwoFactorConfirmRequest(BaseModel):
    setup_token: str = Field(min_length=32)
    totp_code: str = Field(min_length=6, max_length=6)


class TwoFactorVerifyRequest(BaseModel):
    challenge_token: str = Field(min_length=32)
    totp_code: str = Field(min_length=6, max_length=6)


class UserResponse(BaseModel):
    id: UUID
    email: str
    role: UserRole

    model_config = ConfigDict(from_attributes=True)


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TwoFactorRequiredResponse(BaseModel):
    requires_2fa: bool = True
    challenge_token: str


class TwoFactorSetupRequiredResponse(BaseModel):
    requires_2fa_setup: bool = True
    setup_token: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str
