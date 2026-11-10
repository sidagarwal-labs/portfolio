import type { CSSProperties } from "react";
import { ExternalLink, MonitorPlay } from "lucide-react";
import {
  arxivMilestones,
  arxivSearchHref,
  arxivSearchRepo,
  arxivSearchSource,
  arxivSearchStats,
  arxivStages,
  formatCount,
  formatPercent,
  formatScore
} from "../../../../content/arxivSearch";
import { apps, type AppId } from "../apps";
import type { OsActions } from "../types";
import { HillChart, MilestoneTable } from "./HillChart";

const asOf = new Date(`${arxivSearchSource.asOf}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const stage2Start = arxivMilestones.findIndex((milestone) => milestone.stage === 2);
const stageRange = (stage: 1 | 2) => {
  const keys = arxivMilestones.filter((milestone) => milestone.stage === stage).map((milestone) => milestone.key);
  return `${keys[0]} to ${keys[keys.length - 1]}`;
};
const latest = arxivMilestones[arxivMilestones.length - 1];
const previous = arxivMilestones[arxivMilestones.length - 2];

type Card = { app: AppId; eyebrow: string; title: string; blurb: string; action: string; open: (actions: OsActions) => void };

const cards: Card[] = [
  { app: "rankit", eyebrow: "Game", title: "Rank It", blurb: "Rank real papers for a query and get scored with nDCG on arXiv Search's graded relevance labels.", action: "Play Rank It", open: (actions) => actions.open("rankit") },
  { app: "github", eyebrow: "Source", title: arxivSearchRepo, blurb: "The code, evaluation scripts, and the chart notes these numbers come from.", action: "Open in GitHub", open: (actions) => actions.open("github", arxivSearchRepo) },
  { app: "nvdocs", eyebrow: "Related project", title: apps.nvdocs.title, blurb: apps.nvdocs.blurb, action: "Open NVDocs RAG in GitHub", open: (actions) => actions.open("nvdocs") }
];

export function Overview({ actions, onTryLive }: { actions: OsActions; onTryLive?: () => void }) {
  const stats = arxivSearchStats;
  return (
    <div className="ax-overview">
      <section className="ax-hero" aria-labelledby="ax-hero-title">
        <h3 id="ax-hero-title">An AI research assistant for arXiv papers</h3>
        <p className="ax-lede">
          arXiv Search covers {formatCount(stats.papers)} recent arXiv papers in information retrieval, computation and language, and machine
          learning (cs.IR, cs.CL, and cs.LG). BM25 keyword search and semantic embedding search build a shortlist, and an LLM reranks it. Each
          search gets an AI summary with citations, and any paper opens as a PDF beside a chat about that paper.
        </p>
        <div className="ax-actions">
          <a className="os-button os-button--primary" href={arxivSearchHref} target="_blank" rel="noreferrer">
            Open live site
            <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
          </a>
          {onTryLive && (
            <button type="button" className="os-button" onClick={onTryLive}>
              <MonitorPlay size={15} strokeWidth={2} aria-hidden="true" />
              Try it here
            </button>
          )}
          <button type="button" className="os-button" onClick={() => actions.open("github", arxivSearchRepo)}>
            <apps.github.icon size={15} strokeWidth={2} aria-hidden="true" />
            Code on GitHub
          </button>
        </div>
      </section>

      <section className="ax-section" aria-labelledby="ax-results">
        <h3 id="ax-results" className="sr-only">Results</h3>
        <dl className="ax-stats">
          <div className="ax-stat ax-stat--wide">
            <dt>nDCG@10</dt>
            <dd className="ax-stat__value">{formatScore(stats.ndcgStart)} → {formatScore(stats.ndcgEnd)}</dd>
            <dd className="ax-stat__note">Tuned BM25 ({arxivMilestones[0].key}) to the current reranker ({latest.key})</dd>
          </div>
          <div className="ax-stat">
            <dt>Source R@10</dt>
            <dd className="ax-stat__value">{formatPercent(stats.sourceRecall)}</dd>
            <dd className="ax-stat__note">Queries whose source paper ranks in the top 10</dd>
          </div>
          <div className="ax-stat">
            <dt>Source MRR@10</dt>
            <dd className="ax-stat__value">{formatScore(stats.sourceMrr)}</dd>
            <dd className="ax-stat__note">Mean reciprocal rank of the source paper</dd>
          </div>
          <div className="ax-stat">
            <dt>Papers</dt>
            <dd className="ax-stat__value">{formatCount(stats.papers)}</dd>
            <dd className="ax-stat__note">Recent cs.IR, cs.CL, and cs.LG papers</dd>
          </div>
        </dl>
      </section>

      <section className="ax-section" aria-labelledby="ax-how">
        <h3 id="ax-how">How it works</h3>
        <ol className="ax-stages">
          {([1, 2] as const).map((stage) => (
            <li key={stage} className={`ax-stagecard ax-stagecard--${stage}`}>
              <span className="ax-stagecard__step">Stage {stage}</span>
              <h4>{stage === 1 ? "Retrieval" : "Reranking"}</h4>
              <p>{arxivStages[stage].blurb}</p>
              <p className="ax-muted">Milestones {stageRange(stage)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="ax-section" aria-labelledby="ax-hill">
        <div className="ax-section__head">
          <h3 id="ax-hill">Hill climbing: nDCG@10 by milestone</h3>
          <p className="ax-muted">
            {stats.devQueries} dev queries. Zoomed y-axis (0.50 to 0.90), not zero-based. Selected milestones, not equally spaced in time.
          </p>
        </div>
        <HillChart />
        <MilestoneTable />
        <div className="ax-caveats">
          <h4>Caveats</h4>
          <ul>
            <li>Scores come from {stats.devQueries} development queries with AI-graded relevance labels, not a held-out test set.</li>
            <li>{arxivMilestones[0].key} is tuned BM25, not the original plain-BM25 control.</li>
            <li>
              {latest.key} and its +{formatScore(latest.gain ?? 0)} step are measured on {formatCount(latest.judgments)} judgments, where the same-pool {previous.key} control
              scores {formatScore(stats.controlNdcg)}. Earlier points use {formatCount(previous.judgments)}, so the plotted {previous.key}-to-{latest.key} difference is not the measured step gain.
            </li>
            <li>Steps can change more than one setting, so a step gain is not the effect of a single feature. Stage 2 starts at {arxivMilestones[stage2Start].key}.</li>
          </ul>
          <p className="ax-source">
            Source: <a href={arxivSearchSource.href} target="_blank" rel="noreferrer">{arxivSearchSource.label}</a> (commit{" "}
            <code>{arxivSearchSource.commit.slice(0, 7)}</code>), as of {asOf}.
          </p>
        </div>
      </section>

      <section className="ax-section" aria-labelledby="ax-more">
        <h3 id="ax-more">More</h3>
        <ul className="ax-cards">
          {cards.map((card) => {
            const def = apps[card.app];
            const Icon = def.icon;
            return (
              <li key={card.app} className="ax-card" data-card={card.app}>
                <span className="ax-card__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
                <div className="ax-card__text">
                  <span className="ax-card__eyebrow">{card.eyebrow}</span>
                  <h4>{card.title}</h4>
                  <p>{card.blurb}</p>
                </div>
                <button type="button" className="os-button" onClick={() => card.open(actions)}>{card.action}</button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
