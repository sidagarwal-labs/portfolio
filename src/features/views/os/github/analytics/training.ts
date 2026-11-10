import type { DayCount } from "../contract";
import { mulberry32, randInt } from "./rng";
import { addDays, clamp, mean, safeDiv, sigmoid, weekdayOf } from "./util";

/**
 * "Training run": a hurdle model for daily contributions, trained in the browser with Adam.
 *
 * Part A — logistic regression for P(active day).
 * Part B — linear regression on log(count) for active days only (a log-normal count model).
 *   Why not a zero-truncated Poisson? Active-day counts are heavily overdispersed (a 41-commit day next
 *   to 1-commit days), and a Poisson ties variance to the mean, which would make forecast intervals far
 *   too narrow. Regressing log(count) models multiplicative burstiness; E[count | active] is recovered
 *   with Duan's smearing estimator  exp(μ) · mean(exp(residual))  and simulations resample the empirical
 *   training residuals instead of assuming normality.
 * Expected count = P(active) · E[count | active].
 *
 * Features use only days strictly before the predicted day; standardization uses training rows only.
 * Split is chronological: the first 28 days are warm-up for lag features, then ~80% train / ~20% validation.
 * Loss reported per epoch (no L2 term): mean logistic log-loss over all days + MSE of log(count) over active days.
 */

export const WARMUP_DAYS = 28;
export const MIN_TRAINING_DAYS = 84;
export const MIN_ACTIVE_DAYS = 12;
export const MIN_VALIDATION_ACTIVE_DAYS = 3;
const DAYS_SINCE_CAP = 60;
const LOG_COUNT_MAX = Math.log(1000);

export const FEATURE_NAMES = [
  "bias",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "active yesterday",
  "active same weekday last week",
  "log1p(mean last 7 days)",
  "log1p(mean last 28 days)",
  "log1p(days since last active)",
  "time trend"
] as const;
const D = FEATURE_NAMES.length;

