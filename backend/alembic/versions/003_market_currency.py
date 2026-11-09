"""add market and currency columns with composite primary keys

Revision ID: 003_market_currency
Revises: 002_snapshot_error
Create Date: 2026-11-10

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_market_currency"
down_revision: Union[str, None] = "002_snapshot_error"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "coverage_indices",
        sa.Column("market", sa.String(2), nullable=True),
    )
    op.execute(sa.text("UPDATE coverage_indices SET market = 'IN'"))
    op.alter_column("coverage_indices", "market", nullable=False)

    op.add_column(
        "coverage_manual_stocks",
        sa.Column("market", sa.String(2), nullable=True),
    )
    op.add_column(
        "coverage_manual_stocks",
        sa.Column("currency", sa.String(3), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE coverage_manual_stocks SET market = 'IN', currency = 'INR'"
        )
    )
    op.alter_column("coverage_manual_stocks", "market", nullable=False)
    op.alter_column("coverage_manual_stocks", "currency", nullable=False)

    with op.batch_alter_table("coverage_manual_stocks") as batch_op:
        batch_op.drop_constraint("coverage_manual_stocks_pkey", type_="primary")
        batch_op.create_primary_key(
            "coverage_manual_stocks_pkey",
            ["market", "security_id"],
        )

    op.add_column(
        "signal_snapshots",
        sa.Column("market", sa.String(2), nullable=True),
    )
    op.add_column(
        "signal_snapshots",
        sa.Column("currency", sa.String(3), nullable=True),
    )
    op.execute(sa.text("UPDATE signal_snapshots SET market = 'IN', currency = 'INR'"))
    op.alter_column("signal_snapshots", "market", nullable=False)
    op.alter_column("signal_snapshots", "currency", nullable=False)

    with op.batch_alter_table("signal_snapshots") as batch_op:
        batch_op.drop_constraint("signal_snapshots_pkey", type_="primary")
        batch_op.create_primary_key(
            "signal_snapshots_pkey",
            ["market", "security_id", "timeframe"],
        )


def downgrade() -> None:
    with op.batch_alter_table("signal_snapshots") as batch_op:
        batch_op.drop_constraint("signal_snapshots_pkey", type_="primary")
        batch_op.create_primary_key(
            "signal_snapshots_pkey",
            ["security_id", "timeframe"],
        )
    op.drop_column("signal_snapshots", "currency")
    op.drop_column("signal_snapshots", "market")

    with op.batch_alter_table("coverage_manual_stocks") as batch_op:
        batch_op.drop_constraint("coverage_manual_stocks_pkey", type_="primary")
        batch_op.create_primary_key(
            "coverage_manual_stocks_pkey",
            ["security_id"],
        )
    op.drop_column("coverage_manual_stocks", "currency")
    op.drop_column("coverage_manual_stocks", "market")

    op.drop_column("coverage_indices", "market")
