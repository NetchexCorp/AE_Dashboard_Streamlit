"""Chapter 2 (Win/Loss & Benchmark) transforms.

Several analyses derive from shared fetches (spec §5.2 batching):
C2-EFF-DEALSIZE's cohort powers the age/cycle/industry/ICP breakdowns and the
slippage denominator; C2-MULTITHREAD-WR's contact-role fetch powers personas.
"""
from __future__ import annotations

import re
from collections import defaultdict
from statistics import median

from app.services.riaas.metrics import WON, cohort_metrics, cycle_days, parse_dt

# Deal-size bands sized to org ACV (~$5k NB): label, lower, upper.
SIZE_BANDS = [
    ("<$5k", 0, 5_000),
    ("$5–15k", 5_000, 15_000),
    ("$15–50k", 15_000, 50_000),
    ("$50–150k", 50_000, 150_000),
    ("$150k+", 150_000, float("inf")),
]

SCORE_BANDS = [("0–30", 0, 30), ("31–60", 30, 60), ("61–90", 60, 90), ("91–100", 90, 101)]
AGE_BANDS = [("1–30", 0, 30), ("31–90", 30, 90), ("91–180", 90, 180), ("181–360", 180, 360), ("361+", 360, float("inf"))]
SLIP_BUCKETS = [("0", 0, 1), ("1–60", 1, 61), ("61–180", 61, 181), ("181+", 181, float("inf"))]
THREAD_BANDS = [("0", 0, 1), ("1", 1, 2), ("2", 2, 3), ("3", 3, 4), ("4+", 4, float("inf"))]

ENGAGED_SCORE_MIN = 30  # deck: multi-threading counts stakeholders with score ≥ 30


def _band(value: float | None, bands) -> str | None:
    if value is None:
        return None
    for label, lo, hi in bands:
        if lo <= value < hi:
            return label
    return None


def size_band(amount: float | None) -> str | None:
    return _band(amount or 0, SIZE_BANDS)


def _win_rate(rows: list[dict]) -> float | None:
    n = len(rows)
    if not n:
        return None
    won = sum(1 for r in rows if r.get("StageName") == WON)
    return round(won / n, 4)


def _rate_table(groups: dict[str, list[dict]], order: list[str]) -> list[dict]:
    return [
        {"label": label, "deals": len(groups.get(label, [])), "win_rate": _win_rate(groups.get(label, []))}
        for label in order
        if label in groups
    ]


# ---- MEDDIC parsing (AI_MEDDIC_Summary__c header) ----

_MEDDIC_SCORE_RE = re.compile(r"MEDDIC COVERAGE:\s*(\d)\s*/\s*6")
_MEDDIC_ELEMENT_RE = re.compile(r"<b>([A-Z][A-Z /&]+?)\s*\|\s*(✅|❌)")


def parse_meddic(summary: str | None) -> tuple[int | None, dict[str, bool]]:
    """(coverage 0–6, {element: confirmed}) from the AI MEDDIC summary header."""
    if not summary:
        return None, {}
    m = _MEDDIC_SCORE_RE.search(summary)
    score = int(m.group(1)) if m else None
    elements = {
        name.strip().title(): mark == "✅"
        for name, mark in _MEDDIC_ELEMENT_RE.findall(summary)
    }
    return score, elements


# ---- transforms (fn(rows, deps) → viz payload) ----


def _engage_conv(rows: list[dict], deps=None) -> dict:
    cells: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        sb = size_band(r.get("Amount"))
        eb = _band(r.get("AI_Overall_Score__c"), SCORE_BANDS)
        if sb and eb:
            cells[(sb, eb)].append(r)
    out = [
        {"size_band": sb, "score_band": eb, "deals": len(v), "win_rate": _win_rate(v)}
        for (sb, eb), v in sorted(cells.items())
    ]
    return {"cells": out, "scored_deals": len(rows),
            "note": "Engagement scores exist on a small share of deals; rates reflect the scored cohort only."}


