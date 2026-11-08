"""Meta / defaults endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import MetaDefaultsResponse, NeevParamsSchema
from src.dhan_client import default_lookback_for_timeframe
from src.signals import NeevParams

router = APIRouter(prefix="/api/meta", tags=["meta"])

CHART_BAR_OPTIONS = [60, 120, 250]


@router.get("/defaults", response_model=MetaDefaultsResponse)
def get_defaults() -> MetaDefaultsResponse:
    defaults = NeevParams()
    return MetaDefaultsResponse(
        lookbacks={
            "15m": default_lookback_for_timeframe("15m"),
            "1h": default_lookback_for_timeframe("1h"),
            "4h": default_lookback_for_timeframe("4h"),
            "1d": default_lookback_for_timeframe("1d"),
        },
        params=NeevParamsSchema(
            atr_len=defaults.atr_len,
            base_factor=defaults.base_factor,
            auto_box=defaults.auto_box,
            manual_box=defaults.manual_box,
            vol_filter=defaults.vol_filter,
            adx_thresh=defaults.adx_thresh,
        ),
        chart_bar_options=CHART_BAR_OPTIONS,
    )
