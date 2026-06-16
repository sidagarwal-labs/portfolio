import { useLiveTickerData } from "../../hooks/useLiveTickerData";

/**
 * Isolated ticker component. It owns the live-data hook so the per-second
 * countdown and periodic metric drift only re-render this small strip,
 * not the whole HomePage (and the 3D Canvas subtree alongside it).
 */
function LiveTicker() {
  const tickerItems = useLiveTickerData();

  return (
    <div className="stock-ticker" aria-hidden="true">
      <div className="stock-ticker__track">
        {[...tickerItems, ...tickerItems].map((item, i) =>
          item.href ? (
            <a key={i} className={`stock-ticker__item stock-ticker__item--${item.variant}`} href={item.href} target="_blank" rel="noreferrer">
              {item.symbol} <strong>{item.value}</strong>
            </a>
          ) : (
            <span key={i} className={`stock-ticker__item stock-ticker__item--${item.variant}`}>
              {item.symbol} <strong>{item.value}</strong>
            </span>
          )
        )}
      </div>
    </div>
  );
}

export default LiveTicker;
