export interface ChapterDef {
  slug: string;
  title: string;
  navLabel: string;
}

export const CHAPTERS: ChapterDef[] = [
  { slug: "gtm-overview", title: "GTM Efficiency Overview", navLabel: "GTM Overview" },
  { slug: "win-loss", title: "Win/Loss & Benchmark", navLabel: "Win/Loss" },
  { slug: "pipeline-health", title: "Pipeline Health Assessment", navLabel: "Pipeline Health" },
  { slug: "coach", title: "Coach (People Insights)", navLabel: "Coach" },
  { slug: "gtm-process", title: "GTM Process Optimisation", navLabel: "GTM Process" },
];

export function chapterBySlug(slug: string): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.slug === slug);
}
