export const modelDimension = 16;
export const attentionHeads = 2;
export const hiddenMultiplier = 4;
export const contextLength = 12;
export const epochLimit = 24;
export const learningRate = 0.002;
export const batchSize = 16;
export const weightDecay = 1;
export const gradientClip = 1;
/* Words seen fewer times than this in the training documents map to <unk>. */
export const minimumCount = 2;
const vocabularyLimit = 512;
const normEpsilon = 1e-5;
const beta1 = 0.9;
const beta2 = 0.99;

const groupNames = [
  "tokens", "positions", "attentionNorm", "query", "key", "value", "projection",
  "feedForwardNorm", "up", "upBias", "down", "downBias", "outputNorm", "output", "outputBias"
] as const;
const decayed = new Set<ParameterGroup>(["tokens", "positions", "query", "key", "value", "projection", "up", "down", "output"]);

export type ParameterGroup = (typeof groupNames)[number];
export type Weights = Record<ParameterGroup, Float64Array>;
export type TinyModel = {
  vocabulary: string[]; dimension: number; heads: number; hidden: number; seed: number; weights: Weights;
  optimizer?: { step: number; first: Weights; second: Weights };
};
export type TinyModelOptions = { dimension?: number; heads?: number; seed?: number };
export type Example = { context: number[]; target: number };
export type Dataset = { train: Example[]; validation: Example[] };
export type Measurement = { epoch: number; loss: number; validationLoss: number; tokens: number };
export type ModelSnapshot = { model: TinyModel; measurements: Measurement[]; trainSize: number; validationSize: number; parameters: number; unigramLoss: number };
export type ModelRequest = { type: "init"; texts: string[] } | { type: "train"; epochs: number } | { type: "pause" | "reset" };
export type ModelResponse = { type: "snapshot"; snapshot: ModelSnapshot; running: boolean } | { type: "error"; message: string };

export const tokenizeModel = (text: string) => text.toLowerCase().match(/[a-z0-9]+|&/g) ?? [];
export const isHeldOut = (documentIndex: number) => documentIndex % 5 === 4;
export function probabilities(logits: number[]) {
  const max = Math.max(...logits);
  const values = logits.map((value) => Math.exp(value - max));
  const sum = values.reduce((total, value) => total + value, 0);
  return values.map((value) => value / sum);
}
function random(model: { seed: number }) {
  model.seed = (Math.imul(model.seed, 1664525) + 1013904223) >>> 0;
  return model.seed / 4294967296;
}

function shapes(vocabulary: number, d: number, hidden: number): Record<ParameterGroup, number> {
  return {
    tokens: vocabulary * d, positions: contextLength * d, attentionNorm: d, query: d * d, key: d * d, value: d * d, projection: d * d,
    feedForwardNorm: d, up: hidden * d, upBias: hidden, down: d * hidden, downBias: d, outputNorm: d, output: vocabulary * d, outputBias: vocabulary
  };
}
const mapWeights = (weights: Weights, make: (values: Float64Array, name: ParameterGroup) => Float64Array) =>
  Object.fromEntries(groupNames.map((name) => [name, make(weights[name], name)])) as Weights;
const zerosLike = (weights: Weights) => mapWeights(weights, (values) => new Float64Array(values.length));
export const countParameters = (model: TinyModel) => groupNames.reduce((sum, name) => sum + model.weights[name].length, 0);

