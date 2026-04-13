import { useEffect, useState } from "react";

export function useSectionSpy(sectionIds: string[], defaultId: string) {
  const [activeId, setActiveId] = useState(defaultId);

  useEffect(() => {
    const elements = sectionIds
      .map((sectionId) => document.getElementById(sectionId))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!elements.length) {
      return;
    }

    const lastSectionId = sectionIds[sectionIds.length - 1];

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (mostVisible?.target.id) {
          setActiveId(mostVisible.target.id);
        }
      },
      {
        rootMargin: "-30% 0px -45% 0px",
        threshold: [0.15, 0.35, 0.55, 0.75]
      }
    );

    elements.forEach((element) => observer.observe(element));

    /* When the user scrolls to the very bottom, force the last section active.
       The IntersectionObserver can miss it because the bottom section may not
       fill enough of the narrowed viewport band. */
    function handleScroll() {
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 60;
      if (atBottom) {
        setActiveId(lastSectionId);
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [defaultId, sectionIds]);

  return activeId;
}
