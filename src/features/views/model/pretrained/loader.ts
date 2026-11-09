import { parseCheckpoint, type Llama2Model } from "./llama2";
import { parseTokenizer, type Tokenizer } from "./tokenizer";

export const stories260KFiles = {
  checkpoint: "stories260K.bin",
  tokenizer: "tok512.bin",
  /** Exact sizes of the files in public/models/stories260K, used for progress when Content-Length is missing. */
  checkpointBytes: 1_056_540,
  tokenizerBytes: 6_227
} as const;

export const stories260KSource = "https://huggingface.co/karpathy/tinyllamas/tree/main/stories260K";
export const llama2cSource = "https://github.com/karpathy/llama2.c";

export interface LoadedStories260K {
  model: Llama2Model;
  tokenizer: Tokenizer;
  /** The untouched checkpoint bytes, for handing to a worker. */
  checkpoint: ArrayBuffer;
}

export interface LoadProgress {
  loaded: number;
  total: number;
}

async function fetchBinary(url: string, expectedBytes: number, signal?: AbortSignal, onBytes?: (bytes: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  let bytes: Uint8Array;
  if (!response.body) {
    bytes = new Uint8Array(await response.arrayBuffer());
    onBytes?.(bytes.length);
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      onBytes?.(value.length);
    }
    bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  }
  if (bytes.length !== expectedBytes) throw new Error(`${url} has ${bytes.length} bytes; expected ${expectedBytes}.`);
  return bytes.buffer as ArrayBuffer;
}

/** Downloads and parses stories260K.bin and tok512.bin from `baseUrl` (which must end in a slash). */
export async function loadStories260K(baseUrl: string, options: { signal?: AbortSignal; onProgress?: (progress: LoadProgress) => void } = {}): Promise<LoadedStories260K> {
  const total = stories260KFiles.checkpointBytes + stories260KFiles.tokenizerBytes;
  // If either download fails, cancel the other and stop reporting progress, so a late chunk can't mask the error.
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  let loaded = 0;
  let failed = false;
  const onBytes = (bytes: number) => {
    if (failed) return;
    loaded += bytes;
    options.onProgress?.({ loaded: Math.min(loaded, total), total });
  };
  try {
    const [checkpoint, tokenizerBytes] = await Promise.all([
      fetchBinary(`${baseUrl}${stories260KFiles.checkpoint}`, stories260KFiles.checkpointBytes, controller.signal, onBytes),
      fetchBinary(`${baseUrl}${stories260KFiles.tokenizer}`, stories260KFiles.tokenizerBytes, controller.signal, onBytes)
    ]);
    const model = parseCheckpoint(checkpoint);
    const tokenizer = parseTokenizer(tokenizerBytes, model.config.vocabSize);
    return { model, tokenizer, checkpoint };
  } catch (error) {
    failed = true;
    abort();
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}
