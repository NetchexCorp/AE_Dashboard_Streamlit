import type { KpiValue } from "@/types/dashboard";
import { fmt } from "@/lib/formatters";
import { cn } from "@/lib/cn";

export function KpiCard({ kpi, danger = false }: { kpi: KpiValue; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {kpi.display_name}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          danger && "text-red-600",
        )}
      >
        {fmt(kpi.value, kpi.format)}
      </div>
    </div>
  );
}
