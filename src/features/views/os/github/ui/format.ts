/* Formatting shared by the GitHub app. Dates are UTC calendar days (YYYY-MM-DD), as in the contract. */

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const utc = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);

export const fmtDate = (date: string) => dayFormat.format(utc(date));
export const fmtShortDate = (date: string) => shortFormat.format(utc(date));
export const fmtMonth = (month: string) => monthFormat.format(utc(`${month}-01`));

/** "Nov 9 – Nov 16, 2025" within one year, otherwise "Nov 9, 2025 – Nov 10, 2026". */
export function fmtRange(from: string, to: string) {
  if (from === to) return fmtDate(from);
  return from.slice(0, 4) === to.slice(0, 4) ? `${fmtShortDate(from)} – ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`;
}

export const fmtInt = (value: number) => Math.round(value).toLocaleString("en-US");
export const fmtNum = (value: number, digits = 2) => value.toFixed(digits);
export const fmtPct = (ratio: number, digits = 0) => `${(ratio * 100).toFixed(digits)}%`;
export const fmtSigned = (value: number, digits = 2) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
export const plural = (count: number, one: string, many = `${one}s`) => `${fmtInt(count)} ${count === 1 ? one : many}`;
/** p-values: three decimals, or "< 0.001". */
export const fmtP = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Local wall-clock time for an ISO instant, plus a relative "in N minutes" when it is in the future. */
export function fmtResetAt(iso: string, now = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const minutes = Math.ceil((at.getTime() - now) / 60_000);
  if (minutes <= 0) return { time, relative: "now" };
  return { time, relative: minutes < 90 ? `in ${plural(minutes, "minute")}` : `in about ${plural(Math.round(minutes / 60), "hour")}` };
}

/** Exact one-sided binomial tail P(X >= k) for X ~ Binomial(n, 0.5). */
export function binomialTailHalf(k: number, n: number) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let logC = 0;
  let tail = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    if (i >= k) tail += Math.exp(logC - n * Math.LN2);
  }
  return Math.min(1, tail);
}
