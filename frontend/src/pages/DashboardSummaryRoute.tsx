import { lazy, Suspense } from "react";
import { AllSourceSummary } from "@/components/dashboard/AllSourceSummary";
import { useColumnMeta, useDashboard } from "@/hooks/useDashboard";
import { useFilters } from "@/hooks/useFilters";

// Charts render below the table they explain (they were previously a separate
// "Charts" page); lazy so recharts stays out of the initial bundle.
const BookingsBarChart = lazy(() =>
  import("@/components/dashboard/BookingsBarChart").then((m) => ({
    default: m.BookingsBarChart,
  })),
);
const AttainmentBarChart = lazy(() =>
  import("@/components/dashboard/AttainmentBarChart").then((m) => ({
    default: m.AttainmentBarChart,
  })),
);

export function DashboardSummaryRoute() {
  const { filters } = useFilters();
  const cols = useColumnMeta();
  const dash = useDashboard(filters);

  if (dash.isLoading || cols.isLoading) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        Loading summary…
      </div>
    );
  }

  if (!dash.data || !cols.data) return null;

  return (
    <div className="space-y-4">
      <AllSourceSummary
        rows={dash.data.all_source_summary}
        sources={cols.data.all_source_summary}
        columnMeta={cols.data.columns}
      />
      {dash.data.rows.length > 0 && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Suspense
            fallback={
              <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
                Loading bookings chart…
              </div>
            }
          >
            <BookingsBarChart rows={dash.data.rows} />
          </Suspense>
          <Suspense
            fallback={
              <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
                Loading attainment chart…
              </div>
            }
          >
            <AttainmentBarChart rows={dash.data.rows} />
          </Suspense>
        </section>
      )}
    </div>
  );
}
