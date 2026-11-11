import { useLayoutEffect, useRef, useState } from "react";

/* Shared by the hand-rolled SVG charts on the live pages, which render at their measured pixel width. */

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export type Box = { left: number; top: number; right: number; bottom: number };
export type TipPlace = { side: "above" | "below" | "right" | "left"; left: number; top: number };

/* Puts a tooltip of the given size beside a mark (both relative to the chart): above, below, right, or left, the
   first that fits inside the chart; otherwise above or below, whichever has more room, kept inside the chart. */
export function placeTip(dot: Box, width: number, height: number, chartWidth: number, chartHeight: number, gap = 8): TipPlace {
  const clamp = (value: number, max: number) => Math.min(Math.max(0, value), Math.max(0, max));
  const left = clamp((dot.left + dot.right) / 2 - width / 2, chartWidth - width);
  const top = clamp((dot.top + dot.bottom) / 2 - height / 2, chartHeight - height);
  const above = dot.top - gap - height;
  const below = dot.bottom + gap;
  if (above >= 0) return { side: "above", left, top: above };
  if (below + height <= chartHeight) return { side: "below", left, top: below };
  if (dot.right + gap + width <= chartWidth) return { side: "right", left: dot.right + gap, top };
  if (dot.left - gap - width >= 0) return { side: "left", left: dot.left - gap - width, top };
  return dot.top >= chartHeight - dot.bottom
    ? { side: "above", left, top: clamp(above, chartHeight - height) }
    : { side: "below", left, top: clamp(below, chartHeight - height) };
}
