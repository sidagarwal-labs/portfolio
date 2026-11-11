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
 * Normalizes the sheet's CSV into one row per listing; throws when the expected columns or rows are missing. A market
 * cap above MAX_PLAUSIBLE_MARKET_CAP_B becomes null and the row is flagged marketCapRejected.
 */
export function parseAiStack(text) {
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
    if (row.marketCap !== null && row.marketCap > MAX_PLAUSIBLE_MARKET_CAP_B) {
      row.marketCap = null;
      row.marketCapRejected = true;
    }
    rows.push(row);
  }
  if (!rows.length) throw new Error("no rows");
  return rows;
}
