"""course scheduling and media

Revision ID: 20260825_0003
Revises: 20260824_0002
Create Date: 2026-08-25 10:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260825_0003"
down_revision: str | None = "20260824_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    discipline = sa.Enum(
        "calisthenics",
        "martial_arts",
        "pole_dance",
        "mobility",
        "other",
        name="course_discipline",
    )
    discipline.create(bind, checkfirst=True)

    op.add_column(
        "courses",
        sa.Column(
            "discipline",
            discipline,
            server_default="other",
            nullable=False,
        ),
    )
    op.add_column("courses", sa.Column("image_url", sa.String(length=500), nullable=True))

    op.execute(
        "UPDATE courses SET discipline = 'pole_dance' "
        "WHERE lower(title) LIKE '%pole%'",
    )
    op.execute(
        "UPDATE courses SET discipline = 'martial_arts' "
        "WHERE lower(title) LIKE '%martial%' "
        "OR lower(title) LIKE '%karate%' "
        "OR lower(title) LIKE '%judo%'",
    )
    op.execute(
        "UPDATE courses SET discipline = 'calisthenics' "
        "WHERE lower(title) LIKE '%calisthenics%'",
    )
    op.alter_column("courses", "discipline", server_default=None)

    op.create_unique_constraint(
        "uq_courses_location_title",
        "courses",
        ["location_id", "title"],
    )
    op.execute(
        "WITH ranked_sessions AS ("
        " SELECT id, row_number() OVER ("
        "  PARTITION BY course_id, weekday, starts_at, ends_at"
        "  ORDER BY created_at, id"
        " ) AS schedule_rank"
        " FROM course_sessions WHERE is_active = true"
        ")"
        " UPDATE course_sessions SET is_active = false"
        " FROM ranked_sessions"
        " WHERE course_sessions.id = ranked_sessions.id"
        " AND ranked_sessions.schedule_rank > 1",
    )
    op.create_index(
        "uq_active_course_session_schedule",
        "course_sessions",
        ["course_id", "weekday", "starts_at", "ends_at"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )


def downgrade() -> None:
    op.drop_index("uq_active_course_session_schedule", table_name="course_sessions")
    op.drop_constraint("uq_courses_location_title", "courses", type_="unique")
    op.drop_column("courses", "image_url")
    op.drop_column("courses", "discipline")
    sa.Enum(name="course_discipline").drop(op.get_bind(), checkfirst=True)
