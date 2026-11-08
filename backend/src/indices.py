"""Load NSE index constituent lists and resolve to Dhan instruments."""

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


def resolve_index_members(
    index_id: str,
    *,
    force_refresh: bool = False,
) -> dict:
    doc = load_index_doc(index_id)
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
        "market": doc.get("market", "IN"),
        "tier": doc.get("tier", ""),
        "size": doc.get("size", len(doc.get("symbols", []))),
        "blurb": doc.get("blurb", ""),
        "refreshed_at": doc.get("refreshed_at", ""),
        "members": members,
        "unresolved": unresolved,
        "resolved_count": len(members),
        "unresolved_count": len(unresolved),
    }
