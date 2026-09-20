"""hard delete users

Revision ID: 20260920_0007
Revises: 20260911_0006
Create Date: 2026-09-20 00:07:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260920_0007"
down_revision: str | None = "20260911_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "fk_courses_instructor_user_id_users",
        "courses",
        type_="foreignkey",
    )
    op.create_foreign_key(
        op.f("fk_courses_instructor_user_id_users"),
        "courses",
        "users",
        ["instructor_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        sa.text(
            "UPDATE courses SET instructor_user_id = NULL "
            "WHERE instructor_user_id IN (SELECT id FROM users WHERE status = 'deleted')",
        ),
    )
    op.execute(sa.text("DELETE FROM users WHERE status = 'deleted'"))


def downgrade() -> None:
    op.drop_constraint(
        "fk_courses_instructor_user_id_users",
        "courses",
        type_="foreignkey",
    )
    op.create_foreign_key(
        op.f("fk_courses_instructor_user_id_users"),
        "courses",
        "users",
        ["instructor_user_id"],
        ["id"],
    )
