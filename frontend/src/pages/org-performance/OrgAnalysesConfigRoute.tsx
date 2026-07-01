import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type AnalysisEntry, listAnalyses } from "@/api/riaas";
import { AnalysisEditor } from "@/components/config/riaas/AnalysisEditor";
import { AnalysisHistory } from "@/components/config/riaas/AnalysisHistory";
import { AnalysisList } from "@/components/config/riaas/AnalysisList";
import { ReadOnlyGate } from "@/components/auth/ReadOnlyGate";
import { useMe } from "@/hooks/useMe";

export function OrgAnalysesConfigRoute() {
  const me = useMe();
  const riaas = me.data?.features.riaas === true;
  const { data, isLoading } = useQuery<AnalysisEntry[]>({
    queryKey: ["riaas", "analyses"],
    queryFn: listAnalyses,
    staleTime: 30_000,
    enabled: riaas,
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (me.data && !riaas) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Page not found.
      </div>
    );
  }

  if (selected == null && data && data.length > 0) {
    setSelected(data[0].analysis_id);
  }

  return (
    <ReadOnlyGate>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Analysis Config</h1>
          <p className="text-sm text-muted-foreground">
            SOQL templates behind each organization-performance analysis.
            Admin role can edit; user role is view-only.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
          <div className="md:h-[calc(100vh-220px)]">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              data && (
                <AnalysisList
                  entries={data}
                  selected={selected}
                  onSelect={setSelected}
                />
              )
            )}
          </div>
          <div className="space-y-6">
            {selected ? (
              <>
                <AnalysisEditor analysisId={selected} />
                <section>
                  <h4 className="mb-2 text-sm font-medium">History</h4>
                  <AnalysisHistory analysisId={selected} />
                </section>
              </>
            ) : (
              <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
                Select an analysis to view its SOQL template.
              </div>
            )}
          </div>
        </div>
      </div>
    </ReadOnlyGate>
  );
}
