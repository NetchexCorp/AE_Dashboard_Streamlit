import { fmtNumber } from "@/lib/formatters";
import { EmptyViz, fmtValue, type VizFormat } from "./vizPrimitives";

export interface MatrixCell {
  value: number | null;
  count?: number | null;
  /** Cell-level reference overriding the table-level one (e.g. per-seller). */
  reference?: number | null;
}

export const matrixKey = (row: string, col: string) => `${row}\u0000${col}`;

function cellShade(
  cell: MatrixCell,
  reference: number | null | undefined,
  maxValue: number,
): string | undefined {
  if (cell.value == null) return undefined;
  const ref = cell.reference ?? reference;
  if (ref != null) {
    const delta = cell.value - ref;
    const alpha = Math.min(Math.abs(delta) / 0.25, 1) * 0.45;
    return delta >= 0
      ? `rgba(16, 185, 129, ${alpha.toFixed(3)})`
      : `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
  }
  if (maxValue <= 0) return undefined;
  const alpha = (cell.value / maxValue) * 0.45;
  return `rgba(44, 74, 124, ${alpha.toFixed(3)})`;
}

/**
 * Heat-shaded matrix. With a reference, cells shade green/red by how far the
 * value sits above/below it; otherwise shading scales with the value itself.
 */
export function MatrixTable({
  rows,
  cols,
  cells,
  format = "percent",
  reference,
  cornerLabel = "",
}: {
  rows: string[];
  cols: string[];
  cells: Record<string, MatrixCell>;
  format?: VizFormat;
  reference?: number | null;
  cornerLabel?: string;
}) {
  if (rows.length === 0 || cols.length === 0) return <EmptyViz />;
  const maxValue = Math.max(
    0,
    ...Object.values(cells).map((c) => c.value ?? 0),
  );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[11px] tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">{cornerLabel}</th>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1 text-center font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r} className="border-t border-border/40">
              <td className="whitespace-nowrap px-2 py-1 font-medium">{r}</td>
              {cols.map((c) => {
                const cell = cells[matrixKey(r, c)];
                if (!cell) {
                  return (
                    <td
                      key={c}
                      className="px-2 py-1 text-center text-muted-foreground/50"
                    >
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={c}
                    className="px-2 py-1 text-center"
                    style={{
                      backgroundColor: cellShade(cell, reference, maxValue),
                    }}
                  >
                    {fmtValue(cell.value, format)}
                    {cell.count != null && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({fmtNumber(cell.count)})
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
