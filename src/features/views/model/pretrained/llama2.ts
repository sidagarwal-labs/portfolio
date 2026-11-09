// Dependency-free Llama 2 inference that mirrors run.c from https://github.com/karpathy/llama2.c.

export interface Llama2Config {
  dim: number;
  hiddenDim: number;
  nLayers: number;
  nHeads: number;
  nKvHeads: number;
  vocabSize: number;
  seqLen: number;
  headSize: number;
  kvDim: number;
  /** Query heads per key/value head (grouped-query attention). */
  kvMul: number;
  sharedClassifier: boolean;
}

export interface Llama2Weights {
  tokenEmbedding: Float32Array;
  rmsAtt: Float32Array;
  wq: Float32Array;
  wk: Float32Array;
  wv: Float32Array;
  wo: Float32Array;
  rmsFfn: Float32Array;
  w1: Float32Array;
  w2: Float32Array;
  w3: Float32Array;
  rmsFinal: Float32Array;
  wcls: Float32Array;
}

export interface Llama2Model {
  config: Llama2Config;
  weights: Llama2Weights;
  /** Count of distinct learned floats in the file (a shared classifier is counted once). */
  parameterCount: number;
}

export interface RunState {
  capacity: number;
  x: Float32Array;
  xb: Float32Array;
  xb2: Float32Array;
  hb: Float32Array;
  hb2: Float32Array;
  q: Float32Array;
  att: Float32Array;
  logits: Float32Array;
  keyCache: Float32Array;
  valueCache: Float32Array;
  /** Softmaxed attention indexed [layer][head][query][key], capacity x capacity per head; null when not captured. */
  attention: Float32Array | null;
}

const headerInts = 7;

export function parseCheckpoint(buffer: ArrayBuffer): Llama2Model {
  if (buffer.byteLength < headerInts * 4 || (buffer.byteLength - headerInts * 4) % 4 !== 0) {
    throw new Error("The checkpoint is not a llama2.c model file.");
  }
  const view = new DataView(buffer);
  const [dim, hiddenDim, nLayers, nHeads, nKvHeads, rawVocab, seqLen] = Array.from({ length: headerInts }, (_, index) => view.getInt32(index * 4, true));
  const vocabSize = Math.abs(rawVocab);
  if ([dim, hiddenDim, nLayers, nHeads, nKvHeads, vocabSize, seqLen].some((value) => value <= 0)
    || dim % nHeads !== 0 || nHeads % nKvHeads !== 0 || (dim / nHeads) % 2 !== 0) {
    throw new Error("The checkpoint header describes an unsupported model shape.");
  }
  const headSize = dim / nHeads;
  const config: Llama2Config = {
    dim, hiddenDim, nLayers, nHeads, nKvHeads, vocabSize, seqLen, headSize,
    kvDim: (dim * nKvHeads) / nHeads,
    kvMul: nHeads / nKvHeads,
    sharedClassifier: rawVocab > 0
  };

  const floats = new Float32Array(buffer, headerInts * 4);
  let offset = 0;
  const take = (count: number) => {
    if (offset + count > floats.length) throw new Error("The checkpoint file is truncated.");
    const slice = floats.subarray(offset, offset + count);
    offset += count;
    return slice;
  };
  const tokenEmbedding = take(vocabSize * dim);
  const rmsAtt = take(nLayers * dim);
  const wq = take(nLayers * dim * nHeads * headSize);
  const wk = take(nLayers * dim * nKvHeads * headSize);
  const wv = take(nLayers * dim * nKvHeads * headSize);
  const wo = take(nLayers * nHeads * headSize * dim);
  const rmsFfn = take(nLayers * dim);
  const w1 = take(nLayers * dim * hiddenDim);
  const w2 = take(nLayers * hiddenDim * dim);
  const w3 = take(nLayers * dim * hiddenDim);
  const rmsFinal = take(dim);
  take((seqLen * headSize) / 2); // legacy freq_cis_real; RoPE is computed on the fly
  take((seqLen * headSize) / 2); // legacy freq_cis_imag
  const wcls = config.sharedClassifier ? tokenEmbedding : take(vocabSize * dim);
  if (offset !== floats.length) throw new Error(`The checkpoint has ${floats.length - offset} unexpected trailing values.`);

  const weights: Llama2Weights = { tokenEmbedding, rmsAtt, wq, wk, wv, wo, rmsFfn, w1, w2, w3, rmsFinal, wcls };
  const parameterCount = [...new Set(Object.values(weights))].reduce((sum, array) => sum + array.length, 0);
  return { config, weights, parameterCount };
}

