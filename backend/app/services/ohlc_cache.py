"""In-memory TTL cache for OHLC DataFrames."""

from __future__ import annotations

import time

import pandas as pd

from src.dhan_client import Timeframe

DEFAULT_TTL_SECONDS = 15 * 60


class OhlcCache:
    """Thread-unsafe in-memory cache keyed by security_id|timeframe|lookback."""

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
        self.ttl_seconds = ttl_seconds
        self._store: dict[str, tuple[float, pd.DataFrame]] = {}

    @staticmethod
    def make_key(security_id: str, timeframe: Timeframe | str, lookback: int) -> str:
        return f"{security_id}|{timeframe}|{lookback}"

    def get(self, key: str) -> pd.DataFrame | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, df = entry
        if time.monotonic() - ts > self.ttl_seconds:
            del self._store[key]
            return None
        return df

    def set(self, key: str, df: pd.DataFrame) -> None:
        self._store[key] = (time.monotonic(), df)

    def clear(self) -> None:
        self._store.clear()


ohlc_cache = OhlcCache()
