import { Activity, Blocks, Bomb, BookOpen, BrainCircuit, ChartCandlestick, FileText, Folder, ListOrdered, MessageSquareText, NotebookText, Rocket, Search, SquareTerminal, Trophy, Worm, type LucideIcon } from "lucide-react";
import type { SiteView } from "../siteViews";

export type AppId =
  | "search" | "journal" | "forward" | "training" | "terminal"
  | "resume" | "readme" | "games" | "markets" | "launches" | "leaderboards"
  | "snake" | "mines" | "rankit" | "nexttoken" | "blocks";

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
  kind: "site" | "pdf" | "note" | "folder" | "game";
  view?: SiteView;
  /* Site page the window opens on (defaults to the home page). */
  path?: string;
  /* Preferred window size; "fill" takes the desktop beside the icon column. */
  size: { w: number; h: number } | "fill";
};

const app = (def: AppDef) => def;

export const apps: Record<AppId, AppDef> = {
  search: app({ id: "search", title: "Sid Search", label: "Sid Search", blurb: "Projects, writing, and background as a search engine.", icon: Search, tint: "linear-gradient(145deg, #4c7df0, #2a4fbf)", kind: "site", view: "search", size: "fill" }),
  journal: app({ id: "journal", title: "Journal", label: "Journal", blurb: "The original site: quiet and text-first.", icon: BookOpen, tint: "linear-gradient(145deg, #3f8f74, #245b4b)", kind: "site", view: "journal", size: { w: 980, h: 780 } }),
  forward: app({ id: "forward", title: "Forward pass", label: "Forward pass", blurb: "The site as a transformer: tokens, attention, next token.", icon: BrainCircuit, tint: "linear-gradient(145deg, #a66bf0, #6b3fc4)", kind: "site", view: "forward", size: { w: 1100, h: 800 } }),
  training: app({ id: "training", title: "Training run", label: "Training run", blurb: "A portfolio notebook with a real, locally trained tiny model.", icon: Activity, tint: "linear-gradient(145deg, #f0a24c, #c46a1f)", kind: "site", view: "training", size: { w: 1060, h: 800 } }),
  terminal: app({ id: "terminal", title: "Terminal", label: "Terminal", blurb: "A market terminal for my work and research.", icon: SquareTerminal, tint: "linear-gradient(145deg, #3a4150, #161a22)", kind: "site", view: "terminal", size: { w: 1140, h: 800 } }),
  resume: app({ id: "resume", title: "Resume.pdf", label: "Resume.pdf", blurb: "One page: experience, education, and skills.", icon: FileText, tint: "linear-gradient(145deg, #ef6b6b, #c43f3f)", kind: "pdf", size: { w: 800, h: 980 } }),
  readme: app({ id: "readme", title: "README.txt", label: "README.txt", blurb: "What this is and where to start.", icon: NotebookText, tint: "linear-gradient(145deg, #f1c053, #c99418)", kind: "note", size: { w: 540, h: 520 } }),
  games: app({ id: "games", title: "Games", label: "Games", blurb: "Snake, Mines, Blocks, and two machine-learning games.", icon: Folder, tint: "linear-gradient(145deg, #5dbf78, #2f8a4b)", kind: "folder", size: { w: 580, h: 350 } }),
  blocks: app({ id: "blocks", title: "Blocks", label: "Blocks", blurb: "A Tetris-style falling-block puzzle with original visuals.", icon: Blocks, tint: "linear-gradient(145deg, #a487de, #5d428c)", kind: "game", size: { w: 440, h: 820 } }),
  markets: app({ id: "markets", title: "Markets", label: "Markets", blurb: "Charts, volume, financials, and news for the AI companies I follow.", icon: ChartCandlestick, tint: "linear-gradient(145deg, #4cb5ba, #22616f)", kind: "site", view: "journal", path: "/markets", size: { w: 1180, h: 820 } }),
  launches: app({ id: "launches", title: "SpaceX launches", label: "Launches", blurb: "A SpaceX launch tracker with countdowns, live streams, and replays.", icon: Rocket, tint: "linear-gradient(145deg, #4f5b86, #1b2140)", kind: "site", view: "journal", path: "/launches", size: { w: 1120, h: 820 } }),
  leaderboards: app({ id: "leaderboards", title: "AI leaderboards", label: "AI leaderboards", blurb: "Arena rankings and frontier benchmark results, kept current.", icon: Trophy, tint: "linear-gradient(145deg, #e0b04a, #a8741b)", kind: "site", view: "journal", path: "/leaderboards", size: { w: 1080, h: 820 } }),
  snake: app({ id: "snake", title: "Snake", label: "Snake", blurb: "Eat tokens, grow your context window.", icon: Worm, tint: "linear-gradient(145deg, #5dbf78, #2f8a4b)", kind: "game", size: { w: 440, h: 650 } }),
  mines: app({ id: "mines", title: "Mines", label: "Mines", blurb: "Classic minesweeper, 9 by 9.", icon: Bomb, tint: "linear-gradient(145deg, #7b8494, #4a5160)", kind: "game", size: { w: 420, h: 580 } }),
  rankit: app({ id: "rankit", title: "Rank It", label: "Rank It", blurb: "Order search results and get scored with nDCG.", icon: ListOrdered, tint: "linear-gradient(145deg, #4cc3d9, #1f8aa3)", kind: "game", size: { w: 640, h: 700 } }),
  nexttoken: app({ id: "nexttoken", title: "Next Token", label: "Next Token", blurb: "Guess the next word, then see the softmax.", icon: MessageSquareText, tint: "linear-gradient(145deg, #e86fae, #b23f7c)", kind: "game", size: { w: 620, h: 620 } })
};

export const desktopApps: AppId[] = ["search", "journal", "forward", "training", "terminal", "resume", "markets", "launches", "leaderboards", "games", "readme"];

export const gameApps: AppId[] = ["snake", "mines", "blocks", "rankit", "nexttoken"];

export const phoneApps: AppId[] = ["search", "journal", "forward", "training", "terminal", "resume", "markets", "launches", "leaderboards", "readme", ...gameApps];
