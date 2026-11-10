import type { DayCount } from "../contract";
import { mulberry32, shuffle } from "./rng";
import { mean, median, safeDiv, weekStartOf } from "./util";

/**
 * "Market": contribution activity treated as a traded series.
 *
 * Price index:  ewma_t = α·count_t + (1 − α)·ewma_{t−1},  α = 2/(span + 1), span = 7, ewma seeded with the
 * mean of the first 7 days;  price_t = 100 · (1 + ewma_t) / (1 + mean daily count).
 * 100 = "trading at the period's average pace"; the +1 keeps the price positive and strictly increasing in
 * smoothed activity. Candles are Sunday-start weeks; volume = contributions that week.
 */

export type IndicatorSeries = (number | null)[];

export interface Candle {
  /** Sunday that starts the week (may precede the first day for a partial first week). */
  start: string;
  end: string;
  days: number;
  partial: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MomentumTest {
  hypothesis: string;
  /** Lag-1 autocorrelation of complete-week contribution totals. */
  statistic: number;
  /** One-sided permutation p-value: P(shuffled r1 ≥ observed r1), with +1 smoothing. */
  pValue: number;
  permutations: number;
  /** Number of complete weeks used. */
  n: number;
  medianWeek: number;
  /** P(next week > median | this week > median). */
  hitRate: number;
  /** Unconditional P(week > median) over the same "next week" positions. */
  baseRate: number;
  hitPairs: number;
  significant: boolean;
}

export interface TrendBacktest {
  rule: string;
  baselineRule: string;
  n: number;
  accuracy: number;
  baselineAccuracy: number;
  /** accuracy − baselineAccuracy. */
  edge: number;
  predictions: { weekStart: string; signal: boolean; majority: boolean; actual: boolean }[];
}

export interface MarketModel {
  formula: string;
  span: number;
  meanDaily: number;
  daily: { date: string; count: number; ewma: number; price: number }[];
  candles: Candle[];
  indicators: {
    /** Weekly closes. */
    sma4: IndicatorSeries;
    ema8: IndicatorSeries;
    /** 8-week Bollinger bands on weekly closes, ±2 population σ. */
    bollinger: { middle: IndicatorSeries; upper: IndicatorSeries; lower: IndicatorSeries };
    /** Daily index, Wilder RSI(14); null for the first 14 days. */
    rsi14: IndicatorSeries;
    /** Daily index, MACD(12, 26, 9); all three series null for the first 33 days (warm-up). */
    macd: { macd: IndicatorSeries; signal: IndicatorSeries; histogram: IndicatorSeries };
  };
  momentum: MomentumTest;
  trendBacktest: TrendBacktest;
  summary: { open: number; close: number; changePct: number; high: number; low: number; maxDrawdownPct: number };
}

export interface MarketOptions {
  span?: number;
  permutations?: number;
  seed?: number;
}

export const MIN_MARKET_WEEKS = 8;

export function sma(values: readonly number[], n: number): IndicatorSeries {
  const out: IndicatorSeries = new Array(values.length).fill(null);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (i >= n) acc -= values[i - n];
    if (i >= n - 1) out[i] = acc / n;
  }
  return out;
}

/** EMA seeded with the SMA of the first n defined values; leading nulls are skipped. */
export function ema(values: readonly (number | null)[], n: number): IndicatorSeries {
  const out: IndicatorSeries = new Array(values.length).fill(null);
  const alpha = 2 / (n + 1);
  let seen = 0;
  let acc = 0;
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    seen++;
    if (seen < n) acc += v;
    else if (seen === n) prev = (acc + v) / n;
    else prev = alpha * v + (1 - alpha) * prev;
    if (seen >= n) out[i] = prev;
  }
  return out;
}

export function bollinger(values: readonly number[], n: number, k = 2): { middle: IndicatorSeries; upper: IndicatorSeries; lower: IndicatorSeries } {
  const middle = sma(values, n);
  const upper: IndicatorSeries = new Array(values.length).fill(null);
  const lower: IndicatorSeries = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    const m = middle[i] as number;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (values[j] - m) ** 2;
    const sd = Math.sqrt(v / n);
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
  }
  return { middle, upper, lower };
}

