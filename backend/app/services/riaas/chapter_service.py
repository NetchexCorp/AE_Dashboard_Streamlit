"""Chapter orchestration: run a chapter's analyses and shape chart-ready data.

Raw rows come from the analysis engine (per-analysis error isolation);
each analysis has a transform that turns rows into its viz payload.
Quarterly-trend analyses always cover the last 8 fiscal quarters (they are
inherently trend views); everything else honors the global time filter.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Callable

from app.analysis import store
from app.analysis.engine import run_analyses
from app.analysis.query_builder import build_filter_params
from app.analysis.registry import CHAPTER_SLUGS, chapter_analyses
from app.analysis.time_utils import quarter_of, quarter_series
from app.services.riaas.key_findings_service import get_key_findings_service
from app.services.riaas.metrics import WON, cohort_metrics, parse_dt

log = logging.getLogger(__name__)

TREND_QUARTERS = 8

DECISION_MAKER_TOKENS = (
    "ceo", "cfo", "coo", "cto", "cio", "chro", "chief", "president", "owner",
    "founder", "vp", "vice president", "director", "head of", "principal",
    "managing partner", "general manager",
)


def is_decision_maker(title: str) -> bool:
    t = title.lower()
    return any(tok in t for tok in DECISION_MAKER_TOKENS)


# ---- per-analysis transforms (rows → viz payload) ----


def _crm_complete(rows: list[dict]) -> dict:
    total = sum(r.get("n") or 0 for r in rows)
    untitled = sum(r.get("n") or 0 for r in rows if not r.get("Job_Title__c"))
    titled = total - untitled
    dm = sum(
        r.get("n") or 0
        for r in rows
        if r.get("Job_Title__c") and is_decision_maker(r["Job_Title__c"])
    )
    return {
        "total_contacts": total,
        "untitled": untitled,
        "pct_untitled": round(untitled / total, 4) if total else None,
        "titled": titled,
        "decision_makers": dm,
        "pct_dm_of_titled": round(dm / titled, 4) if titled else None,
        "note": "Job-title distribution capped at the 2000 most common values.",
    }


def _by_quarter(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        closed = parse_dt(r.get("CloseDate"))
        if closed:
            grouped[quarter_of(closed).label].append(r)
    return grouped


def _velocity_trend(rows: list[dict]) -> dict:
    grouped = _by_quarter(rows)
    quarters = []
    for q in quarter_series(TREND_QUARTERS):
        m = cohort_metrics(grouped.get(q["label"], []))
        quarters.append({"label": q["label"], **m})
    return {"quarters": quarters}


def _rps_trend(rows: list[dict]) -> dict:
    grouped = _by_quarter(rows)
    quarters = []
    for q in quarter_series(TREND_QUARTERS):
        qrows = grouped.get(q["label"], [])
        won = [r for r in qrows if r.get("StageName") == WON]
        bookings = sum(r.get("Amount") or 0 for r in won)
        sellers = {r.get("OwnerId") for r in won if r.get("OwnerId")}
        quarters.append(
            {
                "label": q["label"],
                "bookings": round(bookings, 2),
                "sellers": len(sellers),
                "rps": round(bookings / len(sellers), 2) if sellers else None,
            }
        )
    return {"quarters": quarters}


def _territory_efficiency(rows: list[dict]) -> dict:
    grouped: dict[str, list[dict]] = defaultdict(list)
    skipped = 0
    for r in rows:
        name = r.get("Account.Account_Territory__r.Name")
        if name:
            grouped[name].append(r)
        else:
            skipped += 1
    territories = []
    for name, trows in grouped.items():
        m = cohort_metrics(trows)
        if m["efficiency"] is None or m["deals"] < 5:
            continue  # too few closed deals for a meaningful efficiency
        territories.append({"name": name, **m})
    territories.sort(key=lambda t: t["efficiency"], reverse=True)
    gap = None
    if len(territories) >= 2:
        top, bottom = territories[0], territories[-1]
        gap = {
            "top": top["name"],
            "bottom": bottom["name"],
            "ratio": round(top["efficiency"] / bottom["efficiency"], 1)
            if bottom["efficiency"]
            else None,
        }
    return {
        "territories": territories,
        "gap": gap,
        "deals_without_territory": skipped,
    }


TRANSFORMS: dict[str, Callable[[list[dict]], dict]] = {
    "C1-CRM-COMPLETE": _crm_complete,
    "C1-VELOCITY-NB": _velocity_trend,
    "C1-VELOCITY-EXP": _velocity_trend,
    "C1-RPS-NB": _rps_trend,
    "C1-RPS-EXP": _rps_trend,
    "C1-TERR-EFF-GAP": _territory_efficiency,
}

# Quarterly-trend analyses pin their window to the last TREND_QUARTERS quarters.
TREND_ANALYSES = {"C1-VELOCITY-NB", "C1-VELOCITY-EXP", "C1-RPS-NB", "C1-RPS-EXP"}


def run_chapter(
    sf,
    slug: str,
    *,
    territory: str | None = None,
    seller_id: str | None = None,
    motion: str | None = None,
    period: str | None = None,
    custom_start=None,
    custom_end=None,
) -> dict:
    chapter = CHAPTER_SLUGS[slug]
    entries = chapter_analyses(chapter)
    overrides = store.load_overrides()

    params = build_filter_params(
        territory=territory, seller_id=seller_id, motion=motion,
        period=period, custom_start=custom_start, custom_end=custom_end,
    )
    trend_window = quarter_series(TREND_QUARTERS)
    trend_params = {
        **params,
        "period_start": trend_window[0]["start"],
        "period_end": trend_window[-1]["end"],
    }

    trend_entries = [e for e in entries if e.analysis_id in TREND_ANALYSES]
    other_entries = [e for e in entries if e.analysis_id not in TREND_ANALYSES]
    results = run_analyses(sf, other_entries, params, overrides)
    if trend_entries:
        results.update(run_analyses(sf, trend_entries, trend_params, overrides))

    analyses_out = []
    for entry in entries:
        res = results[entry.analysis_id]
        item = {
            "analysis_id": entry.analysis_id,
            "title": entry.title,
            "viz": entry.viz,
            "grain": entry.grain,
            "description": entry.description,
            "formula": entry.formula,
            "status": res["status"],
        }
        if res["status"] == "ok":
            transform = TRANSFORMS.get(entry.analysis_id)
            if transform is None:
                item["status"] = "pending"
                item["reason"] = "analysis not yet implemented"
            else:
                try:
                    item["data"] = transform(res["rows"])
                except Exception as exc:  # transform bugs stay isolated too
                    log.exception("%s transform failed", entry.analysis_id)
                    item["status"] = "error"
                    item["error"] = f"transform failed: {exc}"
        elif res["status"] == "computed":
            # Derived analyses get real payloads once their chapter service
            # implements them (Phase 4); until then they render as pending.
            item["status"] = "pending"
            item["reason"] = "derived analysis not yet implemented"
        elif res["status"] == "pending":
            item["reason"] = res.get("reason", "")
        elif res["status"] == "error":
            item["error"] = res.get("error", "")
        analyses_out.append(item)

    return {
        "slug": slug,
        "chapter": chapter,
        "analyses": analyses_out,
        "key_findings": get_key_findings_service().get(slug),
    }
