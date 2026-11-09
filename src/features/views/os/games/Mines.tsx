import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bomb, Flag, RotateCcw, Timer } from "lucide-react";
import "./games.css";

type Cell = { mine: boolean; open: boolean; flag: boolean; count: number };
type Status = "ready" | "playing" | "won" | "lost";

const size = 9;
const mineCount = 10;
const bestKey = "lab-os-mines-best-v1";

function readBest() {
  try {
    return Number(localStorage.getItem(bestKey)) || 0;
  } catch {
    return 0;
  }
}

function emptyBoard(): Cell[] {
  return Array.from({ length: size * size }, () => ({ mine: false, open: false, flag: false, count: 0 }));
}

function neighbors(index: number) {
  const x = index % size;
  const y = Math.floor(index / size);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(ny * size + nx);
    }
  }
  return out;
}

/* Mines are laid after the first click, away from it, so the opening move always clears some space. */
function layMines(board: Cell[], safe: number): Cell[] {
  const banned = new Set([safe, ...neighbors(safe)]);
  const candidates = board.map((_, index) => index).filter((index) => !banned.has(index));
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const mines = new Set(candidates.slice(0, mineCount));
  return board.map((cell, index) => ({
    ...cell,
    mine: mines.has(index),
    count: neighbors(index).filter((other) => mines.has(other)).length
  }));
}

function flood(board: Cell[], starts: number[]) {
  const next = board.map((cell) => ({ ...cell }));
  const queue = [...starts];
  while (queue.length) {
    const index = queue.pop() as number;
    const cell = next[index];
    if (cell.open || cell.flag) continue;
    cell.open = true;
    if (!cell.mine && cell.count === 0) queue.push(...neighbors(index));
  }
  return next;
}

function cellLabel(cell: Cell, index: number, status: Status) {
  const where = `Row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}`;
  if (cell.open && cell.mine) return `${where}: mine`;
  if (cell.open) return `${where}: ${cell.count ? `${cell.count} ${cell.count === 1 ? "mine" : "mines"} nearby` : "clear"}`;
  if (cell.flag) return `${where}: flagged`;
  if (status === "lost" && cell.mine) return `${where}: mine`;
  return `${where}: hidden`;
}

