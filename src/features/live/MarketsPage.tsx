import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { marketCompanies } from "../../content/journalContent";
import { bottlenecksForLevel, type Bottleneck } from "../../content/marketInsights";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { embeddedView, replaceHistoryState } from "../views/os/embed";
import {
  AI_STACK_SHEET, direction, distance, formatDay, formatMarketCap, formatPercent, formatPrice, formatRatio,
  formatTime, groupStack, layerId, layerLabel, listing, useAiStack, type AiStackRow, type AiStackState, type StackLayer
} from "./aiStack";
import LivePageShell from "./LivePageShell";
import MarketsInsights, { TightnessBadge } from "./MarketsInsights";
import { canonicalMarketsPath } from "./marketsPath";
import TradingViewWidget from "./TradingViewWidget";
import "./markets.css";

const tradingView = <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>;

/* Markets is the AI stack. Old /markets?view=stack links land on the same company here, without a history entry. */
function MarketsPage() {
  const { pathname, search, hash } = useLocation();
  const path = `${pathname}${search}${hash}`;
  const current = canonicalMarketsPath(path);
  return current === path ? <MarketsView /> : <Navigate to={current} replace />;
}

type Tab = "stack" | "insights";

/* ?symbol= is the selected company (replaced, so previews don't pile up in history), ?full=1 its full page (pushed),
   and ?tab=insights the Insights tab. `view` is reserved: canonicalMarketsPath strips it. */
export function marketsSearch({ symbol, tab, full }: { symbol?: string; tab?: Tab; full?: boolean }) {
  const params = new URLSearchParams();
  if (tab === "insights") params.set("tab", "insights");
  if (symbol) params.set("symbol", symbol);
  if (full) params.set("full", "1");
  const text = params.toString();
  return text ? `?${text}` : "";
}

/* One row per placement: a company at two levels has two rows. */
const rowKey = (row: AiStackRow) => `${row.level}:${row.symbol.toUpperCase()}`;
const sameSymbol = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/* The stack's scroll position when a full company page opened, restored when the reader comes back. */
let stackScroll: number | null = null;

const reveal = (element: Element | null | undefined, smooth: boolean) =>
  element?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });

