import type { ReactNode } from "react";
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
}

export function SimpleTable<T>({
  cols,
  rows,
  rowKey,
  maxRows,
}: {
  cols: TableCol<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  maxRows?: number;
}) {
  if (rows.length === 0) return <EmptyViz />;
  const shown = maxRows != null ? rows.slice(0, maxRows) : rows;
  const hidden = rows.length - shown.length;
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              {cols.map((c) => (
                <th
                  key={c.label}
                  className={cn(
                    "px-2 py-1 font-medium",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-t border-border/40">
                {cols.map((c) => (
                  <td
                    key={c.label}
                    className={cn(
                      "px-2 py-1",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">+{hidden} more</p>
      )}
    </div>
  );
}
