import arxivSearchIcon from "./arxiv-search-icon.svg";
import { labLogo } from "./BootSequence";
import { describeSource } from "./searchIndex";

/* Sites with their own favicon; the arXiv Search one matches arxiv.agarwal-labs.com/favicon.svg. */
const favicons: Record<string, string> = { "Agarwal Labs": labLogo, "arXiv Search": arxivSearchIcon };

/* The favicon, site name, and breadcrumb URL above a result. */
function Source({ href, route }: { href: string; route?: boolean }) {
  const source = describeSource(href, route);
  const favicon = favicons[source.site];
  return (
    <div className="se-source">
      {favicon
        ? <img className="se-favicon" src={favicon} alt="" width="28" height="28" />
        : <span className="se-favicon" aria-hidden="true">{source.site.charAt(0).toUpperCase()}</span>}
      <span className="se-source__text">
        <span className="se-source__site">{source.site}</span>
        <span className="se-source__url">{source.url}</span>
      </span>
    </div>
  );
}

export default Source;