function MarketsView() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stack = useAiStack();
  const wide = useMediaQuery("(min-width: 900px)");
  const reducedMotion = usePrefersReducedMotion();
  const layers = useMemo(() => groupStack(stack.rows), [stack.rows]);
  const ordered = useMemo(() => layers.flatMap((layer) => layer.levels.flatMap((level) => level.rows)), [layers]);

  const requested = params.get("symbol")?.trim() ?? "";
  const match = requested ? ordered.find((row) => sameSymbol(row.symbol, requested)) : undefined;
  const tab: Tab = params.get("tab") === "insights" ? "insights" : "stack";
  const full = Boolean(match) && params.get("full") === "1";
  /* With no symbol in the address the first company is previewed, without writing it into the URL. */
  const selected = match ?? ordered[0];
  const [chosenKey, setChosenKey] = useState<string>();
  const activeKey = !selected
    ? undefined
    : chosenKey && sameSymbol(chosenKey.split(":")[1], selected.symbol) && ordered.some((row) => rowKey(row) === chosenKey)
      ? chosenKey
      : rowKey(selected);

  const select = (row: AiStackRow, state?: Record<string, unknown>) => {
    setChosenKey(rowKey(row));
    navigate({ search: marketsSearch({ symbol: row.symbol }) }, { replace: true, state: { ...replaceHistoryState, ...state } });
  };
  const jumpToLevel = (level: number) => {
    const row = ordered.find((item) => item.level === level);
    if (row) select(row, { jumpLevel: level });
  };
  const switchTab = (next: Tab) => {
    if (next === tab) return;
    navigate({ search: marketsSearch({ symbol: match?.symbol, tab: next }) }, { replace: true, state: replaceHistoryState });
  };

  /* Opening the full page brings it up under the sticky header; leaving it puts the stack back where it was. */
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const wasFull = useRef(full);
  useLayoutEffect(() => {
    const before = wasFull.current;
    wasFull.current = full;
    if (full === before) return;
    if (full) {
      const detail = detailHeading.current?.closest<HTMLElement>(".mk-detail");
      if (detail) {
        const margin = parseFloat(getComputedStyle(detail).scrollMarginTop) || 0;
        window.scrollTo({ top: Math.max(0, detail.getBoundingClientRect().top + window.scrollY - margin), behavior: "auto" });
      }
      detailHeading.current?.focus({ preventScroll: true });
      return;
    }
    const link = activeKey ? document.querySelector<HTMLElement>(`a[data-row-key="${CSS.escape(activeKey)}"]`) : null;
    const saved = stackScroll;
    stackScroll = null;
    if (saved !== null) window.scrollTo({ top: saved, behavior: "auto" });
    else link?.scrollIntoView({ block: "center", behavior: "auto" });
    link?.focus({ preventScroll: true });
  }, [full, activeKey]);

  const backToStack = () => {
    const fromStack = (location.state as { fromStack?: boolean } | null)?.fromStack;
    if (fromStack && !embeddedView) navigate(-1);
    else navigate({ search: marketsSearch({ symbol: match?.symbol }) }, { replace: true, state: replaceHistoryState });
  };

  const unknown = requested && !match && !stack.loading ? requested.slice(0, 24) : "";

  return (
    <LivePageShell
      section="markets"
      title="Markets"
      documentTitle={match ? `${match.symbol} · Markets` : "Markets"}
      lede="My AI / LLM Stack Tracker: the public companies behind each layer of AI, from materials and chip design up through data centers, data platforms, and applications. Pick a company for a quick chart, open its full page for financials and news, or read the Insights tab for where the bottlenecks are."
      sources={
        <p>
          Prices, market caps, P/E ratios, and 52-week ranges come from my{" "}
          <a href={AI_STACK_SHEET} target="_blank" rel="noopener noreferrer">AI / LLM Stack Tracker Google Sheet</a>, which uses Google
          Finance data delayed by up to 20 minutes. Charts, financials, technicals, profiles, and news are {tradingView} widgets.
          Insights quote my research notes, with their dates and sources. Nothing here is investment advice.
        </p>
      }
    >
      <p className="mk-status" data-source={stack.loading ? "loading" : stack.source} aria-live="polite">{stackStatus(stack)}</p>

      {full && match ? (
        <FullView row={match} rows={stack.rows} heading={detailHeading} onBack={backToStack} />
      ) : (
        <>
          <MarketsTabs tab={tab} onChange={switchTab} />
          <div role="tabpanel" id="mk-panel" aria-labelledby={`mk-tab-${tab}`} className="mk-panel">
            {tab === "stack" ? (
              <>
                {unknown && (
                  <p className="mk-missing" role="status">
                    “{unknown}” isn't in the stack{selected ? `, so this shows ${selected.symbol}` : ""}.
                  </p>
                )}
                <StackPanel
                  layers={layers}
                  rows={stack.rows}
                  selected={selected}
                  activeKey={activeKey}
                  wide={wide}
                  smooth={!reducedMotion}
                  onChoose={(row) => setChosenKey(rowKey(row))}
                  onSelect={(row) => select(row)}
                />
              </>
            ) : (
              <MarketsInsights stack={stack} onJump={jumpToLevel} onPick={(row) => select(row, { jumpLevel: row.level })} />
            )}
          </div>
        </>
      )}
    </LivePageShell>
  );
}

const tabs: { id: Tab; label: string }[] = [{ id: "stack", label: "Stack" }, { id: "insights", label: "Insights" }];

function MarketsTabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((item) => item.id === tab);
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`#mk-tab-${next.id}`)?.focus();
  };
  return (
    <div className="mk-tabs" role="tablist" aria-label="Markets views" ref={list}>
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`mk-tab-${item.id}`}
          aria-selected={item.id === tab}
          aria-controls="mk-panel"
          tabIndex={item.id === tab ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={onKeyDown}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function stackStatus({ source, asOf, loading }: AiStackState) {
  if (loading) return `Checking the tracker sheet for newer prices. Showing the saved snapshot from ${formatDay(asOf)} until then.`;
  if (source === "live") return `Live from the tracker sheet, read at ${formatTime(asOf)}. Its Google Finance prices can be delayed up to 20 minutes.`;
  return `Saved snapshot from ${formatDay(asOf)}. The live sheet couldn't be reached.`;
}

const levelRange = (layer: StackLayer) => {
  const first = layer.levels[0].level;
  const last = layer.levels[layer.levels.length - 1].level;
  return first === last ? `Level ${first}` : `Levels ${first}–${last}`;
};

type StackPanelProps = {
  layers: StackLayer[];
  rows: AiStackRow[];
  selected?: AiStackRow;
  activeKey?: string;
  wide: boolean;
  smooth: boolean;
  onChoose: (row: AiStackRow) => void;
  onSelect: (row: AiStackRow) => void;
};

/* The stack on the left and the selected company's preview beside it (sticky), or under its row on a phone.
   Rows are links with one tab stop; arrow keys, Home, and End move through them and select as they go. */
function StackPanel({ layers, rows, selected, activeKey, wide, smooth, onChoose, onSelect }: StackPanelProps) {
  const location = useLocation();
  const list = useRef<HTMLDivElement>(null);
  /* Where the chosen row sat on screen, so a preview opening or closing above it doesn't move it. */
  const anchor = useRef<{ key: string; top: number }>();
  const byKey = useMemo(() => new Map(rows.map((row) => [rowKey(row), row])), [rows]);

  const remember = (link: HTMLElement) => {
    anchor.current = { key: link.dataset.rowKey ?? "", top: link.getBoundingClientRect().top };
  };

  useLayoutEffect(() => {
    const kept = anchor.current;
    anchor.current = undefined;
    if (!kept) return;
    const link = list.current?.querySelector<HTMLElement>(`a[data-row-key="${CSS.escape(kept.key)}"]`);
    const shift = link ? link.getBoundingClientRect().top - kept.top : 0;
    if (Math.abs(shift) > 0.5) window.scrollBy({ top: shift, behavior: "auto" });
  }, [activeKey]);

  /* A segment of the Insights $100 bar lands on its level, with its first company selected. */
  const jumpLevel = (location.state as { jumpLevel?: unknown } | null)?.jumpLevel;
  useLayoutEffect(() => {
    if (typeof jumpLevel !== "number") return;
    reveal(document.getElementById(`mk-level-${jumpLevel}`), smooth);
    if (activeKey) list.current?.querySelector<HTMLElement>(`a[data-row-key="${CSS.escape(activeKey)}"]`)?.focus({ preventScroll: true });
    /* Once per navigation that carries a jump. */
  }, [location.key]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const links = [...(list.current?.querySelectorAll<HTMLAnchorElement>("a[data-row-key]") ?? [])];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index === -1) return;
    event.preventDefault();
    const target = { ArrowDown: Math.min(index + 1, links.length - 1), ArrowUp: Math.max(index - 1, 0), Home: 0, End: links.length - 1 }[event.key]!;
    const link = links[target];
    const row = byKey.get(link.dataset.rowKey ?? "");
    if (target === index || !row) return;
    link.focus();
    remember(link);
    onSelect(row);
  };

  if (!selected) return <p className="live-empty">The tracker sheet has no companies yet.</p>;

  const preview = (inline: boolean) => <Preview row={selected} rows={rows} inline={inline} />;

  return (
    <div className="mk-split" data-layout={wide ? "wide" : "narrow"}>
      <div className="mk-list" ref={list} onKeyDown={onKeyDown} aria-describedby="mk-list-hint">
        <p id="mk-list-hint" className="mk-list__hint">Pick a company for a quick chart. In the list, the arrow keys move between companies.</p>
        {layers.map((layer) => (
          <section key={layer.id} id={`mk-layer-${layer.id}`} className="mk-layer" data-layer={layer.id} aria-labelledby={`mk-layer-${layer.id}-title`}>
            <div className="mk-layer__head">
              <h2 id={`mk-layer-${layer.id}-title`}>{layer.label}</h2>
              <p>{levelRange(layer)} · {layer.names} {layer.names === 1 ? "company" : "companies"}</p>
              <dl className="mk-layer__stats">
                <div><dt>Median day</dt><dd data-direction={direction(layer.medianChange)}>{formatPercent(layer.medianChange)}</dd></div>
                <div><dt>Median from 52w high</dt><dd>{formatPercent(layer.medianFromHigh, 1)}</dd></div>
                <div><dt>Today</dt><dd>{layer.up} up, {layer.down} down</dd></div>
              </dl>
            </div>
            <div className="mk-cols" aria-hidden="true">
              <span>Company</span><span>Price</span><span>Day</span><span>From high</span>
            </div>
            {layer.levels.map((level) => {
              const ranked = bottlenecksForLevel(level.level);
              return (
                <div key={level.level} id={`mk-level-${level.level}`} className="mk-group" data-level={level.level} role="group" aria-labelledby={`mk-level-${level.level}-title`}>
                  <h3 className="mk-group__title" id={`mk-level-${level.level}-title`}>
                    <span className="mk-level__number">Level {level.level}</span> <span className="mk-group__name">{level.areas.join(" · ")}</span>
                    {ranked.map((item) => (
                      <span key={item.id} className="mk-group__badge">
                        <span className="mk-sr">, bottleneck {item.name}: </span>
                        <TightnessBadge item={item} />
                      </span>
                    ))}
                  </h3>
                  <ul className="mk-rows">
                    {level.rows.map((row) => {
                      const key = rowKey(row);
                      const active = key === activeKey;
                      const current = selected && sameSymbol(row.symbol, selected.symbol);
                      return (
                        <StackRow
                          key={key}
                          row={row}
                          rowKey={key}
                          active={active}
                          also={Boolean(current) && !active}
                          showArea={level.areas.length > 1}
                          onClick={(link) => { remember(link); onChoose(row); }}
                          after={active && !wide ? <li className="mk-row-preview">{preview(true)}</li> : null}
                        />
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
        <p className="mk-note">
          Levels and groupings follow the tracker sheet, and a company can sit at more than one level. A dash means the sheet has
          no value (for example #N/A). Distances from the 52-week high are computed from the sheet's price and high. Bottleneck
          badges come from my notes' 2026 ranking (see Insights).
        </p>
      </div>
      {wide && <aside className="mk-preview-pane" aria-label="Preview">{preview(false)}</aside>}
    </div>
  );
}

type StackRowProps = {
  row: AiStackRow;
  rowKey: string;
  active: boolean;
  also: boolean;
  showArea: boolean;
  onClick: (link: HTMLElement) => void;
  after: ReactNode;
};

function StackRow({ row, rowKey: key, active, also, showArea, onClick, after }: StackRowProps) {
  const info = listing(row.symbol);
  const fromHigh = distance(row.price, row.high);
  return (
    <>
      <li className={`mk-row${active ? " is-selected" : ""}${also ? " is-also" : ""}`} data-symbol={row.symbol}>
        <Link
          to={{ search: marketsSearch({ symbol: row.symbol }) }}
          replace
          state={replaceHistoryState}
          data-labos-history="replace"
          data-row-key={key}
          aria-current={active ? "true" : undefined}
          tabIndex={active ? 0 : -1}
          onClick={(event) => onClick(event.currentTarget)}
        >
          <span className="mk-row__id">
            <span className="mk-row__symbol">{row.symbol}</span>
            {info.name && <span className="mk-row__name">{info.name}</span>}
            {showArea && row.area && <span className="mk-row__area">{row.area}</span>}
          </span>
          <span className="mk-row__num"><span className="mk-sr">, price </span>{formatPrice(row.price)}</span>
          <span className="mk-row__num" data-direction={direction(row.change)}><span className="mk-sr">, day </span>{formatPercent(row.change)}</span>
          <span className="mk-row__num mk-row__high"><span className="mk-sr">, from 52-week high </span>{formatPercent(fromHigh, 1)}</span>
        </Link>
      </li>
      {after}
    </>
  );
}

function placementsOf(row: AiStackRow, rows: AiStackRow[]) {
  return rows.filter((item) => sameSymbol(item.symbol, row.symbol));
}

function bottlenecksOf(placements: AiStackRow[]) {
  const seen = new Map<string, Bottleneck>();
  for (const item of placements) for (const ranked of bottlenecksForLevel(item.level)) seen.set(ranked.id, ranked);
  return [...seen.values()].sort((a, b) => a.rank - b.rank);
}

function Placements({ placements }: { placements: AiStackRow[] }) {
  return (
    <ul className="mk-placements" aria-label="Places in the stack">
      {placements.map((item) => (
        <li key={`${item.layer}-${item.level}-${item.area}`} data-layer={layerId(item.layer)}>
          {layerLabel(item.layer)} · Level {item.level}{item.area ? ` · ${item.area}` : ""}
        </li>
      ))}
    </ul>
  );
}

function Bottlenecks({ items }: { items: Bottleneck[] }) {
  if (!items.length) return null;
  return (
    <ul className="mk-bottlenecks" aria-label="Bottlenecks at its levels">
      {items.map((item) => (
        <li key={item.id}>
          <TightnessBadge item={item} />
          <span><strong>{item.name}.</strong> {item.reason}.</span>
        </li>
      ))}
    </ul>
  );
}

/* The quick look: a small chart, the sheet's key numbers, where the company sits, and the way to its full page. */
function Preview({ row, rows, inline }: { row: AiStackRow; rows: AiStackRow[]; inline: boolean }) {
  const info = listing(row.symbol);
  const placements = placementsOf(row, rows);
  const about = marketCompanies[row.symbol.toUpperCase()]?.about;
  const Heading = inline ? "h4" : "h2";
  const fromHigh = distance(row.price, row.high);

  return (
    <section className="mk-preview" aria-labelledby="mk-preview-title" data-layer={layerId(row.layer)}>
      <div className="mk-preview__head">
        <div>
          <p className="live-label">{info.ticker}</p>
          <Heading id="mk-preview-title" className="mk-preview__title">{info.name ?? row.symbol}</Heading>
        </div>
        <p className="mk-preview__price">
          <strong>{formatPrice(row.price)}</strong>
          {row.change !== null && <span data-direction={direction(row.change)}>{formatPercent(row.change)} today</span>}
        </p>
      </div>
      <TradingViewWidget
        key={info.ticker}
        widget="mini-symbol-overview"
        height={inline ? 220 : 280}
        href={info.href}
        label={`${row.symbol} chart`}
        attribution={`${row.symbol} chart`}
        config={{ symbol: info.ticker, locale: "en", dateRange: "12M", colorTheme: "light", isTransparent: true, autosize: true, width: "100%", height: "100%", chartOnly: false, noTimeScale: false }}
      />
      <p className="mk-preview__actions">
        <Link
          className="mk-button"
          to={{ search: marketsSearch({ symbol: row.symbol, full: true }) }}
          state={{ fromStack: true }}
          onClick={() => { stackScroll = window.scrollY; }}
        >
          Open full view<ArrowRight size={16} aria-hidden="true" />
        </Link>
        <span>Price and volume, financials, technicals, profile, and news</span>
      </p>
      <dl className="mk-stats mk-stats--compact">
        <div><dt>Market cap</dt><dd>{formatMarketCap(row.marketCap)}</dd></div>
        <div><dt>P/E</dt><dd>{formatRatio(row.pe)}</dd></div>
        <div><dt>Beta</dt><dd>{row.beta === null ? "—" : row.beta.toFixed(2)}</dd></div>
        <div><dt>From 52w high</dt><dd>{formatPercent(fromHigh, 1)}</dd></div>
        <div><dt>52-week range</dt><dd>{row.low === null || row.high === null ? "—" : `${formatPrice(row.low)} to ${formatPrice(row.high)}`}</dd></div>
      </dl>
      <Placements placements={placements} />
      <Bottlenecks items={bottlenecksOf(placements)} />
      {about && <p className="mk-preview__about">{about}</p>}
    </section>
  );
}

/* TradingView's chart, financials, technicals, profile, and news for one symbol. */
function CompanyPanels({ symbol, ticker, href }: { symbol: string; ticker: string; href: string }) {
  const widget = (name: string, config: Record<string, unknown>) => ({
    widget: name,
    href,
    config: { symbol: ticker, locale: "en", colorTheme: "light", isTransparent: true, width: "100%", height: "100%", ...config }
  });

  return (
    <>
      <section className="live-card" aria-labelledby="mk-chart-title">
        <h2 id="mk-chart-title" className="live-card__title">Price and volume</h2>
        <TradingViewWidget
          widget="advanced-chart"
          height={520}
          href={href}
          label={`${symbol} chart`}
          attribution={`${symbol} chart`}
          config={{
            autosize: true, symbol: ticker, interval: "D", timezone: "America/New_York", theme: "light", style: "1",
            locale: "en", allow_symbol_change: false, hide_volume: false, save_image: false, calendar: false,
            support_host: "https://www.tradingview.com"
          }}
        />
      </section>

      <div className="mk-grid">
        <section className="live-card" aria-labelledby="mk-financials-title">
          <h2 id="mk-financials-title" className="live-card__title">Financials</h2>
          <TradingViewWidget {...widget("financials", { displayMode: "regular" })} height={490} label={`${symbol} financials`} attribution={`${symbol} fundamentals`} />
        </section>
        <section className="live-card" aria-labelledby="mk-technicals-title">
          <h2 id="mk-technicals-title" className="live-card__title">Technicals</h2>
          <TradingViewWidget {...widget("technical-analysis", { interval: "1D", showIntervalTabs: true, displayMode: "single" })} height={490} label={`${symbol} technicals`} attribution={`${symbol} technical analysis`} />
        </section>
        <section className="live-card" aria-labelledby="mk-profile-title">
          <h2 id="mk-profile-title" className="live-card__title">Company profile</h2>
          <TradingViewWidget {...widget("symbol-profile", {})} height={420} label={`${symbol} profile`} attribution={`${symbol} profile`} />
        </section>
        <section className="live-card" aria-labelledby="mk-news-title">
          <h2 id="mk-news-title" className="live-card__title">News</h2>
          <TradingViewWidget {...widget("timeline", { feedMode: "symbol", displayMode: "regular" })} height={420} label={`${symbol} news`} attribution={`${symbol} news`} />
        </section>
      </div>
    </>
  );
}

/* The full company page: everything in the preview plus TradingView's financials, technicals, profile, and news. */
function FullView({ row, rows, heading, onBack }: { row: AiStackRow; rows: AiStackRow[]; heading: RefObject<HTMLHeadingElement>; onBack: () => void }) {
  const info = listing(row.symbol);
  const placements = placementsOf(row, rows);
  const about = marketCompanies[row.symbol.toUpperCase()]?.about;

  return (
    <section className="mk-main mk-detail" aria-labelledby="mk-quote-title">
      <p className="mk-detail__back">
        <button type="button" className="mk-button mk-button--quiet" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />Back to stack
        </button>
      </p>
      <div className="mk-quote">
        <div>
          <p className="live-label">{info.ticker}</p>
          <h2 id="mk-quote-title" ref={heading} tabIndex={-1}>{info.name ?? row.symbol}</h2>
          {about && <p className="mk-quote__about">{about}</p>}
          <Placements placements={placements} />
        </div>
        <div className="mk-quote__price">
          <strong>{formatPrice(row.price)}</strong>
          {row.change !== null && <span className="mk-quote__change" data-direction={direction(row.change)}>{formatPercent(row.change)} today</span>}
          <small>Price from the tracker sheet</small>
        </div>
      </div>

      <dl className="mk-stats">
        <div><dt>Market cap</dt><dd>{formatMarketCap(row.marketCap)}</dd></div>
        <div><dt>P/E</dt><dd>{formatRatio(row.pe)}</dd></div>
        <div><dt>EPS</dt><dd>{formatPrice(row.eps)}</dd></div>
        <div><dt>Beta</dt><dd>{row.beta === null ? "—" : row.beta.toFixed(2)}</dd></div>
        <div><dt>52-week range</dt><dd>{row.low === null || row.high === null ? "—" : `${formatPrice(row.low)} to ${formatPrice(row.high)}`}</dd></div>
        <div><dt>From 52w high</dt><dd>{formatPercent(distance(row.price, row.high), 1)}</dd></div>
        <div><dt>From 52w low</dt><dd>{formatPercent(distance(row.price, row.low), 1)}</dd></div>
      </dl>
      <Bottlenecks items={bottlenecksOf(placements)} />

      <CompanyPanels symbol={row.symbol} ticker={info.ticker} href={info.href} />
    </section>
  );
}

export default MarketsPage;
