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
