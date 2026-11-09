import { useEffect, useRef, useState } from "react";
import { modelCorpus } from "./modelCorpus";
import { epochLimit, type ModelRequest, type ModelResponse, type ModelSnapshot } from "./tinyModel";

export function useTinyModel() {
  const workerRef = useRef<Worker | null>(null);
  const [snapshot, setSnapshot] = useState<ModelSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./tinyModel.worker.ts", import.meta.url), { type: "module" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This browser could not start the model worker.");
      return;
    }
    workerRef.current = worker;
    worker.onmessage = ({ data }: MessageEvent<ModelResponse>) => {
      if (data.type === "error") { setError(data.message); setRunning(false); }
      else { setSnapshot(data.snapshot); setRunning(data.running); setError(""); }
    };
    worker.onerror = (event) => { setError(event.message || "The model worker failed to load."); setRunning(false); };
    worker.postMessage({ type: "init", texts: modelCorpus } satisfies ModelRequest);
    const pause = () => { if (document.hidden) worker.postMessage({ type: "pause" } satisfies ModelRequest); };
    document.addEventListener("visibilitychange", pause);
    return () => { document.removeEventListener("visibilitychange", pause); worker.terminate(); workerRef.current = null; };
  }, []);

  const send = (request: ModelRequest) => workerRef.current?.postMessage(request);
  const latest = snapshot?.measurements[snapshot.measurements.length - 1];
  return {
    snapshot, latest, running, error,
    status: error ? "Unavailable" : !snapshot ? "Loading" : running ? "Training" : latest?.epoch === epochLimit ? "Complete" : latest?.epoch ? "Paused" : "Ready",
    train: () => send({ type: "train", epochs: 12 }),
    pause: () => send({ type: "pause" }),
    reset: () => send({ type: "reset" })
  };
}
