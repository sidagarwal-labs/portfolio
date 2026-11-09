import type { Llama2Session } from "./llama2";

export interface RunResult {
  tokens: number[];
  /** Logits for the token after the last one. */
  logits: Float32Array;
  /** Softmaxed attention packed as [layer][head][query][key], n x n per head. */
  attention: Float32Array;
  /** Positions actually run through the network (the cached prefix is reused). */
  computed: number;
  /** Wall time of the forward pass(es), including attention capture. */
  ms: number;
}

export type WorkerRequest =
  | { type: "init"; checkpoint: ArrayBuffer; capacity: number }
  | { type: "run"; id: number; tokens: number[] };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; result: RunResult }
  | { type: "error"; id?: number; message: string };

export function runSession(session: Llama2Session, tokens: readonly number[]): RunResult {
  const start = performance.now();
  const { logits, computed } = session.run(tokens);
  const ms = performance.now() - start;
  return { tokens: [...tokens], logits: logits.slice(), attention: session.attentionTensor(), computed, ms };
}
