from __future__ import annotations

from app.services.riaas.pipeline_service import (
    _acct_relationship,
    _icp_share,
    _maturity,
    _medd_adopt,
    _risk_engage,
    _risk_slipped,
    _risk_stalled,
    is_stalled,
    stage_medians,
)

TERR = "Account.Account_Territory__r.Name"


def _opp(**kw) -> dict:
    return {"StageName": "Discovery", "Amount": 1000, TERR: "Alabama", **kw}


def test_maturity_mid_late_share() -> None:
    rows = [
        _opp(Amount=100),  # Discovery = early
        _opp(Amount=300, StageName="Business Validation"),
        _opp(Amount=600, StageName="Commitment & Negotiation", **{TERR: "Texas"}),
    ]
    out = _maturity(rows)
    assert out["overall"]["pipeline"] == 1000
    assert out["overall"]["pct_mid_late"] == 0.9
    by_name = {t["name"]: t for t in out["territories"]}
    assert by_name["Alabama"]["pct_mid_late"] == 0.75
    assert by_name["Texas"]["pct_mid_late"] == 1.0
    assert out["territories"][0]["name"] == "Texas"  # sorted by pipeline desc


def test_maturity_missing_territory_grouped() -> None:
    out = _maturity([_opp(**{TERR: None})])
    assert out["territories"][0]["name"] == "No territory"


def test_icp_share_threshold_and_quarters() -> None:
    rows = [
        _opp(Amount=700, CloseDate="2026-02-10", **{"Account.AI_Overall_Score__c": 85}),
        _opp(Amount=200, CloseDate="2026-02-20", **{"Account.AI_Overall_Score__c": 69.9}),
        _opp(Amount=100, CloseDate="2026-05-01", **{"Account.AI_Overall_Score__c": None}),  # unscored → not high
    ]
    out = _icp_share([], {"C3-MATURITY": rows})
    assert out["overall"]["share"] == 0.7
    assert out["account_score_coverage"] == round(2 / 3, 4)
    q = {q["label"]: q for q in out["quarters"]}
    assert q["FY26 Q1"]["share"] == round(700 / 900, 4)
    assert q["FY26 Q2"]["share"] == 0.0
    assert [x["label"] for x in out["quarters"]] == ["FY26 Q1", "FY26 Q2"]


def test_medd_adopt_counts_nonempty_only() -> None:
    rows = [
        _opp(AI_MEDDIC_Summary__c="<b>MEDDIC ...</b>", AI_Overall_Score__c=50),
        _opp(AI_MEDDIC_Summary__c="   ", AI_Overall_Score__c=None),  # whitespace = no note
        _opp(AI_MEDDIC_Summary__c=None, AI_Overall_Score__c=None, **{TERR: "Texas"}),
        _opp(AI_MEDDIC_Summary__c=None, AI_Overall_Score__c=0, **{TERR: "Texas"}),  # score 0 still counts
    ]
    out = _medd_adopt([], {"C3-MATURITY": rows})
    assert out["overall"]["pct_meddic_note"] == 0.25
    assert out["overall"]["pct_engagement_score"] == 0.5
    terr = {t["name"]: t for t in out["territories"]}
    assert terr["Alabama"]["pct_meddic_note"] == 0.5


def test_risk_engage_benchmark_and_sorting() -> None:
    rows = [
        _opp(AI_Overall_Score__c=59, Amount=100, **{"Owner.Name": "A", "Account.Name": "Acme"}),
        _opp(AI_Overall_Score__c=59, Amount=900, **{"Owner.Name": "B", "Account.Name": "Beta"}),
        _opp(AI_Overall_Score__c=60, Amount=500),   # at benchmark → not at risk
        _opp(AI_Overall_Score__c=None, Amount=500),  # unscored → excluded
    ]
    out = _risk_engage([], {"C3-MATURITY": rows})
    assert out["at_risk_count"] == 2
    assert out["at_risk_value"] == 1000
    assert out["scored_deals"] == 3 and out["open_deals"] == 4
    assert out["score_coverage"] == 0.75
    assert out["deals"][0] == {
        "seller": "B", "opportunity": "Beta", "stage": "Discovery", "amount": 900, "score": 59,
    }