export function createModel(texts: string[], options: TinyModelOptions = {}): { model: TinyModel; data: Dataset } {
  if (texts.length < 5) throw new Error("The tiny model needs at least five documents for a held-out split.");
  const { dimension = modelDimension, heads = attentionHeads, seed = 2642 } = options;
  if (!Number.isInteger(heads) || !Number.isInteger(dimension) || heads < 1 || dimension % heads) throw new Error("The model dimension must split evenly across attention heads.");
  const documents = texts.map(tokenizeModel);
  const counts = new Map<string, number>();
  documents.forEach((words, index) => { if (!isHeldOut(index)) words.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1)); });
  const vocabulary = ["<bos>", "<unk>", "<eos>", ...Array.from(counts.keys())
    .filter((word) => counts.get(word)! >= minimumCount)
    .sort((a, b) => (counts.get(b)! - counts.get(a)!) || (a < b ? -1 : 1))
    .slice(0, vocabularyLimit - 3)];
  const hidden = dimension * hiddenMultiplier;
  const sizes = shapes(vocabulary.length, dimension, hidden);
  const model: TinyModel = { vocabulary, dimension, heads, hidden, seed, weights: {} as Weights };
  const uniform = (length: number, scale: number) => Float64Array.from({ length }, () => (random(model) * 2 - 1) * scale);
  const scales: Partial<Record<ParameterGroup, number>> = {
    tokens: 0.1, positions: 0.1, query: dimension ** -0.5, key: dimension ** -0.5, value: dimension ** -0.5, projection: dimension ** -0.5,
    up: dimension ** -0.5, down: hidden ** -0.5, output: 0.5 * dimension ** -0.5
  };
  for (const name of groupNames) {
    model.weights[name] = name.endsWith("Norm") ? new Float64Array(sizes[name]).fill(1) : name.endsWith("Bias") ? new Float64Array(sizes[name]) : uniform(sizes[name], scales[name]!);
  }
  const index = new Map(vocabulary.map((word, id) => [word, id]));
  const data: Dataset = { train: [], validation: [] };
  documents.forEach((words, documentIndex) => {
    const ids = [0, ...words.map((word) => index.get(word) ?? 1), 2];
    for (let position = 1; position < ids.length; position += 1) {
      (isHeldOut(documentIndex) ? data.validation : data.train).push({
        context: ids.slice(Math.max(0, position - contextLength), position), target: ids[position]
      });
    }
  });
  return { model, data };
}

export function tokenId(model: TinyModel, word: string) {
  const id = model.vocabulary.indexOf(word.toLowerCase());
  return id === -1 ? 1 : id;
}

/* Held-out loss of a context-free word-frequency guess fit to the training targets (add-0.5 smoothing): the bar attention has to beat. */
export function unigramLoss(vocabularySize: number, data: Dataset) {
  if (!data.validation.length) throw new Error("Loss needs a non-empty evaluation set.");
  const counts = new Float64Array(vocabularySize).fill(0.5);
  for (const { target } of data.train) counts[target] += 1;
  const total = data.train.length + vocabularySize * 0.5;
  return -data.validation.reduce((sum, { target }) => sum + Math.log(counts[target] / total), 0) / data.validation.length;
}

/* Scratch buffers for one example, reused across calls with the same model shape. */
type Workspace = ReturnType<typeof makeWorkspace>;
function makeWorkspace(vocabulary: number, d: number, hidden: number, heads: number) {
  const vector = (length: number) => new Float64Array(length);
  return {
    key: `${vocabulary}:${d}:${hidden}:${heads}`,
    x: vector(contextLength * d), inverse: vector(contextLength), n: vector(contextLength * d),
    k: vector(contextLength * d), v: vector(contextLength * d), q: vector(d), attention: vector(heads * contextLength),
    o: vector(d), u: vector(d), uInverse: 0, m: vector(d), z: vector(hidden), t: vector(hidden), act: vector(hidden),
    w: vector(d), wInverse: 0, h: vector(d), probabilities: vector(vocabulary),
    dh: vector(d), dw: vector(d), dact: vector(hidden), dm: vector(d), du: vector(d), dO: vector(d), dq: vector(d), da: vector(contextLength),
    dk: vector(contextLength * d), dv: vector(contextLength * d), dn: vector(contextLength * d), dx: vector(d)
  };
}
let cached: Workspace | undefined;
function workspace(model: TinyModel) {
  const key = `${model.vocabulary.length}:${model.dimension}:${model.hidden}:${model.heads}`;
  if (cached?.key !== key) cached = makeWorkspace(model.vocabulary.length, model.dimension, model.hidden, model.heads);
  return cached;
}

