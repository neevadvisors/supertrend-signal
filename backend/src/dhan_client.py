"""Dhan HQ auth and intraday historical OHLC helpers."""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Callable, Literal, TypeVar

import httpx
import pandas as pd
from dotenv import load_dotenv
from dhanhq import DhanContext, dhanhq
from zoneinfo import ZoneInfo

from pathlib import Path

from src.token_manager import get_valid_access_token

PROJECT_ROOT = Path(__file__).resolve().parent.parent

Timeframe = Literal["15m", "1h", "4h", "1d"]

TIMEFRAMES: dict[Timeframe, int | Literal["special", "daily"]] = {
    "15m": 15,
    "1h": 60,
    "4h": "special",
    "1d": "daily",
}

CRON_LOOKBACK_DAYS = 180
DHAN_API_BASE = "https://api.dhan.co/v2"

DHAN_INTRADAY_MAX_DAYS = 90
HISTORICAL_CHUNK_DELAY_S = 0.4
RATE_LIMIT_MAX_RETRIES = 5
RATE_LIMIT_INITIAL_BACKOFF_S = 1.5
_HISTORICAL_LOCK = threading.Lock()
IST = ZoneInfo("Asia/Kolkata")

T = TypeVar("T")
NSE_SESSION_OPEN_MINUTES = 9 * 60 + 15
NSE_MORNING_BLOCK_END_MINUTES = 13 * 60 + 15
NSE_SESSION_CLOSE_MINUTES = 15 * 60 + 30


def default_lookback_for_timeframe(timeframe: Timeframe) -> int:
    """Default calendar lookback per timeframe."""
    return {"15m": 30, "1h": 90, "4h": 365, "1d": CRON_LOOKBACK_DAYS}[timeframe]


def load_credentials() -> tuple[str, str]:
    # Prefer backend/.env; parent repo .env fills any missing keys.
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT.parent / ".env")
    client_id = os.getenv("DHAN_CLIENT_ID", "").strip()
    if not client_id:
        raise RuntimeError(
            "Missing DHAN_CLIENT_ID. Copy .env.example to .env and fill in your credentials."
        )
    access_token = get_valid_access_token()
    return client_id, access_token


def get_dhan_client() -> dhanhq:
    client_id, access_token = load_credentials()
    return dhanhq(DhanContext(client_id, access_token))


def _dhan_headers() -> tuple[str, str, str]:
    client_id, access_token = load_credentials()
    return client_id, access_token, access_token


