"""backfill US market on coverage_indices rows

Revision ID: 005_coverage_index_market_us
Revises: 004_prev_closes
Create Date: 2026-11-10

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_coverage_index_market_us"
down_revision: Union[str, None] = "004_prev_closes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE coverage_indices SET market = 'US' "
            "WHERE index_id IN ('dow30', 'nasdaq100')"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE coverage_indices SET market = 'IN' "
            "WHERE index_id IN ('dow30', 'nasdaq100')"
        )
    )
