import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNumber } from "@/lib/formatters";
import { CHART_CURSOR, CHART_GRID, CHART_TICK } from "./chartTheme";
import {
  axisFormatter,
  EmptyViz,
  fmtValue,
  type VizFormat,
} from "./vizPrimitives";

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  /** Row key holding a supporting count shown as "(n)" in the tooltip. */
  countKey?: string;
}

export type SeriesRow = { label: string } & Record<
  string,
  string | number | null | undefined
>;

export function SeriesTooltip({
  active,
  label,
  payload,
  series,
  format,
}: {
  active?: boolean;
  label?: string;
  payload?: { payload: SeriesRow }[];
  series: ChartSeries[];
  format: VizFormat;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{label ?? row.label}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        {series.map((s) => {
          const value = row[s.key];
          const count = s.countKey ? row[s.countKey] : null;
          return (
            <div key={s.key} className="contents">
              <dt className="text-muted-foreground">{s.name}</dt>
              <dd>
                {fmtValue(typeof value === "number" ? value : null, format)}
                {typeof count === "number" && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({fmtNumber(count)})
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function GroupedBarsChart({
  rows,
  series,
  format = "percent",
  horizontal = false,
  stacked = false,
  categoryWidth = 130,
}: {
  rows: SeriesRow[];
  series: ChartSeries[];
  format?: VizFormat;
  horizontal?: boolean;
  stacked?: boolean;
  categoryWidth?: number;
}) {
  if (rows.length === 0 || series.length === 0) return <EmptyViz />;
  const perRow = stacked ? 26 : series.length * 14 + 12;
  const height = horizontal
    ? Math.max(rows.length * perRow + 48, 160)
    : 256;
  const tickFmt = axisFormatter(format);
  const domain =
    stacked && format === "percent" ? ([0, 1] as [number, number]) : undefined;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart
          data={rows}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          {horizontal ? (
            <XAxis
              type="number"
              tick={CHART_TICK}
              tickFormatter={tickFmt}
              domain={domain}
            />
          ) : (
            <XAxis dataKey="label" tick={CHART_TICK} interval={0} />
          )}
          {horizontal ? (
            <YAxis
              type="category"
              dataKey="label"
              tick={CHART_TICK}
              width={categoryWidth}
              interval={0}
            />
          ) : (
            <YAxis
              tick={CHART_TICK}
              tickFormatter={tickFmt}
              width={48}
              domain={domain}
            />
          )}
          <Tooltip
            content={<SeriesTooltip series={series} format={format} />}
            cursor={CHART_CURSOR}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => {
            const isLast = i === series.length - 1;
            const radius: [number, number, number, number] =
              stacked && !isLast
                ? [0, 0, 0, 0]
                : horizontal
                  ? [0, 3, 3, 0]
                  : [3, 3, 0, 0];
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                stackId={stacked ? "stack" : undefined}
                radius={radius}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
