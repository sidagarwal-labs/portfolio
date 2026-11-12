import { Activity, Blocks, Bomb, BookOpen, BrainCircuit, BriefcaseBusiness, Calculator, ChartCandlestick, Database, FileText, Folder, GitGraph, LibraryBig, ListOrdered, MessageSquareText, Newspaper, NotebookText, Rocket, ScanSearch, Search, Settings, SquareTerminal, Trash2, Trophy, Worm, type LucideIcon } from "lucide-react";
import { selectedProjects } from "../../../content/journalContent";
import type { SiteView } from "../siteViews";

export type AppId =
  | "search" | "library" | "github" | "reader" | "journal" | "forward" | "training" | "terminal"
  | "resume" | "readme" | "designs" | "games" | "markets" | "launches" | "leaderboards"
  | "snake" | "mines" | "rankit" | "nexttoken" | "blocks"
  | "projects" | "arxiv" | "nvdocs" | "hireme" | "finmodels" | "settings" | "recyclebin";

export type AppDef = {
  id: AppId;
  /* Window title. */
  title: string;
  /* Icon label. */
  label: string;
  blurb: string;
  icon: LucideIcon;
  /* Modern icon tile background. */
  tint: string;
  view?: SiteView;
  /* Site page the window opens on (defaults to the home page). */
  path?: string;
  /* Preferred window size; "fill" takes the desktop beside the icons. */
  size: { w: number; h: number } | "fill";
} & (
  | { kind: "folder"; children: AppId[] }
  /* "link": a shortcut with no window of its own; it opens another app on a target, like a repository in GitHub. */
  | { kind: "link"; opens: { app: AppId; target: string } }
  /* "app": a native React app inside the OS (no iframe), which links can open on a specific item. */
  | { kind: "site" | "pdf" | "note" | "game" | "app" }
);

const app = (def: AppDef) => def;

const githubSize = { w: 1180, h: 820 };

/* A selected project from the Journal, as a shortcut to its repository in the GitHub app. */
function repoLink(id: AppId, title: string, icon: LucideIcon, tint: string): AppDef {
  const project = selectedProjects.find((item) => item.title === title);
  const repo = project ? new URL(project.href).pathname.replace(/^\/|\/$/g, "") : "";
  return { id, title, label: title, blurb: project?.description ?? "", icon, tint, kind: "link", opens: { app: "github", target: repo }, size: githubSize };
}

