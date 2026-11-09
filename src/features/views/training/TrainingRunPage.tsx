import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { courseworkProjects, currentResearchNotes, earlierBuildoutEditions } from "../../../content/journalContent";
import { profileContent } from "../../../content/siteContent";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import { useResearchNoteDates } from "../../../hooks/useResearchNoteDates";
import { useScrollSpy } from "../useScrollSpy";
import IntroCopy from "../IntroCopy";
import { homeSectionIds } from "../siteViews";
import { contactLinks, earlierProjects, emailLink, marketTracker, noteDateFormatter, roleLine, viewProjects } from "../viewData";
import { epochLimit, learningRate, type Measurement } from "../model/tinyModel";
import { useTinyModel } from "../model/useTinyModel";
import ModelControls from "../model/ModelControls";
import "./training.css";

const cells = [
  { id: "intro", code: 'sid = Candidate.load("agarwal-labs")', features: ["AI search", "product management"] },
  { id: "lab", code: "sid.projects.head(4)", features: ["retrieval", "reranking", "evaluation"] },
  { id: "writing", code: 'sid.notes.sort_values("updated", ascending=False)', features: ["AI buildout", "markets"] },
  { id: "impact", code: "sid.background.describe()", features: ["operations", "robotics", "data science"] },
  { id: "library", code: "sid.bookshelf.sample(frac=1.0)", features: ["product taste", "history", "investing"] },
  { id: "contact", code: "sid.contact()", features: ["ready to talk"] }
];

type CellRun = { order: number; running: boolean };
const chart = { width: 268, height: 124, left: 28, bottom: 18, top: 6 };

/* Cells "execute" in the order the reader reaches them, like a notebook run top to bottom or out of order. */
function useCellRuns(reducedMotion: boolean) {
  const [runs, setRuns] = useState<Record<string, CellRun>>({});

  useEffect(() => {
    const timers: number[] = [];
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.id;
        observer.unobserve(entry.target);
        setRuns((current) => current[id] ? current : { ...current, [id]: { order: Object.keys(current).length + 1, running: !reducedMotion } });
        if (!reducedMotion) {
          timers.push(window.setTimeout(() => setRuns((current) => ({ ...current, [id]: { ...current[id], running: false } })), 700));
        }
      }
    }, { rootMargin: "0px 0px -20% 0px" });

    cells.forEach((cell) => {
      const element = document.getElementById(cell.id);
      if (element) observer.observe(element);
    });
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reducedMotion]);

  return runs;
}

function highlight(code: string) {
  return code.split(/("[^"]*"|\b[A-Za-z_]+(?=\()|\b(?:True|False)\b|\b\d+(?:\.\d+)?\b)/).map((part, index) => {
    if (!part) return null;
    const kind = part.startsWith("\"") ? "string" : /^\d/.test(part) ? "number" : /^(True|False)$/.test(part) ? "keyword" : /^[A-Za-z_]+$/.test(part) && code.includes(`${part}(`) ? "call" : undefined;
    return kind ? <span key={index} className={`tr-code--${kind}`}>{part}</span> : part;
  });
}

