// Precomputes the real next-token data used by the Lab OS "Next Token" game.
// Run from the repo root: node scripts/precompute-next-token.mjs
// Optional: node scripts/precompute-next-token.mjs --explore "Some prompt" "Another prompt"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AutoModelForCausalLM, AutoTokenizer, env } from "@huggingface/transformers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, process.env.NEXT_TOKEN_OUTPUT ?? "src/content/generated/next-token.json");
const versionOf = (name) => JSON.parse(readFileSync(resolve(root, "node_modules", name, "package.json"), "utf8")).version;

// The live mode in the browser reads model, revision, and dtype from this file's meta block, so both use the same weights.
const MODEL = "onnx-community/SmolLM2-135M-ONNX";
const BASE_MODEL = "HuggingFaceTB/SmolLM2-135M";
const REVISION = "d0ae6834f1df45e0e95b5fdae95e536f9ca7cd3f";
const DTYPE = process.env.NEXT_TOKEN_DTYPE ?? "q4f16";
if (!["q4", "q4f16"].includes(DTYPE)) throw new Error(`Unsupported model dtype: ${DTYPE}`);
const TOP_K = 8;
const CHOICES = 5;
const TEMPERATURES = Array.from({ length: 19 }, (_, index) => Math.round((0.2 + index * 0.1) * 10) / 10);

// Notes describe the output of this exact model and dtype. Re-check them if the model, revision, or dtype changes.
// "␣" marks a token's leading space, matching how the game displays tokens.
const prompts = [
  { text: "Attention is all you", note: "The famous paper title wins, but this small model still gives real probability to ␣want, ␣have, and ␣can." },
  { text: "The capital of France is", note: "A small base model often continues with a filler word instead of the fact. ␣Paris is not in its top 8 here." },
  { text: "import numpy as", note: "Code conventions are about as predictable as text gets." },
  { text: "Buy low, sell", note: "The idiom wins, but ␣the and ␣low are live options for a 135M-parameter model." },
  { text: "The more you know, the more you", note: "Many endings fit, so the tail is long and temperature changes what a sampler would pick." },
  { text: "A search engine ranks documents by their", note: "␣relevance is the textbook answer, and the model agrees by a wide margin." },
  { text: "The Eiffel Tower is located in the city of", note: "More context helps: here ␣Paris is the top token, unlike the shorter France prompt." }
];

// Model files are cached in node_modules/.cache, which git ignores.
env.cacheDir = resolve(root, "node_modules/.cache/huggingface");
env.allowLocalModels = false;
env.remotePathTemplate = `{model}/resolve/${REVISION}/`;

const round = (value, places = 4) => Number(value.toFixed(places));

// Rounds up at 6 decimals, so p_i = exp(z_i / T - lse) can never exceed 1 after rounding.
function roundUp(value, places = 6) {
  let out = Number((Math.ceil(value * 10 ** places) / 10 ** places).toFixed(places));
  while (out < value) out = Number((out + 10 ** -places).toFixed(places));
  return out;
}

function logSumExp(logits, temperature, skip = new Set()) {
  let max = -Infinity;
  logits.forEach((logit, id) => { if (!skip.has(id)) max = Math.max(max, logit / temperature); });
  let total = 0;
  logits.forEach((logit, id) => { if (!skip.has(id)) total += Math.exp(logit / temperature - max); });
  return max + Math.log(total);
}

// The top-1 token plus the next highest-ranked tokens that contain a letter or digit, so the choices are words.
function pickChoices(top) {
  const ranks = top.map((_, index) => index).slice(1);
  const wordy = ranks.filter((index) => /[\p{L}\p{N}]/u.test(top[index].text));
  return [0, ...wordy, ...ranks.filter((index) => !wordy.includes(index))].slice(0, CHOICES);
}