def test_stalled_two_times_median_with_floor() -> None:
    # Discovery median = 10 → threshold max(30, 20) = 30; Business Validation
    # median = 100 → threshold 200.
    rows = [
        _opp(LastStageChangeInDays=10, Id="fresh"),
        _opp(LastStageChangeInDays=10),
        _opp(LastStageChangeInDays=31, **{"Account.Name": "Stuck Co"}),
        _opp(LastStageChangeInDays=150, StageName="Business Validation"),
        _opp(LastStageChangeInDays=100, StageName="Business Validation"),
        _opp(LastStageChangeInDays=None),  # no data → never stalled
    ]
    medians = stage_medians(rows)
    assert medians["Discovery"] == 10 and medians["Business Validation"] == 125
    assert is_stalled(rows[2], medians) and not is_stalled(rows[0], medians)
    out = _risk_stalled([], {"C3-MATURITY": rows})
    assert out["stalled_count"] == 1
    assert out["deals"][0]["opportunity"] == "Stuck Co"
    assert out["deals"][0]["stage_median"] == 10


def test_stalled_aged_share_uses_created_date() -> None:
    rows = [
        _opp(LastStageChangeInDays=1, CreatedDate="2020-01-01T00:00:00.000+0000"),
        _opp(LastStageChangeInDays=1, CreatedDate="2999-01-01T00:00:00.000+0000"),
    ]
    out = _risk_stalled([], {"C3-MATURITY": rows})
    assert out["pct_aged_180"] == 0.5


def test_risk_slipped_pcts_use_open_cohort_denominator() -> None:
    cohort = [_opp() for _ in range(10)]
    history = [
        # opp "a": +100 days over two pushes (one backward move ignored)
        {"OpportunityId": "a", "OldValue": "2026-01-01", "NewValue": "2026-03-02",
         "Opportunity.StageName": "Discovery", "Opportunity.Amount": 500,
         "Opportunity.Owner.Name": "A", "Opportunity.Account.Name": "Acme"},
        {"OpportunityId": "a", "OldValue": "2026-03-02", "NewValue": "2026-04-11"},
        {"OpportunityId": "a", "OldValue": "2026-04-11", "NewValue": "2026-04-01"},
        # opp "b": +200 days
        {"OpportunityId": "b", "OldValue": "2026-01-01", "NewValue": "2026-07-20",
         "Opportunity.StageName": "Business Validation", "Opportunity.Amount": 100,
         "Opportunity.Owner.Name": "B", "Opportunity.Account.Name": "Beta"},
        # opp "c": net-backward → not slipped
        {"OpportunityId": "c", "OldValue": "2026-06-01", "NewValue": "2026-05-01",
         "Opportunity.StageName": "Discovery"},
    ]
    out = _risk_slipped(history, {"C3-MATURITY": cohort})
    assert out["slipped_deals"] == 2
    assert out["pct_slipped_90"] == 0.2
    assert out["pct_slipped_181"] == 0.1
    assert out["deals"][0]["opportunity"] == "Beta"  # sorted by slip days desc
    assert out["deals"][1]["slip_days"] == 100
    stages = {s["stage"]: s for s in out["stages"]}
    assert stages["Discovery"]["deals"] == 1 and stages["Discovery"]["slip_days"] == 100


def test_acct_relationship_threading_segments() -> None:
    def role(acct, contact, score, seg="2: 11-50"):
        return {
            "OpportunityId": "o", "ContactId": contact,
            "Contact.AI_Overall_Score__c": score,
            "Opportunity.AccountId": acct,
            "Opportunity.Account.EmployeeRange__c": seg,
        }

    rows = [
        role("a1", "c1", 80), role("a1", "c2", 45),        # multi-threaded
        role("a2", "c3", 35), role("a2", "c4", 10),        # single (10 < 30)
        role("a3", "c5", None), role("a3", "c6", 29),      # not engaged
        role("a4", "c7", 90, seg=None),                    # Unknown segment
        role("a1", "c1", 80),                              # duplicate contact → still 2 distinct
    ]
    out = _acct_relationship(rows)
    assert out["overall"]["accounts"] == 4
    segments = {s["segment"]: s for s in out["segments"]}
    small = segments["2: 11-50"]
    assert small["multi_threaded"] == 1 and small["single_threaded"] == 1 and small["not_engaged"] == 1
    assert small["pct_multi_threaded"] == round(1 / 3, 4)
    assert segments["Unknown"]["single_threaded"] == 1
