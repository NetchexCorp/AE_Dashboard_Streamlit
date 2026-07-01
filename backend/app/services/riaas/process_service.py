"""Chapter 5 (GTM Process Optimisation) transforms.

C5-CHANNEL-ROI's closed cohort powers ICP alignment and lead assignment;
C5-FUNNEL's OpportunityHistory fetch powers the territory matrix, adherence
and stage criteria.
"""
from __future__ import annotations

from collections import defaultdict
from statistics import median

from app.services.riaas.metrics import WON, cohort_metrics, parse_dt
from app.services.riaas.winloss_service import _group_metric, _win_rate, parse_meddic

FUNNEL_STAGES = ["Discovery", "Business Validation", "Commitment & Negotiation"]
LOST = "Closed/Lost"

MIN_DEALS = 5


def _channel_roi(rows: list[dict], deps=None) -> dict:
    # Unlike _group_metric, keep zero-win channels — a 0% win rate is the
    # whole point of a channel-ROI view.
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r.get("Opportunity_Source_Category__c"):
            groups[r["Opportunity_Source_Category__c"]].append(r)
    channels = [
        {"name": name, **cohort_metrics(g)}
        for name, g in groups.items()
        if len(g) >= MIN_DEALS
    ]
    channels.sort(key=lambda c: -(c["efficiency"] or 0))
    return {"channels": channels}


def _icp_align(_rows, deps) -> dict:
    cohort = deps["C5-CHANNEL-ROI"]
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in cohort:
        if r.get("Account.Industry"):
            groups[r["Account.Industry"]].append(r)
    stats = [
        {"industry": name, "deals": len(g), "win_rate": _win_rate(g)}
        for name, g in groups.items()
        if len(g) >= MIN_DEALS and _win_rate(g) is not None
    ]
    by_volume = sorted(stats, key=lambda s: -s["deals"])
    by_wr = sorted(stats, key=lambda s: -(s["win_rate"] or 0))
    vol_rank = {s["industry"]: i + 1 for i, s in enumerate(by_volume)}
    wr_rank = {s["industry"]: i + 1 for i, s in enumerate(by_wr)}
    for s in stats:
        s["volume_rank"] = vol_rank[s["industry"]]
        s["win_rate_rank"] = wr_rank[s["industry"]]
        s["rank_gap"] = s["volume_rank"] - s["win_rate_rank"]
        # positive gap ≥5 → wins better than volume suggests (under-invested);
        # negative ≤-5 → high volume, poor wins (over-invested).
        s["flag"] = (
            "under-invested" if s["rank_gap"] >= 5
            else "over-invested" if s["rank_gap"] <= -5
            else None
        )
    stats.sort(key=lambda s: s["volume_rank"])
    return {"industries": stats}


def _lead_assign(_rows, deps) -> dict:
    cohort = deps["C5-CHANNEL-ROI"]
    cells: dict[tuple[str, str], list[dict]] = defaultdict(list)
    seller_all: dict[str, list[dict]] = defaultdict(list)
    for r in cohort:
        seller, industry = r.get("Owner.Name"), r.get("Account.Industry")
        if seller and industry:
            cells[(seller, industry)].append(r)
            seller_all[seller].append(r)
    out = [
        {
            "seller": s, "industry": i, "deals": len(g),
            "win_rate": _win_rate(g),
            "seller_overall_win_rate": _win_rate(seller_all[s]),
        }
        for (s, i), g in sorted(cells.items())
        if len(g) >= MIN_DEALS
    ]
    return {"cells": out}


def _stage_timeline(rows: list[dict]) -> dict[str, dict]:
    """Per opportunity: {stage: first-entry date} + final stage."""
    deals: dict[str, dict] = defaultdict(lambda: {"stages": {}, "final": None})
    for r in rows:
        d = deals[r["OpportunityId"]]
        stage = r.get("StageName")
        ts = parse_dt(r.get("CreatedDate"))
        if stage and ts and (stage not in d["stages"] or ts < d["stages"][stage]):
            d["stages"][stage] = ts
        d["final"] = r.get("Opportunity.StageName") or d["final"]
        d["territory"] = r.get("Opportunity.Account.Account_Territory__r.Name")
    return deals


