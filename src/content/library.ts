import type { BookEntry } from "../types/content";
import { profileContent } from "./siteContent";

export type LibraryCategoryId = "markets" | "founders" | "ai" | "science";

export const libraryCategories: { id: LibraryCategoryId; label: string; blurb: string }[] = [
  { id: "markets", label: "Markets & investing", blurb: "Capital, cycles, and disciplined decisions under uncertainty." },
  { id: "founders", label: "Founders & companies", blurb: "How companies get built, scaled, and compounded." },
  { id: "ai", label: "AI, search & chips", blurb: "Models, retrieval, and the hardware underneath the AI buildout." },
  { id: "science", label: "Science & how to think", blurb: "Curiosity, decision rules, and clear communication." }
];

export type PodcastEntry = {
  slug: string;
  title: string;
  host: string;
  spotifyId: string;
  art: string;
  note: string;
  categories: LibraryCategoryId[];
};

const art = (id: string) => `https://i.scdn.co/image/${id}`;

export const podcasts: PodcastEntry[] = [
  { slug: "bg2pod", title: "BG2Pod", host: "Brad Gerstner & Bill Gurley", spotifyId: "3dVqgYXN29DwwnqdY3YsCk", art: art("ab6765630000ba8a0101546a15f4ab3ca4b46eaf"), note: "Two veteran investors debating tech, markets, and policy; a good read on how capital is thinking about AI.", categories: ["markets"] },
  { slug: "barrons-streetwise", title: "Barron's Streetwise", host: "Barron's · Jack Hough", spotifyId: "789fA35XhgcqPH0sjcpLu8", art: art("ab6765630000ba8a76530e1930bc59b40679f211"), note: "A weekly, plain-spoken tour of Wall Street stories with a columnist's skepticism.", categories: ["markets"] },
  { slug: "barrons-live", title: "Barron's Live", host: "Barron's", spotifyId: "2C8EsRTMe5kldoadWqPEii", art: art("ab6765630000ba8a24a269a2bebf33ca0e26c00b"), note: "Newsroom conversations for when markets move and I want context quickly.", categories: ["markets"] },
  { slug: "we-study-billionaires", title: "We Study Billionaires", host: "The Investor's Podcast Network", spotifyId: "28RHOkXkuHuotUrkCdvlOP", art: art("ab6765630000ba8a077975e1357f153fb4416827"), note: "Long-form investing conversations about business quality, valuation, and patience.", categories: ["markets"] },
  { slug: "thoughts-on-the-market", title: "Thoughts on the Market", host: "Morgan Stanley", spotifyId: "5cOfqdkomvzyhPTR7n6KFa", art: art("ab6765630000ba8af1ec584b9db05600aec26e66"), note: "Short notes from strategists that work as a quick macro calibration.", categories: ["markets"] },
  { slug: "acquired", title: "Acquired", host: "Ben Gilbert & David Rosenthal", spotifyId: "7Fj0XEuUQLUqoMZQdsLXqp", art: art("ab6765630000ba8af9bd7049cea88c23693d1d1d"), note: "Deep company histories; the best way I know to study how strategy compounds over decades.", categories: ["founders"] },
  { slug: "cheeky-pint", title: "Cheeky Pint", host: "Stripe · John Collison", spotifyId: "2IHbGJJMpiFoz5YrvRfTFw", art: art("ab6765630000ba8a4e17c9ab103213a1e8cb5235"), note: "Candid, specific conversations with founders and operators.", categories: ["founders"] },
  { slug: "how-i-built-this", title: "How I Built This", host: "Guy Raz", spotifyId: "6E709HRH7XaiZrMfgtNCun", art: art("ab6765630000ba8ab77aa3b59e9bae6001fca550"), note: "Origin stories that keep the messy middle of company building in view.", categories: ["founders"] },
  { slug: "masters-of-scale", title: "Masters of Scale", host: "WaitWhat", spotifyId: "1bJRgaFZHuzifad4IAApFR", art: art("ab6765630000ba8a19a147a6c90d95a7454aa977"), note: "Growth lessons from leaders who scaled companies, framed as reusable playbooks.", categories: ["founders"] },
  { slug: "dwarkesh-podcast", title: "Dwarkesh Podcast", host: "Dwarkesh Patel", spotifyId: "4JH4tybY1zX6e5hjCwU6gF", art: art("ab6765630000ba8aec6420b46053b5d1786dbe05"), note: "Unusually well-prepared interviews with AI researchers, historians, and builders.", categories: ["ai"] },
  { slug: "semianalysis-weekly", title: "SemiAnalysis Weekly", host: "SemiAnalysis", spotifyId: "3v4h96cG1kEufQENJn5Yu9", art: art("ab6765630000ba8a863bdfc9a075c7af339e990a"), note: "The supply-chain view of the AI buildout: chips, data centers, and the economics around them.", categories: ["ai"] },
  { slug: "semi-doped", title: "Semi Doped", host: "Vikram Sekar & Austin Lyons", spotifyId: "0Uuu3s1Nw09f6Xmg24rCZm", art: art("ab6765630000ba8acde3fd408b4a1a97750d4657"), note: "Chip-industry deep dives that connect process technology to business outcomes.", categories: ["ai"] },
  { slug: "hard-fork", title: "Hard Fork", host: "The New York Times", spotifyId: "44fllCS2FTFr2x2kjP9xeT", art: art("ab6765630000ba8a37a4c8e5a5f95c3a81f36eb7"), note: "A weekly pulse on tech and AI news, with enough skepticism to stay grounded.", categories: ["ai"] },
  { slug: "search-off-the-record", title: "Search Off the Record", host: "Google Search Central", spotifyId: "0wJdllV5ZK2FSxguDqQZKm", art: art("ab6765630000ba8a6ad89d11878b4a938bcaf8e7"), note: "Behind the scenes of how a web search engine works; close to my day job.", categories: ["ai"] },
  { slug: "future-of-everything", title: "The Future of Everything", host: "Stanford Engineering · Russ Altman", spotifyId: "2GWA2Y83w1j8wVa3pWaXsn", art: art("ab6765630000ba8ad250eb906c58793cb4a02904"), note: "Researchers on emerging science and engineering, one field at a time.", categories: ["science"] },
  { slug: "think-fast-talk-smart", title: "Think Fast Talk Smart", host: "Stanford GSB · Matt Abrahams", spotifyId: "6ll0MwobDt1JW9gYaOONEo", art: art("ab6765630000ba8aeb3cad87ca9039312ea461a5"), note: "Practical communication techniques I lean on for reviews and presentations.", categories: ["science"] }
];

