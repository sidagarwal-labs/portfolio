import type { GitHubRepoInsight } from "../contract";
import { mulberry32, randInt, type Rng } from "./rng";
import { safeDiv } from "./util";

/**
 * "Data science lab": k-means on repositories, visualized with PCA.
 *
 * Candidate features per repo:
 *   log1p(disk KB), log1p(contributions in range), log1p(active days), log1p(age in days),
 *   log1p(stars + forks), log1p(days since last push), and one-hot language family
 *   (python-like incl. Jupyter Notebook / web incl. TypeScript, JavaScript, HTML, CSS / other).
 * Features that are constant across the pool (after the log / one-hot transform) carry no information and
 * are dropped (listed in `droppedFeatures`); the rest are z-scored.
 * Logs tame the heavy right tails of size and activity. Forks are excluded by default (their size
 * reflects upstream work). k-means++ init, Lloyd iterations to convergence (≤ 50), 10 restarts per k,
 * k ∈ 2..min(maxK, n − 1) chosen by mean silhouette. PCA = Jacobi eigen-decomposition of the
 * covariance of the standardized features (used for display only; clustering runs in full space).
 * The best run for the chosen k is recorded frame by frame: one frame per k-means++ seed, then one per Lloyd update.
 */

export const REPO_FEATURES = [
  "log size (KB)",
  "log contributions",
  "log active days",
  "log age (days)",
  "log stars + forks",
  "log days since push",
  "python-like",
  "web",
  "other language"
] as const;

const PHRASES: [string, string][] = [
  ["Large", "Small"],
  ["Commit-heavy", "Few commits"],
  ["Sustained", "Sporadic"],
  ["Long-lived", "New"],
  ["Starred", "Unstarred"],
  ["Dormant", "Recently pushed"],
  ["Python-heavy", "Non-Python"],
  ["Web", "Non-web"],
  ["Other languages", "Python/web"]
];

const PYTHON_LIKE = new Set(["Python", "Jupyter Notebook", "Cython"]);
const WEB = new Set(["TypeScript", "JavaScript", "HTML", "CSS", "SCSS", "Sass", "Less", "Vue", "Svelte", "Astro", "MDX"]);
const DAY_MS = 86_400_000;
const RESTARTS = 10;
const MAX_ITERATIONS = 50;
const DEFAULT_MAX_K = 7;
const CONSTANT_EPS = 1e-9;

export interface RepoLabOptions {
  seed?: number;
  maxK?: number;
  /** Reference time for age / staleness. Defaults to the latest pushedAt / activity date (deterministic). */
  now?: Date;
  includeForks?: boolean;
}

export interface KMeansFrame {
  /** Frame index (0-based). */
  iteration: number;
  /** "seed": a k-means++ seed was just picked; "update": one Lloyd step (centroids to cluster means, then reassign). */
  phase: "seed" | "update";
  /** 1-based: seeds picked so far for "seed" frames, Lloyd update number for "update" frames. */
  step: number;
  /** Nearest-centroid assignment (final cluster ids) using the centroids picked so far. */
  assignments: number[];
  /** Centroids projected onto (PC1, PC2), indexed by final cluster id; null for seeds not picked yet. */
  centroids: ([number, number] | null)[];
  inertia: number;
  /** Repositories whose cluster differs from the previous frame (0 for the first frame). */
  changed: number;
}

export interface RepoLab {
  /** Features actually used (constant ones are dropped). */
  featureNames: string[];
  /** Candidate features left out because they have the same value for every repository. */
  droppedFeatures: string[];
  points: {
    name: string;
    nameWithOwner: string;
    url: string;
    x: number;
    y: number;
    cluster: number;
    silhouette: number;
    /** Un-standardized feature values (after log1p / one-hot). */
    features: Record<string, number>;
    raw: { diskUsageKb: number; contributions: number; activeDays: number; ageDays: number; starsForks: number; daysSincePush: number; language: string | null };
  }[];
  k: number;
  silhouette: number;
  silhouetteByK: { k: number; score: number }[];
  /** True when the chosen k is the largest k tried, i.e. the score was still rising at the edge of the search. */
  atSearchLimit: boolean;
  /** Variance ratio of PC1 and PC2. */
  explainedVariance: [number, number];
  /** Unit eigenvector components. */
  loadings: { feature: string; pc1: number; pc2: number }[];
  iterations: KMeansFrame[];
  inertia: number;
  restarts: number;
  /** Final inertia of every k-means++ restart for the chosen k (the best one is animated). */
  restartInertias: number[];
  clusters: { id: number; size: number; label: string; members: string[]; centroid: Record<string, number> }[];
  referenceDate: string;
}

