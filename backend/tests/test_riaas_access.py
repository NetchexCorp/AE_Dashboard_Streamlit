from __future__ import annotations

import base64
import json

import pytest
from fastapi.testclient import TestClient


def _principal_header(email: str, oid: str = "oid-1") -> str:
    payload = {
        "claims": [
            {"typ": "preferred_username", "val": email},
            {"typ": "oid", "val": oid},
        ],
        "identityProvider": "aad",
    }
    return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


@pytest.fixture
def prod_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("AZURE_STORAGE_CONNECTION_STRING", "")
    monkeypatch.setenv(
        "FEATURE_RIAAS_ALLOWED_EMAILS", "pmankar@netchexonline.com"
    )
    from app.config import get_settings
    from app.deps import _riaas_access_logged
    from app.services.audit_service import reset_audit_service
    from app.services.user_service import UserRow, get_user_service

    get_settings.cache_clear()
    get_user_service.cache_clear()
    reset_audit_service()
    _riaas_access_logged.clear()

    svc = get_user_service()
    svc.upsert(
        UserRow(email="pmankar@netchexonline.com", role="admin", is_active=True),
        actor="test",
    )
    svc.upsert(
        UserRow(email="other@netchexonline.com", role="user", is_active=True),
        actor="test",
    )


def _client() -> TestClient:
    from app.main import create_app

    return TestClient(create_app())


# ----- dev mode (conftest sets ENV=dev) -----


def test_dev_bypass_allows_riaas(client: TestClient) -> None:
    r = client.get("/api/riaas/chapters")
    assert r.status_code == 200
    assert len(r.json()) == 5


def test_dev_me_reports_riaas_feature(client: TestClient) -> None:
    r = client.get("/api/me")
    assert r.status_code == 200
    assert r.json()["features"]["riaas"] is True


# ----- prod mode -----


def test_prod_allowlisted_user_gets_access(prod_env) -> None:
    r = _client().get(
        "/api/riaas/chapters",
        headers={"X-MS-CLIENT-PRINCIPAL": _principal_header("pmankar@netchexonline.com")},
    )
    assert r.status_code == 200
    assert [c["slug"] for c in r.json()] == [
        "gtm-overview",
        "win-loss",
        "pipeline-health",
        "coach",
        "gtm-process",
    ]


def test_prod_non_allowlisted_user_gets_404(prod_env) -> None:
    r = _client().get(
        "/api/riaas/chapters",
        headers={"X-MS-CLIENT-PRINCIPAL": _principal_header("other@netchexonline.com")},
    )
    assert r.status_code == 404


def test_prod_me_features_riaas_reflects_allowlist(prod_env) -> None:
    client = _client()
    r = client.get(
        "/api/me",
        headers={"X-MS-CLIENT-PRINCIPAL": _principal_header("pmankar@netchexonline.com")},
    )
    assert r.json()["features"]["riaas"] is True
    r = client.get(
        "/api/me",
        headers={"X-MS-CLIENT-PRINCIPAL": _principal_header("other@netchexonline.com")},
    )
    assert r.json()["features"]["riaas"] is False


def test_prod_allowlist_is_case_insensitive(prod_env) -> None:
    r = _client().get(
        "/api/riaas/chapters",
        headers={"X-MS-CLIENT-PRINCIPAL": _principal_header("PMankar@NetchexOnline.com")},
    )
    assert r.status_code == 200


def test_first_access_writes_audit_event(prod_env) -> None:
    from app.services.audit_service import get_audit_service

    client = _client()
    for _ in range(2):
        client.get(
            "/api/riaas/chapters",
            headers={
                "X-MS-CLIENT-PRINCIPAL": _principal_header("pmankar@netchexonline.com")
            },
        )
    events, _cursor = get_audit_service().list(entity="riaas")
    grants = [e for e in events if e.action == "access_granted"]
    assert len(grants) == 1
    assert grants[0].actor == "pmankar@netchexonline.com"
