import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { usePrefersReducedMotion } from "../../../../hooks/usePrefersReducedMotion";
import { headAttention, type Llama2Config } from "./llama2";
import { llama2cSource, stories260KFiles, stories260KSource } from "./loader";
import type { RunResult } from "./protocol";
import { argmax, sampleToken, softmaxWithTemperature, topTokens } from "./sampling";
import { BOS, EOS, decode, encode, pieceLabel, type Tokenizer } from "./tokenizer";
import { usePretrainedModel } from "./usePretrainedModel";
import "./pretrained.css";

export const pretrainedMaxTokens = 64;
const generateSteps = 20;
const defaultPromptText = "Once upon a time, there was a little girl named Lily. She";
// Zero-based. Layer 3, head 7 is a readable starting point for the default prompt (its "␣She" row peaks on "␣Lily").
const defaultLayer = 2;
const defaultHead = 6;
const modelBaseUrl = `${import.meta.env.BASE_URL}models/stories260K/`;
const downloadSize = `${((stories260KFiles.checkpointBytes + stories260KFiles.tokenizerBytes) / 1e6).toFixed(2)} MB`;

export interface PretrainedAttentionProps {
  defaultPrompt?: string;
  className?: string;
}

const quote = (label: string) => `“${label}”`;
const percent = (probability: number) => `${(probability * 100).toFixed(probability >= 0.1 ? 1 : 2)}%`;
const shade = (weight: number) => Math.sqrt(Math.max(0, weight));
const spoken = (label: string) => (label.startsWith("␣") ? `“${label.slice(1)}” with a leading space` : quote(label));

export default function PretrainedAttention({ defaultPrompt = defaultPromptText, className }: PretrainedAttentionProps) {
  const { state, run, retry } = usePretrainedModel(modelBaseUrl, pretrainedMaxTokens);
  const classes = ["pt", className].filter(Boolean).join(" ");

  if (state.status === "loading") {
    const { progress } = state;
    return (
      <div className={classes}>
        <div className="pt-status" role="status">
          <p>Loading Andrej Karpathy&rsquo;s stories260K model ({downloadSize}) to run in your browser&hellip;</p>
          <progress max={progress?.total ?? 1} value={progress?.loaded ?? 0} aria-label="Model download progress" />
          {progress && <span className="pt-mono pt-muted">{Math.round(progress.loaded / 1000)} / {Math.round(progress.total / 1000)} KB</span>}
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className={classes}>
        <div className="pt-status pt-status--error" role="alert">
          <p><strong>The pretrained model couldn&rsquo;t load.</strong> Nothing ran, so no attention is shown. The rest of the page still works.</p>
          <p className="pt-muted pt-mono">{state.message}</p>
          <button type="button" className="pt-button" onClick={retry}>Try again</button>
        </div>
      </div>
    );
  }
  return (
    <div className={classes}>
      <Explorer
        tokenizer={state.tokenizer}
        config={state.config}
        parameterCount={state.parameterCount}
        where={state.where}
        run={run}
        defaultPrompt={defaultPrompt}
      />
    </div>
  );
}

interface ExplorerProps {
  tokenizer: Tokenizer;
  config: Llama2Config;
  parameterCount: number;
  where: string;
  run: (tokens: readonly number[]) => Promise<RunResult>;
  defaultPrompt: string;
}

