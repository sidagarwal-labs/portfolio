import { useEffect, useId, useRef, useState } from "react";
import { Cpu, Dices, Download, RefreshCw, RotateCcw, Thermometer, Undo2, X } from "lucide-react";
import { useLiveModel, type LiveSample, type LiveState } from "./useLiveModel";
import { megabytes, nextTokenData, percent, probability, speakToken, temperatureIndex, temperatures, vocabSize } from "./nextTokenData";
import { TokenText } from "./TokenText";

const { meta } = nextTokenData;
const LIVE_K = 10;
const DEFAULT_PROMPT = "The capital of France is";
// ONNX Runtime engine (ort-wasm-simd-threaded.asyncify .wasm + .mjs) from cdn.jsdelivr.net, onnxruntime-web 1.31.0-dev:
// 5,574,350 bytes transferred in headless Chromium on Nov 9, 2026 (gzip); brotli clients get about 4.7 MB.
const RUNTIME_BYTES = 5_574_350;
const loadLabel = `Load model (~${Math.round(meta.downloadBytes / 1e6)} MB)`;
const liveConfig = { model: meta.model, revision: meta.revision, files: meta.files, dtype: "q4f16" as const, temperatures };

function errorText(state: Extract<LiveState, { phase: "error" }>) {
  if (state.kind === "inference") return "The model did not pass its calculation check. Try another browser, or play the no-download game.";
  if (state.kind === "network" && state.cached) return "Couldn't restore the saved model. Check your connection if the runtime needs to load from cdn.jsdelivr.net, then retry.";
  if (state.kind === "network") return "Couldn't download the model. Check your connection, or whether a network filter or browser extension blocks huggingface.co or cdn.jsdelivr.net.";
  if (state.kind === "memory") return "The browser ran out of memory while running the model. Close other tabs and retry, or try a desktop browser.";
  if (state.kind === "unsupported") return "This browser couldn't start the model runtime (WebAssembly or WebGPU).";
  return "The model failed to load.";
}

export function TemperatureSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className="nexttoken__temp">
      <label htmlFor={id}><Thermometer size={14} strokeWidth={2.2} aria-hidden="true" /> Temperature <b>{value.toFixed(1)}</b></label>
      <input id={id} type="range" min={temperatures[0]} max={temperatures[temperatures.length - 1]} step={0.1} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

export function OtherBar({ probability: value, count }: { probability: number; count: number }) {
  const tokens = `${count.toLocaleString("en-US")} tokens`;
  return (
    <li className="nexttoken__other" aria-label={`All other ${tokens} combined: ${percent(value)}`} title={`All other ${tokens} in the vocabulary, combined`}>
      <span className="nexttoken__token">others</span>
      <span className="nexttoken__track" aria-hidden="true"><span style={{ width: `${Math.max(value * 100, 0.5)}%` }} /></span>
      <span className="nexttoken__pct">{percent(value)}</span>
      <span className="nexttoken__logit">{tokens}</span>
    </li>
  );
}

