import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  bottlenecks, capexAllocation, demandReadMore, demandSignals, explainers, NOTES_AS_OF, NOTES_HOME, sources,
  tightnessLabel, tightnessScale, type Bottleneck, type Source
} from "../../content/marketInsights";
import {
  direction, formatDay, formatMarketCap, formatPercent, formatTime, layerLabel, type AiStackRow, type AiStackState
} from "./aiStack";
import { bucketShares, levelName, pricedInPoints, pricedInReadout, splitCaps, treemap } from "./stackInsights";

const noteDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const notesAsOf = `Notes as of ${noteDay.format(new Date(`${NOTES_AS_OF}T12:00:00Z`))}`;
const money = (dollars: number) => `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
const share = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);

export function TightnessBadge({ item, label = tightnessLabel(item.tightness) }: { item: Bottleneck; label?: string }) {
  return <span className="mk-badge" data-tightness={item.tightness} title={`${item.name}: ${item.reason}`}>{label}</span>;
}

function pricesAsOf({ source, asOf, loading }: AiStackState) {
  if (loading) return `Prices: saved snapshot from ${formatDay(asOf)} while the live sheet loads`;
  if (source === "live") return `Prices: live tracker sheet, read ${formatDay(asOf)} at ${formatTime(asOf)}`;
  return `Prices: saved snapshot from ${formatDay(asOf)} (the live sheet couldn't be reached)`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type InsightProps = {
  id: string;
  title: string;
  intro?: ReactNode;
  asOf: string[];
  caveat?: string;
  sources?: Source[];
  table?: ReactNode;
  children: ReactNode;
};

/* One insight: the view, a data table for screen readers and checking, its dates, caveats, and the note it came from. */
function Insight({ id, title, intro, asOf, caveat, sources: links = [], table, children }: InsightProps) {
  return (
    <section className="mk-insight" id={`mk-insight-${id}`} aria-labelledby={`mk-insight-${id}-title`}>
      <header className="mk-insight__head">
        <h2 id={`mk-insight-${id}-title`}>{title}</h2>
        {intro && <p>{intro}</p>}
      </header>
      {children}
      {table && (
        <details className="mk-data">
          <summary>Data table</summary>
          <div className="mk-data__wrap">{table}</div>
        </details>
      )}
      <footer className="mk-insight__foot">
        <p className="mk-asof">{asOf.map((line) => <span key={line}>{line}</span>)}</p>
        {caveat && <p className="mk-caveat">{caveat}</p>}
        {links.length > 0 && <p className="mk-sources">
          Source{links.length > 1 ? "s" : ""}:{" "}
          {links.map((link, index) => (
            <span key={link.href}>
              {index > 0 && " · "}
              <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
            </span>
          ))}
        </p>}
      </footer>
    </section>
  );
}

type Props = {
  stack: AiStackState;
  /* Switch to the Stack tab on a level, with its first company selected. */
  onJump: (level: number) => void;
  /* Switch to the Stack tab with this placement selected. */
  onPick: (row: AiStackRow) => void;
};

