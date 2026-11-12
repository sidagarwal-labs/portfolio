import type { DayCount, GitHubInsights, GitHubRepoInsight } from "../contract";
import { safeDiv, sum, weekdayOf, weekStartOf } from "./util";

/* Pure computations behind the overview's Insights cards: momentum, weekly rhythm, sprints, languages over time,
   and the contribution mix. Everything comes from data the app already loads; nothing names a private repository. */

/* ---------- Momentum ---------- */

export interface MomentumWeek {
  /** Sunday that starts the week (the first week's Sunday may precede range.from). */
  start: string;
  /** Days of this week inside the range: 7, or fewer for a partial first or last week. */
  days: number;
  total: number;
  /** Trailing `window`-week average as a 7-day rate (partial weeks are scaled by the days they cover); null while warming up. */
  rolling: number | null;
}

export type MomentumTrend = "rising" | "cooling" | "steady" | "quiet" | "insufficient";

export interface MomentumPeriod {
  from: string;
  to: string;
  total: number;
}

export interface Momentum {
  window: number;
  weeks: MomentumWeek[];
  /** Length of each comparison period: 28 days, or half the range when that is shorter; 0 for ranges under 14 days. */
  periodDays: number;
  recent: MomentumPeriod | null;
  prior: MomentumPeriod | null;
  /** (recent − prior) / prior; null when there is no comparison or prior is 0. */
  change: number | null;
  /** rising/cooling: at least ±20% and ±2 apart; quiet: nothing in either period. */
  trend: MomentumTrend;
  /** Week with the highest total (earliest on ties); null with no activity. */
  peak: MomentumWeek | null;
}

export const MOMENTUM_THRESHOLD = 0.2;

export function buildMomentum(days: readonly DayCount[], window = 4): Momentum {
  const weeks: MomentumWeek[] = [];
  for (const d of days) {
    const start = weekStartOf(d.date);
    const last = weeks[weeks.length - 1];
    if (last && last.start === start) {
      last.days++;
      last.total += d.count;
    } else {
      weeks.push({ start, days: 1, total: d.count, rolling: null });
    }
  }
  for (let i = window - 1; i < weeks.length; i++) {
    const span = weeks.slice(i - window + 1, i + 1);
    weeks[i].rolling = (7 * sum(span.map((w) => w.total))) / sum(span.map((w) => w.days));
  }

  let peak: MomentumWeek | null = null;
  for (const week of weeks) if (week.total > 0 && (!peak || week.total > peak.total)) peak = week;

  const periodDays = Math.min(28, Math.floor(days.length / 2));
  if (periodDays < 7) return { window, weeks, periodDays: 0, recent: null, prior: null, change: null, trend: "insufficient", peak };
  const period = (slice: readonly DayCount[]): MomentumPeriod => ({ from: slice[0].date, to: slice[slice.length - 1].date, total: sum(slice.map((d) => d.count)) });
  const recent = period(days.slice(days.length - periodDays));
  const prior = period(days.slice(days.length - 2 * periodDays, days.length - periodDays));
  const change = prior.total > 0 ? (recent.total - prior.total) / prior.total : null;
  const diff = recent.total - prior.total;
  let trend: MomentumTrend = "steady";
  if (recent.total === 0 && prior.total === 0) trend = "quiet";
  else if (diff >= 2 && (change === null || change >= MOMENTUM_THRESHOLD)) trend = "rising";
  else if (diff <= -2 && change !== null && change <= -MOMENTUM_THRESHOLD) trend = "cooling";
  return { window, weeks, periodDays, recent, prior, change, trend, peak };
}

/* ---------- Weekly rhythm ---------- */

export interface RhythmDay {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  total: number;
  activeDays: number;
  /** How many times this weekday occurs in the range. */
  occurrences: number;
  /** activeDays / occurrences. */
  activeRate: number;
  /** Share of the range's total. */
  share: number;
}

