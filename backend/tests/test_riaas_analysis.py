from __future__ import annotations

from datetime import date

import pytest

from app.analysis.engine import clear_failures, flatten_record, run_analyses
from app.analysis.field_dictionary import FIELD_DICTIONARY
from app.analysis.query_builder import build_filter_params, build_query, soql_quote
from app.analysis.registry import ANALYSES, CHAPTER_SLUGS, REGISTRY, AnalysisEntry
from app.analysis.time_utils import quarter_series, resolve_riaas_period


# ----- registry integrity -----


def test_registry_has_all_40_analyses() -> None:
    assert len(ANALYSES) == 40
    assert len(REGISTRY) == 40  # ids unique


def test_registry_chapters_and_fields_are_valid() -> None:
    chapters = set(CHAPTER_SLUGS.values())
    for a in ANALYSES:
        assert a.chapter in chapters, a.analysis_id
        for key in a.fields_required:
            assert key in FIELD_DICTIONARY, f"{a.analysis_id} references unknown field {key}"


def test_unconfirmed_fields_force_blocked() -> None:
    # C4 skill analyses depend on user.skill_scores which has no org field.
    assert REGISTRY["C4-SKILL-LEADERBOARD"].blocked
    assert REGISTRY["C4-FORECAST-ACC"].blocked
    # Confirmed-field analyses are not blocked.
    assert not REGISTRY["C1-VELOCITY-NB"].blocked
    assert not REGISTRY["C3-RISK-STALLED"].blocked


# ----- time helpers -----


def test_quarter_series_labels_and_ranges() -> None:
    series = quarter_series(5, today=date(2026, 7, 2))
    assert [s["label"] for s in series] == [
        "FY25 Q3", "FY25 Q4", "FY26 Q1", "FY26 Q2", "FY26 Q3",
    ]
    assert series[0]["start"] == "2025-07-01"
    assert series[0]["end"] == "2025-09-30"
    assert series[-1]["end"] == "2026-09-30"


def test_resolve_riaas_period_presets() -> None:
    today = date(2026, 7, 2)
    assert resolve_riaas_period("this_quarter", today=today) == (
        date(2026, 7, 1), date(2026, 9, 30),
    )
    assert resolve_riaas_period("last_quarter", today=today) == (
        date(2026, 4, 1), date(2026, 6, 30),
    )
    assert resolve_riaas_period("ytd", today=today) == (date(2026, 1, 1), today)
    assert resolve_riaas_period("prior_fy", today=today) == (
        date(2025, 1, 1), date(2025, 12, 31),
    )


# ----- query builder -----


def _entry(template: str, **kw) -> AnalysisEntry:
    defaults = dict(
        analysis_id="T-1", chapter="GTM Overview", title="t", viz="bar",
        grain="quarter", description="", template=template, time_filter=True,
    )
    defaults.update(kw)
    return AnalysisEntry(**defaults)


def test_build_query_resolves_clauses() -> None:
    params = build_filter_params(motion="nb", period="ytd")
    entry = _entry(
        "SELECT COUNT(Id) FROM Opportunity WHERE {motion_clause} AND {close_date_clause} AND {territory_clause}"
    )
    soql = build_query(entry, params)
    assert "RecordType.Name IN ('Net New')" in soql
    assert f"CloseDate >= {date.today().year}-01-01" in soql
    assert "Id != null" in soql  # no territory filter → no-op clause
    assert "{" not in soql


def test_build_query_territory_and_expansion() -> None:
    params = build_filter_params(motion="exp", territory="TX - Dallas", period="ytd")
    entry = _entry("SELECT Id FROM Opportunity WHERE {motion_clause} AND {territory_clause}")
    soql = build_query(entry, params)
    assert "RecordType.Name IN ('Cross-sell','Upsell')" in soql
    assert "Account.Account_Territory__r.Name = 'TX - Dallas'" in soql


def test_soql_quote_escapes() -> None:
    assert soql_quote("O'Brien") == "O\\'Brien"


