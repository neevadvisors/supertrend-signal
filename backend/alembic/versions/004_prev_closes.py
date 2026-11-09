"""prev_closes table for DB-backed previous close cache

Revision ID: 004_prev_closes
Revises: 003_market_currency
Create Date: 2026-11-10

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_prev_closes"
down_revision: Union[str, None] = "003_market_currency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prev_closes",
        sa.Column("market", sa.String(2), nullable=False),
        sa.Column("security_id", sa.String(32), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column(
            "prev_close",
            sa.Numeric(18, 4),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint(
            "market",
            "security_id",
            "session_date",
            name="prev_closes_pkey",
        ),
    )


def downgrade() -> None:
    op.drop_table("prev_closes")
