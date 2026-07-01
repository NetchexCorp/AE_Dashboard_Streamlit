import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/formatters";
import { BandLinesChart } from "./BandLinesChart";
import {
  CHART_BAR,
  CHART_LINE,
  CHART_NEGATIVE,
  CHART_WARNING,
} from "./chartTheme";
import {
  type ChartSeries,
  GroupedBarsChart,
  type SeriesRow,
} from "./GroupedBarsChart";
import {
  EmptyViz,
  Note,
  SimpleTable,
  Stat,
  StatGrid,
  type TableCol,
} from "./vizPrimitives";

const RISK_ROW_CAP = 15;

interface MaturityData {
  overall?: {
    deals: number;
    pipeline: number;
    mid_late_pipeline: number;
    pct_mid_late: number | null;
  };
  territories?: {
    name: string;
    deals: number;
    pipeline: number;
    mid_late_pipeline: number;
    pct_mid_late: number | null;
  }[];
  mid_late_stages?: string[];
  note?: string;
}

function MaturityViz({ data }: { data: MaturityData }) {
  const territories = data.territories ?? [];
  const rows: SeriesRow[] = territories.map((t) => ({
    label: t.name,
    pct_mid_late: t.pct_mid_late,
    deals: t.deals,
  }));
  const series: ChartSeries[] = [
    {
      key: "pct_mid_late",
      name: "% mid/late pipeline",
      color: CHART_BAR,
      countKey: "deals",
    },
  ];
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="Open pipeline" value={fmtCurrency(data.overall?.pipeline)} />
        <Stat
          label="Mid/late pipeline"
          value={fmtCurrency(data.overall?.mid_late_pipeline)}
        />
        <Stat label="% mid/late" value={fmtPercent(data.overall?.pct_mid_late)} />
        <Stat label="Open deals" value={fmtNumber(data.overall?.deals)} />
      </StatGrid>
      <GroupedBarsChart rows={rows} series={series} format="percent" horizontal />
      {(data.mid_late_stages?.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Mid/late = {data.mid_late_stages?.join(", ")}.
        </p>
      )}
      <Note text={data.note} />
    </div>
  );
}

interface IcpShareData {
  overall?: { pipeline: number; high_icp_pipeline: number; share: number | null };
  quarters?: {
    label: string;
    pipeline: number;
    high_icp_pipeline: number;
    share: number | null;
  }[];
  high_icp_min?: number;
  account_score_coverage?: number | null;
  note?: string;
}

function IcpShareViz({ data }: { data: IcpShareData }) {
  const rows: SeriesRow[] = (data.quarters ?? []).map((q) => ({
    label: q.label,
    share: q.share,
  }));
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="High-ICP share" value={fmtPercent(data.overall?.share)} />
        <Stat
          label="High-ICP pipeline"
          value={fmtCurrency(data.overall?.high_icp_pipeline)}
        />
        <Stat label="Total pipeline" value={fmtCurrency(data.overall?.pipeline)} />
        <Stat
          label="Account score coverage"
          value={fmtPercent(data.account_score_coverage)}
        />
      </StatGrid>
      <BandLinesChart
        rows={rows}
        series={[{ key: "share", name: "High-ICP share", color: CHART_LINE }]}
        format="percent"
      />
      <p className="text-xs text-muted-foreground">By expected-close quarter.</p>
      <Note text={data.note} />
    </div>
  );
}

interface MeddAdoptData {
  overall?: {
    deals: number;
    pct_meddic_note: number | null;
    pct_engagement_score: number | null;
  };
  territories?: {
    name: string;
    deals: number;
    pct_meddic_note: number | null;
    pct_engagement_score: number | null;
  }[];
  note?: string;
}

function MeddAdoptViz({ data }: { data: MeddAdoptData }) {
  const rows: SeriesRow[] = (data.territories ?? []).map((t) => ({
    label: t.name,
    pct_meddic_note: t.pct_meddic_note,
    pct_engagement_score: t.pct_engagement_score,
    deals: t.deals,
  }));
  const series: ChartSeries[] = [
    {
      key: "pct_meddic_note",
      name: "% with MEDDPICC note",
      color: CHART_BAR,
      countKey: "deals",
    },
    {
      key: "pct_engagement_score",
      name: "% with engagement score",
      color: CHART_LINE,
      countKey: "deals",
    },
  ];
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="Open deals" value={fmtNumber(data.overall?.deals)} />
        <Stat
          label="% with MEDDPICC note"
          value={fmtPercent(data.overall?.pct_meddic_note)}
        />
        <Stat
          label="% with engagement score"
          value={fmtPercent(data.overall?.pct_engagement_score)}
        />
      </StatGrid>
      <GroupedBarsChart rows={rows} series={series} format="percent" horizontal />
      <Note text={data.note} />
    </div>
  );
}

