import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { type ChapterResponse, fetchChapter } from "@/api/riaas";
import { AnalysisCard } from "@/components/riaas/AnalysisCard";
import { KeyFindingsPanel } from "@/components/riaas/KeyFindingsPanel";
import { useMe } from "@/hooks/useMe";
import { CHAPTER_SECTIONS, chapterBySlug } from "@/lib/chapters";
import { cn } from "@/lib/cn";

export interface ChapterSearch {
  period?: string;
  motion?: string;
  section?: string;
  /** Salesforce user id — scopes the chapter's analyses to one seller. */
  seller?: string;
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
  const seller = search.seller;
  const def = chapterBySlug(slug);
  const riaas = me.data?.features?.riaas === true;

  const chapter = useQuery<ChapterResponse>({
    queryKey: ["riaas", "chapter", slug, period, motion, seller ?? ""],
    queryFn: () => fetchChapter(slug, { period, motion, seller_id: seller }),
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
            Revenue Intelligence · quarterly trends always show the last 8
            fiscal quarters ·{" "}
            <Link
              to="/dashboard/summary"
              className="font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
            >
              see individual numbers →
            </Link>
          </p>
          {seller && (
            <p className="mt-1 text-sm">
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">
                Scoped to one seller ·{" "}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => setSearch({ seller: undefined })}
                >
                  clear
                </button>
              </span>
            </p>
          )}
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

      {/* The narrative leads; the analyses below are its evidence. */}
      {chapter.data && (
        <KeyFindingsPanel slug={slug} findings={chapter.data.key_findings} />
      )}
      {chapter.data && (
        <ChapterSections
          slug={slug}
          analyses={chapter.data.analyses}
          activeSection={search.section}
          onSelect={(key) => setSearch({ section: key })}
        />
      )}
    </div>
  );
}

// Sub-page tabs: each chapter's analyses are grouped into sections so a
// chapter never renders as one very long page. Unmapped analyses fall into
// the first section.
function ChapterSections({
  slug,
  analyses,
  activeSection,
  onSelect,
}: {
  slug: string;
  analyses: ChapterResponse["analyses"];
  activeSection?: string;
  onSelect: (key: string | undefined) => void;
}) {
  const sections = CHAPTER_SECTIONS[slug] ?? [];
  const mapped = new Set(sections.flatMap((s) => s.analyses));
  const bySection = (keys: string[], first: boolean) =>
    analyses.filter(
      (a) =>
        keys.includes(a.analysis_id) || (first && !mapped.has(a.analysis_id)),
    );
  const active =
    sections.find((s) => s.key === activeSection) ?? sections[0];
  const shown = active
    ? bySection(active.analyses, active === sections[0])
    : analyses;

  return (
    <>
      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border">
          {sections.map((s) => {
            const isActive = s.key === active?.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  onSelect(s.key === sections[0].key ? undefined : s.key)
                }
                className={cn(
                  "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((a) => (
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
    </>
  );
}
