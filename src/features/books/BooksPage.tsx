import { useRef } from "react";
import PageFrame from "../../components/PageFrame";
import { profileContent } from "../../content/siteContent";

function BooksPage() {
  const railRef = useRef<HTMLDivElement>(null);

  function scrollRail(direction: number) {
    if (!railRef.current) return;
    railRef.current.scrollBy({ left: direction * 320, behavior: "smooth" });
  }

  return (
    <PageFrame className="books-page">
      <section className="page-hero glass-card">
        <span className="section-heading__eyebrow">Books</span>
        <h1>A visual library of the inputs behind the work</h1>
        <p>
          The shelf leans toward biographies, computing, markets, and systems thinking. It is less a flex than a map of the kinds of patterns and people I keep returning to.
        </p>
      </section>

      <section className="book-rail-section">
        <div className="book-rail-header">
          <h2>The shelf</h2>
          <div className="book-rail-arrows">
            <button type="button" aria-label="Scroll left" onClick={() => scrollRail(-1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" aria-label="Scroll right" onClick={() => scrollRail(1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>

        <div className="book-rail" ref={railRef}>
          {profileContent.books.map((book) => (
            <a key={book.slug} className="book-rail__card" href={book.href} target="_blank" rel="noreferrer">
              <div className="book-rail__cover-wrap">
                <img src={book.cover} alt={`Cover of ${book.title}`} className="book-rail__cover" loading="lazy" />
              </div>
              <div className="book-rail__info">
                <strong>{book.title}</strong>
                <span>{book.author}</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}

export default BooksPage;
