from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

from app.deps import get_current_user, require_riaas_access
from app.scheduler.jobs import riaas_render_and_send, run_riaas_scheduled_report
from app.schedulers_registration import register_riaas_schedule, unregister_riaas_schedule
from app.schemas.common import CurrentUser
from app.schemas.schedules import (
    ScheduleCreateIn,
    ScheduleOut,
    ScheduleUpdateIn,
    SendNowResult,
    SendOnceIn,
)
from app.services.audit_service import get_audit_service
from app.services.riaas.riaas_schedule_service import get_ri_schedule_service
from app.services.salesforce_client import get_sf_client

router = APIRouter(
    prefix="/api/riaas",
    tags=["riaas"],
    dependencies=[Depends(require_riaas_access)],
)


@router.get("/report/preview", response_class=HTMLResponse)
def preview_report(
    territory: str | None = None,
    seller_id: str | None = None,
    motion: str | None = None,
    period: str | None = None,
) -> HTMLResponse:
    from app.services.riaas.report_renderer import render_revenue_insights_report

    html = render_revenue_insights_report(
        get_sf_client(),
        filters={
            "territory": territory,
            "seller_id": seller_id,
            "motion": motion,
            "period": period,
        },
    )
    return HTMLResponse(html)


@router.get("/schedules", response_model=list[ScheduleOut])
def list_schedules() -> list[ScheduleOut]:
    return get_ri_schedule_service().list()


@router.post("/schedules", response_model=ScheduleOut, status_code=201)
def create_schedule(
    body: ScheduleCreateIn, user: CurrentUser = Depends(get_current_user)
) -> ScheduleOut:
    subject = body.subject or "Revenue Insights Report"
    try:
        schedule = get_ri_schedule_service().create(
            name=body.name,
            cron=body.cron,
            recipients=body.recipients,
            subject=subject,
            filters=body.filters,
            is_active=body.is_active,
            actor=user.email,
        )
    except ValueError as exc:
        raise HTTPException(422, detail=f"invalid cron: {exc}")
    register_riaas_schedule(schedule)
    get_audit_service().write(
        actor=user.email, entity="riaas", action="schedule_create", target=schedule.id
    )
    return schedule


@router.put("/schedules/{schedule_id}", response_model=ScheduleOut)
def update_schedule(
    schedule_id: str, body: ScheduleUpdateIn, user: CurrentUser = Depends(get_current_user)
) -> ScheduleOut:
    schedule = get_ri_schedule_service().update(schedule_id, **body.model_dump())
    if schedule is None:
        raise HTTPException(404, detail="schedule not found")
    register_riaas_schedule(schedule)
    get_audit_service().write(
        actor=user.email, entity="riaas", action="schedule_update", target=schedule_id
    )
    return schedule


@router.delete("/schedules/{schedule_id}", status_code=204)
def delete_schedule(
    schedule_id: str, user: CurrentUser = Depends(get_current_user)
) -> None:
    if not get_ri_schedule_service().delete(schedule_id):
        raise HTTPException(404, detail="schedule not found")
    unregister_riaas_schedule(schedule_id)
    get_audit_service().write(
        actor=user.email, entity="riaas", action="schedule_delete", target=schedule_id
    )


@router.post("/schedules/send-once", response_model=SendNowResult)
def send_once(
    body: SendOnceIn, user: CurrentUser = Depends(get_current_user)
) -> SendNowResult:
    subject = body.subject or "Revenue Insights Report"
    try:
        msg_id = riaas_render_and_send(
            recipients=body.recipients, subject=subject, filters=body.filters
        )
    except Exception as exc:
        return SendNowResult(ok=False, error=str(exc)[:500])
    get_audit_service().write(
        actor=user.email,
        entity="riaas",
        action="report_send_once",
        details={"recipients": len(body.recipients), "message_id": msg_id},
    )
    return SendNowResult(ok=True, message_id=msg_id)


@router.post("/schedules/{schedule_id}/send-now", response_model=SendNowResult)
def send_now(
    schedule_id: str, user: CurrentUser = Depends(get_current_user)
) -> SendNowResult:
    if get_ri_schedule_service().get(schedule_id) is None:
        raise HTTPException(404, detail="schedule not found")
    try:
        msg_id = run_riaas_scheduled_report(schedule_id)
    except Exception as exc:
        return SendNowResult(ok=False, error=str(exc)[:500])
    get_audit_service().write(
        actor=user.email, entity="riaas", action="report_send_now", target=schedule_id
    )
    return SendNowResult(ok=True, message_id=msg_id)