def _funnel_stats(deals: dict[str, dict]) -> list[dict]:
    stages_out = []
    for i, stage in enumerate(FUNNEL_STAGES):
        later = FUNNEL_STAGES[i + 1:]
        reached = [d for d in deals.values() if stage in d["stages"]]
        converted, durations = [], []
        for d in reached:
            entry = d["stages"][stage]
            next_entries = [d["stages"][s] for s in later if s in d["stages"]]
            won_entry = d["stages"].get(WON)
            exit_ts = min([t for t in next_entries + [won_entry] if t], default=None)
            if exit_ts or d["final"] == WON:
                converted.append(d)
                if exit_ts:
                    durations.append(max((exit_ts - entry).days, 0))
        stages_out.append(
            {
                "stage": stage,
                "reached": len(reached),
                "converted": len(converted),
                "conversion_rate": round(len(converted) / len(reached), 4) if reached else None,
                "median_days_in_stage": median(durations) if durations else None,
            }
        )
    return stages_out


def _funnel(rows: list[dict], deps=None) -> dict:
    deals = _stage_timeline(rows)
    won = sum(1 for d in deals.values() if d["final"] == WON)
    return {
        "stages": _funnel_stats(deals),
        "deals": len(deals),
        "won": won,
        "overall_win_rate": round(won / len(deals), 4) if deals else None,
    }


def _funnel_terr(_rows, deps) -> dict:
    deals = _stage_timeline(deps["C5-FUNNEL"])
    by_terr: dict[str, dict[str, dict]] = defaultdict(dict)
    for opp_id, d in deals.items():
        terr = d.get("territory")
        if terr:
            by_terr[terr][opp_id] = d
    out = []
    for terr, tdeals in by_terr.items():
        if len(tdeals) < 10:
            continue
        out.append({"territory": terr, "deals": len(tdeals), "stages": _funnel_stats(tdeals)})
    out.sort(key=lambda t: -t["deals"])
    return {"territories": out}


def _adherence(_rows, deps) -> dict:
    deals = _stage_timeline(deps["C5-FUNNEL"])
    won_deals = [d for d in deals.values() if d["final"] == WON]
    stages = []
    for stage in FUNNEL_STAGES:
        skipped = sum(1 for d in won_deals if stage not in d["stages"])
        stages.append(
            {
                "stage": stage,
                "skipped": skipped,
                "skip_rate": round(skipped / len(won_deals), 4) if won_deals else None,
            }
        )
    return {"stages": stages, "won_deals": len(won_deals),
            "note": "Share of won deals whose stage history never recorded the stage."}


def _medd_by_stage(rows: list[dict], deps=None) -> dict:
    by_stage: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        score, _ = parse_meddic(r.get("AI_MEDDIC_Summary__c"))
        if score is not None and r.get("StageName"):
            by_stage[r["StageName"]].append(score)
    stages = [
        {"stage": s, "avg_coverage": round(sum(v) / len(v), 2), "deals": len(v)}
        for s, v in by_stage.items()
        if len(v) >= 3
    ]
    stages.sort(key=lambda s: -s["deals"])
    return {"stages": stages,
            "note": "MEDDIC coverage (0–6) parsed from AI summaries on open, AI-scored deals — small cohort."}


def _stage_criteria(_rows, deps) -> dict:
    deals = _stage_timeline(deps["C5-FUNNEL"])
    won_deals = [d for d in deals.values() if d["final"] == WON]
    criteria = []
    for i, stage in enumerate(FUNNEL_STAGES):
        later = FUNNEL_STAGES[i + 1:]
        durations = []
        recorded = 0
        for d in won_deals:
            if stage not in d["stages"]:
                continue
            recorded += 1
            entry = d["stages"][stage]
            nxt = [d["stages"][s] for s in later if s in d["stages"]] + (
                [d["stages"][WON]] if WON in d["stages"] else []
            )
            if nxt:
                durations.append(max((min(nxt) - entry).days, 0))
        criteria.append(
            {
                "stage": stage,
                "recorded_share": round(recorded / len(won_deals), 4) if won_deals else None,
                "median_days_won": median(durations) if durations else None,
            }
        )
    return {"stages": criteria, "won_deals": len(won_deals),
            "note": "Won-deal benchmarks: how often winners record each stage and how long they spend in it."}


TRANSFORMS = {
    "C5-CHANNEL-ROI": _channel_roi,
    "C5-ICP-ALIGN": (_icp_align, ["C5-CHANNEL-ROI"]),
    "C5-LEAD-ASSIGN": (_lead_assign, ["C5-CHANNEL-ROI"]),
    "C5-FUNNEL": _funnel,
    "C5-FUNNEL-TERR": (_funnel_terr, ["C5-FUNNEL"]),
    "C5-ADHERENCE": (_adherence, ["C5-FUNNEL"]),
    "C5-MEDD-BY-STAGE": _medd_by_stage,
    "C5-STAGE-CRITERIA": (_stage_criteria, ["C5-FUNNEL"]),
}
