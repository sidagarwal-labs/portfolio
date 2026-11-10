#!/usr/bin/env node
/*
 * Writes src/content/generated/github-insights.json: the site owner's full-year GitHub activity and all-time commit counts
 * per repository (GraphQL), shown by the Lab OS GitHub app without any runtime API call. Requires GITHUB_TOKEN or GH_TOKEN.
 * Without a token, or when the fetch or validation fails, the previous snapshot is kept and the script exits 0
 * so a deploy never breaks; it exits 1 only when no usable snapshot exists afterwards (the build needs one).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INSIGHTS_VERSION, normalizeGraphql, queryAllTimeCommits, queryInsights } from "../workers/github-proxy/src/insights.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = resolve(root, "src/content/generated/github-insights.json");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Throws when the snapshot breaks the contract or names any repository GitHub reported as private. */
export function validateSnapshot(insights, { login, privateNames = [] } = {}) {
  const fail = (message) => { throw new Error(`invalid snapshot: ${message}`); };
  if (insights?.version !== INSIGHTS_VERSION) fail(`version ${insights?.version}`);
  if (insights.source !== "graphql") fail(`source ${insights.source}`);
  if (login && insights.login.toLowerCase() !== login.toLowerCase()) fail(`login ${insights.login}`);
  const { days, range } = insights;
  if (!Array.isArray(days) || days.length < 365 || days.length > 372) fail(`${days?.length} days`);
  if (days[0].date !== range.from || days.at(-1).date !== range.to) fail("range does not match days");
  days.forEach((day, i) => {
    if (!DATE.test(day.date) || !Number.isInteger(day.count) || day.count < 0) fail(`day ${JSON.stringify(day)}`);
    if (i && day.date !== nextDay(days[i - 1].date)) fail(`gap before ${day.date}`);
  });
  for (const repo of insights.repos) {
    if (repo.activity.some((day, i, all) => day.date < range.from || day.date > range.to || (i && day.date <= all[i - 1].date))) {
      fail(`activity for ${repo.nameWithOwner}`);
    }
    if (repo.allTimeCommits !== undefined && !(Number.isInteger(repo.allTimeCommits) && repo.allTimeCommits >= 0)) {
      fail(`allTimeCommits for ${repo.nameWithOwner}`);
    }
  }
  const serialized = JSON.stringify(insights);
  for (const name of privateNames) if (serialized.includes(name)) fail("contains a private repository");
  return insights;
}

/** nameWithOwner of every private repository in the raw GraphQL data. */
function privateRepoNames(data) {
  const collection = data.user.contributionsCollection;
  return [...(collection?.commitContributionsByRepository ?? []).map((entry) => entry.repository), ...(data.user.repositories?.nodes ?? [])]
    .filter((repo) => repo && repo.isPrivate !== false)
    .map((repo) => repo.nameWithOwner);
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(outFile, "utf8"));
  } catch {
    return undefined;
  }
}

async function main() {
  const login = process.env.GITHUB_INSIGHTS_LOGIN || "sidagarwal-labs";
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const previous = await readPrevious();
  const keepPrevious = (reason) => {
    console.warn(`github: kept previous snapshot (${reason})`);
    if (previous?.version !== INSIGHTS_VERSION) {
      console.error(`github: no usable snapshot at ${outFile}; run with GITHUB_TOKEN set`);
      process.exitCode = 1;
    }
  };
  if (!token) return keepPrevious("GITHUB_TOKEN/GH_TOKEN not set");
  try {
    const data = await queryInsights(login, { token });
    // Optional field: a failure here still writes the fresh calendar, just without all-time counts.
    const allTimeCommits = await queryAllTimeCommits(data, { token }).catch((error) => {
      console.warn(`github: all-time commit counts left out (${error.message})`);
      return new Map();
    });
    const insights = validateSnapshot(normalizeGraphql(data, { allTimeCommits }), { login, privateNames: privateRepoNames(data) });
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, `${JSON.stringify(insights, null, 2)}\n`);
    const { totals, days, repos } = insights;
    const counted = repos.filter((repo) => repo.allTimeCommits !== undefined).length;
    console.log(
      `github: ${insights.login} ${totals.contributions} contributions, ${days.length} days, ${repos.length} repos (${counted} with all-time commits) -> ${outFile}`
    );
  } catch (error) {
    keepPrevious(error.message);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
