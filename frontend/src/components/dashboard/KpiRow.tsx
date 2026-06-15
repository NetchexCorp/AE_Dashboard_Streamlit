import type { KpiValue } from "@/types/dashboard";
import { OPEN_PIPELINE_COL } from "@/lib/columns";
import { KpiCard } from "./KpiCard";

interface Props {
  row1: KpiValue[];
  row2: KpiValue[];
}

export function KpiRow({ row1, row2 }: Props) {
  // Open pipeline needed to quota = (Quota MTD − Bookings MTD) × 3, floored at 0.
  const quotaMtd = row1.find((k) => k.col_id === "S1-COL-F")?.value ?? null;
  const bookingsMtd = row1.find((k) => k.col_id === "S1-COL-G")?.value ?? null;
  const openPipeNeeded =
    quotaMtd != null && bookingsMtd != null
      ? Math.max(0, (quotaMtd - bookingsMtd) * 3)
      : null;

  const isShort = (k: KpiValue): boolean =>
    k.col_id === OPEN_PIPELINE_COL &&
    k.value != null &&
    openPipeNeeded != null &&
    k.value < openPipeNeeded;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Key Performance Indicators
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {row1.map((k) => (
          <KpiCard key={`r1-${k.col_id}`} kpi={k} danger={isShort(k)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {row2.map((k) => (
          <KpiCard key={`r2-${k.col_id}`} kpi={k} danger={isShort(k)} />
        ))}
      </div>
    </section>
  );
}
