from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class AnalysisOut(BaseModel):
    analysis_id: str
    chapter: str
    title: str
    viz: str
    grain: str
    description: str
    formula: str
    time_filter: bool
    computed: bool
    blocked: bool
    fields_required: list[str]
    template_default: str
    template_override: str | None = None
    has_override: bool = False


class AnalysisUpdateIn(BaseModel):
    template: str


class AnalysisTestRequest(BaseModel):
    template: str
    territory: str | None = None
    seller_id: str | None = None
    motion: str | None = None
    period: str | None = None


class AnalysisTestResult(BaseModel):
    ok: bool
    resolved_soql: str
    row_count: int = 0
    rows: list[dict[str, Any]] = []
    error: str | None = None


class AnalysisHistoryRow(BaseModel):
    version: str
    template: str
    saved_by: str
    saved_at: str


class FieldRefOut(BaseModel):
    key: str
    sf_object: str
    api_name: str
    tier: str
    confirmed: bool
    notes: str
