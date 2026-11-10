#!/usr/bin/env node
/*
 * Builds src/content/generated/rankit-arxiv.json for the Lab OS "Rank It" game from a local clone of
 * https://github.com/sidagarwal-labs/arxiv-search. Usage:
 *   git clone https://github.com/sidagarwal-labs/arxiv-search <dir>
 *   node scripts/build-rankit-data.mjs <dir> [--cache <file.json>]
 *
 * Everything except titles and snippets comes from files tracked in that repo:
 *   - queries:   data/eval/queries.jsonl (dev split from data/eval/split.json)
 *   - grades:    data/results/top20-label-completion/labels.json (3,678 pairs, 0/1/2)
 *   - BM25 run:  data/results/dev/bm25+exact+stems+authors+title2x+k1=0.8,b=0.75.run.json
 *   - reranker:  data/results/top20-confirm/llm-gpt54-refine20+d=20+avg2+scores+pin1-d46.run.json
 * Titles and abstracts are not in the repo, so they come from the arXiv API (metadata is CC0).
 * The script recomputes the project's published nDCG@10 numbers and stops if they don't match.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "src/content/generated/rankit-arxiv.json");
const repoUrl = "https://github.com/sidagarwal-labs/arxiv-search";
const siteUrl = "https://arxiv.agarwal-labs.com/";
const arxivApi = "https://export.arxiv.org/api/query";
const userAgent = "agarwal-labs-portfolio/1.0 (build-rankit-data.mjs; https://agarwal-labs.com/)";
const perRound = 5;
const snippetWords = 30;

const paths = {
  queries: "data/eval/queries.jsonl",
  split: "data/eval/split.json",
  rubric: "arxiv_search/evaluate/judge_prompts.py",
  metric: "arxiv_search/evaluate/metrics.py",
  labels: "data/results/top20-label-completion/labels.json",
  bm25Labels: "data/results/shared-labels/labels-d47.json",
  bm25Run: "data/results/dev/bm25+exact+stems+authors+title2x+k1=0.8,b=0.75.run.json",
  rerankerRun: "data/results/top20-confirm/llm-gpt54-refine20+d=20+avg2+scores+pin1-d46.run.json"
};

// Hand-picked for plain-language wording and grade spread; the candidates, grades and orders are all mechanical.
const picks = [
  { id: "q-question-089", why: "Plain-language health question; both systems put the same paper first, then disagree." },
  { id: "q-question-085", why: "Everyday question; BM25's top hit is off-topic while two highly relevant papers sit at its ranks 8-9." },
  { id: "q-keyword-079", why: "Short keyword query where the keyword baseline beats the reranker (the reranker's first pick is graded 0)." },
  { id: "q-question-019", why: "Common ML question; BM25 ranks a graded-0 paper first." },
  { id: "q-paraphrase-030", why: "Paraphrase with little word overlap; BM25's top 100 misses the best paper entirely." },
  { id: "q-paraphrase-049", why: "Paraphrase where the keyword baseline still edges out the reranker." }
];

const args = process.argv.slice(2);
const clone = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--cache");
const cacheIndex = args.indexOf("--cache");
const cacheFile = cacheIndex >= 0 ? resolve(args[cacheIndex + 1] ?? "") : null;
if (!clone || !existsSync(resolve(clone, paths.queries))) {
  console.error("Usage: node scripts/build-rankit-data.mjs <path-to-arxiv-search-clone> [--cache <file.json>]");
  process.exit(1);
}

const repo = resolve(clone);
const git = (...gitArgs) => execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8" }).trim();
const readJson = async (path) => JSON.parse(await readFile(resolve(repo, path), "utf8"));
const fail = (message) => { throw new Error(message); };

const commit = git("rev-parse", "HEAD");
const commitDate = git("show", "-s", "--format=%cI", "HEAD");
if (git("status", "--porcelain", "--", "data", "arxiv_search")) fail("The clone has local changes under data/ or arxiv_search/; use a clean checkout.");

const queries = new Map((await readFile(resolve(repo, paths.queries), "utf8")).trim().split(/\r?\n/).map((line) => {
  const row = JSON.parse(line);
  return [row.query_id, row];
}));
const dev = (await readJson(paths.split)).dev;
const labelsFile = await readJson(paths.labels);
const labels = labelsFile.labels;
const bm25Labels = (await readJson(paths.bm25Labels)).labels;
const bm25Run = await readJson(paths.bm25Run);
const rerankerRun = await readJson(paths.rerankerRun);

// Same formula as arxiv_search/evaluate/metrics.py: linear gain, log2(rank + 1) discount.
const dcg = (gains) => gains.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
const ndcgAt = (ranked, grades, k) => {
  const ideal = dcg(Object.values(grades).sort((a, b) => b - a).slice(0, k));
  return ideal ? dcg(ranked.slice(0, k).map((paper) => grades[paper] ?? 0)) / ideal : null;
};
const meanNdcg10 = (run, pool) => {
  const values = dev.map((query) => ndcgAt(run[query] ?? [], pool[query] ?? {}, 10)).filter((value) => value !== null);
  return { value: values.reduce((sum, value) => sum + value, 0) / values.length, queries: values.length };
};
const countPairs = (pool) => dev.reduce((sum, query) => sum + Object.keys(pool[query] ?? {}).length, 0);
const round4 = (value) => Math.round(value * 1e4) / 1e4;

// Check the published numbers before trusting any per-query data.
const published = {
  bm25: { ndcg10: 0.5068, judgments: 3579, labels: bm25Labels, run: bm25Run },
  reranker: { ndcg10: 0.8418, judgments: 3678, labels, run: rerankerRun }
};
for (const [name, entry] of Object.entries(published)) {
  const pairs = countPairs(entry.labels);
  const { value, queries: n } = meanNdcg10(entry.run, entry.labels);
  if (pairs !== entry.judgments || n !== 100 || round4(value) !== entry.ndcg10) {
    fail(`${name}: expected nDCG@10 ${entry.ndcg10} on ${entry.judgments} judgments, got ${value} on ${pairs} pairs (${n} queries).`);
  }
  entry.recomputed = value;
}
for (const query of dev) {
  for (const [paper, grade] of Object.entries(bm25Labels[query] ?? {})) {
    if (labels[query]?.[paper] !== grade) fail(`Grade for ${query}/${paper} changed between the 3,579- and 3,678-pair pools.`);
  }
}

const rankIn = (run, query, paper) => {
  const index = (run[query] ?? []).indexOf(paper);
  return index < 0 ? null : index + 1;
};
// A system's order of the candidates: its own rank; papers missing from its saved top 100 go last, by arXiv id.
const systemOrder = (run, query, ids) => [...ids].sort((a, b) => {
  const ra = rankIn(run, query, a) ?? Infinity;
  const rb = rankIn(run, query, b) ?? Infinity;
  return ra === rb ? a.localeCompare(b) : ra - rb;
});
// Alternate between the two runs (BM25 first), each time taking that system's best judged paper not yet chosen.
const chooseCandidates = (query) => {
  const grades = labels[query] ?? {};
  const lists = [bm25Run[query] ?? [], rerankerRun[query] ?? []].map((run) => run.filter((paper) => paper in grades));
  const cursors = [0, 0];
  const chosen = [];
  for (let turn = 0; chosen.length < perRound && cursors.some((cursor, side) => cursor < lists[side].length); turn += 1) {
    const side = turn % 2;
    while (cursors[side] < lists[side].length && chosen.includes(lists[side][cursors[side]])) cursors[side] += 1;
    if (cursors[side] < lists[side].length) chosen.push(lists[side][cursors[side]++]);
  }
  return chosen;
};
const ndcg5 = (order, grades) => ndcgAt(order, Object.fromEntries(order.map((paper) => [paper, grades[paper]])), perRound) ?? 0;

// Seeded shuffle (FNV-1a hash of the query id + mulberry32) so the start order never changes between builds.
const hash = (text) => [...text].reduce((h, char) => Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// The start differs from both system orders and scores no higher than either (at displayed precision), so submitting it unchanged never wins.
const startOrder = (query, ids, grades, systems) => {
  const ceiling = Math.min(...systems.map((order) => Math.round(ndcg5(order, grades) * 1000)));
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const random = mulberry32(hash(`${query}#${attempt}`));
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (Math.round(ndcg5(order, grades) * 1000) <= ceiling && systems.every((other) => other.join() !== order.join())) return { order, attempt };
  }
  fail(`No start order found for ${query}.`);
};

// Context for the curated rounds: how the same candidate rule plays out on every dev query.
const tally = { queries: 0, rerankerHigher: 0, bm25Higher: 0, tied: 0 };
for (const query of dev) {
  const ids = chooseCandidates(query);
  if (ids.length < perRound) continue;
  const grades = labels[query];
  const b = round4(ndcg5(systemOrder(bm25Run, query, ids), grades));
  const r = round4(ndcg5(systemOrder(rerankerRun, query, ids), grades));
  tally.queries += 1;
  if (r > b) tally.rerankerHigher += 1;
  else if (b > r) tally.bm25Higher += 1;
  else tally.tied += 1;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const decode = (text) => text
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;|&#39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&amp;/g, "&");
const clean = (text) => decode(text).replace(/\s+/g, " ").trim();
const parseFeed = (xml) => {
  const found = {};
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = entry.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+?)(?:v\d+)?<\/id>/)?.[1];
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
    const summary = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    if (id && title && summary) found[id] = { title: clean(title), abstract: clean(summary) };
  }
  return found;
};
// arXiv asks for at most one request every 3 seconds.
const fetchArxiv = async (ids) => {
  const found = {};
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    for (let attempt = 1; ; attempt += 1) {
      if (start > 0 || attempt > 1) await sleep(3500 * attempt);
      const response = await fetch(`${arxivApi}?id_list=${batch.join(",")}&max_results=${batch.length}`, { headers: { "User-Agent": userAgent } });
      if (response.ok) {
        Object.assign(found, parseFeed(await response.text()));
        break;
      }
      if (attempt >= 4) fail(`arXiv API returned ${response.status}.`);
    }
  }
  return found;
};
const snippetOf = (abstract) => {
  const words = abstract.split(" ");
  if (words.length <= snippetWords) return abstract;
  const sentence = abstract.match(/^.+?[.!?](?=\s|$)/)?.[0];
  const sentenceWords = sentence?.split(" ").length ?? 0;
  if (sentence && sentenceWords >= 8 && sentenceWords <= snippetWords) return sentence;
  return `${words.slice(0, snippetWords - 2).join(" ").replace(/[,;:.]$/, "")}…`;
};

const selected = picks.map(({ id, why }) => {
  const query = queries.get(id) ?? fail(`Unknown query ${id}.`);
  if (!dev.includes(id)) fail(`${id} is not a dev query.`);
  const grades = labels[id];
  const ids = chooseCandidates(id);
  const bm25 = systemOrder(bm25Run, id, ids);
  const reranker = systemOrder(rerankerRun, id, ids);
  const { order: start, attempt } = startOrder(id, ids, grades, [bm25, reranker]);
  const gradeList = ids.map((paper) => grades[paper]);
  if (new Set(ids).size !== perRound) fail(`${id}: expected ${perRound} unique candidates.`);
  if (!gradeList.includes(2) || !gradeList.includes(0)) fail(`${id}: needs a grade 2 and a grade 0 among its candidates.`);
  if (bm25.join() === reranker.join()) fail(`${id}: BM25 and reranker orders are identical.`);
  return { id, why, query, grades, ids, bm25, reranker, start, attempt };
});

const allIds = [...new Set(selected.flatMap((round) => round.ids))];
let metadata = {};
if (cacheFile && existsSync(cacheFile)) metadata = JSON.parse(await readFile(cacheFile, "utf8"));
const missing = allIds.filter((paper) => !metadata[paper]);
if (missing.length) {
  console.log(`Fetching ${missing.length} papers from the arXiv API…`);
  Object.assign(metadata, await fetchArxiv(missing));
  if (cacheFile) await writeFile(cacheFile, `${JSON.stringify(metadata, null, 2)}\n`);
}
const unresolved = allIds.filter((paper) => !metadata[paper]);
if (unresolved.length) fail(`arXiv API returned no metadata for ${unresolved.join(", ")}.`);

const rounds = selected.map(({ id, why, query, grades, ids, bm25, reranker, start, attempt }) => ({
  queryId: id,
  query: query.query,
  queryType: query.query_type,
  selectionNote: why,
  papers: ids.map((paper) => ({
    id: paper,
    title: metadata[paper].title,
    snippet: snippetOf(metadata[paper].abstract),
    grade: grades[paper],
    bm25Rank: rankIn(bm25Run, id, paper),
    rerankerRank: rankIn(rerankerRun, id, paper)
  })),
  start,
  startSeedAttempt: attempt,
  bm25,
  reranker,
  ndcg5: { bm25: round4(ndcg5(bm25, grades)), reranker: round4(ndcg5(reranker, grades)), start: round4(ndcg5(start, grades)) },
  fullNdcg10: { bm25: round4(ndcgAt(bm25Run[id], grades, 10)), reranker: round4(ndcgAt(rerankerRun[id], grades, 10)), judgments: 3678 }
}));
if (!rounds.some((round) => round.ndcg5.bm25 >= round.ndcg5.reranker)) fail("Include at least one round where the BM25 baseline does as well as the reranker.");

const output = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  meta: {
    repo: repoUrl,
    commit,
    commitDate,
    commitUrl: `${repoUrl}/tree/${commit}`,
    site: siteUrl,
    siteQueryParam: "q",
    siteQueryNote: "The live site's web app reads ?q= and fills in the search box (web/app.js syncFromUrl); results may differ from the saved offline runs.",
    queries: { path: paths.queries, split: `${paths.split} (dev)`, count: dev.length, generator: "Queries were written by gemma-4-31b-it from source papers (queries.jsonl model field)." },
    judgments: {
      path: paths.labels,
      pairs: countPairs(labels),
      scale: { 0: "Not relevant", 1: "Partly relevant", 2: "Highly relevant" },
      rubric: paths.rubric,
      description: "AI-graded, not human-validated: GPT-5.4 mini 0/1/2 grades with 100 ASTRA reference overrides, plus a top-20 completion layer of additional AI grades (arxiv-search README, 'Relevance labels').",
      gradesFromOriginalSnapshot: selected.reduce((sum, round) => sum + round.ids.filter((paper) => paper in bm25Labels[round.id]).length, 0),
      originalSnapshot: { path: paths.bm25Labels, pairs: 3579, note: "Every one of its grades is unchanged in the 3,678-pair pool (checked by this script)." }
    },
    systems: {
      bm25: {
        label: "Keyword baseline (BM25)",
        system: "bm25+exact+stems+authors+title2x+k1=0.8,b=0.75",
        description: "Tuned BM25 over titles (counted twice), abstracts and authors, exact terms plus stems, k1=0.8, b=0.75.",
        run: paths.bm25Run,
        runDepth: bm25Run[dev[0]].length,
        ndcg10: published.bm25.ndcg10,
        judgments: published.bm25.judgments,
        labels: paths.bm25Labels,
        source: "docs/06-charts.md (milestone M1, Tuned BM25)",
        recomputed: round4(published.bm25.recomputed)
      },
      reranker: {
        label: "AI reranker",
        system: "llm-gpt54-refine20+d=20+avg2+scores+pin1-d46",
        description: "Hybrid BM25 + OpenAI-embedding retrieval (Decision 36); two GPT-5.4 mini passes over the top 50, fused with retrieval order (Decision 46); then two GPT-5.4 passes re-score the top 20, ordered by the average score, keeping rank 1 (Decision 50).",
        run: paths.rerankerRun,
        runDepth: rerankerRun[dev[0]].length,
        ndcg10: published.reranker.ndcg10,
        judgments: published.reranker.judgments,
        labels: paths.labels,
        source: "docs/05-results.md (Stage 2, rank 1) and data/results/top20-confirm/dev100-summary.json",
        recomputed: round4(published.reranker.recomputed)
      }
    },
    caveat: "Both nDCG@10 numbers use the same 100 dev queries but different judgment pools (3,579 vs 3,678), so the change is not a like-for-like gain. Settings were tuned on these queries, so scores are optimistic.",
    samePoolNdcg10: { judgments: 3678, bm25: round4(meanNdcg10(bm25Run, labels).value), reranker: round4(published.reranker.recomputed), note: "Recomputed by this script from the saved runs; not a published project number." },
    metric: {
      name: "nDCG@5",
      gain: "linear: gain = grade (0, 1 or 2)",
      discount: "log2(rank + 1)",
      ideal: "the same 5 papers sorted by grade",
      source: paths.metric
    },
    selection: {
      queries: "Six dev queries hand-picked for plain wording, a grade-2 and a grade-0 candidate, and different system orders.",
      candidates: "Alternate between the BM25 run and the reranker run, BM25 first, each time taking that system's highest-ranked judged paper not already chosen, until 5 papers.",
      systemOrder: "Each system's order is its own rank of the 5 papers in its saved run; papers missing from its saved top 100 go last, in ascending arXiv-id order.",
      start: "Seeded Fisher-Yates shuffle (FNV-1a of `<queryId>#<attempt>` into mulberry32); the first attempt that differs from both system orders and whose nDCG@5 (to 3 decimals) is no higher than either system's is used, so an unchanged submission never wins.",
      allDevQueries: tally
    },
    paperMetadata: { source: `${arxivApi} (arXiv API)`, license: "arXiv metadata is CC0 1.0", snippet: `First sentence of the abstract, or its first ${snippetWords - 2} words, when the abstract is longer than ${snippetWords} words.` }
  },
  rounds
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${rounds.length} rounds to ${outFile} (arxiv-search ${commit.slice(0, 7)}).`);
for (const round of rounds) console.log(`  ${round.queryId}  BM25 ${round.ndcg5.bm25.toFixed(3)}  reranker ${round.ndcg5.reranker.toFixed(3)}  start ${round.ndcg5.start.toFixed(3)}  "${round.query}"`);
console.log(`  All ${tally.queries} dev queries, same rule: reranker higher ${tally.rerankerHigher}, BM25 higher ${tally.bm25Higher}, tied ${tally.tied}.`);
