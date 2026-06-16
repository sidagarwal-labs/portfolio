import { Canvas } from "@react-three/fiber";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import SiteNavigation from "../../components/SiteNavigation";
import ProjectVisual from "../../components/ProjectVisual";
import { profileContent } from "../../content/siteContent";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { usePageReveal } from "../../hooks/usePageReveal";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useSectionSpy } from "../../hooks/useSectionSpy";
import { useLiveTickerData } from "../../hooks/useLiveTickerData";
import KnowledgeOrbitScene from "./KnowledgeOrbitScene";

const sectionOrder = profileContent.sceneSections.map((section) => section.id);

function HomePage() {
  const location = useLocation();
  const isReady = usePageReveal();
  const prefersReducedMotion = usePrefersReducedMotion();
  const isCompactViewport = useMediaQuery("(max-width: 900px)");
  const useStaticScene = prefersReducedMotion || isCompactViewport;
  const spiedSectionId = useSectionSpy(sectionOrder, sectionOrder[0]);
  const [activeSectionId, setActiveSectionId] = useState(sectionOrder[0]);
  const deferredSectionId = useDeferredValue(activeSectionId);
  const lockedTargetRef = useRef<string | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Don't let the scroll spy override the 3D camera during a nav-click transition
    if (lockedTargetRef.current) return;
    setActiveSectionId(spiedSectionId);
  }, [spiedSectionId]);

  /* Keep the URL hash in sync with the scroll-spy so the nav highlights correctly */
  useEffect(() => {
    if (spiedSectionId === sectionOrder[0]) {
      const clean = window.location.pathname + window.location.search;
      if (window.location.hash) window.history.replaceState(null, "", clean);
    } else {
      const target = `${window.location.pathname}${window.location.search}#${spiedSectionId}`;
      if (window.location.hash !== `#${spiedSectionId}`) window.history.replaceState(null, "", target);
    }
  }, [spiedSectionId]);

  const activeSection = useMemo(
    () => profileContent.sceneSections.find((section) => section.id === deferredSectionId) ?? profileContent.sceneSections[0],
    [deferredSectionId]
  );

  const activeSectionIndex = sectionOrder.indexOf(activeSection.id);
  const nextSectionId = activeSectionIndex >= 0 && activeSectionIndex < sectionOrder.length - 1 ? sectionOrder[activeSectionIndex + 1] : sectionOrder[0];
  const isAtLastSection = activeSectionIndex === sectionOrder.length - 1;

  /* ── Book carousel infinite-loop logic ── */
  const bookRailRef = useRef<HTMLDivElement>(null);
  const bookCount = profileContent.books.length;
  const tripleBooks = useMemo(
    () => [...profileContent.books, ...profileContent.books, ...profileContent.books],
    []
  );

  /* After mount, jump to the middle copy so we can scroll in both directions */
  useEffect(() => {
    const rail = bookRailRef.current;
    if (!rail) return;
    const cardWidth = rail.scrollWidth / 3;
    rail.scrollLeft = cardWidth;
  }, []);

  const scrollCarousel = useCallback((direction: 1 | -1) => {
    const rail = bookRailRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * 260, behavior: "smooth" });
  }, []);

  /* When scroll settles near a boundary, silently jump to the middle copy */
  useEffect(() => {
    const rail = bookRailRef.current;
    if (!rail) return;
    let timer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const oneThird = rail.scrollWidth / 3;
        if (rail.scrollLeft < oneThird * 0.15) {
          rail.style.scrollBehavior = "auto";
          rail.scrollLeft += oneThird;
          rail.style.scrollBehavior = "";
        } else if (rail.scrollLeft > oneThird * 1.85) {
          rail.style.scrollBehavior = "auto";
          rail.scrollLeft -= oneThird;
          rail.style.scrollBehavior = "";
        }
      }, 120);
    };
    rail.addEventListener("scroll", handleScroll, { passive: true });
    return () => { clearTimeout(timer); rail.removeEventListener("scroll", handleScroll); };
  }, []);

  function getHeaderOffset() {
    const navElement = document.querySelector<HTMLElement>(".site-nav-shell");
    return navElement ? navElement.getBoundingClientRect().height + 18 : 110;
  }

  function updateHash(targetId: string) {
    const nextUrl = targetId === sectionOrder[0] ? window.location.pathname + window.location.search : `${window.location.pathname}${window.location.search}#${targetId}`;
    window.history.replaceState(null, "", nextUrl);
  }

  function scrollToSection(targetId: string, behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth") {
    // Lock the 3D camera to the target immediately — prevents scroll spy
    // from causing intermediate section chasing during smooth scroll
    lockedTargetRef.current = targetId;
    setActiveSectionId(targetId);
    clearTimeout(lockTimeoutRef.current);
    lockTimeoutRef.current = setTimeout(() => { lockedTargetRef.current = null; }, 1800);

    if (targetId === sectionOrder[0]) {
      updateHash(targetId);
      window.scrollTo({ top: 0, behavior });
      return;
    }

    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }

    updateHash(targetId);
    const top = Math.max(0, window.scrollY + element.getBoundingClientRect().top - getHeaderOffset());
    window.scrollTo({ top, behavior });
  }

  useLayoutEffect(() => {
    const targetId = location.hash.replace("#", "");
    if (!targetId) {
      return;
    }

    if (sectionOrder.includes(targetId)) {
      setActiveSectionId(targetId);
    }

    window.requestAnimationFrame(() => scrollToSection(targetId, "auto"));
  }, [location.hash]);

  const featuredProjects = [
    ...profileContent.projects.filter((project) => project.focusArea === "Data science" || project.focusArea === "Analytics"),
    ...profileContent.projects.filter((project) => project.focusArea !== "Data science" && project.focusArea !== "Analytics")
  ].slice(0, 4);

  const stackTracker = useMemo(
    () => profileContent.projects.find((project) => project.slug === "ai-llm-stack-tracker"),
    []
  );

  const projectDepthHighlights = [
    {
      label: "Applied ML stack",
      value: "LightGBM + XGBoost + SHAP",
      detail: "Class weights, undersampling, SMOTE, RandomizedSearchCV, and explainability are all visible in the notebook flow.",
      tone: "positive" as const
    },
    {
      label: "Yelp model result",
      value: "Accuracy 0.7572 / F1 0.7885",
      detail: "Logistic baseline with precision and recall reporting plus feature-sign interpretation against 5,744 restaurant rows.",
      tone: "neutral" as const
    },
    {
      label: "Learning signal",
      value: "Model choice follows risk",
      detail: "Evaluation is framed around false-positive and false-negative tradeoffs instead of one vanity metric.",
      tone: "caution" as const
    }
  ];

  const frontierWatch = ["Starship reusable cadence", "GPU compute scaling", "LLM inference cost curve", "Autonomous systems TAM"];

  const tickerItems = useLiveTickerData();

  return (
    <div className={isReady ? "page-shell page-shell--ready home-page" : "page-shell page-shell--entering home-page"} data-env={activeSection.id}>
      {useStaticScene ? (
        <div className="scene-static scene-static--home" aria-hidden="true" data-env={activeSection.id}>
          <div className="scene-static__gradient" />
          <div className="scene-static__grid" />
          <div className="scene-static__glow scene-static__glow--left" />
          <div className="scene-static__glow scene-static__glow--right" />
          <div className="scene-static__code-rain" />
          <div className="scene-static__scatter" />
        </div>
      ) : (
        <div className="scene-canvas" aria-hidden="true">
          <Canvas camera={{ position: [0, 6, 14], fov: 50 }} dpr={[1, 1.6]}>
            <KnowledgeOrbitScene
              sections={profileContent.sceneSections}
              activeSectionId={activeSection.id}
              onSectionChange={(sectionId) => {
                setActiveSectionId(sectionId);
                scrollToSection(sectionId);
              }}
              reducedMotion={prefersReducedMotion}
            />
          </Canvas>
        </div>
      )}

      <SiteNavigation />

      <main className="content-shell home-shell">
        <section id="intro" className="hero-panel">
          <div className="hero-panel__left">
            <div className="hero-panel__copy glass-card glass-card--hero">
              <span className="section-heading__eyebrow">Mission control / AI search / markets / data science</span>
              <h1>{profileContent.shortName}</h1>
              <p className="hero-panel__summary">{profileContent.heroSummary}</p>

              <div className="social-strip" aria-label="External links">
                {profileContent.socials.map((social) => (
                  <a key={social.label} href={social.href} target={social.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                    <span>{social.shortLabel}</span>
                    <strong>{social.label}</strong>
                  </a>
                ))}
              </div>
            </div>

            <div className="hero-bullets-grid">
              <div className="hero-bullet-tile glass-card">
                <p>{profileContent.heroBullets[0]}</p>
              </div>
              <div className="hero-bullet-tile glass-card">
                <p>{profileContent.heroBullets[3]}</p>
              </div>
            </div>
          </div>

          <div className="hero-panel__aside">
            <div className="hero-portrait-card glass-card">
              <img src={profileContent.avatarUrl} alt="Sid Agarwal GitHub avatar" className="hero-portrait-card__image" />
              <div>
                <p>Working at the retrieval-quality layer where product, ranking systems, and evaluation telemetry all have to agree.</p>
              </div>
            </div>

            <div className="metric-grid">
              {profileContent.heroStats.map((metric) => (
                <article key={metric.label} className="metric-card glass-card">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.detail}</p>
                </article>
              ))}
            </div>

            <div className="hero-bullets-grid">
              <div className="hero-bullet-tile glass-card">
                <p>{profileContent.heroBullets[1]}</p>
              </div>
              <div className="hero-bullet-tile glass-card">
                <p>{profileContent.heroBullets[2]}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="leaving-section" aria-hidden="true">
          <span className="leaving-section__label">Leaving Earth</span>
        </div>

        <section id="impact" className="content-section glass-card">
          <div className="section-header">
            <span className="section-heading__eyebrow">Experience — Moon base</span>
            <h2>Microsoft, Amazon, and FIRST Robotics — building systems that work</h2>
            <p>
              The profile is strongest as a hybrid: business and operations foundations, enterprise PM work in AI search,
              plus a continuing technical layer through data science coursework and public project work.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card feature-card--highlight">
              <h3>Microsoft</h3>
              <span className="feature-card__timeframe">2021 – Present</span>
              <p>PM Intern → PM I → PM II → Senior PM across Search Relevance, M365 Chat, and Copilot-grounded retrieval.</p>
              <ul className="feature-card__roles">
                <li>
                  <strong>Senior Product Manager · M365 Copilot — Quality &amp; Relevance</strong>
                  <span className="feature-card__role-timeframe">Mar 2026 – Present</span>
                  <span className="feature-card__role-desc">Driving retrieval quality for Files and Connectors. Focused on delivering a personalized, org-wide search experience.</span>
                </li>
                <li>
                  <strong>Product Manager II · M365 Copilot — Quality &amp; Relevance</strong>
                  <span className="feature-card__role-timeframe">Aug 2023 – Mar 2026</span>
                  <span className="feature-card__role-desc">Driving retrieval quality for Copilot Connectors.</span>
                  <span className="feature-card__role-launches">
                    <a href="https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-copilot-connector" target="_blank" rel="noopener noreferrer">Microsoft 365 Copilot Connectors Overview ↗</a>
                  </span>
                </li>
                <li>
                  <strong>Product Manager · Microsoft Search Relevance</strong>
                  <span className="feature-card__role-timeframe">Sep 2021 – Aug 2023</span>
                  <span className="feature-card__role-desc">Enabled Power BI and Viva Engage as content sources in Copilot and M365 Search.</span>
                  <span className="feature-card__role-launches">
                    <a href="https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction" target="_blank" rel="noopener noreferrer">Overview of Copilot for Power BI ↗</a>
                    <a href="https://techcommunity.microsoft.com/blog/viva_engage_blog/viva-engage-public-content-is-now-available-in-microsoft-365-copilot/4443512" target="_blank" rel="noopener noreferrer">Viva Engage in Microsoft 365 Copilot ↗</a>
                  </span>
                </li>
                <li>
                  <strong>Product Manager Intern · Microsoft Search Relevance</strong>
                  <span className="feature-card__role-timeframe">May 2021 – Sep 2021</span>
                  <span className="feature-card__role-desc">Leveraging NL to turn user input into structured + keyword queries for indexing and search.</span>
                </li>
              </ul>
            </article>
            <article className="feature-card">
              <h3>Amazon</h3>
              <p>PM Intern in Middle Mile logistics. Designed severe-weather alert system, analyzed safety data, and built SOPs for driver and carrier workflows.</p>
            </article>
            <article className="feature-card">
              <h3>FIRST Robotics</h3>
              <p>FRC Team 2642 Pitt Pirates — captained and mentored the team through competition seasons, building execution skills under ambiguity and time pressure.</p>
            </article>
            <article className="feature-card">
              <h3>Community Leadership</h3>
              <p>Co-founded Hult Prize and Consult-your-Community chapters at UNCC, and helped pass a sidewalk safety ordinance through youth council work.</p>
            </article>
          </div>
        </section>

        <div className="leaving-section" aria-hidden="true">
          <span className="leaving-section__label">Leaving the Moon</span>
        </div>

        <section id="lab" className="content-section glass-card">
          <div className="section-header">
            <span className="section-heading__eyebrow">Project lab</span>
            <h2>Notebook-driven work that backs up the systems narrative</h2>
            <p>
              The GitHub layer now leans harder toward data-science evidence: modeling workflows, notebooks, dashboards, and one systems-visualization repo that makes the technical depth easy to scan.
            </p>
          </div>

          {stackTracker ? (
            <a className="feature-pill" href={stackTracker.href} target="_blank" rel="noreferrer">
              <span className="feature-pill__badge">Live</span>
              <span className="feature-pill__text">
                <strong>{stackTracker.title}</strong>
                <span>Market map of the AI supply chain, from chips to applications.</span>
              </span>
              <span className="feature-pill__arrow" aria-hidden="true">↗</span>
            </a>
          ) : null}

          <div className="signal-board signal-board--compact">
            {projectDepthHighlights.map((item) => (
              <article key={item.label} className={`signal-board__item signal-board__item--${item.tone}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="mini-project-grid">
            {featuredProjects.map((project) => (
              <a
                key={project.slug}
                className="mini-project-card"
                href={project.href}
                target="_blank"
                rel="noreferrer"
              >
                <ProjectVisual
                  title={project.title}
                  stack={project.stack}
                  accent={project.accent}
                  visualMode={project.visualMode}
                  archetype={project.archetype}
                />
                <div className="mini-project-card__body">
                  <span>{`${project.focusArea} · ${project.category}`}</span>
                  <p>{project.whatThisProves}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        <div className="leaving-section" aria-hidden="true">
          <span className="leaving-section__label">Leaving Mars</span>
        </div>

        <section id="library" className="content-section glass-card">
          <div className="section-header">
            <span className="section-heading__eyebrow">Books — Spaceship cockpit</span>
            <h2>Reading from the cockpit between destinations</h2>
            <p>
              The quieter layer of the portfolio is still useful: frontier-tech curiosity, market signals, and direct contact if the mix of product judgment and technical depth fits.
            </p>
          </div>

          <div className="tag-row">
            {frontierWatch.map((topic) => (
              <span key={topic}>{topic}</span>
            ))}
          </div>

          <div className="book-carousel">
            <button type="button" className="book-carousel__arrow book-carousel__arrow--left" aria-label="Scroll books left" onClick={() => scrollCarousel(-1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="book-carousel__rail" ref={bookRailRef}>
              {tripleBooks.map((book, i) => (
                <a key={`${book.slug}-${i}`} className="book-carousel__card" href={book.href} target="_blank" rel="noreferrer">
                  <img src={book.cover} alt={book.title} loading="lazy" />
                  <span className="book-carousel__title">{book.title}</span>
                </a>
              ))}
            </div>
            <button type="button" className="book-carousel__arrow book-carousel__arrow--right" aria-label="Scroll books right" onClick={() => scrollCarousel(1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </section>

        <div className="leaving-section" aria-hidden="true">
          <span className="leaving-section__label">Leaving the Spaceship</span>
        </div>

        <section id="contact" className="content-section glass-card">
          <div className="section-header">
            <span className="section-heading__eyebrow">Contact — ISS orbit</span>
            <h2>Dock at the station and reach out directly</h2>
            <p>Email is the fastest route. Resume, GitHub, and LinkedIn are all one click away if this mix of product judgment and technical depth is useful.</p>
          </div>

          <div className="social-strip social-strip--compact" aria-label="Contact and social links">
            {profileContent.socials.map((social) => (
              <a key={social.label} href={social.href} target={social.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                <span>{social.shortLabel}</span>
                <strong>{social.label}</strong>
              </a>
            ))}
          </div>
        </section>
      </main>

      <button
        type="button"
        className={isAtLastSection ? "section-advance section-advance--return" : "section-advance"}
        aria-label={isAtLastSection ? "Return to top of page" : `Go to ${nextSectionId}`}
        onClick={() => scrollToSection(nextSectionId)}
      >
        <span>{isAtLastSection ? "Back to top" : `Next zone`}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 6v12M12 18l-5-5M12 18l5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="stock-ticker" aria-hidden="true">
        <div className="stock-ticker__track">
          {[...tickerItems, ...tickerItems].map((item, i) =>
            item.href ? (
              <a key={i} className={`stock-ticker__item stock-ticker__item--${item.variant}`} href={item.href} target="_blank" rel="noreferrer">
                {item.symbol} <strong>{item.value}</strong>
              </a>
            ) : (
              <span key={i} className={`stock-ticker__item stock-ticker__item--${item.variant}`}>
                {item.symbol} <strong>{item.value}</strong>
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
