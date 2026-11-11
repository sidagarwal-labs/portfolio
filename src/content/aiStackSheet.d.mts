export const AI_STACK_SHEET: string;
export const AI_STACK_CSV: string;
/** The largest market cap, in billions of US dollars, the parser accepts; anything above it is treated as missing. */
export const MAX_PLAUSIBLE_MARKET_CAP_B: number;

export type ForeignCurrency = "TWD" | "KRW";
/**
 * Listings whose figures the sheet may give in the home currency: the market cap, and for a home-quoted listing (with
 * `usdPrice`) the per-share figures too. `shares` is in billions of the shares the sheet prices; `usdPrice` is rough.
 */
export const FOREIGN_LISTINGS: Record<string, { currency: ForeignCurrency; shares: number; usdPrice?: number }>;
export const CURRENCY_NAMES: Record<ForeignCurrency, string>;

/** Exchange rates as units of each currency per US dollar, with the day they're from (YYYY-MM-DD). */
export interface FxRates {
  asOf: string;
  /** The URL the rates came from, or "fallback" for the parser's built-in rates. */
  source: string;
  perUsd: Record<ForeignCurrency, number>;
}
export const FALLBACK_FX: FxRates;

/** The sheet's numeric columns. */
export type AiStackField = "price" | "marketCap" | "change" | "eps" | "pe" | "beta" | "high" | "low";

/** One listing in the tracker. Missing sheet values (blank, #N/A) are null. */
export interface AiStackRow {
  symbol: string;
  area: string;
  layer: string;
  level: number;
  price: number | null;
  /** Billions of US dollars. */
  marketCap: number | null;
  /** Set when the sheet gave the market cap in this currency; marketCap is the figure converted to US dollars. */
  marketCapCurrency?: ForeignCurrency;
  /** Set when the sheet's market cap couldn't be used as US dollars (too large, or of unknown currency), so marketCap is null. */
  marketCapRejected?: true;
  /** Set when the sheet gave per-share figures (price, EPS, 52-week range) in this currency; they're converted to US dollars. */
  perShareCurrency?: ForeignCurrency;
  /** Fields the sheet was still calculating ("Loading...") when read, which are null. */
  pending?: AiStackField[];
  /** Fields the sheet was still calculating, filled from an earlier read by fillPending. */
  carried?: AiStackField[];
  /** Percent. */
  change: number | null;
  eps: number | null;
  pe: number | null;
  beta: number | null;
  high: number | null;
  low: number | null;
}

export function parseCsv(text: string): string[][];
export function parseSheetNumber(value: unknown): number | null;
export function parseAiStack(text: string, fx?: FxRates): AiStackRow[];
export function fillPending(rows: AiStackRow[], earlier?: AiStackRow[]): AiStackRow[];
