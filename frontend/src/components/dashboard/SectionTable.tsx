import {
  type ColumnDef,
  createColumnHelper,
} from "@tanstack/react-table";
import { ArrowDown } from "lucide-react";
import { useMemo } from "react";
import type { AERow, ColumnMeta } from "@/types/dashboard";
import { DataTable } from "@/components/tables/DataTable";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useFilters } from "@/hooks/useFilters";
import {
  COL_W,
  OPEN_PIPELINE_COL,
  OPEN_PIPELINE_NEEDED_COL,
  shortLabel,
} from "@/lib/columns";
import { fmt } from "@/lib/formatters";
import { cn } from "@/lib/cn";

interface Props {
  section: { key: string; display_name: string };
  columns: ColumnMeta[];
  rows: AERow[];
  /** Show a section title above the table. Set false to render bare. */
  showHeader?: boolean;
}

const helper = createColumnHelper<AERow>();

export function SectionTable({ section, columns, rows, showHeader = true }: Props) {
  const { set } = useFilters();

  const numericCols = columns.filter((c) => !c.blocked);

  const tableColumns = useMemo<ColumnDef<AERow, unknown>[]>(() => {
    const defs: ColumnDef<AERow, unknown>[] = [
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
        meta: { aggregate: "none", width: COL_W.manager },
      }),
    ];

    for (const col of numericCols) {
      // Currency and counts roll up by sum; percentages must not be summed.
      const aggregate = col.format === "percent" ? "none" : "sum";
      defs.push(
        helper.accessor((r) => r.values[col.col_id] ?? null, {
          id: col.col_id,
          aggregationFn: aggregate === "sum" ? "sum" : undefined,
          meta: { aggregate, format: col.format, align: "right", width: COL_W.num },
          // Short label on the table; the full registry name is the tooltip
          // title so nothing is lost, just moved one hover away.
          header: () => (
            <InfoTooltip
              title={col.display_name}
              description={col.description || col.aggregation || col.col_id}
            >
              <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                {shortLabel(col.col_id, col.display_name)}
              </span>
            </InfoTooltip>
          ),
          cell: (c) => {
            if (col.blocked) {
              return <span className="text-xs italic text-muted-foreground/60">Pending</span>;
            }
            const value = c.getValue() as number | null;
            // Open Pipeline turns red + shows a down-arrow when it falls short of
            // what's needed to hit quota (arrow keeps meaning legible without color).
            const needed = c.row.original.values[OPEN_PIPELINE_NEEDED_COL];
            const short =
              col.col_id === OPEN_PIPELINE_COL &&
              value != null &&
              needed != null &&
              value < needed;
            return (
              <span
                title={short ? "Below the open pipeline needed to hit quota" : undefined}
                className={cn(
                  "flex w-full items-center justify-end gap-1 px-1.5 py-0.5 text-right tabular-nums",
                  short && "font-semibold text-red-600",
                )}
              >
                {short && <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />}
                {fmt(value, col.format)}
              </span>
            );
          },
          sortingFn: numericSort,
        }),
      );
    }
    return defs;
  }, [numericCols, set]);

  return (
    <section className="space-y-2">
      {showHeader && (
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{section.display_name}</h2>
          <p className="text-xs text-muted-foreground">{numericCols.length} columns</p>
        </header>
      )}
      <DataTable
        data={rows}
        columns={tableColumns}
        emptyMessage="No data."
        enableGlobalSearch={rows.length > 10}
        enableColumnFilters={false}
        stickyFirstColumn
        exportFilename={`section-${section.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        groupBy="manager"
        tableId={`section-${section.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
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
