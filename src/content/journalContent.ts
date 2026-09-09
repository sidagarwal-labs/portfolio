export const researchNotes = [
  { title: "Foundation labs", slug: "foundation-labs", updatedAt: "2026-08-18T17:43:38Z" },
  { title: "AI memory & storage", slug: "memory-storage", updatedAt: "2026-08-18T17:38:59Z" },
  { title: "GPU & memory prices", slug: "gpu-prices", updatedAt: "2026-08-18T02:46:54Z" },
  { title: "AI capital expenditure", slug: "ai-capex", updatedAt: "2026-08-18T02:46:54Z" },
  { title: "AI adoption", slug: "ai-adoption", updatedAt: "2026-08-18T02:58:27Z" },
  { title: "Cloud growth", slug: "cloud-growth", updatedAt: "2026-08-18T02:46:54Z" }
].map((note) => ({
  ...note,
  href: `https://github.com/sidagarwal-labs/models/blob/main/notes/${note.slug}.md`
}));

export const selectedProjects = [
  {
    title: "Financial models",
    href: "https://github.com/sidagarwal-labs/models",
    description: "An earnings-model library I maintain across tech and other sectors, with valuation work and company research."
  },
  {
    title: "HireMe.AI",
    href: "https://github.com/sidagarwal-labs/HireMe-AI",
    description: "A resume and cover-letter builder with job search and hybrid retrieval. Built with @jeffsengsy."
  },
  {
    title: "NVDocs RAG",
    href: "https://github.com/sidagarwal-labs/NVDocs_RAG",
    description: "Retrieval experiments on NVIDIA's NVDocs dataset: BM25, learned re-ranking, and a closer look at what the candidate pool misses."
  },
  {
    title: "AI & Deep Learning Labs",
    href: "https://github.com/sidagarwal-labs/DSBA-6165-AI-Deep-Learning",
    description: "UNC Charlotte coursework in TensorFlow/Keras: linear and nonlinear models, Iris classification, and an MLP for building energy loads."
  },
  {
    title: "Text Analytics",
    href: "https://github.com/sidagarwal-labs/DSBA-6188-Text-Analytics",
    description: "UNC Charlotte coursework exploring UN speeches and tweet-text preprocessing, with TF-IDF and vectorization examples. Data requirements and source attribution are documented."
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