/** Wilder's RSI; null until there are n price changes (index n), 50 when the window is perfectly flat, 100 when there were no losses. */
export function rsi(values: readonly number[], n = 14): IndicatorSeries {
  const out: IndicatorSeries = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(0, d) / n;
    loss += Math.max(0, -d) / n;
  }
  const value = () => (loss <= 1e-12 ? (gain <= 1e-12 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[n] = value();
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(0, d)) / n;
    loss = (loss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = value();
  }
  return out;
}

/**
 * MACD(fast, slow, signal). All three series stay null until the signal line has full history: the slow EMA
 * needs `slow` values and the signal EMA a further `signal` MACD values, so with all inputs present the first
 * value is at index slow + signal − 2 (33 for 12/26/9). Earlier MACD values are dominated by EMA seeding.
 */
export function macd(values: readonly number[], fast = 12, slow = 26, signalN = 9): { macd: IndicatorSeries; signal: IndicatorSeries; histogram: IndicatorSeries } {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const raw: IndicatorSeries = values.map((_, i) => (f[i] !== null && s[i] !== null ? (f[i] as number) - (s[i] as number) : null));
  const signal = ema(raw, signalN);
  const line: IndicatorSeries = raw.map((v, i) => (signal[i] === null ? null : v));
  const histogram: IndicatorSeries = line.map((v, i) => (v !== null && signal[i] !== null ? v - (signal[i] as number) : null));
  return { macd: line, signal, histogram };
}

/** Lag-1 autocorrelation (standard ACF estimator); 0 for constant series. */
export function lag1Autocorrelation(values: readonly number[]): number {
  const m = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    den += (values[i] - m) ** 2;
    if (i + 1 < values.length) num += (values[i] - m) * (values[i + 1] - m);
  }
  return den > 1e-12 ? num / den : 0;
}

/** H0: weekly totals are exchangeable (no persistence). One-sided permutation test on lag-1 autocorrelation. */
export function momentumTest(weekly: readonly number[], permutations = 2000, seed = 11): Omit<MomentumTest, "hypothesis"> {
  const statistic = lag1Autocorrelation(weekly);
  const rand = mulberry32(seed);
  const work = [...weekly];
  let extreme = 0;
  for (let p = 0; p < permutations; p++) {
    if (lag1Autocorrelation(shuffle(work, rand)) >= statistic - 1e-12) extreme++;
  }
  const medianWeek = median(weekly);
  let hits = 0;
  let pairs = 0;
  let aboveNext = 0;
  for (let i = 0; i + 1 < weekly.length; i++) {
    const nextAbove = weekly[i + 1] > medianWeek;
    if (nextAbove) aboveNext++;
    if (weekly[i] > medianWeek) {
      pairs++;
      if (nextAbove) hits++;
    }
  }
  const pValue = (1 + extreme) / (1 + permutations);
  return {
    statistic,
    pValue,
    permutations,
    n: weekly.length,
    medianWeek,
    hitRate: safeDiv(hits, pairs),
    baseRate: safeDiv(aboveNext, weekly.length - 1),
    hitPairs: pairs,
    significant: pValue < 0.05
  };
}

/**
 * Walk-forward test of "EMA(3) > EMA(8) of weekly totals ⇒ next week above the running median"
 * against "predict whichever label has been more common so far". No look-ahead: the median and the
 * majority only use weeks up to the decision week.
 */
