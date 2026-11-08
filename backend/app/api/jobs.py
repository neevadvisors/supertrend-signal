"""Signal run metadata."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.coverage_service import latest_job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class LatestJobOut(BaseModel):
    id: str
    status: str
    started_at: str
    finished_at: str | None
    symbol_count: int
    error_count: int
    trigger: str


@router.get("/latest")
def get_latest_job(db: Session = Depends(get_db)) -> LatestJobOut | None:
    job = latest_job(db)
    if job is None:
        return None
    return LatestJobOut(
        id=job.id,
        status=job.status,
        started_at=job.started_at.isoformat(),
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
        symbol_count=job.symbol_count,
        error_count=job.error_count,
        trigger=job.trigger,
    )
