import { useCallback, useEffect, useRef, useState } from "react";
import { hasCachedModel, type CachedModel } from "./modelCache";
import type { LiveDevice, LiveErrorKind, LiveRequest, LiveResponse, LiveToken } from "./nextToken.worker";

export type LivePrediction = Extract<LiveResponse, { type: "prediction" }>;
export type LiveSample = { token: LiveToken; probability: number; temperature: number; text: string };
export type LiveState =
  | { phase: "checking" }
  | { phase: "idle"; cached: boolean; message?: string }
  | { phase: "loading"; cached: boolean; loaded: number; total: number; message: string }
  | { phase: "ready"; device: LiveDevice }
  | { phase: "error"; cached: boolean; kind: LiveErrorKind; message: string };

type LiveConfig = CachedModel & { dtype: "q4f16"; temperatures: number[] };

/** Restores saved weights automatically; new downloads still require load(). */
export function useLiveModel(config: LiveConfig, onSample: (sample: LiveSample) => void, onCachedModel: () => void) {
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  // Sample requests use negative ids so they never collide with prediction ids.
  const sampleIdRef = useRef(0);
  const sampleRef = useRef(onSample);
  const temperatureRef = useRef(1);
  const [state, setState] = useState<LiveState>({ phase: "checking" });
  const [prediction, setPrediction] = useState<LivePrediction | null>(null);
  const [pending, setPending] = useState(false);
  const [runError, setRunError] = useState("");
  sampleRef.current = onSample;

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const start = useCallback((cacheOnly: boolean) => {
    stop();
    setPrediction(null);
    setPending(false);
    setRunError("");
    setState({ phase: "loading", cached: cacheOnly, loaded: 0, total: 0, message: cacheOnly ? "Initializing the saved model" : "Starting the model worker" });
    let worker: Worker;
    try {
      worker = new Worker(new URL("./nextToken.worker.ts", import.meta.url), { type: "module" });
    } catch (cause) {
      setState({ phase: "error", cached: cacheOnly, kind: "unsupported", message: cause instanceof Error ? cause.message : "This browser could not start a module worker." });
      return;
    }
    workerRef.current = worker;
    worker.onmessage = ({ data }: MessageEvent<LiveResponse>) => {
      if (workerRef.current !== worker) return;
      if (data.type === "progress") setState((current) => (current.phase === "loading" ? { ...current, loaded: data.loaded, total: data.total } : current));
      else if (data.type === "status") setState((current) => (current.phase === "loading" ? { ...current, message: data.message } : current));
      else if (data.type === "ready") setState({ phase: "ready", device: data.device });
      else if (data.type === "prediction") {
        if (data.id !== requestRef.current) return;
        setPrediction(data);
        setPending(false);
        setRunError("");
      } else if (data.type === "sampled") {
        sampleRef.current({ token: data.token, probability: data.probability, temperature: temperatureRef.current, text: data.text });
      } else if (data.id === undefined) {
        stop();
        setState(data.kind === "cache-miss"
          ? { phase: "idle", cached: false, message: "Some saved model files are no longer available. Download them again to continue." }
          : { phase: "error", cached: cacheOnly, kind: data.kind, message: data.message });
      } else {
        if (data.id > 0) setPending(false);
        setRunError(data.message);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (workerRef.current !== worker) return;
      stop();
      setState({ phase: "error", cached: cacheOnly, kind: "network", message: event.message || "The model worker failed to start." });
    };
    worker.postMessage({ type: "load", model: config.model, revision: config.revision, dtype: config.dtype, temperatures: config.temperatures, cacheOnly } satisfies LiveRequest);
  }, [config, stop]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let cached: boolean;
      try {
        cached = await hasCachedModel(config);
      } catch (error) {
        if (cancelled) return;
        console.warn("Next Token could not check its saved model files:", error);
        setState({ phase: "idle", cached: false, message: "Saved model files could not be checked. Loading manually may download them again." });
        return;
      }
      if (cancelled) return;
      if (cached) {
        onCachedModel();
        start(true);
      } else {
        setState({ phase: "idle", cached: false });
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [config, onCachedModel, start, stop]);

  const load = useCallback(() => start(false), [start]);
  const resume = useCallback(() => start(true), [start]);
  const cancel = useCallback(() => {
    stop();
    setState((current) => ({ phase: "idle", cached: "cached" in current && current.cached }));
  }, [stop]);

  const predict = useCallback((text: string, k: number) => {
    requestRef.current += 1;
    setPending(true);
    workerRef.current?.postMessage({ type: "predict", id: requestRef.current, text, k } satisfies LiveRequest);
  }, []);

  const sample = useCallback((text: string, temperature: number) => {
    temperatureRef.current = temperature;
    sampleIdRef.current -= 1;
    workerRef.current?.postMessage({ type: "sample", id: sampleIdRef.current, text, temperature } satisfies LiveRequest);
  }, []);

  return { state, prediction, pending, runError, load, resume, cancel, predict, sample };
}
