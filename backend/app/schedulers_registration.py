"""Sync between `schedules` table rows and the in-memory APScheduler.

Schedules persist in Azure Table Storage. On every schedule CRUD this module
adds/removes the corresponding APScheduler job; on startup it re-registers
every active schedule from the table.
"""
from __future__ import annotations

import logging

from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.scheduler import get_scheduler
from app.scheduler.jobs import run_scheduled_report
from app.schemas.schedules import ScheduleOut

logger = logging.getLogger(__name__)


def _job_id(schedule_id: str) -> str:
    return f"schedule-{schedule_id}"


def register_schedule(schedule: ScheduleOut) -> None:
    scheduler = get_scheduler()
    job_id = _job_id(schedule.id)
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
    if not schedule.is_active or not schedule.recipients:
        return
    tz = get_settings().scheduler_tz
    try:
        trigger = CronTrigger.from_crontab(schedule.cron, timezone=tz)
    except Exception:
        logger.exception("invalid cron for schedule %s: %s", schedule.id, schedule.cron)
        return
    job = scheduler.add_job(
        run_scheduled_report,
        trigger=trigger,
        args=[schedule.id],
        id=job_id,
        replace_existing=True,
    )
    logger.info(
        "registered schedule %s with cron %s (tz=%s, next_run=%s)",
        schedule.id,
        schedule.cron,
        tz,
        job.next_run_time,
    )


def unregister_schedule(schedule_id: str) -> None:
    try:
        get_scheduler().remove_job(_job_id(schedule_id))
    except Exception:
        pass


def _riaas_job_id(schedule_id: str) -> str:
    return f"riaas-schedule-{schedule_id}"


def register_riaas_schedule(schedule: ScheduleOut) -> None:
    from app.scheduler.jobs import run_riaas_scheduled_report

    scheduler = get_scheduler()
    job_id = _riaas_job_id(schedule.id)
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
    if not schedule.is_active or not schedule.recipients:
        return
    tz = get_settings().scheduler_tz
    try:
        trigger = CronTrigger.from_crontab(schedule.cron, timezone=tz)
    except Exception:
        logger.exception("invalid cron for riaas schedule %s: %s", schedule.id, schedule.cron)
        return
    job = scheduler.add_job(
        run_riaas_scheduled_report,
        trigger=trigger,
        args=[schedule.id],
        id=job_id,
        replace_existing=True,
    )
    logger.info(
        "registered riaas schedule %s with cron %s (next_run=%s)",
        schedule.id,
        schedule.cron,
        job.next_run_time,
    )


def unregister_riaas_schedule(schedule_id: str) -> None:
    try:
        get_scheduler().remove_job(_riaas_job_id(schedule_id))
    except Exception:
        pass


def sync_riaas_schedules() -> int:
    from app.services.riaas.riaas_schedule_service import get_ri_schedule_service

    n = 0
    for schedule in get_ri_schedule_service().list():
        if schedule.is_active and schedule.recipients:
            register_riaas_schedule(schedule)
            n += 1
    return n


def sync_all_schedules() -> int:
    """Re-register every active schedule from the table. Called at startup."""
    from app.services.schedule_service import get_schedule_service

    n = 0
    for schedule in get_schedule_service().list():
        if schedule.is_active and schedule.recipients:
            register_schedule(schedule)
            n += 1
    return n
