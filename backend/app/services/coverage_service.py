"""Coverage expansion, persistence, and row assembly."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import CoverageIndex, CoverageManualStock, SignalRun, SignalSnapshot
from src.dhan_client import QuoteInstrument
from src.indices import list_indices, resolve_index_members
from src.market_data import provider_for


@dataclass
class CoveredSecurity:
    market: str
    currency: str
    security_id: str
    symbol: str
    display_name: str
    exchange_segment: str
    instrument_type: str
    manual: bool
    sources: list[str]


def _default_currency(market: str) -> str:
    return "USD" if market == "US" else "INR"


def _index_name_map() -> dict[str, str]:
    return {row["id"]: row["name"] for row in list_indices()}


def _index_market_map() -> dict[str, str]:
    return {row["id"]: row.get("market", "IN") for row in list_indices()}


def expand_coverage(db: Session) -> list[CoveredSecurity]:
    index_rows = db.scalars(select(CoverageIndex)).all()
    manual_rows = db.scalars(select(CoverageManualStock)).all()
    index_names = _index_name_map()

    manual_keys = {(m.market, m.security_id) for m in manual_rows}
    by_key: dict[tuple[str, str], CoveredSecurity] = {}

    for manual in manual_rows:
        key = (manual.market, manual.security_id)
        by_key[key] = CoveredSecurity(
            market=manual.market,
            currency=manual.currency,
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
        doc_market = doc.get("market", "IN")
        for member in doc.get("members", []):
            sid = str(member["security_id"])
            market = member.get("market", doc_market)
            currency = member.get("currency", _default_currency(market))
            key = (market, sid)
            existing = by_key.get(key)
            sources = list(existing.sources) if existing else []
            if name not in sources:
                sources.append(name)
            is_manual = key in manual_keys
            if is_manual and "Individual" not in sources:
                sources = ["Individual", *sources]
            by_key[key] = CoveredSecurity(
                market=market,
                currency=currency,
                security_id=sid,
                symbol=member["symbol"],
                display_name=member.get("display_name", member["symbol"]),
                exchange_segment=member.get("exchange_segment", "NSE_EQ"),
                instrument_type=member.get("instrument_type", "EQUITY"),
                manual=is_manual,
                sources=sources,
            )

    return sorted(by_key.values(), key=lambda s: (s.market, s.symbol))


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
                "market": m.market,
                "currency": m.currency,
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
    index_markets = _index_market_map()

    db.execute(delete(CoverageIndex))
    db.execute(delete(CoverageManualStock))

    now = datetime.now(timezone.utc)
    for index_id in index_ids:
        db.add(
            CoverageIndex(
                index_id=index_id,
                market=index_markets.get(index_id, "IN"),
                added_at=now,
            )
        )

    for item in manual_list:
        market = item.get("market", "IN")
        currency = item.get("currency", _default_currency(market))
        db.add(
            CoverageManualStock(
                market=market,
                security_id=str(item["security_id"]),
                symbol=item["symbol"],
                display_name=item.get("display_name", item["symbol"]),
                exchange_segment=item.get("exchange_segment", "NSE_EQ"),
                instrument_type=item.get("instrument_type", "EQUITY"),
                currency=currency,
                added_at=now,
            )
        )
    db.commit()


def latest_job(db: Session) -> SignalRun | None:
    return db.scalars(select(SignalRun).order_by(SignalRun.started_at.desc())).first()


def snapshots_for_securities(
    db: Session,
    universe: list[CoveredSecurity],
) -> dict[tuple[str, str, str], SignalSnapshot]:
    """Map ``(market, security_id, timeframe)`` → snapshot row."""
    if not universe:
        return {}
    universe_keys = {(s.market, s.security_id) for s in universe}
    markets = {m for m, _ in universe_keys}
    security_ids = {sid for _, sid in universe_keys}
    rows = db.scalars(
        select(SignalSnapshot).where(
            SignalSnapshot.security_id.in_(security_ids),
            SignalSnapshot.market.in_(markets),
        )
    ).all()
    return {
        (r.market, r.security_id, r.timeframe): r
        for r in rows
        if (r.market, r.security_id) in universe_keys
    }


def manual_last_run_map(db: Session) -> dict[tuple[str, str], datetime]:
    rows = db.scalars(select(CoverageManualStock)).all()
    return {
        (r.market, r.security_id): r.last_run_at for r in rows if r.last_run_at
    }


def fetch_quotes_for_universe(
    universe: list[CoveredSecurity],
) -> tuple[dict[str, dict[str, float | None]], str | None]:
    """Batch LTP quotes per market via ``provider_for``."""
    if not universe:
        return {}, None

    quotes: dict[str, dict[str, float | None]] = {}
    errors: list[str] = []
    by_market: dict[str, list[CoveredSecurity]] = {}
    for sec in universe:
        by_market.setdefault(sec.market, []).append(sec)

    for market, secs in by_market.items():
        try:
            batch = provider_for(market).fetch_market_ohlc(
                [
                    QuoteInstrument(s.security_id, s.exchange_segment)
                    for s in secs
                ]
            )
            quotes.update(batch)
        except Exception as exc:
            errors.append(f"{market}: {exc}")

    quote_error = "; ".join(errors) if errors else None
    return quotes, quote_error


def quote_for_security(
    quotes: dict[str, dict[str, float | None]],
    sec: CoveredSecurity,
) -> dict[str, float | None]:
    q = quotes.get(sec.security_id)
    if q is None and sec.market == "US":
        q = quotes.get(sec.security_id.upper())
    return q or {}
