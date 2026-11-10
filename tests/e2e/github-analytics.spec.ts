import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import type { DayCount, GitHubInsights, GitHubRepoInsight } from "../../src/features/views/os/github/contract";
import {
  addDays,
  assessTrainingData,
  buildCalendar,
  buildLaunch,
  buildMarket,
  buildRepoLab,
  computeStats,
  createTrainer,
  ema,
  gini,
  jacobiEigen,
  macd,
  momentumTest,
  mulberry32,
  pelt,
  poissonSegmentCost,
  principalComponents,
  rsi,
  samplePoisson,
  sma,
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
    repo("alpha", { activity: makeDays([3, 3, 3], "2025-01-12"), languages: [{ name: "Python", size: 300 }, { name: "Shell", size: 100 }] }),
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

test("a 90-day rest-events window is handled by every module", () => {
  const days = makeDays(burstySeries(90, 31), "2026-08-13");
  const insights = { ...makeInsights(days, syntheticRepos()), source: "rest-events" as const };
  expectAllFinite(computeStats(insights));
  expectAllFinite(buildCalendar(days));
  expectAllFinite(buildLaunch(insights));
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