export function createRunState(config: Llama2Config, capacity = config.seqLen, captureAttention = true): RunState {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > config.seqLen) throw new RangeError(`Capacity must be between 1 and ${config.seqLen}.`);
  const cache = config.nLayers * capacity * config.kvDim;
  return {
    capacity,
    x: new Float32Array(config.dim),
    xb: new Float32Array(config.dim),
    xb2: new Float32Array(config.dim),
    hb: new Float32Array(config.hiddenDim),
    hb2: new Float32Array(config.hiddenDim),
    q: new Float32Array(config.dim),
    att: new Float32Array(capacity),
    logits: new Float32Array(config.vocabSize),
    keyCache: new Float32Array(cache),
    valueCache: new Float32Array(cache),
    attention: captureAttention ? new Float32Array(config.nLayers * config.nHeads * capacity * capacity) : null
  };
}

function rmsnorm(out: Float32Array, x: Float32Array, weight: Float32Array, weightOffset: number, size: number) {
  let ss = 0;
  for (let j = 0; j < size; j += 1) ss += x[j] * x[j];
  const scale = 1 / Math.sqrt(ss / size + 1e-5);
  for (let j = 0; j < size; j += 1) out[j] = weight[weightOffset + j] * (scale * x[j]);
}

// W (d, n) @ x (n,) -> out (d,), reading W at `wOffset` and writing at `outOffset`.
// Unrolled by four but still summed strictly left to right, so results match the plain loop.
function matmul(out: Float32Array, outOffset: number, x: Float32Array, w: Float32Array, wOffset: number, n: number, d: number) {
  for (let i = 0; i < d; i += 1) {
    let r = wOffset + i * n;
    let value = 0;
    let j = 0;
    for (; j + 3 < n; j += 4, r += 4) {
      value += w[r] * x[j];
      value += w[r + 1] * x[j + 1];
      value += w[r + 2] * x[j + 2];
      value += w[r + 3] * x[j + 3];
    }
    for (; j < n; j += 1, r += 1) value += w[r] * x[j];
    out[outOffset + i] = value;
  }
}

function softmaxInPlace(values: Float32Array, size: number) {
  let max = values[0];
  for (let i = 1; i < size; i += 1) if (values[i] > max) max = values[i];
  let sum = 0;
  for (let i = 0; i < size; i += 1) {
    values[i] = Math.exp(values[i] - max);
    sum += values[i];
  }
  for (let i = 0; i < size; i += 1) values[i] /= sum;
}

/** One transformer step for `token` at `pos`; writes this position's keys/values into the cache and returns the logits buffer. */
export function forward(model: Llama2Model, state: RunState, token: number, pos: number, computeLogits = true): Float32Array {
  const { dim, hiddenDim, nLayers, nHeads, kvDim, kvMul, headSize, vocabSize } = model.config;
  const w = model.weights;
  const s = state;
  const capacity = s.capacity;
  if (!Number.isInteger(token) || token < 0 || token >= vocabSize) throw new RangeError(`Token ${token} is outside the vocabulary.`);
  if (!Number.isInteger(pos) || pos < 0 || pos >= capacity) throw new RangeError(`Position ${pos} is outside the context of ${capacity}.`);
  const x = s.x;
  x.set(w.tokenEmbedding.subarray(token * dim, (token + 1) * dim));
  const scale = Math.sqrt(headSize);

  for (let l = 0; l < nLayers; l += 1) {
    rmsnorm(s.xb, x, w.rmsAtt, l * dim, dim);

    const layerOffset = l * capacity * kvDim;
    const kvOffset = layerOffset + pos * kvDim;
    matmul(s.q, 0, s.xb, w.wq, l * dim * dim, dim, dim);
    matmul(s.keyCache, kvOffset, s.xb, w.wk, l * dim * kvDim, dim, kvDim);
    matmul(s.valueCache, kvOffset, s.xb, w.wv, l * dim * kvDim, dim, kvDim);

    // RoPE: rotate pairs (i, i+1) of q (every head) and k (kv heads); the angle uses float32 math like run.c's powf.
    for (let i = 0; i < dim; i += 2) {
      const freq = Math.fround(1 / Math.fround(Math.pow(10000, Math.fround((i % headSize) / headSize))));
      const angle = Math.fround(pos * freq);
      const fcr = Math.cos(angle);
      const fci = Math.sin(angle);
      const q0 = s.q[i];
      const q1 = s.q[i + 1];
      s.q[i] = q0 * fcr - q1 * fci;
      s.q[i + 1] = q0 * fci + q1 * fcr;
      if (i < kvDim) {
        const k0 = s.keyCache[kvOffset + i];
        const k1 = s.keyCache[kvOffset + i + 1];
        s.keyCache[kvOffset + i] = k0 * fcr - k1 * fci;
        s.keyCache[kvOffset + i + 1] = k0 * fci + k1 * fcr;
      }
    }

    const { q, xb, att, keyCache, valueCache, attention } = s;
    for (let h = 0; h < nHeads; h += 1) {
      const qOffset = h * headSize;
      const kvHead = Math.floor(h / kvMul) * headSize; // query heads 2k and 2k+1 share kv head k
      for (let t = 0; t <= pos; t += 1) {
        const k = layerOffset + t * kvDim + kvHead;
        let score = 0;
        for (let i = 0; i < headSize; i += 1) score += q[qOffset + i] * keyCache[k + i];
        att[t] = score / scale;
      }
      softmaxInPlace(att, pos + 1);
      if (attention) attention.set(att.subarray(0, pos + 1), ((l * nHeads + h) * capacity + pos) * capacity);

      xb.fill(0, qOffset, qOffset + headSize);
      for (let t = 0; t <= pos; t += 1) {
        const v = layerOffset + t * kvDim + kvHead;
        const a = att[t];
        for (let i = 0; i < headSize; i += 1) xb[qOffset + i] += a * valueCache[v + i];
      }
    }

    matmul(s.xb2, 0, s.xb, w.wo, l * dim * dim, dim, dim);
    for (let i = 0; i < dim; i += 1) x[i] += s.xb2[i];

    rmsnorm(s.xb, x, w.rmsFfn, l * dim, dim);
    matmul(s.hb, 0, s.xb, w.w1, l * dim * hiddenDim, dim, hiddenDim);
    matmul(s.hb2, 0, s.xb, w.w3, l * dim * hiddenDim, dim, hiddenDim);
    for (let i = 0; i < hiddenDim; i += 1) {
      const value = s.hb[i];
      s.hb[i] = (value / (1 + Math.exp(-value))) * s.hb2[i]; // SwiGLU: silu(w1 x) * (w3 x)
    }
    matmul(s.xb, 0, s.hb, w.w2, l * dim * hiddenDim, hiddenDim, dim);
    for (let i = 0; i < dim; i += 1) x[i] += s.xb[i];
  }

  rmsnorm(x, x, w.rmsFinal, 0, dim);
  if (computeLogits) matmul(s.logits, 0, x, w.wcls, 0, dim, vocabSize);
  return s.logits;
}

