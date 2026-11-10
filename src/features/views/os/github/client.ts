import { GITHUB_INSIGHTS_VERSION, OWN_GITHUB_LOGIN, type DayCount, type GitHubInsights, type GitHubRepoInsight } from "./contract";

const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const REST_DAYS = 90;
const REST_API = "https://api.github.com";
const EVENT_PAGES = 3;
const PAGE_SIZE = 100;
const MAX_REPOS = 30;

export type GitHubLookupErrorKind = "invalid-login" | "not-found" | "rate-limited" | "network" | "invalid-data";

export class GitHubLookupError extends Error {
  readonly kind: GitHubLookupErrorKind;
  /** ISO time when GitHub accepts requests again (rate-limited only, when known). */
  readonly resetAt?: string;

  constructor(kind: GitHubLookupErrorKind, message: string, resetAt?: string) {
    super(message);
    this.name = "GitHubLookupError";
    this.kind = kind;
    this.resetAt = resetAt;
  }
}

/** Accepts "octocat", "@octocat", or a github.com profile URL; lowercased because logins are case-insensitive. */
export const normalizeLogin = (input: string) =>
  input.trim().replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "").replace(/^@/, "").replace(/\/+$/, "").toLowerCase();

export const isValidLogin = (login: string) => LOGIN_PATTERN.test(login);

const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const nextDay = (date: string) => toDay(dayMs(date) + DAY_MS);

/* ---------- validation ---------- */

type Json = Record<string, unknown>;
const invalid = (message: string): never => {
  throw new GitHubLookupError("invalid-data", `Invalid GitHub data: ${message}`);
};
const record = (value: unknown, field: string): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : invalid(field);
const list = (value: unknown, field: string): unknown[] => (Array.isArray(value) ? value : invalid(field));
const text = (value: unknown, field: string): string => (typeof value === "string" ? value : invalid(field));
const nullableText = (value: unknown, field: string): string | null => (value === null || value === undefined ? null : text(value, field));
const count = (value: unknown, field: string): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : invalid(field);
const date = (value: unknown, field: string): string => {
  const ms = typeof value === "string" && DATE_PATTERN.test(value) ? dayMs(value) : NaN;
  return Number.isFinite(ms) && toDay(ms) === value ? (value as string) : invalid(field);
};

function dayCounts(value: unknown, field: string, range: { from: string; to: string }, contiguous: boolean): DayCount[] {
  const days = list(value, field).map((item, i) => {
    const day = record(item, `${field}[${i}]`);
    return { date: date(day.date, `${field}[${i}].date`), count: count(day.count, `${field}[${i}].count`) };
  });
  days.forEach((day, i) => {
    if (day.date < range.from || day.date > range.to) invalid(`${field} outside range`);
    if (i && (contiguous ? day.date !== nextDay(days[i - 1].date) : day.date <= days[i - 1].date)) invalid(`${field} order`);
  });
  if (contiguous && (days[0]?.date !== range.from || days[days.length - 1]?.date !== range.to)) invalid(`${field} does not cover range`);
  return days;
}

function repoInsight(value: unknown, i: number, range: { from: string; to: string }): GitHubRepoInsight {
  const repo = record(value, `repos[${i}]`);
  const field = (name: string) => `repos[${i}].${name}`;
  if (typeof repo.isFork !== "boolean") invalid(field("isFork"));
  return {
    name: text(repo.name, field("name")),
    nameWithOwner: text(repo.nameWithOwner, field("nameWithOwner")),
    url: text(repo.url, field("url")),
    description: nullableText(repo.description, field("description")),
    primaryLanguage: nullableText(repo.primaryLanguage, field("primaryLanguage")),
    languages: list(repo.languages, field("languages")).map((item, j) => {
      const language = record(item, field(`languages[${j}]`));
      return { name: text(language.name, field(`languages[${j}].name`)), size: count(language.size, field(`languages[${j}].size`)) };
    }),
    diskUsageKb: count(repo.diskUsageKb, field("diskUsageKb")),
    stars: count(repo.stars, field("stars")),
    forks: count(repo.forks, field("forks")),
    createdAt: text(repo.createdAt, field("createdAt")),
    pushedAt: nullableText(repo.pushedAt, field("pushedAt")),
    isFork: repo.isFork as boolean,
    activity: dayCounts(repo.activity, field("activity"), range, false)
  };
}

