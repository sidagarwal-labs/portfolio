import type { ActivityStats } from "../analytics";
import type { GitHubInsights } from "../contract";
import { fmtDate, fmtInt, fmtNum, fmtPct, fmtRange, fmtShortDate, plural } from "./format";

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
export const languageColor = (name: string, i: number) => LANGUAGE_COLORS[name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
