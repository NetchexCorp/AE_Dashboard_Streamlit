import { cn } from "@/lib/cn";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/formatters";
import { CHART_BAR } from "./chartTheme";
import {
  fmtValue,
  Note,
  SimpleTable,
  Stat,
  StatGrid,
  type TableCol,
} from "./vizPrimitives";

interface VelocitySeller {
  seller_id: string;
  seller: string | null;
  deals: number;
  deals_won: number;
  win_rate: number | null;
  acv: number | null;
  cycle_days: number | null;
  velocity: number | null;
  efficiency: number | null;
  bookings: number;
  pct_bookings_expansion: number | null;
  quota: number | null;
  attainment: number | null;
}

interface TerrVelocityData {
  sellers?: VelocitySeller[];
  min_closed_deals?: number;
  note?: string;
}

function attainmentClass(v: number | null): string | undefined {
  if (v == null) return undefined;
  if (v < 0.6) return "font-medium text-red-700";
  if (v > 1) return "font-medium text-emerald-700";
  return undefined;
}

function TerrVelocityViz({ data }: { data: TerrVelocityData }) {
  const cols: TableCol<VelocitySeller>[] = [
    { label: "Seller", render: (s) => s.seller ?? "—" },
    { label: "Deals", align: "right", render: (s) => fmtNumber(s.deals) },
    { label: "Win rate", align: "right", render: (s) => fmtPercent(s.win_rate) },
    { label: "ACV", align: "right", render: (s) => fmtCurrency(s.acv) },
    {
      label: "Cycle",
      align: "right",
      render: (s) => fmtValue(s.cycle_days, "days"),
    },
    {
      label: "Velocity",
      align: "right",
      render: (s) => fmtValue(s.velocity, "perDay"),
    },
    {
      label: "Bookings",
      align: "right",
      render: (s) => fmtCurrency(s.bookings),
    },
    {
      label: "% expansion",
      align: "right",
      render: (s) => fmtPercent(s.pct_bookings_expansion),
    },
    { label: "Quota", align: "right", render: (s) => fmtCurrency(s.quota) },
    {
      label: "Attainment",
      align: "right",
      render: (s) => (
        <span className={attainmentClass(s.attainment)}>
          {fmtPercent(s.attainment)}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-2">
      <SimpleTable
        cols={cols}
        rows={data.sellers ?? []}
        rowKey={(s) => s.seller_id}
      />
      {data.min_closed_deals != null && (
        <p className="text-xs text-muted-foreground">
          Sellers with ≥{data.min_closed_deals} closed deals in the period.
        </p>
      )}
      <Note text={data.note} />
    </div>
  );
}

interface CoverageSeller {
  seller_id: string;
  seller: string | null;
  quota: number | null;
  bookings: number;
  open_pipeline: number;
  remaining_quota: number | null;
  coverage: number | null;
}

interface PipeCoverageData {
  sellers?: CoverageSeller[];
  overall?: {
    quota: number;
    bookings: number;
    open_pipeline: number;
    remaining_quota: number | null;
    coverage: number | null;
  };
  note?: string;
}

const COVERAGE_BAR_MAX = 3; // a 3× ratio fills the bar

function CoverageBar({ coverage }: { coverage: number | null }) {
  if (coverage == null)
    return <span className="text-muted-foreground">—</span>;
  const width = Math.min(coverage / COVERAGE_BAR_MAX, 1) * 100;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-2 w-24 overflow-hidden rounded bg-muted">
        <span
          className="block h-2 rounded"
          style={{ width: `${width}%`, background: CHART_BAR }}
        />
      </span>
      <span
        className={cn(
          "tabular-nums",
          coverage < 1 && "font-medium text-red-700",
        )}
      >
        {fmtValue(coverage, "ratio")}
      </span>
    </span>
  );
}

function PipeCoverageViz({ data }: { data: PipeCoverageData }) {
  const cols: TableCol<CoverageSeller>[] = [
    { label: "Seller", render: (s) => s.seller ?? "—" },
    { label: "Quota", align: "right", render: (s) => fmtCurrency(s.quota) },
    {
      label: "Bookings",
      align: "right",
      render: (s) => fmtCurrency(s.bookings),
    },
    {
      label: "Open pipeline",
      align: "right",
      render: (s) => fmtCurrency(s.open_pipeline),
    },
    {
      label: "Remaining quota",
      align: "right",
      render: (s) => fmtCurrency(s.remaining_quota),
    },
    {
      label: "Coverage",
      align: "right",
      render: (s) => <CoverageBar coverage={s.coverage} />,
    },
  ];
  return (
    <div className="space-y-2">
      <StatGrid>
        <Stat label="Quota" value={fmtCurrency(data.overall?.quota)} />
        <Stat label="Bookings" value={fmtCurrency(data.overall?.bookings)} />
        <Stat
          label="Open pipeline"
          value={fmtCurrency(data.overall?.open_pipeline)}
        />
        <Stat
          label="Coverage"
          value={fmtValue(data.overall?.coverage ?? null, "ratio")}
          hint={`of ${fmtCurrency(data.overall?.remaining_quota)} remaining`}
        />
      </StatGrid>
      <SimpleTable
        cols={cols}
        rows={data.sellers ?? []}
        rowKey={(s) => s.seller_id}
      />
      <Note text={data.note} />
    </div>
  );
}

interface FocusSeller {
  seller_id: string;
  seller: string | null;
  open_deals: number;
  low_engagement: number;
  stalled: number;
  aged: number;
  total_risk: number;
  focus: string | null;
}

interface CoachFocusData {
  sellers?: FocusSeller[];
  note?: string;
}

const FOCUS_LABELS: Record<string, string> = {
  low_engagement: "Low engagement",
  stalled: "Stalled",
  aged: "Aged >180d",
};

function FocusBadge({ focus }: { focus: string | null }) {
  if (!focus) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">
      {FOCUS_LABELS[focus] ?? focus}
    </span>
  );
}

function CoachFocusViz({ data }: { data: CoachFocusData }) {
  const cols: TableCol<FocusSeller>[] = [
    { label: "Seller", render: (s) => s.seller ?? "—" },
    {
      label: "Open deals",
      align: "right",
      render: (s) => fmtNumber(s.open_deals),
    },
    {
      label: "Low engagement",
      align: "right",
      render: (s) => fmtNumber(s.low_engagement),
    },
    { label: "Stalled", align: "right", render: (s) => fmtNumber(s.stalled) },
    { label: "Aged >180d", align: "right", render: (s) => fmtNumber(s.aged) },
    {
      label: "Total risk",
      align: "right",
      render: (s) => fmtNumber(s.total_risk),
    },
    { label: "Focus", render: (s) => <FocusBadge focus={s.focus} /> },
  ];
  return (
    <div className="space-y-2">
      <SimpleTable
        cols={cols}
        rows={data.sellers ?? []}
        rowKey={(s) => s.seller_id}
        maxRows={15}
      />
      <Note text={data.note} />
    </div>
  );
}

type Payload = Record<string, unknown>;

export const COACH_RENDERERS: Record<
  string,
  (props: { data: Payload }) => JSX.Element
> = {
  "C4-TERR-VELOCITY": ({ data }) => (
    <TerrVelocityViz data={data as unknown as TerrVelocityData} />
  ),
  "C4-PIPE-COVERAGE": ({ data }) => (
    <PipeCoverageViz data={data as unknown as PipeCoverageData} />
  ),
  "C4-COACH-FOCUS": ({ data }) => (
    <CoachFocusViz data={data as unknown as CoachFocusData} />
  ),
};
