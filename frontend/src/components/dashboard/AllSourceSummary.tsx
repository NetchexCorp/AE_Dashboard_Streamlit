import {
  type ColumnDef,
  createColumnHelper,
} from "@tanstack/react-table";
import { type ReactNode, useMemo } from "react";
import type {
  AllSourceSummaryRow,
  AllSourceSummarySpec,
  ColumnMeta,
} from "@/types/dashboard";
import { useFilters } from "@/hooks/useFilters";
import { fmt } from "@/lib/formatters";
import { DataTable } from "@/components/tables/DataTable";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/cn";

interface Props {
  rows: AllSourceSummaryRow[];
  sources: AllSourceSummarySpec[];
  /** Full column metadata — used to surface descriptions on the source
   *  Pipeline/Bookings sub-headers. */
  columnMeta?: ColumnMeta[];
}

function withTooltip(
  meta: ColumnMeta | undefined,
  fallback: string,
  node: ReactNode,
): ReactNode {
  if (!meta) return node;
  return (
    <InfoTooltip
      title={meta.display_name || fallback}
      description={meta.description || meta.aggregation || meta.col_id}
    >
      <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
        {node}
      </span>
    </InfoTooltip>
  );
}

const helper = createColumnHelper<AllSourceSummaryRow>();

function PlainNumber({ value }: { value: number | null }) {
  return (
    <span className="block w-full px-1.5 py-0.5 text-right tabular-nums">
      {fmt(value, "currency")}
    </span>
  );
}

export function AllSourceSummary({ rows, sources, columnMeta = [] }: Props) {
  const { set } = useFilters();
  const metaById = useMemo(() => {
    const m = new Map<string, ColumnMeta>();
    for (const c of columnMeta) m.set(c.col_id, c);
    return m;
  }, [columnMeta]);

  const columns = useMemo<ColumnDef<AllSourceSummaryRow, unknown>[]>(() => {
    // Per-source columns follow the headline order: Bookings, then Pipeline.
    const sourceGroups = sources.map((s, i) =>
      helper.group({
        id: `src-${s.label}`,
        header: () => <span className="text-foreground">{s.label}</span>,
        columns: [
          helper.accessor((r) => r.sources[i]?.bookings ?? null, {
            id: `${s.label}-b`,
            header: () =>
              withTooltip(
                metaById.get(s.bookings_col),
                `${s.label} Bookings`,
                "Bookings",
              ),
            cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
            sortingFn: numericSort,
          }),
          helper.accessor((r) => r.sources[i]?.pipeline ?? null, {
            id: `${s.label}-p`,
            header: () =>
              withTooltip(
                metaById.get(s.pipeline_col),
                `${s.label} Pipeline`,
                "Pipeline",
              ),
            cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
            sortingFn: numericSort,
          }),
        ],
      }),
    );

    return [
      helper.accessor("ae_name", {
        id: "ae",
        header: "AE",
        cell: (c) => (
          <button
            type="button"
            onClick={() => set({ aeDrillId: c.row.original.ae_id })}
            className={cn(
              "text-left font-medium",
              c.row.original.ae_id
                ? "hover:underline"
                : "text-muted-foreground",
            )}
            disabled={!c.row.original.ae_id}
            title={c.row.original.ae_id ? "Open AE drill-down" : "No AE id"}
          >
            {c.getValue() as string}
          </button>
        ),
        enableColumnFilter: true,
      }),
      helper.accessor("ae_manager", {
        id: "manager",
        header: "Manager",
        cell: (c) => <span className="text-muted-foreground">{c.getValue() as string}</span>,
        enableColumnFilter: true,
      }),
      helper.group({
        id: "totals",
        header: () => <span className="text-foreground">Totals (Period)</span>,
        columns: [
          helper.accessor("total_bookings", {
            id: "total_bookings",
            header: () =>
              withTooltip(
                metaById.get("S1-COL-M"),
                "Bookings in time period",
                "Bookings in time period",
              ),
            cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
            sortingFn: numericSort,
          }),
          helper.accessor("open_pipeline", {
            id: "open_pipeline",
            header: () =>
              withTooltip(
                metaById.get("S1-COL-I"),
                "Open Pipeline with Current Month Close",
                "Open Pipeline with Current Month Close",
              ),
            cell: (c) => {
              const value = c.getValue() as number | null;
              const needed = c.row.original.open_pipeline_needed;
              // Red when open pipeline is short of what's needed to hit quota.
              const short = value != null && needed != null && value < needed;
              return (
                <span
                  className={cn(
                    "block w-full px-1.5 py-0.5 text-right tabular-nums",
                    short && "font-semibold text-red-600",
                  )}
                >
                  {fmt(value, "currency")}
                </span>
              );
            },
            sortingFn: numericSort,
          }),
          helper.accessor("total_pipeline", {
            id: "total_pipeline",
            header: () =>
              withTooltip(
                metaById.get("S1-COL-L"),
                "Pipeline generated in time period",
                "Pipeline generated in time period",
              ),
            cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
            sortingFn: numericSort,
          }),
        ],
      }),
      ...sourceGroups,
    ];
  }, [sources, metaById, set]);

  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">All Source Summary</h2>
        <p className="text-xs text-muted-foreground">
          Totals first, then split-credited Pipeline $ and Bookings $ by source.
        </p>
      </header>
      <DataTable
        data={rows}
        columns={columns}
        emptyMessage="No AEs match the current filters."
        enableGlobalSearch
        enableColumnFilters={false}
        pageSizes={[10, 25, 50, 100]}
        initialPageSize={25}
        stickyFirstColumn
        exportFilename="all-source-summary"
      />
    </section>
  );
}

function numericSort(rowA: { getValue: (id: string) => unknown }, rowB: { getValue: (id: string) => unknown }, colId: string) {
  const a = rowA.getValue(colId) as number | null;
  const b = rowB.getValue(colId) as number | null;
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a - b;
}
