import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import worker from "../src/index.mjs";
import { buildIssue, fenced, sanitizeComment } from "../src/feedback.mjs";

const TOKEN = "github_pat_feedback_should_never_leak";
const base = "https://api.agarwal-labs.com";
const site = "https://agarwal-labs.com";
const issuesUrl = "https://api.github.com/repos/sidagarwal-labs/portfolio/issues";

let calls;
let upstream;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  upstream = async () => new Response(JSON.stringify({ number: 101, html_url: "https://github.com/sidagarwal-labs/portfolio/issues/101", secret: "x" }), { status: 201 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return upstream(url, init);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const good = { rating: "up", comment: "Love the Markets app", context: { app: "markets", path: "/markets", view: "os", style: "retro" }, website: "" };

async function post(payload = good, { origin = site, env = { FEEDBACK_TOKEN: TOKEN }, type = "application/json", ip = "203.0.113.7", raw } = {}) {
  const headers = new Headers({ "CF-Connecting-IP": ip });
  if (origin) headers.set("Origin", origin);
  if (type) headers.set("Content-Type", type);
  const body = raw ?? JSON.stringify(payload);
  return worker.fetch(new Request(`${base}/feedback/v1`, { method: "POST", headers, body }), env, { waitUntil() {} });
}

const sentIssue = () => JSON.parse(calls[0].init.body);

describe("POST /feedback/v1", () => {
  it("creates a labeled issue and returns its number and URL", async () => {
    const response = await post();
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, number: 101, url: "https://github.com/sidagarwal-labs/portfolio/issues/101" });
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), site);
    assert.equal(response.headers.get("Cache-Control"), "no-store");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, issuesUrl);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
    const issue = sentIssue();
    assert.deepEqual(issue.labels, ["feedback", "thumbs-up"]);
    assert.equal(issue.title, "Feedback: 👍 on markets");
    assert.match(issue.body, /\*\*Rating:\*\* 👍 Thumbs up/);
    assert.match(issue.body, /```text\nLove the Markets app\n```/);
    assert.match(issue.body, /\| App \| `markets` \|/);
    assert.match(issue.body, /\| Path \| `\/markets` \|/);
    assert.match(issue.body, /\| View \| `os` \|/);
    assert.match(issue.body, /\| Style \| `retro` \|/);
    assert.match(issue.body, /\| Submitted \(UTC\) \| `\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z` \|/);
    assert.match(issue.body, /_Submitted from the site's feedback form\._$/);
    assert.ok(!issue.body.includes("203.0.113.7"));
  });

  it("labels thumbs down and never puts the comment in the title", async () => {
    const comment = "@octocat <img src=x onerror=alert(1)> ![x](https://evil.example/x.png) [link](https://evil.example)";
    const response = await post({ rating: "down", comment, context: { view: "os" } });
    assert.equal(response.status, 201);
    const issue = sentIssue();
    assert.deepEqual(issue.labels, ["feedback", "thumbs-down"]);
    assert.equal(issue.title, "Feedback: 👎 on os");
    assert.ok(!issue.title.includes("octocat") && !issue.title.includes("<"));
    assert.ok(issue.body.includes(`\`\`\`text\n${comment}\n\`\`\``));
  });

  it("uses a fence longer than any backtick run in the comment", async () => {
    const comment = "before\n```\n# not a heading @octocat\n`````\nafter ``";
    await post({ ...good, comment });
    const body = sentIssue().body;
    assert.ok(body.includes(`\`\`\`\`\`\`text\n${comment}\n\`\`\`\`\`\``));
    assert.equal(fenced("plain"), "```text\nplain\n```");
    assert.equal(fenced("a ```` b"), "`````text\na ```` b\n`````");
  });

  it("strips control and bidi characters and handles an empty comment", async () => {
    assert.equal(sanitizeComment("  a\u0000b\r\nc\u202Ed\u0007\te\u009B  "), "ab\ncd\te");
    await post({ rating: "up", context: {} });
    const issue = sentIssue();
    assert.equal(issue.title, "Feedback: 👍 on the site");
    assert.match(issue.body, /_No comment\._/);
    assert.ok(!issue.body.includes("| App |"));
  });

  it("builds a stable body for a fixed time", () => {
    const issue = buildIssue({ rating: "up", comment: "", context: { app: "github" } }, new Date("2026-11-11T17:00:00Z"));
    assert.match(issue.body, /\| Submitted \(UTC\) \| `2026-11-11T17:00:00.000Z` \|/);
  });

  it("rejects a filled honeypot", async () => {
    for (const website of ["https://spam.example", " ", 1]) {
      const response = await post({ ...good, website });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "invalid-feedback");
    }
    assert.equal(calls.length, 0);
  });

  it("rejects other origins with 403 and no CORS headers", async () => {
    for (const origin of ["https://evil.example", "https://agarwal-labs.com.evil.example", "null", null]) {
      const response = await post(good, { origin });
      assert.equal(response.status, 403, String(origin));
      assert.equal((await response.json()).code, "forbidden-origin");
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    }
    assert.equal(calls.length, 0);
  });

  it("rejects invalid ratings and context", async () => {
    const bad = [
      { ...good, rating: "sideways" },
      { ...good, rating: undefined },
      { ...good, rating: "__proto__" },
      { ...good, comment: 42 },
      { ...good, context: "os" },
      { ...good, context: { app: "Markets" } },
      { ...good, context: { app: "a".repeat(33) } },
      { ...good, context: { path: "/x y" } },
      { ...good, context: { path: "markets" } },
      { ...good, context: { path: "/a`b" } },
      { ...good, context: { path: "/a|b" } },
      { ...good, context: { style: "fancy" } },
      [good],
      null
    ];
    for (const payload of bad) {
      const response = await post(payload);
      assert.equal(response.status, 400, JSON.stringify(payload));
      assert.equal((await response.json()).code, "invalid-feedback");
    }
    const malformed = await post(undefined, { raw: "{not json" });
    assert.equal(malformed.status, 400);
    assert.equal(calls.length, 0);
  });

  it("rejects comments over 1000 characters", async () => {
    assert.equal((await post({ ...good, comment: "x".repeat(1000) })).status, 201);
    const response = await post({ ...good, comment: "x".repeat(1001) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "comment-too-long");
    assert.equal(calls.length, 1);
  });

  it("requires JSON and caps the body size", async () => {
    const form = await post(good, { type: "text/plain" });
    assert.equal(form.status, 415);
    assert.equal((await form.json()).code, "unsupported-media-type");
    const big = await post(undefined, { raw: JSON.stringify({ ...good, padding: "x".repeat(5000) }) });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).code, "payload-too-large");
    assert.equal((await post(good, { type: "application/json; charset=utf-8" })).status, 201);
  });

  it("returns 503 feedback-unavailable without a token", async () => {
    const response = await post(good, { env: {} });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Feedback is not available right now", code: "feedback-unavailable" });
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), site);
    assert.equal(calls.length, 0);
  });

  it("maps GitHub failures to 502 without leaking details or the token", async () => {
    const failures = [
      async () => new Response(`bad credentials ${TOKEN}`, { status: 401 }),
      async () => new Response("{}", { status: 403 }),
      async () => new Response("not json", { status: 201 }),
      async () => new Response(JSON.stringify({ number: 5, html_url: "https://evil.example/5" }), { status: 201 }),
      async () => { throw new Error(`network ${TOKEN}`); }
    ];
    for (const failure of failures) {
      upstream = failure;
      const response = await post();
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), { error: "GitHub is unavailable", code: "upstream" });
      assert.ok(!text.includes(TOKEN));
    }
  });

  it("enforces the per-IP feedback rate limit", async () => {
    const keys = [];
    const FEEDBACK_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
    const response = await post(good, { env: { FEEDBACK_TOKEN: TOKEN, FEEDBACK_LIMITER }, ip: "198.51.100.9" });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.equal((await response.json()).code, "rate-limited");
    assert.deepEqual(keys, ["feedback:198.51.100.9"]);
    assert.equal(calls.length, 0);

    const allow = { limit: async () => ({ success: true }) };
    assert.equal((await post(good, { env: { FEEDBACK_TOKEN: TOKEN, FEEDBACK_LIMITER: allow } })).status, 201);
  });

  it("answers preflight with POST and Content-Type for allowed origins", async () => {
    const headers = new Headers({ Origin: site, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" });
    const response = await worker.fetch(new Request(`${base}/feedback/v1`, { method: "OPTIONS", headers }), {}, {});
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), site);
    assert.match(response.headers.get("Access-Control-Allow-Methods"), /POST/);
    assert.match(response.headers.get("Access-Control-Allow-Headers"), /Content-Type/);

    const evil = await worker.fetch(new Request(`${base}/feedback/v1`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), {}, {});
    assert.equal(evil.headers.get("Access-Control-Allow-Origin"), null);
  });

  it("allows only POST", async () => {
    const response = await worker.fetch(new Request(`${base}/feedback/v1`, { headers: { Origin: site } }), {}, {});
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST, OPTIONS");
  });
});
