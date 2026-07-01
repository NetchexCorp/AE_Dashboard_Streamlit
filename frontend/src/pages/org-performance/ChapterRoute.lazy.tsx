import { createLazyRoute } from "@tanstack/react-router";
import { ChapterRoute } from "./ChapterRoute";

export const Route = createLazyRoute("/org/chapters/$slug")({
  component: ChapterRoute,
});
