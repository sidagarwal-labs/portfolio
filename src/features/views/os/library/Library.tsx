import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, Mic, Play, Search, X } from "lucide-react";
import { libraryCategories, libraryItemHref, libraryItems, spotifyEmbedUrl, type LibraryCategoryId, type LibraryItem } from "../../../../content/library";
import type { OsActions, OsTarget } from "../types";
import "./library.css";

type Format = "all" | LibraryItem["kind"];
type Topic = LibraryCategoryId | "all";

const formats: { id: Format; label: string }[] = [
  { id: "all", label: "All" },
  { id: "book", label: "Books" },
  { id: "podcast", label: "Podcasts" }
];

const byline = (item: LibraryItem) => (item.kind === "book" ? item.author : item.host);
const art = (item: LibraryItem) => (item.kind === "book" ? item.cover : item.art);
const topicLabel = (id: LibraryCategoryId) => libraryCategories.find((category) => category.id === id)?.label ?? id;
const bookCount = libraryItems.filter((entry) => entry.kind === "book").length;
const podcastCount = libraryItems.length - bookCount;

function matches(item: LibraryItem, terms: string[]) {
  if (terms.length === 0) return true;
  const text = [item.title, byline(item), item.note, ...(item.kind === "book" ? item.tags : []), ...item.categories.map(topicLabel), item.kind].join(" ").toLowerCase();
  return terms.every((term) => text.includes(term));
}

function Art({ item, className }: { item: LibraryItem; className: string }) {
  return (
    <span className={`${className} ${className}--${item.kind}`} data-initial={item.title.replace(/^The /, "").charAt(0)} aria-hidden="true">
      <img src={art(item)} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} />
    </span>
  );
}

function Kind({ item }: { item: LibraryItem }) {
  const Icon = item.kind === "book" ? BookOpen : Mic;
  return (
    <span className="lib-kind">
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      {item.kind === "book" ? "Book" : "Podcast"}
    </span>
  );
}

