import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  attentionHeads, attentionRows, contextLength, countParameters, createModel, hiddenMultiplier, lossAndGradients, measureLoss, modelDimension,
  predict, tokenId, trainEpoch, unigramLoss, type ParameterGroup
} from "../../src/features/views/model/tinyModel";
import { blockCells, blocksReducer, boardHeight, boardWidth, clearBlockLines, createBlocks, landingPiece } from "../../src/features/views/os/games/blocksEngine";

/* The corpus imports site content (including a PDF ?url import), so load it through Vite's SSR loader like the app bundle does. */
async function loadCorpus() {
  const server = await createServer({
    root: fileURLToPath(new URL("../..", import.meta.url)), configFile: false, logLevel: "silent", appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }
  });
  try {
    return ((await server.ssrLoadModule("/src/features/views/model/modelCorpus.ts")) as { modelCorpus: string[] }).modelCorpus;
  } finally {
    await server.close();
  }
}

test("the tiny transformer learns from the actual portfolio corpus, deterministically and within budget", async () => {
  const corpus = await loadCorpus();
  expect(corpus.length).toBeGreaterThanOrEqual(50);
  const { model, data } = createModel(corpus);
  const vocabulary = model.vocabulary.length, d = modelDimension, hidden = d * hiddenMultiplier;
  expect(model).toMatchObject({ dimension: d, heads: attentionHeads, hidden });
  expect(countParameters(model)).toBe(vocabulary * (2 * d + 1) + contextLength * d + 4 * d * d + 2 * d * hidden + hidden + 4 * d);
  const initial = measureLoss(model, data.train), initialValidation = measureLoss(model, data.validation);
  expect(Math.abs(initial - Math.log(vocabulary))).toBeLessThan(0.3);
  const initialWeights = structuredClone(model.weights);
  const validation: number[] = [];
  let trainingTime = 0;
  for (let epoch = 0; epoch < 12; epoch += 1) {
    const start = performance.now();
    trainEpoch(model, data.train);
    trainingTime += performance.now() - start;
    validation.push(measureLoss(model, data.validation));
  }
  const loss = measureLoss(model, data.train);
  const best = Math.min(...validation);
  console.log(`Tiny transformer: ${countParameters(model).toLocaleString("en-US")} parameters, ${vocabulary} words. Train ${initial.toFixed(3)} -> ${loss.toFixed(3)}; held-out ${initialValidation.toFixed(3)} -> ${validation[11].toFixed(3)} (best ${best.toFixed(3)} at epoch ${validation.indexOf(best) + 1}; ln V ${Math.log(vocabulary).toFixed(3)}, word frequency ${unigramLoss(vocabulary, data).toFixed(3)}). 12 training epochs in ${Math.round(trainingTime)}ms.`);
  expect(loss).toBeLessThan(initial * 0.75);
  expect(best).toBeLessThan(initialValidation * 0.6);
  expect(validation.every(Number.isFinite)).toBe(true);
  expect(model.weights).not.toEqual(initialWeights);
  expect(createModel(corpus).model.weights).toEqual(initialWeights);
  const repeated = createModel(corpus);
  for (let epoch = 0; epoch < 12; epoch += 1) trainEpoch(repeated.model, repeated.data.train);
  expect(repeated.model).toEqual(model);
  const sample = data.validation.slice(0, 40);
  expect(measureLoss(model, sample)).toBeCloseTo(lossAndGradients(model, sample).loss, 10);
  const { distribution, weights, heads } = predict(model, data.validation[0].context);
  expect(distribution).toHaveLength(vocabulary);
  expect(distribution.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  expect(distribution.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  expect(heads).toHaveLength(attentionHeads);
  weights.forEach((value, index) => expect(value).toBeCloseTo(heads.reduce((sum, row) => sum + row[index], 0) / attentionHeads, 12));
});

test("attention is causal and normalized, and training never sees held-out documents", () => {
  const texts = ["one two three one two three", "four five six four five six", "seven eight nine seven eight nine", "one four seven two five eight", "heldout violet heldout violet"];
  const { model, data } = createModel(texts);
  expect(model.vocabulary.slice(0, 3)).toEqual(["<bos>", "<unk>", "<eos>"]);
  expect(model.vocabulary).not.toContain("heldout");
  expect(tokenId(model, "heldout")).toBe(1);
  expect(tokenId(model, "ONE")).toBe(model.vocabulary.indexOf("one"));
  expect(data.validation.map(({ target }) => target)).toEqual([1, 1, 1, 1, 2]);
  expect(data.train).toHaveLength(28);
  expect([...data.train, ...data.validation].every(({ context }) => context.length > 0 && context.length <= contextLength)).toBe(true);

  const swapped = createModel([...texts.slice(0, 4), "completely different held out words one two"]);
  expect(swapped.model).toEqual(model);
  expect(swapped.data.train).toEqual(data.train);
  trainEpoch(model, data.train);
  trainEpoch(swapped.model, swapped.data.train);
  expect(swapped.model).toEqual(model);

  const words = "one two three four five six seven eight nine one two three four five".split(" ");
  const rows = attentionRows(model, words);
  const perHead = Array.from({ length: attentionHeads }, (_, head) => attentionRows(model, words, head));
  rows.forEach((row, index) => {
    expect(row).toHaveLength(index + 1);
    expect(row.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
    expect(row.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(row.slice(0, Math.max(0, index + 1 - contextLength)).every((value) => value === 0)).toBe(true);
    row.forEach((value, column) => expect(value).toBeCloseTo(perHead.reduce((sum, headRows) => sum + headRows[index][column], 0) / attentionHeads, 12));
    perHead.forEach((headRows) => expect(headRows[index].reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10));
  });
  expect(perHead[0]).not.toEqual(perHead[1]);
  const changedFuture = attentionRows(model, ["one", "two", "seven", "nine"]);
  expect(changedFuture.slice(0, 2)).toEqual(rows.slice(0, 2));
  const longContext = words.map((word) => tokenId(model, word));
  expect(predict(model, longContext)).toEqual(predict(model, longContext.slice(-contextLength)));

  expect(() => createModel(["not enough documents"])).toThrow(/at least five documents/);
  expect(() => createModel(texts, { dimension: 5, heads: 2 })).toThrow(/split evenly across attention heads/);
  expect(() => measureLoss(model, [])).toThrow(/non-empty evaluation set/);
  expect(() => trainEpoch(model, [])).toThrow(/non-empty training set/);
  expect(() => lossAndGradients(model, [])).toThrow(/at least one example/);
  expect(() => predict(model, [])).toThrow(/at least one context token/);
  expect(() => predict(model, [model.vocabulary.length])).toThrow(/model vocabulary/);
  expect(() => attentionRows(model, ["one"], attentionHeads)).toThrow(/Head must be an integer from 0 to 1/);
});

test("hand-written backprop matches central finite differences for every parameter group", () => {
  const texts = [
    "alpha beta gamma alpha beta delta gamma alpha", "beta gamma delta beta gamma alpha delta", "gamma delta alpha gamma delta beta",
    "delta alpha beta delta alpha gamma", "alpha heldout beta"
  ];
  const { model, data } = createModel(texts, { dimension: 4, heads: 2, seed: 7 });
  const groups = Object.keys(model.weights) as ParameterGroup[];
  // Move norm gains and biases away from their 1/0 initial values so every gradient path is generic.
  for (const name of groups) model.weights[name].forEach((value, index, values) => { values[index] = value + 0.3 * Math.sin(1.7 * index + name.length); });
  const examples = data.train.slice(0, 12);
  const { loss, gradients } = lossAndGradients(model, examples);
  expect(measureLoss(model, examples)).toBeCloseTo(loss, 12);
  const step = 1e-5, norm = (values: ArrayLike<number>) => Math.sqrt(Array.from(values).reduce((sum, value) => sum + value * value, 0));
  const results = groups.map((name) => {
    const values = model.weights[name], analytic = gradients[name], numeric = new Float64Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      const original = values[index];
      values[index] = original + step;
      const plus = measureLoss(model, examples);
      values[index] = original - step;
      const minus = measureLoss(model, examples);
      values[index] = original;
      numeric[index] = (plus - minus) / (2 * step);
    }
    const difference = norm(numeric.map((value, index) => value - analytic[index]));
    return { name, size: values.length, gradient: norm(analytic), relative: difference / (norm(numeric) + norm(analytic)) };
  });
  console.log(`Gradient check (float64, d=4, 2 heads, ${countParameters(model)} parameters):\n${results.map(({ name, size, relative }) => `  ${name.padEnd(16)} ${String(size).padStart(3)} relative error ${relative.toExponential(2)}`).join("\n")}`);
  expect(groups).toHaveLength(15);
  for (const { gradient, relative } of results) {
    expect(gradient).toBeGreaterThan(1e-6);
    expect(relative).toBeLessThan(1e-4);
  }
});

test("Blocks has a deterministic seven-piece bag, bounded movement, rotations, and ghost landing", () => {
  let game = blocksReducer(createBlocks(2642), { type: "toggle" });
  expect(createBlocks(2642)).toEqual(createBlocks(2642));
  expect(new Set([game.piece.kind, ...game.bag.slice(0, 6)]).size).toBe(7);
  const original = blockCells(game.piece);
  for (let turn = 0; turn < 4; turn += 1) game = blocksReducer(game, { type: "rotate", direction: 1 });
  expect(blockCells(game.piece)).toEqual(original);
  for (let move = 0; move < 20; move += 1) game = blocksReducer(game, { type: "move", dx: -1 });
  expect(Math.min(...blockCells(game.piece).map(({ x }) => x))).toBe(0);
  for (let move = 0; move < 20; move += 1) game = blocksReducer(game, { type: "move", dx: 1 });
  expect(Math.max(...blockCells(game.piece).map(({ x }) => x))).toBe(boardWidth - 1);
  expect(Math.max(...blockCells(landingPiece(game)).map(({ y }) => y))).toBe(boardHeight - 1);
  const dropped = blocksReducer(game, { type: "drop" });
  expect(dropped.board.filter(Boolean)).toHaveLength(4);
  expect(dropped.score).toBeGreaterThan(0);
});

test("Blocks clears rows, scores four lines, pauses, and detects top-out", () => {
  const board = Array(boardWidth * boardHeight).fill(0);
  board.fill(1, board.length - boardWidth);
  board[board.length - 2 * boardWidth] = 2;
  const cleared = clearBlockLines(board);
  expect(cleared.lines).toBe(1);
  expect(cleared.board).toHaveLength(board.length);
  expect(cleared.board[board.length - boardWidth]).toBe(2);

  const game = { ...createBlocks(2642), status: "running" as const };
  game.board.fill(1, 16 * boardWidth);
  for (let y = 16; y < 20; y += 1) game.board[y * boardWidth + 4] = 0;
  game.piece = { kind: 0, rotation: 1, x: 2, y: 16 };
  const dropped = blocksReducer(game, { type: "drop" });
  expect(dropped.lines).toBe(4);
  expect(dropped.score).toBe(800);
  expect(dropped.board.every((cell) => cell === 0)).toBe(true);
  const paused = blocksReducer(dropped, { type: "pause" });
  for (const action of ["tick", "drop", "soft-drop"] as const) expect(blocksReducer(paused, { type: action })).toEqual(paused);
  const blocked = { ...game, board: Array(boardWidth * boardHeight).fill(1), piece: { kind: 3, rotation: 0, x: 3, y: -2 } };
  expect(blocksReducer(blocked, { type: "tick" }).status).toBe("over");
});
