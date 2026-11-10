import { courseworkProjects, currentResearchNotes, earlierBuildoutEditions } from "../../../content/journalContent";
import { libraryCategories, podcasts, spotifyShowUrl } from "../../../content/library";
import { profileContent } from "../../../content/siteContent";
import { contactLinks, earlierProjects, marketTracker, viewProjects } from "../viewData";

export type SearchDoc = {
  id: string;
  kind: string;
  title: string;
  href: string;
  /* In-app route rendered with react-router instead of a plain anchor. */
  route?: boolean;
  snippet: string;
  keywords?: string;
};

export type SearchHit = { doc: SearchDoc; score: number; matched: string[]; phrase: boolean };

const siteNames: Record<string, string> = {
  "github.com": "GitHub",
  "linkedin.com": "LinkedIn",
  "amazon.com": "Amazon",
  "open.spotify.com": "Spotify",
  "agarwal-labs.com": "Agarwal Labs",
  "arxiv.agarwal-labs.com": "arXiv Search"
};

export function describeSource(href: string, route = false) {
  if (href.startsWith("mailto:")) return { site: "Email", url: href.slice("mailto:".length) };
  if (route || href.startsWith("#")) {
    const path = href.startsWith("#") ? "" : href.split("/").filter(Boolean).join(" › ");
    return { site: "Agarwal Labs", url: path ? `agarwal-labs.com › ${path}` : "agarwal-labs.com" };
  }
  try {
    const url = new URL(href, "https://agarwal-labs.com");
    const host = url.hostname.replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean).slice(0, 3).map((part) => part.length > 26 ? `${part.slice(0, 24)}…` : part);
    return { site: siteNames[host] ?? host, url: [host, ...parts].join(" › ") };
  } catch {
    return { site: href, url: href };
  }
}

const background: SearchDoc[] = [
  {
    id: "bg-microsoft",
    kind: "Background",
    title: "Senior Product Manager at Microsoft",
    href: "#impact",
    snippet: "Search and retrieval quality for Microsoft 365 Copilot. Joined as a PM intern in 2021 and grew from PM to PM II to Senior PM. Shipped Power BI and Viva Engage as Copilot content sources, led retrieval quality for Copilot Connectors, and helped take Copilot from zero to over 30 million paid seats.",
    keywords: "work job experience career pm product manager intern promotion ai search retrieval ranking relevance"
  },
  {
    id: "bg-unc",
    kind: "Background",
    title: "UNC Charlotte",
    href: "#impact",
    snippet: "Studied business and operations at UNC Charlotte, with a minor in economics.",
    keywords: "education school university college degree undergraduate"
  },
  {
    id: "bg-ms",
    kind: "Background",
    title: "M.S. in Data Science and Business Analytics",
    href: "#impact",
    snippet: "Currently pursuing an M.S. in Data Science and Business Analytics.",
    keywords: "education graduate masters degree school machine learning analytics"
  },
  {
    id: "bg-amazon",
    kind: "Background",
    title: "Product Manager Intern at Amazon",
    href: "#impact",
    snippet: "Summer 2020 internship with Amazon's Middle Mile team: designed weather and route-closure safety alerts for drivers, plus a safety mitigation matrix and procedures the team adopted.",
    keywords: "work job experience internship intern pm product manager logistics operations supply chain safety"
  },
  {
    id: "bg-robotics",
    kind: "Background",
    title: "Pitt Pirates, FRC Team 2642",
    href: "/robotics",
    route: true,
    snippet: "Captained and mentored the Pitt Pirates, FRC Team 2642.",
    keywords: "robotics first frc leadership mentoring captain team"
  }
];

export const searchDocs: SearchDoc[] = [
  {
    id: "profile",
    kind: "Profile",
    title: "Sid Agarwal, Senior Product Manager for AI search & retrieval",
    href: "#intro",
    snippet: "Senior Product Manager at Microsoft working on search and retrieval quality for Microsoft 365 Copilot. Outside work, I build small software projects and write about AI, markets, and the businesses behind the technology.",
    keywords: "sid siddhant agarwal about bio who charlotte north carolina"
  },
  ...viewProjects.map((project) => ({
    id: `project-${project.symbol}`,
    kind: "Project",
    title: project.title,
    href: project.websiteHref ?? project.href,
    snippet: project.description,
    keywords: [project.focus, ...project.stack, ...project.concepts, "project build code"].join(" ")
  })),
  ...(marketTracker ? [{
    id: "project-tracker",
    kind: "Project",
    title: marketTracker.title,
    href: marketTracker.href ?? "#writing",
    snippet: marketTracker.description,
    keywords: "markets stocks investing ai buildout chips power data centers applications companies"
  }] : []),
  ...earlierProjects.filter((project) => project.slug !== marketTracker?.slug).map((project) => ({
    id: `project-${project.slug}`,
    kind: "Earlier project",
    title: project.title,
    href: project.href ?? "#lab",
    snippet: project.description,
    keywords: project.stack.join(" ")
  })),
  ...courseworkProjects.map((project) => ({
    id: `coursework-${project.href}`,
    kind: "Coursework",
    title: project.title,
    href: project.href,
    snippet: `${project.note}.`,
    keywords: "coursework class school deep learning machine learning"
  })),
  ...[...currentResearchNotes, ...earlierBuildoutEditions].map((note) => ({
    id: `note-${note.slug}`,
    kind: "Research note",
    title: note.title,
    href: note.href,
    snippet: note.slug.startsWith("ai-buildout-")
      ? "Monthly notes on the AI buildout: where the capital goes, what becomes a bottleneck, and which businesses turn that investment into earnings."
      : "Research note from how I follow the AI buildout, kept in my models repo on GitHub.",
    keywords: "markets investing research notes writing ai buildout"
  })),
  ...profileContent.writing.map((entry) => ({
    id: `writing-${entry.slug}`,
    kind: "Essay",
    title: entry.title,
    href: `/writing/${entry.slug}`,
    route: true,
    snippet: entry.summary,
    keywords: ["writing essay", ...entry.content].join(" ")
  })),
  ...background,
  ...profileContent.books.map((book) => ({
    id: `book-${book.slug}`,
    kind: "Book",
    title: book.title,
    href: book.href,
    snippet: `${book.author}. ${book.note}`,
    keywords: ["book reading bookshelf library", ...book.tags].join(" ")
  })),
  ...podcasts.map((podcast) => ({
    id: `podcast-${podcast.slug}`,
    kind: "Podcast",
    title: podcast.title,
    href: spotifyShowUrl(podcast.spotifyId),
    snippet: `${podcast.host}. ${podcast.note}`,
    keywords: ["podcast podcasts listening spotify library", ...libraryCategories.filter((category) => podcast.categories.includes(category.id)).map((category) => category.label)].join(" ")
  })),
  {
    id: "resume",
    kind: "Resume",
    title: "Resume (PDF)",
    href: profileContent.resumeHref,
    snippet: "Experience, projects, and education in one PDF.",
    keywords: "resume cv experience skills hire hiring recruiter job"
  },
  ...contactLinks.map((social) => ({
    id: `contact-${social.label}`,
    kind: "Contact",
    title: social.label === "Email" ? "Email Sid" : `Sid Agarwal on ${social.label}`,
    href: social.href,
    snippet: social.label === "Email"
      ? `Reach me at ${social.href.replace("mailto:", "")}. Always happy to talk about AI, products, markets, or a good book.`
      : `Connect with me on ${social.label}.`,
    keywords: "contact reach message hire connect talk"
  }))
];

