"""Hourly / manual coverage signal job."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CoverageIndex, CoverageManualStock, SignalRun, SignalSnapshot
from app.db.session import SessionLocal
from app.services.coverage_service import CoveredSecurity, expand_coverage
from src.dhan_client import (
    Timeframe,
    cache_prev_close,
    default_lookback_for_timeframe,
    fetch_candles,
    get_dhan_client,
    prev_close_from_daily_df,
)
from src.signals import NeevParams, latest_signal, signal_snapshot_from_latest

CRON_TIMEFRAMES: tuple[Timeframe, ...] = ("1h", "4h", "1d")
DEFAULT_PARAMS = NeevParams()
FETCH_FAILED_NOTE = "Fetch failed; prior signal kept when available."


def _new_run_id() -> str:
    return f"r{uuid.uuid4().hex[:8]}"


def _compute_security(
    sec: CoveredSecurity,
    run_id: str,
    params: NeevParams,
) -> tuple[str, list[dict]]:
    client = get_dhan_client()
    snapshots: list[dict] = []

    for tf in CRON_TIMEFRAMES:
        try:
            ohlc = fetch_candles(
                sec.security_id,
                exchange_segment=sec.exchange_segment,
                instrument_type=sec.instrument_type,
                timeframe=tf,
                lookback_days=default_lookback_for_timeframe(tf),
                client=client,
            )
            if tf == "1d":
                prev = prev_close_from_daily_df(ohlc)
                if prev is not None:
                    cache_prev_close(sec.security_id, prev)
            raw = latest_signal(ohlc, params, timeframe=tf)
            mapped = signal_snapshot_from_latest(raw, timeframe=tf)
            snapshots.append(
                {
                    "security_id": sec.security_id,
                    "symbol": sec.symbol,
                    "timeframe": tf,
                    "run_id": run_id,
                    "side": mapped["side"],
                    "entry": mapped["entry"],
                    "target": mapped["target"],
                    "stop": mapped["stop"],
                    "note": mapped["note"],
                    "failed": False,
                    "error": None,
                }
            )
        except Exception as exc:
            snapshots.append(
                {
                    "security_id": sec.security_id,
                    "symbol": sec.symbol,
                    "timeframe": tf,
                    "run_id": run_id,
                    "failed": True,
                    "error": str(exc),
                }
            )

    return sec.security_id, snapshots


def _upsert_snapshot(db: Session, row: dict, computed_at: datetime) -> bool:
    """Returns True when a successful snapshot was written or updated."""
    existing = db.get(SignalSnapshot, (row["security_id"], row["timeframe"]))

    if row.get("failed"):
        err = row.get("error")
        if existing is None:
            db.add(
                SignalSnapshot(
                    security_id=row["security_id"],
                    timeframe=row["timeframe"],
                    symbol=row["symbol"],
                    run_id=row["run_id"],
                    side="NONE",
                    entry=None,
                    target=None,
                    stop=None,
                    note=FETCH_FAILED_NOTE,
                    error=err,
                    status="pending",
                    computed_at=computed_at,
                )
            )
        else:
            existing.symbol = row["symbol"]
            existing.run_id = row["run_id"]
            existing.error = err
            existing.computed_at = computed_at
        return False

    entry = row.get("entry")
    target = row.get("target")
    stop = row.get("stop")
    if existing is None:
        db.add(
            SignalSnapshot(
                security_id=row["security_id"],
                timeframe=row["timeframe"],
                symbol=row["symbol"],
                run_id=row["run_id"],
                side=row["side"],
                entry=Decimal(str(entry)) if entry is not None else None,
                target=Decimal(str(target)) if target is not None else None,
                stop=Decimal(str(stop)) if stop is not None else None,
                note=row["note"],
                error=None,
                status="pending",
                computed_at=computed_at,
            )
        )
    else:
        existing.symbol = row["symbol"]
        existing.run_id = row["run_id"]
        existing.side = row["side"]
        existing.entry = Decimal(str(entry)) if entry is not None else None
        existing.target = Decimal(str(target)) if target is not None else None
        existing.stop = Decimal(str(stop)) if stop is not None else None
        existing.note = row["note"]
        existing.error = None
        existing.status = "pending"
        existing.computed_at = computed_at
    return True


def run_coverage_job(
    *,
    trigger: str = "cron",
    security_ids: list[str] | None = None,
) -> SignalRun:
    run_id = _new_run_id()
    started = datetime.now(timezone.utc)
    db = SessionLocal()
    run = SignalRun(
        id=run_id,
        started_at=started,
        status="running",
        symbol_count=0,
        error_count=0,
        trigger=trigger,
    )
    db.add(run)
    db.commit()

    try:
        universe = expand_coverage(db)
        if security_ids:
            allowed = set(security_ids)
            universe = [s for s in universe if s.security_id in allowed]

        run.symbol_count = len(universe)
        db.commit()

        errors = 0
        computed_at = datetime.now(timezone.utc)
        successful_upserts = 0

        for sec in universe:
            sid, snapshots = _compute_security(sec, run_id, DEFAULT_PARAMS)
            tf_ok = 0
            for row in snapshots:
                if _upsert_snapshot(db, row, computed_at):
                    tf_ok += 1
                    successful_upserts += 1

            if tf_ok == 0:
                errors += 1
            elif tf_ok < len(CRON_TIMEFRAMES):
                pass

            manual = db.get(CoverageManualStock, sid)
            if manual and tf_ok > 0:
                manual.last_run_at = computed_at

            db.commit()

        if successful_upserts > 0:
            for idx in db.scalars(select(CoverageIndex)).all():
                idx.last_run_at = computed_at

        run.error_count = errors
        run.finished_at = datetime.now(timezone.utc)
        run.status = (
            "succeeded"
            if run.symbol_count == 0 or errors < run.symbol_count
            else "failed"
        )
        db.commit()
        db.refresh(run)
        return run
    except Exception:
        run.status = "failed"
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(run)
        raise
    finally:
        db.close()
