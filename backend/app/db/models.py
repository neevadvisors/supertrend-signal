"""Persistent coverage and signal snapshot tables."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CoverageIndex(Base):
    __tablename__ = "coverage_indices"

    index_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CoverageManualStock(Base):
    __tablename__ = "coverage_manual_stocks"

    security_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64))
    display_name: Mapped[str] = mapped_column(String(256))
    exchange_segment: Mapped[str] = mapped_column(String(32), default="NSE_EQ")
    instrument_type: Mapped[str] = mapped_column(String(32), default="EQUITY")
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SignalSnapshot(Base):
    __tablename__ = "signal_snapshots"

    security_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    timeframe: Mapped[str] = mapped_column(String(8), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64))
    run_id: Mapped[str] = mapped_column(String(64))
    side: Mapped[str] = mapped_column(String(8))
    entry: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    target: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    stop: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    note: Mapped[str] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SignalRun(Base):
    __tablename__ = "signal_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16))
    symbol_count: Mapped[int] = mapped_column(default=0)
    error_count: Mapped[int] = mapped_column(default=0)
    trigger: Mapped[str] = mapped_column(String(16))
