from __future__ import annotations

from datetime import date

from app.analysis.engine import clear_failures
from app.services.riaas.chapter_service import (
    _crm_complete,
    _territory_efficiency,
    _velocity_trend,
    is_decision_maker,
)
from app.services.riaas.metrics import cohort_metrics


def _deal(stage: str, amount: float, created: str, closed: str, owner: str = "u1", terr: str | None = "T1") -> dict:
    return {
        "Amount": amount,
        "StageName": stage,
        "CreatedDate": created + "T12:00:00.000+0000",
        "CloseDate": closed,
        "OwnerId": owner,
        "Account.Account_Territory__r.Name": terr,
    }


def test_cohort_metrics_formulas() -> None:
    rows = [
        _deal("Closed/Won", 10_000, "2026-01-01", "2026-03-11"),   # 69d cycle
        _deal("Closed/Won", 20_000, "2026-01-01", "2026-03-31"),   # 89d cycle
        _deal("Closed/Lost", 50_000, "2026-01-01", "2026-02-01"),
        _deal("Closed/Lost", 50_000, "2026-01-01", "2026-02-01"),
    ]
    m = cohort_metrics(rows)
    assert m["deals"] == 4
    assert m["deals_won"] == 2
    assert m["win_rate"] == 0.5
    assert m["acv"] == 15_000
    assert m["cycle_days"] == 79
    # velocity = 4 × 0.5 × 15000 ÷ 79
    assert abs(m["velocity"] - 4 * 0.5 * 15000 / 79) < 0.01
    assert abs(m["efficiency"] - 0.5 * 15000 / 79) < 0.01
    assert m["bookings"] == 30_000


def test_cohort_metrics_empty() -> None:
    m = cohort_metrics([])
    assert m["deals"] == 0
    assert m["win_rate"] is None
    assert m["velocity"] is None


def test_velocity_trend_buckets_by_quarter() -> None:
    rows = [
        _deal("Closed/Won", 12_000, "2026-01-05", "2026-02-20"),
        _deal("Closed/Lost", 9_000, "2026-01-05", "2026-05-10"),
    ]
    out = _velocity_trend(rows)
    assert len(out["quarters"]) == 8
    by_label = {q["label"]: q for q in out["quarters"]}
    # Today is 2026 — Q1/Q2 2026 must be in the window.
    q1 = by_label["FY26 Q1"]
    assert q1["deals"] == 1 and q1["deals_won"] == 1
    q2 = by_label["FY26 Q2"]
    assert q2["deals"] == 1 and q2["deals_won"] == 0


def test_crm_complete_classification() -> None:
    rows = [
        {"Job_Title__c": None, "n": 60},
        {"Job_Title__c": "CEO", "n": 10},
        {"Job_Title__c": "Director of HR", "n": 10},
        {"Job_Title__c": "Receptionist", "n": 20},
    ]
    out = _crm_complete(rows)
    assert out["total_contacts"] == 100
    assert out["pct_untitled"] == 0.6
    assert out["decision_makers"] == 20
    assert out["pct_dm_of_titled"] == 0.5


def test_is_decision_maker_tokens() -> None:
    assert is_decision_maker("VP of Finance")
    assert is_decision_maker("Chief People Officer")
    assert not is_decision_maker("Accounting Clerk")


def test_territory_efficiency_gap_and_min_deals() -> None:
    fast = [_deal("Closed/Won", 10_000, "2026-01-01", "2026-01-31", terr="Fast")] * 4 + [
        _deal("Closed/Lost", 10_000, "2026-01-01", "2026-01-31", terr="Fast")
    ]
    slow = [_deal("Closed/Won", 10_000, "2026-01-01", "2026-04-10", terr="Slow")] * 3 + [
        _deal("Closed/Lost", 10_000, "2026-01-01", "2026-01-31", terr="Slow")
    ] * 2
    tiny = [_deal("Closed/Won", 99_000, "2026-01-01", "2026-01-02", terr="Tiny")]
    no_terr = [_deal("Closed/Won", 5_000, "2026-01-01", "2026-01-31", terr=None)]
    out = _territory_efficiency(fast + slow + tiny + no_terr)
    names = [t["name"] for t in out["territories"]]
    assert names == ["Fast", "Slow"]  # Tiny dropped (<5 deals), null skipped
    assert out["gap"]["top"] == "Fast" and out["gap"]["bottom"] == "Slow"
    assert out["deals_without_territory"] == 1


# ----- endpoint (FakeSf via monkeypatched client) -----


def test_chapter_endpoint_shapes_response(client, monkeypatch) -> None:
    clear_failures()

    class FakeSf:
        def query_all(self, soql: str) -> dict:
            if "FROM Contact" in soql:
                return {"records": [
                    {"attributes": {}, "Job_Title__c": None, "n": 5},
                    {"attributes": {}, "Job_Title__c": "CEO", "n": 5},
                ]}
            return {"records": [
                {"attributes": {}, "Id": "006x", "Amount": 10000.0,
                 "StageName": "Closed/Won", "CloseDate": "2026-02-20",
                 "CreatedDate": "2026-01-05T12:00:00.000+0000",
                 "OwnerId": "u1", "Owner": {"attributes": {}, "Name": "A"}},
            ]}

    import app.routers.riaas.chapters as chapters_mod

    monkeypatch.setattr(chapters_mod, "get_sf_client", lambda: FakeSf())
    r = client.get("/api/riaas/chapters/gtm-overview")
    assert r.status_code == 200
    body = r.json()
    assert body["chapter"] == "GTM Overview"
    by_id = {a["analysis_id"]: a for a in body["analyses"]}
    assert len(by_id) == 6
    assert by_id["C1-CRM-COMPLETE"]["status"] == "ok"
    assert by_id["C1-CRM-COMPLETE"]["data"]["total_contacts"] == 10
    assert by_id["C1-VELOCITY-NB"]["status"] == "ok"
    assert "quarters" in by_id["C1-VELOCITY-NB"]["data"]
    assert "key_findings" in body
    clear_failures()


def test_chapter_endpoint_unknown_slug(client) -> None:
    assert client.get("/api/riaas/chapters/nope").status_code == 404


def test_key_findings_roundtrip(client) -> None:
    from app.services.riaas.key_findings_service import reset_key_findings_service

    reset_key_findings_service()
    r = client.put(
        "/api/riaas/chapters/gtm-overview/key-findings", json={"text": "Velocity up 12% QoQ."}
    )
    assert r.status_code == 200
    assert r.json()["updated_by"] == "test@example.com"