export interface Rhythm {
  days: RhythmDay[];
  total: number;
  /** Weekday with the highest total (ties: higher active rate, then earlier in the week); null with no activity. */
  strongest: number | null;
  /** Weekday with the highest active rate (ties: higher total, then earlier); null with no activity. */
  mostConsistent: number | null;
  /** Saturday + Sunday share of the total. */
  weekendShare: number;
}

export function buildRhythm(days: readonly DayCount[]): Rhythm {
  const rows: RhythmDay[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, total: 0, activeDays: 0, occurrences: 0, activeRate: 0, share: 0 }));
  for (const d of days) {
    const row = rows[weekdayOf(d.date)];
    row.occurrences++;
    row.total += d.count;
    if (d.count > 0) row.activeDays++;
  }
  const total = sum(rows.map((r) => r.total));
  for (const row of rows) {
    row.activeRate = safeDiv(row.activeDays, row.occurrences);
    row.share = safeDiv(row.total, total);
  }
  const pick = (better: (a: RhythmDay, b: RhythmDay) => boolean) =>
    total > 0 ? rows.reduce((best, row) => (better(row, best) ? row : best)).weekday : null;
  return {
    days: rows,
    total,
    strongest: pick((a, b) => a.total > b.total || (a.total === b.total && a.activeRate > b.activeRate)),
    mostConsistent: pick((a, b) => a.activeRate > b.activeRate || (a.activeRate === b.activeRate && a.total > b.total)),
    weekendShare: safeDiv(rows[0].total + rows[6].total, total)
  };
}

/* ---------- Sprints ---------- */

export interface SprintRepo {
  name: string;
  url: string;
  count: number;
}

export interface Sprint {
  /** First and last active days. */
  start: string;
  end: string;
  /** Calendar days from start to end, inclusive. */
  length: number;
  activeDays: number;
  total: number;
  /** Share of the range's total. */
  share: number;
  /** Busiest day of the sprint (earliest on ties). */
  peak: DayCount;
  /** Daily counts from start to end, for a sparkline. */
  daily: number[];
  /** Repositories in the data (all public) with activity during the sprint, most active first. */
  repos: SprintRepo[];
  /** Part of `total` not tied to a listed repository: private work, and anything the per-repository activity does not count. */
  unattributed: number;
}

export interface SprintOptions {
  /** Longest run of quiet days a sprint can bridge. */
  maxGap?: number;
  /** Fewest active days a sprint needs. */
  minActiveDays?: number;
  /** How many sprints to return, largest first. */
  limit?: number;
}

export interface SprintReport {
  sprints: Sprint[];
  /** Sprints found before `limit` was applied. */
  found: number;
  /** Share of the range's total that falls inside any found sprint. */
  coverage: number;
  maxGap: number;
  minActiveDays: number;
}

/**
 * A sprint is a run of at least `minActiveDays` active days in which no more than `maxGap` quiet days fall in a row.
 * Sprints rank by total (then active days, then the more recent first).
 */
