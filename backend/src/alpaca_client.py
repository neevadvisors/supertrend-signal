"""Alpaca market data provider (IEX feed, httpx only)."""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
from dotenv import load_dotenv
from zoneinfo import ZoneInfo

from src.dhan_client import QuoteInstrument, Timeframe, default_lookback_for_timeframe
from src.us_session import is_us_rth_session, resample_60m_to_us_session_4h

PROJECT_ROOT = Path(__file__).resolve().parent.parent
UTC = ZoneInfo("UTC")

ALPACA_DATA_BASE = "https://data.alpaca.markets/v2"
ALPACA_TRADING_LIVE_BASE = "https://api.alpaca.markets/v2"
ALPACA_TRADING_PAPER_BASE = "https://paper-api.alpaca.markets/v2"

SNAPSHOT_BATCH_SIZE = 100
RATE_LIMIT_MAX_RETRIES = 5
RATE_LIMIT_INITIAL_BACKOFF_S = 1.5
SNAPSHOT_DELAY_S = 0.35

_ALPACA_LOCK = threading.Lock()
_ASSETS_CACHE: tuple[float, list[dict[str, Any]]] | None = None
_ASSETS_CACHE_TTL_S = 3600.0

_TIMEFRAME_TO_ALPACA: dict[Timeframe, str] = {
    "15m": "15Min",
    "1h": "1Hour",
    "4h": "1Hour",
    "1d": "1Day",
}


def _load_env() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT.parent / ".env")


