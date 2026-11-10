import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  GitHubLookupError, curateOwnInsights, isValidLogin, loadInsights, normalizeLogin, normalizeRestEvents, validateInsights, type RestEvent, type RestRepo
} from "../../src/features/views/os/github/client";
import { OWN_HIDDEN_REPOS, type GitHubInsights } from "../../src/features/views/os/github/contract";

const snapshot = JSON.parse(readFileSync(new URL("../../src/content/generated/github-insights.json", import.meta.url), "utf8")) as GitHubInsights;
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const expectContiguous = (days: { date: string }[]) => days.slice(1).forEach((day, i) => expect(day.date).toBe(nextDay(days[i].date)));

const user = { login: "Octo", name: "Octo Cat", avatar_url: "https://avatars.githubusercontent.com/u/1", html_url: "https://github.com/Octo", bio: "" };
const repo = (name: string, extra: Partial<RestRepo> = {}): RestRepo => ({
  name, full_name: `Octo/${name}`, html_url: `https://github.com/Octo/${name}`, description: null, language: "TypeScript", size: 42,
  stargazers_count: 3, forks_count: 1, created_at: "2024-01-01T00:00:00Z", pushed_at: "2026-11-01T00:00:00Z", fork: false, private: false,
  owner: { login: "Octo" }, ...extra
});
const event = (type: string, created_at: string, repoName: string, payload: RestEvent["payload"] = {}): RestEvent =>
  ({ type, created_at, repo: { name: repoName }, payload, public: true });

