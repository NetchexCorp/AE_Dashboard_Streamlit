from __future__ import annotations

from fastapi.testclient import TestClient


def test_index_lists_seeded_month(client: TestClient) -> None:
    res = client.get("/api/monthly-results")
    assert res.status_code == 200
    body = res.json()
    assert "2026-06" in body["months"]
    assert body["latest"] == "2026-06"


def test_get_seeded_month(client: TestClient) -> None:
    res = client.get("/api/monthly-results/2026-06")
    assert res.status_code == 200
    rec = res.json()
    assert rec["label"] == "June 2026"
    assert set(rec["bases"]) == {"amt_annualized", "w2_uplift"}
    mtd = rec["bases"]["amt_annualized"]["periods"]["mtd"]
    buckets = [r["bucket"] for r in mtd["rows"]]
    assert buckets == [
        "New-Direct",
        "New-Reseller",
        "Cross-Sell",
        "Upsell",
        "Unmapped/Other",
    ]
    # Netchex total ties to the workbook summary tab.
    total = sum(r["actual"] for r in mtd["rows"])
    assert round(total, 2) == 1358147.08
    assert mtd["higherme"]["actual"] == 117700
    # Trend series are aligned to trend_months.
    assert len(rec["trend_months"]) == len(rec["trend_plan"])
    for basis in rec["bases"].values():
        assert len(basis["trend_actual"]) == len(rec["trend_months"])


def test_get_unknown_month_404(client: TestClient) -> None:
    assert client.get("/api/monthly-results/2019-01").status_code == 404


def test_upsert_roundtrip_and_month_mismatch(client: TestClient) -> None:
    rec = client.get("/api/monthly-results/2026-06").json()
    rec["month"] = "2026-07"
    rec["label"] = "July 2026"
    assert client.put("/api/monthly-results/2026-06", json=rec).status_code == 422
    res = client.put("/api/monthly-results/2026-07", json=rec)
    assert res.status_code == 200
    got = client.get("/api/monthly-results/2026-07")
    assert got.status_code == 200
    assert got.json()["label"] == "July 2026"
    assert client.get("/api/monthly-results").json()["latest"] == "2026-07"
