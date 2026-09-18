import pytest
from pydantic import ValidationError

from chiron_api.config import Settings


def production_settings(**overrides: str) -> Settings:
    values = {
        "APP_ENV": "production",
        "APP_SECRET_KEY": "s" * 64,
        "APP_CORS_ORIGINS": "https://makastudio.it",
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
