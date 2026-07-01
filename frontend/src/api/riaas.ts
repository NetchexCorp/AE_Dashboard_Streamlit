import { api } from "./client";

export interface AnalysisEntry {
  analysis_id: string;
  chapter: string;
  title: string;
  viz: string;
  grain: string;
  description: string;
  formula: string;
  time_filter: boolean;
  computed: boolean;
  blocked: boolean;
  fields_required: string[];
  template_default: string;
  template_override: string | null;
  has_override: boolean;
}

export interface AnalysisTestRequest {
  template: string;
  territory?: string | null;
  seller_id?: string | null;
  motion?: string | null;
  period?: string | null;
}

export interface AnalysisTestResult {
  ok: boolean;
  resolved_soql: string;
  row_count: number;
  rows: Record<string, unknown>[];
  error: string | null;
}

export interface AnalysisHistoryRow {
  version: string;
  template: string;
  saved_by: string;
  saved_at: string;
}

export interface FieldRef {
  key: string;
  sf_object: string;
  api_name: string;
  tier: string;
  confirmed: boolean;
  notes: string;
}

export function listAnalyses(): Promise<AnalysisEntry[]> {
  return api<AnalysisEntry[]>("/api/riaas/analyses");
}

export function getAnalysis(analysisId: string): Promise<AnalysisEntry> {
  return api<AnalysisEntry>(
    `/api/riaas/analyses/${encodeURIComponent(analysisId)}`,
  );
}

export function updateAnalysis(
  analysisId: string,
  template: string,
): Promise<AnalysisEntry> {
  return api<AnalysisEntry>(
    `/api/riaas/analyses/${encodeURIComponent(analysisId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ template }),
    },
  );
}

export function testAnalysis(
  analysisId: string,
  body: AnalysisTestRequest,
): Promise<AnalysisTestResult> {
  return api<AnalysisTestResult>(
    `/api/riaas/analyses/${encodeURIComponent(analysisId)}/test`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function getAnalysisHistory(
  analysisId: string,
): Promise<AnalysisHistoryRow[]> {
  return api<AnalysisHistoryRow[]>(
    `/api/riaas/analyses/${encodeURIComponent(analysisId)}/history`,
  );
}

export function listFields(): Promise<FieldRef[]> {
  return api<FieldRef[]>("/api/riaas/fields");
}

// ---- Chapter pages ----

export interface ChapterSummary {
  slug: string;
  title: string;
}

export type AnalysisStatus = "ok" | "pending" | "error";

export interface ChapterAnalysis {
  analysis_id: string;
  title: string;
  viz: string;
  grain: string;
  description: string;
  formula: string;
  status: AnalysisStatus;
  data?: Record<string, unknown>;
  reason?: string;
  error?: string;
}

export interface KeyFindings {
  text: string;
  updated_by: string;
  updated_at: string;
}

export interface ChapterResponse {
  slug: string;
  chapter: string;
  analyses: ChapterAnalysis[];
  key_findings: KeyFindings;
}

export interface ChapterFilters {
  period?: string;
  motion?: string;
  territory?: string;
  seller_id?: string;
}

// Per-analysis "data" payload shapes (Chapter 1).

export interface CrmCompleteData {
  total_contacts: number;
  untitled: number;
  pct_untitled: number | null;
  titled: number;
  decision_makers: number;
  pct_dm_of_titled: number | null;
  note?: string;
}

export interface VelocityQuarter {
  label: string;
  deals: number;
  deals_won: number;
  win_rate: number | null;
  acv: number | null;
  cycle_days: number | null;
  velocity: number | null;
  efficiency: number | null;
  bookings: number;
}

export interface RpsQuarter {
  label: string;
  bookings: number;
  sellers: number;
  rps: number | null;
}

export interface TerritoryMetrics {
  name: string;
  deals: number;
  deals_won: number;
  win_rate: number | null;
  acv: number | null;
  cycle_days: number | null;
  velocity: number | null;
  efficiency: number | null;
  bookings: number;
}

export interface TerritoryEffData {
  territories: TerritoryMetrics[];
  gap: { top: string; bottom: string; ratio: number | null } | null;
  deals_without_territory: number;
}

export function listChapters(): Promise<ChapterSummary[]> {
  return api<ChapterSummary[]>("/api/riaas/chapters");
}

export function fetchChapter(
  slug: string,
  filters: ChapterFilters = {},
): Promise<ChapterResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) qs.set(key, value);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return api<ChapterResponse>(
    `/api/riaas/chapters/${encodeURIComponent(slug)}${suffix}`,
  );
}

export function saveKeyFindings(
  slug: string,
  text: string,
): Promise<KeyFindings> {
  return api<KeyFindings>(
    `/api/riaas/chapters/${encodeURIComponent(slug)}/key-findings`,
    {
      method: "PUT",
      body: JSON.stringify({ text }),
    },
  );
}
