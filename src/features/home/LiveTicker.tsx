import { useState } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import TickerTrack from "./TickerTrack";

function LiveTicker() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [preference, setPreference] = useState<boolean | null>(() => {
    try {
      const stored = localStorage.getItem("market-ticker");
      return stored === "on" ? true : stored === "off" ? false : null;
    } catch {
      return null;
    }
  });
  const enabled = preference ?? !prefersReducedMotion;

  function toggleTicker(checked: boolean) {
    setPreference(checked);
    try {
      localStorage.setItem("market-ticker", checked ? "on" : "off");
    } catch {
      return;
    }
  }

  return (
    <aside className="market-bar" aria-label="Market watch">
      {enabled ? <TickerTrack /> : <span className="market-bar__idle">Market watch</span>}
      <label className="market-bar__toggle">
        <input type="checkbox" checked={enabled} onChange={(event) => toggleTicker(event.target.checked)} aria-label="Show market ticker" />
        Ticker
      </label>
    </aside>
  );
}

export default LiveTicker;
