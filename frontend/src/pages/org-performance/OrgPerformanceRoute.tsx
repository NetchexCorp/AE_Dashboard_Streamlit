import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  fetchKeyFindingsDigest,
  type KeyFindingsDigestEntry,
} from "@/api/riaas";
import { useMe } from "@/hooks/useMe";
import { formatInTz, useTz } from "@/lib/datetime";
import { CHAPTERS } from "@/lib/chapters";

export function OrgPerformanceRoute() {
  const me = useMe();
  const tz = useTz();
  const riaas = me.data?.features?.riaas === true;

  // Narratives only — no Salesforce queries, so the overview stays instant.
  const digest = useQuery<KeyFindingsDigestEntry[]>({
    queryKey: ["riaas", "key-findings-digest"],
    queryFn: fetchKeyFindingsDigest,
    staleTime: 60_000,
    enabled: riaas,
  });

  // Server-side gating is authoritative (RIaaS APIs 404 for non-flagged
  // users); this just avoids rendering a dead page on a direct URL hit.
  if (me.data && !riaas) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Page not found.
      </div>
    );
  }

  const bySlug = new Map((digest.data ?? []).map((d) => [d.slug, d] as const));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Revenue Intelligence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The strategy deep-dive: each chapter's latest Key Findings, with the
          full analyses one click in. Coaching lives in its own section.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CHAPTERS.filter((c) => c.slug !== "coach").map((c) => {
          const kf = bySlug.get(c.slug);
          return (
            <Link
              key={c.slug}
              to="/org/chapters/$slug"
              params={{ slug: c.slug }}
              className="flex flex-col rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-accent"
            >
              <div className="text-sm font-semibold">{c.title}</div>
              {kf?.text ? (
                <>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {kf.text}
                  </p>
                  <div className="mt-auto pt-2 text-xs text-muted-foreground/80">
                    Key findings · {kf.updated_by || "unknown"}
                    {kf.updated_at ? ` · ${formatInTz(kf.updated_at, tz)}` : ""}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground">
                  No key findings written yet — open the chapter and add the
                  narrative.
                </p>
              )}
            </Link>
          );
        })}
      </div>
      <div className="text-sm text-muted-foreground">
        Looking for people insights?{" "}
        <Link
          to="/org/chapters/$slug"
          params={{ slug: "coach" }}
          className="font-medium text-foreground underline"
        >
          Coaching →
        </Link>
      </div>
    </div>
  );
}