/* out = W x (+ bias), with W stored row-major as rows x columns. */
function affine(W: Float64Array, rows: number, columns: number, x: Float64Array, xOffset: number, out: Float64Array, outOffset: number, bias?: Float64Array) {
  for (let row = 0; row < rows; row += 1) {
    let sum = bias ? bias[row] : 0;
    const base = row * columns;
    for (let column = 0; column < columns; column += 1) sum += W[base + column] * x[xOffset + column];
    out[outOffset + row] = sum;
  }
}
/* Gradients of out = W x: dW += dy x^T and dx += W^T dy. */
function affineBack(W: Float64Array, dW: Float64Array, rows: number, columns: number, dy: Float64Array, dyOffset: number, x: Float64Array, xOffset: number, dx: Float64Array, dxOffset: number) {
  for (let row = 0; row < rows; row += 1) {
    const gradient = dy[dyOffset + row];
    const base = row * columns;
    for (let column = 0; column < columns; column += 1) {
      dW[base + column] += gradient * x[xOffset + column];
      dx[dxOffset + column] += W[base + column] * gradient;
    }
  }
}
/* RMSNorm: out = gain * x / sqrt(mean(x^2) + epsilon). Returns 1 / rms. */
function rmsNorm(x: Float64Array, xOffset: number, gain: Float64Array, out: Float64Array, outOffset: number, d: number) {
  let squares = 0;
  for (let e = 0; e < d; e += 1) squares += x[xOffset + e] * x[xOffset + e];
  const inverse = 1 / Math.sqrt(squares / d + normEpsilon);
  for (let e = 0; e < d; e += 1) out[outOffset + e] = gain[e] * x[xOffset + e] * inverse;
  return inverse;
}
function rmsNormBack(x: Float64Array, xOffset: number, gain: Float64Array, dGain: Float64Array, inverse: number, dy: Float64Array, dyOffset: number, dx: Float64Array, d: number) {
  let dot = 0;
  for (let e = 0; e < d; e += 1) {
    dot += dy[dyOffset + e] * gain[e] * x[xOffset + e];
    dGain[e] += dy[dyOffset + e] * x[xOffset + e] * inverse;
  }
  const correction = dot * inverse ** 3 / d;
  for (let e = 0; e < d; e += 1) dx[e] += gain[e] * dy[dyOffset + e] * inverse - x[xOffset + e] * correction;
}

const geluScale = Math.sqrt(2 / Math.PI);
/* Writes the pre-norm input, its RMSNorm, and the fused key/value projections for one (token, position) pair at slot j. */
function embed(model: TinyModel, ws: Workspace, id: number, position: number, j: number) {
  const { dimension: d, weights: W } = model, base = j * d, token = id * d, at = position * d;
  for (let e = 0; e < d; e += 1) ws.x[base + e] = W.tokens[token + e] + W.positions[at + e];
  ws.inverse[j] = rmsNorm(ws.x, base, W.attentionNorm, ws.n, base, d);
  for (let row = 0; row < d; row += 1) {
    let key = 0, value = 0;
    for (let e = 0, offset = row * d; e < d; e += 1) {
      key += W.key[offset + e] * ws.n[base + e];
      value += W.value[offset + e] * ws.n[base + e];
    }
    ws.k[base + row] = key;
    ws.v[base + row] = value;
  }
}

/* Keys and values for every (token, position) pair plus queries for the newest position. Weights are fixed during evaluation, so measureLoss reuses them. */
type Projections = { k: Float64Array; v: Float64Array; q: Float64Array };
function projectAll(model: TinyModel, ws: Workspace): Projections {
  const d = model.dimension, V = model.vocabulary.length;
  const k = new Float64Array(V * contextLength * d), v = new Float64Array(V * contextLength * d), q = new Float64Array(V * d);
  for (let id = 0; id < V; id += 1) {
    for (let position = 0; position < contextLength; position += 1) {
      embed(model, ws, id, position, 0);
      k.set(ws.k.subarray(0, d), (id * contextLength + position) * d);
      v.set(ws.v.subarray(0, d), (id * contextLength + position) * d);
      if (!position) affine(model.weights.query, d, d, ws.n, 0, q, id * d);
    }
  }
  return { k, v, q };
}