/** Checks a snapshot or proxy payload against the contract and returns a clean copy (unknown fields dropped). */
export function validateInsights(value: unknown): GitHubInsights {
  const data = record(value, "payload");
  if (data.version !== GITHUB_INSIGHTS_VERSION) invalid("version");
  if (data.source !== "graphql" && data.source !== "rest-events") invalid("source");
  const login = text(data.login, "login");
  if (!isValidLogin(login)) invalid("login");
  const generatedAt = text(data.generatedAt, "generatedAt");
  if (Number.isNaN(Date.parse(generatedAt))) invalid("generatedAt");
  const rangeValue = record(data.range, "range");
  const range = { from: date(rangeValue.from, "range.from"), to: date(rangeValue.to, "range.to") };
  if (range.from > range.to || (dayMs(range.to) - dayMs(range.from)) / DAY_MS > 400) invalid("range");
  const totals = record(data.totals, "totals");
  return {
    version: GITHUB_INSIGHTS_VERSION,
    login,
    name: nullableText(data.name, "name"),
    avatarUrl: text(data.avatarUrl, "avatarUrl"),
    htmlUrl: text(data.htmlUrl, "htmlUrl"),
    bio: nullableText(data.bio, "bio"),
    generatedAt,
    range,
    source: data.source as GitHubInsights["source"],
    totals: {
      contributions: count(totals.contributions, "totals.contributions"),
      commits: count(totals.commits, "totals.commits"),
      pullRequests: count(totals.pullRequests, "totals.pullRequests"),
      reviews: count(totals.reviews, "totals.reviews"),
      issues: count(totals.issues, "totals.issues"),
      repositories: count(totals.repositories, "totals.repositories"),
      restricted: count(totals.restricted, "totals.restricted")
    },
    days: dayCounts(data.days, "days", range, true),
    repos: list(data.repos, "repos").map((repo, i) => repoInsight(repo, i, range))
  };
}

/* ---------- REST fallback (unauthenticated, public events only) ---------- */

export interface RestUser {
  login: string;
  name?: string | null;
  avatar_url: string;
  html_url: string;
  bio?: string | null;
}

export interface RestRepo {
  name: string;
  full_name: string;
  html_url: string;
  description?: string | null;
  language?: string | null;
  size?: number;
  stargazers_count?: number;
  forks_count?: number;
  created_at: string;
  pushed_at?: string | null;
  fork?: boolean;
  private?: boolean;
  owner?: { login: string };
}

export interface RestEvent {
  type: string;
  created_at: string;
  public?: boolean;
  repo?: { name: string };
  payload?: { action?: string; ref_type?: string };
}

const nonNegative = (value: number | undefined) => (typeof value === "number" && value > 0 ? Math.floor(value) : 0);
const bump = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

