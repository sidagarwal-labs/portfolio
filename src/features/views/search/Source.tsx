import { labLogo } from "./BootSequence";
import { describeSource } from "./searchIndex";

/* The favicon, site name, and breadcrumb URL above a result. */
function Source({ href, route }: { href: string; route?: boolean }) {
  const source = describeSource(href, route);
  const own = source.site === "Agarwal Labs" || source.site === "arXiv Search";
  return (
    <div className="se-source">
      {own
        ? <img className="se-favicon" src={labLogo} alt="" width="28" height="28" />
        : <span className="se-favicon" aria-hidden="true">{source.site.charAt(0).toUpperCase()}</span>}
      <span className="se-source__text">
        <span className="se-source__site">{source.site}</span>
        <span className="se-source__url">{source.url}</span>
      </span>
    </div>
  );
}

export default Source;
