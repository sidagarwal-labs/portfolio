import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { attentionRow, createRunState, forward, headAttention, Llama2Session, parseCheckpoint, type Llama2Model } from "../../src/features/views/model/pretrained/llama2";
import { argmax, sampleFromProbabilities, sampleToken, softmaxWithTemperature, topTokens } from "../../src/features/views/model/pretrained/sampling";
import { BOS, EOS, decode, encode, parseTokenizer, pieceLabel } from "../../src/features/views/model/pretrained/tokenizer";

const files = {
  "stories260K.bin": { bytes: 1_056_540, sha256: "b0a507e7ad0f626624f17112325e66691f9076d622e1d3274d103d00299f2696" },
  "tok512.bin": { bytes: 6_227, sha256: "037cb335abb25d1fa9e8ecae30ed2a3a8ace9302862ebcdc05d51a6bbb10c312" }
};
const read = (name: keyof typeof files) => {
  const bytes = readFileSync(new URL(`../../public/models/stories260K/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
const model = parseCheckpoint(read("stories260K.bin"));
const tokenizer = parseTokenizer(read("tok512.bin"), model.config.vocabSize);
const defaultPrompt = "Once upon a time, there was a little girl named Lily. She";

// Output of `./run stories260K/stories260K.bin -z stories260K/tok512.bin -t 0.0` (256 steps) documented in
// https://github.com/karpathy/llama2.c/blob/master/doc/stories260K.md (MIT, Andrej Karpathy).
const documentedGreedy = [
  "Once upon a time, there was a little girl named Lily. She loved to play outside in the park. One day, she saw a big, red ball. She wanted to play with it, but it was too high.",
  "Lily's mom said, \"Lily, let's go to the park.\" Lily was sad and didn't know what to do. She said, \"I want to play with your ball, but I can't find it.\"",
  "Lily was sad and didn't know what to do. She said, \"I'm sorry, Lily. I didn't know what to do.\"",
  "Lily didn't want to help her mom, so she said, \"I'm sorry, mom. I didn't know what to do.\" Her mom said, \"Don't worry, Lily. We can help you."
].join("\n");

// run.c's generate(): start from BOS, force prompt tokens, then sample until `steps` positions or a BOS.
function runCGenerate(target: Llama2Model, steps: number, prompt: number[] = [BOS]) {
  const state = createRunState(target.config, steps, false);
  const tokens = [prompt[0]];
  for (let pos = 0; pos < steps; pos += 1) {
    const logits = forward(target, state, tokens[pos], pos);
    const next = pos < prompt.length - 1 ? prompt[pos + 1] : argmax(logits);
    if (next === BOS) break;
    tokens.push(next);
  }
  return tokens;
}

test("the checkpoint header, weight layout, and parameter count match stories260K", () => {
  expect(model.config).toEqual({
    dim: 64, hiddenDim: 172, nLayers: 5, nHeads: 8, nKvHeads: 4, vocabSize: 512, seqLen: 512,
    headSize: 8, kvDim: 32, kvMul: 2, sharedClassifier: true
  });
  const { dim, hiddenDim, nLayers, vocabSize, kvDim } = model.config;
  const perLayer = 2 * dim + 2 * dim * dim + 2 * dim * kvDim + 3 * dim * hiddenDim;
  expect(model.parameterCount).toBe(vocabSize * dim + nLayers * perLayer + dim);
  expect(model.parameterCount).toBe(260_032);
  expect(model.weights.wcls).toBe(model.weights.tokenEmbedding);
  console.log(`stories260K: ${model.parameterCount.toLocaleString("en-US")} parameters counted from the weights (hidden_dim ${hiddenDim} from the header).`);
  expect(() => parseCheckpoint(read("stories260K.bin").slice(0, 4_000))).toThrow(/truncated/);
  expect(() => parseCheckpoint(new ArrayBuffer(12))).toThrow(/not a llama2.c/);
});

test("greedy decoding from BOS reproduces llama2.c's documented run.c output token for token", () => {
  const start = performance.now();
  const tokens = runCGenerate(model, 256);
  const ms = performance.now() - start;
  const text = decode(tokenizer, tokens);
  console.log(`Greedy: ${tokens.length - 1} tokens in ${Math.round(ms)}ms; first 40 decode to ${JSON.stringify(decode(tokenizer, tokens.slice(0, 41)))}`);
  expect(tokens).toHaveLength(257);
  expect(decode(tokenizer, tokens.slice(0, 41))).toBe(documentedGreedy.slice(0, decode(tokenizer, tokens.slice(0, 41)).length));
  expect(text).toBe(documentedGreedy);
  // The tokenizer splits the documented text into exactly the ids the model generated.
  expect(encode(tokenizer, documentedGreedy)).toEqual(tokens);
});

test("captured attention is causal, normalized, and unaffected by later tokens or cache reuse", () => {
  const { nLayers, nHeads } = model.config;
  const prompt = encode(tokenizer, defaultPrompt);
  const session = new Llama2Session(model, 64);
  session.run(prompt);
  const problems: string[] = [];
  let rows = 0;
  for (let layer = 0; layer < nLayers; layer += 1) {
    for (let head = 0; head < nHeads; head += 1) {
      for (let pos = 0; pos < prompt.length; pos += 1) {
        const row = attentionRow(model, session.state, layer, head, pos);
        const sum = row.reduce((total, weight) => total + weight, 0);
        const start = ((layer * nHeads + head) * 64 + pos) * 64;
        const future = session.state.attention!.subarray(start + pos + 1, start + 64);
        if (row.length !== pos + 1 || !row.every((weight) => Number.isFinite(weight) && weight >= 0)) problems.push(`L${layer} H${head} q${pos}: bad row`);
        if (Math.abs(sum - 1) > 1e-5) problems.push(`L${layer} H${head} q${pos}: sums to ${sum}`);
        if (!future.every((weight) => weight === 0)) problems.push(`L${layer} H${head} q${pos}: attends to the future`);
        rows += 1;
      }
    }
  }
  expect(problems).toEqual([]);
  expect(rows).toBe(nLayers * nHeads * prompt.length);
  const tensor = session.attentionTensor();
  const n = prompt.length;
  const mean = headAttention(tensor, n, nHeads, 2, null);
  expect(mean[5 * n + 3]).toBeCloseTo(Array.from({ length: nHeads }, (_, head) => headAttention(tensor, n, nHeads, 2, head)[5 * n + 3]).reduce((a, b) => a + b) / nHeads, 6);
  expect(mean[3 * n + 5]).toBe(0);

  const changed = [...prompt.slice(0, 8), ...encode(tokenizer, "the dog who liked to run", false)];
  expect(changed[8]).not.toBe(prompt[8]);
  const fresh = new Llama2Session(model, 64);
  const freshLogits = fresh.run(changed).logits.slice();
  // Rows for the shared prefix cannot see the later, different tokens.
  let prefixMismatches = 0;
  for (let layer = 0; layer < nLayers; layer += 1) {
    for (let head = 0; head < nHeads; head += 1) {
      for (let pos = 0; pos < 8; pos += 1) {
        const a = attentionRow(model, fresh.state, layer, head, pos);
        const b = attentionRow(model, session.state, layer, head, pos);
        if (a.some((value, index) => value !== b[index])) prefixMismatches += 1;
      }
    }
  }
  expect(prefixMismatches).toBe(0);
  // Reusing the cached 8-token prefix gives bit-identical results to a fresh run.
  const reused = session.run(changed);
  expect(reused.computed).toBe(changed.length - 8);
  expect(reused.logits.every((value, index) => value === freshLogits[index])).toBe(true);
  const reusedTensor = session.attentionTensor();
  const freshTensor = fresh.attentionTensor();
  expect(reusedTensor.length).toBe(freshTensor.length);
  expect(reusedTensor.every((value, index) => value === freshTensor[index])).toBe(true);
});

test("grouped-query attention: query heads 2k and 2k+1 read key/value head k", () => {
  const { dim, headSize, nHeads } = model.config;
  expect(model.config.kvMul).toBe(2);
  const prompt = encode(tokenizer, defaultPrompt);
  const baseline = new Llama2Session(model, 64);
  baseline.run(prompt);
  for (let kvHead = 0; kvHead < model.config.nKvHeads; kvHead += 1) {
    // Perturb only the layer-0 key projection rows that produce kv head `kvHead`.
    const wk = model.weights.wk.slice();
    for (let i = kvHead * headSize; i < (kvHead + 1) * headSize; i += 1) {
      for (let j = 0; j < dim; j += 1) wk[i * dim + j] *= 1.5;
    }
    const perturbed = new Llama2Session({ ...model, weights: { ...model.weights, wk } }, 64);
    perturbed.run(prompt);
    const changedHeads = Array.from({ length: nHeads }, (_, head) => head).filter((head) => {
      const pos = prompt.length - 1;
      const a = attentionRow(model, baseline.state, 0, head, pos);
      const b = attentionRow(model, perturbed.state, 0, head, pos);
      return a.some((value, index) => value !== b[index]);
    });
    expect(changedHeads).toEqual([kvHead * model.config.kvMul, kvHead * model.config.kvMul + 1]);
  }
});

test("the tokenizer follows run.c: BOS, dummy prefix, byte fallback, best-score merges, and lossless decoding", () => {
  const space = tokenizer.lookup.get(" ")!;
  expect(encode(tokenizer, "")).toEqual([BOS]);
  expect(encode(tokenizer, "🙂", false)).toEqual([space, 0xf0 + 3, 0x9f + 3, 0x99 + 3, 0x82 + 3]);
  const withEos = encode(tokenizer, "Hi", true, true);
  expect(withEos[withEos.length - 1]).toBe(EOS);
  const prompt = encode(tokenizer, defaultPrompt);
  expect(prompt.map((id) => pieceLabel(tokenizer, id)).join("|")).toBe("BOS|␣Once|␣upon|␣a|␣time|,|␣there|␣was|␣a|␣little|␣g|ir|l|␣named|␣Lily|.|␣She");
  for (const text of [
    defaultPrompt,
    "Lily's mom said, \"Don't worry.\"\nThey played all day!",
    "  two leading spaces, tabs\tand trailing space ",
    "naïve café — “curly quotes”, ñ, and emoji 🙂🚀",
    "Tim and Sue had 3 apples; 1 + 2 = 3 (true) [ok] {braces} ~ | \\ %",
    "",
    "x"
  ]) {
    expect(decode(tokenizer, encode(tokenizer, text))).toBe(text);
  }
  expect(pieceLabel(tokenizer, 0x0a + 3)).toBe("↵");
});

test("sampling: temperature softmax, greedy argmax, and inverse-CDF draws", () => {
  const prompt = encode(tokenizer, defaultPrompt);
  const logits = new Llama2Session(model, 64).run(prompt).logits.slice();
  const warm = softmaxWithTemperature(logits, 1);
  const cool = softmaxWithTemperature(logits, 0.5);
  expect(warm.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  expect(cool.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  const top = topTokens(warm, 5);
  expect(top[0].id).toBe(argmax(logits));
  expect(cool[top[0].id]).toBeGreaterThan(warm[top[0].id]);
  expect(top.every((entry, index) => index === 0 || entry.probability <= top[index - 1].probability)).toBe(true);
  expect(sampleToken(logits, 0)).toBe(argmax(logits));
  expect(sampleFromProbabilities([0.2, 0.5, 0.3], 0)).toBe(0);
  expect(sampleFromProbabilities([0.2, 0.5, 0.3], 0.69)).toBe(1);
  expect(sampleFromProbabilities([0.2, 0.5, 0.3], 0.99)).toBe(2);
  expect(() => softmaxWithTemperature(logits, 0)).toThrow(/positive/);
  console.log(`Next token after the default prompt: ${top.map(({ id, probability }) => `${pieceLabel(tokenizer, id)} ${(probability * 100).toFixed(1)}%`).join(", ")}`);
});

test("forward-pass timing for the default prompt and the 64-token cap", () => {
  const prompt = encode(tokenizer, defaultPrompt);
  const long = encode(tokenizer, documentedGreedy).slice(0, 64);
  const session = new Llama2Session(model, 64);
  const time = (tokens: number[]) => {
    const samples: number[] = [];
    for (let repeat = 0; repeat < 30; repeat += 1) {
      session.run([0]);
      const start = performance.now();
      session.run(tokens);
      samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[15];
  };
  const prompt17 = time(prompt);
  const full64 = time(long);
  console.log(`Node median full pass incl. attention capture: ${prompt.length} tokens ${prompt17.toFixed(1)}ms, ${long.length} tokens ${full64.toFixed(1)}ms.`);
  expect(Number.isFinite(prompt17) && Number.isFinite(full64)).toBe(true);
});

test("the built site serves the model files byte-for-byte", async ({ request }) => {
  for (const [name, expected] of Object.entries(files)) {
    const response = await request.get(`/models/stories260K/${name}`);
    expect(response.status()).toBe(200);
    const body = await response.body();
    expect(body.length).toBe(expected.bytes);
    expect(createHash("sha256").update(body).digest("hex")).toBe(expected.sha256);
  }
});
