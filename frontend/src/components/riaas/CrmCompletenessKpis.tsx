import type { CrmCompleteData } from "@/api/riaas";
import { fmtNumber, fmtPercent } from "@/lib/formatters";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function CrmCompletenessKpis({ data }: { data: CrmCompleteData }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total contacts" value={fmtNumber(data.total_contacts)} />
        <Stat label="Untitled" value={fmtNumber(data.untitled)} />
        <Stat label="% Untitled" value={fmtPercent(data.pct_untitled)} />
        <Stat label="Titled" value={fmtNumber(data.titled)} />
        <Stat label="Decision makers" value={fmtNumber(data.decision_makers)} />
        <Stat label="% DM of titled" value={fmtPercent(data.pct_dm_of_titled)} />
      </div>
      {data.note && (
        <p className="text-xs text-muted-foreground">{data.note}</p>
      )}
    </div>
  );
}
