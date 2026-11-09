import { selectedProjects } from "../../content/journalContent";
import { profileContent } from "../../content/siteContent";

type ProjectDetail = { symbol: string; focus: string; stack: string[]; concepts: string[] };

/* Presentation metadata for the experimental views. Claims stay within each project's public description. */
const projectDetails: Record<string, ProjectDetail> = {
  "https://github.com/sidagarwal-labs/arxiv-search": {
    symbol: "ARXV",
    focus: "AI research assistant",
    stack: ["Python", "NumPy", "BM25", "OpenAI embeddings", "LLM reranking", "RAG"],
    concepts: ["Retrieval", "Ranking", "Embeddings", "RAG", "Evaluation"]
  },
  "https://github.com/sidagarwal-labs/NVDocs_RAG": {
    symbol: "NVRG",
    focus: "Retrieval experiments",
    stack: ["BM25", "Learned reranking", "Candidate-pool analysis"],
    concepts: ["Retrieval", "Ranking", "Evaluation"]
  },
  "https://github.com/sidagarwal-labs/HireMe-AI": {
    symbol: "HIRE",
    focus: "Resume & cover-letter builder",
    stack: ["Hybrid retrieval", "Job search"],
    concepts: ["Retrieval", "Product build"]
  },
  "https://github.com/sidagarwal-labs/models": {
    symbol: "MODL",
    focus: "Earnings-model library",
    stack: ["Earnings models", "Valuation", "Company research"],
    concepts: ["Finance"]
  }
};

const fallbackDetail: ProjectDetail = { symbol: "PROJ", focus: "Project", stack: [], concepts: [] };

export const viewProjects = selectedProjects.map((project) => ({ ...project, ...(projectDetails[project.href] ?? fallbackDetail) }));

export const projectConcepts = Array.from(new Set(viewProjects.flatMap((project) => project.concepts)));

export const earlierProjects = profileContent.projects.filter((project) =>
  project.href?.includes("github.com") && !selectedProjects.some((selected) => selected.href === project.href)
);

export const marketTracker = profileContent.projects.find((project) => project.slug === "ai-llm-stack-tracker");

export const contactLinks = profileContent.socials.filter((social) => social.label !== "Resume");

export const emailLink = profileContent.socials.find((social) => social.label === "Email");

export const roleLine = "Senior Product Manager, AI search & retrieval at Microsoft";

export const backgroundStream = [
  { label: "FRC Team 2642", detail: "Captained and mentored the Pitt Pirates", to: "/robotics" },
  { label: "UNC Charlotte", detail: "Business & operations, economics minor" },
  { label: "Amazon", detail: "Product manager intern, 2020" },
  { label: "Microsoft", detail: "PM intern to Senior PM, AI search & retrieval" },
  { label: "M.S. in progress", detail: "Data Science & Business Analytics" }
];

export const noteDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
});