def _slippage_days_by_opp(history_rows: list[dict]) -> dict[str, int]:
    slip: dict[str, int] = defaultdict(int)
    for r in history_rows:
        old, new = parse_dt(r.get("OldValue")), parse_dt(r.get("NewValue"))
        if old and new and new > old:
            slip[r["OpportunityId"]] += (new - old).days
    return slip


def _slippage_wr(rows: list[dict], deps) -> dict:
    cohort = deps["C2-EFF-DEALSIZE"]
    slip = _slippage_days_by_opp(rows)
    groups: dict[str, list[dict]] = defaultdict(list)
    for deal in cohort:
        bucket = _band(slip.get(deal.get("Id"), 0), SLIP_BUCKETS)
        if bucket:
            groups[bucket].append(deal)
    return {"buckets": _rate_table(groups, [b[0] for b in SLIP_BUCKETS])}


def _qual_wr(rows: list[dict], deps=None) -> dict:
    scored = []
    for r in rows:
        score, _ = parse_meddic(r.get("AI_MEDDIC_Summary__c"))
        if score is not None:
            scored.append({**r, "_meddic": score})
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in scored:
        groups[_band(r["_meddic"], [("0–1", 0, 2), ("2–3", 2, 4), ("4–6", 4, 7)])].append(r)
    ge3 = [r for r in scored if r["_meddic"] >= 3]
    lt3 = [r for r in scored if r["_meddic"] < 3]
    return {
        "buckets": _rate_table(groups, ["0–1", "2–3", "4–6"]),
        "ge3": {"deals": len(ge3), "win_rate": _win_rate(ge3)},
        "lt3": {"deals": len(lt3), "win_rate": _win_rate(lt3)},
        "scored_deals": len(scored),
        "note": "MEDDIC coverage (0–6) parsed from the AI MEDDIC summary; AI-scored deals only.",
    }


def _medd_elements(_rows, deps) -> dict:
    elements: dict[str, dict[str, list[bool]]] = defaultdict(lambda: {"won": [], "lost": []})
    for r in deps["C2-QUAL-WR"]:
        _, els = parse_meddic(r.get("AI_MEDDIC_Summary__c"))
        outcome = "won" if r.get("StageName") == WON else "lost"
        for name, confirmed in els.items():
            elements[name][outcome].append(confirmed)
    out = []
    for name, sides in elements.items():
        out.append(
            {
                "element": name,
                "won_rate": round(sum(sides["won"]) / len(sides["won"]), 4) if sides["won"] else None,
                "lost_rate": round(sum(sides["lost"]) / len(sides["lost"]), 4) if sides["lost"] else None,
                "won_n": len(sides["won"]),
                "lost_n": len(sides["lost"]),
            }
        )
    return {"elements": out,
            "note": "Element confirmation rate (✅ share) in won vs lost deals, from AI MEDDIC summaries."}


def _eff_dealsize(rows: list[dict], deps=None) -> dict:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        b = size_band(r.get("Amount"))
        if b:
            groups[b].append(r)
    bands = [
        {"band": label, **cohort_metrics(groups.get(label, []))}
        for label, _, _ in SIZE_BANDS
        if groups.get(label)
    ]
    return {"bands": bands}


def _cycle_age_wr(_rows, deps) -> dict:
    cells: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in deps["C2-EFF-DEALSIZE"]:
        age = cycle_days(r)
        ab = _band(age, AGE_BANDS)
        sb = size_band(r.get("Amount"))
        if ab and sb:
            cells[(sb, ab)].append(r)
    out = [
        {"size_band": sb, "age_band": ab, "deals": len(v), "win_rate": _win_rate(v)}
        for (sb, ab), v in sorted(cells.items())
    ]
    return {"cells": out, "age_bands": [a[0] for a in AGE_BANDS]}


