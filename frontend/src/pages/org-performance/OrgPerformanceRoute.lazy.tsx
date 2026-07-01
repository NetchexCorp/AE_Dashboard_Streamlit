import { createLazyRoute } from "@tanstack/react-router";
import { OrgPerformanceRoute } from "./OrgPerformanceRoute";

export const Route = createLazyRoute("/org")({
  component: OrgPerformanceRoute,
});
