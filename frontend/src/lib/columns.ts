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
