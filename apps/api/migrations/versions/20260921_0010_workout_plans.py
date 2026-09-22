"""add workout plans and training diary

Revision ID: 20260921_0010
Revises: 20260920_0009
Create Date: 2026-09-21 00:10:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260921_0010"
down_revision: str | None = "20260920_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE workout_plan_status AS ENUM ('draft', 'published', 'archived');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    workout_plan_status = postgresql.ENUM(
        "draft", "published", "archived", name="workout_plan_status", create_type=False
    )

    op.create_table(
        "workout_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", workout_plan_status, nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_plans_created_by_id", "workout_plans", ["created_by_id"])
    op.create_index("ix_workout_plans_status_updated_at", "workout_plans", ["status", "updated_at"])

    op.create_table(
        "workout_days",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["workout_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_days_plan_position", "workout_days", ["plan_id", "position"])

    op.create_table(
        "workout_exercises",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("day_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("sets_planned", sa.Integer(), nullable=False),
        sa.Column("reps_planned", sa.String(length=40), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.CheckConstraint("sets_planned > 0", name="sets_planned_positive"),
        sa.CheckConstraint("rest_seconds IS NULL OR rest_seconds >= 0", name="rest_seconds_non_negative"),
        sa.ForeignKeyConstraint(["day_id"], ["workout_days.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_exercises_day_position", "workout_exercises", ["day_id", "position"])

    op.create_table(
        "workout_plan_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["workout_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "user_id", name="uq_workout_plan_assignments_plan_user"),
    )

    op.create_table(
        "workout_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=True),
        sa.Column("day_id", sa.Uuid(), nullable=True),
        sa.Column("workout_date", sa.Date(), nullable=False),
        sa.Column("general_note", sa.String(length=2000), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="rating_range"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["workout_plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["day_id"], ["workout_days.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_logs_user_date", "workout_logs", ["user_id", "workout_date"])
    op.create_index("ix_workout_logs_plan_day", "workout_logs", ["plan_id", "day_id"])

    op.create_table(
        "workout_log_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("log_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=True),
        sa.Column("exercise_name_snapshot", sa.String(length=180), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("repetitions", sa.Integer(), nullable=False),
        sa.Column("load_kg", sa.Numeric(7, 2), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.CheckConstraint("set_number > 0", name="set_number_positive"),
        sa.CheckConstraint("repetitions > 0", name="repetitions_positive"),
        sa.CheckConstraint("load_kg >= 0 AND load_kg <= 1000", name="load_kg_range"),
        sa.ForeignKeyConstraint(["log_id"], ["workout_logs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["exercise_id"], ["workout_exercises.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_log_entries_log_id", "workout_log_entries", ["log_id"])


def downgrade() -> None:
    op.drop_index("ix_workout_log_entries_log_id", table_name="workout_log_entries")
    op.drop_table("workout_log_entries")
    op.drop_index("ix_workout_logs_plan_day", table_name="workout_logs")
    op.drop_index("ix_workout_logs_user_date", table_name="workout_logs")
    op.drop_table("workout_logs")
    op.drop_table("workout_plan_assignments")
    op.drop_index("ix_workout_exercises_day_position", table_name="workout_exercises")
    op.drop_table("workout_exercises")
    op.drop_index("ix_workout_days_plan_position", table_name="workout_days")
    op.drop_table("workout_days")
    op.drop_index("ix_workout_plans_status_updated_at", table_name="workout_plans")
    op.drop_index("ix_workout_plans_created_by_id", table_name="workout_plans")
    op.drop_table("workout_plans")
    sa.Enum(name="workout_plan_status").drop(op.get_bind(), checkfirst=True)
