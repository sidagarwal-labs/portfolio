import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Search } from "lucide-react";
import "./games.css";

type Doc = { id: string; title: string; source: string; snippet: string; grade: number };
type Round = { query: string; docs: Doc[] };

/* Illustrative queries and hand-assigned relevance grades (0 bad, 1 fair, 2 good, 3 perfect), listed in the scrambled starting order. */
const rounds: Round[] = [
  {
    query: "how to evaluate a RAG system",
    docs: [
      { id: "a", title: "Vector databases, explained", source: "blog", snippet: "What an index is, how nearest-neighbour search works, and when to use one.", grade: 1 },
      { id: "b", title: "Top 10 gaming GPUs this year", source: "reviews", snippet: "Frame rates, ray tracing, and which card to buy for 1440p.", grade: 0 },
      { id: "c", title: "Building an offline eval set from real queries", source: "eng notes", snippet: "Sample traffic, label relevance, and freeze a set you can regress against.", grade: 2 },
      { id: "d", title: "RAG evaluation: retrieval quality and groundedness", source: "guide", snippet: "Measure recall of the right passages, then whether answers stay grounded in them.", grade: 3 },
      { id: "e", title: "LLM-as-judge: calibrating graders against humans", source: "paper", snippet: "Check judge agreement with human labels before trusting automated scores.", grade: 2 }
    ]
  },
  {
    query: "dense retrieval for arXiv papers",
    docs: [
      { id: "a", title: "Dense fog advisory for the weekend", source: "weather", snippet: "Visibility under a quarter mile expected near the coast through Sunday.", grade: 0 },
      { id: "b", title: "Hybrid BM25 + embeddings with rank fusion", source: "tutorial", snippet: "Combine lexical and dense scores so exact terms and meaning both count.", grade: 2 },
      { id: "c", title: "How arXiv moderates new submissions", source: "faq", snippet: "Endorsement, categories, and what moderators check before a paper appears.", grade: 1 },
      { id: "d", title: "Embedding arXiv abstracts for semantic search", source: "notebook", snippet: "Chunk abstracts, embed them, and search by meaning instead of keywords.", grade: 3 },
      { id: "e", title: "Fine-tuning a bi-encoder on citation pairs", source: "paper", snippet: "Papers that cite each other make free positives for contrastive training.", grade: 2 }
    ]
  },
  {
    query: "NVIDIA data center revenue",
    docs: [
      { id: "a", title: "How to build a home data center rack", source: "forum", snippet: "Rails, cooling, and cable management for a homelab in the garage.", grade: 0 },
      { id: "b", title: "The Nvidia Way", source: "book", snippet: "A history of the company's strategy, culture, and big hardware bets.", grade: 1 },
      { id: "c", title: "Hyperscaler capex and accelerator demand", source: "analysis", snippet: "Cloud spending plans and what they imply for GPU orders.", grade: 2 },
      { id: "d", title: "GeForce driver release notes", source: "support", snippet: "Game-ready drivers, bug fixes, and known issues.", grade: 0 },
      { id: "e", title: "Quarterly results: data center segment revenue", source: "investor relations", snippet: "Segment revenue, growth versus last year, and the outlook for next quarter.", grade: 3 }
    ]
  },
  {
    query: "enterprise search with connectors",
    docs: [
      { id: "a", title: "Enterprise sales playbook for Q4", source: "slides", snippet: "Pipeline reviews, discount approvals, and closing plans.", grade: 0 },
      { id: "b", title: "Search bar UX patterns for websites", source: "design blog", snippet: "Autocomplete, empty states, and where to put the magnifying glass.", grade: 1 },
      { id: "c", title: "Permission trimming: respecting ACLs at query time", source: "docs", snippet: "Only return documents the person asking is allowed to open.", grade: 2 },
      { id: "d", title: "Incremental crawls and connector sync schedules", source: "docs", snippet: "Keep the index fresh without re-reading every source each night.", grade: 2 },
      { id: "e", title: "Indexing SharePoint, Confluence, and Jira together", source: "guide", snippet: "Connect each source, map its fields, and search them all from one box.", grade: 3 }
    ]
  }
];

const gradeNames = ["Bad", "Fair", "Good", "Perfect"];

const gain = (grade: number) => 2 ** grade - 1;
const discount = (position: number) => Math.log2(position + 2);
const dcg = (docs: Doc[]) => docs.reduce((sum, doc, position) => sum + gain(doc.grade) / discount(position), 0);
const ideal = (docs: Doc[]) => [...docs].sort((a, b) => b.grade - a.grade);
const ndcg = (docs: Doc[]) => dcg(docs) / dcg(ideal(docs));

