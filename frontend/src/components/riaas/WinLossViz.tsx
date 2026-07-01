import { fmtNumber, fmtPercent } from "@/lib/formatters";
import { BandLinesChart } from "./BandLinesChart";
import { CHART_LINE, CHART_NEGATIVE, CHART_SERIES } from "./chartTheme";
import { CohortMetricsChart, type CohortRow } from "./CohortMetricsChart";
import {
  type ChartSeries,
  GroupedBarsChart,
  type SeriesRow,
} from "./GroupedBarsChart";
import { type MatrixCell, MatrixTable, matrixKey } from "./MatrixTable";
import { type RateBucket, RateByBucketChart } from "./RateByBucketChart";
import { EmptyViz, Note, orderLabels, Stat, StatGrid } from "./vizPrimitives";

// Canonical band orders (labels must match the backend's, en dashes included).
const SIZE_BAND_ORDER = ["<$5k", "$5–15k", "$15–50k", "$50–150k", "$150k+"];
const SCORE_BAND_ORDER = ["0–30", "31–60", "61–90", "91–100"];
const SENIORITY_ORDER = ["C-Suite", "VP", "Director", "Manager", "Other", "Unknown"];
const DEPARTMENT_ORDER = [
  "HR",
  "Finance",
  "Executive",
  "IT",
  "Operations",
  "Sales/Marketing",
  "Other",
  "Unknown",
];

interface EngageConvData {
  cells?: { size_band: string; score_band: string; deals: number; win_rate: number | null }[];
  scored_deals?: number;
  note?: string;
}

function EngageConvViz({ data }: { data: EngageConvData }) {
  const cells = data.cells ?? [];
  if (cells.length === 0) return <EmptyViz />;
  const sizeBands = orderLabels(cells.map((c) => c.size_band), SIZE_BAND_ORDER);
  const scoreBands = orderLabels(cells.map((c) => c.score_band), SCORE_BAND_ORDER);
  const rows: SeriesRow[] = sizeBands.map((sb) => {
    const row: SeriesRow = { label: sb };
    for (const c of cells) {
      if (c.size_band !== sb) continue;
      row[`wr_${c.score_band}`] = c.win_rate;
      row[`n_${c.score_band}`] = c.deals;
    }
    return row;
  });
  const series: ChartSeries[] = scoreBands.map((eb, i) => ({
    key: `wr_${eb}`,
    name: `Score ${eb}`,
    color: CHART_SERIES[i % CHART_SERIES.length],
    countKey: `n_${eb}`,
  }));
  return (
    <div className="space-y-2">
      <GroupedBarsChart rows={rows} series={series} format="percent" />
      <Note text={data.note} />
    </div>
  );
}

interface SlippageWrData {
  buckets?: RateBucket[];
  note?: string;
}

function SlippageWrViz({ data }: { data: SlippageWrData }) {
  return (
    <div className="space-y-2">
      <RateByBucketChart buckets={data.buckets ?? []} />
      <p className="text-xs text-muted-foreground">
        Buckets = cumulative days the close date was pushed out.
      </p>
      <Note text={data.note} />
    </div>
  );
}

interface QualWrData {
  buckets?: RateBucket[];
  ge3?: { deals: number; win_rate: number | null };
  lt3?: { deals: number; win_rate: number | null };
  scored_deals?: number;
  note?: string;
}

function QualWrViz({ data }: { data: QualWrData }) {
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat
          label="Coverage ≥3 win rate"
          value={fmtPercent(data.ge3?.win_rate)}
          hint={`${fmtNumber(data.ge3?.deals)} deals`}
        />
        <Stat
          label="Coverage <3 win rate"
          value={fmtPercent(data.lt3?.win_rate)}
          hint={`${fmtNumber(data.lt3?.deals)} deals`}
        />
        <Stat label="Scored deals" value={fmtNumber(data.scored_deals)} />
      </StatGrid>
      <RateByBucketChart buckets={data.buckets ?? []} />
      <Note text={data.note} />
    </div>
  );
}

interface MeddElementsData {
  elements?: {
    element: string;
    won_rate: number | null;
    lost_rate: number | null;
    won_n: number;
    lost_n: number;
  }[];
  note?: string;
}

function MeddElementsViz({ data }: { data: MeddElementsData }) {
  const rows: SeriesRow[] = (data.elements ?? []).map((e) => ({
    label: e.element,
    won_rate: e.won_rate,
    lost_rate: e.lost_rate,
    won_n: e.won_n,
    lost_n: e.lost_n,
  }));
  const series: ChartSeries[] = [
    { key: "won_rate", name: "Won", color: CHART_LINE, countKey: "won_n" },
    { key: "lost_rate", name: "Lost", color: CHART_NEGATIVE, countKey: "lost_n" },
  ];
  return (
    <div className="space-y-2">
      <GroupedBarsChart rows={rows} series={series} format="percent" horizontal />
      <Note text={data.note} />
    </div>
  );
}

