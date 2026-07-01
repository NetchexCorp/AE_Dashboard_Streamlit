# Goal: Revenue Intelligence — "Organization Performance" (RIaaS) in the AE Dashboard

## 0. How to use this document

This is the implementation brief for **Claude Code** to build a **Revenue Intelligence**
feature — an interactive dashboard + scheduled "Revenue Insights Report" modeled on
Fullcast's *Revenue Insights as a Service (RIaaS)* deck (`RIaaS Introduction deck - May
26.pdf`).

**It is built inside the existing repo**, not as a new project. The target codebase is
the Netchex **AE Performance Dashboard**
(`https://github.com/NetchexCorp/AE_Dashboard_Streamlit.git`, branch `overhaul/v2` —
FastAPI backend + React/Tailwind/TanStack frontend on Azure Container Apps). RIaaS is
added as **new backend routers + new frontend pages in that same app**, surfaced as a
new top-level **"Organization Performance"** navigation group next to the existing
**"Individual Performance"** tabs.

> This `goal.md` is the planning spec. Place it in the existing repo (e.g.
> `docs/riaas/goal.md`) when work starts; the current `revenue-intelligence-dashboard`
> directory is just where the spec was drafted.

The **product surface** (what analyses to show, metric definitions) comes from the deck
and is in §6. The **engineering substrate** is **already present in the repo** — RIaaS
reuses the app's existing auth, Salesforce client, storage, logging, scheduler, and
report pipeline in place (§2). **When a decision is unspecified here, follow the existing
app's conventions.**

Key decisions already made (do not re-litigate):

- **Same repo / same app.** RIaaS ships **inside** `AE_Dashboard_Streamlit`: new FastAPI
  routers + services + a new `analysis/` domain module in `backend/`, and new pages +
  an "Organization Performance" nav group in `frontend/`. **No new repo, no new
  containers, no parallel stack** — it reuses the app's existing Container Apps, Entra
  Easy Auth, Salesforce Connected App, and Storage account directly.
- **Unified navigation.** One UI, two top-level groups: **Individual Performance**
  (the existing AE tabs, unchanged) and **Organization Performance** (the RIaaS chapters
  + Revenue Insights Report). See §9.
- **Feature flag.** The entire Organization Performance surface is gated behind an email
  allowlist, launch value **`pmankar@netchexonline.com`**. Definition, enforcement, and
  off-state guarantee live in **§7.1** (the single source of truth for the gate).
- **Data source:** every metric — relationship/engagement scores, MEDDPICC, ICP tiers,
  CI skill scores, enrichment — is read from **Salesforce fields (standard or custom)**.
  The feature is SOQL-driven; **no external score/CI/enrichment integrations**. Field
  API names are confirmed during build via the **blocked-analysis** pattern (§5.4).
- **Scope:** all **five chapters** of the deck, full detail (§6).
- **Deployment:** ship as a **new revision of the existing app** — the feature flag is a
  production-safe dark launch; promote by revision traffic shift (§11). Never a second
  environment.
- **Deliverables:** the interactive Organization Performance dashboard *and* a
  **scheduled/exportable Revenue Insights Report** (reusing the app's SendGrid + Jinja2
  report pipeline).

---

## 0.1 Working agreement for the building agent

Execute this brief largely **end-to-end**. It is a long-horizon build — multi-day, six
phases (§13), five chapters, dozens of analyses — so treat it as a single sustained task,
not a pile of disconnected tickets. The rules below govern how to operate over that
horizon; the domain detail (§5–§6) is what to build.

- **Act on what's decided; don't re-plan it.** The "key decisions" above and the specs in
  §5–§6 are settled. When you have enough information to act, act — build, don't re-survey
  the option space or re-derive facts already in this doc. If an implementation choice
  isn't covered here, pick the option consistent with the existing app's conventions,
  note it in one line, and proceed; don't stop to ask.

- **Stay in scope; do the simplest thing that works.** You are extending a **live** app.
  Do not refactor, re-abstract, or "improve" the existing Individual Performance code, and
  do not add features, config, fallbacks, or validation beyond what an analysis actually
  needs. No backwards-compat shims and no feature flags beyond the one in §7.1. New
  abstraction is justified only when a second concrete caller needs it — the analysis
  registry (§5) is the **one** place the spec genuinely requires generality.

