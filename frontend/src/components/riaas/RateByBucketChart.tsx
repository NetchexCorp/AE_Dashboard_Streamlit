import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNumber, fmtPercent } from "@/lib/formatters";
import {
  CHART_BAR,
  CHART_CURSOR,
  CHART_GRID,
  CHART_LINE,
  CHART_TICK,
} from "./chartTheme";
import { EmptyViz } from "./vizPrimitives";

export interface RateBucket {
  label: string;
  deals: number;
  win_rate: number | null;
}

function BucketTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RateBucket }[];
}) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{b.label}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">Deals</dt>
        <dd>{fmtNumber(b.deals)}</dd>
        <dt className="text-muted-foreground">Win rate</dt>
        <dd>{fmtPercent(b.win_rate)}</dd>
      </dl>
    </div>
  );
}

/** Deal-count bars with a win-rate line over labeled buckets. */
export function RateByBucketChart({ buckets }: { buckets: RateBucket[] }) {
  if (buckets.length === 0) return <EmptyViz />;
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <ComposedChart
          data={buckets}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="label" tick={CHART_TICK} interval={0} />
          <YAxis
            yAxisId="deals"
            tick={CHART_TICK}
            allowDecimals={false}
            width={44}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tick={CHART_TICK}
            tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
            domain={[0, 1]}
            width={40}
          />
          <Tooltip content={<BucketTooltip />} cursor={CHART_CURSOR} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="deals"
            dataKey="deals"
            name="Deals"
            fill={CHART_BAR}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="rate"
            dataKey="win_rate"
            name="Win rate"
            stroke={CHART_LINE}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
