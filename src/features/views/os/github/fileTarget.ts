import { OWN_GITHUB_LOGIN } from "./contract";

/**
 * A Markdown file in one of the owner's repositories, shown in the GitHub app's file view.
 * The target string is the github.com blob path without the leading slash, with an optional section:
 * `sidagarwal-labs/models/blob/main/notes/ai-capex.md#five-hyperscaler-consensus-snapshot`.
 */
export type GitHubFile = {
  owner: string;
  repo: string;
  /** One path segment: a branch, tag, or commit. A branch with slashes reads as folders, which still builds the same URLs. */
  ref: string;
  /** Decoded path segments; the last one is the file name. */
  path: string[];
  /** A heading id inside the file, without GitHub's `user-content-` prefix. */
  anchor?: string;
};

/* Lab OS cuts link targets at 200 characters, so longer ones open on GitHub instead. */
export const MAX_FILE_TARGET_LENGTH = 200;

const OWNER = OWN_GITHUB_LOGIN.toLowerCase();
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const MARKDOWN = /\.(?:md|markdown)$/i;
const ANCHOR = /^[\p{L}\p{M}\p{N}_-]{1,120}$/u;
const MAX_SEGMENTS = 24;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/* A single decoded path segment; never empty, "." or "..", and never a separator or control character. */
function segment(value: string): string | null {
  const decoded = decode(value);
  if (!decoded || decoded.length > 255 || /^\.\.?$/.test(decoded) || /[/\\\u0000-\u001f\u007f]/.test(decoded)) return null;
  return decoded;
}

function anchorFrom(hash: string): string | undefined {
  const decoded = decode(hash.replace(/^#/, ""))?.replace(/^user-content-/, "");
  return decoded && ANCHOR.test(decoded) ? decoded : undefined;
}

function fromPath(path: string, hash: string): GitHubFile | null {
  const [owner, repo, kind, ref, ...rest] = path.split("/");
  if (owner?.toLowerCase() !== OWNER || kind !== "blob" || !repo || !ref || rest.length === 0 || rest.length > MAX_SEGMENTS) return null;
  if (!NAME.test(repo) || /^\.+$/.test(repo)) return null;
  const refName = segment(ref);
  if (!refName || !NAME.test(refName) || /^[.-]|\.\.|\.lock$/i.test(refName)) return null;
  const segments = rest.map(segment);
  if (segments.some((part) => part === null)) return null;
  const parts = segments as string[];
  if (!MARKDOWN.test(parts[parts.length - 1])) return null;
  const anchor = anchorFrom(hash);
  return { owner: OWN_GITHUB_LOGIN, repo, ref: refName, path: parts, ...(anchor ? { anchor } : {}) };
}

/** A github.com blob URL of a Markdown file in one of the owner's repositories. */
export function fileFromUrl(url: URL): GitHubFile | null {
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !GITHUB_HOSTS.has(url.hostname) || url.port || url.username || url.password) return null;
  return fromPath(url.pathname.slice(1), url.hash);
}

/** Reads a target string, or a full github.com blob URL; anything else is null. */
export function parseFileTarget(value: string): GitHubFile | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > 2048 || /[\s\\]/.test(input)) return null;
  if (/^https?:\/\//i.test(input)) {
    try {
      return fileFromUrl(new URL(input));
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(input)) return null;
  const hashAt = input.indexOf("#");
  const path = hashAt < 0 ? input : input.slice(0, hashAt);
  if (path.includes("?")) return null;
  return fromPath(path, hashAt < 0 ? "" : input.slice(hashAt + 1));
}

const encodePath = (parts: string[]) => parts.map(encodeURIComponent).join("/");

export function formatFileTarget(file: GitHubFile): string {
  const base = `${file.owner}/${file.repo}/blob/${encodeURIComponent(file.ref)}/${encodePath(file.path)}`;
  return file.anchor ? `${base}#${encodeURIComponent(file.anchor)}` : base;
}

