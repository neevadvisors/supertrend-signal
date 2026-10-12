"""Mint and cache Dhan access tokens via TOTP."""

from __future__ import annotations

import base64
import json
import os
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pyotp
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = PROJECT_ROOT / "data" / "dhan_token.json"
REFRESH_MARGIN = timedelta(hours=1)
IST = ZoneInfo("Asia/Kolkata")
GENERATE_TOKEN_URL = "https://auth.dhan.co/app/generateAccessToken"

_lock = threading.Lock()
_memory_token: str | None = None
_memory_expiry: datetime | None = None


def _load_env() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT.parent / ".env")


def _parse_expiry(value: str) -> datetime:
    """Parse Dhan expiryTime (ISO, IST) into timezone-aware datetime."""
    text = value.strip()
    if text.endswith("Z"):
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    elif "+" in text[10:] or text.count("-") > 2:
        dt = datetime.fromisoformat(text)
    else:
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=IST)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt


def _jwt_expiry(access_token: str) -> datetime | None:
    try:
        parts = access_token.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
        exp = payload.get("exp")
        if exp is None:
            return None
        return datetime.fromtimestamp(int(exp), tz=IST)
    except (ValueError, json.JSONDecodeError, OSError):
        return None


def _is_fresh(expiry: datetime, now: datetime) -> bool:
    return expiry - now > REFRESH_MARGIN


def _set_memory(access_token: str, expiry: datetime) -> None:
    global _memory_token, _memory_expiry
    _memory_token = access_token
    _memory_expiry = expiry


def _read_cache_file() -> tuple[str, datetime] | None:
    if not CACHE_PATH.is_file():
        return None
    try:
        raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        token = str(raw.get("accessToken", "")).strip()
        expiry_raw = raw.get("expiryTime")
        if not token or not expiry_raw:
            return None
        expiry = _parse_expiry(str(expiry_raw))
        return token, expiry
    except (json.JSONDecodeError, OSError, ValueError):
        return None


def _write_cache_file(access_token: str, expiry: datetime) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "accessToken": access_token,
        "expiryTime": expiry.astimezone(IST).isoformat(timespec="milliseconds"),
    }
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _bootstrap_from_env(now: datetime) -> tuple[str, datetime] | None:
    token = os.getenv("DHAN_ACCESS_TOKEN", "").strip()
    if not token:
        return None
    expiry = _jwt_expiry(token)
    if expiry is None:
        expiry = now + timedelta(hours=24)
    if not _is_fresh(expiry, now):
        return None
    return token, expiry


def _mint_access_token(client_id: str, pin: str, totp_secret: str) -> tuple[str, datetime]:
    totp = pyotp.TOTP(totp_secret.replace(" ", "")).now()
    url = (
        f"{GENERATE_TOKEN_URL}"
        f"?dhanClientId={client_id}&pin={pin}&totp={totp}"
    )
    with httpx.Client(timeout=30.0) as client:
        response = client.post(url)
        response.raise_for_status()
        data: dict[str, Any] = response.json()

    access_token = str(data.get("accessToken", "")).strip()
    expiry_raw = data.get("expiryTime")
    if not access_token or not expiry_raw:
        raise RuntimeError(f"Dhan generateAccessToken missing fields: {data}")

    expiry = _parse_expiry(str(expiry_raw))
    return access_token, expiry


def get_valid_access_token() -> str:
    """Return a Dhan JWT, minting via TOTP when cache is missing or near expiry."""
    _load_env()
    now = datetime.now(tz=IST)

    with _lock:
        if _memory_token and _memory_expiry and _is_fresh(_memory_expiry, now):
            return _memory_token

        cached = _read_cache_file()
        if cached and _is_fresh(cached[1], now):
            _set_memory(cached[0], cached[1])
            return cached[0]

        bootstrap = _bootstrap_from_env(now)
        if bootstrap:
            _set_memory(bootstrap[0], bootstrap[1])
            return bootstrap[0]

        client_id = os.getenv("DHAN_CLIENT_ID", "").strip()
        pin = os.getenv("DHAN_PIN", "").strip()
        totp_secret = os.getenv("DHAN_TOTP_SECRET", "").strip()
        if not client_id or not pin or not totp_secret:
            raise RuntimeError(
                "Dhan access token expired or missing. Set DHAN_CLIENT_ID, "
                "DHAN_PIN, and DHAN_TOTP_SECRET for TOTP auto-refresh, or provide "
                "a valid DHAN_ACCESS_TOKEN bootstrap."
            )

        access_token, expiry = _mint_access_token(client_id, pin, totp_secret)
        _set_memory(access_token, expiry)
        _write_cache_file(access_token, expiry)
        return access_token
