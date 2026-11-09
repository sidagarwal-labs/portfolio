import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Paper = { id: string; title: string; snippet: string; grade: number; bm25Rank: number | null; rerankerRank: number | null };
type Round = { queryId: string; query: string; papers: Paper[]; start: string[]; bm25: string[]; reranker: string[]; ndcg5: { bm25: number; reranker: number; start: number } };
type System = { label: string; ndcg10: number; judgments: number };
type RankItData = {
  meta: { commit: string; site: string; siteQueryParam: string; judgments: { pairs: number; scale: Record<string, string> }; systems: { bm25: System; reranker: System } };
  rounds: Round[];
};

const data = JSON.parse(readFileSync(new URL("../../src/content/generated/rankit-arxiv.json", import.meta.url), "utf8")) as RankItData;
const grades = Object.keys(data.meta.judgments.scale).map(Number);
const maxGrade = Math.max(...grades);
const fmt = (value: number) => value.toFixed(3);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const milli = (value: number) => Math.round(value * 1000);

// Mirrors the game and the project's metrics.py: linear gain, log2(rank + 1) discount.
function ndcg(round: Round, ids: string[]) {
  const gradeOf = (id: string) => round.papers.find((paper) => paper.id === id)!.grade;
  const dcg = (values: number[]) => values.reduce((sum, grade, index) => sum + grade / Math.log2(index + 2), 0);
  return dcg(ids.map(gradeOf)) / dcg(ids.map(gradeOf).sort((a, b) => b - a));
}

function systemOrder(round: Round, key: "bm25Rank" | "rerankerRank") {
  return [...round.papers].sort((a, b) => {
    const [ra, rb] = [a[key] ?? Infinity, b[key] ?? Infinity];
    return ra === rb ? a.id.localeCompare(b.id) : ra - rb;
  }).map((paper) => paper.id);
}

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/api/v1/quote?*", (route) => route.fulfill({ json: { c: 230.36, dp: 0.84, t: 1788552000 } }));
  await page.route("https://api.github.com/repos/sidagarwal-labs/models/commits?*", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.3.0/launches/upcoming/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://ll.thespacedevs.com/2.3.0/launches/previous/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://s3.tradingview.com/**", (route) => route.abort());
  await page.route("https://datasets-server.huggingface.co/**", (route) => route.abort());
});

