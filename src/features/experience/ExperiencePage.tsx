import PageFrame from "../../components/PageFrame";
import { profileContent } from "../../content/siteContent";

function ExperiencePage() {
  return (
    <PageFrame className="experience-page">
      <section className="page-hero glass-card">
        <span className="section-heading__eyebrow">Experience</span>
        <h1>Enterprise AI product work, compressed into case studies</h1>
        <p>
          This route treats experience as systems briefs rather than a pasted resume. The core story is Microsoft first,
          then Amazon, then earlier leadership work only where it strengthens the throughline, with signal, risk, and momentum called out directly.
        </p>
      </section>

      <section className="case-study-grid">
        {profileContent.experience.map((entry) => (
          <article key={entry.slug} className="glass-card case-study-card">
            <div className="case-study-card__header">
              <div>
                <span>{entry.timeframe}</span>
                <h2>{entry.role}</h2>
                <strong>{entry.company}</strong>
              </div>
              <p>{entry.location}</p>
            </div>

            <div className="case-study-card__section">
              <span className="section-heading__eyebrow">Problem space</span>
              <p>{entry.problemSpace}</p>
            </div>

            <div className="case-study-card__section">
              <span className="section-heading__eyebrow">Scope</span>
              <p>{entry.scope}</p>
            </div>

            <div className="signal-board signal-board--mini case-study-card__signal-strip">
              {entry.missionReadout.map((item) => (
                <article key={item.label} className={`signal-board__item signal-board__item--${item.tone}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>

            <div className="case-study-card__section">
              <span className="section-heading__eyebrow">Themes</span>
              <div className="tag-row">
                {entry.systemsThemes.map((theme) => (
                  <span key={theme}>{theme}</span>
                ))}
              </div>
            </div>

            <div className="case-study-card__impact">
              <span className="section-heading__eyebrow">Impact</span>
              <p>{entry.impact}</p>
            </div>
          </article>
        ))}
      </section>
    </PageFrame>
  );
}

export default ExperiencePage;
