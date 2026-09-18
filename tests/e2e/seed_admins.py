from chiron_api.cli import create_or_promote_admin
from chiron_api.db.session import SessionLocal


ADMIN_PASSWORD = "E2ePassword123!"
ADMIN_EMAILS = (
    "e2e.admin.desktop@maka.local",
    "e2e.admin.mobile@maka.local",
)


with SessionLocal() as session:
    for email in ADMIN_EMAILS:
        create_or_promote_admin(
            session,
            email=email,
            password=ADMIN_PASSWORD,
            first_name="Admin",
            last_name="E2E",
        )
