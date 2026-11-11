#!/usr/bin/env node
/*
 * Writes src/content/generated/ai-stack.json from Sid's published AI / LLM Stack Tracker sheet. The Markets page
 * reads the same CSV live and falls back to this snapshot. When the fetch or validation fails, the previous
 * snapshot is kept and the script exits 0 so a deploy never breaks; it exits 1 only when no usable snapshot exists.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_STACK_CSV, AI_STACK_SHEET, MAX_PLAUSIBLE_MARKET_CAP_B, parseAiStack } from "../src/content/aiStackSheet.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "src/content/generated/ai-stack.json");
const minRows = 20;

async function readPrevious() {
  try {
    return JSON.parse(await readFile(outFile, "utf8"));
  } catch {
    return undefined;
  }
}

async function main() {
  const previous = await readPrevious();
  try {
    const response = await fetch(AI_STACK_CSV, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = parseAiStack(await response.text());
    if (rows.length < minRows) throw new Error(`only ${rows.length} rows`);
    const priced = rows.filter((row) => row.price !== null).length;
    if (priced < rows.length / 2) throw new Error(`only ${priced} of ${rows.length} rows have a price`);
    const rejected = [...new Set(rows.filter((row) => row.marketCapRejected).map((row) => row.symbol))];
    if (rejected.length) console.warn(`ai-stack: market cap over $${MAX_PLAUSIBLE_MARKET_CAP_B}B treated as missing for ${rejected.join(", ")}`);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), sheet: AI_STACK_SHEET, source: AI_STACK_CSV, rows }, null, 2)}\n`);
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
