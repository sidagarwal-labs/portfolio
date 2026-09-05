import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { profileContent } from "../content/siteContent";

function JournalLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="journal">
        <header className="masthead" id="intro">
          <div>
            {home ? <h1>{profileContent.shortName}</h1> : <Link className="masthead__name" to="/">{profileContent.shortName}</Link>}
            <p className="masthead__location">Charlotte, North Carolina</p>
          </div>
          <img className="portrait" src={profileContent.avatarUrl} alt="Sid Agarwal's GitHub avatar" width="64" height="64" />
        </header>

        <nav className="site-links" aria-label="Primary">
          <Link to="/#writing">Writing</Link>
          <Link to="/#lab">Projects</Link>
          <Link to="/#library">Reading</Link>
          <Link to="/#impact">About</Link>
          <Link to="/#contact">Contact</Link>
        </nav>

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