- **Pause only when genuinely blocked.** End your turn to ask the user only for: (a) a
  destructive or irreversible action, (b) a real change to a decision in §0, or (c) a
  **Salesforce field API name you cannot confirm from the org yourself** — the
  `blocked`/field-dictionary checkpoint (§5.4). Everything else — building analyses,
  wiring routers, writing tests, deploying a 0%-traffic revision — follows from this
  brief; proceed without asking. Never end a turn on a promise ("I'll wire the report
  next"); do the next step.

- **Confirm fields against the org; don't guess.** The provisional field names in §5.4 are
  hypotheses. Verify each against the live org schema (describe/SOQL) before relying on it;
  if unconfirmed, ship the analysis `blocked=True` → "Pending" rather than inventing a
  field. This is the single most important correctness discipline in the build.

- **Ground every progress claim in evidence.** Before reporting an analysis, chapter, or
  phase "done," point to a tool result from this session that proves it: a real SOQL
  response with rows (or a legitimate "Pending" state), a passing test, a live route. If
  something isn't verified, say so plainly. Never report a metric as working from the
  template alone.

- **Verify against the spec at intervals.** As each chapter lands, check it against §6 (the
  deck's definitions and formulas) and against the existing test patterns
  (`backend/tests/`). Prefer a **fresh-context verifier subagent** over self-review: after
  a chapter is wired, have a subagent confirm each analysis's grain, viz, and formula
  match §6 and that per-analysis error isolation (§5.2) still holds.

- **Delegate the parallel work.** Chapters (§6) and the analyses within them are largely
  independent. Dispatch per-chapter or per-analysis work to subagents and keep moving;
  intervene if one drifts from the grain/formula spec or lacks org-field context. The
  feature-flag scaffold (phase 1) must land first — everything mounts behind it.

- **Keep a build log.** Maintain `docs/riaas/notes.md`, one lesson per entry with a
  one-line summary on top: confirmed field API names and where they live, org-specific
  values still open in §14 (fiscal calendar, stage names, territory model, ICP tier
  thresholds), and gotchas (e.g. the My-Domain token rule, §4). Say why each mattered;
  update entries instead of duplicating; delete ones proven wrong. Check it before
  re-investigating something.

- **Effort:** default to `high`; use `xhigh` for the analysis registry and the auth/flag
  gate (§5, §7); routine wiring can run `medium`.

---

## 1. Product summary (from the deck)

Fullcast RIaaS "helps organizations unlock their full revenue potential with
data-driven intelligence… boost win rates, streamline processes, and sharpen execution
with targeted coaching." The Revenue Insights Report is organized into **five
chapters**:

1. **GTM Efficiency Overview** — high-level view of revenue-productivity drivers: CRM
   data completeness, pipeline→revenue conversion, sales velocity, revenue per seller,
   territory efficiency gap, New Business vs Expansion.
2. **Win/Loss & Benchmark** — the signals behind wins/losses and what top performers do
   differently (engagement, slippage, qualification/MEDDPICC, deal size, industry, ICP,
   multi-threading, personas).
3. **Pipeline Health Assessment** — coverage, maturity, MEDDPICC adoption, and at-risk
   pipeline (low engagement, stalled, slipped) plus account relationship depth.
4. **Coach (People Insights)** — forecast accuracy, territory velocity leaderboard,
   pipeline coverage, and per-seller selling-skill coaching focus.
5. **GTM Process Optimisation** — lead-assignment fit, funnel conversion/slippage,
   process adherence, channel ROI, and marketing/sales ICP alignment.

These five chapters live under **Organization Performance**. Audience: **CRO and revenue
leadership**. Each chapter view pairs charts/tables with an editable, executive-readable
**"Key Findings"** narrative.

---

## 2. The codebase you're extending (reuse in place)

You are adding to the running app, not scaffolding a new one. Read these existing files
first — RIaaS reuses each directly rather than copying it into a new project:

| Concern | Existing file(s) — reuse in place |
|---|---|
| App composition, lifespan, CORS | `backend/app/main.py` (register new RIaaS routers here) |
| Settings (pydantic-settings, ENV, SF aliases) | `backend/app/config.py` (add RIaaS settings) |
| Logging | `backend/app/logging_setup.py` |
| Easy Auth principal decode | `backend/app/auth/principal.py` |
| Dev identity bypass | `backend/app/auth/dev_identity.py` |
| Auth dependencies / role gate | `backend/app/deps.py` (add `require_riaas_access`) |
| Salesforce client-credentials + SfClient | `backend/app/services/salesforce_client.py` (reuse as-is) |
| Azure Table Storage client + fallback | `backend/app/storage/tables.py`, `storage/migrations.py` |
| SOQL registry / templating / error isolation | `backend/app/legacy/soql_registry.py`, `legacy/data_engine.py`, `legacy/soql_store.py`, `legacy/time_filters.py` (the pattern RIaaS's `analysis/` module generalizes) |
| Orchestration df→response | `backend/app/services/dashboard_service.py` |
| Audit log (reverse-epoch RowKey) | `backend/app/services/audit_service.py` (reuse; namespace with `entity="riaas"`) |
| Email + report render | `backend/app/services/email_service.py`, `services/report_renderer.py`, `templates/*.html` |
| Scheduler (APScheduler cron) | `backend/app/scheduler/`, `schedulers_registration.py`, `services/schedule_service.py` |
| Routers | `backend/app/routers/*.py` (add RIaaS routers alongside) |
| Frontend shell / router / query / table | `frontend/src/` (App, router, api/client, hooks, components, stores) — add nav group + pages |
| Infra (Bicep) | `infra/main.bicep`, `infra/modules/*.bicep` (unchanged; RIaaS ships in the same images) |
| Containerization | `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml` |
| SOQL snapshot sync | `scripts/sync_queries.py`, `queries_snapshot.json` (mirror for RIaaS analyses) |

> The AE dashboard's *business logic* (per-AE All-Source Summary) is untouched and
> becomes the "Individual Performance" group. RIaaS **adds** the "Organization
> Performance" domain (§6) alongside it in the same app.

---

## 3. Architecture (extend the existing app, don't add infra)

RIaaS runs **inside the existing two Container Apps** — no new services:

```
                    ┌──────────────────────────┐
   user (Entra)──▶  │ UI Container App (nginx) │  external ingress + Easy Auth (AAD)
                    │  React app:              │
                    │   • Individual Perf (AE) │
                    │   • Organization Perf ◀──┼── new nav group (flag-gated)
                    └─────────────┬────────────┘
                                  │ /api/* internal HTTPS, X-MS-CLIENT-PRINCIPAL forwarded
                    ┌─────────────▼────────────┐
                    │ API Container App        │  internal ingress
                    │  FastAPI:                │
                    │   • existing AE routers  │
                    │   • new RIaaS routers ◀──┼── flag-gated
                    │  + APScheduler           │
                    └──┬───────────────┬───────┘
        Salesforce ◀───┘               └──▶ Azure Table Storage
        (existing client_credentials)       (existing tables + new Ri* tables, §8)
                                  │
                                  ▼
                              SendGrid (existing pipeline; adds RIaaS digests)
                              Log Analytics (existing workspace)
```

- **No new containers, no new Bicep resources.** RIaaS is new code compiled into the
  same backend + frontend images.
- **Salesforce** reused via the existing client-credentials `SfClient` (§4).
- **Azure Table Storage** reused; RIaaS adds its own tables (§8).
- **APScheduler / SendGrid** reused; RIaaS registers its own report jobs (§10).

### 3.1 In-app isolation (the real blast-radius concern now)

Because RIaaS shares one app with live "Individual Performance" users, isolation is
*within* the process, not across containers:

- **Access gate** — the RIaaS feature flag is the primary isolation boundary; see §7.1
  for its definition, enforcement, and off-state guarantee.
- **Error isolation:** a RIaaS analysis/router failure must never bubble into the shared
  app — keep the per-analysis error isolation (§5.2) and mount RIaaS routers so an
  exception returns a scoped error, not a 500 for the whole API.
- **Frontend:** lazy-load the Organization Performance route bundle so RIaaS JS is never
  parsed for non-flagged users and can't regress the existing tabs.
- **Deployment safety** comes from revision promotion + the flag, not a separate stack
  (§11).

---

## 4. Salesforce access (reuse the app's existing client)

RIaaS reuses `salesforce_client.py` **as-is** — same Connected App, same integration
user, same token cache. No changes needed.

> **Not a blast-radius concern.** RIaaS is **read-only SOQL**, and combined production +
> RIaaS load stays well within the org's API governor/daily limits. No dedicated
> Connected App, separate integration user, or API-budget throttling is required.

Properties of the existing client RIaaS relies on:

- **Client-credentials flow**; `SF_CLIENT_ID`/`SALESFORCE_CLIENT_ID` +
  `SF_CLIENT_SECRET`/`SALESFORCE_CLIENT_SECRET` via `AliasChoices`.
- **My-Domain rule.** `SF_LOGIN_URL` is the org My Domain
  (`https://netchex.my.salesforce.com`), never `login.salesforce.com` /
  `test.salesforce.com` (CC-flow tokens minted there are rejected with
  `INVALID_SESSION_ID`).
- **Thread-safe token cache** (90-min lifetime + 401-driven refresh); **`SfClient`**
  retries once on `SalesforceExpiredSession`; **`probe_userinfo`** backs the Salesforce
  Connection status page. `SF_API_VERSION` = `v60.0`.

---

## 5. Domain data layer — the "Analysis Registry" (generalize the SOQL registry)

The AE dashboard has one output shape (per-AE rows). RIaaS has **many analyses with
different units of aggregation** (deal-size band, slippage bucket, MEDDPICC bucket,
territory, seller, industry, ICP attribute, channel, funnel stage, persona
department×seniority, quarter). Generalize the registry accordingly in a new
`backend/app/analysis/` module (the RIaaS counterpart to `legacy/soql_registry.py`).

### 5.1 `AnalysisEntry` (extends the `SOQLEntry` idea)

```python
@dataclass
class AnalysisEntry:
    analysis_id: str          # e.g. "C1-VELOCITY-NB", "C2-ENGAGEMENT-WINRATE"
    chapter: str              # "GTM Overview" | "Win/Loss" | "Pipeline Health" | "Coach" | "GTM Process"
    title: str                # deck question, e.g. "How is New Logo Sales Velocity Trending Over Time?"
    viz: str                  # "kpi" | "bar" | "grouped_bar" | "line" | "combo" | "heatmap" | "table" | "funnel" | "matrix"
    grain: str                # aggregation unit: "quarter" | "deal_size_band" | "territory" | "seller" | "industry" | "icp_attr" | "channel" | "stage" | "persona" | "account" | "opportunity"
    description: str          # tooltip / methodology note (include the deck's data-scope caption)
    template: str             # parameterized SOQL (use {placeholders}); "" if computed
    time_filter: bool
    computed: bool = False    # derived from other analyses (e.g. sales velocity, efficiency)
    blocked: bool = False     # pending Salesforce field confirmation → renders "Pending"
    formula: str = ""         # human-readable metric definition (see §6 formulas)
    fields_required: list[str] = field(default_factory=list)  # SF fields this analysis depends on
```

### 5.2 Reused mechanics (mirror `soql_registry.py` / `data_engine.py`)

- **Parameterized templates** with `{placeholders}` and reusable **clause builders**
  (owner/manager/territory/date-range). Add RIaaS-specific builders as needed
  (e.g. `{territory_clause}`, `{stage_clause}`, `{icp_clause}`).
- **`build_query(entry, params)`** substitutes filters. Never change filter logic at
  render time — only fill placeholders.
- **Per-analysis error isolation:** if one query fails, only that analysis renders an
  error/`NaN`; the rest of the chapter still loads. (This is the AE dashboard's
  cardinal rule — preserve it.)
- **Batching:** where multiple metrics share a grain and filters, batch via
  `GROUP BY` (mirror `BATCH_FIELD_MAP`) to cut round-trips.
- **Time filters:** reuse `time_filters.py` for fiscal-year/quarter/MTD/period +
  custom range resolution. Add **quarter-series** helpers (FY25 Q1..FY26 Qn) since many
  deck charts are quarterly trends.
- **Computed analyses** (velocity, efficiency, revenue/seller, attainment) are derived
  in the service layer from base analyses — no SOQL — exactly like the AE dashboard's
  computed columns E/H/O.

### 5.3 Overrides + snapshot

- SOQL/analysis templates are editable at runtime by admins and stored in Table Storage
  (`RiAnalyses` table), with a git-tracked `analyses_snapshot.json` and a
  `scripts/sync_analyses.py` sync tool. Mirror `soql_store.py` +
  `queries_snapshot.json` + `sync_queries.py`, gated by `ALLOW_PROD_QUERY_WRITES`.

### 5.4 Data provenance tiers (know where each metric comes from)

Not everything needs an external-synced custom field. Classify every analysis's inputs
into one of three tiers — this determines how much is buildable today vs `blocked`:

- **Tier A — Activity-derived from Task/Event (already available; reuse AE dashboard
  SOQL).** Emails, calls, voicemails, meetings held/scheduled, and **marketing-sourced
  meetings** are all captured on `Task`/`Event` with the exact fields the AE dashboard
  already queries: `Task.Type`/`TaskSubtype`/`Status`/`Inbound_Call__c`/
  `Left_Voicemail__c`/`WhoId`/`WhatId`/`Subject`/`ActivityDate`, and
  `Event.RecordType.Name`/`Meeting_Type__c`/`Meeting_Specifics__c`/`Meeting_Status__c`/
  **`Meeting_Source__c`** (`Conference`/`Hand-raiser`/`Webinar`/`Content`). Gong logs
  calls *as Tasks*, so call/meeting **volume** is here too (note the `Subject LIKE
  '%Gong In%'` handling). **Multi-threading counts** are derivable now (distinct `WhoId`
  per opp/account, or `OpportunityContactRole`). Copy directly from
  `soql_registry.py`. Powers: marketing meeting sourcing, channel activity
  (**C5-CHANNEL-ROI**), **C2-MULTITHREAD-WR**, the threading side of
  **C3-ACCT-RELATIONSHIP**, and activity coverage in **C1-CRM-COMPLETE**.
- **Tier B — Opportunity/Account fields.** MEDDPICC score/note, slippage, days-in-stage,
  ICP tier/attributes, revenue type/motion, source/channel, industry, seniority. These
  are object fields (or derivable from `OpportunityHistory`/`OpportunityFieldHistory`),
  not activity rows.
- **Tier C — Score / conversation-intelligence derived.** The Ebsta 0–100
  **relationship/engagement score** and Gong call-**quality** scores (discovery,
  objection, demo, negotiation, talk ratio). A Task row proves an activity *happened*,
  not *how well*. Two paths: (1) if the score is synced to a field, read it; (2) for the
  engagement score, **compute an activity-based proxy** from Task/Event recency +
  frequency + breadth so **C2-ENGAGE-CONV** / **C3-RISK-ENGAGE** need not be blocked.
  Genuine CI quality scores with no field stay `blocked`.

Maintain a single **field dictionary** module tagging each analysis's inputs by tier,
with API names and a `confirmed: bool`. Tier-A analyses are buildable immediately;
Tier-B/C analyses whose fields are unconfirmed start `blocked=True` and render a
**"Pending"** placeholder (AE dashboard pattern) until verified against the org schema.

**Confirmed org fields (present in the Netchex org — treat as `confirmed`):**

| Concept | SF home | Field | Notes / powers |
|---|---|---|---|
| Deal engagement / health score | Opportunity | `AI_Overall_Score__c` | Deal-level engagement score. → **C2-ENGAGE-CONV**, **C3-RISK-ENGAGE** (score vs benchmark). Replaces the Task/Event proxy at the opp grain. |
| Deal momentum / progression | Opportunity | `AI_Momentum_Score__c` | Progression signal. → **C3-RISK-STALLED**; momentum lens on slippage. |
| MEDDIC/MEDDPICC summary | Opportunity | `AI_MEDDIC_Summary__c` | **Likely text.** Field-present ⇒ **C3-MEDD-ADOPT** ("% deals with note"). Numeric buckets (**C2-QUAL-WR**) / element scores (**C2-MEDD-ELEMENTS**) need a number — parse from summary or `AI_Metadata__c`, else partial-blocked. |
| AI signal metadata | Opportunity | `AI_Metadata__c` | **Parse as JSON** server-side for MEDDIC element scores, momentum/risk reasons. May un-block **C2-MEDD-ELEMENTS** and enrich risk tables. |
| ICP overall (tier driver) | Account | `ICP_Overall_score__c` | Primary High/Very-High tier. → **C3-ICP-SHARE**, ICP quality throughout. |
| ICP firmographic fit | Account | `ICP_Fit_score__c` | Refines **C2-EFF-ICP**, prioritization. |
| ICP intent | Account | `ICP_Intent_score__c` | Intent lens on ICP quality / prioritization. |

**Still provisional (confirm during build):**

| Concept | Likely SF home | Provisional field |
|---|---|---|
| Relationship score (account / contact grain) | Account / Contact | `Relationship_Score__c` (or roll-up of `AI_Overall_Score__c` across contact roles) — for **C3-ACCT-RELATIONSHIP** |
| MEDDPICC numeric total / element scores | Opportunity | derive from `AI_MEDDIC_Summary__c` / `AI_Metadata__c`, else `MEDD_*__c` |
| ICP **attributes** (not scores) | Account | `Employee_Size__c`, `Business_Model__c`, `Market_Focus__c` — deck **C2-EFF-ICP** breakdown |
| Deal slippage (days) | Opportunity | `Slipped_Days__c` or derived from CloseDate history |
| Days in current stage | Opportunity | `Days_In_Stage__c` or derived from `OpportunityHistory` |
| Channel / source | Opportunity | `Opportunity_Source__c`, `Opportunity_Source_Category__c`, `Opportunity_Source_Team__c` |
| Revenue type / motion (New Business vs Expansion) | Opportunity | `Revenue_Type__c`, `Type` |
| Territory / team | User / Opportunity | `Territory__c`, `Owner.Manager.Name` |
| Stakeholder count / multi-threading | Opportunity / OpportunityContactRole | count of `OpportunityContactRole` (Tier A) |
| Persona dept/seniority | Contact | `Job_Title__c` → derived Department/Seniority buckets |
| Forecast commit snapshots | ForecastingItem / custom snapshot obj | `Commit_Forecast__c`, snapshot by week |
| Selling-skill scores (Gong-derived) | User / custom `Selling_Skill__c` obj | `Discovery_Skill__c`, `Demo_Skill__c`, … |
| % meeting time, call scores | custom CI object | per-seller fields |

> Deriving slippage/days-in-stage from `OpportunityHistory`/`OpportunityFieldHistory` is
> acceptable if no dedicated field exists — expose the choice in the field dictionary.

---

## 6. The five chapters — full analysis specs

Each analysis below becomes one or more `AnalysisEntry` records. Formulas are the
deck's definitions. Every view shows: the chart/table, the methodology/data-scope
caption (from the deck), and — at chapter level — an editable **"Key Findings"**
narrative block. Filters (§9) apply globally.

**Global metric definitions:**
- **Sales Velocity** = (`# Deals` × `Win Rate` × `ACV`) ÷ `Sales Cycle` (days). Report
  as `$/day`.
- **Sales Efficiency** = (`Win Rate` × `ACV`) ÷ `Sales Cycle`.
- **ACV** = average closed-won deal amount for the cohort.
- **Win Rate** = won ÷ (won + lost) for the cohort.
- **Sales Cycle** = median (or mean, per view) days from qualifying-stage entry to close.
- **Revenue per Seller** = bookings ÷ active seller count.
- **Forecast Accuracy** = (1 − |Forecast − Actual| ÷ Actual) × 100.
- **Slippage** = days the projected CloseDate was pushed out.
- **Pipeline Maturity** = % of pipeline $ in mid/late stages.
- **Multi-threading** = distinct engaged stakeholders per deal/account (score ≥ 30).

### Chapter 1 — GTM Efficiency Overview  (deck pp. 9–13)

| id | Title | Viz / grain | Definition |
|---|---|---|---|
| C1-CRM-COMPLETE | How complete & accurate is our CRM data? | KPI + bar | % contacts/leads missing from CRM; % with no job title; % of those-with-title that are decision-makers (Director/Head/VP/CxO). |
| C1-VELOCITY-NB | New Logo sales velocity trend | combo (bars=velocity, overlay KPIs) / quarter | Sales Velocity by quarter, FY25 vs FY26, New Business. Show Deals Closed, Win Rate, Avg Amount, Avg Cycle, Velocity per quarter. |
| C1-VELOCITY-EXP | Expansion sales velocity trend | combo / quarter | Same as above for Expansion motion. |
| C1-RPS-NB | New Logo revenue per seller trend | combo (bars=$/seller, line=seller count) / quarter | Revenue per Seller by quarter with seller count. |
| C1-RPS-EXP | Expansion revenue per seller trend | combo / quarter | Same for Expansion. |
| C1-TERR-EFF-GAP | Territory sales efficiency gap | bar / territory | Sales Efficiency by territory; quantify top-vs-bottom execution gap. |

### Chapter 2 — Win/Loss Analysis & Benchmark  (deck pp. 14–26)

| id | Title | Viz / grain | Definition |
|---|---|---|---|
| C2-ENGAGE-CONV | Engagement level vs conversion | grouped bar / relationship-score band × deal-size band | Win rate by relationship-score band (…,91–100) within each deal-size band. |
| C2-SLIPPAGE-WR | Slippage impact on win rate | combo (bar=deal count, line=win rate) / slippage bucket | Win rate by slippage duration (0–60, 61–180, 181+ days). Note: WR halves past 60d, ~7.5% past 181d. |
| C2-QUAL-WR | Qualification (MEDDPICC) impact on win rate | bar / MEDDPICC-score bucket | Win rate by avg MEDDPICC score bucket; deals ≥3 vs <3. |
| C2-MEDD-ELEMENTS | Avg MEDDPICC element scores in won vs lost | grouped bar / element | Avg per-element score, Won vs Lost, Overall vs Top Territory. |
| C2-EFF-DEALSIZE | Sales efficiency by deal size | combo / deal-size band | Efficiency by band + deal count; large-deal outperformance & volume share. |
| C2-CYCLE-AGE-WR | Win rate vs deal age | line / deal-age band × deal-size band | Win rate by age band (1–30 … 361+), per size band. |
| C2-MEDIAN-CYCLE | Median duration to close (won vs lost) | grouped bar / deal-size band | Median days-to-close, Won vs Lost, per size band (won-deal benchmarks). |
| C2-EFF-INDUSTRY | Sales efficiency by industry | bar / industry | Efficiency + deal count by industry; volume share of top-5 efficient. |
| C2-EFF-ICP | Sales efficiency by ICP attributes | 3× bar / employee-size, business-model, market-focus | Efficiency + deal count per ICP attribute. |
| C2-MULTITHREAD-WR | Multi-threading impact on win rate | combo / stakeholder-count band | Win rate by number of stakeholders; avg stakeholders won vs lost. |
| C2-PERSONA-WON | Typical personas in won deals | stacked bar / department × seniority | Distribution of engaged personas in won deals; flag % with no title. |
| C2-PERSONA-IMPACT | Which personas most impact win rate | matrix / department × seniority | Win rate matrix by department × seniority vs overall average. |

### Chapter 3 — Pipeline Health Assessment  (deck pp. 27–35)

| id | Title | Viz / grain | Definition |
|---|---|---|---|
| C3-ICP-SHARE | High-ICP pipeline share | line / quarter | % of pipeline in High/Very-High ICP accounts vs historical avg. |
| C3-MATURITY | Pipeline maturity check | grouped bar / territory | % pipeline $ in mid/late stage per territory + avg sales cycle. |
| C3-MEDD-ADOPT | MEDDPICC adoption | KPI + bar / territory | % deals with MEDDPICC score; % with MEDDPICC note. |
| C3-RISK-ENGAGE | Deals at risk — low engagement | KPI + table | Count/$ of open deals below relationship-score benchmark; at-risk deal list (Seller, Opp, Stage, Amount, Score vs benchmark). |
| C3-RISK-STALLED | Deals at risk — stalled progress | KPI + table | Deals stalled in current stage (days-in-stage vs stage benchmark); % aged >180d; at-risk list. |
| C3-RISK-SLIPPED | Deals at risk — slippage | combo + table / slippage bucket | % deals slipped 90+/181+ days; where in funnel slippage occurred; slipped-deal list. |
| C3-ACCT-RELATIONSHIP | Account relationships overview | 2× stacked bar / account-segment | Account relationship-score breakdown by segment; multi-threading breakdown (single-threaded / not engaged), contacts with score ≥30. |

### Chapter 4 — Coach (People Insights)  (deck pp. 36–41)

| id | Title | Viz / grain | Definition |
|---|---|---|---|
| C4-FORECAST-ACC | Week-2 / Week-4 forecast accuracy | grouped bar / territory | Forecast Accuracy % at week 2 and week 4 per territory vs commit. |
| C4-TERR-VELOCITY | Territory sales velocity leaderboard | table + trend / seller-territory | Per territory: Quota Attainment, Sales Velocity ($/day), velocity trend, Win Rate, Sales Cycle, Avg Deal Value, Opp Count, % New Revenue from Expansion. Color-flag Too High/Too Low/Low. |
| C4-PIPE-COVERAGE | Pipeline coverage | bar / territory | Open pipeline ÷ remaining quota (coverage ratio) per territory. |
| C4-COACH-FOCUS | Coaching focus for deal risk | table / seller | Aggregates each seller's at-risk deals (engagement/stalled/slippage) into coaching priorities. |
| C4-DISCOVERY-SKILL | Discovery effectiveness | radar/grouped bar / skill | Discovery/pain-point/value scores this-quarter vs last-quarter (from CI skill fields). |
| C4-OBJECTION-SKILL | Objection handling | radar/grouped bar / skill | Objection-handling scores this vs last quarter. |
| C4-SKILL-LEADERBOARD | Seller selling-skill leaderboard | table / seller | Overall + Demo, Discovery, Objection, Negotiation, Product Knowledge, Competitive Positioning, Forecast Accuracy (2-wk), % Meeting Time, Multi-threading, Engagement. |

### Chapter 5 — GTM Process Optimisation  (deck pp. 42–49)

| id | Title | Viz / grain | Definition |
|---|---|---|---|
| C5-CHANNEL-ROI | Channel ROI | combo / channel | Sales Efficiency + deal count by channel (Events, BDR Outbound, AE Outbound, Partner/Referral, Website, …); win rate & cycle context. |
| C5-ICP-ALIGN | Marketing/Sales ICP alignment | table / industry | Deal-volume rank vs win-rate rank per industry; rank gap; flag over/under-investment (gap ≥5). |
| C5-LEAD-ASSIGN | Are deals assigned to the right sellers? | matrix / seller × industry | Win rate + deal count per seller × industry; flag routing mismatches (strong closer under-allocated). |
| C5-FUNNEL | Sales funnel performance | funnel / stage | Stage-to-stage conversion %, slip %, and avg stage duration for converted deals (Discovery → Solution Alignment → Solution Validation → Formal Proposal → Negotiation → Closed Won). |
| C5-FUNNEL-TERR | Funnel performance by territory | matrix / territory × stage | % Convert and % Slip per stage per territory. |
| C5-ADHERENCE | Sales process adherence | bar / stage | % deals that skip each stage. |
| C5-MEDD-BY-STAGE | MEDDPICC benchmark by stage | grouped bar / stage | Avg MEDDPICC score by stage, Top vs Average territory. |
| C5-STAGE-CRITERIA | Key stage criteria from past wins | table / stage | Entry/exit signal benchmarks derived from won-deal history. |

> **Blocked-until-confirmed:** analyses depending on fields not yet verified (CI skill
> scores, MEDDPICC elements, ICP attributes, snapshot-based slippage) ship as `blocked`
> and render "Pending", exactly like the AE dashboard's stub columns. They are wired
> end-to-end but gated on the field dictionary (§5.4).

---

## 7. Auth & roles (reuse the app's existing auth)

### 7.1 Feature-flag access gate (Organization Performance)

The whole Organization Performance surface — the nav group **and** every RIaaS API
router — is gated to an **email allowlist**, launch value `pmankar@netchexonline.com`:

- **Config:** `FEATURE_RIAAS_ALLOWED_EMAILS` (comma-separated, lower-cased) in the
  existing `Settings`. Add a `settings.riaas_allowed_list` property (mirror
  `bootstrap_admin_list`). A single env var keeps the flag deploy-controlled and
  auditable; later this can be swapped for a per-user grant in the existing `users`
  table without touching call sites.
- **Enforcement (server-side, authoritative):** a `require_riaas_access` dependency in
  `deps.py` layered on `get_current_user` — if the caller's email isn't in the
  allowlist, return **404** (not 403) so the feature is invisible. Mount it on **every**
  RIaaS router. Dev bypass still applies when `ENV=dev`.
- **Discovery:** extend `GET /api/me` to return `features: { riaas: bool }` so the
  frontend shows/hides the Organization Performance nav group. Never rely on client-side
  gating alone.
- **Audit:** log first access per user (`entity="riaas", action="access_granted"`) in
  the existing audit table.

> **Guarantee (this is the single source of truth for the gate).** With the flag off for
> a user, the Organization Performance surface is invisible and inert: no nav entry, no
> route bundle downloaded (the frontend lazy-loads it, §9), no API access, no data — the
> app is byte-for-byte what it is today. This gate is the **primary in-app isolation
> boundary**; the isolation and deployment sections (§3.1, §11.2) reference it rather than
> redefine it.

### 7.2 Identity & roles (already in the app)

- **Prod:** Azure Container Apps **Easy Auth (AAD)**; the API trusts the forwarded
  `X-MS-CLIENT-PRINCIPAL` header, decoded by `parse_x_ms_client_principal`. Unchanged.
- **App-managed roles:** hybrid Entra identity + app roles (`admin` | `user`) in the
  existing `users` table; `get_current_user` / `require_admin` as today. RIaaS admin
  pages sit behind `require_admin` **and** `require_riaas_access`.
- **Dev:** `ENV=dev` bypasses auth; `DEV_ROLE` + `DEV_USER_EMAIL` seed identity.
- **Frontend role gating** via the existing `ReadOnlyGate` pattern.

---

## 8. Storage, audit, analytics, logging (reuse + add RIaaS tables)

RIaaS uses the app's existing Storage account and `TableServiceClient` (with in-memory
fallback). It **reuses** the shared `users` and `audit` tables (one identity model, one
audit trail — namespaced by `entity="riaas"`), and **adds** its own tables for
RIaaS-specific state. New table names are prefixed **`Ri`** so they never collide with
the app's existing `queries`/`users`/`audit`/`schedules`/`aeroster`; assert the prefix
in `migrations.py` (idempotent create-if-not-exists):

- `RiAnalyses` (analysis-template overrides), `RiAnalysesHistory`
- `RiSchedules` (RIaaS report schedules — kept separate so RIaaS jobs never entangle the
  AE digest jobs)
- `RiKeyFindings` (per-chapter narrative), `RiBenchmarks` (stage/score thresholds),
  plus any roster-style reference (`RiSellers`/`RiTerritories`) if needed
- **Shared, not duplicated:** `users` (identity + roles) and `audit` (trail).

Other cross-cutting:

- **Audit log:** reuse `audit_service.py` — `write(actor, entity, action, target,
  details)`. Audit every RIaaS template edit, schedule change, report send, and first
  access, with `entity` values namespaced `riaas.*`.
- **Logging:** reuse `logging_setup.py`; tag RIaaS logs (e.g. a `feature=riaas` field or
  logger name) so they're filterable from AE logs in the shared Log Analytics workspace.
- **Analytics/observability:** reuse the existing Log Analytics workspace; emit RIaaS
  request logs, Salesforce call latencies, and scheduler run outcomes.

---

## 9. Unified UI — Individual Performance + Organization Performance

Extend the existing React app; do not build a second frontend.

- **Navigation (the headline change):** restructure the left nav into **two top-level
  groups**:
  - **Individual Performance** — the existing AE dashboard tabs (All Source Summary,
    KPIs, charts, sections, config). Unchanged in behavior.
  - **Organization Performance** — the **five RIaaS chapters** (§6) + a **Summary /
    Revenue Insights Report** route that assembles the full report on screen. This group
    renders **only** when `/api/me` → `features.riaas` is true (flag-gated), and its
    route bundle is **lazy-loaded** so non-flagged users never download RIaaS JS.
- **Stack (already present):** Vite + React 18 + TS + Tailwind + TanStack
  Router/Query/Table + Zustand + Recharts + Radix + lucide-react + sonner. Add RIaaS
  pages/components under a dedicated area (§12) reusing `DataTable`, `KpiCard`/`KpiRow`,
  chart components, and `FilterBar`.
- **Global filters** for Organization Performance (mirror `FilterBar`): **Territory/
  Team**, **Seller (AE)**, **Motion** (New Business / Expansion / All), **Time Period**
  (fiscal quarter/YTD presets + custom range). Filter state in Zustand + URL params.
- **Drill-downs:** row-click drawer (mirror `AEDrillDownDrawer`) for
  territory→seller→deal detail on leaderboard and at-risk tables.
- **Heatmaps / at-risk tables:** reuse the RdYlGn ramp + `DataTable` + CSV export;
  at-risk deal tables show "value vs benchmark" cells.
- **Config pages (admin, flag- + admin-gated):** RIaaS Analysis/SOQL editor with
  **Test-before-Save** gate + resolved-SOQL preview + history (mirror
  `ConfigSoqlRoute`/`SoqlEditor`); a **Field Dictionary** page to confirm/blocked-toggle
  SF fields (§5.4). The existing Salesforce Connection status page already serves both.

---

## 10. Scheduled Revenue Insights Report (reuse email/report pipeline)

- **APScheduler** — register RIaaS report jobs in the existing scheduler
  (`schedulers_registration.py` / `schedule_service.py`), stored in `RiSchedules`;
  `SCHEDULER_TZ` = `America/Chicago`.
- **Report renderer:** a new Jinja2 template (mirror `report_renderer.py` +
  `templates/`) assembling all five chapters — charts, key-findings narrative, at-risk
  tables — into the **"Revenue Insights Report"**: an **HTML email digest** + an
  **exportable/printable** full report (PDF-friendly HTML).
- **Delivery:** reuse `email_service.py` (SendGrid). Schedules UI mirrors
  `SchedulesRoute`/`ScheduleForm` + `ImmediateSend` (send-now), under Organization
  Performance. Each send writes an audit event.
- **Safety:** RIaaS scheduled sends respect `SCHEDULER_ENABLED`, `SENDGRID_SANDBOX_MODE`,
  and `SENDGRID_RECIPIENT_OVERRIDE` (§11) so a pre-promotion revision can never email
  real recipients.

---

## 11. Config & deployment — ship as a new revision of the existing app

No new infrastructure. RIaaS is new code in the existing backend + frontend images,
deployed as a **new revision** of the current Container Apps.

- **Settings** (add to the existing `config.py`): `FEATURE_RIAAS_ALLOWED_EMAILS`,
  `ALLOW_PROD_QUERY_WRITES` (default **false**), `SCHEDULER_ENABLED`,
  `SENDGRID_SANDBOX_MODE`, `SENDGRID_RECIPIENT_OVERRIDE`. Everything else (ENV, SF_*,
  storage, SendGrid, scheduler TZ, Entra) already exists. Update `.env.example`.
- **No Bicep changes, no new redirect URIs, no new tables-account** — same app, same
  Easy Auth, same Storage account (RIaaS adds tables at runtime via `migrations.py`).

### 11.1 Promotion — revisions, not a second environment

"Dev → prod" is a **revision promotion** of the existing app using an **immutable image
digest**:

1. **Build once.** Build the backend + frontend images (now containing RIaaS), tag each
   `:<git-sha>` (never `:latest` in prod), push to the existing ACR; capture each
   `@sha256:<digest>`.
2. **Deploy a new revision at 0% traffic** with a label (e.g. `riaas-next`); the app is
   in **multiple-revision mode**. It gets a stable label FQDN.
3. **Smoke-test the label URL** — Easy Auth login as the allow-listed user, confirm
   Organization Performance appears (and is absent for a non-flagged test user), run one
   live analysis, one report send-now in sandbox mode. Confirm the existing Individual
   Performance tabs are unchanged on that revision.
4. **Promote** by shifting traffic `riaas-next` → 100%. The feature flag means the
   Organization Performance surface is a **dark launch** to one user even at 100%.
5. **Rollback** = shift traffic back to the prior revision (Individual Performance users
   are unaffected either way); never a rebuild. Flip runtime toggles
   (`SCHEDULER_ENABLED`, `ALLOW_PROD_QUERY_WRITES`) only after promotion.

### 11.2 In-app blast-radius guardrails

Since RIaaS shares one app with live users (Salesforce is **not** a concern — read-only,
within limits, §4):

- **Access gate** — the RIaaS feature flag (§7.1) gates every router and the nav group;
  it is the primary blast-radius control.
- **Error isolation:** per-analysis isolation (§5.2) + scoped router error handling so a
  RIaaS failure can't 500 the shared API; lazy-loaded RIaaS frontend bundle.
- **Storage:** new tables `Ri`-prefixed and asserted in `migrations.py`;
  `ALLOW_PROD_QUERY_WRITES` defaults false.
- **Scheduler / SendGrid:** `SCHEDULER_ENABLED=false` on any non-prod revision;
  `SENDGRID_SANDBOX_MODE=true` + `SENDGRID_RECIPIENT_OVERRIDE` everywhere except the
  promoted prod revision, so a test build can never email real recipients.

---

## 12. Where the code goes (inside the existing repo)

Add to the existing tree; don't restructure it:

```
AE_Dashboard_Streamlit/
├── backend/app/
│   ├── main.py                     # register RIaaS routers
│   ├── config.py                   # add RIaaS settings
│   ├── deps.py                     # add require_riaas_access
│   ├── analysis/                   # NEW: analysis_registry.py, field_dictionary.py,
│   │                               #      query_builder.py, data_engine.py, store.py
│   ├── routers/
│   │   ├── (existing AE routers …)
│   │   └── riaas/                  # NEW: chapters.py (or one per chapter),
│   │                               #      analyses_admin.py, report.py
│   ├── services/
│   │   ├── (existing services …)
│   │   └── riaas/                  # NEW: chapter services, riaas_report_renderer.py,
│   │                               #      riaas_schedule glue
│   ├── storage/migrations.py       # add Ri* tables
│   └── templates/
│       └── revenue_insights_report.html   # NEW
├── frontend/src/
│   ├── (existing shell/router …)   # restructure nav into two groups
│   ├── pages/org-performance/      # NEW: chapter routes + Summary/Report (lazy)
│   └── components/riaas/           # NEW: chapter charts/tables
├── scripts/sync_analyses.py        # NEW (mirror sync_queries.py)
├── analyses_snapshot.json          # NEW
└── docs/riaas/goal.md              # this spec
```

---

## 13. Build phases (recommended order)

> Apply the working agreement (§0.1) throughout: delegate parallel chapter/analysis work
> to subagents, verify each phase against the spec before calling it done, and pause only
> at the field-confirmation checkpoint.


1. **Feature scaffold behind the flag.** Add `FEATURE_RIAAS_ALLOWED_EMAILS` +
   `require_riaas_access` + `/api/me` `features.riaas`; restructure the nav into
   Individual/Organization Performance with an empty, lazy-loaded, flag-gated
   Organization Performance group. Ship + promote this no-op safely to prove the flag
   and nav isolation. **Existing users see no change.**
2. **Analysis registry + field dictionary.** Implement `AnalysisEntry`, query builder,
   per-analysis error isolation, batching, time/quarter helpers, `RiAnalyses` overrides
   + snapshot + `sync_analyses.py`, admin analysis/field editor. Populate the field
   dictionary; mark unconfirmed analyses `blocked`.
3. **Chapter 1 (GTM Overview)** end-to-end: SOQL, service, charts, key-findings block.
4. **Chapters 2–5** iteratively (Win/Loss → Pipeline Health → Coach → GTM Process),
   confirming SF fields per analysis and un-blocking as data is verified.
5. **Scheduled report:** Jinja2 report template assembling all chapters, SendGrid
   delivery via the existing pipeline, `RiSchedules` UI, send-now, audit.
6. **Hardening:** tests (mirror `backend/tests/` — auth incl. `require_riaas_access`, SF
   client, endpoints, schedule lifecycle, audit), Log Analytics filtering, deploy runbook.

---

## 14. Non-goals & open items

- **No external integrations** (Ebsta, Gong, Copy.ai, HubSpot APIs). Their outputs are
  assumed pre-landed in Salesforce fields; wiring live integrations is out of scope.
- **No new infrastructure** — no new repo, containers, Bicep resources, Entra app, or
  Storage account. RIaaS ships in the existing app's images and revisions.
- **Field confirmation is a build-time task.** Provisional field names in §5.4 must be
  validated against the org schema; blocked analyses stay "Pending" until confirmed.
- **Fiscal calendar / stage names / territory model / ICP tier values** must be confirmed
  against the org during Chapter 1; encode them as config, not literals.
- **Nav restructure touches the existing UI** — the one intentional change to shared
  code. Kept minimal and flag-gated; validated on a 0%-traffic revision before promotion.
- Follow the existing app's conventions for anything not covered here.
```
