"""Analysis Registry — one AnalysisEntry per RIaaS analysis (spec §5/§6).

The RIaaS counterpart of legacy/soql_registry.py, generalized: analyses have
heterogeneous grains (quarter, territory, seller, deal-size band, ...) and
return rowsets, not single aggregates.

`blocked` is computed from the field dictionary: an analysis whose required
fields aren't all confirmed against the org renders "Pending". Templates are
parameterized SOQL ({placeholders} resolved by query_builder.build_query);
computed analyses derive from other analyses in the service layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.analysis.field_dictionary import unconfirmed


@dataclass
class AnalysisEntry:
    analysis_id: str
    chapter: str          # "GTM Overview" | "Win/Loss" | "Pipeline Health" | "Coach" | "GTM Process"
    title: str
    viz: str              # kpi | bar | grouped_bar | line | combo | heatmap | table | funnel | matrix
    grain: str            # quarter | deal_size_band | territory | seller | industry | icp_attr | channel | stage | persona | account | opportunity
    description: str
    template: str         # parameterized SOQL; "" if computed or not yet implemented
    time_filter: bool
    computed: bool = False
    blocked: bool = False
    formula: str = ""
    fields_required: list[str] = field(default_factory=list)


CH_OVERVIEW = "GTM Overview"
CH_WINLOSS = "Win/Loss"
CH_PIPELINE = "Pipeline Health"
CH_COACH = "Coach"
CH_PROCESS = "GTM Process"

CHAPTER_SLUGS = {
    "gtm-overview": CH_OVERVIEW,
    "win-loss": CH_WINLOSS,
    "pipeline-health": CH_PIPELINE,
    "coach": CH_COACH,
    "gtm-process": CH_PROCESS,
}


def _e(**kw) -> AnalysisEntry:
    entry = AnalysisEntry(**kw)
    if not entry.blocked and unconfirmed(entry.fields_required):
        entry.blocked = True
    return entry


ANALYSES: list[AnalysisEntry] = [
    # ================= Chapter 1 — GTM Efficiency Overview =================
    _e(
        analysis_id="C1-CRM-COMPLETE",
        chapter=CH_OVERVIEW, title="How complete & accurate is our CRM data?",
        viz="kpi", grain="account",
        description="Share of contacts with no job title, and how many titled contacts are decision-makers (Director/Head/VP/CxO).",
        formula="% contacts missing job title; % of titled contacts that are decision-makers",
        fields_required=["contact.job_title"],
        # GROUP BY caps at 2000 groups; the null group + all large titles are
        # captured, tail titles are truncated (noted in the caption).
        template="""
SELECT Job_Title__c, COUNT(Id) n
FROM Contact
GROUP BY Job_Title__c
ORDER BY COUNT(Id) DESC
LIMIT 2000
""", time_filter=False,
    ),
    _e(
        analysis_id="C1-VELOCITY-NB",
        chapter=CH_OVERVIEW, title="How is New Logo sales velocity trending over time?",
        viz="combo", grain="quarter",
        description="Sales velocity per quarter for New Business, with deals closed, win rate, average amount and average cycle.",
        formula="Velocity = (#Deals × WinRate × ACV) ÷ SalesCycle ($/day)",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.record_type", "opp.created_date"],
        template="""
SELECT Id, Amount, StageName, CloseDate, CreatedDate, OwnerId, Owner.Name
FROM Opportunity
WHERE RecordType.Name IN ('Net New')
  AND {closed_clause} AND {close_date_clause}
  AND {territory_clause} AND {seller_clause}
""", time_filter=True,
    ),
    _e(
        analysis_id="C1-VELOCITY-EXP",
        chapter=CH_OVERVIEW, title="How is Expansion sales velocity trending over time?",
        viz="combo", grain="quarter",
        description="Sales velocity per quarter for the Expansion motion (cross-sell + upsell).",
        formula="Velocity = (#Deals × WinRate × ACV) ÷ SalesCycle ($/day)",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.record_type", "opp.created_date"],
        template="""
