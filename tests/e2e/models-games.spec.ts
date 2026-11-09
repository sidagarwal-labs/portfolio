import { expect, test } from "@playwright/test";
import { attentionRows, contextLength, createModel, measureLoss, predict, tokenId, trainEpoch } from "../../src/features/views/model/tinyModel";
import { modelCorpus } from "../../src/features/views/model/modelCorpus";
import { blockCells, blocksReducer, boardHeight, boardWidth, clearBlockLines, createBlocks, landingPiece } from "../../src/features/views/os/games/blocksEngine";

test("the tiny attention model learns from the actual corpus with deterministic, finite measurements", () => {
  const { model, data } = createModel(modelCorpus);
  const initial = measureLoss(model, data.train);
  const embeddings = structuredClone(model.embeddings);
  const start = performance.now();
  for (let epoch = 0; epoch < 12; epoch += 1) trainEpoch(model, data.train);
  const loss = measureLoss(model, data.train);
  const validationLoss = measureLoss(model, data.validation);
  console.log(`Tiny model: ${initial.toFixed(3)} -> ${loss.toFixed(3)} training loss; ${validationLoss.toFixed(3)} held-out loss; 12 epochs in ${Math.round(performance.now() - start)}ms.`);
  expect(loss).toBeLessThan(initial * 0.75);
  expect(Number.isFinite(validationLoss)).toBe(true);
  expect(model.embeddings).not.toEqual(embeddings);
  expect(createModel(modelCorpus).model.embeddings).toEqual(embeddings);
  const repeated = createModel(modelCorpus);
  for (let epoch = 0; epoch < 12; epoch += 1) trainEpoch(repeated.model, repeated.data.train);
  expect(repeated.model).toEqual(model);
  const probabilities = predict(model, data.validation[0].context).distribution;
  expect(probabilities).toHaveLength(model.vocabulary.length);
  expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  expect(probabilities.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
});

test("attention is causal and normalized, and training excludes held-out documents", () => {
  const { model, data } = createModel(["one two three", "four five six", "seven eight nine", "ten eleven twelve", "heldout violet"]);
  const heldout = tokenId(model, "heldout");
  expect(data.train.every(({ context, target }) => !context.includes(heldout) && target !== heldout)).toBe(true);
  expect(data.validation.some(({ context, target }) => context.includes(heldout) || target === heldout)).toBe(true);
  expect([...data.train, ...data.validation].every(({ context }) => context.length > 0 && context.length <= contextLength)).toBe(true);
  const rows = attentionRows(model, ["one", "two", "three", "four"]);
  rows.forEach((row, index) => {
    expect(row).toHaveLength(index + 1);
    expect(row.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
    expect(row.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });
  expect(rows[1]).toEqual(attentionRows(model, ["one", "two", "changed", "future"])[1]);
  expect(() => createModel(["not enough documents"])).toThrow(/at least five/);
  expect(() => measureLoss(model, [])).toThrow(/non-empty/);
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
