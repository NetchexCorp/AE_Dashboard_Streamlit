import { useMe } from "@/hooks/useMe";

const CHAPTERS = [
  { slug: "gtm-overview", title: "GTM Efficiency Overview" },
  { slug: "win-loss", title: "Win/Loss & Benchmark" },
  { slug: "pipeline-health", title: "Pipeline Health Assessment" },
  { slug: "coach", title: "Coach (People Insights)" },
  { slug: "gtm-process", title: "GTM Process Optimisation" },
];

export function OrgPerformanceRoute() {
  const me = useMe();

  // Server-side gating is authoritative (RIaaS APIs 404 for non-flagged
  // users); this just avoids rendering a dead page on a direct URL hit.
  if (me.data && !me.data.features.riaas) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Page not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Organization Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue intelligence across the whole go-to-market organization.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHAPTERS.map((c) => (
          <div
            key={c.slug}
            className="rounded-lg border border-border bg-muted/20 p-4"
          >
            <div className="text-sm font-medium">{c.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Coming soon
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
