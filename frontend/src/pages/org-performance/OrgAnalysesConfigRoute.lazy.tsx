import { createLazyRoute } from "@tanstack/react-router";
import { OrgAnalysesConfigRoute } from "./OrgAnalysesConfigRoute";

export const Route = createLazyRoute("/org/config/analyses")({
  component: OrgAnalysesConfigRoute,
});
