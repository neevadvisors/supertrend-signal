#!/usr/bin/env python3
"""Download NSE index constituent CSVs and write JSON under backend/data/indices/."""

from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

BACKEND_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = BACKEND_ROOT / "data" / "indices"

INDEX_SOURCES: dict[str, dict] = {
    "nifty50": {
        "name": "NIFTY 50",
        "market": "IN",
        "tier": "Large cap",
        "blurb": "India's 50 largest listed companies by free-float market cap.",
        "url": "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv",
    },
    "midcap150": {
        "name": "NIFTY Midcap 150",
        "market": "IN",
        "tier": "Mid cap",
        "blurb": "Companies ranked 101 to 250 by market cap.",
        "url": "https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv",
    },
    "smallcap250": {
        "name": "NIFTY Smallcap 250",
        "market": "IN",
        "tier": "Small cap",
        "blurb": "Companies ranked 251 to 500 by market cap.",
        "url": "https://nsearchives.nseindia.com/content/indices/ind_niftysmallcap250list.csv",
    },
    "niftynext50": {
        "name": "NIFTY Next 50",
        "market": "IN",
        "tier": "Large cap",
        "blurb": "The next 50 companies after NIFTY 50 by free-float market cap.",
        "url": "https://nsearchives.nseindia.com/content/indices/ind_niftynext50list.csv",
    },
}

USER_AGENT = "Mozilla/5.0 (compatible; dhan-signals/1.0)"


def fetch_csv(url: str) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8-sig")


def symbols_from_csv(text: str) -> list[str]:
    reader = csv.DictReader(text.splitlines())
    symbols: list[str] = []
    for row in reader:
        sym = (row.get("Symbol") or "").strip().upper()
        if not sym or sym.startswith("DUMMY"):
            continue
        series = (row.get("Series") or "EQ").strip().upper()
        if series not in ("EQ", "BE", "BZ", "RR", "IV", "SM"):
            continue
        symbols.append(sym)
    return symbols


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    refreshed = date.today().isoformat()
    catalog: list[dict] = []

    for index_id, meta in INDEX_SOURCES.items():
        csv_text = fetch_csv(meta["url"])
        symbols = symbols_from_csv(csv_text)
        doc = {
            "id": index_id,
            "name": meta["name"],
            "market": meta["market"],
            "tier": meta["tier"],
            "size": len(symbols),
            "blurb": meta["blurb"],
            "source_url": meta["url"],
            "refreshed_at": refreshed,
            "symbols": symbols,
        }
        path = OUT_DIR / f"{index_id}.json"
        path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
        catalog.append(
            {
                "id": index_id,
                "name": meta["name"],
                "market": meta["market"],
                "tier": meta["tier"],
                "size": len(symbols),
                "blurb": meta["blurb"],
                "refreshed_at": refreshed,
            }
        )
        print(f"wrote {path.name} ({len(symbols)} symbols)")

    catalog_path = OUT_DIR / "catalog.json"
    catalog_path.write_text(
        json.dumps({"refreshed_at": refreshed, "indices": catalog}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {catalog_path.name}")


if __name__ == "__main__":
    main()