export interface TrainingConfig {
  seed: number;
  epochs: number;
  learningRate: number;
  l2: number;
  /** Epochs per weekly walk-forward refit. */
  backtestEpochs: number;
  simulations: number;
  horizon: number;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = { seed: 7, epochs: 150, learningRate: 0.05, l2: 0.01, backtestEpochs: 150, simulations: 500, horizon: 28 };

export interface EpochMetrics {
  epoch: number;
  /** Training data loss: log-loss (all days) + MSE of log(count) (active days). */
  trainLoss: number;
  /** Same composite loss on the validation window. */
  validationLoss: number;
  /** MAE of expected daily count on validation days. */
  validationMae: number;
}

export type BaselineId = "mean" | "seasonal-naive" | "moving-average-7" | "weekday-mean";

export interface BaselineResult {
  id: BaselineId;
  label: string;
  mae: number;
  rmse: number;
}

export interface TrainingResult {
  config: TrainingConfig;
  featureNames: string[];
  history: EpochMetrics[];
  split: { trainFrom: string; trainTo: string; validFrom: string; validTo: string; trainDays: number; validDays: number; validActiveDays: number };
  /** Validation metrics of the hurdle model (one-step-ahead: lags use observed history). */
  model: { mae: number; rmse: number; logLoss: number; brier: number; auc: number | null };
  baselines: BaselineResult[];
  bestBaseline: BaselineResult;
  beatsBaselines: boolean;
  /** 1 − modelMae / bestBaselineMae (positive = better than the best baseline). */
  skillVsBest: number;
  /** MAE of always predicting 0 — MAE rewards the median, which is 0 for sparse series. */
  referenceZeroMae: number;
  /** Weekly walk-forward: refit (expanding window) at each week start, then sum daily one-step-ahead predictions. */
  backtest: { weekStart: string; days: number; actual: number; predicted: number; baseline: number }[];
  backtestSummary: { weeks: number; modelMae: number; baselineMae: number; baselineId: BaselineId };
  /** Next `horizon` days from a model refit on all days; Monte-Carlo with recursive lag features. */
  forecast: { date: string; pActive: number; expected: number; low: number; high: number }[];
  forecastWeeks: { start: string; end: string; expected: number; low: number; high: number }[];
  /** low/high = 10th/90th nearest-rank simulation percentiles, widened if needed to contain the mean (skewed, zero-heavy days). */
  forecastMethod: { simulations: number; lowQuantile: number; highQuantile: number; countCap: number };
  /** Standardized-unit weights of the evaluated (train-only) model. */
  weights: { feature: string; activeWeight: number; countWeight: number }[];
  /** Reliability bins of P(active) on validation days (5 equal-width bins, empty bins omitted). */
  calibration: { predicted: number; observed: number; n: number }[];
  countModel: { smearing: number; residualSd: number; trainActiveDays: number };
  trainActiveRate: number;
}

export interface Trainer {
  totalEpochs: number;
  history: EpochMetrics[];
  /** One full-batch Adam epoch on both parts; null once all epochs ran. */
  step(): EpochMetrics | null;
  /** Standardized-unit weights right now (for animating how the fit evolves epoch by epoch). */
  currentWeights(): { feature: string; activeWeight: number; countWeight: number }[];
  /** Runs any remaining epochs, then evaluation, backtest and forecast (cached). */
  finish(): TrainingResult;
}

function splitIndices(n: number) {
  const trainEnd = WARMUP_DAYS + Math.floor(0.8 * (n - WARMUP_DAYS));
  return { start: WARMUP_DAYS, trainEnd };
}

export function assessTrainingData(days: DayCount[]): { ok: true } | { ok: false; reason: string } {
  const n = days.length;
  if (n < MIN_TRAINING_DAYS) return { ok: false, reason: `Needs at least ${MIN_TRAINING_DAYS} days of history; this snapshot has ${n}.` };
  const active = days.filter((d) => d.count > 0).length;
  if (active < MIN_ACTIVE_DAYS) return { ok: false, reason: `Needs at least ${MIN_ACTIVE_DAYS} active days; this snapshot has ${active}.` };
  const { start, trainEnd } = splitIndices(n);
  const trainActive = days.slice(start, trainEnd).filter((d) => d.count > 0).length;
  if (trainActive < 5) return { ok: false, reason: `Needs at least 5 active days in the training window; found ${trainActive}.` };
  const validActive = days.slice(trainEnd).filter((d) => d.count > 0).length;
  if (validActive < MIN_VALIDATION_ACTIVE_DAYS) {
    return { ok: false, reason: `Needs at least ${MIN_VALIDATION_ACTIVE_DAYS} active days in the validation window (last ~20%); found ${validActive}.` };
  }
  return { ok: true };
}

/** Raw (unstandardized) features for day t, using only counts[0..t-1]. Requires t >= 28. */
function featureRow(counts: ArrayLike<number>, t: number, weekday0: number, trendScale: number, out: Float64Array): Float64Array {
  out.fill(0);
  out[0] = 1;
  const wd = (weekday0 + t) % 7;
  if (wd >= 1) out[wd] = 1;
  out[7] = counts[t - 1] > 0 ? 1 : 0;
  out[8] = counts[t - 7] > 0 ? 1 : 0;
  let s7 = 0;
  let s28 = 0;
  for (let k = 1; k <= 28; k++) {
    const c = counts[t - k];
    s28 += c;
    if (k <= 7) s7 += c;
  }
  out[9] = Math.log1p(s7 / 7);
  out[10] = Math.log1p(s28 / 28);
  let since = 1;
  while (since < DAYS_SINCE_CAP && t - since >= 0 && !(counts[t - since] > 0)) since++;
  out[11] = Math.log1p(since);
  out[12] = t / trendScale;
  return out;
}

interface Standardizer {
  mean: Float64Array;
  sd: Float64Array;
}

function fitStandardizer(rows: Float64Array[]): Standardizer {
  const mu = new Float64Array(D);
  const sd = new Float64Array(D).fill(1);
  for (let j = 1; j < D; j++) {
    let s = 0;
    for (const r of rows) s += r[j];
    mu[j] = s / Math.max(1, rows.length);
    let v = 0;
    for (const r of rows) v += (r[j] - mu[j]) ** 2;
    sd[j] = Math.sqrt(v / Math.max(1, rows.length));
  }
  return { mean: mu, sd };
}

function applyStandardizer(raw: Float64Array, s: Standardizer, out = new Float64Array(D)): Float64Array {
  out[0] = 1;
  for (let j = 1; j < D; j++) out[j] = s.sd[j] > 1e-9 ? (raw[j] - s.mean[j]) / s.sd[j] : 0;
  return out;
}

function dot(w: Float64Array, x: Float64Array): number {
  let s = 0;
  for (let j = 0; j < D; j++) s += w[j] * x[j];
  return s;
}

interface Series {
  counts: number[];
  dates: string[];
  weekday0: number;
  trendScale: number;
  maxCount: number;
}

function toSeries(days: DayCount[]): Series {
  const counts = days.map((d) => Math.max(0, Number.isFinite(d.count) ? d.count : 0));
  return { counts, dates: days.map((d) => d.date), weekday0: weekdayOf(days[0].date), trendScale: days.length, maxCount: Math.max(1, ...counts) };
}

/** Full-batch Adam fit of both hurdle parts on rows [from, to). */
class HurdleFit {
  readonly std: Standardizer;
  readonly X: Float64Array[];
  readonly y: number[];
  readonly active: number[];
  readonly wA = new Float64Array(D);
  readonly wB = new Float64Array(D);
  private readonly m = [new Float64Array(D), new Float64Array(D)];
  private readonly v = [new Float64Array(D), new Float64Array(D)];
  private t = 0;
  smearing = 1;
  residuals: number[] = [];

