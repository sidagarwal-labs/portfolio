import { useEffect, useState } from "react";

/* Match native anchor offsets instead of a viewport fraction, so short sections stay active
   on tall screens. Allow one pixel for rounding fractional scroll positions. */
export function useScrollSpy(ids: readonly string[], defaultId: string) {
  const [activeId, setActiveId] = useState(defaultId);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      let current = defaultId;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element) {
          const margin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
          if (element.getBoundingClientRect().top <= padding + margin + 1) current = id;
        }
      }
      const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActiveId(atBottom ? ids[ids.length - 1] : current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resizes = new ResizeObserver(schedule);
    resizes.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resizes.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ids, defaultId]);

  return activeId;
}
