import { api } from "./client";

export interface MonthlyBucketRow {
  bucket: string;
  actual: number;
  plan: number;
  py_actual: number;
}

export interface MonthlyPeriodTable {
  rows: MonthlyBucketRow[];
  higherme: MonthlyBucketRow | null;
}

export interface MonthlyBasis {
  label: string;
  periods: Record<string, MonthlyPeriodTable>; // mtd | qtd | ytd
  trend_actual: number[];
}

export interface MonthlyRecord {
  month: string; // "2026-06"
  label: string; // "June 2026"
  status: string; // prelim | final
  prepared_at: string;
  source_note: string;
  trend_months: string[];
  trend_plan: number[];
  bases: Record<string, MonthlyBasis>; // amt_annualized | w2_uplift
}

export interface MonthlyIndex {
  months: string[];
  latest: string | null;
}

export function fetchMonthlyIndex(): Promise<MonthlyIndex> {
  return api<MonthlyIndex>("/api/monthly-results");
}

export function fetchMonthlyRecord(month: string): Promise<MonthlyRecord> {
  return api<MonthlyRecord>(
    `/api/monthly-results/${encodeURIComponent(month)}`,
  );
}