interface EffDealsizeData {
  bands?: ({ band: string } & Omit<CohortRow, "name">)[];
  note?: string;
}

const bandRows = (bands: EffDealsizeData["bands"]): CohortRow[] =>
  (bands ?? []).map(({ band, ...m }) => ({ name: band, ...m }));

function EffDealsizeViz({ data }: { data: EffDealsizeData }) {
  return (
    <div className="space-y-2">
      <CohortMetricsChart rows={bandRows(data.bands)} />
      <Note text={data.note} />
    </div>
  );
}

interface CycleAgeWrData {
  cells?: { size_band: string; age_band: string; deals: number; win_rate: number | null }[];
  age_bands?: string[];
  note?: string;
}

function CycleAgeWrViz({ data }: { data: CycleAgeWrData }) {
  const cells = data.cells ?? [];
  if (cells.length === 0) return <EmptyViz />;
  const ageBands = orderLabels(cells.map((c) => c.age_band), data.age_bands ?? []);
  const sizeBands = orderLabels(cells.map((c) => c.size_band), SIZE_BAND_ORDER);
  const rows: SeriesRow[] = ageBands.map((ab) => {
    const row: SeriesRow = { label: ab };
    for (const c of cells) {
      if (c.age_band !== ab) continue;
      row[`wr_${c.size_band}`] = c.win_rate;
      row[`n_${c.size_band}`] = c.deals;
    }
    return row;
  });
  const series: ChartSeries[] = sizeBands.map((sb, i) => ({
    key: `wr_${sb}`,
    name: sb,
    color: CHART_SERIES[i % CHART_SERIES.length],
    countKey: `n_${sb}`,
  }));
  return (
    <div className="space-y-2">
      <BandLinesChart rows={rows} series={series} format="percent" />
      <p className="text-xs text-muted-foreground">
        Win rate by deal age (days from creation to close), per deal-size band.
      </p>
      <Note text={data.note} />
    </div>
  );
}

interface MedianCycleData {
  bands?: {
    band: string;
    won_median_days: number | null;
    lost_median_days: number | null;
    won_n: number;
    lost_n: number;
  }[];
  note?: string;
}

function MedianCycleViz({ data }: { data: MedianCycleData }) {
  const rows: SeriesRow[] = (data.bands ?? []).map((b) => ({
    label: b.band,
    won: b.won_median_days,
    lost: b.lost_median_days,
    won_n: b.won_n,
    lost_n: b.lost_n,
  }));
  const series: ChartSeries[] = [
    { key: "won", name: "Won (median days)", color: CHART_LINE, countKey: "won_n" },
    { key: "lost", name: "Lost (median days)", color: CHART_NEGATIVE, countKey: "lost_n" },
  ];
  return (
    <div className="space-y-2">
      <GroupedBarsChart rows={rows} series={series} format="days" />
      <Note text={data.note} />
    </div>
  );
}

interface EffIndustryData {
  industries?: CohortRow[];
  top5_volume_share?: number | null;
  note?: string;
}

function EffIndustryViz({ data }: { data: EffIndustryData }) {
  return (
    <div className="space-y-2">
      <CohortMetricsChart rows={data.industries ?? []} horizontal topN={15} />
      {data.top5_volume_share != null && (
        <p className="text-xs text-muted-foreground">
          The 5 most efficient industries carry{" "}
          {fmtPercent(data.top5_volume_share)} of deal volume.
        </p>
      )}
      <Note text={data.note} />
    </div>
  );
}

interface EffIcpData {
  employee_range?: CohortRow[];
  icp_industry_group?: CohortRow[];
  note?: string;
}

function EffIcpViz({ data }: { data: EffIcpData }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
          Employee range
        </h4>
        <CohortMetricsChart rows={data.employee_range ?? []} horizontal />
      </div>
      <div>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">
          ICP industry group
        </h4>
        <CohortMetricsChart rows={data.icp_industry_group ?? []} horizontal />
      </div>
      <Note text={data.note} />
    </div>
  );
}

interface MultithreadWrData {
  bands?: RateBucket[];
  avg_stakeholders_won?: number | null;
  avg_stakeholders_lost?: number | null;
  note?: string;
}

