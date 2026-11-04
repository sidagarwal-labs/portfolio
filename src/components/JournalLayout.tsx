import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { profileContent } from "../content/siteContent";

function JournalLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="journal">
        <header className="masthead" id="intro">
          <div className="masthead__identity">
            {home ? <h1>{profileContent.shortName}</h1> : <Link className="masthead__name" to="/">{profileContent.shortName}</Link>}
            <p className="masthead__role">Senior Product Manager, AI search &amp; retrieval at Microsoft</p>
          </div>
          <img className="portrait" src={profileContent.avatarUrl} alt="Sid Agarwal's GitHub avatar" width="132" height="132" />

          <div className="masthead__meta">
            <span className="masthead__location">Charlotte, North Carolina</span>
            <ul className="masthead__links" aria-label="Resume and profiles">
              <li><a href={profileContent.resumeHref}>Resume (PDF)</a></li>
              {profileContent.socials.filter((social) => social.label !== "Resume").map((social) => (
                <li key={social.label}><a href={social.href}>{social.label}</a></li>
              ))}
            </ul>
          </div>

          <nav className="site-links" aria-label="Primary">
            <Link to="/#lab">Projects</Link>
            <Link to="/#writing">Writing</Link>
            <Link to="/#impact">About</Link>
            <Link to="/#library">Reading</Link>
            <Link to="/#contact">Contact</Link>
            <a href={profileContent.resumeHref}>Resume</a>
          </nav>
        </header>

        <main id="main" tabIndex={-1}>{children}</main>

        <footer className="site-footer">
          <span>Views are my own.</span>
          <a href="#intro">Back to top</a>
        </footer>
      </div>
    </>
  );
}

export default JournalLayout;