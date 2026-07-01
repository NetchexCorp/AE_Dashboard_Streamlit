"""Chapter 3 (Pipeline Health) transforms.

C3-MATURITY is the chapter's shared open-pipeline fetch (spec §5.2 batching):
ICP share, MEDDIC adoption and the engagement/stalled risk views are computed
deps on its rows; slippage and account relationships have their own
child-object fetches, with the open cohort as denominator where needed.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from statistics import median

from app.analysis.time_utils import quarter_of
from app.services.riaas.metrics import parse_dt

MID_LATE_STAGES = ("Business Validation", "Commitment & Negotiation")
HIGH_ICP_MIN = 70
ENGAGEMENT_BENCHMARK = 60
STALL_FLOOR_DAYS = 30
AGED_DAYS = 180
ENGAGED_CONTACT_MIN = 30
LIST_CAP = 50

TERRITORY_KEY = "Account.Account_Territory__r.Name"

SCORE_COVERAGE_NOTE = (
    "Engagement scores exist on a minority of open deals (~17%); "
    "score-based KPIs reflect the scored cohort only."
)


def _amount(r: dict) -> float:
    return r.get("Amount") or 0


def _pct(part: float, whole: float) -> float | None:
    return round(part / whole, 4) if whole else None


def _by_territory(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        grouped[r.get(TERRITORY_KEY) or "No territory"].append(r)
    return grouped


# ---- shared risk helpers (also used by Chapter 4's coach focus) ----


def stage_medians(rows: list[dict]) -> dict[str, float]:
    """Median LastStageChangeInDays per stage across the open cohort."""
    by_stage: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        days = r.get("LastStageChangeInDays")
        if days is not None:
            by_stage[r.get("StageName")].append(days)
    return {stage: median(v) for stage, v in by_stage.items()}


def stall_threshold(stage_median: float) -> float:
    return max(STALL_FLOOR_DAYS, 2 * stage_median)


def is_stalled(row: dict, medians: dict[str, float]) -> bool:
    days = row.get("LastStageChangeInDays")
    med = medians.get(row.get("StageName"))
    return days is not None and med is not None and days > stall_threshold(med)


def age_days(row: dict, today: date | None = None) -> int | None:
    created = parse_dt(row.get("CreatedDate"))
    if created is None:
        return None
    return ((today or date.today()) - created).days


# ---- transforms ----


def _stage_split(rows: list[dict]) -> dict:
    total = sum(_amount(r) for r in rows)
    mid_late = sum(_amount(r) for r in rows if r.get("StageName") in MID_LATE_STAGES)
    return {
        "deals": len(rows),
        "pipeline": round(total, 2),
        "mid_late_pipeline": round(mid_late, 2),
        "pct_mid_late": _pct(mid_late, total),
    }


def _maturity(rows: list[dict]) -> dict:
    territories = [
        {"name": name, **_stage_split(trows)}
        for name, trows in _by_territory(rows).items()
    ]
    territories.sort(key=lambda t: t["pipeline"], reverse=True)
    return {
        "overall": _stage_split(rows),
        "territories": territories,
        "mid_late_stages": list(MID_LATE_STAGES),
    }


def _icp_share(_rows, deps) -> dict:
    cohort = deps["C3-MATURITY"]

    def is_high(r: dict) -> bool:
        score = r.get("Account.AI_Overall_Score__c")
        return score is not None and score >= HIGH_ICP_MIN

    def split(rows: list[dict]) -> dict:
        total = sum(_amount(r) for r in rows)
        high = sum(_amount(r) for r in rows if is_high(r))
        return {
            "pipeline": round(total, 2),
            "high_icp_pipeline": round(high, 2),
            "share": _pct(high, total),
        }

    by_quarter: dict = defaultdict(list)
    for r in cohort:
        close = parse_dt(r.get("CloseDate"))
        if close:
            by_quarter[quarter_of(close)].append(r)
    quarters = [
        {"label": q.label, **split(qrows)}
        for q, qrows in sorted(by_quarter.items(), key=lambda kv: (kv[0].year, kv[0].q))
    ]
    scored = sum(1 for r in cohort if r.get("Account.AI_Overall_Score__c") is not None)
    return {
        "overall": split(cohort),
        "quarters": quarters,
        "high_icp_min": HIGH_ICP_MIN,
        "account_score_coverage": _pct(scored, len(cohort)),
        "note": "High ICP = account ICP score ≥ 70; deals on unscored accounts count as not-high.",
    }


def _adoption(rows: list[dict]) -> dict:
    n = len(rows)
    with_note = sum(1 for r in rows if (r.get("AI_MEDDIC_Summary__c") or "").strip())
    with_score = sum(1 for r in rows if r.get("AI_Overall_Score__c") is not None)
    return {
        "deals": n,
        "pct_meddic_note": _pct(with_note, n),
        "pct_engagement_score": _pct(with_score, n),
    }


def _medd_adopt(_rows, deps) -> dict:
    cohort = deps["C3-MATURITY"]
    territories = [
        {"name": name, **_adoption(trows)}
        for name, trows in _by_territory(cohort).items()
    ]
    territories.sort(key=lambda t: t["deals"], reverse=True)
    return {"overall": _adoption(cohort), "territories": territories}


def _risk_engage(_rows, deps) -> dict:
    cohort = deps["C3-MATURITY"]
    scored = [r for r in cohort if r.get("AI_Overall_Score__c") is not None]
    at_risk = [r for r in scored if r["AI_Overall_Score__c"] < ENGAGEMENT_BENCHMARK]
    at_risk.sort(key=_amount, reverse=True)
    return {
        "benchmark": ENGAGEMENT_BENCHMARK,
        "at_risk_count": len(at_risk),
        "at_risk_value": round(sum(_amount(r) for r in at_risk), 2),
        "open_deals": len(cohort),
        "scored_deals": len(scored),
        "score_coverage": _pct(len(scored), len(cohort)),
        "deals": [
            {
                "seller": r.get("Owner.Name"),
                "opportunity": r.get("Account.Name"),
                "stage": r.get("StageName"),
                "amount": r.get("Amount"),
                "score": r.get("AI_Overall_Score__c"),
            }
            for r in at_risk[:LIST_CAP]
        ],
        "note": SCORE_COVERAGE_NOTE,
    }


def _risk_stalled(_rows, deps) -> dict:
    cohort = deps["C3-MATURITY"]
    medians = stage_medians(cohort)
    stalled = [r for r in cohort if is_stalled(r, medians)]
    stalled.sort(key=_amount, reverse=True)
    aged = sum(1 for r in cohort if (age_days(r) or 0) > AGED_DAYS)
    return {
        "stalled_count": len(stalled),
        "stalled_value": round(sum(_amount(r) for r in stalled), 2),
        "open_deals": len(cohort),
        "pct_aged_180": _pct(aged, len(cohort)),
        "stage_medians": {stage: round(m, 1) for stage, m in medians.items()},
        "deals": [
            {
                "seller": r.get("Owner.Name"),
                "opportunity": r.get("Account.Name"),
                "stage": r.get("StageName"),
                "amount": r.get("Amount"),
                "days_in_stage": r.get("LastStageChangeInDays"),
                "stage_median": round(medians[r.get("StageName")], 1),
            }
            for r in stalled[:LIST_CAP]
        ],
        "note": "Stalled = days in current stage > max(30, 2× the stage's median across open deals).",
    }


def _slip_days_by_opp(history_rows: list[dict]) -> tuple[dict[str, int], dict[str, dict]]:
    """Cumulative forward CloseDate pushes per opp + the opp's current attributes."""
    slip: dict[str, int] = defaultdict(int)
    meta: dict[str, dict] = {}
    for r in history_rows:
        opp_id = r.get("OpportunityId")
        if not opp_id:
            continue
        meta.setdefault(
            opp_id,
            {
                "seller": r.get("Opportunity.Owner.Name"),
                "opportunity": r.get("Opportunity.Account.Name"),
                "stage": r.get("Opportunity.StageName"),
                "amount": r.get("Opportunity.Amount"),
            },
        )
        old, new = parse_dt(r.get("OldValue")), parse_dt(r.get("NewValue"))
        if old and new and new > old:
            slip[opp_id] += (new - old).days
    return slip, meta


