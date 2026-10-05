"""Dhan HQ auth and intraday historical OHLC helpers."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

import pandas as pd
from dotenv import load_dotenv
from dhanhq import DhanContext, dhanhq

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

Timeframe = Literal["15m", "1h", "4h"]

TIMEFRAMES: dict[Timeframe, int | Literal["special"]] = {
    "15m": 15,
    "1h": 60,
    "4h": "special",
}

DHAN_INTRADAY_MAX_DAYS = 90
IST = ZoneInfo("Asia/Kolkata")
NSE_SESSION_OPEN_MINUTES = 9 * 60 + 15
NSE_MORNING_BLOCK_END_MINUTES = 13 * 60 + 15
NSE_SESSION_CLOSE_MINUTES = 15 * 60 + 30


def default_lookback_for_timeframe(timeframe: Timeframe) -> int:
    """Default calendar lookback per timeframe."""
    return {"15m": 30, "1h": 90, "4h": 365}[timeframe]


def load_credentials() -> tuple[str, str]:
    # Prefer backend/.env; parent repo .env fills any missing keys.
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT.parent / ".env")
    client_id = os.getenv("DHAN_CLIENT_ID", "").strip()
    access_token = os.getenv("DHAN_ACCESS_TOKEN", "").strip()
    if not client_id or not access_token:
        raise RuntimeError(
            "Missing DHAN_CLIENT_ID or DHAN_ACCESS_TOKEN. "
            "Copy .env.example to .env and fill in your credentials."
        )
    return client_id, access_token


def get_dhan_client() -> dhanhq:
    client_id, access_token = load_credentials()
    return dhanhq(DhanContext(client_id, access_token))


def _arrays_to_dataframe(payload: dict[str, Any]) -> pd.DataFrame:
    """Normalize Dhan OHLC response (arrays or list-of-dicts) into a DataFrame."""
    data = payload.get("data", payload)

    if isinstance(data, list):
        if not data:
            return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
        df = pd.DataFrame(data)
    elif isinstance(data, dict):
        # Common shape: {timestamp: [...], open: [...], ...}
        keys = ["timestamp", "open", "high", "low", "close", "volume"]
        if all(k in data for k in ("open", "high", "low", "close")):
            length = len(data.get("close") or data.get("open") or [])
            rows = {}
            for k in keys:
                vals = data.get(k, [])
                if vals is None:
                    vals = []
                if len(vals) < length:
                    vals = list(vals) + [None] * (length - len(vals))
                rows[k] = vals[:length]
            df = pd.DataFrame(rows)
        else:
            df = pd.DataFrame(data)
    else:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    # Column name normalization
    rename = {}
    for col in df.columns:
        lower = str(col).lower()
        if lower in ("timestamp", "time", "datetime", "date"):
            rename[col] = "timestamp"
        elif lower in ("open", "o"):
            rename[col] = "open"
        elif lower in ("high", "h"):
            rename[col] = "high"
        elif lower in ("low", "l"):
            rename[col] = "low"
        elif lower in ("close", "c"):
            rename[col] = "close"
        elif lower in ("volume", "vol", "v"):
            rename[col] = "volume"
    df = df.rename(columns=rename)

    for col in ("open", "high", "low", "close", "volume"):
        if col not in df.columns:
            df[col] = None

    if "timestamp" not in df.columns:
        df["timestamp"] = pd.NaT
    else:
        # Epoch seconds or ms, or ISO strings
        ts = df["timestamp"]
        if pd.api.types.is_numeric_dtype(ts):
            # Heuristic: ms vs s
            sample = ts.dropna()
            unit = "ms" if not sample.empty and sample.iloc[0] > 1e12 else "s"
            df["timestamp"] = pd.to_datetime(ts, unit=unit, errors="coerce")
        else:
            df["timestamp"] = pd.to_datetime(ts, errors="coerce")

    df = df.dropna(subset=["close"]).sort_values("timestamp").reset_index(drop=True)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df[["timestamp", "open", "high", "low", "close", "volume"]]


def _raise_on_dhan_failure(response: dict[str, Any]) -> None:
    status = response.get("status")
    if status and str(status).lower() in ("failure", "error", "failed"):
        remarks = response.get("remarks") or response.get("message") or response
        raise RuntimeError(f"Dhan historical data error: {remarks}")


def _fetch_intraday_interval(
    dhan: dhanhq,
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    interval: int,
    from_date: str,
    to_date: str,
) -> pd.DataFrame:
    response = dhan.intraday_minute_data(
        security_id=str(security_id),
        exchange_segment=exchange_segment,
        instrument_type=instrument_type,
        from_date=from_date,
        to_date=to_date,
        interval=interval,
        oi=False,
    )

    if not isinstance(response, dict):
        raise RuntimeError(f"Unexpected Dhan response type: {type(response)}")

    _raise_on_dhan_failure(response)
    return _arrays_to_dataframe(response)


def _fetch_intraday_chunked(
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    interval: int,
    lookback_days: int,
    client: dhanhq | None = None,
) -> pd.DataFrame:
    """Fetch intraday OHLC in <=90-day windows (Dhan limit), merge and dedupe."""
    dhan = client or get_dhan_client()
    end = datetime.now()
    start = end - timedelta(days=lookback_days)
    frames: list[pd.DataFrame] = []
    chunk_start = start

    while chunk_start < end:
        chunk_end = min(chunk_start + timedelta(days=DHAN_INTRADAY_MAX_DAYS), end)
        frames.append(
            _fetch_intraday_interval(
                dhan,
                security_id,
                exchange_segment,
                instrument_type,
                interval,
                chunk_start.strftime("%Y-%m-%d"),
                chunk_end.strftime("%Y-%m-%d"),
            )
        )
        chunk_start = chunk_end

    if not frames:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    df = pd.concat(frames, ignore_index=True)
    if df.empty:
        return df

    return (
        df.drop_duplicates(subset=["timestamp"], keep="last")
        .sort_values("timestamp")
        .reset_index(drop=True)
    )


def _resample_60m_to_nse_session_4h(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate 60m candles into NSE session blocks (09:15–13:15 and 13:15–15:30 IST).
    Origin for grouping is 09:15 Asia/Kolkata.
    """
    empty = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    if df.empty:
        return empty

    ts = df["timestamp"]
    if ts.dt.tz is None:
        ts_ist = ts.dt.tz_localize(IST, ambiguous="infer")
    else:
        ts_ist = ts.dt.tz_convert(IST)

    minutes = ts_ist.dt.hour * 60 + ts_ist.dt.minute
    in_session = (minutes >= NSE_SESSION_OPEN_MINUTES) & (
        minutes <= NSE_SESSION_CLOSE_MINUTES
    )
    work = df.loc[in_session].copy()
    if work.empty:
        return empty

    ts_ist = ts_ist.loc[in_session]
    is_afternoon = minutes.loc[in_session] >= NSE_MORNING_BLOCK_END_MINUTES
    day_start = ts_ist.dt.normalize()
    block_start = day_start + pd.to_timedelta(
        is_afternoon.map({True: "13h15m", False: "9h15m"})
    )
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
    agg["timestamp"] = pd.to_datetime(agg["timestamp"]).dt.tz_localize(None)
    return agg.sort_values("timestamp").reset_index(drop=True)


