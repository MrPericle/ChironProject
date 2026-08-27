"""add occurrence date to bookings

Revision ID: 20260827_0004
Revises: 20260825_0003
Create Date: 2026-08-27 18:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260827_0004"
down_revision: str | None = "20260825_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("occurs_on", sa.Date(), nullable=True))
    op.execute(
        """
        UPDATE bookings AS booking
        SET occurs_on = (
            (booking.created_at AT TIME ZONE 'Europe/Rome')::date
            + (
                (
                    course_session.weekday
                    - EXTRACT(
                        DOW FROM booking.created_at AT TIME ZONE 'Europe/Rome'
                    )::integer
                    + 7
                ) % 7
            )
        )
        FROM course_sessions AS course_session
        WHERE course_session.id = booking.course_session_id
        """,
    )
    op.alter_column("bookings", "occurs_on", nullable=False)
    op.drop_constraint("uq_bookings_user_session", "bookings", type_="unique")
    op.create_unique_constraint(
        "uq_bookings_user_session_date",
        "bookings",
        ["user_id", "course_session_id", "occurs_on"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_bookings_user_session_date", "bookings", type_="unique")
    op.drop_column("bookings", "occurs_on")
    op.create_unique_constraint(
        "uq_bookings_user_session",
        "bookings",
        ["user_id", "course_session_id"],
    )