def _risk_slipped(rows: list[dict], deps) -> dict:
    open_deals = len(deps["C3-MATURITY"])
    slip, meta = _slip_days_by_opp(rows)
    slipped = {opp_id: days for opp_id, days in slip.items() if days > 0}
    by_stage: dict[str, dict] = defaultdict(lambda: {"deals": 0, "slip_days": 0})
    for opp_id, days in slipped.items():
        entry = by_stage[meta[opp_id]["stage"]]
        entry["deals"] += 1
        entry["slip_days"] += days
    stages = [
        {"stage": stage, **v, "avg_slip_days": round(v["slip_days"] / v["deals"], 1)}
        for stage, v in by_stage.items()
    ]
    stages.sort(key=lambda s: s["slip_days"], reverse=True)
    deals = [
        {**meta[opp_id], "slip_days": days}
        for opp_id, days in sorted(slipped.items(), key=lambda kv: -kv[1])[:LIST_CAP]
    ]
    return {
        "open_deals": open_deals,
        "slipped_deals": len(slipped),
        "pct_slipped_90": _pct(sum(1 for d in slipped.values() if d >= 90), open_deals),
        "pct_slipped_181": _pct(sum(1 for d in slipped.values() if d >= 181), open_deals),
        "stages": stages,
        "deals": deals,
        "note": "Slippage = cumulative forward CloseDate pushes (field history) per open deal; stage = the deal's current stage.",
    }


