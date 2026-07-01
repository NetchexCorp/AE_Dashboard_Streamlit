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
import type { RpsQuarter } from "@/api/riaas";
import { fmtCurrency, fmtNumber } from "@/lib/formatters";
import {
  CHART_BAR,
  CHART_CURSOR,
  CHART_GRID,
  CHART_LINE,
  CHART_TICK,
} from "./chartTheme";

function RpsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RpsQuarter }[];
}) {
  if (!active || !payload?.length) return null;
  const q = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{q.label}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">Revenue / seller</dt>
        <dd>{fmtCurrency(q.rps)}</dd>
        <dt className="text-muted-foreground">Bookings</dt>
        <dd>{fmtCurrency(q.bookings)}</dd>
        <dt className="text-muted-foreground">Sellers</dt>
        <dd>{fmtNumber(q.sellers)}</dd>
      </dl>
    </div>
  );
}

export function RpsTrendChart({ quarters }: { quarters: RpsQuarter[] }) {
  if (quarters.every((q) => q.sellers === 0)) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No won deals in this window.
      </div>
    );
  }
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <ComposedChart
          data={quarters}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="label" tick={CHART_TICK} />
          <YAxis
            yAxisId="rps"
            tick={CHART_TICK}
            tickFormatter={(v) => fmtCurrency(Number(v))}
            width={80}
          />
          <YAxis
            yAxisId="sellers"
            orientation="right"
            tick={CHART_TICK}
            allowDecimals={false}
            width={36}
          />
          <Tooltip content={<RpsTooltip />} cursor={CHART_CURSOR} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="rps"
            dataKey="rps"
            name="Revenue per seller"
            fill={CHART_BAR}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="sellers"
            dataKey="sellers"
            name="Active sellers"
            stroke={CHART_LINE}
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
