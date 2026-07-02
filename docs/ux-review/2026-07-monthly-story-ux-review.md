# UX Review — Monthly Story & Information Architecture

**Date:** July 2026 · **Scope:** full frontend (`/dashboard` + `/org`) · **Reference data:** June 2026 Bookings Results workbook (Actual vs Plan vs PY, MTD/QTD/YTD, by Bookings Type)

## Verdict

The product ships two well-built but disconnected tools under one shell — a per-AE
operations table and a RIaaS analysis library — and the story leadership actually
tells every month (reported bookings vs plan vs prior year) isn't in the product at
all; it lives in Excel. The fix is not more features. It is one narrative spine:
**The Month → why → who → what to do about it**, with every page reachable from,
and linking back to, that spine.

---

## Findings

### F1 — The story's opening page doesn't exist
`/` redirects to `/dashboard/summary` (`frontend/src/router.tsx`), a 17-column
per-AE table. That is chapter three of the story. Chapter one — "June came in at
$1.48M against a $1.26M plan, +$218K, +167% over PY" — is produced by hand in the
June 2026 workbook and never touches the app. The single most-reported set of
numbers has no home, no history, and no links into the tooling that explains it.

### F2 — Two products, one shell
`SideNav.tsx` renders "Individual Performance" and "Organization Performance" as
parallel universes:

- Duplicated vocabulary: two **Reports** entries (`/schedules`, `/org/report`) —
  both are *email schedule managers*, neither is a report you can read — and two
  **Config** entries.
- Two filter systems that don't share state or vocabulary: `FilterBar`
  (Manager / AE / time-period with custom dates) vs the chapter header's
  Period / Motion selects (`this_quarter`, `last_4_quarters`).
- Zero cross-links. No route in either world references the other.

This is the "two different things merged in one screen" feeling: the seam is the
information architecture, not the visual styling.

### F3 — Summary, individual, and coaching never reference each other
- `AEDrillDownDrawer` shows an AE's numbers but offers no path to the Coach
  chapter's people insights (C4 skill/coaching analyses) for that AE.
- Coach chapter leaderboards (`C4-SKILL-LEADERBOARD`, `C4-COACH-FOCUS`) name AEs
  but never link to their dashboard row or drawer.
- The chapter's **Key Findings** — the narrative, the one thing a strategy meeting
  opens with — renders at the *bottom* of `ChapterRoute`, below every chart. The
  conclusion is filed after the appendix.

### F4 — A KPI wall instead of a headline
`KpiRow` renders 12 identical cards in two rows of six, with no hierarchy, no
plan/PY comparison on any card, and one derived signal (open-pipeline shortfall).
It repeats unchanged on every `/dashboard` sub-page. Twelve numbers of equal
visual weight is zero headlines.