export function detectSprints(days: readonly DayCount[], repos: readonly GitHubRepoInsight[], options: SprintOptions = {}): SprintReport {
  const maxGap = Math.max(0, Math.floor(options.maxGap ?? 1));
  const minActiveDays = Math.max(1, Math.floor(options.minActiveDays ?? 3));
  const limit = Math.max(0, Math.floor(options.limit ?? 5));
  const runs: { first: number; last: number }[] = [];
  let first = -1;
  let last = -1;
  for (let i = 0; i < days.length; i++) {
    if (days[i].count <= 0) continue;
    if (first >= 0 && i - last - 1 <= maxGap) last = i;
    else {
      if (first >= 0) runs.push({ first, last });
      first = i;
      last = i;
    }
  }
  if (first >= 0) runs.push({ first, last });

  const rangeTotal = sum(days.map((d) => d.count));
  const all = runs
    .map(({ first: a, last: b }) => {
      const slice = days.slice(a, b + 1);
      return { a, b, slice, total: sum(slice.map((d) => d.count)), activeDays: slice.filter((d) => d.count > 0).length };
    })
    .filter((run) => run.activeDays >= minActiveDays)
    .sort((x, y) => y.total - x.total || y.activeDays - x.activeDays || y.a - x.a);

  const sprints = all.slice(0, limit).map(({ slice, total, activeDays }): Sprint => {
    const start = slice[0].date;
    const end = slice[slice.length - 1].date;
    const touched = repos
      .map((repo) => ({ name: repo.name, url: repo.url, count: sum(repo.activity.filter((a) => a.count > 0 && a.date >= start && a.date <= end).map((a) => a.count)) }))
      .filter((repo) => repo.count > 0)
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
    const peak = slice.reduce((best, d) => (d.count > best.count ? d : best));
    return {
      start,
      end,
      length: slice.length,
      activeDays,
      total,
      share: safeDiv(total, rangeTotal),
      peak: { date: peak.date, count: peak.count },
      daily: slice.map((d) => d.count),
      repos: touched,
      unattributed: Math.max(0, total - sum(touched.map((r) => r.count)))
    };
  });
  return { sprints, found: all.length, coverage: safeDiv(sum(all.map((run) => run.total)), rangeTotal), maxGap, minActiveDays };
}

/* ---------- Languages over time ---------- */

export interface LanguageSeries {
  name: string;
  /** Estimated activity per month, aligned with `months`. */
  values: number[];
  total: number;
  /** Share of all attributed activity. */
  share: number;
}

export interface LanguageTimeline {
  /** YYYY-MM months the range touches, in order. */
  months: string[];
  /** Largest languages first, then "Other" when smaller ones were folded in. */
  series: LanguageSeries[];
  monthTotals: number[];
  /** Repository activity in the range that was spread across languages. */
  attributed: number;
  /** The range's total, for coverage. */
  total: number;
  /** "bytes": every active repository split by its language bytes; "primary": by primary language (no byte counts); "mixed": some of each. */
  basis: "bytes" | "primary" | "mixed" | "none";
  /**
   * The language (not "Other") whose share moved most between the earlier and later halves of the months (the middle
   * month of an odd count is left out), when it moved at least 10 points; shares are of each half's attributed activity.
   */
  shift: { name: string; from: number; to: number } | null;
}

export const OTHER_LANGUAGES = "Other";
export const UNKNOWN_LANGUAGE = "Unknown";
export const LANGUAGE_SHIFT_THRESHOLD = 0.1;

/** A repository's language shares: by bytes when GitHub reports sizes, else its primary language. */
export function languageShares(repo: GitHubRepoInsight): { shares: [string, number][]; basis: "bytes" | "primary" } {
  const sized = repo.languages.filter((l) => l.size > 0);
  const bytes = sum(sized.map((l) => l.size));
  if (bytes > 0) return { shares: sized.map((l) => [l.name, l.size / bytes]), basis: "bytes" };
  const name = repo.primaryLanguage ?? repo.languages[0]?.name ?? UNKNOWN_LANGUAGE;
  return { shares: [[name, 1]], basis: "primary" };
}

/**
 * Estimated activity by language and month: each repository's in-range activity is attributed to its languages in
 * proportion to their byte shares today (so a repository that changed languages is smeared across its history).
 */
