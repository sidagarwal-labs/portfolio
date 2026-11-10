/* Which outside links open in the Lab OS Reader. Kept small because every site page imports it for link routing;
   the summaries themselves live in readerArticles.ts and load with the Reader app. */
export type ReaderArticleId = "copilot" | "powerbi" | "engage" | "connectors";

export type ReaderSource = {
  id: ReaderArticleId;
  /* Canonical link, used for "Open original". */
  url: string;
  /* Every link on the site that points at this source. */
  aliases: string[];
};

export const readerSources: ReaderSource[] = [
  {
    id: "copilot",
    url: "https://www.microsoft.com/en-us/microsoft-365-copilot",
    aliases: ["https://www.microsoft.com/en-us/copilot"]
  },
  {
    id: "powerbi",
    url: "https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction",
    aliases: []
  },
  {
    id: "engage",
    url: "https://techcommunity.microsoft.com/blog/viva_engage_blog/viva-engage-public-content-is-now-available-in-microsoft-365-copilot/4443512",
    aliases: []
  },
  {
    id: "connectors",
    url: "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-copilot-connector",
    aliases: ["https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-copilot-connector"]
  }
];

const linkKey = (url: URL) => `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();

const byKey = new Map(readerSources.flatMap((source) => [source.url, ...source.aliases].map((href) => [linkKey(new URL(href)), source.id] as const)));

/* Matches host and path only, so tracking parameters and anchors still open the summary. */
export function findReaderArticle(href: string): ReaderArticleId | undefined {
  try {
    return byKey.get(linkKey(new URL(href)));
  } catch {
    return undefined;
  }
}
