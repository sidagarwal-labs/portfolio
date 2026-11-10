import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMIT_TOTALS_QUERY, fetchInsights, GitHubInsightsError, INSIGHTS_QUERY, isValidLogin, MAX_COMMIT_TOTALS, MAX_REPOS, normalizeGraphql, occurredAtToDate,
  queryAllTimeCommits, USER_AGENT
} from "../src/insights.mjs";
import { commitTotalsData, graphqlData, graphqlUpstream, repo } from "./fixtures.mjs";

const now = new Date("2026-11-10T12:00:00Z");
const graphqlResponse = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

describe("isValidLogin", () => {
  it("accepts GitHub-style logins", () => {
    for (const login of ["sidagarwal-labs", "a", "A1", "x".repeat(39), "octo-cat-2"]) assert.equal(isValidLogin(login), true, login);
  });
  it("rejects malformed logins", () => {
    for (const login of ["", "-abc", "a_b", "x".repeat(40), "a/b", "../etc", "a b", "octo.cat", undefined, 42]) assert.equal(isValidLogin(login), false, String(login));
  });
});

describe("normalizeGraphql", () => {
  it("never exposes private repositories by name", () => {
    const out = normalizeGraphql(graphqlData(), { now });
    assert.ok(!out.repos.some((item) => item.name === "secret-plan" || item.nameWithOwner === "Octo/secret-plan"));
    assert.ok(!JSON.stringify(out).includes("secret-plan"));
    assert.equal(out.totals.restricted, 7);
  });

  it("drops repositories whose privacy is unknown", () => {
    const data = graphqlData();
    data.user.repositories.nodes.push({ ...repo("mystery"), isPrivate: undefined });
    assert.ok(!JSON.stringify(normalizeGraphql(data, { now })).includes("mystery"));
  });

  it("builds contiguous, ascending, gap-filled days covering the range", () => {
    const out = normalizeGraphql(graphqlData(), { now });
    assert.deepEqual(out.range, { from: "2025-11-09", to: "2025-11-20" });
    assert.equal(out.days.length, 12);
    assert.deepEqual(out.days.map((day) => day.date), Array.from({ length: 12 }, (_, i) => `2025-11-${String(9 + i).padStart(2, "0")}`));
    assert.equal(out.days.find((day) => day.date === "2025-11-12").count, 0);
    assert.equal(out.days.find((day) => day.date === "2025-11-20").count, 4);
  });

  it("maps local-midnight occurredAt timestamps to the local date", () => {
    assert.equal(occurredAtToDate("2025-11-14T08:00:00Z"), "2025-11-14"); // UTC-8
    assert.equal(occurredAtToDate("2025-11-13T15:00:00Z"), "2025-11-14"); // UTC+9
    assert.equal(occurredAtToDate("2025-11-14T00:00:00Z"), "2025-11-14"); // UTC
    assert.equal(occurredAtToDate("2025-11-13T12:30:00Z"), "2025-11-14"); // UTC+11:30
  });

  it("aggregates commit contributions per date into sparse ascending activity", () => {
    const out = normalizeGraphql(graphqlData(), { now });
    const busy = out.repos.find((item) => item.name === "busy");
    assert.deepEqual(busy.activity, [{ date: "2025-11-10", count: 3 }, { date: "2025-11-14", count: 7 }]);
  });

  it("unions, de-duplicates, sorts, and caps repositories", () => {
    const out = normalizeGraphql(graphqlData({ ownedCount: 40 }), { now });
    assert.equal(out.repos.length, MAX_REPOS);
    assert.deepEqual(out.repos.slice(0, 2).map((item) => item.name), ["busy", "quiet"]);
    assert.equal(out.repos.filter((item) => item.name === "busy").length, 1);
    assert.ok(!out.repos.some((item) => item.name === "forked"));
    const idle = out.repos.slice(2);
    assert.ok(idle.every((item) => item.activity.length === 0));
    assert.deepEqual(idle.map((item) => item.pushedAt), [...idle.map((item) => item.pushedAt)].sort().reverse());
  });

  it("maps profile, totals, and repository fields", () => {
    const out = normalizeGraphql(graphqlData(), { now });
    assert.equal(out.version, 1);
    assert.equal(out.source, "graphql");
    assert.equal(out.generatedAt, now.toISOString());
    assert.deepEqual(
      { login: out.login, name: out.name, bio: out.bio, htmlUrl: out.htmlUrl },
      { login: "Octo", name: "Octo Cat", bio: null, htmlUrl: "https://github.com/Octo" }
    );
    assert.deepEqual(out.totals, { contributions: 18, commits: 10, pullRequests: 2, reviews: 1, issues: 3, repositories: 4, restricted: 7 });
    const busy = out.repos.find((item) => item.name === "busy");
    assert.deepEqual(busy.languages, [{ name: "TypeScript", size: 900 }, { name: "CSS", size: 100 }]);
    assert.equal(busy.primaryLanguage, "TypeScript");
    assert.equal(busy.diskUsageKb, 321);
    assert.equal(busy.stars, 5);
    assert.ok(!("isPrivate" in busy));
    assert.ok(!("id" in busy));
  });

  it("attaches all-time commit counts by repository node id", () => {
    const allTimeCommits = new Map([["R_busy", 42], ["R_quiet", 0], ["R_repo-0", 7], ["R_secret-plan", 99]]);
    const out = normalizeGraphql(graphqlData(), { now, allTimeCommits });
    const counts = Object.fromEntries(out.repos.map((item) => [item.name, item.allTimeCommits]));
    assert.deepEqual(counts, { busy: 42, quiet: 0, "repo-0": 7, "repo-1": undefined, "repo-2": undefined });
    assert.ok(!("allTimeCommits" in out.repos.find((item) => item.name === "repo-1")));
    assert.ok(!JSON.stringify(out).includes("secret-plan"));
  });

  it("leaves all-time commit counts out when they are missing or invalid", () => {
    assert.ok(normalizeGraphql(graphqlData(), { now }).repos.every((item) => !("allTimeCommits" in item)));
    const allTimeCommits = new Map([["R_busy", -1], ["R_quiet", 2.5], ["R_repo-0", "7"], ["R_repo-1", null]]);
    assert.ok(normalizeGraphql(graphqlData(), { now, allTimeCommits }).repos.every((item) => !("allTimeCommits" in item)));
  });

  it("treats a null user as not found", () => {
    assert.throws(() => normalizeGraphql({ user: null }), (error) => error instanceof GitHubInsightsError && error.code === "not-found" && error.status === 404);
  });
});

