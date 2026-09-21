from fastapi.testclient import TestClient

from chiron_api.config import Settings
from chiron_api.main import create_app


def test_health_check_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "api"}


def test_openapi_routes_are_disabled_by_default_in_production(tmp_path) -> None:
    settings = Settings(
        APP_ENV="production",
        API_DOCS_ENABLED=None,
        APP_SECRET_KEY="s" * 64,
        APP_CORS_ORIGINS="https://makastudio.it",
        EMAIL_DELIVERY_MODE="resend",
        EMAIL_FROM_ADDRESS="noreply@makastudio.it",
        FRONTEND_BASE_URL="https://makastudio.it",
        RESEND_API_KEY="re_test_key",
        COURSE_UPLOAD_DIR=str(tmp_path),
    )
    client = TestClient(create_app(settings))

    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_openapi_routes_can_be_enabled_explicitly_in_staging(tmp_path) -> None:
    settings = Settings(
        APP_ENV="production",
        API_DOCS_ENABLED=True,
        APP_SECRET_KEY="s" * 64,
        APP_CORS_ORIGINS="https://staging.makastudio.it",
        EMAIL_DELIVERY_MODE="resend",
        EMAIL_FROM_ADDRESS="noreply@makastudio.it",
        FRONTEND_BASE_URL="https://staging.makastudio.it",
        RESEND_API_KEY="re_test_key",
        COURSE_UPLOAD_DIR=str(tmp_path),
    )
    client = TestClient(create_app(settings))

    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200
    assert client.get("/openapi.json").status_code == 200
