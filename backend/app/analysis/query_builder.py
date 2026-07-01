"""RIaaS clause builders + build_query (mirrors legacy/soql_registry.py).

Filter logic lives here, never in templates at render time — templates only
carry {placeholders}. All values are escaped; no-op clauses use `Id != null`
(SOQL has no literal TRUE).
"""
from __future__ import annotations

from datetime import date

from app.analysis.registry import AnalysisEntry
from app.analysis.time_utils import resolve_riaas_period

# Motion → groupable RecordType.Name sets (confirmed against org; the
# Revenue_Type__c formula field cannot be grouped).
NEW_BUSINESS_TYPES = ("Net New",)
EXPANSION_TYPES = ("Cross-sell", "Upsell")
ALL_MOTION_TYPES = NEW_BUSINESS_TYPES + EXPANSION_TYPES

WON_STAGE = "Closed/Won"
LOST_STAGE = "Closed/Lost"


def soql_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _in_list(values: tuple[str, ...] | list[str]) -> str:
    return ",".join(f"'{soql_quote(v)}'" for v in values)


def _motion_clause(p: dict) -> str:
    motion = p.get("motion") or "all"
    types = {
        "nb": NEW_BUSINESS_TYPES,
        "exp": EXPANSION_TYPES,
        "all": ALL_MOTION_TYPES,
    }.get(motion, ALL_MOTION_TYPES)
    return f"RecordType.Name IN ({_in_list(types)})"


def _territory_clause(p: dict) -> str:
    if p.get("territory"):
        return f"Account.Account_Territory__r.Name = '{soql_quote(p['territory'])}'"
    return "Id != null"


def _seller_clause(p: dict) -> str:
    if p.get("seller_id"):
        return f"OwnerId = '{soql_quote(p['seller_id'])}'"
    return "Id != null"


def _close_date_clause(p: dict) -> str:
    return f"CloseDate >= {p['period_start']} AND CloseDate <= {p['period_end']}"


def _closed_clause(_p: dict) -> str:
    return f"IsClosed = true AND StageName IN ('{WON_STAGE}', '{LOST_STAGE}')"


def _open_clause(_p: dict) -> str:
    return "IsClosed = false"


# "Opportunity."-prefixed variants for child objects that filter through the
# parent (OpportunityFieldHistory, OpportunityHistory, OpportunityContactRole).
def _opp_motion_clause(p: dict) -> str:
    return "Opportunity." + _motion_clause(p)


def _opp_territory_clause(p: dict) -> str:
    if p.get("territory"):
        return (
            "Opportunity.Account.Account_Territory__r.Name = "
            f"'{soql_quote(p['territory'])}'"
        )
    return "Id != null"


def _opp_seller_clause(p: dict) -> str:
    if p.get("seller_id"):
        return f"Opportunity.OwnerId = '{soql_quote(p['seller_id'])}'"
    return "Id != null"


def _opp_close_date_clause(p: dict) -> str:
    return (
        f"Opportunity.CloseDate >= {p['period_start']} "
        f"AND Opportunity.CloseDate <= {p['period_end']}"
    )


def _opp_closed_clause(_p: dict) -> str:
    return (
        "Opportunity.IsClosed = true "
        f"AND Opportunity.StageName IN ('{WON_STAGE}', '{LOST_STAGE}')"
    )


CLAUSE_BUILDERS = {
    "{motion_clause}": _motion_clause,
    "{territory_clause}": _territory_clause,
    "{seller_clause}": _seller_clause,
    "{close_date_clause}": _close_date_clause,
    "{closed_clause}": _closed_clause,
    "{open_clause}": _open_clause,
    "{opp_motion_clause}": _opp_motion_clause,
    "{opp_territory_clause}": _opp_territory_clause,
    "{opp_seller_clause}": _opp_seller_clause,
    "{opp_close_date_clause}": _opp_close_date_clause,
    "{opp_closed_clause}": _opp_closed_clause,
}


def build_filter_params(
    *,
    territory: str | None = None,
    seller_id: str | None = None,
    motion: str | None = None,
    period: str | None = None,
    custom_start: date | None = None,
    custom_end: date | None = None,
) -> dict:
    start, end = resolve_riaas_period(period or "last_4_quarters", custom_start, custom_end)
    return {
        "territory": territory,
        "seller_id": seller_id,
        "motion": motion or "all",
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "won_stage": WON_STAGE,
        "lost_stage": LOST_STAGE,
    }


def build_query(entry: AnalysisEntry, params: dict, template_override: str | None = None) -> str:
    template = template_override if template_override is not None else entry.template
    resolved = {
        placeholder.strip("{}"): builder(params)
        for placeholder, builder in CLAUSE_BUILDERS.items()
    }
    return template.format(**{**params, **resolved})


def resolve_clauses(template: str, params: dict) -> list[tuple[str, str]]:
    """[(placeholder, resolved)] for clauses present in template — editor preview."""
    return [
        (ph, builder(params))
        for ph, builder in CLAUSE_BUILDERS.items()
        if ph in template
    ]
