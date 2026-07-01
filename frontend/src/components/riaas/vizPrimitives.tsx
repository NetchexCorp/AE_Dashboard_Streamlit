import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
import { cn } from "@/lib/cn";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/formatters";

export type VizFormat =
  | "percent"
  | "currency"
  | "number"
  | "days"
  | "ratio"
  | "perDay";

export function fmtValue(
  v: number | null | undefined,
  format: VizFormat,
): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "percent":
      return fmtPercent(v);
    case "currency":
      return fmtCurrency(v);
    case "days":
      return `${fmtNumber(v)}d`;
    case "ratio":
      return `${v.toFixed(1)}×`;
    case "perDay":
      return `${fmtCurrency(v)}/day`;
    default:
      return fmtNumber(v);
  }
}

export function axisFormatter(format: VizFormat): (v: number) => string {
  if (format === "percent") return (v) => `${Math.round(v * 100)}%`;
  if (format === "currency" || format === "perDay")
    return (v) => fmtCurrency(v);
  return (v) => String(v);
}

interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}

/**
 * Single-line, ellipsized category tick for horizontal bar charts. Recharts'
 * default tick word-wraps long labels into overlapping lines; this keeps one
 * line per bar and exposes the full label as a native hover title.
 */
export function makeCategoryTick(axisWidth: number) {
  const maxChars = Math.max(8, Math.floor((axisWidth - 12) / 5.4));
  return function CategoryAxisTick({ x, y, payload }: AxisTickProps) {
    const label = String(payload?.value ?? "");
    const text =
      label.length > maxChars
        ? `${label.slice(0, maxChars - 1).trimEnd()}…`
        : label;
    return (
      <text x={x} y={y} dy={3.5} textAnchor="end" fontSize={11} fill="#666">
        <title>{label}</title>
        {text}
      </text>
    );
  };
}

/** Distinct labels present in `values`, sorted by a canonical order list. */
export function orderLabels(values: string[], order: readonly string[]): string[] {
  const idx = (v: string) => {
    const i = order.indexOf(v);
    return i === -1 ? order.length : i;
  };
  return [...new Set(values)].sort(
    (a, b) => idx(a) - idx(b) || a.localeCompare(b),
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
  );
}

export function Note({ text }: { text?: string | null }) {
  if (!text) return null;
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

export function EmptyViz({
  message = "No data for this view.",
}: {
  message?: string;
}) {
  return (
    <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export interface TableCol<T> {
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Raw value used for sorting, searching, and CSV export. Columns without
   *  a value accessor render fine but can't be sorted or matched by search. */
  value?: (row: T) => string | number | null;
}

/**
 * Analysis-card table built on the Individual-dashboard DataTable, so every
 * RIaaS table gets the same search / sort / pagination / CSV affordances.
 * Search and paging controls appear only once the table is big enough to
 * need them.
 */
export function SimpleTable<T>({
  cols,
  rows,
  rowKey,
  exportName = "riaas-analysis",
}: {
  cols: TableCol<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  exportName?: string;
}) {
  const columns = useMemo<ColumnDef<T, unknown>[]>(
    () =>
      cols.map((c, i) => ({
        id: `${i}:${c.label}`,
        header: c.label,
        accessorFn: c.value ?? (() => null),
        enableSorting: Boolean(c.value),
        enableGlobalFilter: Boolean(c.value),
        cell: ({ row }) => (
          <span
            className={cn(
              "block tabular-nums",
              c.align === "right" && "text-right",
            )}
          >
            {c.render(row.original)}
          </span>
        ),
        meta: { align: c.align },
      })),
    [cols],
  );
  void rowKey; // row identity handled by DataTable's row model
  if (rows.length === 0) return <EmptyViz />;
  const compact = rows.length <= 10;
  return (
    <DataTable
      data={rows}
      columns={columns}
      enableGlobalSearch={!compact}
      pageSizes={compact ? [] : [10, 25, 50, 100]}
      initialPageSize={10}
      enableExport={!compact}
      exportFilename={exportName}
      stickyFirstColumn={false}
    />
  );
}
