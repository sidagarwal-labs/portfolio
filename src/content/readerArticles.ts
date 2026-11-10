import { readerSources, type ReaderArticleId } from "./readerLinks";

export type ReaderSection = { title: string; text?: string; items?: string[] };

export type ReaderArticle = {
  id: ReaderArticleId;
  title: string;
  sourceTitle: string;
  publisher: string;
  url: string;
  /* When the source says it was last updated, if it says. */
  updated?: string;
  lede: string;
  /* How the source relates to Sid's work, matching the resume. */
  role: string;
  sections: ReaderSection[];
};

const urlFor = (id: ReaderArticleId) => readerSources.find((source) => source.id === id)!.url;

/* Original summaries written for this site from the linked sources; not Microsoft's text. */
export const readerArticles: ReaderArticle[] = [
  {
    id: "copilot",
    title: "Microsoft 365 Copilot",
    sourceTitle: "Microsoft 365 Copilot product page",
    publisher: "Microsoft",
    url: urlFor("copilot"),
    lede: "Microsoft's AI assistant for work: chat and multi-step tasks grounded in a person's work context, built into the Microsoft 365 apps.",
    role: "I'm a Senior Product Manager on Microsoft 365 Copilot's Quality & Relevance team, working on retrieval quality for files and connectors.",
    sections: [
      { title: "Where it shows up", text: "Copilot is built into Word, Excel, PowerPoint, Outlook, and Teams, and works across desktop, web, and mobile. The product page describes a Home view that brings Chat together with Cowork, a mode for handing off multi-step work across apps and data; Home is listed as part of Microsoft's Frontier program." },
      { title: "Grounded in work context", text: "Answers are grounded in the organization through what Microsoft calls Work IQ: the people, roles, and projects behind a request. In practice that grounding depends on retrieval, finding the right files, messages, and connected content for each question." },
      { title: "Several models, chosen per request", text: "Copilot offers several leading AI models in one place. An Auto setting weighs accuracy, speed, and cost to pick the model and the amount of effort for each request." },
      { title: "Agents and security", items: ["Agent Builder creates work-grounded agents from a natural-language description; Copilot Studio extends and manages them at scale.", "Copilot runs on the existing Microsoft 365 enterprise controls and keeps work and personal accounts separate."] },
      { title: "Go deeper", text: "The product page lists plans for enterprises, businesses, and individuals, along with pricing and current availability. Use the original for anything you plan to buy or deploy." }
    ]
  },
  {
    id: "powerbi",
    title: "Copilot in Power BI",
    sourceTitle: "Copilot for Power BI overview",
    publisher: "Microsoft Learn",
    url: urlFor("powerbi"),
    updated: "2026-08-31",
    lede: "A conversational layer for working with reports and business data, with tools for both the people reading the numbers and the people building the models.",
    role: "On Microsoft Search Relevance, I helped make Power BI a content source for Copilot and Microsoft 365 Search. This overview covers Copilot's Power BI experiences more broadly.",
    sections: [
      { title: "From a report to a conversation", text: "Copilot can summarize a report, answer follow-up questions, and explore the data behind a visual. For questions about model data, the semantic model is the foundation of the answer." },
      { title: "More than one place to work", items: ["The report pane focuses on the report that is already open.", "The standalone experience, a preview in the source, helps find and analyze reports and semantic models a person can access.", "Copilot in apps, also a preview, works with the content curated inside a Power BI app."] },
      { title: "Tools for report builders", text: "Authoring features help create report pages, write DAX queries, generate narrative summaries, and describe measures. Availability depends on the specific experience and the current product requirements." },
      { title: "Data preparation still matters", text: "The documentation stresses preparing the semantic model for AI. Clear structure and business context make a difference, and a fluent answer is not a substitute for checking the underlying data." },
      { title: "Go deeper", text: "The original includes setup guidance, licensing and capacity requirements, prompt limits, and current limitations." }
    ]
  },
  {
    id: "engage",
    title: "Viva Engage in Microsoft 365 Copilot",
    sourceTitle: "Viva Engage public content is now available in Microsoft 365 Copilot",
    publisher: "Microsoft Tech Community",
    url: urlFor("engage"),
    lede: "Public conversations in a company's Viva Engage network became a source Copilot can answer from, starting with Q&A and expanding to discussion posts.",
    role: "On Microsoft Search Relevance, I helped make Viva Engage a content source for Copilot and Microsoft 365 Search.",
    sections: [
      { title: "What Copilot can draw on", text: "Only public content: discussion posts in public communities, events, Answers, and Storylines. Leadership posts and everyday questions become findable without people having to remember which community they were in." },
      { title: "How it shows up", text: "When Engage has relevant information for a question, Copilot can highlight it in the response. Engage content is also available to agents such as Researcher, where a person can limit the sources to Viva Engage." },
      { title: "Prompts that work well", items: ["Catching up on what was missed in Engage over the last two weeks.", "Finding what a particular coworker posted recently.", "Asking what people are saying about a topic, or how they are reacting to a company strategy.", "Naming Engage in the prompt helps Copilot use it."] },
      { title: "Go deeper", text: "The post links to Microsoft's support documentation and asks for feedback through the thumbs up and down buttons in Copilot." }
    ]
  },
  {
    id: "connectors",
    title: "Microsoft 365 Copilot connectors",
    sourceTitle: "Microsoft 365 Copilot connectors overview",
    publisher: "Microsoft Learn",
    url: urlFor("connectors"),
    updated: "2026-09-30",
    lede: "A way to bring knowledge from business systems into the places people search and ask questions, so they don't need to know which system holds the answer.",
    role: "I drove retrieval quality for Copilot connectors from 2023 to 2026 and now work on retrieval quality for files and connectors.",
    sections: [
      { title: "Knowledge beyond Microsoft 365", text: "Connectors make external organizational content available to supported Microsoft search and Copilot experiences. They integrate content; they do not make restricted information public." },
      { title: "Two approaches to retrieval", items: ["Synced connectors ingest and index external content into Microsoft Graph.", "Federated connectors fetch information from the source at query time through MCP, without copying it into the Graph index."] },
      { title: "From content to answers", text: "Indexed content can take part in semantic retrieval and in the answers Copilot writes. Federated connections can instead answer with current information from the connected service. Supported experiences and configuration differ between the two models." },
      { title: "Implementation details matter", text: "Authentication, permissions, availability, and packaging depend on the connector type, and Microsoft keeps connector guidance separate from authentication guidance for other plugin and agent integrations." },
      { title: "Go deeper", text: "The official overview has the detailed capability comparison, the connector gallery, prerequisites, and links for building your own synced connector." }
    ]
  }
];

const wordsPerMinute = 200;

export function readingMinutes(article: ReaderArticle) {
  const text = [article.lede, ...article.sections.flatMap((section) => [section.title, section.text ?? "", ...(section.items ?? [])])].join(" ");
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / wordsPerMinute));
}