function LossChart({ measurements, compact = false }: { measurements: Measurement[]; compact?: boolean }) {
  const maximum = Math.ceil(Math.max(1, ...measurements.flatMap((point) => [point.loss, point.validationLoss])));
  const xAt = (epoch: number) => chart.left + (epoch / epochLimit) * (chart.width - chart.left - 4);
  const yAt = (loss: number) => chart.top + (1 - loss / maximum) * (chart.height - chart.top - chart.bottom);
  const pathFor = (field: "loss" | "validationLoss") => measurements.map((point, index) => `${index ? "L" : "M"}${xAt(point.epoch).toFixed(1)} ${yAt(point[field]).toFixed(1)}`).join(" ");
  const latest = measurements[measurements.length - 1];

  return (
    <svg
      className={compact ? "tr-chart tr-chart--compact" : "tr-chart"}
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      preserveAspectRatio={compact ? "none" : undefined}
      role="img"
      aria-label={latest ? `Measured loss: train ${latest.loss.toFixed(3)}, held-out validation ${latest.validationLoss.toFixed(3)}` : "Initializing measured loss chart"}
    >
      {!compact && (
        <g className="tr-chart__grid">
          {[0, maximum / 2, maximum].map((value) => (
            <g key={value}>
              <line x1={chart.left} x2={chart.width - 4} y1={yAt(value)} y2={yAt(value)} />
              <text x={chart.left - 6} y={yAt(value) + 3} textAnchor="end">{value.toFixed(1)}</text>
            </g>
          ))}
          {[0, 6, 12, 18, 24].map((epoch) => (
            <text key={epoch} x={xAt(epoch)} y={chart.height - 4} textAnchor="middle">e{epoch}</text>
          ))}
        </g>
      )}
      <path className="tr-chart__val" d={pathFor("validationLoss")} />
      <path className="tr-chart__train" d={pathFor("loss")} />
      {latest && !compact && <circle className="tr-chart__head" r={3.5} cx={xAt(latest.epoch)} cy={yAt(latest.loss)} />}
    </svg>
  );
}

function Cell({ id, code, run, selected, children }: { id: string; code: string; run?: CellRun; selected: boolean; children: ReactNode }) {
  const label = run ? (run.running ? "*" : String(run.order)) : " ";
  return (
    <section className="tr-cell" id={id} data-selected={selected || undefined} data-running={run?.running || undefined} aria-labelledby={`tr-${id}-heading`}>
      <div className="tr-cell__input">
        <span className="tr-prompt" aria-hidden="true">In [{label}]:</span>
        <pre className="tr-code"><code>{highlight(code)}</code></pre>
      </div>
      <div className="tr-cell__output">
        <span className="tr-prompt tr-prompt--out" aria-hidden="true">{run && !run.running ? `Out[${run.order}]:` : ""}</span>
        <div className="tr-out">{children}</div>
      </div>
    </section>
  );
}

