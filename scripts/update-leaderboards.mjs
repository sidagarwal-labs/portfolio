#!/usr/bin/env node
/*
 * Refreshes src/content/generated/leaderboards.json from two public sources:
 *   - LMArena's leaderboard dataset on Hugging Face (also fetched live in the browser; this is the fallback snapshot)
 *   - Epoch AI's benchmark hub export (CC BY 4.0; no CORS, so it can only be fetched at build time)
 * A source that fails keeps its previous snapshot, and the script still exits 0 so a deploy never breaks.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "src/content/generated/leaderboards.json");
const epochZip = "https://epoch.ai/data/benchmark_data.zip";
const arenaRows = "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&split=latest&offset=0&length=100&config=";
const topN = 10;
const arenaTopN = 20;

export const arenaBoards = ["text_style_control", "webdev", "vision_style_control", "search_style_control", "text_to_image"];

const benchmarks = [
  {
    id: "eci", name: "Epoch Capabilities Index", file: "epoch_capabilities_index/eci_scores.csv", kind: "eci", unit: "index",
    blurb: "Epoch's composite score that stitches dozens of benchmarks onto one scale, so models tested on different suites can be compared.",
    href: "https://epoch.ai/benchmarks/eci"
  },
  {
    id: "gpqa", name: "GPQA Diamond", file: "gpqa_diamond.csv", kind: "epoch", unit: "percent",
    blurb: "198 graduate-level biology, chemistry, and physics questions written so that skilled non-experts with web access still miss them.",
    href: "https://epoch.ai/benchmarks/gpqa-diamond"
  },
  {
    id: "frontiermath", name: "FrontierMath (Tiers 1-3)", file: "frontiermath_tiers_1_3_v2.csv", kind: "epoch", unit: "percent",
    blurb: "Unpublished research-level math problems with automatically checkable answers; most take specialists hours to solve.",
    href: "https://epoch.ai/frontiermath"
  },
  {
    id: "swebench", name: "SWE-bench Verified", file: "swe_bench_verified.csv", kind: "epoch", unit: "percent",
    blurb: "Real GitHub issues from Python repositories; a model passes when its patch makes the hidden tests pass. Run by Epoch with a fixed scaffold.",
    href: "https://epoch.ai/benchmarks/swe-bench-verified"
  },
  {
    id: "hle", name: "Humanity's Last Exam", file: "hle_external.csv", kind: "external", unit: "percent", score: "Accuracy", error: "Accuracy Standard Error",
    blurb: "2,500 expert-written questions across dozens of fields, built to sit at the edge of human knowledge. Scores reported by the developers.",
    href: "https://lastexam.ai/"
  },
  {
    id: "arcagi2", name: "ARC-AGI-2", file: "arc_agi_2_external.csv", kind: "external", unit: "percent", score: "Score",
    blurb: "Abstract grid puzzles that test learning a new rule from a few examples. Results from the ARC Prize semi-private set.",
    href: "https://arcprize.org/leaderboard"
  },
  {
    id: "metr", name: "METR time horizon", file: "metr_time_horizons_external.csv", kind: "external", unit: "minutes", score: "Time horizon", low: "CI_low", high: "CI_high",
    blurb: "How long a software task (measured in skilled-human time) a model can finish with 50% reliability.",
    href: "https://metr.org/time-horizons"
  },
  {
    id: "terminalbench", name: "Terminal-Bench 2.0", file: "terminalbench_external.csv", kind: "external", unit: "percent", score: "Accuracy mean", error: "Accuracy SE", detail: "Agent",
    blurb: "Hard command-line tasks done end to end inside a sandbox. Each row is a model paired with an agent harness.",
    href: "https://www.tbench.ai/leaderboard/terminal-bench/2.0"
  }
];

/* Minimal ZIP reader: central directory plus stored/deflated entries (no zip64; the export is ~2 MB). */
export function readZip(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Not a zip archive");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Corrupt central directory");
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + size);
    files.set(name, () => {
      if (method === 0) return raw.toString("utf8");
      if (method === 8) return inflateRawSync(raw).toString("utf8");
      throw new Error(`Unsupported compression for ${name}`);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/* RFC 4180 CSV: quoted fields may contain commas, doubled quotes, and newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === "\"") quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows;
  return body
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => Object.fromEntries(header.map((key, i) => [key.trim(), (cells[i] ?? "").trim()])));
}

const num = (value) => {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const round = (value, digits) => value === undefined ? undefined : Number(value.toFixed(digits));
const variantOf = (displayName) => /\(([^)]+)\)\s*$/.exec(displayName ?? "")?.[1];

function collectBenchmark(def, files, models) {
  const read = files.get(def.file);
  if (!read) throw new Error(`Missing ${def.file}`);
  const best = new Map();
  for (const row of parseCsv(read())) {
    let entry;
    if (def.kind === "eci") {
      const score = num(row.eci);
      if (score === undefined || !row["Display name"]) continue;
      entry = {
        group: row.Model || row["Display name"], model: row["Display name"], org: row.Organization,
        score: round(score, 1), low: round(num(row.eci_ci_low), 1), high: round(num(row.eci_ci_high), 1), date: row.date
      };
    } else {
      const version = row["Model version"];
      const meta = models.get(version);
      const raw = num(def.kind === "epoch" ? row.mean_score : row[def.score]);
      if (raw === undefined) continue;
      const scale = (value) => value === undefined ? undefined : round(def.unit === "percent" ? value * 100 : value, 1);
      const variant = def.detail ? row[def.detail] : variantOf(meta?.display_name);
      const name = meta?.model_group || row.Name || version;
      entry = {
        group: name,
        model: name,
        org: row.Organization || meta?.organization || "",
        score: scale(raw),
        error: scale(num(def.kind === "epoch" ? row.stderr : row[def.error])),
        low: scale(num(row[def.low])),
        high: scale(num(row[def.high])),
        date: row["Release date"] || meta?.date || "",
        detail: variant && variant !== "unknown thinking" ? variant : undefined
      };
    }
    const current = best.get(entry.group);
    if (!current || entry.score > current.score) best.set(entry.group, entry);
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score).slice(0, topN);
  if (!ranked.length) throw new Error(`No rows for ${def.id}`);
  return {
    id: def.id, name: def.name, blurb: def.blurb, unit: def.unit, href: def.href,
    rows: ranked.map(({ group: _group, ...row }) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== "")))
  };
}

async function fetchWithTimeout(url, ms = 30_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "agarwal-labs.com leaderboard refresh" } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response;
}

async function refreshEpoch(previous) {
  try {
    const files = readZip(Buffer.from(await (await fetchWithTimeout(epochZip, 60_000)).arrayBuffer()));
    const models = new Map(parseCsv(files.get("model_metadata.csv")?.() ?? "").filter((row) => row.model_version).map((row) => [row.model_version, row]));
    const result = [];
    for (const def of benchmarks) {
      try {
        result.push(collectBenchmark(def, files, models));
      } catch (error) {
        console.warn(`epoch: ${def.id} kept previous snapshot (${error.message})`);
        const kept = previous?.benchmarks?.find((item) => item.id === def.id);
        if (kept) result.push(kept);
      }
    }
    for (const item of result) console.log(`epoch: ${item.id} #1 ${item.rows[0].model} ${item.rows[0].score}`);
    return { fetchedAt: new Date().toISOString(), benchmarks: result };
  } catch (error) {
    console.warn(`epoch: kept previous snapshot (${error.message})`);
    return previous;
  }
}

export function arenaRowsFromPayload(payload) {
  const rows = (payload?.rows ?? []).map((item) => item.row).filter((row) => row?.category === "overall" && Number.isFinite(row.rating));
  rows.sort((a, b) => a.rank - b.rank || b.rating - a.rating);
  return rows.slice(0, arenaTopN).map((row) => ({
    rank: row.rank,
    model: row.model_name,
    org: row.organization ?? "",
    license: row.license ?? "",
    score: round(row.rating, 1),
    lower: round(row.rating_lower, 1),
    upper: round(row.rating_upper, 1),
    votes: row.vote_count,
    date: row.leaderboard_publish_date
  }));
}

async function refreshArena(previous) {
  const boards = { ...(previous?.boards ?? {}) };
  let publishedAt = previous?.publishedAt;
  for (const board of arenaBoards) {
    try {
      const rows = arenaRowsFromPayload(await (await fetchWithTimeout(arenaRows + board)).json());
      if (!rows.length) throw new Error("no overall rows");
      boards[board] = rows.map(({ date: _date, ...row }) => row);
      if (board === "text_style_control") publishedAt = rows[0].date;
      console.log(`arena: ${board} #1 ${rows[0].model} ${rows[0].score} (${rows[0].date})`);
    } catch (error) {
      console.warn(`arena: ${board} kept previous snapshot (${error.message})`);
    }
  }
  return { publishedAt, boards };
}

async function main() {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(outFile, "utf8"));
  } catch {
    previous = {};
  }
  const [arena, epoch] = await Promise.all([refreshArena(previous.arena), refreshEpoch(previous.epoch)]);
  const next = { generatedAt: new Date().toISOString(), arena, epoch };
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`wrote ${outFile}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.warn(`leaderboards: ${error.message}`);
    process.exitCode = 0;
  });
}