/** Softmaxed attention of `head` in `layer` from query `pos` over keys 0..pos (a view into the state). */
export function attentionRow(model: Llama2Model, state: RunState, layer: number, head: number, pos: number): Float32Array {
  if (!state.attention) throw new Error("This run state does not capture attention.");
  const start = ((layer * model.config.nHeads + head) * state.capacity + pos) * state.capacity;
  return state.attention.subarray(start, start + pos + 1);
}

/** Runs token sequences, reusing the KV cache and captured attention for the prefix shared with the previous run. */
export class Llama2Session {
  readonly state: RunState;
  private cached: number[] = [];

  constructor(readonly model: Llama2Model, capacity: number) {
    this.state = createRunState(model.config, capacity, true);
  }

  get tokens(): readonly number[] { return this.cached; }

  /** Returns the logits after the last token (a view into the state) and how many positions were (re)computed. */
  run(tokens: readonly number[]): { logits: Float32Array; computed: number } {
    if (tokens.length === 0) throw new RangeError("At least one token is required.");
    if (tokens.length > this.state.capacity) throw new RangeError(`At most ${this.state.capacity} tokens fit in this session.`);
    let shared = 0;
    while (shared < tokens.length - 1 && shared < this.cached.length && tokens[shared] === this.cached[shared]) shared += 1;
    this.cached = this.cached.slice(0, shared);
    for (let pos = shared; pos < tokens.length; pos += 1) {
      forward(this.model, this.state, tokens[pos], pos, pos === tokens.length - 1);
      this.cached.push(tokens[pos]);
    }
    return { logits: this.state.logits, computed: tokens.length - shared };
  }

  /** Copies captured attention for the cached tokens, packed as [layer][head][query][key] with n x n per head. */
  attentionTensor(): Float32Array {
    const n = this.cached.length;
    const { nLayers, nHeads } = this.model.config;
    const tensor = new Float32Array(nLayers * nHeads * n * n);
    for (let l = 0; l < nLayers; l += 1) {
      for (let h = 0; h < nHeads; h += 1) {
        for (let pos = 0; pos < n; pos += 1) tensor.set(attentionRow(this.model, this.state, l, h, pos), ((l * nHeads + h) * n + pos) * n);
      }
    }
    return tensor;
  }
}

/** The n x n matrix (row = query, column = key) for one head of a packed attention tensor, or the mean over heads when head is null. */
export function headAttention(tensor: Float32Array, n: number, nHeads: number, layer: number, head: number | null): Float32Array {
  const size = n * n;
  if (head !== null) return tensor.slice((layer * nHeads + head) * size, (layer * nHeads + head + 1) * size);
  const mean = new Float32Array(size);
  for (let h = 0; h < nHeads; h += 1) {
    const start = (layer * nHeads + h) * size;
    for (let i = 0; i < size; i += 1) mean[i] += tensor[start + i] / nHeads;
  }
  return mean;
}
