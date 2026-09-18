from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = Field(default="development", alias="APP_ENV")
    app_name: str = Field(default="Chiron Project API", alias="APP_NAME")
    api_docs_enabled: bool | None = Field(default=None, alias="API_DOCS_ENABLED")
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:5174",
        alias="APP_CORS_ORIGINS",
    )
    database_url: str = Field(
        default="postgresql+psycopg://chiron:chiron_dev_password@localhost:5432/chiron",
        alias="DATABASE_URL",
    )
    app_secret_key: str = Field(
        default="dev-only-change-me-before-production",
        alias="APP_SECRET_KEY",
    )
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS")
    auth_token_issuer: str = Field(default="chiron-api", alias="AUTH_TOKEN_ISSUER")
    auth_rate_limit_attempts: int = Field(
        default=8,
        ge=3,
        le=100,
        alias="AUTH_RATE_LIMIT_ATTEMPTS",
    )
    auth_rate_limit_window_seconds: int = Field(
        default=60,
        ge=10,
        le=3600,
        alias="AUTH_RATE_LIMIT_WINDOW_SECONDS",
    )
    waitlist_enabled: bool = Field(default=False, alias="WAITLIST_ENABLED")
    app_timezone: str = Field(default="Europe/Rome", alias="APP_TIMEZONE")
    booking_horizon_days: int = Field(
        default=28,
        ge=7,
        le=180,
        alias="BOOKING_HORIZON_DAYS",
    )
    course_upload_dir: str = Field(default="uploads", alias="COURSE_UPLOAD_DIR")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def docs_enabled(self) -> bool:
        if self.api_docs_enabled is not None:
            return self.api_docs_enabled
        return self.app_env.lower() != "production"

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_env.lower() != "production":
            return self

        if len(self.app_secret_key) < 64 or self.app_secret_key.startswith("dev-only"):
            raise ValueError("APP_SECRET_KEY must contain at least 64 characters in production")

        origins = self.cors_origin_list
        if not origins:
            raise ValueError("APP_CORS_ORIGINS must contain at least one production origin")

        for origin in origins:
            parsed = urlsplit(origin)
            if (
                origin == "*"
                or parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.query
                or parsed.fragment
                or parsed.path not in {"", "/"}
            ):
                raise ValueError(
                    "APP_CORS_ORIGINS must contain only HTTPS origins without paths "
                    "in production",
                )

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
