import TickerTrack from "./TickerTrack";

function LiveTicker() {
  return (
    <aside className="market-bar" aria-label="Market watch">
      <TickerTrack />
    </aside>
  );
}

export default LiveTicker;
