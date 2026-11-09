#!/usr/bin/env python3
"""CLI entrypoint for hourly coverage signal job."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(BACKEND_ROOT.parent / ".env")

from app.services.coverage_job import run_coverage_job  # noqa: E402

_MARKETS = ("IN", "US", "ALL")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run coverage signal cron job.")
    parser.add_argument(
        "--market",
        choices=_MARKETS,
        default="IN",
        help="Market universe to process (default: IN for backward compatibility).",
    )
    parser.add_argument(
        "--skip-us-outside-rth",
        action="store_true",
        help="No-op US runs when NYSE is not in regular cash session.",
    )
    return parser.parse_args()


def _run_market(market: str, *, skip_us_outside_rth: bool) -> None:
    trigger = f"cron_{market.lower()}"
    try:
        run = run_coverage_job(
            trigger=trigger,
            market=market,
            skip_us_outside_rth=skip_us_outside_rth,
        )
    except RuntimeError as exc:
        print(f"Skipped {market}: {exc}", file=sys.stderr)
        return

    if run is None:
        print(f"Skipped {market}: outside US RTH")
        return

    print(
        f"Run {run.id} ({market}) {run.status}: "
        f"{run.symbol_count} symbols, {run.error_count} errors"
    )


def main() -> None:
    args = _parse_args()
    if args.market == "ALL":
        for market in ("IN", "US"):
            _run_market(market, skip_us_outside_rth=args.skip_us_outside_rth)
        return
    _run_market(args.market, skip_us_outside_rth=args.skip_us_outside_rth)


if __name__ == "__main__":
    main()
