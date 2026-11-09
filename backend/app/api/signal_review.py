"""Signals matrix and review status."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SignalSnapshot
from app.db.session import get_db
from app.services.coverage_service import (
    expand_coverage,
    latest_job,
    manual_last_run_map,
    snapshots_for_securities,
)
from src.dhan_client import QuoteInstrument, fetch_market_ohlc

router = APIRouter(prefix="/api/signals", tags=["signal-review"])

REVIEW_TIMEFRAMES = ("1h", "4h", "1d")


class SignalCellOut(BaseModel):
    security_id: str
    symbol: str
    timeframe: str
    side: str
    entry: float | None
    target: float | None
    stop: float | None
    note: str
    status: str
    computed_at: str
    run_id: str


class MatrixStockOut(BaseModel):
    security_id: str
    symbol: str
    display_name: str
    exchange_segment: str
    sources: list[str]
    manual: bool
    ltp: float | None = None
    change_pct: float | None = None
    last_run_at: str | None = None


class LatestRunOut(BaseModel):
    id: str
    trigger: str
    symbol_count: int
    finished_at: str | None


class SignalMatrixResponse(BaseModel):
    last_run_at: str | None
    pending_count: int
    latest_run: LatestRunOut | None = None
    stocks: list[MatrixStockOut]
    cells: list[SignalCellOut]


class SignalStatusPatch(BaseModel):
    status: str


@router.get("/matrix")
def get_signal_matrix(db: Session = Depends(get_db)) -> SignalMatrixResponse:
    universe = expand_coverage(db)
    ids = [s.security_id for s in universe]
    job = latest_job(db)
    snaps = snapshots_for_securities(db, ids)
    manual_runs = manual_last_run_map(db)

    quotes: dict[str, dict] = {}
    if universe:
        try:
            quotes = fetch_market_ohlc(
                [
                    QuoteInstrument(s.security_id, s.exchange_segment)
                    for s in universe
                ]
            )
        except Exception:
            quotes = {}

    stocks: list[MatrixStockOut] = []
    for sec in universe:
        latest_compute = None
        for tf in REVIEW_TIMEFRAMES:
            snap = snaps.get((sec.security_id, tf))
            if snap and (
                latest_compute is None or snap.computed_at > latest_compute
            ):
                latest_compute = snap.computed_at
        last_run = manual_runs.get(sec.security_id) or latest_compute
        q = quotes.get(sec.security_id, {})
        stocks.append(
            MatrixStockOut(
                security_id=sec.security_id,
                symbol=sec.symbol,
                display_name=sec.display_name,
                exchange_segment=sec.exchange_segment,
                sources=sec.sources,
                manual=sec.manual,
                ltp=q.get("ltp"),
                change_pct=q.get("change_pct"),
                last_run_at=last_run.isoformat() if last_run else None,
            )
        )

    cells: list[SignalCellOut] = []
    pending_count = 0
    if ids:
        rows = db.scalars(
            select(SignalSnapshot).where(SignalSnapshot.security_id.in_(ids))
        ).all()
        for row in rows:
            cells.append(
                SignalCellOut(
                    security_id=row.security_id,
                    symbol=row.symbol,
                    timeframe=row.timeframe,
                    side=row.side,
                    entry=float(row.entry) if row.entry is not None else None,
                    target=float(row.target) if row.target is not None else None,
                    stop=float(row.stop) if row.stop is not None else None,
                    note=row.note,
                    status=row.status,
                    computed_at=row.computed_at.isoformat(),
                    run_id=row.run_id,
                )
            )
            if row.status == "pending" and row.side != "NONE":
                pending_count += 1

    finished = job.finished_at if job else None
    latest_run: LatestRunOut | None = None
    if job:
        latest_run = LatestRunOut(
            id=job.id,
            trigger=job.trigger,
            symbol_count=job.symbol_count,
            finished_at=job.finished_at.isoformat() if job.finished_at else None,
        )

    return SignalMatrixResponse(
        last_run_at=finished.isoformat() if finished else None,
        pending_count=pending_count,
        latest_run=latest_run,
        stocks=stocks,
        cells=cells,
    )


@router.patch("/{security_id}/{timeframe}")
def patch_signal_status(
    security_id: str,
    timeframe: str,
    body: SignalStatusPatch,
    db: Session = Depends(get_db),
) -> SignalCellOut:
    if body.status not in ("pending", "approved", "skipped"):
        raise HTTPException(status_code=400, detail="Invalid status")
    row = db.get(SignalSnapshot, (security_id, timeframe))
    if row is None:
        raise HTTPException(status_code=404, detail="Signal not found")
    row.status = body.status
    db.commit()
    db.refresh(row)
    return SignalCellOut(
        security_id=row.security_id,
        symbol=row.symbol,
        timeframe=row.timeframe,
        side=row.side,
        entry=float(row.entry) if row.entry is not None else None,
        target=float(row.target) if row.target is not None else None,
        stop=float(row.stop) if row.stop is not None else None,
        note=row.note,
        status=row.status,
        computed_at=row.computed_at.isoformat(),
        run_id=row.run_id,
    )
