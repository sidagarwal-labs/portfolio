import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, RotateCcw, Search } from "lucide-react";
import rankitData from "../../../../content/generated/rankit-arxiv.json";
import "./games.css";
import "./rankit.css";

type Paper = { id: string; title: string; snippet: string; grade: number; bm25Rank: number | null; rerankerRank: number | null };
type Round = { queryId: string; query: string; papers: Paper[]; start: string[]; bm25: string[]; reranker: string[]; fullNdcg10: { bm25: number; reranker: number; judgments: number } };
type Scores = { you: number; bm25: number; reranker: number };

/* Real dev queries, AI grades, and saved system rankings from arXiv Search; built by scripts/build-rankit-data.mjs. */
const { meta, rounds } = rankitData as { meta: typeof rankitData.meta; rounds: Round[] };
const { bm25: bm25System, reranker: rerankerSystem } = meta.systems;
const gradeNames = ["Not relevant", "Partly relevant", "Highly relevant"];
const maxGrade = gradeNames.length - 1;
const shortCommit = meta.commit.slice(0, 7);
const fmt = (value: number) => value.toFixed(3);
const fmt2 = (value: number) => value.toFixed(2);
const thousands = (value: number) => value.toLocaleString("en-US");

// Same formula as the project's metrics.py: linear gain (the grade), log2(rank + 1) discount.
const gain = (grade: number) => grade;
const discount = (position: number) => Math.log2(position + 2);
const dcg = (papers: Paper[]) => papers.reduce((sum, paper, position) => sum + gain(paper.grade) / discount(position), 0);
const ideal = (papers: Paper[]) => [...papers].sort((a, b) => b.grade - a.grade);
const ndcg = (papers: Paper[]) => dcg(papers) / dcg(ideal(papers));
const inOrder = (round: Round, ids: string[]) => ids.map((id) => round.papers.find((paper) => paper.id === id)!);
const systemScores = (round: Round) => ({ bm25: ndcg(inOrder(round, round.bm25)), reranker: ndcg(inOrder(round, round.reranker)) });
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const milli = (value: number) => Math.round(value * 1000);

function verdict(score: number) {
  if (score > 0.999) return "Perfect order.";
  if (score > 0.9) return "Close to ideal.";
  if (score > 0.75) return "Decent, but a better paper is buried.";
  return "The best papers are too far down.";
}

function winnerLine({ you, bm25, reranker }: Scores) {
  const [y, b, r] = [milli(you), milli(bm25), milli(reranker)];
  const vs = (other: number, name: string) => (y > other ? `beat ${name}` : y === other ? `tied ${name}` : `trailed ${name}`);
  if (y >= b && y >= r) {
    if (y > b && y > r) return "You beat both systems on this query.";
    return `You ${vs(b, "the keyword baseline")} and ${vs(r, "the AI reranker")}.`;
  }
  if (b === r) return "Both systems ordered these papers better than you.";
  const [leader, other, otherScore] = b > r ? ["The keyword baseline", "the AI reranker", r] : ["The AI reranker", "the keyword baseline", b];
  return `${leader} wins this query; you ${vs(otherScore, other)}.`;
}

function bestOrderText(papers: Paper[]) {
  const groups = gradeNames
    .map((_, grade) => ({ grade, count: papers.filter((paper) => paper.grade === grade).length }))
    .filter(({ count }) => count > 0)
    .reverse()
    .map(({ grade, count }) => `${count === 1 ? "the" : `all ${count}`} grade-${grade} paper${count === 1 ? "" : "s"}`);
  return `${groups.join(", then ")} (any order within a grade)`;
}

function rankText(rank: number | null, system: string) {
  return rank === null ? `not in ${system}'s top 100` : `${system} #${rank}`;
}

