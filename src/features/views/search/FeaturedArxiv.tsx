import { arxivSearchHref, arxivSearchRepoHref, arxivSearchStats as stats, formatCount, formatPercent, formatScore } from "../../../content/arxivSearch";

/* The headline project, pinned above results. Inside Lab OS the frame bridge opens these links in the arXiv Search
   and GitHub apps; elsewhere they go to the live site and the repo. */
function FeaturedArxiv({ id, level }: { id: string; level: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <article className="se-featured" aria-labelledby={id}>
      <p className="se-featured__eyebrow"><b>Featured project</b><span>arxiv.agarwal-labs.com</span></p>
      <Heading id={id}><a className="se-featured__title" href={arxivSearchHref}>arXiv Search</a></Heading>
      <p className="se-featured__snippet">
        An AI research assistant for {formatCount(stats.papers)} recent arXiv papers in information retrieval, language,
        and machine learning. Hybrid BM25 and semantic retrieval build a shortlist, then an LLM reranks it.
      </p>
      <dl className="se-featured__stats">
        <div>
          <dt>nDCG@10</dt>
          <dd>{formatScore(stats.ndcgStart)} <span aria-hidden="true">→</span><span className="sr-only">to</span> {formatScore(stats.ndcgEnd)}</dd>
        </div>
        <div><dt>Source R@10</dt><dd>{formatPercent(stats.sourceRecall)}</dd></div>
        <div><dt>arXiv papers</dt><dd>{formatCount(stats.papers)}</dd></div>
      </dl>
      <div className="se-featured__actions">
        <a className="se-button se-button--primary" href={arxivSearchHref}>Open arXiv Search</a>
        <a className="se-button" href={arxivSearchRepoHref} aria-label="arXiv Search on GitHub">GitHub</a>
      </div>
    </article>
  );
}

export default FeaturedArxiv;
