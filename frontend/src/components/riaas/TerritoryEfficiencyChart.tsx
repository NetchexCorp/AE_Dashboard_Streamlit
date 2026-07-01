import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TerritoryEffData, TerritoryMetrics } from "@/api/riaas";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/formatters";
import {
  CHART_BAR,
  CHART_CURSOR,
  CHART_GRID,
  CHART_TICK,
} from "./chartTheme";
import { makeCategoryTick } from "./vizPrimitives";

const TOP_N = 15;
const AXIS_WIDTH = 180;
const categoryTick = makeCategoryTick(AXIS_WIDTH);

function TerritoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TerritoryMetrics }[];
}) {
  if (!active || !payload?.length) return null;
  const t = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{t.name}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">Efficiency</dt>
        <dd>{t.efficiency != null ? `${fmtCurrency(t.efficiency)}/day` : "—"}</dd>
        <dt className="text-muted-foreground">Win rate</dt>
        <dd>{fmtPercent(t.win_rate)}</dd>
        <dt className="text-muted-foreground">ACV</dt>
        <dd>{fmtCurrency(t.acv)}</dd>
        <dt className="text-muted-foreground">Cycle</dt>
        <dd>{t.cycle_days != null ? `${fmtNumber(t.cycle_days)} days` : "—"}</dd>
        <dt className="text-muted-foreground">Deals</dt>
        <dd>{fmtNumber(t.deals)}</dd>
      </dl>
    </div>
  );
}

export function TerritoryEfficiencyChart({ data }: { data: TerritoryEffData }) {
  const territories = data.territories.slice(0, TOP_N);
  if (territories.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Not enough closed deals per territory to measure efficiency.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div style={{ height: Math.max(territories.length * 28 + 40, 160) }}>
        <ResponsiveContainer>
          <BarChart
            data={territories}
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
              tick={categoryTick}
              width={AXIS_WIDTH}
              interval={0}
            />
            <Tooltip content={<TerritoryTooltip />} cursor={CHART_CURSOR} />
            <Bar dataKey="efficiency" fill={CHART_BAR} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {data.territories.length > TOP_N && (
          <p>
            Showing top {TOP_N} of {data.territories.length} territories.
          </p>
        )}
        {data.gap?.ratio != null && (
          <p>
            {data.gap.top} converts pipeline {data.gap.ratio}× more efficiently
            than {data.gap.bottom}.
          </p>
        )}
        {data.deals_without_territory > 0 && (
          <p>
            {fmtNumber(data.deals_without_territory)} closed deals have no
            territory assigned and are excluded.
          </p>
        )}
      </div>
    </div>
  );
}
