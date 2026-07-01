from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.analysis.registry import CHAPTER_SLUGS
from app.deps import get_current_user, require_riaas_access
from app.schemas.common import CurrentUser
from app.services.audit_service import get_audit_service
from app.services.riaas.chapter_service import run_chapter
from app.services.riaas.key_findings_service import get_key_findings_service
from app.services.salesforce_client import SalesforceAuthError, get_sf_client

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


@router.get("/chapters/{slug}")
def get_chapter(
    slug: str,
    territory: str | None = None,
    seller_id: str | None = None,
    motion: str | None = None,
    period: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    if slug not in CHAPTER_SLUGS:
        raise HTTPException(404, detail=f"unknown chapter: {slug}")
    try:
        return run_chapter(
            get_sf_client(),
            slug,
            territory=territory,
            seller_id=seller_id,
            motion=motion,
            period=period,
            custom_start=date_from,
            custom_end=date_to,
        )
    except SalesforceAuthError as exc:
        raise HTTPException(status_code=502, detail=f"Salesforce auth failed: {exc}")


class KeyFindingsIn(BaseModel):
    text: str


@router.put("/chapters/{slug}/key-findings")
def save_key_findings(
    slug: str, body: KeyFindingsIn, user: CurrentUser = Depends(get_current_user)
) -> dict:
    if slug not in CHAPTER_SLUGS:
        raise HTTPException(404, detail=f"unknown chapter: {slug}")
    row = get_key_findings_service().save(slug, body.text, actor=user.email)
    get_audit_service().write(
        actor=user.email, entity="riaas", action="key_findings_update", target=slug
    )
    return row
