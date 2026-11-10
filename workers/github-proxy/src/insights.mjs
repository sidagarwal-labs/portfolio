/*
 * GitHub GraphQL -> GitHubInsights (src/features/views/os/github/contract.ts).
 * Dependency-free so it runs in Node 20+ (build-time snapshot) and Cloudflare Workers (proxy).
 * Privacy: repositories unless isPrivate === false are dropped; private work only survives as anonymous counts.
 */
export const INSIGHTS_VERSION = 1;
export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
export const USER_AGENT = "agarwal-labs-github-insights";
export const MAX_REPOS = 30;
/** Matches commitContributionsByRepository(maxRepositories: 25), so every repository with commits can get an all-time count. */
export const MAX_COMMIT_TOTALS = 25;

const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const DAY_MS = 86_400_000;

export const INSIGHTS_QUERY = `query GitHubInsights($login: String!) {
  user(login: $login) {
    id login name avatarUrl url bio
    contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions
      totalIssueContributions totalRepositoryContributions restrictedContributionsCount
      commitContributionsByRepository(maxRepositories: 25) {
        repository { ...RepoFields }
        contributions(first: 100, orderBy: {field: OCCURRED_AT, direction: ASC}) { nodes { occurredAt commitCount } }
      }
    }
    repositories(first: 30, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes { ...RepoFields }
    }
  }
}
fragment RepoFields on Repository {
  id name nameWithOwner url description isPrivate isFork createdAt pushedAt diskUsage stargazerCount forkCount
  primaryLanguage { name }
  languages(first: 8, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } }
}`;

/**
 * All-time commits on each repository's default branch authored by the user. Needs the node ids from INSIGHTS_QUERY,
 * so it runs as a second request (rate-limit cost 1 for up to MAX_COMMIT_TOTALS repositories).
 */
export const COMMIT_TOTALS_QUERY = `query GitHubCommitTotals($ids: [ID!]!, $userId: ID!) {
  nodes(ids: $ids) {
    ... on Repository {
      id
      defaultBranchRef { target { ... on Commit { history(author: {id: $userId}) { totalCount } } } }
    }
  }
}`;

