"""NEEV (AI Renko) Supertrend — port of Pine Script indicator logic."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from src.dhan_client import Timeframe
from src.indicators import adx, atr

IST = ZoneInfo("Asia/Kolkata")
MIN_BARS = 100

TimeframeMinutes = {"15m": 15, "1h": 60, "4h": 240, "1d": 1440}

TARGET_RR = 2.5
NONE_NOTE = "Price inside range. No trigger on this timeframe."


@dataclass
class NeevParams:
    atr_len: int = 14
    base_factor: float = 3.0
    auto_box: bool = True
    manual_box: float = 10.0
    vol_filter: bool = False
    adx_thresh: int = 15


def _nz(value: float | None, replacement: float = 0.0) -> float:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return replacement
    return float(value)


def drop_forming_candle(
    ohlc: pd.DataFrame,
    timeframe: Timeframe,
) -> pd.DataFrame:
    """Drop the last bar if its interval has not finished (IST)."""
    if ohlc is None or ohlc.empty:
        return ohlc

    df = ohlc.copy()
    last_ts = df.iloc[-1]["timestamp"]
    if pd.isna(last_ts):
        return df

    now_ist = datetime.now(tz=IST)
    ts = pd.Timestamp(last_ts)
    if ts.tzinfo is None:
        ts = ts.tz_localize(IST)
    else:
        ts = ts.tz_convert(IST)

    if timeframe == "1d":
        bar_end = ts.normalize() + timedelta(days=1)
    elif timeframe == "4h":
        minutes = ts.hour * 60 + ts.minute
        day = ts.normalize()
        if minutes >= 13 * 60 + 15:
            bar_end = day + timedelta(hours=15, minutes=30)
        else:
            bar_end = day + timedelta(hours=13, minutes=15)
    else:
        delta = timedelta(minutes=TimeframeMinutes[timeframe])
        bar_end = ts + delta

    if now_ist < bar_end:
        return df.iloc[:-1].reset_index(drop=True)
    return df.reset_index(drop=True)


def compute_neev_supertrend(
    ohlc: pd.DataFrame,
    params: NeevParams | None = None,
) -> pd.DataFrame:
    """Bar-by-bar NEEV Renko supertrend aligned with the Pine script."""
    params = params or NeevParams()
    empty_cols = [
        "timestamp",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "st",
        "trend",
        "buy",
        "sell",
        "regime",
        "rc",
    ]
    if ohlc is None or ohlc.empty:
        return pd.DataFrame(columns=empty_cols)

    df = ohlc.dropna(subset=["close"]).reset_index(drop=True)
    n = len(df)
    if n == 0:
        return pd.DataFrame(columns=empty_cols)

    atr_len = params.atr_len
    atr_fast_s = atr(df, atr_len)
    atr_slow_s = atr(df, atr_len * 3)
    atr_short_s = atr(df, max(atr_len - 4, 5))
    atr_long_s = atr(df, min(atr_len + 4, 40))
    adx_s = adx(df, 14, 14)

    close = df["close"].to_numpy(dtype=float)
    st_out = np.full(n, np.nan)
    trend_out = np.full(n, np.nan)
    buy_out = np.zeros(n, dtype=bool)
    sell_out = np.zeros(n, dtype=bool)
    regime_out = np.empty(n, dtype=object)
    rc_out = np.full(n, np.nan)

    rc = math.nan
    ro = math.nan
    rh = math.nan
    rl = math.nan
    fu = math.nan
    fl = math.nan
    fu_prev = math.nan
    fl_prev = math.nan
    st_prev = math.nan

    rhl_history: list[float] = []
    rma_rhl = math.nan

    for i in range(n):
        c = close[i]
        atr_fast = atr_fast_s.iat[i]
        atr_slow = atr_slow_s.iat[i]
        atr_short = atr_short_s.iat[i]
        atr_long = atr_long_s.iat[i]

        if (
            math.isnan(atr_fast)
            or math.isnan(atr_slow)
            or atr_slow == 0
            or math.isnan(c)
        ):
            regime_out[i] = "normal"
            continue

        vol_ratio = atr_fast / atr_slow
        high_vol = vol_ratio > 1.2
        low_vol = vol_ratio < 0.8
        if high_vol:
            adapt_atr = _nz(atr_short, atr_fast)
            adapt_factor = params.base_factor + 1.0
            brick_mult = 1.5
            regime_out[i] = "high"
        elif low_vol:
            adapt_atr = _nz(atr_long, atr_fast)
            adapt_factor = max(params.base_factor - 0.5, 1.5)
            brick_mult = 0.7
            regime_out[i] = "low"
        else:
            adapt_atr = atr_fast
            adapt_factor = params.base_factor
            brick_mult = 1.0
            regime_out[i] = "normal"

        brick = adapt_atr * brick_mult if params.auto_box else params.manual_box
        if brick <= 0 or math.isnan(brick):
            continue

        if math.isnan(rc):
            rc = c
            ro = c
            rh = c
            rl = c
        elif c >= rc + brick:
            num = math.floor((c - rc) / brick)
            ro = rc
            rc = rc + num * brick
            rh = rc
            rl = ro
        elif c <= rc - brick:
            num = math.floor((rc - c) / brick)
            ro = rc
            rc = rc - num * brick
            rh = ro
            rl = rc

        rc_out[i] = rc
        rhl = (rh - rl) if not (math.isnan(rh) or math.isnan(rl)) else brick
        if math.isnan(rhl):
            rhl = brick

        rhl_history.append(rhl)
        if len(rhl_history) >= atr_len:
            window = rhl_history[-atr_len:]
            if math.isnan(rma_rhl):
                rma_rhl = float(np.mean(window))
            else:
                rma_rhl = rma_rhl + (rhl - rma_rhl) / atr_len
        r_atr = rma_rhl if not math.isnan(rma_rhl) else brick

        pivot = (_nz(rh, rc) + _nz(rl, rc)) / 2.0
        upper_band = pivot + adapt_factor * r_atr
        lower_band = pivot - adapt_factor * r_atr

        rc_prev = rc_out[i - 1] if i > 0 else math.nan
        if i == 0 or math.isnan(fu):
            fu = upper_band
            fl = lower_band
        else:
            fu = (
                upper_band
                if upper_band < fu_prev or _nz(rc_prev) > fu_prev
                else fu_prev
            )
            fl = (
                lower_band
                if lower_band > fl_prev or _nz(rc_prev) < fl_prev
                else fl_prev
            )

        if i == 0 or math.isnan(st_prev):
            tr = 1
        elif _nz(st_prev) == _nz(fu_prev):
            tr = 1 if _nz(rc) > fu else -1
        else:
            tr = -1 if _nz(rc) < fl else 1

        st = fl if tr == 1 else fu
        st_out[i] = st
        trend_out[i] = tr

        adx_val = adx_s.iat[i]
        trending = not math.isnan(adx_val) and adx_val > params.adx_thresh
        allow = trending if params.vol_filter else True

        if i > 0 and allow:
            tr_prev_bar = trend_out[i - 1]
            if not math.isnan(tr_prev_bar):
                if tr == 1 and tr_prev_bar == -1:
                    buy_out[i] = True
                if tr == -1 and tr_prev_bar == 1:
                    sell_out[i] = True

        st_prev = st
        fu_prev = fu
        fl_prev = fl

    out = df.copy()
    out["st"] = st_out
    out["trend"] = trend_out
    out["buy"] = buy_out
    out["sell"] = sell_out
    out["regime"] = regime_out
    out["rc"] = rc_out
    return out


def _build_signal_note(
    signal: str,
    trend_label: str | None,
    regime: Any,
    bars_since_flip: int | None,
) -> str:
    if signal in ("HOLD", "NONE"):
        return NONE_NOTE
    parts: list[str] = []
    if trend_label:
        parts.append(f"Trend {trend_label}")
    if regime:
        parts.append(f"Regime {regime}")
    if bars_since_flip is not None and bars_since_flip == 0:
        parts.append("Supertrend flip on this bar")
    elif bars_since_flip is not None:
        parts.append(f"{bars_since_flip} bars since prior flip")
    if not parts:
        parts.append("NEEV Supertrend trigger")
    return "; ".join(parts) + "."


def _derive_trade_levels(
    signal: str,
    entry: float | None,
    stop: float | None,
) -> tuple[float | None, float | None, float | None]:
    if signal not in ("BUY", "SELL") or entry is None or stop is None:
        return None, None, None
    risk = abs(entry - stop)
    if risk == 0:
        return entry, None, stop
    if signal == "BUY":
        target = entry + TARGET_RR * risk
    else:
        target = entry - TARGET_RR * risk
    return entry, target, stop


def signal_snapshot_from_latest(
    raw: dict[str, Any],
    *,
    timeframe: Timeframe,
) -> dict[str, Any]:
    """Map latest_signal output to persisted snapshot fields."""
    signal = raw.get("signal") or "HOLD"
    side = "NONE"
    if signal == "BUY":
        side = "BUY"
    elif signal == "SELL":
        side = "SELL"

    entry_val, target_val, stop_val = _derive_trade_levels(
        side if side != "NONE" else "HOLD",
        raw.get("close"),
        raw.get("st_level"),
    )
    note = _build_signal_note(
        signal,
        raw.get("trend"),
        raw.get("regime"),
        raw.get("bars_since_flip"),
    )
    return {
        "timeframe": timeframe,
        "side": side,
        "entry": entry_val,
        "target": target_val,
        "stop": stop_val,
        "note": note,
    }


def _bars_since_flip(trend: pd.Series) -> int | None:
    if trend is None or len(trend) < 2:
        return None
    vals = trend.dropna()
    if len(vals) < 2:
        return None
    curr = vals.iloc[-1]
    count = 0
    for j in range(len(vals) - 2, -1, -1):
        if vals.iloc[j] != curr:
            return count
        count += 1
    return count


def latest_signal(
    ohlc: pd.DataFrame,
    params: NeevParams | None = None,
    timeframe: Timeframe = "15m",
) -> dict[str, Any]:
    """
    Latest confirmed-bar NEEV supertrend summary.

    Returns signal, trend, bars_since_flip, st_level, regime, close, bar_time, frame, note.
    """
    params = params or NeevParams()
    base_empty: dict[str, Any] = {
        "signal": "HOLD",
        "trend": None,
        "bars_since_flip": None,
        "st_level": None,
        "regime": None,
        "close": None,
        "bar_time": None,
        "frame": pd.DataFrame(),
        "note": None,
    }

    if ohlc is None or ohlc.empty:
        base_empty["note"] = "No OHLC data"
        return base_empty

    trimmed = drop_forming_candle(ohlc, timeframe)
    if len(trimmed) < MIN_BARS:
        last = trimmed.iloc[-1] if len(trimmed) else None
        base_empty.update(
            {
                "close": float(last["close"]) if last is not None else None,
                "bar_time": _format_bar_time(last["timestamp"] if last is not None else None),
                "note": f"Need at least {MIN_BARS} bars (have {len(trimmed)})",
            }
        )
        return base_empty

    frame = compute_neev_supertrend(trimmed, params)
    curr = frame.iloc[-1]
    prev = frame.iloc[-2]

    tr_curr = curr.get("trend")
    tr_prev = prev.get("trend")
    signal = "HOLD"
    if curr.get("buy"):
        signal = "BUY"
    elif curr.get("sell"):
        signal = "SELL"

    trend_label: Literal["BULL", "BEAR"] | None = None
    if tr_curr == 1 or tr_curr == 1.0:
        trend_label = "BULL"
    elif tr_curr == -1 or tr_curr == -1.0:
        trend_label = "BEAR"

    return {
        "signal": signal,
        "trend": trend_label,
        "bars_since_flip": _bars_since_flip(frame["trend"]),
        "st_level": round(float(curr["st"]), 4) if pd.notna(curr.get("st")) else None,
        "regime": curr.get("regime"),
        "close": round(float(curr["close"]), 4),
        "bar_time": _format_bar_time(curr.get("timestamp")),
        "frame": frame,
        "note": None,
    }


def _format_bar_time(bar_time: Any) -> str | None:
    if bar_time is None or (isinstance(bar_time, float) and pd.isna(bar_time)):
        return None
    if hasattr(bar_time, "isoformat"):
        return bar_time.isoformat(sep=" ", timespec="minutes")
    return str(bar_time)
