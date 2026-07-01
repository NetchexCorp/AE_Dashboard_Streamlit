import type {
  ChapterAnalysis,
  CrmCompleteData,
  RpsQuarter,
  TerritoryEffData,
  VelocityQuarter,
} from "@/api/riaas";
import { cn } from "@/lib/cn";
import { CrmCompletenessKpis } from "./CrmCompletenessKpis";
import { RpsTrendChart } from "./RpsTrendChart";
import { TerritoryEfficiencyChart } from "./TerritoryEfficiencyChart";
import { VelocityTrendChart } from "./VelocityTrendChart";

function StatusBadge({ status }: { status: ChapterAnalysis["status"] }) {
  if (status === "ok") return null;
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        status === "pending"
          ? "border-yellow-300 bg-yellow-50 text-yellow-900"
          : "border-red-300 bg-red-50 text-red-900",
      )}
    >
      {status === "pending" ? "Pending" : "Error"}
    </span>
  );
}

function AnalysisViz({ analysis }: { analysis: ChapterAnalysis }) {
  const data = analysis.data;
  if (!data) return null;
  switch (analysis.analysis_id) {
    case "C1-CRM-COMPLETE":
      return <CrmCompletenessKpis data={data as unknown as CrmCompleteData} />;
    case "C1-VELOCITY-NB":
    case "C1-VELOCITY-EXP":
      return (
        <VelocityTrendChart
          quarters={(data.quarters ?? []) as VelocityQuarter[]}
        />
      );
    case "C1-RPS-NB":
    case "C1-RPS-EXP":
      return <RpsTrendChart quarters={(data.quarters ?? []) as RpsQuarter[]} />;
    case "C1-TERR-EFF-GAP":
      return (
        <TerritoryEfficiencyChart data={data as unknown as TerritoryEffData} />
      );
    default:
      return (
        <p className="text-sm text-muted-foreground">
          No chart renderer for this analysis yet.
        </p>
      );
  }
}

export function AnalysisCard({
  analysis,
  className,
}: {
  analysis: ChapterAnalysis;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-background p-4", className)}
    >
      <header className="mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{analysis.title}</h3>
          <StatusBadge status={analysis.status} />
          <code className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            {analysis.analysis_id}
          </code>
        </div>
        {analysis.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {analysis.description}
          </p>
        )}
      </header>

      {analysis.status === "ok" && <AnalysisViz analysis={analysis} />}
      {analysis.status === "pending" && (
        <p className="rounded-md border border-yellow-200 bg-yellow-50/60 px-3 py-2 text-xs text-yellow-900">
          {analysis.reason || "This analysis is not available yet."}
        </p>
      )}
      {analysis.status === "error" && (
        <p className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-900">
          {analysis.error || "This analysis failed to compute."}
        </p>
      )}

      {analysis.formula && (
        <p className="mt-3 border-t border-border/60 pt-2 font-mono text-[10px] text-muted-foreground">
          {analysis.formula}
        </p>
      )}
    </section>
  );
}
