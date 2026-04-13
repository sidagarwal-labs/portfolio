import { RefObject, useEffect, useState } from "react";

export function useScrollProgress(targetRef: RefObject<HTMLElement>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) {
      return;
    }

    const updateProgress = () => {
      const maxScroll = Math.max(target.scrollHeight - target.clientHeight, 1);
      setProgress(target.scrollTop / maxScroll);
    };

    updateProgress();
    target.addEventListener("scroll", updateProgress, { passive: true });

    return () => target.removeEventListener("scroll", updateProgress);
  }, [targetRef]);

  return progress;
}
