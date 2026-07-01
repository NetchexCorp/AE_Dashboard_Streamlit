from __future__ import annotations

from app.services.riaas.coach_service import _coach_focus, _pipe_coverage, _terr_velocity


def _closed(owner="u1", name="Ann", stage="Closed/Won", amount=10_000, rt="Net New") -> dict:
    return {
        "OwnerId": owner, "Owner.Name": name, "StageName": stage, "Amount": amount,
        "RecordType.Name": rt,
        "CreatedDate": "2026-01-01T00:00:00.000+0000", "CloseDate": "2026-01-11",
    }


def test_terr_velocity_leaderboard_metrics_and_expansion_share() -> None:
    rows = (
        [_closed() for _ in range(3)]
        + [_closed(rt="Upsell", amount=5_000)]
        + [_closed(stage="Closed/Lost")]
        + [_closed(owner="u2", name="Bo") for _ in range(3)]  # < 5 deals → excluded
    )
    quota = [{"QuotaOwnerId": "u1", "QuotaOwner.Name": "Ann", "q": 100_000}]
    out = _terr_velocity(rows, {"C4-PIPE-COVERAGE": quota})
    assert len(out["sellers"]) == 1
    s = out["sellers"][0]
    assert s["seller"] == "Ann"
    assert s["deals"] == 5 and s["deals_won"] == 4
    assert s["win_rate"] == 0.8
    assert s["bookings"] == 35_000
    assert s["acv"] == 8_750
    assert s["cycle_days"] == 10
    assert s["pct_bookings_expansion"] == round(5_000 / 35_000, 4)
    assert s["quota"] == 100_000
    assert s["attainment"] == 0.35


def test_terr_velocity_without_quota_row() -> None:
    rows = [_closed() for _ in range(5)]
    out = _terr_velocity(rows, {"C4-PIPE-COVERAGE": []})
    s = out["sellers"][0]
    assert s["quota"] is None and s["attainment"] is None


def test_pipe_coverage_math() -> None:
    quota = [
        # GROUP BY rows carry the owner name flat ("Name"), as live Salesforce returns it
        {"QuotaOwnerId": "u1", "Name": "Ann", "q": 100_000},
        {"QuotaOwnerId": "u2", "Name": "Bo", "q": 10_000},
    ]
    closed = [
        _closed(amount=40_000),
        _closed(amount=999, stage="Closed/Lost"),        # lost → no bookings
        _closed(owner="u2", name="Bo", amount=50_000),   # over quota → remaining 0
    ]
    open_rows = [
        {"OwnerId": "u1", "Owner.Name": "Ann", "Amount": 90_000},
        {"OwnerId": "u2", "Owner.Name": "Bo", "Amount": 1_000},
        {"OwnerId": "u3", "Owner.Name": "Cy", "Amount": 5_000},  # no quota row
    ]
    out = _pipe_coverage(quota, {"C4-TERR-VELOCITY": closed, "C4-COACH-FOCUS": open_rows})
    sellers = {s["seller_id"]: s for s in out["sellers"]}
    assert sellers["u1"]["seller"] == "Ann"
    assert sellers["u1"]["remaining_quota"] == 60_000
    assert sellers["u1"]["coverage"] == 1.5
    assert sellers["u2"]["remaining_quota"] == 0 and sellers["u2"]["coverage"] is None
    assert sellers["u3"]["quota"] is None and sellers["u3"]["coverage"] is None
    assert sellers["u3"]["open_pipeline"] == 5_000
    # overall: quota 110k, bookings (quota-carrying sellers) 90k, pipeline 96k
    assert out["overall"]["remaining_quota"] == 20_000
    assert out["overall"]["coverage"] == 4.8


def test_pipe_coverage_no_quota_rows() -> None:
    open_rows = [{"OwnerId": "u1", "Owner.Name": "Ann", "Amount": 5_000}]
    out = _pipe_coverage([], {"C4-TERR-VELOCITY": [], "C4-COACH-FOCUS": open_rows})
    assert out["sellers"][0]["coverage"] is None
    assert out["overall"]["coverage"] is None


def _open(owner="u1", name="Ann", score=None, days=1, created="2999-01-01", stage="Discovery") -> dict:
    return {
        "OwnerId": owner, "Owner.Name": name, "StageName": stage, "Amount": 1000,
        "AI_Overall_Score__c": score, "LastStageChangeInDays": days,
        "CreatedDate": created,
    }


def test_coach_focus_counts_and_focus_label() -> None:
    rows = [
        # Discovery median over cohort = 10 → stall threshold max(30, 20) = 30
        _open(score=40, days=10),                     # low engagement
        _open(score=55, days=10),                     # low engagement
        _open(score=90, days=31),                     # stalled
        _open(score=None, days=10, created="2020-01-01"),  # aged only (unscored ≠ low)
        _open(owner="u2", name="Bo", score=95, days=5),    # no risk
    ]
    out = _coach_focus(rows)
    sellers = {s["seller_id"]: s for s in out["sellers"]}
    ann = sellers["u1"]
    assert ann["open_deals"] == 4
    assert ann["low_engagement"] == 2
    assert ann["stalled"] == 1
    assert ann["aged"] == 1
    assert ann["total_risk"] == 4
    assert ann["focus"] == "low_engagement"
    bo = sellers["u2"]
    assert bo["total_risk"] == 0 and bo["focus"] is None
    assert out["sellers"][0]["seller_id"] == "u1"  # sorted by risk desc