export default function Library({ target }: { target?: OsTarget; actions: OsActions }) {
  const [format, setFormat] = useState<Format>("all");
  const [topic, setTopic] = useState<Topic>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);

  /* A link opened the Library on one item: clear filters so its card is visible, and move focus to its details. */
  useEffect(() => {
    if (!target || !libraryItems.some((item) => item.slug === target.value)) return;
    setFormat("all");
    setTopic("all");
    setQuery("");
    setSelected(target.value);
    focusDetail.current = true;
  }, [target]);

  useEffect(() => {
    if (!selected) return;
    rootRef.current?.querySelector(`[data-slug="${selected}"]`)?.scrollIntoView({ block: "nearest" });
    if (focusDetail.current) titleRef.current?.focus();
    focusDetail.current = false;
  }, [selected]);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const inFormat = (item: LibraryItem) => format === "all" || item.kind === format;
  const inTopic = (item: LibraryItem) => topic === "all" || item.categories.includes(topic);
  const searched = libraryItems.filter((item) => matches(item, terms));
  const visible = searched.filter((item) => inFormat(item) && inTopic(item));
  /* All topics: each item sits on the shelf of its first topic. One topic: everything tagged with it. */
  const shelves = libraryCategories
    .filter((category) => topic === "all" || category.id === topic)
    .map((category) => ({ ...category, items: topic === "all" ? visible.filter((item) => item.categories[0] === category.id) : visible }))
    .filter((shelf) => shelf.items.length > 0);

  const item = libraryItems.find((entry) => entry.slug === selected);
  const related = useMemo(() => {
    if (!item) return [];
    return libraryItems
      .filter((other) => other.slug !== item.slug && other.categories.some((category) => item.categories.includes(category)))
      .sort((a, b) => Number(a.kind === item.kind) - Number(b.kind === item.kind))
      .slice(0, 4);
  }, [item]);

  const clear = () => {
    setFormat("all");
    setTopic("all");
    setQuery("");
  };

  return (
    <div
      ref={rootRef}
      className="lib"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) {
          event.stopPropagation();
          setSelected(null);
        }
      }}
    >
      <header className="lib__head">
        <p className="lib__intro">{bookCount} books and {podcastCount} podcasts I keep coming back to, grouped by what they help me think about.</p>
        <label className="lib__search">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Search the library</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, hosts, notes" />
        </label>
      </header>

      <div className="lib__filters">
        <div className="lib__seg" role="group" aria-label="Format">
          {formats.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={format === entry.id} onClick={() => setFormat(entry.id)}>
              {entry.label}
              <span className="lib-count">{searched.filter((other) => inTopic(other) && (entry.id === "all" || other.kind === entry.id)).length}</span>
            </button>
          ))}
        </div>
        <div className="lib__chips" role="group" aria-label="Topic">
          {[{ id: "all" as const, label: "All topics" }, ...libraryCategories].map((entry) => (
            <button key={entry.id} type="button" className="lib-chip" aria-pressed={topic === entry.id} onClick={() => setTopic(entry.id)}>
              {entry.label}
              <span className="lib-count">{searched.filter((other) => inFormat(other) && (entry.id === "all" || other.categories.includes(entry.id))).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`lib__main${item ? " has-detail" : ""}`}>
        <div className="lib__shelves">
          {shelves.length === 0 ? (
            <div className="lib__empty">
              <p>Nothing in the library matches those filters.</p>
              <button type="button" className="os-button" onClick={clear}>Clear filters</button>
            </div>
          ) : (
            shelves.map((shelf) => (
              <section key={shelf.id} className="lib-shelf" aria-labelledby={`lib-shelf-${shelf.id}`}>
                <div className="lib-shelf__head">
                  <h3 id={`lib-shelf-${shelf.id}`}>{shelf.label}</h3>
                  <p>{shelf.blurb}</p>
                </div>
                <ul className="lib__grid">
                  {shelf.items.map((entry) => (
                    <li key={entry.slug}>
                      <button type="button" className={`lib-card lib-card--${entry.kind}`} data-slug={entry.slug} aria-pressed={selected === entry.slug} onClick={() => setSelected(entry.slug)}>
                        <Art item={entry} className="lib-art" />
                        <Kind item={entry} />
                        <span className="lib-card__title">{entry.title}</span>
                        <span className="lib-card__by">{byline(entry)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {item && (
          <aside className="lib-detail" aria-labelledby="lib-detail-title">
            <button type="button" className="lib-detail__close" onClick={() => setSelected(null)} aria-label="Close details" title="Close">
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            <Art item={item} className="lib-detail__art" />
            <Kind item={item} />
            <h3 id="lib-detail-title" ref={titleRef} tabIndex={-1}>{item.title}</h3>
            <p className="lib-detail__by">{item.kind === "book" ? `by ${item.author}` : item.host}</p>
            <ul className="lib-detail__topics" aria-label="Topics">
              {item.categories.map((category) => (
                <li key={category}>
                  <button type="button" className="lib-chip" onClick={() => setTopic(category)}>{topicLabel(category)}</button>
                </li>
              ))}
            </ul>
            <p className="lib-detail__note">{item.note}</p>
            <div className="lib-detail__actions">
              {item.kind === "podcast" && playing !== item.slug && (
                <button type="button" className="os-button os-button--primary" onClick={() => setPlaying(item.slug)}>
                  <Play size={14} strokeWidth={2.2} aria-hidden="true" />
                  Play here
                </button>
              )}
              <a className="os-button" href={libraryItemHref(item)} target="_blank" rel="noreferrer">
                <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                {item.kind === "book" ? "View on Amazon" : "Open in Spotify"}
              </a>
            </div>
            {item.kind === "podcast" ? (
              playing === item.slug ? (
                <iframe
                  className="lib-detail__player"
                  title={`${item.title} episodes on Spotify`}
                  src={spotifyEmbedUrl(item.spotifyId)}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                />
              ) : (
                <p className="lib-detail__hint">Play here loads Spotify's player with recent episodes. Nothing from Spotify loads until you press it.</p>
              )
            ) : (
              <p className="lib-detail__hint">Amazon pages can't open inside this desktop, so that link opens a new tab.</p>
            )}
            {related.length > 0 && (
              <section className="lib-related" aria-labelledby="lib-related-title">
                <h4 id="lib-related-title">Pairs well with</h4>
                <ul>
                  {related.map((other) => (
                    <li key={other.slug}>
                      <button type="button" className="lib-related__item" onClick={() => setSelected(other.slug)}>
                        <Art item={other} className="lib-related__art" />
                        <span>
                          <span className="lib-related__title">{other.title}</span>
                          <span className="lib-related__by">{other.kind === "book" ? "Book" : "Podcast"} · {byline(other)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
