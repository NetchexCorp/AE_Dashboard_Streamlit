import { cn } from "@/lib/cn";
import { fmtNumber, fmtPercent } from "@/lib/formatters";
import { CHART_BAR } from "./chartTheme";
import { CohortMetricsChart, type CohortRow } from "./CohortMetricsChart";
import { type FunnelStage, FunnelStages } from "./FunnelStages";
import {
  type ChartSeries,
  GroupedBarsChart,
  type SeriesRow,
} from "./GroupedBarsChart";
import { type MatrixCell, MatrixTable, matrixKey } from "./MatrixTable";
import {
  EmptyViz,
  fmtValue,
  Note,
  orderLabels,
  SimpleTable,
  Stat,
  StatGrid,
  type TableCol,
} from "./vizPrimitives";

const FUNNEL_STAGE_ORDER = [
  "Discovery",
  "Business Validation",
  "Commitment & Negotiation",
];

interface ChannelRoiData {
  channels?: CohortRow[];
  note?: string;
}

function ChannelRoiViz({ data }: { data: ChannelRoiData }) {
  return (
    <div className="space-y-2">
      <CohortMetricsChart rows={data.channels ?? []} horizontal />
      <Note text={data.note} />
    </div>
  );
}

interface IcpAlignRow {
  industry: string;
  deals: number;
  win_rate: number | null;
  volume_rank: number;
  win_rate_rank: number;
  rank_gap: number;
  flag: string | null;
}

interface IcpAlignData {
  industries?: IcpAlignRow[];
  note?: string;
}

function AlignFlag({ flag }: { flag: string | null }) {
  if (!flag) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        flag === "under-invested"
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-red-300 bg-red-50 text-red-900",
      )}
    >
      {flag}
    </span>
  );
}

function IcpAlignViz({ data }: { data: IcpAlignData }) {
  const cols: TableCol<IcpAlignRow>[] = [
    { label: "Industry", render: (r) => r.industry },
    { label: "Deals", align: "right", render: (r) => fmtNumber(r.deals) },
    { label: "Win rate", align: "right", render: (r) => fmtPercent(r.win_rate) },
    {
      label: "Volume rank",
      align: "right",
      render: (r) => fmtNumber(r.volume_rank),
    },
    {
      label: "Win-rate rank",
      align: "right",
      render: (r) => fmtNumber(r.win_rate_rank),
    },
    {
      label: "Gap",
      align: "right",
      render: (r) => (r.rank_gap > 0 ? `+${r.rank_gap}` : String(r.rank_gap)),
    },
    { label: "Flag", render: (r) => <AlignFlag flag={r.flag} /> },
  ];
  return (
    <div className="space-y-2">
      <SimpleTable
        cols={cols}
        rows={data.industries ?? []}
        rowKey={(r) => r.industry}
        maxRows={15}
      />
      <Note text={data.note} />
    </div>
  );
}

interface LeadAssignCell {
  seller: string;
  industry: string;
  deals: number;
  win_rate: number | null;
  seller_overall_win_rate: number | null;
}

interface LeadAssignData {
  cells?: LeadAssignCell[];
  note?: string;
}

function LeadAssignViz({ data }: { data: LeadAssignData }) {
  const cells = data.cells ?? [];
  if (cells.length === 0) return <EmptyViz />;
  const rows = orderLabels(cells.map((c) => c.seller), []);
  const cols = orderLabels(cells.map((c) => c.industry), []);
  const matrix: Record<string, MatrixCell> = {};
  for (const c of cells) {
    matrix[matrixKey(c.seller, c.industry)] = {
      value: c.win_rate,
      count: c.deals,
      reference: c.seller_overall_win_rate,
    };
  }
  return (
    <div className="space-y-2">
      <MatrixTable rows={rows} cols={cols} cells={matrix} cornerLabel="Seller" />
      <p className="text-xs text-muted-foreground">
        Win rate (deals) per seller × industry, shaded vs the seller's overall
        win rate. Cells with ≥5 deals only.
      </p>
      <Note text={data.note} />
    </div>
  );
}

interface FunnelData {
  stages?: FunnelStage[];
  deals?: number;
  won?: number;
  overall_win_rate?: number | null;
  note?: string;
}

function FunnelViz({ data }: { data: FunnelData }) {
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="Deals in funnel" value={fmtNumber(data.deals)} />
        <Stat label="Won" value={fmtNumber(data.won)} />
        <Stat
          label="Overall win rate"
          value={fmtPercent(data.overall_win_rate)}
        />
      </StatGrid>
      <FunnelStages stages={data.stages ?? []} />
      <Note text={data.note} />
    </div>
  );
}

interface FunnelTerrData {
  territories?: { territory: string; deals: number; stages: FunnelStage[] }[];
  note?: string;
}