/** GitHubInsights from public REST data: the 90 UTC days ending on `now`, one count per public event. */
export function normalizeRestEvents(user: RestUser, repos: RestRepo[], events: RestEvent[], now: Date): GitHubInsights {
  const to = toDay(now.getTime());
  const range = { from: toDay(dayMs(to) - (REST_DAYS - 1) * DAY_MS), to };
  const totals = { contributions: 0, commits: 0, pullRequests: 0, reviews: 0, issues: 0, repositories: 0, restricted: 0 };
  const perDay = new Map<string, number>();
  const perRepo = new Map<string, Map<string, number>>();
  for (const event of events) {
    const day = typeof event.created_at === "string" ? event.created_at.slice(0, 10) : "";
    if (event.public === false || !DATE_PATTERN.test(day) || day < range.from || day > range.to) continue;
    totals.contributions += 1;
    bump(perDay, day);
    const repoName = event.repo?.name?.toLowerCase();
    if (repoName) perRepo.set(repoName, bump(perRepo.get(repoName) ?? new Map<string, number>(), day));
    const action = event.payload?.action;
    if (event.type === "PushEvent") totals.commits += 1;
    else if (event.type === "PullRequestEvent" && action === "opened") totals.pullRequests += 1;
    else if (event.type === "PullRequestReviewEvent") totals.reviews += 1;
    else if (event.type === "IssuesEvent" && action === "opened") totals.issues += 1;
    else if (event.type === "CreateEvent" && event.payload?.ref_type === "repository") totals.repositories += 1;
  }

  const owner = user.login.toLowerCase();
  const insights: GitHubRepoInsight[] = repos
    .filter((repo) => repo.private !== true && !repo.fork && (!repo.owner || repo.owner.login.toLowerCase() === owner))
    .map((repo) => ({
      name: repo.name,
      nameWithOwner: repo.full_name,
      url: repo.html_url,
      description: repo.description || null,
      primaryLanguage: repo.language || null,
      languages: repo.language ? [{ name: repo.language, size: 0 }] : [],
      diskUsageKb: nonNegative(repo.size),
      stars: nonNegative(repo.stargazers_count),
      forks: nonNegative(repo.forks_count),
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at ?? null,
      isFork: false,
      activity: [...(perRepo.get(repo.full_name.toLowerCase()) ?? [])]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, count]) => ({ date, count }))
    }));
  const activityTotal = (repo: GitHubRepoInsight) => repo.activity.reduce((sum, day) => sum + day.count, 0);
  insights.sort((a, b) => activityTotal(b) - activityTotal(a) || (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));

  const days: DayCount[] = [];
  for (let day = range.from; day <= range.to; day = nextDay(day)) days.push({ date: day, count: perDay.get(day) ?? 0 });

  return {
    version: GITHUB_INSIGHTS_VERSION,
    login: user.login,
    name: user.name || null,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url,
    bio: user.bio || null,
    generatedAt: now.toISOString(),
    range,
    source: "rest-events",
    totals,
    days,
    repos: insights.slice(0, MAX_REPOS)
  };
}

const isAbort = (error: unknown, signal?: AbortSignal) => signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");

function rateLimitError(response: Response): GitHubLookupError | undefined {
  if (response.status !== 403 && response.status !== 429) return undefined;
  const reset = Number(response.headers.get("x-ratelimit-reset") ?? NaN);
  const retryAfter = Number(response.headers.get("retry-after") ?? NaN);
  const limited = response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0" || Number.isFinite(retryAfter);
  if (!limited) return undefined;
  const resetAt = Number.isFinite(reset) && reset > 0
    ? new Date(reset * 1000).toISOString()
    : Number.isFinite(retryAfter) ? new Date(Date.now() + retryAfter * 1000).toISOString() : undefined;
  return new GitHubLookupError("rate-limited", "GitHub's hourly limit for anonymous requests was reached.", resetAt);
}

