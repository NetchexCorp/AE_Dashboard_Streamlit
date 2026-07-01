export interface ChapterDef {
  slug: string;
  title: string;
  navLabel: string;
}

export const CHAPTERS: ChapterDef[] = [
  { slug: "gtm-overview", title: "GTM Efficiency Overview", navLabel: "GTM Overview" },
  { slug: "win-loss", title: "Win/Loss & Benchmark", navLabel: "Win/Loss" },
  { slug: "pipeline-health", title: "Pipeline Health Assessment", navLabel: "Pipeline Health" },
  { slug: "coach", title: "Coach (People Insights)", navLabel: "Coach" },
  { slug: "gtm-process", title: "GTM Process Optimisation", navLabel: "GTM Process" },
];

export function chapterBySlug(slug: string): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.slug === slug);
}

export interface ChapterSection {
  key: string;
  label: string;
  analyses: string[];
}

// Sub-pages within a chapter (rendered as tabs). Analyses the server returns
// that aren't listed here land in the first section so nothing disappears.
export const CHAPTER_SECTIONS: Record<string, ChapterSection[]> = {
  "gtm-overview": [
    {
      key: "trends",
      label: "Velocity & Revenue Trends",
      analyses: ["C1-VELOCITY-NB", "C1-VELOCITY-EXP", "C1-RPS-NB", "C1-RPS-EXP"],
    },
    {
      key: "data-territory",
      label: "CRM Data & Territories",
      analyses: ["C1-CRM-COMPLETE", "C1-TERR-EFF-GAP"],
    },
  ],
  "win-loss": [
    {
      key: "conversion",
      label: "Conversion Drivers",
      analyses: [
        "C2-ENGAGE-CONV",
        "C2-SLIPPAGE-WR",
        "C2-CYCLE-AGE-WR",
        "C2-MEDIAN-CYCLE",
      ],
    },
    {
      key: "qualification",
      label: "Qualification",
      analyses: ["C2-QUAL-WR", "C2-MEDD-ELEMENTS"],
    },
    {
      key: "efficiency",
      label: "Efficiency",
      analyses: ["C2-EFF-DEALSIZE", "C2-EFF-INDUSTRY", "C2-EFF-ICP"],
    },
    {
      key: "people",
      label: "Personas & Threading",
      analyses: ["C2-MULTITHREAD-WR", "C2-PERSONA-WON", "C2-PERSONA-IMPACT"],
    },
  ],
  "pipeline-health": [
    {
      key: "composition",
      label: "Composition",
      analyses: [
        "C3-ICP-SHARE",
        "C3-MATURITY",
        "C3-MEDD-ADOPT",
        "C3-ACCT-RELATIONSHIP",
      ],
    },
    {
      key: "risk",
      label: "Deals at Risk",
      analyses: ["C3-RISK-ENGAGE", "C3-RISK-STALLED", "C3-RISK-SLIPPED"],
    },
  ],
  coach: [
    {
      key: "team",
      label: "Team Performance",
      analyses: ["C4-TERR-VELOCITY", "C4-PIPE-COVERAGE", "C4-COACH-FOCUS"],
    },
    {
      key: "skills",
      label: "Skills & Forecast",
      analyses: [
        "C4-DISCOVERY-SKILL",
        "C4-OBJECTION-SKILL",
        "C4-SKILL-LEADERBOARD",
        "C4-FORECAST-ACC",
      ],
    },
  ],
  "gtm-process": [
    {
      key: "channels",
      label: "Channels & Alignment",
      analyses: ["C5-CHANNEL-ROI", "C5-ICP-ALIGN", "C5-LEAD-ASSIGN"],
    },
    {
      key: "funnel",
      label: "Funnel & Process",
      analyses: [
        "C5-FUNNEL",
        "C5-FUNNEL-TERR",
        "C5-ADHERENCE",
        "C5-MEDD-BY-STAGE",
        "C5-STAGE-CRITERIA",
      ],
    },
  ],
};
