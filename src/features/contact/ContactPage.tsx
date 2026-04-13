import PageFrame from "../../components/PageFrame";
import { profileContent } from "../../content/siteContent";

function ContactPage() {
  return (
    <PageFrame className="contact-page">
      <section className="page-hero glass-card">
        <span className="section-heading__eyebrow">Contact</span>
        <h1>Best fit: roles where product judgment and technical depth both matter</h1>
        <p>
          If the brief touches AI search, Copilot-style retrieval, evaluation design, technical product leadership, or builder-heavy PM work, email is the cleanest way in.
        </p>
      </section>

      <section className="contact-grid">
        <article className="glass-card contact-card">
          <span className="section-heading__eyebrow">Reach out</span>
          <h2>Direct paths</h2>
          <div className="contact-actions">
            <a className="site-nav__button" href="mailto:sid.webster@gmail.com">
              Email Sid
            </a>
            <a className="site-nav__button site-nav__button--ghost" href={profileContent.resumeHref} target="_blank" rel="noreferrer">
              Open resume
            </a>
          </div>
        </article>

        <article className="glass-card contact-card">
          <span className="section-heading__eyebrow">Profiles</span>
          <h2>Public surface</h2>
          <div className="social-strip social-strip--compact">
            {profileContent.socials.filter((item) => item.label !== "Email").map((social) => (
              <a key={social.label} href={social.href} target="_blank" rel="noreferrer">
                <span>{social.shortLabel}</span>
                <strong>{social.label}</strong>
              </a>
            ))}
          </div>
        </article>

        <article className="glass-card contact-card contact-card--wide">
          <span className="section-heading__eyebrow">Working model</span>
          <h2>How I tend to create leverage</h2>
          <ul className="detail-list">
            <li>Turn fuzzy AI-product goals into measurement frameworks that survive real launch pressure.</li>
            <li>Operate comfortably across PM, engineering, and data-science conversations without losing the business thread.</li>
            <li>Prefer products where search, grounding, ranking, workflow design, or visibility systems are central to the user experience.</li>
          </ul>
        </article>
      </section>
    </PageFrame>
  );
}

export default ContactPage;