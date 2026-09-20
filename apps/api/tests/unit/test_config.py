import pytest
from pydantic import ValidationError

from chiron_api.config import Settings


def production_settings(**overrides: str | None) -> Settings:
    values = {
        "APP_ENV": "production",
        "API_DOCS_ENABLED": None,
        "APP_SECRET_KEY": "s" * 64,
        "APP_CORS_ORIGINS": "https://makastudio.it",
        "EMAIL_DELIVERY_MODE": "smtp",
        "EMAIL_FROM_ADDRESS": "noreply@makastudio.it",
        "FRONTEND_BASE_URL": "https://makastudio.it",
        "SMTP_HOST": "smtp.example.com",
    }
    values.update(overrides)
    return Settings(**values)


def test_production_settings_accept_secure_origins_and_secret() -> None:
    settings = production_settings(
        APP_CORS_ORIGINS="https://makastudio.it,https://staging.makastudio.it",
    )

    assert settings.cors_origin_list == [
        "https://makastudio.it",
        "https://staging.makastudio.it",
    ]


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "http://makastudio.it",
        "https://makastudio.it/path",
        "https://user:password@makastudio.it",
    ],
)
def test_production_settings_reject_insecure_cors_origins(origin: str) -> None:
    with pytest.raises(ValidationError, match="APP_CORS_ORIGINS"):
        production_settings(APP_CORS_ORIGINS=origin)


def test_production_settings_reject_short_secret() -> None:
    with pytest.raises(ValidationError, match="APP_SECRET_KEY"):
        production_settings(APP_SECRET_KEY="too-short")


def test_production_settings_require_smtp_delivery() -> None:
    with pytest.raises(ValidationError, match="SMTP email delivery"):
        production_settings(EMAIL_DELIVERY_MODE="console")


def test_api_docs_default_to_development_only_and_can_be_enabled_explicitly() -> None:
    assert Settings(APP_ENV="development").docs_enabled is True
    assert production_settings().docs_enabled is False
    assert production_settings(API_DOCS_ENABLED="true").docs_enabled is True
