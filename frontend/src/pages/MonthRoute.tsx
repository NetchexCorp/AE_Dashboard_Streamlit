import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  fetchMonthlyIndex,
  fetchMonthlyRecord,
  type MonthlyBucketRow,
  type MonthlyIndex,
  type MonthlyRecord,
} from "@/api/monthly";
import { useColumnMeta, useDashboard } from "@/hooks/useDashboard";
import { useMe } from "@/hooks/useMe";
import { fmtCurrency } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { FilterState } from "@/types/filters";

const MonthlyTrendChart = lazy(() =>
  import("@/components/monthly/MonthlyTrendChart").then((m) => ({
    default: m.MonthlyTrendChart,
  })),
);

export interface MonthSearch {
  month?: string;
  period?: string; // mtd | qtd | ytd
  basis?: string; // amt_annualized | w2_uplift
}

type Period = "mtd" | "qtd" | "ytd";

const PERIODS: { key: Period; label: string }[] = [
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
];

const PERIOD_LONG: Record<Period, string> = {
  mtd: "month to date",
  qtd: "quarter to date",
  ytd: "year to date",
};

/**
 * Bucket (bookings type) → RIaaS motion filter. New-Direct/New-Reseller are
 * new business; Cross-Sell/Upsell are expansion — same mapping as the
 * backend's NEW_BUSINESS_TYPES / EXPANSION_TYPES.
 */
function bucketMotion(bucket: string): "nb" | "exp" | null {
  if (bucket.startsWith("New-")) return "nb";
  if (bucket === "Cross-Sell" || bucket === "Upsell") return "exp";
  return null;
}

