import { useEffect, useState } from "react";

/* Tracks whether a swipe strip scrolls sideways, so it only becomes a tab stop when there is more to see. */
export function useScrollsX<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(() => setScrolls(element.scrollWidth > element.clientWidth + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, scrolls] as const;
}