# ----- engine: per-analysis error isolation -----


class FakeSf:
    def __init__(self, fail_on: str | None = None):
        self.fail_on = fail_on
        self.calls: list[str] = []

    def query_all(self, soql: str) -> dict:
        self.calls.append(soql)
        if self.fail_on and self.fail_on in soql:
            raise RuntimeError("MALFORMED_QUERY: boom")
        return {
            "records": [
                {"attributes": {"type": "AggregateResult"}, "expr0": 42,
                 "RecordType": {"attributes": {}, "Name": "Net New"}}
            ]
        }


def test_flatten_record_nested() -> None:
    row = flatten_record(
        {"attributes": {}, "Amount": 5, "Account": {"attributes": {}, "Industry": "Education"}}
    )
    assert row == {"Amount": 5, "Account.Industry": "Education"}


def test_engine_isolates_failures() -> None:
    clear_failures()
    good = _entry("SELECT COUNT(Id) FROM Opportunity WHERE {motion_clause}", analysis_id="G-1")
    bad = _entry("SELECT Id FROM BadObject WHERE {motion_clause}", analysis_id="B-1")
    blocked = _entry("", analysis_id="P-1", blocked=True, fields_required=["user.skill_scores"])
    empty = _entry("", analysis_id="E-1")

    sf = FakeSf(fail_on="BadObject")
    params = build_filter_params(period="ytd")
    results = run_analyses(sf, [good, bad, blocked, empty], params)

    assert results["G-1"]["status"] == "ok"
    assert results["G-1"]["rows"][0]["expr0"] == 42
    assert results["B-1"]["status"] == "error"
    assert results["P-1"]["status"] == "pending"
    assert "Salesforce field confirmation" in results["P-1"]["reason"]
    assert results["E-1"]["status"] == "pending"
    clear_failures()


def test_engine_caches_non_retryable_failures() -> None:
    clear_failures()
    bad = _entry("SELECT Id FROM BadObject WHERE {motion_clause}", analysis_id="B-2")
    sf = FakeSf(fail_on="BadObject")
    params = build_filter_params(period="ytd")
    run_analyses(sf, [bad], params)
    n_calls = len(sf.calls)
    run_analyses(sf, [bad], params)
    assert len(sf.calls) == n_calls  # second pass short-circuits
    clear_failures()


# ----- store: local fallback + overrides in engine -----


def test_store_local_fallback_roundtrip(tmp_path, monkeypatch) -> None:
    from app.analysis import store

    monkeypatch.setattr(store, "_LOCAL_FILE", tmp_path / "overrides.json")
    monkeypatch.setenv("AZURE_STORAGE_CONNECTION_STRING", "")
    assert store.load_overrides() == {}
    store.save_override("C1-VELOCITY-NB", "SELECT Id FROM Opportunity", actor="t")
    assert store.load_overrides() == {"C1-VELOCITY-NB": "SELECT Id FROM Opportunity"}


def test_engine_uses_override_template() -> None:
    clear_failures()
    entry = _entry("", analysis_id="O-1")  # no default template
    sf = FakeSf()
    params = build_filter_params(period="ytd")
    results = run_analyses(sf, [entry], params, overrides={"O-1": "SELECT COUNT(Id) FROM Opportunity"})
    assert results["O-1"]["status"] == "ok"
    clear_failures()


# ----- endpoints -----


def test_analyses_endpoint_lists_registry(client) -> None:
    r = client.get("/api/riaas/analyses")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 40
    by_id = {a["analysis_id"]: a for a in body}
    assert by_id["C4-SKILL-LEADERBOARD"]["blocked"] is True
    assert by_id["C1-VELOCITY-NB"]["blocked"] is False


def test_fields_endpoint(client) -> None:
    r = client.get("/api/riaas/fields")
    assert r.status_code == 200
    fields = {f["key"]: f for f in r.json()}
    assert fields["acct.icp_overall"]["api_name"] == "AI_Overall_Score__c"
    assert fields["user.skill_scores"]["confirmed"] is False
