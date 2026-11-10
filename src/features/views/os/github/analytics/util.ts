/** Shared date (UTC YYYY-MM-DD) and numeric helpers for the analytics modules. */

const DAY_MS = 86_400_000;
export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function toUtcMs(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

export function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** Sunday that starts the week containing `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

/** Sample variance (n − 1); 0 for fewer than two values. */
export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return acc / (values.length - 1);
}

/** Linear-interpolated quantile (type 7, as in NumPy's default). */
export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return quantileSorted(sorted, q);
}

export function quantileSorted(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Numerically stable logistic function. */
export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Division that returns `fallback` instead of NaN/Infinity. */
export function safeDiv(a: number, b: number, fallback = 0): number {
  const out = a / b;
  return Number.isFinite(out) ? out : fallback;
}
