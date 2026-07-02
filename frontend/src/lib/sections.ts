/**
 * URL-safe slugs for the 5 dashboard sections. Section keys come from the
 * backend column registry; slugs are stable strings used in route params.
 */

import type { ColumnMeta } from "@/types/dashboard";
import { OPEN_PIPELINE_COL } from "@/lib/columns";

export interface SectionDef {
  slug: string;
  key: string;
  label: string;
  /** Section-specific Bookings column id (leads the headline trio). */
  bookingsCol: string;
  /** Section-specific Pipeline Generated column id (trails the headline trio).
   *  Empty string = section has no pipeline lens (e.g. Bookings by Motion);
   *  the headline trio (with Open Pipeline) is not injected. */
  pipelineCol: string;
}

// Canonical order: Pipeline & Quota (headline) then sources in the order
// Self-Gen → Channel → SDR → Marketing.
export const SECTION_DEFS: SectionDef[] = [
  { slug: "pipeline-quota", key: "Pipeline & Quota", label: "Pipeline & Quota", bookingsCol: "S1-COL-M", pipelineCol: "S1-COL-L" },
  { slug: "motion", key: "Bookings by Motion", label: "By Motion", bookingsCol: "S7-COL-BN", pipelineCol: "" },
  { slug: "self-gen", key: "Self-Gen Pipeline Creation", label: "Self-Gen Pipeline", bookingsCol: "S6-COL-AM", pipelineCol: "S6-COL-AF" },
  { slug: "channel", key: "Channel Partners", label: "Channel Partners", bookingsCol: "S6-COL-AO", pipelineCol: "S6-COL-AJ" },
  { slug: "sdr", key: "SDR Activity", label: "SDR Activity", bookingsCol: "S6-COL-AN", pipelineCol: "S6-COL-AH" },
  { slug: "marketing", key: "Marketing", label: "Marketing", bookingsCol: "S6-COL-AP", pipelineCol: "S6-COL-AL" },
];

/**
 * Canonical left-to-right order of the All-Source Summary source columns,
 * applied on the client so the default order is correct even if the backend
 * payload arrives in a different order. Unknown labels sort to the end.
 */
export const SOURCE_ORDER = ["Self Gen", "Channel", "SDR", "Marketing", "Others"];

export function sourceOrderIndex(label: string): number {
  const i = SOURCE_ORDER.indexOf(label);
  return i === -1 ? SOURCE_ORDER.length : i;
}

const SECTION_KEY_ORDER = SECTION_DEFS.map((s) => s.key);

/**
 * Canonical position of a section by its backend key, matching the sidebar /
 * section-page order. Keys absent from SECTION_DEFS (e.g. "Others") sort last.
 */
export function sectionOrderIndex(key: string): number {
  const i = SECTION_KEY_ORDER.indexOf(key);
  return i === -1 ? SECTION_KEY_ORDER.length : i;
}

export function sectionBySlug(slug: string): SectionDef | undefined {
  return SECTION_DEFS.find((s) => s.slug === slug);
}

const SECTION_BY_KEY = new Map(SECTION_DEFS.map((s) => [s.key, s]));

/**
 * Columns for a section, ordered per the headline sequence
 * Bookings → Open Pipeline → Pipeline Generated, followed by the remaining
 * section columns in registry order. Open Pipeline (with current-month close)
 * is injected into every section even though it natively belongs to
 * Pipeline & Quota.
 */
export function orderedSectionColumns(
  all: ColumnMeta[],
  sectionKey: string,
): ColumnMeta[] {
  const def = SECTION_BY_KEY.get(sectionKey);
  const byId = new Map(all.map((c) => [c.col_id, c]));
  const sectionCols = all.filter((c) => c.section === sectionKey);
  if (!def || !def.pipelineCol) return sectionCols;

  const headIds = [def.bookingsCol, OPEN_PIPELINE_COL, def.pipelineCol];
  const head = headIds
    .map((id) => byId.get(id))
    .filter((c): c is ColumnMeta => Boolean(c));
  const headSet = new Set(headIds);
  const rest = sectionCols.filter((c) => !headSet.has(c.col_id));
  return [...head, ...rest];
}
