import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock, Power, Search, X } from "lucide-react";
import { courseworkProjects, currentResearchNotes, earlierBuildoutEditions } from "../../../content/journalContent";
import { profileContent } from "../../../content/siteContent";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import { useResearchNoteDates } from "../../../hooks/useResearchNoteDates";
import IntroCopy from "../IntroCopy";
import { useScrollSpy } from "../useScrollSpy";
import { contactLinks, earlierProjects, emailLink, marketTracker, noteDateFormatter, viewProjects } from "../viewData";
import BootSequence, { labLogo } from "./BootSequence";
import { hasBooted, rememberBoot } from "./bootState";
import LibrarySection from "./LibrarySection";
import RoboticsSection from "./RoboticsSection";
import { matchesTerm, phraseBoost, queryTerms, runSearch, searchDocs, type SearchDoc } from "./searchIndex";
import Source from "./Source";
import { embeddedView, postToOs } from "../os/embed";
import "./search.css";

/* Inside a Lab OS browser window, the OS supplies the browser chrome and plays the boot intro. */
const embedded = embeddedView === "search";

const defaultQuery = "Sid Agarwal";
const suggestions = ["RAG", "retrieval", "resume", "AI buildout", "robotics", "podcasts"];
const tabs = [
  { id: "intro", label: "All" },
  { id: "lab", label: "Projects" },
  { id: "writing", label: "Writing" },
  { id: "impact", label: "About" },
  { id: "robotics", label: "Robotics" },
  { id: "library", label: "Library" }
];
/* Contact sits below Library but has no tab, so the spy stops at Library. */
const spyIds = tabs.map((tab) => tab.id);

function DocLink({ doc, className, children }: { doc: SearchDoc; className?: string; children: ReactNode }) {
  return doc.route
    ? <Link className={className} to={doc.href}>{children}</Link>
    : <a className={className} href={doc.href}>{children}</a>;
}

function Highlight({ text, terms, prefix }: { text: string; terms: string[]; prefix?: string }) {
  return <>{text.split(/([A-Za-z0-9]+)/).map((part, index) => (index % 2 === 1 && matchesTerm(part, terms, prefix) ? <mark key={index}>{part}</mark> : part))}</>;
}

