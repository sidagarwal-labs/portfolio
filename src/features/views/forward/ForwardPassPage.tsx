import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { courseworkProjects, currentResearchNotes, earlierBuildoutEditions } from "../../../content/journalContent";
import { profileContent } from "../../../content/siteContent";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import { useResearchNoteDates } from "../../../hooks/useResearchNoteDates";
import { useScrollSpy } from "../useScrollSpy";
import IntroCopy from "../IntroCopy";
import { useScrollProgress } from "../useScrollProgress";
import { attentionHeads, attentionRows, predict, tokenId } from "../model/tinyModel";
import { useTinyModel } from "../model/useTinyModel";
import ModelControls from "../model/ModelControls";
import {
  backgroundStream, contactLinks, earlierProjects, emailLink, marketTracker,
  noteDateFormatter, projectConcepts, roleLine, viewProjects
} from "../viewData";
import "./forward.css";

const PretrainedAttention = lazy(() => import("../model/pretrained/PretrainedAttention"));

const layers = [
  { id: "intro", op: "Tokenize", label: "Who I am" },
  { id: "lab", op: "Multi-head attention", label: "Projects" },
  { id: "writing", op: "Feed-forward", label: "Writing" },
  { id: "impact", op: "Residual stream", label: "Background" },
  { id: "library", op: "Context window", label: "Bookshelf" },
  { id: "pretrained", op: "Pretrained weights", label: "Real model" },
  { id: "contact", op: "Next token", label: "Say hello" }
];
const sectionIds = layers.map((layer) => layer.id);

const tokenTexts = ["Senior", "Product", "Manager", "AI", "search", "&", "retrieval", "at", "Microsoft"];

function softmax(values: number[]) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function hash(text: string, modulo: number) {
  return [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % modulo, 7);
}

const weightStyle = (weight: number) => ({ "--w": weight.toFixed(3) }) as CSSProperties;

