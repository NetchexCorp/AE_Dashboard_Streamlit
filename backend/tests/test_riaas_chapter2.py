from __future__ import annotations

from app.services.riaas.winloss_service import (
    _eff_dealsize,
    _medd_elements,
    _multithread_wr,
    _persona_impact,
    _qual_wr,
    _slippage_wr,
    classify_persona,
    parse_meddic,
    size_band,
)

MEDDIC_SAMPLE = (
    "<b>MEDDIC COVERAGE: 3/6  ❌❌✅❌✅✅</b><br><br>"
    "<b>METRICS  |  ❌ Not Confirmed</b><br>text<br>"
    "<b>ECONOMIC BUYER  |  ✅ Confirmed</b><br>text<br>"
    "<b>CHAMPION  |  ✅ Confirmed</b>"
)


def test_parse_meddic_score_and_elements() -> None:
    score, elements = parse_meddic(MEDDIC_SAMPLE)
    assert score == 3
    assert elements == {"Metrics": False, "Economic Buyer": True, "Champion": True}
    assert parse_meddic(None) == (None, {})
    assert parse_meddic("no header here") == (None, {})


def test_size_bands() -> None:
    assert size_band(1_000) == "<$5k"
    assert size_band(5_000) == "$5–15k"
    assert size_band(200_000) == "$150k+"
    assert size_band(None) == "<$5k"  # missing amount treated as 0


def test_qual_wr_buckets() -> None:
    rows = [
        {"StageName": "Closed/Won", "AI_MEDDIC_Summary__c": "<b>MEDDIC COVERAGE: 5/6</b>"},
        {"StageName": "Closed/Lost", "AI_MEDDIC_Summary__c": "<b>MEDDIC COVERAGE: 1/6</b>"},
        {"StageName": "Closed/Won", "AI_MEDDIC_Summary__c": None},  # unscored → excluded
    ]
    out = _qual_wr(rows)
    assert out["scored_deals"] == 2
    assert out["ge3"] == {"deals": 1, "win_rate": 1.0}
    assert out["lt3"] == {"deals": 1, "win_rate": 0.0}


def test_medd_elements_rates() -> None:
    deps = {"C2-QUAL-WR": [
        {"StageName": "Closed/Won", "AI_MEDDIC_Summary__c": MEDDIC_SAMPLE},
        {"StageName": "Closed/Lost", "AI_MEDDIC_Summary__c": MEDDIC_SAMPLE.replace("✅ Confirmed</b><br>text<br>", "❌ x</b><br>", 1)},
    ]}
    out = _medd_elements([], deps)
    by_el = {e["element"]: e for e in out["elements"]}
    assert by_el["Champion"]["won_rate"] == 1.0


def test_slippage_wr_buckets_include_zero_slip() -> None:
    cohort = [
        {"Id": "a", "StageName": "Closed/Won", "Amount": 1},
        {"Id": "b", "StageName": "Closed/Lost", "Amount": 1},
    ]
    history = [
        {"OpportunityId": "b", "OldValue": "2026-01-01", "NewValue": "2026-03-15"},
        # backward move ignored
        {"OpportunityId": "b", "OldValue": "2026-03-15", "NewValue": "2026-03-01"},
    ]
    out = _slippage_wr(history, {"C2-EFF-DEALSIZE": cohort})
    buckets = {b["label"]: b for b in out["buckets"]}
    assert buckets["0"]["deals"] == 1 and buckets["0"]["win_rate"] == 1.0
    assert buckets["61–180"]["deals"] == 1 and buckets["61–180"]["win_rate"] == 0.0


def test_multithread_counts_engaged_only() -> None:
    cohort = [
        {"Id": "a", "StageName": "Closed/Won", "Amount": 1},
        {"Id": "b", "StageName": "Closed/Lost", "Amount": 1},
    ]
    ocr = [
        {"OpportunityId": "a", "ContactId": "c1", "Contact.AI_Overall_Score__c": 80},
        {"OpportunityId": "a", "ContactId": "c2", "Contact.AI_Overall_Score__c": 10},  # not engaged
        {"OpportunityId": "b", "ContactId": "c3", "Contact.AI_Overall_Score__c": None},
    ]
    out = _multithread_wr(ocr, {"C2-EFF-DEALSIZE": cohort})
    bands = {b["label"]: b for b in out["bands"]}
    assert bands["1"]["deals"] == 1 and bands["1"]["win_rate"] == 1.0
    assert bands["0"]["deals"] == 1 and bands["0"]["win_rate"] == 0.0
    assert out["avg_stakeholders_won"] == 1.0


def test_classify_persona() -> None:
    assert classify_persona("CFO") == ("Finance", "C-Suite")
    assert classify_persona("Director of HR") == ("HR", "Director")
    assert classify_persona("VP Sales") == ("Sales/Marketing", "VP")
    assert classify_persona(None) == ("Unknown", "Unknown")


def test_persona_impact_counts_deal_once_per_cell() -> None:
    ocr = [
        {"OpportunityId": "a", "ContactId": "c1", "Contact.Job_Title__c": "CFO",
         "Opportunity.StageName": "Closed/Won"},
        {"OpportunityId": "a", "ContactId": "c2", "Contact.Job_Title__c": "CFO",
         "Opportunity.StageName": "Closed/Won"},
    ] + [
        {"OpportunityId": f"o{i}", "ContactId": "c", "Contact.Job_Title__c": "CFO",
         "Opportunity.StageName": "Closed/Lost"}
        for i in range(4)
    ]
    out = _persona_impact([], {"C2-MULTITHREAD-WR": ocr})
    cell = out["cells"][0]
    assert cell["deals"] == 5  # deal "a" counted once
    assert cell["win_rate"] == 0.2


def test_eff_dealsize_bands_metrics() -> None:
    rows = [
        {"Amount": 1000, "StageName": "Closed/Won",
         "CreatedDate": "2026-01-01T00:00:00.000+0000", "CloseDate": "2026-01-11"},
        {"Amount": 8000, "StageName": "Closed/Lost",
         "CreatedDate": "2026-01-01T00:00:00.000+0000", "CloseDate": "2026-01-11"},
    ]
    out = _eff_dealsize(rows)
    bands = {b["band"]: b for b in out["bands"]}
    assert bands["<$5k"]["win_rate"] == 1.0
    assert bands["$5–15k"]["deals"] == 1