function RankIt({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [order, setOrder] = useState(() => inOrder(rounds[0], rounds[0].start));
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<Scores[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ id: string; dir: "up" | "down"; top?: boolean } | null>(null);
  const round = rounds[roundIndex];
  const finished = submitted && roundIndex === rounds.length - 1;
  const current = results[roundIndex];

  useEffect(() => {
    if (active && !rootRef.current?.contains(document.activeElement)) rootRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    if (!focusRequest) return;
    const item = listRef.current?.querySelector(`[data-doc="${focusRequest.id}"]`);
    const preferred = item?.querySelector<HTMLButtonElement>(`[data-dir="${focusRequest.dir}"]`);
    const target = preferred && !preferred.disabled ? preferred : item?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    target?.focus({ preventScroll: focusRequest.top });
    if (focusRequest.top) rootRef.current?.scrollIntoView({ block: "start" });
    setFocusRequest(null);
  }, [focusRequest, order]);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setAnnouncement(`"${next[target].title}" moved to position ${target + 1} of ${next.length}.`);
    setFocusRequest({ id: next[target].id, dir: delta < 0 ? "up" : "down" });
  };

  const submit = () => {
    setSubmitted(true);
    setAnnouncement("");
    setResults((previous) => [...previous.slice(0, roundIndex), { you: ndcg(order), ...systemScores(round) }]);
    window.requestAnimationFrame(() => resultRef.current?.focus());
  };

  const startRound = (index: number) => {
    setRoundIndex(index);
    setOrder(inOrder(rounds[index], rounds[index].start));
    setSubmitted(false);
    setAnnouncement(`Query ${index + 1} of ${rounds.length}: ${rounds[index].query}`);
    setFocusRequest({ id: rounds[index].start[0], dir: "down", top: true });
  };

  const restart = () => {
    setResults([]);
    startRound(0);
  };

  const averages = results.length ? { you: mean(results.map((r) => r.you)), bm25: mean(results.map((r) => r.bm25)), reranker: mean(results.map((r) => r.reranker)) } : null;
  const score = ndcg(order);
  const rows = current ? [
    { key: "you", label: "You", value: current.you },
    { key: "bm25", label: bm25System.label, value: current.bm25 },
    { key: "reranker", label: rerankerSystem.label, value: current.reranker }
  ] : [];
  const { allDevQueries } = meta.selection;

  return (
    <div className="game rankit" ref={rootRef}>
      <div className="game__hud rankit__hud">
        <span>Query <b>{roundIndex + 1}</b> of {rounds.length}</span>
        {averages && (
          <span className="rankit__tally" aria-label={`Average nDCG@5 so far: you ${fmt(averages.you)}, keyword baseline ${fmt(averages.bm25)}, AI reranker ${fmt(averages.reranker)}`}>
            Avg <span>you <b>{fmt2(averages.you)}</b></span> · <span>BM25 <b>{fmt2(averages.bm25)}</b></span> · <span>AI <b>{fmt2(averages.reranker)}</b></span>
          </span>
        )}
      </div>

      <p className="rankit__query"><Search size={15} strokeWidth={2.2} aria-hidden="true" /><span>{round.query}</span></p>
      <p className="game__hint">Beat Sid's search engine: put the papers this searcher needs most at the top (arrow buttons, or ↑/↓ on a focused result), then submit. You're scored with nDCG@5 against his keyword baseline and AI reranker.</p>

      <ol ref={listRef} className="rankit__list" aria-label="Papers to rank">
        {order.map((paper, index) => (
          <li key={paper.id} data-doc={paper.id} className="rankit__doc" data-grade={submitted ? paper.grade : undefined} onKeyDown={(event) => {
            if (!active || submitted || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            event.preventDefault();
            move(index, event.key === "ArrowUp" ? -1 : 1);
          }}>
            <span className="rankit__pos" aria-hidden="true">{index + 1}</span>
            <div className="rankit__text">
              {submitted ? (
                <a className="rankit__title" href={`https://arxiv.org/abs/${paper.id}`} target="_blank" rel="noreferrer">{paper.title}</a>
              ) : (
                <strong className="rankit__title">{paper.title}</strong>
              )}
              <span className="rankit__source">arxiv.org/abs/{paper.id}</span>
              <span className="rankit__snippet">{paper.snippet}</span>
              {submitted && (
                <span className="rankit__meta">
                  <span className="rankit__grade">{paper.grade} · {gradeNames[paper.grade]}</span>
                  <span className="rankit__ranks">{rankText(paper.bm25Rank, "BM25")} · {rankText(paper.rerankerRank, "AI reranker")}</span>
                </span>
              )}
            </div>
            {!submitted && (
              <span className="rankit__moves">
                <button type="button" className="game__btn game__btn--icon" data-dir="up" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move "${paper.title}" up`}>
                  <ArrowUp size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button type="button" className="game__btn game__btn--icon" data-dir="down" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move "${paper.title}" down`}>
                  <ArrowDown size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {!submitted || !current ? (
        <div className="game__row">
          <button type="button" className="game__btn game__btn--primary" onClick={submit}>Submit ranking</button>
        </div>
      ) : (
        <div ref={resultRef} className="rankit__result" tabIndex={-1} aria-live="polite">
          <p className="rankit__score">
            nDCG@5 <b>{fmt(current.you)}</b>
            <span>{verdict(current.you)}</span>
          </p>
          <dl className="rankit__versus" aria-label="nDCG@5 on these five papers">
            {rows.map((row) => (
              <div key={row.key} className="rankit__vs" data-who={row.key}>
                <dt>{row.label}</dt>
                <dd>
                  <span className="rankit__track" aria-hidden="true"><span style={{ width: `${row.value * 100}%` }} /></span>
                  <b>{fmt(row.value)}</b>
                </dd>
              </div>
            ))}
          </dl>
          <p className="rankit__winner">{winnerLine(current)}</p>
          <p className="game__muted">
            Each system's score uses its real ranking of these 5 papers. On its full top 10 for this query, BM25 scored {fmt(round.fullNdcg10.bm25)} and the AI reranker {fmt(round.fullNdcg10.reranker)} nDCG@10 ({thousands(round.fullNdcg10.judgments)}-judgment pool).
          </p>
          <div className="rankit__table-wrap">
            <table className="rankit__table">
              <caption className="sr-only">How each position in your order contributed</caption>
              <thead>
                <tr><th scope="col">Pos</th><th scope="col">Grade</th><th scope="col">Gain</th><th scope="col">÷ log<sub>2</sub>(pos+1)</th><th scope="col">Adds</th></tr>
              </thead>
              <tbody>
                {order.map((paper, position) => (
                  <tr key={paper.id}>
                    <td>{position + 1}</td>
                    <td>{paper.grade}</td>
                    <td>{gain(paper.grade)}</td>
                    <td>{discount(position).toFixed(2)}</td>
                    <td>{(gain(paper.grade) / discount(position)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4}>DCG {dcg(order).toFixed(2)} ÷ ideal DCG {dcg(ideal(order)).toFixed(2)}</td><td>{fmt(score)}</td></tr>
              </tfoot>
            </table>
          </div>
          {score < 0.999 && <p className="game__muted">Best possible order: {bestOrderText(order)}.</p>}
          <div className="game__row">
            {roundIndex < rounds.length - 1 ? (
              <button type="button" className="game__btn game__btn--primary" onClick={() => startRound(roundIndex + 1)}>Next query</button>
            ) : (
              <button type="button" className="game__btn game__btn--primary" onClick={restart}>
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                Play again
              </button>
            )}
            <a className="rankit__try" href={`${meta.site}?${meta.siteQueryParam}=${encodeURIComponent(round.query)}`} target="_blank" rel="noreferrer">
              Try this query on arXiv Search
              <ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" />
            </a>
          </div>
          {finished && averages && (
            <div className="rankit__final">
              <p className="game__status">Final average nDCG@5 across {results.length} queries:</p>
              <p className="rankit__final-scores">
                <span>You <b>{fmt(averages.you)}</b></span>
                <span>{bm25System.label} <b>{fmt(averages.bm25)}</b></span>
                <span>{rerankerSystem.label} <b>{fmt(averages.reranker)}</b></span>
              </p>
              <p className="game__muted">
                You matched or beat the keyword baseline on {results.filter((r) => milli(r.you) >= milli(r.bm25)).length} of {results.length} queries and the AI reranker on {results.filter((r) => milli(r.you) >= milli(r.reranker)).length}.
                {" "}These six were picked for readability; with the same 5-paper rule on all {allDevQueries.queries} dev queries, the AI reranker scores higher on {allDevQueries.rerankerHigher}, BM25 on {allDevQueries.bm25Higher}, and they tie on {allDevQueries.tied}.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rankit__fine">
        <p className="game__fine">
          Real development queries (LLM-written from arXiv papers) with AI-graded relevance (0–{maxGrade}) from arXiv Search, <a href={meta.commitUrl} target="_blank" rel="noreferrer">commit {shortCommit}</a>. Scores use 5 papers per query, so they differ from the project's nDCG@10 ({fmt2(bm25System.ndcg10)} to {fmt2(rerankerSystem.ndcg10)}).
        </p>
        <details className="rankit__about">
          <summary>How this works</summary>
          <ul>
            <li>Grades: 0 not relevant, 1 partly relevant, 2 highly relevant. GPT-5.4 mini graded each paper's title and abstract, with reference overrides; not validated by people ({thousands(meta.judgments.pairs)} judgments).</li>
            <li>Papers: taken in turn from each system's highest-ranked judged results, BM25 first. Each system's order is its rank in its saved run; papers outside its top 100 go last, by arXiv id. The starting order is a fixed shuffle that never scores above either system.</li>
            <li>nDCG@5: linear gain (gain = grade), divided by log<sub>2</sub>(position + 1), then by the best possible order of the same 5 papers, as in the project's metrics.py.</li>
            <li>Project nDCG@10 on {meta.queries.count} dev queries: BM25 {bm25System.ndcg10} ({thousands(bm25System.judgments)} judgments), AI reranker {rerankerSystem.ndcg10} ({thousands(rerankerSystem.judgments)} judgments). The pools differ, so this isn't a like-for-like gain, and settings were tuned on these queries.</li>
            <li>Titles and snippets: arXiv API (CC0). The live site may rank differently from the saved runs.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}

export default RankIt;
