from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user, require_admin
from app.schemas.common import CurrentUser
from app.schemas.monthly import MonthlyIndex, MonthlyRecord
from app.services.audit_service import get_audit_service
from app.services.monthly_results_service import get_monthly_results_service

router = APIRouter(prefix="/api/monthly-results", tags=["monthly-results"])


@router.get("", response_model=MonthlyIndex)
def list_months(_: CurrentUser = Depends(get_current_user)) -> MonthlyIndex:
    months = get_monthly_results_service().list_months()
    return MonthlyIndex(months=months, latest=months[-1] if months else None)


@router.get("/{month}", response_model=MonthlyRecord)
def get_month(month: str, _: CurrentUser = Depends(get_current_user)) -> MonthlyRecord:
    rec = get_monthly_results_service().get(month)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"no results for {month}")
    return rec


@router.put("/{month}", response_model=MonthlyRecord)
def put_month(
    month: str,
    body: MonthlyRecord,
    user: CurrentUser = Depends(require_admin),
) -> MonthlyRecord:
    if body.month != month:
        raise HTTPException(status_code=422, detail="month in path and body must match")
    rec = get_monthly_results_service().upsert(body)
    get_audit_service().write(
        actor=user.email,
        entity="monthly_results",
        action="upsert",
        details={"month": month, "status": rec.status},
    )
    return rec