test.describe("REST events fallback", () => {
  const now = new Date("2026-11-10T15:00:00Z");
  const events: RestEvent[] = [
    event("PushEvent", "2026-11-10T14:00:00Z", "Octo/alpha"),
    event("PushEvent", "2026-11-10T01:00:00Z", "Octo/alpha"),
    event("PullRequestEvent", "2026-11-01T12:00:00Z", "Octo/alpha", { action: "opened" }),
    event("PullRequestEvent", "2026-11-02T12:00:00Z", "Octo/alpha", { action: "closed" }),
    event("PullRequestReviewEvent", "2026-10-20T12:00:00Z", "someone/else", { action: "created" }),
    event("IssuesEvent", "2026-09-01T12:00:00Z", "Octo/gamma", { action: "opened" }),
    event("CreateEvent", "2026-08-13T00:00:00Z", "Octo/gamma", { ref_type: "repository" }),
    event("CreateEvent", "2026-08-14T00:00:00Z", "Octo/gamma", { ref_type: "branch" }),
    event("PushEvent", "2026-08-12T23:59:59Z", "Octo/alpha"),
    { ...event("PushEvent", "2026-11-09T12:00:00Z", "Octo/secret"), public: false }
  ];
  const repos = [repo("alpha"), repo("beta", { fork: true }), repo("secret", { private: true }), repo("gamma", { language: null, pushed_at: "2026-11-05T00:00:00Z" }), repo("theirs", { owner: { login: "someone" } })];
  const out = normalizeRestEvents(user, repos, events, now);

  test("covers 90 contiguous UTC days ending today", () => {
    expect(out.source).toBe("rest-events");
    expect(out.range).toEqual({ from: "2026-08-13", to: "2026-11-10" });
    expect(out.days).toHaveLength(90);
    expectContiguous(out.days);
    expect(out.days[0]).toEqual({ date: "2026-08-13", count: 1 });
    expect(out.days.at(-1)).toEqual({ date: "2026-11-10", count: 2 });
    expect(out.days.reduce((sum, day) => sum + day.count, 0)).toBe(out.totals.contributions);
  });

  test("counts public events by type", () => {
    expect(out.totals).toEqual({ contributions: 8, commits: 2, pullRequests: 1, reviews: 1, issues: 1, repositories: 1, restricted: 0 });
  });

  test("keeps owned public non-fork repos with per-day activity", () => {
    expect(out.repos.map((item) => item.name)).toEqual(["alpha", "gamma"]);
    const [alpha, gamma] = out.repos;
    expect(alpha.activity).toEqual([{ date: "2026-11-01", count: 1 }, { date: "2026-11-02", count: 1 }, { date: "2026-11-10", count: 2 }]);
    expect(alpha.languages).toEqual([{ name: "TypeScript", size: 0 }]);
    expect(alpha).toMatchObject({ diskUsageKb: 42, stars: 3, forks: 1, isFork: false, primaryLanguage: "TypeScript" });
    expect(gamma).toMatchObject({ primaryLanguage: null, languages: [] });
    expect(gamma.activity.map((day) => day.date)).toEqual(["2026-08-13", "2026-08-14", "2026-09-01"]);
  });

  test("never includes private repositories", () => {
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  test("produces data that passes validation", () => {
    expect(validateInsights(out)).toEqual(out);
  });
});

test.describe("validateInsights", () => {
  test("accepts the generated snapshot unchanged", () => {
    expect(validateInsights(snapshot)).toEqual(snapshot);
  });

  test("drops unknown fields such as privacy flags", () => {
    const leaky = { ...snapshot, extra: true, repos: snapshot.repos.map((item) => ({ ...item, isPrivate: false })) };
    const clean = validateInsights(leaky);
    expect(clean).toEqual(snapshot);
    expect(JSON.stringify(clean)).not.toContain("isPrivate");
  });

  test("rejects broken payloads", () => {
    const broken: unknown[] = [
      null,
      [],
      "nope",
      { ...snapshot, version: 2 },
      { ...snapshot, source: "scraped" },
      { ...snapshot, login: "bad login" },
      { ...snapshot, generatedAt: "yesterday" },
      { ...snapshot, days: snapshot.days.filter((_, i) => i !== 10) },
      { ...snapshot, days: snapshot.days.slice(1) },
      { ...snapshot, days: [...snapshot.days].reverse() },
      { ...snapshot, days: snapshot.days.map((day, i) => (i === 3 ? { ...day, count: -1 } : day)) },
      { ...snapshot, days: snapshot.days.map((day, i) => (i === 3 ? { ...day, count: 1.5 } : day)) },
      { ...snapshot, range: { from: "2026-02-30", to: snapshot.range.to } },
      { ...snapshot, totals: { ...snapshot.totals, commits: "many" } },
      { ...snapshot, repos: undefined },
      { ...snapshot, repos: [{ ...snapshot.repos[0], stars: -1 }] },
      { ...snapshot, repos: [{ ...snapshot.repos[0], isFork: "no" }] },
      { ...snapshot, repos: [{ ...snapshot.repos[0], activity: [{ date: "1999-01-01", count: 1 }] }] },
      { ...snapshot, repos: [{ ...snapshot.repos[0], activity: [{ date: snapshot.range.to, count: 1 }, { date: snapshot.range.from, count: 1 }] }] }
    ];
    for (const payload of broken) {
      let error: unknown;
      try {
        validateInsights(payload);
      } catch (caught) {
        error = caught;
      }
      expect(error, JSON.stringify(payload)?.slice(0, 80)).toBeInstanceOf(GitHubLookupError);
      expect((error as GitHubLookupError).kind).toBe("invalid-data");
    }
  });
});

test.describe("loadInsights without a proxy (mocked REST)", () => {
  const realFetch = globalThis.fetch;
  let requests: string[] = [];
  const mockFetch = (handler: (url: string) => Response | Promise<Response>) => {
    requests = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      return handler(url);
    }) as typeof fetch;
  };
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("loads user, repos, and public events, stopping at a short page", async () => {
    mockFetch((url) => {
      if (url.endsWith("/users/octo")) return Response.json({ ...user, type: "User" });
      if (url.includes("/repos?")) return Response.json([repo("alpha")]);
      return Response.json([event("PushEvent", new Date().toISOString(), "Octo/alpha")]);
    });
    const out = await loadInsights(" @Octo ");
    expect(out).toMatchObject({ login: "Octo", source: "rest-events", totals: { contributions: 1, commits: 1 } });
    expect(out.repos[0].activity).toHaveLength(1);
    expect(requests.every((url) => url.startsWith("https://api.github.com/users/octo"))).toBe(true);
    expect(requests.filter((url) => url.includes("/events/public"))).toEqual(["https://api.github.com/users/octo/events/public?per_page=100&page=1"]);
  });

  test("reports anonymous rate limits with the reset time", async () => {
    mockFetch(() => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000" } }));
    const error = await loadInsights("octo").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitHubLookupError);
    expect(error).toMatchObject({ kind: "rate-limited", resetAt: new Date(1_790_000_000_000).toISOString() });
  });

  test("maps 404, organizations, network failures, and invalid logins", async () => {
    mockFetch(() => new Response("{}", { status: 404 }));
    await expect(loadInsights("ghost")).rejects.toMatchObject({ kind: "not-found" });
    mockFetch(() => Response.json({ ...user, type: "Organization" }));
    await expect(loadInsights("some-org")).rejects.toMatchObject({ kind: "not-found" });
    mockFetch(() => { throw new TypeError("Failed to fetch"); });
    await expect(loadInsights("octo")).rejects.toMatchObject({ kind: "network" });
    mockFetch(() => { throw new Error("should not be called"); });
    await expect(loadInsights("not a login")).rejects.toMatchObject({ kind: "invalid-login" });
    expect(requests).toHaveLength(0);
  });
});

