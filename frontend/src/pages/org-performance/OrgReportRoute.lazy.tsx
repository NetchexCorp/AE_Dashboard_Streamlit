import { createLazyRoute } from "@tanstack/react-router";
import { OrgReportRoute } from "./OrgReportRoute";

export const Route = createLazyRoute("/org/report")({
  component: OrgReportRoute,
});
