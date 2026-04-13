import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import PageFrame from "../../components/PageFrame";
import { profileContent } from "../../content/siteContent";
import { useScrollProgress } from "../../hooks/useScrollProgress";

function WritingPage() {
  const [activeSlug, setActiveSlug] = useState(profileContent.writing[0]?.slug ?? "");
  const deferredSlug = useDeferredValue(activeSlug);
  const articleRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLSpanElement>(null);
  const progress = useScrollProgress(articleRef);

  const activeEntry = useMemo(
    () => profileContent.writing.find((entry) => entry.slug === deferredSlug) ?? profileContent.writing[0],
    [deferredSlug]
  );

  useEffect(() => {
    if (articleRef.current) {
      articleRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [activeEntry.slug]);

  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${Math.min(progress * 100, 100)}%`;
    }
  }, [progress]);

  return (
    <PageFrame className="writing-page">
      <section className="page-hero glass-card">
        <span className="section-heading__eyebrow">Writing</span>
        <h1>Short notes, structured to scale</h1>
        <p>
          The writing layer is intentionally simple for v1, but it is wired through the same typed content system as the rest of the app so new entries can land without touching layout code.
        </p>
      </section>

      <section className="writing-layout">
        <aside className="glass-card writing-index" aria-label="Writing entries">
          <div className="writing-index__header">
            <span className="section-heading__eyebrow">Entries</span>
            <h2>Reading queue</h2>
          </div>

          <div className="writing-index__list">
            {profileContent.writing.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                className={entry.slug === activeEntry.slug ? "writing-entry-card is-active" : "writing-entry-card"}
                onClick={() => {
                  startTransition(() => setActiveSlug(entry.slug));
                }}
              >
                <span>{entry.date}</span>
                <strong>{entry.title}</strong>
                <p>{entry.summary}</p>
                <small>{entry.readTime}</small>
              </button>
            ))}
          </div>
        </aside>

        <article className="glass-card reading-surface">
          <div className="reading-surface__progress" aria-hidden="true">
            <span ref={progressBarRef} />
          </div>

          <header className="reading-surface__header">
            <span className="section-heading__eyebrow">{activeEntry.date}</span>
            <h2>{activeEntry.title}</h2>
            <p>{activeEntry.summary}</p>
          </header>

          <div ref={articleRef} className="reading-surface__body" tabIndex={0}>
            {activeEntry.content.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      </section>
    </PageFrame>
  );
}

export default WritingPage;
