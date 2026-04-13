import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { profileContent } from "../content/siteContent";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useSectionSpy } from "../hooks/useSectionSpy";

const sectionOrder = profileContent.sceneSections.map((s) => s.id);

const routeFallbackSectionMap: Record<string, string> = {
  "/experience": "impact",
  "/projects": "lab",
  "/books": "library",
  "/contact": "contact"
};

function getActiveSection(pathname: string, hash: string) {
  if (pathname !== "/") {
    return routeFallbackSectionMap[pathname] ?? "intro";
  }

  const hashSection = hash.replace("#", "").trim();
  return hashSection || "intro";
}

function SiteNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const spiedSection = useSectionSpy(sectionOrder, sectionOrder[0]);
  /* On the home page, the scroll spy is the authority for which section is active.
     On sub-routes (/experience, /projects, …), fall back to the route map. */
  const activeSection = location.pathname === "/"
    ? spiedSection
    : (routeFallbackSectionMap[location.pathname] ?? "intro");
  const isMobileViewport = useMediaQuery("(max-width: 960px)");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();

  /** When already on "/", React Router won't scroll to the hash target on its
   *  own. Force-scroll to the element so in-page nav always works. */
  function handleNavClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const hash = href.split("#")[1];
    if (location.pathname === "/" && hash) {
      const target = document.getElementById(hash);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
        navigate(`/#${hash}`, { replace: true });
      }
    }
  }

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMenuOpen(false);
    }
  }, [isMobileViewport]);

  return (
    <div className={isMobileViewport && isMenuOpen ? "site-nav-shell is-mobile-open" : "site-nav-shell"}>
      <header className={isMobileViewport ? "site-nav is-mobile-nav" : "site-nav"}>
        <div className="site-nav__topbar">
          <NavLink to="/" className="site-nav__brand" aria-label="Go to home route">
            <span className="site-nav__brand-mark" aria-hidden="true">
              <span className="site-nav__brand-signal site-nav__brand-signal--cyan" />
              <span className="site-nav__brand-signal site-nav__brand-signal--gold" />
            </span>
            <span>
              <strong>{profileContent.shortName}</strong>
              <small>Trying to quantify the unknown</small>
            </span>
            <span className="nav-online-dot" aria-hidden="true" />
          </NavLink>

          <nav className="site-nav__links site-nav__links--inline" aria-label="Primary">
            {profileContent.navLinks.map((link) => (
              <Link
                key={link.id}
                to={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={activeSection === link.sectionId ? "site-nav__link is-active" : "site-nav__link"}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="site-nav__desktop-actions">
            <a className="site-nav__button site-nav__button--ghost" href={profileContent.resumeHref} target="_blank" rel="noreferrer">
              Resume
            </a>
            <a className="site-nav__button" href="mailto:sid.webster@gmail.com">
              Reach out
            </a>
          </div>

          <button
            type="button"
            className="site-nav__toggle"
            aria-controls={menuId}
            aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            title={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
          >
            <span />
            <span />
          </button>
        </div>

        <div id={menuId} className={isMobileViewport ? "site-nav__menu" : "site-nav__menu site-nav__menu--desktop"}>
          <nav className="site-nav__links" aria-label="Primary">
            {profileContent.navLinks.map((link) => (
              <Link
                key={link.id}
                to={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={activeSection === link.sectionId ? "site-nav__link is-active" : "site-nav__link"}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="site-nav__mobile-actions">
            <a className="site-nav__button site-nav__button--ghost" href={profileContent.resumeHref} target="_blank" rel="noreferrer">
              Resume
            </a>
            <a className="site-nav__button" href="mailto:sid.webster@gmail.com">
              Reach out
            </a>
          </div>
        </div>
      </header>
    </div>
  );
}

export default SiteNavigation;
