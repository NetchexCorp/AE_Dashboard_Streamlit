export const CHART_GRID = "hsl(220 13% 91%)";
export const CHART_BAR = "hsl(222 47% 33%)";
export const CHART_LINE = "hsl(160 65% 38%)";
export const CHART_TICK = { fontSize: 11 } as const;
export const CHART_CURSOR = { fill: "rgba(0,0,0,0.04)" } as const;

// Categorical palette for multi-series charts (first two match bar/line).
export const CHART_SERIES = [
  "hsl(222 47% 33%)",
  "hsl(160 65% 38%)",
  "hsl(27 87% 55%)",
  "hsl(262 45% 55%)",
  "hsl(348 65% 50%)",
  "hsl(199 70% 45%)",
] as const;

export const CHART_NEGATIVE = "hsl(0 60% 55%)";
export const CHART_WARNING = "hsl(35 85% 55%)";
export const CHART_POSITIVE = "hsl(160 65% 38%)";
