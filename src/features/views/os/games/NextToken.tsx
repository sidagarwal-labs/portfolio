import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";
import { LivePanel, OtherBar, TemperatureSlider } from "./next-token/LivePanel";
import { nextTokenData, percent, probability, speakToken, temperatureIndex, vocabSize } from "./next-token/nextTokenData";
import { TokenText } from "./next-token/TokenText";
import "./games.css";
import "./nexttoken.css";

const { meta } = nextTokenData;

function NextToken({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const [tab, setTab] = useState<"game" | "live">("game");
  const tabChosen = useRef(false);
  const restoreLiveTab = useCallback(() => { if (!tabChosen.current) setTab("live"); }, []);
  const [index, setIndex] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [temperature, setTemperature] = useState(1);
  const [results, setResults] = useState<{ top: boolean; probability: number }[]>([]);
  const prompts = nextTokenData.prompts;
  const prompt = prompts[index];
  const choices = useMemo(() => prompt.choices.map((rank) => ({ rank, token: prompt.top[rank] })), [prompt]);
  const revealed = pick !== null;
  const tIndex = temperatureIndex(temperature);
  const oneIndex = temperatureIndex(1);
  const atOne = (rank: number) => probability(prompt.top[rank].logit, prompt.lse[oneIndex], 1);
  const last = index === prompts.length - 1;
  const done = revealed && last;
  const matches = results.filter((result) => result.top).length;
  const meanProbability = results.length ? results.reduce((sum, result) => sum + result.probability, 0) / results.length : 0;
  const tabs = [{ id: "game", label: "Real predictions" }, { id: "live", label: "Try it live" }] as const;

  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root || root.contains(document.activeElement)) return;
    const panel = root.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');
    const target = panel?.querySelector<HTMLElement>(".nexttoken__choice, [data-autofocus], .game__btn--primary") ?? root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    target?.focus({ preventScroll: true });
  }, [active, index]);

  const choose = (rank: number) => {
    if (revealed) return;
    setPick(rank);
    setResults((current) => [...current.slice(0, index), { top: rank === 0, probability: atOne(rank) }]);
    window.requestAnimationFrame(() => revealRef.current?.focus());
  };

  const next = () => {
    setIndex((current) => current + 1);
    setPick(null);
  };

  const restart = () => {
    setIndex(0);
    setPick(null);
    setResults([]);
    setTemperature(1);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const order = tabs.map((item) => item.id);
    const current = order.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? order.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    tabChosen.current = true;
    const target = order[(nextIndex + order.length) % order.length];
    setTab(target);
    rootRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-tab-${target}`)}`)?.focus();
  };

  const covered = prompt.top.reduce((sum, token) => sum + probability(token.logit, prompt.lse[oneIndex], 1), 0);

  return (
    <div className="game nexttoken" ref={rootRef}>
      <div className="nexttoken__tabs" role="tablist" aria-label="Next Token modes">
        {tabs.map((item) => (
          <button key={item.id} id={`${baseId}-tab-${item.id}`} type="button" role="tab" className="nexttoken__tab" aria-selected={tab === item.id}
            aria-controls={`${baseId}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => { tabChosen.current = true; setTab(item.id); }} onKeyDown={onTabKey}>
            {item.label}
          </button>
        ))}
      </div>

      <div id={`${baseId}-panel-game`} role="tabpanel" aria-labelledby={`${baseId}-tab-game`} className="nexttoken__panel" hidden={tab !== "game"}>
        <div className="game__hud">
          <span>Prompt <b>{index + 1}</b> of {prompts.length}</span>
          {results.length > 0 && <span>Top-1 <b>{matches}/{results.length}</b></span>}
        </div>

        <p className="nexttoken__prompt">
          {prompt.text}
          {revealed ? <mark>{prompt.top[pick].text}</mark> : <span className="nexttoken__cursor" aria-hidden="true" />}
        </p>

        {!revealed ? (
          <>
            <p className="game__hint">Which token did SmolLM2-135M rank highest? ␣ marks a leading space.</p>
            <div className="nexttoken__choices" role="group" aria-label="Next token choices">
              {choices.map(({ rank, token }, choice) => (
                <button key={token.id} type="button" className="game__btn nexttoken__choice" aria-label={speakToken(token.text)} onClick={() => choose(rank)} onKeyDown={(event) => {
                  if (!active || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
                  const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>(".nexttoken__choice");
                  buttons?.[(choice + delta + choices.length) % choices.length]?.focus();
                }}><TokenText text={token.text} /></button>
              ))}
            </div>
          </>
        ) : (
          <div ref={revealRef} className="nexttoken__reveal" tabIndex={-1} aria-live="polite">
            <p className="game__status">
              {pick === 0 ? "You matched the model's top token." : <>The model's top token was <TokenText text={prompt.top[0].text} />; yours ranked #{pick + 1}.</>}
              {" "}It gave your pick {percent(atOne(pick))} at T = 1.
            </p>
            <ul className="nexttoken__bars" aria-label={`Top ${prompt.top.length} next tokens at temperature ${temperature.toFixed(1)}`}>
              {prompt.top.map((token, rank) => {
                const value = probability(token.logit, prompt.lse[tIndex], temperature);
                return (
                  <li key={token.id} className="nexttoken__bar" data-pick={rank === pick || undefined} aria-label={`${speakToken(token.text)}: ${percent(value)}`}>
                    <span className="nexttoken__token"><TokenText text={token.text} /></span>
                    <span className="nexttoken__track" aria-hidden="true"><span style={{ width: `${Math.max(value * 100, 0.5)}%` }} /></span>
                    <span className="nexttoken__pct">{percent(value)}</span>
                    <span className="nexttoken__logit">z = {token.logit.toFixed(1)}</span>
                  </li>
                );
              })}
              <OtherBar probability={Math.exp(prompt.rest[tIndex] - prompt.lse[tIndex])} count={vocabSize - prompt.top.length} />
            </ul>

            <TemperatureSlider value={temperature} onChange={setTemperature} />
            <p className="game__muted">
              p<sub>i</sub> = exp(z<sub>i</sub> / T) ÷ Σ exp(z<sub>j</sub> / T), summed over all {vocabSize.toLocaleString("en-US")} tokens. At T = 1 the top 8 cover {percent(covered)}.
              {" "}Lower T sharpens the distribution; higher T flattens it. {prompt.note}
            </p>

            <div className="game__row">
              {!last ? (
                <button type="button" className="game__btn game__btn--primary" onClick={next}>Next prompt</button>
              ) : (
                <button type="button" className="game__btn game__btn--primary" onClick={restart}>
                  <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                  Play again
                </button>
              )}
            </div>
            {done && (
              <p className="game__status">
                Final: {matches} of {prompts.length} top-1 matches, average model probability of your picks {percent(meanProbability)} at T = 1.
              </p>
            )}
          </div>
        )}

        <p className="game__fine">
          Real next-token probabilities from SmolLM2-135M (Hugging Face, Apache 2.0), computed ahead of time.
          {" "}<span className="nexttoken__source">{meta.model}, {meta.dtype} 4-bit weights, revision {meta.revision.slice(0, 7)}, generated {meta.generated} by {meta.script}. Quantization shifts some probabilities compared with the full-precision model.</span>
        </p>
      </div>

      <div id={`${baseId}-panel-live`} role="tabpanel" aria-labelledby={`${baseId}-tab-live`} className="nexttoken__panel" hidden={tab !== "live"}>
        <LivePanel visible={tab === "live"} onCachedModel={restoreLiveTab} />
      </div>
    </div>
  );
}

export default NextToken;