def _median_cycle(_rows, deps) -> dict:
    groups: dict[str, dict[str, list[int]]] = defaultdict(lambda: {"won": [], "lost": []})
    for r in deps["C2-EFF-DEALSIZE"]:
        b = size_band(r.get("Amount"))
        c = cycle_days(r)
        if b and c is not None:
            groups[b]["won" if r.get("StageName") == WON else "lost"].append(c)
    bands = []
    for label, _, _ in SIZE_BANDS:
        if label not in groups:
            continue
        g = groups[label]
        bands.append(
            {
                "band": label,
                "won_median_days": median(g["won"]) if g["won"] else None,
                "lost_median_days": median(g["lost"]) if g["lost"] else None,
                "won_n": len(g["won"]),
                "lost_n": len(g["lost"]),
            }
        )
    return {"bands": bands}


def _group_metric(rows: list[dict], key: str, min_deals: int = 5) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        val = r.get(key)
        if val:
            groups[val].append(r)
    out = []
    for name, g in groups.items():
        m = cohort_metrics(g)
        if m["deals"] >= min_deals and m["efficiency"] is not None:
            out.append({"name": name, **m})
    out.sort(key=lambda x: x["efficiency"], reverse=True)
    return out


def _eff_industry(_rows, deps) -> dict:
    cohort = deps["C2-EFF-DEALSIZE"]
    industries = _group_metric(cohort, "Account.Industry")
    total = sum(i["deals"] for i in industries)
    top5 = sum(i["deals"] for i in industries[:5])
    return {
        "industries": industries,
        "top5_volume_share": round(top5 / total, 4) if total else None,
    }


def _eff_icp(_rows, deps) -> dict:
    cohort = deps["C2-EFF-DEALSIZE"]
    return {
        "employee_range": _group_metric(cohort, "Account.EmployeeRange__c"),
        "icp_industry_group": _group_metric(cohort, "Account.ICP_Industry_Group__c"),
    }


def _threading_by_opp(ocr_rows: list[dict]) -> dict[str, set]:
    engaged: dict[str, set] = defaultdict(set)
    for r in ocr_rows:
        score = r.get("Contact.AI_Overall_Score__c")
        if score is not None and score >= ENGAGED_SCORE_MIN:
            engaged[r["OpportunityId"]].add(r.get("ContactId"))
    return engaged


def _multithread_wr(rows: list[dict], deps) -> dict:
    cohort = deps["C2-EFF-DEALSIZE"]
    engaged = _threading_by_opp(rows)
    groups: dict[str, list[dict]] = defaultdict(list)
    counts = {"won": [], "lost": []}
    for deal in cohort:
        n = len(engaged.get(deal.get("Id"), ()))
        b = _band(n, THREAD_BANDS)
        if b:
            groups[b].append(deal)
        counts["won" if deal.get("StageName") == WON else "lost"].append(n)
    return {
        "bands": _rate_table(groups, [b[0] for b in THREAD_BANDS]),
        "avg_stakeholders_won": round(sum(counts["won"]) / len(counts["won"]), 2) if counts["won"] else None,
        "avg_stakeholders_lost": round(sum(counts["lost"]) / len(counts["lost"]), 2) if counts["lost"] else None,
        "note": f"Engaged stakeholder = contact role with relationship score ≥ {ENGAGED_SCORE_MIN}.",
    }


# ---- persona classification (job title → seniority / department) ----

# Tokens match at word boundaries (prefix-open on the right so "financ"
# matches "finance"/"financial" but "cto" can't match inside "director").
_SENIORITY = [
    ("C-Suite", ("chief", "ceo", "cfo", "coo", "cto", "cio", "chro", "president", "owner", "founder", "managing partner")),
    ("VP", ("vp", "vice president")),
    ("Director", ("director", "head of")),
    ("Manager", ("manager", "supervisor", "controller")),
]

