import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCurrency } from "@/lib/formatters";

interface Props {
  months: string[]; // "2026-01" …
  actual: number[];
  plan: number[];
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortMonth(key: string): string {
  const m = Number(key.slice(5, 7));
  return MONTH_LABELS[m - 1] ?? key;
}

/** Monthly actual bookings (bars) against plan (line). One axis, one scale. */
export function MonthlyTrendChart({ months, actual, plan }: Props) {
  const data = months.map((m, i) => ({
    name: shortMonth(m),
    actual: actual[i] ?? null,
    plan: plan[i] ?? null,
  }));
  return (
    <div className="h-52">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => fmtCurrency(Number(v))}
            width={80}
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              fmtCurrency(v),
              name === "actual" ? "Actual" : "Plan",
            ]}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="actual" fill="hsl(222 47% 33%)" radius={[3, 3, 0, 0]} maxBarSize={48} />
          <Line
            dataKey="plan"
            stroke="hsl(222 20% 40%)"
            strokeWidth={2}
            dot={{ r: 2.5 }}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