const stopwords = new Set(
  "a an and are as at be by can do does for from has have he her his how i in is it its me my of on or our so that the this to was were what when where which who why will with you your".split(" ")
);

function stem(term: string) {
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 5 && term.endsWith("ing")) return term.slice(0, -3);
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss") && !term.endsWith("us")) return term.slice(0, -1);
  return term;
}

function words(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? [];
}

export function tokenize(text: string) {
  return words(text).filter((word) => !stopwords.has(word)).map(stem);
}

/* BM25 with the title counted three times, so title matches outrank passing mentions. */
const k1 = 1.2;
const b = 0.75;
const titleWeight = 3;
/* Multi-word queries that appear in order in a title, like "ai buil", get a boost. */
export const phraseBoost = 1.5;

const indexed = searchDocs.map((doc) => {
  const terms = [
    ...Array.from({ length: titleWeight }, () => tokenize(doc.title)).flat(),
    ...tokenize(doc.snippet),
    ...tokenize(doc.keywords ?? "")
  ];
  const tf = new Map<string, number>();
  terms.forEach((term) => tf.set(term, (tf.get(term) ?? 0) + 1));
  return { doc, tf, length: terms.length, titleText: ` ${words(doc.title).join(" ")} ` };
});

const averageLength = indexed.reduce((sum, entry) => sum + entry.length, 0) / indexed.length;
const documentFrequency = new Map<string, number>();
indexed.forEach((entry) => entry.tf.forEach((_, term) => documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)));
const vocabulary = Array.from(documentFrequency.keys());

const idf = (term: string) => {
  const df = documentFrequency.get(term) ?? 0;
  return Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
};

/* The last word may still be mid-typing, so it also matches as a prefix. */
export function queryTerms(query: string) {
  const exact = Array.from(new Set(tokenize(query)));
  const typed = words(query);
  const last = /[a-z0-9]$/i.test(query) ? typed[typed.length - 1] : undefined;
  const prefix = last && last.length >= 2 && !stopwords.has(last) ? last : undefined;
  return { exact: prefix ? exact.filter((term) => term !== stem(prefix)) : exact, prefix };
}

export function runSearch(query: string, limit = 8) {
  const started = performance.now();
  const { exact, prefix } = queryTerms(query);
  const prefixTerms = prefix ? vocabulary.filter((term) => term.startsWith(prefix) || term === stem(prefix)) : [];
  const typed = words(query);
  const phrase = typed.length >= 2 ? ` ${typed.join(" ")}${prefix ? "" : " "}` : undefined;
  const hits: SearchHit[] = [];

  for (const entry of indexed) {
    const termScore = (term: string) => {
      const frequency = entry.tf.get(term) ?? 0;
      if (!frequency) return 0;
      return idf(term) * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * entry.length / averageLength));
    };
    let score = 0;
    const matched: string[] = [];
    for (const term of exact) {
      const value = termScore(term);
      if (value > 0) { score += value; matched.push(term); }
    }
    let bestPrefix = 0;
    let bestPrefixTerm = "";
    for (const term of prefixTerms) {
      const value = termScore(term);
      if (value > bestPrefix) { bestPrefix = value; bestPrefixTerm = term; }
    }
    if (bestPrefix > 0) { score += bestPrefix; matched.push(bestPrefixTerm); }
    const inTitle = Boolean(phrase && entry.titleText.includes(phrase));
    if (inTitle) score *= phraseBoost;
    if (score > 0) hits.push({ doc: entry.doc, score, matched, phrase: inTitle });
  }

  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, limit), total: hits.length, seconds: (performance.now() - started) / 1000 };
}

export function matchesTerm(word: string, terms: string[], prefix?: string) {
  const [token] = tokenize(word);
  if (!token) return false;
  return terms.includes(token) || Boolean(prefix && word.toLowerCase().startsWith(prefix));
}
