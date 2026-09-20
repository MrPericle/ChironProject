from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from chiron_api.admin.router import router as admin_router
from chiron_api.auth.rate_limit import AuthRateLimiter
from chiron_api.auth.router import router as auth_router
from chiron_api.bookings.router import router as bookings_router
from chiron_api.config import Settings, get_settings
from chiron_api.courses.router import router as courses_router
from chiron_api.email import build_email_sender
from chiron_api.subscriptions.router import router as subscriptions_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    app.state.auth_rate_limiter = AuthRateLimiter(
        max_attempts=settings.auth_rate_limit_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    app.state.email_sender = build_email_sender(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if request.url.path.startswith(("/auth", "/admin", "/bookings", "/subscriptions")):
            response.headers["Cache-Control"] = "no-store"
        return response

    upload_dir = Path(settings.course_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok", "service": "api"}

    app.include_router(auth_router)
    app.include_router(bookings_router)
    app.include_router(courses_router)
    app.include_router(subscriptions_router)
    app.include_router(admin_router)

    return app


app = create_app()