def _acct_relationship(rows: list[dict]) -> dict:
    accounts: dict[str, dict] = {}
    for r in rows:
        acct_id = r.get("Opportunity.AccountId")
        if not acct_id:
            continue
        acct = accounts.setdefault(
            acct_id,
            {"segment": r.get("Opportunity.Account.EmployeeRange__c") or "Unknown", "engaged": set()},
        )
        score = r.get("Contact.AI_Overall_Score__c")
        if r.get("ContactId") and score is not None and score >= ENGAGED_CONTACT_MIN:
            acct["engaged"].add(r["ContactId"])

    def bucket(n_engaged: int) -> str:
        if n_engaged == 0:
            return "not_engaged"
        return "single_threaded" if n_engaged == 1 else "multi_threaded"

    def empty() -> dict:
        return {"accounts": 0, "not_engaged": 0, "single_threaded": 0, "multi_threaded": 0}

    segments: dict[str, dict] = defaultdict(empty)
    overall = empty()
    for acct in accounts.values():
        b = bucket(len(acct["engaged"]))
        for target in (segments[acct["segment"]], overall):
            target["accounts"] += 1
            target[b] += 1

    def with_shares(counts: dict) -> dict:
        n = counts["accounts"]
        return {
            **counts,
            "pct_not_engaged": _pct(counts["not_engaged"], n),
            "pct_single_threaded": _pct(counts["single_threaded"], n),
            "pct_multi_threaded": _pct(counts["multi_threaded"], n),
        }

    return {
        "overall": with_shares(overall),
        "segments": [
            {"segment": seg, **with_shares(counts)}
            for seg, counts in sorted(segments.items())
        ],
        "engaged_score_min": ENGAGED_CONTACT_MIN,
        "note": "Accounts with open pipeline and contact roles only; engaged = contact with relationship score ≥ 30.",
    }


# fn or (fn, [dependency analysis ids]); fn(rows, deps_rows_by_id)
TRANSFORMS = {
    "C3-MATURITY": _maturity,
    "C3-ICP-SHARE": (_icp_share, ["C3-MATURITY"]),
    "C3-MEDD-ADOPT": (_medd_adopt, ["C3-MATURITY"]),
    "C3-RISK-ENGAGE": (_risk_engage, ["C3-MATURITY"]),
    "C3-RISK-STALLED": (_risk_stalled, ["C3-MATURITY"]),
    "C3-RISK-SLIPPED": (_risk_slipped, ["C3-MATURITY"]),
    "C3-ACCT-RELATIONSHIP": _acct_relationship,
}
