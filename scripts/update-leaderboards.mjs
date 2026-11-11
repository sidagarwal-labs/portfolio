#!/usr/bin/env node
/*
 * Refreshes src/content/generated/leaderboards.json from two public sources:
 *   - LMArena's leaderboard dataset on Hugging Face (also fetched live in the browser; this is the fallback snapshot)
 *   - Epoch AI's benchmark hub export (CC BY 4.0; no CORS, so it can only be fetched at build time): the top rows per
 *     benchmark, plus every ECI-scored release grouped by lab for the Labs chart
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
const eciFile = "epoch_capabilities_index/eci_scores.csv";
const topN = 10;
const arenaTopN = 20;

export const arenaBoards = ["text_style_control", "webdev", "vision_style_control", "search_style_control", "text_to_image"];

const benchmarks = [
  {
    id: "eci", name: "Epoch Capabilities Index", file: eciFile, kind: "eci", unit: "index",
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

export const minLabReleases = 3;

/* Lower-cased Epoch organization names mapped onto one name per lab. */
const labAliases = new Map([
  ["google", "Google DeepMind"], ["google deepmind", "Google DeepMind"], ["deepmind", "Google DeepMind"],
  ["google research", "Google DeepMind"], ["google brain", "Google DeepMind"],
  ["meta", "Meta"], ["meta ai", "Meta"], ["facebook", "Meta"], ["facebook ai", "Meta"], ["facebook ai research", "Meta"], ["fair", "Meta"],
  ["alibaba", "Alibaba"], ["alibaba cloud", "Alibaba"], ["qwen", "Alibaba"], ["qwen team", "Alibaba"],
  ["mistral", "Mistral"], ["mistral ai", "Mistral"],
  ["moonshot", "Moonshot AI"], ["moonshot ai", "Moonshot AI"],
  ["z.ai", "Z.ai"], ["z.ai (zhipu ai)", "Z.ai"], ["zhipu", "Z.ai"], ["zhipu ai", "Z.ai"],
  ["microsoft", "Microsoft"], ["microsoft research", "Microsoft"], ["nvidia", "NVIDIA"],
  ["technology innovation institute", "TII"], ["xai", "xAI"], ["openai", "OpenAI"], ["anthropic", "Anthropic"], ["deepseek", "DeepSeek"]
]);

/* A few Epoch rows have no organization; these model families have only ever come from one lab. */
const familyLabs = [
  [/^(gpt|chatgpt|o\d+\b)/i, "OpenAI"], [/^claude/i, "Anthropic"], [/^(gemini|gemma|palm\b)/i, "Google DeepMind"],
  [/^llama/i, "Meta"], [/^grok/i, "xAI"], [/^deepseek/i, "DeepSeek"], [/^(qwen|codeqwen|qwq)/i, "Alibaba"],
  [/^(mistral|mixtral|ministral|codestral|devstral|magistral)/i, "Mistral"], [/^kimi/i, "Moonshot AI"]
];

/* Joint releases list several organizations ("Google DeepMind,Google"); the first is the lead lab. */
export function labName(organization, model = "") {
  const lead = (organization ?? "").split(",").map((part) => part.trim()).find(Boolean);
  if (lead) return labAliases.get(lead.toLowerCase()) ?? lead;
  return familyLabs.find(([pattern]) => pattern.test(model.trim()))?.[1] ?? "";
}

/* Every ECI-scored release grouped by lab, oldest first; labs with fewer than `minReleases` releases are dropped and
   the rest are ordered by their best score. `metadata` maps model_group to model_metadata.csv rows, which fill in a
   missing organization or release date. */
export function groupLabs(rows, metadata = new Map(), minReleases = minLabReleases) {
  const labs = new Map();
  for (const row of rows) {
    const eci = num(row.eci);
    const model = row["Display name"] || row.Model;
    const meta = metadata.get(row.Model) ?? metadata.get(model);
    const date = row.date || meta?.date || "";
    const org = labName(row.Organization || meta?.organization, model);
    if (eci === undefined || !model || !org || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const release = Object.fromEntries(Object.entries({
      model, date, eci: round(eci, 1), low: round(num(row.eci_ci_low), 1), high: round(num(row.eci_ci_high), 1)
    }).filter(([, value]) => value !== undefined));
    const releases = labs.get(org) ?? new Map();
    const seen = releases.get(model);
    if (!seen || release.eci > seen.eci) releases.set(model, release);
    labs.set(org, releases);
  }
  return [...labs]
    .map(([org, releases]) => ({
      org,
      models: [...releases.values()].sort((a, b) => a.date.localeCompare(b.date) || a.eci - b.eci || a.model.localeCompare(b.model))
    }))
    .filter((lab) => lab.models.length >= minReleases)
    .sort((a, b) => Math.max(...b.models.map((item) => item.eci)) - Math.max(...a.models.map((item) => item.eci)) || a.org.localeCompare(b.org));
}

/* Pretty-printed like the rest of the snapshot, but with each lab release on one line to keep the file small. */
export function formatSnapshot(snapshot) {
  const marker = "\u0000";
  const line = (item) => `{ ${Object.entries(item).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} }`;
  const text = JSON.stringify(snapshot, (key, value) => key === "models" && Array.isArray(value) ? value.map((item) => marker + line(item)) : value, 2);
  return `${text.replace(/"\\u0000((?:[^"\\]|\\.)*)"/g, (_, inner) => JSON.parse(`"${inner}"`))}\n`;
}

async function fetchWithTimeout(url, ms = 30_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "agarwal-labs.com leaderboard refresh" } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response;
}

async function refreshEpoch(previous) {
  try {
    const files = readZip(Buffer.from(await (await fetchWithTimeout(epochZip, 60_000)).arrayBuffer()));
    const metadata = parseCsv(files.get("model_metadata.csv")?.() ?? "");
    const models = new Map(metadata.filter((row) => row.model_version).map((row) => [row.model_version, row]));
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
    let labs;
    try {
      const eci = files.get(eciFile);
      if (!eci) throw new Error(`Missing ${eciFile}`);
      const groups = new Map();
      for (const row of metadata) if (row.model_group && !groups.has(row.model_group)) groups.set(row.model_group, row);
      labs = groupLabs(parseCsv(eci()), groups);
      if (!labs.length) throw new Error("no labs");
      console.log(`epoch: ${labs.length} labs, ${labs.reduce((sum, lab) => sum + lab.models.length, 0)} ECI releases`);
    } catch (error) {
      labs = previous?.labs;
      console.warn(`epoch: labs kept previous snapshot (${error.message})`);
    }
    return { fetchedAt: new Date().toISOString(), benchmarks: result, ...(labs ? { labs } : {}) };
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
  await writeFile(outFile, formatSnapshot(next));
  console.log(`wrote ${outFile}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.warn(`leaderboards: ${error.message}`);
    process.exitCode = 0;
  });
}