function SearchPage() {
  const reducedMotion = usePrefersReducedMotion();
  const [booting, setBooting] = useState(() => !embedded && !reducedMotion && !hasBooted());
  const [query, setQuery] = useState(defaultQuery);
  const [explain, setExplain] = useState(false);
  const activeId = useScrollSpy(spyIds, "intro");
  const noteDates = useResearchNoteDates();
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const matchesRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* On phones the header sticks at minus the bar's height, so only the tabs row stays pinned. */
  useEffect(() => {
    const header = headerRef.current;
    const bar = barRef.current;
    if (!header || !bar) return;
    const observer = new ResizeObserver(() => header.style.setProperty("--se-bar-h", `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nav = tabsRef.current;
    const tab = nav?.querySelector<HTMLElement>("[aria-current]");
    if (!nav || !tab || nav.scrollWidth <= nav.clientWidth) return;
    const navBox = nav.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.left < navBox.left || tabBox.right > navBox.right) {
      nav.scrollTo({ left: nav.scrollLeft + tabBox.left - navBox.left - 16, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }, [activeId, reducedMotion]);

  const finishBoot = useCallback(() => {
    rememberBoot();
    setBooting(false);
  }, []);

  useEffect(() => {
    if (booting && reducedMotion) finishBoot();
  }, [booting, reducedMotion, finishBoot]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.inert = booting;
    document.documentElement.classList.toggle("se-booting", booting);
    return () => {
      content.inert = false;
      document.documentElement.classList.remove("se-booting");
    };
  }, [booting]);

  const trimmed = query.trim();
  const searching = trimmed.length > 0 && trimmed.toLowerCase() !== defaultQuery.toLowerCase();
  const results = useMemo(() => runSearch(searching ? trimmed : defaultQuery), [searching, trimmed]);
  const { exact, prefix } = queryTerms(searching ? query : "");
  const seconds = results.seconds < 0.0001 ? "<0.0001" : results.seconds.toFixed(4);
  const addressQuery = encodeURIComponent(trimmed || defaultQuery).replace(/%20/g, "+");

  useEffect(() => {
    if (embedded) postToOs({ type: "labos:query", query: addressQuery });
  }, [addressQuery]);

  const replayIntro = () => (embedded ? postToOs({ type: "labos:boot" }) : setBooting(true));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = searching ? matchesRef.current : document.getElementById("intro");
    target?.scrollIntoView({ block: "start" });
  };

  const focusInput = () => inputRef.current?.focus({ preventScroll: true });

  return (
    <div className="se">
      <a className="skip-link" href="#main">Skip to content</a>
      {booting && <BootSequence onDone={finishBoot} />}

      <div ref={contentRef}>
        {!embedded && (
          <div className="se-chrome">
            <span className="se-chrome__dots" aria-hidden="true"><i /><i /><i /></span>
            {!reducedMotion && (
              <button type="button" className="se-chrome__power" onClick={() => setBooting(true)} aria-label="Replay the boot-up intro" title="Replay intro">
                <Power size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            <span className="se-chrome__address" aria-hidden="true">
              <Lock size={12} strokeWidth={2} />
              <span>agarwal-labs.com/search?q={addressQuery}</span>
            </span>
          </div>
        )}

        <header className="se-header" ref={headerRef}>
          <div className="se-header__bar" ref={barRef}>
            <a className="se-logo" href="#intro" aria-label="Sid search, back to top">
              <img src={labLogo} alt="" width="34" height="34" />
              <span aria-hidden="true"><b>sid</b> search</span>
            </a>
            <form className="se-box" role="search" onSubmit={submit}>
              <label className="sr-only" htmlFor="se-query">Search Sid's work</label>
              <Search className="se-box__icon" size={18} strokeWidth={2} aria-hidden="true" />
              <input
                ref={inputRef}
                id="se-query"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects, notes, books..."
                autoComplete="off"
                spellCheck={false}
                aria-describedby="se-query-hint"
              />
              {query && (
                <button type="button" className="se-box__clear" aria-label="Clear search" onClick={() => { setQuery(""); focusInput(); }}>
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <span id="se-query-hint" className="sr-only">Results update as you type.</span>
            </form>
          </div>
          <nav className="se-tabs" aria-label="Primary" ref={tabsRef}>
            <div className="se-tabs__main">
              {tabs.map((tab) => (
                <a key={tab.id} href={`#${tab.id}`} aria-current={activeId === tab.id ? "location" : undefined}>{tab.label}</a>
              ))}
            </div>
            <div className="se-tabs__end">
              <a className="se-tabs__resume" href={profileContent.resumeHref}>Resume</a>
              {emailLink && <a href={emailLink.href}>Email</a>}
            </div>
          </nav>
        </header>

        <main className="se-main" id="main" tabIndex={-1}>
          {!searching && <p className="se-stats">About {searchDocs.length} results ({seconds} seconds)</p>}

          <div className="se-layout">
            <div className="se-top">
              {searching && (
                <section className="se-matches" ref={matchesRef} aria-labelledby="se-matches-heading">
                  <div className="se-matches__head">
                    <h2 id="se-matches-heading">Results for “{trimmed}”</h2>
                    <label className="se-explain">
                      <input type="checkbox" checked={explain} onChange={(event) => setExplain(event.target.checked)} />
                      Explain ranking
                    </label>
                  </div>
                  <p className="se-stats" role="status">
                    {results.total
                      ? `${results.total} ${results.total === 1 ? "result" : "results"} (${seconds} seconds), ranked with BM25`
                      : "No results. Try one of these:"}
                  </p>
                  {results.total === 0 && (
                    <div className="se-suggestions">
                      {suggestions.map((suggestion) => (
                        <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); focusInput(); }}>{suggestion}</button>
                      ))}
                    </div>
                  )}
                  <ol className="se-results">
                    {results.hits.map((hit) => (
                      <li className="se-result" key={hit.doc.id}>
                        <Source href={hit.doc.href} route={hit.doc.route} />
                        <h3><DocLink className="se-result__title" doc={hit.doc}><Highlight text={hit.doc.title} terms={exact} prefix={prefix} /></DocLink></h3>
                        <p className="se-result__snippet se-result__snippet--clamp">
                          <span className="se-kind">{hit.doc.kind}</span>{" "}
                          <Highlight text={hit.doc.snippet} terms={exact} prefix={prefix} />
                        </p>
                        {explain && (
                          <p className="se-signals">
                            BM25 {hit.score.toFixed(2)} · matched {hit.matched.join(", ")}
                            {hit.phrase && ` · title phrase ×${phraseBoost}`}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                  <button type="button" className="se-text-button" onClick={() => { setQuery(defaultQuery); focusInput(); }}>
                    Back to everything
                  </button>
                </section>
              )}

              <article className="se-hero" id="intro" aria-labelledby="se-intro-heading">
                <Source href="#intro" />
                <h1 id="se-intro-heading">{profileContent.shortName} <span>· Senior PM, AI search &amp; retrieval</span></h1>
                <div className="se-hero__snippet"><IntroCopy /></div>
                {!searching && (
                  <p className="se-hero__try">
                    <span>Try searching:</span>
                    {suggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); focusInput(); }}>{suggestion}</button>
                    ))}
                  </p>
                )}
                <ul className="se-sitelinks">
                  <li><a href="#lab">Projects</a><span>Retrieval, RAG, and finance builds</span></li>
                  <li><a href="#writing">Writing</a><span>AI buildout notes and essays</span></li>
                  <li><a href="#impact">About</a><span>Microsoft, Amazon, education</span></li>
                  <li><a href="#robotics">Robotics</a><span>Pitt Pirates, FRC Team 2642</span></li>
                  <li><a href="#library">Library</a><span>Books and podcasts I recommend</span></li>
                  <li><a href={profileContent.resumeHref}>Resume</a><span>PDF</span></li>
                  {emailLink && <li><a href={emailLink.href}>Email</a><span>{emailLink.href.replace("mailto:", "")}</span></li>}
                </ul>
              </article>
            </div>

            <aside className="se-panel" aria-labelledby="se-panel-heading">
              <div className="se-panel__head">
                <img src={profileContent.avatarUrl} alt="Sid Agarwal's GitHub avatar" width="76" height="76" />
                <div>
                  <h2 id="se-panel-heading"><span className="sr-only">About </span>{profileContent.shortName}</h2>
                  <p>Senior Product Manager at Microsoft</p>
                </div>
              </div>
              <div className="se-panel__actions">
                <a className="se-button se-button--primary" href={profileContent.resumeHref}>Resume</a>
                {contactLinks.map((social) => <a key={social.label} className="se-button" href={social.href}>{social.label}</a>)}
              </div>
              <p className="se-panel__about">
                Product manager working on search and retrieval quality for Microsoft 365 Copilot.
                Based in Charlotte, North Carolina.
              </p>
              <dl className="se-facts">
                <div><dt>Works at</dt><dd>Microsoft, AI search &amp; retrieval</dd></div>
                <div><dt>Career</dt><dd>Microsoft since 2021: PM intern to Senior PM</dd></div>
                <div><dt>Previously</dt><dd>Product manager intern at Amazon (2020)</dd></div>
                <div><dt>Education</dt><dd>UNC Charlotte, business and operations, minor in economics</dd></div>
                <div><dt>Studying</dt><dd>M.S. in Data Science and Business Analytics</dd></div>
                <div><dt>Robotics</dt><dd>Captained and mentored <a href="#robotics">the Pitt Pirates, FRC Team 2642</a></dd></div>
              </dl>
            </aside>

            <div className="se-rest">
              <section className="se-section" id="lab" aria-labelledby="se-lab-heading">
                <h2 id="se-lab-heading">Projects</h2>
                <ol className="se-results">
                  {viewProjects.map((project) => (
                    <li className="se-result" key={project.href}>
                      <Source href={project.websiteHref ?? project.href} />
                      <div className="se-result__head">
                        <h3><a className="se-result__title project-title" href={project.websiteHref ?? project.href}>{project.title}</a></h3>
                        {project.websiteHref && <a className="project-github" href={project.href} aria-label={`${project.title} on GitHub`}>GitHub</a>}
                      </div>
                      <p className="se-result__snippet">{project.description}</p>
                      <ul className="se-chips" aria-label={`${project.title} stack`}>
                        {project.stack.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </li>
                  ))}
                </ol>
                <details className="project-archive se-archive">
                  <summary>Earlier projects</summary>
                  <ul>
                    {courseworkProjects.map((project) => (
                      <li key={project.href}><a href={project.href}>{project.title}</a><span className="project-archive__note"> &middot; {project.note}</span></li>
                    ))}
                    {earlierProjects.map((project) => <li key={project.slug}><a href={project.href}>{project.title}</a></li>)}
                  </ul>
                </details>
                <a className="small-link" href="https://github.com/sidagarwal-labs?tab=repositories">All repositories on GitHub</a>
              </section>

              <section className="se-section" id="writing" aria-labelledby="se-writing-heading">
                <h2 id="se-writing-heading">Writing &amp; notes</h2>
                {marketTracker && (
                  <p className="se-lede">
                    I follow the AI buildout: where the capital goes, what becomes a bottleneck,
                    and which businesses turn that investment into earnings. My{" "}
                    <a href={marketTracker.href}>AI / LLM Stack Tracker</a> maps public
                    companies across chips, power, data centers, and applications.
                  </p>
                )}
                <ul className="se-stories">
                  {currentResearchNotes.map((note) => (
                    <li key={note.slug}>
                      <a href={note.href}>
                        <span className="se-stories__source">GitHub · research notes</span>
                        <span className="se-stories__title">{note.title}</span>
                        <time dateTime={noteDates[note.slug]}>{noteDateFormatter.format(new Date(noteDates[note.slug]))}</time>
                      </a>
                    </li>
                  ))}
                </ul>
                <ol className="se-results se-results--essays">
                  {profileContent.writing.map((entry) => (
                    <li className="se-result" key={entry.slug}>
                      <Source href={`/writing/${entry.slug}`} route />
                      <h3><Link className="se-result__title" to={`/writing/${entry.slug}`}>{entry.title}</Link></h3>
                      <p className="se-result__snippet"><span className="se-kind">{entry.date}</span> {entry.summary}</p>
                    </li>
                  ))}
                </ol>
                {earlierBuildoutEditions.length > 0 && (
                  <details className="project-archive se-archive">
                    <summary>Earlier AI buildout editions</summary>
                    <ul>
                      {earlierBuildoutEditions.map((note) => (
                        <li key={note.slug}>
                          <a href={note.href}>{note.title}</a>{" "}
                          <time className="entry-meta" dateTime={noteDates[note.slug]}>{noteDateFormatter.format(new Date(noteDates[note.slug]))}</time>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="disclaimer">Research for my own learning, not investment advice.</p>
              </section>

              <section className="se-section" id="impact" aria-labelledby="se-about-heading">
                <h2 id="se-about-heading">About Sid</h2>
                <p className="se-lede">
                  I studied business and operations at UNC Charlotte, with a minor in economics. In 2020, I
                  interned as a product manager at Amazon, designing weather and route-closure safety alerts
                  for Middle Mile drivers. I also captained and mentored{" "}
                  <a href="#robotics">the Pitt Pirates, FRC Team 2642</a>. I'm now pursuing an M.S. in
                  Data Science and Business Analytics.
                </p>
                <div className="se-paa">
                  <h3>People also ask</h3>
                  <details>
                    <summary>What does Sid work on at Microsoft?</summary>
                    <p>
                      Search and retrieval quality for Microsoft 365 Copilot. He shipped Power BI and Viva Engage
                      as Copilot content sources, led retrieval quality for Copilot Connectors, and helped take
                      Copilot from zero to over 30 million paid seats.
                    </p>
                  </details>
                  <details>
                    <summary>What has Sid built outside work?</summary>
                    <p>
                      Retrieval and RAG projects like arXiv Search and NVDocs RAG, the HireMe.AI resume builder,
                      and a library of earnings models. <a href="#lab">See projects</a>.
                    </p>
                  </details>
                  <details>
                    <summary>How can I contact Sid?</summary>
                    <p>
                      {emailLink ? <>Email <a href={emailLink.href}>{emailLink.href.replace("mailto:", "")}</a>, or </> : null}
                      see <a href="#contact">all contact options</a>.
                    </p>
                  </details>
                </div>
                <a className="small-link" href={profileContent.resumeHref}>Resume (PDF)</a>
              </section>

              <RoboticsSection />

              <LibrarySection />

              <section className="se-section se-contact" id="contact" aria-labelledby="se-contact-heading">
                <h2 id="se-contact-heading">Say hello</h2>
                <p>Always happy to talk about AI, products, markets, or a good book.</p>
                <div className="se-panel__actions">
                  {contactLinks.map((social, index) => (
                    <a key={social.label} className={index === 0 ? "se-button se-button--primary" : "se-button"} href={social.href}>{social.label}</a>
                  ))}
                  <a className="se-button" href={profileContent.resumeHref}>Resume</a>
                </div>
              </section>
            </div>
          </div>

          <footer className="site-footer se-footer">
            <span>Views are my own.</span>
            <span className="se-footer__links">
              {!reducedMotion && <button type="button" className="se-text-button" onClick={replayIntro}>Replay intro</button>}
              <a href="#intro">Back to top</a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default SearchPage;
