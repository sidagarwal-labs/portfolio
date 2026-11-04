import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { profileContent } from "../content/siteContent";

function JournalLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  const email = profileContent.socials.find((social) => social.label === "Email");

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="journal">
        <header className="masthead" id="intro">
          <div className="masthead__identity">
            {home ? <h1>{profileContent.shortName}</h1> : <Link className="masthead__name" to="/">{profileContent.shortName}</Link>}
            <p className="masthead__role">Senior Product Manager, AI search &amp; retrieval at Microsoft</p>
            <p className="masthead__location">Charlotte, North Carolina</p>
          </div>
          <img className="portrait" src={profileContent.avatarUrl} alt="Sid Agarwal's GitHub avatar" width="132" height="132" />

          <div className="masthead__bar">
            <nav className="site-links" aria-label="Primary">
              <Link to="/#lab">Projects</Link>
              <Link to="/#writing">Writing</Link>
              <Link to="/#impact">About</Link>
            </nav>
            <ul className="masthead__actions" aria-label="Resume and email">
              <li><a className="masthead__resume" href={profileContent.resumeHref}>Resume</a></li>
              {email && <li><a href={email.href}>Email</a></li>}
            </ul>
          </div>
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