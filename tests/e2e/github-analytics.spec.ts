import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import type { DayCount, GitHubInsights, GitHubRepoInsight } from "../../src/features/views/os/github/contract";
import {
  addDays,
  assessTrainingData,
  buildCalendar,
  buildContributionMix,
  buildLanguageTimeline,
  buildLaunch,
  buildMarket,
  buildMomentum,
  buildRepoLab,
  buildRhythm,
  computeStats,
  createTrainer,
  detectSprints,
  ema,
  gini,
  jacobiEigen,
  languageShares,
  macd,
  momentumTest,
  mulberry32,
  OTHER_LANGUAGES,
  pelt,
  poissonSegmentCost,
  principalComponents,
  rsi,
  samplePoisson,
  sma,
  UNKNOWN_LANGUAGE,
  weekdayOf,
  type RepoLab,
  type TrainingResult
} from "../../src/features/views/os/github/analytics";

const SNAPSHOT_URL = new URL("../../src/content/generated/github-insights.json", import.meta.url);

function makeDays(counts: number[], start = "2025-01-01"): DayCount[] {
  return counts.map((count, i) => ({ date: addDays(start, i), count }));
}

function makeInsights(days: DayCount[], repos: GitHubRepoInsight[] = []): GitHubInsights {
  return {
    version: 1,
    login: "synthetic",
    name: null,
    avatarUrl: "",
    htmlUrl: "",
    bio: null,
    generatedAt: "2026-01-01T00:00:00Z",
    range: { from: days[0].date, to: days[days.length - 1].date },
    source: "graphql",
    totals: { contributions: days.reduce((s, d) => s + d.count, 0), commits: 0, pullRequests: 0, reviews: 0, issues: 0, repositories: repos.length, restricted: 0 },
    days,
    repos
  };
}

function repo(name: string, fields: Partial<GitHubRepoInsight> = {}): GitHubRepoInsight {
  return {
    name,
    nameWithOwner: `synthetic/${name}`,
    url: `https://github.com/synthetic/${name}`,
    description: null,
    primaryLanguage: "Python",
    languages: [],
    diskUsageKb: 100,
    stars: 0,
    forks: 0,
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2025-12-01T00:00:00Z",
    isFork: false,
    activity: [],
    ...fields
  };
}

/** Bursty series: weekday-seasonal activity with occasional big days, like a real contribution calendar. */
function burstySeries(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const weekday = weekdayOf(addDays("2025-01-01", i));
    const p = weekday === 0 || weekday === 6 ? 0.08 : 0.35;
    if (rand() >= p) return 0;
    return 1 + samplePoisson(rand, rand() < 0.15 ? 15 : 3);
  });
}

/** Weekday-seasonal series: Mon–Fri almost always active, weekends almost never. */
function seasonalSeries(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const weekday = weekdayOf(addDays("2025-01-01", i));
    const weekend = weekday === 0 || weekday === 6;
    if (rand() >= (weekend ? 0.04 : 0.92)) return 0;
    return 1 + samplePoisson(rand, weekend ? 1 : 5);
  });
}

function expectAllFinite(value: unknown): void {
  const bad: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) bad.push(`${path}=${v}`);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(value, "result");
  expect(bad).toEqual([]);
}

function syntheticRepos(): GitHubRepoInsight[] {
  const rand = mulberry32(5);
  const jitter = (v: number) => v * (0.9 + 0.2 * rand());
  const activity = (total: number, days: number) => makeDays(Array.from({ length: days }, () => Math.max(1, Math.round(total / days))), "2025-11-01");
  const iso = (daysAgo: number) => new Date(Date.UTC(2025, 11, 31) - jitter(daysAgo) * 86_400_000).toISOString();
  const repos: GitHubRepoInsight[] = [];
  for (let i = 0; i < 6; i++) {
    repos.push(repo(`ml-${i}`, { primaryLanguage: i % 2 ? "Jupyter Notebook" : "Python", diskUsageKb: jitter(60_000), stars: Math.round(jitter(25)), createdAt: iso(1000), pushedAt: iso(3), activity: activity(80, 25) }));
    repos.push(repo(`web-${i}`, { primaryLanguage: i % 2 ? "TypeScript" : "JavaScript", diskUsageKb: jitter(300), stars: 0, createdAt: iso(30), pushedAt: iso(1), activity: activity(6, 3) }));
    repos.push(repo(`old-${i}`, { primaryLanguage: i % 2 ? "Go" : "Rust", diskUsageKb: jitter(6_000), stars: Math.round(jitter(4)), createdAt: iso(2200), pushedAt: iso(900), activity: [] }));
  }
  return repos;
}

test.describe("calendar", () => {
  test("cells are contiguous, weeks start Sunday, and the first column is partial", () => {
    const days = makeDays(burstySeries(366, 1), "2025-01-01"); // a Wednesday
    const cal = buildCalendar(days);
    expect(cal.cells).toHaveLength(366);
    expect(cal.cells[0]).toMatchObject({ date: "2025-01-01", week: 0, weekday: 3 });
    expect(cal.cells.filter((c) => c.week === 0)).toHaveLength(4);
    for (let i = 1; i < cal.cells.length; i++) {
      const prev = cal.cells[i - 1];
      const cur = cal.cells[i];
      expect(cur.date).toBe(addDays(prev.date, 1));
      expect(cur.week * 7 + cur.weekday).toBe(prev.week * 7 + prev.weekday + 1);
      expect(cur.weekday).toBe(weekdayOf(cur.date));
    }
    expect(cal.weeks).toBe(cal.cells[cal.cells.length - 1].week + 1);
  });

  test("level 0 iff count is 0, levels follow non-zero quantile thresholds", () => {
    const cal = buildCalendar(makeDays(burstySeries(366, 2)));
    const nonZero = cal.cells.filter((c) => c.count > 0).map((c) => c.count).sort((a, b) => a - b);
    expect(cal.thresholds[0]).toBeLessThanOrEqual(cal.thresholds[1]);
    expect(cal.thresholds[1]).toBeLessThanOrEqual(cal.thresholds[2]);
    expect(cal.thresholds[2]).toBeLessThanOrEqual(nonZero[nonZero.length - 1]);
    for (const c of cal.cells) {
      expect(c.level === 0).toBe(c.count === 0);
      if (c.count > cal.thresholds[2]) expect(c.level).toBe(4);
      if (c.count > 0 && c.count <= cal.thresholds[0]) expect(c.level).toBe(1);
    }
    const sorted = [...cal.cells].sort((a, b) => a.count - b.count);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].level).toBeGreaterThanOrEqual(sorted[i - 1].level);
  });

  test("month labels sit on the column holding the 1st; a cramped opening month is dropped", () => {
    const cal = buildCalendar(makeDays(new Array(366).fill(1), "2025-01-01"));
    expect(cal.months.map((m) => m.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan"]);
    for (const m of cal.months) expect(cal.cells.find((c) => c.date === `${m.month}-01`)?.week).toBe(m.week);
    expect(buildCalendar(makeDays(new Array(60).fill(0), "2025-01-05")).months[0]).toMatchObject({ label: "Jan", week: 0 });
    expect(buildCalendar(makeDays(new Array(60).fill(0), "2025-01-20")).months[0]).toMatchObject({ label: "Feb", week: 1 });
    expect(buildCalendar(makeDays(new Array(60).fill(0))).thresholds).toEqual([0, 0, 0]);
    expect(buildCalendar([]).cells).toHaveLength(0);
  });
});

