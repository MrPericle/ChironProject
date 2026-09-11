"""add dynamic course disciplines

Revision ID: 20260911_0006
Revises: 20260910_0005
Create Date: 2026-09-11 10:00:00
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "20260911_0006"
down_revision: str | None = "20260910_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

default_disciplines = (
    ("00000000-0000-4000-8000-000000000001", "Sala", 1),
    ("00000000-0000-4000-8000-000000000002", "Arti marziali", 2),
    ("00000000-0000-4000-8000-000000000003", "Pole", 3),
    ("00000000-0000-4000-8000-000000000004", "Altro", 4),
)


def upgrade() -> None:
    op.create_table(
        "course_disciplines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_disciplines")),
    )
    op.create_index(
        "uq_course_disciplines_name_lower",
        "course_disciplines",
        [sa.text("lower(name)")],
        unique=True,
    )

    discipline_table = sa.table(
        "course_disciplines",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_default", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        discipline_table,
        [
            {
                "id": discipline_id,
                "name": name,
                "sort_order": sort_order,
                "is_default": True,
                "created_at": datetime.now(UTC),
            }
            for discipline_id, name, sort_order in default_disciplines
        ],
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.alter_column(
            "courses",
            "discipline",
            existing_type=sa.Enum(name="course_discipline"),
            type_=sa.String(length=80),
            postgresql_using="discipline::text",
        )
        sa.Enum(name="course_discipline").drop(bind, checkfirst=True)
    else:
        with op.batch_alter_table("courses") as batch_op:
            batch_op.alter_column(
                "discipline",
                existing_type=sa.String(length=20),
                type_=sa.String(length=80),
            )

    op.execute(
        "UPDATE courses SET discipline = CASE discipline "
        "WHEN 'calisthenics' THEN 'Sala' "
        "WHEN 'mobility' THEN 'Sala' "
        "WHEN 'martial_arts' THEN 'Arti marziali' "
        "WHEN 'pole_dance' THEN 'Pole' "
        "ELSE 'Altro' END",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE courses SET discipline = CASE discipline "
        "WHEN 'Sala' THEN 'calisthenics' "
        "WHEN 'Arti marziali' THEN 'martial_arts' "
        "WHEN 'Pole' THEN 'pole_dance' "
        "ELSE 'other' END",
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        discipline = sa.Enum(
            "calisthenics",
            "martial_arts",
            "pole_dance",
            "mobility",
            "other",
            name="course_discipline",
        )
        discipline.create(bind, checkfirst=True)
        op.alter_column(
            "courses",
            "discipline",
            existing_type=sa.String(length=80),
            type_=discipline,
            postgresql_using="discipline::course_discipline",
        )
    else:
        with op.batch_alter_table("courses") as batch_op:
            batch_op.alter_column(
                "discipline",
                existing_type=sa.String(length=80),
                type_=sa.String(length=20),
            )

    op.drop_index("uq_course_disciplines_name_lower", table_name="course_disciplines")
    op.drop_table("course_disciplines")
