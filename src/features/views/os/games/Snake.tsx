import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw } from "lucide-react";
import "./games.css";

type Point = { x: number; y: number };
type Status = "ready" | "running" | "paused" | "over";

const cells = 16;
const pixels = 384;
const bestKey = "lab-os-snake-best-v1";

const keyDirections: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }
};

const pad = [
  { label: "Up", icon: ArrowUp, dir: keyDirections.ArrowUp, area: "up" },
  { label: "Left", icon: ArrowLeft, dir: keyDirections.ArrowLeft, area: "left" },
  { label: "Down", icon: ArrowDown, dir: keyDirections.ArrowDown, area: "down" },
  { label: "Right", icon: ArrowRight, dir: keyDirections.ArrowRight, area: "right" }
];

function readBest() {
  try {
    return Number(localStorage.getItem(bestKey)) || 0;
  } catch {
    return 0;
  }
}

function placeFood(snake: Point[]): Point | null {
  const free: Point[] = [];
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) free.push({ x, y });
    }
  }
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function freshGame() {
  const snake = [{ x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }];
  return { snake, dir: { x: 1, y: 0 }, queue: [] as Point[], food: placeFood(snake) ?? { x: 11, y: 8 }, score: 0 };
}

function Snake({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef(freshGame());
  const swipe = useRef<Point | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const styles = getComputedStyle(canvas);
    const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    const cell = pixels / cells;
    const { snake, food } = game.current;
    context.fillStyle = color("--snake-bg", "#0f1420");
    context.fillRect(0, 0, pixels, pixels);
    context.fillStyle = color("--snake-grid", "rgba(255,255,255,0.06)");
    for (let y = 0; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) context.fillRect(x * cell + cell / 2 - 1, y * cell + cell / 2 - 1, 2, 2);
    }
    context.fillStyle = color("--snake-food", "#ef6b6b");
    context.fillRect(food.x * cell + 5, food.y * cell + 5, cell - 10, cell - 10);
    snake.forEach((part, index) => {
      context.fillStyle = index === 0 ? color("--snake-head", "#9be7b0") : color("--snake-body", "#5dbf78");
      context.fillRect(part.x * cell + 1, part.y * cell + 1, cell - 2, cell - 2);
    });
  }, []);

  useEffect(() => {
    draw();
    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-os-style"] });
    return () => observer.disconnect();
  }, [draw]);

  const endGame = useCallback(() => {
    setStatus("over");
    const final = game.current.score;
    setBest((current) => {
      if (final <= current) return current;
      try {
        localStorage.setItem(bestKey, String(final));
      } catch {
        /* Best score just won't persist. */
      }
      return final;
    });
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    let timer = 0;
    const step = () => {
      const state = game.current;
      if (state.queue.length) state.dir = state.queue.shift() ?? state.dir;
      const head = { x: state.snake[0].x + state.dir.x, y: state.snake[0].y + state.dir.y };
      const eats = head.x === state.food.x && head.y === state.food.y;
      const body = eats ? state.snake : state.snake.slice(0, -1);
      const crashed = head.x < 0 || head.y < 0 || head.x >= cells || head.y >= cells || body.some((part) => part.x === head.x && part.y === head.y);
      if (crashed) {
        endGame();
        return;
      }
      state.snake = [head, ...body];
      if (eats) {
        state.score += 1;
        setScore(state.score);
        const food = placeFood(state.snake);
        if (!food) {
          draw();
          endGame();
          return;
        }
        state.food = food;
      }
      draw();
      timer = window.setTimeout(step, Math.max(70, 150 - state.score * 4));
    };
    timer = window.setTimeout(step, Math.max(70, 150 - game.current.score * 4));
    return () => window.clearTimeout(timer);
  }, [status, draw, endGame]);

  useEffect(() => {
    if (!active) {
      setStatus((current) => (current === "running" ? "paused" : current));
      return;
    }
    if (!rootRef.current?.contains(document.activeElement)) rootRef.current?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    const pause = () => { if (document.hidden) setStatus((current) => current === "running" ? "paused" : current); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);

  const restart = () => {
    rootRef.current?.focus({ preventScroll: true });
    game.current = freshGame();
    setScore(0);
    draw();
    setStatus("running");
  };

  const toggle = () => {
    rootRef.current?.focus({ preventScroll: true });
    if (status === "over") restart();
    else setStatus(status === "running" ? "paused" : "running");
  };

  const turn = (next: Point) => {
    if (!active || status === "over") return;
    rootRef.current?.focus({ preventScroll: true });
    const state = game.current;
    const last = state.queue[state.queue.length - 1] ?? state.dir;
    const reverse = next.x === -last.x && next.y === -last.y;
    if (!reverse && (next.x !== last.x || next.y !== last.y) && state.queue.length < 3) state.queue.push(next);
    if (status !== "running") setStatus("running");
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!active) return;
    const direction = keyDirections[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction) {
      event.preventDefault();
      turn(direction);
    } else if ((event.key === " " || event.key === "Enter") && event.target === event.currentTarget) {
      event.preventDefault();
      toggle();
    }
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
  };

  const message = status === "over"
    ? `Context overflow at ${score} ${score === 1 ? "token" : "tokens"}.`
    : status === "paused" ? "Paused." : "Eat tokens, grow your context window.";

  return (
    <div ref={rootRef} className="game snake" data-status={status} tabIndex={0} onKeyDown={onKeyDown} aria-label="Snake. Arrow keys or WASD to steer, Space to pause.">
      <div className="game__hud">
        <span>Tokens <b>{score}</b></span>
        <span>Best <b>{best}</b></span>
        <button type="button" className="game__btn" onClick={toggle}>
          {status === "running" ? <Pause size={14} strokeWidth={2.2} aria-hidden="true" /> : status === "over" ? <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" /> : <Play size={14} strokeWidth={2.2} aria-hidden="true" />}
          {status === "running" ? "Pause" : status === "over" ? "Play again" : status === "paused" ? "Resume" : "Start"}
        </button>
      </div>

      <div className="snake__board">
        <canvas
          ref={canvasRef}
          width={pixels}
          height={pixels}
          aria-hidden="true"
          onPointerDown={(event) => { rootRef.current?.focus({ preventScroll: true }); swipe.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={onPointerUp}
        />
        {status !== "running" && (
          <div className="snake__overlay">
            <p>{message}</p>
            <button type="button" className="game__btn game__btn--primary" onClick={toggle}>
              {status === "over" ? "Play again" : status === "paused" ? "Resume" : "Start"}
            </button>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{status === "over" ? message : ""}</p>

      <div className="snake__pad">
        {pad.map(({ label, icon: Icon, dir, area }) => (
          <button key={label} type="button" className="game__btn" style={{ gridArea: area }} onClick={() => turn(dir)} aria-label={label}>
            <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="game__hint">Arrow keys or WASD to steer. Space pauses. Swipe on touch screens.</p>
    </div>
  );
}

export default Snake;