function TrainingRunPage() {
  const reducedMotion = usePrefersReducedMotion();
  const runs = useCellRuns(reducedMotion);
  const selectedId = useScrollSpy(homeSectionIds, "intro");
  const noteDates = useResearchNoteDates();
  const runtime = useTinyModel();
  const completed = cells.filter((cell) => runs[cell.id] && !runs[cell.id].running);
  const epochs = runtime.latest?.epoch ?? 0;
  const loss = runtime.latest?.loss.toFixed(3) ?? "--";
  const measurements = runtime.snapshot?.measurements ?? [];
  const features = Array.from(new Set(
    cells.filter((cell) => runs[cell.id]).sort((a, b) => runs[a.id].order - runs[b.id].order).flatMap((cell) => cell.features)
  ));
  const saved = Boolean(runs.contact && !runs.contact.running);
  const status = runtime.status;

  return (
    <div className="tr">
      <a className="skip-link" href="#main">Skip to content</a>

      <aside className="tr-dash" aria-label="Training run">
        <div className="tr-dash__compact">
          <span className="tr-status" data-state={status}>{status}</span>
          <span className="tr-dash__stat">epoch <strong>{epochs}/{epochLimit}</strong></span>
          <span className="tr-dash__stat">loss <strong>{loss}</strong></span>
          <LossChart measurements={measurements} compact />
        </div>

        <div className="tr-dash__full">
          <div className="tr-dash__head">
            <p className="tr-dash__title">Training run</p>
            <span className="tr-status" data-state={status}>{status}</span>
          </div>
          <p className="tr-dash__run">Real next-token training on a fixed tiny corpus. Press Train in the first cell.</p>
          <LossChart measurements={measurements} />
          <p className="tr-legend"><span className="tr-legend__train">train</span><span className="tr-legend__val">val</span></p>
          <dl className="tr-metrics">
            <div><dt>epoch</dt><dd>{epochs}/{epochLimit}</dd></div>
            <div><dt>loss</dt><dd>{loss}</dd></div>
            <div><dt>val_loss</dt><dd>{runtime.latest?.validationLoss.toFixed(3) ?? "--"}</dd></div>
            <div><dt>lr</dt><dd>{learningRate.toExponential(1)}</dd></div>
            <div><dt>training targets seen</dt><dd>{runtime.latest?.tokens.toLocaleString("en-US") ?? "0"}</dd></div>
          </dl>
          <p className="tr-dash__label">Portfolio topics explored</p>
          <ul className="tr-features">
            {features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
          {saved && (
            <div className="tr-checkpoint">
              <p>
                {completed.length === cells.length
                  ? "Portfolio tour complete. Model training is independent of scrolling."
                  : `Read ${completed.length} of ${cells.length} portfolio sections. The training controls are in the first cell.`}
              </p>
              <a href={profileContent.resumeHref}>Download resume (PDF)</a>
            </div>
          )}
        </div>
      </aside>

      <main className="tr-notebook" id="main" tabIndex={-1}>
        <p className="tr-notebook__title"><span>agarwal-labs.ipynb</span><span>Notebook-style UI · JavaScript model worker</span></p>

        <Cell id="intro" code={cells[0].code} run={runs.intro} selected={selectedId === "intro"}>
          <div className="tr-hero">
            <img className="tr-avatar" src={profileContent.avatarUrl} alt="Sid Agarwal's GitHub avatar" width="64" height="64" />
            <div>
              <h1 id="tr-intro-heading">{profileContent.shortName}</h1>
              <p className="tr-role">{roleLine}</p>
              <p className="tr-location">Charlotte, North Carolina</p>
            </div>
          </div>
          <nav className="tr-actions" aria-label="Primary">
            <a href="#lab">Projects</a>
            <a href="#writing">Writing</a>
            <a href="#impact">About</a>
            <a className="tr-actions__resume" href={profileContent.resumeHref}>Resume</a>
            {emailLink && <a href={emailLink.href}>Email</a>}
          </nav>
          <div className="tr-intro"><IntroCopy /></div>
          <ModelControls runtime={runtime} />
        </Cell>

        <Cell id="lab" code={cells[1].code} run={runs.lab} selected={selectedId === "lab"}>
          <h2 id="tr-lab-heading">Selected projects</h2>
          <ol className="tr-df" start={0}>
            {viewProjects.map((project, index) => (
              <li key={project.href}>
                <span className="tr-df__index" aria-hidden="true">{index}</span>
                <div>
                  <div className="tr-df__head">
                    <a className="project-title" href={project.websiteHref ?? project.href}>{project.title}</a>
                    {project.websiteHref && <a className="project-github" href={project.href} aria-label={`${project.title} on GitHub`}>GitHub</a>}
                  </div>
                  <p>{project.description}</p>
                  <p className="tr-df__stack"><span>stack</span> {project.stack.join(" · ")}</p>
                </div>
              </li>
            ))}
          </ol>
          <details className="project-archive tr-archive">
            <summary>Earlier projects</summary>
            <ul>
              {courseworkProjects.map((project) => (
                <li key={project.href}><a href={project.href}>{project.title}</a><span className="project-archive__note"> &middot; {project.note}</span></li>
              ))}
              {earlierProjects.map((project) => <li key={project.slug}><a href={project.href}>{project.title}</a></li>)}
            </ul>
          </details>
          <a className="small-link" href="https://github.com/sidagarwal-labs?tab=repositories">All repositories on GitHub</a>
        </Cell>

        <Cell id="writing" code={cells[2].code} run={runs.writing} selected={selectedId === "writing"}>
          <h2 id="tr-writing-heading">Writing &amp; notes</h2>
          {marketTracker && (
            <p className="tr-lede">
              I follow the AI buildout: where the capital goes, what becomes a bottleneck,
              and which businesses turn that investment into earnings. My{" "}
              <a href={marketTracker.href}>AI / LLM Stack Tracker</a> maps public
              companies across chips, power, data centers, and applications.
            </p>
          )}
          <table className="tr-table">
            <thead><tr><th scope="col"><span className="sr-only">Row</span></th><th scope="col">title</th><th scope="col">updated</th></tr></thead>
            <tbody>
              {currentResearchNotes.map((note, index) => (
                <tr key={note.slug}>
                  <td className="tr-table__index">{index}</td>
                  <td><a href={note.href}>{note.title}</a></td>
                  <td className="tr-table__date"><time dateTime={noteDates[note.slug]}>{noteDateFormatter.format(new Date(noteDates[note.slug]))}</time></td>
                </tr>
              ))}
              {profileContent.writing.map((entry, index) => (
                <tr key={entry.slug}>
                  <td className="tr-table__index">{currentResearchNotes.length + index}</td>
                  <td><Link to={`/writing/${entry.slug}`}>{entry.title}</Link></td>
                  <td className="tr-table__date">{entry.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {earlierBuildoutEditions.length > 0 && (
            <details className="project-archive tr-archive">
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
        </Cell>

        <Cell id="impact" code={cells[3].code} run={runs.impact} selected={selectedId === "impact"}>
          <h2 id="tr-impact-heading">A little background</h2>
          <table className="tr-table tr-describe">
            <tbody>
              <tr><th scope="row">works</th><td>Microsoft · Senior PM, AI search &amp; retrieval</td></tr>
              <tr><th scope="row">career</th><td>Microsoft since 2021: PM intern → PM → PM II → Senior PM</td></tr>
              <tr><th scope="row">interned</th><td>Amazon · Product manager intern, Middle Mile driver safety (2020)</td></tr>
              <tr><th scope="row">studying</th><td>M.S. in Data Science and Business Analytics</td></tr>
              <tr><th scope="row">studied</th><td>Business and operations at UNC Charlotte, minor in economics</td></tr>
              <tr><th scope="row">led</th><td>Captained and mentored <Link to="/robotics">the Pitt Pirates, FRC Team 2642</Link></td></tr>
            </tbody>
          </table>
          <a className="small-link" href={profileContent.resumeHref}>Resume (PDF)</a>
        </Cell>

        <Cell id="library" code={cells[4].code} run={runs.library} selected={selectedId === "library"}>
          <h2 id="tr-library-heading">On my bookshelf</h2>
          <ul className="tr-books">
            {profileContent.books.map((book) => (
              <li key={book.slug}>
                <a href={book.href}>
                  <span className="tr-books__cover">
                    <img
                      src={book.cover}
                      alt=""
                      width="60"
                      height="90"
                      loading="lazy"
                      decoding="async"
                      onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                    />
                  </span>
                  <span className="tr-books__title">{book.title}</span>
                </a>
                <span className="tr-books__author">{book.author}</span>
              </li>
            ))}
          </ul>
        </Cell>

        <Cell id="contact" code={cells[5].code} run={runs.contact} selected={selectedId === "contact"}>
          <p className="tr-saved">Model weights stay in this tab. The resume below is a PDF, not a model checkpoint.</p>
          <h2 id="tr-contact-heading">Say hello</h2>
          <p>Always happy to talk about AI, products, markets, or a good book.</p>
          <div className="tr-contact">
            {contactLinks.map((social) => <a key={social.label} href={social.href}>{social.label}</a>)}
            <a href={profileContent.resumeHref}>Resume</a>
          </div>
        </Cell>

        <footer className="site-footer tr-footer">
          <span>Views are my own.</span>
          <a href="#intro">Back to top</a>
        </footer>
      </main>
    </div>
  );
}

export default TrainingRunPage;
