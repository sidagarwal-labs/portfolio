import { marketSymbols } from "../../content/journalContent";
import { useSpaceXLaunch } from "../../hooks/useSpaceXLaunch";
import { useStockQuotes } from "../../hooks/useStockQuotes";
import SpaceAndAISignals from "./SpaceAndAISignals";

const priceFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const quoteDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC"
});

function TickerTrack() {
  const { quotes, status } = useStockQuotes();
  const { launch, countdown } = useSpaceXLaunch();

  return (
    <div className="market-bar__viewport" role="region" aria-label="Stocks, space and AI ticker" tabIndex={0}>
      <div className="ticker-track" data-state={status}>
        {[false, true].map((duplicate) => (
          <ul className="ticker-track__group" key={String(duplicate)} aria-label={duplicate ? undefined : "Market and science updates"} aria-hidden={duplicate || undefined}>
            {marketSymbols.map((symbol) => {
              const quote = quotes[symbol];
              return (
                <li className="ticker-item ticker-item--stock" key={symbol}>
                  <a
                    href={`https://finance.yahoo.com/quote/${symbol}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={duplicate ? -1 : undefined}
                    title={quote ? `${status === "cached" ? "Cached " : ""}Finnhub quote as of ${quoteDateFormat.format(new Date(quote.quotedAt * 1000))} UTC. Prices may be delayed.` : `${symbol} quote unavailable`}
                  >
                    <span className="ticker-item__label">{symbol}</span>
                    <strong>{quote ? priceFormat.format(quote.price) : status === "loading" ? "Loading..." : "Unavailable"}</strong>
                    {quote && <span className={quote.changePercent >= 0 ? "ticker-change ticker-change--up" : "ticker-change ticker-change--down"}>{quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%</span>}
                  </a>
                </li>
              );
            })}
            <SpaceAndAISignals launch={launch} countdown={countdown} duplicate={duplicate} />
          </ul>
        ))}
      </div>
    </div>
  );
}

export default TickerTrack;