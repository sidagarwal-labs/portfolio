import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, Minus, Plus } from "lucide-react";
import { readerArticles, readingMinutes } from "../../../../content/readerArticles";
import type { ReaderArticleId } from "../../../../content/readerLinks";
import type { OsActions, OsTarget } from "../types";
import "./reader.css";

const textSizes = [14, 15, 16, 17, 18, 20];
const formatDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function Reader({ target }: { target?: OsTarget; actions: OsActions }) {
  /* seq changes on every selection, so reopening the same article still scrolls to the top. */
  const [view, setView] = useState<{ id: ReaderArticleId; seq: number }>({ id: readerArticles[0].id, seq: 0 });
  const [sizeIndex, setSizeIndex] = useState(2);
  const [progress, setProgress] = useState(0);
  const bodyRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitle = useRef(false);
  const article = readerArticles.find((entry) => entry.id === view.id) ?? readerArticles[0];

  const select = (id: ReaderArticleId) => setView((previous) => ({ id, seq: previous.seq + 1 }));

  useEffect(() => {
    const match = readerArticles.find((entry) => entry.id === target?.value);
    if (!match) return;
    focusTitle.current = true;
    select(match.id);
  }, [target]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setProgress(0);
    if (focusTitle.current) titleRef.current?.focus();
    focusTitle.current = false;
  }, [view]);

  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const distance = body.scrollHeight - body.clientHeight;
    setProgress(distance > 0 ? Math.min(1, body.scrollTop / distance) : 1);
  };

  return (
    <div className="rdr">
      <div className="rdr__layout">
        <nav className="rdr__nav" aria-label="Articles">
          <p className="rdr__nav-head">Microsoft work</p>
          <ul>
            {readerArticles.map((entry) => (
              <li key={entry.id}>
                <button type="button" aria-current={entry.id === article.id ? "page" : undefined} onClick={() => select(entry.id)}>
                  <span className="rdr__nav-title">{entry.title}</span>
                  <span className="rdr__nav-source">{entry.publisher}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="rdr__main">
          <div className="rdr__bar">
            <span className="rdr__source">{article.publisher}</span>
            <span className="rdr__badge">Original summary</span>
            <div className="rdr__size" role="group" aria-label="Text size">
              <button type="button" aria-label="Smaller text" title="Smaller text" disabled={sizeIndex === 0} onClick={() => setSizeIndex((index) => index - 1)}>
                <Minus size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Larger text" title="Larger text" disabled={sizeIndex === textSizes.length - 1} onClick={() => setSizeIndex((index) => index + 1)}>
                <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
            <a className="os-button" href={article.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
              Open original
            </a>
          </div>
          <div className="rdr__progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>

          <article
            ref={bodyRef}
            className="rdr__article"
            aria-labelledby="rdr-title"
            style={{ "--rdr-size": `${textSizes[sizeIndex]}px` } as CSSProperties}
            onScroll={onScroll}
          >
            <h2 id="rdr-title" ref={titleRef} tabIndex={-1}>{article.title}</h2>
            <p className="rdr__lede">{article.lede}</p>
            <p className="rdr__meta">
              {article.updated ? `Source updated ${formatDate(article.updated)}` : `${article.publisher} product page`}
              {" · "}
              {readingMinutes(article)} min read
            </p>
            <aside className="rdr__role" aria-label="My part">
              <strong>My part.</strong> {article.role}
            </aside>
            {article.sections.map((section) => (
              <section key={section.title}>
                <h3>{section.title}</h3>
                {section.text && <p>{section.text}</p>}
                {section.items && (
                  <ul>
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </section>
            ))}
            <p className="rdr__note">
              Summarized for this site from{" "}
              <a href={article.url} target="_blank" rel="noreferrer">{article.sourceTitle}</a> ({article.publisher}). It is not
              Microsoft's text, and details change, so check the original for current availability and requirements.
            </p>
          </article>
        </div>
      </div>
    </div>
  );
}
