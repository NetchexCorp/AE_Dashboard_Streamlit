import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/formatters";
import {
  CHART_BAR,
  CHART_CURSOR,
  CHART_GRID,
  CHART_LINE,
  CHART_TICK,
} from "./chartTheme";
import { EmptyViz } from "./vizPrimitives";

export interface CohortRow {
  name: string;
  deals: number;
  deals_won?: number;
  win_rate: number | null;
  acv: number | null;
  cycle_days: number | null;
  velocity: number | null;
  efficiency: number | null;
  bookings?: number;
}

type Metric = "efficiency" | "velocity";

function CohortTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: { payload: CohortRow }[];
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const perDay = (v: number | null | undefined) =>
    v != null ? `${fmtCurrency(v)}/day` : "—";
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{r.name}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">
          {metric === "velocity" ? "Velocity" : "Efficiency"}
        </dt>
        <dd>{perDay(r[metric])}</dd>
        <dt className="text-muted-foreground">Win rate</dt>
        <dd>{fmtPercent(r.win_rate)}</dd>
        <dt className="text-muted-foreground">ACV</dt>
        <dd>{fmtCurrency(r.acv)}</dd>
        <dt className="text-muted-foreground">Cycle</dt>
        <dd>{r.cycle_days != null ? `${fmtNumber(r.cycle_days)} days` : "—"}</dd>
        <dt className="text-muted-foreground">Deals</dt>
        <dd>{fmtNumber(r.deals)}</dd>
        {r.bookings != null && (
          <>
            <dt className="text-muted-foreground">Bookings</dt>
            <dd>{fmtCurrency(r.bookings)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Efficiency/velocity bars for a cohort list, with deal-count context. */
export function CohortMetricsChart({
  rows,
  metric = "efficiency",
  horizontal = false,
  topN,
}: {
  rows: CohortRow[];
  metric?: Metric;
  horizontal?: boolean;
  topN?: number;
}) {
  if (rows.length === 0) return <EmptyViz />;
  const shown = topN != null ? rows.slice(0, topN) : rows;
  const metricName = metric === "velocity" ? "Velocity" : "Efficiency";

  if (horizontal) {
    return (
      <div className="space-y-1.5">
        <div style={{ height: Math.max(shown.length * 28 + 40, 160) }}>
          <ResponsiveContainer>
            <BarChart
              data={shown}
              layout="vertical"
              margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                type="number"
                tick={CHART_TICK}
                tickFormatter={(v) => fmtCurrency(Number(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={CHART_TICK}
                width={130}
                interval={0}
              />
              <Tooltip
                content={<CohortTooltip metric={metric} />}
                cursor={CHART_CURSOR}
              />
              <Bar dataKey={metric} fill={CHART_BAR} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {rows.length > shown.length && (
          <p className="text-xs text-muted-foreground">
            Showing top {shown.length} of {rows.length}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer>
        <ComposedChart
          data={shown}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="name" tick={CHART_TICK} interval={0} />
          <YAxis
            yAxisId="metric"
            tick={CHART_TICK}
            tickFormatter={(v) => fmtCurrency(Number(v))}
            width={70}
          />
          <YAxis
            yAxisId="deals"
            orientation="right"
            tick={CHART_TICK}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            content={<CohortTooltip metric={metric} />}
            cursor={CHART_CURSOR}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="metric"
            dataKey={metric}
            name={`${metricName} ($/day)`}
            fill={CHART_BAR}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="deals"
            dataKey="deals"
            name="Deals"
            stroke={CHART_LINE}
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