function attend(model: TinyModel, ws: Workspace, ids: number[], cache?: Projections) {
  const { dimension: d, heads, weights: W } = model;
  const T = ids.length, size = d / heads, scale = 1 / Math.sqrt(size), last = (T - 1) * d;
  if (!T) throw new Error("Attention needs at least one context token.");
  if (T > contextLength) throw new Error(`Attention accepts at most ${contextLength} context tokens.`);
  for (const id of ids) if (!Number.isInteger(id) || id < 0 || id >= model.vocabulary.length) throw new Error("Token IDs must come from the model vocabulary.");
  if (cache) {
    for (let j = 0; j < T; j += 1) {
      const at = (ids[j] * contextLength + T - 1 - j) * d;
      for (let e = 0; e < d; e += 1) { ws.k[j * d + e] = cache.k[at + e]; ws.v[j * d + e] = cache.v[at + e]; }
    }
    for (let e = 0; e < d; e += 1) {
      ws.x[last + e] = W.tokens[ids[T - 1] * d + e] + W.positions[e];
      ws.q[e] = cache.q[ids[T - 1] * d + e];
    }
  } else {
    for (let j = 0; j < T; j += 1) embed(model, ws, ids[j], T - 1 - j, j);
    affine(W.query, d, d, ws.n, last, ws.q, 0);
  }
  for (let head = 0; head < heads; head += 1) {
    const offset = head * size, row = head * contextLength;
    let max = -Infinity;
    for (let j = 0; j < T; j += 1) {
      let score = 0;
      for (let e = 0; e < size; e += 1) score += ws.q[offset + e] * ws.k[j * d + offset + e];
      ws.attention[row + j] = score * scale;
      max = Math.max(max, score * scale);
    }
    let sum = 0;
    for (let j = 0; j < T; j += 1) { ws.attention[row + j] = Math.exp(ws.attention[row + j] - max); sum += ws.attention[row + j]; }
    for (let j = 0; j < T; j += 1) ws.attention[row + j] /= sum;
    for (let e = 0; e < size; e += 1) {
      let value = 0;
      for (let j = 0; j < T; j += 1) value += ws.attention[row + j] * ws.v[j * d + offset + e];
      ws.o[offset + e] = value;
    }
  }
  return T;
}

/* One transformer block evaluated at the newest position: pre-norm attention and GELU feed-forward, each with a residual. */
function forward(model: TinyModel, ws: Workspace, ids: number[], cache?: Projections) {
  const { dimension: d, hidden, weights: W } = model;
  const T = attend(model, ws, ids, cache), last = (T - 1) * d, V = model.vocabulary.length;
  affine(W.projection, d, d, ws.o, 0, ws.u, 0);
  for (let e = 0; e < d; e += 1) ws.u[e] += ws.x[last + e];
  ws.uInverse = rmsNorm(ws.u, 0, W.feedForwardNorm, ws.m, 0, d);
  affine(W.up, hidden, d, ws.m, 0, ws.z, 0, W.upBias);
  for (let c = 0; c < hidden; c += 1) {
    const z = ws.z[c];
    ws.t[c] = Math.tanh(geluScale * (z + 0.044715 * z * z * z));
    ws.act[c] = 0.5 * z * (1 + ws.t[c]);
  }
  affine(W.down, d, hidden, ws.act, 0, ws.w, 0, W.downBias);
  for (let e = 0; e < d; e += 1) ws.w[e] += ws.u[e];
  ws.wInverse = rmsNorm(ws.w, 0, W.outputNorm, ws.h, 0, d);
  affine(W.output, V, d, ws.h, 0, ws.probabilities, 0, W.outputBias);
  let max = -Infinity, sum = 0;
  for (let i = 0; i < V; i += 1) max = Math.max(max, ws.probabilities[i]);
  for (let i = 0; i < V; i += 1) { ws.probabilities[i] = Math.exp(ws.probabilities[i] - max); sum += ws.probabilities[i]; }
  for (let i = 0; i < V; i += 1) ws.probabilities[i] /= sum;
  return T;
}

