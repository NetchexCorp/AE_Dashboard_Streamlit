"""Persistent RIaaS analysis-template storage (mirrors legacy/soql_store.py).

Authoritative runtime source is the RiAnalyses table keyed by analysis_id,
with RiAnalysesHistory rows per save. Local JSON fallback in dev. Writes are
gated by ALLOW_PROD_QUERY_WRITES when Table Storage is active.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_LOCAL_FILE = Path(__file__).resolve().parents[3] / "riaas_analyses_overrides.json"
_PARTITION = "analysis"


class AnalysisWriteForbidden(Exception):
    pass


def _conn_str() -> Optional[str]:
    return os.environ.get("AZURE_STORAGE_CONNECTION_STRING") or None


def _writes_enabled() -> bool:
    raw = os.environ.get("ALLOW_PROD_QUERY_WRITES", "")
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _table_client(table: str):
    if not _conn_str():
        return None
    from app.storage.tables import get_table_client

    return get_table_client(table)


def load_overrides() -> dict[str, str]:
    from app.storage.tables import TABLE_RI_ANALYSES

    client = _table_client(TABLE_RI_ANALYSES)
    if client is None:
        return _load_local()
    try:
        return {
            e["RowKey"]: e.get("Template", "")
            for e in client.query_entities(f"PartitionKey eq '{_PARTITION}'")
        }
    except Exception as exc:
        logger.warning("RiAnalyses load failed, falling back to local: %s", exc)
        return _load_local()


def load_history(analysis_id: str, limit: int = 25) -> list[dict[str, Any]]:
    from app.storage.tables import TABLE_RI_ANALYSES_HISTORY

    client = _table_client(TABLE_RI_ANALYSES_HISTORY)
    if client is None:
        return []
    try:
        rows = [
            {
                "version": e["RowKey"],
                "template": e.get("Template", ""),
                "saved_by": e.get("SavedBy", ""),
                "saved_at": e.get("RowKey", ""),
            }
            for e in client.query_entities(f"PartitionKey eq '{analysis_id}'")
        ]
        rows.sort(key=lambda r: r["version"], reverse=True)
        return rows[:limit]
    except Exception:
        logger.exception("load_history(%s) failed", analysis_id)
        return []


def save_override(analysis_id: str, template: str, actor: str = "") -> None:
    from app.storage.tables import TABLE_RI_ANALYSES, TABLE_RI_ANALYSES_HISTORY

    if _conn_str() and not _writes_enabled():
        raise AnalysisWriteForbidden(
            "Writes to the production analysis store are disabled. "
            "Set ALLOW_PROD_QUERY_WRITES=true to enable."
        )
    client = _table_client(TABLE_RI_ANALYSES)
    if client is None:
        _save_local(analysis_id, template)
        return
    now = datetime.now(timezone.utc).isoformat()
    client.upsert_entity(
        {
            "PartitionKey": _PARTITION,
            "RowKey": analysis_id,
            "Template": template,
            "UpdatedAt": now,
            "UpdatedBy": actor,
        }
    )
    hist = _table_client(TABLE_RI_ANALYSES_HISTORY)
    if hist is not None:
        try:
            hist.create_entity(
                {
                    "PartitionKey": analysis_id,
                    "RowKey": now,
                    "Template": template,
                    "SavedBy": actor,
                }
            )
        except Exception:
            logger.warning("history append failed for %s (likely race)", analysis_id)


def _load_local() -> dict[str, str]:
    if not _LOCAL_FILE.exists():
        return {}
    try:
        return json.loads(_LOCAL_FILE.read_text())
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("local analysis overrides load failed: %s", e)
        return {}


def _save_local(analysis_id: str, template: str) -> None:
    current = _load_local()
    current[analysis_id] = template
    _LOCAL_FILE.write_text(json.dumps(current, indent=2))
