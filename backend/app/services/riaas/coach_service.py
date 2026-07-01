"""Chapter 4 (Coach) transforms — seller-grain leaderboards.

The org's territory field is account-based, so the actionable coaching grain
is the seller. C4-TERR-VELOCITY (closed cohort) and C4-COACH-FOCUS (open
pipeline) are the chapter's two fetches; C4-PIPE-COVERAGE combines its own
quota rows with both, and C4-TERR-VELOCITY reuses the quota rows for
attainment.
"""
from __future__ import annotations

from collections import defaultdict

from app.analysis.query_builder import EXPANSION_TYPES
from app.services.riaas.metrics import WON, cohort_metrics
from app.services.riaas.pipeline_service import (
    AGED_DAYS,
    ENGAGEMENT_BENCHMARK,
    age_days,
    is_stalled,
    stage_medians,
)

MIN_CLOSED_DEALS = 5


def _by_seller(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r.get("OwnerId"):
            grouped[r["OwnerId"]].append(r)
    return grouped


def _quota_by_owner(quota_rows: list[dict]) -> dict[str, float]:
    return {
        r["QuotaOwnerId"]: r.get("q") or 0
        for r in quota_rows
        if r.get("QuotaOwnerId")
    }


def _terr_velocity(rows: list[dict], deps) -> dict:
    quota = _quota_by_owner(deps["C4-PIPE-COVERAGE"])
    sellers = []
    for owner_id, deals in _by_seller(rows).items():
        if len(deals) < MIN_CLOSED_DEALS:
            continue
        m = cohort_metrics(deals)
        expansion = sum(
            r.get("Amount") or 0
            for r in deals
            if r.get("StageName") == WON and r.get("RecordType.Name") in EXPANSION_TYPES
        )
        owner_quota = quota.get(owner_id)
        sellers.append(
            {
                "seller_id": owner_id,
                "seller": deals[0].get("Owner.Name"),
                **m,
                "pct_bookings_expansion": round(expansion / m["bookings"], 4) if m["bookings"] else None,
                "quota": owner_quota,
                "attainment": round(m["bookings"] / owner_quota, 4) if owner_quota else None,
            }
        )
    sellers.sort(key=lambda s: (s["velocity"] is None, -(s["velocity"] or 0)))
    return {
        "sellers": sellers,
        "min_closed_deals": MIN_CLOSED_DEALS,
        "note": (
            "Seller grain (territory is account-based in this org). Attainment = "
            "bookings ÷ quota over the selected period; sellers without quota rows show no attainment."
        ),
    }


def _pipe_coverage(rows: list[dict], deps) -> dict:
    quota = _quota_by_owner(rows)
    # GROUP BY queries return the relationship field flat ("Name"), not nested.
    names = {
        r["QuotaOwnerId"]: r.get("Name") or r.get("QuotaOwner.Name")
        for r in rows
        if r.get("QuotaOwnerId")
    }
    bookings: dict[str, float] = defaultdict(float)
    for r in deps["C4-TERR-VELOCITY"]:
        if r.get("OwnerId") and r.get("StageName") == WON:
            bookings[r["OwnerId"]] += r.get("Amount") or 0
            names.setdefault(r["OwnerId"], r.get("Owner.Name"))
    pipeline: dict[str, float] = defaultdict(float)
    for r in deps["C4-COACH-FOCUS"]:
        if r.get("OwnerId"):
            pipeline[r["OwnerId"]] += r.get("Amount") or 0
            names.setdefault(r["OwnerId"], r.get("Owner.Name"))

    def coverage(pipe: float, owner_quota: float | None, booked: float) -> tuple[float | None, float | None]:
        if owner_quota is None:
            return None, None
        remaining = round(max(owner_quota - booked, 0), 2)
        return remaining, (round(pipe / remaining, 2) if remaining else None)

    sellers = []
    for owner_id in set(quota) | set(pipeline):
        owner_quota = quota.get(owner_id)
        booked = bookings.get(owner_id, 0.0)
        pipe = pipeline.get(owner_id, 0.0)
        remaining, ratio = coverage(pipe, owner_quota, booked)
        sellers.append(
            {
                "seller_id": owner_id,
                "seller": names.get(owner_id),
                "quota": owner_quota,
                "bookings": round(booked, 2),
                "open_pipeline": round(pipe, 2),
                "remaining_quota": remaining,
                "coverage": ratio,
            }
        )
    sellers.sort(key=lambda s: (s["coverage"] is None, s["coverage"] or 0))

    total_quota = sum(quota.values())
    total_bookings = sum(bookings[o] for o in quota)
    total_pipeline = round(sum(pipeline.values()), 2)
    remaining, ratio = coverage(total_pipeline, total_quota if quota else None, total_bookings)
    return {
        "sellers": sellers,
        "overall": {
            "quota": round(total_quota, 2),
            "bookings": round(total_bookings, 2),
            "open_pipeline": total_pipeline,
            "remaining_quota": remaining,
            "coverage": ratio,
        },
        "note": (
            "Coverage = open pipeline ÷ max(quota − bookings, 0) per seller; quota and "
            "bookings cover the selected period. Overall bookings count quota-carrying sellers only."
        ),
    }


def _coach_focus(rows: list[dict]) -> dict:
    medians = stage_medians(rows)
    sellers = []
    for owner_id, deals in _by_seller(rows).items():
        risks = {
            "low_engagement": sum(
                1 for r in deals
                if r.get("AI_Overall_Score__c") is not None
                and r["AI_Overall_Score__c"] < ENGAGEMENT_BENCHMARK
            ),
            "stalled": sum(1 for r in deals if is_stalled(r, medians)),
            "aged": sum(1 for r in deals if (age_days(r) or 0) > AGED_DAYS),
        }
        total = sum(risks.values())
        sellers.append(
            {
                "seller_id": owner_id,
                "seller": deals[0].get("Owner.Name"),
                "open_deals": len(deals),
                **risks,
                "total_risk": total,
                "focus": max(risks, key=risks.get) if total else None,
            }
        )
    sellers.sort(key=lambda s: (-s["total_risk"], s["seller"] or ""))
    return {
        "sellers": sellers,
        "note": (
            "Low engagement = scored open deals < 60; stalled = days in stage > "
            "max(30, 2× stage median); aged = open > 180 days. Focus = the seller's largest risk category."
        ),
    }


# fn or (fn, [dependency analysis ids]); fn(rows, deps_rows_by_id)
TRANSFORMS = {
    "C4-TERR-VELOCITY": (_terr_velocity, ["C4-PIPE-COVERAGE"]),
    "C4-PIPE-COVERAGE": (_pipe_coverage, ["C4-TERR-VELOCITY", "C4-COACH-FOCUS"]),
    "C4-COACH-FOCUS": _coach_focus,
}
