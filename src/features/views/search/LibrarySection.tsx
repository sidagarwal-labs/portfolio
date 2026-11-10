import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Mic } from "lucide-react";
import { libraryCategories, libraryItemHref, libraryItems, type LibraryCategoryId, type LibraryItem } from "../../../content/library";
import { embeddedView, postToOs } from "../os/embed";

type Topic = LibraryCategoryId | "all";

const embedded = embeddedView === "search";
const topics: { id: Topic; label: string }[] = [{ id: "all", label: "All" }, ...libraryCategories];
const inTopic = (item: LibraryItem, topic: Topic) => topic === "all" || item.categories.includes(topic);
const countBooks = (items: LibraryItem[]) => items.filter((item) => item.kind === "book").length;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const bookCount = countBooks(libraryItems);
const podcastCount = libraryItems.length - bookCount;

function LibraryItemCard({ item }: { item: LibraryItem }) {
  const Icon = item.kind === "book" ? BookOpen : Mic;
  return (
    <li>
      <a className="se-shelf__link" href={libraryItemHref(item)}>
        <span className={`se-art se-art--${item.kind}`} data-initial={item.title.replace(/^The /, "").charAt(0)} aria-hidden="true">
          <img
            src={item.kind === "book" ? item.cover : item.art}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => { event.currentTarget.hidden = true; }}
          />
        </span>
        <span className="se-badge">
          <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
          {item.kind === "book" ? "Book" : "Podcast"}
        </span>
        <span className="se-shelf__title">{item.title}</span>
      </a>
      <span className="se-shelf__by">{item.kind === "book" ? item.author : item.host}</span>
    </li>
  );
}

function LibrarySection() {
  const [topic, setTopic] = useState<Topic>("all");
  const items = libraryItems.filter((item) => inTopic(item, topic));
  const books = countBooks(items);
  const category = libraryCategories.find((entry) => entry.id === topic);

  return (
    <section className="se-section se-library" id="library" aria-labelledby="se-library-heading">
      <div className="se-section__head">
        <h2 id="se-library-heading">Library</h2>
        {embedded ? (
          <button type="button" className="se-button" onClick={() => postToOs({ type: "labos:link", app: "library", target: "" })}>
            Open Library
          </button>
        ) : (
          <Link className="se-button" to="/?view=os">Open Lab OS</Link>
        )}
      </div>
      <p className="se-lede">
        {bookCount} books and {podcastCount} podcasts I keep coming back to, grouped by what they help me think about.
        {!embedded && " The Library app in Lab OS adds a note on each one and plays podcasts in place."}
      </p>

      <div className="se-filters" role="group" aria-label="Library topics">
        {topics.map((entry) => (
          <button key={entry.id} type="button" aria-pressed={topic === entry.id} onClick={() => setTopic(entry.id)}>
            {entry.label}
            <span className="se-filters__count">{libraryItems.filter((item) => inTopic(item, entry.id)).length}</span>
          </button>
        ))}
      </div>
      <p className="se-stats se-library__stats" role="status">
        {category ? `${category.label}: ` : "All topics: "}
        {plural(books, "book")} and {plural(items.length - books, "podcast")}
        {category && <span className="se-library__blurb"> · {category.blurb}</span>}
      </p>

      <ul className="se-shelf">
        {items.map((item) => <LibraryItemCard key={item.slug} item={item} />)}
      </ul>
    </section>
  );
}

export default LibrarySection;
