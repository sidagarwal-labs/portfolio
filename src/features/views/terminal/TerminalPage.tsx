import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { courseworkProjects, currentResearchNotes, earlierBuildoutEditions } from "../../../content/journalContent";
import { profileContent } from "../../../content/siteContent";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import { useResearchNoteDates } from "../../../hooks/useResearchNoteDates";
import { useScrollSpy } from "../useScrollSpy";
import IntroCopy from "../IntroCopy";
import { homeSectionIds } from "../siteViews";
import {
  backgroundStream, contactLinks, earlierProjects, emailLink, marketTracker,
  noteDateFormatter, roleLine, viewProjects
} from "../viewData";
import "./terminal.css";

type Destination = { code: string; id: string; label: string; key?: string; aliases: string[] };

const destinations: Destination[] = [
  { code: "PROJ", id: "lab", key: "1", label: "Projects", aliases: ["project", "projects", "work", "lab", "holdings", "portfolio", "repos"] },
  { code: "NEWS", id: "writing", key: "2", label: "Writing", aliases: ["writing", "notes", "research", "blog", "wire", "articles"] },
  { code: "BIO", id: "impact", key: "3", label: "Background", aliases: ["about", "background", "experience", "history", "education"] },
  { code: "LIB", id: "library", key: "4", label: "Books", aliases: ["library", "books", "bookshelf", "reading", "shelf"] },
  { code: "MSG", id: "contact", key: "5", label: "Contact", aliases: ["contact", "message", "email", "mail", "hello", "linkedin", "connect"] },
  { code: "DES", id: "tm-des", label: "Profile", aliases: ["profile", "top", "home", "intro"] }
];

const functionKeys = destinations.filter((destination) => destination.key);

const commandLookup: Record<string, string> = {
  cv: "CV", resume: "CV", "résumé": "CV",
  help: "HELP", "?": "HELP", commands: "HELP", menu: "HELP",
  keys: "KEYS", shortcuts: "KEYS"
};
for (const destination of destinations) {
  commandLookup[destination.code.toLowerCase()] = destination.code;
  if (destination.key) commandLookup[destination.key] = destination.code;
  destination.aliases.forEach((alias) => { commandLookup[alias] = destination.code; });
}

const helpText = `${destinations.map((destination) => `${destination.code} ${destination.label.toLowerCase()}`).join(" · ")} · CV resume · KEYS toggles shortcuts`;

type Status = { tone: "info" | "ok" | "error"; text: string };

const readyStatus: Status = { tone: "info", text: "Ready. Type HELP for the command list." };

const shortcutsKey = "terminal-shortcuts-v1";

function readShortcutsEnabled() {
  try {
    return localStorage.getItem(shortcutsKey) !== "off";
  } catch {
    return true;
  }
}

function writeShortcutsEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(shortcutsKey);
    else localStorage.setItem(shortcutsKey, "off");
  } catch {
    return;
  }
}

// Accepts "proj", "PROJ <GO>", "/proj" and "proj go".
function normalizeCommand(raw: string) {
  return raw.trim().toLowerCase().replace(/^\//, "").replace(/\s*<go>$|\s+go$/, "").trim();
}

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "America/New_York"
});

const clockDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York"
});

function NewYorkClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="tm-clock" aria-hidden="true">
      <span className="tm-clock__zone">NY</span>
      <span className="tm-clock__date">{clockDateFormatter.format(now)}</span>
      <span className="tm-clock__time">{clockFormatter.format(now)}</span>
    </p>
  );
}

function PanelBar({ id, code, title, meta }: { id: string; code?: string; title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="tm-panel__bar">
      <h2 id={id} className="tm-panel__title" tabIndex={-1}>
        {code && <span className="tm-panel__code" aria-hidden="true">{code} <span className="tm-panel__go">&lt;GO&gt;</span></span>}
        {title}
      </h2>
      {meta && <span className="tm-panel__meta" aria-hidden="true">{meta}</span>}
    </div>
  );
}

function NoteDate({ value }: { value: string }) {
  return (
    <time className="entry-meta" dateTime={value} title={`Last GitHub commit: ${value}`}>
      {noteDateFormatter.format(new Date(value))}
    </time>
  );
}