test("logins are normalized and validated", () => {
  expect(normalizeLogin("  @SidAgarwal-Labs ")).toBe("sidagarwal-labs");
  expect(normalizeLogin("https://github.com/Octo/")).toBe("octo");
  expect(normalizeLogin("github.com/octo")).toBe("octo");
  for (const login of ["sidagarwal-labs", "a", "A1", "x".repeat(39)]) expect(isValidLogin(login), login).toBe(true);
  for (const login of ["", "-abc", "a_b", "x".repeat(40), "a/b", "../etc", "a b", "octo.cat"]) expect(isValidLogin(login), login).toBe(false);
});

test("the committed snapshot is a full public GraphQL year", () => {
  expect(snapshot).toMatchObject({ version: 1, login: "sidagarwal-labs", source: "graphql" });
  expect(snapshot.days.length).toBeGreaterThanOrEqual(365);
  expect(snapshot.days.length).toBeLessThanOrEqual(372);
  expect(snapshot.days[0].date).toBe(snapshot.range.from);
  expect(snapshot.days.at(-1)?.date).toBe(snapshot.range.to);
  expectContiguous(snapshot.days);
  expect(snapshot.days.reduce((sum, day) => sum + day.count, 0)).toBe(snapshot.totals.contributions);
  expect(snapshot.repos.length).toBeGreaterThan(0);
  expect(snapshot.repos.length).toBeLessThanOrEqual(30);
  expect(new Set(snapshot.repos.map((item) => item.nameWithOwner.toLowerCase())).size).toBe(snapshot.repos.length);
  for (const item of snapshot.repos) {
    // Only contract fields: nothing that could carry privacy metadata.
    expect(Object.keys(item).sort()).toEqual(
      ["activity", "createdAt", "description", "diskUsageKb", "forks", "isFork", "languages", "name", "nameWithOwner", "primaryLanguage", "pushedAt", "stars", "url"]
    );
    expect(item.url).toBe(`https://github.com/${item.nameWithOwner}`);
    expect(item.nameWithOwner.endsWith(`/${item.name}`)).toBe(true);
  }
});

test("tutorial repositories are hidden for the owner only", () => {
  const hidden = new Set(OWN_HIDDEN_REPOS.map((name) => name.toLowerCase()));
  const curated = curateOwnInsights(snapshot);
  expect(curated.repos.length).toBeGreaterThan(0);
  expect(curated.repos.filter((item) => hidden.has(item.name.toLowerCase()))).toEqual([]);
  expect(curated.repos).toEqual(snapshot.repos.filter((item) => !hidden.has(item.name.toLowerCase())));
  expect(curated.days).toBe(snapshot.days);
  expect(curated.totals).toBe(snapshot.totals);

  const hiddenName = OWN_HIDDEN_REPOS[0];
  const ownRepo = { ...snapshot.repos[0], name: hiddenName, nameWithOwner: `${snapshot.login}/${hiddenName}` };
  const shouted = { ...snapshot, login: snapshot.login.toUpperCase(), repos: [...snapshot.repos, ownRepo] };
  expect(curateOwnInsights(shouted).repos.some((item) => item.name === hiddenName)).toBe(false);

  const other = { ...snapshot, login: "octo", repos: [{ ...ownRepo, nameWithOwner: `octo/${hiddenName}` }] };
  expect(curateOwnInsights(other)).toBe(other);
});
