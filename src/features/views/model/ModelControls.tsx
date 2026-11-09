import { epochLimit } from "./tinyModel";
import type { useTinyModel } from "./useTinyModel";
import "./model.css";

function ModelControls({ runtime }: { runtime: ReturnType<typeof useTinyModel> }) {
  const { snapshot, latest, running, error } = runtime;
  return (
    <div className="tiny-model">
      <p><strong>Real tiny attention language model</strong></p>
      <p>One attention head, learned word embeddings, and a next-token output layer. Fixed public portfolio snippets and educational text; no visitor data or API calls. Not a full transformer or chatbot.</p>
      <div className="tiny-model__controls">
        <button type="button" onClick={runtime.train} disabled={!snapshot || running || Boolean(error) || latest?.epoch === epochLimit}>{latest?.epoch ? "Train 12 more epochs" : "Train 12 epochs"}</button>
        <button type="button" onClick={runtime.pause} disabled={!running}>Pause training</button>
        <button type="button" onClick={runtime.reset} disabled={!snapshot}>Reset model</button>
      </div>
      {error ? <p role="alert">Model unavailable: {error}. The portfolio is still usable.</p> : (
        <p className="tiny-model__status" role="status">{runtime.status}{snapshot && latest ? ` · epoch ${latest.epoch}/${epochLimit} · ${snapshot.parameters.toLocaleString("en-US")} parameters · ${snapshot.model.vocabulary.length} word tokens · loss ${latest.loss.toFixed(3)}` : " model worker..."}</p>
      )}
      {snapshot && <p className="tiny-model__note">{snapshot.trainSize} training targets; {snapshot.validationSize} targets from held-out documents. Training loss can fall while held-out loss rises: this tiny corpus is easy to overfit. Each view has its own in-memory model. Runs only when you press Train; capped at {epochLimit} epochs.</p>}
    </div>
  );
}

export default ModelControls;
