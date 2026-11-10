import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { MONTH_LABELS } from "../analytics";

/* Hand-rolled SVG helpers. Charts render at their real pixel width (measured), so text stays readable on phones. */

export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** True once the element has been on screen while `enabled`. */
export function useSeen(ref: RefObject<Element>, enabled: boolean) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !enabled) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen, enabled]);
  return seen;
}

type ChartProps = {
  height: number;
  label: string;
  className?: string;
  /** "img" hides the marks from assistive tech (the label summarizes them); "group" keeps focusable marks. */
  role?: "img" | "group";
  children: (width: number) => ReactNode;
};

export function Chart({ height, label, className, role = "img", children }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} className={`gh-chart${className ? ` ${className}` : ""}`} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={role} aria-label={label}>
          {children(width)}
        </svg>
      )}
    </div>
  );
}

export type Scale = (value: number) => number;

export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0;
  return (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** Round tick values covering [min, max] with about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/** Upper end of a nice axis that contains `max`. */
export const niceMax = (max: number, count = 4) => {
  if (!(max > 0)) return 1;
  const ticks = niceTicks(0, max, count);
  const last = ticks[ticks.length - 1];
  return last >= max ? last : last + (ticks[1] - ticks[0] || max);
};

export function fmtTick(value: number) {
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString("en-US");
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
}

/** SVG path through the points; null values break the line. */
export function linePath(xs: readonly number[], ys: readonly (number | null)[]) {
  let d = "";
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y === null || !Number.isFinite(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${xs[i].toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Closed area between two series (e.g. Bollinger bands), skipping indices where either is null. */
export function bandPath(xs: readonly number[], upper: readonly (number | null)[], lower: readonly (number | null)[]) {
  const idx = xs.map((_, i) => i).filter((i) => upper[i] !== null && lower[i] !== null);
  if (idx.length < 2) return "";
  const top = idx.map((i, k) => `${k ? "L" : "M"}${xs[i].toFixed(1)} ${(upper[i] as number).toFixed(1)}`).join("");
  const bottom = [...idx].reverse().map((i) => `L${xs[i].toFixed(1)} ${(lower[i] as number).toFixed(1)}`).join("");
  return `${top}${bottom}Z`;
}

/** Month-start positions for a daily series, thinned so labels stay at least `minGap` px apart. */
export function monthTicks(dates: readonly string[], x: Scale, minGap = 34) {
  const ticks: { x: number; label: string }[] = [];
  dates.forEach((date, i) => {
    if (!date.endsWith("-01")) return;
    const month = Number(date.slice(5, 7)) - 1;
    ticks.push({ x: x(i), label: month === 0 ? date.slice(0, 4) : MONTH_LABELS[month] });
  });
  const kept: typeof ticks = [];
  for (const tick of ticks) if (!kept.length || tick.x - kept[kept.length - 1].x >= minGap) kept.push(tick);
  return kept;
}

export function YGrid({ ticks, y, x0, x1, format = fmtTick, side = "left" }: { ticks: number[]; y: Scale; x0: number; x1: number; format?: (v: number) => string; side?: "left" | "right" | "none" }) {
  return (
    <g className="gh-axis">
      {ticks.map((tick) => (
        <g key={tick}>
          {side !== "right" && <line className="gh-grid" x1={x0} x2={x1} y1={y(tick)} y2={y(tick)} />}
          {side === "left" && <text x={x0 - 6} y={y(tick)} dy="0.32em" textAnchor="end">{format(tick)}</text>}
          {side === "right" && <text x={x1 + 6} y={y(tick)} dy="0.32em" textAnchor="start">{format(tick)}</text>}
        </g>
      ))}
    </g>
  );
}

export function XLabels({ ticks, y }: { ticks: { x: number; label: string }[]; y: number }) {
  return (
    <g className="gh-axis">
      {ticks.map((tick) => (
        <text key={`${tick.label}-${tick.x}`} x={tick.x} y={y} textAnchor="middle">{tick.label}</text>
      ))}
    </g>
  );
}

export function Legend({ items }: { items: { label: string; className: string; shape?: "line" | "dash" | "box" | "dot" }[] }) {
  return (
    <ul className="gh-legend" aria-hidden="true">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`gh-key gh-key--${item.shape ?? "line"} ${item.className}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
