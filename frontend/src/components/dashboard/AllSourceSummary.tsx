import {
  type ColumnDef,
  createColumnHelper,
} from "@tanstack/react-table";
import { ArrowDown } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import type {
  AllSourceSummaryRow,
  AllSourceSummarySpec,
  ColumnMeta,
} from "@/types/dashboard";
import { useFilters } from "@/hooks/useFilters";
import { COL_W, shortLabel } from "@/lib/columns";
import { sourceOrderIndex } from "@/lib/sections";
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

/**
 * Render a column header: a short scannable label on the table, with the
 * column's full registry name as the tooltip title and the human-readable
 * formula (description) as the body. `labelOverride` forces the on-table
 * label (used by grouped source columns, where the group header already
 * names the source).
 */
function withTooltip(
  meta: ColumnMeta | undefined,
  fallback: string,
  labelOverride?: string,
): ReactNode {
  const full = meta?.display_name || fallback;
  const label = labelOverride ?? (meta ? shortLabel(meta.col_id, full) : full);
  if (!meta) return label;
  return (
    <InfoTooltip
      title={full}
      description={meta.description || meta.aggregation || meta.col_id}
    >
      <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
        {label}
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

/**
 * Open-pipeline value with a shortfall marker. When `short`, the number turns
 * red AND shows a down-arrow + tooltip, so colorblind users still get the
 * signal (color-not-only).
 */
function ShortfallNumber({ value, short }: { value: number | null; short: boolean }) {
  return (
    <span
      title={short ? "Below the open pipeline needed to hit quota" : undefined}
      className={cn(
        "flex w-full items-center justify-end gap-1 px-1.5 py-0.5 text-right tabular-nums",
        short && "font-semibold text-red-600",
      )}
    >
      {short && <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />}
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
    // Each source's Bookings/Pipeline pair sits under one group header that
    // names the source, so the pair reads as a unit and the leaf headers stay
    // two words. Full registry names remain one hover away. Sort by the
    // canonical source order (keeping the original index `i` so the accessor
    // still reads the right cell from `r.sources`).
    const orderedSources = sources
      .map((s, i) => ({ s, i }))
      .sort((a, b) => sourceOrderIndex(a.s.label) - sourceOrderIndex(b.s.label));
    const sourceColumns = orderedSources.map(({ s, i }) =>
      helper.group({
        id: `src-${s.label}`,
        header: s.label,
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
            aggregationFn: "sum",
            meta: { aggregate: "sum", format: "currency", align: "right", width: COL_W.num },
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
            aggregationFn: "sum",
            meta: { aggregate: "sum", format: "currency", align: "right", width: COL_W.num },
          }),
        ],
      }),
    );

    return [
      helper.accessor("ae_name", {
        id: "ae",
        header: "AE Name",
        cell: (c) => (
          <button
            type="button"
            onClick={() => set({ aeDrillId: c.row.original.ae_id })}
            className={cn(
              "block w-full truncate text-left font-medium",
              c.row.original.ae_id
                ? "hover:underline"
                : "text-muted-foreground",
            )}
            disabled={!c.row.original.ae_id}
            title={c.getValue() as string}
          >
            {c.getValue() as string}
          </button>
        ),
        enableColumnFilter: true,
        meta: { aggregate: "none", width: COL_W.ae },
      }),
      helper.accessor("ae_manager", {
        id: "manager",
        header: "AE Manager",
        cell: (c) => (
          <span className="block truncate text-muted-foreground" title={c.getValue() as string}>
            {c.getValue() as string}
          </span>
        ),
        enableColumnFilter: true,
        meta: { aggregate: "none", width: COL_W.manager },
      }),
      helper.accessor("quota", {
        id: "quota",
        header: () => withTooltip(metaById.get("S1-COL-F"), "Quota (MTD)"),
        cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
        sortingFn: numericSort,
        aggregationFn: "sum",
        meta: { aggregate: "sum", format: "currency", align: "right", width: COL_W.num },
      }),
      helper.accessor("total_bookings", {
        id: "total_bookings",
        header: () =>
          withTooltip(metaById.get("S1-COL-M"), "Bookings in time period"),
        cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
        sortingFn: numericSort,
        aggregationFn: "sum",
        meta: { aggregate: "sum", format: "currency", align: "right", width: COL_W.num },
      }),
      helper.accessor("open_pipeline", {
        id: "open_pipeline",
        header: () =>
          withTooltip(
            metaById.get("S1-COL-I"),
            "Open Pipeline with Current Month Close",
          ),
        cell: (c) => {
          const value = c.getValue() as number | null;
          const needed = c.row.original.open_pipeline_needed;
          // Red + down-arrow when open pipeline is short of what's needed to hit
          // quota. The arrow keeps the meaning legible without relying on color.
          const short = value != null && needed != null && value < needed;
          return (
            <ShortfallNumber value={value} short={short} />
          );
        },
        sortingFn: numericSort,
        aggregationFn: "sum",
        meta: { aggregate: "sum", format: "currency", align: "right", width: COL_W.num },
      }),
      helper.accessor("open_pipeline_needed", {
        id: "open_pipeline_needed",
        header: () =>
          withTooltip(
            metaById.get("S1-COL-O"),
            "Open Pipeline Needed to Quota with Current Month Close",
          ),
        cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
        sortingFn: numericSort,
        aggregationFn: "sum",
        meta: { aggregate: "sum", format: "currency", align: "right", width: COL_W.num },
      }),
      helper.accessor("total_pipeline", {
        id: "total_pipeline",
        header: () =>
          withTooltip(metaById.get("S1-COL-L"), "Pipeline generated in time period"),
        cell: (c) => <PlainNumber value={c.getValue() as number | null} />,
        sortingFn: numericSort,
        aggregationFn: "sum",
        meta: { aggregate: "sum", format: "currency", align: "right", width: COL_W.num },
      }),
      ...sourceColumns,
    ];
  }, [sources, metaById, set]);

  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">All Source Summary</h2>
        <p className="text-xs text-muted-foreground">
          Grand Total and per-Manager subtotals; expand a manager to see their
          AEs. Totals first, then split-credited Pipeline $ and Bookings $ by source.
        </p>
      </header>
      <DataTable
        data={rows}
        columns={columns}
        emptyMessage="No AEs match the current filters."
        enableGlobalSearch={rows.length > 10}
        enableColumnFilters={false}
        stickyFirstColumn
        exportFilename="all-source-summary"
        groupBy="manager"
        tableId="summary"
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
