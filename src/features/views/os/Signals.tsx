import { createContext, useContext, type ReactNode } from "react";
import { ChartCandlestick, Rocket, Trophy } from "lucide-react";
import { useStockQuotes } from "../../../hooks/useStockQuotes";
import { useSpaceXLaunch } from "../../../hooks/useSpaceXLaunch";
import { formatDay, leaderboards } from "../../live/leaderboardData";
import type { AppId } from "./apps";
import "./signals.css";

type SignalsState = {
  stocks: ReturnType<typeof useStockQuotes>;
  space: ReturnType<typeof useSpaceXLaunch>;
};

const SignalsContext = createContext<SignalsState | null>(null);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const arenaTop = leaderboards.arena.boards.text_style_control?.[0];

/* One poller for the taskbar and phone home screen, however many places show the widgets. */
export function SignalsProvider({ children }: { children: ReactNode }) {
  const stocks = useStockQuotes();
  const space = useSpaceXLaunch();
  return <SignalsContext.Provider value={{ stocks, space }}>{children}</SignalsContext.Provider>;
}

function useSignals() {
  const value = useContext(SignalsContext);
  if (!value) throw new Error("Signals must be rendered inside SignalsProvider");
  return value;
}

/* Taskbar widgets; each opens its full app. */
export function SignalStatus({ open }: { open: (app: AppId) => void }) {
  const { stocks, space } = useSignals();
  const quote = stocks.quotes.NVDA;
  const leader = arenaTop?.model.replace(/\s*\(.*\)$/, "");
  return (
    <div className="os-signals" role="group" aria-label="Market, space and AI status">
      <button type="button" onClick={() => open("markets")} title={`NVDA ${quote ? money.format(quote.price) : "price unavailable"}. Open Markets.`} aria-label="Open Markets">
        <ChartCandlestick size={15} aria-hidden="true" />
        <span>NVDA {quote ? money.format(quote.price) : stocks.status === "loading" ? "..." : "Unavailable"}</span>
      </button>
      <button type="button" data-alert={space.launchingSoon || undefined} onClick={() => open("launches")} title={`SpaceX: ${space.countdown}. Open the launch tracker.`} aria-label="Open Launch Tracker">
        <Rocket size={15} aria-hidden="true" />
        <span>{space.launchingSoon ? space.countdown : "SpaceX"}</span>
        {space.launchingSoon && <span className="sr-only">Launching soon</span>}
      </button>
      <button
        type="button"
        onClick={() => open("leaderboards")}
        title={arenaTop ? `Arena Text #1 as of ${formatDay(leaderboards.arena.publishedAt)}: ${arenaTop.model}, ${Math.round(arenaTop.score)}. Open AI leaderboards.` : "Open AI leaderboards."}
        aria-label="Open AI Leaderboards"
      >
        <Trophy size={15} aria-hidden="true" />
        <span className="os-signals__model">{leader ?? "AI leaderboards"}</span>
      </button>
    </div>
  );
}
