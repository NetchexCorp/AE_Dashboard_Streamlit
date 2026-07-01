import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { type ChapterResponse, fetchChapter } from "@/api/riaas";
import { AnalysisCard } from "@/components/riaas/AnalysisCard";
import { KeyFindingsPanel } from "@/components/riaas/KeyFindingsPanel";
import { useMe } from "@/hooks/useMe";
import { chapterBySlug } from "@/lib/chapters";

export interface ChapterSearch {
  period?: string;
  motion?: string;
}

export const DEFAULT_PERIOD = "last_4_quarters";
export const DEFAULT_MOTION = "all";

const PERIOD_OPTIONS = [
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last_4_quarters", label: "Last 4 quarters" },
  { value: "prior_fy", label: "Prior fiscal year" },
];

const MOTION_OPTIONS = [
  { value: "all", label: "All motions" },
  { value: "nb", label: "New business" },
  { value: "exp", label: "Expansion" },
];

const route = getRouteApi("/org/chapters/$slug");

// Full-width cards: KPI rows, wide tables/matrices, and the (long)
// horizontal territory chart.
function spansBothColumns(analysisId: string, viz: string): boolean {
  return (
    viz === "kpi" ||
    viz === "table" ||
    viz === "matrix" ||
    analysisId === "C1-TERR-EFF-GAP" ||
    analysisId === "C3-RISK-SLIPPED"
  );
}

export function ChapterRoute() {
  const me = useMe();
  const { slug } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();

  const period = search.period ?? DEFAULT_PERIOD;
  const motion = search.motion ?? DEFAULT_MOTION;
  const def = chapterBySlug(slug);
  const riaas = me.data?.features?.riaas === true;

  const chapter = useQuery<ChapterResponse>({
    queryKey: ["riaas", "chapter", slug, period, motion],
    queryFn: () => fetchChapter(slug, { period, motion }),
    staleTime: 60_000,
    enabled: riaas && def != null,
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

  if (!def) {
    return (
      <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
        Unknown chapter.
      </div>
    );
  }

  const setSearch = (patch: Partial<ChapterSearch>) => {
    void navigate({
      search: (prev: ChapterSearch) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{def.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organization Performance · quarterly trends always show the last 8
            fiscal quarters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Period</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={period}
              onChange={(e) =>
                setSearch({
                  period:
                    e.target.value === DEFAULT_PERIOD
                      ? undefined
                      : e.target.value,
                })
              }
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Motion</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={motion}
              onChange={(e) =>
                setSearch({
                  motion:
                    e.target.value === DEFAULT_MOTION
                      ? undefined
                      : e.target.value,
                })
              }
            >
              {MOTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {chapter.isLoading && (
        <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Running chapter analyses…
        </div>
      )}
      {chapter.isError && (
        <div className="rounded-md border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-900">
          Failed to load chapter: {(chapter.error as Error).message}
        </div>
      )}

      {chapter.data && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {chapter.data.analyses.map((a) => (
              <AnalysisCard
                key={a.analysis_id}
                analysis={a}
                className={
                  spansBothColumns(a.analysis_id, a.viz)
                    ? "lg:col-span-2"
                    : undefined
                }
              />
            ))}
          </div>
          <KeyFindingsPanel slug={slug} findings={chapter.data.key_findings} />
        </>
      )}
    </div>
  );
}