def _auth_headers() -> dict[str, str]:
    client_id, access_token, _ = _dhan_headers()
    return {
        "access-token": access_token,
        "client-id": client_id,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


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


def _is_dhan_rate_limit(text: Any) -> bool:
    s = str(text)
    return (
        "DH-904" in s
        or "Rate_Limit" in s
        or "Too many requests" in s
    )


def _raise_on_dhan_failure(response: dict[str, Any]) -> None:
    status = response.get("status")
    if status and str(status).lower() in ("failure", "error", "failed"):
        remarks = response.get("remarks") or response.get("message") or response
        raise RuntimeError(f"Dhan historical data error: {remarks}")


def _retry_historical(fetch: Callable[[], T]) -> T:
    """Serialize historical calls and retry on Dhan DH-904 rate limits."""
    last: Exception | None = None
    for attempt in range(RATE_LIMIT_MAX_RETRIES):
        with _HISTORICAL_LOCK:
            try:
                result = fetch()
                time.sleep(HISTORICAL_CHUNK_DELAY_S)
                return result
            except Exception as exc:
                last = exc
                if _is_dhan_rate_limit(exc) and attempt < RATE_LIMIT_MAX_RETRIES - 1:
                    time.sleep(RATE_LIMIT_INITIAL_BACKOFF_S * (2**attempt))
                    continue
                raise
    if last is not None:
        raise last
    raise RuntimeError("Dhan historical fetch failed")


def _fetch_intraday_interval(
    dhan: dhanhq,
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    interval: int,
    from_date: str,
    to_date: str,
) -> pd.DataFrame:
    def _call() -> pd.DataFrame:
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

    return _retry_historical(_call)


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


def _fetch_daily_historical(
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    lookback_days: int,
    client: dhanhq | None = None,
) -> pd.DataFrame:
    """Fetch daily OHLC via SDK or REST fallback."""
    dhan = client or get_dhan_client()
    end = datetime.now()
    start = end - timedelta(days=lookback_days)
    from_date = start.strftime("%Y-%m-%d")
    to_date = end.strftime("%Y-%m-%d")

    def _call() -> pd.DataFrame:
        if hasattr(dhan, "historical_daily_data"):
            response = dhan.historical_daily_data(
                security_id=str(security_id),
                exchange_segment=exchange_segment,
                instrument_type=instrument_type,
                from_date=from_date,
                to_date=to_date,
                expiry_code=0,
            )
            if isinstance(response, dict):
                _raise_on_dhan_failure(response)
                return _arrays_to_dataframe(response)
            raise RuntimeError(f"Unexpected daily response type: {type(response)}")

        payload = {
            "securityId": str(security_id),
            "exchangeSegment": exchange_segment,
            "instrument": instrument_type,
            "expiryCode": 0,
            "fromDate": from_date,
            "toDate": to_date,
        }
        with httpx.Client(timeout=60.0) as http:
            res = http.post(
                f"{DHAN_API_BASE}/charts/historical",
                headers=_auth_headers(),
                json=payload,
            )
            res.raise_for_status()
            body = res.json()
        _raise_on_dhan_failure(body)
        return _arrays_to_dataframe(body)

    return _retry_historical(_call)


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
    if spec == "daily":
        return _fetch_daily_historical(
            security_id,
            exchange_segment,
            instrument_type,
            lookback_days,
            client=client,
        )
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


class QuoteInstrument:
    def __init__(
        self,
        security_id: str,
        exchange_segment: str = "NSE_EQ",
    ) -> None:
        self.security_id = security_id
        self.exchange_segment = exchange_segment


def fetch_market_ohlc(
    instruments: list[QuoteInstrument],
) -> dict[str, dict[str, float | None]]:
    """
    Batch LTP + prior close from Dhan marketfeed OHLC.

    Returns security_id -> {ltp, prev_close, change_pct}.
    """
    if not instruments:
        return {}

    grouped: dict[str, list[int]] = {}
    for inst in instruments:
        try:
            sid = int(inst.security_id)
        except ValueError:
            continue
        grouped.setdefault(inst.exchange_segment, []).append(sid)

    out: dict[str, dict[str, float | None]] = {}
    headers = _auth_headers()

    with httpx.Client(timeout=30.0) as http:
        for segment, ids in grouped.items():
            unique_ids = list(dict.fromkeys(ids))
            for offset in range(0, len(unique_ids), 1000):
                chunk = unique_ids[offset : offset + 1000]
                body = {segment: chunk}
                res = http.post(
                    f"{DHAN_API_BASE}/marketfeed/ohlc",
                    headers=headers,
                    json=body,
                )
                res.raise_for_status()
                payload = res.json()
                data = payload.get("data", payload)
                segment_data = data.get(segment, {}) if isinstance(data, dict) else {}
                for sid_key, row in segment_data.items():
                    if not isinstance(row, dict):
                        continue
                    ltp = row.get("last_price")
                    ohlc = row.get("ohlc") if isinstance(row.get("ohlc"), dict) else {}
                    prev = ohlc.get("close") if ohlc else None
                    ltp_f = float(ltp) if ltp is not None else None
                    prev_f = float(prev) if prev is not None else None
                    change_pct = None
                    if ltp_f is not None and prev_f and prev_f != 0:
                        change_pct = (ltp_f - prev_f) / prev_f * 100.0
                    out[str(sid_key)] = {
                        "ltp": ltp_f,
                        "prev_close": prev_f,
                        "change_pct": change_pct,
                    }
                time.sleep(1.05)

    return out
