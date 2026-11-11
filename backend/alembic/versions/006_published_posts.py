"""published_posts table

Revision ID: 006_published_posts
Revises: 005_coverage_index_market_us
Create Date: 2026-11-10

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_published_posts"
down_revision: Union[str, None] = "005_coverage_index_market_us"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "published_posts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("call_no", sa.Integer(), nullable=False, unique=True),
        sa.Column("market", sa.String(2), nullable=False),
        sa.Column("security_id", sa.String(32), nullable=False),
        sa.Column("timeframe", sa.String(8), nullable=False),
        sa.Column("symbol", sa.String(64), nullable=False),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("display_name", sa.String(256), nullable=False),
        sa.Column("exchange_segment", sa.String(32), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("price", sa.Numeric(18, 4), nullable=True),
        sa.Column("change_pct", sa.Numeric(18, 4), nullable=True),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("views", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("likes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("comments", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_published_posts_published_at",
        "published_posts",
        ["published_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_published_posts_published_at", table_name="published_posts")
    op.drop_table("published_posts")
