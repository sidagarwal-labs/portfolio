import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CalendarModel } from "../analytics";
import type { ActivityStats } from "../analytics";
import type { GitHubInsights } from "../contract";
import { fmtDate, fmtInt, fmtMonth, fmtRange, plural } from "./format";

/* Compact, GitHub-style: 8px cells on a 10px grid, drawn at their natural size beside the at-a-glance stats. */
const STEP = 10;
const CELL = 8;
const LEFT = 26;
const TOP = 14;
const WEEKDAY_LABELS: [number, string][] = [[1, "Mon"], [3, "Wed"], [5, "Fri"]];

/** Integer count range for each shade, from the model's quantile thresholds. */
function levelRanges(thresholds: [number, number, number]) {
  const [t1, t2, t3] = thresholds.map(Math.floor);
  const span = (lo: number, hi: number) => (lo > hi ? null : lo === hi ? `${lo}` : `${lo}–${hi}`);
  return [span(1, Math.max(1, t1)), span(Math.max(1, t1) + 1, t2), span(Math.max(t1, t2) + 1, t3), `${Math.max(t1, t2, t3) + 1}+`];
}

export function Heatmap({ insights, calendar, stats, unit }: { insights: GitHubInsights; calendar: CalendarModel; stats: ActivityStats; unit: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  /* Like GitHub, start scrolled to the most recent weeks when the calendar is wider than the window. */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [calendar]);

  const months = useMemo(() => {
    const rows = new Map<string, { month: string; total: number; active: number; best: { date: string; count: number } | null }>();
    for (const cell of calendar.cells) {
      const key = cell.date.slice(0, 7);
      const row = rows.get(key) ?? { month: key, total: 0, active: 0, best: null };
      row.total += cell.count;
      if (cell.count > 0) row.active++;
      if (cell.count > 0 && (!row.best || cell.count > row.best.count)) row.best = { date: cell.date, count: cell.count };
      rows.set(key, row);
    }
    return [...rows.values()];
  }, [calendar]);

  const width = LEFT + calendar.weeks * STEP;
  const height = TOP + 7 * STEP;
  const { from, to } = insights.range;
  const summary = [
    `Contribution calendar, ${fmtRange(from, to)}: ${fmtInt(stats.total)} ${unit} on ${stats.activeDays} of ${stats.days} days.`,
    stats.maxDay ? `Busiest day ${fmtDate(stats.maxDay.date)} with ${fmtInt(stats.maxDay.count)}.` : "",
    "Monthly totals are in the table that follows."
  ].join(" ");
  const cell = hover === null ? null : calendar.cells[hover];
  const ranges = levelRanges(calendar.thresholds);

  return (
    <figure className="gh-heat">
      <div className="gh-heat__scroll" ref={scrollRef}>
        <svg
          className="gh-heat__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={summary}
          onMouseOver={(event) => {
            const index = (event.target as Element).getAttribute("data-i");
            if (index !== null) setHover(Number(index));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {calendar.months.map((month) => (
            <text key={month.month} className="gh-heat__month" x={LEFT + month.week * STEP} y={9}>{month.label}</text>
          ))}
          {WEEKDAY_LABELS.map(([row, label]) => (
            <text key={label} className="gh-heat__weekday" x={LEFT - 6} y={TOP + row * STEP + CELL / 2} dy="0.35em" textAnchor="end">{label}</text>
          ))}
          {calendar.cells.map((c, i) => (
            <rect
              key={c.date}
              className="gh-cell"
              data-i={i}
              data-level={c.level}
              data-date={c.date}
              x={LEFT + c.week * STEP}
              y={TOP + c.weekday * STEP}
              width={CELL}
              height={CELL}
              rx={1.5}
            >
              <title>{`${fmtDate(c.date)}: ${plural(c.count, unit.replace(/s$/, ""), unit)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <figcaption className="gh-heat__foot">
        <span className="gh-heat__readout" aria-hidden="true">
          {cell ? `${fmtDate(cell.date)}: ${plural(cell.count, unit.replace(/s$/, ""), unit)}` : "Point at a day to see its count."}
        </span>
        <span className="gh-heat__legend" aria-hidden="true">
          Less
          {[0, 1, 2, 3, 4].map((level) => (
            <svg key={level} width={CELL} height={CELL} className="gh-legend__cell">
              <rect className="gh-swatch" data-level={level} width={CELL} height={CELL} rx={1.5}>
                <title>{level === 0 ? "0" : ranges[level - 1] ?? "none"}</title>
              </rect>
            </svg>
          ))}
          More
        </span>
        <span className="gh-heat__scale">
          Shades split active days at their quartiles: {ranges.filter(Boolean).join(" · ")} per day.
        </span>
      </figcaption>
      {/* Tables ignore the 1px sr-only width, so a clipping wrapper keeps this one from widening the page. */}
      <div className="sr-only">
        <table>
          <caption>{unit} by month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Total</th>
              <th scope="col">Active days</th>
              <th scope="col">Busiest day</th>
            </tr>
          </thead>
          <tbody>
            {months.map((row) => (
              <tr key={row.month}>
                <th scope="row">{fmtMonth(row.month)}</th>
                <td>{row.total}</td>
                <td>{row.active}</td>
                <td>{row.best ? `${fmtDate(row.best.date)} (${row.best.count})` : "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