export function LivePanel({ visible, onCachedModel }: { visible: boolean; onCachedModel: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  const [text, setText] = useState(DEFAULT_PROMPT);
  const [history, setHistory] = useState<string[]>([]);
  const [temperature, setTemperature] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const textRef = useRef(text);
  textRef.current = text;

  const append = (from: string, token: string) => {
    setHistory((current) => [...current.slice(-49), from]);
    setText(from + token);
  };
  const onSample = (sample: LiveSample) => {
    if (sample.text !== textRef.current) return;
    append(sample.text, sample.token.text);
    setAnnouncement(`Sampled ${speakToken(sample.token.text)}, which had ${percent(sample.probability)} at temperature ${sample.temperature.toFixed(1)}.`);
  };
  const live = useLiveModel(liveConfig, onSample, onCachedModel);
  const { state, prediction, pending, predict } = live;
  const ready = state.phase === "ready";
  const showPrompt = ready || ("cached" in state && state.cached);

  useEffect(() => {
    if (!ready || !text) return;
    const timer = window.setTimeout(() => predict(text, LIVE_K), 200);
    return () => window.clearTimeout(timer);
  }, [ready, text, predict]);

  // Keep keyboard focus inside the panel when the button that had it disappears.
  useEffect(() => {
    const panel = panelRef.current;
    if (!visible || !panel || (document.activeElement !== document.body && !panel.contains(document.activeElement))) return;
    panel.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [state.phase, visible]);

  const index = temperatureIndex(temperature);
  const stale = !prediction || prediction.text !== text;
  const rows = prediction?.top.map((token) => ({ ...token, p: probability(token.logit, prediction.lse[index], temperature) })) ?? [];
  const other = prediction ? Math.exp(prediction.rest[index] - prediction.lse[index]) : 0;

  useEffect(() => {
    if (!prediction || stale || !rows.length) return;
    setAnnouncement((current) => (current.startsWith("Sampled") ? current : `Top next token: ${speakToken(rows[0].text)}, ${percent(rows[0].p)}.`));
    // Only announce when a new prediction arrives, not on every slider move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prediction]);

  return (
    <div className="nexttoken__live" ref={panelRef}>
      <p className="game__hint">A small text-completion model, not a chatbot. It predicts plausible next text and can be wrong or repetitive.</p>
      {state.phase === "checking" && <p className="game__status" role="status">Checking for a saved model...</p>}

      {state.phase === "idle" && !state.cached && (
        <>
          {state.message && <p className="game__status" role="status">{state.message}</p>}
          <p className="nexttoken__copy">
            This downloads {megabytes(meta.downloadBytes)} of model files from Hugging Face, plus up to {megabytes(RUNTIME_BYTES)} for the ONNX Runtime engine from jsDelivr.
            Nothing downloads until you press the button. Saved model files are reused automatically when available. It works on phones too, but uses mobile data.
          </p>
          <div className="game__row">
            <button type="button" className="game__btn game__btn--primary" data-autofocus onClick={live.load}>
              <Download size={14} strokeWidth={2.2} aria-hidden="true" />
              {loadLabel}
            </button>
          </div>
        </>
      )}

      {state.phase === "loading" && (
        <div className="nexttoken__loading">
          <p className="game__status" aria-live="polite">{state.message}…</p>
          {state.cached ? (
            <p className="game__muted">Your model is saved in this browser. You can edit the prompt while it initializes.</p>
          ) : (
            <>
              <div className="nexttoken__progress" role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(state.loaded / meta.downloadBytes, 1) * 100)} aria-valuetext={`${megabytes(state.loaded)} of ${megabytes(meta.downloadBytes)}`}>
                <span style={{ width: `${Math.min(state.loaded / meta.downloadBytes, 1) * 100}%` }} />
              </div>
              <p className="game__muted">{megabytes(state.loaded)} of {megabytes(meta.downloadBytes)}. Cached files load without downloading again.</p>
            </>
          )}
          <div className="game__row">
            <button type="button" className="game__btn" data-autofocus onClick={live.cancel}><X size={14} strokeWidth={2.2} aria-hidden="true" /> Cancel</button>
          </div>
        </div>
      )}

      {state.phase === "idle" && state.cached && (
        <div className="game__row">
          <button type="button" className="game__btn game__btn--primary" onClick={live.resume}>Resume saved model</button>
        </div>
      )}

      {state.phase === "error" && (
        <div className="nexttoken__error" role="alert">
          <p className="game__status">{errorText(state)}</p>
          <p className="game__muted nexttoken__detail">Details: {state.message}</p>
          <div className="game__row">
            <button type="button" className="game__btn game__btn--primary" data-autofocus onClick={state.cached ? live.resume : live.load}><RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" /> Retry</button>
          </div>
        </div>
      )}

      {showPrompt && (
        <>
          {ready && <p className="game__muted nexttoken__device">
            <Cpu size={14} strokeWidth={2.2} aria-hidden="true" />
            Running in your browser on {state.device === "webgpu" ? "WebGPU" : "WebAssembly (CPU)"}{prediction && !stale ? `, last step ${prediction.ms} ms for ${prediction.tokens} tokens` : ""}.
          </p>}
          {ready && state.fallback && <p className="game__status" role="status">{state.fallback}</p>}
          <label className="nexttoken__label" htmlFor={textId}>Prompt</label>
          <textarea id={textId} className="nexttoken__input" data-autofocus rows={3} maxLength={400} spellCheck={false} value={text} onChange={(event) => setText(event.target.value)} />
          {!text && <p className="game__hint">Type a prompt to see what comes next.</p>}
          {live.runError && <p className="game__status" role="alert">The model couldn't score that prompt: {live.runError}</p>}
          {text && prediction && (
            <ul className="nexttoken__bars" aria-label={`Top ${LIVE_K} next tokens at temperature ${temperature.toFixed(1)}`} aria-busy={pending || stale} data-stale={stale || undefined}>
              {rows.map((row, rank) => (
                <li key={row.id} className="nexttoken__bar nexttoken__bar--live">
                  <button type="button" className="nexttoken__append" disabled={stale} onClick={() => append(prediction.text, row.text)}
                    aria-label={`Append ${speakToken(row.text)}, rank ${rank + 1}, ${percent(row.p)}`}>
                    <span className="nexttoken__token"><TokenText text={row.text} /></span>
                    <span className="nexttoken__track" aria-hidden="true"><span style={{ width: `${Math.max(row.p * 100, 0.5)}%` }} /></span>
                    <span className="nexttoken__pct">{percent(row.p)}</span>
                    <span className="nexttoken__logit">z = {row.logit.toFixed(1)}</span>
                  </button>
                </li>
              ))}
              <OtherBar probability={other} count={vocabSize - rows.length} />
            </ul>
          )}
          <TemperatureSlider value={temperature} onChange={setTemperature} />
          <div className="game__row">
            <button type="button" className="game__btn game__btn--primary" disabled={!ready || !text || stale} onClick={() => live.sample(text, temperature)}>
              <Dices size={14} strokeWidth={2.2} aria-hidden="true" /> Sample
            </button>
            <button type="button" className="game__btn" disabled={!history.length} onClick={() => { setText(history[history.length - 1]); setHistory((current) => current.slice(0, -1)); }}>
              <Undo2 size={14} strokeWidth={2.2} aria-hidden="true" /> Undo
            </button>
            <button type="button" className="game__btn" onClick={() => { setText(DEFAULT_PROMPT); setHistory([]); }}>
              <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" /> Reset
            </button>
          </div>
          <p className="game__muted">Click a token to append it, or Sample to draw one from all {vocabSize.toLocaleString("en-US")} tokens at the chosen temperature. Probabilities are exact over the full vocabulary.</p>
        </>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <p className="game__fine">
        Live mode runs {meta.model} ({meta.dtype}, revision {meta.revision.slice(0, 7)}) with transformers.js in a Web Worker. Results can differ slightly from the saved game because browsers use different quantized math kernels.
      </p>
    </div>
  );
}
