import { fmtNumber, fmtPercent } from "@/lib/formatters";
import { CHART_BAR } from "./chartTheme";
import { EmptyViz } from "./vizPrimitives";

export interface FunnelStage {
  stage: string;
  reached: number;
  converted: number;
  conversion_rate: number | null;
  slip_rate: number | null;
  median_days_in_stage: number | null;
}

/** Centered funnel bars with conversion / slip / duration annotations. */
export function FunnelStages({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) return <EmptyViz />;
  const max = Math.max(...stages.map((s) => s.reached), 1);
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <div key={s.stage}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
            <span className="font-medium">{s.stage}</span>
            <span className="tabular-nums text-muted-foreground">
              {fmtNumber(s.reached)} reached · {fmtPercent(s.conversion_rate)}{" "}
              convert · {fmtPercent(s.slip_rate)} slip ·{" "}
              {s.median_days_in_stage != null
                ? `${fmtNumber(s.median_days_in_stage)}d median`
                : "— median"}
            </span>
          </div>
          <div className="mt-1">
            <div
              className="mx-auto h-5 rounded"
              style={{
                width: `${Math.max((s.reached / max) * 100, 2)}%`,
                background: CHART_BAR,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
