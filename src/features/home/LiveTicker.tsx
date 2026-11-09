import TickerTrack from "./TickerTrack";
import { useSiteView } from "../views/SiteViewContext";

function LiveTicker() {
  const { activeView } = useSiteView();
  if (activeView === "os") return null;
  return (
    <aside className="market-bar" aria-label="Market watch">
      <TickerTrack />
    </aside>
  );
}

export default LiveTicker;
