// Model downloads require consent; returning visits restore already-cached weights.
import { AutoModelForCausalLM, AutoTokenizer, env, type PreTrainedModel, type PreTrainedTokenizer, type Tensor } from "@huggingface/transformers";
import { InferenceValidationError, logSumExp, verifyPrediction } from "./inference";
import { MODEL_CACHE_NAME } from "./modelCache";
import { nextTokenData } from "./nextTokenData";

export type LiveDevice = "webgpu" | "wasm";
export type LiveDtype = "q4f16" | "q4";
export type LiveToken = { id: number; text: string; logit: number };
export type LiveErrorKind = "cache-miss" | "inference" | "network" | "memory" | "unsupported" | "other";

export type LiveRequest =
  | { type: "load"; model: string; revision: string; dtype: LiveDtype; temperatures: number[]; cacheOnly: boolean }
  | { type: "predict"; id: number; text: string; k: number }
  | { type: "sample"; id: number; text: string; temperature: number };

export type LiveResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "status"; message: string }
  | { type: "ready"; device: LiveDevice; validated: boolean; fallback?: string }
  | { type: "prediction"; id: number; text: string; tokens: number; inputIds: number[]; top: LiveToken[]; lse: number[]; rest: number[]; ms: number }
  | { type: "sampled"; id: number; text: string; token: LiveToken; probability: number }
  | { type: "error"; id?: number; kind: LiveErrorKind; message: string };

type GPUAdapterLike = { features: { has(name: string): boolean } };
type GPULike = { requestAdapter(): Promise<GPUAdapterLike | null> };
type WorkerScope = { postMessage(message: LiveResponse): void; onmessage: ((event: MessageEvent<LiveRequest>) => void) | null };

const scope = self as unknown as WorkerScope;
const send = (message: LiveResponse) => scope.postMessage(message);
const fetchRemote = env.fetch;

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let temperatures: number[] = [];
let cached: { text: string; tokens: number; inputIds: number[]; logits: Float32Array } | null = null;
let latestPredict = 0;
let queue: Promise<unknown> = Promise.resolve();

function classify(error: unknown): { kind: LiveErrorKind; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof InferenceValidationError) return { kind: "inference", message };
  if (message.includes("Cached model file unavailable")) return { kind: "cache-miss", message };
  if (/fetch|network|load failed|could not locate|offline|ERR_|\b(403|404|429|5\d\d)\b/i.test(message)) return { kind: "network", message };
  if (/memory|allocation|bad_alloc|Aborted\(/i.test(message) || error instanceof RangeError) return { kind: "memory", message };
  if (/webgpu|wasm|webassembly|backend|execution provider/i.test(message)) return { kind: "unsupported", message };
  return { kind: "other", message };
}

async function pickDevice(dtype: LiveDtype): Promise<LiveDevice> {
  try {
    const gpu = (navigator as Navigator & { gpu?: GPULike }).gpu;
    const adapter = await gpu?.requestAdapter();
    // q4f16 requires half-precision shaders; q4 uses float32 computation.
    return adapter && (dtype === "q4" || adapter.features.has("shader-f16")) ? "webgpu" : "wasm";
  } catch (error) {
    console.warn("Next Token could not inspect the GPU; using WebAssembly:", error);
    return "wasm";
  }
}