function Explorer({ tokenizer, config, parameterCount, where, run, defaultPrompt }: ExplorerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generated, setGenerated] = useState<number[]>([]);
  const [layer, setLayer] = useState(defaultLayer);
  const [head, setHead] = useState<number | null>(defaultHead);
  const [temperature, setTemperature] = useState(0.8);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<{ result: RunResult; promptLength: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [runError, setRunError] = useState("");
  const generation = useRef(0);
  const temperatureRef = useRef(temperature);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);

  const promptTokens = useMemo(() => encode(tokenizer, prompt), [tokenizer, prompt]);
  const promptLength = Math.min(promptTokens.length, pretrainedMaxTokens);
  const tokens = useMemo(() => [...promptTokens, ...generated].slice(0, pretrainedMaxTokens), [promptTokens, generated]);
  const key = tokens.join(",");

  useEffect(() => { temperatureRef.current = temperature; }, [temperature]);
  useEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    let alive = true;
    run(tokens).then(
      (result) => { if (alive) { setView({ result, promptLength }); setRunError(""); } },
      (error: unknown) => { if (alive) setRunError(error instanceof Error ? error.message : "The model failed to run.") }
    );
    return () => { alive = false; };
  }, [key, promptLength, run]); // `key` stands in for `tokens`

  const result = view?.result ?? null;
  const shownPromptLength = view?.promptLength ?? 0;
  const n = result?.tokens.length ?? 0;
  const current = result !== null && result.tokens.join(",") === key;
  const query = selected === null || selected >= n ? n - 1 : selected;
  const labels = useMemo(() => result?.tokens.map((id) => pieceLabel(tokenizer, id)) ?? [], [result, tokenizer]);
  const matrix = useMemo(() => (result ? headAttention(result.attention, n, config.nHeads, layer, head) : null), [result, n, config.nHeads, layer, head]);
  const probabilities = useMemo(() => (result ? softmaxWithTemperature(result.logits, temperature) : null), [result, temperature]);
  const predictions = probabilities ? topTokens(probabilities, 5) : [];
  const greedy = result ? argmax(result.logits) : -1;
  const row = matrix && query >= 0 ? matrix.subarray(query * n, query * n + query + 1) : new Float32Array();
  const attended = Array.from(row, (weight, index) => ({ index, weight })).sort((a, b) => b.weight - a.weight).slice(0, 3);
  const story = useMemo(() => {
    if (!view) return { prompt: "", continuation: "" };
    const full = decode(tokenizer, view.result.tokens);
    const start = decode(tokenizer, view.result.tokens.slice(0, view.promptLength));
    return full.startsWith(start) ? { prompt: start, continuation: full.slice(start.length) } : { prompt: full, continuation: "" };
  }, [view, tokenizer]);

  const atLimit = tokens.length >= pretrainedMaxTokens;
  const busy = generating || !current;
  const sharing = head === null ? [] : Array.from({ length: config.kvMul }, (_, index) => Math.floor(head / config.kvMul) * config.kvMul + index);
  const headName = head === null ? `the mean of all ${config.nHeads} heads` : `head ${head + 1}`;
  const scope = head === null ? `layer ${layer + 1} (mean of ${config.nHeads} heads)` : `layer ${layer + 1} head ${head + 1}`;

  function editPrompt(value: string) {
    generation.current += 1;
    setPrompt(value);
    setGenerated([]);
    setGenerating(false);
    setSelected(null);
    setNotice("");
  }

  function append(id: number) {
    if (id === BOS || id === EOS) {
      setNotice(`The model picked ${id === BOS ? "BOS" : "EOS"}, which marks the end of a story, so nothing was added.`);
      return;
    }
    if (atLimit) {
      setNotice(`This demo stops at ${pretrainedMaxTokens} tokens so the heatmap stays readable.`);
      return;
    }
    setNotice("");
    setGenerated((value) => [...value, id]);
  }

  async function generate() {
    const id = (generation.current += 1);
    setGenerating(true);
    setNotice("");
    let sequence = tokens;
    let added = 0;
    try {
      while (added < generateSteps) {
        if (sequence.length >= pretrainedMaxTokens) {
          setNotice(`Stopped after ${added} tokens: this demo stops at ${pretrainedMaxTokens} tokens so the heatmap stays readable.`);
          return;
        }
        const step = await run(sequence);
        if (generation.current !== id) return;
        const next = sampleToken(step.logits, temperatureRef.current);
        if (next === BOS || next === EOS) {
          setNotice(`Stopped after ${added} tokens: the model sampled ${next === BOS ? "BOS" : "EOS"}, the end-of-story marker.`);
          return;
        }
        sequence = [...sequence, next];
        added += 1;
        setGenerated((value) => [...value, next]);
        if (!reducedMotion) await new Promise((resolve) => window.setTimeout(resolve, 70));
        if (generation.current !== id) return;
      }
      setNotice(`Sampled ${added} tokens at temperature ${temperatureRef.current.toFixed(1)}.`);
    } catch (error) {
      if (generation.current === id) setRunError(error instanceof Error ? error.message : "The model failed to run.");
    } finally {
      if (generation.current === id) setGenerating(false);
    }
  }

  function stop() {
    generation.current += 1;
    setGenerating(false);
    setNotice("Stopped.");
  }

  function select(index: number) {
    setSelected(index >= n - 1 ? null : index);
  }

  function chipKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: n - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(n - 1, moves[event.key]));
    select(next);
    chips.current[next]?.focus();
  }

  return (
    <>
      <p className="pt-intro">
        <strong>Real pretrained transformer:</strong> {parameterCount.toLocaleString("en-US")} parameters, {config.nLayers} layers, {config.nHeads} heads,
        trained by Andrej Karpathy on TinyStories (simple children&rsquo;s stories), so it writes simple stories. Runs entirely in your browser.{" "}
        <span className="pt-muted">
          Weights: <a href={stories260KSource}>stories260K</a> (MIT). Inference: a TypeScript port of <a href={`${llama2cSource}/blob/master/run.c`}>llama2.c&rsquo;s run.c</a>.
        </span>
      </p>

      <label className="pt-field">
        <span className="pt-label">Prompt</span>
        <textarea className="pt-prompt" rows={2} maxLength={600} spellCheck={false} value={prompt} onChange={(event) => editPrompt(event.target.value)} />
      </label>
      {promptTokens.length > pretrainedMaxTokens && (
        <p className="pt-note">Your prompt is {promptTokens.length} tokens; only the first {pretrainedMaxTokens} are used.</p>
      )}

      {result && matrix && (
        <>
          <div className="pt-section-head">
            <span className="pt-label" id="pt-tokens-label">Tokens</span>
            <span className="pt-muted">{n} / {pretrainedMaxTokens} · ␣ = leading space · underlined = generated · ←/→ to move</span>
          </div>
          <div className="pt-tokens" role="radiogroup" aria-labelledby="pt-tokens-label">
            {result.tokens.map((id, index) => {
              const visible = index <= query;
              const weight = visible ? row[index] : 0;
              return (
                <button
                  key={`${index}-${id}`}
                  ref={(element) => { chips.current[index] = element; }}
                  type="button"
                  role="radio"
                  aria-checked={index === query}
                  tabIndex={index === query ? 0 : -1}
                  aria-label={`${spoken(labels[index])}, token ${id}, position ${index}${visible ? `, attention ${weight.toFixed(2)}` : ", after the selected token"}${index >= shownPromptLength ? ", generated" : ""}`}
                  className="pt-chip"
                  data-masked={!visible || undefined}
                  data-generated={index >= shownPromptLength || undefined}
                  style={{ "--w": shade(weight).toFixed(3) } as CSSProperties}
                  onClick={() => select(index)}
                  onKeyDown={(event) => chipKey(event, index)}
                >
                  <span className="pt-chip__piece">{labels[index]}</span>
                  <span className="pt-chip__id" aria-hidden="true">{id}</span>
                </button>
              );
            })}
          </div>
          <p className="pt-caption" aria-live="polite">
            {query === 0
              ? <>{quote(labels[0])} is the first token, so it can only attend to itself.</>
              : <>From {quote(labels[query])} (position {query}), {scope} attends most to{" "}
                {attended.map(({ index, weight }, rank) => (
                  <span key={index}>{rank > 0 && (rank < attended.length - 1 ? ", " : attended.length > 2 ? ", and " : " and ")}{quote(labels[index])} <span className="pt-mono">{weight.toFixed(2)}</span></span>
                ))}.</>}
          </p>

          <div className="pt-selectors">
            <div className="pt-seg" role="group" aria-labelledby="pt-layer-label">
              <span className="pt-label" id="pt-layer-label">Layer</span>
              {Array.from({ length: config.nLayers }, (_, index) => (
                <button key={index} type="button" aria-pressed={layer === index} onClick={() => setLayer(index)}>{index + 1}</button>
              ))}
            </div>
            <div className="pt-seg" role="group" aria-labelledby="pt-head-label">
              <span className="pt-label" id="pt-head-label">Head</span>
              {Array.from({ length: config.nHeads }, (_, index) => (
                <button key={index} type="button" aria-pressed={head === index} onClick={() => setHead(index)}>{index + 1}</button>
              ))}
              <button type="button" aria-pressed={head === null} onClick={() => setHead(null)}>Average</button>
            </div>
          </div>
          <p className="pt-note">
            {head === null
              ? `Showing the mean of the ${config.nHeads} heads in layer ${layer + 1}. `
              : `Head ${head + 1} shares its keys and values with head ${sharing.filter((index) => index !== head).map((index) => index + 1).join(", ")}. `}
            Grouped-query attention: {config.nHeads} query heads read from {config.nKvHeads} key/value heads.
          </p>

          <div className="pt-body">
            <AttentionMap
              labels={labels}
              matrix={matrix}
              selected={query}
              onSelect={select}
              description={`Attention heatmap for layer ${layer + 1}, ${headName}: ${n} query rows by ${n} key columns. The selected row is ${quote(labels[query])}.`}
            />

            <div className="pt-next">
              <p className="pt-label">Next token after {quote(labels[n - 1])}</p>
              <p className="pt-muted pt-small">Softmax of the {config.vocabSize} output logits at temperature {temperature.toFixed(1)}</p>
              <ol className="pt-probs">
                {predictions.map(({ id, probability }) => (
                  <li key={id} style={{ "--p": probability.toFixed(4) } as CSSProperties}>
                    <span className="pt-probs__piece pt-mono">{pieceLabel(tokenizer, id)}</span>
                    <span className="pt-probs__bar" aria-hidden="true"><span /></span>
                    <span className="pt-probs__value pt-mono">{percent(probability)}</span>
                  </li>
                ))}
              </ol>
              <p className="pt-sr" aria-live="polite">
                {predictions[0] && `Most likely next token: ${spoken(pieceLabel(tokenizer, predictions[0].id))}, ${percent(predictions[0].probability)}.`}
              </p>
              <label className="pt-temp">
                <span className="pt-label">Temperature</span>
                <input type="range" min="0.1" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
                <output className="pt-mono">{temperature.toFixed(1)}</output>
              </label>
              <div className="pt-actions">
                <button type="button" className="pt-button" disabled={busy || atLimit} onClick={() => append(greedy)}>Add top token</button>
                <button type="button" className="pt-button" disabled={busy || atLimit} onClick={() => append(sampleToken(result.logits, temperature))}>Sample next token</button>
                {generating
                  ? <button type="button" className="pt-button" onClick={stop}>Stop</button>
                  : <button type="button" className="pt-button" disabled={busy || atLimit} onClick={() => void generate()}>Generate {generateSteps} tokens</button>}
                <button type="button" className="pt-button pt-button--quiet" disabled={generated.length === 0 || generating} onClick={() => editPrompt(prompt)}>Clear generated</button>
              </div>
              <p className="pt-note" aria-live="polite">
                {notice || (atLimit ? `Reached the ${pretrainedMaxTokens}-token limit for this demo.` : "Add top token is greedy; sampling uses the temperature.")}
              </p>
            </div>
          </div>

          <p className="pt-story">
            <span className="pt-label">Text so far</span>{" "}
            {story.prompt}<span className="pt-story__generated">{story.continuation}</span>
          </p>
          <p className="pt-meta pt-muted">
            Last update ran {result.computed} of {n} {n === 1 ? "position" : "positions"} in {result.ms.toFixed(1)} ms on this device ({where}
            {result.computed < n ? `; ${n - result.computed} reused from the KV cache` : ""}). Model: dim {config.dim}, FFN {config.hiddenDim},
            {" "}{config.nLayers} layers, {config.nHeads} query / {config.nKvHeads} key-value heads, {config.vocabSize}-token vocabulary.
          </p>
        </>
      )}
      {runError && <p className="pt-status pt-status--error" role="alert">The model failed to run: {runError}</p>}
    </>
  );
}