function FunnelTerrViz({ data }: { data: FunnelTerrData }) {
  const territories = data.territories ?? [];
  if (territories.length === 0) return <EmptyViz />;
  const cols = orderLabels(
    territories.flatMap((t) => t.stages.map((s) => s.stage)),
    FUNNEL_STAGE_ORDER,
  );
  const rows = territories.map((t) => t.territory);
  const matrix: Record<string, MatrixCell> = {};
  for (const t of territories) {
    for (const s of t.stages) {
      matrix[matrixKey(t.territory, s.stage)] = {
        value: s.conversion_rate,
        count: s.reached,
      };
    }
  }
  return (
    <div className="space-y-2">
      <MatrixTable
        rows={rows}
        cols={cols}
        cells={matrix}
        cornerLabel="Territory"
      />
      <p className="text-xs text-muted-foreground">
        Cell = stage conversion rate (deals reaching the stage). Territories
        with ≥10 funnel deals.
      </p>
      <Note text={data.note} />
    </div>
  );
}

interface AdherenceData {
  stages?: { stage: string; skipped: number; skip_rate: number | null }[];
  won_deals?: number;
  note?: string;
}

function AdherenceViz({ data }: { data: AdherenceData }) {
  const rows: SeriesRow[] = (data.stages ?? []).map((s) => ({
    label: s.stage,
    skip_rate: s.skip_rate,
    skipped: s.skipped,
  }));
  const series: ChartSeries[] = [
    { key: "skip_rate", name: "Skip rate", color: CHART_BAR, countKey: "skipped" },
  ];
  return (
    <div className="space-y-2">
      <GroupedBarsChart rows={rows} series={series} format="percent" />
      {data.won_deals != null && (
        <p className="text-xs text-muted-foreground">
          Across {fmtNumber(data.won_deals)} won deals.
        </p>
      )}
      <Note text={data.note} />
    </div>
  );
}

interface MeddByStageData {
  stages?: { stage: string; avg_coverage: number; deals: number }[];
  note?: string;
}

function MeddByStageViz({ data }: { data: MeddByStageData }) {
  const rows: SeriesRow[] = (data.stages ?? []).map((s) => ({
    label: s.stage,
    avg_coverage: s.avg_coverage,
    deals: s.deals,
  }));
  const series: ChartSeries[] = [
    {
      key: "avg_coverage",
      name: "Avg MEDDPICC coverage (0–6)",
      color: CHART_BAR,
      countKey: "deals",
    },
  ];
  return (
    <div className="space-y-2">
      <GroupedBarsChart rows={rows} series={series} format="number" />
      <Note text={data.note} />
    </div>
  );
}

interface StageCriteriaRow {
  stage: string;
  recorded_share: number | null;
  median_days_won: number | null;
}

interface StageCriteriaData {
  stages?: StageCriteriaRow[];
  won_deals?: number;
  note?: string;
}

function StageCriteriaViz({ data }: { data: StageCriteriaData }) {
  const cols: TableCol<StageCriteriaRow>[] = [
    { label: "Stage", render: (r) => r.stage },
    {
      label: "% of winners recording stage",
      align: "right",
      render: (r) => fmtPercent(r.recorded_share),
    },
    {
      label: "Median days in stage (won)",
      align: "right",
      render: (r) => fmtValue(r.median_days_won, "days"),
    },
  ];
  return (
    <div className="space-y-2">
      <SimpleTable
        cols={cols}
        rows={data.stages ?? []}
        rowKey={(r) => r.stage}
      />
      {data.won_deals != null && (
        <p className="text-xs text-muted-foreground">
          Across {fmtNumber(data.won_deals)} won deals.
        </p>
      )}
      <Note text={data.note} />
    </div>
  );
}

type Payload = Record<string, unknown>;

export const PROCESS_RENDERERS: Record<
  string,
  (props: { data: Payload }) => JSX.Element
> = {
  "C5-CHANNEL-ROI": ({ data }) => (
    <ChannelRoiViz data={data as unknown as ChannelRoiData} />
  ),
  "C5-ICP-ALIGN": ({ data }) => (
    <IcpAlignViz data={data as unknown as IcpAlignData} />
  ),
  "C5-LEAD-ASSIGN": ({ data }) => (
    <LeadAssignViz data={data as unknown as LeadAssignData} />
  ),
  "C5-FUNNEL": ({ data }) => <FunnelViz data={data as unknown as FunnelData} />,
  "C5-FUNNEL-TERR": ({ data }) => (
    <FunnelTerrViz data={data as unknown as FunnelTerrData} />
  ),
  "C5-ADHERENCE": ({ data }) => (
    <AdherenceViz data={data as unknown as AdherenceData} />
  ),
  "C5-MEDD-BY-STAGE": ({ data }) => (
    <MeddByStageViz data={data as unknown as MeddByStageData} />
  ),
  "C5-STAGE-CRITERIA": ({ data }) => (
    <StageCriteriaViz data={data as unknown as StageCriteriaData} />
  ),
};