function Mines({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState(emptyBoard);
  const [status, setStatus] = useState<Status>("ready");
  const [exploded, setExploded] = useState(-1);
  const [flagMode, setFlagMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(40);
  const [elapsed, setElapsed] = useState(0);
  const [best, setBest] = useState(readBest);
  const startedAt = useRef(0);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (active && !rootRef.current?.contains(document.activeElement)) cellRefs.current[focusIndex]?.focus({ preventScroll: true });
  }, [active, focusIndex]);

  useEffect(() => {
    if (status !== "playing") return;
    const timer = window.setInterval(() => setElapsed(Math.min(999, Math.floor((Date.now() - startedAt.current) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [status]);

  const finish = useCallback((next: Cell[], hit: number) => {
    if (hit >= 0) {
      setExploded(hit);
      setStatus("lost");
      setBoard(next);
      return;
    }
    if (next.every((cell) => cell.mine || cell.open)) {
      const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      setElapsed(Math.min(999, seconds));
      setStatus("won");
      setBoard(next.map((cell) => (cell.mine ? { ...cell, flag: true } : cell)));
      setBest((current) => {
        if (current && current <= seconds) return current;
        try {
          localStorage.setItem(bestKey, String(seconds));
        } catch {
          /* Best time just won't persist. */
        }
        return seconds;
      });
      return;
    }
    setBoard(next);
  }, []);

  const reveal = (index: number) => {
    if (status === "won" || status === "lost") return;
    let current = board;
    const cell = current[index];
    if (cell.flag) return;
    if (status === "ready") {
      current = layMines(current, index);
      setStatus("playing");
      startedAt.current = Date.now();
      setElapsed(0);
    }
    if (cell.open) {
      /* Chording: an open number with all its flags placed opens the rest of its neighbours. */
      const around = neighbors(index);
      const flags = around.filter((other) => current[other].flag).length;
      if (!cell.count || flags !== cell.count) return;
      const targets = around.filter((other) => !current[other].open && !current[other].flag);
      const hit = targets.find((other) => current[other].mine);
      finish(flood(current, targets), hit ?? -1);
      return;
    }
    finish(flood(current, [index]), current[index].mine ? index : -1);
  };

  const toggleFlag = (index: number) => {
    if (status === "won" || status === "lost" || board[index].open) return;
    setBoard((current) => current.map((cell, i) => (i === index ? { ...cell, flag: !cell.flag } : cell)));
  };

  const restart = () => {
    setBoard(emptyBoard());
    setStatus("ready");
    setExploded(-1);
    setElapsed(0);
  };

  const moveFocus = (index: number) => {
    setFocusIndex(index);
    cellRefs.current[index]?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent, index: number) => {
    const x = index % size;
    const y = Math.floor(index / size);
    const moves: Record<string, number> = {
      ArrowLeft: x > 0 ? index - 1 : index,
      ArrowRight: x < size - 1 ? index + 1 : index,
      ArrowUp: y > 0 ? index - size : index,
      ArrowDown: y < size - 1 ? index + size : index,
      Home: y * size,
      End: y * size + size - 1
    };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[event.key]);
    } else if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      toggleFlag(index);
    }
  };

  const flags = board.filter((cell) => cell.flag).length;
  const message = status === "won"
    ? `Cleared in ${elapsed}s.${best === elapsed ? " New best!" : ""}`
    : status === "lost" ? "Boom. That one was a mine." : flagMode ? "Flag mode: taps place flags." : "Find the 10 mines. First click is always safe.";

  return (
    <div className="game mines" ref={rootRef}>
      <div className="game__hud">
        <span title="Mines left"><Bomb size={14} strokeWidth={2.2} aria-hidden="true" /> <b>{mineCount - flags}</b><span className="sr-only"> mines left</span></span>
        <button type="button" className="game__btn" onClick={restart}>
          <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
          New game
        </button>
        <span title="Seconds"><Timer size={14} strokeWidth={2.2} aria-hidden="true" /> <b>{elapsed}</b><span className="sr-only"> seconds</span></span>
      </div>

      <div className="mines__board" role="group" aria-label="Minefield, 9 by 9" data-status={status}>
        {board.map((cell, index) => {
          const shown = cell.open || (status === "lost" && cell.mine && !cell.flag);
          const wrongFlag = status === "lost" && cell.flag && !cell.mine;
          return (
            <button
              key={index}
              ref={(element) => { cellRefs.current[index] = element; }}
              type="button"
              className="mines__cell"
              data-open={shown || undefined}
              data-n={cell.open && !cell.mine ? cell.count || undefined : undefined}
              data-hit={index === exploded || undefined}
              data-wrong={wrongFlag || undefined}
              tabIndex={index === focusIndex ? 0 : -1}
              aria-label={cellLabel(cell, index, status)}
              onFocus={() => setFocusIndex(index)}
              onClick={() => (flagMode ? toggleFlag(index) : reveal(index))}
              onContextMenu={(event) => {
                event.preventDefault();
                toggleFlag(index);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {shown && cell.mine ? <Bomb size={15} strokeWidth={2.2} aria-hidden="true" />
                : cell.flag ? <Flag size={14} strokeWidth={2.4} aria-hidden="true" />
                  : cell.open && cell.count ? cell.count : null}
            </button>
          );
        })}
      </div>

      <p className="game__status" aria-live="polite">{message}</p>
      <div className="game__row">
        <button type="button" className="game__btn" aria-pressed={flagMode} onClick={() => setFlagMode((value) => !value)}>
          <Flag size={14} strokeWidth={2.2} aria-hidden="true" />
          Flag mode
        </button>
        {best > 0 && <span className="game__muted">Best: {best}s</span>}
      </div>
      <p className="game__hint">Click to dig. Right-click or F to flag. Click a number whose flags are all placed to clear around it. Arrow keys move.</p>
    </div>
  );
}

export default Mines;
