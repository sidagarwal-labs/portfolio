import { useEffect, useState } from "react";
import snapshot from "../../content/generated/ai-stack.json";
import {
  AI_STACK_CSV, AI_STACK_SHEET, CURRENCY_NAMES, FALLBACK_FX, fillPending, parseAiStack, type AiStackRow, type FxRates
} from "../../content/aiStackSheet.mjs";

export { AI_STACK_SHEET, type AiStackRow, type FxRates };

type Snapshot = { generatedAt: string; sheet: string; source: string; fx?: FxRates; rows: AiStackRow[] };
const saved = snapshot as Snapshot;
/* A live read converts foreign listings' market caps at the rates fetched for the build-time snapshot. */
const fx = saved.fx ?? FALLBACK_FX;

export type AiStackState = { rows: AiStackRow[]; source: "live" | "snapshot"; asOf: string; loading: boolean; fx: FxRates };

const snapshotState: AiStackState = { rows: saved.rows, source: "snapshot", asOf: saved.generatedAt, loading: false, fx };
const liveTtl = 5 * 60_000;
/* The last good live read, so leaving Markets and coming back within a visit doesn't refetch or flash the snapshot. */
let live: { rows: AiStackRow[]; fetchedAt: number } | undefined;
const liveState = (read: NonNullable<typeof live>): AiStackState =>
  ({ rows: read.rows, source: "live", asOf: new Date(read.fetchedAt).toISOString(), loading: false, fx });

/* The published sheet's CSV allows cross-origin reads, so Markets reads it live and falls back to the
   build-time snapshot when the request fails, times out, or returns something that isn't the tracker. Cells the sheet
   is still calculating ("Loading...") show the snapshot's values. */
