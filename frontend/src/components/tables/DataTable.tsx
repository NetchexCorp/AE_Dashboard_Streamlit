import {
  type Cell,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ExpandedState,
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
  RotateCcw,
  Rows3,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTableStore } from "@/stores/tableStore";
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
   * Column id to group rows by (e.g. "manager"). When set, a "Group by …"
   * toggle is shown; while on, renders one collapsible subtotal row per group
   * plus a pinned Grand Total row using each column's `meta.aggregate` rule
   * (pagination off). While off, the rows are a flat, sortable, paginated list.
   */
  groupBy?: string;
  /** Label for the grouping toggle (default "Group by manager"). */
  groupToggleLabel?: string;
  /** Expand all groups on first render (default true). */
  defaultExpandedAll?: boolean;
  /** Label for the Grand Total row (default "Grand Total"). */
  grandTotalLabel?: string;
  /** Render the leaf-count suffix on group rows (default `${n} AEs`). */
  groupCountLabel?: (count: number) => string;
  /**
   * Stable id used to persist column order, sort, and the grouping toggle to
   * the browser. When set, headers become drag-reorderable and a reset control
   * appears once the layout is customized.
   */
  tableId?: string;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

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
  groupToggleLabel = "Group by manager",
  defaultExpandedAll = true,
  grandTotalLabel = "Grand Total",
  groupCountLabel = (n) => `${n} AE${n === 1 ? "" : "s"}`,
  tableId,
}: Props<TRow>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Persisted per-table view prefs (column order / sort / grouping toggle).
  const prefs = useTableStore((s) => (tableId ? s.prefs[tableId] : undefined));
  const setPrefs = useTableStore((s) => s.setPrefs);

  const [sorting, setSorting] = useState<SortingState>(() => prefs?.sorting ?? []);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    () => prefs?.columnOrder ?? [],
  );

  const canGroup = Boolean(groupBy);
  // Manager-grouping toggle: persisted choice, falling back to "on" when the
  // table supports grouping.
  const [groupedToggle, setGroupedToggle] = useState<boolean>(
    () => prefs?.grouped ?? true,
  );
  const grouped = canGroup && groupedToggle;
  const grouping = useMemo(
    () => (grouped && groupBy ? [groupBy] : []),
    [grouped, groupBy],
  );
  const [expanded, setExpanded] = useState<ExpandedState>(
    canGroup && defaultExpandedAll ? true : {},
  );

  // Grouping replaces the per-row paging contract with subtotal/total rows, so
  // pagination is turned off while grouped (manager + AE counts stay small).
  const paginationEnabled = pageSizes.length > 0 && !grouped;

  // Persist view prefs AFTER render. This must NOT happen inside a state
  // updater — writing to the store mid-render updates a subscribed component
  // while another is rendering, which sends React into an update loop.
  const firstSync = useRef(true);
  useEffect(() => {
    if (!tableId) return;
    if (firstSync.current) {
      firstSync.current = false;
      return; // skip the initial hydrated values
    }
    setPrefs(tableId, { sorting, columnOrder, grouped: groupedToggle });
  }, [tableId, setPrefs, sorting, columnOrder, groupedToggle]);

  const toggleGrouping = () => setGroupedToggle((g) => !g);

  const table = useReactTable<TRow>({
    data,
    columns,
    state: { globalFilter, sorting, columnFilters, grouping, expanded, columnOrder },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrder,
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
      ? {
          pagination: {
            pageIndex: 0,
            pageSize:
              initialPageSize ??
              (pageSizes.includes(DEFAULT_PAGE_SIZE) ? DEFAULT_PAGE_SIZE : pageSizes[0]),
          },
        }
      : undefined,
  });

  // Column drag-reorder (native HTML5 DnD). Reordering operates on the full
  // leaf-column id list so TanStack keeps every column; only `tableId` tables
  // opt in. The sticky first column stays put as an anchor.
  const enableReorder = Boolean(tableId);
  const dragColId = useRef<string | null>(null);

  const reorderColumn = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const base =
      columnOrder.length > 0
        ? columnOrder
        : table.getAllLeafColumns().map((c) => c.id);
    const next = base.slice();
    const from = next.indexOf(fromId);
    const to = next.indexOf(toId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    setColumnOrder(next);
  };

  const layoutCustomized = columnOrder.length > 0 || sorting.length > 0;
  const handleResetLayout = () => {
    setColumnOrder([]);
    setSorting([]);
  };

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
        {canGroup && (
          <button
            type="button"
            onClick={toggleGrouping}
            aria-pressed={grouped}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              grouped
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-accent",
            )}
            title={
              grouped
                ? `Grouped — click to ungroup and sort all AEs flat`
                : `Click to group rows by manager`
            }
          >
            <Rows3 className="h-3.5 w-3.5" />
            {groupToggleLabel}
          </button>
        )}
        {enableReorder && layoutCustomized && (
          <button
            type="button"
            onClick={handleResetLayout}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="Reset column order and sort to defaults"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset layout
          </button>
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
                  const toggleSort = header.column.getToggleSortingHandler();
                  // Draggable for reorder, except the sticky anchor column and
                  // placeholder header cells.
                  const draggable =
                    enableReorder && !sticky && !header.isPlaceholder;
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      draggable={draggable || undefined}
                      onDragStart={
                        draggable
                          ? () => {
                              dragColId.current = header.column.id;
                            }
                          : undefined
                      }
                      onDragOver={
                        draggable ? (e) => e.preventDefault() : undefined
                      }
                      onDrop={
                        draggable
                          ? (e) => {
                              e.preventDefault();
                              if (dragColId.current) {
                                reorderColumn(dragColId.current, header.column.id);
                              }
                              dragColId.current = null;
                            }
                          : undefined
                      }
                      onDragEnd={
                        draggable
                          ? () => {
                              dragColId.current = null;
                            }
                          : undefined
                      }
                      title={draggable ? "Drag to reorder column" : undefined}
                      aria-sort={
                        !canSort
                          ? undefined
                          : sortDir === "asc"
                            ? "ascending"
                            : sortDir === "desc"
                              ? "descending"
                              : "none"
                      }
                      tabIndex={canSort ? 0 : undefined}
                      className={cn(
                        "border-b border-border px-2 py-2 align-bottom text-xs font-medium text-muted-foreground",
                        hasWidths ? "whitespace-normal break-words" : "whitespace-nowrap",
                        alignRight ? "text-right" : "text-left",
                        sticky && "sticky left-0 z-30 bg-muted/70",
                        canSort &&
                          "cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      )}
                      onClick={canSort ? toggleSort : undefined}
                      onKeyDown={
                        canSort
                          ? (e) => {
                              // Enter/Space toggle sort so the column is fully
                              // keyboard-operable (header is focusable above).
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleSort?.(e);
                              }
                            }
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
