import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type ChapterResponse,
  type KeyFindings,
  saveKeyFindings,
} from "@/api/riaas";
import { formatInTz, useTz } from "@/lib/datetime";
import { cn } from "@/lib/cn";

export function KeyFindingsPanel({
  slug,
  findings,
}: {
  slug: string;
  findings: KeyFindings;
}) {
  const tz = useTz();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(findings.text);

  // Re-seed when navigating between chapters or after a background refetch.
  useEffect(() => {
    setDraft(findings.text);
  }, [slug, findings.text]);

  const saveMut = useMutation({
    mutationFn: () => saveKeyFindings(slug, draft),
    onSuccess: (row) => {
      // Patch every cached filter-combination of this chapter in place —
      // invalidating would re-run all the chapter's Salesforce queries.
      qc.setQueriesData<ChapterResponse>(
        { queryKey: ["riaas", "chapter", slug] },
        (old) => (old ? { ...old, key_findings: row } : old),
      );
      toast.success("Key findings saved");
    },
    onError: (err) => toast.error(`Save failed: ${(err as Error).message}`),
  });

  const dirty = draft !== findings.text;

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Key Findings</h3>
        {findings.updated_at && (
          <span className="text-xs text-muted-foreground">
            Last updated by {findings.updated_by || "unknown"} ·{" "}
            {formatInTz(findings.updated_at, tz)}
          </span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(ev) => setDraft(ev.target.value)}
        rows={5}
        placeholder="Narrative summary of what this chapter's analyses show…"
        className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending}
          className={cn(
            "h-8 rounded-md px-3 text-sm text-primary-foreground",
            !dirty || saveMut.isPending
              ? "bg-primary/40"
              : "bg-primary hover:bg-primary/90",
          )}
        >
          {saveMut.isPending ? "Saving…" : "Save"}
        </button>
        {dirty && (
          <span className="text-xs text-muted-foreground">
            • unsaved changes
          </span>
        )}
      </div>
    </section>
  );
}
