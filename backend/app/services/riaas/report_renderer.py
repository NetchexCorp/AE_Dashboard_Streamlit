"""Revenue Insights Report — assembles all five chapters into printable HTML.

The chapter payloads are heterogeneous, so each analysis is normalized into
simple KPI lists and tables here; the Jinja template stays dumb (email-safe
HTML, inline styles, no JS).
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.analysis.registry import CHAPTER_SLUGS, CHAPTER_TITLES
from app.services.riaas.chapter_service import run_chapter

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"

MAX_ROWS = 15
MAX_COLS = 8

_PCT_KEYS = (
    "rate", "share", "pct", "attainment", "coverage_ratio",
)
_MONEY_KEYS = ("amount", "bookings", "acv", "rps", "velocity", "quota", "pipeline")


def _fmt(key: str, v) -> str:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return "—"
    k = key.lower()
    if isinstance(v, (int, float)):
        if any(t in k for t in _PCT_KEYS) and -1.5 <= v <= 1.5:
            return f"{v * 100:.1f}%"
        if any(t in k for t in _MONEY_KEYS):
            return f"${v:,.0f}"
        if isinstance(v, float):
            return f"{v:,.2f}".rstrip("0").rstrip(".")
        return f"{v:,}"
    return str(v)


def _label(key: str) -> str:
    return key.replace("_", " ").replace(".", " › ").title()


def _normalize(data: dict) -> dict:
    """Split an analysis payload into {kpis: [(label, value)], tables: [...]}"""
    kpis: list[tuple[str, str]] = []
    tables = []
    for key, value in data.items():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            headers = [h for h in value[0].keys() if not h.startswith("_")][:MAX_COLS]
            rows = [[_fmt(h, r.get(h)) for h in headers] for r in value[:MAX_ROWS]]
            tables.append(
                {
                    "title": _label(key),
                    "headers": [_label(h) for h in headers],
                    "rows": rows,
                    "truncated": max(len(value) - MAX_ROWS, 0),
                }
            )
        elif isinstance(value, dict):
            for k2, v2 in value.items():
                if not isinstance(v2, (list, dict)):
                    kpis.append((f"{_label(key)} — {_label(k2)}", _fmt(k2, v2)))
        elif key not in ("note",):
            kpis.append((_label(key), _fmt(key, value)))
    return {"kpis": kpis, "tables": tables, "note": data.get("note")}


def build_report_context(sf, filters: dict | None = None) -> dict:
    f = filters or {}
    chapters = []
    for slug in CHAPTER_SLUGS:
        title = CHAPTER_TITLES[slug]
        result = run_chapter(
            sf,
            slug,
            territory=f.get("territory"),
            seller_id=f.get("seller_id"),
            motion=f.get("motion"),
            period=f.get("period"),
        )
        analyses = []
        for a in result["analyses"]:
            item = {
                "title": a["title"],
                "status": a["status"],
                "description": a["description"],
                "reason": a.get("reason"),
                "error": a.get("error"),
            }
            if a["status"] == "ok":
                item.update(_normalize(a.get("data") or {}))
            analyses.append(item)
        chapters.append(
            {
                "slug": slug,
                "title": title,
                "key_findings": result["key_findings"].get("text", ""),
                "analyses": analyses,
            }
        )
    return {
        "chapters": chapters,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "period": f.get("period") or "last_4_quarters",
        "motion": f.get("motion") or "all",
    }


def render_revenue_insights_report(
    sf, *, subject: str = "Revenue Insights Report", filters: dict | None = None
) -> str:
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template("revenue_insights_report.html")
    return template.render(subject=subject, **build_report_context(sf, filters))
