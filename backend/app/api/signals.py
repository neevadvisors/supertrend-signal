"""Signal computation endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import SignalsRequest, SignalsResponse
from app.services.signal_service import compute_signals

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.post("", response_model=SignalsResponse)
def post_signals(body: SignalsRequest) -> SignalsResponse:
    return compute_signals(body)
