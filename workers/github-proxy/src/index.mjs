import { fetchInsights, GitHubInsightsError, isValidLogin } from "./insights.mjs";

const SITE_ORIGINS = new Set(["https://agarwal-labs.com", "https://www.agarwal-labs.com"]);
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;
const USER_ROUTE = /^\/github\/v1\/users\/([^/]+)\/?$/;
const SUCCESS_CACHE = "public, max-age=3600, s-maxage=21600";
const NOT_FOUND_CACHE = "public, max-age=3600";
const ERROR_MESSAGES = {
  "invalid-login": "Invalid GitHub login",
  "not-found": "GitHub user not found",
  "rate-limited": "Rate limit reached; try again later",
  "method-not-allowed": "Method not allowed",
  misconfigured: "Proxy is not configured",
  upstream: "GitHub is unavailable"
};

export const isAllowedOrigin = (origin) => Boolean(origin) && (SITE_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin));

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  headers.append("Vary", "Origin");
  if (isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Retry-After, X-Cache");
  }
  return new Response(response.body, { status: response.status, headers });
}

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

const errorResponse = (code, status, headers) => json({ error: ERROR_MESSAGES[code] ?? "Request failed", code }, status, headers);

async function lookup(login, request, env, ctx) {
  const key = login.toLowerCase();
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL(`/github/v1/users/${key}`, request.url).toString(), { method: "GET" });
  const cached = await cache?.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("X-Cache", "HIT");
    return hit;
  }

  let response;
  try {
    const insights = await fetchInsights(key, { token: env.GITHUB_TOKEN });
    response = json(insights, 200, { "Cache-Control": SUCCESS_CACHE });
  } catch (error) {
    const typed = error instanceof GitHubInsightsError ? error : new GitHubInsightsError("upstream", 502, "Unexpected failure");
    if (typed.code === "rate-limited" && typed.retryAfter !== undefined) {
      return errorResponse(typed.code, 429, { "Retry-After": String(typed.retryAfter) });
    }
    if (typed.code !== "not-found") return errorResponse(typed.code, typed.status);
    response = errorResponse("not-found", 404, { "Cache-Control": NOT_FOUND_CACHE });
  }
  if (cache) {
    const write = cache.put(cacheKey, response.clone());
    if (ctx?.waitUntil) ctx.waitUntil(write);
    else await write;
  }
  response.headers.set("X-Cache", "MISS");
  return response;
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "GET, OPTIONS", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" }
    });
  }
  if (request.method !== "GET") return errorResponse("method-not-allowed", 405, { Allow: "GET, OPTIONS" });
  if (url.pathname === "/health") return json({ ok: true }, 200);

  const match = USER_ROUTE.exec(url.pathname);
  if (!match) return json({ error: "Unknown route", code: "unknown-route" }, 404);
  let login;
  try {
    login = decodeURIComponent(match[1]);
  } catch {
    login = "";
  }
  if (!isValidLogin(login)) return errorResponse("invalid-login", 400);

  if (env?.RATE_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: `ip:${ip}` });
    if (!success) return errorResponse("rate-limited", 429, { "Retry-After": "60" });
  }
  return lookup(login, request, env ?? {}, ctx);
}

export default {
  async fetch(request, env, ctx) {
    let response;
    try {
      response = await route(request, env, ctx);
    } catch {
      response = json({ error: "Internal error", code: "internal" }, 500);
    }
    return withCors(response, request.headers.get("Origin"));
  }
};
