import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_GRID, CHART_TICK } from "./chartTheme";
import {
  type ChartSeries,
  SeriesTooltip,
  type SeriesRow,
} from "./GroupedBarsChart";
import { axisFormatter, EmptyViz, type VizFormat } from "./vizPrimitives";

/** One line per series across labeled x buckets (e.g. win rate by age band). */
export function BandLinesChart({
  rows,
  series,
  format = "percent",
}: {
  rows: SeriesRow[];
  series: ChartSeries[];
  format?: VizFormat;
}) {
  if (rows.length === 0 || series.length === 0) return <EmptyViz />;
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="label" tick={CHART_TICK} interval={0} />
          <YAxis
            tick={CHART_TICK}
            tickFormatter={axisFormatter(format)}
            width={44}
          />
          <Tooltip content={<SeriesTooltip series={series} format={format} />} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