test("Rank It data is real, consistent, and fair", () => {
  const { meta, rounds } = data;
  expect(meta.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(meta.site).toBe("https://arxiv.agarwal-labs.com/");
  expect(meta.siteQueryParam).toBe("q");
  expect(grades).toEqual([0, 1, 2]);
  expect([meta.systems.bm25.ndcg10, meta.systems.bm25.judgments]).toEqual([0.5187, 3294]);
  expect([meta.systems.reranker.ndcg10, meta.systems.reranker.judgments]).toEqual([0.8418, 3678]);
  expect(meta.judgments.pairs).toBe(3678);
  expect(rounds.length).toBeGreaterThanOrEqual(5);
  expect(new Set(rounds.map((round) => round.queryId)).size).toBe(rounds.length);

  for (const round of rounds) {
    const ids = round.papers.map((paper) => paper.id);
    const sorted = [...ids].sort();
    expect(round.query.trim().length, round.queryId).toBeGreaterThan(10);
    expect(ids, round.queryId).toHaveLength(5);
    expect(new Set(ids).size, round.queryId).toBe(5);
    for (const paper of round.papers) {
      expect(paper.id).toMatch(/^\d{4}\.\d{4,5}$/);
      expect(paper.title.trim().length, paper.id).toBeGreaterThan(5);
      expect(paper.snippet.split(/\s+/).length, paper.id).toBeLessThanOrEqual(30);
      expect(Number.isInteger(paper.grade) && paper.grade >= 0 && paper.grade <= maxGrade, paper.id).toBe(true);
      expect(paper.bm25Rank !== null || paper.rerankerRank !== null, paper.id).toBe(true);
    }
    expect(round.papers.some((paper) => paper.grade === maxGrade), round.queryId).toBe(true);
    expect(round.papers.some((paper) => paper.grade === 0), round.queryId).toBe(true);
    for (const order of [round.start, round.bm25, round.reranker]) expect([...order].sort(), round.queryId).toEqual(sorted);
    expect(round.bm25, round.queryId).toEqual(systemOrder(round, "bm25Rank"));
    expect(round.reranker, round.queryId).toEqual(systemOrder(round, "rerankerRank"));
    expect(round.start, round.queryId).not.toEqual(round.bm25);
    expect(round.start, round.queryId).not.toEqual(round.reranker);
    expect(milli(ndcg(round, round.start)), `${round.queryId} start never wins`).toBeLessThanOrEqual(Math.min(milli(ndcg(round, round.bm25)), milli(ndcg(round, round.reranker))));
    expect(round.ndcg5.bm25, round.queryId).toBeCloseTo(ndcg(round, round.bm25), 4);
    expect(round.ndcg5.reranker, round.queryId).toBeCloseTo(ndcg(round, round.reranker), 4);
    expect(round.ndcg5.start, round.queryId).toBeCloseTo(ndcg(round, round.start), 4);
  }
  expect(rounds.some((round) => round.bm25.join() !== round.reranker.join())).toBe(true);
  expect(rounds.some((round) => ndcg(round, round.bm25) >= ndcg(round, round.reranker))).toBe(true);
});

async function sortByGrade(page: Page, round: Round) {
  const gradeOf = (id: string) => round.papers.find((paper) => paper.id === id)!.grade;
  for (let target = 0; target < round.papers.length; target += 1) {
    const ids = await page.locator(".rankit__doc").evaluateAll((items) => items.map((item) => item.getAttribute("data-doc")!));
    let best = target;
    for (let index = target + 1; index < ids.length; index += 1) if (gradeOf(ids[index]) > gradeOf(ids[best])) best = index;
    if (best === target) continue;
    await page.locator(`.rankit__doc[data-doc="${ids[best]}"] [data-dir="up"]`).focus();
    for (let step = 0; step < best - target; step += 1) await page.keyboard.press("ArrowUp");
    await expect(page.locator(".rankit__doc").nth(target)).toHaveAttribute("data-doc", ids[best]);
  }
}

test("Rank It plays every round against both systems with the keyboard", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.locator(".os-icons .os-icon", { hasText: "Games" }).click();
  await page.locator(".os-folder .os-icon", { hasText: "Rank It" }).click();

  const game = page.locator(".rankit");
  const docs = page.locator(".rankit__doc");
  await expect(game).not.toContainText(/illustrative/i);
  await expect(game.locator(".rankit__fine")).toContainText(`commit ${data.meta.commit.slice(0, 7)}`);
  await expect(game.locator(".rankit__fine")).toContainText("0.52 to 0.84");

  const played: { you: number; bm25: number; reranker: number }[] = [];
  for (const [index, round] of data.rounds.entries()) {
    await expect(game.locator(".rankit__hud")).toContainText(`Query ${index + 1} of ${data.rounds.length}`);
    await expect(game.locator(".rankit__query")).toHaveText(round.query);
    expect(await docs.evaluateAll((items) => items.map((item) => item.getAttribute("data-doc")))).toEqual(round.start);
    await expect(docs.first().locator('[data-dir="down"]')).toBeFocused();

    if (index === 0 || index === data.rounds.length - 1) {
      await sortByGrade(page, round);
    } else {
      await page.keyboard.press("ArrowDown");
      await expect(docs.nth(1)).toHaveAttribute("data-doc", round.start[0]);
    }
    const ids = await docs.evaluateAll((items) => items.map((item) => item.getAttribute("data-doc")!));
    await page.getByRole("button", { name: "Submit ranking" }).focus();
    await page.keyboard.press("Enter");

    const scores = { you: ndcg(round, ids), bm25: ndcg(round, round.bm25), reranker: ndcg(round, round.reranker) };
    played.push(scores);
    if (index === 0 || index === data.rounds.length - 1) expect(scores.you).toBe(1);
    await expect(game.locator(".rankit__result")).toBeFocused();
    await expect(game.locator(".rankit__score")).toContainText(/nDCG@5 [01]\.\d{3}/);
    await expect(game.locator(".rankit__score b")).toHaveText(fmt(scores.you));
    for (const [who, label, value] of [["you", "You", scores.you], ["bm25", "Keyword baseline (BM25)", scores.bm25], ["reranker", "AI reranker", scores.reranker]] as const) {
      const row = game.locator(`.rankit__vs[data-who="${who}"]`);
      await expect(row.locator("dt")).toHaveText(label);
      await expect(row.locator("b")).toHaveText(fmt(value));
    }

    const [y, b, r] = [milli(scores.you), milli(scores.bm25), milli(scores.reranker)];
    const winner = game.locator(".rankit__winner");
    if (y > b && y > r) await expect(winner).toHaveText("You beat both systems on this query.");
    else if (y < Math.max(b, r) && b !== r) await expect(winner).toContainText(b > r ? "The keyword baseline wins" : "The AI reranker wins");
    else await expect(winner).toContainText(/\byou\b/i);

    for (const paper of round.papers) {
      const doc = game.locator(`.rankit__doc[data-doc="${paper.id}"]`);
      await expect(doc).toHaveAttribute("data-grade", String(paper.grade));
      await expect(doc.locator(".rankit__grade")).toContainText(`${paper.grade} · ${data.meta.judgments.scale[paper.grade]}`);
      await expect(doc.locator("a.rankit__title")).toHaveAttribute("href", `https://arxiv.org/abs/${paper.id}`);
      await expect(doc.locator("a.rankit__title")).toHaveText(paper.title);
    }
    await expect(game.locator(".rankit__table tbody tr")).toHaveCount(5);
    await expect(game.getByRole("link", { name: "Try this query on arXiv Search" })).toHaveAttribute("href", `https://arxiv.agarwal-labs.com/?q=${encodeURIComponent(round.query)}`);

    const averages = { you: mean(played.map((s) => s.you)), bm25: mean(played.map((s) => s.bm25)), reranker: mean(played.map((s) => s.reranker)) };
    await expect(game.locator(".rankit__tally")).toHaveAttribute("aria-label", `Average nDCG@5 so far: you ${fmt(averages.you)}, keyword baseline ${fmt(averages.bm25)}, AI reranker ${fmt(averages.reranker)}`);

    if (index < data.rounds.length - 1) {
      await expect(game.locator(".rankit__final")).toHaveCount(0);
      await game.getByRole("button", { name: "Next query" }).focus();
      await page.keyboard.press("Enter");
    } else {
      const final = game.locator(".rankit__final");
      await expect(final).toContainText(`across ${data.rounds.length} queries`);
      await expect(final.locator(".rankit__final-scores")).toContainText(`You ${fmt(averages.you)}`);
      await expect(final.locator(".rankit__final-scores")).toContainText(`Keyword baseline (BM25) ${fmt(averages.bm25)}`);
      await expect(final.locator(".rankit__final-scores")).toContainText(`AI reranker ${fmt(averages.reranker)}`);
    }
  }

  await game.getByRole("button", { name: "Play again" }).click();
  await expect(game.locator(".rankit__hud")).toContainText(`Query 1 of ${data.rounds.length}`);
  await expect(game.locator(".rankit__tally")).toHaveCount(0);
  await expect(docs.first().locator('[data-dir="down"]')).toBeFocused();
  expect(errors).toEqual([]);
});

test("Rank It fits a phone screen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("./");
  await page.locator(".os-home__grid .os-icon", { hasText: "Rank It" }).click();
  await expect(page.locator(".rankit__doc")).toHaveCount(5);
  await page.getByRole("button", { name: "Submit ranking" }).click();
  await expect(page.locator(".rankit__score")).toContainText(`nDCG@5 ${fmt(data.rounds[0].ndcg5.start)}`);
  await expect(page.locator(".rankit__vs")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(await page.locator(".rankit").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
});
