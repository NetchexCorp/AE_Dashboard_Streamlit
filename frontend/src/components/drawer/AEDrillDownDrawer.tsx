import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { ArrowDown, GraduationCap, X } from "lucide-react";
import { useFilters } from "@/hooks/useFilters";
import { useMe } from "@/hooks/useMe";
import { useAeDetail, useColumnMeta } from "@/hooks/useDashboard";
import { fmt } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  MOTION_COLS,
  OPEN_PIPELINE_COL,
  OPEN_PIPELINE_NEEDED_COL,
} from "@/lib/columns";
import {
  orderedSectionColumns,
  sectionOrderIndex,
  sourceOrderIndex,
} from "@/lib/sections";

export function AEDrillDownDrawer() {
  const { filters, set } = useFilters();
  const me = useMe();
  const riaas = me.data?.features?.riaas === true;
  const cols = useColumnMeta();
  const detail = useAeDetail(filters.aeDrillId, filters);
  const open = !!filters.aeDrillId;

  const close = (): void => {
    set({ aeDrillId: null });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? null : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto bg-background shadow-2xl sm:w-[640px] lg:w-[840px]"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {detail.data?.ae_name ?? "Loading…"}
              </Dialog.Title>
              <Dialog.Description asChild>
                <div className="text-xs text-muted-foreground">
                  {detail.data ? (
                    <>
                      <div>
                        AE Manager: {detail.data.ae_manager || "—"} • {detail.data.ae_email}
                      </div>
                      <div>SDR: {detail.data.sdr_name || "—"}</div>
                    </>
                  ) : (
                    "Fetching AE detail"
                  )}
                </div>
              </Dialog.Description>
              {riaas && filters.aeDrillId && (
                <Link
                  to="/org/chapters/$slug"
                  params={{ slug: "coach" }}
                  search={{ seller: filters.aeDrillId }}
                  onClick={close}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                  Coaching insights for this AE →
                </Link>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6 px-4 py-4">
            {detail.isError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {(detail.error as Error).message}
              </div>
            )}

            {detail.data && (
              <>
                <section>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    Source Breakdown
                  </h3>
                  {(() => {
                    const ass = detail.data.all_source_summary;
                    const short =
                      ass.open_pipeline != null &&
                      ass.open_pipeline_needed != null &&
                      ass.open_pipeline < ass.open_pipeline_needed;
                    // Totals lead-in matches the summary table order:
                    // Quota → Bookings → Open Pipeline → Needed → Pipeline Gen.
                    const sortedSources = [...ass.sources].sort(
                      (a, b) => sourceOrderIndex(a.label) - sourceOrderIndex(b.label),
                    );
                    return (
                      <div className="space-y-1.5">
                        <TotalRow label="Quota (MTD)" value={ass.quota} />
                        <TotalRow
                          label="Bookings"
                          fullLabel="Bookings in time period"
                          value={ass.total_bookings}
                        />
                        <TotalRow
                          label="Open Pipeline"
                          fullLabel="Open Pipeline with Current Month Close"
                          value={ass.open_pipeline}
                          short={short}
                        />
                        <TotalRow
                          label="Pipeline Needed"
                          fullLabel="Open Pipeline Needed to Quota with Current Month Close"
                          value={ass.open_pipeline_needed}
                        />
                        <TotalRow
                          label="Pipeline Created"
                          fullLabel="Pipeline generated in time period"
                          value={ass.total_pipeline}
                        />
                        {sortedSources.map((s) => (
                          <div
                            key={s.label}
                            className="grid grid-cols-3 items-center rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{s.label}</span>
                            <span className="text-right tabular-nums">
                              <span className="text-xs text-muted-foreground">Bookings </span>
                              {fmt(s.bookings, "currency")}
                            </span>
                            <span className="text-right tabular-nums">
                              <span className="text-xs text-muted-foreground">Pipeline </span>
                              {fmt(s.pipeline, "currency")}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </section>

                {/* The other lens on the same bookings dollars: motion
                    (bookings type) instead of source. */}
                <section>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    Bookings by Motion
                  </h3>
                  <div className="grid grid-cols-3 gap-1.5">
                    {MOTION_COLS.map((m) => (
                      <div
                        key={m.colId}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {m.label}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums">
                          {fmt(detail.data.values[m.colId] ?? null, "currency")}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {cols.data && (
                  <section>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      Sections
                    </h3>
                    <div className="space-y-3">
                      {[...cols.data.sections]
                        .sort(
                          (a, b) =>
                            sectionOrderIndex(a.key) - sectionOrderIndex(b.key),
                        )
                        .map((sec) => {
                        const secCols = orderedSectionColumns(
                          cols.data!.columns,
                          sec.key,
                        );
                        return (
                          <details key={sec.key} className="rounded-md border border-border">
                            <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-accent">
                              {sec.display_name}
                            </summary>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-3 text-xs">
                              {secCols.map((c) => {
                                const value = detail.data!.values[c.col_id];
                                const needed =
                                  detail.data!.values[OPEN_PIPELINE_NEEDED_COL];
                                const short =
                                  c.col_id === OPEN_PIPELINE_COL &&
                                  value != null &&
                                  needed != null &&
                                  value < needed;
                                return (
                                  <div
                                    key={c.col_id}
                                    className="flex items-center justify-between border-b border-border/40 py-1"
                                  >
                                    <dt className="truncate text-muted-foreground" title={c.description}>
                                      {c.display_name}
                                    </dt>
                                    <dd
                                      className={cn(
                                        "tabular-nums",
                                        short && "font-semibold text-red-600",
                                      )}
                                    >
                                      {c.blocked ? "Pending" : fmt(value, c.format)}
                                    </dd>
                                  </div>
                                );
                              })}
                            </dl>
                          </details>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}

            {detail.isLoading && (
              <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                Loading AE detail…
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * One row in the drawer's Source Breakdown totals. When `short`, the value
 * turns red and shows a down-arrow + tooltip (color-not-only), matching the
 * shortfall cue used in the dashboard tables.
 */
function TotalRow({
  label,
  fullLabel,
  value,
  short = false,
}: {
  label: string;
  /** Full registry name, shown on hover when the visible label is shortened. */
  fullLabel?: string;
  value: number | null;
  short?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
      <span className="font-medium" title={fullLabel}>{label}</span>
      <span
        title={short ? "Below the open pipeline needed to hit quota" : undefined}
        className={cn(
          "flex items-center gap-1 tabular-nums",
          short && "font-semibold text-red-600",
        )}
      >
        {short && <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {fmt(value, "currency")}
      </span>
    </div>
  );
}
