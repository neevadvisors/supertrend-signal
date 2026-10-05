"""Pydantic request/response schemas for the Dhan Signals API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from src.signals import NeevParams


TimeframeLiteral = Literal["15m", "1h", "4h"]


class NeevParamsSchema(BaseModel):
    atr_len: int = 14
    base_factor: float = 3.0
    auto_box: bool = True
    manual_box: float = 10.0
    vol_filter: bool = False
    adx_thresh: int = 15

    def to_neev_params(self) -> NeevParams:
        return NeevParams(
            atr_len=self.atr_len,
            base_factor=self.base_factor,
            auto_box=self.auto_box,
            manual_box=self.manual_box,
            vol_filter=self.vol_filter,
            adx_thresh=self.adx_thresh,
        )


class SecurityInput(BaseModel):
    security_id: str
    symbol: str
    display_name: str
    exchange_segment: str = "NSE_EQ"
    instrument_type: str = "EQUITY"


class InstrumentOut(BaseModel):
    label: str
    symbol: str
    security_id: str
    exchange_segment: str
    instrument_type: str
    display_name: str


class HealthResponse(BaseModel):
    status: str = "ok"


class MetaDefaultsResponse(BaseModel):
    lookbacks: dict[str, int]
    params: NeevParamsSchema
    chart_bar_options: list[int]


class FrameBar(BaseModel):
    timestamp: str | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: float | None = None
    st: float | None = None
    trend: float | None = None
    buy: bool = False
    sell: bool = False


class SignalResult(BaseModel):
    symbol: str
    name: str
    signal: str
    trend: str | None = None
    bars_since_flip: int | None = None
    close: float | None = None
    st_level: float | None = None
    regime: str | None = None
    bar_time: str | None = None
    error: str | None = None
    frame: list[FrameBar] | None = None


class SignalsRequest(BaseModel):
    securities: list[SecurityInput]
    timeframe: TimeframeLiteral = "15m"
    lookback_days: int = Field(default=30, ge=5, le=365)
    params: NeevParamsSchema = Field(default_factory=NeevParamsSchema)
    include_frame: bool = True
    force_refresh: bool = False
    show_bars: int = Field(default=120, ge=1)


class SignalsResponse(BaseModel):
    results: list[SignalResult]
