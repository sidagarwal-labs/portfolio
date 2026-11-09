import { useRef, type KeyboardEvent } from "react";
import { ExternalLink } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import LivePageShell from "./LivePageShell";
import {
  arenaBoards, arenaHref, formatDay, formatScore, formatUncertainty, leaderboards, orgName, useArenaBoard,
  type ArenaBoard, type Benchmark
} from "./leaderboardData";

const votes = new Intl.NumberFormat("en-US");
const benchmarks = leaderboards.epoch.benchmarks;

type TabItem = { id: string; label: string };

/* ARIA tabs with arrow-key movement; the selected tab is mirrored into the query string so views are linkable. */
function Tabs({ label, idPrefix, items, value, onChange }: { label: string; idPrefix: string; items: readonly TabItem[]; value: string; onChange: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = items.findIndex((item) => item.id === value);
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = items[(moves[event.key] + items.length) % items.length];
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${next.id}`)?.focus();
  };
  return (
    <div className="lb-tabs" role="tablist" aria-label={label} ref={list}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${item.id}`}
          aria-selected={item.id === value}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={item.id === value ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={onKeyDown}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* Bar length within a board, so the gaps between models are visible. */
function share(value: number, values: number[]) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max === min ? 100 : 20 + 80 * (value - min) / (max - min);
}

function ArenaPanel({ board }: { board: ArenaBoard }) {
  const { rows, publishedAt, source, loading } = useArenaBoard(board.id);
  const scores = rows.map((row) => row.score);
  return (
    <div role="tabpanel" id="arena-panel" aria-labelledby={`arena-tab-${board.path}`} tabIndex={0} className="lb-panel">
      <div className="lb-panel__head">
        <p>{board.blurb}</p>
        <p className="lb-source" data-source={source} aria-live="polite">
          {loading ? "Checking for a newer leaderboard..." : source === "live"
            ? `Live from LMArena, published ${formatDay(publishedAt)}`
            : `Saved snapshot, published ${formatDay(publishedAt)}`}
        </p>
      </div>
      {rows.length ? (
        <table className="lb-table">
          <caption className="lb-caption">{board.name}, top {rows.length} by Elo-style score</caption>
          <thead>
            <tr><th scope="col">Rank</th><th scope="col">Model</th><th scope="col">Score</th><th scope="col" className="lb-optional">Votes</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.rank}-${row.model}`}>
                <td className="lb-rank">{row.rank}</td>
                <th scope="row" className="lb-model">
                  <span>{row.model}</span>
                  <small>{orgName(row.org)}{row.license && row.license !== "Proprietary" ? ` · ${row.license}` : ""}</small>
                </th>
                <td className="lb-score">
                  <span className="lb-bar" style={{ width: `${share(row.score, scores)}%` }} aria-hidden="true" />
                  <strong>{row.score.toFixed(0)}</strong>
                  <small>±{((row.upper - row.lower) / 2).toFixed(0)}</small>
                </td>
                <td className="lb-optional lb-votes">{votes.format(row.votes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="live-empty">This board is not available right now.</p>
      )}
      <p className="lb-more">
        <a href={arenaHref(board)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> Full {board.name} leaderboard</a>
      </p>
    </div>
  );
}

function BenchmarkPanel({ bench }: { bench: Benchmark }) {
  const scores = bench.rows.map((row) => row.score);
  const shareOf = (value: number) => bench.unit === "percent" ? Math.max(2, Math.min(100, value)) : share(value, scores);
  return (
    <div role="tabpanel" id="bench-panel" aria-labelledby={`bench-tab-${bench.id}`} tabIndex={0} className="lb-panel">
      <div className="lb-panel__head">
        <p>{bench.blurb}</p>
        <p className="lb-source">Best result per model, from Epoch AI's benchmarking hub</p>
      </div>
      <table className="lb-table">
        <caption className="lb-caption">{bench.name}, top {bench.rows.length} models</caption>
        <thead>
          <tr><th scope="col">#</th><th scope="col">Model</th><th scope="col">Score</th><th scope="col" className="lb-optional">Released</th></tr>
        </thead>
        <tbody>
          {bench.rows.map((row, index) => {
            const uncertainty = formatUncertainty(bench.unit, row);
            return (
              <tr key={`${row.model}-${row.detail ?? ""}`}>
                <td className="lb-rank">{index + 1}</td>
                <th scope="row" className="lb-model">
                  <span>{row.model}{row.detail && bench.id !== "terminalbench" && <em> {row.detail}</em>}</span>
                  <small>{row.org}{row.detail && bench.id === "terminalbench" ? ` · agent: ${row.detail}` : ""}</small>
                </th>
                <td className="lb-score">
                  <span className="lb-bar" style={{ width: `${shareOf(row.score)}%` }} aria-hidden="true" />
                  <strong>{formatScore(bench.unit, row.score)}</strong>
                  {uncertainty && <small>{uncertainty}</small>}
                </td>
                <td className="lb-optional lb-date">{row.date ? formatDay(row.date) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="lb-more">
        <a href={bench.href} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> About {bench.name}</a>
      </p>
    </div>
  );
}

function LeaderboardsPage() {
  const [params, setParams] = useSearchParams();
  const board = arenaBoards.find((item) => item.path === params.get("arena")) ?? arenaBoards[0];
  const bench = benchmarks.find((item) => item.id === params.get("bench")) ?? benchmarks[0];
  const select = (key: "arena" | "bench", value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true, state: { keepScroll: true } });
  };

  const leaders = [
    ...arenaBoards.slice(0, 4).flatMap((item) => {
      const top = leaderboards.arena.boards[item.id]?.[0];
      return top ? [{ key: item.id, label: `${item.label} Arena`, model: top.model, org: orgName(top.org), value: top.score.toFixed(0) }] : [];
    }),
    ...benchmarks.filter((item) => ["eci", "swebench", "metr"].includes(item.id)).flatMap((item) => {
      const top = item.rows[0];
      return top ? [{ key: item.id, label: item.name, model: top.model, org: top.org, value: formatScore(item.unit, top.score) }] : [];
    })
  ];

  return (
    <LivePageShell
      section="leaderboards"
      title="AI leaderboards"
      documentTitle="AI leaderboards"
      lede="Which models people prefer in blind head-to-head votes, and how the frontier scores on the hardest public benchmarks."
      meta={`Arena refreshes live in your browser; benchmarks update daily. Snapshot from ${formatDay(leaderboards.generatedAt)}.`}
      sources={
        <>
          <p>Preference rankings from <a href="https://arena.ai/" target="_blank" rel="noopener noreferrer">LMArena</a> via its <a href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset" target="_blank" rel="noopener noreferrer">public leaderboard dataset</a>.</p>
          <p>Benchmark results from Epoch AI, "<a href="https://epoch.ai/benchmarks" target="_blank" rel="noopener noreferrer">Capabilities &amp; benchmarking</a>," used under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, which collects results from Epoch's own runs and from METR, ARC Prize, Scale AI, and Terminal-Bench.</p>
        </>
      }
    >
      <section className="live-section" aria-labelledby="lb-leaders-title">
        <h2 id="lb-leaders-title" className="live-section__title">At the top</h2>
        <ul className="lb-leaders">
          {leaders.map((leader) => (
            <li key={leader.key}>
              <span className="live-label">{leader.label}</span>
              <strong>{leader.model}</strong>
              <span className="lb-leaders__meta">{leader.org} · {leader.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="live-section" aria-labelledby="lb-arena-title">
        <h2 id="lb-arena-title" className="live-section__title">Arena: what people prefer</h2>
        <p className="live-section__intro">People send one prompt to two anonymous models and vote for the better answer. Scores are Elo-style ratings with 95% confidence intervals, so models whose ranges overlap are effectively tied.</p>
        <Tabs label="Arena boards" idPrefix="arena" items={arenaBoards.map((item) => ({ id: item.path, label: item.label }))} value={board.path} onChange={(id) => select("arena", id)} />
        <ArenaPanel key={board.id} board={board} />
      </section>

      <section className="live-section" aria-labelledby="lb-bench-title">
        <h2 id="lb-bench-title" className="live-section__title">Benchmarks: what models can do</h2>
        <p className="live-section__intro">Fixed tests with right answers. Settings differ between runs, such as reasoning effort and agent harness, so treat small gaps as noise.</p>
        <Tabs label="Benchmarks" idPrefix="bench" items={benchmarks.map((item) => ({ id: item.id, label: item.name.replace(/ \(.*\)$/, "") }))} value={bench.id} onChange={(id) => select("bench", id)} />
        <BenchmarkPanel bench={bench} />
      </section>
    </LivePageShell>
  );
}

export default LeaderboardsPage;
