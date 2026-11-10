import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ActivityStats } from "../analytics";
import type { GitHubInsights } from "../contract";
import { fmtDate, fmtInt, fmtMonth, fmtNum, fmtPct, fmtRange, fmtShortDate, plural, WEEKDAYS } from "./format";

export function StatsStrip({ insights, stats, unit }: { insights: GitHubInsights; stats: ActivityStats; unit: string }) {
  const items = [
    { id: "total", label: unit === "events" ? "Public events" : "Contributions", value: fmtInt(stats.total), note: `in ${plural(stats.days, "day")}` },
    { id: "active-days", label: "Active days", value: fmtInt(stats.activeDays), note: `${fmtPct(stats.activeRate)} of days` },
    {
      id: "longest-streak",
      label: "Longest streak",
      value: plural(stats.longestStreak?.length ?? 0, "day"),
      note: stats.longestStreak ? fmtRange(stats.longestStreak.start, stats.longestStreak.end) : "no active days"
    },
    {
      id: "current-streak",
      label: "Current streak",
      value: plural(stats.currentStreak, "day"),
      note: stats.currentStreak > 0 ? `through ${fmtShortDate(insights.range.to)}` : `none on ${fmtShortDate(insights.range.to)}`
    },
    {
      id: "busiest-week",
      label: "Busiest week",
      value: stats.busiestWeek ? fmtInt(stats.busiestWeek.total) : "0",
      note: stats.busiestWeek ? `week of ${fmtDate(stats.busiestWeek.start)}` : "no activity"
    },
    {
      id: "concentration",
      label: "Concentration (Gini)",
      value: fmtNum(stats.giniConcentration),
      note: `variance/mean ${fmtNum(stats.dispersionIndex, 1)}`
    }
  ];
  return (
    <dl className="gh-stats">
      {items.map((item) => (
        <div key={item.id} className="gh-stat" data-stat={item.id}>
          <dt className="gh-stat__label">{item.label}</dt>
          <dd className="gh-stat__value">{item.value}</dd>
          <dd className="gh-stat__note">{item.note}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TotalsLine({ insights }: { insights: GitHubInsights }) {
  const t = insights.totals;
  const rest = insights.source === "rest-events";
  const parts = [
    rest ? plural(t.commits, "push", "pushes") : plural(t.commits, "commit"),
    plural(t.pullRequests, "pull request"),
    plural(t.reviews, "review"),
    plural(t.issues, "issue"),
    `${plural(t.repositories, "repository", "repositories")} created`
  ];
  return (
    <p className="gh-totals">
      {parts.join(" · ")}
      {t.restricted > 0 && ` · ${fmtInt(t.restricted)} in private repositories (counted in the calendar, never named)`}
    </p>
  );
}

export function Highlights({ insights, stats, unit }: { insights: GitHubInsights; stats: ActivityStats; unit: string }) {
  const items: string[] = [];
  if (stats.maxDay) items.push(`Busiest day: ${fmtDate(stats.maxDay.date)}, with ${plural(stats.maxDay.count, unit.replace(/s$/, ""), unit)}.`);
  const weekday = stats.weekdayTotals.reduce((best, v, i, all) => (v > all[best] ? i : best), 0);
  if (stats.weekdayTotals[weekday] > 0) {
    items.push(`Most ${unit} land on ${WEEKDAYS[weekday]}s: ${fmtInt(stats.weekdayTotals[weekday])} in total, active on ${fmtPct(stats.weekdayActiveRate[weekday])} of them.`);
  }
  const month = stats.monthly.reduce<{ month: string; total: number } | null>((best, m) => (!best || m.total > best.total ? m : best), null);
  if (month && month.total > 0) items.push(`Busiest month: ${fmtMonth(month.month)}, ${fmtPct(month.total / Math.max(1, stats.total))} of the period's total.`);
  if (stats.activeDays > 0) {
    const skewed = stats.meanPerActiveDay > stats.medianPerActiveDay * 1.2;
    items.push(
      skewed
        ? `A typical active day has ${fmtNum(stats.medianPerActiveDay, stats.medianPerActiveDay % 1 ? 1 : 0)} (median); the mean is ${fmtNum(stats.meanPerActiveDay, 1)} because a few large days pull it up.`
        : `Active days average ${fmtNum(stats.meanPerActiveDay, 1)} (median ${fmtNum(stats.medianPerActiveDay, 1)}).`
    );
  }
  const top = stats.topRepos[0];
  if (top) items.push(`${top.name} accounts for ${fmtPct(top.share)} of repository-attributed activity, across ${plural(top.activeDays, "active day")}.`);
  if (stats.giniConcentration >= 0.6) items.push(`Work comes in bursts: a Gini of ${fmtNum(stats.giniConcentration)} means a small share of days holds most of the ${unit}.`);
  if (!items.length) items.push(`No ${unit} in this range.`);
  return (
    <ul className="gh-highlights">
      {items.map((text) => <li key={text}>{text}</li>)}
    </ul>
  );
}

export type RepoFocus = { login: string; repo: string; seq: number };

const VISIBLE_REPOS = 8;

export function TopRepos({ insights, stats, focus, unit }: { insights: GitHubInsights; stats: ActivityStats; focus: RepoFocus | null; unit: string }) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const legendId = useId();
  const focusName = focus?.repo.toLowerCase();
  const focusIndex = focusName ? stats.topRepos.findIndex((r) => r.name.toLowerCase() === focusName) : -1;
  const showAll = expanded || focusIndex >= VISIBLE_REPOS;
  const rows = showAll ? stats.topRepos : stats.topRepos.slice(0, VISIBLE_REPOS);
  const max = stats.topRepos[0]?.total ?? 1;
  const rest = insights.source === "rest-events";
  // GraphQL ranges are GitHub's contribution year (365-372 days); the REST fallback covers ~90 days.
  const period = stats.days >= 360 ? "the last 12 months" : `the last ${plural(stats.days, "day")}`;
  const counted = rest ? "events" : "commits";
  const hasAllTime = stats.topRepos.some((r) => r.allTimeCommits !== undefined);
  const aboveAllTime = stats.topRepos.some((r) => r.allTimeCommits !== undefined && r.total > r.allTimeCommits);

  useEffect(() => {
    if (!focus || focusIndex < 0) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-repo="${CSS.escape(focus.repo.toLowerCase())}"]`);
    row?.scrollIntoView({ block: "center" });
    row?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  }, [focus, focusIndex]);

  const missing = focus && focusIndex < 0 ? insights.repos.find((r) => r.name.toLowerCase() === focusName) : undefined;
  const missingUrl = focus ? missing?.url ?? `https://github.com/${focus.login}/${focus.repo}` : "";

  return (
    <>
      {focus && focusIndex < 0 && (
        <p className="gh-note" role="status">
          {missing ? `${missing.name} has no recorded activity in this range.` : `${focus.repo} is not among the public repositories in this data.`}{" "}
          <a href={missingUrl} target="_blank" rel="noreferrer">
            Open on GitHub
            <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
          </a>
        </p>
      )}
      {stats.topRepos.length === 0 ? (
        <p className="gh-muted">No repository-attributed {unit} in this range.</p>
      ) : (
        <>
          <p className="gh-fine gh-repos__legend" id={legendId}>
            {rest ? "Public events" : "Commits"} in {period} · share of all repository {counted} · active days.
            {hasAllTime && ` All-time: every commit by @${insights.login} on the default branch.`}
          </p>
          <ol className="gh-repos" ref={listRef} aria-describedby={legendId}>
            {rows.map((repo) => {
              const highlighted = focusName === repo.name.toLowerCase();
              const allTime = repo.allTimeCommits;
              return (
                <li
                  key={repo.nameWithOwner}
                  className={`gh-repo${allTime === undefined ? "" : " has-total"}${highlighted ? " is-highlighted" : ""}`}
                  data-repo={repo.name.toLowerCase()}
                  aria-current={highlighted ? "true" : undefined}
                >
                  <a className="gh-repo__name" href={repo.url} target="_blank" rel="noreferrer">{repo.name}</a>
                  <span className="gh-repo__bar" aria-hidden="true"><span style={{ width: `${(repo.total / max) * 100}%` }} /></span>
                  <span className="gh-repo__value">
                    {fmtInt(repo.total)}
                    <span className="sr-only"> {rest ? "public events" : "commits"} in {period}</span> <span className="gh-muted">· {fmtPct(repo.share)} · {plural(repo.activeDays, "day")}</span>
                  </span>
                  {allTime !== undefined && <span className="gh-repo__total">{fmtInt(allTime)} all-time</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}
      {stats.topRepos.length > VISIBLE_REPOS && (
        <button type="button" className="gh-link-button" aria-expanded={showAll} onClick={() => setExpanded(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${stats.topRepos.length}`}
        </button>
      )}
      {!rest && stats.topRepos.length > 0 && (
        <p className="gh-fine gh-repos__note">
          Only default-branch commits count, and a squash-merged pull request counts as one.
          {aboveAllTime && " A 12-month count above the all-time one means GitHub still credits commits that are no longer on the branch, for example after a force-push."}
        </p>
      )}
    </>
  );
}

const LANGUAGE_COLORS: Record<string, string> = {
  "Jupyter Notebook": "#da5b0b",
  Python: "#3572a5",
  TypeScript: "#3178c6",
  JavaScript: "#d4b830",
  CSS: "#663399",
  HTML: "#e34c26",
  PowerShell: "#012456",
  Shell: "#4e9a06",
  R: "#198ce7",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Go: "#00add8",
  Rust: "#a5583a",
  SCSS: "#c6538c"
};
const FALLBACK_COLORS = ["#6b7383", "#8a6d1f", "#3f8f74", "#a66bf0", "#c83d42", "#5f8fb4"];
const languageColor = (name: string, i: number) => LANGUAGE_COLORS[name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];

export function Languages({ insights, stats }: { insights: GitHubInsights; stats: ActivityStats }) {
  const bySize = stats.languages.some((l) => l.bytes > 0);
  const rows = useMemo(() => {
    if (bySize) return stats.languages.map((l) => ({ name: l.name, share: l.share }));
    const counts = new Map<string, number>();
    for (const repo of insights.repos) if (repo.primaryLanguage) counts.set(repo.primaryLanguage, (counts.get(repo.primaryLanguage) ?? 0) + 1);
    const total = [...counts.values()].reduce((s, v) => s + v, 0);
    return [...counts].map(([name, n]) => ({ name, share: total ? n / total : 0 })).sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
  }, [bySize, insights, stats]);
  const top = rows.slice(0, 6);
  const other = rows.slice(6).reduce((s, r) => s + r.share, 0);
  if (!rows.length) return <p className="gh-muted">No language data.</p>;
  return (
    <>
      <div className="gh-langbar" aria-hidden="true">
        {top.map((row, i) => <span key={row.name} style={{ width: `${row.share * 100}%`, background: languageColor(row.name, i) }} />)}
        {other > 0 && <span style={{ width: `${other * 100}%`, background: "#c9ced6" }} />}
      </div>
      <ul className="gh-langs">
        {top.map((row, i) => (
          <li key={row.name}>
            <span className="gh-dot" style={{ background: languageColor(row.name, i) }} aria-hidden="true" />
            {row.name} <span className="gh-muted">{fmtPct(row.share, 1)}</span>
          </li>
        ))}
        {other > 0 && (
          <li>
            <span className="gh-dot" style={{ background: "#c9ced6" }} aria-hidden="true" />
            Other <span className="gh-muted">{fmtPct(other, 1)}</span>
          </li>
        )}
      </ul>
      <p className="gh-fine">
        {bySize
          ? "Share of bytes across these repositories, as measured by GitHub's language detection. Notebooks are large files, so they dominate by bytes."
          : `Primary language of ${plural(insights.repos.filter((r) => r.primaryLanguage).length, "public repository", "public repositories")}. Byte counts are not available from public events.`}
      </p>
    </>
  );
}