function TokenAttention({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const runtime = useTinyModel();
  const [focus, setFocus] = useState(6);
  const [touched, setTouched] = useState(false);
  const [head, setHead] = useState<number>();

  useEffect(() => {
    if (touched || reducedMotion) return;
    const timer = window.setInterval(() => setFocus((value) => (value + 1) % tokenTexts.length), 2400);
    return () => window.clearInterval(timer);
  }, [touched, reducedMotion]);

  function select(index: number) {
    setTouched(true);
    setFocus(index);
  }

  if (!runtime.snapshot) return <div className="fp-attention"><ModelControls runtime={runtime} />{actions}{children}</div>;
  const model = runtime.snapshot.model;
  const tokens = tokenTexts.map((text) => ({ text, id: tokenId(model, text) }));
  const attention = attentionRows(model, tokenTexts, head);
  const weights = attention[focus];
  const strongest = focus === 0 ? -1 : weights.slice(0, focus).reduce((best, weight, index) => (weight > weights[best] ? index : best), 0);
  const predictions = predict(model, tokens.slice(0, focus + 1).map((token) => token.id)).distribution
    .map((probability, id) => ({ word: model.vocabulary[id] === "<unk>" ? "rare word" : model.vocabulary[id], probability }))
    .sort((a, b) => b.probability - a.probability).slice(0, 3);

  return (
    <div className="fp-attention">
      <ModelControls runtime={runtime} />
      <div className="fp-sequence" role="group" aria-label="My role as a token sequence; choose a token to see what it attends to">
        {tokens.map((token, index) => {
          const weight = index <= focus ? weights[index] : 0;
          return (
            <button
              key={token.text}
              type="button"
              className="fp-token"
              aria-pressed={index === focus}
              data-masked={index > focus || undefined}
              data-strong={index === strongest || undefined}
              style={weightStyle(weight)}
              onPointerEnter={(event) => { if (event.pointerType === "mouse") select(index); }}
              onFocus={() => select(index)}
              onClick={() => select(index)}
            >
              <span className="fp-token__text">{token.text}</span>
              <span className="fp-token__id" aria-hidden="true">{token.id}</span>
            </button>
          );
        })}
      </div>
      <div className="fp-heads fp-heads--model" role="group" aria-label="Model attention head">
        <span className="fp-heads__label">Head</span>
        {[undefined, ...Array.from({ length: attentionHeads }, (_, index) => index)].map((option) => (
          <button key={option ?? "average"} type="button" aria-pressed={head === option} onClick={() => setHead(option)}>
            {option === undefined ? "Average" : `Head ${option + 1}`}
          </button>
        ))}
      </div>
      <p className="fp-caption" aria-live={touched ? "polite" : "off"}>
        {strongest < 0
          ? <>&ldquo;{tokens[focus].text}&rdquo; comes first, so it can only attend to itself.</>
          : <>Looking back from &ldquo;{tokens[focus].text}&rdquo;, {head === undefined ? "averaged over both heads, " : `in head ${head + 1}, `}the strongest link is &ldquo;{tokens[strongest].text}&rdquo; ({weights[strongest].toFixed(2)}).</>}
        {" "}<span className="fp-caption__note">{runtime.latest?.epoch ? "Learned" : "Seeded, untrained"} embeddings, causal mask, real vocabulary IDs. These weights are not an explanation of a production LLM.</span>
      </p>
      <p className="fp-caption__note fp-predictions">Next-word predictions for this prefix: {predictions.map(({ word, probability }) => `${word} ${(probability * 100).toFixed(1)}%`).join(" · ")}</p>
      {actions}

      <div className="fp-attention__body">
      <div className="fp-matrix" aria-hidden="true">
        <span className="fp-matrix__corner">query ↓ key →</span>
        {tokens.map((token) => <span className="fp-matrix__key" key={token.text}><span>{token.text}</span></span>)}
        {tokens.map((query, row) => (
          <div className="fp-matrix__row" key={query.text} data-active={row === focus || undefined} onMouseEnter={() => select(row)}>
            <span className="fp-matrix__query">{query.text}</span>
            {tokens.map((key, column) => (
              <span
                key={key.text}
                className="fp-matrix__cell"
                data-masked={column > row || undefined}
                style={weightStyle(column <= row ? attention[row][column] : 0)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="fp-intro">{children}</div>
      </div>
    </div>
  );
}

function AttentionProjects() {
  const [head, setHead] = useState<string | null>(null);
  const weights = head
    ? softmax(viewProjects.map((project) => (project.concepts.includes(head) ? 3 : 0)))
    : viewProjects.map(() => 1 / viewProjects.length);
  const matches = head ? viewProjects.filter((project) => project.concepts.includes(head)) : [];
  const share = head ? viewProjects.reduce((sum, project, index) => sum + (project.concepts.includes(head) ? weights[index] : 0), 0) : 1;

  return (
    <>
      <div className="fp-heads" role="group" aria-label="Attention head">
        <span className="fp-heads__label">Attention head</span>
        <button type="button" aria-pressed={head === null} onClick={() => setHead(null)}>All</button>
        {projectConcepts.map((concept) => (
          <button key={concept} type="button" aria-pressed={head === concept} onClick={() => setHead(concept)}>{concept}</button>
        ))}
      </div>
      <p className="fp-heads__status" aria-live="polite">
        {head
          ? `The “${head}” head puts ${share.toFixed(2)} of its weight on ${matches.length} ${matches.length === 1 ? "project" : "projects"}.`
          : "Uniform attention across selected projects. Pick a head to focus it."}
        {" "}Tag-based spotlight, not the language model.
      </p>
      <ol className="fp-projects">
        {viewProjects.map((project, index) => (
          <li
            key={project.href}
            className="fp-project"
            data-dim={(head !== null && !project.concepts.includes(head)) || undefined}
            style={weightStyle(weights[index])}
          >
            <span className="fp-project__bar" aria-hidden="true"><span /></span>
            <div className="fp-project__body">
              <div className="fp-project__head">
                <a className="project-title" href={project.websiteHref ?? project.href}>{project.title}</a>
                {project.websiteHref && (
                  <a className="project-github" href={project.href} aria-label={`${project.title} on GitHub`}>GitHub</a>
                )}
                {head && <span className="fp-project__weight"><span className="sr-only">Attention weight </span>{weights[index].toFixed(2)}</span>}
              </div>
              <p>{project.description}</p>
              <ul className="fp-chips" aria-label={`${project.title} stack`}>
                {project.stack.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function ActivationStrip({ seed }: { seed: string }) {
  return (
    <span className="fp-activation" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} style={weightStyle(0.12 + (hash(`${seed}${index}`, 97) / 97) * 0.88)} />
      ))}
    </span>
  );
}

function ContextWindow() {
  const books = profileContent.books;
  const [active, setActive] = useState(0);
  const book = books[active];

  return (
    <div className="fp-context">
      <div className="fp-context__meter" style={{ "--n": books.length } as CSSProperties}>
        <span className="fp-context__fill" aria-hidden="true" />
        <span className="fp-context__count">{books.length} / {books.length} books in context</span>
      </div>
      <ol className="fp-books">
        {books.map((entry, index) => (
          <li key={entry.slug} data-active={index === active || undefined}>
            <a href={entry.href} onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)}>
              <span className="fp-books__cover">
                <img
                  className="fp-books__image"
                  src={entry.cover}
                  alt=""
                  width="68"
                  height="100"
                  loading="lazy"
                  decoding="async"
                  onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                />
              </span>
              <span className="fp-books__title">{entry.title}</span>
              <span className="fp-books__author">{entry.author}</span>
            </a>
          </li>
        ))}
      </ol>
      {book && (
        <p className="fp-context__note">
          <span className="fp-mono">attending to</span> <strong>{book.title}</strong>: {book.note}
        </p>
      )}
    </div>
  );
}

const nextTokens = [
  { label: "Email", href: emailLink?.href ?? "mailto:sid@agarwal-labs.com", logit: 2.2 },
  ...contactLinks.filter((link) => link.label !== "Email").map((link, index) => ({ label: link.label, href: link.href, logit: 1.6 - index * 0.6 })),
  { label: "Resume", href: profileContent.resumeHref, logit: 0.6 }
];

function NextToken() {
  const [temperature, setTemperature] = useState(1);
  const [sampled, setSampled] = useState<number | null>(null);
  const probabilities = softmax(nextTokens.map((token) => token.logit / temperature));

  function sample() {
    let remaining = Math.random();
    const index = probabilities.findIndex((probability) => (remaining -= probability) <= 0);
    setSampled(index < 0 ? probabilities.length - 1 : index);
  }

  return (
    <div className="fp-next">
      <p className="fp-next__prompt fp-mono">p( next | &ldquo;you read this far&rdquo; )</p>
      <p className="fp-caption__note">Illustrative contact-link sampler with hand-set scores, separate from the language models above.</p>
      <ol className="fp-logits">
        {nextTokens.map((token, index) => (
          <li key={token.label} data-sampled={sampled === index || undefined} style={weightStyle(probabilities[index])}>
            <a href={token.href}>{token.label}</a>
            <span className="fp-logits__bar" aria-hidden="true"><span /></span>
            <span className="fp-logits__p fp-mono">{probabilities[index].toFixed(2)}</span>
          </li>
        ))}
      </ol>
      <div className="fp-next__controls">
        <label className="fp-temperature">
          <span className="fp-mono">temperature</span>
          <input type="range" min="0.2" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
          <output className="fp-mono">{temperature.toFixed(1)}</output>
        </label>
        <button type="button" className="fp-button" onClick={sample}>Sample</button>
      </div>
      <p className="fp-next__result" aria-live="polite">
        {sampled !== null && <>Sampled &ldquo;{nextTokens[sampled].label}&rdquo;. It&rsquo;s a real link, go ahead.</>}
      </p>
    </div>
  );
}

function PretrainedSection() {
  const [loaded, setLoaded] = useState(false);
  return loaded ? (
    <Suspense fallback={<p className="fp-caption__note" role="status">Loading the model viewer...</p>}>
      <PretrainedAttention />
    </Suspense>
  ) : (
    <>
      <p className="fp-lede">
        The mini model above learns from this page. This one is Andrej Karpathy&rsquo;s{" "}
        <a href="https://huggingface.co/karpathy/tinyllamas/tree/main/stories260K">stories260K</a>: a 260,032-parameter
        Llama 2 style model (5 layers, 8 query heads sharing 4 key/value heads) pretrained on simple children&rsquo;s stories.
        A TypeScript port of <a href="https://github.com/karpathy/llama2.c">llama2.c</a> runs it in your browser, so every
        attention map and probability is computed live.
      </p>
      <button type="button" className="fp-button" onClick={() => setLoaded(true)}>Load stories260K (1.06 MB)</button>
    </>
  );
}

function ForwardPassPage() {
  const activeId = useScrollSpy(sectionIds, "intro");
  const progress = useScrollProgress();
  const noteDates = useResearchNoteDates();
  const activeIndex = Math.max(0, layers.findIndex((layer) => layer.id === activeId));

  return (
    <div className="fp">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="fp-progress" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />

      <nav className="fp-rail" aria-label="Sections">
        <p className="fp-rail__title fp-mono">Forward pass</p>
        <ol style={{ "--p": progress } as CSSProperties}>
          {layers.map((layer, index) => (
            <li key={layer.id} data-state={index < activeIndex ? "done" : index === activeIndex ? "active" : undefined}>
              <a href={`#${layer.id}`} aria-current={index === activeIndex ? "true" : undefined}>
                <span className="fp-rail__op fp-mono">{String(index).padStart(2, "0")} {layer.op}</span>
                <span className="fp-rail__label">{layer.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="fp-page">
        <header className="fp-hero" id="intro">
          <p className="fp-kicker fp-mono">Layer 00 · Tokenize</p>
          <div className="fp-hero__identity">
            <img className="fp-avatar" src={profileContent.avatarUrl} alt="Sid Agarwal's GitHub avatar" width="72" height="72" />
            <div>
              <h1>{profileContent.shortName}</h1>
              <p className="sr-only">{roleLine}</p>
              <p className="fp-location">Charlotte, North Carolina</p>
            </div>
          </div>
          <TokenAttention
            actions={(
              <nav className="fp-actions" aria-label="Primary">
                <a href="#lab">Projects</a>
                <a href="#writing">Writing</a>
                <a href="#impact">About</a>
                <a className="fp-actions__resume" href={profileContent.resumeHref}>Resume</a>
                {emailLink && <a href={emailLink.href}>Email</a>}
              </nav>
            )}
          >
            <IntroCopy />
          </TokenAttention>
        </header>

        <main id="main" tabIndex={-1}>
          <section className="fp-section" id="lab" aria-labelledby="fp-projects-heading">
            <p className="fp-kicker fp-mono">Layer 01 · Multi-head attention</p>
            <h2 id="fp-projects-heading">Selected projects</h2>
            <AttentionProjects />
            <details className="project-archive fp-archive">
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

          <section className="fp-section" id="writing" aria-labelledby="fp-writing-heading">
            <p className="fp-kicker fp-mono">Layer 02 · Feed-forward</p>
            <h2 id="fp-writing-heading">Writing &amp; notes</h2>
            {marketTracker?.href && (
              <p className="fp-lede">
                I follow the AI buildout: where the capital goes, what becomes a bottleneck,
                and which businesses turn that investment into earnings. My{" "}
                <Link to={marketTracker.href}>AI / LLM Stack Tracker</Link> maps public
                companies across chips, power, data centers, and applications.
              </p>
            )}
            <ul className="fp-notes">
              {currentResearchNotes.map((note) => (
                <li key={note.slug}>
                  <ActivationStrip seed={note.slug} />
                  <a href={note.href}>{note.title}</a>
                  <time className="entry-meta" dateTime={noteDates[note.slug]}>{noteDateFormatter.format(new Date(noteDates[note.slug]))}</time>
                </li>
              ))}
              {profileContent.writing.map((entry) => (
                <li key={entry.slug}>
                  <ActivationStrip seed={entry.slug} />
                  <Link to={`/writing/${entry.slug}`}>{entry.title}</Link>
                  <span className="entry-meta">{entry.date}</span>
                </li>
              ))}
            </ul>
            {earlierBuildoutEditions.length > 0 && (
              <details className="project-archive fp-archive">
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

          <section className="fp-section" id="impact" aria-labelledby="fp-about-heading">
            <p className="fp-kicker fp-mono">Layer 03 · Residual stream</p>
            <h2 id="fp-about-heading">A little background</h2>
            <p className="fp-lede">Each step added to the stream; none of it was overwritten.</p>
            <ol className="fp-stream">
              {backgroundStream.map((item) => (
                <li key={item.label}>
                  <span className="fp-stream__add" aria-hidden="true">+</span>
                  <strong>{item.to ? <Link to={item.to}>{item.label}</Link> : item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ol>
            <a className="small-link" href={profileContent.resumeHref}>Resume (PDF)</a>
          </section>

          <section className="fp-section" id="library" aria-labelledby="fp-reading-heading">
            <p className="fp-kicker fp-mono">Layer 04 · Context window</p>
            <h2 id="fp-reading-heading">On my bookshelf</h2>
            <ContextWindow />
          </section>

          <section className="fp-section fp-pretrained" id="pretrained" aria-labelledby="fp-pretrained-heading">
            <p className="fp-kicker fp-mono">Layer 05 · Pretrained weights</p>
            <h2 id="fp-pretrained-heading">A real pretrained transformer</h2>
            <PretrainedSection />
          </section>

          <section className="fp-section fp-contact" id="contact" aria-labelledby="fp-contact-heading">
            <p className="fp-kicker fp-mono">Layer 06 · Next token</p>
            <h2 id="fp-contact-heading">Say hello</h2>
            <p>Always happy to talk about AI, products, markets, or a good book.</p>
            <NextToken />
          </section>
        </main>

        <footer className="site-footer fp-footer">
          <span>Views are my own.</span>
          <a href="#intro">Back to top</a>
        </footer>
      </div>
    </div>
  );
}

export default ForwardPassPage;
