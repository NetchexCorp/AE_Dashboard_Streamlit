import { Link } from "@tanstack/react-router";
import { useMe } from "@/hooks/useMe";
import { CHAPTERS } from "@/lib/chapters";

export function OrgPerformanceRoute() {
  const me = useMe();

  // Server-side gating is authoritative (RIaaS APIs 404 for non-flagged
  // users); this just avoids rendering a dead page on a direct URL hit.
  if (me.data && !me.data.features?.riaas) {
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
          <Link
            key={c.slug}
            to="/org/chapters/$slug"
            params={{ slug: c.slug }}
            className="rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:border-border hover:bg-accent"
          >
            <div className="text-sm font-medium">{c.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              View chapter →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