export function languageFamily(language: string | null): "python" | "web" | "other" {
  if (language && PYTHON_LIKE.has(language)) return "python";
  if (language && WEB.has(language)) return "web";
  return "other";
}

export function buildRepoLab(repos: GitHubRepoInsight[], opts: RepoLabOptions = {}): RepoLab | { insufficient: string } {
  const pool = opts.includeForks ? repos : repos.filter((r) => !r.isFork);
  if (pool.length < 4) return { insufficient: `Clustering needs at least 4 repositories; found ${pool.length}.` };

  const refMs = opts.now?.getTime() ?? referenceTime(pool);
  const raws = pool.map((r) => {
    const active = r.activity.filter((a) => a.count > 0);
    const created = Date.parse(r.createdAt);
    const pushed = Date.parse(r.pushedAt ?? r.createdAt);
    return {
      diskUsageKb: Math.max(0, r.diskUsageKb || 0),
      contributions: active.reduce((s, a) => s + a.count, 0),
      activeDays: active.length,
      ageDays: Number.isFinite(created) ? Math.max(0, (refMs - created) / DAY_MS) : 0,
      starsForks: Math.max(0, (r.stars || 0) + (r.forks || 0)),
      daysSincePush: Number.isFinite(pushed) ? Math.max(0, (refMs - pushed) / DAY_MS) : 0,
      language: r.primaryLanguage
    };
  });
  const X = raws.map((r) => {
    const family = languageFamily(r.language);
    return [
      Math.log1p(r.diskUsageKb),
      Math.log1p(r.contributions),
      Math.log1p(r.activeDays),
      Math.log1p(r.ageDays),
      Math.log1p(r.starsForks),
      Math.log1p(r.daysSincePush),
      family === "python" ? 1 : 0,
      family === "web" ? 1 : 0,
      family === "other" ? 1 : 0
    ];
  });
  const used = REPO_FEATURES.map((_, j) => j).filter((j) => !isConstant(X.map((row) => row[j])));
  const droppedFeatures = REPO_FEATURES.filter((_, j) => !used.includes(j));
  if (!used.length) return { insufficient: "Every repository has the same features, so there is nothing to cluster." };
  const featureNames = used.map((j) => REPO_FEATURES[j]);
  const Xu = X.map((row) => used.map((j) => row[j]));
  const Z = zScore(Xu);
  const pca = principalComponents(Z);

  const seed = opts.seed ?? 42;
  const maxK = Math.max(2, Math.min(opts.maxK ?? DEFAULT_MAX_K, pool.length - 1));
  let best: { k: number; run: KMeansRun; score: number; restartInertias: number[] } | null = null;
  const silhouetteByK: RepoLab["silhouetteByK"] = [];
  for (let k = 2; k <= maxK; k++) {
    const rand = mulberry32(seed + k * 7919);
    let run: KMeansRun | null = null;
    const restartInertias: number[] = [];
    for (let r = 0; r < RESTARTS; r++) {
      const candidate = kMeans(Z, k, rand);
      restartInertias.push(candidate.inertia);
      if (!run || candidate.inertia < run.inertia - 1e-12) run = candidate;
    }
    const score = meanSilhouette(Z, run!.assignments, k);
    silhouetteByK.push({ k, score });
    if (!best || score > best.score + 1e-12) best = { k, run: run!, score, restartInertias };
  }
  const { k, run } = best!;

  // Relabel clusters by size (desc), then by PC1 position, so ids are stable and readable.
  const order = Array.from({ length: k }, (_, c) => c).sort((a, b) => {
    const sa = run.assignments.filter((x) => x === a).length;
    const sb = run.assignments.filter((x) => x === b).length;
    return sb - sa || project(run.centroids[a], pca.vectors[0]) - project(run.centroids[b], pca.vectors[0]);
  });
  const remap = new Array<number>(k);
  order.forEach((old, id) => (remap[old] = id));
  const assignments = run.assignments.map((c) => remap[c]);
  const centroidsZ = order.map((old) => run.centroids[old]);
  const silhouettes = pointSilhouettes(Z, assignments, k);

  const iterations: KMeansFrame[] = run.frames.map((f, i) => {
    const prev = run.frames[i - 1];
    return {
      iteration: i,
      phase: f.phase,
      step: f.step,
      assignments: f.assignments.map((c) => remap[c]),
      centroids: order.map((old) => {
        const c = f.centroids[old];
        return c ? ([project(c, pca.vectors[0]), project(c, pca.vectors[1])] as [number, number]) : null;
      }),
      inertia: f.inertia,
      changed: prev ? f.assignments.filter((c, p) => c !== prev.assignments[p]).length : 0
    };
  });

  const labels: string[] = [];
  const clusters = centroidsZ.map((centroid, id) => {
    const members = pool.filter((_, i) => assignments[i] === id).map((r) => r.name);
    // Language indicators only describe a cluster when over-represented ("Non-Python" says little).
    const ranked = centroid
      .map((z, u) => ({ z, j: used[u] }))
      .filter((r) => r.j < 6 || r.z > 0)
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const phrase = (r: { z: number; j: number }) => PHRASES[r.j][r.z >= 0 ? 0 : 1];
    const parts = ranked.length ? [phrase(ranked[0])] : ["Typical"];
    if (ranked[1] && Math.abs(ranked[1].z) >= 0.5) parts.push(phrase(ranked[1]));
    let label = parts.join(" · ");
    for (let extra = parts.length; labels.includes(label) && extra < ranked.length; extra++) label = `${label} · ${phrase(ranked[extra])}`;
    if (labels.includes(label)) label = `${label} ${id + 1}`;
    labels.push(label);
    return { id, size: members.length, label, members, centroid: Object.fromEntries(featureNames.map((f, u) => [f, centroid[u]])) };
  });

  return {
    featureNames,
    droppedFeatures,
    points: pool.map((r, i) => ({
      name: r.name,
      nameWithOwner: r.nameWithOwner,
      url: r.url,
      x: project(Z[i], pca.vectors[0]),
      y: project(Z[i], pca.vectors[1]),
      cluster: assignments[i],
      silhouette: silhouettes[i],
      features: Object.fromEntries(featureNames.map((f, u) => [f, Xu[i][u]])),
      raw: raws[i]
    })),
    k,
    silhouette: best!.score,
    silhouetteByK,
    atSearchLimit: k === maxK,
    explainedVariance: [pca.ratios[0] ?? 0, pca.ratios[1] ?? 0],
    loadings: featureNames.map((feature, u) => ({ feature, pc1: pca.vectors[0][u], pc2: pca.vectors[1][u] })),
    iterations,
    inertia: run.inertia,
    restarts: RESTARTS,
    restartInertias: best!.restartInertias,
    clusters,
    referenceDate: new Date(refMs).toISOString().slice(0, 10)
  };
}

