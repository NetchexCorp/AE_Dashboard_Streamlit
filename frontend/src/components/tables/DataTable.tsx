import {
  type Cell,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type GroupingState,
  type Header,
  type Row,
  type RowData,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FormatHint } from "@/types/dashboard";
import { downloadCsv } from "@/lib/csv";
import { fmt } from "@/lib/formatters";
import { cn } from "@/lib/cn";

// Per-column aggregation contract for grouped tables (Manager subtotals +
// Grand Total). Currency/number columns sum; percent columns must NOT be
// summed — they render "—" in subtotal/total rows.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    aggregate?: "sum" | "none";
    format?: FormatHint;
    align?: "left" | "right";
    /** Fixed column width (any CSS length, e.g. "7.5rem"). When any column
     *  sets this, the table switches to a fixed layout with a <colgroup> so
     *  widths are honored and long headers wrap instead of stretching. */
    width?: string;
  }
}

interface Props<TRow> {
  data: TRow[];
  columns: ColumnDef<TRow, unknown>[];
  /** Empty-state label. */
  emptyMessage?: string;
  /** Show a single global-search box across all visible cells. */
  enableGlobalSearch?: boolean;
  /** Show per-column text-filter inputs in a row below the header. */
  enableColumnFilters?: boolean;
  /** Page-size options. Set [] to disable pagination. */
  pageSizes?: number[];
  /** Initial page size; first entry of pageSizes by default. */
  initialPageSize?: number;
  /** Pin first column on horizontal scroll. */
  stickyFirstColumn?: boolean;
  /** When false, hide the Export CSV button (default true). */
  enableExport?: boolean;
  /** Base filename for export, without extension. */
  exportFilename?: string;
  /**
   * Column id to group rows by (e.g. "manager"). When set, renders one
   * collapsible subtotal row per group plus a pinned Grand Total row, using
   * each column's `meta.aggregate` rule. Pagination is disabled while grouped.
   */
  groupBy?: string;
  /** Expand all groups on first render (default true). */
  defaultExpandedAll?: boolean;
  /** Label for the Grand Total row (default "Grand Total"). */
  grandTotalLabel?: string;
  /** Render the leaf-count suffix on group rows (default `${n} AEs`). */
  groupCountLabel?: (count: number) => string;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function DataTable<TRow>({
  data,
  columns,
  emptyMessage = "No rows.",
  enableGlobalSearch = true,
  enableColumnFilters = false,
  pageSizes = DEFAULT_PAGE_SIZES,
  initialPageSize,
  stickyFirstColumn = true,
  enableExport = true,
  exportFilename = "export",
  groupBy,
  defaultExpandedAll = true,
  grandTotalLabel = "Grand Total",
  groupCountLabel = (n) => `${n} AE${n === 1 ? "" : "s"}`,
}: Props<TRow>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const grouped = Boolean(groupBy);
  const [grouping, setGrouping] = useState<GroupingState>(groupBy ? [groupBy] : []);
  const [expanded, setExpanded] = useState<ExpandedState>(
    grouped && defaultExpandedAll ? true : {},
  );

  // Grouping replaces the per-row paging contract with subtotal/total rows, so
  // pagination is turned off while grouped (manager + AE counts stay small).
  const paginationEnabled = pageSizes.length > 0 && !grouped;

  const table = useReactTable<TRow>({
    data,
    columns,
    state: { globalFilter, sorting, columnFilters, grouping, expanded },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: grouped ? getGroupedRowModel() : undefined,
    getExpandedRowModel: grouped ? getExpandedRowModel() : undefined,
    getPaginationRowModel: paginationEnabled ? getPaginationRowModel() : undefined,
    groupedColumnMode: false,
    autoResetExpanded: false,
    initialState: paginationEnabled
      ? { pagination: { pageIndex: 0, pageSize: initialPageSize ?? pageSizes[0] } }
      : undefined,
  });

  const leafColumns = table.getVisibleLeafColumns();
  const colCount = leafColumns.length;
  const hasWidths = leafColumns.some((c) => Boolean(c.columnDef.meta?.width));
  const totalRows = table.getFilteredRowModel().rows.length;

  // Grand Total: sum each summable column over the filtered AE (leaf) rows,
  // independent of grouping/expansion. Null-safe to match `number | null` data.
  const grandTotals = useMemo<Record<string, number> | null>(() => {
    if (!grouped) return null;
    const leaves = table
      .getFilteredRowModel()
      .flatRows.filter((r) => !r.getIsGrouped());
    const totals: Record<string, number> = {};
    for (const col of table.getVisibleLeafColumns()) {
      if (col.columnDef.meta?.aggregate !== "sum") continue;
      totals[col.id] = leaves.reduce((s, r) => {
        const v = r.getValue(col.id);
        return s + (typeof v === "number" ? v : 0);
      }, 0);
    }
    return totals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, table, globalFilter, columnFilters, data]);

  const handleExport = (): void => {
    const leaves = table.getVisibleLeafColumns();
    const headers = leaves.map((c) => headerLabel(c.id, c));
    const rows = table
      .getFilteredRowModel()
      .rows.filter((row) => !row.getIsGrouped())
      .map((row) => {
      const out: Record<string, unknown> = {};
      for (let i = 0; i < leaves.length; i++) {
        const col = leaves[i];
        const cell = row.getAllCells().find((cl) => cl.column.id === col.id);
        out[headers[i]] = cellExportValue(cell, row);
      }
      return out;
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`${exportFilename}-${stamp}.csv`, rows, headers);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {enableGlobalSearch && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search rows…"
                className="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {totalRows} row{totalRows === 1 ? "" : "s"}
            </span>
          </>
        )}
        {enableExport && totalRows > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-accent"
            title="Download the filtered rows as CSV (opens in Excel)"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      <div className="max-w-full overflow-x-auto overflow-y-visible rounded-md border border-border">
        <table
          className={cn(
            "w-max min-w-full border-separate border-spacing-0 text-sm",
            hasWidths && "table-fixed",
          )}
        >
          {hasWidths && (
            <colgroup>
              {leafColumns.map((c) => (
                <col
                  key={c.id}
                  style={c.columnDef.meta?.width ? { width: c.columnDef.meta.width } : undefined}
                />
              ))}
            </colgroup>
          )}
          <thead className="sticky top-0 z-20 bg-muted/70 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header, idx) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const sticky = stickyFirstColumn && idx === 0;
                  const alignRight = header.column.columnDef.meta?.align === "right";
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        "border-b border-border px-2 py-2 align-bottom text-xs font-medium text-muted-foreground",
                        hasWidths ? "whitespace-normal break-words" : "whitespace-nowrap",
                        alignRight ? "text-right" : "text-left",
                        sticky && "sticky left-0 z-30 bg-muted/70",
                        canSort && "cursor-pointer select-none",
                      )}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            alignRight && "justify-end",
                          )}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {canSort &&
                            (sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : sortDir === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 text-muted-foreground/40" />
                            ))}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
            {enableColumnFilters && (
              <tr>
                {table.getVisibleLeafColumns().map((col, idx) => {
                  const sticky = stickyFirstColumn && idx === 0;
                  return (
                    <th
                      key={`${col.id}-filter`}
                      className={cn(
                        "border-b border-border px-2 py-1",
                        sticky && "sticky left-0 z-30 bg-muted/70",
                      )}
                    >
                      {col.getCanFilter() ? (
                        <input
                          value={(col.getFilterValue() as string) ?? ""}
                          onChange={(e) => col.setFilterValue(e.target.value)}
                          placeholder="filter…"
                          className="h-6 w-full rounded border border-border bg-background px-1 text-xs"
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {grouped && grandTotals && totalRows > 0 && (
              <tr className="border-t border-border bg-muted/80 font-semibold">
                {table.getVisibleLeafColumns().map((col, idx) => {
                  const sticky = stickyFirstColumn && idx === 0;
                  if (idx === 0) {
                    return (
                      <td
                        key={col.id}
                        className={cn(
                          "whitespace-nowrap px-2 py-1.5 text-sm",
                        hasWidths && "overflow-hidden",
                          sticky && "sticky left-0 z-10 bg-muted/80",
                        )}
                      >
                        <button
                          type="button"
                          onClick={table.getToggleAllRowsExpandedHandler()}
                          className="inline-flex items-center gap-1"
                          title={
                            table.getIsAllRowsExpanded()
                              ? "Collapse all"
                              : "Expand all"
                          }
                        >
                          {table.getIsAllRowsExpanded() ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          <span>{grandTotalLabel}</span>
                        </button>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.id}
                      className={cn(
                        "whitespace-nowrap px-2 py-1.5 text-sm",
                        hasWidths && "overflow-hidden",
                        sticky && "sticky left-0 z-10 bg-muted/80",
                      )}
                    >
                      <AggregateCell
                        meta={col.columnDef.meta}
                        value={grandTotals[col.id] ?? null}
                      />
                    </td>
                  );
                })}
              </tr>
            )}
            {table.getRowModel().rows.map((row) => {
              const isGroup = row.getIsGrouped();
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t border-border",
                    isGroup && "bg-muted/40 font-medium",
                  )}
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const sticky = stickyFirstColumn && idx === 0;
                    const stickyBg = isGroup ? "bg-muted/40" : "bg-background";

                    // Group (Manager) header cell: chevron + label + AE count.
                    if (isGroup && idx === 0) {
                      const raw = groupBy
                        ? row.getGroupingValue(groupBy)
                        : null;
                      const label =
                        raw == null || raw === "" ? "(none)" : String(raw);
                      const count = row.getLeafRows().length;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "whitespace-nowrap px-2 py-1.5 text-sm",
                        hasWidths && "overflow-hidden",
                            sticky && `sticky left-0 z-10 ${stickyBg}`,
                          )}
                          style={{ paddingLeft: 8 + row.depth * 16 }}
                        >
                          <button
                            type="button"
                            onClick={row.getToggleExpandedHandler()}
                            className="inline-flex items-center gap-1"
                          >
                            {row.getIsExpanded() ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <span>{label}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              — {groupCountLabel(count)}
                            </span>
                          </button>
                        </td>
                      );
                    }

                    // Other cells of a group row: aggregated value or "—".
                    if (isGroup) {
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "whitespace-nowrap px-2 py-1.5 text-sm",
                        hasWidths && "overflow-hidden",
                            sticky && `sticky left-0 z-10 ${stickyBg}`,
                          )}
                        >
                          <AggregateCell
                            meta={cell.column.columnDef.meta}
                            value={
                              cell.getIsAggregated()
                                ? (cell.getValue() as number | null)
                                : null
                            }
                          />
                        </td>
                      );
                    }

                    // Leaf (AE) row: unchanged cell, indented under its group.
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "whitespace-nowrap px-2 py-1.5 text-sm",
                        hasWidths && "overflow-hidden",
                          sticky && "sticky left-0 z-10 bg-background",
                        )}
                        style={
                          idx === 0 && grouped
                            ? { paddingLeft: 8 + row.depth * 16 }
                            : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {paginationEnabled && totalRows > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-7 rounded-md border border-border bg-background px-1"
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
            </span>
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 rounded-md border border-border bg-background px-2 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 rounded-md border border-border bg-background px-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A subtotal / grand-total cell. Sums render right-aligned via `fmt`; any
 * non-summable column (text, percent) shows an em-dash so percentages are
 * never added together.
 */
function AggregateCell({
  meta,
  value,
}: {
  meta: { aggregate?: "sum" | "none"; format?: FormatHint } | undefined;
  value: number | null;
}) {
  if (meta?.aggregate !== "sum" || value == null) {
    return <span className="block text-right text-muted-foreground">—</span>;
  }
  return (
    <span className="block w-full px-1.5 py-0.5 text-right tabular-nums">
      {fmt(value, meta.format ?? "number")}
    </span>
  );
}

/** Render the header for export — prefers a string header from the def. */
function headerLabel<TRow>(fallback: string, col: { columnDef: ColumnDef<TRow, unknown> }): string {
  const h = col.columnDef.header;
  if (typeof h === "string") return h;
  // For function headers (React nodes), we can't render synchronously to a
  // string outside the table render cycle. Fall back to the column id.
  return fallback;
}

function cellExportValue<TRow>(
  cell: Cell<TRow, unknown> | undefined,
  _row: Row<TRow>,
): unknown {
  if (!cell) return "";
  const v = cell.getValue();
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
    return v;
  }
  return String(v);
}

// Re-export Header type symbol so consumers can type column ids if needed.
export type { Header };
