"""Published Instagram post helpers (local store, no Meta API)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import CoverageManualStock, PublishedPost, SignalSnapshot


def next_call_no(db: Session) -> int:
    max_no = db.scalar(select(func.max(PublishedPost.call_no)))
    return (max_no or 0) + 1


def find_post_for_signal(
    db: Session, market: str, security_id: str, timeframe: str
) -> PublishedPost | None:
    return db.scalars(
        select(PublishedPost).where(
            PublishedPost.market == market,
            PublishedPost.security_id == security_id,
            PublishedPost.timeframe == timeframe,
        )
    ).first()


def _denorm_from_coverage(
    db: Session, market: str, security_id: str, symbol: str
) -> tuple[str, str, str]:
    manual = db.get(CoverageManualStock, (market, security_id))
    if manual is not None:
        return manual.display_name, manual.exchange_segment, manual.currency
    # Index-covered names live in expand_coverage, not the manual table.
    from app.services.coverage_service import expand_coverage

    for covered in expand_coverage(db):
        if covered.market == market and covered.security_id == security_id:
            return covered.display_name, covered.exchange_segment, covered.currency
    default_segment = "NASDAQ" if market == "US" else "NSE_EQ"
    default_currency = "USD" if market == "US" else "INR"
    return symbol, default_segment, default_currency


def create_post_for_signal(db: Session, row: SignalSnapshot) -> PublishedPost:
    display_name, exchange_segment, currency = _denorm_from_coverage(
        db, row.market, row.security_id, row.symbol
    )
    if row.currency:
        currency = row.currency
    post = PublishedPost(
        id=str(uuid.uuid4()),
        call_no=next_call_no(db),
        market=row.market,
        security_id=row.security_id,
        timeframe=row.timeframe,
        symbol=row.symbol,
        side=row.side,
        display_name=display_name,
        exchange_segment=exchange_segment,
        currency=currency,
        price=row.entry,
        change_pct=None,
        published_at=datetime.now(timezone.utc),
    )
    db.add(post)
    return post


def delete_post_for_signal(
    db: Session, market: str, security_id: str, timeframe: str
) -> PublishedPost | None:
    post = find_post_for_signal(db, market, security_id, timeframe)
    if post is None:
        return None
    db.delete(post)
    return post
