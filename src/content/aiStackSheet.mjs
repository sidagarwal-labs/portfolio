/*
 * Reads Sid's published AI / LLM Stack Tracker (a Google Sheet). Shared by scripts/fetch-ai-stack.mjs, which writes the
 * build-time snapshot, and the Markets page, which reads the live CSV; plain JS so Node can import it directly.
 */
const published = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiLfygL3LFE2X_ynXjE5IzIKrvVPT_AFSwuZCZn59pMUd0dsR4Tdpx-OUxaDmDiMYrioLurLWE3_CO";

export const AI_STACK_SHEET = `${published}/pubhtml`;
export const AI_STACK_CSV = `${published}/pub?output=csv`;

const columns = {
  symbol: "stock",
  area: "area",
  layer: "layer",
  level: "level",
  price: "price",
  marketCap: "mcap (b)",
  change: "daily price change",
  eps: "eps",
  pe: "price to earnings",
  beta: "beta",
  high: "52 week high",
  low: "52 week low"
};
const required = ["symbol", "layer", "level"];
const numeric = ["price", "marketCap", "change", "eps", "pe", "beta", "high", "low"];

/**
 * The largest market cap, in billions of US dollars, the parser accepts ($20T, several times the largest company
 * ever). A bigger figure can't be USD billions (for example a listing priced in won), so it is treated as missing.
 */
export const MAX_PLAUSIBLE_MARKET_CAP_B = 20_000;

/**
 * US listings (ADRs) whose price Google Finance gives in US dollars but whose market cap it gives in the home
 * market's currency. `shares` is the rough number of US-priced shares (ADR equivalents), in billions; it only has to
 * tell the two currencies apart, so it needn't be exact.
 */
export const FOREIGN_LISTINGS = {
  /* TSMC: about 25.9B common shares, 5 per ADR. */
  TSM: { currency: "TWD", shares: 5.2 },
  /* ASE Technology: about 4.4B common shares, 2 per ADR. */
  ASX: { currency: "TWD", shares: 2.2 },
  /* SK hynix: the sheet's earlier US-dollar figures ($584B at $129.06). */
  SKHY: { currency: "KRW", shares: 4.5 }
};

export const CURRENCY_NAMES = { TWD: "Taiwan dollars", KRW: "South Korean won" };

/** Units of each currency per US dollar, used when the build couldn't fetch current rates. */
export const FALLBACK_FX = { asOf: "2026-11-10", source: "fallback", perUsd: { TWD: 32.86, KRW: 1337 } };

/** RFC 4180 CSV: quoted fields may contain commas, doubled quotes, and line breaks. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

/** "$3,507" -> 3507 and "-4.32%" -> -4.32; blanks and sheet errors such as "#N/A" are missing (null), never 0. */
export function parseSheetNumber(value) {
  const text = String(value ?? "").trim();
  if (!text || text.startsWith("#")) return null;
  const number = Number(text.replace(/[$,%\s]/g, ""));
  return /\d/.test(text) && Number.isFinite(number) ? number : null;
}

/**
 * Puts a known foreign listing's market cap in US dollars. The sheet's figure is taken to be in the home currency when
 * the share count it implies (cap / price) is closer to the listing's share count times the exchange rate than to
 * the share count itself (on a log scale), so a figure the sheet already gives in dollars is left alone.
 */
function capInUsd(row, fx) {
  const listing = FOREIGN_LISTINGS[row.symbol.toUpperCase()];
  if (!listing || row.marketCap === null) return;
  const perUsd = fx?.perUsd?.[listing.currency];
  /* Without a price, the 52-week range stands in for it; it's well within the margin the check needs. */
  const price = row.price ?? (row.high !== null && row.low !== null ? Math.sqrt(row.high * row.low) : row.high ?? row.low);
  if (!(price > 0) || !(perUsd > 1)) {
    row.marketCap = null;
    row.marketCapRejected = true;
  } else if (row.marketCap / price / listing.shares > Math.sqrt(perUsd)) {
    row.marketCap = Math.round((row.marketCap / perUsd) * 100) / 100;
    row.marketCapCurrency = listing.currency;
  }
}

/**
 * Normalizes the sheet's CSV into one row per listing; throws when the expected columns or rows are missing. A known
 * foreign listing's market cap in its home currency is converted to US dollars at `fx` and flagged
 * marketCapCurrency. A market cap that is still above MAX_PLAUSIBLE_MARKET_CAP_B, or a foreign listing's cap whose
 * currency can't be told, becomes null and the row is flagged marketCapRejected.
 */
export function parseAiStack(text, fx = FALLBACK_FX) {
  const [header = [], ...lines] = parseCsv(text.replace(/^\uFEFF/, ""));
  const names = header.map((name) => name.trim().toLowerCase());
  const index = Object.fromEntries(Object.entries(columns).map(([key, name]) => [key, names.indexOf(name)]));
  const missing = required.filter((key) => index[key] < 0);
  if (missing.length) throw new Error(`missing column ${missing.map((key) => columns[key]).join(", ")}`);
  const cell = (line, key) => (index[key] < 0 ? "" : String(line[index[key]] ?? "").trim());
  const rows = [];
  for (const line of lines) {
    const symbol = cell(line, "symbol");
    const layer = cell(line, "layer").replace(/\s+/g, " ");
    const level = parseSheetNumber(cell(line, "level"));
    if (!symbol || !layer || !Number.isInteger(level)) continue;
    const row = { symbol, area: cell(line, "area").replace(/\s+/g, " "), layer, level };
    for (const key of numeric) row[key] = parseSheetNumber(cell(line, key));
    capInUsd(row, fx);
    if (row.marketCap !== null && row.marketCap > MAX_PLAUSIBLE_MARKET_CAP_B) {
      row.marketCap = null;
      row.marketCapRejected = true;
    }
    rows.push(row);
  }
  if (!rows.length) throw new Error("no rows");
  return rows;
}
