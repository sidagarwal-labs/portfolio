import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ExternalLink, Info, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import type { OsActions, OsTarget } from "../types";
import { buildCalendar, computeStats } from "./analytics";
import { GitHubLookupError, isValidLogin, loadInsights, loadOwnInsights, normalizeLogin, type GitHubLookupErrorKind } from "./client";
import { OWN_GITHUB_LOGIN, type GitHubInsights } from "./contract";
import { fmtDate, fmtRange, fmtResetAt } from "./ui/format";
import { Heatmap } from "./ui/Heatmap";
import { Labs } from "./ui/Labs";
import { Highlights, Languages, StatsStrip, TopRepos, TotalsLine, type RepoFocus } from "./ui/Overview";
import "./github.css";

type Lookup =
  | { status: "idle" }
  | { status: "loading"; login: string }
  | { status: "error"; login: string; kind: GitHubLookupErrorKind; message: string; resetAt?: string };

const OWN = OWN_GITHUB_LOGIN.toLowerCase();
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** "login", "login/repo", "@login" or a github.com URL; logins are case-insensitive. */
function parseGitHubTarget(value: string): { login: string; repo?: string } | null {
  const path = value
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/^@/, "");
  const [first, second] = path.split("/").filter(Boolean);
  if (!first) return null;
  const repo = second && REPO_PATTERN.test(second) ? second.replace(/\.git$/i, "") : undefined;
  return { login: normalizeLogin(first), repo };
}

function errorCopy(lookup: Extract<Lookup, { status: "error" }>) {
  switch (lookup.kind) {
    case "invalid-login":
      return `"${lookup.login}" is not a valid GitHub username. Usernames use letters, numbers and single hyphens, up to 39 characters.`;
    case "not-found":
      return `${lookup.message} (@${lookup.login})`;
    case "rate-limited": {
      const reset = lookup.resetAt ? fmtResetAt(lookup.resetAt) : null;
      return `GitHub's hourly limit for unauthenticated requests from this network has been reached. ${
        reset ? `Try again after ${reset.time} (${reset.relative}).` : "Try again in a few minutes."
      }`;
    }
    case "invalid-data":
      return `GitHub returned data for @${lookup.login} that this app could not read.`;
    default:
      return "GitHub could not be reached. Check your connection and try again.";
  }
}

function Avatar({ insights }: { insights: GitHubInsights }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [insights.avatarUrl]);
  const initial = (insights.name ?? insights.login).trim().charAt(0).toUpperCase();
  return (
    <span className="gh-avatar" aria-hidden="true">
      {failed || !insights.avatarUrl ? initial : <img src={insights.avatarUrl} alt="" width={72} height={72} decoding="async" onError={() => setFailed(true)} />}
    </span>
  );
}

function Profile({ insights, focus, own }: { insights: GitHubInsights; focus: RepoFocus | null; own: boolean }) {
  const calendar = useMemo(() => buildCalendar(insights.days), [insights]);
  const stats = useMemo(() => computeStats(insights), [insights]);
  const rest = insights.source === "rest-events";
  const unit = rest ? "events" : "contributions";
  const repoFocus = focus && focus.login.toLowerCase() === insights.login.toLowerCase() ? focus : null;
  const sourceLabel = rest ? "public events from the GitHub REST API" : own ? "contribution calendar" : "contribution calendar from the GitHub GraphQL API";
  const asOf = <time dateTime={insights.generatedAt}>{fmtDate(insights.generatedAt)}</time>;

  return (
    <div className="gh-main">
      <header className="gh-head">
        <Avatar insights={insights} />
        <div className="gh-head__id">
          <h3 className="gh-head__name">{insights.name ?? insights.login}</h3>
          <p className="gh-head__login">@{insights.login}</p>
          {insights.bio && <p className="gh-head__bio">{insights.bio}</p>}
          <p className="gh-head__meta">
            {fmtRange(insights.range.from, insights.range.to)} · {sourceLabel}
          </p>
          <p className="gh-head__meta gh-head__fresh">
            {own ? <>Data as of {asOf} · refreshed on each deploy and daily</> : <>Fetched live · data as of {asOf}</>}
          </p>
        </div>
        <a className="os-button gh-head__open" href={insights.htmlUrl} target="_blank" rel="noreferrer">
          Open on GitHub
          <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
        </a>
      </header>

      {rest && (
        <div className="gh-notice" role="note">
          <Info size={16} strokeWidth={2} aria-hidden="true" />
          <p>
            <strong>Limited data:</strong> last ~90 days of public events, pushes not commits. A push counts once however many commits it holds, and
            private work is not included. Models that need more history say so instead of running.
          </p>
        </div>
      )}

      <section className="gh-section" aria-labelledby="gh-activity-heading">
        <div className="gh-section__head">
          <h3 id="gh-activity-heading">{rest ? "Public activity" : "Contributions"}</h3>
          <p className="gh-muted">{fmtRange(insights.range.from, insights.range.to)}</p>
        </div>
        <Heatmap insights={insights} calendar={calendar} stats={stats} unit={unit} />
        <StatsStrip insights={insights} stats={stats} unit={unit} />
        <TotalsLine insights={insights} />
      </section>

      <div className="gh-cols">
        <section className="gh-section" aria-labelledby="gh-highlights-heading">
          <h3 id="gh-highlights-heading">Highlights</h3>
          <Highlights insights={insights} stats={stats} unit={unit} />
        </section>
        <div className="gh-section">
          <section className="gh-section" aria-labelledby="gh-repos-heading">
            <h3 id="gh-repos-heading">Top repositories</h3>
            <TopRepos insights={insights} stats={stats} focus={repoFocus} unit={unit} />
          </section>
          <section className="gh-section" aria-labelledby="gh-langs-heading">
            <h3 id="gh-langs-heading">Languages</h3>
            <Languages insights={insights} stats={stats} />
          </section>
        </div>
      </div>

      <Labs key={`${insights.login}:${insights.generatedAt}`} insights={insights} unit={unit} />
    </div>
  );
}