async function load({ model: id, revision, dtype, temperatures: grid, cacheOnly }: Extract<LiveRequest, { type: "load" }>) {
  temperatures = grid;
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status !== "progress" || !info.file) return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
    let loaded = 0;
    let total = 0;
    files.forEach((file) => { loaded += file.loaded; total += file.total; });
    send({ type: "progress", loaded, total });
  };

  // The site serves an HTML fallback for unknown paths, so never look for model files on this origin.
  env.allowLocalModels = false;
  env.cacheKey = MODEL_CACHE_NAME;
  // Tokenizer discovery in transformers.js 4.3.2 omits the revision. Pin its metadata lookups too.
  env.remotePathTemplate = `{model}/resolve/${encodeURIComponent(revision)}/`;
  // local_files_only conflicts with allowLocalModels=false in transformers.js. Guard its
  // remote fetch instead, so cache eviction cannot silently trigger a fresh model download.
  env.fetch = (input, options) => {
    if (cacheOnly && new URL(input).origin === new URL(env.remoteHost).origin) {
      throw new Error("Cached model file unavailable. Download the model again to continue.");
    }
    return fetchRemote(input, options);
  };
  send({ type: "status", message: cacheOnly ? "Restoring the saved tokenizer" : "Downloading the tokenizer" });
  tokenizer = await AutoTokenizer.from_pretrained(id, { revision, progress_callback });
  let device = await pickDevice(dtype);
  let fallback: string | undefined;
  const validated = id === nextTokenData.meta.model && revision === nextTokenData.meta.revision && dtype === nextTokenData.meta.dtype;
  const initialize = async () => {
    cached = null;
    model = await AutoModelForCausalLM.from_pretrained(id, { revision, dtype, device, progress_callback });
    send({ type: "status", message: validated ? "Checking the model's calculations" : "Warming up a diagnostic model" });
    if (validated) {
      // Multiple sequence lengths catch failures that the old one-token warm-up missed.
      const references = [nextTokenData.prompts[0], nextTokenData.prompts[nextTokenData.prompts.length - 1]];
      const atOne = nextTokenData.meta.temperatures.indexOf(1);
      for (const reference of references) {
        const result = await logitsFor(reference.text);
        verifyPrediction(result.logits, result.tokens, { ...reference, vocabSize: nextTokenData.meta.vocabSize, lse: reference.lse[atOne] });
      }
    } else {
      await logitsFor("Hello");
    }
  };
  send({ type: "status", message: cacheOnly ? "Restoring the saved model weights" : "Downloading the model weights" });
  try {
    await initialize();
  } catch (error) {
    if (device !== "webgpu" || ["network", "cache-miss"].includes(classify(error).kind)) throw error;
    fallback = error instanceof InferenceValidationError
      ? "WebGPU did not pass the calculation check. Using verified WebAssembly instead."
      : "WebGPU could not run this model. Using verified WebAssembly instead.";
    console.warn("Next Token is falling back from WebGPU:", error);
    await model?.dispose();
    model = null;
    device = "wasm";
    send({ type: "status", message: "Restoring and checking the model on WebAssembly" });
    await initialize();
  }
  send({ type: "ready", device, validated, fallback });
}

async function logitsFor(text: string) {
  if (cached?.text === text) return cached;
  if (!tokenizer || !model) throw new Error("The model is not loaded yet.");
  const inputs = tokenizer(text);
  let outputs: Record<string, Tensor> | undefined;
  let converted: Tensor | undefined;
  try {
    outputs = (await model(inputs)) as Record<string, Tensor>;
    const { logits } = outputs;
    const [, length, vocab] = logits.dims;
    converted = logits.type === "float32" ? logits : logits.to("float32");
    const last = (converted.data as Float32Array).slice((length - 1) * vocab, length * vocab);
    const inputIds = Array.from(inputs.input_ids.data as BigInt64Array, Number);
    if (last.some((score) => !Number.isFinite(score))) throw new InferenceValidationError("The model returned a non-finite score.");
    cached = { text, tokens: length, inputIds, logits: last };
    return cached;
  } finally {
    if (converted && converted !== outputs?.logits) converted.dispose();
    Object.values(outputs ?? {}).forEach((tensor) => tensor.dispose?.());
    Object.values(inputs).forEach((tensor) => tensor.dispose?.());
  }
}

const decode = (id: number) => tokenizer!.decode([id]);

async function predict({ id, text, k }: Extract<LiveRequest, { type: "predict" }>) {
  if (id !== latestPredict) return;
  const started = performance.now();
  const { tokens, inputIds, logits } = await logitsFor(text);
  const ranked: number[] = [];
  for (let token = 0; token < logits.length; token += 1) {
    if (ranked.length < k || logits[token] > logits[ranked[ranked.length - 1]]) {
      ranked.push(token);
      ranked.sort((a, b) => logits[b] - logits[a]);
      if (ranked.length > k) ranked.pop();
    }
  }
  const skip = new Set(ranked);
  send({
    type: "prediction", id, text, tokens, inputIds,
    top: ranked.map((token) => ({ id: token, text: decode(token), logit: logits[token] })),
    lse: temperatures.map((temperature) => logSumExp(logits, temperature)),
    rest: temperatures.map((temperature) => logSumExp(logits, temperature, skip)),
    ms: Math.round(performance.now() - started)
  });
}

async function sample({ id, text, temperature }: Extract<LiveRequest, { type: "sample" }>) {
  const { logits } = await logitsFor(text);
  const lse = logSumExp(logits, temperature);
  let target = Math.random();
  let choice = logits.length - 1;
  for (let token = 0; token < logits.length; token += 1) {
    target -= Math.exp(logits[token] / temperature - lse);
    if (target <= 0) { choice = token; break; }
  }
  send({ type: "sampled", id, text, token: { id: choice, text: decode(choice), logit: logits[choice] }, probability: Math.exp(logits[choice] / temperature - lse) });
}

scope.onmessage = ({ data }: MessageEvent<LiveRequest>) => {
  if (data.type === "predict") latestPredict = data.id;
  queue = queue.then(async () => {
    try {
      if (data.type === "load") await load(data);
      else if (data.type === "predict") await predict(data);
      else await sample(data);
    } catch (error) {
      send({ type: "error", id: data.type === "load" ? undefined : data.id, ...classify(error) });
    }
  });
};
