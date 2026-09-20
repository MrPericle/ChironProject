"""account action tokens

Revision ID: 20260920_0008
Revises: 20260920_0007
Create Date: 2026-09-20 00:08:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260920_0008"
down_revision: str | None = "20260920_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE users SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP) "
            "WHERE email_verified_at IS NULL",
        ),
    )
    op.create_table(
        "account_action_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_account_action_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_account_action_tokens")),
        sa.UniqueConstraint(
            "token_hash",
            name=op.f("uq_account_action_tokens_token_hash"),
        ),
    )
    op.create_index(
        op.f("ix_account_action_tokens_purpose"),
        "account_action_tokens",
        ["purpose"],
        unique=False,
    )
    op.create_index(
        op.f("ix_account_action_tokens_token_hash"),
        "account_action_tokens",
        ["token_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_account_action_tokens_token_hash"),
        table_name="account_action_tokens",
    )
    op.drop_index(
        op.f("ix_account_action_tokens_purpose"),
        table_name="account_action_tokens",
    )
    op.drop_table("account_action_tokens")
    op.drop_column("users", "email_verified_at")