async function restJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${REST_API}${path}`, { headers: { Accept: "application/vnd.github+json" }, signal });
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    throw new GitHubLookupError("network", "GitHub could not be reached.");
  }
  const limited = rateLimitError(response);
  if (limited) throw limited;
  if (response.status === 404) throw new GitHubLookupError("not-found", "No GitHub user with that name.");
  if (!response.ok) throw new GitHubLookupError("network", `GitHub responded with HTTP ${response.status}.`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new GitHubLookupError("invalid-data", "GitHub returned an unreadable response.");
  }
}

async function loadFromRest(login: string, signal?: AbortSignal): Promise<GitHubInsights> {
  const user = await restJson<RestUser & { type?: string }>(`/users/${login}`, signal);
  if (user.type && user.type !== "User") throw new GitHubLookupError("not-found", "That account is an organization, not a user.");
  const loadEvents = async () => {
    const events: RestEvent[] = [];
    for (let page = 1; page <= EVENT_PAGES; page += 1) {
      const batch = await restJson<RestEvent[]>(`/users/${login}/events/public?per_page=${PAGE_SIZE}&page=${page}`, signal);
      if (!Array.isArray(batch)) throw new GitHubLookupError("invalid-data", "GitHub returned unexpected events.");
      events.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return events;
  };
  const [repos, events] = await Promise.all([
    restJson<RestRepo[]>(`/users/${login}/repos?per_page=100&type=owner&sort=pushed`, signal),
    loadEvents()
  ]);
  if (!Array.isArray(repos)) throw new GitHubLookupError("invalid-data", "GitHub returned unexpected repositories.");
  try {
    return validateInsights(normalizeRestEvents(user, repos, events, new Date()));
  } catch (error) {
    if (error instanceof GitHubLookupError) throw error;
    throw new GitHubLookupError("invalid-data", "GitHub returned unexpected data.");
  }
}

/* ---------- proxy and snapshot ---------- */

/** Returns undefined when the proxy is unreachable or failing, so the caller falls back to REST. */
async function loadFromProxy(base: string, login: string, signal?: AbortSignal): Promise<GitHubInsights | undefined> {
  let response: Response;
  try {
    response = await fetch(`${base}/github/v1/users/${encodeURIComponent(login)}`, { signal });
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return undefined;
  }
  if (response.status >= 500) return undefined;
  if (response.status === 404) throw new GitHubLookupError("not-found", "No GitHub user with that name.");
  if (response.status === 400) throw new GitHubLookupError("invalid-login", "That is not a valid GitHub username.");
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? NaN);
    const resetAt = Number.isFinite(retryAfter) ? new Date(Date.now() + retryAfter * 1000).toISOString() : undefined;
    throw new GitHubLookupError("rate-limited", "Too many lookups; try again shortly.", resetAt);
  }
  if (!response.ok) return undefined;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GitHubLookupError("invalid-data", "The GitHub proxy returned an unreadable response.");
  }
  const insights = validateInsights(payload);
  if (insights.login.toLowerCase() !== login) throw new GitHubLookupError("invalid-data", "The GitHub proxy returned a different user.");
  return insights;
}

let ownSnapshot: Promise<GitHubInsights> | undefined;

/** The build-time snapshot written by `npm run data:github`, loaded on demand. */
export function loadOwnInsights(): Promise<GitHubInsights> {
  ownSnapshot ??= import("../../../../content/generated/github-insights.json")
    .then((module) => validateInsights(module.default))
    .catch((error: unknown) => {
      ownSnapshot = undefined;
      throw error instanceof GitHubLookupError ? error : new GitHubLookupError("network", "The saved GitHub snapshot could not be loaded.");
    });
  return ownSnapshot;
}

const proxyBase = () => import.meta.env?.VITE_GITHUB_PROXY_URL?.trim().replace(/\/+$/, "") || undefined;

/**
 * Own login -> build snapshot. Others -> the proxy (full-year GraphQL) when VITE_GITHUB_PROXY_URL is set,
 * falling back to unauthenticated REST (last 90 days of public events) if the proxy is unreachable or failing.
 */
export async function loadInsights(login: string, { signal }: { signal?: AbortSignal } = {}): Promise<GitHubInsights> {
  const normalized = normalizeLogin(login);
  if (!isValidLogin(normalized)) throw new GitHubLookupError("invalid-login", "That is not a valid GitHub username.");
  if (normalized === OWN_GITHUB_LOGIN.toLowerCase()) return loadOwnInsights();
  const base = proxyBase();
  if (base) {
    const viaProxy = await loadFromProxy(base, normalized, signal);
    if (viaProxy) return viaProxy;
  }
  return loadFromRest(normalized, signal);
}
