"""Field dictionary — every Salesforce field RIaaS analyses depend on.

Single source of truth for data provenance (spec §5.4). Tiers:
  A — activity-derived from Task/Event (reuses AE-dashboard fields)
  B — Opportunity/Account object fields
  C — score / conversation-intelligence derived

`confirmed=True` means the field was verified against the live org schema
(describe / SOQL probe, org 00DA0000000JfyFMAS, 2026-07-02). Analyses whose
required fields are not all confirmed ship blocked and render "Pending".
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FieldRef:
    key: str            # dictionary key referenced by AnalysisEntry.fields_required
    sf_object: str
    api_name: str
    tier: str           # "A" | "B" | "C"
    confirmed: bool
    notes: str = ""


_FIELDS = [
    # ---- Tier A: activity (Task/Event) — all confirmed, reused from AE dashboard ----
    FieldRef("task.type", "Task", "Type", "A", True),
    FieldRef("task.subtype", "Task", "TaskSubtype", "A", True),
    FieldRef("task.status", "Task", "Status", "A", True),
    FieldRef("task.inbound", "Task", "Inbound_Call__c", "A", True),
    FieldRef("task.voicemail", "Task", "Left_Voicemail__c", "A", True),
    FieldRef("task.who", "Task", "WhoId", "A", True),
    FieldRef("task.what", "Task", "WhatId", "A", True),
    FieldRef("event.meeting_type", "Event", "Meeting_Type__c", "A", True),
    FieldRef("event.meeting_status", "Event", "Meeting_Status__c", "A", True),
    FieldRef("event.meeting_source", "Event", "Meeting_Source__c", "A", True,
             "AE/SDR/AM Self-Generated, Partner, Conference, Content, Hand-raiser, SDR Campaign, Webinar"),
    FieldRef("ocr.contact", "OpportunityContactRole", "ContactId", "A", True,
             "multi-threading = distinct contacts per opp"),

    # ---- Tier B: Opportunity / Account object fields ----
    FieldRef("opp.amount", "Opportunity", "Amount", "B", True),
    FieldRef("opp.stage", "Opportunity", "StageName", "B", True,
             "NB funnel: Discovery → Business Validation → Commitment & Negotiation → Closed/Won|Lost"),
    FieldRef("opp.close_date", "Opportunity", "CloseDate", "B", True),
    FieldRef("opp.created_date", "Opportunity", "CreatedDate", "B", True),
    FieldRef("opp.owner", "Opportunity", "OwnerId", "B", True),
    FieldRef("opp.record_type", "Opportunity", "RecordType.Name", "B", True,
             "motion driver: New Business='Net New'; Expansion='Cross-sell','Upsell'"),
    FieldRef("opp.revenue_type", "Opportunity", "Revenue_Type__c", "B", True,
             "FORMULA — filterable but cannot GROUP BY; prefer RecordType.Name"),
    FieldRef("opp.source", "Opportunity", "Opportunity_Source__c", "B", True),
    FieldRef("opp.source_category", "Opportunity", "Opportunity_Source_Category__c", "B", True,
             "channel grain: Self-Generated, Marketing, Channel Partner, ..."),
    FieldRef("opp.source_team", "Opportunity", "Opportunity_Source_Team__c", "B", True),
    FieldRef("opp.days_in_stage", "Opportunity", "LastStageChangeInDays", "B", True,
             "standard field — no OpportunityHistory derivation needed"),
    FieldRef("opp.stage_change_date", "Opportunity", "LastStageChangeDate", "B", True),
    FieldRef("opp.forecast_category", "Opportunity", "ForecastCategory", "B", True),
    FieldRef("opp.mgmt_forecast", "Opportunity", "Management_Forecast__c", "B", True,
             "Pipeline / Exclude / Best Case / Commit / Closed Won"),
    FieldRef("opp.employees", "Opportunity", "Employees__c", "B", True, "account employees at deal"),
    FieldRef("opp.slippage", "OpportunityFieldHistory", "NewValue/OldValue (Field='CloseDate')", "B", True,
             "slippage derived from CloseDate pushes in field history"),
    FieldRef("opp.stage_history", "OpportunityHistory", "StageName/CreatedDate", "B", True,
             "funnel conversion / stage skips / stage duration"),
    FieldRef("acct.industry", "Account", "Industry", "B", True),
    FieldRef("acct.employee_range", "Account", "EmployeeRange__c", "B", True, "ICP attribute: employee size"),
    FieldRef("acct.icp_industry_group", "Account", "ICP_Industry_Group__c", "B", True, "ICP attribute"),
    FieldRef("acct.icp_segmentation", "Account", "(not on Account)", "B", False,
             "ICP_Segmentation__c exists on Contact/Lead only — no account-grain equivalent"),
    FieldRef("acct.is_icp", "Account", "Account_is_ICP__c", "B", True,
             "FORMULA Yes/No — filterable, cannot GROUP BY"),
    FieldRef("acct.territory", "Account", "Account_Territory__r.Name", "B", True,
             "territory grain; 'OLD - ' prefix = legacy rows; Opportunity.Territory2Id is unused"),
    FieldRef("user.role", "User", "UserRole.Name", "B", True, "team rollup for sellers"),
    FieldRef("user.manager", "User", "Manager.Name", "B", True),
    FieldRef("contact.job_title", "Contact", "Job_Title__c", "B", True, "persona seniority/dept source"),
    FieldRef("quota.amount", "ForecastingQuota", "QuotaAmount", "B", True,
             "quota via ForecastingType MasterLabel='Revenue' (AE-dashboard pattern)"),

    # ---- Tier C: score / CI derived ----
    FieldRef("opp.engagement_score", "Opportunity", "AI_Overall_Score__c", "C", True,
             "deal engagement score (percent); populated on ~17% of open opps — state coverage"),
    FieldRef("opp.momentum_score", "Opportunity", "AI_Momentum_Score__c", "C", True,
             "same sparse coverage as engagement score"),
    FieldRef("opp.meddic_summary", "Opportunity", "AI_MEDDIC_Summary__c", "C", True,
             "TEXTAREA — not filterable/groupable in SOQL; count non-null client-side"),
    FieldRef("opp.ai_metadata", "Opportunity", "AI_Metadata__c", "C", True,
             "TEXTAREA — parse JSON server-side for MEDDIC element scores"),
    FieldRef("acct.icp_overall", "Account", "AI_Overall_Score__c", "C", True,
             "ICP overall score (spec guessed ICP_Overall_score__c); 94% coverage"),
    FieldRef("acct.icp_fit", "Account", "AI_Fit_Score__c", "C", True),
    FieldRef("acct.icp_intent", "Account", "AI_Intent_Score__c", "C", True),
    FieldRef("contact.relationship_score", "Contact", "AI_Overall_Score__c", "C", True,
             "contact-grain relationship score, 84% coverage; powers multi-threading ≥30"),

    FieldRef("opp.meddic_numeric", "Opportunity", "AI_MEDDIC_Summary__c (parsed)", "C", True,
             "summary header carries 'MEDDIC COVERAGE: n/6' + per-element ✅/❌ — parsed "
             "server-side; only AI-scored deals have it (small cohort, state coverage)"),

    # ---- unconfirmed: no org field found ----
    FieldRef("user.skill_scores", "User", "(none found)", "C", False,
             "Gong CI skill fields (Discovery_Skill__c etc.) do not exist"),
    FieldRef("forecast.snapshots", "(none)", "(none found)", "B", False,
             "week-2/week-4 commit snapshots — no snapshot object found; needs "
             "OpportunityFieldHistory(ForecastCategory) reconstruction"),
    FieldRef("user.meeting_time", "(none)", "(none found)", "C", False, "% meeting time per seller"),
]

FIELD_DICTIONARY: dict[str, FieldRef] = {f.key: f for f in _FIELDS}


def unconfirmed(keys: list[str]) -> list[str]:
    """Field keys (of the given ones) that are not confirmed against the org."""
    return [k for k in keys if not FIELD_DICTIONARY[k].confirmed]
