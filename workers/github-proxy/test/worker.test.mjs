import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import worker from "../src/index.mjs";
import { graphqlUpstream } from "./fixtures.mjs";

const TOKEN = "ghp_test_token_should_never_leak";
const base = "https://api.agarwal-labs.com";

class FakeCache {
  store = new Map();
  puts = 0;
  async match(request) {
    return this.store.get(request.url)?.clone();
  }
  async put(request, response) {
    this.puts += 1;
    this.store.set(request.url, response);
  }
}

let cache;
let upstreamCalls;
let upstream;
const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;

beforeEach(() => {
  cache = new FakeCache();
  upstreamCalls = [];
  upstream = graphqlUpstream();
  globalThis.caches = { default: cache };
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({ url, init });
    return upstream(url, init);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.caches = realCaches;
});

async function call(path, { method = "GET", origin, env = { GITHUB_TOKEN: TOKEN }, ip = "203.0.113.7" } = {}) {
  const headers = new Headers({ "CF-Connecting-IP": ip });
  if (origin) headers.set("Origin", origin);
  const pending = [];
  const response = await worker.fetch(new Request(base + path, { method, headers }), env, { waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  return response;
}

describe("routing", () => {
  it("answers /health", async () => {
    const response = await call("/health");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });

  it("returns JSON 404 for unknown paths", async () => {
    const response = await call("/github/v2/users/octo");
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "unknown-route");
    assert.equal(upstreamCalls.length, 0);
  });

  it("rejects methods other than GET and OPTIONS", async () => {
    for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
      const response = await call("/github/v1/users/octo", { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("Allow"), "GET, OPTIONS");
    }
    assert.equal(upstreamCalls.length, 0);
  });

  it("answers OPTIONS preflight", async () => {
    const response = await call("/github/v1/users/octo", { method: "OPTIONS", origin: "https://agarwal-labs.com" });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://agarwal-labs.com");
    assert.match(response.headers.get("Access-Control-Allow-Methods"), /GET/);
    assert.equal(upstreamCalls.length, 0);
  });

  it("rejects invalid logins with 400", async () => {
    for (const path of ["/github/v1/users/-bad", "/github/v1/users/a_b", "/github/v1/users/a%2Fb", "/github/v1/users/%E0%A4%A"]) {
      const response = await call(path);
      assert.equal(response.status, 400, path);
      assert.equal((await response.json()).code, "invalid-login");
    }
    assert.equal(upstreamCalls.length, 0);
  });
});

describe("CORS", () => {
  it("echoes allowed origins", async () => {
    for (const origin of ["https://agarwal-labs.com", "https://www.agarwal-labs.com", "http://localhost:5173", "http://127.0.0.1:4175", "http://localhost"]) {
      const response = await call("/health", { origin });
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin, origin);
      assert.match(response.headers.get("Vary"), /Origin/);
    }
  });

  it("omits CORS headers for other origins", async () => {
    for (const origin of ["https://evil.example", "https://agarwal-labs.com.evil.example", "http://agarwal-labs.com", "https://localhost:5173", "http://localhost.evil.example", "null"]) {
      for (const method of ["GET", "OPTIONS"]) {
        const response = await call("/github/v1/users/octo", { origin, method });
        assert.equal(response.headers.get("Access-Control-Allow-Origin"), null, `${method} ${origin}`);
      }
    }
  });
});

describe("GET /github/v1/users/:login", () => {
  it("returns normalized insights, lowercases the login, and caches for six hours", async () => {
    const response = await call("/github/v1/users/OcTo", { origin: "https://agarwal-labs.com" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600, s-maxage=21600");
    assert.equal(response.headers.get("X-Cache"), "MISS");
    const body = await response.json();
    assert.equal(body.version, 1);
    assert.equal(body.source, "graphql");
    assert.ok(!JSON.stringify(body).includes("secret-plan"));
    assert.equal(body.repos.find((item) => item.name === "busy").allTimeCommits, 42);
    assert.equal(upstreamCalls.length, 2);
    assert.equal(JSON.parse(upstreamCalls[0].init.body).variables.login, "octo");
    assert.deepEqual(JSON.parse(upstreamCalls[1].init.body).variables, { ids: ["R_busy", "R_quiet"], userId: "U_octo" });
    assert.ok(upstreamCalls.every((item) => item.init.headers.Authorization === `bearer ${TOKEN}`));
    assert.deepEqual([...cache.store.keys()], [`${base}/github/v1/users/octo`]);
    assert.equal(cache.store.get(`${base}/github/v1/users/octo`).headers.get("Access-Control-Allow-Origin"), null);
  });

  it("serves cache hits without calling GitHub", async () => {
    await call("/github/v1/users/octo");
    assert.equal(upstreamCalls.length, 2);
    const response = await call("/github/v1/users/OCTO", { origin: "http://localhost:5173" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Cache"), "HIT");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
    assert.equal((await response.json()).login, "Octo");
    assert.equal(upstreamCalls.length, 2);
  });

  it("answers without all-time counts when only that request fails", async () => {
    const answer = graphqlUpstream();
    upstream = async (url, init) => (JSON.parse(init.body).variables.ids ? new Response("unavailable", { status: 502 }) : answer(url, init));
    const response = await call("/github/v1/users/octo");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.repos.length > 0 && body.repos.every((item) => !("allTimeCommits" in item)));
    assert.equal(upstreamCalls.length, 2);
  });

  it("maps a missing user to a cached 404", async () => {
    upstream = async () => new Response(JSON.stringify({ data: { user: null }, errors: [{ type: "NOT_FOUND" }] }), { status: 200 });
    const response = await call("/github/v1/users/ghost");
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "GitHub user not found", code: "not-found" });
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600");
    assert.equal(cache.puts, 1);
  });

  it("returns 502 without leaking upstream details or the token", async () => {
    upstream = async () => new Response(`internal detail: ${TOKEN}`, { status: 500 });
    const response = await call("/github/v1/users/octo");
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { error: "GitHub is unavailable", code: "upstream" });
    assert.ok(!text.includes(TOKEN) && !text.includes("internal detail"));
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(cache.puts, 0);
  });

  it("maps GitHub rate limits to 429 with Retry-After", async () => {
    upstream = async () => new Response("{}", { status: 429, headers: { "retry-after": "42" } });
    const response = await call("/github/v1/users/octo");
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "42");
    assert.equal((await response.json()).code, "rate-limited");
    assert.equal(cache.puts, 0);
  });

  it("reports a missing token as misconfigured", async () => {
    const response = await call("/github/v1/users/octo", { env: {} });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).code, "misconfigured");
    assert.equal(upstreamCalls.length, 0);
  });

  it("enforces the optional per-IP rate limiter", async () => {
    const keys = [];
    const RATE_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
    const response = await call("/github/v1/users/octo", { env: { GITHUB_TOKEN: TOKEN, RATE_LIMITER }, ip: "198.51.100.9" });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "rate-limited");
    assert.deepEqual(keys, ["ip:198.51.100.9"]);
    assert.equal(upstreamCalls.length, 0);

    const allow = { limit: async () => ({ success: true }) };
    assert.equal((await call("/github/v1/users/octo", { env: { GITHUB_TOKEN: TOKEN, RATE_LIMITER: allow } })).status, 200);
  });

  it("works without a cache binding", async () => {
    globalThis.caches = undefined;
    assert.equal((await call("/github/v1/users/octo")).status, 200);
  });
});
