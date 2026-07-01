import { createLazyRoute } from "@tanstack/react-router";
import { OrgFieldsRoute } from "./OrgFieldsRoute";

export const Route = createLazyRoute("/org/config/fields")({
  component: OrgFieldsRoute,
});
