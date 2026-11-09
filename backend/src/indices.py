"""Load index constituent lists; resolve India members via Dhan scrip master."""

from __future__ import annotations

import json
from pathlib import Path

from src.instruments import resolve_nse_equity_symbol

INDICES_DIR = Path(__file__).resolve().parent.parent / "data" / "indices"

_index_catalog: dict | None = None
_index_docs: dict[str, dict] = {}


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_catalog() -> dict:
    global _index_catalog
    if _index_catalog is None:
        catalog_path = INDICES_DIR / "catalog.json"
        if not catalog_path.exists():
            raise FileNotFoundError("Index catalog missing; run refresh_index_constituents.py")
        _index_catalog = _read_json(catalog_path)
    return _index_catalog


def list_indices() -> list[dict]:
    catalog = load_catalog()
    return list(catalog.get("indices", []))


def load_index_doc(index_id: str) -> dict:
    if index_id in _index_docs:
        return _index_docs[index_id]
    path = INDICES_DIR / f"{index_id}.json"
    if not path.exists():
        raise KeyError(index_id)
    doc = _read_json(path)
    _index_docs[index_id] = doc
    return doc


def _us_member_ready(row: dict) -> bool:
    return row.get("exchange_segment") == "US_EQ" or row.get("market") == "US"


def _finalize_us_member(row: dict) -> dict:
    """Ensure API-shaped instrument fields; US lists are pre-resolved in JSON."""
    out = dict(row)
    symbol = str(out.get("symbol") or "").strip().upper()
    display = str(out.get("display_name") or symbol).strip()
    if not out.get("label"):
        out["label"] = f"{symbol} — {display}" if display and display != symbol else symbol
    out.setdefault("symbol", symbol)
    out.setdefault("security_id", symbol)
    out.setdefault("exchange_segment", "US_EQ")
    out.setdefault("instrument_type", "EQUITY")
    return out


def resolve_index_members(
    index_id: str,
    *,
    force_refresh: bool = False,
) -> dict:
    doc = load_index_doc(index_id)
    market = doc.get("market", "IN")
    preset = doc.get("members")
    if market == "US" or (preset and all(_us_member_ready(m) for m in preset)):
        members = [_finalize_us_member(m) for m in (preset or [])]
        unresolved = list(doc.get("unresolved") or [])
        return {
            "id": doc["id"],
            "name": doc["name"],
            "market": market,
            "tier": doc.get("tier", ""),
            "size": doc.get("size", len(members)),
            "blurb": doc.get("blurb", ""),
            "refreshed_at": doc.get("refreshed_at", ""),
            "members": members,
            "unresolved": unresolved,
            "resolved_count": len(members),
            "unresolved_count": len(unresolved),
        }

    members: list[dict] = []
    unresolved: list[dict] = []
    for symbol in doc.get("symbols", []):
        inst, reason = resolve_nse_equity_symbol(symbol, force_refresh=force_refresh)
        if inst is not None:
            members.append(inst)
        else:
            unresolved.append({"symbol": symbol, "reason": reason or "unknown"})

    return {
        "id": doc["id"],
        "name": doc["name"],
        "market": market,
        "tier": doc.get("tier", ""),
        "size": doc.get("size", len(doc.get("symbols", []))),
        "blurb": doc.get("blurb", ""),
        "refreshed_at": doc.get("refreshed_at", ""),
        "members": members,
        "unresolved": unresolved,
        "resolved_count": len(members),
        "unresolved_count": len(unresolved),
    }
