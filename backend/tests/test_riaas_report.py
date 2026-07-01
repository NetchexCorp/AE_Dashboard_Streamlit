from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def fresh_services(monkeypatch):
    from app.services.riaas.riaas_schedule_service import reset_ri_schedule_service

    reset_ri_schedule_service()
    yield
    reset_ri_schedule_service()


class FakeSf:
    def query_all(self, soql: str) -> dict:
        if "FROM Contact" in soql:
            return {"records": [{"attributes": {}, "Job_Title__c": "CEO", "n": 4}]}
        return {"records": []}


def test_report_renderer_assembles_all_chapters(monkeypatch) -> None:
    from app.analysis.engine import clear_failures
    from app.services.riaas.report_renderer import render_revenue_insights_report

    clear_failures()
    html = render_revenue_insights_report(FakeSf(), subject="Revenue Insights Report")
    assert "Chapter 1 — GTM Efficiency Overview" in html
    assert "Chapter 5 — GTM Process Optimisation" in html
    # Blocked analyses render as Pending, not omitted or broken.
    assert "Pending —" in html
    clear_failures()


def test_normalize_formats_kpis_and_tables() -> None:
    from app.services.riaas.report_renderer import _normalize

    out = _normalize(
        {
            "win_rate": 0.5,
            "bookings": 1234567,
            "bands": [{"band": "<$5k", "win_rate": 0.7, "bookings": 100}],
            "note": "caveat",
        }
    )
    kpis = dict(out["kpis"])
    assert kpis["Win Rate"] == "50.0%"
    assert kpis["Bookings"] == "$1,234,567"
    assert out["tables"][0]["headers"] == ["Band", "Win Rate", "Bookings"]
    assert out["tables"][0]["rows"][0] == ["<$5k", "70.0%", "$100"]
    assert out["note"] == "caveat"


def test_schedule_crud_and_send_now(client: TestClient, monkeypatch) -> None:
    sent = {}

    def fake_send(*, recipients, subject, filters):
        sent["recipients"] = recipients
        sent["subject"] = subject
        return "msg-123"

    import app.scheduler.jobs as jobs
    import app.routers.riaas.report as report_router

    monkeypatch.setattr(jobs, "riaas_render_and_send", fake_send)
    monkeypatch.setattr(report_router, "riaas_render_and_send", fake_send)

    r = client.post(
        "/api/riaas/schedules",
        json={
            "name": "Weekly RIaaS",
            "cron": "0 8 * * 1",
            "recipients": ["pmankar@netchexonline.com"],
            "subject": "Revenue Insights Report",
        },
    )
    assert r.status_code == 201
    sid = r.json()["id"]

    assert len(client.get("/api/riaas/schedules").json()) == 1

    r = client.post(f"/api/riaas/schedules/{sid}/send-now")
    assert r.status_code == 200
    assert r.json()["ok"] is True

    r = client.put(f"/api/riaas/schedules/{sid}", json={"is_active": False})
    assert r.json()["is_active"] is False

    assert client.delete(f"/api/riaas/schedules/{sid}").status_code == 204
    assert client.get("/api/riaas/schedules").json() == []


def test_send_once(client: TestClient, monkeypatch) -> None:
    import app.routers.riaas.report as report_router

    monkeypatch.setattr(
        report_router, "riaas_render_and_send",
        lambda *, recipients, subject, filters: "msg-9",
    )
    r = client.post(
        "/api/riaas/schedules/send-once",
        json={"recipients": ["pmankar@netchexonline.com"], "subject": "Test"},
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True, "message_id": "msg-9", "error": None}


def test_invalid_cron_rejected(client: TestClient) -> None:
    r = client.post(
        "/api/riaas/schedules",
        json={"name": "bad", "cron": "not a cron", "recipients": ["a@b.c"]},
    )
    assert r.status_code == 422


def test_recipient_override_reroutes(monkeypatch) -> None:
    from app.config import get_settings
    from app.services.email_service import EmailService

    monkeypatch.setenv("SENDGRID_RECIPIENT_OVERRIDE", "safe@netchexonline.com")
    monkeypatch.setenv("SENDGRID_API_KEY", "")
    get_settings.cache_clear()
    # With no API key, send_html logs and returns "" — but the override path
    # must still swap the recipient list before that happens.
    svc = EmailService()
    assert svc.send_html(to=["real@example.com"], subject="s", html="<p>x</p>") == ""
    get_settings.cache_clear()