def fetch_candles(
    security_id: str,
    exchange_segment: str = "NSE_EQ",
    instrument_type: str = "EQUITY",
    timeframe: Timeframe = "15m",
    lookback_days: int | None = None,
    client: dhanhq | None = None,
) -> pd.DataFrame:
    """Fetch OHLCV for ``timeframe`` over the last ``lookback_days`` calendar days."""
    if lookback_days is None:
        lookback_days = default_lookback_for_timeframe(timeframe)

    spec = TIMEFRAMES[timeframe]
    if spec == "special":
        hourly = _fetch_intraday_chunked(
            security_id,
            exchange_segment,
            instrument_type,
            interval=60,
            lookback_days=lookback_days,
            client=client,
        )
        return _resample_60m_to_nse_session_4h(hourly)

    return _fetch_intraday_chunked(
        security_id,
        exchange_segment,
        instrument_type,
        interval=int(spec),
        lookback_days=lookback_days,
        client=client,
    )


def fetch_intraday_15m(
    security_id: str,
    exchange_segment: str = "NSE_EQ",
    instrument_type: str = "EQUITY",
    lookback_days: int = 30,
    client: dhanhq | None = None,
) -> pd.DataFrame:
    """Fetch 15-minute OHLC for the last `lookback_days` calendar days."""
    return fetch_candles(
        security_id,
        exchange_segment=exchange_segment,
        instrument_type=instrument_type,
        timeframe="15m",
        lookback_days=lookback_days,
        client=client,
    )
