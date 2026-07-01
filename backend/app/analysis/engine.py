"""RIaaS analysis engine — executes registry analyses with per-analysis
error isolation (mirrors legacy/data_engine.py).

Every analysis resolves to a status:
  ok      — rows fetched (possibly empty)
  pending — blocked on unconfirmed fields, or template not yet implemented
  error   — the query failed; only this analysis is affected
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from app.analysis.field_dictionary import FIELD_DICTIONARY, unconfirmed
from app.analysis.query_builder import build_query
from app.analysis.registry import AnalysisEntry
from app.services.salesforce_client import SalesforceAuthError

log = logging.getLogger("app.analysis.engine")

_QUERY_ERROR_KEYWORDS = [
    "malformed_query", "invalid_field", "invalid_type",
    "no such column", "unexpected token", "invalid soql",
]
_non_retryable_failures: dict[str, str] = {}


def clear_failures() -> None:
    _non_retryable_failures.clear()


def _is_query_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(kw in msg for kw in _QUERY_ERROR_KEYWORDS)


def flatten_record(rec: dict) -> dict[str, Any]:
    """Flatten a simple-salesforce record: drop attributes, dot-join nesting."""
    out: dict[str, Any] = {}
    for k, v in rec.items():
        if k == "attributes":
            continue
        if isinstance(v, dict):
            for nk, nv in flatten_record(v).items():
                out[f"{k}.{nk}"] = nv
        else:
            out[k] = v
    return out


def _pending(entry: AnalysisEntry, reason: str) -> dict:
    return {"analysis_id": entry.analysis_id, "status": "pending", "reason": reason, "rows": []}


def run_analysis(
    sf, entry: AnalysisEntry, params: dict, overrides: dict[str, str] | None = None
) -> dict:
    """Execute one analysis. Never raises except for auth failures."""
    if entry.blocked:
        missing = unconfirmed(entry.fields_required)
        fields = ", ".join(FIELD_DICTIONARY[k].api_name for k in missing) or "field confirmation"
        return _pending(entry, f"pending Salesforce field confirmation: {fields}")
    if entry.computed:
        # Derived in the chapter service from other analyses.
        return {"analysis_id": entry.analysis_id, "status": "computed", "rows": []}
    template = (overrides or {}).get(entry.analysis_id) or entry.template
    if not template.strip():
        return _pending(entry, "analysis not yet implemented")
    if entry.analysis_id in _non_retryable_failures:
        return {
            "analysis_id": entry.analysis_id, "status": "error",
            "error": _non_retryable_failures[entry.analysis_id], "rows": [],
        }

    # A malformed override template ({typo} → KeyError) must fail only this
    # analysis, never the whole chapter request.
    try:
        soql = build_query(entry, params, template_override=template)
    except (KeyError, IndexError, ValueError) as exc:
        err = f"template error: {exc!r}"
        _non_retryable_failures[entry.analysis_id] = err
        log.error("%s FAILED (bad template): %s", entry.analysis_id, exc)
        return {"analysis_id": entry.analysis_id, "status": "error", "error": err, "rows": []}

    t0 = time.time()
    try:
        result = sf.query_all(soql)
        rows = [flatten_record(r) for r in result.get("records", [])]
        log.debug("%s: %d rows (%.1fs)", entry.analysis_id, len(rows), time.time() - t0)
        return {"analysis_id": entry.analysis_id, "status": "ok", "rows": rows}
    except SalesforceAuthError:
        raise
    except Exception as exc:
        if _is_query_error(exc):
            _non_retryable_failures[entry.analysis_id] = str(exc)
            log.error("%s FAILED (non-retryable): %s", entry.analysis_id, exc)
        else:
            log.warning("%s FAILED: %s", entry.analysis_id, exc)
        return {"analysis_id": entry.analysis_id, "status": "error", "error": str(exc)[:500], "rows": []}


def run_analyses(
    sf,
    entries: list[AnalysisEntry],
    params: dict,
    overrides: dict[str, str] | None = None,
    max_workers: int = 8,
) -> dict[str, dict]:
    """Run analyses concurrently; per-analysis isolation. {analysis_id: result}."""
    results: dict[str, dict] = {}
    runnable: list[AnalysisEntry] = []
    for entry in entries:
        if entry.blocked or entry.computed or not (
            (overrides or {}).get(entry.analysis_id) or entry.template
        ).strip():
            results[entry.analysis_id] = run_analysis(sf, entry, params, overrides)
        else:
            runnable.append(entry)
    if runnable:
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(run_analysis, sf, e, params, overrides): e for e in runnable
            }
            for fut in as_completed(futures):
                res = fut.result()
                results[res["analysis_id"]] = res
    return results
