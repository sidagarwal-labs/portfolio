import { readFileSync } from "node:fs";
import { expect, test, type Page, type Worker } from "@playwright/test";

type Token = { id: number; text: string; logit: number };
type Prompt = { text: string; note: string; tokens: number; top: Token[]; lse: number[]; rest: number[]; choices: number[] };
type NextTokenData = {
  meta: {
    model: string; baseModel: string; revision: string; dtype: string; license: string; files: { path: string; bytes: number }[];
    downloadBytes: number; runtime: string; vocabSize: number; topK: number; temperatures: number[]; generated: string; script: string; note: string;
  };
  prompts: Prompt[];
};

const data = JSON.parse(readFileSync(new URL("../../src/content/generated/next-token.json", import.meta.url), "utf8")) as NextTokenData;
const { meta, prompts } = data;
const tIndex = (temperature: number) => meta.temperatures.findIndex((value) => Math.abs(value - temperature) < 1e-6);
const prob = (prompt: Prompt, rank: number, temperature: number) => Math.exp(prompt.top[rank].logit / temperature - prompt.lse[tIndex(temperature)]);
const otherProb = (prompt: Prompt, temperature: number) => Math.exp(prompt.rest[tIndex(temperature)] - prompt.lse[tIndex(temperature)]);
// Same formatting as the game: one decimal, with <0.1% and >99.9% at the edges.
const percent = (value: number) => {
  const pct = value * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  if (pct >= 99.95 && pct < 100) return ">99.9%";
  return `${pct.toFixed(1)}%`;
};
const shown = (text: string) => text.replace(/ /g, "␣").replace(/\n/g, "↵").replace(/\t/g, "⇥");
const pctValue = (text: string) => (text.startsWith("<") ? 0.05 : text.startsWith(">") ? 99.95 : Number.parseFloat(text));

// Never download the real model: abort every model and runtime host, at the context level so worker requests are covered too.
const MODEL_HOSTS = ["**/huggingface.co/**", "**/*.huggingface.co/**", "**/hf.co/**", "**/*.hf.co/**", "**/cdn.jsdelivr.net/**"];

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/api/v1/quote?*", (route) => route.fulfill({ json: { c: 230.36, dp: 0.84, t: 1788552000 } }));
  await page.route("https://api.github.com/repos/sidagarwal-labs/models/commits?*", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.3.0/launches/upcoming/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://ll.thespacedevs.com/2.3.0/launches/previous/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://s3.tradingview.com/**", (route) => route.abort());
  for (const host of MODEL_HOSTS) await page.context().route(host, (route) => route.abort("internetdisconnected"));
});

async function openNextToken(page: Page, width = 1440) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 600 ? 760 : 900 });
  await page.goto("./");
  if (width < 600) await page.locator(".os-home .os-icon", { hasText: "Next Token" }).click();
  else {
    await page.locator(".os-icons .os-icon", { hasText: "Games" }).click();
    await page.locator(".os-folder .os-icon", { hasText: "Next Token" }).click();
  }
  return page.locator(".nexttoken");
}

async function barPercents(page: Page) {
  return (await page.locator(".nexttoken__bar .nexttoken__pct").allTextContents()).map(pctValue);
}

