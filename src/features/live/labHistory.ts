import type { Lab, LabRelease } from "./leaderboardData";

/* Pure helpers for the Labs chart: colours, the default selection, each lab's best-so-far line, and the frontier. */

const labColors: Record<string, string> = {
  Anthropic: "#c4572d", OpenAI: "#1f7a4d", "Google DeepMind": "#2f6bc0", Meta: "#6c4fc0", "Moonshot AI": "#b03f86",
  DeepSeek: "#1f8597", xAI: "#2c302e", Alibaba: "#b88310", "Z.ai": "#6b7d1e", Mistral: "#a7353a", Microsoft: "#557089"
};
const spareColors = ["#7d5a3c", "#7b8580", "#4f5b86", "#8a4f7d", "#a8741b", "#2b7a8c"];

/* A fixed colour per well-known lab, and spare colours, in legend order, for the rest. */
export function labColorMap(labs: readonly Lab[]) {
  let spare = 0;
  return new Map(labs.map((lab) => [lab.org, labColors[lab.org] ?? spareColors[spare++ % spareColors.length]]));
}

export const bestScore = (lab: Lab) => Math.max(...lab.models.map((release) => release.eci));

/* The labs shown before anyone touches the legend: the highest best scores. */
export function defaultLabs(labs: readonly Lab[], count = 8) {
  return [...labs].sort((a, b) => bestScore(b) - bestScore(a)).slice(0, count).map((lab) => lab.org);
}

export const releaseTime = (date: string) => Date.parse(`${date}T00:00:00Z`);

/* Indices of the releases that set a new best for their lab: on each date, the top release (the first, on a tie) if it
   beats every earlier one. */
export function recordIndices(models: readonly LabRelease[]) {
  const topOfDay = new Map<string, number>();
  models.forEach((release, index) => {
    const top = topOfDay.get(release.date);
    if (top === undefined || release.eci > models[top].eci) topOfDay.set(release.date, index);
  });
  const records: number[] = [];
  let best = -Infinity;
  for (const index of [...topOfDay.values()].sort((a, b) => models[a].date.localeCompare(models[b].date))) {
    if (models[index].eci > best) {
      records.push(index);
      best = models[index].eci;
    }
  }
  return records;
}

export type FrontierStep = { time: number; eci: number; model: string; org: string };

/* The best score from any lab up to each date, as the releases that raised it. */
export function frontierSteps(labs: readonly Lab[]): FrontierStep[] {
  const releases = labs
    .flatMap((lab) => lab.models.map((release) => ({ time: releaseTime(release.date), eci: release.eci, model: release.model, org: lab.org })))
    .sort((a, b) => a.time - b.time || b.eci - a.eci);
  const steps: FrontierStep[] = [];
  for (const release of releases) if (!steps.length || release.eci > steps[steps.length - 1].eci) steps.push(release);
  return steps;
}

/* Round values covering [min, max] in steps of 5, 10, 20, 25, or 50, at most about `count` of them. */
export function scoreTicks(min: number, max: number, count: number) {
  const step = [5, 10, 20, 25, 50].find((size) => (max - min) / size <= count) ?? 50;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) ticks.push(value);
  return ticks;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Month starts between two UTC times, spaced so there are at most `count`. A tick on January shows the year; other
   ticks show the month, and the first one also shows its year. */
export function timeTicks(start: number, end: number, count: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const spanMonths = (end - start) / (30.44 * 864e5);
  const step = [1, 2, 3, 6, 12, 24].find((size) => spanMonths / size <= count) ?? 24;
  const first = new Date(start);
  let month = first.getUTCFullYear() * 12 + first.getUTCMonth() + (first.getUTCDate() > 1 || first.getUTCHours() > 0 ? 1 : 0);
  month = Math.ceil(month / step) * step;
  const ticks: { time: number; label: string; year: boolean }[] = [];
  for (; ; month += step) {
    const year = Math.floor(month / 12);
    const time = Date.UTC(year, month % 12, 1);
    if (time > end) break;
    const january = month % 12 === 0;
    ticks.push({ time, year: january, label: january ? String(year) : `${monthNames[month % 12]}${ticks.length ? "" : ` ${year}`}` });
  }
  return ticks;
}

export const ciHalfWidth = (release: LabRelease) =>
  release.low !== undefined && release.high !== undefined ? (release.high - release.low) / 2 : undefined;
