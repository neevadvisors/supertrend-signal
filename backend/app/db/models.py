"""Persistent coverage and signal snapshot tables."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CoverageIndex(Base):
    __tablename__ = "coverage_indices"

    index_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    market: Mapped[str] = mapped_column(String(2), nullable=False, default="IN")
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CoverageManualStock(Base):
    __tablename__ = "coverage_manual_stocks"

    market: Mapped[str] = mapped_column(String(2), primary_key=True)
    security_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64))
    display_name: Mapped[str] = mapped_column(String(256))
    exchange_segment: Mapped[str] = mapped_column(String(32), default="NSE_EQ")
    instrument_type: Mapped[str] = mapped_column(String(32), default="EQUITY")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SignalSnapshot(Base):
    __tablename__ = "signal_snapshots"

    market: Mapped[str] = mapped_column(String(2), primary_key=True)
    security_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    timeframe: Mapped[str] = mapped_column(String(8), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    run_id: Mapped[str] = mapped_column(String(64))
    side: Mapped[str] = mapped_column(String(8))
    entry: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    target: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    stop: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    note: Mapped[str] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PrevClose(Base):
    __tablename__ = "prev_closes"

    market: Mapped[str] = mapped_column(String(2), primary_key=True)
    security_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    session_date: Mapped[date] = mapped_column(Date(), primary_key=True)
    prev_close: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SignalRun(Base):
    __tablename__ = "signal_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16))
    symbol_count: Mapped[int] = mapped_column(default=0)
    error_count: Mapped[int] = mapped_column(default=0)
    trigger: Mapped[str] = mapped_column(String(16))


class PublishedPost(Base):
    __tablename__ = "published_posts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    call_no: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    security_id: Mapped[str] = mapped_column(String(32), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(8), nullable=False)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    exchange_segment: Mapped[str] = mapped_column(String(32), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    change_pct: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    likes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comments: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