interface RiskEngageDeal {
  seller: string | null;
  opportunity: string | null;
  stage: string | null;
  amount: number | null;
  score: number | null;
}

interface RiskEngageData {
  benchmark?: number;
  at_risk_count?: number;
  at_risk_value?: number;
  open_deals?: number;
  scored_deals?: number;
  score_coverage?: number | null;
  deals?: RiskEngageDeal[];
  note?: string;
}

function RiskEngageViz({ data }: { data: RiskEngageData }) {
  const cols: TableCol<RiskEngageDeal>[] = [
    { label: "Seller", render: (d) => d.seller ?? "—" },
    { label: "Account", render: (d) => d.opportunity ?? "—" },
    { label: "Stage", render: (d) => d.stage ?? "—" },
    { label: "Amount", align: "right", render: (d) => fmtCurrency(d.amount) },
    { label: "Score", align: "right", render: (d) => fmtNumber(d.score) },
  ];
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="At-risk deals" value={fmtNumber(data.at_risk_count)} />
        <Stat label="At-risk value" value={fmtCurrency(data.at_risk_value)} />
        <Stat label="Score coverage" value={fmtPercent(data.score_coverage)} />
        <Stat label="Open deals" value={fmtNumber(data.open_deals)} />
      </StatGrid>
      <SimpleTable
        cols={cols}
        rows={data.deals ?? []}
        rowKey={(d, i) => `${d.opportunity}-${i}`}
        maxRows={RISK_ROW_CAP}
      />
      <Note text={data.note} />
    </div>
  );
}

interface RiskStalledDeal {
  seller: string | null;
  opportunity: string | null;
  stage: string | null;
  amount: number | null;
  days_in_stage: number | null;
  stage_median: number | null;
}

interface RiskStalledData {
  stalled_count?: number;
  stalled_value?: number;
  open_deals?: number;
  pct_aged_180?: number | null;
  deals?: RiskStalledDeal[];
  note?: string;
}

function RiskStalledViz({ data }: { data: RiskStalledData }) {
  const cols: TableCol<RiskStalledDeal>[] = [
    { label: "Seller", render: (d) => d.seller ?? "—" },
    { label: "Account", render: (d) => d.opportunity ?? "—" },
    { label: "Stage", render: (d) => d.stage ?? "—" },
    { label: "Amount", align: "right", render: (d) => fmtCurrency(d.amount) },
    {
      label: "Days in stage",
      align: "right",
      render: (d) => fmtNumber(d.days_in_stage),
    },
    {
      label: "Stage median",
      align: "right",
      render: (d) => fmtNumber(d.stage_median),
    },
  ];
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="Stalled deals" value={fmtNumber(data.stalled_count)} />
        <Stat label="Stalled value" value={fmtCurrency(data.stalled_value)} />
        <Stat label="% aged >180d" value={fmtPercent(data.pct_aged_180)} />
        <Stat label="Open deals" value={fmtNumber(data.open_deals)} />
      </StatGrid>
      <SimpleTable
        cols={cols}
        rows={data.deals ?? []}
        rowKey={(d, i) => `${d.opportunity}-${i}`}
        maxRows={RISK_ROW_CAP}
      />
      <Note text={data.note} />
    </div>
  );
}

interface RiskSlippedDeal {
  seller: string | null;
  opportunity: string | null;
  stage: string | null;
  amount: number | null;
  slip_days: number;
}

interface RiskSlippedData {
  open_deals?: number;
  slipped_deals?: number;
  pct_slipped_90?: number | null;
  pct_slipped_181?: number | null;
  stages?: { stage: string; deals: number; slip_days: number; avg_slip_days: number }[];
  deals?: RiskSlippedDeal[];
  note?: string;
}

