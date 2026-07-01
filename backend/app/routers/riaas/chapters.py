from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import require_riaas_access

router = APIRouter(
    prefix="/api/riaas",
    tags=["riaas"],
    dependencies=[Depends(require_riaas_access)],
)

CHAPTERS = [
    {"slug": "gtm-overview", "title": "GTM Efficiency Overview"},
    {"slug": "win-loss", "title": "Win/Loss & Benchmark"},
    {"slug": "pipeline-health", "title": "Pipeline Health Assessment"},
    {"slug": "coach", "title": "Coach (People Insights)"},
    {"slug": "gtm-process", "title": "GTM Process Optimisation"},
]


@router.get("/chapters")
def list_chapters() -> list[dict]:
    return CHAPTERS