const keyStats: { value: ReactNode; label: string; note?: string; text?: boolean }[] = [
  { value: "30M+", label: "Copilot paid seats", note: "Helped scale" },
  { value: "Power BI and Viva Engage", label: "Shipped as Copilot content sources", text: true },
  { value: "23,304", label: "arXiv papers indexed", note: "arXiv search project" },
  {
    value: <>0.51 <span aria-hidden="true">→</span><span className="tm-sr-only">to</span> 0.84</>,
    label: "nDCG@10",
    note: "Across arXiv search evaluation milestones"
  }
];

function TerminalPage() {
  const activeId = useScrollSpy(homeSectionIds, "intro");
  const noteDates = useResearchNoteDates();
  const reducedMotion = usePrefersReducedMotion();
  const headerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState<Status>(readyStatus);
  const [shortcutsOn, setShortcutsOn] = useState(readShortcutsEnabled);
  const wireCount = currentResearchNotes.length + profileContent.writing.length;

  // Publishes the ticker and sticky-header heights so anchors and focus land below them.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const ticker = document.querySelector<HTMLElement>(".market-bar");

    function update() {
      if (!header) return;
      const sticky = getComputedStyle(header).position === "sticky";
      root.style.setProperty("--tm-head", `${sticky ? Math.ceil(header.getBoundingClientRect().height) : 0}px`);
      root.style.setProperty("--tm-ticker", ticker ? `${Math.ceil(ticker.getBoundingClientRect().height)}px` : "0px");
    }

    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(header);
    if (ticker) observer?.observe(ticker);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--tm-head");
      root.style.removeProperty("--tm-ticker");
    };
  }, []);

  const jumpTo = useCallback((destination: Destination) => {
    const target = document.getElementById(destination.id);
    if (!target) return;
    target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    setStatus({ tone: "ok", text: `${destination.code} <GO> · ${destination.label}` });
  }, [reducedMotion]);

  useEffect(() => {
    if (!shortcutsOn) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditable(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      const destination = functionKeys.find((item) => item.key === event.key);
      if (destination) {
        event.preventDefault();
        jumpTo(destination);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jumpTo, shortcutsOn]);

  function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = normalizeCommand(command);
    if (!query) {
      setStatus({ tone: "info", text: "Type a command such as PROJ, then press Enter. HELP lists them all." });
      return;
    }

    const code = commandLookup[query];
    if (!code) {
      const typed = command.trim();
      setStatus({ tone: "error", text: `Unknown command “${typed.length > 24 ? `${typed.slice(0, 24)}…` : typed}”. Type HELP for the list.` });
      return;
    }

    setCommand("");
    if (code === "HELP") {
      setStatus({ tone: "info", text: helpText });
    } else if (code === "CV") {
      setStatus({ tone: "ok", text: "CV <GO> · Opening resume (PDF)…" });
      window.location.assign(profileContent.resumeHref);
    } else if (code === "KEYS") {
      const next = !shortcutsOn;
      setShortcutsOn(next);
      writeShortcutsEnabled(next);
      setStatus({ tone: "ok", text: next ? "Keyboard shortcuts on: / types a command, 1–5 jump to sections." : "Keyboard shortcuts off. Type KEYS to turn them back on." });
    } else {
      const destination = destinations.find((item) => item.code === code);
      if (destination) jumpTo(destination);
    }
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    if (command) setCommand("");
    else event.currentTarget.blur();
  }

  return (
    <div className="tm">
      <a className="skip-link" href="#main">Skip to content</a>

      <header id="intro" className="tm-bar" ref={headerRef}>
        <div className="tm-bar__inner">
          <div className="tm-brand">
            <span className="tm-brand__mark" aria-hidden="true">SA</span>
            <h1>{profileContent.shortName}</h1>
          </div>

          <form className="tm-cmd" aria-label="Command line" onSubmit={runCommand} autoComplete="off">
            <div className="tm-cmd__field">
              <label className="tm-cmd__label" htmlFor="tm-command">Command</label>
              <input
                ref={inputRef}
                id="tm-command"
                className="tm-cmd__input"
                type="text"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type PROJ, NEWS, BIO, LIB, MSG, CV or HELP"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-describedby="tm-command-status tm-command-hint"
                aria-invalid={status.tone === "error" || undefined}
              />
              <button type="submit" className="tm-cmd__go">GO</button>
            </div>
            <div className="tm-cmd__meta">
              <p id="tm-command-status" className="tm-status" data-tone={status.tone} aria-live="polite">{status.text}</p>
              <p id="tm-command-hint" className="tm-hint">{shortcutsOn ? "/ to type · 1–5 to jump" : "Shortcuts off · KEYS to enable"}</p>
            </div>
          </form>

          <NewYorkClock />

          <nav className="tm-keys" aria-label="Primary">
            <ul>
              {functionKeys.map((item) => (
                <li key={item.id}>
                  <a className="tm-key" href={`#${item.id}`} aria-current={activeId === item.id ? "location" : undefined}>
                    <span className="tm-key__cap">{item.key}</span>
                    <span className="tm-key__code">{item.code}</span>
                    <span className="tm-key__label">{item.label}</span>
                  </a>
                </li>
              ))}
              <li className="tm-keys__split">
                <a className="tm-key tm-key--action" href={profileContent.resumeHref}>Resume</a>
              </li>
              {emailLink && (
                <li>
                  <a className="tm-key tm-key--action" href={emailLink.href}>Email</a>
                </li>
              )}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="tm-main" tabIndex={-1}>
        <div className="tm-grid">
          <section className="tm-panel tm-des" id="tm-des" aria-labelledby="tm-des-heading">
            <PanelBar id="tm-des-heading" code="DES" title="Profile" />
            <div className="tm-panel__body">
              <div className="tm-des__head">
                <img className="tm-avatar" src={profileContent.avatarUrl} alt="Sid Agarwal's GitHub avatar" width="64" height="64" />
                <dl className="tm-kv">
                  <div><dt>Role</dt><dd>{roleLine}</dd></div>
                  <div><dt>Location</dt><dd>Charlotte, North Carolina</dd></div>
                  <div><dt>Focus</dt><dd>AI search &amp; retrieval</dd></div>
                </dl>
              </div>
              <div className="tm-prose tm-intro">
                <IntroCopy />
              </div>
            </div>
          </section>

          <section className="tm-panel tm-stats-panel" aria-labelledby="tm-stats-heading">
            <PanelBar id="tm-stats-heading" title="Key stats" />
            <div className="tm-panel__body">
              <dl className="tm-stats">
                {keyStats.map((stat) => (
                  <div className="tm-stat" key={stat.label}>
                    <dt className="tm-stat__label">{stat.label}</dt>
                    <dd className={stat.text ? "tm-stat__value tm-stat__value--text" : "tm-stat__value"}>{stat.value}</dd>
                    {stat.note && <dd className="tm-stat__note">{stat.note}</dd>}
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="tm-panel tm-section" id="lab" aria-labelledby="tm-lab-heading">
            <PanelBar id="tm-lab-heading" code="PROJ" title="Holdings · Selected projects" meta={`${viewProjects.length} positions`} />
            <div className="tm-panel__body">
              <div className="tm-holdings__head" aria-hidden="true">
                <span>SYM</span><span>Project</span><span>Thesis</span><span>Stack</span>
              </div>
              <ul className="tm-holdings">
                {viewProjects.map((project) => (
                  <li className="tm-holding" key={project.href}>
                    <span className="tm-holding__sym">{project.symbol}</span>
                    <div className="tm-holding__name">
                      <a className="project-title" href={project.websiteHref ?? project.href}>{project.title}</a>
                      {project.websiteHref && (
                        <a className="project-github" href={project.href} aria-label={`${project.title} on GitHub`}>GitHub</a>
                      )}
                      <span className="tm-holding__focus">{project.focus}</span>
                    </div>
                    <p className="tm-holding__thesis">{project.description}</p>
                    {project.stack.length > 0 && (
                      <ul className="tm-chips" aria-label={`${project.title} stack`}>
                        {project.stack.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <div className="tm-foot">
                <details className="project-archive tm-archive">
                  <summary>Closed positions · earlier projects</summary>
                  <ul>
                    {courseworkProjects.map((project) => (
                      <li key={project.href}>
                        <a href={project.href}>{project.title}</a>
                        <span className="project-archive__note"> &middot; {project.note}</span>
                      </li>
                    ))}
                    {earlierProjects.map((project) => <li key={project.slug}><a href={project.href}>{project.title}</a></li>)}
                  </ul>
                </details>
                <a className="small-link" href="https://github.com/sidagarwal-labs?tab=repositories">All repositories on GitHub</a>
              </div>
            </div>
          </section>

          <section className="tm-panel tm-section" id="writing" aria-labelledby="tm-writing-heading">
            <PanelBar id="tm-writing-heading" code="NEWS" title="News wire · Writing & notes" meta={`${wireCount} ${wireCount === 1 ? "item" : "items"}`} />
            <div className="tm-panel__body">
              {marketTracker?.href && (
                <p className="tm-prose tm-lede">
                  I follow the AI buildout: where the capital goes, what becomes a bottleneck,
                  and which businesses turn that investment into earnings. My{" "}
                  <Link to={marketTracker.href}>AI / LLM Stack Tracker</Link> maps public
                  companies across chips, power, data centers, and applications.
                </p>
              )}
              <div className="tm-wire__head" aria-hidden="true">
                <span>Updated</span><span>Headline</span><span>Type</span>
              </div>
              <ul className="tm-wire">
                {currentResearchNotes.map((note) => (
                  <li key={note.slug}>
                    <NoteDate value={noteDates[note.slug]} />
                    <a href={note.href}>{note.title}</a>
                    <span className="tm-wire__tag" aria-hidden="true">Note</span>
                  </li>
                ))}
                {profileContent.writing.map((entry) => (
                  <li key={entry.slug}>
                    <span className="entry-meta">{entry.date}</span>
                    <Link to={`/writing/${entry.slug}`}>{entry.title}</Link>
                    <span className="tm-wire__tag" aria-hidden="true">Essay</span>
                  </li>
                ))}
              </ul>
              {earlierBuildoutEditions.length > 0 && (
                <details className="project-archive tm-archive tm-archive--wire">
                  <summary>Earlier AI buildout editions</summary>
                  <ul>
                    {earlierBuildoutEditions.map((note) => (
                      <li key={note.slug}>
                        <a href={note.href}>{note.title}</a> <NoteDate value={noteDates[note.slug]} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="disclaimer">Research for my own learning, not investment advice.</p>
            </div>
          </section>

          <section className="tm-panel tm-section" id="impact" aria-labelledby="tm-impact-heading">
            <PanelBar id="tm-impact-heading" code="BIO" title="A little background" />
            <div className="tm-panel__body tm-bio">
              <div className="tm-prose tm-bio__copy">
                <p>
                  I studied business and operations at UNC Charlotte, with a minor in
                  economics. In 2020, I interned as a product manager at Amazon, designing
                  weather and route-closure safety alerts for Middle Mile drivers. I also
                  captained and mentored <Link to="/robotics">the Pitt Pirates, FRC Team 2642</Link>.
                </p>
                <p>
                  I'm now pursuing an M.S. in Data Science and
                  Business Analytics.
                </p>
                <p className="tm-more"><a className="small-link" href={profileContent.resumeHref}>Resume (PDF)</a></p>
              </div>
              <div className="tm-bio__tape">
                <p className="tm-label" id="tm-tape-label">Career tape</p>
                <ol className="tm-tape" aria-labelledby="tm-tape-label">
                  {backgroundStream.map((item) => (
                    <li key={item.label}>
                      <span className="tm-tape__label">{item.label}</span>
                      <span className="tm-tape__detail">{item.detail}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section className="tm-panel tm-section" id="library" aria-labelledby="tm-library-heading">
            <PanelBar id="tm-library-heading" code="LIB" title="Library · On my bookshelf" meta={`${profileContent.books.length} titles`} />
            <div className="tm-panel__body">
              <ul className="tm-books">
                {profileContent.books.map((book) => (
                  <li className="tm-book" key={book.slug}>
                    <img
                      className="tm-book__cover"
                      src={book.cover}
                      alt=""
                      width="34"
                      height="50"
                      loading="lazy"
                      decoding="async"
                      onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                    />
                    <a href={book.href}>{book.title}</a>
                    <span className="tm-book__author">{book.author}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="tm-panel tm-section" id="contact" aria-labelledby="tm-contact-heading">
            <PanelBar id="tm-contact-heading" code="MSG" title="Say hello" />
            <div className="tm-panel__body">
              <p className="tm-prose">Always happy to talk about AI, products, markets, or a good book.</p>
              <ul className="tm-channels">
                {contactLinks.map((link) => (
                  <li key={link.label}>
                    <a className="tm-channel" href={link.href} data-primary={link.label === "Email" || undefined}>
                      <span className="tm-channel__code" aria-hidden="true">{link.shortLabel}</span>
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a className="tm-channel" href={profileContent.resumeHref}>
                    <span className="tm-channel__code" aria-hidden="true">CV</span>
                    Resume
                  </a>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer tm-footer">
        <span>Views are my own.</span>
        {/* The sticky header can't be scrolled to by fragment alone, so jump to the top first. */}
        <a href="#intro" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}>Back to top</a>
      </footer>
    </div>
  );
}

export default TerminalPage;
