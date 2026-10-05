"""Batch signal computation using domain modules."""

from __future__ import annotations

from typing import Any

import math

import pandas as pd

from app.models.schemas import (
    FrameBar,
    SecurityInput,
    SignalResult,
    SignalsRequest,
    SignalsResponse,
)
from app.services.ohlc_cache import ohlc_cache
from src.dhan_client import fetch_candles, get_dhan_client
from src.signals import latest_signal


def _json_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _timestamp_iso(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    ts = pd.Timestamp(value)
    if pd.isna(ts):
        return None
    return ts.isoformat()


def serialize_frame(frame: pd.DataFrame, show_bars: int) -> list[FrameBar]:
    """Serialize last ``show_bars`` rows; NaN→null; buy/sell as bool."""
    if frame is None or frame.empty:
        return []

    subset = frame.tail(show_bars)
    bars: list[FrameBar] = []
    for _, row in subset.iterrows():
        bars.append(
            FrameBar(
                timestamp=_timestamp_iso(row.get("timestamp")),
                open=_json_float(row.get("open")),
                high=_json_float(row.get("high")),
                low=_json_float(row.get("low")),
                close=_json_float(row.get("close")),
                volume=_json_float(row.get("volume")),
                st=_json_float(row.get("st")),
                trend=_json_float(row.get("trend")),
                buy=bool(row.get("buy", False)),
                sell=bool(row.get("sell", False)),
            )
        )
    return bars


def _error_result(sec: SecurityInput, error: str) -> SignalResult:
    return SignalResult(
        symbol=sec.symbol,
        name=sec.display_name,
        signal="—",
        trend=None,
        bars_since_flip=None,
        close=None,
        st_level=None,
        regime=None,
        bar_time=None,
        error=error,
        frame=None,
    )


def compute_signals(request: SignalsRequest) -> SignalsResponse:
    """Fetch OHLC (with cache) and compute NEEV signals for each security."""
    params = request.params.to_neev_params()
    results: list[SignalResult] = []

    try:
        client = get_dhan_client()
    except Exception as exc:
        # Credential / client failure applies to all securities.
        err = str(exc)
        return SignalsResponse(
            results=[_error_result(sec, err) for sec in request.securities]
        )

    for sec in request.securities:
        cache_key = ohlc_cache.make_key(
            sec.security_id, request.timeframe, request.lookback_days
        )
        ohlc: pd.DataFrame | None = None
        if not request.force_refresh:
            ohlc = ohlc_cache.get(cache_key)

        if ohlc is None:
            try:
                ohlc = fetch_candles(
                    security_id=sec.security_id,
                    exchange_segment=sec.exchange_segment,
                    instrument_type=sec.instrument_type,
                    timeframe=request.timeframe,
                    lookback_days=request.lookback_days,
                    client=client,
                )
                ohlc_cache.set(cache_key, ohlc)
            except Exception as exc:
                results.append(_error_result(sec, str(exc)))
                continue

        try:
            sig = latest_signal(ohlc, params, timeframe=request.timeframe)
            err = sig.get("note") if sig.get("note") else None
            frame_out: list[FrameBar] | None = None
            if request.include_frame:
                frame = sig.get("frame", pd.DataFrame())
                frame_out = serialize_frame(frame, request.show_bars)

            results.append(
                SignalResult(
                    symbol=sec.symbol,
                    name=sec.display_name,
                    signal=sig["signal"],
                    trend=sig["trend"],
                    bars_since_flip=sig["bars_since_flip"],
                    close=sig["close"],
                    st_level=sig["st_level"],
                    regime=sig["regime"],
                    bar_time=sig.get("bar_time"),
                    error=err,
                    frame=frame_out,
                )
            )
        except Exception as exc:
            results.append(_error_result(sec, str(exc)))

    return SignalsResponse(results=results)
