"""Published Instagram posts (local store)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import PublishedPost, SignalSnapshot
from app.db.session import get_db
from app.services.published_post_service import next_call_no

router = APIRouter(prefix="/api/posts", tags=["posts"])


class PublishedPostOut(BaseModel):
    id: str
    call_no: int
    market: str
    security_id: str
    timeframe: str
    symbol: str
    side: str
    display_name: str
    exchange_segment: str
    currency: str
    price: float | None
    change_pct: float | None
    published_at: str
    views: int
    likes: int
    comments: int


class PostsTotalsOut(BaseModel):
    count: int
    views: int
    likes: int
    comments: int


class PostsListResponse(BaseModel):
    posts: list[PublishedPostOut]
    totals: PostsTotalsOut


class NextCallNoResponse(BaseModel):
    next_call_no: int


def _post_out(row: PublishedPost) -> PublishedPostOut:
    return PublishedPostOut(
        id=row.id,
        call_no=row.call_no,
        market=row.market,
        security_id=row.security_id,
        timeframe=row.timeframe,
        symbol=row.symbol,
        side=row.side,
        display_name=row.display_name,
        exchange_segment=row.exchange_segment,
        currency=row.currency,
        price=float(row.price) if row.price is not None else None,
        change_pct=float(row.change_pct) if row.change_pct is not None else None,
        published_at=row.published_at.isoformat(),
        views=row.views,
        likes=row.likes,
        comments=row.comments,
    )


@router.get("/")
def list_posts(db: Session = Depends(get_db)) -> PostsListResponse:
    rows = db.scalars(
        select(PublishedPost).order_by(PublishedPost.published_at.desc())
    ).all()
    agg = db.execute(
        select(
            func.count(PublishedPost.id),
            func.coalesce(func.sum(PublishedPost.views), 0),
            func.coalesce(func.sum(PublishedPost.likes), 0),
            func.coalesce(func.sum(PublishedPost.comments), 0),
        )
    ).one()
    return PostsListResponse(
        posts=[_post_out(r) for r in rows],
        totals=PostsTotalsOut(
            count=int(agg[0]),
            views=int(agg[1]),
            likes=int(agg[2]),
            comments=int(agg[3]),
        ),
    )


@router.get("/next-call-no")
def get_next_call_no(db: Session = Depends(get_db)) -> NextCallNoResponse:
    return NextCallNoResponse(next_call_no=next_call_no(db))


@router.delete("/{post_id}")
def delete_post(post_id: str, db: Session = Depends(get_db)) -> dict:
    post = db.get(PublishedPost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    market = post.market
    security_id = post.security_id
    timeframe = post.timeframe
    db.delete(post)
    snap = db.get(SignalSnapshot, (market, security_id, timeframe))
    if snap is not None:
        snap.status = "pending"
    db.commit()
    return {"ok": True}