function referenceTime(repos: GitHubRepoInsight[]): number {
  let latest = -Infinity;
  for (const r of repos) {
    for (const iso of [r.pushedAt, r.createdAt]) {
      const t = iso ? Date.parse(iso) : NaN;
      if (Number.isFinite(t)) latest = Math.max(latest, t);
    }
    const lastActivity = r.activity[r.activity.length - 1];
    if (lastActivity) latest = Math.max(latest, Date.parse(lastActivity.date) + DAY_MS - 1);
  }
  return Number.isFinite(latest) ? latest : 0;
}

function isConstant(values: number[]): boolean {
  const mu = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  return Math.sqrt(values.reduce((s, v) => s + (v - mu) ** 2, 0) / Math.max(1, values.length)) <= CONSTANT_EPS;
}

/** Column z-scores with population SD; constant columns map to 0. */
export function zScore(X: number[][]): number[][] {
  const d = X[0]?.length ?? 0;
  const mu = new Array(d).fill(0);
  const sd = new Array(d).fill(0);
  for (const row of X) row.forEach((v, j) => (mu[j] += v / X.length));
  for (const row of X) row.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / X.length));
  return X.map((row) => row.map((v, j) => (Math.sqrt(sd[j]) > CONSTANT_EPS ? (v - mu[j]) / Math.sqrt(sd[j]) : 0)));
}

function sqDist(a: number[], b: number[]): number {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2;
  return s;
}

function project(v: number[], axis: number[]): number {
  let s = 0;
  for (let j = 0; j < v.length; j++) s += v[j] * (axis[j] ?? 0);
  return s;
}

interface KMeansRun {
  assignments: number[];
  centroids: number[][];
  inertia: number;
  /** Seed frames hold only the centroids picked so far (later slots are undefined). */
  frames: { phase: "seed" | "update"; step: number; assignments: number[]; centroids: (number[] | undefined)[]; inertia: number }[];
}

/**
 * One k-means++ initialization followed by Lloyd iterations. Records one frame per seed (assignment to the
 * nearest seed so far), then one per Lloyd update; the last frame is the result.
 */
