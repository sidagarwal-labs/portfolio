import { useEffect, type ReactNode } from "react";
import { ChartCandlestick, Rocket, Trophy } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { profileContent } from "../../content/siteContent";
import "./live.css";

const sections = [
  { to: "/markets", label: "Markets", icon: ChartCandlestick },
  { to: "/launches", label: "Launches", icon: Rocket },
  { to: "/leaderboards", label: "AI leaderboards", icon: Trophy }
];

type Props = {
  section: "markets" | "launches" | "leaderboards";
  title: string;
  documentTitle: string;
  lede: ReactNode;
  meta?: ReactNode;
  sources: ReactNode;
  children: ReactNode;
};

/* Shared chrome for the live data pages, so they read as one small web app inside or outside Lab OS. */
function LivePageShell({ section, title, documentTitle, lede, meta, sources, children }: Props) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${documentTitle} | ${profileContent.shortName}`;
    return () => { document.title = previousTitle; };
  }, [documentTitle]);

  return (
    <div className="live" data-section={section}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="live-top">
        <div className="live-wrap live-top__inner">
          <Link className="live-brand" to="/">
            <img src={profileContent.avatarUrl} alt="" width="28" height="28" />
            <span>agarwal-labs</span>
          </Link>
          <nav className="live-nav" aria-label="Live pages">
            {sections.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `live-nav__link${isActive ? " is-active" : ""}`}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <Link className="live-home" to="/">{profileContent.shortName}</Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="live-wrap live-main">
        <header className="live-hero">
          <h1>{title}</h1>
          <p className="live-hero__lede">{lede}</p>
          {meta && <p className="live-hero__meta">{meta}</p>}
        </header>
        {children}
      </main>

      <footer className="live-wrap live-foot">
        <div className="live-foot__sources">{sources}</div>
        <p>
          Built by <Link to="/">{profileContent.shortName}</Link>. Data can be delayed or wrong; check the original source before relying on it.
        </p>
      </footer>
    </div>
  );
}

export default LivePageShell;
