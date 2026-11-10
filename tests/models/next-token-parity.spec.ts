import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AutoModelForCausalLM, AutoTokenizer, env, type Tensor } from "@huggingface/transformers";
import { expect, test } from "@playwright/test";
import data from "../../src/content/generated/next-token.json";
import type { LiveDevice, LiveDtype, LiveRequest, LiveResponse } from "../../src/features/views/os/games/next-token/nextToken.worker";

declare global {
  interface Window {
    parityWorker: Worker;
    parityMessages: LiveResponse[];
  }
}

const { meta } = data;
const dtype = process.env.NEXT_TOKEN_DTYPE ?? meta.dtype;
const device = process.env.NEXT_TOKEN_DEVICE ?? "wasm";
if (dtype !== "q4" && dtype !== "q4f16") throw new Error(`Unsupported diagnostic dtype: ${dtype}`);
if (device !== "wasm" && device !== "webgpu") throw new Error(`Unsupported diagnostic device: ${device}`);
const requestedDtype: LiveDtype = dtype;
const requestedDevice: LiveDevice = device;
const topK = 32;

test(`real ${requestedDtype} ${requestedDevice} predictions agree with native CPU`, async ({ page }, testInfo) => {
  env.cacheDir = resolve("node_modules", ".cache", "huggingface");
  env.allowLocalModels = false;
  env.remotePathTemplate = `{model}/resolve/${meta.revision}/`;
  const tokenizer = await AutoTokenizer.from_pretrained(meta.model, { revision: meta.revision });
  const model = await AutoModelForCausalLM.from_pretrained(meta.model, { revision: meta.revision, dtype: requestedDtype, device: "cpu" });
  const references = [];
  try {
    for (const { text } of data.prompts) {
      const inputs = tokenizer(text);
      const outputs = await model(inputs) as Record<string, Tensor>;
      const logits = outputs.logits.to("float32");
      const [, length, vocab] = logits.dims;
      const scores = Array.from((logits.data as Float32Array).subarray((length - 1) * vocab, length * vocab));
      const max = Math.max(...scores);
      const weights = scores.map((score) => Math.exp(score - max));
      const total = weights.reduce((sum, value) => sum + value, 0);
      const probabilities = weights.map((value) => value / total);
      references.push({
        text,
        inputIds: Array.from(inputs.input_ids.data as BigInt64Array, Number),
        topId: scores.indexOf(max),
        probabilities
      });
      if (logits !== outputs.logits) logits.dispose();
      Object.values(outputs).forEach((tensor) => tensor.dispose?.());
      Object.values(inputs).forEach((tensor) => tensor.dispose());
    }
  } finally {
    await model.dispose();
  }

  const workerFile = readdirSync(new URL("../../dist/assets/", import.meta.url)).find((name) => /^nextToken\.worker-.*\.js$/.test(name));
  if (!workerFile) throw new Error("Build the app before running the real-model checks.");
  await page.route("**/__model-parity__", (route) => route.fulfill({ contentType: "text/html", body: "<title>Model parity check</title>" }));
  await page.goto("/__model-parity__");
  const started = page.waitForEvent("worker");
  await page.evaluate((url) => {
    window.parityMessages = [];
    window.parityWorker = new Worker(url, { type: "module" });
    window.parityWorker.onmessage = ({ data }: MessageEvent<LiveResponse>) => window.parityMessages.push(data);
    window.parityWorker.onerror = (event) => {
      window.parityMessages.push({ type: "error", kind: "other", message: event.message || "The diagnostic worker failed." });
    };
  }, `/assets/${workerFile}`);
  const worker = await started;
  if (requestedDevice === "wasm") {
    await worker.evaluate(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
  }
  const load: LiveRequest = {
    type: "load", model: meta.model, revision: meta.revision, dtype: requestedDtype,
    temperatures: meta.temperatures, cacheOnly: false
  };
  await page.evaluate((request) => window.parityWorker.postMessage(request), load);
  const rows = [];
  try {
    await expect.poll(() => page.evaluate(() => window.parityMessages.find((message) => message.type === "ready" || message.type === "error")), { timeout: 180_000 }).toBeDefined();
    const status = await page.evaluate(() => window.parityMessages.find((message) => message.type === "ready" || message.type === "error"));
    if (status?.type === "error") throw new Error(status.message);
    expect(status).toEqual({ type: "ready", device: requestedDevice });
    for (const [index, reference] of references.entries()) {
      const request: LiveRequest = { type: "predict", id: index + 1, text: reference.text, k: topK };
      await page.evaluate((request) => window.parityWorker.postMessage(request), request);
      await expect.poll(() => page.evaluate((id) => window.parityMessages.find((message) => (message.type === "prediction" || message.type === "error") && message.id === id), request.id)).toBeDefined();
      const result = await page.evaluate((id) => window.parityMessages.find((message) => (message.type === "prediction" || message.type === "error") && message.id === id), request.id);
      if (result?.type !== "prediction") throw new Error(result?.type === "error" ? result.message : "Missing prediction.");
      const atOne = meta.temperatures.indexOf(1);
      const probabilities = result.top.map((token) => Math.exp(token.logit - result.lse[atOne]));
      const maxProbabilityError = Math.max(...result.top.map((token, rank) => Math.abs(probabilities[rank] - reference.probabilities[token.id])));
      rows.push({
        prompt: reference.text, inputIds: result.inputIds,
        cpuTop: { id: reference.topId, text: tokenizer.decode([reference.topId]), probability: reference.probabilities[reference.topId] },
        browserTop: { id: result.top[0].id, text: result.top[0].text, probability: probabilities[0] },
        maxProbabilityError, milliseconds: result.ms
      });
      expect.soft(result.inputIds, reference.text).toEqual(reference.inputIds);
      expect.soft(result.top[0].id, reference.text).toBe(reference.topId);
      expect.soft(maxProbabilityError, `${reference.text}: top-${topK} probabilities must differ by at most one percentage point`).toBeLessThanOrEqual(0.01);
      const mass = probabilities.reduce((sum, value) => sum + value, 0) + Math.exp(result.rest[atOne] - result.lse[atOne]);
      expect.soft(mass, reference.text).toBeCloseTo(1, 5);
    }
  } finally {
    await page.evaluate(() => window.parityWorker.terminate());
    const report = { model: meta.model, revision: meta.revision, dtype: requestedDtype, device: requestedDevice, rows };
    const path = testInfo.outputPath("parity.json");
    writeFileSync(path, JSON.stringify(report, null, 2));
    await testInfo.attach("Numerical parity", { path, contentType: "application/json" });
    console.log(JSON.stringify(report, null, 2));
  }
});
