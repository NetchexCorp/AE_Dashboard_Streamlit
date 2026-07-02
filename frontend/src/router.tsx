import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardRoute } from "@/pages/DashboardRoute";
import { MonthRoute, type MonthSearch } from "@/pages/MonthRoute";
import { DashboardSectionRoute } from "@/pages/DashboardSectionRoute";
import { DashboardSummaryRoute } from "@/pages/DashboardSummaryRoute";
import type { FilterSearch } from "@/lib/filterParams";
import type { ChapterSearch } from "@/pages/org-performance/ChapterRoute";
import type { OrgReportSearch } from "@/pages/org-performance/OrgReportRoute";

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/month" });
  },
});

// "The Month" — reported bookings vs plan vs prior year; the story's opening
// page and the app's home.
const monthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/month",
  component: MonthRoute,
  validateSearch: (raw: Record<string, unknown>): MonthSearch => ({
    month: typeof raw.month === "string" ? raw.month : undefined,
    period: typeof raw.period === "string" ? raw.period : undefined,
    basis: typeof raw.basis === "string" ? raw.basis : undefined,
  }),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardRoute,
  validateSearch: (raw: Record<string, unknown>): FilterSearch => ({
    manager: typeof raw.manager === "string" ? raw.manager : undefined,
    ae: Array.isArray(raw.ae)
      ? (raw.ae as string[])
      : typeof raw.ae === "string"
        ? [raw.ae as string]
        : undefined,
    period: typeof raw.period === "string" ? raw.period : undefined,
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
    aeDrillId: typeof raw.aeDrillId === "string" ? raw.aeDrillId : undefined,
  }),
});

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/summary" });
  },
});

const dashboardSummaryRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "summary",
  component: DashboardSummaryRoute,
});

// Charts were folded into Summary; keep old links working.
const dashboardChartsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "charts",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/summary" });
  },
});

const dashboardSectionRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "section/$slug",
  component: DashboardSectionRoute,
});

const orgPerformanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/org",
}).lazy(() =>
  import("@/pages/org-performance/OrgPerformanceRoute.lazy").then(
    (m) => m.Route,
  ),
);

const orgChapterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/org/chapters/$slug",
  validateSearch: (raw: Record<string, unknown>): ChapterSearch => ({
    period: typeof raw.period === "string" ? raw.period : undefined,
    motion: typeof raw.motion === "string" ? raw.motion : undefined,
    section: typeof raw.section === "string" ? raw.section : undefined,
    seller: typeof raw.seller === "string" ? raw.seller : undefined,
  }),
}).lazy(() =>
  import("@/pages/org-performance/ChapterRoute.lazy").then((m) => m.Route),
);

const orgReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/org/report",
  validateSearch: (raw: Record<string, unknown>): OrgReportSearch => ({
    period: typeof raw.period === "string" ? raw.period : undefined,
    motion: typeof raw.motion === "string" ? raw.motion : undefined,
  }),
}).lazy(() =>
  import("@/pages/org-performance/OrgReportRoute.lazy").then((m) => m.Route),
);

const orgAnalysesConfigRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/org/config/analyses",
}).lazy(() =>
  import("@/pages/org-performance/OrgAnalysesConfigRoute.lazy").then(
    (m) => m.Route,
  ),
);

const orgFieldsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/org/config/fields",
}).lazy(() =>
  import("@/pages/org-performance/OrgFieldsRoute.lazy").then((m) => m.Route),
);

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules",
}).lazy(() => import("@/pages/SchedulesRoute.lazy").then((m) => m.Route));

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/config",
}).lazy(() => import("@/pages/ConfigRoute.lazy").then((m) => m.Route));

const configIndexRoute = createRoute({
  getParentRoute: () => configRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/config/soql" });
  },
});

const configSoqlRoute = createRoute({
  getParentRoute: () => configRoute,
  path: "soql",
}).lazy(() => import("@/pages/ConfigSoqlRoute.lazy").then((m) => m.Route));

const configSalesforceRoute = createRoute({
  getParentRoute: () => configRoute,
  path: "salesforce",
}).lazy(() =>
  import("@/pages/ConfigSalesforceRoute.lazy").then((m) => m.Route),
);

const configUsersRoute = createRoute({
  getParentRoute: () => configRoute,
  path: "users",
}).lazy(() => import("@/pages/ConfigUsersRoute.lazy").then((m) => m.Route));

const configRosterRoute = createRoute({
  getParentRoute: () => configRoute,
  path: "roster",
}).lazy(() => import("@/pages/ConfigRosterRoute.lazy").then((m) => m.Route));

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit",
}).lazy(() => import("@/pages/AuditRoute.lazy").then((m) => m.Route));

const routeTree = rootRoute.addChildren([
  indexRoute,
  monthRoute,
  dashboardRoute.addChildren([
    dashboardIndexRoute,
    dashboardSummaryRoute,
    dashboardChartsRoute,
    dashboardSectionRoute,
  ]),
  orgPerformanceRoute,
  orgChapterRoute,
  orgReportRoute,
  orgAnalysesConfigRoute,
  orgFieldsRoute,
  schedulesRoute,
  configRoute.addChildren([
    configIndexRoute,
    configSoqlRoute,
    configSalesforceRoute,
    configUsersRoute,
    configRosterRoute,
  ]),
  auditRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
