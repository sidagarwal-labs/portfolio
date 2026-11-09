import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw, Thermometer } from "lucide-react";
import "./games.css";

type Candidate = { token: string; logit: number };
type Prompt = { text: string; candidates: Candidate[]; note: string };

/* Hand-written toy logits, listed in the order the choices are shown. */
const prompts: Prompt[] = [
  {
    text: "Attention is all you",
    candidates: [{ token: "want", logit: 2.4 }, { token: "need", logit: 6.0 }, { token: "know", logit: 0.6 }, { token: "have", logit: 1.8 }, { token: "get", logit: 1.2 }],
    note: "A famous title dominates: one logit sits far above the rest."
  },
  {
    text: "The capital of France is",
    candidates: [{ token: "a", logit: 2.6 }, { token: "located", logit: 1.9 }, { token: "Paris", logit: 7.0 }, { token: "the", logit: 2.2 }, { token: "beautiful", logit: 1.0 }],
    note: "Facts the model has seen many times end up with very peaked distributions."
  },
  {
    text: "import numpy as",
    candidates: [{ token: "pd", logit: 0.8 }, { token: "numpy", logit: 2.0 }, { token: "math", logit: 0.2 }, { token: "n", logit: 1.2 }, { token: "np", logit: 8.0 }],
    note: "Code conventions are about as predictable as language gets."
  },
  {
    text: "Buy low, sell",
    candidates: [{ token: "high", logit: 6.5 }, { token: "out", logit: 2.8 }, { token: "short", logit: 0.7 }, { token: "now", logit: 1.6 }, { token: "low", logit: 0.9 }],
    note: "Idioms are strong priors, even when the advice is hard to follow."
  },
  {
    text: "The more you know, the more you",
    candidates: [{ token: "learn", logit: 2.0 }, { token: "forget", logit: 1.5 }, { token: "realize", logit: 2.1 }, { token: "grow", logit: 1.7 }, { token: "know", logit: 1.9 }],
    note: "No single answer: the distribution is flat, so sampling settings matter a lot."
  },
  {
    text: "On Sid's bookshelf: Zero to One, Algorithms to Live By, and The Nvidia",
    candidates: [{ token: "Story", logit: 2.3 }, { token: "Chip", logit: 1.4 }, { token: "Way", logit: 4.2 }, { token: "Effect", logit: 1.6 }, { token: "Revolution", logit: 1.0 }],
    note: "Context helps: the earlier titles point to a book, and the bookshelf has The Nvidia Way by Tae Kim."
  }
];

function softmax(candidates: Candidate[], temperature: number) {
  const scaled = candidates.map((candidate) => candidate.logit / temperature);
  const top = Math.max(...scaled);
  const weights = scaled.map((value) => Math.exp(value - top));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
}

function NextToken({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sliderId = useId();
  const [index, setIndex] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [temperature, setTemperature] = useState(1);
  const [results, setResults] = useState<{ top: boolean; probability: number }[]>([]);
  const revealRef = useRef<HTMLDivElement>(null);
  const prompt = prompts[index];
  const revealed = pick !== null;
  const probabilities = softmax(prompt.candidates, temperature);
  const atOne = softmax(prompt.candidates, 1);
  const topIndex = atOne.indexOf(Math.max(...atOne));
  const last = index === prompts.length - 1;
  const done = revealed && last;
  const matches = results.filter((result) => result.top).length;
  const meanProbability = results.length ? results.reduce((sum, result) => sum + result.probability, 0) / results.length : 0;

  useEffect(() => {
    if (active && !rootRef.current?.contains(document.activeElement)) rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [active, index]);

  const choose = (choice: number) => {
    if (revealed) return;
    setPick(choice);
    setResults((current) => [...current.slice(0, index), { top: choice === topIndex, probability: atOne[choice] }]);
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

  return (
    <div className="game nexttoken" ref={rootRef}>
      <div className="game__hud">
        <span>Prompt <b>{index + 1}</b> of {prompts.length}</span>
        {results.length > 0 && <span>Top-1 <b>{matches}/{results.length}</b></span>}
      </div>

      <p className="nexttoken__prompt">
        {prompt.text}{" "}
        {revealed ? <mark>{prompt.candidates[pick].token}</mark> : <span className="nexttoken__cursor" aria-hidden="true" />}
      </p>

      {!revealed ? (
        <>
          <p className="game__hint">Which token comes next? This game uses illustrative, hand-set logits to teach softmax.</p>
          <div className="nexttoken__choices" role="group" aria-label="Next token choices">
            {prompt.candidates.map((candidate, choice) => (
              <button key={candidate.token} type="button" className="game__btn nexttoken__choice" onClick={() => choose(choice)} onKeyDown={(event) => {
                if (!active || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault();
                const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
                const choices = rootRef.current?.querySelectorAll<HTMLButtonElement>(".nexttoken__choice");
                choices?.[(choice + delta + prompt.candidates.length) % prompt.candidates.length]?.focus();
              }}>{candidate.token}</button>
            ))}
          </div>
        </>
      ) : (
        <div ref={revealRef} className="nexttoken__reveal" tabIndex={-1} aria-live="polite">
          <p className="game__status">
            {pick === topIndex ? "You matched the model's top token." : `The model's top token was "${prompt.candidates[topIndex].token}".`}
            {" "}You gave it {(atOne[pick] * 100).toFixed(1)}% at T = 1.
          </p>
          <ul className="nexttoken__bars" aria-label={`Probabilities at temperature ${temperature.toFixed(1)}`}>
            {prompt.candidates.map((candidate, choice) => ({ candidate, choice, probability: probabilities[choice] }))
              .sort((a, b) => b.probability - a.probability)
              .map(({ candidate, choice, probability }) => (
                <li key={candidate.token} className="nexttoken__bar" data-pick={choice === pick || undefined}>
                  <span className="nexttoken__token">{candidate.token}</span>
                  <span className="nexttoken__track" aria-hidden="true"><span style={{ width: `${Math.max(probability * 100, 0.5)}%` }} /></span>
                  <span className="nexttoken__pct">{(probability * 100).toFixed(1)}%</span>
                  <span className="nexttoken__logit">z = {candidate.logit.toFixed(1)}</span>
                </li>
              ))}
          </ul>

          <div className="nexttoken__temp">
            <label htmlFor={sliderId}><Thermometer size={14} strokeWidth={2.2} aria-hidden="true" /> Temperature <b>{temperature.toFixed(1)}</b></label>
            <input id={sliderId} type="range" min={0.2} max={2} step={0.1} value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
          </div>
          <p className="game__muted">p<sub>i</sub> = exp(z<sub>i</sub> / T) ÷ Σ exp(z<sub>j</sub> / T). Lower T sharpens the distribution; higher T flattens it. {prompt.note}</p>

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
              Final: {matches} of {prompts.length} top-1 matches, average probability of your picks {(meanProbability * 100).toFixed(1)}%.
            </p>
          )}
        </div>
      )}

      <p className="game__fine">Toy logits written by hand for illustration, not output from a real model.</p>
    </div>
  );
}

export default NextToken;