export function useAiStack(): AiStackState {
  const [state, setState] = useState<AiStackState>(() => (live ? liveState(live) : { ...snapshotState, loading: true }));

  useEffect(() => {
    if (live && Date.now() - live.fetchedAt < liveTtl) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    fetch(AI_STACK_CSV, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        live = { rows: fillPending(parseAiStack(text, fx), saved.rows), fetchedAt: Date.now() };
        if (active) setState(liveState(live));
      })
      .catch(() => {
        if (active) setState(live ? liveState(live) : snapshotState);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return state;
}

/* Exchanges checked against TradingView's symbol search; a ticker missing here charts by its bare symbol. */
const listings: Record<string, { name: string; exchange: string; symbol?: string }> = {
  MP: { name: "MP Materials", exchange: "NYSE" },
  GOOGL: { name: "Alphabet", exchange: "NASDAQ" },
  NVDA: { name: "NVIDIA", exchange: "NASDAQ" },
  AMD: { name: "AMD", exchange: "NASDAQ" },
  AVGO: { name: "Broadcom", exchange: "NASDAQ" },
  ARM: { name: "Arm Holdings", exchange: "NASDAQ" },
  MRVL: { name: "Marvell Technology", exchange: "NASDAQ" },
  LRCX: { name: "Lam Research", exchange: "NASDAQ" },
  ASML: { name: "ASML", exchange: "NASDAQ" },
  ONTO: { name: "Onto Innovation", exchange: "NYSE" },
  AMAT: { name: "Applied Materials", exchange: "NASDAQ" },
  TTMI: { name: "TTM Technologies", exchange: "NASDAQ" },
  AMKR: { name: "Amkor Technology", exchange: "NASDAQ" },
  ASX: { name: "ASE Technology", exchange: "NYSE" },
  BESIY: { name: "BE Semiconductor (Besi)", exchange: "OTC" },
  AEHR: { name: "Aehr Test Systems", exchange: "NASDAQ" },
  MU: { name: "Micron Technology", exchange: "NASDAQ" },
  SAMSUNG: { name: "Samsung Electronics", exchange: "KRX", symbol: "005930" },
  SKHY: { name: "SK hynix", exchange: "NASDAQ" },
  TSM: { name: "TSMC", exchange: "NYSE" },
  INTC: { name: "Intel", exchange: "NASDAQ" },
  TXN: { name: "Texas Instruments", exchange: "NASDAQ" },
  ETN: { name: "Eaton", exchange: "NYSE" },
  ADI: { name: "Analog Devices", exchange: "NASDAQ" },
  DY: { name: "Dycom Industries", exchange: "NYSE" },
  CEG: { name: "Constellation Energy", exchange: "NASDAQ" },
  GEV: { name: "GE Vernova", exchange: "NYSE" },
  VRT: { name: "Vertiv", exchange: "NYSE" },
  NVT: { name: "nVent Electric", exchange: "NYSE" },
  FN: { name: "Fabrinet", exchange: "NYSE" },
  ANET: { name: "Arista Networks", exchange: "NYSE" },
  LITE: { name: "Lumentum", exchange: "NASDAQ" },
  CIEN: { name: "Ciena", exchange: "NYSE" },
  CRDO: { name: "Credo Technology", exchange: "NASDAQ" },
  GLW: { name: "Corning", exchange: "NYSE" },
  COHR: { name: "Coherent", exchange: "NYSE" },
  ALAB: { name: "Astera Labs", exchange: "NASDAQ" },
  SNDK: { name: "Sandisk", exchange: "NASDAQ" },
  STX: { name: "Seagate Technology", exchange: "NASDAQ" },
  WDC: { name: "Western Digital", exchange: "NASDAQ" },
  APLD: { name: "Applied Digital", exchange: "NASDAQ" },
  NBIS: { name: "Nebius Group", exchange: "NASDAQ" },
  CRWV: { name: "CoreWeave", exchange: "NASDAQ" },
  DELL: { name: "Dell Technologies", exchange: "NYSE" },
  HPE: { name: "Hewlett Packard Enterprise", exchange: "NYSE" },
  AMZN: { name: "Amazon", exchange: "NASDAQ" },
  ORCL: { name: "Oracle", exchange: "NYSE" },
  SMCI: { name: "Super Micro Computer", exchange: "NASDAQ" },
  MSFT: { name: "Microsoft", exchange: "NASDAQ" },
  MDB: { name: "MongoDB", exchange: "NASDAQ" },
  DDOG: { name: "Datadog", exchange: "NASDAQ" },
  PLTR: { name: "Palantir", exchange: "NASDAQ" },
  SNOW: { name: "Snowflake", exchange: "NYSE" },
  RDDT: { name: "Reddit", exchange: "NYSE" },
  META: { name: "Meta Platforms", exchange: "NASDAQ" },
  TSLA: { name: "Tesla", exchange: "NASDAQ" },
  QCOM: { name: "Qualcomm", exchange: "NASDAQ" }
};

export type Listing = { name?: string; ticker: string; href: string };

/* TradingView needs EXCHANGE:SYMBOL; unknown tickers fall back to the bare symbol and TradingView's own lookup. */
export function listing(symbol: string): Listing {
  const known = listings[symbol.toUpperCase()];
  if (!known) return { ticker: symbol, href: `https://www.tradingview.com/symbols/${encodeURIComponent(symbol)}/` };
  const code = known.symbol ?? symbol.toUpperCase();
  return { name: known.name, ticker: `${known.exchange}:${code}`, href: `https://www.tradingview.com/symbols/${known.exchange}-${code}/` };
}

const layerOrder = ["chips", "data center", "data", "application"];

export type StackLevel = { level: number; areas: string[]; rows: AiStackRow[] };
export type StackLayer = {
  id: string;
  label: string;
  levels: StackLevel[];
  /* Unique companies in the layer (a ticker can sit at more than one level). */
  names: number;
  medianChange: number | null;
  medianFromHigh: number | null;
  up: number;
  down: number;
};

/* Distance from the 52-week high or low, in percent. Computed from the sheet's own price, high, and low so both
   columns mean the same thing (the sheet's "% from low" column is a ratio, not a distance). */
export function distance(price: number | null, extreme: number | null) {
  return price === null || extreme === null || extreme <= 0 ? null : (price / extreme - 1) * 100;
}

export function median(values: (number | null)[]) {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export const layerLabel = (layer: string) => {
  const text = layer.trim();
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

export const layerId = (layer: string) => layer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "layer";

/* Groups rows by layer (Chips, Data center, Data, Application, then anything new) and by level within a layer,
   keeping the sheet's row order inside each level. */
export function groupStack(rows: AiStackRow[]): StackLayer[] {
  const byLayer = new Map<string, AiStackRow[]>();
  for (const row of rows) {
    const key = row.layer.toLowerCase();
    byLayer.set(key, [...(byLayer.get(key) ?? []), row]);
  }
  const rank = (key: string, layerRows: AiStackRow[]) => {
    const known = layerOrder.indexOf(key);
    return known >= 0 ? known : layerOrder.length + Math.min(...layerRows.map((row) => row.level));
  };
  return [...byLayer.entries()]
    .sort(([a, aRows], [b, bRows]) => rank(a, aRows) - rank(b, bRows))
    .map(([key, layerRows]) => {
      const levels = new Map<number, AiStackRow[]>();
      for (const row of layerRows) levels.set(row.level, [...(levels.get(row.level) ?? []), row]);
      const unique = [...new Map(layerRows.map((row) => [row.symbol.toUpperCase(), row])).values()];
      return {
        id: layerId(key),
        label: layerLabel(layerRows[0].layer),
        levels: [...levels.entries()]
          .sort(([a], [b]) => a - b)
          .map(([level, levelRows]) => ({ level, areas: [...new Set(levelRows.map((row) => row.area).filter(Boolean))], rows: levelRows })),
        names: unique.length,
        medianChange: median(unique.map((row) => row.change)),
        medianFromHigh: median(unique.map((row) => distance(row.price, row.high))),
        up: unique.filter((row) => row.change !== null && row.change > 0).length,
        down: unique.filter((row) => row.change !== null && row.change < 0).length
      };
    });
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dash = "—";

export const formatPrice = (value: number | null) => (value === null ? dash : usd.format(value));
export const formatPercent = (value: number | null, digits = 2) =>
  value === null ? dash : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
export const formatRatio = (value: number | null) => (value === null ? dash : value.toFixed(1));

/* The sheet lists market cap in billions of dollars. */
export function formatMarketCap(billions: number | null) {
  if (billions === null) return dash;
  if (Math.abs(billions) >= 1000) return `$${(billions / 1000).toFixed(2)}T`;
  return `$${billions >= 100 ? Math.round(billions) : Number(billions.toFixed(1))}B`;
}

/* "Nov 10, 2026" for a rates day (YYYY-MM-DD), the same calendar day in every time zone. */
const ratesDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const formatRatesDay = (fx: FxRates) => ratesDay.format(new Date(`${fx.asOf}T12:00:00Z`));

/* "converted from Taiwan dollars" for a market cap the sheet gave in a foreign currency. */
export const conversionNote = (row: AiStackRow) =>
  row.marketCapCurrency && row.marketCap !== null ? `converted from ${CURRENCY_NAMES[row.marketCapCurrency]}` : undefined;

/* "Per-share figures converted from South Korean won" for a price, EPS, or 52-week range the sheet gave in won. */
export const perShareNote = (row: AiStackRow) =>
  row.perShareCurrency ? `Per-share figures converted from ${CURRENCY_NAMES[row.perShareCurrency]}` : undefined;

const listOf = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0]);

/* "Market caps converted to US dollars at Nov 10, 2026 exchange rates: TSM and ASX from Taiwan dollars, SKHY from South Korean won." */
export function conversionsNote(rows: AiStackRow[], fx: FxRates) {
  const byCurrency = new Map<NonNullable<AiStackRow["marketCapCurrency"]>, string[]>();
  for (const row of rows) {
    if (!row.marketCapCurrency || row.marketCap === null) continue;
    const symbols = byCurrency.get(row.marketCapCurrency) ?? [];
    if (!symbols.includes(row.symbol)) symbols.push(row.symbol);
    byCurrency.set(row.marketCapCurrency, symbols);
  }
  if (!byCurrency.size) return undefined;
  const parts = [...byCurrency].map(([currency, symbols]) => `${listOf(symbols)} from ${CURRENCY_NAMES[currency]}`);
  return `Market caps converted to US dollars at ${formatRatesDay(fx)} exchange rates: ${parts.join(", ")}.`;
}

/* Names the companies with figures a live read caught the sheet still calculating. */
export function calculatingNote(rows: AiStackRow[]) {
  const symbols = [...new Set(rows.filter((row) => row.pending || row.carried).map((row) => row.symbol))];
  if (!symbols.length) return undefined;
  return `The sheet was still calculating some figures for ${listOf(symbols)}; the saved snapshot's values stand in where it has them.`;
}

export const direction = (value: number | null) =>
  value === null ? undefined : value > 0 ? "up" : value < 0 ? "down" : "flat";

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export const formatDay = (iso: string) => dayFormat.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