export class GitHubInsightsError extends Error {
  /**
   * @param {"invalid-login" | "not-found" | "rate-limited" | "upstream" | "misconfigured"} code
   * @param {number} status HTTP status the proxy answers with
   * @param {string} message
   * @param {number} [retryAfter] seconds until GitHub accepts requests again
   */
  constructor(code, status, message, retryAfter) {
    super(message);
    this.name = "GitHubInsightsError";
    this.code = code;
    this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

export const isValidLogin = (login) => typeof login === "string" && LOGIN_PATTERN.test(login);

export const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (date) => Date.parse(`${date}T00:00:00Z`);

/** Contiguous ascending days from..to (inclusive); dates missing from `counts` get 0. */
export function fillDays(from, to, counts) {
  const days = [];
  for (let ms = dayMs(from), end = dayMs(to); ms <= end; ms += DAY_MS) {
    const date = toDay(ms);
    days.push({ date, count: counts.get(date) ?? 0 });
  }
  return days;
}

/** occurredAt is the user's local midnight in UTC; +12h lands inside that local date for offsets in (-12h, +12h]. */
export const occurredAtToDate = (occurredAt) => toDay(Date.parse(occurredAt) + DAY_MS / 2);

const int = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const isCount = (value) => Number.isInteger(value) && value >= 0;

function repoInsight(repo, activity, allTimeCommits) {
  return {
    name: repo.name,
    nameWithOwner: repo.nameWithOwner,
    url: repo.url,
    description: repo.description || null,
    primaryLanguage: repo.primaryLanguage?.name ?? null,
    languages: (repo.languages?.edges ?? [])
      .filter((edge) => edge?.node?.name)
      .map((edge) => ({ name: edge.node.name, size: int(edge.size) }))
      .sort((a, b) => b.size - a.size),
    diskUsageKb: int(repo.diskUsage),
    stars: int(repo.stargazerCount),
    forks: int(repo.forkCount),
    createdAt: repo.createdAt,
    pushedAt: repo.pushedAt ?? null,
    isFork: Boolean(repo.isFork),
    activity,
    ...(isCount(allTimeCommits) ? { allTimeCommits } : {})
  };
}

const activityTotal = (repo) => repo.activity.reduce((sum, day) => sum + day.count, 0);

/** Public repositories (isPrivate === false) that have commit contributions in the INSIGHTS_QUERY data. */
const publicContributionRepos = (data) =>
  (data?.user?.contributionsCollection?.commitContributionsByRepository ?? [])
    .map((entry) => entry?.repository)
    .filter((repo) => repo && repo.isPrivate === false);

/**
 * @param {{ user: any }} data GraphQL `data` for INSIGHTS_QUERY
 * @param {{ now?: Date, allTimeCommits?: Map<string, number> }} [options] allTimeCommits: repository node id -> count (queryAllTimeCommits)
 */
export function normalizeGraphql(data, { now = new Date(), allTimeCommits = new Map() } = {}) {
  const user = data?.user;
  if (!user) throw new GitHubInsightsError("not-found", 404, "GitHub user not found");
  const collection = user.contributionsCollection;
  const calendar = collection?.contributionCalendar;
  const calendarCounts = new Map();
  for (const week of calendar?.weeks ?? []) {
    for (const day of week?.contributionDays ?? []) calendarCounts.set(day.date, int(day.contributionCount));
  }
  const dates = [...calendarCounts.keys()].sort();
  if (!dates.length) throw new GitHubInsightsError("upstream", 502, "GitHub returned an empty contribution calendar");
  const range = { from: dates[0], to: dates[dates.length - 1] };

  const repos = new Map();
  for (const entry of collection.commitContributionsByRepository ?? []) {
    const repo = entry?.repository;
    if (!repo || repo.isPrivate !== false || repos.has(repo.nameWithOwner)) continue;
    const perDay = new Map();
    for (const node of entry.contributions?.nodes ?? []) {
      const date = occurredAtToDate(node.occurredAt);
      if (date >= range.from && date <= range.to) perDay.set(date, (perDay.get(date) ?? 0) + int(node.commitCount));
    }
    const activity = [...perDay]
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count }));
    repos.set(repo.nameWithOwner, repoInsight(repo, activity, allTimeCommits.get(repo.id)));
  }
  for (const repo of user.repositories?.nodes ?? []) {
    if (repo?.isPrivate === false && !repo.isFork && !repos.has(repo.nameWithOwner)) {
      repos.set(repo.nameWithOwner, repoInsight(repo, [], allTimeCommits.get(repo.id)));
    }
  }
  const ranked = [...repos.values()]
    .sort((a, b) => activityTotal(b) - activityTotal(a) || (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""))
    .slice(0, MAX_REPOS);

  return {
    version: INSIGHTS_VERSION,
    login: user.login,
    name: user.name || null,
    avatarUrl: user.avatarUrl,
    htmlUrl: user.url,
    bio: user.bio || null,
    generatedAt: now.toISOString(),
    range,
    source: "graphql",
    totals: {
      contributions: int(calendar.totalContributions),
      commits: int(collection.totalCommitContributions),
      pullRequests: int(collection.totalPullRequestContributions),
      reviews: int(collection.totalPullRequestReviewContributions),
      issues: int(collection.totalIssueContributions),
      repositories: int(collection.totalRepositoryContributions),
      restricted: int(collection.restrictedContributionsCount)
    },
    days: fillDays(range.from, range.to, calendarCounts),
    repos: ranked
  };
}

function retryAfterSeconds(headers, now) {
  const retryAfter = Number(headers.get("retry-after") ?? NaN);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.ceil(retryAfter);
  const reset = Number(headers.get("x-ratelimit-reset") ?? NaN);
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, Math.ceil(reset - now.getTime() / 1000));
  return undefined;
}

