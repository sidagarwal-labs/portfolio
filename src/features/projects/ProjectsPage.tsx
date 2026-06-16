import { useEffect, useMemo, useState } from "react";
import PageFrame from "../../components/PageFrame";
import ProjectVisual from "../../components/ProjectVisual";
import { profileContent } from "../../content/siteContent";

function ProjectsPage() {
  const projectSummary = useMemo(() => {
    const dataScienceProjects = profileContent.projects.filter((project) => project.focusArea === "Data science");
    const analyticsProjects = profileContent.projects.filter((project) => project.focusArea === "Analytics" || project.focusArea === "Visualization");
    const modelSurface = new Set(dataScienceProjects.flatMap((project) => project.comparisonChips));

    return [
      {
        label: "Notebook-led repos",
        value: `${dataScienceProjects.length}`,
        detail: "Applied ML, Yelp analysis, and Intro to Modeling carry the strongest notebook surface.",
        tone: "positive" as const
      },
      {
        label: "Model + method surface",
        value: `${modelSurface.size}+`,
        detail: "Supervised, unsupervised, NLP, forecasting, dimensionality reduction, and interpretability all show up.",
        tone: "neutral" as const
      },
      {
        label: "Decision surfaces",
        value: `${analyticsProjects.length + 2}`,
        detail: "Dashboards, systems maps, and AI case studies make the work easier to scan for recruiters.",
        tone: "positive" as const
      }
    ];
  }, []);

  const focusAreas = useMemo(
    () => ["All", "Data science", "Analytics", "AI product systems", "Visualization"].filter(
      (focusArea) => focusArea === "All" || profileContent.projects.some((project) => project.focusArea === focusArea)
    ),
    []
  );
  const [activeFocus, setActiveFocus] = useState(focusAreas[1] ?? "All");

  const filteredProjects = useMemo(
    () => (activeFocus === "All" ? profileContent.projects : profileContent.projects.filter((project) => project.focusArea === activeFocus)),
    [activeFocus]
  );

  const defaultSpotlightSlug = useMemo(() => {
    const defaultProject = filteredProjects[0];
    return defaultProject?.slug ?? "";
  }, [filteredProjects]);

  const [spotlightSlug, setSpotlightSlug] = useState(defaultSpotlightSlug);
  const [activeDrawerId, setActiveDrawerId] = useState("");

  useEffect(() => {
    if (!filteredProjects.some((project) => project.slug === spotlightSlug)) {
      setSpotlightSlug(defaultSpotlightSlug);
    }
  }, [defaultSpotlightSlug, filteredProjects, spotlightSlug]);

  const spotlightProject = filteredProjects.find((project) => project.slug === spotlightSlug) ?? filteredProjects[0];
  const activeDrawer = spotlightProject?.drawerSections.find((drawer) => drawer.id === activeDrawerId) ?? spotlightProject?.drawerSections[0];

  useEffect(() => {
    setActiveDrawerId(spotlightProject?.drawerSections[0]?.id ?? "");
  }, [spotlightProject?.slug]);

  return (
    <PageFrame className="projects-page">
      <section className="page-hero glass-card">
        <span className="section-heading__eyebrow">Projects</span>
        <h1>Product narratives, public repos, and notebook-backed proof</h1>
        <p>
          The Microsoft work stays high-level and non-confidential. The public GitHub layer now does more of the technical proving: notebooks, model choices,
          evaluation logic, dashboards, and interactive systems work presented in a way a hiring manager can scan quickly.
        </p>

        <div className="signal-board signal-board--compact">
          {projectSummary.map((item) => (
            <article key={item.label} className={`signal-board__item signal-board__item--${item.tone}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="projects-command-deck glass-card">
        <div className="projects-command-deck__intro">
          <div>
            <span className="section-heading__eyebrow">Data science spotlight</span>
            <h2>Make the notebook layer legible in under a minute</h2>
          </div>
          <p>
            Instead of treating repos like raw links, this surface pulls forward the parts that matter most: what the repo studies, what models or analytical
            moves show up, and what signal the work gives to hiring managers.
          </p>
        </div>

        <div className="project-filter-bar" aria-label="Project focus filters">
          {focusAreas.map((focusArea) => (
            <button
              key={focusArea}
              type="button"
              className={focusArea === activeFocus ? "project-filter-button is-active" : "project-filter-button"}
              onClick={() => setActiveFocus(focusArea)}
            >
              {focusArea}
            </button>
          ))}
        </div>

        {spotlightProject ? (
          <div className="projects-command-deck__layout">
            <div className="project-selector-list" aria-label="Project spotlight selector">
              {filteredProjects.map((project) => (
                <button
                  key={project.slug}
                  type="button"
                  className={project.slug === spotlightProject.slug ? "project-selector-button is-active" : "project-selector-button"}
                  onClick={() => setSpotlightSlug(project.slug)}
                >
                  <span>{project.focusArea}</span>
                  <strong>{project.title}</strong>
                  <p>{project.thesis}</p>
                </button>
              ))}
            </div>

            <article className="project-spotlight">
              <ProjectVisual
                title={spotlightProject.title}
                stack={spotlightProject.stack}
                accent={spotlightProject.accent}
                visualMode={spotlightProject.visualMode}
                archetype={spotlightProject.archetype}
              />

              <div className="project-spotlight__body">
                <span className="section-heading__eyebrow">Spotlight</span>
                <h2>{spotlightProject.title}</h2>
                <p>{spotlightProject.description}</p>

                <div className="signal-board signal-board--compact">
                  {spotlightProject.missionReadout.map((item) => (
                    <article key={item.label} className={`signal-board__item signal-board__item--${item.tone}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>

                <div className="project-evidence-grid">
                  {spotlightProject.evidence.map((item) => (
                    <article key={item.label} className="project-evidence-card">
                      <span>{item.label}</span>
                      <p>{item.value}</p>
                    </article>
                  ))}
                </div>

                <div className="project-drawer-tabs" aria-label="Project detail drawers">
                  {spotlightProject.drawerSections.map((drawer) => (
                    <button
                      key={drawer.id}
                      type="button"
                      className={drawer.id === activeDrawer?.id ? "project-drawer-button is-active" : "project-drawer-button"}
                      onClick={() => setActiveDrawerId(drawer.id)}
                    >
                      {drawer.label}
                    </button>
                  ))}
                </div>

                {activeDrawer ? (
                  <article className="project-drawer-panel">
                    <span className="section-heading__eyebrow">{activeDrawer.label}</span>
                    <h3>{activeDrawer.title}</h3>
                    <p>{activeDrawer.summary}</p>
                    <ul className="detail-list">
                      {activeDrawer.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </article>
                ) : null}

                <div className="project-comparison-row">
                  {spotlightProject.comparisonChips.map((artifact) => (
                    <span key={artifact}>{artifact}</span>
                  ))}
                </div>

                <div className="project-preview-grid">
                  {spotlightProject.previewCards.map((card) => (
                    <article key={card.title} className="project-preview-card">
                      <span>{card.subtitle}</span>
                      <strong>{card.title}</strong>
                      <p>{card.note}</p>
                    </article>
                  ))}
                </div>

                <div className="tag-row">
                  {spotlightProject.artifacts.map((artifact) => (
                    <span key={artifact}>{artifact}</span>
                  ))}
                </div>

                {spotlightProject.href ? (
                  <a className="inline-link" href={spotlightProject.href} target="_blank" rel="noreferrer">
                    {spotlightProject.hrefLabel ?? "Open public repo"}
                  </a>
                ) : null}
              </div>
            </article>
          </div>
        ) : null}
      </section>

      <section className="project-grid">
        {filteredProjects.map((project) => (
          <a
            key={project.slug}
            className="glass-card project-card"
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

            <div className="project-card__body">
              <div className="project-card__meta">
                <div>
                  <span>{project.category}</span>
                  <h2>{project.title}</h2>
                </div>
                <strong className="project-card__focus">{project.focusArea}</strong>
              </div>

              <p className="project-card__thesis">{project.thesis}</p>
              <p>{project.description}</p>

              <div className="signal-board signal-board--mini project-card__signal-strip">
                {project.missionReadout.map((item) => (
                  <article key={item.label} className={`signal-board__item signal-board__item--${item.tone}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>

              <div className="tag-row">
                {project.stack.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className="project-card__artifacts">
                {project.artifacts.map((artifact) => (
                  <span key={artifact}>{artifact}</span>
                ))}
              </div>

              <div className="project-card__proof">
                <span className="section-heading__eyebrow">What this proves</span>
                <p>{project.whatThisProves}</p>
              </div>
            </div>
          </a>
        ))}
      </section>
    </PageFrame>
  );
}

export default ProjectsPage;
