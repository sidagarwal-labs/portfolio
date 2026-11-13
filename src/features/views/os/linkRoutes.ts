import { arxivSearchOrigin } from "../../../content/arxivSearch";
import { findLibraryItem } from "../../../content/library";
import { findReaderArticle } from "../../../content/readerLinks";
import { OWN_GITHUB_LOGIN } from "./github/contract";
import { fileTargetFromUrl } from "./github/fileTarget";

/* Native Lab OS apps that outside links can open in place of a new tab. */
export type LinkApp = "library" | "reader" | "github" | "arxiv";
export type LinkRoute = { app: LinkApp; target: string };

const linkApps = new Set<string>(["library", "reader", "github", "arxiv"] satisfies LinkApp[]);

export const isLinkApp = (app: unknown): app is LinkApp => typeof app === "string" && linkApps.has(app);

/* Site pages that run as their own Lab OS app (apps.ts paths). A same-origin link to one opens that app's window. */
export type PageApp = "markets" | "launches" | "leaderboards";

const pageApps = new Map<string, PageApp>([["/markets", "markets"], ["/launches", "launches"], ["/leaderboards", "leaderboards"]]);

export function pageApp(path: string): PageApp | undefined {
  return pageApps.get(path.split(/[?#]/)[0].replace(/(.)\/+$/, "$1"));
}

/* Only the plain profile and readable Markdown files open the GitHub app. Repository pages and profile
   tabs need GitHub itself, not the analytics view. */
export function githubTarget(url: URL): string | undefined {
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return undefined;
  const file = fileTargetFromUrl(url);
  if (file) return file;
  const [login, ...rest] = url.pathname.split("/").filter(Boolean);
  if (login?.toLowerCase() !== OWN_GITHUB_LOGIN || rest.length > 0 || url.search || url.hash) return undefined;
  return OWN_GITHUB_LOGIN;
}

export function routeLink(href: string): LinkRoute | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  const item = findLibraryItem(url.href);
  if (item) return { app: "library", target: item.slug };
  const article = findReaderArticle(url.href);
  if (article) return { app: "reader", target: article };
  if (url.origin === arxivSearchOrigin) return { app: "arxiv", target: `${url.pathname}${url.search}${url.hash}` };
  const github = githubTarget(url);
  if (github) return { app: "github", target: github };
  return undefined;
}
