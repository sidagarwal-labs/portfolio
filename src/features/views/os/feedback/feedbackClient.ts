import { apps, type AppId } from "../apps";
import { siteViews } from "../../siteViews";

export type Rating = "up" | "down";
export type FeedbackContext = { app?: string; path?: string; view?: string; style?: string };
export type FeedbackPayload = { rating: Rating; comment: string; context: FeedbackContext; website: string };
export type FailureReason = "unconfigured" | "unavailable" | "rate-limited" | "failed";
/* number and url are missing when the Worker accepts feedback without filing an issue. */
export type SendResult = { ok: true; number?: number; url?: string } | { ok: false; reason: FailureReason };

export const MAX_COMMENT = 1000;
export const FEEDBACK_REPO = "sidagarwal-labs/portfolio";

/* Same rules as the Worker (workers/github-proxy/src/feedback.mjs), so a valid request is never rejected for its context. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PATH = /^\/[A-Za-z0-9/._~-]{0,119}$/;
const ISSUE_URL = new RegExp(`^https://github\\.com/${FEEDBACK_REPO}/issues/\\d+$`);
const EMOJI: Record<Rating, string> = { up: "👍", down: "👎" };

/* VITE_FEEDBACK_API_URL is a test-only override (set by vite.config.ts in --mode test); the site uses the GitHub proxy's base URL. */
export const feedbackBase = () =>
  (import.meta.env?.VITE_FEEDBACK_API_URL || import.meta.env?.VITE_GITHUB_PROXY_URL)?.trim().replace(/\/+$/, "") || undefined;

export function cleanContext(context: FeedbackContext): FeedbackContext {
  const clean: FeedbackContext = {};
  if (context.app && SLUG.test(context.app)) clean.app = context.app;
  const path = context.path?.split(/[?#]/)[0];
  if (path && PATH.test(path)) clean.path = path;
  if (context.view && SLUG.test(context.view)) clean.view = context.view;
  if (context.style === "modern" || context.style === "retro") clean.style = context.style;
  return clean;
}

export async function sendFeedback(payload: FeedbackPayload, { base = feedbackBase(), signal }: { base?: string; signal?: AbortSignal } = {}): Promise<SendResult> {
  if (!base) return { ok: false, reason: "unconfigured" };
  try {
    const response = await fetch(`${base}/feedback/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, context: cleanContext(payload.context) }),
      signal
    });
    if (response.status === 503) return { ok: false, reason: "unavailable" };
    if (response.status === 429) return { ok: false, reason: "rate-limited" };
    if (response.status !== 201) return { ok: false, reason: "failed" };
    const body = (await response.json()) as { ok?: unknown; number?: unknown; url?: unknown };
    if (body.ok === true && body.number === undefined && body.url === undefined) return { ok: true };
    if (typeof body.number !== "number" || typeof body.url !== "string" || !ISSUE_URL.test(body.url)) return { ok: false, reason: "failed" };
    return { ok: true, number: body.number, url: body.url };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, reason: "failed" };
  }
}

/* A prefilled "new issue" link the visitor submits themselves when the form can't post. */
export function fallbackIssueUrl({ rating, comment, context }: { rating?: Rating; comment: string; context: FeedbackContext }) {
  const clean = cleanContext(context);
  const app = clean.app && Object.prototype.hasOwnProperty.call(apps, clean.app) ? apps[clean.app as AppId].title : undefined;
  const where = app ?? siteViews.find((view) => view.id === clean.view)?.label ?? "Lab OS";
  const title = rating ? `Feedback: ${EMOJI[rating]} on ${where}` : `Feedback on ${where}`;
  const details = (["app", "path", "view", "style"] as const).filter((key) => clean[key]).map((key) => `- ${key}: ${clean[key]}`);
  const body = [
    `Rating: ${rating ? `${EMOJI[rating]} Thumbs ${rating}` : "none"}`,
    "",
    "Comment:",
    comment.trim() || "(none)",
    "",
    "Context:",
    ...details
  ].join("\n");
  return `https://github.com/${FEEDBACK_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=feedback`;
}
