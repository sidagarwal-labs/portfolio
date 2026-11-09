import { Llama2Session, type Llama2Model } from "./llama2";
import { runSession, type RunResult, type WorkerRequest, type WorkerResponse } from "./protocol";

export interface PretrainedEngine {
  where: "Web Worker" | "main thread";
  run(tokens: readonly number[]): Promise<RunResult>;
  dispose(): void;
}

export function createMainThreadEngine(model: Llama2Model, capacity: number): PretrainedEngine {
  const session = new Llama2Session(model, capacity);
  return {
    where: "main thread",
    run: async (tokens) => runSession(session, tokens),
    dispose: () => undefined
  };
}

/** Starts the module worker and resolves once it has parsed the checkpoint; rejects if the worker cannot start. */
export function createWorkerEngine(checkpoint: ArrayBuffer, capacity: number): Promise<PretrainedEngine> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./pretrained.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }
    let ready = false;
    let nextId = 0;
    const timeout = window.setTimeout(() => {
      if (ready) return;
      worker.terminate();
      reject(new Error("The model worker did not start in time."));
    }, 15_000);
    const pending = new Map<number, { resolve: (result: RunResult) => void; reject: (error: Error) => void }>();
    const failAll = (message: string) => {
      pending.forEach(({ reject: rejectRun }) => rejectRun(new Error(message)));
      pending.clear();
    };
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === "ready") {
        ready = true;
        window.clearTimeout(timeout);
        resolve({
          where: "Web Worker",
          run: (tokens) => new Promise<RunResult>((resolveRun, rejectRun) => {
            const id = nextId += 1;
            pending.set(id, { resolve: resolveRun, reject: rejectRun });
            worker.postMessage({ type: "run", id, tokens: [...tokens] } satisfies WorkerRequest);
          }),
          dispose: () => {
            worker.terminate();
            failAll("The model worker was stopped.");
          }
        });
      } else if (data.type === "result") {
        pending.get(data.id)?.resolve(data.result);
        pending.delete(data.id);
      } else if (data.id !== undefined) {
        pending.get(data.id)?.reject(new Error(data.message));
        pending.delete(data.id);
      } else if (!ready) {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      const message = event.message || "The model worker failed to load.";
      if (!ready) {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(message));
      } else failAll(message);
    };
    // Cloned, not transferred, so the caller keeps its copy for a main-thread fallback.
    worker.postMessage({ type: "init", checkpoint, capacity } satisfies WorkerRequest);
  });
}
