import { useEffect, useState } from "react";
import snapshot from "../../content/generated/leaderboards.json";

export type ArenaRow = { rank: number; model: string; org: string; license: string; score: number; lower: number; upper: number; votes: number };
export type BenchmarkRow = { model: string; org: string; score: number; error?: number; low?: number; high?: number; date: string; detail?: string };
export type Benchmark = { id: string; name: string; blurb: string; unit: "percent" | "index" | "minutes"; href: string; rows: BenchmarkRow[] };
/* One ECI-scored release; low and high bound Epoch's credible interval when it has one. */
export type LabRelease = { model: string; date: string; eci: number; low?: number; high?: number };
export type Lab = { org: string; models: LabRelease[] };
type Snapshot = {
  generatedAt: string;
  arena: { publishedAt: string; boards: Record<string, ArenaRow[]> };
  epoch: { fetchedAt: string; benchmarks: Benchmark[]; labs?: Lab[] };
};

/* Written by scripts/update-leaderboards.mjs (refreshed by the daily deploy). */
export const leaderboards = snapshot as Snapshot;
export const labs = leaderboards.epoch.labs ?? [];

export const arenaBoards = [
  { id: "text_style_control", label: "Text", name: "Text Arena", path: "text", blurb: "Chat and reasoning prompts, with style control so longer or more heavily formatted answers do not win on presentation alone." },
  { id: "webdev", label: "WebDev", name: "WebDev Arena", path: "webdev", blurb: "Models build a working web app from the same prompt, and people vote on the result." },
  { id: "vision_style_control", label: "Vision", name: "Vision Arena", path: "vision", blurb: "Prompts that include images such as charts, screenshots, photos, and documents. Style controlled." },
  { id: "search_style_control", label: "Search", name: "Search Arena", path: "search", blurb: "Search-grounded answers with citations, judged head to head. Style controlled." },
  { id: "text_to_image", label: "Image", name: "Text-to-Image Arena", path: "text-to-image", blurb: "Image generation from a text prompt, compared side by side." }
] as const;

export type ArenaBoard = typeof arenaBoards[number];

export const arenaHref = (board: ArenaBoard) => `https://arena.ai/leaderboard/${board.path}`;

const arenaEndpoint = "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&split=latest&offset=0&length=100&config=";
const arenaTtl = 3 * 60 * 60 * 1000;
const arenaRetry = 15 * 60 * 1000;

type ArenaApiRow = {
  model_name?: unknown; organization?: unknown; license?: unknown; rating?: unknown; rating_lower?: unknown;
  rating_upper?: unknown; vote_count?: unknown; rank?: unknown; category?: unknown; leaderboard_publish_date?: unknown;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown) => typeof value === "string" ? value : "";
const tenth = (value: number) => Math.round(value * 10) / 10;

/* Keep in sync with arenaRowsFromPayload in scripts/update-leaderboards.mjs. */
export function arenaRowsFromPayload(payload: unknown): { rows: ArenaRow[]; publishedAt: string } {
  const items = (payload as { rows?: { row?: ArenaApiRow }[] } | null)?.rows;
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => item?.row)
    .filter((row): row is ArenaApiRow & { rating: number; rank: number; model_name: string } =>
      row?.category === "overall" && finite(row.rating) && finite(row.rank) && typeof row.model_name === "string")
    .sort((a, b) => a.rank - b.rank || b.rating - a.rating)
    .slice(0, 20);
  return {
    publishedAt: text(rows[0]?.leaderboard_publish_date),
    rows: rows.map((row) => ({
      rank: row.rank,
      model: row.model_name,
      org: text(row.organization),
      license: text(row.license),
      score: tenth(row.rating),
      lower: tenth(finite(row.rating_lower) ? row.rating_lower : row.rating),
      upper: tenth(finite(row.rating_upper) ? row.rating_upper : row.rating),
      votes: finite(row.vote_count) ? row.vote_count : 0
    }))
  };
}

type ArenaCache = { fetchedAt: number; publishedAt: string; rows: ArenaRow[]; retryAt?: number };
export type ArenaBoardState = { rows: ArenaRow[]; publishedAt: string; source: "live" | "snapshot"; loading: boolean };

const cacheKey = (board: string) => `arena-board-v1:${board}`;

