export const AI_STACK_SHEET: string;
export const AI_STACK_CSV: string;

/** One listing in the tracker. Missing sheet values (blank, #N/A) are null. */
export interface AiStackRow {
  symbol: string;
  area: string;
  layer: string;
  level: number;
  price: number | null;
  /** Billions of US dollars. */
  marketCap: number | null;
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
export function parseAiStack(text: string): AiStackRow[];
