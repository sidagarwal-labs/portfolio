import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Link, Navigate, useLocation, useSearchParams, type To } from "react-router-dom";
import { marketCompanies } from "../../content/journalContent";
import {
  AI_STACK_SHEET, direction, distance, formatDay, formatMarketCap, formatPercent, formatPrice, formatRatio,
  formatTime, groupStack, layerId, layerLabel, listing, useAiStack, type AiStackRow, type AiStackState, type StackLayer
} from "./aiStack";
import LivePageShell from "./LivePageShell";
import { canonicalMarketsPath } from "./marketsPath";
import TradingViewWidget from "./TradingViewWidget";

const tradingView = <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>;

/* Markets is the AI stack. Old /markets?view=stack links land on the same company here, without a history entry. */
function MarketsPage() {
  const { pathname, search, hash } = useLocation();
  const path = `${pathname}${search}${hash}`;
  const current = canonicalMarketsPath(path);
  return current === path ? <StackView /> : <Navigate to={current} replace />;
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

const stackLink = (symbol?: string): To => ({ search: symbol ? `?symbol=${encodeURIComponent(symbol)}` : "" });

/* Where a price sits between its 52-week low (0) and high (100); drawn as a small range bar. */
function rangePosition(row: AiStackRow) {
  if (row.price === null || row.low === null || row.high === null || row.high <= row.low) return null;
  return Math.min(100, Math.max(0, ((row.price - row.low) / (row.high - row.low)) * 100));
}

function StackView() {
  const [params] = useSearchParams();
  const stack = useAiStack();
  const layers = useMemo(() => groupStack(stack.rows), [stack.rows]);
  const companies = useMemo(() => new Set(stack.rows.map((row) => row.symbol.toUpperCase())).size, [stack.rows]);
  const requested = params.get("symbol")?.trim().toUpperCase() ?? "";
  const selected = requested ? stack.rows.find((row) => row.symbol.toUpperCase() === requested) : undefined;
  const symbol = selected?.symbol;
  const heading = useRef<HTMLHeadingElement>(null);
  const tables = useRef<HTMLDivElement>(null);
  const previous = useRef(symbol);

  /* Picking a ticker moves focus (and the view) to its details; closing them returns focus to that ticker's row. */
  useEffect(() => {
    const last = previous.current;
    previous.current = symbol;
    if (symbol === last) return;
    if (symbol) heading.current?.focus();
    else if (last) tables.current?.querySelector<HTMLElement>(`tr[data-symbol="${CSS.escape(last)}"] a`)?.focus();
  }, [symbol]);

  return (
    <LivePageShell
      section="markets"
      title="Markets"
      documentTitle={symbol ? `${symbol} · Markets` : "Markets"}
      lede="My AI / LLM Stack Tracker: the public companies behind each layer of AI, from materials and chip design up through data centers, data platforms, and applications."
      sources={
        <p>
          Prices, market caps, P/E ratios, and 52-week ranges come from my{" "}
          <a href={AI_STACK_SHEET} target="_blank" rel="noopener noreferrer">AI / LLM Stack Tracker Google Sheet</a>, which uses Google
          Finance data delayed by up to 20 minutes. Charts, financials, technicals, profiles, and news are {tradingView} widgets.
          Nothing here is investment advice.
        </p>
      }
    >
      <p className="mk-status" data-source={stack.loading ? "loading" : stack.source} aria-live="polite">{stackStatus(stack)}</p>

      {selected && <StackDetail row={selected} rows={stack.rows} heading={heading} />}

      <section className="mk-summary" aria-labelledby="mk-summary-title">
        <div className="mk-summary__head">
          <h2 id="mk-summary-title">The stack at a glance</h2>
          <p>{companies} companies in {layers.length} layers. Medians count each company once per layer and skip missing values.</p>
        </div>
        <ol className="mk-summary__layers">
          {layers.map((layer) => {
            const counted = layer.up + layer.down;
            return (
              <li key={layer.id} data-layer={layer.id}>
                <h3><a href={`#mk-layer-${layer.id}`}>{layer.label}</a></h3>
                <p className="mk-summary__meta">{levelRange(layer)} · {layer.names} {layer.names === 1 ? "company" : "companies"}</p>
                <dl>
                  <div>
                    <dt>Median day</dt>
                    <dd data-direction={direction(layer.medianChange)}>{formatPercent(layer.medianChange)}</dd>
                  </div>
                  <div>
                    <dt>Median from 52w high</dt>
                    <dd>{formatPercent(layer.medianFromHigh, 1)}</dd>
                  </div>
                </dl>
                {counted > 0 && (
                  <div className="mk-breadth">
                    <span className="mk-breadth__bar" aria-hidden="true">
                      <i data-direction="up" style={{ flexGrow: layer.up }} />
                      <i data-direction="down" style={{ flexGrow: layer.down }} />
                    </span>
                    <span>{layer.up} up, {layer.down} down today</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div ref={tables}>
        {layers.map((layer) => (
          <section key={layer.id} id={`mk-layer-${layer.id}`} className="mk-layer" data-layer={layer.id}>
            <div className="mk-layer__head">
              <h2>{layer.label}</h2>
              <p>{levelRange(layer)} · {layer.names} {layer.names === 1 ? "company" : "companies"}</p>
            </div>
            <div className="mk-table-wrap" role="region" aria-label={`${layer.label} companies`} tabIndex={0}>
              <table className="mk-table">
                <caption className="mk-sr">
                  {layer.label} layer by level: price, daily move, market cap, P/E, and distance from the 52-week high and low
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Price</th>
                    <th scope="col">Day</th>
                    <th scope="col">Market cap</th>
                    <th scope="col">P/E</th>
                    <th scope="col">From 52w high</th>
                    <th scope="col">From 52w low</th>
                  </tr>
                </thead>
                {layer.levels.map((level) => (
                  <tbody key={level.level}>
                    <tr className="mk-level">
                      <th scope="rowgroup" colSpan={7}>
                        <span><span className="mk-level__number">Level {level.level}</span> {level.areas.join(" · ")}</span>
                      </th>
                    </tr>
                    {level.rows.map((row, index) => {
                      const info = listing(row.symbol);
                      const current = row.symbol === symbol;
                      const position = rangePosition(row);
                      return (
                        <tr key={`${row.symbol}-${index}`} data-symbol={row.symbol} className={current ? "is-selected" : undefined}>
                          <th scope="row">
                            <Link to={stackLink(row.symbol)} replace aria-current={current ? "true" : undefined}>
                              <span className="mk-row__symbol">{row.symbol}</span>
                              {info.name && <span className="mk-row__name">{info.name}</span>}
                            </Link>
                            {level.areas.length > 1 && <span className="mk-row__area">{row.area}</span>}
                          </th>
                          <td>{formatPrice(row.price)}</td>
                          <td data-direction={direction(row.change)}>{formatPercent(row.change)}</td>
                          <td>{formatMarketCap(row.marketCap)}</td>
                          <td>{formatRatio(row.pe)}</td>
                          <td className="mk-table__range">
                            {position !== null && <span className="mk-range" aria-hidden="true"><i style={{ left: `${position}%` }} /></span>}
                            {formatPercent(distance(row.price, row.high), 1)}
                          </td>
                          <td>{formatPercent(distance(row.price, row.low), 1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </section>
        ))}
      </div>

      <p className="mk-note">
        Levels and groupings follow the tracker sheet, and a company can sit at more than one level. A dash means the sheet has
        no value (for example #N/A). Distances from the 52-week high and low are computed from the sheet's price, high, and low;
        the bar shows where the price sits in that range.
      </p>
    </LivePageShell>
  );
}

function StackDetail({ row, rows, heading }: { row: AiStackRow; rows: AiStackRow[]; heading: RefObject<HTMLHeadingElement> }) {
  const info = listing(row.symbol);
  const placements = rows.filter((item) => item.symbol === row.symbol);
  const about = marketCompanies[row.symbol.toUpperCase()]?.about;

  return (
    <section className="mk-main mk-detail" aria-labelledby="mk-quote-title">
      <div className="mk-quote">
        <div>
          <p className="live-label">{info.ticker}</p>
          <h2 id="mk-quote-title" ref={heading} tabIndex={-1}>{info.name ?? row.symbol}</h2>
          {about && <p className="mk-quote__about">{about}</p>}
          <ul className="mk-placements" aria-label="Places in the stack">
            {placements.map((item) => (
              <li key={`${item.layer}-${item.level}-${item.area}`} data-layer={layerId(item.layer)}>
                {layerLabel(item.layer)} · Level {item.level}{item.area ? ` · ${item.area}` : ""}
              </li>
            ))}
          </ul>
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
      <p className="mk-detail__close"><Link to={stackLink()} replace>Back to the whole stack</Link></p>

      <CompanyPanels symbol={row.symbol} ticker={info.ticker} href={info.href} />
    </section>
  );
}

export default MarketsPage;