  constructor(readonly series: Series, from: number, to: number, private readonly lr: number, private readonly l2: number) {
    const raw: Float64Array[] = [];
    for (let t = from; t < to; t++) raw.push(featureRow(series.counts, t, series.weekday0, series.trendScale, new Float64Array(D)));
    this.std = fitStandardizer(raw);
    this.X = raw.map((r) => applyStandardizer(r, this.std));
    this.y = series.counts.slice(from, to);
    this.active = this.y.flatMap((c, i) => (c > 0 ? [i] : []));
  }

  epoch(): void {
    this.t++;
    const gA = new Float64Array(D);
    const gB = new Float64Array(D);
    const N = this.X.length;
    for (let i = 0; i < N; i++) {
      const x = this.X[i];
      const e = sigmoid(dot(this.wA, x)) - (this.y[i] > 0 ? 1 : 0);
      for (let j = 0; j < D; j++) gA[j] += (e * x[j]) / N;
    }
    const M = this.active.length;
    for (const i of this.active) {
      const x = this.X[i];
      const e = dot(this.wB, x) - Math.log(this.y[i]);
      for (let j = 0; j < D; j++) gB[j] += (2 * e * x[j]) / M;
    }
    for (let j = 1; j < D; j++) {
      gA[j] += this.l2 * this.wA[j];
      gB[j] += this.l2 * this.wB[j];
    }
    this.adam(this.wA, gA, 0);
    if (M > 0) this.adam(this.wB, gB, 1);
    this.updateSmearing();
  }

  private adam(w: Float64Array, g: Float64Array, k: number) {
    const b1 = 0.9;
    const b2 = 0.999;
    const m = this.m[k];
    const v = this.v[k];
    const c1 = 1 - b1 ** this.t;
    const c2 = 1 - b2 ** this.t;
    for (let j = 0; j < D; j++) {
      m[j] = b1 * m[j] + (1 - b1) * g[j];
      v[j] = b2 * v[j] + (1 - b2) * g[j] * g[j];
      w[j] -= (this.lr * (m[j] / c1)) / (Math.sqrt(v[j] / c2) + 1e-8);
    }
  }

  private updateSmearing() {
    this.residuals = this.active.map((i) => Math.log(this.y[i]) - this.mu(this.X[i]));
    this.smearing = this.residuals.length ? clamp(mean(this.residuals.map((r) => Math.exp(r))), 1e-3, 1e3) : 1;
  }

