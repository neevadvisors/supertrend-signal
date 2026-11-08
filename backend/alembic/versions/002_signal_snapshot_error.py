"""add signal_snapshots.error column

Revision ID: 002_snapshot_error
Revises: 001_initial
Create Date: 2026-11-07

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_snapshot_error"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "signal_snapshots",
        sa.Column("error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("signal_snapshots", "error")
