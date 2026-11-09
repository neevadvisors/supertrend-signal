"""Coverage persistence and stocks table rows."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.schemas import InstrumentOut, SecurityInput
from app.services.coverage_job import run_coverage_job
from app.services.coverage_service import (
    expand_coverage,
    fetch_quotes_for_universe,
    quote_for_security,
    get_coverage_state,
    latest_job,
    manual_last_run_map,
    replace_coverage,
    snapshots_for_securities,
)

router = APIRouter(prefix="/api/coverage", tags=["coverage"])


class CoveragePutBody(BaseModel):
    indexIds: list[str] = Field(default_factory=list)
    manual: list[InstrumentOut] = Field(default_factory=list)
    indexAddedOn: dict[str, str] | None = None
    indexLastRun: dict[str, str] | None = None


class CoverageRunBody(BaseModel):
    securities: list[SecurityInput] | None = None


class CoverageRowSignals(BaseModel):
    h1: str | None = Field(default=None, alias="1h")
    h4: str | None = Field(default=None, alias="4h")
    d1: str | None = Field(default=None, alias="1d")

    model_config = {"populate_by_name": True}


class CoverageRowOut(BaseModel):
    market: str = "IN"
    currency: str = "INR"
    security_id: str
    symbol: str
    display_name: str
    exchange_segment: str
    sources: list[str]
    manual: bool
    ltp: float | None = None
    change_pct: float | None = None
    signals: dict[str, str | None]
    error: str | None = None
    last_run_at: str | None = None


class CoverageRowsResponse(BaseModel):
    last_run_at: str | None = None
    quote_error: str | None = None
    rows: list[CoverageRowOut]


@router.get("")
def get_coverage(db: Session = Depends(get_db)) -> dict:
    try:
        return get_coverage_state(db)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.put("")
def put_coverage(body: CoveragePutBody, db: Session = Depends(get_db)) -> dict:
    try:
        replace_coverage(
            db,
            {
                "indexIds": body.indexIds,
                "manual": [m.model_dump() for m in body.manual],
            },
        )
        return get_coverage_state(db)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/rows")
def get_coverage_rows(db: Session = Depends(get_db)) -> CoverageRowsResponse:
    try:
        universe = expand_coverage(db)
        job = latest_job(db)
        snaps = snapshots_for_securities(db, universe)
        manual_runs = manual_last_run_map(db)

        quotes, quote_error = fetch_quotes_for_universe(universe)

        rows: list[CoverageRowOut] = []
        for sec in universe:
            sigs: dict[str, str | None] = {"1h": None, "4h": None, "1d": None}
            latest_compute: datetime | None = None
            row_error: str | None = None
            latest_error_at: datetime | None = None
            for tf in ("1h", "4h", "1d"):
                snap = snaps.get((sec.market, sec.security_id, tf))
                if snap:
                    sigs[tf] = snap.side
                    if latest_compute is None or snap.computed_at > latest_compute:
                        latest_compute = snap.computed_at
                    if snap.error:
                        if (
                            latest_error_at is None
                            or snap.computed_at >= latest_error_at
                        ):
                            latest_error_at = snap.computed_at
                            row_error = snap.error

            last_run = manual_runs.get((sec.market, sec.security_id)) or latest_compute
            q = quote_for_security(quotes, sec)
            rows.append(
                CoverageRowOut(
                    market=sec.market,
                    currency=sec.currency,
                    security_id=sec.security_id,
                    symbol=sec.symbol,
                    display_name=sec.display_name,
                    exchange_segment=sec.exchange_segment,
                    sources=sec.sources,
                    manual=sec.manual,
                    ltp=q.get("ltp"),
                    change_pct=q.get("change_pct"),
                    signals=sigs,
                    error=row_error,
                    last_run_at=last_run.isoformat() if last_run else None,
                )
            )

        global_last = job.finished_at if job and job.finished_at else None
        return CoverageRowsResponse(
            last_run_at=global_last.isoformat() if global_last else None,
            quote_error=quote_error,
            rows=rows,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/run")
def post_coverage_run(
    body: CoverageRunBody | None = None,
    db: Session = Depends(get_db),
) -> dict:
    security_keys: list[tuple[str, str]] | None = None
    if body and body.securities:
        security_keys = [(s.market, s.security_id) for s in body.securities]
    try:
        run = run_coverage_job(
            trigger="manual",
            security_keys=security_keys,
        )
        return {
            "id": run.id,
            "status": run.status,
            "symbol_count": run.symbol_count,
            "error_count": run.error_count,
            "started_at": run.started_at.isoformat(),
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
