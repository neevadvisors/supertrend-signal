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
    default_lookback_for_timeframe,
    prev_close_from_daily_df,
)
from src.market_data import provider_for
from src.prev_close_store import prev_close_from_daily_df_us, set_prev_close
from src.signals import NeevParams, latest_signal, signal_snapshot_from_latest
from src.us_session import is_us_rth_session

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
    prov = provider_for(sec.market)
    snapshots: list[dict] = []

    for tf in CRON_TIMEFRAMES:
        try:
            ohlc = prov.fetch_candles(
                sec.security_id,
                exchange_segment=sec.exchange_segment,
                instrument_type=sec.instrument_type,
                timeframe=tf,
                lookback_days=default_lookback_for_timeframe(tf),
            )
            if tf == "1d":
                if sec.market == "US":
                    # During US RTH, live quotes (Alpaca snapshot) are authoritative for
                    # change %; this cache backs after-hours / cron paths (`is_us_rth_session`).
                    prev = prev_close_from_daily_df_us(ohlc)
                else:
                    prev = prev_close_from_daily_df(ohlc)
                if prev is not None:
                    set_prev_close(sec.market, sec.security_id, prev)
            raw = latest_signal(ohlc, params, timeframe=tf, market=sec.market)
            mapped = signal_snapshot_from_latest(raw, timeframe=tf)
            snapshots.append(
                {
                    "market": sec.market,
                    "currency": sec.currency,
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
                    "market": sec.market,
                    "currency": sec.currency,
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
    pk = (row["market"], row["security_id"], row["timeframe"])
    existing = db.get(SignalSnapshot, pk)

    if row.get("failed"):
        err = row.get("error")
        if existing is None:
            db.add(
                SignalSnapshot(
                    market=row["market"],
                    currency=row["currency"],
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
                market=row["market"],
                currency=row["currency"],
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
    market: str = "IN",
    security_ids: list[str] | None = None,
    security_keys: list[tuple[str, str]] | None = None,
    skip_us_outside_rth: bool = False,
) -> SignalRun | None:
    """
    Run signal computation for one market (IN or US).

    skip_us_outside_rth: when True and market is US, return None without
    writing a run row if NYSE is not in regular hours (for UTC-aligned crons).
    """
    market = market.upper()
    if skip_us_outside_rth and market == "US" and not is_us_rth_session():
        return None

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
        if security_keys:
            allowed_keys = set(security_keys)
            universe = [
                s
                for s in universe
                if (s.market, s.security_id) in allowed_keys
            ]
        elif security_ids:
            allowed = set(security_ids)
            universe = [s for s in universe if s.security_id in allowed]
        else:
            universe = [s for s in universe if s.market == market]

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

            manual = db.get(CoverageManualStock, (sec.market, sid))
            if manual and tf_ok > 0:
                manual.last_run_at = computed_at

            db.commit()

        if successful_upserts > 0:
            processed_markets = {sec.market for sec in universe}
            for idx in db.scalars(select(CoverageIndex)).all():
                if idx.market in processed_markets:
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
