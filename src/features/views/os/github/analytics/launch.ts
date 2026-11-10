import type { GitHubInsights } from "../contract";
import { safeDiv } from "./util";

/**
 * "Launch": change-point detection with PELT (Killick, Fearnhead & Eckley 2012).
 *
 * Segment cost = Poisson deviance at the segment MLE rate, dropping terms that do not depend on the
 * segmentation:  C(S, L) = 2·(S − S·ln(S/L)),  with C = 0 when S = 0 (limit of S·ln S).
 * Default penalty is a quasi-Poisson BIC: β = 2·φ̂·ln(n), i.e. two parameters (rate + location) per
 * change, inflated by the dispersion φ̂ so bursty-but-stable periods are not split at every spike.
 * φ̂ is a difference-based estimate (robust to level shifts): mean((y_t − y_{t−1})²) / (2·mean(y)), ≥ 1.
 */

export const DEFAULT_MIN_SEGMENT = 7;

export interface PeltOptions {
  penalty?: number;
  minSize?: number;
}

export function poissonSegmentCost(total: number, length: number): number {
  if (total <= 0 || length <= 0) return 0;
  return 2 * (total - total * Math.log(total / length));
}

export function estimateDispersion(counts: readonly number[]): number {
  if (counts.length < 2) return 1;
  let m = 0;
  for (const c of counts) m += c;
  m /= counts.length;
  if (m <= 0) return 1;
  let sq = 0;
  for (let i = 1; i < counts.length; i++) sq += (counts[i] - counts[i - 1]) ** 2;
  return Math.max(1, sq / (2 * (counts.length - 1)) / m);
}

export function defaultPeltPenalty(counts: readonly number[]): number {
  return 2 * estimateDispersion(counts) * Math.log(Math.max(2, counts.length));
}

/**
 * Exact optimal partition with PELT pruning. Returns segment START indices (always includes 0).
 * Pruning respects the minimum segment length: a candidate s with F(s) + C(s,t) > F(t) is only
 * discarded once t + minSize is reached, because only then is the path through t a valid alternative.
 */
export function pelt(counts: readonly number[], options: PeltOptions = {}): number[] {
  const n = counts.length;
  const minSize = Math.max(1, Math.floor(options.minSize ?? DEFAULT_MIN_SEGMENT));
  if (n < 2 * minSize) return [0];
  const penalty = options.penalty ?? defaultPeltPenalty(counts);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + Math.max(0, counts[i]);
  const cost = (s: number, t: number) => poissonSegmentCost(prefix[t] - prefix[s], t - s);

  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1);
  F[0] = -penalty;
  let candidates: { s: number; expires: number }[] = [{ s: 0, expires: Infinity }];
  for (let t = minSize; t <= n; t++) {
    if (t - minSize >= minSize && Number.isFinite(F[t - minSize])) candidates.push({ s: t - minSize, expires: Infinity });
    let best = Infinity;
    let arg = 0;
    const values: number[] = [];
    for (const c of candidates) {
      const v = F[c.s] + cost(c.s, t) + penalty;
      values.push(v);
      if (v < best) {
        best = v;
        arg = c.s;
      }
    }
    F[t] = best;
    last[t] = arg;
    candidates = candidates.filter((c, i) => {
      if (c.expires <= t) return false;
      if (values[i] - penalty > best && c.expires === Infinity) c.expires = t + minSize;
      return true;
    });
  }

  const starts: number[] = [];
  for (let t = n; t > 0; t = last[t]) starts.push(last[t]);
  return starts.reverse();
}

export interface LaunchStage {
  index: number;
  from: string;
  to: string;
  days: number;
  total: number;
  /** Contributions per day within the stage. */
  rate: number;
  dominantRepo: string | null;
  /** Dominant repo's share of repo-attributed activity in the stage (0 when none). */
  dominantShare: number;
  label: string;
}

export interface LaunchModel {
  trajectory: { date: string; altitude: number; velocity: number; acceleration: number }[];
  stages: LaunchStage[];
  changePoints: string[];
  penalty: number;
  dispersion: number;
  minSize: number;
  /** Peak trailing-7-day velocity ("max-q" analog); null when there is no activity. */
  maxVelocity: { date: string; velocity: number } | null;
}

export function buildLaunch(insights: GitHubInsights, opts: PeltOptions = {}): LaunchModel {
  const days = insights.days;
  const counts = days.map((d) => Math.max(0, d.count || 0));
  const minSize = Math.max(1, Math.floor(opts.minSize ?? DEFAULT_MIN_SEGMENT));
  const penalty = opts.penalty ?? defaultPeltPenalty(counts);

  let altitude = 0;
  let window = 0;
  let prevVelocity = 0;
  const trajectory = days.map((d, i) => {
    altitude += counts[i];
    window += counts[i];
    if (i >= 7) window -= counts[i - 7];
    const velocity = window / Math.min(7, i + 1);
    const acceleration = i === 0 ? 0 : velocity - prevVelocity;
    prevVelocity = velocity;
    return { date: d.date, altitude, velocity, acceleration };
  });

  let maxVelocity: LaunchModel["maxVelocity"] = null;
  for (const p of trajectory) if (p.velocity > 0 && (!maxVelocity || p.velocity > maxVelocity.velocity)) maxVelocity = { date: p.date, velocity: p.velocity };

  const starts = days.length ? pelt(counts, { penalty, minSize }) : [];
  const dateIndex = new Map(days.map((d, i) => [d.date, i]));
  const repoTotals = insights.repos.map(() => new Float64Array(starts.length));
  const stageOf = new Int32Array(days.length);
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : days.length;
    for (let i = s; i < end; i++) stageOf[i] = k;
  });
  insights.repos.forEach((repo, r) => {
    for (const a of repo.activity) {
      const i = dateIndex.get(a.date);
      if (i !== undefined && a.count > 0) repoTotals[r][stageOf[i]] += a.count;
    }
  });

  const stages: LaunchStage[] = starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : days.length;
    let total = 0;
    for (let i = s; i < end; i++) total += counts[i];
    let best = -1;
    let attributed = 0;
    insights.repos.forEach((_, r) => {
      const v = repoTotals[r][k];
      attributed += v;
      if (v > 0 && (best < 0 || v > repoTotals[best][k])) best = r;
    });
    const dominantRepo = best >= 0 ? insights.repos[best].name : null;
    const suffix = dominantRepo ?? (total === 0 ? "quiet" : "unattributed");
    return {
      index: k,
      from: days[s].date,
      to: days[end - 1].date,
      days: end - s,
      total,
      rate: safeDiv(total, end - s),
      dominantRepo,
      dominantShare: best >= 0 ? safeDiv(repoTotals[best][k], attributed) : 0,
      label: `Stage ${k + 1} · ${suffix}`
    };
  });

  return {
    trajectory,
    stages,
    changePoints: stages.slice(1).map((s) => s.from),
    penalty,
    dispersion: estimateDispersion(counts),
    minSize,
    maxVelocity
  };
}