/* Adds this example's cross-entropy gradient to grads and returns its loss. */
function accumulate(model: TinyModel, ws: Workspace, example: Example, grads: Weights) {
  const { dimension: d, hidden, heads, weights: W } = model;
  const ids = example.context.length > contextLength ? example.context.slice(-contextLength) : example.context;
  const T = forward(model, ws, ids), last = (T - 1) * d, V = model.vocabulary.length;
  const size = d / heads, scale = 1 / Math.sqrt(size);
  const loss = -Math.log(Math.max(1e-12, ws.probabilities[example.target]));
  ws.probabilities[example.target] -= 1;
  for (let i = 0; i < V; i += 1) grads.outputBias[i] += ws.probabilities[i];
  ws.dh.fill(0);
  affineBack(W.output, grads.output, V, d, ws.probabilities, 0, ws.h, 0, ws.dh, 0);
  ws.dw.fill(0);
  rmsNormBack(ws.w, 0, W.outputNorm, grads.outputNorm, ws.wInverse, ws.dh, 0, ws.dw, d);
  for (let e = 0; e < d; e += 1) grads.downBias[e] += ws.dw[e];
  ws.dact.fill(0);
  affineBack(W.down, grads.down, d, hidden, ws.dw, 0, ws.act, 0, ws.dact, 0);
  for (let c = 0; c < hidden; c += 1) {
    const z = ws.z[c], t = ws.t[c];
    ws.dact[c] *= 0.5 * (1 + t) + 0.5 * z * (1 - t * t) * geluScale * (1 + 3 * 0.044715 * z * z);
    grads.upBias[c] += ws.dact[c];
  }
  ws.dm.fill(0);
  affineBack(W.up, grads.up, hidden, d, ws.dact, 0, ws.m, 0, ws.dm, 0);
  ws.du.set(ws.dw);
  rmsNormBack(ws.u, 0, W.feedForwardNorm, grads.feedForwardNorm, ws.uInverse, ws.dm, 0, ws.du, d);
  ws.dO.fill(0);
  affineBack(W.projection, grads.projection, d, d, ws.du, 0, ws.o, 0, ws.dO, 0);
  ws.dq.fill(0);
  for (let head = 0; head < heads; head += 1) {
    const offset = head * size, row = head * contextLength;
    let mean = 0;
    for (let j = 0; j < T; j += 1) {
      let da = 0;
      for (let e = 0; e < size; e += 1) da += ws.dO[offset + e] * ws.v[j * d + offset + e];
      ws.da[j] = da;
      mean += ws.attention[row + j] * da;
    }
    for (let j = 0; j < T; j += 1) {
      const weight = ws.attention[row + j], ds = weight * (ws.da[j] - mean) * scale;
      for (let e = 0; e < size; e += 1) {
        ws.dq[offset + e] += ds * ws.k[j * d + offset + e];
        ws.dk[j * d + offset + e] = ds * ws.q[offset + e];
        ws.dv[j * d + offset + e] = weight * ws.dO[offset + e];
      }
    }
  }
  ws.dn.fill(0, 0, T * d);
  affineBack(W.query, grads.query, d, d, ws.dq, 0, ws.n, last, ws.dn, last);
  for (let j = 0; j < T; j += 1) {
    const base = j * d, token = ids[j] * d, position = (T - 1 - j) * d;
    for (let row = 0; row < d; row += 1) {
      const gk = ws.dk[base + row], gv = ws.dv[base + row];
      for (let e = 0, offset = row * d; e < d; e += 1) {
        grads.key[offset + e] += gk * ws.n[base + e];
        grads.value[offset + e] += gv * ws.n[base + e];
        ws.dn[base + e] += W.key[offset + e] * gk + W.value[offset + e] * gv;
      }
    }
    if (j === T - 1) ws.dx.set(ws.du); else ws.dx.fill(0);
    rmsNormBack(ws.x, base, W.attentionNorm, grads.attentionNorm, ws.inverse[j], ws.dn, base, ws.dx, d);
    for (let e = 0; e < d; e += 1) { grads.tokens[token + e] += ws.dx[e]; grads.positions[position + e] += ws.dx[e]; }
  }
  return loss;
}

/* Mean loss and exact mean gradient over examples. Used by training and by the finite-difference test. */
export function lossAndGradients(model: TinyModel, examples: Example[]) {
  if (!examples.length) throw new Error("Gradients need at least one example.");
  const ws = workspace(model), gradients = zerosLike(model.weights);
  let loss = 0;
  for (const example of examples) loss += accumulate(model, ws, example, gradients);
  for (const name of groupNames) gradients[name].forEach((value, index, values) => { values[index] = value / examples.length; });
  return { loss: loss / examples.length, gradients };
}