test("next-token data is exact full-vocabulary softmax output from a pinned SmolLM2 revision", () => {
  expect(meta.model).toBe("onnx-community/SmolLM2-135M-ONNX");
  expect(meta.baseModel).toBe("HuggingFaceTB/SmolLM2-135M");
  expect(meta.revision).toMatch(/^[0-9a-f]{40}$/);
  expect(meta.dtype).toBe("q4f16");
  expect(meta.license).toBe("Apache-2.0");
  expect(meta.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(readFileSync(new URL(`../../${meta.script}`, import.meta.url), "utf8")).toContain(meta.revision);
  expect(meta.files.map((file) => file.path)).toEqual(expect.arrayContaining(["tokenizer.json", "onnx/model_q4f16.onnx", "onnx/model_q4f16.onnx_data"]));
  expect(meta.downloadBytes).toBe(meta.files.reduce((sum, file) => sum + file.bytes, 0));
  expect(meta.vocabSize).toBe(49152);
  expect(meta.temperatures).toHaveLength(19);
  expect(meta.temperatures[0]).toBeCloseTo(0.2, 10);
  expect(meta.temperatures.at(-1)).toBeCloseTo(2, 10);
  expect(prompts.length).toBeGreaterThanOrEqual(6);
  expect(prompts.length).toBeLessThanOrEqual(8);
  // The answer must not always sit in the first slot.
  expect(prompts.some((prompt) => prompt.choices[0] !== 0)).toBe(true);

  for (const prompt of prompts) {
    expect(prompt.top, prompt.text).toHaveLength(meta.topK);
    expect(prompt.lse).toHaveLength(meta.temperatures.length);
    expect(prompt.rest).toHaveLength(meta.temperatures.length);
    expect(new Set(prompt.top.map((token) => token.id)).size).toBe(meta.topK);
    for (const token of prompt.top) expect(token.id >= 0 && token.id < meta.vocabSize).toBe(true);
    for (let rank = 1; rank < prompt.top.length; rank += 1) expect(prompt.top[rank].logit).toBeLessThanOrEqual(prompt.top[rank - 1].logit);
    expect(prompt.choices).toHaveLength(5);
    expect(new Set(prompt.choices).size).toBe(5);
    expect(prompt.choices).toContain(0);
    for (const rank of prompt.choices) expect(rank >= 0 && rank < meta.topK).toBe(true);

    for (const temperature of [0.2, 0.5, 1, 1.5, 2]) {
      const top = prompt.top.map((_, rank) => prob(prompt, rank, temperature));
      const other = otherProb(prompt, temperature);
      for (const value of [...top, other]) expect(value > 0 && value <= 1, `${prompt.text} at T=${temperature}`).toBe(true);
      // Top 8 plus "all other tokens" is the whole vocabulary, so it must sum to 1 (lse is stored to 6 decimals).
      expect(Math.abs(top.reduce((sum, value) => sum + value, 0) + other - 1)).toBeLessThan(5e-6);
    }
    expect(prob(prompt, 0, 0.2)).toBeGreaterThan(prob(prompt, 0, 2));
  }
});

test("Next Token plays real precomputed predictions, with a temperature slider and an honest remainder bar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const game = await openNextToken(page);
  const first = prompts[0];
  const group = page.getByRole("group", { name: "Next token choices" });
  const choices = group.getByRole("button");
  await expect(choices).toHaveCount(5);
  await expect(choices).toHaveText(first.choices.map((rank) => shown(first.top[rank].text)));
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choices.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await expect(choices.nth(4)).toBeFocused();
  const fine = game.getByRole("tabpanel", { name: "Real predictions" }).locator(".game__fine");
  await expect(fine).toContainText("Real next-token probabilities from SmolLM2-135M (Hugging Face, Apache 2.0), computed ahead of time.");
  await expect(fine).toContainText(meta.revision.slice(0, 7));
  await expect(game).not.toContainText(/toy logits|written by hand/i);

  // Pick the model's actual top-1 token.
  await choices.nth(first.choices.indexOf(0)).click();
  await expect(game.locator(".game__status").first()).toHaveText(`You matched the model's top token. It gave your pick ${percent(prob(first, 0, 1))} at T = 1.`);
  await expect(game.locator(".game__hud")).toContainText("Top-1 1/1");
  await expect(game.locator(".nexttoken__prompt mark")).toHaveText(first.top[0].text);

  const bars = page.locator(".nexttoken__bar");
  await expect(bars).toHaveCount(meta.topK);
  await expect(bars.locator(".nexttoken__token")).toHaveText(first.top.map((token) => shown(token.text)));
  await expect(bars.locator(".nexttoken__pct")).toHaveText(first.top.map((_, rank) => percent(prob(first, rank, 1))));
  const other = game.locator(".nexttoken__other");
  await expect(other).toHaveAttribute("aria-label", `All other ${(meta.vocabSize - meta.topK).toLocaleString("en-US")} tokens combined: ${percent(otherProb(first, 1))}`);
  let values = await barPercents(page);
  expect(values).toEqual([...values].sort((a, b) => b - a));
  const total = values.reduce((sum, value) => sum + value, 0) + pctValue(await other.locator(".nexttoken__pct").innerText());
  expect(Math.abs(total - 100)).toBeLessThan(0.5);

  // Five steps left on the slider is T = 0.5, which sharpens the distribution.
  const slider = game.getByRole("slider", { name: /Temperature/ });
  await slider.focus();
  for (let step = 0; step < 5; step += 1) await page.keyboard.press("ArrowLeft");
  await expect(game.locator(".nexttoken__temp b")).toHaveText("0.5");
  await expect(bars.locator(".nexttoken__pct")).toHaveText(first.top.map((_, rank) => percent(prob(first, rank, 0.5))));
  await expect(other.locator(".nexttoken__pct")).toHaveText(percent(otherProb(first, 0.5)));
  values = await barPercents(page);
  expect(values).toEqual([...values].sort((a, b) => b - a));
  expect(values[0]).toBeGreaterThan(pctValue(percent(prob(first, 0, 1))));

  // Play the rest with the keyboard, always taking the first choice.
  for (let index = 1; index < prompts.length; index += 1) {
    await game.getByRole("button", { name: "Next prompt" }).click();
    await expect(game.locator(".game__hud")).toContainText(`Prompt ${index + 1} of ${prompts.length}`);
    await expect(choices.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(bars).toHaveCount(meta.topK);
    await expect(bars.first().locator(".nexttoken__token")).toHaveText(shown(prompts[index].top[0].text));
  }
  const matches = 1 + prompts.slice(1).filter((prompt) => prompt.choices[0] === 0).length;
  await expect(game.locator(".game__hud")).toContainText(`Top-1 ${matches}/${prompts.length}`);
  await expect(game).toContainText(`Final: ${matches} of ${prompts.length} top-1 matches`);
  await game.getByRole("button", { name: "Play again" }).click();
  await expect(game.locator(".game__hud")).toContainText(`Prompt 1 of ${prompts.length}`);
  await expect(choices.first()).toBeFocused();
  expect(errors).toEqual([]);
});

test("Next Token fits a phone screen", async ({ page }) => {
  const game = await openNextToken(page, 390);
  await page.getByRole("group", { name: "Next token choices" }).getByRole("button").first().click();
  await expect(page.locator(".nexttoken__bar")).toHaveCount(meta.topK);
  await expect(game.locator(".nexttoken__other")).toBeVisible();
  expect(await game.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  await game.getByRole("tab", { name: "Try it live" }).click();
  await expect(game.getByRole("button", { name: /^Load model \(~\d+ MB\)$/ })).toBeVisible();
  expect(await game.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
});

test("Try it live downloads nothing until asked, can cancel, and fails clearly when model hosts are blocked", async ({ page }) => {
  const errors: string[] = [];
  const modelRequests: string[] = [];
  const delivered: string[] = [];
  const workers: Worker[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => { if (worker.url().includes("nextToken.worker")) workers.push(worker); });
  page.context().on("request", (request) => { if (/huggingface\.co|hf\.co|jsdelivr\.net/.test(request.url())) modelRequests.push(request.url()); });
  page.context().on("requestfinished", (request) => { if (/huggingface\.co|hf\.co|jsdelivr\.net/.test(request.url())) delivered.push(request.url()); });

  // Hold the first model request so the loading state can be observed and cancelled.
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.context().route("**/huggingface.co/**", async (route) => {
    await held;
    // The cancelled worker may already be gone, in which case its request can't be aborted any more.
    await route.abort("internetdisconnected").catch(() => {});
  });

  const game = await openNextToken(page);
  const tabs = game.getByRole("tab");
  await expect(tabs).toHaveText(["Real predictions", "Try it live"]);
  await tabs.first().click();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  const panel = game.getByRole("tabpanel", { name: "Try it live" });
  const load = panel.getByRole("button", { name: `Load model (~${Math.round(meta.downloadBytes / 1e6)} MB)` });
  await expect(load).toBeVisible();
  await expect(panel).toContainText(`${Math.round(meta.downloadBytes / 1e6)} MB of model files from Hugging Face`);
  await page.waitForTimeout(300);
  expect(modelRequests).toEqual([]);
  expect(workers).toHaveLength(0);

  await load.click();
  await expect(panel.getByRole("progressbar", { name: "Model download" })).toBeVisible();
  await expect.poll(() => workers.length).toBe(1);
  const closed = workers[0].waitForEvent("close");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await closed;
  await expect(load).toBeFocused();
  release();

  await load.click();
  const alert = panel.getByRole("alert");
  await expect(alert).toContainText("Couldn't download the model", { timeout: 15_000 });
  const retry = alert.getByRole("button", { name: "Retry" });
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(panel.getByRole("alert")).toContainText("Couldn't download the model", { timeout: 15_000 });
  await expect(panel.getByRole("alert").getByRole("button", { name: "Retry" })).toBeVisible();

  expect(modelRequests.length).toBeGreaterThan(0);
  expect(delivered).toEqual([]);
  expect(errors).toEqual([]);
});
