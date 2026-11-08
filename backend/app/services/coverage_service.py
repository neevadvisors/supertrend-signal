"""Coverage expansion, persistence, and row assembly."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import CoverageIndex, CoverageManualStock, SignalRun, SignalSnapshot
from src.indices import list_indices, resolve_index_members


@dataclass
class CoveredSecurity:
    security_id: str
    symbol: str
    display_name: str
    exchange_segment: str
    instrument_type: str
    manual: bool
    sources: list[str]


def _index_name_map() -> dict[str, str]:
    return {row["id"]: row["name"] for row in list_indices()}


def expand_coverage(db: Session) -> list[CoveredSecurity]:
    index_rows = db.scalars(select(CoverageIndex)).all()
    manual_rows = db.scalars(select(CoverageManualStock)).all()
    index_names = _index_name_map()

    manual_ids = {m.security_id for m in manual_rows}
    by_id: dict[str, CoveredSecurity] = {}

    for manual in manual_rows:
        by_id[manual.security_id] = CoveredSecurity(
            security_id=manual.security_id,
            symbol=manual.symbol,
            display_name=manual.display_name,
            exchange_segment=manual.exchange_segment,
            instrument_type=manual.instrument_type,
            manual=True,
            sources=["Individual"],
        )

    for idx in index_rows:
        try:
            doc = resolve_index_members(idx.index_id)
        except (KeyError, FileNotFoundError):
            continue
        name = index_names.get(idx.index_id, doc.get("name", idx.index_id))
        for member in doc.get("members", []):
            sid = str(member["security_id"])
            existing = by_id.get(sid)
            sources = list(existing.sources) if existing else []
            if name not in sources:
                sources.append(name)
            is_manual = sid in manual_ids
            if is_manual and "Individual" not in sources:
                sources = ["Individual", *sources]
            by_id[sid] = CoveredSecurity(
                security_id=sid,
                symbol=member["symbol"],
                display_name=member.get("display_name", member["symbol"]),
                exchange_segment=member.get("exchange_segment", "NSE_EQ"),
                instrument_type=member.get("instrument_type", "EQUITY"),
                manual=is_manual,
                sources=sources,
            )

    return sorted(by_id.values(), key=lambda s: s.symbol)


def get_coverage_state(db: Session) -> dict:
    indices = db.scalars(select(CoverageIndex)).all()
    manual = db.scalars(select(CoverageManualStock)).all()
    return {
        "indexIds": [i.index_id for i in indices],
        "manual": [
            {
                "label": m.display_name,
                "symbol": m.symbol,
                "security_id": m.security_id,
                "exchange_segment": m.exchange_segment,
                "instrument_type": m.instrument_type,
                "display_name": m.display_name,
            }
            for m in manual
        ],
        "indexAddedOn": {
            i.index_id: i.added_at.date().isoformat() if i.added_at else ""
            for i in indices
        },
        "indexLastRun": {
            i.index_id: i.last_run_at.isoformat() if i.last_run_at else ""
            for i in indices
            if i.last_run_at
        },
    }


def replace_coverage(db: Session, payload: dict) -> None:
    index_ids = list(dict.fromkeys(payload.get("indexIds", [])))
    manual_list = payload.get("manual", [])

    db.execute(delete(CoverageIndex))
    db.execute(delete(CoverageManualStock))

    now = datetime.now(timezone.utc)
    for index_id in index_ids:
        db.add(CoverageIndex(index_id=index_id, added_at=now))

    for item in manual_list:
        db.add(
            CoverageManualStock(
                security_id=str(item["security_id"]),
                symbol=item["symbol"],
                display_name=item.get("display_name", item["symbol"]),
                exchange_segment=item.get("exchange_segment", "NSE_EQ"),
                instrument_type=item.get("instrument_type", "EQUITY"),
                added_at=now,
            )
        )
    db.commit()


def latest_job(db: Session) -> SignalRun | None:
    return db.scalars(select(SignalRun).order_by(SignalRun.started_at.desc())).first()


def snapshots_for_securities(
    db: Session, security_ids: list[str]
) -> dict[tuple[str, str], SignalSnapshot]:
    if not security_ids:
        return {}
    rows = db.scalars(
        select(SignalSnapshot).where(SignalSnapshot.security_id.in_(security_ids))
    ).all()
    return {(r.security_id, r.timeframe): r for r in rows}


def manual_last_run_map(db: Session) -> dict[str, datetime]:
    rows = db.scalars(select(CoverageManualStock)).all()
    return {r.security_id: r.last_run_at for r in rows if r.last_run_at}
