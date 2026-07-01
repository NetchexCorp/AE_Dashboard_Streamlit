import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type AnalysisEntry,
  type AnalysisTestResult,
  getAnalysis,
  testAnalysis,
  updateAnalysis,
} from "@/api/riaas";
import { useReadOnly } from "@/components/auth/ReadOnlyGate";
import { cn } from "@/lib/cn";

interface Props {
  analysisId: string;
}

export function AnalysisEditor({ analysisId }: Props) {
  const readOnly = useReadOnly();
  const qc = useQueryClient();

  const entry = useQuery<AnalysisEntry>({
    queryKey: ["riaas", "analyses", analysisId],
    queryFn: () => getAnalysis(analysisId),
    enabled: !!analysisId,
  });

  const [draft, setDraft] = useState<string>("");
  const [territory, setTerritory] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("");
  const [motion, setMotion] = useState<string>("");
  const [period, setPeriod] = useState<string>("");
  const [lastTestedDraft, setLastTestedDraft] = useState<string>("");
  const [testResult, setTestResult] = useState<AnalysisTestResult | null>(
    null,
  );

  const templateActive = entry.data
    ? (entry.data.template_override ?? entry.data.template_default)
    : "";

  // Hydrate draft when entry loads or analysis changes
  useEffect(() => {
    if (entry.data) {
      setDraft(entry.data.template_override ?? entry.data.template_default);
      setLastTestedDraft("");
      setTestResult(null);
    }
  }, [entry.data, analysisId]);

  const dirty = useMemo(
    () => (entry.data ? draft !== templateActive : false),
    [draft, entry.data, templateActive],
  );
  const testedClean = dirty && draft === lastTestedDraft && testResult?.ok;

  const testMut = useMutation({
    mutationFn: () =>
      testAnalysis(analysisId, {
        template: draft,
        territory: territory || null,
        seller_id: sellerId || null,
        motion: motion || null,
        period: period || null,
      }),
    onSuccess: (res) => {
      setTestResult(res);
      setLastTestedDraft(draft);
    },
    onError: (err) => toast.error(`Test failed: ${(err as Error).message}`),
  });

  const saveMut = useMutation({
    mutationFn: () => updateAnalysis(analysisId, draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["riaas"] });
      toast.success(`Saved template for ${analysisId}`);
    },
    onError: (err) => toast.error(`Save failed: ${(err as Error).message}`),
  });

  if (entry.isLoading || !entry.data) {
    return (
      <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
        Loading template…
      </div>
    );
  }

  const e = entry.data;
  const saveDisabled = readOnly || !dirty || saveMut.isPending || !testedClean;

  return (
    <div className="flex flex-col gap-3">
      <header>
        <div className="flex items-baseline gap-2">
          <code className="font-mono text-sm">{e.analysis_id}</code>
          <h3 className="text-sm font-medium">{e.title}</h3>
          <span className="text-xs text-muted-foreground">• {e.chapter}</span>
        </div>
        {e.description && (
          <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
        )}
        {e.formula && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Formula: {e.formula}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Viz: {e.viz} • Grain: {e.grain}
        </p>
      </header>

      {readOnly && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          Admin role required to edit analysis templates. View-only mode.
        </div>
      )}

      {e.blocked && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          <div className="font-medium">Pending field confirmation</div>
          <div className="mt-1">
            This analysis is blocked until the following fields are confirmed:{" "}
            {e.fields_required.map((f, i) => (
              <span key={f}>
                {i > 0 && ", "}
                <code className="font-mono">{f}</code>
              </span>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={draft}
        readOnly={readOnly}
        onChange={(ev) => setDraft(ev.target.value)}
        spellCheck={false}
        rows={14}
        className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Territory:</span>
          <input
            className="h-7 w-28 rounded-md border border-border bg-background px-1 text-xs"
            placeholder="(all)"
            value={territory}
            onChange={(ev) => setTerritory(ev.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Seller:</span>
          <input
            className="h-7 w-28 rounded-md border border-border bg-background px-1 text-xs"
            placeholder="(all)"
            value={sellerId}
            onChange={(ev) => setSellerId(ev.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Motion:</span>
          <input
            className="h-7 w-24 rounded-md border border-border bg-background px-1 text-xs"
            placeholder="(all)"
            value={motion}
            onChange={(ev) => setMotion(ev.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Period:</span>
          <input
            className="h-7 w-24 rounded-md border border-border bg-background px-1 text-xs"
            placeholder="(default)"
            value={period}
            onChange={(ev) => setPeriod(ev.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => testMut.mutate()}
          disabled={readOnly || testMut.isPending}
          className="h-7 rounded-md border border-border bg-background px-2 hover:bg-accent disabled:opacity-50"
        >
          {testMut.isPending ? "Testing…" : "Test query"}
        </button>
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveDisabled}
          title={
            readOnly
              ? "Admin role required"
              : !dirty
                ? "No changes"
                : !testedClean
                  ? "Test before saving"
                  : ""
          }
          className={cn(
            "h-7 rounded-md px-3 text-primary-foreground",
            saveDisabled ? "bg-primary/40" : "bg-primary hover:bg-primary/90",
          )}
        >
          {saveMut.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setDraft(e.template_default)}
          disabled={readOnly}
          className="h-7 rounded-md border border-border bg-background px-2 hover:bg-accent disabled:opacity-50"
        >
          Reset to default
        </button>
        {dirty && (
          <span className="text-muted-foreground">• unsaved changes</span>
        )}
      </div>

      {testResult && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            testResult.ok
              ? "border-green-300 bg-green-50 text-green-900"
              : "border-red-300 bg-red-50 text-red-900",
          )}
        >
          {testResult.ok ? (
            <div className="space-y-1">
              <div>
                <strong>Rows:</strong> {testResult.row_count}
              </div>
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  Resolved SOQL
                </summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                  {testResult.resolved_soql}
                </pre>
              </details>
              {testResult.rows.length > 0 && (
                <details open>
                  <summary className="cursor-pointer text-muted-foreground">
                    Sample rows ({testResult.rows.length})
                  </summary>
                  <SampleRows rows={testResult.rows} />
                </details>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <span>{testResult.error}</span>
              {testResult.resolved_soql && (
                <details>
                  <summary className="cursor-pointer">Resolved SOQL</summary>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                    {testResult.resolved_soql}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {saveMut.isError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          {(saveMut.error as Error).message}
        </div>
      )}
    </div>
  );
}

function SampleRows({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0] ?? {});
  return (
    <div className="mt-1 max-h-64 overflow-auto rounded-md border border-border/60 bg-background">
      <table className="min-w-full text-[11px]">
        <thead className="bg-muted/50">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-2 py-1 text-left font-medium text-muted-foreground"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/40">
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1 font-mono">
                  {row[c] == null ? "" : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