test.describe("stats", () => {
  // 2025-01-05 is a Sunday, so each row below is one Sunday-start week.
  const counts = [0, 1, 1, 1, 0, 2, 0, /**/ 3, 3, 3, 3, 0, 0, 0, /**/ 0, 0, 1, 0, 0, 2, 4];
  const insights = makeInsights(makeDays(counts, "2025-01-05"), [
    repo("alpha", { activity: makeDays([3, 3, 3], "2025-01-12"), languages: [{ name: "Python", size: 300 }, { name: "Shell", size: 100 }], allTimeCommits: 120 }),
    repo("beta", { activity: [{ date: "2025-01-25", count: 4 }, { date: "2024-12-01", count: 50 }], languages: [{ name: "Python", size: 100 }] }),
    repo("idle", { activity: [], languages: [{ name: "TypeScript", size: 500 }] })
  ]);
  const stats = computeStats(insights);

  test("totals, streaks, weekday totals and busiest week", () => {
    expect(stats.total).toBe(24);
    expect(stats.activeDays).toBe(11);
    expect(stats.activeRate).toBeCloseTo(11 / 21, 10);
    expect(stats.maxDay).toEqual({ date: "2025-01-25", count: 4 });
    expect(stats.longestStreak).toEqual({ length: 4, start: "2025-01-12", end: "2025-01-15" });
    expect(stats.currentStreak).toBe(2);
    expect(stats.weekdayTotals).toEqual([3, 4, 5, 4, 0, 4, 4]);
    expect(stats.weekdayActiveRate[4]).toBe(0);
    expect(stats.weekdayActiveRate[1]).toBeCloseTo(2 / 3, 10);
    expect(stats.busiestWeek).toEqual({ start: "2025-01-12", total: 12 });
    expect(stats.monthly).toEqual([{ month: "2025-01", total: 24 }]);
    expect(stats.medianPerActiveDay).toBe(2);
  });

  test("repos are ranked within range and languages aggregate bytes", () => {
    expect(stats.topRepos.map((r) => [r.name, r.total, r.activeDays])).toEqual([
      ["alpha", 9, 3],
      ["beta", 4, 1]
    ]);
    expect(stats.topRepos.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
    // The all-time count passes through untouched and stays absent when the data has none.
    expect(stats.topRepos[0].allTimeCommits).toBe(120);
    expect("allTimeCommits" in stats.topRepos[1]).toBe(false);
    expect(stats.languages.map((l) => [l.name, l.bytes])).toEqual([
      ["TypeScript", 500],
      ["Python", 400],
      ["Shell", 100]
    ]);
  });

  test("concentration and dispersion behave as burstiness measures", () => {
    expect(gini(new Array(50).fill(3))).toBe(0);
    expect(gini([...new Array(99).fill(0), 10])).toBeCloseTo(0.99, 10);
    const rand = mulberry32(3);
    const poisson = makeDays(Array.from({ length: 2000 }, () => samplePoisson(rand, 4)));
    const calm = computeStats(makeInsights(poisson));
    expect(calm.dispersionIndex).toBeGreaterThan(0.85);
    expect(calm.dispersionIndex).toBeLessThan(1.15);
    const bursty = computeStats(makeInsights(makeDays(burstySeries(366, 4))));
    expect(bursty.dispersionIndex).toBeGreaterThan(3);
    expect(bursty.giniConcentration).toBeGreaterThan(calm.giniConcentration);
    const empty = computeStats(makeInsights(makeDays(new Array(10).fill(0))));
    expect(empty.maxDay).toBeNull();
    expect(empty.longestStreak).toBeNull();
    expect(empty.busiestWeek).toBeNull();
    expectAllFinite(empty);
  });
});

test.describe("launch / PELT", () => {
  function piecewisePoisson(segments: [number, number][], seed: number): number[] {
    const rand = mulberry32(seed);
    return segments.flatMap(([rate, len]) => Array.from({ length: len }, () => samplePoisson(rand, rate)));
  }

  test("recovers known change points in piecewise-Poisson data", () => {
    const counts = piecewisePoisson([[0.5, 80], [6, 60], [1, 70], [10, 40], [2, 60]], 21);
    const starts = pelt(counts);
    expect(starts[0]).toBe(0);
    expect(starts).toHaveLength(5);
    [80, 140, 210, 250].forEach((truth, i) => expect(Math.abs(starts[i + 1] - truth)).toBeLessThanOrEqual(3));
  });

  test("returns only [0] for homogeneous data and handles zero-sum segments", () => {
    for (const seed of [1, 2, 3]) expect(pelt(piecewisePoisson([[3, 300]], seed))).toEqual([0]);
    expect(pelt(new Array(200).fill(0))).toEqual([0]);
    expect(poissonSegmentCost(0, 10)).toBe(0);
    const starts = pelt([...new Array(50).fill(0), ...piecewisePoisson([[5, 50]], 9)]);
    expect(starts).toHaveLength(2);
    expect(Math.abs(starts[1] - 50)).toBeLessThanOrEqual(1);
  });

  test("pruned PELT matches the exhaustive optimal partition", () => {
    const counts = piecewisePoisson([[1, 30], [7, 25], [0.3, 35], [4, 30]], 33);
    for (const [penalty, minSize] of [[8, 3], [20, 7], [60, 5]]) {
      const n = counts.length;
      const prefix = [0];
      counts.forEach((c) => prefix.push(prefix[prefix.length - 1] + c));
      const F = new Array(n + 1).fill(Infinity);
      const prev = new Array(n + 1).fill(0);
      F[0] = -penalty;
      for (let t = minSize; t <= n; t++) {
        for (let s = 0; s <= t - minSize; s++) {
          if (s !== 0 && s < minSize) continue;
          const v = F[s] + poissonSegmentCost(prefix[t] - prefix[s], t - s) + penalty;
          if (v < F[t]) {
            F[t] = v;
            prev[t] = s;
          }
        }
      }
      const brute: number[] = [];
      for (let t = n; t > 0; t = prev[t]) brute.push(prev[t]);
      expect(pelt(counts, { penalty, minSize })).toEqual(brute.reverse());
    }
  });

  test("launch trajectory ends at total altitude and stages tile the range", () => {
    const counts = piecewisePoisson([[0.3, 120], [5, 60], [0.5, 100], [3, 86]], 8);
    const days = makeDays(counts);
    const repos = [
      repo("rocket", { activity: days.slice(120, 180).filter((d) => d.count > 0) }),
      repo("probe", { activity: days.slice(280).filter((d) => d.count > 0) })
    ];
    const launch = buildLaunch(makeInsights(days, repos));
    const total = counts.reduce((s, c) => s + c, 0);
    expect(launch.trajectory[launch.trajectory.length - 1].altitude).toBe(total);
    expect(launch.trajectory[0].velocity).toBe(counts[0]);
    expect(launch.trajectory[10].velocity).toBeCloseTo(counts.slice(4, 11).reduce((s, c) => s + c, 0) / 7, 10);
    expect(launch.stages.reduce((s, st) => s + st.days, 0)).toBe(366);
    expect(launch.stages.reduce((s, st) => s + st.total, 0)).toBe(total);
    expect(launch.stages[0].from).toBe(days[0].date);
    expect(launch.stages[launch.stages.length - 1].to).toBe(days[365].date);
    expect(launch.changePoints).toEqual(launch.stages.slice(1).map((s) => s.from));
    expect(launch.stages.length).toBeGreaterThanOrEqual(3);
    const burst = launch.stages.find((s) => s.from <= days[150].date && s.to >= days[150].date)!;
    expect(burst.dominantRepo).toBe("rocket");
    expect(burst.dominantShare).toBe(1);
    expect(burst.label).toBe(`Stage ${burst.index + 1} · rocket`);
    expect(launch.maxVelocity).not.toBeNull();
    expectAllFinite(launch);
  });
});

test.describe("repo lab (k-means + PCA)", () => {
  test("k-means separates three well-separated groups and silhouette picks k = 3", () => {
    const lab = buildRepoLab(syntheticRepos(), { seed: 1, now: new Date("2025-12-31T00:00:00Z") }) as RepoLab;
    expect("insufficient" in lab).toBe(false);
    expect(lab.k).toBe(3);
    expect(lab.silhouette).toBeGreaterThan(0.5);
    expect(lab.silhouetteByK.map((s) => s.k)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(Math.max(...lab.silhouetteByK.map((s) => s.score))).toBe(lab.silhouette);
    for (const prefix of ["ml-", "web-", "old-"]) {
      const clustersForGroup = new Set(lab.points.filter((p) => p.name.startsWith(prefix)).map((p) => p.cluster));
      expect(clustersForGroup.size).toBe(1);
    }
    expect(lab.clusters.map((c) => c.size)).toEqual([6, 6, 6]);
    expect(new Set(lab.clusters.map((c) => c.label)).size).toBe(3);
    const ml = lab.clusters.find((c) => c.members.includes("ml-0"))!;
    expect(ml.label).toMatch(/Python-heavy|Large|Commit-heavy|Sustained|Starred/);
    expect(lab.points.find((p) => p.name === "ml-0")!.features["python-like"]).toBe(1);
  });

  test("PCA explained variance is a descending fraction and loadings are unit vectors", () => {
    const lab = buildRepoLab(syntheticRepos(), { seed: 2 }) as RepoLab;
    const [pc1, pc2] = lab.explainedVariance;
    expect(pc1).toBeGreaterThanOrEqual(pc2);
    expect(pc2).toBeGreaterThanOrEqual(0);
    expect(pc1).toBeLessThanOrEqual(1);
    expect(pc1 + pc2).toBeLessThanOrEqual(1 + 1e-9);
    expect(lab.loadings.reduce((s, l) => s + l.pc1 ** 2, 0)).toBeCloseTo(1, 8);
    expect(lab.loadings.reduce((s, l) => s + l.pc1 * l.pc2, 0)).toBeCloseTo(0, 8);
    const pca = principalComponents([[1, 2], [2, 4.1], [3, 5.9], [4, 8.2]].map((r) => r.map((v, j) => (v - [2.5, 5.05][j]) / [1.118, 2.2][j])));
    expect(pca.ratios[0]).toBeGreaterThan(0.99);
    const { values, vectors } = jacobiEigen([[4, 1, 0], [1, 3, 1], [0, 1, 2]]);
    expect(values[0]).toBeGreaterThanOrEqual(values[1]);
    const m = [[4, 1, 0], [1, 3, 1], [0, 1, 2]];
    vectors.forEach((v, k) => m.forEach((row, i) => expect(row.reduce((s, x, j) => s + x * v[j], 0)).toBeCloseTo(values[k] * v[i], 9)));
  });

  test("Lloyd iteration history is replayable and inertia never increases", () => {
    const lab = buildRepoLab(syntheticRepos(), { seed: 3 }) as RepoLab;
    expect(lab.iterations.length).toBeGreaterThanOrEqual(lab.k + 1);
    lab.iterations.forEach((frame, i) => {
      expect(frame.iteration).toBe(i);
      expect(frame.assignments).toHaveLength(lab.points.length);
      expect(frame.centroids).toHaveLength(lab.k);
      if (i > 0) expect(frame.changed).toBe(frame.assignments.filter((c, p) => c !== lab.iterations[i - 1].assignments[p]).length);
    });
    expect(lab.iterations[0].changed).toBe(0);
    for (let i = 1; i < lab.iterations.length; i++) expect(lab.iterations[i].inertia).toBeLessThanOrEqual(lab.iterations[i - 1].inertia + 1e-9);
    expect(lab.iterations[lab.iterations.length - 1].assignments).toEqual(lab.points.map((p) => p.cluster));
    expect(lab.restartInertias).toHaveLength(lab.restarts);
    expect(Math.min(...lab.restartInertias)).toBeCloseTo(lab.inertia, 9);
    expect(JSON.stringify(buildRepoLab(syntheticRepos(), { seed: 3 }))).toBe(JSON.stringify(lab));
    expectAllFinite(lab);
  });

  test("frames replay k-means++ seeding one seed at a time, then Lloyd updates to the result", () => {
    for (const seed of [1, 3, 11]) {
      const lab = buildRepoLab(syntheticRepos(), { seed }) as RepoLab;
      const frames = lab.iterations;
      const seeds = frames.slice(0, lab.k);
      const updates = frames.slice(lab.k);
      expect(seeds.map((f) => [f.phase, f.step])).toEqual(Array.from({ length: lab.k }, (_, i) => ["seed", i + 1]));
      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(updates.map((f) => [f.phase, f.step])).toEqual(updates.map((_, i) => ["update", i + 1]));
      for (const f of seeds) {
        expect(f.centroids.filter((c) => c !== null)).toHaveLength(f.step);
        // Each repository sits with one of the seeds picked so far.
        for (const c of f.assignments) expect(f.centroids[c]).not.toBeNull();
      }
      for (const f of updates) expect(f.centroids.every((c) => c !== null)).toBe(true);
      // Lloyd stops once an update changes nothing, and only then.
      expect(updates.at(-1)!.changed).toBe(0);
      for (const f of updates.slice(0, -1)) expect(f.changed).toBeGreaterThan(0);
      const last = frames.at(-1)!;
      expect(last.assignments).toEqual(lab.points.map((p) => p.cluster));
      expect(last.inertia).toBeCloseTo(lab.inertia, 9);
    }
  });

  test("constant features are dropped and labels still map to the right feature", () => {
    const POSITIVE: Record<string, [string, string]> = {
      "log size (KB)": ["Large", "Small"],
      "log contributions": ["Commit-heavy", "Few commits"],
      "log active days": ["Sustained", "Sporadic"],
      "log age (days)": ["Long-lived", "New"],
      "log stars + forks": ["Starred", "Unstarred"],
      "log days since push": ["Dormant", "Recently pushed"],
      "python-like": ["Python-heavy", "Non-Python"],
      web: ["Web", "Non-web"],
      "other language": ["Other languages", "Python/web"]
    };
    const unstarred = syntheticRepos().map((r) => ({ ...r, stars: 0, forks: 0 }));
    const lab = buildRepoLab(unstarred, { seed: 1, now: new Date("2025-12-31T00:00:00Z") }) as RepoLab;
    expect(lab.droppedFeatures).toEqual(["log stars + forks"]);
    expect(lab.featureNames).toHaveLength(8);
    expect(lab.featureNames).not.toContain("log stars + forks");
    expect(lab.loadings.map((l) => l.feature)).toEqual(lab.featureNames);
    expect(lab.loadings.reduce((s, l) => s + l.pc1 ** 2, 0)).toBeCloseTo(1, 8);
    for (const p of lab.points) expect(Object.keys(p.features)).toEqual(lab.featureNames);
    for (const c of lab.clusters) {
      expect(Object.keys(c.centroid)).toEqual(lab.featureNames);
      const languages = new Set(["python-like", "web", "other language"]);
      const top = Object.entries(c.centroid)
        .filter(([f, z]) => !languages.has(f) || z > 0)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      expect(c.label.startsWith(POSITIVE[top[0]][top[1] >= 0 ? 0 : 1])).toBe(true);
      expect(c.label).not.toMatch(/Starred|Unstarred/);
    }
    expect(lab.k).toBe(3);

    const pythonOnly = syntheticRepos().map((r) => ({ ...r, primaryLanguage: "Python" }));
    const py = buildRepoLab(pythonOnly, { seed: 1 }) as RepoLab;
    expect(py.droppedFeatures).toEqual(["python-like", "web", "other language"]);
    expect(py.featureNames).toEqual(["log size (KB)", "log contributions", "log active days", "log age (days)", "log stars + forks", "log days since push"]);
    expectAllFinite(py);

    const varied = buildRepoLab(syntheticRepos(), { seed: 1 }) as RepoLab;
    expect(varied.droppedFeatures).toEqual([]);
    expect(varied.featureNames).toHaveLength(9);

    const identical = buildRepoLab(Array.from({ length: 5 }, (_, i) => repo(`same-${i}`)));
    expect(identical).toHaveProperty("insufficient");
  });

  test("k search defaults to maxK = 7, capped at n - 1", () => {
    const ks = (lab: ReturnType<typeof buildRepoLab>) => (lab as RepoLab).silhouetteByK.map((s) => s.k);
    expect(ks(buildRepoLab(syntheticRepos()))).toEqual([2, 3, 4, 5, 6, 7]);
    expect(ks(buildRepoLab(syntheticRepos().slice(0, 6)))).toEqual([2, 3, 4, 5]);
    expect(ks(buildRepoLab(syntheticRepos().slice(0, 4)))).toEqual([2, 3]);
    expect(ks(buildRepoLab(syntheticRepos(), { maxK: 3 }))).toEqual([2, 3]);
    expect(ks(buildRepoLab(syntheticRepos().slice(0, 6), { maxK: 20 }))).toEqual([2, 3, 4, 5]);
  });

  test("flags a chosen k at the edge of the search range", () => {
    for (const [repos, opts] of [
      [syntheticRepos(), {}],
      [syntheticRepos(), { maxK: 3 }],
      [syntheticRepos(), { maxK: 2 }],
      [syntheticRepos().slice(0, 9), {}],
      [syntheticRepos().slice(0, 5), {}]
    ] as const) {
      const lab = buildRepoLab([...repos], { seed: 1, ...opts }) as RepoLab;
      const largest = lab.silhouetteByK.at(-1)!.k;
      expect(lab.atSearchLimit).toBe(lab.k === largest);
      expect(lab.silhouette).toBe(Math.max(...lab.silhouetteByK.map((s) => s.score)));
    }
    expect((buildRepoLab(syntheticRepos(), { seed: 1 }) as RepoLab).atSearchLimit).toBe(false);
    expect((buildRepoLab(syntheticRepos(), { seed: 1, maxK: 2 }) as RepoLab).atSearchLimit).toBe(true);
  });

  test("needs at least four repositories", () => {
    expect(buildRepoLab(syntheticRepos().slice(0, 3))).toHaveProperty("insufficient");
    const forks = syntheticRepos().slice(0, 6).map((r) => ({ ...r, isFork: true }));
    expect(buildRepoLab(forks)).toHaveProperty("insufficient");
    expect(buildRepoLab(forks, { includeForks: true })).not.toHaveProperty("insufficient");
  });
});

test.describe("training run (hurdle model)", () => {
  const seasonal = makeDays(seasonalSeries(366, 12));
  let cached: TrainingResult | null = null;
  const seasonalResult = () => (cached ??= createTrainer(seasonal, { seed: 4 }).finish());

  test("step() exposes real epochs and the loss decreases", () => {
    const trainer = createTrainer(seasonal, { seed: 4, epochs: 40 });
    expect(trainer.totalEpochs).toBe(40);
    expect(trainer.currentWeights().every((w) => w.activeWeight === 0 && w.countWeight === 0)).toBe(true);
    const first = trainer.step()!;
    expect(first.epoch).toBe(1);
    expect(trainer.currentWeights()).toHaveLength(13);
    expect(trainer.currentWeights().some((w) => w.activeWeight !== 0)).toBe(true);
    for (let i = 1; i < 40; i++) expect(trainer.step()!.epoch).toBe(i + 1);
    expect(trainer.step()).toBeNull();
    expect(trainer.history).toHaveLength(40);
    const result = seasonalResult();
    const last = result.history[result.history.length - 1];
    expect(last.trainLoss).toBeLessThan(result.history[0].trainLoss * 0.8);
    expect(last.validationLoss).toBeLessThan(result.history[0].validationLoss);
  });

  test("beats the mean baseline on a strongly weekday-seasonal series", () => {
    const result = seasonalResult();
    const meanBaseline = result.baselines.find((b) => b.id === "mean")!;
    expect(result.baselines.map((b) => b.id)).toEqual(["mean", "seasonal-naive", "moving-average-7", "weekday-mean"]);
    expect(result.model.mae).toBeLessThan(meanBaseline.mae);
    expect(result.model.auc!).toBeGreaterThan(0.85);
    expect(result.bestBaseline.mae).toBe(Math.min(...result.baselines.map((b) => b.mae)));
    expect(result.skillVsBest).toBeCloseTo(1 - result.model.mae / result.bestBaseline.mae, 10);
    expect(result.beatsBaselines).toBe(result.baselines.every((b) => result.model.mae < b.mae));
    const weekdayWeights = result.weights.filter((w) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(w.feature));
    expect(Math.min(...weekdayWeights.map((w) => w.activeWeight))).toBeGreaterThan(0);
    expect(result.split.trainFrom).toBe(seasonal[28].date);
    expect(result.split.validTo).toBe(seasonal[365].date);
    expect(result.calibration.reduce((s, b) => s + b.n, 0)).toBe(result.split.validDays);
    expect(result.backtest.reduce((s, w) => s + w.days, 0)).toBe(result.split.validDays);
    expectAllFinite({ ...result, model: { ...result.model, auc: result.model.auc ?? 0 } });
  });

  test("is deterministic for the same seed", () => {
    const days = makeDays(burstySeries(200, 6));
    const a = createTrainer(days, { seed: 9 }).finish();
    const b = createTrainer(days, { seed: 9 }).finish();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = createTrainer(days, { seed: 10 }).finish();
    expect(c.history).toEqual(a.history);
    expect(JSON.stringify(c.forecast)).not.toBe(JSON.stringify(a.forecast));
  });

  test("forecast has 28 simulated days with coherent intervals", () => {
    const result = seasonalResult();
    expect(result.forecast).toHaveLength(28);
    result.forecast.forEach((f, i) => {
      expect(f.date).toBe(addDays(seasonal[365].date, i + 1));
      expect(f.low).toBeLessThanOrEqual(f.expected);
      expect(f.expected).toBeLessThanOrEqual(f.high);
      expect(f.pActive).toBeGreaterThanOrEqual(0);
      expect(f.pActive).toBeLessThanOrEqual(1);
    });
    const weekday = result.forecast.filter((f) => ![0, 6].includes(weekdayOf(f.date)));
    const weekend = result.forecast.filter((f) => [0, 6].includes(weekdayOf(f.date)));
    expect(Math.min(...weekday.map((f) => f.pActive))).toBeGreaterThan(Math.max(...weekend.map((f) => f.pActive)));
    expect(result.forecastWeeks).toHaveLength(4);
    for (const w of result.forecastWeeks) expect(w.low <= w.expected && w.expected <= w.high).toBe(true);
  });

  test("insufficient-data guard triggers on tiny or inactive data", () => {
    expect(assessTrainingData(makeDays(new Array(30).fill(1)))).toMatchObject({ ok: false });
    expect(assessTrainingData(makeDays(new Array(200).fill(0)))).toMatchObject({ ok: false });
    const lateQuiet = makeDays([...burstySeries(250, 2), ...new Array(70).fill(0)]);
    const verdict = assessTrainingData(lateQuiet);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/validation/);
    expect(() => createTrainer(makeDays(new Array(30).fill(1)))).toThrow(/at least 84 days/);
    expect(assessTrainingData(seasonal)).toEqual({ ok: true });
  });
});

test.describe("market", () => {
  test("indicators: SMA/EMA of a constant are constant, MACD is 0, RSI stays in [0, 100]", () => {
    const flat = new Array(40).fill(7);
    expect(sma(flat, 4).filter((v) => v !== null).every((v) => v === 7)).toBe(true);
    expect(sma(flat, 4).slice(0, 3)).toEqual([null, null, null]);
    expect(ema(flat, 8).filter((v) => v !== null).every((v) => Math.abs((v as number) - 7) < 1e-12)).toBe(true);
    expect(macd(flat).macd.filter((v) => v !== null).every((v) => Math.abs(v as number) < 1e-12)).toBe(true);
    expect(rsi(flat).filter((v) => v !== null).every((v) => v === 50)).toBe(true);
    expect(rsi(Array.from({ length: 30 }, (_, i) => i)).at(-1)).toBe(100);
    const rand = mulberry32(8);
    const walk: number[] = [100];
    for (let i = 1; i < 300; i++) walk.push(walk[i - 1] + (rand() - 0.5) * 10);
    for (const v of rsi(walk, 14)) if (v !== null) expect(v >= 0 && v <= 100).toBe(true);
    const m = macd(walk);
    // Nothing is plotted during warm-up: slow EMA (26) + signal EMA (9) share one day, so the first value is at 26 + 9 − 2.
    for (const series of [m.macd, m.signal, m.histogram]) {
      expect(series).toHaveLength(walk.length);
      expect(series.findIndex((v) => v !== null)).toBe(33);
      expect(series.slice(33).every((v) => v !== null && Number.isFinite(v))).toBe(true);
    }
    const r = rsi(walk, 14);
    expect(r.findIndex((v) => v !== null)).toBe(14);
    expect(r.slice(14).every((v) => v !== null)).toBe(true);
    expect(rsi(walk.slice(0, 14), 14).every((v) => v === null)).toBe(true);
  });

  test("buildMarket leaves RSI and MACD null during warm-up and keeps them daily-aligned", () => {
    const market = buildMarket(makeDays(burstySeries(366, 14)));
    if ("insufficient" in market) throw new Error(market.insufficient);
    const { rsi14, macd: m } = market.indicators;
    expect(rsi14).toHaveLength(market.daily.length);
    expect(rsi14.findIndex((v) => v !== null)).toBe(14);
    for (const series of [m.macd, m.signal, m.histogram]) {
      expect(series).toHaveLength(market.daily.length);
      expect(series.findIndex((v) => v !== null)).toBe(33);
    }
  });

  test("candles, price index and summary are consistent", () => {
    const days = makeDays(burstySeries(366, 14));
    const market = buildMarket(days);
    if ("insufficient" in market) throw new Error(market.insufficient);
    expect(market.candles.reduce((s, c) => s + c.volume, 0)).toBe(days.reduce((s, d) => s + d.count, 0));
    expect(market.candles.reduce((s, c) => s + c.days, 0)).toBe(366);
    for (const c of market.candles) {
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(weekdayOf(c.start)).toBe(0);
    }
    expect(market.candles[0].partial).toBe(true);
    for (const key of ["sma4", "ema8"] as const) expect(market.indicators[key]).toHaveLength(market.candles.length);
    expect(market.indicators.rsi14).toHaveLength(366);
    const prices = market.daily.map((d) => d.price);
    expect(Math.min(...prices)).toBeGreaterThan(0);
    const [lo, hi] = [market.daily.reduce((a, b) => (b.ewma < a.ewma ? b : a)), market.daily.reduce((a, b) => (b.ewma > a.ewma ? b : a))];
    expect(lo.price).toBeLessThan(hi.price);
    expect(market.summary.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(market.summary.maxDrawdownPct).toBeLessThanOrEqual(100);
    expect(market.trendBacktest.n).toBeGreaterThan(30);
    expect(market.trendBacktest.edge).toBeCloseTo(market.trendBacktest.accuracy - market.trendBacktest.baselineAccuracy, 12);
    expectAllFinite({ ...market, indicators: null });
  });

  test("momentum permutation test: small p for persistent weeks, not for iid noise", () => {
    const rand = mulberry32(17);
    const regimes: number[] = [];
    for (let block = 0; block < 9; block++) {
      const busy = block % 2 === 0;
      for (let d = 0; d < 42; d++) regimes.push(samplePoisson(rand, busy ? 4 : 0.3));
    }
    const persistent = buildMarket(makeDays(regimes, "2025-01-05"));
    if ("insufficient" in persistent) throw new Error(persistent.insufficient);
    expect(persistent.momentum.statistic).toBeGreaterThan(0.4);
    expect(persistent.momentum.pValue).toBeLessThan(0.01);
    expect(persistent.momentum.significant).toBe(true);
    expect(persistent.momentum.hitRate).toBeGreaterThan(persistent.momentum.baseRate);
    expect(persistent.momentum.n).toBe(54);

    let significant = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = mulberry32(seed);
      const weekly = Array.from({ length: 52 }, () => samplePoisson(r, 10));
      const result = momentumTest(weekly, 1000, seed);
      expect(result.pValue).toBeGreaterThan(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
      if (result.pValue < 0.05) significant++;
    }
    expect(significant).toBeLessThanOrEqual(1);
    const iid = buildMarket(makeDays(Array.from({ length: 364 }, () => samplePoisson(rand, 2)), "2025-01-05"));
    if ("insufficient" in iid) throw new Error(iid.insufficient);
    expect(iid.momentum.pValue).toBeGreaterThan(0.05);
  });

  test("needs at least 8 complete weeks", () => {
    expect(buildMarket(makeDays(new Array(50).fill(1)))).toHaveProperty("insufficient");
    expect(buildMarket(makeDays(new Array(70).fill(1), "2025-01-05"))).not.toHaveProperty("insufficient");
  });
});

const sumOf = (values: number[]) => values.reduce((s, v) => s + v, 0);
const activity = (entries: [string, number][]) => entries.map(([date, count]) => ({ date, count }));

test.describe("insights: momentum", () => {
  test("empty, single-day, and all-zero ranges", () => {
    const empty = buildMomentum([]);
    expect(empty).toMatchObject({ weeks: [], periodDays: 0, recent: null, prior: null, change: null, trend: "insufficient", peak: null });

    const single = buildMomentum(makeDays([5], "2025-01-01"));
    expect(single.weeks).toEqual([{ start: "2024-12-29", days: 1, total: 5, rolling: null }]);
    expect(single.trend).toBe("insufficient");
    expect(single.peak?.total).toBe(5);

    const zero = buildMomentum(makeDays(new Array(60).fill(0)));
    expect(zero.trend).toBe("quiet");
    expect(zero.peak).toBeNull();
    expect(zero.change).toBeNull();
    expect(zero.weeks.slice(3).every((w) => w.rolling === 0)).toBe(true);
  });

  test("weeks start on Sunday across a year boundary and partial weeks scale to a 7-day rate", () => {
    const days = makeDays(new Array(40).fill(1), "2025-12-17"); // a Wednesday; runs into January 2026
    const m = buildMomentum(days);
    expect(m.weeks.every((w) => weekdayOf(w.start) === 0)).toBe(true);
    expect(m.weeks[0]).toMatchObject({ start: "2025-12-14", days: 4, total: 4 });
    expect(m.weeks.map((w) => w.start)).toContain("2025-12-28");
    expect(sumOf(m.weeks.map((w) => w.days))).toBe(40);
    expect(sumOf(m.weeks.map((w) => w.total))).toBe(40);
    expect(m.weeks.slice(0, 3).every((w) => w.rolling === null)).toBe(true);
    // A constant one per day is 7 per week, partial weeks included.
    for (const w of m.weeks.slice(3)) expect(w.rolling).toBeCloseTo(7, 10);
    expect(m.peak?.start).toBe(m.weeks.find((w) => w.days === 7)!.start); // earliest full week on ties
  });

  test("compares the last 4 weeks with the 4 before: rising, cooling, steady, and small changes", () => {
    const trend = (prior: number[], recent: number[]) => buildMomentum(makeDays([...prior, ...recent])).trend;
    const flat = (n: number, value: number) => new Array(n).fill(value);
    expect(trend(flat(28, 1), flat(28, 2))).toBe("rising");
    expect(trend(flat(28, 2), flat(28, 1))).toBe("cooling");
    expect(trend(flat(28, 1), [...flat(26, 1), 2, 2])).toBe("steady"); // +7%
    expect(trend([1, ...flat(27, 0)], [1, 1, ...flat(26, 0)])).toBe("steady"); // +100% but only 1 apart
    expect(trend(flat(28, 0), [3, ...flat(27, 0)])).toBe("rising"); // from nothing
    expect(trend(flat(28, 0), [1, ...flat(27, 0)])).toBe("steady");

    const m = buildMomentum(makeDays([...flat(30, 9), ...flat(28, 1), ...flat(28, 2)], "2025-11-20"));
    expect(m.periodDays).toBe(28);
    expect(m.recent).toEqual({ from: "2026-01-17", to: "2026-02-13", total: 56 });
    expect(m.prior).toEqual({ from: "2025-12-20", to: "2026-01-16", total: 28 });
    expect(m.change).toBeCloseTo(1, 10);
  });

  test("short ranges compare halves, and under two weeks there is nothing to compare", () => {
    expect(buildMomentum(makeDays(new Array(20).fill(1))).periodDays).toBe(10);
    expect(buildMomentum(makeDays(new Array(13).fill(1))).trend).toBe("insufficient");
  });
});

test.describe("insights: weekly rhythm", () => {
  test("empty and all-zero ranges have no strongest day", () => {
    const empty = buildRhythm([]);
    expect(empty).toMatchObject({ total: 0, strongest: null, mostConsistent: null, weekendShare: 0 });
    expect(empty.days.map((d) => d.occurrences)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    const zero = buildRhythm(makeDays(new Array(14).fill(0)));
    expect(zero.strongest).toBeNull();
    expect(zero.days.every((d) => d.occurrences === 2 && d.activeRate === 0)).toBe(true);
  });

  test("a single day is the strongest and most consistent", () => {
    const r = buildRhythm(makeDays([5], "2025-01-01")); // Wednesday
    expect(r.strongest).toBe(3);
    expect(r.mostConsistent).toBe(3);
    expect(r.days[3]).toEqual({ weekday: 3, total: 5, activeDays: 1, occurrences: 1, activeRate: 1, share: 1 });
  });

  test("ties on total go to the higher active rate; shares and weekend share add up", () => {
    // Two weeks from Sunday 2025-01-05: Monday has 4 once; Tuesday 2 twice; Saturday 1 once.
    const counts = new Array(14).fill(0);
    counts[1] = 4;
    counts[2] = 2;
    counts[9] = 2;
    counts[6] = 1;
    const r = buildRhythm(makeDays(counts, "2025-01-05"));
    expect(r.days[1].total).toBe(r.days[2].total);
    expect(r.strongest).toBe(2);
    expect(r.mostConsistent).toBe(2);
    expect(r.days[1].activeRate).toBe(0.5);
    expect(sumOf(r.days.map((d) => d.share))).toBeCloseTo(1, 10);
    expect(r.weekendShare).toBeCloseTo(1 / 9, 10);
  });

  test("weekdays stay right across a year boundary", () => {
    const r = buildRhythm(makeDays([0, 3, 0], "2025-12-30")); // Tue, Wed, Thu (2026-01-01)
    expect(r.strongest).toBe(3);
    expect(r.days.filter((d) => d.occurrences).map((d) => d.weekday)).toEqual([2, 3, 4]);
  });
});

test.describe("insights: sprints", () => {
  test("empty, all-zero, and single-day ranges have no sprints unless one active day is enough", () => {
    expect(detectSprints([], [])).toMatchObject({ sprints: [], found: 0, coverage: 0, maxGap: 1, minActiveDays: 3 });
    expect(detectSprints(makeDays(new Array(30).fill(0)), []).sprints).toEqual([]);
    expect(detectSprints(makeDays([4]), []).sprints).toEqual([]);
    const one = detectSprints(makeDays([4], "2026-02-01"), [], { minActiveDays: 1 });
    expect(one.sprints).toHaveLength(1);
    expect(one.sprints[0]).toMatchObject({ start: "2026-02-01", end: "2026-02-01", length: 1, activeDays: 1, total: 4, share: 1, daily: [4] });
  });

  test("bridges at most maxGap quiet days, starts and ends on active days, and ranks by total", () => {
    const days = makeDays([0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0]);
    const report = detectSprints(days, []);
    expect(report.sprints.map((s) => [s.start, s.end, s.activeDays, s.total])).toEqual([
      // Equal totals and active days: the more recent first.
      ["2025-01-08", "2025-01-10", 3, 3],
      ["2025-01-02", "2025-01-05", 3, 3]
    ]);
    expect(report.coverage).toBe(1);
    expect(report.sprints[1].daily).toEqual([1, 1, 0, 1]);
    expect(detectSprints(days, [], { maxGap: 0 }).sprints.map((s) => s.start)).toEqual(["2025-01-08"]);
    const wide = detectSprints(days, [], { maxGap: 2 });
    expect(wide.sprints).toHaveLength(1);
    expect(wide.sprints[0]).toMatchObject({ start: "2025-01-02", end: "2025-01-10", length: 9, activeDays: 6, total: 6 });

    const ranked = detectSprints(makeDays([1, 1, 1, 0, 0, 0, 5, 5, 5, 0, 0, 0, 2, 2, 2, 2]), []);
    expect(ranked.sprints.map((s) => s.total)).toEqual([15, 8, 3]);
    expect(ranked.sprints[0].peak).toEqual({ date: "2025-01-07", count: 5 }); // earliest on ties
  });

  test("limit keeps the largest, while found and coverage count every sprint", () => {
    const counts = Array.from({ length: 40 }, (_, i) => (i % 8 < 3 ? 1 + Math.floor(i / 8) : 0));
    const report = detectSprints(makeDays(counts), [], { limit: 2 });
    expect(report.found).toBe(5);
    expect(report.sprints.map((s) => s.total)).toEqual([15, 12]);
    expect(report.coverage).toBe(1);
    expect(detectSprints(makeDays(counts), [], { limit: 0 }).sprints).toEqual([]);
  });

  test("names only repositories with activity inside the sprint, most active first, across a year boundary", () => {
    const days = makeDays([0, 3, 4, 2, 5, 0, 0, 0], "2025-12-29");
    const repos = [
      repo("zeta", { activity: activity([["2025-12-31", 2], ["2026-01-01", 1]]) }),
      repo("alpha", { activity: activity([["2025-12-30", 3]]) }),
      repo("outside", { activity: activity([["2025-12-29", 9], ["2026-01-04", 9]]) }),
      repo("quiet", { activity: activity([["2025-12-31", 0]]) })
    ];
    const [sprint] = detectSprints(days, repos).sprints;
    expect(sprint).toMatchObject({ start: "2025-12-30", end: "2026-01-02", length: 4, total: 14, unattributed: 8 });
    expect(sprint.repos.map((r) => [r.name, r.count])).toEqual([["alpha", 3], ["zeta", 3]]);
    expect(sprint.repos[0].url).toBe("https://github.com/synthetic/alpha");
  });

  test("unattributed never goes negative when repository activity exceeds the calendar", () => {
    const [sprint] = detectSprints(makeDays([1, 1, 1]), [repo("big", { activity: makeDays([5, 5, 5]) })]).sprints;
    expect(sprint.unattributed).toBe(0);
  });
});

test.describe("insights: languages over time", () => {
  test("no days or no repository activity gives an empty, honest timeline", () => {
    expect(buildLanguageTimeline({ days: [], repos: [] })).toEqual({ months: [], series: [], monthTotals: [], attributed: 0, total: 0, basis: "none", shift: null });
    const quiet = buildLanguageTimeline({ days: makeDays([0, 2, 0]), repos: [repo("idle")] });
    expect(quiet).toMatchObject({ months: ["2025-01"], series: [], attributed: 0, total: 2, basis: "none" });
  });

  test("splits by language bytes, or by primary language when there are no sizes", () => {
    expect(languageShares(repo("a", { languages: [{ name: "TypeScript", size: 300 }, { name: "CSS", size: 100 }, { name: "Shell", size: 0 }] }))).toEqual({
      shares: [["TypeScript", 0.75], ["CSS", 0.25]],
      basis: "bytes"
    });
    expect(languageShares(repo("b", { primaryLanguage: "Go", languages: [{ name: "Go", size: 0 }] }))).toEqual({ shares: [["Go", 1]], basis: "primary" });
    expect(languageShares(repo("c", { primaryLanguage: null, languages: [] })).shares).toEqual([[UNKNOWN_LANGUAGE, 1]]);

    const days = makeDays(new Array(10).fill(1), "2025-03-01");
    const bytes = buildLanguageTimeline({ days, repos: [repo("web", { languages: [{ name: "TypeScript", size: 300 }, { name: "CSS", size: 100 }], activity: activity([["2025-03-02", 4]]) })] });
    expect(bytes.basis).toBe("bytes");
    expect(bytes.series.map((s) => [s.name, s.values])).toEqual([["TypeScript", [3]], ["CSS", [1]]]);
    expect(bytes.attributed).toBe(4);
    expect(bytes.total).toBe(10);

    const python = repo("py", { primaryLanguage: "Python", languages: [{ name: "Python", size: 0 }], activity: activity([["2025-03-02", 2]]) });
    expect(buildLanguageTimeline({ days, repos: [python] }).basis).toBe("primary");
    const typescript = repo("web", { languages: [{ name: "TypeScript", size: 10 }], activity: activity([["2025-03-03", 1]]) });
    expect(buildLanguageTimeline({ days, repos: [python, typescript] }).basis).toBe("mixed");
  });

  test("months follow the range across a year boundary and ignore activity outside it", () => {
    const days = makeDays(new Array(40).fill(1), "2025-12-15");
    const t = buildLanguageTimeline({
      days,
      repos: [repo("r", { activity: activity([["2025-12-01", 50], ["2025-12-20", 2], ["2026-01-05", 3], ["2026-02-01", 50]]) })]
    });
    expect(t.months).toEqual(["2025-12", "2026-01"]);
    expect(t.series).toEqual([{ name: "Python", values: [2, 3], total: 5, share: 1 }]);
    expect(t.monthTotals).toEqual([2, 3]);
    expect(t.attributed).toBe(5);
  });

  test("keeps the top 5 and folds the rest into Other, but never folds a single language", () => {
    const days = makeDays(new Array(5).fill(1));
    const repos = (n: number) => Array.from({ length: n }, (_, i) => repo(`r${i}`, { primaryLanguage: `L${i}`, activity: activity([["2025-01-02", 10 - i]]) }));
    const seven = buildLanguageTimeline({ days, repos: repos(7) });
    expect(seven.series.map((s) => s.name)).toEqual(["L0", "L1", "L2", "L3", "L4", OTHER_LANGUAGES]);
    expect(seven.series.at(-1)!.total).toBe(5 + 4);
    expect(sumOf(seven.series.map((s) => s.share))).toBeCloseTo(1, 10);
    const six = buildLanguageTimeline({ days, repos: repos(6) });
    expect(six.series.map((s) => s.name)).toEqual(["L0", "L1", "L2", "L3", "L4", "L5"]);
  });

  test("reports the language whose share moved most between the earlier and later months", () => {
    const days = makeDays(new Array(150).fill(1), "2025-01-01"); // Jan–May: the middle month (March) is left out
    const shifting = buildLanguageTimeline({
      days,
      repos: [
        repo("py", { primaryLanguage: "Python", activity: activity([["2025-01-10", 9], ["2025-02-10", 9], ["2025-03-10", 50], ["2025-04-10", 1], ["2025-05-10", 1]]) }),
        repo("ts", { primaryLanguage: "TypeScript", activity: activity([["2025-01-10", 1], ["2025-02-10", 1], ["2025-04-10", 9], ["2025-05-10", 9]]) })
      ]
    });
    expect(shifting.shift?.name).toBe("Python");
    expect(shifting.shift?.from).toBeCloseTo(0.9, 10);
    expect(shifting.shift?.to).toBeCloseTo(0.1, 10);
    const steady = buildLanguageTimeline({ days, repos: [repo("py", { activity: makeDays(new Array(150).fill(1), "2025-01-01") })] });
    expect(steady.shift).toBeNull();
    expect(buildLanguageTimeline({ days: makeDays([1]), repos: [repo("one", { activity: makeDays([1]) })] }).shift).toBeNull();
  });
});

test.describe("insights: contribution mix", () => {
  const totals = (fields: Partial<GitHubInsights["totals"]>): GitHubInsights["totals"] => ({ contributions: 0, commits: 0, pullRequests: 0, reviews: 0, issues: 0, repositories: 0, restricted: 0, ...fields });

  test("all-zero totals have no dominant kind and no Other", () => {
    const mix = buildContributionMix({ source: "graphql", totals: totals({}) });
    expect(mix).toMatchObject({ total: 0, typed: 0, other: 0, dominant: null });
    expect(mix.items.map((i) => [i.kind, i.share])).toEqual([["commits", 0], ["pullRequests", 0], ["issues", 0], ["reviews", 0]]);
  });

  test("commits, pull requests, issues, and reviews, with Other for untyped contributions", () => {
    const mix = buildContributionMix({ source: "graphql", totals: totals({ contributions: 478, commits: 368, pullRequests: 8, issues: 7, repositories: 12, restricted: 83 }) });
    expect(mix.items.map((i) => [i.kind, i.count])).toEqual([["commits", 368], ["pullRequests", 8], ["issues", 7], ["reviews", 0], ["other", 95]]);
    expect(mix).toMatchObject({ total: 478, typed: 383, other: 95, dominant: "commits" });
    expect(sumOf(mix.items.map((i) => i.share))).toBeCloseTo(1, 10);
  });

  test("inconsistent totals never make Other negative; ties go to the earlier kind", () => {
    const mix = buildContributionMix({ source: "graphql", totals: totals({ contributions: 3, commits: 4, pullRequests: 4, reviews: -2 }) });
    expect(mix).toMatchObject({ total: 8, typed: 8, other: 0, dominant: "commits" });
    expect(mix.items.map((i) => i.kind)).not.toContain("other");
    expect(mix.items.find((i) => i.kind === "reviews")!.count).toBe(0);
  });

  test("rest-events keeps its source so the app can relabel pushes and other public events", () => {
    const mix = buildContributionMix({ source: "rest-events", totals: totals({ contributions: 50, commits: 30, pullRequests: 5, issues: 1 }) });
    expect(mix.source).toBe("rest-events");
    expect(mix.other).toBe(14);
    expect(mix.dominant).toBe("commits");
  });
});

test("a 90-day rest-events window is handled by every module", () => {
  const days = makeDays(burstySeries(90, 31), "2026-08-13");
  const insights = { ...makeInsights(days, syntheticRepos()), source: "rest-events" as const };
  expectAllFinite(computeStats(insights));
  expectAllFinite(buildCalendar(days));
  expectAllFinite(buildLaunch(insights));
  expectAllFinite(buildMomentum(days));
  expectAllFinite(buildRhythm(days));
  expectAllFinite(detectSprints(days, insights.repos));
  expectAllFinite(buildLanguageTimeline(insights));
  expectAllFinite(buildContributionMix(insights));
  expect(buildMomentum(days).periodDays).toBe(28);
  expect(buildLanguageTimeline(insights).months).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
  const market = buildMarket(days);
  expect(market).not.toHaveProperty("insufficient");
  expectAllFinite({ ...market, indicators: null });
  const verdict = assessTrainingData(days);
  if (verdict.ok) {
    const result = createTrainer(days).finish();
    expect(result.split.validDays).toBe(13);
    expectAllFinite({ ...result, model: { ...result.model, auc: result.model.auc ?? 0 } });
  } else {
    expect(() => createTrainer(days)).toThrow(verdict.reason);
  }
});

test("full pipeline on a 366-day series runs well under the time budget", () => {
  const days = makeDays(burstySeries(366, 99), "2025-11-09");
  const insights = makeInsights(days, syntheticRepos());
  const started = performance.now();
  computeStats(insights);
  buildCalendar(days);
  const trainingStarted = performance.now();
  createTrainer(days).finish();
  const trainingMs = performance.now() - trainingStarted;
  buildMarket(days);
  buildLaunch(insights);
  buildRepoLab(insights.repos);
  const elapsed = performance.now() - started;
  expect(trainingMs).toBeLessThan(1000);
  expect(elapsed).toBeLessThan(2000);
});

test("real snapshot: every module runs and yields finite numbers", () => {
  test.skip(!existsSync(SNAPSHOT_URL), "src/content/generated/github-insights.json is not present");
  const insights = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8")) as GitHubInsights;
  expectAllFinite(computeStats(insights));
  expectAllFinite(buildCalendar(insights.days));
  expectAllFinite(buildMomentum(insights.days));
  expectAllFinite(buildRhythm(insights.days));
  expectAllFinite(buildContributionMix(insights));
  const timeline = buildLanguageTimeline(insights);
  expectAllFinite(timeline);
  expect(timeline.attributed).toBeLessThanOrEqual(insights.repos.reduce((s, r) => s + r.activity.reduce((t, a) => t + a.count, 0), 0));
  const sprints = detectSprints(insights.days, insights.repos);
  expectAllFinite(sprints);
  // Sprints only ever name repositories from the (all-public) snapshot.
  const names = new Set(insights.repos.map((r) => r.name));
  expect(sprints.sprints.flatMap((s) => s.repos.map((r) => r.name)).every((name) => names.has(name))).toBe(true);
  const launch = buildLaunch(insights);
  expect(launch.trajectory.at(-1)?.altitude ?? 0).toBe(insights.days.reduce((s, d) => s + d.count, 0));
  expectAllFinite(launch);
  const market = buildMarket(insights.days);
  if (!("insufficient" in market)) expectAllFinite({ ...market, indicators: null });
  const lab = buildRepoLab(insights.repos);
  if (!("insufficient" in lab)) {
    expectAllFinite(lab);
    const pool = insights.repos.filter((r) => !r.isFork);
    const starsForks = new Set(pool.map((r) => Math.log1p(Math.max(0, (r.stars || 0) + (r.forks || 0)))));
    expect(lab.droppedFeatures.includes("log stars + forks")).toBe(starsForks.size === 1);
    expect(lab.featureNames.length + lab.droppedFeatures.length).toBe(9);
    expect(lab.silhouetteByK.map((s) => s.k)).toEqual(Array.from({ length: Math.min(7, pool.length - 1) - 1 }, (_, i) => i + 2));
    expect(lab.iterations.slice(0, lab.k).every((f) => f.phase === "seed")).toBe(true);
    expect(lab.iterations.at(-1)!.assignments).toEqual(lab.points.map((p) => p.cluster));
  }
  if (assessTrainingData(insights.days).ok) {
    const result = createTrainer(insights.days).finish();
    expectAllFinite({ ...result, model: { ...result.model, auc: result.model.auc ?? 0 } });
    expect(result.forecast).toHaveLength(28);
  }
});
