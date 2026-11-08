#!/usr/bin/env python3
"""CLI entrypoint for hourly coverage signal job."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(BACKEND_ROOT.parent / ".env")

from app.services.coverage_job import run_coverage_job  # noqa: E402


def main() -> None:
    run = run_coverage_job(trigger="cron")
    print(
        f"Run {run.id} {run.status}: "
        f"{run.symbol_count} symbols, {run.error_count} errors"
    )


if __name__ == "__main__":
    main()
