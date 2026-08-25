from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from chiron_api.admin.router import router as admin_router
from chiron_api.auth.router import router as auth_router
from chiron_api.bookings.router import router as bookings_router
from chiron_api.config import get_settings
from chiron_api.courses.router import router as courses_router
from chiron_api.subscriptions.router import router as subscriptions_router


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url="/redoc" if settings.app_env != "production" else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
