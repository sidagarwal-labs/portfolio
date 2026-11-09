export const researchNotes = [
  { title: "AI buildout: October 2026", slug: "ai-buildout-2026-10", updatedAt: "2026-10-04T04:17:48Z" },
  { title: "AI buildout: September 2026", slug: "ai-buildout-2026-09", updatedAt: "2026-09-09T02:36:56Z" },
  { title: "Foundation labs", slug: "foundation-labs", updatedAt: "2026-10-04T04:17:48Z" },
  { title: "AI memory & storage", slug: "memory-storage", updatedAt: "2026-10-04T04:17:48Z" },
  { title: "GPU & memory prices", slug: "gpu-prices", updatedAt: "2026-10-04T04:17:48Z" },
  { title: "AI capital expenditure", slug: "ai-capex", updatedAt: "2026-10-04T04:17:48Z" },
  { title: "AI adoption", slug: "ai-adoption", updatedAt: "2026-10-04T04:17:48Z" },
  { title: "Cloud growth", slug: "cloud-growth", updatedAt: "2026-10-04T04:17:48Z" }
].map((note) => ({
  ...note,
  href: `https://github.com/sidagarwal-labs/models/blob/main/notes/${note.slug}.md`
}));

const buildoutPrefix = "ai-buildout-";
// Edition slugs are ai-buildout-YYYY-MM, so descending slug order is newest first.
const buildoutEditions = researchNotes
  .filter((note) => note.slug.startsWith(buildoutPrefix))
  .sort((a, b) => b.slug.localeCompare(a.slug));

export const currentResearchNotes = [
  ...buildoutEditions.slice(0, 1),
  ...researchNotes.filter((note) => !note.slug.startsWith(buildoutPrefix))
];

export const earlierBuildoutEditions = buildoutEditions.slice(1);

export const selectedProjects = [
  {
    title: "arXiv Search",
    href: "https://github.com/sidagarwal-labs/arxiv-search",
    websiteHref: "https://arxiv.agarwal-labs.com/",
    description: "Built and deployed an AI research assistant for 23,304 arXiv papers, with cited summaries and paper-specific chat. Combined Python, NumPy, BM25 keyword search, OpenAI embeddings, and LLM reranking. Progressed from an early keyword-search baseline at 0.52 to the latest reranked system at 0.84 nDCG@10 on AI-graded development evaluations, with expanded relevance labels along the way. A hands-on exploration of RAG, citation faithfulness, and balancing search quality against latency and API cost."
  },
  {
    title: "NVDocs RAG",
    href: "https://github.com/sidagarwal-labs/NVDocs_RAG",
    description: "Retrieval experiments on NVIDIA's NVDocs dataset: BM25, learned re-ranking, and a closer look at what the candidate pool misses."
  },
  {
    title: "HireMe.AI",
    href: "https://github.com/sidagarwal-labs/HireMe-AI",
    description: "A resume and cover-letter builder with job search and hybrid retrieval. Built with @jeffsengsy."
  },
  {
    title: "Financial models",
    href: "https://github.com/sidagarwal-labs/models",
    description: "An earnings-model library I maintain across tech and other sectors, with valuation work and company research."
  }
];

export const courseworkProjects = [
  {
    title: "AI & Deep Learning Labs",
    href: "https://github.com/sidagarwal-labs/DSBA-6165-AI-Deep-Learning",
    note: "UNC Charlotte coursework in TensorFlow/Keras"
  },
  {
    title: "Text Analytics",
    href: "https://github.com/sidagarwal-labs/DSBA-6188-Text-Analytics",
    note: "UNC Charlotte coursework with documented data requirements and source attribution"
  }
];

export const marketSymbols = ["NVDA", "MSFT", "TSLA", "AAPL", "GOOGL", "CRWV", "MU"];

export const arenaLeader = {
  model: "claude-fable-5",
  score: 1507,
  uncertainty: 5,
  leaderboardDate: "2026-09-02",
  checkedAt: "2026-09-05",
  href: "https://arena.ai/leaderboard/text"
};