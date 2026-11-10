import { findLibraryItem } from "../../../content/library";
import { findReaderArticle } from "../../../content/readerLinks";
import { OWN_GITHUB_LOGIN } from "./github/contract";
import { fileTargetFromUrl } from "./github/fileTarget";

/* Native Lab OS apps that outside links can open in place of a new tab. */
export type LinkApp = "library" | "reader" | "github";
export type LinkRoute = { app: LinkApp; target: string };

const linkApps = new Set<string>(["library", "reader", "github"] satisfies LinkApp[]);

export const isLinkApp = (app: unknown): app is LinkApp => typeof app === "string" && linkApps.has(app);

/* The profile, repository home pages, and Markdown files (research notes) open the GitHub app. Other deep
   pages (code, commits, folders) are what the reader asked to see, so they still open on GitHub. */
export function githubTarget(url: URL): string | undefined {
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return undefined;
  const file = fileTargetFromUrl(url);
  if (file) return file;
  const [login, repo, ...rest] = url.pathname.split("/").filter(Boolean);
  if (login?.toLowerCase() !== OWN_GITHUB_LOGIN || rest.length > 0) return undefined;
  return repo ? `${OWN_GITHUB_LOGIN}/${repo}` : OWN_GITHUB_LOGIN;
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
  const github = githubTarget(url);
  if (github) return { app: "github", target: github };
  return undefined;
}
