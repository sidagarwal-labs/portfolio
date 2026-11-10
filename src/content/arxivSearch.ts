/* arXiv Search facts for Lab OS and Sid Search. The numbers are copied from the arxiv-search repo's chart notes
   (see arxivSearchSource); update them together when that page changes. */

export const arxivSearchOrigin = "https://arxiv.agarwal-labs.com";
export const arxivSearchHref = `${arxivSearchOrigin}/`;
export const arxivSearchRepo = "sidagarwal-labs/arxiv-search";
export const arxivSearchRepoHref = `https://github.com/${arxivSearchRepo}`;

export type ArxivStage = 1 | 2;

export type ArxivMilestone = {
  key: string;
  stage: ArxivStage;
  name: string;
  ndcg: number;
  /* Measured gain over the previous milestone; null for the first point. */
  gain: number | null;
  /* Source MRR@10 and Source R@10: where each dev query's source paper ranks. */
  mrr: number;
  recall: number;
  /* Graded relevance judgments the point was scored on. */
  judgments: number;
};

export const arxivStages: Record<ArxivStage, { label: string; blurb: string }> = {
  1: { label: "Stage 1: retrieval", blurb: "BM25 keyword search and embedding search, fused into one shortlist." },
  2: { label: "Stage 2: reranking", blurb: "An LLM reorders the shortlist's top results, with a safeguard for the source paper." }
};

export const arxivMilestones: readonly ArxivMilestone[] = [
  { key: "M1", stage: 1, name: "Tuned BM25", ndcg: 0.5068, gain: null, mrr: 0.5687, recall: 0.71, judgments: 3579 },
  { key: "M2", stage: 1, name: "GTE dense", ndcg: 0.5664, gain: 0.0596, mrr: 0.5254, recall: 0.71, judgments: 3579 },
  { key: "M3", stage: 1, name: "GTE hybrid", ndcg: 0.6162, gain: 0.0498, mrr: 0.635, recall: 0.8, judgments: 3579 },
  { key: "M4", stage: 1, name: "OpenAI hybrid", ndcg: 0.645, gain: 0.0287, mrr: 0.6534, recall: 0.84, judgments: 3579 },
  { key: "M5", stage: 1, name: "RRF75 c100", ndcg: 0.6885, gain: 0.0435, mrr: 0.6181, recall: 0.84, judgments: 3579 },
  { key: "M6", stage: 1, name: "RRF55 c30", ndcg: 0.6897, gain: 0.0012, mrr: 0.6459, recall: 0.86, judgments: 3579 },
  { key: "M7", stage: 1, name: "Shortlist scores", ndcg: 0.7007, gain: 0.0109, mrr: 0.6967, recall: 0.86, judgments: 3579 },
  { key: "M8", stage: 2, name: "GPT-5.4 mini top-50 rerank + safeguard", ndcg: 0.749, gain: 0.0483, mrr: 0.7197, recall: 0.87, judgments: 3579 },
  { key: "M9", stage: 2, name: "GPT-5.4 mini top-20 refinement + safeguard", ndcg: 0.7939, gain: 0.0449, mrr: 0.7381, recall: 0.92, judgments: 3579 },
  { key: "M10", stage: 2, name: "GPT-5.4 2-pass top-20 refinement", ndcg: 0.8418, gain: 0.0531, mrr: 0.7659, recall: 0.93, judgments: 3678 }
];

const first = arxivMilestones[0];
const latest = arxivMilestones[arxivMilestones.length - 1];

/* Headline numbers: the latest system against the first plotted point (tuned BM25). */
export const arxivSearchStats = {
  papers: 23304,
  devQueries: 100,
  ndcgStart: first.ndcg,
  ndcgEnd: latest.ndcg,
  sourceMrr: latest.mrr,
  sourceRecall: latest.recall,
  /* Same-pool control for the last step: M9's system scored on M10's 3,678 judgments. */
  controlNdcg: 0.7886
};

export const arxivSearchSource = {
  label: "arxiv-search: docs/06-charts.md, Hill climbing",
  commit: "ffd60e206843976efd7d610f83ee27206b5d9906",
  href: "https://github.com/sidagarwal-labs/arxiv-search/blob/ffd60e206843976efd7d610f83ee27206b5d9906/docs/06-charts.md#hill-climbing-major-comparable-milestones",
  asOf: "2026-11-06"
};

export const formatScore = (value: number) => value.toFixed(4);
export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
export const formatCount = (value: number) => value.toLocaleString("en-US");