def us_market_enabled() -> bool:
    _load_env()
    raw = os.getenv("US_MARKET_ENABLED", "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _alpaca_credentials() -> tuple[str, str]:
    _load_env()
    key = os.getenv("ALPACA_API_KEY", "").strip()
    secret = os.getenv("ALPACA_SECRET_KEY", "").strip()
    if not key or not secret:
        raise RuntimeError(
            "US market data requires ALPACA_API_KEY and ALPACA_SECRET_KEY "
            "(set US_MARKET_ENABLED only after keys are configured)."
        )
    return key, secret


def _alpaca_trading_base() -> str:
    """Trading API host (e.g. ``/v2/assets``). Market data stays on data.alpaca.markets."""
    _load_env()
    override = (
        os.getenv("ALPACA_TRADING_BASE", "").strip()
        or os.getenv("ALPACA_API_BASE", "").strip()
    )
    if override:
        return override.rstrip("/")
    key, _ = _alpaca_credentials()
    if key.upper().startswith("PK"):
        return ALPACA_TRADING_PAPER_BASE
    return ALPACA_TRADING_LIVE_BASE


def _headers() -> dict[str, str]:
    key, secret = _alpaca_credentials()
    return {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        "Accept": "application/json",
    }


def _is_rate_limited(status: int, body: str) -> bool:
    return status == 429 or "rate limit" in body.lower()


def _request(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
) -> Any:
    last: Exception | None = None
    for attempt in range(RATE_LIMIT_MAX_RETRIES):
        res = client.request(method, url, headers=_headers(), params=params)
        text = res.text
        if _is_rate_limited(res.status_code, text):
            last = RuntimeError(f"Alpaca rate limited: {text[:200]}")
            if attempt < RATE_LIMIT_MAX_RETRIES - 1:
                time.sleep(RATE_LIMIT_INITIAL_BACKOFF_S * (2**attempt))
                continue
            raise last
        res.raise_for_status()
        return res.json()
    if last is not None:
        raise last
    raise RuntimeError("Alpaca request failed")


def _bars_to_dataframe(bars: list[dict[str, Any]]) -> pd.DataFrame:
    empty = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    if not bars:
        return empty

    rows: list[dict[str, Any]] = []
    for bar in bars:
        ts_raw = bar.get("t")
        if ts_raw is None:
            continue
        ts = pd.to_datetime(ts_raw, utc=True)
        rows.append(
            {
                "timestamp": ts,
                "open": bar.get("o"),
                "high": bar.get("h"),
                "low": bar.get("l"),
                "close": bar.get("c"),
                "volume": bar.get("v"),
            }
        )

    if not rows:
        return empty

    df = pd.DataFrame(rows)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return (
        df.dropna(subset=["close"])
        .sort_values("timestamp")
        .reset_index(drop=True)[["timestamp", "open", "high", "low", "close", "volume"]]
    )


def _fetch_bars_paginated(
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
) -> pd.DataFrame:
    """Walk Alpaca bars pages until ``start`` is covered."""
    frames: list[pd.DataFrame] = []
    page_token: str | None = None
    start_iso = start.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_iso = end.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    with httpx.Client(timeout=60.0) as http:
        while True:
            params: dict[str, Any] = {
                "symbols": symbol,
                "timeframe": timeframe,
                "start": start_iso,
                "end": end_iso,
                "adjustment": "all",
                "feed": "iex",
                "limit": 10000,
            }
            if page_token:
                params["page_token"] = page_token

            with _ALPACA_LOCK:
                payload = _request(
                    http,
                    "GET",
                    f"{ALPACA_DATA_BASE}/stocks/bars",
                    params=params,
                )
                time.sleep(0.2)

            if not isinstance(payload, dict):
                break
            bars_map = payload.get("bars") or {}
            sym_bars = bars_map.get(symbol) or bars_map.get(symbol.upper()) or []
            if sym_bars:
                frames.append(_bars_to_dataframe(sym_bars))

            page_token = payload.get("next_page_token")
            if not page_token:
                break

    if not frames:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    df = pd.concat(frames, ignore_index=True)
    return (
        df.drop_duplicates(subset=["timestamp"], keep="last")
        .sort_values("timestamp")
        .reset_index(drop=True)
    )


def _instrument_from_asset(asset: dict[str, Any]) -> dict[str, Any]:
    symbol = str(asset.get("symbol") or "")
    name = str(asset.get("name") or symbol)
    return {
        "label": symbol,
        "symbol": symbol,
        "security_id": symbol,
        "exchange_segment": "US_EQ",
        "instrument_type": "EQUITY",
        "display_name": name,
        "market": "US",
        "currency": "USD",
    }


def _active_us_equities() -> list[dict[str, Any]]:
    global _ASSETS_CACHE
    now = time.time()
    if _ASSETS_CACHE is not None:
        ts, rows = _ASSETS_CACHE
        if now - ts < _ASSETS_CACHE_TTL_S:
            return rows

    with httpx.Client(timeout=60.0) as http:
        with _ALPACA_LOCK:
            payload = _request(
                http,
                "GET",
                f"{_alpaca_trading_base()}/assets",
                params={
                    "status": "active",
                    "asset_class": "us_equity",
                },
            )
    assets = payload if isinstance(payload, list) else []
    rows = [_instrument_from_asset(a) for a in assets if a.get("tradable")]
    _ASSETS_CACHE = (now, rows)
    return rows


class AlpacaProvider:
    """US equities via Alpaca Market Data (feed=iex)."""

    def search_instruments(self, query: str, *, limit: int = 50) -> list[dict[str, Any]]:
        q = (query or "").strip().upper()
        if not q:
            return []

        universe = _active_us_equities()
        prefix: list[dict[str, Any]] = []
        substring: list[dict[str, Any]] = []
        for row in universe:
            sym = str(row["symbol"]).upper()
            if sym.startswith(q):
                prefix.append(row)
            elif q in sym or q in str(row.get("display_name", "")).upper():
                substring.append(row)

        ranked = prefix + [r for r in substring if r not in prefix]
        return ranked[:limit]

    def fetch_candles(
        self,
        security_id: str,
        exchange_segment: str = "US_EQ",
        instrument_type: str = "EQUITY",
        timeframe: Timeframe = "15m",
        lookback_days: int | None = None,
    ) -> pd.DataFrame:
        del exchange_segment, instrument_type
        symbol = str(security_id).upper()
        if lookback_days is None:
            lookback_days = default_lookback_for_timeframe(timeframe)

        end = datetime.now(tz=UTC)
        start = end - timedelta(days=lookback_days)
        alpaca_tf = _TIMEFRAME_TO_ALPACA[timeframe]

        if timeframe == "4h":
            hourly = _fetch_bars_paginated(symbol, "1Hour", start, end)
            return resample_60m_to_us_session_4h(hourly)

        return _fetch_bars_paginated(symbol, alpaca_tf, start, end)

    def fetch_market_ohlc(
        self,
        instruments: list[QuoteInstrument],
    ) -> dict[str, dict[str, float | None]]:
        if not instruments:
            return {}

        symbols: list[str] = []
        for inst in instruments:
            sym = str(inst.security_id).upper()
            if sym not in symbols:
                symbols.append(sym)

        out: dict[str, dict[str, float | None]] = {
            sym: {"ltp": None, "prev_close": None, "change_pct": None} for sym in symbols
        }

        with httpx.Client(timeout=45.0) as http:
            for offset in range(0, len(symbols), SNAPSHOT_BATCH_SIZE):
                chunk = symbols[offset : offset + SNAPSHOT_BATCH_SIZE]
                params = {"symbols": ",".join(chunk), "feed": "iex"}
                with _ALPACA_LOCK:
                    payload = _request(
                        http,
                        "GET",
                        f"{ALPACA_DATA_BASE}/stocks/snapshots",
                        params=params,
                    )
                    time.sleep(SNAPSHOT_DELAY_S)

                data = payload.get("snapshots") or payload
                if not isinstance(data, dict):
                    continue

                in_session = is_us_rth_session()
                for sym in chunk:
                    snap = data.get(sym) or data.get(sym.upper())
                    if not isinstance(snap, dict):
                        continue

                    trade = snap.get("latestTrade") or {}
                    ltp = trade.get("p")
                    if ltp is None and not in_session:
                        daily = snap.get("dailyBar") or {}
                        ltp = daily.get("c")

                    prev_bar = snap.get("prevDailyBar") or {}
                    prev_close = prev_bar.get("c")
                    ltp_f = float(ltp) if ltp is not None else None
                    prev_f = float(prev_close) if prev_close is not None else None
                    change_pct = None
                    if ltp_f is not None and prev_f is not None and prev_f != 0:
                        change_pct = (ltp_f - prev_f) / prev_f * 100.0

                    out[sym] = {
                        "ltp": ltp_f,
                        "prev_close": prev_f,
                        "change_pct": change_pct,
                    }

        return out
