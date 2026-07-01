"""Per-chapter editable "Key Findings" narrative (RiKeyFindings table)."""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from functools import lru_cache

from app.storage.tables import TABLE_RI_KEY_FINDINGS, get_table_client

logger = logging.getLogger(__name__)

_PARTITION = "kf"


class KeyFindingsService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._memory: dict[str, dict] = {}

    def _client(self):
        return get_table_client(TABLE_RI_KEY_FINDINGS)

    def get(self, chapter_slug: str) -> dict:
        client = self._client()
        if client is None:
            with self._lock:
                return dict(self._memory.get(chapter_slug) or {"text": "", "updated_by": "", "updated_at": ""})
        try:
            e = client.get_entity(_PARTITION, chapter_slug)
            return {
                "text": e.get("Text", ""),
                "updated_by": e.get("UpdatedBy", ""),
                "updated_at": e.get("UpdatedAt", ""),
            }
        except Exception:
            return {"text": "", "updated_by": "", "updated_at": ""}

    def save(self, chapter_slug: str, text: str, actor: str) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        row = {"text": text, "updated_by": actor, "updated_at": now}
        client = self._client()
        if client is None:
            with self._lock:
                self._memory[chapter_slug] = row
            return row
        try:
            client.upsert_entity(
                {
                    "PartitionKey": _PARTITION,
                    "RowKey": chapter_slug,
                    "Text": text,
                    "UpdatedBy": actor,
                    "UpdatedAt": now,
                }
            )
        except Exception:
            logger.exception("key findings save failed (%s)", chapter_slug)
        return row


@lru_cache
def get_key_findings_service() -> KeyFindingsService:
    return KeyFindingsService()


def reset_key_findings_service() -> None:
    get_key_findings_service.cache_clear()
