import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VelocityQuarter } from "@/api/riaas";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/formatters";
import {
  CHART_BAR,
  CHART_CURSOR,
  CHART_GRID,
  CHART_TICK,
} from "./chartTheme";

function VelocityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: VelocityQuarter }[];
}) {
  if (!active || !payload?.length) return null;
  const q = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{q.label}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">Velocity</dt>
        <dd>{q.velocity != null ? `${fmtCurrency(q.velocity)}/day` : "—"}</dd>
        <dt className="text-muted-foreground">Deals</dt>
        <dd>
          {fmtNumber(q.deals)} ({fmtNumber(q.deals_won)} won)
        </dd>
        <dt className="text-muted-foreground">Win rate</dt>
        <dd>{fmtPercent(q.win_rate)}</dd>
        <dt className="text-muted-foreground">ACV</dt>
        <dd>{fmtCurrency(q.acv)}</dd>
        <dt className="text-muted-foreground">Cycle</dt>
        <dd>{q.cycle_days != null ? `${fmtNumber(q.cycle_days)} days` : "—"}</dd>
      </dl>
    </div>
  );
}

export function VelocityTrendChart({ quarters }: { quarters: VelocityQuarter[] }) {
  if (quarters.every((q) => q.deals === 0)) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No closed deals in this window.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="h-64">
        <ResponsiveContainer>
          <ComposedChart
            data={quarters}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" tick={CHART_TICK} />
            <YAxis
              tick={CHART_TICK}
              tickFormatter={(v) => fmtCurrency(Number(v))}
              width={80}
            />
            <Tooltip content={<VelocityTooltip />} cursor={CHART_CURSOR} />
            <Bar dataKey="velocity" fill={CHART_BAR} radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">Quarter</th>
              <th className="px-2 py-1 text-right font-medium">Deals</th>
              <th className="px-2 py-1 text-right font-medium">Win rate</th>
              <th className="px-2 py-1 text-right font-medium">ACV</th>
              <th className="px-2 py-1 text-right font-medium">Cycle (days)</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => (
              <tr key={q.label} className="border-t border-border/40">
                <td className="px-2 py-1">{q.label}</td>
                <td className="px-2 py-1 text-right">{fmtNumber(q.deals)}</td>
                <td className="px-2 py-1 text-right">{fmtPercent(q.win_rate)}</td>
                <td className="px-2 py-1 text-right">{fmtCurrency(q.acv)}</td>
                <td className="px-2 py-1 text-right">{fmtNumber(q.cycle_days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
