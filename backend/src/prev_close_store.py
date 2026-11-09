"""DB-backed previous-close cache keyed by (market, security_id, session_date)."""

from __future__ import annotations

import threading
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pandas as pd
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from app.db.models import PrevClose
from app.db.session import SessionLocal

IST = ZoneInfo("Asia/Kolkata")

_MEM: dict[tuple[str, str, str], float] = {}
_MEM_LOCK = threading.Lock()


def _mem_key(market: str, security_id: str, session_date: date) -> tuple[str, str, str]:
    return (market.upper(), str(security_id), session_date.isoformat())


def in_change_reference_date(now: datetime | None = None) -> date:
    """IST calendar date that day-change % is measured against (Fri on weekends)."""
    current = now or datetime.now(IST)
    while current.weekday() >= 5:
        current = current - timedelta(days=1)
    return current.date()


def change_reference_date(market: str, now: datetime | None = None) -> date:
    """Market-local session date used for prev-close cache keys."""
    if market.upper() == "US":
        from src.us_session import us_change_reference_date

        return us_change_reference_date(now)
    return in_change_reference_date(now)


def get_prev_close(market: str, security_id: str) -> float | None:
    """Previous session close for the current change-reference day, if cached."""
    m = market.upper()
    ref = change_reference_date(m)
    key = _mem_key(m, security_id, ref)
    with _MEM_LOCK:
        hit = _MEM.get(key)
    if hit is not None:
        return hit

    db = SessionLocal()
    try:
        row = db.get(PrevClose, (m, str(security_id), ref))
        if row is None:
            return None
        val = float(row.prev_close)
        with _MEM_LOCK:
            _MEM[key] = val
        return val
    finally:
        db.close()


def set_prev_close(
    market: str,
    security_id: str,
    prev_close: float,
    *,
    session_date: date | None = None,
) -> None:
    """Remember previous session close for the given market-local session date."""
    if prev_close == 0:
        return
    m = market.upper()
    ref = session_date or change_reference_date(m)
    val = float(prev_close)
    key = _mem_key(m, security_id, ref)

    with _MEM_LOCK:
        _MEM[key] = val

    db = SessionLocal()
    try:
        stmt = insert(PrevClose).values(
            market=m,
            security_id=str(security_id),
            session_date=ref,
            prev_close=Decimal(str(val)),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["market", "security_id", "session_date"],
            set_={
                "prev_close": stmt.excluded.prev_close,
                "updated_at": func.now(),
            },
        )
        db.execute(stmt)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def prev_close_from_daily_df_us(
    df: pd.DataFrame,
    today: date | None = None,
) -> float | None:
    """Prior session close: last daily bar strictly before today's US reference date (ET)."""
    from src.us_session import ET

    if df is None or df.empty or "close" not in df.columns or "timestamp" not in df.columns:
        return None
    today = today or change_reference_date("US")
    ts = pd.to_datetime(df["timestamp"])
    if ts.dt.tz is None:
        ts = ts.dt.tz_localize(ZoneInfo("UTC"), ambiguous="infer").dt.tz_convert(ET)
    else:
        ts = ts.dt.tz_convert(ET)
    bar_dates = ts.dt.date
    work = df.loc[(bar_dates < today) & (df["close"] != 0)]
    if work.empty:
        return None
    return float(work["close"].iloc[-1])
