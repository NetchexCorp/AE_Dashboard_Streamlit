"""Storage for monthly reported bookings results (monthlyresults table).

These are *reported* numbers — assembled and tied out by finance each month —
not live Salesforce queries, so they are stored as one JSON document per
report month. A git-tracked seed (app/data/monthly_results_seed.json) provides
the initial months so the page works before any admin upload; stored months
always win over the seed.
"""
from __future__ import annotations

import json
import logging
import threading
from functools import lru_cache
from pathlib import Path

from app.schemas.monthly import MonthlyRecord
from app.storage.tables import TABLE_MONTHLY_RESULTS, get_table_client

logger = logging.getLogger(__name__)

_PARTITION = "mr"
_SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "monthly_results_seed.json"


def _load_seed() -> dict[str, dict]:
    try:
        with _SEED_PATH.open() as f:
            return json.load(f)
    except Exception as exc:  # pragma: no cover — seed ships with the app
        logger.error("monthly results seed unreadable: %s", exc)
        return {}


class MonthlyResultsService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._memory: dict[str, dict] = {}
        self._seed = _load_seed()

    def _client(self):
        return get_table_client(TABLE_MONTHLY_RESULTS)

    def _stored_months(self) -> dict[str, dict]:
        client = self._client()
        if client is None:
            with self._lock:
                return dict(self._memory)
        out: dict[str, dict] = {}
        try:
            for e in client.query_entities(f"PartitionKey eq '{_PARTITION}'"):
                try:
                    out[e["RowKey"]] = json.loads(e.get("Json", "{}"))
                except Exception:
                    logger.warning("monthlyresults row %s has invalid JSON", e.get("RowKey"))
        except Exception as exc:
            logger.error("monthlyresults query failed: %s", exc)
        return out

    def list_months(self) -> list[str]:
        months = set(self._seed) | set(self._stored_months())
        return sorted(months)

    def get(self, month: str) -> MonthlyRecord | None:
        client = self._client()
        raw: dict | None = None
        if client is not None:
            try:
                e = client.get_entity(_PARTITION, month)
                raw = json.loads(e.get("Json", "{}"))
            except Exception:
                raw = None
        else:
            with self._lock:
                raw = self._memory.get(month)
        if raw is None:
            raw = self._seed.get(month)
        if raw is None:
            return None
        try:
            return MonthlyRecord.model_validate(raw)
        except Exception as exc:
            logger.error("monthly record %s failed validation: %s", month, exc)
            return None

    def upsert(self, record: MonthlyRecord) -> MonthlyRecord:
        payload = record.model_dump()
        client = self._client()
        if client is None:
            with self._lock:
                self._memory[record.month] = payload
            return record
        client.upsert_entity(
            {
                "PartitionKey": _PARTITION,
                "RowKey": record.month,
                "Json": json.dumps(payload),
            }
        )
        return record


@lru_cache(maxsize=1)
def get_monthly_results_service() -> MonthlyResultsService:
    return MonthlyResultsService()
