#!/usr/bin/env node
/*
 * Writes src/content/generated/ai-stack.json from Sid's published AI / LLM Stack Tracker sheet, with the exchange rates
 * used to put foreign listings' figures in US dollars. The Markets page reads the same CSV live, converting at the
 * snapshot's rates and filling cells the sheet is still calculating from the snapshot, and falls back to the snapshot.
 * Google's published CSV can catch the sheet mid-calculation, so the sheet is read a few times and the most complete
 * read kept; cells still calculating keep the previous snapshot's values. When the fetch or validation fails, the
 * previous snapshot is kept and the script exits 0 so a deploy never breaks; it exits 1 only when no usable snapshot exists.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_STACK_CSV, AI_STACK_SHEET, FALLBACK_FX, MAX_PLAUSIBLE_MARKET_CAP_B, fillPending, parseAiStack } from "../src/content/aiStackSheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "src/content/generated/ai-stack.json");
const minRows = 20;
const sheetReads = 5;
const retryDelayMs = 3_000;
/* fawazahmed0/exchange-api (CC0, no key): daily rates, served from jsDelivr with a Cloudflare Pages mirror. */
const fxSources = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
  "https://latest.currency-api.pages.dev/v1/currencies/usd.json"
];

async function readPrevious() {
  try {
    return JSON.parse(await readFile(outFile, "utf8"));
  } catch {
    return undefined;
  }
}

/* A rate more than 3x off the built-in one is a bad response, not a market move. */
function checkedRates(perUsd) {
  const checked = {};
  for (const [code, fallback] of Object.entries(FALLBACK_FX.perUsd)) {
    const rate = Number(perUsd?.[code]);
    if (!(rate > fallback / 3 && rate < fallback * 3)) throw new Error(`implausible ${code} rate ${perUsd?.[code]}`);
    checked[code] = rate;
  }
  return checked;
}

/* Today's rates for converting foreign listings' market caps; else the previous snapshot's, else the built-in ones. */
async function fetchFx(previous) {
  for (const source of fxSources) {
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.date)) throw new Error("no date");
      const usd = body.usd ?? {};
      return { asOf: body.date, source, perUsd: checkedRates(Object.fromEntries(Object.keys(FALLBACK_FX.perUsd).map((code) => [code, usd[code.toLowerCase()]]))) };
    } catch (error) {
      console.warn(`ai-stack: no exchange rates from ${source} (${error.message})`);
    }
  }
  try {
    if (previous?.fx?.asOf > FALLBACK_FX.asOf) return { ...previous.fx, perUsd: checkedRates(previous.fx.perUsd) };
  } catch {
    /* The previous snapshot's rates are unusable too. */
  }
  return FALLBACK_FX;
}

const pendingCells = (rows) => rows.reduce((count, row) => count + (row.pending?.length ?? 0), 0);
const cellList = (rows, key) => rows.filter((row) => row[key]).map((row) => `${row.symbol} ${row[key].join("/")}`).join(", ");

/* Reads the sheet until a read has nothing still calculating, keeping the most complete of up to sheetReads reads. */
async function readSheet(fx) {
  let best;
  let failure;
  for (let read = 1; read <= sheetReads; read++) {
    try {
      const response = await fetch(AI_STACK_CSV, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = parseAiStack(await response.text(), fx);
      if (!best || pendingCells(rows) < pendingCells(best)) best = rows;
      if (!pendingCells(best)) break;
    } catch (error) {
      failure = error;
    }
    if (read < sheetReads) await new Promise((done) => setTimeout(done, retryDelayMs));
  }
  if (!best) throw failure;
  return best;
}

async function main() {
  const previous = await readPrevious();
  try {
    const fx = await fetchFx(previous);
    const rows = fillPending(await readSheet(fx), Array.isArray(previous?.rows) ? previous.rows : []);
    if (rows.length < minRows) throw new Error(`only ${rows.length} rows`);
    const priced = rows.filter((row) => row.price !== null).length;
    if (priced < rows.length / 2) throw new Error(`only ${priced} of ${rows.length} rows have a price`);
    const carried = cellList(rows, "carried");
    if (carried) console.warn(`ai-stack: still calculating after ${sheetReads} reads, so kept the previous snapshot's ${carried}`);
    const pending = cellList(rows, "pending");
    if (pending) console.warn(`ai-stack: still calculating and not in the previous snapshot, so left blank: ${pending}`);
    const converted = [...new Set(rows.filter((row) => row.marketCapCurrency || row.perShareCurrency).map((row) => `${row.symbol} (${row.marketCapCurrency ?? row.perShareCurrency})`))];
    if (converted.length) console.log(`ai-stack: figures converted to US dollars at ${fx.asOf} rates for ${converted.join(", ")}`);
    const rejected = [...new Set(rows.filter((row) => row.marketCapRejected).map((row) => row.symbol))];
    if (rejected.length) console.warn(`ai-stack: market cap not usable as US dollars (over $${MAX_PLAUSIBLE_MARKET_CAP_B}B or unknown currency) for ${rejected.join(", ")}`);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), sheet: AI_STACK_SHEET, source: AI_STACK_CSV, fx, rows }, null, 2)}\n`);
    console.log(`ai-stack: ${rows.length} rows (${priced} priced) -> ${outFile}`);
  } catch (error) {
    console.warn(`ai-stack: kept previous snapshot (${error.message})`);
    if (!Array.isArray(previous?.rows) || !previous.rows.length) {
      console.error(`ai-stack: no usable snapshot at ${outFile}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
