import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { BookMarked, ExternalLink, FileText, LoaderCircle, TriangleAlert } from "lucide-react";
import { researchNotes } from "../../../../../content/journalContent";
import { useResearchNoteDates } from "../../../../../hooks/useResearchNoteDates";
import { fileBlobUrl, fileName, fileRawUrl, folderUrl, repoUrl, type GitHubFile } from "../fileTarget";
import { parseMarkdown } from "../markdown";
import { fmtDate } from "./format";
import { HEADING_ID_PREFIX, Markdown } from "./Markdown";

/* Notes are a few dozen KB; anything far larger is not a note and would be slow to parse. */
const MAX_CHARS = 500_000;
/* A stalled connection shows the error (with Open on GitHub) instead of loading forever. */
const LOAD_TIMEOUT_MS = 15_000;
const CACHE_SIZE = 12;
/* Recently opened files, so going back and forth between notes does not refetch them. */
const cache = new Map<string, string>();

function remember(url: string, text: string) {
  cache.delete(url);
  cache.set(url, text);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

type ErrorKind = "not-found" | "too-large" | "network";
type Load = { url: string; status: "loading" } | { url: string; status: "ready"; text: string } | { url: string; status: "error"; kind: ErrorKind };

class FileError extends Error {
  constructor(readonly kind: ErrorKind) {
    super(kind);
  }
}

const errorCopy: Record<ErrorKind, string> = {
  "not-found": "This file is not on GitHub at this address. It may have been moved or renamed.",
  "too-large": "This file is too large to show here.",
  network: "GitHub could not be reached. Check your connection and try again.",
};

const isPlainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

function fmtSize(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? `${bytes} Bytes` : `${(bytes / 1024).toFixed(1)} KB`;
}

function lineCount(text: string) {
  if (!text) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

type ResearchNote = (typeof researchNotes)[number];
const notesByUrl = new Map<string, ResearchNote>(researchNotes.map((note) => [note.href.toLowerCase(), note]));

/* A research note's title and the date of its last commit, as the site's notes lists show them. */
function NoteInfo({ note }: { note: ResearchNote }) {
  const dates = useResearchNoteDates();
  const updated = dates[note.slug] ?? note.updatedAt;
  return (
    <p className="gh-file__note">
      <strong>{note.title}</strong>
      <span>Research note</span>
      <span>
        Updated{" "}
        <time dateTime={updated} title={`Last GitHub commit: ${updated}`}>
          {fmtDate(updated)}
        </time>
      </span>
    </p>
  );
}

type FileViewProps = {
  file: GitHubFile;
  /** Changes on every open, so opening the same file again scrolls back to the top or to its section. */
  seq: number;
  description?: string | null;
  onOpenFile: (file: GitHubFile) => void;
  onOpenOwner: () => void;
};

/** A Markdown file in one of the owner's repositories, laid out like GitHub's file page. */
export function FileView({ file, seq, description, onOpenFile, onOpenOwner }: FileViewProps) {
  const rawUrl = fileRawUrl(file);
  const blobUrl = fileBlobUrl(file, true);
  const note = notesByUrl.get(fileBlobUrl(file).toLowerCase());
  const name = fileName(file);
  const folders = file.path.slice(0, -1);
  const [load, setLoad] = useState<Load>({ url: rawUrl, status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const cached = load.url === rawUrl ? undefined : cache.get(rawUrl);
  const current: Load = load.url === rawUrl ? load : cached !== undefined ? { url: rawUrl, status: "ready", text: cached } : { url: rawUrl, status: "loading" };

  /* Runs on every open, so opening a file again after an error retries it; files already shown come from memory. */
  useEffect(() => {
    const hit = cache.get(rawUrl);
    if (hit !== undefined) {
      remember(rawUrl, hit);
      setLoad({ url: rawUrl, status: "ready", text: hit });
      return;
    }
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, LOAD_TIMEOUT_MS);
    setLoad({ url: rawUrl, status: "loading" });
    fetch(rawUrl, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      .then(async (response) => {
        if (response.status === 404) throw new FileError("not-found");
        if (!response.ok) throw new FileError("network");
        if (Number(response.headers.get("content-length")) > MAX_CHARS * 4) throw new FileError("too-large");
        const text = await response.text();
        if (text.length > MAX_CHARS) throw new FileError("too-large");
        return text;
      })
      .then(
        (text) => {
          remember(rawUrl, text);
          if (!ctrl.signal.aborted) setLoad({ url: rawUrl, status: "ready", text });
        },
        (error: unknown) => {
          if (!ctrl.signal.aborted || timedOut) setLoad({ url: rawUrl, status: "error", kind: error instanceof FileError ? error.kind : "network" });
        }
      )
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [rawUrl, seq, attempt]);

  const text = current.status === "ready" ? current.text : null;
  const doc = useMemo(() => (text === null ? null : parseMarkdown(text)), [text]);
  const titleId = useMemo(() => {
    const heading = doc?.blocks.find((block) => block.type === "heading");
    return heading?.type === "heading" && heading.id ? `${HEADING_ID_PREFIX}${heading.id}` : undefined;
  }, [doc]);

  const scrollBody = useCallback(() => rootRef.current?.closest<HTMLElement>(".os-win__body") ?? null, []);

  /* Scrolls the window body so `element` sits just below the sticky toolbar, then moves focus to it. */
  const reveal = useCallback(
    (element: HTMLElement, smooth: boolean) => {
      const body = scrollBody();
      if (body) {
        const toolbar = rootRef.current?.closest(".gh")?.querySelector(".gh-toolbar")?.getBoundingClientRect().height ?? 0;
        const top = element.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - toolbar - 12;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        body.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduced ? "smooth" : "auto" });
      } else {
        element.scrollIntoView({ block: "start" });
      }
      element.focus({ preventScroll: true });
    },
    [scrollBody]
  );

  const findAnchor = useCallback((anchor: string) => {
    const article = articleRef.current;
    if (!article) return null;
    const find = (id: string) => article.querySelector<HTMLElement>(`[id="${CSS.escape(HEADING_ID_PREFIX + id)}"]`);
    return find(anchor) ?? find(anchor.toLowerCase());
  }, []);

  const onAnchor = useCallback(
    (anchor: string) => {
      const element = findAnchor(anchor);
      if (element) reveal(element, true);
    },
    [findAnchor, reveal]
  );

  /* Each open starts at the top; focus moves to the section or the title once the file is shown. */
  useEffect(() => {
    const body = scrollBody();
    if (body) body.scrollTop = 0;
    pendingFocus.current = seq;
  }, [seq, scrollBody]);

  useEffect(() => {
    if (current.status !== "ready" || pendingFocus.current !== seq) return;
    pendingFocus.current = null;
    const section = file.anchor ? findAnchor(file.anchor) : null;
    if (section) {
      reveal(section, false);
      return;
    }
    const title = titleId ? document.getElementById(titleId) : null;
    (title ?? articleRef.current)?.focus({ preventScroll: true });
  }, [current.status, seq, file.anchor, findAnchor, reveal, titleId]);

  const inApp = (action: () => void) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    action();
  };

  return (
    <div className="gh-file" ref={rootRef}>
      <div className="gh-file__head">
        <nav className="gh-crumbs" aria-label="File path">
          <BookMarked className="gh-crumbs__icon" size={16} strokeWidth={2} aria-hidden="true" />
          <ol>
            <li>
              <a href={`https://github.com/${file.owner}`} onClick={inApp(onOpenOwner)}>
                {file.owner}
              </a>
            </li>
            <li>
              <span className="gh-crumbs__sep" aria-hidden="true">/</span>
              <a className="gh-crumbs__repo" href={repoUrl(file)} target="_blank" rel="noopener noreferrer">
                {file.repo}
              </a>
            </li>
            {folders.map((folder, index) => (
              <li key={`${index}:${folder}`}>
                <span className="gh-crumbs__sep" aria-hidden="true">/</span>
                <a href={folderUrl(file, index + 1)} target="_blank" rel="noopener noreferrer">
                  {folder}
                </a>
              </li>
            ))}
            <li>
              <span className="gh-crumbs__sep" aria-hidden="true">/</span>
              <span className="gh-crumbs__file" aria-current="page">
                {name}
              </span>
            </li>
          </ol>
        </nav>
        <a className="os-button gh-file__open" href={blobUrl} target="_blank" rel="noopener noreferrer">
          Open on GitHub
          <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
        </a>
        {note ? <NoteInfo note={note} /> : description && <p className="gh-file__desc">{description}</p>}
      </div>

      <div className="gh-file__box">
        <div className="gh-file__bar">
          <FileText size={15} strokeWidth={2} aria-hidden="true" />
          <span className="gh-file__name">{name}</span>
          {text !== null && (
            <span className="gh-file__meta">
              {lineCount(text)} lines · {fmtSize(text)}
            </span>
          )}
          <a className="gh-file__raw" href={rawUrl} target="_blank" rel="noopener noreferrer">
            Raw
          </a>
        </div>

        {current.status === "loading" && (
          <p className="gh-file__loading" role="status">
            <LoaderCircle className="gh-spin" size={15} strokeWidth={2} aria-hidden="true" />
            Loading {name}…
          </p>
        )}

        {current.status === "error" && (
          <div className="gh-alert gh-file__alert" role="alert">
            <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
            <p>{errorCopy[current.kind]}</p>
            {current.kind === "network" && (
              <button type="button" className="os-button" onClick={() => setAttempt((count) => count + 1)}>
                Try again
              </button>
            )}
            <a className="os-button" href={blobUrl} target="_blank" rel="noopener noreferrer">
              Open on GitHub
              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
            </a>
          </div>
        )}

        {doc && (
          <article
            ref={articleRef}
            className="gh-md"
            aria-labelledby={titleId}
            aria-label={titleId ? undefined : name}
            tabIndex={-1}
          >
            <Markdown doc={doc} file={file} topLevel={3} onOpenFile={onOpenFile} onAnchor={onAnchor} />
          </article>
        )}
      </div>
    </div>
  );
}
