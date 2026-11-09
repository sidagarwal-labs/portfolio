import { Llama2Session, parseCheckpoint } from "./llama2";
import { runSession, type WorkerRequest, type WorkerResponse } from "./protocol";

let session: Llama2Session | null = null;

const send = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      session = new Llama2Session(parseCheckpoint(request.checkpoint), request.capacity);
      send({ type: "ready" });
    } else {
      if (!session) throw new Error("The model has not been loaded.");
      const result = runSession(session, request.tokens);
      send({ type: "result", id: request.id, result }, [result.logits.buffer, result.attention.buffer]);
    }
  } catch (error) {
    send({ type: "error", id: request.type === "run" ? request.id : undefined, message: error instanceof Error ? error.message : "The model worker failed." });
  }
};
