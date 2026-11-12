"""FastAPI application entrypoint."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend root is on sys.path for `from src...` and `from app...` imports.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(BACKEND_ROOT.parent / ".env")

from app.api import (  # noqa: E402
    coverage,
    health,
    indices,
    instruments,
    jobs,
    meta,
    posts,
    signal_review,
    signals,
)
from src.instruments import load_nse_equity_instruments  # noqa: E402
from src.token_manager import get_valid_access_token  # noqa: E402

app = FastAPI(title="Neev Signals API", version="1.0.0")


@app.on_event("startup")
def _warm_instrument_cache() -> None:
    """Load NSE equity list into memory so the first search is not cold."""
    try:
        load_nse_equity_instruments()
    except Exception:
        # Search endpoint will surface errors when first used.
        pass
    try:
        get_valid_access_token()
    except Exception:
        # Dhan endpoints will surface auth errors when first used.
        pass

_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(indices.router)
app.include_router(instruments.router)
app.include_router(meta.router)
app.include_router(signals.router)
app.include_router(coverage.router)
app.include_router(jobs.router)
app.include_router(signal_review.router)
app.include_router(posts.router)
