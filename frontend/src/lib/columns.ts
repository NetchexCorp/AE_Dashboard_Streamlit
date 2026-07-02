/**
 * Column-level constants mirrored from backend column_meta. Backend remains
 * the source of truth via /api/columns; this set is reused for cells that
 * need the lower_is_better hint without threading it through every prop.
 */
export const LOWER_IS_BETTER = new Set<string>(["S1-COL-N"]);

/** Open Pipeline with Current Month Close — surfaced in every section. */
export const OPEN_PIPELINE_COL = "S1-COL-I";
/** Open Pipeline Needed to Quota with Current Month Close — drives the red highlight. */
export const OPEN_PIPELINE_NEEDED_COL = "S1-COL-O";

/**
 * Shared column widths for the dashboard tables. Fixed widths keep the layout
 * uniform now that long headers wrap to 2–3 rows (see DataTable `meta.width`).
 */
export const COL_W = {
  /** AE name (sticky first column). */
  ae: "13rem",
  /** Manager name. */
  manager: "9.5rem",
  /** Any numeric / currency value column. */
  num: "7.5rem",
} as const;

/** Per-AE Bookings-by-Motion columns (New / Cross-Sell / Upsell). */
export const MOTION_COLS = [
  { colId: "S7-COL-BN", label: "New" },
  { colId: "S7-COL-BX", label: "Cross-Sell" },
  { colId: "S7-COL-BU", label: "Upsell" },
] as const;

/**
 * Short on-table header labels for columns whose registry display_name is a
 * sentence. The full name + formula stay one hover away (InfoTooltip); the
 * header itself stays scannable. Columns not listed here use display_name.
 */
export const SHORT_LABELS: Record<string, string> = {
  "S1-COL-E": "Attainment % (YTD)",
  "S1-COL-H": "Attainment % (MTD)",
  "S1-COL-I": "Open Pipeline",
  "S1-COL-K": "Opps Created",
  "S1-COL-L": "Pipeline Created",
  "S1-COL-M": "Bookings",
  "S1-COL-N": "Closed Lost",
  "S1-COL-O": "Pipeline Needed",
  "S7-COL-BN": "New",
  "S7-COL-BX": "Cross-Sell",
  "S7-COL-BU": "Upsell",
};

export function shortLabel(colId: string, displayName: string): string {
  return SHORT_LABELS[colId] ?? displayName;
}
