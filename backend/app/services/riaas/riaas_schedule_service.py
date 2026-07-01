"""RIaaS report schedules — same shape as ScheduleService, own table so
RIaaS jobs never entangle the AE digest jobs."""
from __future__ import annotations

from functools import lru_cache

from app.services.schedule_service import ScheduleService
from app.storage.tables import TABLE_RI_SCHEDULES, get_table_client


class RiScheduleService(ScheduleService):
    def _client(self):
        return get_table_client(TABLE_RI_SCHEDULES)


@lru_cache
def get_ri_schedule_service() -> RiScheduleService:
    return RiScheduleService()


def reset_ri_schedule_service() -> None:
    get_ri_schedule_service.cache_clear()
