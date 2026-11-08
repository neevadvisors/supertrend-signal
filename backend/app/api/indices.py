"""Index catalog and constituent resolution."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import (
    IndexMembersResponse,
    IndexSummary,
    IndicesCatalogResponse,
    InstrumentOut,
    UnresolvedSymbol,
)
from src.indices import list_indices, load_catalog, resolve_index_members

router = APIRouter(prefix="/api/indices", tags=["indices"])


@router.get("", response_model=IndicesCatalogResponse)
def get_indices_catalog() -> IndicesCatalogResponse:
    catalog = load_catalog()
    indices = [IndexSummary(**row) for row in list_indices()]
    return IndicesCatalogResponse(
        refreshed_at=catalog.get("refreshed_at"),
        indices=indices,
    )


@router.get("/{index_id}/members", response_model=IndexMembersResponse)
def get_index_members(
    index_id: str,
    refresh: bool = Query(default=False),
) -> IndexMembersResponse:
    try:
        payload = resolve_index_members(index_id, force_refresh=refresh)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown index: {index_id}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return IndexMembersResponse(
        id=payload["id"],
        name=payload["name"],
        market=payload["market"],
        tier=payload["tier"],
        size=payload["size"],
        blurb=payload["blurb"],
        refreshed_at=payload.get("refreshed_at") or None,
        members=[InstrumentOut(**m) for m in payload["members"]],
        unresolved=[UnresolvedSymbol(**u) for u in payload["unresolved"]],
        resolved_count=payload["resolved_count"],
        unresolved_count=payload["unresolved_count"],
    )
