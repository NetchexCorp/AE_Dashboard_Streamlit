from __future__ import annotations

from app.services.riaas.process_service import (
    _adherence,
    _channel_roi,
    _funnel,
    _icp_align,
    _lead_assign,
    _medd_by_stage,
    _stage_criteria,
)


def _hist(opp: str, stage: str, ts: str, final: str, terr: str = "T1") -> dict:
    return {
        "OpportunityId": opp,
        "StageName": stage,
        "CreatedDate": ts,
        "Opportunity.StageName": final,
        "Opportunity.Account.Account_Territory__r.Name": terr,
    }


def _won_deal_history(opp: str) -> list[dict]:
    return [
        _hist(opp, "Discovery", "2026-01-01T00:00:00.000+0000", "Closed/Won"),
        _hist(opp, "Business Validation", "2026-01-11T00:00:00.000+0000", "Closed/Won"),
        _hist(opp, "Commitment & Negotiation", "2026-01-21T00:00:00.000+0000", "Closed/Won"),
        _hist(opp, "Closed/Won", "2026-01-31T00:00:00.000+0000", "Closed/Won"),
    ]


def test_funnel_conversion_and_duration() -> None:
    rows = _won_deal_history("a") + [
        _hist("b", "Discovery", "2026-01-01T00:00:00.000+0000", "Closed/Lost"),
        _hist("b", "Closed/Lost", "2026-02-01T00:00:00.000+0000", "Closed/Lost"),
    ]
    out = _funnel(rows)
    assert out["deals"] == 2 and out["won"] == 1
    disc = out["stages"][0]
    assert disc["stage"] == "Discovery"
    assert disc["reached"] == 2 and disc["converted"] == 1
    assert disc["conversion_rate"] == 0.5
    assert disc["median_days_in_stage"] == 10


def test_funnel_skipped_stage_still_converts() -> None:
    # Deal jumps Discovery → Commitment & Negotiation (skips Business Validation)
    rows = [
        _hist("a", "Discovery", "2026-01-01T00:00:00.000+0000", "Closed/Won"),
        _hist("a", "Commitment & Negotiation", "2026-01-06T00:00:00.000+0000", "Closed/Won"),
        _hist("a", "Closed/Won", "2026-01-11T00:00:00.000+0000", "Closed/Won"),
    ]
    out = _funnel(rows)
    disc = out["stages"][0]
    assert disc["converted"] == 1 and disc["median_days_in_stage"] == 5


def test_adherence_flags_skipped_stages() -> None:
    rows = _won_deal_history("a") + [
        _hist("b", "Discovery", "2026-01-01T00:00:00.000+0000", "Closed/Won"),
        _hist("b", "Closed/Won", "2026-01-11T00:00:00.000+0000", "Closed/Won"),
    ]
    out = _adherence([], {"C5-FUNNEL": rows})
    by_stage = {s["stage"]: s for s in out["stages"]}
    assert by_stage["Business Validation"]["skipped"] == 1
    assert by_stage["Business Validation"]["skip_rate"] == 0.5
    assert by_stage["Discovery"]["skipped"] == 0


def test_stage_criteria_won_benchmarks() -> None:
    out = _stage_criteria([], {"C5-FUNNEL": _won_deal_history("a")})
    disc = out["stages"][0]
    assert disc["recorded_share"] == 1.0
    assert disc["median_days_won"] == 10


def _deal(**kw) -> dict:
    base = {
        "Amount": 10_000, "StageName": "Closed/Won",
        "CreatedDate": "2026-01-01T00:00:00.000+0000", "CloseDate": "2026-01-31",
        "Opportunity_Source_Category__c": "Marketing",
        "Account.Industry": "Education", "Owner.Name": "A. Seller",
    }
    base.update(kw)
    return base


def test_channel_roi_groups_by_source() -> None:
    rows = [_deal() for _ in range(5)] + [
        _deal(Opportunity_Source_Category__c="Self-Generated", StageName="Closed/Lost")
        for _ in range(5)
    ]
    out = _channel_roi(rows)
    by_name = {c["name"]: c for c in out["channels"]}
    assert by_name["Marketing"]["win_rate"] == 1.0
    assert by_name["Self-Generated"]["win_rate"] == 0.0


def test_icp_align_ranks_and_flags() -> None:
    rows = []
    # 6 industries: industry_0 has most volume but worst win rate.
    for i in range(6):
        for j in range(20 - i * 2):
            won = j < (5 + i * 2)
            rows.append(_deal(**{"Account.Industry": f"industry_{i}",
                                 "StageName": "Closed/Won" if won else "Closed/Lost"}))
    out = _icp_align([], {"C5-CHANNEL-ROI": rows})
    top_volume = next(s for s in out["industries"] if s["industry"] == "industry_0")
    assert top_volume["volume_rank"] == 1
    assert top_volume["rank_gap"] < 0  # volume rank better than win-rate rank


def test_lead_assign_min_cell_size() -> None:
    rows = [_deal() for _ in range(5)] + [_deal(**{"Owner.Name": "B. Seller"})]
    out = _lead_assign([], {"C5-CHANNEL-ROI": rows})
    assert len(out["cells"]) == 1  # B. Seller's single deal is below min
    assert out["cells"][0]["seller"] == "A. Seller"


def test_medd_by_stage_averages() -> None:
    rows = [
        {"StageName": "Discovery", "AI_MEDDIC_Summary__c": f"<b>MEDDIC COVERAGE: {n}/6</b>"}
        for n in (1, 2, 3)
    ]
    out = _medd_by_stage(rows)
    assert out["stages"] == [{"stage": "Discovery", "avg_coverage": 2.0, "deals": 3}]