/** The GitHub app target for a link, or undefined when the link is not a Markdown file the app can show. */
export function fileTargetFromUrl(url: URL): string | undefined {
  const file = fileFromUrl(url);
  if (!file) return undefined;
  const target = formatFileTarget(file);
  if (target.length <= MAX_FILE_TARGET_LENGTH) return target;
  const plain = formatFileTarget({ ...file, anchor: undefined });
  return plain.length <= MAX_FILE_TARGET_LENGTH ? plain : undefined;
}

export const fileName = (file: GitHubFile) => file.path[file.path.length - 1];
export const repoUrl = (file: GitHubFile) => `https://github.com/${file.owner}/${file.repo}`;
const blobRoot = (file: GitHubFile) => `${repoUrl(file)}/blob/${encodeURIComponent(file.ref)}/`;
const rawRoot = (file: GitHubFile) => `https://raw.githubusercontent.com/${file.owner}/${file.repo}/${encodeURIComponent(file.ref)}/`;

export function fileBlobUrl(file: GitHubFile, withAnchor = false): string {
  const url = `${blobRoot(file)}${encodePath(file.path)}`;
  return withAnchor && file.anchor ? `${url}#${encodeURIComponent(file.anchor)}` : url;
}

export const fileRawUrl = (file: GitHubFile) => `${rawRoot(file)}${encodePath(file.path)}`;

/** The folder holding the first `depth` path segments, on GitHub. */
export const folderUrl = (file: GitHubFile, depth: number) => `${repoUrl(file)}/tree/${encodeURIComponent(file.ref)}/${encodePath(file.path.slice(0, depth))}`;

export const sameFile = (a: GitHubFile, b: GitHubFile) =>
  a.owner.toLowerCase() === b.owner.toLowerCase() &&
  a.repo.toLowerCase() === b.repo.toLowerCase() &&
  a.ref === b.ref &&
  a.path.join("/") === b.path.join("/");

/* ---------- Links and images inside a file ---------- */

export type ResolvedLink =
  | { kind: "anchor"; anchor: string; href: string }
  | { kind: "file"; file: GitHubFile; href: string }
  | { kind: "external"; href: string };

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/* GitHub resolves "/path" against the repository root and other relative paths against the file. */
function resolveAgainst(value: string, root: string, current: string): URL | null {
  try {
    return value.startsWith("/") && !value.startsWith("//") ? new URL(value.slice(1), root) : new URL(value, current);
  } catch {
    return null;
  }
}

/**
 * Resolves a link written in `file`. Only http(s) and mailto links survive, always as absolute URLs; null means
 * render the link text without a link. Markdown files in the owner's repositories stay in the viewer.
 */
export function resolveLink(raw: string, file: GitHubFile): ResolvedLink | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("#")) {
    const anchor = decode(value.slice(1))?.replace(/^user-content-/, "") ?? "";
    return anchor ? { kind: "anchor", anchor, href: `${fileBlobUrl(file)}#${encodeURIComponent(anchor)}` } : null;
  }
  const url = resolveAgainst(value, blobRoot(file), fileBlobUrl(file));
  if (!url || !LINK_PROTOCOLS.has(url.protocol)) return null;
  const target = url.protocol === "mailto:" ? null : fileFromUrl(url);
  if (!target) return { kind: "external", href: url.href };
  if (sameFile(target, file) && target.anchor) return { kind: "anchor", anchor: target.anchor, href: url.href };
  return { kind: "file", file: target, href: url.href };
}

/** Resolves an image source in `file` against the raw file, so relative images load; null drops the image. */
export function resolveImage(raw: string, file: GitHubFile): string | null {
  const value = raw.trim();
  if (!value) return null;
  const url = resolveAgainst(value, rawRoot(file), fileRawUrl(file));
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
  /* A github.com blob link to an image shows the image itself on GitHub. */
  const blob = GITHUB_HOSTS.has(url.hostname) ? url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/) : null;
  return blob ? `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}` : url.href;
}
