# RIaaS build log

One lesson per entry, newest first. Update entries instead of duplicating.

## Quota (ForecastingQuota) — semi-join is invisible to the API user

The AE-dashboard pattern `ForecastingTypeId IN (SELECT Id FROM ForecastingType
WHERE MasterLabel = 'Revenue')` returns **0 rows** under the API user's
forecast-type visibility, even though ForecastingType itself lists the type and
the quota rows exist. Filtering directly on the active Revenue type Id
(`ForecastingTypeId = '0Db0f000000CwnDCAS'`) returns them (40 owners, ~$22M for
CY2026). C4-PIPE-COVERAGE pins the Id. Also: GROUP BY queries return the
relationship name **flat** (`Name`), not nested (`QuotaOwner.Name`) — read both.

## MEDDIC is parseable from AI_MEDDIC_Summary__c (big unlock)

The summary header carries `MEDDIC COVERAGE: n/6` plus `<b>ELEMENT | ✅/❌` markers →
`winloss_service.parse_meddic()` extracts a 0–6 score and per-element confirmation.
This unblocked C2-QUAL-WR, C2-MEDD-ELEMENTS, C5-MEDD-BY-STAGE. Cohort is small
(~135 closed / ~143 open scored deals) — every consumer states coverage.

## More field-truth corrections (live-verified)

- `ICP_Segmentation__c` is on **Contact/Lead only**, NOT Account — C2-EFF-ICP uses
  `EmployeeRange__c` + `ICP_Industry_Group__c` only.
- ~90% of OpportunityContactRole contacts have no `Job_Title__c` → persona analyses
  are dominated by "Unknown" (deck itself flags this; surfaced as pct_untitled).
- Won-deal stage history shows near-zero stage durations (deals are often created at
  close time for booking entry) — median NB cycle is ~10 days. Formulas are correct;
  this is org data reality and belongs in Key Findings, not code workarounds.
- Zero-win channels must not be dropped from C5-CHANNEL-ROI (efficiency None ≠ hide).

## Report pipeline (Phase 5) decisions

- The report renderer normalizes heterogeneous analysis payloads into KPI lists +
  tables server-side (`report_renderer._normalize`); the Jinja template stays dumb,
  inline-styled, email/print-safe. Live render: 186 KB, all five chapters.
- RIaaS schedules live in `RiSchedules` via `RiScheduleService(ScheduleService)`
  (table override only); APScheduler job ids `riaas-schedule-*`.
- New safety toggles in config: `SCHEDULER_ENABLED` (gates scheduler startup),
  `SENDGRID_SANDBOX_MODE`, `SENDGRID_RECIPIENT_OVERRIDE` (both inside
  `EmailService.send_html`, so AE digests inherit the same protection).
- Deploy runbook: docs/riaas/runbook.md.

## Org schema truth (confirmed live 2026-07-02, org 00DA0000000JfyFMAS)

Full describes cached in scratchpad `org/*.json`. What differs from the spec's guesses:

- **Fiscal calendar = calendar year** (`FiscalYearStartMonth=1`). FY26 = CY2026.
- **Motion**: `RecordType.Name` is the groupable motion driver — New Business =
  `'Net New'`, Expansion = `'Cross-sell','Upsell'`. `Revenue_Type__c` exists but is a
  **formula field → cannot GROUP BY or filter server-side**. Same for
  `Account_is_ICP__c` (values Yes/No, ~5% Yes).
- **Territory**: `Opportunity.Territory2Id` exists but is null everywhere. The real
  territory grain is `Account.Account_Territory__r.Name` (names prefixed `OLD - ` are
  legacy; a 2026 restructure flag `X2026_Territory_Restructure__c` exists). Team/seller
  rollup via `Owner.UserRole.Name` / `Owner.Manager`.
- **Days in stage**: standard `Opportunity.LastStageChangeInDays` (int) +
  `LastStageChangeDate` — no OpportunityHistory derivation needed for C3-RISK-STALLED.
- **ICP scores** live on **Account** as `AI_Overall_Score__c` / `AI_Fit_Score__c` /
  `AI_Intent_Score__c` (percent), NOT `ICP_*__c`. Coverage 599k/636k accounts.
  `EmployeeRange__c` + `ICP_Industry_Group__c` + `ICP_Segmentation__c` are the ICP
  attribute fields (no Business_Model/Market_Focus).
- **Contact-grain relationship score**: `Contact.AI_Overall_Score__c` (510k/607k
  populated) → multi-threading "score ≥ 30" is buildable.
- **Deal engagement scores sparse**: `Opportunity.AI_Overall_Score__c` /
  `AI_Momentum_Score__c` populated on only **144 of 834 open opps** — analyses work but
  must state coverage; benchmark from the scored cohort only.
- **Textarea fields are not filterable**: `AI_MEDDIC_Summary__c` / `AI_Metadata__c` in a
  WHERE clause → MALFORMED_QUERY. MEDDIC adoption (% with note) must SELECT the field
  and count non-null in the service layer (pandas), never in SOQL.
- **New Business stage funnel (active)**: Discovery → Business Validation →
  Commitment & Negotiation → Closed/Won | Closed/Lost. Mid-stage open counts are tiny
  (~6/3/6); funnel conversion needs OpportunityHistory over closed cohorts.
- **No slippage field** (`Slipped_Days__c`/`Days_In_Stage__c` don't exist) → slippage =
  CloseDate pushes from `OpportunityFieldHistory` (Field='CloseDate').
- **No CI skill fields on User** (Discovery_Skill__c etc.) → C4 skill analyses stay
  blocked. `User.Months_On_Quota__c`/`Weeks_onQuota__c` exist for seller tenure.
- Forecast: `ForecastCategory`(picklist) + `Management_Forecast__c` (Pipeline/Best
  Case/Commit/Closed Won) + `Forecast_Amount__c`. Week-2/week-4 snapshot accuracy needs
  history (OpportunityFieldHistory on ForecastCategory) or stays blocked.

## Repo/branch reality differs from spec

The spec names branch `overhaul/v2`; that branch does not exist. `main` *is* the
FastAPI + React app the spec describes. Work happens on `feat/riaas-org-performance`
off `main`.

## Pre-existing test failure (not RIaaS)

`tests/test_soql_endpoints.py::test_get_known_col_id_returns_entry` fails on a clean
checkout (`has_override is True`) — a local `soql_overrides.json` dev artifact causes
it. Not caused by and not fixed by RIaaS work.

## Feature flag (Phase 1) — decisions

- `require_riaas_access` returns **404** for non-allowlisted users; `ENV=dev` bypasses
  the allowlist entirely (matches spec "dev bypass still applies"), so local dev always
  sees Organization Performance. Test the off-state with `ENV=prod` like
  `test_riaas_access.py` does.
- First-access audit (`entity="riaas", action="access_granted"`) is deduped with a
  process-lifetime in-memory set — one event per user per process, not per lifetime.
  Good enough for launch; revisit if exact once-ever semantics matter.
- `/api/me` now returns `features: { riaas: bool }`; frontend nav gates on it and the
  `/org` route bundle is lazy (verified: own chunk `OrgPerformanceRoute.lazy-*.js` in
  `npm run build` output).

## Open org-specific values (§14)

- Fiscal calendar, stage names, territory model, ICP tier thresholds — all unconfirmed.
  Confirm during Chapter 1 (Phase 3) via live SOQL/describe.
- Salesforce credentials: `.env` exists at repo root — check whether SF_CLIENT_ID/SECRET
  are populated before attempting live field confirmation.