export const apps: Record<AppId, AppDef> = {
  recyclebin: app({ id: "recyclebin", title: "Recycle Bin", label: "Recycle Bin", blurb: "Restore deleted folders and everything inside them.", icon: Trash2, tint: "linear-gradient(145deg, #7d8b9b, #445365)", kind: "app", size: { w: 600, h: 440 } }),
  search: app({ id: "search", title: "Sid Search", label: "Sid Search", blurb: "Projects, writing, and background as a search engine.", icon: Search, tint: "linear-gradient(145deg, #4c7df0, #2a4fbf)", kind: "site", view: "search", size: "fill" }),
  library: app({ id: "library", title: "Library", label: "Library", blurb: "Books and podcasts I keep coming back to, grouped by topic.", icon: LibraryBig, tint: "linear-gradient(145deg, #d9825b, #9c4a2c)", kind: "app", size: { w: 1060, h: 780 } }),
  github: app({ id: "github", title: "GitHub", label: "GitHub", blurb: "My GitHub year as data: contribution heatmap, stats, and four models of the activity. Look up any user.", icon: GitGraph, tint: "linear-gradient(145deg, #5b6bd6, #2b347f)", kind: "app", size: githubSize }),
  reader: app({ id: "reader", title: "Reader", label: "Reader", blurb: "Short summaries of the Microsoft 365 Copilot, Power BI, Viva Engage, and connector work I've shipped, with links to the originals.", icon: Newspaper, tint: "linear-gradient(145deg, #5f8fb4, #2d5674)", kind: "app", size: { w: 900, h: 760 } }),
  journal: app({ id: "journal", title: "Journal", label: "Journal", blurb: "The original site: quiet and text-first.", icon: BookOpen, tint: "linear-gradient(145deg, #3f8f74, #245b4b)", kind: "site", view: "journal", size: { w: 980, h: 780 } }),
  forward: app({ id: "forward", title: "Forward pass", label: "Forward pass", blurb: "The site as a transformer: tokens, attention, next token.", icon: BrainCircuit, tint: "linear-gradient(145deg, #a66bf0, #6b3fc4)", kind: "site", view: "forward", size: { w: 1100, h: 800 } }),
  training: app({ id: "training", title: "Training run", label: "Training run", blurb: "A portfolio notebook with a real, locally trained tiny model.", icon: Activity, tint: "linear-gradient(145deg, #f0a24c, #c46a1f)", kind: "site", view: "training", size: { w: 1060, h: 800 } }),
  terminal: app({ id: "terminal", title: "Terminal", label: "Terminal", blurb: "A market terminal for my work and research.", icon: SquareTerminal, tint: "linear-gradient(145deg, #3a4150, #161a22)", kind: "site", view: "terminal", size: { w: 1140, h: 800 } }),
  resume: app({ id: "resume", title: "Resume.pdf", label: "Resume.pdf", blurb: "One page: experience, education, and skills.", icon: FileText, tint: "linear-gradient(145deg, #ef6b6b, #c43f3f)", kind: "pdf", size: { w: 800, h: 980 } }),
  readme: app({ id: "readme", title: "README.txt", label: "README.txt", blurb: "What this is and where to start.", icon: NotebookText, tint: "linear-gradient(145deg, #f1c053, #c99418)", kind: "note", size: { w: 540, h: 520 } }),
  designs: app({ id: "designs", title: "Other designs", label: "Other designs", blurb: "Training run, Terminal, and Journal: other ways to explore the portfolio.", icon: Folder, tint: "linear-gradient(145deg, #f1c053, #c99418)", kind: "folder", children: ["training", "terminal", "journal"], size: { w: 580, h: 350 } }),
  games: app({ id: "games", title: "Games", label: "Games", blurb: "Snake, Mines, Blocks, and two machine-learning games.", icon: Folder, tint: "linear-gradient(145deg, #5dbf78, #2f8a4b)", kind: "folder", children: ["snake", "mines", "blocks", "rankit", "nexttoken"], size: { w: 580, h: 350 } }),
  projects: app({ id: "projects", title: "Projects", label: "Projects", blurb: "NVDocs RAG, HireMe.AI, Financial models, and Reader.", icon: Folder, tint: "linear-gradient(145deg, #e0699f, #a63a6e)", kind: "folder", children: ["nvdocs", "hireme", "finmodels", "reader"], size: { w: 580, h: 330 } }),
  arxiv: app({ id: "arxiv", title: "arXiv Search", label: "arXiv Search", blurb: "Hybrid search with LLM reranking over 23,304 arXiv papers: nDCG@10 from 0.51 to 0.84.", icon: ScanSearch, tint: "linear-gradient(145deg, #d6453d, #9c1f1f)", kind: "app", size: { w: 1080, h: 820 } }),
  nvdocs: repoLink("nvdocs", "NVDocs RAG", Database, "linear-gradient(145deg, #86c34a, #4a8a1c)"),
  hireme: repoLink("hireme", "HireMe.AI", BriefcaseBusiness, "linear-gradient(145deg, #8f7ae6, #5540b0)"),
  finmodels: repoLink("finmodels", "Financial models", Calculator, "linear-gradient(145deg, #3fa889, #1f6e57)"),
  blocks: app({ id: "blocks", title: "Blocks", label: "Blocks", blurb: "A Tetris-style falling-block puzzle with original visuals.", icon: Blocks, tint: "linear-gradient(145deg, #a487de, #5d428c)", kind: "game", size: { w: 440, h: 820 } }),
  markets: app({ id: "markets", title: "Markets", label: "Markets", blurb: "The AI / LLM stack I track, layer by layer, with charts, financials, and news for each company.", icon: ChartCandlestick, tint: "linear-gradient(145deg, #4cb5ba, #22616f)", kind: "site", view: "journal", path: "/markets", size: { w: 1180, h: 820 } }),
  launches: app({ id: "launches", title: "SpaceX launches", label: "Launches", blurb: "A SpaceX launch tracker with countdowns, live streams, and replays.", icon: Rocket, tint: "linear-gradient(145deg, #4f5b86, #1b2140)", kind: "site", view: "journal", path: "/launches", size: { w: 1120, h: 820 } }),
  leaderboards: app({ id: "leaderboards", title: "AI leaderboards", label: "AI leaderboards", blurb: "Arena rankings and frontier benchmark results, kept current.", icon: Trophy, tint: "linear-gradient(145deg, #e0b04a, #a8741b)", kind: "site", view: "journal", path: "/leaderboards", size: { w: 1080, h: 820 } }),
  snake: app({ id: "snake", title: "Snake", label: "Snake", blurb: "Eat tokens, grow your context window.", icon: Worm, tint: "linear-gradient(145deg, #5dbf78, #2f8a4b)", kind: "game", size: { w: 440, h: 650 } }),
  mines: app({ id: "mines", title: "Mines", label: "Mines", blurb: "Classic minesweeper, 9 by 9.", icon: Bomb, tint: "linear-gradient(145deg, #7b8494, #4a5160)", kind: "game", size: { w: 420, h: 580 } }),
  rankit: app({ id: "rankit", title: "Rank It", label: "Rank It", blurb: "Beat Sid's arXiv search engine: rank real papers, scored with nDCG.", icon: ListOrdered, tint: "linear-gradient(145deg, #4cc3d9, #1f8aa3)", kind: "game", size: { w: 640, h: 700 } }),
  settings: app({ id: "settings", title: "Settings", label: "Settings", blurb: "Wallpaper, style, clock, motion, and full-page views for this PC, plus a reset and its specs.", icon: Settings, tint: "linear-gradient(145deg, #8a94a6, #4f5869)", kind: "app", size: { w: 760, h: 700 } }),
  nexttoken: app({ id: "nexttoken", title: "Next Token", label: "Next Token", blurb: "Guess a real model's next token, then run it live.", icon: MessageSquareText, tint: "linear-gradient(145deg, #e86fae, #b23f7c)", kind: "game", size: { w: 640, h: 680 } })
};

export const desktopRows: AppId[][] = [
  ["search", "library", "github"],
  ["projects", "arxiv"],
  ["forward", "designs"],
  ["games", "markets", "launches", "leaderboards"]
];
export const desktopDocuments: AppId[] = ["resume", "readme", "recyclebin"];
export const desktopApps: AppId[] = [...desktopRows.flat(), ...desktopDocuments];

export type MenuSection = { label: string; items: AppId[] };

/* Reader lives in the Projects folder; Microsoft links still open it directly. */
const menuApps = desktopRows.flat();
const isFolder = (id: AppId) => apps[id].kind === "folder";

/* The Start menu and the phone home screen, built from the desktop groups: apps, then folders, then documents.
   Settings is menu-only, so it never shifts a saved desktop layout. */
export const menuSections: MenuSection[] = [
  { label: "Apps", items: [...menuApps.filter((id) => !isFolder(id)), ...menuApps.filter(isFolder)] },
  { label: "Documents", items: desktopDocuments },
  { label: "System", items: ["settings"] }
];

export function folderApps(id: AppId): AppId[] {
  const def = apps[id];
  return def.kind === "folder" ? def.children : [];
}
