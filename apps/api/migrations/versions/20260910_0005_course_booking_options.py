"""add course subscription and one-off schedule options

Revision ID: 20260910_0005
Revises: 20260827_0004
Create Date: 2026-09-10 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260910_0005"
down_revision: str | None = "20260827_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column(
            "requires_active_subscription",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column("course_sessions", sa.Column("occurs_on", sa.Date(), nullable=True))
    op.drop_index("uq_active_course_session_schedule", table_name="course_sessions")
    op.create_index(
        "uq_active_course_session_schedule",
        "course_sessions",
        ["course_id", "weekday", "starts_at", "ends_at"],
        unique=True,
        postgresql_where=sa.text("is_active = true AND occurs_on IS NULL"),
    )
    op.create_index(
        "uq_active_single_course_session_schedule",
        "course_sessions",
        ["course_id", "occurs_on", "starts_at", "ends_at"],
        unique=True,
        postgresql_where=sa.text("is_active = true AND occurs_on IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_active_single_course_session_schedule", table_name="course_sessions")
    op.drop_index("uq_active_course_session_schedule", table_name="course_sessions")
    op.create_index(
        "uq_active_course_session_schedule",
        "course_sessions",
        ["course_id", "weekday", "starts_at", "ends_at"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.drop_column("course_sessions", "occurs_on")
    op.drop_column("courses", "requires_active_subscription")