describe("queryAllTimeCommits", () => {
  const ok = (body) => async () => graphqlResponse(body);

  it("asks for the public repositories with commits, by node id and user id", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return graphqlUpstream()(url, init);
    };
    const totals = await queryAllTimeCommits(graphqlData(), { token: "t0ken", fetchImpl, now });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.github.com/graphql");
    assert.equal(calls[0].init.headers.Authorization, "bearer t0ken");
    assert.equal(calls[0].init.headers["User-Agent"], USER_AGENT);
    assert.deepEqual(JSON.parse(calls[0].init.body), { query: COMMIT_TOTALS_QUERY, variables: { ids: ["R_busy", "R_quiet"], userId: "U_octo" } });
    assert.deepEqual([...totals], [["R_busy", 42], ["R_quiet", 1]]);
  });

  it("queries each author's default-branch history", () => {
    assert.match(COMMIT_TOTALS_QUERY, /nodes\(ids: \$ids\)/);
    assert.match(COMMIT_TOTALS_QUERY, /defaultBranchRef \{ target \{ \.\.\. on Commit \{ history\(author: \{id: \$userId\}\) \{ totalCount \} \} \} \}/);
    assert.match(INSIGHTS_QUERY, /user\(login: \$login\) \{\s+id /);
    assert.match(INSIGHTS_QUERY, /fragment RepoFields on Repository \{\s+id /);
  });

  it("caps the ids and de-duplicates them", async () => {
    const data = graphqlData();
    const many = Array.from({ length: 30 }, (_, i) => ({ repository: repo(`many-${i}`), contributions: { nodes: [] } }));
    data.user.contributionsCollection.commitContributionsByRepository.push(...many, many[0]);
    let ids;
    await queryAllTimeCommits(data, { token: "t", now, fetchImpl: async (url, init) => {
      ids = JSON.parse(init.body).variables.ids;
      return graphqlResponse({ data: commitTotalsData(ids) });
    } });
    assert.equal(ids.length, MAX_COMMIT_TOTALS);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!ids.includes("R_secret-plan"));
  });

  it("keeps the counts GitHub could give and skips the rest", async () => {
    const node = (id, totalCount) => ({ id, defaultBranchRef: { target: { history: { totalCount } } } });
    const body = {
      data: { nodes: [node("R_busy", 42), { id: "R_quiet", defaultBranchRef: null }, node("R_unasked", 5), null] },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve to a node" }]
    };
    assert.deepEqual([...(await queryAllTimeCommits(graphqlData(), { token: "t", fetchImpl: ok(body), now }))], [["R_busy", 42]]);
    const odd = { data: { nodes: [node("R_busy", -3), node("R_quiet", "12")] } };
    assert.deepEqual([...(await queryAllTimeCommits(graphqlData(), { token: "t", fetchImpl: ok(odd), now }))], []);
  });

  it("makes no request when there is nothing to count", async () => {
    const fetchImpl = async () => assert.fail("fetch should not be called");
    const noId = graphqlData();
    delete noId.user.id;
    const noRepos = graphqlData();
    noRepos.user.contributionsCollection.commitContributionsByRepository = noRepos.user.contributionsCollection.commitContributionsByRepository
      .filter((entry) => entry.repository.isPrivate);
    for (const data of [noId, noRepos, { user: null }, undefined]) assert.equal((await queryAllTimeCommits(data, { token: "t", fetchImpl })).size, 0);
  });

  it("maps failures like the main query", async () => {
    await assert.rejects(queryAllTimeCommits(graphqlData(), { fetchImpl: ok({}) }), { code: "misconfigured", status: 500 });
    const limited = async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } });
    await assert.rejects(queryAllTimeCommits(graphqlData(), { token: "t", fetchImpl: limited, now }), { code: "rate-limited", retryAfter: 9 });
    const cases = [
      async () => { throw new TypeError("socket hang up"); },
      async () => new Response("Bad gateway", { status: 502 }),
      ok({ data: null, errors: [{ message: "Timeout" }] }),
      ok({ errors: [{ message: "Something broke" }] })
    ];
    for (const fetchImpl of cases) await assert.rejects(queryAllTimeCommits(graphqlData(), { token: "t", fetchImpl, now }), { code: "upstream", status: 502 });
  });
});