  mu(x: Float64Array): number {
    return clamp(dot(this.wB, x), -5, LOG_COUNT_MAX);
  }

  /** Standardized features for any day t using the given count history. */
  features(counts: ArrayLike<number>, t: number, rawBuf: Float64Array, out: Float64Array): Float64Array {
    return applyStandardizer(featureRow(counts, t, this.series.weekday0, this.series.trendScale, rawBuf), this.std, out);
  }

  predict(x: Float64Array): { p: number; mu: number; expected: number } {
    const p = sigmoid(dot(this.wA, x));
    const mu = this.mu(x);
    return { p, mu, expected: p * Math.max(1, Math.exp(mu) * this.smearing) };
  }

  /** Composite data loss on rows [from, to) of the series (observed lags). */
  loss(from: number, to: number): { loss: number; mae: number } {
    const raw = new Float64Array(D);
    const x = new Float64Array(D);
    let bce = 0;
    let mse = 0;
    let nActive = 0;
    let mae = 0;
    for (let t = from; t < to; t++) {
      const c = this.series.counts[t];
      const pr = this.predict(this.features(this.series.counts, t, raw, x));
      const p = clamp(pr.p, 1e-6, 1 - 1e-6);
      bce -= c > 0 ? Math.log(p) : Math.log(1 - p);
      mae += Math.abs(pr.expected - c);
      if (c > 0) {
        mse += (pr.mu - Math.log(c)) ** 2;
        nActive++;
      }
    }
    const n = Math.max(1, to - from);
    return { loss: bce / n + safeDiv(mse, nActive), mae: mae / n };
  }
}

const BASELINE_LABELS: Record<BaselineId, string> = {
  mean: "Training mean",
  "seasonal-naive": "Same day last week",
  "moving-average-7": "7-day moving average",
  "weekday-mean": "Weekday mean"
};
const BASELINE_IDS = Object.keys(BASELINE_LABELS) as BaselineId[];

/** One-step-ahead baseline prediction for day t; "fit" statistics use days [0, fitEnd). */
function baselinePredict(id: BaselineId, s: Series, t: number, fitEnd: number): number {
  const c = s.counts;
  switch (id) {
    case "mean":
      return mean(c.slice(0, fitEnd));
    case "seasonal-naive":
      return c[t - 7];
    case "moving-average-7":
      return mean(c.slice(t - 7, t));
    case "weekday-mean": {
      let total = 0;
      let k = 0;
      for (let i = t % 7; i < fitEnd; i += 7) {
        total += c[i];
        k++;
      }
      return safeDiv(total, k);
    }
  }
}

function errors(pred: number[], actual: number[]) {
  let ae = 0;
  let se = 0;
  for (let i = 0; i < pred.length; i++) {
    ae += Math.abs(pred[i] - actual[i]);
    se += (pred[i] - actual[i]) ** 2;
  }
  const n = Math.max(1, pred.length);
  return { mae: ae / n, rmse: Math.sqrt(se / n) };
}

/** Mann–Whitney AUC with tie-averaged ranks; null when only one class is present. */
export function rocAuc(scores: number[], labels: boolean[]): number | null {
  const pos = labels.filter(Boolean).length;
  const neg = labels.length - pos;
  if (!pos || !neg) return null;
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s);
  const ranks = new Array<number>(scores.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++;
    for (let k = i; k <= j; k++) ranks[order[k].i] = (i + j) / 2 + 1;
    i = j + 1;
  }
  let rankSum = 0;
  labels.forEach((l, i) => {
    if (l) rankSum += ranks[i];
  });
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function createTrainer(days: DayCount[], config: Partial<TrainingConfig> = {}): Trainer {
  const check = assessTrainingData(days);
  if (!check.ok) throw new Error(check.reason);
  const cfg: TrainingConfig = { ...DEFAULT_TRAINING_CONFIG, ...config };
  if (config.backtestEpochs === undefined) cfg.backtestEpochs = cfg.epochs;
  const series = toSeries(days);
  const n = series.counts.length;
  const { start, trainEnd } = splitIndices(n);
  const fit = new HurdleFit(series, start, trainEnd, cfg.learningRate, cfg.l2);
  const history: EpochMetrics[] = [];
  let cached: TrainingResult | null = null;

  const step = (): EpochMetrics | null => {
    if (history.length >= cfg.epochs) return null;
    fit.epoch();
    const train = fit.loss(start, trainEnd);
    const valid = fit.loss(trainEnd, n);
    const metrics = { epoch: history.length + 1, trainLoss: train.loss, validationLoss: valid.loss, validationMae: valid.mae };
    history.push(metrics);
    return metrics;
  };

  const finish = (): TrainingResult => {
    if (cached) return cached;
    while (step()) {
      /* run remaining epochs */
    }
    cached = evaluate(series, fit, cfg, history, start, trainEnd);
    return cached;
  };

  return { totalEpochs: cfg.epochs, history, step, currentWeights: () => weightTable(fit), finish };
}

function weightTable(fit: HurdleFit) {
  return FEATURE_NAMES.map((feature, j) => ({ feature, activeWeight: fit.wA[j], countWeight: fit.wB[j] }));
}

function evaluate(series: Series, fit: HurdleFit, cfg: TrainingConfig, history: EpochMetrics[], start: number, trainEnd: number): TrainingResult {
  const { counts, dates } = series;
  const n = counts.length;
  const raw = new Float64Array(D);
  const x = new Float64Array(D);

  const actual = counts.slice(trainEnd);
  const probs: number[] = [];
  const expected: number[] = [];
  for (let t = trainEnd; t < n; t++) {
    const pr = fit.predict(fit.features(counts, t, raw, x));
    probs.push(pr.p);
    expected.push(pr.expected);
  }
  const labels = actual.map((c) => c > 0);
  const modelErr = errors(expected, actual);
  let logLoss = 0;
  let brier = 0;
  probs.forEach((p, i) => {
    const q = clamp(p, 1e-6, 1 - 1e-6);
    logLoss -= labels[i] ? Math.log(q) : Math.log(1 - q);
    brier += (p - (labels[i] ? 1 : 0)) ** 2;
  });
  const model = { ...modelErr, logLoss: logLoss / actual.length, brier: brier / actual.length, auc: rocAuc(probs, labels) };

  const baselines: BaselineResult[] = BASELINE_IDS.map((id) => {
    const pred = actual.map((_, i) => baselinePredict(id, series, trainEnd + i, trainEnd));
    return { id, label: BASELINE_LABELS[id], ...errors(pred, actual) };
  });
  const bestBaseline = baselines.reduce((best, b) => (b.mae < best.mae ? b : best));
  const beatsBaselines = baselines.every((b) => model.mae < b.mae);
  const skillVsBest = bestBaseline.mae > 0 ? 1 - model.mae / bestBaseline.mae : model.mae > 0 ? -1 : 0;

  const backtest: TrainingResult["backtest"] = [];
  for (let ws = trainEnd; ws < n; ws += 7) {
    const we = Math.min(n, ws + 7);
    const weekFit = new HurdleFit(series, start, ws, cfg.learningRate, cfg.l2);
    for (let e = 0; e < cfg.backtestEpochs; e++) weekFit.epoch();
    let predicted = 0;
    let baseline = 0;
    let act = 0;
    for (let t = ws; t < we; t++) {
      predicted += weekFit.predict(weekFit.features(counts, t, raw, x)).expected;
      baseline += baselinePredict(bestBaseline.id, series, t, ws);
      act += counts[t];
    }
    backtest.push({ weekStart: dates[ws], days: we - ws, actual: act, predicted, baseline });
  }
  const backtestSummary = {
    weeks: backtest.length,
    modelMae: mean(backtest.map((b) => Math.abs(b.predicted - b.actual))),
    baselineMae: mean(backtest.map((b) => Math.abs(b.baseline - b.actual))),
    baselineId: bestBaseline.id
  };

  const { forecast, forecastWeeks, countCap } = simulateForecast(series, cfg, start);

  const calibration: TrainingResult["calibration"] = [];
  for (let b = 0; b < 5; b++) {
    const idx = probs.flatMap((p, i) => (Math.min(4, Math.floor(p * 5)) === b ? [i] : []));
    if (!idx.length) continue;
    calibration.push({ predicted: mean(idx.map((i) => probs[i])), observed: mean(idx.map((i) => (labels[i] ? 1 : 0))), n: idx.length });
  }

  const residualSd = Math.sqrt(mean(fit.residuals.map((r) => r * r)));
  return {
    config: cfg,
    featureNames: [...FEATURE_NAMES],
    history: [...history],
    split: {
      trainFrom: dates[start],
      trainTo: dates[trainEnd - 1],
      validFrom: dates[trainEnd],
      validTo: dates[n - 1],
      trainDays: trainEnd - start,
      validDays: n - trainEnd,
      validActiveDays: labels.filter(Boolean).length
    },
    model,
    baselines,
    bestBaseline,
    beatsBaselines,
    skillVsBest,
    referenceZeroMae: mean(actual),
    backtest,
    backtestSummary,
    forecast,
    forecastWeeks,
    forecastMethod: { simulations: cfg.simulations, lowQuantile: 0.1, highQuantile: 0.9, countCap },
    weights: weightTable(fit),
    calibration,
    countModel: { smearing: fit.smearing, residualSd, trainActiveDays: fit.active.length },
    trainActiveRate: safeDiv(fit.active.length, fit.y.length)
  };
}

/**
 * Refit on every available day, then simulate `horizon` days forward `simulations` times:
 * active ~ Bernoulli(p), count = round(exp(μ + resampled residual)) clipped to [1, max observed day],
 * feeding each simulated day back into the lag features of the next.
 */
function simulateForecast(series: Series, cfg: TrainingConfig, start: number) {
  const n = series.counts.length;
  const H = Math.max(1, Math.round(cfg.horizon));
  const S = Math.max(20, Math.round(cfg.simulations));
  const finalFit = new HurdleFit(series, start, n, cfg.learningRate, cfg.l2);
  for (let e = 0; e < cfg.epochs; e++) finalFit.epoch();
  const rand = mulberry32(cfg.seed);
  const countCap = series.maxCount;
  const hist = new Float64Array(n + H);
  hist.set(series.counts);
  const sims = Array.from({ length: H }, () => new Float64Array(S));
  const pSum = new Float64Array(H);
  const raw = new Float64Array(D);
  const x = new Float64Array(D);
  const residuals = finalFit.residuals.length ? finalFit.residuals : [0];
  for (let s = 0; s < S; s++) {
    for (let h = 0; h < H; h++) {
      const t = n + h;
      const pr = finalFit.predict(finalFit.features(hist, t, raw, x));
      pSum[h] += pr.p;
      let c = 0;
      if (rand() < pr.p) c = clamp(Math.round(Math.exp(pr.mu + residuals[randInt(rand, residuals.length)])), 1, countCap);
      hist[t] = c;
      sims[h][s] = c;
    }
  }
  const last = series.dates[n - 1];
  // Nearest-rank percentiles keep the bounds on the integer count scale.
  const rank = (sorted: number[], q: number) => sorted[clamp(Math.ceil(q * sorted.length) - 1, 0, sorted.length - 1)];
  const interval = (values: Float64Array) => {
    const sorted = Array.from(values).sort((a, b) => a - b);
    const expected = mean(sorted);
    return { expected, low: Math.min(rank(sorted, 0.1), expected), high: Math.max(rank(sorted, 0.9), expected) };
  };
  const forecast = sims.map((values, h) => ({ date: addDays(last, h + 1), pActive: pSum[h] / S, ...interval(values) }));
  const forecastWeeks: TrainingResult["forecastWeeks"] = [];
  for (let w = 0; w * 7 < H; w++) {
    const from = w * 7;
    const to = Math.min(H, from + 7);
    const totals = new Float64Array(S);
    for (let h = from; h < to; h++) for (let s = 0; s < S; s++) totals[s] += sims[h][s];
    forecastWeeks.push({ start: addDays(last, from + 1), end: addDays(last, to), ...interval(totals) });
  }
  return { forecast, forecastWeeks, countCap };
}