SELECT Id, Amount, StageName, CloseDate, CreatedDate, OwnerId, Owner.Name
FROM Opportunity
WHERE RecordType.Name IN ('Cross-sell','Upsell')
  AND {closed_clause} AND {close_date_clause}
  AND {territory_clause} AND {seller_clause}
""", time_filter=True,
    ),
    _e(
        analysis_id="C1-RPS-NB",
        chapter=CH_OVERVIEW, title="How is New Logo revenue per seller trending?",
        viz="combo", grain="quarter",
        description="New Business bookings per active seller per quarter, with seller count overlay.",
        formula="Revenue per Seller = bookings ÷ active seller count",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.record_type", "opp.owner"],
        template="""
SELECT Id, Amount, StageName, CloseDate, CreatedDate, OwnerId, Owner.Name
FROM Opportunity
WHERE RecordType.Name IN ('Net New')
  AND {closed_clause} AND {close_date_clause}
  AND {territory_clause} AND {seller_clause}
""", time_filter=True,
    ),
    _e(
        analysis_id="C1-RPS-EXP",
        chapter=CH_OVERVIEW, title="How is Expansion revenue per seller trending?",
        viz="combo", grain="quarter",
        description="Expansion bookings per active seller per quarter, with seller count overlay.",
        formula="Revenue per Seller = bookings ÷ active seller count",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.record_type", "opp.owner"],
        template="""
SELECT Id, Amount, StageName, CloseDate, CreatedDate, OwnerId, Owner.Name
FROM Opportunity
WHERE RecordType.Name IN ('Cross-sell','Upsell')
  AND {closed_clause} AND {close_date_clause}
  AND {territory_clause} AND {seller_clause}
""", time_filter=True,
    ),
    _e(
        analysis_id="C1-TERR-EFF-GAP",
        chapter=CH_OVERVIEW, title="How large is the territory sales-efficiency gap?",
        viz="bar", grain="territory",
        description="Sales efficiency by territory; quantifies the top-vs-bottom execution gap.",
        formula="Efficiency = (WinRate × ACV) ÷ SalesCycle",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "acct.territory", "opp.created_date"],
        template="""
SELECT Id, Amount, StageName, CloseDate, CreatedDate, Account.Account_Territory__r.Name
FROM Opportunity
WHERE {motion_clause}
  AND {closed_clause} AND {close_date_clause}
  AND {seller_clause}