const bookCategories: Record<string, LibraryCategoryId[]> = {
  "intelligent-investor": ["markets"],
  "trading-chaos": ["markets"],
  "changing-world-order": ["markets"],
  "steve-jobs": ["founders"],
  "elon-musk": ["founders"],
  "zero-to-one": ["founders"],
  "nvidia-way": ["founders", "ai"],
  "the-innovators": ["ai"],
  "algorithms-to-live-by": ["science"],
  "stuff-matters": ["science"],
  "hitchhikers-guide": ["science"]
};

export type LibraryItem =
  | ({ kind: "book"; categories: LibraryCategoryId[] } & BookEntry)
  | ({ kind: "podcast" } & PodcastEntry);

export const spotifyShowUrl = (id: string) => `https://open.spotify.com/show/${id}`;
export const spotifyEmbedUrl = (id: string) => `https://open.spotify.com/embed/show/${id}`;

const categoryOrder = libraryCategories.map((category) => category.id);
const primaryRank = (item: LibraryItem) => categoryOrder.indexOf(item.categories[0]);

export const libraryItems: LibraryItem[] = [
  ...profileContent.books.map((book): LibraryItem => ({ kind: "book", ...book, categories: bookCategories[book.slug] ?? ["science"] })),
  ...podcasts.map((podcast): LibraryItem => ({ kind: "podcast", ...podcast }))
].sort((a, b) => primaryRank(a) - primaryRank(b));

export const libraryItemHref = (item: LibraryItem) => (item.kind === "book" ? item.href : spotifyShowUrl(item.spotifyId));

const comparable = (url: URL) => `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;

/* The Library entry a link points at (a Spotify show or one of the books' Amazon pages), ignoring tracking parameters. */
export function findLibraryItem(href: string): LibraryItem | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  const show = url.hostname === "open.spotify.com" ? url.pathname.match(/^\/(?:embed\/)?show\/([A-Za-z0-9]+)/)?.[1] : undefined;
  if (show) return libraryItems.find((item) => item.kind === "podcast" && item.spotifyId === show);
  const target = comparable(url);
  return libraryItems.find((item) => item.kind === "book" && comparable(new URL(item.href)) === target);
}
