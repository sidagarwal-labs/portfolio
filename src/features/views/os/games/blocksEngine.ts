export const boardWidth = 10;
export const boardHeight = 20;
export const blockNames = ["I", "J", "L", "O", "S", "T", "Z"];
const shapes = [
  ["....", "XXXX", "....", "...."],
  ["X..", "XXX", "..."],
  ["..X", "XXX", "..."],
  ["XX", "XX"],
  [".XX", "XX.", "..."],
  [".X.", "XXX", "..."],
  ["XX.", ".XX", "..."]
];

export type Piece = { kind: number; rotation: number; x: number; y: number };
export type BlockGame = {
  board: number[];
  piece: Piece;
  bag: number[];
  seed: number;
  status: "ready" | "running" | "paused" | "over";
  score: number;
  lines: number;
};
export type BlockAction =
  | { type: "move"; dx: number }
  | { type: "rotate"; direction: 1 | -1 }
  | { type: "tick" | "drop" | "soft-drop" | "toggle" | "pause" | "reset" };

export function blockCells(piece: Piece) {
  const shape = shapes[piece.kind];
  const cells: { x: number; y: number }[] = [];
  shape.forEach((row, y) => [...row].forEach((value, x) => {
    if (value !== "X") return;
    let px = x;
    let py = y;
    for (let turn = 0; turn < piece.rotation; turn += 1) [px, py] = [shape.length - 1 - py, px];
    cells.push({ x: piece.x + px, y: piece.y + py });
  }));
  return cells;
}

function fits(board: number[], piece: Piece) {
  return blockCells(piece).every(({ x, y }) => x >= 0 && x < boardWidth && y < boardHeight && (y < 0 || !board[y * boardWidth + x]));
}

function refill(bag: number[], seed: number) {
  const next = [...bag];
  if (next.length < 2) {
    const batch = shapes.map((_, index) => index);
    for (let index = batch.length - 1; index > 0; index -= 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const other = Math.floor((seed / 4294967296) * (index + 1));
      [batch[index], batch[other]] = [batch[other], batch[index]];
    }
    next.push(...batch);
  }
  return { bag: next, seed };
}

const spawn = (kind: number): Piece => ({ kind, x: 3, y: -1, rotation: 0 });

export function createBlocks(seed: number): BlockGame {
  const next = refill([], seed);
  return { ...next, board: Array(boardWidth * boardHeight).fill(0), piece: spawn(next.bag[0]), bag: next.bag.slice(1), status: "ready", score: 0, lines: 0 };
}

export function clearBlockLines(board: number[]) {
  const rows = Array.from({ length: boardHeight }, (_, y) => board.slice(y * boardWidth, (y + 1) * boardWidth));
  const remaining = rows.filter((row) => row.some((cell) => cell === 0));
  const lines = boardHeight - remaining.length;
  return { board: [...Array(lines * boardWidth).fill(0), ...remaining.flat()], lines };
}

export function landingPiece(game: BlockGame) {
  let piece = game.piece;
  while (fits(game.board, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return piece;
}

function lock(game: BlockGame): BlockGame {
  const cells = blockCells(game.piece);
  if (cells.some(({ y }) => y < 0)) return { ...game, status: "over" };
  const board = [...game.board];
  cells.forEach(({ x, y }) => { board[y * boardWidth + x] = game.piece.kind + 1; });
  const cleared = clearBlockLines(board);
  const next = refill(game.bag, game.seed);
  const piece = spawn(next.bag[0]);
  return {
    ...game, ...next, board: cleared.board, piece, bag: next.bag.slice(1),
    lines: game.lines + cleared.lines,
    score: game.score + [0, 100, 300, 500, 800][cleared.lines] * (1 + Math.floor(game.lines / 10)),
    status: fits(cleared.board, piece) ? "running" : "over"
  };
}

export function blocksReducer(game: BlockGame, action: BlockAction): BlockGame {
  if (action.type === "reset" || (action.type === "toggle" && game.status === "over")) return { ...createBlocks(game.seed + 1), status: "running" };
  if (action.type === "pause") return game.status === "running" ? { ...game, status: "paused" } : game;
  if (action.type === "toggle") return { ...game, status: game.status === "running" ? "paused" : "running" };
  if (game.status !== "running") return game;
  if (action.type === "move") {
    const piece = { ...game.piece, x: game.piece.x + action.dx };
    return fits(game.board, piece) ? { ...game, piece } : game;
  }
  if (action.type === "rotate") {
    const rotated = { ...game.piece, rotation: (game.piece.rotation + action.direction + 4) % 4 };
    for (const dx of [0, -1, 1, -2, 2]) {
      const piece = { ...rotated, x: rotated.x + dx };
      if (fits(game.board, piece)) return { ...game, piece };
    }
    return game;
  }
  if (action.type === "drop") {
    const piece = landingPiece(game);
    return lock({ ...game, piece, score: game.score + (piece.y - game.piece.y) * 2 });
  }
  const piece = { ...game.piece, y: game.piece.y + 1 };
  return fits(game.board, piece) ? { ...game, piece, score: game.score + (action.type === "soft-drop" ? 1 : 0) } : lock(game);
}