export function trendRuleBacktest(weekly: readonly number[], weekStarts: readonly string[]): TrendBacktest {
  const fast = ema(weekly, 3);
  const slow = ema(weekly, 8);
  const labels = weekly.map((x, i) => (i === 0 ? false : x > median(weekly.slice(0, i))));
  const predictions: TrendBacktest["predictions"] = [];
  for (let t = 7; t + 1 < weekly.length; t++) {
    if (fast[t] === null || slow[t] === null) continue;
    const past = labels.slice(1, t + 1);
    const ups = past.filter(Boolean).length;
    predictions.push({ weekStart: weekStarts[t + 1], signal: (fast[t] as number) > (slow[t] as number), majority: ups > past.length - ups, actual: labels[t + 1] });
  }
  const accuracy = safeDiv(predictions.filter((p) => p.signal === p.actual).length, predictions.length);
  const baselineAccuracy = safeDiv(predictions.filter((p) => p.majority === p.actual).length, predictions.length);
  return {
    rule: "EMA(3) > EMA(8) of weekly totals ⇒ next week above its running median",
    baselineRule: "Always predict the majority label seen so far",
    n: predictions.length,
    accuracy,
    baselineAccuracy,
    edge: accuracy - baselineAccuracy,
    predictions
  };
}

export function buildMarket(days: DayCount[], opts: MarketOptions = {}): MarketModel | { insufficient: string } {
  const span = opts.span ?? 7;
  const counts = days.map((d) => Math.max(0, d.count || 0));
  const candles = weeklyCandles(days, []);
  const complete = candles.filter((c) => !c.partial);
  if (complete.length < MIN_MARKET_WEEKS) {
    return { insufficient: `Needs at least ${MIN_MARKET_WEEKS} complete weeks of activity; this snapshot has ${complete.length}.` };
  }

  const meanDaily = mean(counts);
  const alpha = 2 / (span + 1);
  let level = mean(counts.slice(0, span));
  const daily = days.map((d, i) => {
    level = alpha * counts[i] + (1 - alpha) * level;
    return { date: d.date, count: counts[i], ewma: level, price: (100 * (1 + level)) / (1 + meanDaily) };
  });
  const prices = daily.map((d) => d.price);
  const priced = weeklyCandles(days, prices);
  const closes = priced.map((c) => c.close);

  let peak = prices[0];
  let maxDrawdown = 0;
  for (const p of prices) {
    peak = Math.max(peak, p);
    maxDrawdown = Math.max(maxDrawdown, safeDiv(peak - p, peak));
  }

  const weekly = complete.map((c) => c.volume);
  return {
    formula: `price = 100 × (1 + EWMA${span}(daily contributions)) / (1 + mean daily contributions)`,
    span,
    meanDaily,
    daily,
    candles: priced,
    indicators: {
      sma4: sma(closes, 4),
      ema8: ema(closes, 8),
      bollinger: bollinger(closes, 8, 2),
      rsi14: rsi(prices, 14),
      macd: macd(prices, 12, 26, 9)
    },
    momentum: {
      hypothesis: "Weekly contribution totals persist: a busy week tends to be followed by another busy week (lag-1 autocorrelation > 0).",
      ...momentumTest(weekly, opts.permutations ?? 2000, opts.seed ?? 11)
    },
    trendBacktest: trendRuleBacktest(weekly, complete.map((c) => c.start)),
    summary: {
      open: prices[0],
      close: prices[prices.length - 1],
      changePct: (safeDiv(prices[prices.length - 1], prices[0], 1) - 1) * 100,
      high: Math.max(...prices),
      low: Math.min(...prices),
      maxDrawdownPct: maxDrawdown * 100
    }
  };
}

function weeklyCandles(days: DayCount[], prices: number[]): Candle[] {
  const candles: Candle[] = [];
  days.forEach((d, i) => {
    const start = weekStartOf(d.date);
    const price = prices[i] ?? 0;
    const last = candles[candles.length - 1];
    if (!last || last.start !== start) {
      candles.push({ start, end: d.date, days: 1, partial: true, open: price, high: price, low: price, close: price, volume: Math.max(0, d.count) });
      return;
    }
    last.end = d.date;
    last.days++;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
    last.volume += Math.max(0, d.count);
  });
  for (const c of candles) c.partial = c.days < 7;
  return candles;
}
