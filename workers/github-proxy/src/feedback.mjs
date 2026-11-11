// POST /feedback/v1: turns a thumbs up/down and an optional comment into a public, labeled issue in FEEDBACK_REPO.
export const FEEDBACK_ROUTE = "/feedback/v1";
export const FEEDBACK_REPO = "sidagarwal-labs/portfolio";
export const MAX_COMMENT = 1000;
export const MAX_BODY_BYTES = 4096;

const RATINGS = {
  up: { emoji: "👍", label: "Thumbs up", tag: "thumbs-up" },
  down: { emoji: "👎", label: "Thumbs down", tag: "thumbs-down" }
};
const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CONTEXT_RULES = {
  app: SLUG,
  view: SLUG,
  style: /^(?:modern|retro)$/,
  path: /^\/[A-Za-z0-9/._~-]{0,119}$/
};
const CONTEXT_LABELS = { app: "App", path: "Path", view: "View", style: "Style" };
// C0/C1 controls (except tab and newline), and bidi overrides that could visually reorder the comment.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ISSUE_URL = new RegExp(`^https://github\\.com/${FEEDBACK_REPO}/issues/\\d+$`);

const MESSAGES = {
  "forbidden-origin": "Origin not allowed",
  "unsupported-media-type": "Send JSON",
  "payload-too-large": "Feedback is too large",
  "invalid-feedback": "Invalid feedback",
  "comment-too-long": `Comments can be up to ${MAX_COMMENT} characters`,
  "rate-limited": "Too much feedback from this network; try again in a minute",
  "feedback-unavailable": "Feedback is not available right now",
  upstream: "GitHub is unavailable"
};

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
const fail = (code, status, headers) => json({ error: MESSAGES[code], code }, status, headers);

export const sanitizeComment = (text) => text.replace(/\r\n?/g, "\n").replace(UNSAFE_CHARS, "").trim();

/* A fence longer than any backtick run in the text can't be closed early, so nothing inside renders as markdown or HTML. */
export function fenced(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

export function validateFeedback(input) {
  if (!isPlainObject(input)) return { error: "invalid-feedback" };
  const { rating, comment = "", context = {}, website = "" } = input;
  if (typeof website !== "string" || website !== "") return { error: "invalid-feedback" };
  if (!Object.hasOwn(RATINGS, rating)) return { error: "invalid-feedback" };
  if (typeof comment !== "string") return { error: "invalid-feedback" };
  if (comment.length > MAX_COMMENT) return { error: "comment-too-long" };
  if (!isPlainObject(context)) return { error: "invalid-feedback" };
  const clean = {};
  for (const [key, rule] of Object.entries(CONTEXT_RULES)) {
    const value = context[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !rule.test(value)) return { error: "invalid-feedback" };
    clean[key] = value;
  }
  return { feedback: { rating, comment: sanitizeComment(comment), context: clean } };
}

export function buildIssue({ rating, comment, context }, now = new Date()) {
  const { emoji, label, tag } = RATINGS[rating];
  const where = context.app ?? context.view ?? "the site";
  const rows = Object.keys(CONTEXT_LABELS)
    .filter((key) => context[key])
    .map((key) => `| ${CONTEXT_LABELS[key]} | \`${context[key]}\` |`);
  rows.push(`| Submitted (UTC) | \`${now.toISOString()}\` |`);
  const body = [
    `**Rating:** ${emoji} ${label}`,
    "",
    "**Comment:**",
    "",
    comment ? fenced(comment) : "_No comment._",
    "",
    "| Context | Value |",
    "| --- | --- |",
    ...rows,
    "",
    "_Submitted from the site's feedback form._"
  ].join("\n");
  return { title: `Feedback: ${emoji} on ${where}`, body, labels: ["feedback", tag] };
}

async function readBody(request) {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { error: "payload-too-large" };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return { error: "payload-too-large" };
  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { error: "invalid-feedback" };
  }
}

async function createIssue(issue, token) {
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${FEEDBACK_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "agarwal-labs-feedback",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify(issue)
    });
  } catch {
    return undefined;
  }
  if (response.status !== 201) return undefined;
  const created = await response.json().catch(() => undefined);
  if (!Number.isInteger(created?.number) || typeof created.html_url !== "string" || !ISSUE_URL.test(created.html_url)) return undefined;
  return { number: created.number, url: created.html_url };
}

export async function handleFeedback(request, env, isAllowedOrigin) {
  if (request.method !== "POST") return json({ error: "Method not allowed", code: "method-not-allowed" }, 405, { Allow: "POST, OPTIONS" });
  if (!isAllowedOrigin(request.headers.get("Origin"))) return fail("forbidden-origin", 403);

  if (env?.FEEDBACK_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.FEEDBACK_LIMITER.limit({ key: `feedback:${ip}` });
    if (!success) return fail("rate-limited", 429, { "Retry-After": "60" });
  }

  const type = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return fail("unsupported-media-type", 415);
  const body = await readBody(request);
  if (body.error) return fail(body.error, body.error === "payload-too-large" ? 413 : 400);
  const { feedback, error } = validateFeedback(body.value);
  if (error) return fail(error, 400);

  const token = env?.FEEDBACK_TOKEN;
  if (!token) return fail("feedback-unavailable", 503);
  const created = await createIssue(buildIssue(feedback), token);
  if (!created) return fail("upstream", 502);
  return json({ ok: true, ...created }, 201);
}