interface AttentionMapProps {
  labels: string[];
  matrix: Float32Array;
  selected: number;
  onSelect: (row: number) => void;
  description: string;
}

let measurer: CanvasRenderingContext2D | null = null;
const shorten = (label: string) => (label.length > 9 ? `${label.slice(0, 8)}…` : label);

function AttentionMap({ labels, matrix, selected, onSelect, description }: AttentionMapProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(0);
  const [hover, setHover] = useState<{ row: number; column: number } | null>(null);
  const n = labels.length;
  const short = useMemo(() => labels.map(shorten), [labels]);
  const [theme, setTheme] = useState({ font: "11px monospace", rgb: "40, 91, 76", ink: "#272b29", muted: "#656c68", line: "#dfe3df" });
  const { font } = theme;

  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    // Read the inherited theme once; reading computed styles on every redraw forces a style recalculation.
    const styles = getComputedStyle(element);
    const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    setTheme({
      font: `11px ${read("--pt-mono", "monospace")}`,
      rgb: read("--pt-rgb", "40, 91, 76"),
      ink: read("--pt-ink", "#272b29"),
      muted: read("--pt-muted", "#656c68"),
      line: read("--pt-line", "#dfe3df")
    });
    setAvailable(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setAvailable(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    measurer ??= document.createElement("canvas").getContext("2d");
    let labelSize = 40;
    if (measurer) {
      measurer.font = font;
      labelSize = Math.ceil(Math.max(32, ...short.map((label) => measurer!.measureText(label).width))) + 10;
    }
    const fit = available ? Math.floor((available - labelSize - 2) / Math.max(n, 1)) : 16;
    const cell = Math.max(10, Math.min(24, fit));
    return { labelSize, cell, width: labelSize + n * cell + 1, height: labelSize + n * cell + 1 };
  }, [short, font, available, n]);

  useEffect(() => {
    if (hover && (hover.row >= n || hover.column >= n)) setHover(null);
  }, [hover, n]);

  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const { rgb, ink, muted, line } = theme;
    const { labelSize: offset, cell, width, height } = geometry;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.font = font;
    context.textBaseline = "middle";

    for (let index = 0; index < n; index += 1) {
      const center = offset + index * cell + cell / 2;
      context.fillStyle = index === selected ? ink : muted;
      context.textAlign = "right";
      context.fillText(short[index], offset - 6, center);
      context.save();
      context.translate(center, offset - 6);
      context.rotate(-Math.PI / 2);
      context.textAlign = "left";
      context.globalAlpha = index <= selected ? 1 : 0.45;
      context.fillStyle = muted;
      context.fillText(short[index], 0, 0);
      context.restore();
    }

    // One fill colour per pass with a numeric alpha: same pixels as rgba() strings, without parsing 4,096 colours.
    context.fillStyle = line;
    context.globalAlpha = 0.55;
    for (let r = 0; r < n; r += 1) {
      for (let c = r + 1; c < n; c += 1) context.fillRect(offset + c * cell + 0.5, offset + r * cell + 0.5, cell - 1, cell - 1);
    }
    context.fillStyle = `rgb(${rgb})`;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c <= r; c += 1) {
        context.globalAlpha = 0.05 + 0.95 * shade(matrix[r * n + c]);
        context.fillRect(offset + c * cell + 0.5, offset + r * cell + 0.5, cell - 1, cell - 1);
      }
    }
    context.globalAlpha = 1;
    context.strokeStyle = ink;
    context.lineWidth = 1.5;
    context.strokeRect(offset + 0.75, offset + selected * cell + 0.75, (selected + 1) * cell - 0.5, cell - 0.5);
    if (hover && hover.row < n && hover.column < n) {
      context.lineWidth = 2;
      context.strokeRect(offset + hover.column * cell + 1, offset + hover.row * cell + 1, cell - 2, cell - 2);
    }
  }, [geometry, matrix, selected, hover, short, n, font, theme]);

  function cellAt(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const row = Math.floor((event.clientY - rect.top - geometry.labelSize) / geometry.cell);
    const column = Math.floor((event.clientX - rect.left - geometry.labelSize) / geometry.cell);
    return row >= 0 && row < n ? { row, column: Math.min(column, n - 1) } : null;
  }

  const hovered = hover && hover.row < n && hover.column >= 0 && hover.column < n ? hover : null;
  return (
    <div className="pt-map">
      <div className="pt-map__scroll" ref={wrapper}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={description}
          onPointerMove={(event) => setHover(cellAt(event))}
          onPointerLeave={() => setHover(null)}
          onPointerUp={(event) => {
            const target = cellAt(event);
            if (target) {
              onSelect(target.row);
              setHover(target);
            }
          }}
        />
      </div>
      <div className="pt-legend" aria-hidden="true">
        <span>query ↓ key →</span>
        <span className="pt-legend__ramp" />
        <span>0 → 1 (shade ∝ √weight)</span>
        <span className="pt-legend__masked" />
        <span>masked future</span>
      </div>
      <p className="pt-readout pt-mono">
        {hovered
          ? hovered.column <= hovered.row
            ? `${quote(labels[hovered.row])} @${hovered.row} → ${quote(labels[hovered.column])} @${hovered.column}: ${matrix[hovered.row * n + hovered.column].toFixed(3)}`
            : `${quote(labels[hovered.row])} @${hovered.row} can’t see later token ${quote(labels[hovered.column])} @${hovered.column} (causal mask)`
          : "Hover or tap a cell for its weight; click a row to select that token."}
      </p>
    </div>
  );
}