/* The Insights tab: figures from Sid's research notes, mapped onto the stack, plus views computed from the live sheet. */
function MarketsInsights({ stack, onJump, onPick }: Props) {
  const rows = stack.rows;
  const levels = useMemo(() => new Set(rows.map((row) => row.level)), [rows]);
  const prices = pricesAsOf(stack);

  const LevelLink = ({ level }: { level: number }) => (
    <button type="button" className="mk-level-link" onClick={() => onJump(level)} disabled={!levels.has(level)} title={`Show Level ${level} in the stack`}>
      <span className="mk-level-link__n">L{level}</span> {levelName(level, rows)}
    </button>
  );

  return (
    <div className="mk-insights">
      <p className="mk-insights__intro">
        What my <a href={NOTES_HOME} target="_blank" rel="noopener noreferrer">research notes</a> say about where AI is
        constrained, mapped onto the stack. Figures from the notes keep their own dates; the charts lower down are computed from
        the live tracker sheet and update with it. Research, not investment advice.
      </p>

      <Insight
        id="demand"
        title="Demand signals"
        asOf={[notesAsOf, ...demandSignals.map((item) => `${item.value}: ${item.observed}`)]}
        caveat="Consensus estimates and backlogs measure different things from completed, powered, utilized capacity; they aren't AI-only spending."
        sources={[sources.consensus, sources.backlog, demandReadMore]}
      >
        <ul className="mk-demand">
          {demandSignals.map((item) => (
            <li key={item.id} data-signal={item.id}>
              <strong>{item.value}</strong>
              <span className="mk-demand__label">{item.label}</span>
              <span className="mk-demand__detail">{item.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mk-insight__more"><a href={demandReadMore.href} target="_blank" rel="noopener noreferrer">Read the October 2026 buildout note</a></p>
      </Insight>

      <Insight
        id="bottlenecks"
        title="Bottleneck ranking for 2026"
        intro="How tight each part of AI infrastructure is, from very high to low, and where it sits in the stack. The same badges mark those levels in the Stack tab."
        asOf={[notesAsOf]}
        caveat="A scenario comparison under the notes' spending and deployment assumptions, not independent proof of a shortage."
        sources={[sources.ranking]}
      >
        <ol className="mk-ranking">
          {bottlenecks.map((item) => (
            <li key={item.id} data-bottleneck={item.id}>
              <span className="mk-ranking__rank" aria-hidden="true">{item.rank}</span>
              <div className="mk-ranking__body">
                <h3><span className="mk-sr">{item.rank}. </span>{item.name} <TightnessBadge item={item} label={item.tightnessText} /></h3>
                <p>{item.reason}.</p>
                <p className="mk-ranking__levels">
                  {item.levels.length ? item.levels.map((level) => <LevelLink key={level} level={level} />) : <span className="mk-ranking__none">{item.levelNote}</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Insight>

      <CapexBar rows={rows} onJump={onJump} LevelLink={LevelLink} />

      <Insight
        id="explainers"
        title="Three constraints, in numbers"
        asOf={explainers.map((item) => `${item.title}: ${item.observed}`)}
        sources={explainers.flatMap((item) => item.sources).filter((link, index, all) => all.findIndex((other) => other.href === link.href) === index)}
      >
        <div className="mk-explainers">
          {explainers.map((item) => (
            <article key={item.id} className="mk-explainer" data-explainer={item.id} aria-labelledby={`mk-explainer-${item.id}`}>
              <h3 id={`mk-explainer-${item.id}`}>{item.title}</h3>
              <dl>
                {item.facts.map((fact) => (
                  <div key={fact.value}>
                    <dt>{fact.value}</dt>
                    <dd>{fact.label}</dd>
                  </div>
                ))}
              </dl>
              <p className="mk-explainer__caveat">{item.caveat}</p>
              <p className="mk-ranking__levels">{item.levels.map((level) => <LevelLink key={level} level={level} />)}</p>
              <p className="mk-explainer__source">
                {item.sources.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}
              </p>
            </article>
          ))}
        </div>
      </Insight>

      {rows.length === 0 ? (
        <p className="live-empty">The tracker sheet has no prices yet, so the charts below can't be drawn.</p>
      ) : (
        <>
          <PricedIn rows={rows} prices={prices} />
          <CapexVsCap rows={rows} prices={prices} />
          <Treemap rows={rows} prices={prices} onPick={onPick} />
        </>
      )}
    </div>
  );
}

/* ---------- $100 of AI capex ---------- */

type Segment = { id: string; bucket: string; label: string; dollars: number; levels: number[]; jump: number; note?: string };

const segments: Segment[] = capexAllocation.buckets.flatMap((bucket) =>
  bucket.parts
    ? bucket.parts.map((part) => ({ ...part, bucket: bucket.id }))
    : [{ id: bucket.id, bucket: bucket.id, label: bucket.label, dollars: bucket.dollars, levels: bucket.levels, jump: bucket.jump }]
);

const levelList = (levels: number[]) => (levels.length === 1 ? `Level ${levels[0]}` : `Levels ${levels.join(", ")}`);

function CapexBar({ rows, onJump, LevelLink }: { rows: AiStackRow[]; onJump: (level: number) => void; LevelLink: (props: { level: number }) => JSX.Element }) {
  const present = new Set(rows.map((row) => row.level));
  return (
    <Insight
      id="capex"
      title="Where each $100 of AI capex goes"
      intro="An illustrative split of AI infrastructure spending across the supply chain. Pick a segment to see the companies at its levels."
      asOf={[notesAsOf, capexAllocation.observed]}
      caveat="Illustrative allocation, not an exact bill of materials or realized spending mix. Memory ICs are more than HBM, and upstream wafer and equipment spending sits inside the chip dollars rather than on top of the $100."
      sources={[sources.allocation]}
      table={
        <table className="mk-data__table">
          <caption className="mk-sr">Each $100 of AI capex by use, with the stack levels it maps to</caption>
          <thead><tr><th scope="col">Use</th><th scope="col">Per $100</th><th scope="col">Stack levels</th></tr></thead>
          <tbody>
            {capexAllocation.buckets.map((bucket) => (
              <Fragment key={bucket.id}>
                <tr>
                  <th scope="row">{bucket.label}</th><td>{money(bucket.dollars)}</td><td>{levelList(bucket.levels)}</td>
                </tr>
                {bucket.parts?.map((part) => (
                  <tr key={part.id} className="mk-data__sub">
                    <th scope="row">{part.label}</th><td>{money(part.dollars)}</td><td>{levelList(part.levels)}{part.note ? ` (${part.note})` : ""}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="mk-capex">
        <div className="mk-capex__groups" aria-hidden="true">
          {capexAllocation.buckets.map((bucket) => (
            <span key={bucket.id} data-bucket={bucket.id} style={{ flexGrow: bucket.dollars }}>{bucket.parts ? `Chips ${money(bucket.dollars)}` : ""}</span>
          ))}
        </div>
        <div className="mk-capex__bar" role="group" aria-label="Each $100 of AI capex, by use">
          {segments.map((segment) => {
            /* Its main level, or the first of its levels the sheet has companies at. */
            const target = [segment.jump, ...segment.levels].find((level) => present.has(level));
            return (
              <button
                key={segment.id}
                type="button"
                className="mk-capex__seg"
                data-bucket={segment.bucket}
                data-segment={segment.id}
                style={{ flexGrow: segment.dollars }}
                onClick={() => target !== undefined && onJump(target)}
                disabled={target === undefined}
                aria-label={`${segment.label}: ${money(segment.dollars)} of each $100. Show ${levelList(segment.levels)} in the stack`}
                title={`${segment.label}: ${money(segment.dollars)}`}
              >
                <span className="mk-capex__amt">{money(segment.dollars)}</span>
                <span className="mk-capex__name">{segment.label}</span>
              </button>
            );
          })}
        </div>
        <ul className="mk-capex__legend">
          {segments.map((segment) => (
            <li key={segment.id} data-bucket={segment.bucket}>
              <span className="mk-capex__swatch" aria-hidden="true" />
              <span><strong>{money(segment.dollars)}</strong> {segment.label}{segment.note ? ` (${segment.note})` : ""}</span>
              <span className="mk-capex__levels">{segment.levels.map((level) => <LevelLink key={level} level={level} />)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Insight>
  );
}

/* ---------- Are the bottlenecks priced in? ---------- */

function PricedIn({ rows, prices }: { rows: AiStackRow[]; prices: string }) {
  const points = useMemo(() => pricedInPoints(rows), [rows]);
  const readout = pricedInReadout(points);
  const [ref, width] = useWidth<HTMLDivElement>();
  const plotted = points.filter((point) => point.medianFromHigh !== null);
  const W = Math.max(280, width);
  const H = W < 520 ? 300 : 340;
  const margin = { left: 46, right: 14, top: 18, bottom: W < 520 ? 52 : 40 };
  const lowest = Math.min(-10, ...plotted.map((point) => point.medianFromHigh!));
  const floor = Math.floor(lowest / 10) * 10;
  const x = (score: number) => margin.left + ((score - 1) / 4) * (W - margin.left - margin.right);
  const y = (value: number) => margin.top + (value / floor) * (H - margin.top - margin.bottom);
  const maxCap = Math.max(1, ...plotted.map((point) => point.marketCap));
  const radius = (cap: number) => 5 + (W < 520 ? 14 : 20) * Math.sqrt(Math.max(0, cap) / maxCap);
  const ticks = Array.from({ length: Math.round(-floor / 10) + 1 }, (_, index) => -index * 10).filter((tick, index, all) => all.length <= 7 || index % 2 === 0);
  const spread = W < 520 ? 22 : 34;

  return (
    <Insight
      id="priced-in"
      title="Are the bottlenecks priced in?"
      intro="Each ranked level's tightness in the notes against how far its stocks sit, at the median, from their 52-week highs. Bubble size is the level's combined market cap."
      asOf={[prices, notesAsOf]}
      caveat="A comparison, not a causal claim: prices move for many reasons, whole-company market caps include non-AI businesses, and the ranking is a scenario from the notes."
      sources={[sources.ranking]}
      table={
        <table className="mk-data__table">
          <caption className="mk-sr">Ranked stack levels: tightness, median distance from the 52-week high, and market cap</caption>
          <thead><tr><th scope="col">Level</th><th scope="col">Tightness</th><th scope="col">Median from 52w high</th><th scope="col">Market cap</th><th scope="col">Companies</th></tr></thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.level}>
                <th scope="row">L{point.level} {point.name}</th>
                <td>{point.bottlenecks.map((item) => tightnessLabel(item.tightness)).join(", ")}</td>
                <td>{formatPercent(point.medianFromHigh, 1)}</td>
                <td>{formatMarketCap(point.marketCap)}</td>
                <td>{point.symbols.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <p className="mk-readout" data-testid="priced-in-readout">{readout}</p>
      <div className="mk-chart" ref={ref}>
        {width > 0 && (
          <svg className="mk-scatter" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="mk-scatter-title mk-scatter-desc">
            <title id="mk-scatter-title">Bottleneck tightness against median distance from the 52-week high</title>
            <desc id="mk-scatter-desc">{readout} The data table below lists every level.</desc>
            {ticks.map((tick) => (
              <g key={tick} className="mk-axis">
                <line x1={margin.left} x2={W - margin.right} y1={y(tick)} y2={y(tick)} />
                <text x={margin.left - 6} y={y(tick)} dy="0.32em" textAnchor="end">{tick}%</text>
              </g>
            ))}
            {tightnessScale.map((step) => (
              <text key={step.id} className="mk-axis__x" x={x(step.score)} y={H - margin.bottom + 18} textAnchor="middle">
                {W < 520 ? step.label.replace("Medium-high", "Med-high") : step.label}
              </text>
            ))}
            <text className="mk-axis__title" x={margin.left + (W - margin.left - margin.right) / 2} y={H - 6} textAnchor="middle">Tightness in the notes →</text>
            {tightnessScale.flatMap((step) => {
              const same = plotted.filter((point) => point.score === step.score).sort((a, b) => a.level - b.level);
              return same.map((point, index) => {
                const cx = Math.min(W - margin.right - 4, Math.max(margin.left + 4, x(point.score) + (index - (same.length - 1) / 2) * spread));
                const cy = y(point.medianFromHigh!);
                return (
                  <g key={point.level} className="mk-dot" data-layer={point.layerId} data-level={point.level}>
                    <circle cx={cx} cy={cy} r={radius(point.marketCap)} />
                    <text x={cx} y={cy} dy="0.35em" textAnchor="middle">L{point.level}</text>
                  </g>
                );
              });
            })}
          </svg>
        )}
      </div>
    </Insight>
  );
}

/* ---------- Capex share vs market-cap share ---------- */

function CapexVsCap({ rows, prices }: { rows: AiStackRow[]; prices: string }) {
  const buckets = useMemo(() => bucketShares(rows), [rows]);
  const top = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.capexShare, bucket.capShare ?? 0)));
  return (
    <Insight
      id="capex-vs-cap"
      title="Capex share vs market-cap share"
      intro="For each $100 bucket: its share of the spending against the share of the stack's market cap held by the companies at its levels. Where the market-cap bar is longer, investors value those suppliers above their slice of the spend."
      asOf={[prices, `${notesAsOf} (allocation: ${capexAllocation.observed})`]}
      caveat="Illustrative allocation against whole-company market caps. A company at several levels (Alphabet, Microsoft, Broadcom, Intel) has its market cap split evenly across them; storage and application levels aren't in any bucket."
      sources={[sources.allocation]}
      table={
        <table className="mk-data__table">
          <caption className="mk-sr">Each capex bucket's share of spending and of market cap</caption>
          <thead><tr><th scope="col">Bucket</th><th scope="col">Capex share</th><th scope="col">Market-cap share</th><th scope="col">Market cap</th><th scope="col">Companies</th><th scope="col">Levels</th></tr></thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.id}>
                <th scope="row">{bucket.label}</th>
                <td>{share(bucket.capexShare)}</td>
                <td>{share(bucket.capShare)}</td>
                <td>{formatMarketCap(bucket.marketCap)}</td>
                <td>{bucket.companies}</td>
                <td>{bucket.levels.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ul className="mk-pairs">
        {buckets.map((bucket) => {
          const ratio = bucket.capShare === null ? null : bucket.capShare / bucket.capexShare;
          return (
            <li key={bucket.id} data-bucket={bucket.id}>
              <span className="mk-pairs__label">{bucket.label}</span>
              <span className="mk-pairs__bars" aria-hidden="true">
                <span className="mk-pairs__bar" data-kind="capex" style={{ width: `${(bucket.capexShare / top) * 100}%` }} />
                <span className="mk-pairs__bar" data-kind="cap" style={{ width: `${((bucket.capShare ?? 0) / top) * 100}%` }} />
              </span>
              <span className="mk-pairs__text">
                {share(bucket.capexShare)} of capex · {share(bucket.capShare)} of market cap
                {ratio !== null && <em> · {ratio >= 1 ? `${ratio.toFixed(1)}x its spend share` : `${ratio.toFixed(2)}x its spend share`}</em>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mk-pairs__key" aria-hidden="true"><span data-kind="capex" /> Capex share <span data-kind="cap" /> Market-cap share</p>
    </Insight>
  );
}

/* ---------- Market-cap treemap ---------- */

const changeColor = (change: number | null) => {
  if (change === null) return "#e4e7e4";
  const strength = Math.min(1, Math.abs(change) / 5);
  const mix = Math.round(18 + strength * 62);
  return `color-mix(in srgb, ${change >= 0 ? "#1f8a55" : "#c23b3b"} ${mix}%, #f4f6f3)`;
};

function Treemap({ rows, prices, onPick }: { rows: AiStackRow[]; prices: string; onPick: (row: AiStackRow) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 520 ? Math.round(width * 1.25) : Math.round(Math.min(560, width * 0.55));
  const layout = useMemo(() => (width > 0 ? treemap(rows, width, height) : { groups: [], tiles: [] }), [rows, width, height]);
  const caps = useMemo(() => splitCaps(rows), [rows]);
  const byKey = useMemo(() => new Map(rows.map((row) => [`${row.level}:${row.symbol}`, row])), [rows]);
  const missing = rows.filter((_, index) => caps[index] <= 0).map((row) => row.symbol);

  return (
    <Insight
      id="treemap"
      title="The stack by market cap"
      intro="Every company sized by market cap inside its layer and level, colored by today's move. Pick a tile to see the company in the stack."
      asOf={[prices]}
      caveat={`A company at several levels has its market cap split evenly across them, so each is counted once.${missing.length ? ` No market cap in the sheet for ${missing.join(", ")}.` : ""}`}
      table={
        <table className="mk-data__table">
          <caption className="mk-sr">Market cap and day change for every company placement in the stack</caption>
          <thead><tr><th scope="col">Company</th><th scope="col">Layer</th><th scope="col">Level</th><th scope="col">Market cap (split)</th><th scope="col">Day</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.level}:${row.symbol}`}>
                <th scope="row">{row.symbol}</th>
                <td>{layerLabel(row.layer)}</td>
                <td>L{row.level} {row.area}</td>
                <td>{caps[index] > 0 ? formatMarketCap(caps[index]) : "—"}</td>
                <td data-direction={direction(row.change)}>{formatPercent(row.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="mk-chart mk-treemap" ref={ref} style={{ height: width > 0 ? height : undefined }} aria-hidden="true">
        {layout.groups.map((group) => (
          <div key={group.key} className="mk-treemap__group" data-layer={group.layerId} style={{ left: group.x, top: group.y, width: group.w, height: group.h }}>
            {group.w > 70 && group.h > 40 && <span>{group.label}</span>}
          </div>
        ))}
        {layout.tiles.map((tile) => {
          const row = byKey.get(`${tile.level}:${tile.symbol}`);
          const strong = tile.change !== null && Math.abs(tile.change) >= 2.5;
          return (
            <button
              key={`${tile.level}:${tile.symbol}`}
              type="button"
              tabIndex={-1}
              className="mk-treemap__tile"
              data-symbol={tile.symbol}
              data-strong={strong || undefined}
              style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h, background: changeColor(tile.change) }}
              title={`${tile.symbol} · L${tile.level} · ${formatMarketCap(tile.value)} · ${formatPercent(tile.change)}`}
              onClick={() => row && onPick(row)}
            >
              {tile.w > 34 && tile.h > 18 && <span className="mk-treemap__sym">{tile.symbol}</span>}
              {tile.w > 44 && tile.h > 36 && <span className="mk-treemap__chg">{formatPercent(tile.change)}</span>}
            </button>
          );
        })}
      </div>
      <p className="mk-treemap__key" aria-hidden="true">
        <span>-5%</span><i /><span>+5%</span> <span className="mk-treemap__layers">{["chips", "data-center", "data", "application"].map((id) => <b key={id} data-layer={id}>{layerLabel(id.replace("-", " "))}</b>)}</span>
      </p>
    </Insight>
  );
}

export default MarketsInsights;
