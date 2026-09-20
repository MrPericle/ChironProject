"""reverify account emails

Revision ID: 20260920_0009
Revises: 20260920_0008
Create Date: 2026-09-20 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260920_0009"
down_revision: str | None = "20260920_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_email", sa.String(length=320), nullable=True))
    op.execute(
        sa.text(
            "UPDATE users SET email_verified_at = NULL "
            "WHERE status <> 'deleted'",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "pending_email")