export function buildLanguageTimeline(insights: Pick<GitHubInsights, "days" | "repos">, top = 5): LanguageTimeline {
  const months: string[] = [];
  for (const d of insights.days) if (months[months.length - 1] !== d.date.slice(0, 7)) months.push(d.date.slice(0, 7));
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const from = insights.days[0]?.date ?? "";
  const to = insights.days[insights.days.length - 1]?.date ?? "";
  const byLanguage = new Map<string, number[]>();
  const bases = new Set<"bytes" | "primary">();
  let attributed = 0;

  for (const repo of insights.repos) {
    const active = repo.activity.filter((a) => a.count > 0 && a.date >= from && a.date <= to);
    if (!active.length) continue;
    const { shares, basis } = languageShares(repo);
    bases.add(basis);
    for (const a of active) {
      const m = monthIndex.get(a.date.slice(0, 7));
      if (m === undefined) continue;
      attributed += a.count;
      for (const [name, share] of shares) {
        const values = byLanguage.get(name) ?? new Array<number>(months.length).fill(0);
        values[m] += a.count * share;
        byLanguage.set(name, values);
      }
    }
  }

  const ranked = [...byLanguage]
    .map(([name, values]) => ({ name, values, total: sum(values) }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const keep = ranked.length > top + 1 ? ranked.slice(0, top) : ranked;
  const rest = ranked.slice(keep.length);
  const series: LanguageSeries[] = keep.map((s) => ({ ...s, share: safeDiv(s.total, attributed) }));
  if (rest.length) {
    const values = months.map((_, i) => sum(rest.map((s) => s.values[i])));
    series.push({ name: OTHER_LANGUAGES, values, total: sum(values), share: safeDiv(sum(values), attributed) });
  }
  const monthTotals = months.map((_, i) => sum(series.map((s) => s.values[i])));

  let shift: LanguageTimeline["shift"] = null;
  const half = Math.floor(months.length / 2);
  const early = (values: number[]) => sum(values.slice(0, half));
  const late = (values: number[]) => sum(values.slice(months.length - half));
  const earlyTotal = early(monthTotals);
  const lateTotal = late(monthTotals);
  if (half > 0 && earlyTotal > 0 && lateTotal > 0) {
    for (const s of series) {
      if (s.name === OTHER_LANGUAGES) continue;
      const from = early(s.values) / earlyTotal;
      const to = late(s.values) / lateTotal;
      if (Math.abs(to - from) >= LANGUAGE_SHIFT_THRESHOLD && (!shift || Math.abs(to - from) > Math.abs(shift.to - shift.from))) shift = { name: s.name, from, to };
    }
  }
  return {
    months,
    series,
    monthTotals,
    attributed,
    total: sum(insights.days.map((d) => d.count)),
    basis: bases.size === 0 ? "none" : bases.size === 2 ? "mixed" : bases.has("bytes") ? "bytes" : "primary",
    shift
  };
}

/* ---------- Contribution mix ---------- */

export type MixKind = "commits" | "pullRequests" | "issues" | "reviews";
export const MIX_KINDS: readonly MixKind[] = ["commits", "pullRequests", "issues", "reviews"];

export interface MixItem {
  kind: MixKind | "other";
  count: number;
  /** Share of `total`. */
  share: number;
}

export interface ContributionMix {
  source: GitHubInsights["source"];
  /** Commits (pushes for "rest-events"), pull requests, issues, reviews, then "other" when it is not 0. */
  items: MixItem[];
  /** totals.contributions, or the sum of the four kinds if that is larger. */
  total: number;
  /** Sum of the four kinds. */
  typed: number;
  /** total − typed. "graphql": repositories created and private (restricted) contributions; "rest-events": other public events. */
  other: number;
  /** Largest of the four kinds (earliest in MIX_KINDS on ties); null when all are 0. */
  dominant: MixKind | null;
}

export function buildContributionMix(insights: Pick<GitHubInsights, "source" | "totals">): ContributionMix {
  const t = insights.totals;
  const counts = MIX_KINDS.map((kind) => Math.max(0, t[kind]));
  const typed = sum(counts);
  const total = Math.max(t.contributions, typed);
  const other = total - typed;
  const items: MixItem[] = MIX_KINDS.map((kind, i) => ({ kind, count: counts[i], share: safeDiv(counts[i], total) }));
  if (other > 0) items.push({ kind: "other", count: other, share: safeDiv(other, total) });
  let dominant: MixKind | null = null;
  let best = 0;
  for (let i = 0; i < MIX_KINDS.length; i++) {
    if (counts[i] > best) {
      best = counts[i];
      dominant = MIX_KINDS[i];
    }
  }
  return { source: insights.source, items, total, typed, other, dominant };
}
