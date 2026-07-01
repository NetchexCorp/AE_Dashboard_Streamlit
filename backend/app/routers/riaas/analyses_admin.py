from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.analysis import store
from app.analysis.engine import clear_failures, flatten_record
from app.analysis.field_dictionary import FIELD_DICTIONARY
from app.analysis.query_builder import build_filter_params, build_query
from app.analysis.registry import ANALYSES, REGISTRY
from app.deps import require_admin, require_riaas_access
from app.schemas.common import CurrentUser
from app.schemas.riaas import (
    AnalysisHistoryRow,
    AnalysisOut,
    AnalysisTestRequest,
    AnalysisTestResult,
    AnalysisUpdateIn,
    FieldRefOut,
)
from app.services.audit_service import get_audit_service
from app.services.salesforce_client import get_sf_client

router = APIRouter(
    prefix="/api/riaas",
    tags=["riaas"],
    dependencies=[Depends(require_riaas_access)],
)


def _to_out(entry, overrides: dict[str, str]) -> AnalysisOut:
    override = overrides.get(entry.analysis_id)
    return AnalysisOut(
        analysis_id=entry.analysis_id,
        chapter=entry.chapter,
        title=entry.title,
        viz=entry.viz,
        grain=entry.grain,
        description=entry.description,
        formula=entry.formula,
        time_filter=entry.time_filter,
        computed=entry.computed,
        blocked=entry.blocked,
        fields_required=entry.fields_required,
        template_default=entry.template,
        template_override=override,
        has_override=override is not None,
    )


@router.get("/analyses", response_model=list[AnalysisOut])
def list_analyses() -> list[AnalysisOut]:
    overrides = store.load_overrides()
    return [_to_out(e, overrides) for e in ANALYSES]


@router.get("/fields", response_model=list[FieldRefOut])
def list_fields() -> list[FieldRefOut]:
    return [FieldRefOut(**vars(f)) for f in FIELD_DICTIONARY.values()]


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def get_analysis(analysis_id: str) -> AnalysisOut:
    entry = REGISTRY.get(analysis_id)
    if entry is None:
        raise HTTPException(404, detail=f"unknown analysis_id: {analysis_id}")
    return _to_out(entry, store.load_overrides())


@router.put("/analyses/{analysis_id}", response_model=AnalysisOut)
def update_analysis(
    analysis_id: str, body: AnalysisUpdateIn, user: CurrentUser = Depends(require_admin)
) -> AnalysisOut:
    entry = REGISTRY.get(analysis_id)
    if entry is None:
        raise HTTPException(404, detail=f"unknown analysis_id: {analysis_id}")
    try:
        store.save_override(analysis_id, body.template, actor=user.email)
    except store.AnalysisWriteForbidden as exc:
        raise HTTPException(status_code=423, detail=str(exc))
    clear_failures()
    get_audit_service().write(
        actor=user.email, entity="riaas", action="analysis_update", target=analysis_id
    )
    return _to_out(entry, store.load_overrides())


@router.post("/analyses/{analysis_id}/test", response_model=AnalysisTestResult)
def test_analysis(
    analysis_id: str, body: AnalysisTestRequest, _: CurrentUser = Depends(require_admin)
) -> AnalysisTestResult:
    entry = REGISTRY.get(analysis_id)
    if entry is None:
        raise HTTPException(404, detail=f"unknown analysis_id: {analysis_id}")
    params = build_filter_params(
        territory=body.territory,
        seller_id=body.seller_id,
        motion=body.motion,
        period=body.period,
    )
    try:
        soql = build_query(entry, params, template_override=body.template)
    except (KeyError, IndexError, ValueError) as exc:
        return AnalysisTestResult(ok=False, resolved_soql="", error=f"template error: {exc}")
    try:
        result = get_sf_client().query_all(soql)
    except Exception as exc:
        return AnalysisTestResult(ok=False, resolved_soql=soql, error=str(exc)[:500])
    rows = [flatten_record(r) for r in result.get("records", [])]
    return AnalysisTestResult(
        ok=True, resolved_soql=soql, row_count=len(rows), rows=rows[:20]
    )


@router.get("/analyses/{analysis_id}/history", response_model=list[AnalysisHistoryRow])
def get_history(analysis_id: str) -> list[AnalysisHistoryRow]:
    if analysis_id not in REGISTRY:
        raise HTTPException(404, detail=f"unknown analysis_id: {analysis_id}")
    return [AnalysisHistoryRow(**row) for row in store.load_history(analysis_id)]