function RiskSlippedViz({ data }: { data: RiskSlippedData }) {
  const stageCols: TableCol<
    NonNullable<RiskSlippedData["stages"]>[number]
  >[] = [
    { label: "Stage", render: (s) => s.stage ?? "—" },
    { label: "Slipped deals", align: "right", render: (s) => fmtNumber(s.deals) },
    {
      label: "Avg slip (days)",
      align: "right",
      render: (s) => fmtNumber(s.avg_slip_days),
    },
  ];
  const dealCols: TableCol<RiskSlippedDeal>[] = [
    { label: "Seller", render: (d) => d.seller ?? "—" },
    { label: "Account", render: (d) => d.opportunity ?? "—" },
    { label: "Stage", render: (d) => d.stage ?? "—" },
    { label: "Amount", align: "right", render: (d) => fmtCurrency(d.amount) },
    {
      label: "Slip (days)",
      align: "right",
      render: (d) => fmtNumber(d.slip_days),
    },
  ];
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="Slipped deals" value={fmtNumber(data.slipped_deals)} />
        <Stat label="% slipped 90+" value={fmtPercent(data.pct_slipped_90)} />
        <Stat label="% slipped 181+" value={fmtPercent(data.pct_slipped_181)} />
        <Stat label="Open deals" value={fmtNumber(data.open_deals)} />
      </StatGrid>
      {(data.stages?.length ?? 0) > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">
            Where slippage happens
          </h4>
          <SimpleTable
            cols={stageCols}
            rows={data.stages ?? []}
            rowKey={(s) => s.stage}
          />
        </div>
      )}
      <div>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
          Most-slipped open deals
        </h4>
        <SimpleTable
          cols={dealCols}
          rows={data.deals ?? []}
          rowKey={(d, i) => `${d.opportunity}-${i}`}
          maxRows={RISK_ROW_CAP}
        />
      </div>
      <Note text={data.note} />
    </div>
  );
}

interface RelationshipCounts {
  accounts: number;
  not_engaged: number;
  single_threaded: number;
  multi_threaded: number;
  pct_not_engaged: number | null;
  pct_single_threaded: number | null;
  pct_multi_threaded: number | null;
}

interface AcctRelationshipData {
  overall?: RelationshipCounts;
  segments?: ({ segment: string } & RelationshipCounts)[];
  note?: string;
}

function AcctRelationshipViz({ data }: { data: AcctRelationshipData }) {
  const segments = data.segments ?? [];
  if (segments.length === 0) return <EmptyViz />;
  const rows: SeriesRow[] = segments.map((s) => ({
    label: s.segment,
    pct_not_engaged: s.pct_not_engaged,
    pct_single_threaded: s.pct_single_threaded,
    pct_multi_threaded: s.pct_multi_threaded,
    not_engaged: s.not_engaged,
    single_threaded: s.single_threaded,
    multi_threaded: s.multi_threaded,
  }));
  const series: ChartSeries[] = [
    {
      key: "pct_not_engaged",
      name: "Not engaged",
      color: CHART_NEGATIVE,
      countKey: "not_engaged",
    },
    {
      key: "pct_single_threaded",
      name: "Single-threaded",
      color: CHART_WARNING,
      countKey: "single_threaded",
    },
    {
      key: "pct_multi_threaded",
      name: "Multi-threaded",
      color: CHART_LINE,
      countKey: "multi_threaded",
    },
  ];
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="Accounts" value={fmtNumber(data.overall?.accounts)} />
        <Stat
          label="% not engaged"
          value={fmtPercent(data.overall?.pct_not_engaged)}
        />
        <Stat
          label="% single-threaded"
          value={fmtPercent(data.overall?.pct_single_threaded)}
        />
        <Stat
          label="% multi-threaded"
          value={fmtPercent(data.overall?.pct_multi_threaded)}
        />
      </StatGrid>
      <GroupedBarsChart
        rows={rows}
        series={series}
        format="percent"
        horizontal
        stacked
      />
      <p className="text-xs text-muted-foreground">
        Segments = account employee range.
      </p>
      <Note text={data.note} />
    </div>
  );
}

type Payload = Record<string, unknown>;

export const PIPELINE_RENDERERS: Record<
  string,
  (props: { data: Payload }) => JSX.Element
> = {
  "C3-MATURITY": ({ data }) => (
    <MaturityViz data={data as unknown as MaturityData} />
  ),
  "C3-ICP-SHARE": ({ data }) => (
    <IcpShareViz data={data as unknown as IcpShareData} />
  ),
  "C3-MEDD-ADOPT": ({ data }) => (
    <MeddAdoptViz data={data as unknown as MeddAdoptData} />
  ),
  "C3-RISK-ENGAGE": ({ data }) => (
    <RiskEngageViz data={data as unknown as RiskEngageData} />
  ),
  "C3-RISK-STALLED": ({ data }) => (
    <RiskStalledViz data={data as unknown as RiskStalledData} />
  ),
  "C3-RISK-SLIPPED": ({ data }) => (
    <RiskSlippedViz data={data as unknown as RiskSlippedData} />
  ),
  "C3-ACCT-RELATIONSHIP": ({ data }) => (
    <AcctRelationshipViz data={data as unknown as AcctRelationshipData} />
  ),
};