// Small deterministic PRNG so the choice order is stable between runs but the answer is not always first.
function seededOrder(items, seedText) {
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = [...items];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

async function downloadFiles() {
  // Sizes come from the Hugging Face Hub API for the pinned revision; these are the files transformers.js fetches.
  const response = await fetch(`https://huggingface.co/api/models/${MODEL}/revision/${REVISION}?blobs=true`);
  if (!response.ok) throw new Error(`Hub API returned ${response.status}`);
  const { siblings } = await response.json();
  const wanted = ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", `onnx/model_${DTYPE}.onnx`, `onnx/model_${DTYPE}.onnx_data`];
  return wanted.map((path) => {
    const file = siblings.find((sibling) => sibling.rfilename === path);
    if (!file?.size) throw new Error(`Missing ${path} in ${MODEL}@${REVISION}`);
    return { path, bytes: file.size };
  });
}

async function main() {
  const explore = process.argv.includes("--explore") ? process.argv.slice(process.argv.indexOf("--explore") + 1) : null;
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL, { revision: REVISION });
  const model = await AutoModelForCausalLM.from_pretrained(MODEL, { revision: REVISION, dtype: DTYPE, device: "cpu" });

  const rows = [];
  for (const { text, note } of explore ? explore.map((text) => ({ text, note: "" })) : prompts) {
    const inputs = tokenizer(text);
    const { logits } = await model(inputs);
    const [, length, vocab] = logits.dims;
    const last = Float64Array.from(logits.to("float32").data.subarray((length - 1) * vocab, length * vocab));
    const ranked = Array.from(last.keys()).sort((a, b) => last[b] - last[a]).slice(0, TOP_K);
    const top = ranked.map((id) => ({ id, text: tokenizer.decode([id]), logit: round(last[id]) }));
    // rest: exact log-sum-exp over every token outside the top K. lse: the full vocabulary, built from the stored
    // (rounded) top-K logits plus rest, so the stored numbers are self-consistent and the top K plus "other" sum to 1.
    const restExact = TEMPERATURES.map((temperature) => logSumExp(last, temperature, new Set(ranked)));
    const lse = TEMPERATURES.map((temperature, index) => {
      const terms = [...top.map((token) => token.logit / temperature), restExact[index]];
      const max = Math.max(...terms);
      return roundUp(max + Math.log(terms.reduce((sum, term) => sum + Math.exp(term - max), 0)));
    });
    const rest = restExact.map((value) => round(value, 6));
    rows.push({ text, note, tokens: length, inputIds: Array.from(inputs.input_ids.data, Number), vocab, top, lse, rest });
    const atOne = lse[TEMPERATURES.indexOf(1)];
    console.log(`\n${text}`);
    for (const token of top) console.log(`  ${JSON.stringify(token.text).padEnd(16)} z=${token.logit.toFixed(3).padStart(8)}  p(T=1)=${(Math.exp(token.logit - atOne) * 100).toFixed(2)}%`);
  }
  if (explore) return;

  const files = await downloadFiles();
  const data = {
    meta: {
      model: MODEL,
      baseModel: BASE_MODEL,
      revision: REVISION,
      dtype: DTYPE,
      license: "Apache-2.0",
      files,
      downloadBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      runtime: `@huggingface/transformers ${versionOf("@huggingface/transformers")} + onnxruntime-node ${versionOf("onnxruntime-node")} (CPU)`,
      vocabSize: rows[0].vocab,
      topK: TOP_K,
      temperatures: TEMPERATURES,
      generated: new Date().toISOString().slice(0, 10),
      script: "scripts/precompute-next-token.mjs",
      note: "p_i(T) = exp(logit_i / T - lse[T]). lse is the log-sum-exp of logits / T over the full vocabulary at the last prompt position, rounded up at 6 decimals; top-K logits are stored to 4 decimals. rest is the same sum over every token outside the top K, so exp(rest[T] - lse[T]) is the probability of all other tokens combined."
    },
    prompts: rows.map(({ text, note, tokens, inputIds, top, lse, rest }) => ({ text, note, tokens, inputIds, top, lse, rest, choices: seededOrder(pickChoices(top), text) }))
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(data)}\n`);
  console.log(`\nWrote ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
