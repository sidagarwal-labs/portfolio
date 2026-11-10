import type { DayCount } from "../contract";
import { MONTH_LABELS, quantile, weekdayOf } from "./util";

export type CalendarLevel = 0 | 1 | 2 | 3 | 4;

export interface CalendarCell {
  date: string;
  count: number;
  level: CalendarLevel;
  /** Column index; weeks start on Sunday, so the first column may be partial. */
  week: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

export interface CalendarModel {
  weeks: number;
  cells: CalendarCell[];
  /** Label at the column containing the 1st of each month (plus the opening partial month when it has room). */
  months: { label: string; week: number; month: string }[];
  /** Level cutoffs = 25/50/75% quantiles of the NON-ZERO counts: 1 ≤ t1, 2 ≤ t2, 3 ≤ t3, 4 above. */
  thresholds: [number, number, number];
}

/**
 * GitHub-style heatmap layout. Levels use quantiles of active days only, so a handful of
 * huge days cannot wash out everything else; level 0 is reserved for exactly zero.
 */
export function buildCalendar(days: DayCount[]): CalendarModel {
  if (!days.length) return { weeks: 0, cells: [], months: [], thresholds: [0, 0, 0] };
  const nonZero = days.filter((d) => d.count > 0).map((d) => d.count);
  const thresholds: [number, number, number] = [quantile(nonZero, 0.25), quantile(nonZero, 0.5), quantile(nonZero, 0.75)];
  const offset = weekdayOf(days[0].date);

  const cells: CalendarCell[] = days.map((d, i) => {
    const slot = offset + i;
    return { date: d.date, count: d.count, level: levelFor(d.count, thresholds), week: Math.floor(slot / 7), weekday: slot % 7 };
  });

  const months: CalendarModel["months"] = [];
  for (const cell of cells) {
    if (cell.date.endsWith("-01")) months.push(monthLabel(cell.date, cell.week));
  }
  const first = cells[0];
  if (!first.date.endsWith("-01") && (months.length === 0 || months[0].week >= 2)) {
    months.unshift(monthLabel(first.date, 0));
  }

  return { weeks: cells[cells.length - 1].week + 1, cells, months, thresholds };
}

function levelFor(count: number, [t1, t2, t3]: [number, number, number]): CalendarLevel {
  if (count <= 0) return 0;
  if (count <= t1) return 1;
  if (count <= t2) return 2;
  if (count <= t3) return 3;
  return 4;
}

function monthLabel(date: string, week: number) {
  return { label: MONTH_LABELS[Number(date.slice(5, 7)) - 1], week, month: date.slice(0, 7) };
}
