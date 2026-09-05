import { useEffect, useState } from "react";
import { marketSymbols } from "../content/journalContent";

export type StockQuote = {
  price: number;
  changePercent: number;
  quotedAt: number;
};

type QuoteState = {
  quotes: Record<string, StockQuote>;
  status: "loading" | "ready" | "cached" | "unavailable";
};

const cacheKey = "stock-quotes-v1";
const refreshInterval = 60_000;

function isQuote(value: unknown): value is StockQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as StockQuote;
  return Number.isFinite(quote.price) && quote.price > 0 &&
    Number.isFinite(quote.changePercent) && Number.isFinite(quote.quotedAt) && quote.quotedAt > 0;
}

function readCache(): { quotes: Record<string, StockQuote>; fetchedAt: number } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    if (!cached || !Number.isFinite(cached.fetchedAt) || !cached.quotes) return null;
    const quotes = Object.fromEntries(marketSymbols
      .filter((symbol) => isQuote(cached.quotes[symbol]))
      .map((symbol) => [symbol, cached.quotes[symbol] as StockQuote]));
    return Object.keys(quotes).length ? { quotes, fetchedAt: cached.fetchedAt } : null;
  } catch {
    return null;
  }
}

export function useStockQuotes() {
  const [state, setState] = useState<QuoteState>(() => {
    const cached = readCache();
    return { quotes: cached?.quotes ?? {}, status: cached ? "cached" : "loading" };
  });

  useEffect(() => {
    const apiKey = import.meta.env.VITE_FINNHUB_KEY;
    let active = true;
    let inFlight = false;
    let controller: AbortController | undefined;
    let cached = readCache();
    let lastAttempt = 0;

    async function refresh() {
      if (document.visibilityState === "hidden" || inFlight) return;
      if (!apiKey) {
        setState({ quotes: cached?.quotes ?? {}, status: cached ? "cached" : "unavailable" });
        return;
      }
      const now = Date.now();
      const age = now - (cached?.fetchedAt ?? 0);
      if ((cached && age >= 0 && age < refreshInterval) || now - lastAttempt < refreshInterval) return;

      lastAttempt = now;
      inFlight = true;
      controller = new AbortController();
      const request = controller;
      const timeout = window.setTimeout(() => request.abort(), 8_000);
      const quotes = { ...cached?.quotes };
      let received = 0;

      await Promise.all(marketSymbols.map(async (symbol) => {
        const url = new URL("https://finnhub.io/api/v1/quote");
        url.search = new URLSearchParams({ symbol, token: apiKey }).toString();
        try {
          const response = await fetch(url, { signal: request.signal });
          if (!response.ok) return;
          const data = await response.json();
          const quote = { price: data.c, changePercent: data.dp, quotedAt: data.t };
          if (isQuote(quote)) {
            quotes[symbol] = quote;
            received += 1;
          }
        } catch {
          return;
        }
      }));

      window.clearTimeout(timeout);
      inFlight = false;
      if (!active) return;
      setState({ quotes, status: received === marketSymbols.length ? "ready" : Object.keys(quotes).length ? "cached" : "unavailable" });
      if (!received) return;
      cached = { quotes, fetchedAt: Date.now() };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      } catch {
        return;
      }
    }

    const start = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, refreshInterval);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearTimeout(start);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      controller?.abort();
    };
  }, []);

  return state;
}