function MultithreadWrViz({ data }: { data: MultithreadWrData }) {
  const avg = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v.toFixed(1) : "—";
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat
          label="Avg stakeholders — won"
          value={avg(data.avg_stakeholders_won)}
        />
        <Stat
          label="Avg stakeholders — lost"
          value={avg(data.avg_stakeholders_lost)}
        />
      </StatGrid>
      <RateByBucketChart buckets={data.bands ?? []} />
      <p className="text-xs text-muted-foreground">
        Buckets = engaged stakeholders per deal.
      </p>
      <Note text={data.note} />
    </div>
  );
}

interface PersonaWonData {
  cells?: { department: string; seniority: string; count: number; share: number | null }[];
  total_roles?: number;
  pct_untitled?: number | null;
  note?: string;
}

function PersonaWonViz({ data }: { data: PersonaWonData }) {
  const cells = data.cells ?? [];
  if (cells.length === 0) return <EmptyViz />;
  const rows = orderLabels(cells.map((c) => c.department), DEPARTMENT_ORDER);
  const cols = orderLabels(cells.map((c) => c.seniority), SENIORITY_ORDER);
  const matrix: Record<string, MatrixCell> = {};
  for (const c of cells) {
    matrix[matrixKey(c.department, c.seniority)] = {
      value: c.share,
      count: c.count,
    };
  }
  return (
    <div className="space-y-2">
      <MatrixTable rows={rows} cols={cols} cells={matrix} cornerLabel="Dept" />
      <p className="text-xs text-muted-foreground">
        {fmtNumber(data.total_roles)} engaged roles in won deals
        {data.pct_untitled != null &&
          `; ${fmtPercent(data.pct_untitled)} have no job title`}
        .
      </p>
      <Note text={data.note} />
    </div>
  );
}

interface PersonaImpactData {
  cells?: { department: string; seniority: string; deals: number; win_rate: number | null }[];
  overall_win_rate?: number | null;
  note?: string;
}

function PersonaImpactViz({ data }: { data: PersonaImpactData }) {
  const cells = data.cells ?? [];
  if (cells.length === 0) return <EmptyViz />;
  const rows = orderLabels(cells.map((c) => c.department), DEPARTMENT_ORDER);
  const cols = orderLabels(cells.map((c) => c.seniority), SENIORITY_ORDER);
  const matrix: Record<string, MatrixCell> = {};
  for (const c of cells) {
    matrix[matrixKey(c.department, c.seniority)] = {
      value: c.win_rate,
      count: c.deals,
    };
  }
  return (
    <div className="space-y-2">
      <MatrixTable
        rows={rows}
        cols={cols}
        cells={matrix}
        reference={data.overall_win_rate}
        cornerLabel="Dept"
      />
      <p className="text-xs text-muted-foreground">
        Win rate (deals) per persona; shaded vs the{" "}
        {fmtPercent(data.overall_win_rate)} overall win rate. Cells with ≥5
        deals only.
      </p>
      <Note text={data.note} />
    </div>
  );
}

type Payload = Record<string, unknown>;

export const WINLOSS_RENDERERS: Record<
  string,
  (props: { data: Payload }) => JSX.Element
> = {
  "C2-ENGAGE-CONV": ({ data }) => (
    <EngageConvViz data={data as unknown as EngageConvData} />
  ),
  "C2-SLIPPAGE-WR": ({ data }) => (
    <SlippageWrViz data={data as unknown as SlippageWrData} />
  ),
  "C2-QUAL-WR": ({ data }) => <QualWrViz data={data as unknown as QualWrData} />,
  "C2-MEDD-ELEMENTS": ({ data }) => (
    <MeddElementsViz data={data as unknown as MeddElementsData} />
  ),
  "C2-EFF-DEALSIZE": ({ data }) => (
    <EffDealsizeViz data={data as unknown as EffDealsizeData} />
  ),
  "C2-CYCLE-AGE-WR": ({ data }) => (
    <CycleAgeWrViz data={data as unknown as CycleAgeWrData} />
  ),
  "C2-MEDIAN-CYCLE": ({ data }) => (
    <MedianCycleViz data={data as unknown as MedianCycleData} />
  ),
  "C2-EFF-INDUSTRY": ({ data }) => (
    <EffIndustryViz data={data as unknown as EffIndustryData} />
  ),
  "C2-EFF-ICP": ({ data }) => <EffIcpViz data={data as unknown as EffIcpData} />,
  "C2-MULTITHREAD-WR": ({ data }) => (
    <MultithreadWrViz data={data as unknown as MultithreadWrData} />
  ),
  "C2-PERSONA-WON": ({ data }) => (
    <PersonaWonViz data={data as unknown as PersonaWonData} />
  ),
  "C2-PERSONA-IMPACT": ({ data }) => (
    <PersonaImpactViz data={data as unknown as PersonaImpactData} />
  ),
};
