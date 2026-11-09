"""Market data provider registry — route IN → Dhan, US → Alpaca."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

import pandas as pd

from src.dhan_client import (
    QuoteInstrument,
    Timeframe,
    default_lookback_for_timeframe,
    fetch_candles as dhan_fetch_candles,
    fetch_market_ohlc as dhan_fetch_market_ohlc,
)

MarketLiteral = str


@runtime_checkable
class MarketDataProvider(Protocol):
    def search_instruments(self, query: str, *, limit: int = 50) -> list[dict[str, Any]]: ...

    def fetch_candles(
        self,
        security_id: str,
        exchange_segment: str,
        instrument_type: str = "EQUITY",
        timeframe: Timeframe = "15m",
        lookback_days: int | None = None,
    ) -> pd.DataFrame: ...

    def fetch_market_ohlc(
        self,
        instruments: list[QuoteInstrument],
    ) -> dict[str, dict[str, float | None]]: ...


class DhanProvider:
    """India (NSE) — delegates to existing ``dhan_client`` helpers."""

    def search_instruments(self, query: str, *, limit: int = 50) -> list[dict[str, Any]]:
        from src.instruments import search_nse_equity_instruments

        return search_nse_equity_instruments(query, limit=limit)

    def fetch_candles(
        self,
        security_id: str,
        exchange_segment: str,
        instrument_type: str = "EQUITY",
        timeframe: Timeframe = "15m",
        lookback_days: int | None = None,
        client: Any | None = None,
    ) -> pd.DataFrame:
        if lookback_days is None:
            lookback_days = default_lookback_for_timeframe(timeframe)
        return dhan_fetch_candles(
            security_id,
            exchange_segment=exchange_segment,
            instrument_type=instrument_type,
            timeframe=timeframe,
            lookback_days=lookback_days,
            client=client,
        )

    def fetch_market_ohlc(
        self,
        instruments: list[QuoteInstrument],
    ) -> dict[str, dict[str, float | None]]:
        return dhan_fetch_market_ohlc(instruments)


_dhan_singleton: DhanProvider | None = None
_alpaca_singleton: Any | None = None


def _normalize_market(market: str | None) -> str:
    m = (market or "IN").strip().upper()
    if m in ("IN", "INDIA", "NSE"):
        return "IN"
    if m in ("US", "USA", "NYSE"):
        return "US"
    return m


def provider_for(market: str | None = "IN") -> MarketDataProvider:
    """
    Return the market data provider for ``market``.

    - ``IN`` (default): Dhan / NSE — always available when Dhan credentials are set.
    - ``US``: Alpaca — requires ``US_MARKET_ENABLED`` and Alpaca API keys; raises
      ``RuntimeError`` only when this provider is requested, not at import time.
    """
    normalized = _normalize_market(market)

    if normalized == "IN":
        global _dhan_singleton
        if _dhan_singleton is None:
            _dhan_singleton = DhanProvider()
        return _dhan_singleton

    if normalized == "US":
        from src.alpaca_client import AlpacaProvider, us_market_enabled

        if not us_market_enabled():
            raise RuntimeError(
                "US market data is disabled. Set US_MARKET_ENABLED=true to enable Alpaca."
            )
        global _alpaca_singleton
        if _alpaca_singleton is None:
            _alpaca_singleton = AlpacaProvider()
        return _alpaca_singleton

    raise ValueError(f"Unknown market: {market!r} (expected IN or US)")
