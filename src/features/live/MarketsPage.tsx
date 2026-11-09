import { Link, useSearchParams } from "react-router-dom";
import { marketCompanies, marketSymbols } from "../../content/journalContent";
import { useStockQuotes, type StockQuote } from "../../hooks/useStockQuotes";
import LivePageShell from "./LivePageShell";
import TradingViewWidget from "./TradingViewWidget";

const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const quoteTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

const change = (quote: StockQuote) => `${quote.changePercent > 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`;
const direction = (quote: StockQuote) => quote.changePercent > 0 ? "up" : quote.changePercent < 0 ? "down" : "flat";

const statusText = {
  loading: "Loading prices...",
  ready: "Prices from Finnhub, refreshed every minute while this page is open.",
  cached: "Showing the last saved prices.",
  unavailable: "Prices are unavailable here, but the TradingView charts still update."
};

function MarketsPage() {
  const [params] = useSearchParams();
  const requested = params.get("symbol")?.toUpperCase() ?? "";
  const symbol = marketSymbols.includes(requested) ? requested : marketSymbols[0];
  const company = marketCompanies[symbol];
  const ticker = `${company.exchange}:${symbol}`;
  const href = `https://www.tradingview.com/symbols/${company.exchange}-${symbol}/`;
  const { quotes, status } = useStockQuotes();
  const quote = quotes[symbol];

  const widget = (name: string, config: Record<string, unknown>) => ({
    widget: name,
    href,
    config: { symbol: ticker, locale: "en", colorTheme: "light", isTransparent: true, width: "100%", height: "100%", ...config }
  });

  return (
    <LivePageShell
      section="markets"
      title="Markets"
      documentTitle={`${symbol} · Markets`}
      lede="The AI infrastructure and platform companies I follow, with full charts, volume, financials, and news for each."
      sources={<p>Charts, financials, technicals, profiles, and news are <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a> widgets. Watchlist prices come from <a href="https://finnhub.io/" target="_blank" rel="noopener noreferrer">Finnhub</a>. Nothing here is investment advice.</p>}
    >
      <div className="mk-layout">
        <nav className="mk-watch" aria-label="Watchlist">
          <h2 className="live-label">Watchlist</h2>
          <ul>
            {marketSymbols.map((item) => {
              const itemQuote = quotes[item];
              return (
                <li key={item}>
                  <Link to={`?symbol=${item}`} replace aria-current={item === symbol ? "page" : undefined}>
                    <span className="mk-watch__symbol">{item}</span>
                    <span className="mk-watch__price">{itemQuote ? price.format(itemQuote.price) : "—"}</span>
                    <span className="mk-watch__name">{marketCompanies[item].name}</span>
                    <span className="mk-watch__change" data-direction={itemQuote ? direction(itemQuote) : undefined}>
                      {itemQuote ? change(itemQuote) : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mk-watch__status" aria-live="polite">{statusText[status]}</p>
        </nav>

        <div className="mk-main">
          <section className="mk-quote" aria-labelledby="mk-quote-title">
            <div>
              <p className="live-label">{ticker}</p>
              <h2 id="mk-quote-title">{company.name}</h2>
              <p className="mk-quote__about">{company.about}</p>
            </div>
            <div className="mk-quote__price">
              {quote ? (
                <>
                  <strong>{price.format(quote.price)}</strong>
                  <span className="mk-quote__change" data-direction={direction(quote)}>{change(quote)} today</span>
                  <small>As of {quoteTime.format(new Date(quote.quotedAt * 1000))} ET</small>
                </>
              ) : (
                <small>Live price is in the chart below.</small>
              )}
            </div>
          </section>

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
        </div>
      </div>
    </LivePageShell>
  );
}

export default MarketsPage;