function readArenaCache(board: string): ArenaCache | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(board)) ?? "null");
    if (!cached || !Number.isFinite(cached.fetchedAt) || !Array.isArray(cached.rows)) return null;
    if (cached.retryAt !== undefined && !Number.isFinite(cached.retryAt)) return null;
    const rows = (cached.rows as ArenaRow[]).filter((row) => typeof row?.model === "string" && finite(row.score) && finite(row.rank));
    return { fetchedAt: cached.fetchedAt, publishedAt: text(cached.publishedAt), rows, retryAt: cached.retryAt };
  } catch {
    return null;
  }
}

function writeArenaCache(board: string, value: ArenaCache) {
  try {
    localStorage.setItem(cacheKey(board), JSON.stringify(value));
  } catch {
    /* Storage can be full or blocked; the board still renders. */
  }
}

const snapshotState = (board: string): ArenaBoardState =>
  ({ rows: leaderboards.arena.boards[board] ?? [], publishedAt: leaderboards.arena.publishedAt, source: "snapshot", loading: false });

function initialState(board: string): ArenaBoardState {
  const cached = readArenaCache(board);
  return cached?.rows.length
    ? { rows: cached.rows, publishedAt: cached.publishedAt, source: "live", loading: false }
    : { ...snapshotState(board), loading: true };
}

/* LMArena publishes its leaderboard as a Hugging Face dataset with CORS enabled, so the open board is read live
   (cached for a few hours). The build-time snapshot covers offline use and failed requests. */
export function useArenaBoard(board: string): ArenaBoardState {
  const [state, setState] = useState<ArenaBoardState>(() => initialState(board));

  useEffect(() => {
    const cached = readArenaCache(board);
    const now = Date.now();
    const fresh = cached && (cached.retryAt ? now < cached.retryAt : now - cached.fetchedAt >= 0 && now - cached.fetchedAt < arenaTtl);
    if (fresh) {
      setState(cached.rows.length ? { rows: cached.rows, publishedAt: cached.publishedAt, source: "live", loading: false } : snapshotState(board));
      return;
    }
    setState(initialState(board));

    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    fetch(arenaEndpoint + encodeURIComponent(board), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const { rows, publishedAt } = arenaRowsFromPayload(payload);
        if (!rows.length) throw new Error("No rows");
        writeArenaCache(board, { fetchedAt: Date.now(), publishedAt, rows });
        if (active) setState({ rows, publishedAt, source: "live", loading: false });
      })
      .catch(() => {
        if (!active) return;
        writeArenaCache(board, { fetchedAt: cached?.fetchedAt ?? 0, publishedAt: cached?.publishedAt ?? "", rows: cached?.rows ?? [], retryAt: Date.now() + arenaRetry });
        setState(cached?.rows.length ? { rows: cached.rows, publishedAt: cached.publishedAt, source: "live", loading: false } : snapshotState(board));
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [board]);

  return state;
}

const orgNames: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", meta: "Meta", xai: "xAI", deepseek: "DeepSeek",
  alibaba: "Alibaba", moonshot: "Moonshot", zai: "Z.ai", "z.ai": "Z.ai", mistral: "Mistral", amazon: "Amazon",
  microsoft: "Microsoft", nvidia: "NVIDIA", tencent: "Tencent", minimax: "MiniMax", bytedance: "ByteDance",
  "black forest labs": "Black Forest Labs", ideogram: "Ideogram", recraft: "Recraft", midjourney: "Midjourney"
};

export const orgName = (org: string) => orgNames[org.toLowerCase()] ?? (org ? org.charAt(0).toUpperCase() + org.slice(1) : "");

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hr`;
}

export function formatScore(unit: Benchmark["unit"], value: number) {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "minutes") return formatMinutes(value);
  return value.toFixed(1);
}

export function formatUncertainty(unit: Benchmark["unit"], row: BenchmarkRow) {
  if (row.low !== undefined && row.high !== undefined) return `${formatScore(unit, row.low)} to ${formatScore(unit, row.high)}`;
  if (row.error !== undefined) return `± ${unit === "percent" ? `${row.error.toFixed(1)} pts` : row.error.toFixed(1)}`;
  return "";
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function formatDay(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? dayFormat.format(new Date(time)) : value;
}