export default function GitHubApp({ target }: { target?: OsTarget; actions: OsActions }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState<GitHubInsights | null>(null);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [other, setOther] = useState<GitHubInsights | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<RepoFocus | null>(null);
  const controller = useRef<AbortController | null>(null);
  const otherLogin = useRef<string | null>(null);
  const focusSeq = useRef(0);
  otherLogin.current = other?.login.toLowerCase() ?? null;

  const loadOwn = useCallback(() => {
    setOwnError(null);
    loadOwnInsights().then(setOwn, (error: unknown) => setOwnError(error instanceof Error ? error.message : "The saved GitHub snapshot could not be loaded."));
  }, []);

  useEffect(() => {
    loadOwn();
    return () => controller.current?.abort();
  }, [loadOwn]);

  const scrollTop = useCallback(() => {
    const body = rootRef.current?.closest(".os-win__body");
    if (body) body.scrollTop = 0;
  }, []);

  const focusRepo = useCallback((login: string, repo?: string) => setFocus(repo ? { login, repo, seq: ++focusSeq.current } : null), []);

  const showOwn = useCallback(
    (repo?: string) => {
      controller.current?.abort();
      controller.current = null;
      setOther(null);
      setLookup({ status: "idle" });
      focusRepo(OWN, repo);
    },
    [focusRepo]
  );

  const runLookup = useCallback(
    (input: string, repo?: string) => {
      const login = normalizeLogin(input);
      if (!login) return;
      if (login === OWN) {
        showOwn(repo);
        scrollTop();
        return;
      }
      controller.current?.abort();
      controller.current = null;
      if (!isValidLogin(login)) {
        setLookup({ status: "error", login: input.trim(), kind: "invalid-login", message: "" });
        return;
      }
      if (otherLogin.current === login) {
        setLookup({ status: "idle" });
        focusRepo(login, repo);
        return;
      }
      const ctrl = new AbortController();
      controller.current = ctrl;
      setLookup({ status: "loading", login });
      loadInsights(login, { signal: ctrl.signal }).then(
        (insights) => {
          if (ctrl.signal.aborted) return;
          controller.current = null;
          setLookup({ status: "idle" });
          setOther(insights.login.toLowerCase() === OWN ? null : insights);
          focusRepo(insights.login, repo);
          scrollTop();
        },
        (error: unknown) => {
          if (ctrl.signal.aborted) return;
          controller.current = null;
          if (error instanceof GitHubLookupError) setLookup({ status: "error", login, kind: error.kind, message: error.message, resetAt: error.resetAt });
          else setLookup({ status: "error", login, kind: "network", message: "GitHub could not be reached." });
        }
      );
    },
    [focusRepo, scrollTop, showOwn]
  );

  /* A link asked for "login" or "login/repo"; a new seq re-applies the same request. */
  const targetSeq = target?.seq;
  const targetValue = target?.value;
  useEffect(() => {
    if (targetSeq === undefined || targetValue === undefined) return;
    const parsed = parseGitHubTarget(targetValue);
    if (!parsed) return;
    setQuery(parsed.login === OWN ? "" : parsed.login);
    runLookup(parsed.login, parsed.repo);
  }, [targetSeq, targetValue, runLookup]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) runLookup(query);
  };

  const backToOwn = () => {
    showOwn();
    setQuery("");
    scrollTop();
  };

  const insights = other ?? own;

  return (
    <div className="gh" ref={rootRef}>
      <div className="gh-toolbar">
        {other && (
          <button type="button" className="os-button" onClick={backToOwn}>
            <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
            Back to {own?.name ?? OWN_GITHUB_LOGIN}
          </button>
        )}
        <form className="gh-search" role="search" aria-label="Look up a GitHub user" onSubmit={onSubmit}>
          <label className="gh-search__field">
            <Search size={15} strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">GitHub username</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Look up a GitHub user"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>
          <button type="submit" className="os-button os-button--primary">
            Look up
          </button>
        </form>
      </div>
      <div className="gh-status" role="status">
        {lookup.status === "loading" && (
          <>
            <LoaderCircle className="gh-spin" size={15} strokeWidth={2} aria-hidden="true" />
            Looking up @{lookup.login}…
          </>
        )}
      </div>
      {lookup.status === "error" && (
        <div className="gh-alert" role="alert" data-kind={lookup.kind}>
          <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
          <p>{errorCopy(lookup)}</p>
          {(lookup.kind === "network" || lookup.kind === "rate-limited" || lookup.kind === "invalid-data") && (
            <button type="button" className="os-button" onClick={() => runLookup(lookup.login)}>
              Try again
            </button>
          )}
        </div>
      )}
      {insights ? (
        <Profile insights={insights} focus={focus} own={!other} />
      ) : ownError ? (
        <div className="gh-alert" role="alert">
          <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
          <p>{ownError}</p>
          <button type="button" className="os-button" onClick={loadOwn}>
            Try again
          </button>
        </div>
      ) : (
        <p className="os-loading">Loading GitHub activity…</p>
      )}
    </div>
  );
}
