"""US equity RTH session helpers (NYSE via exchange_calendars)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd

ET = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")

US_SESSION_OPEN_MINUTES = 9 * 60 + 30
US_MORNING_BLOCK_END_MINUTES = 13 * 60 + 30
US_SESSION_CLOSE_MINUTES = 16 * 60
US_HALF_DAY_CLOSE_MINUTES = 13 * 60


@lru_cache(maxsize=1)
def _nyse() -> Any:
    import exchange_calendars as xcals

    return xcals.get_calendar("XNYS")


def is_trading_day(day: date) -> bool:
    return bool(_nyse().is_session(day))


def session_close_et(day: date) -> datetime | None:
    """RTH close in America/New_York for an NYSE session day, else None."""
    if not is_trading_day(day):
        return None
    schedule = _nyse().schedule.loc[day:day]
    if schedule.empty:
        return None
    close_utc = schedule.iloc[0]["close"]
    if isinstance(close_utc, pd.Timestamp):
        close_utc = close_utc.to_pydatetime()
    if close_utc.tzinfo is None:
        close_utc = close_utc.replace(tzinfo=UTC)
    return close_utc.astimezone(ET)


def is_half_session_day(day: date) -> bool:
    """True when the official RTH close is 13:00 ET (early close)."""
    close_et = session_close_et(day)
    if close_et is None:
        return False
    minutes = close_et.hour * 60 + close_et.minute
    return minutes <= US_HALF_DAY_CLOSE_MINUTES


def is_us_rth_session(now: datetime | None = None) -> bool:
    """True during NYSE regular cash session (Mon–Fri, not on holidays)."""
    current = now or datetime.now(tz=ET)
    if not is_trading_day(current.date()):
        return False
    minutes = current.hour * 60 + current.minute
    close_minutes = US_HALF_DAY_CLOSE_MINUTES if is_half_session_day(current.date()) else US_SESSION_CLOSE_MINUTES
    return US_SESSION_OPEN_MINUTES <= minutes < close_minutes


# Alias for coverage / quote gating (prefer live snapshot change during RTH).
_is_us_rth = is_us_rth_session


def us_change_reference_date(now: datetime | None = None) -> date:
    """ET session calendar date for day-change % (last NYSE session on holidays/weekends)."""
    current = now or datetime.now(tz=ET)
    day = current.date()
    while not is_trading_day(day):
        day = day - timedelta(days=1)
    return day


def us_4h_bar_end(ts: pd.Timestamp) -> pd.Timestamp:
    """End instant (ET, tz-aware) for the US 4h block that starts at ``ts``."""
    if ts.tzinfo is None:
        ts = ts.tz_localize(ET)
    else:
        ts = ts.tz_convert(ET)

    day = ts.date()
    day_start = datetime.combine(day, datetime.min.time(), tzinfo=ET)

    if is_half_session_day(day):
        return day_start + timedelta(hours=13)

    minutes = ts.hour * 60 + ts.minute
    if minutes >= US_MORNING_BLOCK_END_MINUTES:
        return day_start + timedelta(hours=16)
    return day_start + timedelta(hours=13, minutes=30)


def resample_60m_to_us_session_4h(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate 60m candles into US RTH blocks (09:30–13:30 and 13:30–16:00 ET;
    half-days → single 09:30–13:00 block).
    """
    empty = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    if df.empty:
        return empty

    ts = df["timestamp"]
    if ts.dt.tz is None:
        ts_et = ts.dt.tz_localize(UTC, ambiguous="infer").dt.tz_convert(ET)
    else:
        ts_et = ts.dt.tz_convert(ET)

    minutes = ts_et.dt.hour * 60 + ts_et.dt.minute
    bar_dates = ts_et.dt.date
    half_mask = bar_dates.map(is_half_session_day)
    close_limit = half_mask.map(
        lambda half: US_HALF_DAY_CLOSE_MINUTES if half else US_SESSION_CLOSE_MINUTES
    )

    in_session = (minutes >= US_SESSION_OPEN_MINUTES) & (minutes < close_limit)
    work = df.loc[in_session].copy()
    if work.empty:
        return empty

    ts_et = ts_et.loc[in_session]
    minutes = minutes.loc[in_session]
    half = half_mask.loc[in_session]
    day_start = ts_et.dt.normalize()

    is_afternoon = (~half) & (minutes >= US_MORNING_BLOCK_END_MINUTES)
    block_start = day_start + pd.to_timedelta(
        is_afternoon.map({True: "13h30m", False: "9h30m"})
    )
    # Half-days: single 09:30–13:00 block.
    block_start = block_start.where(~half, day_start + pd.to_timedelta("9h30m"))

    work["_block"] = block_start

    agg = (
        work.groupby("_block", sort=True)
        .agg(
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            volume=("volume", "sum"),
        )
        .reset_index()
        .rename(columns={"_block": "timestamp"})
    )
    agg["timestamp"] = pd.to_datetime(agg["timestamp"], utc=True)
    return agg.sort_values("timestamp").reset_index(drop=True)
