import { useEffect, useRef, useState } from "react";

export type TickerItem = {
  symbol: string;
  value: string;
  variant: string;
  href?: string;
};

type StockState = { price: number; change: number };

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function formatPct(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

export function useLiveTickerData(): TickerItem[] {
  const [starshipCountdown, setStarshipCountdown] = useState("T-…");
  const launchDateRef = useRef<Date | null>(null);

  const [stocks, setStocks] = useState<Record<string, StockState>>({
    NVDA: { price: 0, change: 0 },
    MSFT: { price: 0, change: 0 },
    TSLA: { price: 0, change: 0 },
    AAPL: { price: 0, change: 0 },
    GOOGL: { price: 0, change: 0 },
    CRWV: { price: 0, change: 0 },
    MU: { price: 0, change: 0 },
  });

  const [ml, setMl] = useState({
    gpuUtil: 94.2,
    llmLatency: 42,
  });

  /* ── Stock prices via Finnhub (CORS-friendly, free tier) ── */
  useEffect(() => {
    let cancelled = false;
    const symbols = ["NVDA", "MSFT", "TSLA", "AAPL", "GOOGL", "CRWV", "MU"] as const;
    const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY || "";

    async function fetchQuotes() {
      if (!FINNHUB_KEY) return;
      for (const sym of symbols) {
        if (cancelled) break;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`,
            { signal: ctrl.signal }
          );
          clearTimeout(timer);
          if (!res.ok || cancelled) continue;
          const json = await res.json();
          /* Finnhub quote: c = current, pc = previous close, dp = percent change */
          if (json?.c && json?.pc) {
            const price = json.c as number;
            const change = json.dp as number;
            if (!cancelled) {
              setStocks((p) => ({ ...p, [sym]: { price, change } }));
            }
          }
        } catch {
          /* network error — skip this symbol */
        }
      }
    }

    fetchQuotes();
    const id = setInterval(fetchQuotes, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  /* ── SpaceX next launch via LL2 API (proxied in dev) ── */
  useEffect(() => {
    let cancelled = false;

    /* ── Cache strategy ──
       localStorage persists across sessions/tabs. We store the launch NET date
       plus a fetchedAt timestamp. If the cached date is still in the future AND
       we fetched it less than 2 hours ago, skip the network call entirely.
       This avoids burning through the LL2 free-tier rate limit (15 req/hr). */
    const CACHE_KEY = "spacex_launch";
    const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { net, fetchedAt } = JSON.parse(raw);
        const d = new Date(net);
        if (d.getTime() > Date.now() && Date.now() - fetchedAt < CACHE_TTL) {
          launchDateRef.current = d;
          return;
        }
      }
    } catch { /* corrupt cache — ignore */ }

    function persist(net: string) {
      launchDateRef.current = new Date(net);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ net, fetchedAt: Date.now() }));
    }

    /* ── Fetch with timeout helper ── */
    async function tryFetch(url: string): Promise<string | null> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        const json = await res.json();
        const net = json?.results?.[0]?.net;
        if (net && new Date(net).getTime() > Date.now()) return net;
      } catch { clearTimeout(timer); }
      return null;
    }

    /* ── Endpoint list — tried in order until one succeeds ──
       1. Vite dev-proxy → LL2 v2.2.0 (avoids CORS in dev)
       2. LL2 v2.2.0 direct (works when CORS headers are present)
       3. LL2 with provider filter (SpaceX provider id = 121)
       4. Broader "launch/upcoming" without search param           */
    const endpoints = [
      "/api/launches/2.2.0/launch/upcoming/?search=spacex&limit=1&ordering=net",
      "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?search=spacex&limit=1&ordering=net",
      "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?lsp__ids=121&limit=1&ordering=net",
      "/api/launches/2.2.0/launch/upcoming/?lsp__ids=121&limit=1&ordering=net",
    ];

    (async () => {
      for (const url of endpoints) {
        if (cancelled) return;
        const net = await tryFetch(url);
        if (net && !cancelled) { persist(net); return; }
      }
      /* All endpoints failed — no countdown shown this session. */
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Countdown every second ── */
  useEffect(() => {
    const id = setInterval(() => {
      const target = launchDateRef.current;
      if (!target) { setStarshipCountdown("T-…"); return; }
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setStarshipCountdown("LAUNCHED"); return; }
      const days = Math.floor(diff / 86400000);
      const hrs = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setStarshipCountdown(
        days > 0
          ? `T-${days}d ${String(hrs).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`
          : `T-${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── ML metric drift (cosmetic) ── */
  useEffect(() => {
    const id = setInterval(() => {
      setMl((p) => ({
        gpuUtil: Math.min(100, Math.max(80, p.gpuUtil + (Math.random() - 0.5) * 1.5)),
        llmLatency: Math.max(20, Math.min(80, p.llmLatency + (Math.random() - 0.5) * 3)),
      }));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const stockItems: TickerItem[] = (["NVDA", "MSFT", "TSLA", "AAPL", "GOOGL", "CRWV", "MU"] as const).map((sym) => {
    const s = stocks[sym];
    if (!s.price) return { symbol: sym, value: "—", variant: "data" };
    return {
      symbol: sym,
      value: `${formatPrice(s.price)} ${formatPct(s.change)}`,
      variant: s.change >= 0 ? "up" : "down",
    };
  });

  const extras: TickerItem[] = [
    { symbol: "GPU UTIL", value: `${ml.gpuUtil.toFixed(1)}%`, variant: "data" },
    { symbol: "LLM LATENCY", value: `${Math.round(ml.llmLatency)}ms`, variant: "fire" },
  ];

  /* Only show the SPACEX countdown when we have a real launch date */
  if (launchDateRef.current) {
    extras.push({
      symbol: "SPACEX",
      value: starshipCountdown,
      variant: "gold",
      href: "https://www.spacex.com/launches/",
    });
  }

  extras.push({ symbol: "MARS Δv", value: "3.6 km/s", variant: "neural" });

  return [...stockItems, ...extras];
}
