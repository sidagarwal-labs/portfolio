import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchInsights, GitHubInsightsError, INSIGHTS_QUERY, isValidLogin, MAX_REPOS, normalizeGraphql, occurredAtToDate, USER_AGENT
} from "../src/insights.mjs";
import { graphqlData, repo } from "./fixtures.mjs";

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
  });

  it("treats a null user as not found", () => {
    assert.throws(() => normalizeGraphql({ user: null }), (error) => error instanceof GitHubInsightsError && error.code === "not-found" && error.status === 404);
  });
});

describe("fetchInsights", () => {
  it("posts the query with auth and user agent headers", async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, init };
      return graphqlResponse({ data: graphqlData() });
    };
    const out = await fetchInsights("octo", { token: "t0ken", fetchImpl, now });
    assert.equal(out.login, "Octo");
    assert.equal(call.url, "https://api.github.com/graphql");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.Authorization, "bearer t0ken");
    assert.equal(call.init.headers["User-Agent"], USER_AGENT);
    assert.deepEqual(JSON.parse(call.init.body), { query: INSIGHTS_QUERY, variables: { login: "octo" } });
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