const rateLimited = (retryAfter) => new GitHubInsightsError("rate-limited", 429, "GitHub rate limit reached", retryAfter);

/** POSTs one GraphQL query; maps transport, HTTP, and rate-limit failures to GitHubInsightsError. Returns `data` and `errors`. */
async function postGraphql(query, variables, { token, fetchImpl = fetch, now = new Date(), signal, timeoutMs = 20_000 }) {
  let response;
  try {
    response = await fetchImpl(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: { Authorization: `bearer ${token}`, "User-Agent": USER_AGENT, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: signal ?? AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new GitHubInsightsError("upstream", 502, "GitHub request failed");
  }
  const limited = response.status === 429 ||
    (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")));
  if (limited) throw rateLimited(retryAfterSeconds(response.headers, now));
  if (!response.ok) throw new GitHubInsightsError("upstream", 502, `GitHub responded with HTTP ${response.status}`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new GitHubInsightsError("upstream", 502, "GitHub returned invalid JSON");
  }
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.some((error) => error?.type === "RATE_LIMITED")) throw rateLimited(retryAfterSeconds(response.headers, now));
  return { data: payload?.data, errors };
}

/** Runs INSIGHTS_QUERY and returns the raw GraphQL `data`, which can include private repos: always normalize it. */
export async function queryInsights(login, options = {}) {
  if (!isValidLogin(login)) throw new GitHubInsightsError("invalid-login", 400, "Invalid GitHub login");
  if (!options.token) throw new GitHubInsightsError("misconfigured", 500, "GitHub token is not configured");
  const { data, errors } = await postGraphql(INSIGHTS_QUERY, { login }, options);
  if (data && data.user === null) throw new GitHubInsightsError("not-found", 404, "GitHub user not found");
  if (errors.length || !data?.user) throw new GitHubInsightsError("upstream", 502, "GitHub returned an incomplete response");
  return data;
}

/**
 * Runs COMMIT_TOTALS_QUERY for the public repositories with commit contributions in `data` (from queryInsights).
 * Returns repository node id -> all-time default-branch commits by the user. Repositories GitHub could not count
 * (empty, no default branch, or a per-node error) are left out; the request itself fails like queryInsights.
 */
export async function queryAllTimeCommits(data, options = {}) {
  const userId = data?.user?.id;
  const ids = [...new Set(publicContributionRepos(data).map((repo) => repo.id).filter((id) => typeof id === "string" && id))]
    .slice(0, MAX_COMMIT_TOTALS);
  const totals = new Map();
  if (typeof userId !== "string" || !userId || !ids.length) return totals;
  if (!options.token) throw new GitHubInsightsError("misconfigured", 500, "GitHub token is not configured");
  const { data: result } = await postGraphql(COMMIT_TOTALS_QUERY, { ids, userId }, { timeoutMs: 10_000, ...options });
  if (!Array.isArray(result?.nodes)) throw new GitHubInsightsError("upstream", 502, "GitHub returned an incomplete response");
  const wanted = new Set(ids);
  for (const node of result.nodes) {
    const total = node?.defaultBranchRef?.target?.history?.totalCount;
    if (wanted.has(node?.id) && isCount(total)) totals.set(node.id, total);
  }
  return totals;
}

/** Insights for one user. All-time commit counts are optional: if that second request fails, they are left out. */
export async function fetchInsights(login, options = {}) {
  const data = await queryInsights(login, options);
  const allTimeCommits = await queryAllTimeCommits(data, options).catch(() => new Map());
  try {
    return normalizeGraphql(data, { now: options.now ?? new Date(), allTimeCommits });
  } catch (error) {
    if (error instanceof GitHubInsightsError) throw error;
    throw new GitHubInsightsError("upstream", 502, "GitHub returned an unexpected response");
  }
}