describe("fetchInsights", () => {
  it("posts both queries with auth and user agent headers", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return graphqlUpstream()(url, init);
    };
    const out = await fetchInsights("octo", { token: "t0ken", fetchImpl, now });
    assert.equal(out.login, "Octo");
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.url, "https://api.github.com/graphql");
      assert.equal(call.init.method, "POST");
      assert.equal(call.init.headers.Authorization, "bearer t0ken");
      assert.equal(call.init.headers["User-Agent"], USER_AGENT);
    }
    assert.deepEqual(JSON.parse(calls[0].init.body), { query: INSIGHTS_QUERY, variables: { login: "octo" } });
    assert.deepEqual(JSON.parse(calls[1].init.body), { query: COMMIT_TOTALS_QUERY, variables: { ids: ["R_busy", "R_quiet"], userId: "U_octo" } });
    assert.deepEqual(out.repos.map((item) => [item.name, item.allTimeCommits]).slice(0, 3), [["busy", 42], ["quiet", 1], ["repo-0", undefined]]);
  });

  it("still returns the insights when the all-time request fails", async () => {
    const expected = normalizeGraphql(graphqlData(), { now });
    const failures = [
      async () => { throw new TypeError("socket hang up"); },
      async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
      async () => graphqlResponse({ errors: [{ message: "Something broke" }] })
    ];
    for (const failure of failures) {
      const fetchImpl = async (url, init) => (JSON.parse(init.body).variables.ids ? failure() : graphqlResponse({ data: graphqlData() }));
      assert.deepEqual(await fetchInsights("octo", { token: "t", fetchImpl, now }), expected);
    }
  });

  it("rejects invalid logins and missing tokens without calling GitHub", async () => {
    const fetchImpl = async () => assert.fail("fetch should not be called");
    await assert.rejects(fetchInsights("../x", { token: "t", fetchImpl }), { code: "invalid-login", status: 400 });
    await assert.rejects(fetchInsights("octo", { fetchImpl }), { code: "misconfigured", status: 500 });
  });

  it("maps a missing user to not-found", async () => {
    const fetchImpl = async () => graphqlResponse({ data: { user: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve" }] });
    await assert.rejects(fetchInsights("ghost", { token: "t", fetchImpl }), { code: "not-found", status: 404 });
  });

  it("detects REST-style and GraphQL rate limits", async () => {
    const reset = String(now.getTime() / 1000 + 120);
    const limited = async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset } });
    await assert.rejects(fetchInsights("octo", { token: "t", fetchImpl: limited, now }), { code: "rate-limited", status: 429, retryAfter: 120 });
    const graphqlLimited = async () => graphqlResponse({ errors: [{ type: "RATE_LIMITED" }] }, { headers: { "retry-after": "30" } });
    await assert.rejects(fetchInsights("octo", { token: "t", fetchImpl: graphqlLimited, now }), { code: "rate-limited", retryAfter: 30 });
  });

  it("maps network, HTTP, and malformed responses to upstream errors", async () => {
    const cases = [
      async () => { throw new TypeError("socket hang up"); },
      async () => new Response("Bad credentials", { status: 401 }),
      async () => new Response("<html>", { status: 200 }),
      async () => graphqlResponse({ errors: [{ message: "Something broke" }] })
    ];
    for (const fetchImpl of cases) await assert.rejects(fetchInsights("octo", { token: "t", fetchImpl }), { code: "upstream", status: 502 });
  });
});