/* AdamW with global-norm clipping. Norm gains and biases are not decayed. */
function adamStep(model: TinyModel, grads: Weights, count: number) {
  const optimizer = model.optimizer ??= { step: 0, first: zerosLike(model.weights), second: zerosLike(model.weights) };
  let squares = 0;
  for (const name of groupNames) {
    const gradient = grads[name];
    for (let index = 0; index < gradient.length; index += 1) squares += gradient[index] * gradient[index];
  }
  const norm = Math.sqrt(squares) / count;
  const factor = (norm > gradientClip ? gradientClip / norm : 1) / count;
  optimizer.step += 1;
  const rate = learningRate * Math.sqrt(1 - beta2 ** optimizer.step) / (1 - beta1 ** optimizer.step);
  for (const name of groupNames) {
    const weights = model.weights[name], gradient = grads[name], first = optimizer.first[name], second = optimizer.second[name];
    const keep = decayed.has(name) ? 1 - learningRate * weightDecay : 1;
    for (let index = 0; index < weights.length; index += 1) {
      const g = gradient[index] * factor;
      first[index] = beta1 * first[index] + (1 - beta1) * g;
      second[index] = beta2 * second[index] + (1 - beta2) * g * g;
      weights[index] = weights[index] * keep - rate * first[index] / (Math.sqrt(second[index]) + 1e-8);
    }
  }
}

let batchGradients: Weights | undefined;
export function trainEpoch(model: TinyModel, examples: Example[]) {
  if (!examples.length) throw new Error("Training needs a non-empty training set.");
  const order = examples.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random(model) * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  const ws = workspace(model);
  if (!batchGradients || groupNames.some((name) => batchGradients![name].length !== model.weights[name].length)) batchGradients = zerosLike(model.weights);
  for (let start = 0; start < order.length; start += batchSize) {
    for (const name of groupNames) batchGradients[name].fill(0);
    const end = Math.min(order.length, start + batchSize);
    for (let index = start; index < end; index += 1) accumulate(model, ws, examples[order[index]], batchGradients);
    adamStep(model, batchGradients, end - start);
  }
}

export function measureLoss(model: TinyModel, examples: Example[]) {
  if (!examples.length) throw new Error("Loss needs a non-empty evaluation set.");
  const ws = workspace(model), cache = projectAll(model, ws);
  let loss = 0;
  for (const example of examples) {
    forward(model, ws, example.context.length > contextLength ? example.context.slice(-contextLength) : example.context, cache);
    loss -= Math.log(Math.max(1e-12, ws.probabilities[example.target]));
  }
  loss /= examples.length;
  if (!Number.isFinite(loss)) throw new Error("The tiny model produced a non-finite loss.");
  return loss;
}

function headRows(model: TinyModel, ws: Workspace, T: number) {
  return Array.from({ length: model.heads }, (_, head) => Array.from(ws.attention.subarray(head * contextLength, head * contextLength + T)));
}
const averageRows = (rows: number[][]) => rows[0].map((_, j) => rows.reduce((sum, row) => sum + row[j], 0) / rows.length);

export function predict(model: TinyModel, context: number[]) {
  const ws = workspace(model);
  const T = forward(model, ws, context.slice(-contextLength));
  const heads = headRows(model, ws, T);
  return { distribution: Array.from(ws.probabilities), weights: averageRows(heads), heads };
}

/* Causal attention rows for a word sequence: row r covers tokens 0..r (zeros outside the context window). Averaged across heads unless a head is given. */
export function attentionRows(model: TinyModel, words: string[], head?: number) {
  if (head !== undefined && !(Number.isInteger(head) && head >= 0 && head < model.heads)) throw new Error(`Head must be an integer from 0 to ${model.heads - 1}.`);
  const ids = words.map((word) => tokenId(model, word)), ws = workspace(model);
  return ids.map((_, row) => {
    const start = Math.max(0, row + 1 - contextLength);
    const heads = headRows(model, ws, attend(model, ws, ids.slice(start, row + 1)));
    return [...Array<number>(start).fill(0), ...(head === undefined ? averageRows(heads) : heads[head])];
  });
}
