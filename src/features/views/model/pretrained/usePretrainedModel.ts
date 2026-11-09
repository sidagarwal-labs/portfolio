import { useCallback, useEffect, useRef, useState } from "react";
import { createMainThreadEngine, createWorkerEngine, type PretrainedEngine } from "./engine";
import type { Llama2Config } from "./llama2";
import { loadStories260K, type LoadProgress } from "./loader";
import type { RunResult } from "./protocol";
import type { Tokenizer } from "./tokenizer";

export type PretrainedModelState =
  | { status: "loading"; progress: LoadProgress | null }
  | { status: "error"; message: string }
  | { status: "ready"; tokenizer: Tokenizer; config: Llama2Config; parameterCount: number; where: PretrainedEngine["where"] };

/** Downloads stories260K, starts inference in a module worker (falling back to the main thread), and runs token sequences. */
export function usePretrainedModel(baseUrl: string, capacity: number) {
  const [state, setState] = useState<PretrainedModelState>({ status: "loading", progress: null });
  const [attempt, setAttempt] = useState(0);
  const engineRef = useRef<PretrainedEngine | null>(null);
  const lastRun = useRef<{ key: string; promise: Promise<RunResult> } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let engine: PretrainedEngine | null = null;
    setState({ status: "loading", progress: null });
    (async () => {
      try {
        const loaded = await loadStories260K(baseUrl, {
          signal: controller.signal,
          onProgress: (progress) => { if (!cancelled) setState({ status: "loading", progress }); }
        });
        try {
          engine = await createWorkerEngine(loaded.checkpoint, capacity);
        } catch {
          engine = createMainThreadEngine(loaded.model, capacity);
        }
        if (cancelled) {
          engine.dispose();
          return;
        }
        engineRef.current = engine;
        lastRun.current = null;
        setState({ status: "ready", tokenizer: loaded.tokenizer, config: loaded.model.config, parameterCount: loaded.model.parameterCount, where: engine.where });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "The model could not be loaded." });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      engine?.dispose();
      engineRef.current = null;
      lastRun.current = null;
    };
  }, [baseUrl, capacity, attempt]);

  // Identical consecutive requests share one forward pass.
  const run = useCallback((tokens: readonly number[]) => {
    const engine = engineRef.current;
    if (!engine) return Promise.reject(new Error("The model is not ready."));
    const key = tokens.join(",");
    if (lastRun.current?.key === key) return lastRun.current.promise;
    const promise = engine.run(tokens);
    lastRun.current = { key, promise };
    promise.catch(() => { if (lastRun.current?.promise === promise) lastRun.current = null; });
    return promise;
  }, []);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, run, retry };
}