export function kMeans(Z: number[][], k: number, rand: Rng): KMeansRun {
  const n = Z.length;
  const centroids: number[][] = [[...Z[randInt(rand, n)]]];
  const frames: KMeansRun["frames"] = [];
  const snapshot = (phase: "seed" | "update", step: number, a: number[], inertia: number) =>
    frames.push({ phase, step, assignments: [...a], centroids: Array.from({ length: k }, (_, c) => (centroids[c] ? [...centroids[c]] : undefined)), inertia });
  while (centroids.length < k) {
    const seeded = assign(centroids);
    snapshot("seed", centroids.length, seeded.a, seeded.inertia);
    const d2 = Z.map((z) => Math.min(...centroids.map((c) => sqDist(z, c))));
    const total = d2.reduce((s, v) => s + v, 0);
    let pick = randInt(rand, n);
    if (total > 1e-12) {
      let r = rand() * total;
      for (let i = 0; i < n; i++) {
        r -= d2[i];
        if (r <= 0) {
          pick = i;
          break;
        }
      }
    }
    centroids.push([...Z[pick]]);
  }

  function assign(cs: number[][]) {
    let inertia = 0;
    const a = Z.map((z) => {
      let bestC = 0;
      let bestD = Infinity;
      cs.forEach((c, j) => {
        const dd = sqDist(z, c);
        if (dd < bestD) {
          bestD = dd;
          bestC = j;
        }
      });
      inertia += bestD;
      return bestC;
    });
    return { a, inertia };
  }

  let { a: assignments, inertia } = assign(centroids);
  snapshot("seed", k, assignments, inertia);
  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    const d = Z[0].length;
    const next = Array.from({ length: k }, () => new Array(d).fill(0));
    const sizes = new Array(k).fill(0);
    Z.forEach((z, i) => {
      sizes[assignments[i]]++;
      z.forEach((v, j) => (next[assignments[i]][j] += v));
    });
    for (let c = 0; c < k; c++) {
      if (sizes[c] > 0) next[c] = next[c].map((v) => v / sizes[c]);
      else {
        // Empty cluster: re-seed at the point farthest from its current centroid.
        let far = 0;
        let farD = -1;
        Z.forEach((z, i) => {
          const dd = sqDist(z, centroids[assignments[i]]);
          if (dd > farD) {
            farD = dd;
            far = i;
          }
        });
        next[c] = [...Z[far]];
      }
    }
    const result = assign(next);
    const changed = result.a.some((c, i) => c !== assignments[i]);
    centroids.splice(0, k, ...next);
    assignments = result.a;
    inertia = result.inertia;
    snapshot("update", iter, assignments, inertia);
    if (!changed) break;
  }
  return { assignments, centroids, inertia, frames };
}

export function pointSilhouettes(Z: number[][], assignments: number[], k: number): number[] {
  const n = Z.length;
  const dist = Z.map((a) => Z.map((b) => Math.sqrt(sqDist(a, b))));
  return Z.map((_, i) => {
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      sums[assignments[j]] += dist[i][j];
      counts[assignments[j]]++;
    }
    const own = assignments[i];
    if (counts[own] === 0) return 0;
    const a = sums[own] / counts[own];
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && counts[c] > 0) b = Math.min(b, sums[c] / counts[c]);
    if (!Number.isFinite(b)) return 0;
    return safeDiv(b - a, Math.max(a, b));
  });
}

export function meanSilhouette(Z: number[][], assignments: number[], k: number): number {
  const s = pointSilhouettes(Z, assignments, k);
  return s.reduce((acc, v) => acc + v, 0) / Math.max(1, s.length);
}

/** Symmetric eigen-decomposition (cyclic Jacobi). Returns eigenpairs sorted by eigenvalue, descending. */
export function jacobiEigen(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  const a = matrix.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const pairs = a.map((row, i) => ({ value: row[i], vector: V.map((r) => r[i]) })).sort((x, y) => y.value - x.value);
  return { values: pairs.map((p) => p.value), vectors: pairs.map((p) => p.vector) };
}

/** PCA of already-standardized data. Signs are fixed so each axis's largest |loading| is positive. */
export function principalComponents(Z: number[][]): { vectors: number[][]; values: number[]; ratios: number[] } {
  const n = Z.length;
  const d = Z[0]?.length ?? 0;
  const cov = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const z of Z) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cov[i][j] += (z[i] * z[j]) / Math.max(1, n);
  const { values, vectors } = jacobiEigen(cov);
  const clean = values.map((v) => Math.max(0, v));
  const total = clean.reduce((s, v) => s + v, 0);
  const oriented = vectors.map((v) => {
    const pivot = v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    return pivot < 0 ? v.map((x) => -x) : v;
  });
  while (oriented.length < 2) oriented.push(new Array(d).fill(0));
  return { vectors: oriented, values: clean, ratios: clean.map((v) => safeDiv(v, total)) };
}
