from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.schemas.dashboard import DashboardResponse
from app.services.column_meta import ALL_SOURCE_SUMMARY

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

# Public dashboard link surfaced in the email footer.
DASHBOARD_URL = "https://aedash-ui.bravestone-4e7fe75c.eastus.azurecontainerapps.io/dashboard/summary"


def _money(v) -> str:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return "—"
    return f"${v:,.0f}"


def _percent(v) -> str:
    if v is None:
        return "—"
    return f"{(v * 100):.1f}%"


def _number(v) -> str:
    if v is None:
        return "—"
    return f"{int(v):,}"


def _aggregate(rows: list[dict]) -> dict:
    """Sum the summable currency columns across a set of All-Source rows.

    Mirrors the dashboard's Grand Total / Manager subtotal rollups (every
    column here is currency, so a plain null-safe sum is correct)."""
    n_sources = len(rows[0]["sources"]) if rows else 0

    def col(key: str) -> float:
        return sum((r.get(key) or 0) for r in rows)

    sources = [
        {
            "label": rows[0]["sources"][i]["label"] if rows else "",
            "bookings": sum((r["sources"][i].get("bookings") or 0) for r in rows),
            "pipeline": sum((r["sources"][i].get("pipeline") or 0) for r in rows),
        }
        for i in range(n_sources)
    ]
    return {
        "total_bookings": col("total_bookings"),
        "open_pipeline": col("open_pipeline"),
        "open_pipeline_needed": col("open_pipeline_needed"),
        "total_pipeline": col("total_pipeline"),
        "sources": sources,
    }


def _manager_groups(rows: list[dict]) -> list[dict]:
    """Group rows by manager → [{manager, count, subtotal, rows}], sorted by
    manager then AE name, matching the dashboard's grouped layout."""
    groups: dict[str, list[dict]] = {}
    for r in rows:
        key = r.get("ae_manager") or "(none)"
        groups.setdefault(key, []).append(r)
    return [
        {
            "manager": mgr,
            "count": len(grp),
            "subtotal": _aggregate(grp),
            "rows": sorted(grp, key=lambda x: (x.get("ae_name") or "").lower()),
        }
        for mgr, grp in sorted(groups.items(), key=lambda kv: kv[0].lower())
    ]


def _make_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
    )
    env.filters["money"] = _money
    env.filters["percent"] = _percent
    env.filters["number"] = _number
    return env


def render_all_source_summary(
    response: DashboardResponse,
    *,
    subject: str = "AE Performance — All Source Summary",
) -> str:
    env = _make_env()
    template = env.get_template("all_source_summary.html")
    fetched = datetime.fromtimestamp(response.fetched_at, tz=timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC"
    )
    rows = [row.model_dump() for row in response.all_source_summary]
    return template.render(
        subject=subject,
        period_start=response.period_start.isoformat(),
        period_end=response.period_end.isoformat(),
        fetched_at=fetched,
        sources=[{"label": s[0]} for s in ALL_SOURCE_SUMMARY],
        grand_total=_aggregate(rows) if rows else None,
        groups=_manager_groups(rows),
        kpis=[k.model_dump() for k in [*response.kpi_row_1, *response.kpi_row_2]],
        dashboard_url=DASHBOARD_URL,
    )