function RankIt({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [order, setOrder] = useState(rounds[0].docs);
  const [submitted, setSubmitted] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ id: string; dir: "up" | "down" } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const round = rounds[roundIndex];
  const finished = scores.length === rounds.length && submitted && roundIndex === rounds.length - 1;

  useEffect(() => {
    if (active && !rootRef.current?.contains(document.activeElement)) rootRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    if (!focusRequest) return;
    const item = listRef.current?.querySelector(`[data-doc="${focusRequest.id}"]`);
    const preferred = item?.querySelector<HTMLButtonElement>(`[data-dir="${focusRequest.dir}"]`);
    const target = preferred && !preferred.disabled ? preferred : item?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    target?.focus();
    setFocusRequest(null);
  }, [focusRequest, order]);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setFocusRequest({ id: next[target].id, dir: delta < 0 ? "up" : "down" });
  };

  const submit = () => {
    setSubmitted(true);
    setScores((current) => [...current.slice(0, roundIndex), ndcg(order)]);
    window.requestAnimationFrame(() => resultRef.current?.focus());
  };

  const nextRound = () => {
    const next = roundIndex + 1;
    setRoundIndex(next);
    setOrder(rounds[next].docs);
    setSubmitted(false);
  };

  const restart = () => {
    setRoundIndex(0);
    setOrder(rounds[0].docs);
    setSubmitted(false);
    setScores([]);
  };

  const score = ndcg(order);
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;

  return (
    <div className="game rankit" ref={rootRef}>
      <div className="game__hud">
        <span>Query <b>{roundIndex + 1}</b> of {rounds.length}</span>
        {scores.length > 0 && <span>Avg nDCG <b>{average.toFixed(2)}</b></span>}
      </div>

      <p className="rankit__query"><Search size={15} strokeWidth={2.2} aria-hidden="true" /><span>{round.query}</span></p>
      <p className="game__hint">Put the most useful results first, then submit. You're scored with nDCG@5, the same metric search teams use offline.</p>

      <ol ref={listRef} className="rankit__list" aria-label="Results to rank">
        {order.map((doc, index) => (
          <li key={doc.id} data-doc={doc.id} className="rankit__doc" data-grade={submitted ? doc.grade : undefined} onKeyDown={(event) => {
            if (!active || submitted || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            event.preventDefault();
            move(index, event.key === "ArrowUp" ? -1 : 1);
          }}>
            <span className="rankit__pos" aria-hidden="true">{index + 1}</span>
            <div className="rankit__text">
              <strong>{doc.title}</strong>
              <span className="rankit__source">{doc.source}</span>
              <span className="rankit__snippet">{doc.snippet}</span>
            </div>
            {submitted ? (
              <span className="rankit__grade">{gradeNames[doc.grade]}</span>
            ) : (
              <span className="rankit__moves">
                <button type="button" className="game__btn game__btn--icon" data-dir="up" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move "${doc.title}" up`}>
                  <ArrowUp size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button type="button" className="game__btn game__btn--icon" data-dir="down" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move "${doc.title}" down`}>
                  <ArrowDown size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {!submitted ? (
        <div className="game__row">
          <button type="button" className="game__btn game__btn--primary" onClick={submit}>Submit ranking</button>
        </div>
      ) : (
        <div ref={resultRef} className="rankit__result" tabIndex={-1} aria-live="polite">
          <p className="rankit__score">
            nDCG@5 <b>{score.toFixed(3)}</b>
            <span>{score > 0.999 ? "Perfect order." : score > 0.9 ? "Close to ideal." : score > 0.75 ? "Decent, but a better result is buried." : "The best results are too far down."}</span>
          </p>
          <div className="rankit__table-wrap">
            <table className="rankit__table">
              <caption className="sr-only">How each position contributed</caption>
              <thead>
                <tr><th scope="col">Pos</th><th scope="col">Grade</th><th scope="col">Gain 2<sup>g</sup>−1</th><th scope="col">÷ log<sub>2</sub>(pos+1)</th><th scope="col">Adds</th></tr>
              </thead>
              <tbody>
                {order.map((doc, position) => (
                  <tr key={doc.id}>
                    <td>{position + 1}</td>
                    <td>{doc.grade}</td>
                    <td>{gain(doc.grade)}</td>
                    <td>{discount(position).toFixed(2)}</td>
                    <td>{(gain(doc.grade) / discount(position)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4}>DCG ÷ ideal DCG ({dcg(ideal(order)).toFixed(2)})</td><td>{score.toFixed(3)}</td></tr>
              </tfoot>
            </table>
          </div>
          {score < 0.999 && (
            <p className="game__muted">Ideal order: {ideal(order).map((doc) => doc.title).join(" → ")}</p>
          )}
          <div className="game__row">
            {roundIndex < rounds.length - 1 ? (
              <button type="button" className="game__btn game__btn--primary" onClick={nextRound}>Next query</button>
            ) : (
              <button type="button" className="game__btn game__btn--primary" onClick={restart}>
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                Play again
              </button>
            )}
          </div>
          {finished && <p className="game__status">Final average nDCG@5: <b>{average.toFixed(3)}</b> across {rounds.length} queries.</p>}
        </div>
      )}

      <p className="game__fine">Queries, documents, and grades are illustrative.</p>
    </div>
  );
}

export default RankIt;