### F5 — Tables carry the column registry's structure, not the reader's
- `AllSourceSummary`: ~17 currency columns with sentence-length headers ("Open
  Pipeline Needed to Quota with Current Month Close") — the header is wider than
  the data; the sources aren't visually grouped (flat `Self Gen Bookings /
  Self Gen Pipeline / Channel Bookings / …` run).
- The five section pages are named after *data sources* (Self-Gen, SDR, Channel,
  Marketing) — the registry's shape, not a user question.
- `DataTable.tsx` (717 lines) applies global search + column filters + CSV export
  + grouping + sticky columns to every table regardless of size or need. This is
  the "built for the sake of building" pattern: power features as default
  furniture rather than answers to demonstrated needs.

### F6 — "Charts" is a format, not a destination
`/dashboard/charts` is a page named after its rendering technology. Its two bar
charts (Bookings YTD, Attainment %) are the visual explanation of the summary
table and belong beside it, not behind a nav item.

### F7 — The Org overview is a dead landing
`OrgPerformanceRoute` renders five link cards with no data, no findings excerpt,
no freshness signal. A table of contents with no summary — precisely where a
strategy meeting would want "the five headlines, one per chapter."

---

## Proposed information architecture — one story, five stops

```
1. The Month            ← NEW home. Reported numbers as a story:
   (monthly results)      headline vs plan vs PY → by bookings type (MTD/QTD/YTD,
                          both bases) → trend vs plan → "go deeper" links
2. Revenue Intelligence ← existing /org chapters, findings-FIRST:
                          overview shows each chapter's Key Findings excerpt;
                          chapter pages pin Key Findings at top
3. Team Performance     ← existing /dashboard (summary + sections + charts inline)
4. Coaching             ← Coach chapter promoted to a top-level stop,
                          cross-linked with AE drawer both ways
5. Admin                ← merged: Schedules (one page, both digest types),
                          Config (SOQL/Salesforce/Users/Roster/RIaaS), Activity
```

### The cross-link loop (summaries ⇄ detail)

| From | Link | To |
|---|---|---|
| The Month — bucket row | "Which AEs drove this" | Team Performance, filtered to period |
| The Month — bucket row | "Why — win/loss drivers" | Relevant RIaaS chapter |
| The Month — coaching card | Coach chapter | Coaching |
| AE drill-down drawer | "Coaching insights for {AE}" | Coach chapter, `?ae=` |
| Coach leaderboard row | AE name | AE drill-down drawer |
| RIaaS overview | Key Findings excerpt | Chapter, findings pinned top |
| Chapter page | "See individual numbers" | Team Performance |

### The dimension model — two lenses on the same dollar

Every bookings dollar has two independent dimensions, and today each lives in
only one half of the product:

- **Motion (bookings type)** — *what kind of revenue*: New-Direct, New-Reseller,
  Cross-Sell, Upsell. This is the workbook's row dimension
  (`Opportunity.Revenue_Type__c` / groupable `RecordType.Name` in SFDC), and it
  already rolls up to RIaaS's existing motion filter:
  `nb` = New-Direct + New-Reseller, `exp` = Cross-Sell + Upsell
  (`query_builder.py` NEW_BUSINESS_TYPES / EXPANSION_TYPES).
- **Source** — *who created the pipeline*: Self-Gen, SDR, Channel, Marketing.
  This is the dashboard's split-credit column dimension (All-Source Summary).

Both lenses must be available at both altitudes:

| | Org level | Individual level |
|---|---|---|
| **By motion** | The Month bucket table (new) | Per-AE bookings-by-type columns (P3 — same `SUM(SplitAmount)` pattern as `S1-COL-D`, one variant per RecordType) |
| **By source** | Source strip on The Month, aggregated from the dashboard API (new) | All-Source Summary + AE drawer (exists today) |

And the filters connect them: a Month bucket row links onward carrying
`motion=nb|exp`, so landing in a Win/Loss or Pipeline Health chapter arrives
pre-filtered to the motion you were reading about; the source strip links into
the matching section page (Self-Gen, SDR, Channel, Marketing) at the same
period.

### Shared vocabulary
One period model everywhere: `MTD / QTD / YTD` on The Month maps to the team
dashboard's period params (`this_month`, or a custom from/to range for QTD/YTD)
and to chapter periods, carried in the URL so a link from one stop lands on the
same period — and the same motion — in the next.

---

## Table readability rules (apply everywhere)

1. **Short header + tooltip long-name** — headers are ≤ 2 words ("Open Pipe",
   "Needed"); the sentence-long registry name moves into the tooltip (pattern
   already half-exists in `withTooltip`).
2. **Group headers over source pairs** — one "Self-Gen" group header spanning
   Bookings/Pipeline, instead of repeating the source in every column name.
3. **Variance is a column, not homework** — anywhere Actual and Plan/PY coexist,
   render the delta with sign and color+symbol (never color alone).
4. **Feature per table, not per component** — search/filters/export/grouping are
   opt-in per table; a 10-row table gets none of them.
5. **Right-align numbers, `tabular-nums`, one decimal rule per column** —
   already mostly true; make it a lint rule of the DataTable API.

---

## Implementation plan

> **Status:** Phases 1 and 2 are implemented on this branch. The Month is
> served from stored *reported* results (finance-blessed, one JSON document
> per month, seeded with June 2026) rather than live SOQL — matching how the
> numbers are actually produced; live derivation can replace the store later
> without changing the page. Phase 3 (table pass + per-AE motion columns)
> remains open.

**Phase 1 — IA restructure (frontend only, no new data)**
Re-group SideNav into the five stops; merge the two Reports pages into Admin;
pin Key Findings to the top of chapters; put findings excerpts on the RIaaS
overview; add AE drawer ⇄ Coach cross-links; fold Charts into Summary.

**Phase 2 — The Month (new page + backend)**
- `GET /api/monthly-results?period=mtd|qtd|ytd&basis=annualized|w2` — actuals
  derived in SOQL using the workbook's Mapping Detail rules (SFDC Source ×
  Revenue Type → Bookings Type); the mapping ties out to zero variance per the
  workbook's own check row, so it is safe to codify.
- Plan-by-month stored in Table Storage with an admin editor/upload (mirrors
  `Bookings_Plan_by_Month.xlsx`); HigherMe as a manual monthly entry.
- Page: headline (Total vs Plan vs PY) → bucket table with variance → monthly
  trend vs plan → deep-dive links. Basis toggle mirrors the workbook's two tabs.

**Phase 3 — Table pass + per-AE motion split**
Apply the five readability rules to AllSourceSummary, section tables, and RIaaS
matrix/table renderers; per-table feature flags in the DataTable API. Add
per-AE bookings-by-type columns (New / Cross-Sell / Upsell) to the column
registry and AE drawer so the motion lens exists at the individual level too.