_DEPARTMENT = [
    ("HR", ("hr", "human resource", "people", "talent", "benefit", "chro", "payroll")),
    ("Finance", ("cfo", "financ", "accountant", "accounting", "accounts payable", "controller", "bookkeep", "treasur")),
    ("Executive", ("ceo", "president", "owner", "founder", "coo", "general manager", "managing")),
    ("IT", ("cto", "cio", "technolog", "information", "it", "system")),
    ("Operations", ("operation", "office manager", "administrat", "ops")),
    ("Sales/Marketing", ("sales", "marketing", "business development", "revenue")),
]


def _matches(text: str, tokens: tuple[str, ...]) -> bool:
    return any(re.search(r"\b" + re.escape(tok), text) for tok in tokens)


def classify_persona(title: str | None) -> tuple[str, str]:
    if not title:
        return "Unknown", "Unknown"
    t = title.lower()
    seniority = next((label for label, toks in _SENIORITY if _matches(t, toks)), "Other")
    dept = next((label for label, toks in _DEPARTMENT if _matches(t, toks)), "Other")
    return dept, seniority


def _persona_won(_rows, deps) -> dict:
    # "Engaged" persona per the global definition: relationship score ≥ 30.
    roles = [
        r for r in deps["C2-MULTITHREAD-WR"]
        if r.get("Opportunity.StageName") == WON
        and (r.get("Contact.AI_Overall_Score__c") or 0) >= ENGAGED_SCORE_MIN
    ]
    cells: dict[tuple[str, str], int] = defaultdict(int)
    untitled = 0
    for r in roles:
        dept, sen = classify_persona(r.get("Contact.Job_Title__c"))
        if dept == "Unknown":
            untitled += 1
        cells[(dept, sen)] += 1
    total = len(roles)
    return {
        "cells": [
            {"department": d, "seniority": s, "count": n, "share": round(n / total, 4)}
            for (d, s), n in sorted(cells.items(), key=lambda kv: -kv[1])
        ],
        "total_roles": total,
        "pct_untitled": round(untitled / total, 4) if total else None,
    }


def _persona_impact(_rows, deps) -> dict:
    ocr = deps["C2-MULTITHREAD-WR"]
    deals: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    all_deals: dict[str, dict] = {}
    for r in ocr:
        opp_id = r["OpportunityId"]
        deal = {"StageName": r.get("Opportunity.StageName")}
        all_deals[opp_id] = deal
        dept, sen = classify_persona(r.get("Contact.Job_Title__c"))
        deals[(dept, sen)][opp_id] = deal
    overall = _win_rate(list(all_deals.values()))
    cells = [
        {
            "department": d, "seniority": s,
            "deals": len(m), "win_rate": _win_rate(list(m.values())),
        }
        for (d, s), m in sorted(deals.items())
        if len(m) >= 5
    ]
    return {"cells": cells, "overall_win_rate": overall}


# fn or (fn, [dependency analysis ids]); fn(rows, deps_rows_by_id)
TRANSFORMS = {
    "C2-ENGAGE-CONV": _engage_conv,
    "C2-SLIPPAGE-WR": (_slippage_wr, ["C2-EFF-DEALSIZE"]),
    "C2-QUAL-WR": _qual_wr,
    "C2-MEDD-ELEMENTS": (_medd_elements, ["C2-QUAL-WR"]),
    "C2-EFF-DEALSIZE": _eff_dealsize,
    "C2-CYCLE-AGE-WR": (_cycle_age_wr, ["C2-EFF-DEALSIZE"]),
    "C2-MEDIAN-CYCLE": (_median_cycle, ["C2-EFF-DEALSIZE"]),
    "C2-EFF-INDUSTRY": (_eff_industry, ["C2-EFF-DEALSIZE"]),
    "C2-EFF-ICP": (_eff_icp, ["C2-EFF-DEALSIZE"]),
    "C2-MULTITHREAD-WR": (_multithread_wr, ["C2-EFF-DEALSIZE"]),
    "C2-PERSONA-WON": (_persona_won, ["C2-MULTITHREAD-WR"]),
    "C2-PERSONA-IMPACT": (_persona_impact, ["C2-MULTITHREAD-WR"]),
}
