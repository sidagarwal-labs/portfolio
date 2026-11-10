import type { DayCount, GitHubInsights } from "../contract";
import { mean, median, safeDiv, sum, variance, weekdayOf, weekStartOf } from "./util";

export interface Streak {
  length: number;
  start: string;
  end: string;
}

export interface RepoTotal {
  name: string;
  nameWithOwner: string;
  url: string;
  total: number;
  activeDays: number;
  /** Share of all repo-attributed activity (shares sum to 1). */
  share: number;
  /** All-time default-branch commits by the user, when the data has it (GraphQL only). */
  allTimeCommits?: number;
}

export interface ActivityStats {
  days: number;
  total: number;
  activeDays: number;
  activeRate: number;
  meanPerActiveDay: number;
  medianPerActiveDay: number;
  maxDay: DayCount | null;
  longestStreak: Streak | null;
  /** Consecutive active days ending exactly at range.to (0 if that day is inactive). */
  currentStreak: number;
  /** Index 0 = Sunday. */
  weekdayTotals: number[];
  /** Active days / occurrences of that weekday in range. */
  weekdayActiveRate: number[];
  /** Sunday-start week (start = the Sunday, which may precede range.from) with the highest total. */
  busiestWeek: { start: string; total: number } | null;
  monthly: { month: string; total: number }[];
  topRepos: RepoTotal[];
  /** Bytes summed across repos (GitHub linguist sizes). */
  languages: { name: string; bytes: number; share: number }[];
  /** Gini coefficient of daily counts: 0 = perfectly even, → 1 = everything on one day. */
  giniConcentration: number;
  /** Variance / mean of daily counts (sample variance). Poisson ⇒ ≈1; > 1 = overdispersed/bursty. */
  dispersionIndex: number;
}

export function computeStats(insights: GitHubInsights): ActivityStats {
  const days = insights.days;
  const counts = days.map((d) => d.count);
  const active = counts.filter((c) => c > 0);
  const total = sum(counts);

  let maxDay: DayCount | null = null;
  for (const d of days) if (d.count > 0 && (!maxDay || d.count > maxDay.count)) maxDay = d;

  let longestStreak: Streak | null = null;
  let runStart = -1;
  for (let i = 0; i <= days.length; i++) {
    const isActive = i < days.length && days[i].count > 0;
    if (isActive && runStart < 0) runStart = i;
    if (!isActive && runStart >= 0) {
      const length = i - runStart;
      if (!longestStreak || length > longestStreak.length) longestStreak = { length, start: days[runStart].date, end: days[i - 1].date };
      runStart = -1;
    }
  }

  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0 && days[i].count > 0; i--) currentStreak++;

  const weekdayTotals = new Array(7).fill(0);
  const weekdayActive = new Array(7).fill(0);
  const weekdaySeen = new Array(7).fill(0);
  const weekTotals = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  for (const d of days) {
    const wd = weekdayOf(d.date);
    weekdayTotals[wd] += d.count;
    weekdaySeen[wd]++;
    if (d.count > 0) weekdayActive[wd]++;
    const ws = weekStartOf(d.date);
    weekTotals.set(ws, (weekTotals.get(ws) ?? 0) + d.count);
    const month = d.date.slice(0, 7);
    monthTotals.set(month, (monthTotals.get(month) ?? 0) + d.count);
  }

  let busiestWeek: ActivityStats["busiestWeek"] = null;
  for (const [start, weekTotal] of weekTotals) {
    if (weekTotal > 0 && (!busiestWeek || weekTotal > busiestWeek.total)) busiestWeek = { start, total: weekTotal };
  }

  const { from, to } = insights.range;
  const repoRows = insights.repos
    .map((r) => {
      const inRange = r.activity.filter((a) => a.count > 0 && a.date >= from && a.date <= to);
      return {
        name: r.name, nameWithOwner: r.nameWithOwner, url: r.url, total: sum(inRange.map((a) => a.count)), activeDays: inRange.length,
        ...(r.allTimeCommits === undefined ? {} : { allTimeCommits: r.allTimeCommits })
      };
    })
    .filter((r) => r.total > 0);
  const repoSum = sum(repoRows.map((r) => r.total));
  const topRepos = repoRows
    .map((r) => ({ ...r, share: safeDiv(r.total, repoSum) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const langBytes = new Map<string, number>();
  for (const repo of insights.repos) for (const l of repo.languages) langBytes.set(l.name, (langBytes.get(l.name) ?? 0) + Math.max(0, l.size));
  const byteSum = sum([...langBytes.values()]);
  const languages = [...langBytes]
    .map(([name, bytes]) => ({ name, bytes, share: safeDiv(bytes, byteSum) }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));

  const m = mean(counts);
  return {
    days: days.length,
    total,
    activeDays: active.length,
    activeRate: safeDiv(active.length, days.length),
    meanPerActiveDay: mean(active),
    medianPerActiveDay: median(active),
    maxDay,
    longestStreak,
    currentStreak,
    weekdayTotals,
    weekdayActiveRate: weekdayActive.map((a, i) => safeDiv(a, weekdaySeen[i])),
    busiestWeek,
    monthly: [...monthTotals].map(([month, monthTotal]) => ({ month, total: monthTotal })),
    topRepos,
    languages,
    giniConcentration: gini(counts),
    dispersionIndex: m > 0 ? variance(counts) / m : 0
  };
}

/** Gini coefficient of non-negative values (sorted closed form). */
export function gini(values: readonly number[]): number {
  const n = values.length;
  const total = sum(values);
  if (n === 0 || total <= 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * sorted[i];
  return Math.max(0, (2 * weighted) / (n * total) - (n + 1) / n);
}
