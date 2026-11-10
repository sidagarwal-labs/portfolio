import { profileContent } from "../../../content/siteContent";
import { isSiteView, type SiteView } from "../siteViews";
import type { LinkApp, PageApp } from "./linkRoutes";

const framePrefix = "labos:";

/* Lab OS apps run in iframes named "labos:<view>". The name survives navigation inside the frame,
   so an app never falls back to the stored view (which would nest the OS inside itself). */
function readEmbeddedView(): SiteView | undefined {
  if (typeof window === "undefined" || window.self === window.top || !window.name.startsWith(framePrefix)) return undefined;
  const view = window.name.slice(framePrefix.length);
  return isSiteView(view) && view !== "os" ? view : "journal";
}

export const embeddedView = readEmbeddedView();

export const frameName = (view: SiteView) => `${framePrefix}${view}`;

/* Messages between the OS and the site apps running in its windows (same origin only). */
export type OsMessage =
  | { type: "labos:open"; app: "resume" }
  /* An outside link that a native app shows instead of a new tab (see linkRoutes.ts). */
  | { type: "labos:link"; app: LinkApp; target: string }
  /* A same-origin link to a page that is its own app, such as /markets?symbol=NVDA. The OS answers with
     labos:handled and the same id once that app's window shows it. */
  | { type: "labos:page"; app: PageApp; path: string; id?: number }
  | { type: "labos:handled"; id: number }
  | { type: "labos:boot" }
  | { type: "labos:focus" }
  /* replace: the page swapped its own state (such as a Markets preview) rather than going somewhere new. */
  | { type: "labos:location"; path: string; replace?: boolean }
  | { type: "labos:query"; query: string }
  | { type: "labos:navigate"; path: string };

export function isOsMessage(data: unknown): data is OsMessage {
  const type = typeof data === "object" && data !== null ? (data as { type?: unknown }).type : undefined;
  return typeof type === "string" && type.startsWith(framePrefix);
}

/* Router state, or a link's data-labos-history="replace", marking an in-page change the window's back/forward
   history should replace instead of push. */
export const replaceHistoryState = { labosHistory: "replace" } as const;
export const isReplaceState = (state: unknown) =>
  typeof state === "object" && state !== null && (state as { labosHistory?: unknown }).labosHistory === "replace";

export function postToOs(message: OsMessage) {
  if (embeddedView) window.parent.postMessage(message, window.location.origin);
}

export function isResumeUrl(url: URL) {
  return url.pathname === new URL(profileContent.resumeHref, window.location.href).pathname || url.pathname.toLowerCase().endsWith(".pdf");
}

export function openInNewTab(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/* A same-origin URL as a router path (without the deploy base). */
export function routerPath(url: URL) {
  const pathname = basePath && url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) || "/" : url.pathname;
  return `${pathname}${url.search}${url.hash}`;
}

/* A router path as a full URL, for opening a window's page outside the OS. */
export function siteUrl(path: string) {
  return `${window.location.origin}${basePath}${path}`;
}