""", time_filter=True,
    ),

    # ================= Chapter 2 — Win/Loss & Benchmark =================
    _e(
        analysis_id="C2-ENGAGE-CONV",
        chapter=CH_WINLOSS, title="How does engagement level impact conversion?",
        viz="grouped_bar", grain="deal_size_band",
        description="Win rate by relationship-score band within each deal-size band. Scored cohort only (engagement score coverage is partial).",
        formula="WinRate per (score band × size band)",
        fields_required=["opp.engagement_score", "opp.amount", "opp.stage"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-SLIPPAGE-WR",
        chapter=CH_WINLOSS, title="How does slippage impact win rate?",
        viz="combo", grain="deal_size_band",
        description="Win rate and deal count by slippage duration bucket (0–60, 61–180, 181+ days of CloseDate pushes).",
        formula="Slippage = days CloseDate moved out (from field history); WinRate per bucket",
        fields_required=["opp.slippage", "opp.stage", "opp.amount"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-QUAL-WR",
        chapter=CH_WINLOSS, title="How does qualification (MEDDPICC) impact win rate?",
        viz="bar", grain="deal_size_band",
        description="Win rate by average MEDDPICC score bucket; deals scored ≥3 vs <3.",
        formula="WinRate per MEDDPICC-score bucket",
        fields_required=["opp.meddic_numeric", "opp.stage"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-MEDD-ELEMENTS",
        chapter=CH_WINLOSS, title="Average MEDDPICC element scores — won vs lost",
        viz="grouped_bar", grain="stage",
        description="Per-element MEDDPICC averages for won vs lost deals.",
        formula="avg element score, Won vs Lost",
        fields_required=["opp.meddic_numeric", "opp.ai_metadata"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-EFF-DEALSIZE",
        chapter=CH_WINLOSS, title="How does sales efficiency vary by deal size?",
        viz="combo", grain="deal_size_band",
        description="Sales efficiency and deal count per deal-size band.",
        formula="Efficiency = (WinRate × ACV) ÷ SalesCycle per band",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.created_date"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-CYCLE-AGE-WR",
        chapter=CH_WINLOSS, title="How does win rate change as deals age?",
        viz="line", grain="deal_size_band",
        description="Win rate by deal-age band (1–30 … 361+ days), per deal-size band.",
        formula="WinRate per (age band × size band)",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.created_date"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-MEDIAN-CYCLE",
        chapter=CH_WINLOSS, title="Median duration to close — won vs lost",
        viz="grouped_bar", grain="deal_size_band",
        description="Median days from creation to close for won vs lost deals, per deal-size band.",
        formula="median(CloseDate − CreatedDate), Won vs Lost per band",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.created_date"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-EFF-INDUSTRY",
        chapter=CH_WINLOSS, title="Which industries are most sales-efficient?",
        viz="bar", grain="industry",
        description="Sales efficiency and deal count by account industry; volume share of the top-5 efficient industries.",
        formula="Efficiency per industry",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "acct.industry", "opp.created_date"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-EFF-ICP",
        chapter=CH_WINLOSS, title="How does sales efficiency vary across ICP attributes?",
        viz="bar", grain="icp_attr",
        description="Sales efficiency and deal count per ICP attribute (employee range, ICP industry group, ICP segmentation).",
        formula="Efficiency per ICP attribute value",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "acct.employee_range",
                         "acct.icp_industry_group", "acct.icp_segmentation", "opp.created_date"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-MULTITHREAD-WR",
        chapter=CH_WINLOSS, title="How does multi-threading impact win rate?",
        viz="combo", grain="deal_size_band",
        description="Win rate by number of engaged stakeholders per deal; average stakeholders won vs lost.",
        formula="WinRate per stakeholder-count band (distinct OpportunityContactRole)",
        fields_required=["ocr.contact", "opp.stage", "opp.amount"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-PERSONA-WON",
        chapter=CH_WINLOSS, title="Which personas appear in won deals?",
        viz="grouped_bar", grain="persona",
        description="Distribution of engaged personas (department × seniority from job title) in won deals; % with no title flagged.",
        formula="persona distribution over won-deal contact roles",
        fields_required=["ocr.contact", "contact.job_title", "opp.stage"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C2-PERSONA-IMPACT",
        chapter=CH_WINLOSS, title="Which personas most impact win rate?",
        viz="matrix", grain="persona",
        description="Win-rate matrix by department × seniority vs the overall average.",
        formula="WinRate per persona cell vs overall",
        fields_required=["ocr.contact", "contact.job_title", "opp.stage"],
        template="", time_filter=True,
    ),

    # ================= Chapter 3 — Pipeline Health =================
    _e(
        analysis_id="C3-ICP-SHARE",
        chapter=CH_PIPELINE, title="What share of pipeline is in high-ICP accounts?",
        viz="line", grain="quarter",
        description="% of open pipeline value in High/Very-High ICP accounts vs historical average.",
        formula="pipeline$ in high-ICP ÷ total pipeline$, by quarter",
        fields_required=["opp.amount", "opp.stage", "acct.icp_overall"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C3-MATURITY",
        chapter=CH_PIPELINE, title="How mature is the pipeline?",
        viz="grouped_bar", grain="territory",
        description="% of pipeline value in mid/late stages per territory, with average sales cycle.",
        formula="Maturity = mid/late-stage pipeline$ ÷ total pipeline$",
        fields_required=["opp.amount", "opp.stage", "acct.territory"],
        template="", time_filter=False,
    ),
    _e(
        analysis_id="C3-MEDD-ADOPT",
        chapter=CH_PIPELINE, title="How widely is MEDDPICC adopted?",
        viz="kpi", grain="territory",
        description="% of open deals with a MEDDPICC note (AI MEDDIC summary present). Counted client-side — textarea fields are not SOQL-filterable.",
        formula="deals with MEDDIC note ÷ open deals",
        fields_required=["opp.meddic_summary", "opp.stage"],
        template="", time_filter=False,
    ),
    _e(
        analysis_id="C3-RISK-ENGAGE",
        chapter=CH_PIPELINE, title="Deals at risk — low engagement",
        viz="table", grain="opportunity",
        description="Open deals scoring below the engagement benchmark; count, value and at-risk list. Scored cohort only.",
        formula="open deals with engagement score < benchmark",
        fields_required=["opp.engagement_score", "opp.amount", "opp.stage", "opp.owner"],
        template="", time_filter=False,
    ),
    _e(
        analysis_id="C3-RISK-STALLED",
        chapter=CH_PIPELINE, title="Deals at risk — stalled progress",
        viz="table", grain="opportunity",
        description="Open deals stalled in their current stage vs stage benchmark; % aged >180 days; at-risk list.",
        formula="LastStageChangeInDays vs stage benchmark",
        fields_required=["opp.days_in_stage", "opp.amount", "opp.stage", "opp.owner", "opp.momentum_score"],
        template="", time_filter=False,
    ),
    _e(
        analysis_id="C3-RISK-SLIPPED",
        chapter=CH_PIPELINE, title="Deals at risk — slippage",
        viz="combo", grain="opportunity",
        description="% of open deals slipped 90+/181+ days, where in the funnel slippage happens, and the slipped-deal list.",
        formula="CloseDate pushes from field history, bucketed",
        fields_required=["opp.slippage", "opp.amount", "opp.stage", "opp.owner"],
        template="", time_filter=False,
    ),
    _e(
        analysis_id="C3-ACCT-RELATIONSHIP",
        chapter=CH_PIPELINE, title="How deep are our account relationships?",
        viz="grouped_bar", grain="account",
        description="Account relationship-score breakdown by segment; single-threaded / not-engaged share (contacts with score ≥ 30).",
        formula="contact score bands + threading per account segment",
        fields_required=["contact.relationship_score", "ocr.contact"],
        template="", time_filter=False,
    ),

    # ================= Chapter 4 — Coach (People Insights) =================
    _e(
        analysis_id="C4-FORECAST-ACC",
        chapter=CH_COACH, title="How accurate are week-2 / week-4 forecasts?",
        viz="grouped_bar", grain="territory",
        description="Forecast accuracy at week 2 and week 4 per territory vs commit.",
        formula="(1 − |Forecast − Actual| ÷ Actual) × 100",
        fields_required=["forecast.snapshots"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C4-TERR-VELOCITY",
        chapter=CH_COACH, title="Territory sales velocity leaderboard",
        viz="table", grain="territory",
        description="Per territory: quota attainment, velocity ($/day) + trend, win rate, cycle, avg deal, opp count, % revenue from expansion.",
        formula="velocity + attainment per territory",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "acct.territory",
                         "quota.amount", "opp.created_date", "opp.record_type"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C4-PIPE-COVERAGE",
        chapter=CH_COACH, title="Is pipeline coverage sufficient?",
        viz="bar", grain="territory",
        description="Open pipeline ÷ remaining quota (coverage ratio) per territory.",
        formula="open pipeline$ ÷ (quota − bookings)",
        fields_required=["opp.amount", "opp.stage", "acct.territory", "quota.amount"],
        template="", time_filter=False,
    ),
    _e(
        analysis_id="C4-COACH-FOCUS",
        chapter=CH_COACH, title="Where should coaching focus?",
        viz="table", grain="seller",
        description="Each seller's at-risk deals (low engagement / stalled / slipped) aggregated into coaching priorities.",
        formula="union of C3 risk lists grouped by seller",
        fields_required=["opp.engagement_score", "opp.days_in_stage", "opp.slippage", "opp.owner"],
        template="", time_filter=False, computed=True,
    ),
    _e(
        analysis_id="C4-DISCOVERY-SKILL",
        chapter=CH_COACH, title="How effective is discovery?",
        viz="grouped_bar", grain="seller",
        description="Discovery / pain-point / value scores, this quarter vs last (CI skill fields).",
        formula="avg CI discovery scores per quarter",
        fields_required=["user.skill_scores"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C4-OBJECTION-SKILL",
        chapter=CH_COACH, title="How well are objections handled?",
        viz="grouped_bar", grain="seller",
        description="Objection-handling scores, this quarter vs last (CI skill fields).",
        formula="avg CI objection scores per quarter",
        fields_required=["user.skill_scores"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C4-SKILL-LEADERBOARD",
        chapter=CH_COACH, title="Seller selling-skill leaderboard",
        viz="table", grain="seller",
        description="Overall + per-skill scores, forecast accuracy, % meeting time, multi-threading, engagement per seller.",
        formula="composite of CI skill fields",
        fields_required=["user.skill_scores", "user.meeting_time"],
        template="", time_filter=True,
    ),

    # ================= Chapter 5 — GTM Process Optimisation =================
    _e(
        analysis_id="C5-CHANNEL-ROI",
        chapter=CH_PROCESS, title="Which channels deliver the best ROI?",
        viz="combo", grain="channel",
        description="Sales efficiency and deal count by opportunity source category, with win-rate and cycle context.",
        formula="Efficiency per channel (Opportunity_Source_Category__c)",
        fields_required=["opp.amount", "opp.stage", "opp.close_date", "opp.source_category", "opp.created_date"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C5-ICP-ALIGN",
        chapter=CH_PROCESS, title="Are marketing and sales aligned on ICP?",
        viz="table", grain="industry",
        description="Deal-volume rank vs win-rate rank per industry; rank gap ≥5 flags over/under-investment.",
        formula="rank(volume) − rank(win rate) per industry",
        fields_required=["opp.stage", "acct.industry"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C5-LEAD-ASSIGN",
        chapter=CH_PROCESS, title="Are deals assigned to the right sellers?",
        viz="matrix", grain="seller",
        description="Win rate and deal count per seller × industry; flags routing mismatches.",
        formula="WinRate per seller × industry cell",
        fields_required=["opp.stage", "acct.industry", "opp.owner"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C5-FUNNEL",
        chapter=CH_PROCESS, title="How does the sales funnel perform?",
        viz="funnel", grain="stage",
        description="Stage-to-stage conversion %, slip %, and average stage duration for converted deals (Discovery → Business Validation → Commitment & Negotiation → Closed/Won).",
        formula="stage transitions from OpportunityHistory",
        fields_required=["opp.stage_history", "opp.stage"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C5-FUNNEL-TERR",
        chapter=CH_PROCESS, title="How does funnel performance vary by territory?",
        viz="matrix", grain="territory",
        description="% convert and % slip per stage per territory.",
        formula="stage transitions × territory",
        fields_required=["opp.stage_history", "acct.territory"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C5-ADHERENCE",
        chapter=CH_PROCESS, title="Is the sales process being followed?",
        viz="bar", grain="stage",
        description="% of deals that skip each stage.",
        formula="deals missing a stage in history ÷ closed deals",
        fields_required=["opp.stage_history", "opp.stage"],
        template="", time_filter=True,
    ),
    _e(
        analysis_id="C5-MEDD-BY-STAGE",
        chapter=CH_PROCESS, title="MEDDPICC benchmark by stage",
        viz="grouped_bar", grain="stage",
        description="Average MEDDPICC score by stage, top vs average territory.",
        formula="avg MEDDPICC per stage",
        fields_required=["opp.meddic_numeric", "opp.stage"],
        template="", time_filter=False,
    ),
    _e(
        analysis_id="C5-STAGE-CRITERIA",
        chapter=CH_PROCESS, title="What do winning deals look like at each stage?",
        viz="table", grain="stage",
        description="Entry/exit signal benchmarks per stage derived from won-deal history (duration, activity, threading).",
        formula="won-deal per-stage benchmarks",
        fields_required=["opp.stage_history", "opp.stage", "ocr.contact"],
        template="", time_filter=True,
    ),
]

REGISTRY: dict[str, AnalysisEntry] = {a.analysis_id: a for a in ANALYSES}


def chapter_analyses(chapter: str) -> list[AnalysisEntry]:
    return [a for a in ANALYSES if a.chapter == chapter]
