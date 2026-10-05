"""Pine Script v5–style technical indicators (RMA, TR, ATR, ADX)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _nz(value: float) -> float:
    """Pine ``nz``: treat NaN as 0."""
    return 0.0 if np.isnan(value) else value


def rma(series: pd.Series, length: int) -> pd.Series:
    """
    Wilder's RMA (``ta.rma``): SMA of the first ``length`` values, then
    ``prev + (x - prev) / length``.
    """
    if length <= 0:
        raise ValueError("length must be positive")

    values = series.to_numpy(dtype=float, copy=False)
    n = len(values)
    out = np.full(n, np.nan)

    if n < length:
        return pd.Series(out, index=series.index)

    window = values[:length]
    if np.isnan(window).all():
        return pd.Series(out, index=series.index)

    out[length - 1] = float(np.nanmean(window))

    for i in range(length, n):
        prev = out[i - 1]
        x = values[i]
        if np.isnan(x):
            out[i] = np.nan
            continue
        base = _nz(prev) if np.isnan(prev) else prev
        out[i] = base + (x - base) / length

    return pd.Series(out, index=series.index)


def true_range(df: pd.DataFrame) -> pd.Series:
    """
    True range (``ta.tr``): first bar ``high - low``; else
    ``max(h - l, abs(h - prev_close), abs(l - prev_close))``.
    """
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    close = df["close"].to_numpy(dtype=float)
    n = len(high)
    tr = np.full(n, np.nan)

    if n == 0:
        return pd.Series(tr, index=df.index)

    tr[0] = high[0] - low[0]
    prev_close = close[:-1]
    curr_high = high[1:]
    curr_low = low[1:]
    hl = curr_high - curr_low
    tr[1:] = np.maximum(hl, np.maximum(np.abs(curr_high - prev_close), np.abs(curr_low - prev_close)))

    return pd.Series(tr, index=df.index)


def atr(df: pd.DataFrame, length: int) -> pd.Series:
    """Average true range: ``ta.rma(ta.tr, length)``."""
    return rma(true_range(df), length)


def adx(df: pd.DataFrame, di_len: int = 14, adx_len: int = 14) -> pd.Series:
    """
    ADX from ``ta.dmi``: RMA-smoothed +DM/-DM vs RMA(TR), then RMA of DX.
    """
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    n = len(high)

    up = np.full(n, np.nan)
    down = np.full(n, np.nan)
    if n > 1:
        up[1:] = high[1:] - high[:-1]
        down[1:] = low[:-1] - low[1:]

    plus_dm = np.full(n, np.nan)
    minus_dm = np.full(n, np.nan)
    for i in range(n):
        if np.isnan(up[i]):
            continue
        u, d = up[i], down[i]
        plus_dm[i] = u if u > d and u > 0 else 0.0
        minus_dm[i] = d if d > u and d > 0 else 0.0

    tr = true_range(df)
    truerange = rma(tr, di_len)
    plus_rma = rma(pd.Series(plus_dm, index=df.index), di_len)
    minus_rma = rma(pd.Series(minus_dm, index=df.index), di_len)

    tr_vals = truerange.to_numpy(dtype=float)
    plus_di = np.full(n, np.nan)
    minus_di = np.full(n, np.nan)
    for i in range(n):
        tr_v = tr_vals[i]
        if tr_v == 0 or np.isnan(tr_v):
            continue
        if not np.isnan(plus_rma.iat[i]):
            plus_di[i] = 100.0 * plus_rma.iat[i] / tr_v
        if not np.isnan(minus_rma.iat[i]):
            minus_di[i] = 100.0 * minus_rma.iat[i] / tr_v

    plus_di = pd.Series(plus_di, index=df.index).ffill()
    minus_di = pd.Series(minus_di, index=df.index).ffill()

    dx = np.full(n, np.nan)
    for i in range(n):
        p, m = plus_di.iat[i], minus_di.iat[i]
        if np.isnan(p) or np.isnan(m):
            continue
        s = p + m
        dx[i] = abs(p - m) / (s if s != 0 else 1.0)

    adx_series = rma(pd.Series(dx, index=df.index), adx_len) * 100.0
    return adx_series
