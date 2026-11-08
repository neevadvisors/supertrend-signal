"""initial coverage and signal tables

Revision ID: 001
Revises:
Create Date: 2026-03-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "coverage_indices",
        sa.Column("index_id", sa.String(64), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "coverage_manual_stocks",
        sa.Column("security_id", sa.String(32), primary_key=True),
        sa.Column("symbol", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(256), nullable=False),
        sa.Column("exchange_segment", sa.String(32), nullable=False),
        sa.Column("instrument_type", sa.String(32), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "signal_runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("symbol_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("trigger", sa.String(16), nullable=False),
    )
    op.create_table(
        "signal_snapshots",
        sa.Column("security_id", sa.String(32), primary_key=True),
        sa.Column("timeframe", sa.String(8), primary_key=True),
        sa.Column("symbol", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("entry", sa.Numeric(18, 4), nullable=True),
        sa.Column("target", sa.Numeric(18, 4), nullable=True),
        sa.Column("stop", sa.Numeric(18, 4), nullable=True),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("signal_snapshots")
    op.drop_table("signal_runs")
    op.drop_table("coverage_manual_stocks")
    op.drop_table("coverage_indices")
