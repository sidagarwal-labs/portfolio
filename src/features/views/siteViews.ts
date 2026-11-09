export const siteViews = [
  { id: "os", label: "Lab OS", description: "A tiny computer: search, apps, and games." },
  { id: "journal", label: "Journal", description: "The original: quiet and text-first." },
  { id: "search", label: "Search", description: "Boots up a computer, then a search engine for my work." },
  { id: "forward", label: "Forward pass", description: "The site as a transformer: tokens, attention, next token." },
  { id: "training", label: "Training run", description: "A notebook whose model trains as you read." },
  { id: "terminal", label: "Terminal", description: "A market terminal for my work and research." }
] as const;

export type SiteView = (typeof siteViews)[number]["id"];

export const defaultView: SiteView = "os";

/* Pages other than the homepage (articles, robotics) always use the journal styles. */
export const baseView: SiteView = "journal";

export function isSiteView(value: unknown): value is SiteView {
  return siteViews.some((view) => view.id === value);
}

/* Shared by every view so nav links, legacy redirects, and view switching land on the same places. */
export const homeSectionIds = ["intro", "lab", "writing", "impact", "library", "contact"];
