export const GITHUB_INSIGHTS_VERSION = 1;
export const OWN_GITHUB_LOGIN = "sidagarwal-labs";
/**
 * Old tutorial and duplicate repositories left out of the owner's repository views and models.
 * The contribution calendar and totals still count their activity.
 */
export const OWN_HIDDEN_REPOS: readonly string[] = ["odin-recipes", "html-boilerplate", "git-test", "gdp-dashboard-1"];

/** One calendar day (YYYY-MM-DD) and a non-negative integer count. */
export interface DayCount {
  date: string;
  count: number;
}

export interface GitHubRepoInsight {
  name: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  primaryLanguage: string | null;
  /** Bytes per language as reported by GitHub, largest first. */
  languages: { name: string; size: number }[];
  diskUsageKb: number;
  stars: number;
  forks: number;
  createdAt: string;
  pushedAt: string | null;
  isFork: boolean;
  /**
   * Sparse, ascending per-day activity by this user in the range.
   * source "graphql": commit contributions; source "rest-events": public events.
   */
  activity: DayCount[];
}

/**
 * Normalized GitHub activity for one user. Never contains private repository names:
 * private work only appears as anonymous calendar counts and `totals.restricted`.
 */
export interface GitHubInsights {
  version: typeof GITHUB_INSIGHTS_VERSION;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  generatedAt: string;
  /** Inclusive YYYY-MM-DD bounds that `days` covers exactly. */
  range: { from: string; to: string };
  /**
   * "graphql": full-year contribution calendar (build snapshot or proxy).
   * "rest-events": public events only, about the last 90 days, with no commit counts.
   */
  source: "graphql" | "rest-events";
  totals: {
    contributions: number;
    commits: number;
    pullRequests: number;
    reviews: number;
    issues: number;
    repositories: number;
    restricted: number;
  };
  /** Contiguous, ascending, one entry per date in `range`. */
  days: DayCount[];
  repos: GitHubRepoInsight[];
}
