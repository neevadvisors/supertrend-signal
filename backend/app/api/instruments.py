"""Instrument list / search endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import InstrumentOut
from src.instruments import search_nse_equity_instruments
from src.market_data import provider_for

router = APIRouter(prefix="/api/instruments", tags=["instruments"])


@router.get("", response_model=list[InstrumentOut])
def list_instruments(
    q: str = Query(default="", description="Search query (symbol / name)"),
    limit: int = Query(default=50, ge=1, le=100),
    refresh: bool = Query(default=False),
    market: str = Query(default="IN", pattern="^(IN|US)$"),
) -> list[InstrumentOut]:
    """
    Search equity instruments for ``market`` (IN → Dhan/NSE, US → Alpaca).

    Returns matching rows for `q` (empty query → []). For India only, set
    ``refresh=true`` to re-download the Dhan scrip master before searching.
    """
    try:
        if market == "IN" and refresh:
            rows = search_nse_equity_instruments(
                q, limit=limit, force_refresh=True
            )
        else:
            rows = provider_for(market).search_instruments(q, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return [InstrumentOut(**row) for row in rows]
