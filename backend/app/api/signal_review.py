"""Signals matrix and review status."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SignalSnapshot
from app.db.session import get_db
from app.services.coverage_service import expand_coverage, latest_job

router = APIRouter(prefix="/api/signals", tags=["signal-review"])


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


class SignalMatrixResponse(BaseModel):
    last_run_at: str | None
    cells: list[SignalCellOut]


class SignalStatusPatch(BaseModel):
    status: str


@router.get("/matrix")
def get_signal_matrix(db: Session = Depends(get_db)) -> SignalMatrixResponse:
    universe = expand_coverage(db)
    ids = [s.security_id for s in universe]
    job = latest_job(db)
    cells: list[SignalCellOut] = []
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
    finished = job.finished_at if job else None
    return SignalMatrixResponse(
        last_run_at=finished.isoformat() if finished else None,
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
