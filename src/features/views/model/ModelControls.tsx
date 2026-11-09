import { attentionHeads, contextLength, epochLimit, hiddenMultiplier, minimumCount, modelDimension } from "./tinyModel";
import type { useTinyModel } from "./useTinyModel";
import "./model.css";

function ModelControls({ runtime }: { runtime: ReturnType<typeof useTinyModel> }) {
  const { snapshot, latest, running, error } = runtime;
  const best = snapshot?.measurements.reduce((lowest, point) => point.validationLoss < lowest.validationLoss ? point : lowest);
  return (
    <div className="tiny-model">
      <p><strong>Real tiny transformer language model</strong></p>
      <p>One transformer block that predicts the next word from up to {contextLength} previous words: {modelDimension}-dimensional learned word and position embeddings, {attentionHeads}-head causal self-attention with learned query, key, value, and output projections, a GELU feed-forward layer ({modelDimension} → {modelDimension * hiddenMultiplier} → {modelDimension}), RMSNorm, and residual connections. Hand-written backpropagation and AdamW run in a Web Worker in this tab. Trained on fixed public portfolio text plus a few ML and search explainer sentences; no visitor data or API calls. Not a chatbot.</p>
      <div className="tiny-model__controls">
        <button type="button" onClick={runtime.train} disabled={!snapshot || running || Boolean(error) || latest?.epoch === epochLimit}>{latest?.epoch ? "Train 12 more epochs" : "Train 12 epochs"}</button>
        <button type="button" onClick={runtime.pause} disabled={!running}>Pause training</button>
        <button type="button" onClick={runtime.reset} disabled={!snapshot}>Reset model</button>
      </div>
      {error ? <p role="alert">Model unavailable: {error}. The portfolio is still usable.</p> : (
        <p className="tiny-model__status" role="status">{runtime.status}{snapshot && latest ? ` · epoch ${latest.epoch}/${epochLimit} · ${snapshot.parameters.toLocaleString("en-US")} parameters · ${snapshot.model.vocabulary.length} word tokens · loss ${latest.loss.toFixed(3)}` : " model worker..."}</p>
      )}
      {snapshot && latest && best && (
        <p className="tiny-model__note">
          {snapshot.trainSize.toLocaleString("en-US")} training targets; {snapshot.validationSize} targets from held-out documents (every fifth document). The vocabulary comes from training documents only; words seen fewer than {minimumCount} times become &lt;unk&gt;. Held-out loss now {latest.validationLoss.toFixed(3)}, best {best.validationLoss.toFixed(3)} at epoch {best.epoch}; uniform guessing scores {Math.log(snapshot.model.vocabulary.length).toFixed(3)} and word frequency alone scores {snapshot.unigramLoss.toFixed(3)}. Training loss keeps falling, but held-out loss bottoms out within a few epochs and then drifts up: this tiny corpus is easy to overfit. Each view has its own in-memory model. Runs only when you press Train; capped at {epochLimit} epochs.
        </p>
      )}
    </div>
  );
}

export default ModelControls;