/** Calendar from/to for a report month's MTD/QTD/YTD window. */
function periodRange(month: string, period: Period): { from: string; to: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const fromMonth = period === "mtd" ? m : period === "qtd" ? Math.floor((m - 1) / 3) * 3 + 1 : 1;
  return {
    from: `${y}-${String(fromMonth).padStart(2, "0")}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function pyPct(actual: number, py: number): number | null {
  return py > 0 ? actual / py - 1 : null;
}

function fmtSigned(v: number): string {
  return `${v >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(v))}`;
}

function fmtPyPct(actual: number, py: number): string {
  const p = pyPct(actual, py);
  if (p == null) return "n/m";
  return `${p >= 0 ? "+" : "−"}${Math.abs(Math.round(p * 100))}%`;
}

const route = getRouteApi("/month");

export function MonthRoute() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const me = useMe();
  const riaas = me.data?.features?.riaas === true;

  const index = useQuery<MonthlyIndex>({
    queryKey: ["monthly", "index"],
    queryFn: fetchMonthlyIndex,
    staleTime: 5 * 60_000,
  });

  const month = search.month ?? index.data?.latest ?? null;
  const period: Period = (["mtd", "qtd", "ytd"] as const).includes(
    search.period as Period,
  )
    ? (search.period as Period)
    : "mtd";

  const record = useQuery<MonthlyRecord>({
    queryKey: ["monthly", "record", month],
    queryFn: () => fetchMonthlyRecord(month as string),
    enabled: month != null,
    staleTime: 5 * 60_000,
  });

  const basisKey =
    search.basis && record.data?.bases[search.basis]
      ? search.basis
      : "amt_annualized";

  const setSearch = (patch: Partial<MonthSearch>): void => {
    void navigate({
      search: (prev: MonthSearch) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  if (index.isLoading || (month != null && record.isLoading)) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        Loading monthly results…
      </div>
    );
  }

  if (!month || record.isError || !record.data) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Reported Bookings</h1>
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          No monthly results have been published yet.
          {me.data?.role === "admin" && (
            <> An admin can publish a month via <code>PUT /api/monthly-results/&#123;month&#125;</code>.</>
          )}{" "}
          In the meantime, the{" "}
          <Link to="/dashboard/summary" className="font-medium text-foreground underline">
            team performance dashboard
          </Link>{" "}
          has live per-AE numbers.
        </div>
      </div>
    );
  }

  const rec = record.data;
  const basis = rec.bases[basisKey];
  const table = basis?.periods[period];
  if (!basis || !table) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        {rec.label}: no data for this period/basis.
      </div>
    );
  }

  const netchex = table.rows.reduce(
    (s, r) => ({
      actual: s.actual + r.actual,
      plan: s.plan + r.plan,
      py_actual: s.py_actual + r.py_actual,
    }),
    { actual: 0, plan: 0, py_actual: 0 },
  );
  const hm = table.higherme;
  const total = {
    actual: netchex.actual + (hm?.actual ?? 0),
    plan: netchex.plan + (hm?.plan ?? 0),
    py_actual: netchex.py_actual + (hm?.py_actual ?? 0),
  };
  const planVar = total.actual - total.plan;
  const range = periodRange(rec.month, period);

  const planned = table.rows.filter((r) => r.plan > 0);
  const topBeat = [...planned]
    .filter((r) => r.actual - r.plan > 0)
    .sort((a, b) => b.actual - b.plan - (a.actual - a.plan))[0];
  const topMiss = [...planned]
    .filter((r) => r.actual - r.plan < 0)
    .sort((a, b) => a.actual - a.plan - (b.actual - b.plan))[0];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">
              {rec.label} — Reported Bookings
            </h1>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                rec.status === "final"
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-yellow-300 bg-yellow-50 text-yellow-900",
              )}
            >
              {rec.status === "final" ? "Final" : "Preliminary"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {rec.source_note || "Finance-reported actuals vs plan and prior year."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(index.data?.months.length ?? 0) > 1 && (
            <select
              aria-label="Report month"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={rec.month}
              onChange={(e) => setSearch({ month: e.target.value })}
            >
              {index.data!.months.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <div
            role="group"
            aria-label="Period"
            className="flex overflow-hidden rounded-md border border-border"
          >
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={p.key === period}
                onClick={() =>
                  setSearch({ period: p.key === "mtd" ? undefined : p.key })
                }
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  p.key === period
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Basis</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={basisKey}
              onChange={(e) =>
                setSearch({
                  basis:
                    e.target.value === "amt_annualized"
                      ? undefined
                      : e.target.value,
                })
              }
            >
              {Object.entries(rec.bases).map(([k, b]) => (
                <option key={k} value={k}>{b.label}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Headline: one number, qualified by its two comparisons. */}
      <section className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total bookings · {PERIOD_LONG[period]}
          </div>
          <div className="text-4xl font-bold tabular-nums tracking-tight">
            {fmtCurrency(total.actual)}
          </div>
        </div>
        <HeroDelta label="vs plan" value={planVar} display={fmtSigned(planVar)} />
        <HeroDelta
          label="vs prior year"
          value={total.actual - total.py_actual}
          display={fmtPyPct(total.actual, total.py_actual)}
        />
      </section>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {planVar >= 0 ? (
          <>
            <b className="font-semibold text-foreground">{fmtSigned(planVar)} ahead of plan</b>
            {topBeat && <>, led by {topBeat.bucket} ({fmtSigned(topBeat.actual - topBeat.plan)})</>}
            {topMiss && <>; {topMiss.bucket} trails plan by {fmtSigned(topMiss.actual - topMiss.plan)}</>}.
          </>
        ) : (
          <>
            <b className="font-semibold text-foreground">{fmtSigned(planVar)} behind plan</b>
            {topMiss && <>, driven by {topMiss.bucket} ({fmtSigned(topMiss.actual - topMiss.plan)})</>}
            {topBeat && <>; {topBeat.bucket} beat plan by {fmtSigned(topBeat.actual - topBeat.plan)}</>}.
          </>
        )}
      </p>

      <BucketTable table={{ rows: table.rows }} netchex={netchex} hm={hm} total={total} riaas={riaas} />

      <section>
        <h2 className="mb-2 flex flex-wrap items-center gap-x-4 text-sm font-medium text-muted-foreground">
          <span>Netchex bookings by month ({basis.label})</span>
          <span className="flex items-center gap-3 text-xs font-normal">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[hsl(222,47%,33%)]" aria-hidden="true" />
              Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-[hsl(222,20%,40%)]" aria-hidden="true" />
              Plan
            </span>
          </span>
        </h2>
        <div className="rounded-lg border border-border p-4">
          <Suspense
            fallback={<div className="h-52 text-sm text-muted-foreground">Loading trend…</div>}
          >
            <MonthlyTrendChart
              months={rec.trend_months}
              actual={basis.trend_actual}
              plan={rec.trend_plan}
            />
          </Suspense>
        </div>
      </section>

      <SourceStrip from={range.from} to={range.to} periodLabel={PERIOD_LONG[period]} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {riaas && (
          <DeepLink
            title="Why — Win/Loss drivers"
            body="Conversion, cycle and qualification analysis behind these numbers."
            to="/org/chapters/$slug"
            params={{ slug: "win-loss" }}
          />
        )}
        <DeepLink
          title="Who — Team performance"
          body="Per-AE bookings and pipeline for this period, all sources."
          to="/dashboard/summary"
          search={{ period: "custom", from: range.from, to: range.to }}
        />
        {riaas && (
          <DeepLink
            title="Risk — Pipeline health"
            body="Composition and deals at risk for the coming months."
            to="/org/chapters/$slug"
            params={{ slug: "pipeline-health" }}
          />
        )}
        {riaas && (
          <DeepLink
            title="Act — Coaching focus"
            body="People insights: where skill gaps concentrate across the team."
            to="/org/chapters/$slug"
            params={{ slug: "coach" }}
          />
        )}
      </section>
    </div>
  );
}

function HeroDelta({
  label,
  value,
  display,
}: {
  label: string;
  value: number;
  display: string;
}) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="pb-0.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "flex items-center gap-1 text-lg font-semibold tabular-nums",
          up ? "text-green-700" : "text-red-600",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {display}
      </div>
    </div>
  );
}

function VarianceBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <span className="inline-flex h-3 w-24 items-center align-middle" aria-hidden="true">
      <span className="relative h-full flex-1">
        {value < 0 && (
          <span
            className="absolute inset-y-0.5 right-0 rounded-sm bg-red-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </span>
      <span className="h-full w-px shrink-0 bg-muted-foreground/60" />
      <span className="relative h-full flex-1">
        {value >= 0 && (
          <span
            className="absolute inset-y-0.5 left-0 rounded-sm bg-green-600"
            style={{ width: `${pct}%` }}
          />
        )}
      </span>
    </span>
  );
}

interface Tot {
  actual: number;
  plan: number;
  py_actual: number;
}

function BucketTable({
  table,
  netchex,
  hm,
  total,
  riaas,
}: {
  table: { rows: MonthlyBucketRow[] };
  netchex: Tot;
  hm: MonthlyBucketRow | null;
  total: Tot;
  riaas: boolean;
}) {
  const maxVar = Math.max(
    1,
    ...table.rows.map((r) => Math.abs(r.actual - r.plan)),
    hm ? Math.abs(hm.actual - hm.plan) : 0,
  );

  const numCls = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";
  const varCls = (v: number): string =>
    cn(numCls, "font-medium", v >= 0 ? "text-green-700" : "text-red-600");

  const row = (
    r: MonthlyBucketRow,
    opts: { sub?: boolean; total?: boolean; why?: boolean } = {},
  ) => {
    const v = r.actual - r.plan;
    const motion = bucketMotion(r.bucket);
    const p = pyPct(r.actual, r.py_actual);
    return (
      <tr
        key={r.bucket}
        className={cn(
          "group border-b border-border last:border-b-0",
          opts.total && "border-t-2 border-t-foreground font-semibold",
        )}
      >
        <td
          className={cn(
            "px-3 py-1.5",
            opts.sub ? "text-muted-foreground" : "font-medium",
          )}
        >
          {r.bucket}
          {opts.why && riaas && motion && (
            <Link
              to="/org/chapters/$slug"
              params={{ slug: "win-loss" }}
              search={{ motion }}
              className="ml-2 text-xs font-medium text-muted-foreground opacity-0 transition-opacity hover:underline focus:opacity-100 group-hover:opacity-100"
            >
              why →
            </Link>
          )}
        </td>
        <td className={numCls}>{fmtCurrency(r.actual)}</td>
        <td className={cn(numCls, "text-muted-foreground")}>
          {r.plan !== 0 || !opts.sub ? fmtCurrency(r.plan) : "—"}
        </td>
        <td className={varCls(v)}>{fmtSigned(v)}</td>
        <td className="px-3 py-1.5 text-center">
          <VarianceBar value={v} max={maxVar} />
        </td>
        <td className={cn(numCls, "text-muted-foreground")}>
          {r.py_actual !== 0 ? fmtCurrency(r.py_actual) : "—"}
        </td>
        <td
          className={cn(
            numCls,
            p == null
              ? "text-muted-foreground"
              : p >= 0
                ? "font-medium text-green-700"
                : "font-medium text-red-600",
          )}
        >
          {fmtPyPct(r.actual, r.py_actual)}
        </td>
      </tr>
    );
  };

  return (
    <section>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Bookings type</th>
              <th className="px-3 py-2 text-right font-semibold">Actual</th>
              <th className="px-3 py-2 text-right font-semibold">Plan</th>
              <th className="px-3 py-2 text-right font-semibold">Var vs plan</th>
              <th className="px-3 py-2 text-center font-semibold" aria-label="Variance chart">±</th>
              <th className="px-3 py-2 text-right font-semibold">PY actual</th>
              <th className="px-3 py-2 text-right font-semibold">vs PY</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => row(r, { why: true }))}
            {row({ bucket: "Netchex subtotal", ...netchex }, { sub: true })}
            {hm && row(hm, { sub: true })}
            {row({ bucket: "Total bookings", ...total }, { total: true })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Unmapped/Other carries no plan line (de-minimis adjustments); plan shows
        $0 so the total ties to the four planned categories.
      </p>
    </section>
  );
}

/** Source labels (split-credit) → team dashboard section slugs. */
const SOURCE_SECTION: Record<string, string> = {
  "Self Gen": "self-gen",
  Channel: "channel",
  SDR: "sdr",
  Marketing: "marketing",
};

/**
 * The other lens on the same dollars: bookings by *source*, aggregated across
 * all AEs from the live dashboard for the report period. Each tile links to
 * the per-AE section page at the same period.
 */
function SourceStrip({
  from,
  to,
  periodLabel,
}: {
  from: string;
  to: string;
  periodLabel: string;
}) {
  const filters: FilterState = {
    manager: null,
    aeIds: [],
    period: "custom",
    from,
    to,
    aeDrillId: null,
  };
  const dash = useDashboard(filters);
  const cols = useColumnMeta();

  const heading = (
    <h2 className="mb-2 text-sm font-medium text-muted-foreground">
      Bookings by source · {periodLabel} — the same dollars, split by who
      created the pipeline
    </h2>
  );

  if (dash.isError) {
    return (
      <section>
        {heading}
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Live source breakdown unavailable right now (Salesforce). Per-AE
          numbers are on the{" "}
          <Link
            to="/dashboard/summary"
            search={{ period: "custom", from, to }}
            className="font-medium text-foreground underline"
          >
            team dashboard
          </Link>
          .
        </div>
      </section>
    );
  }

  const specs = cols.data?.all_source_summary ?? [];
  const rows = dash.data?.all_source_summary ?? [];
  const totals = specs.map((s, i) => ({
    label: s.label,
    bookings: rows.reduce((sum, r) => sum + (r.sources[i]?.bookings ?? 0), 0),
  }));
  const known =
    rows.length === 0 ? [] : totals.filter((t) => SOURCE_SECTION[t.label]);

  return (
    <section>
      {heading}
      {dash.isLoading || cols.isLoading ? (
        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          Loading source breakdown…
        </div>
      ) : known.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          No source data for this period.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {known.map((t) => (
            <Link
              key={t.label}
              to="/dashboard/section/$slug"
              params={{ slug: SOURCE_SECTION[t.label] }}
              search={{ period: "custom", from, to }}
              className="rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:bg-accent"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t.label}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {fmtCurrency(t.bookings)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Per-AE detail →
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function DeepLink({
  title,
  body,
  to,
  params,
  search,
}: {
  title: string;
  body: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}) {
  return (
    <Link
      to={to}
      params={params as never}
      search={search as never}
      className="rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-accent"
    >
      <div className="text-sm font-semibold">{title} →</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</div>
    </Link>
  );
}
