import { useEffect, useReducer, useRef, type KeyboardEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ChevronsDown, RotateCw } from "lucide-react";
import { blockCells, blockNames, blocksReducer, boardHeight, boardWidth, createBlocks, landingPiece, type BlockAction } from "./blocksEngine";
import "./games.css";

function Blocks({ active }: { active: boolean }) {
  const [game, dispatch] = useReducer(blocksReducer, undefined, () => createBlocks(Date.now()));
  const rootRef = useRef<HTMLDivElement>(null);
  const level = 1 + Math.floor(game.lines / 10);

  useEffect(() => {
    if (game.status !== "running" || !active) return;
    const timer = window.setInterval(() => dispatch({ type: "tick" }), Math.max(100, 700 - (level - 1) * 65));
    return () => window.clearInterval(timer);
  }, [game.status, active, level]);

  useEffect(() => {
    if (!active) dispatch({ type: "pause" });
    else if (!rootRef.current?.contains(document.activeElement)) rootRef.current?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    const pause = () => { if (document.hidden) dispatch({ type: "pause" }); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);

  const act = (action: BlockAction) => {
    if (!active) return;
    rootRef.current?.focus({ preventScroll: true });
    dispatch(action);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!active) return;
    const controls: Record<string, BlockAction> = {
      ArrowLeft: { type: "move", dx: -1 }, ArrowRight: { type: "move", dx: 1 },
      ArrowUp: { type: "rotate", direction: 1 }, x: { type: "rotate", direction: 1 }, z: { type: "rotate", direction: -1 },
      ArrowDown: { type: "soft-drop" }, p: { type: "toggle" }
    };
    const action = controls[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (action) { event.preventDefault(); act(action); }
    else if ((event.key === " " || event.key === "Enter") && event.target === event.currentTarget) {
      event.preventDefault();
      act({ type: game.status === "running" && event.key === " " ? "drop" : "toggle" });
    }
  };
  const painted = [...game.board];
  const ghost = new Set(blockCells(landingPiece(game)).filter(({ y }) => y >= 0).map(({ x, y }) => y * boardWidth + x));
  blockCells(game.piece).forEach(({ x, y }) => { if (y >= 0) painted[y * boardWidth + x] = game.piece.kind + 1; });
  const playLabel = game.status === "running" ? "Pause" : game.status === "paused" ? "Resume" : game.status === "over" ? "Play again" : "Start";

  return (
    <div ref={rootRef} className="game blocks" data-status={game.status} tabIndex={0} onKeyDown={onKey} aria-label="Blocks game. Arrow keys move and rotate. Space drops. P pauses.">
      <div className="game__hud"><span>Score <b>{game.score}</b></span><span>Lines <b>{game.lines}</b></span><span>Level <b>{level}</b></span></div>
      <div className="blocks__board" onPointerDown={() => rootRef.current?.focus({ preventScroll: true })}>
        <div className="blocks__grid" role="img" aria-label={`${blockNames[game.piece.kind]} piece, column ${game.piece.x + 1}, row ${Math.max(1, game.piece.y + 1)}. ${game.lines} lines cleared.`}>
          {painted.map((color, index) => <span key={index} data-color={color || undefined} data-ghost={!color && ghost.has(index) || undefined} />)}
        </div>
        {game.status !== "running" && <div className="blocks__overlay">
          <strong>{game.status === "over" ? "Stack full" : game.status === "paused" ? "Paused" : "Blocks"}</strong>
          <button type="button" className="game__btn game__btn--primary" onClick={() => act({ type: "toggle" })}>{playLabel}</button>
        </div>}
      </div>
      <p className="game__muted">Next: {blockNames[game.bag[0]]} &middot; {boardWidth} &times; {boardHeight}</p>
      <div className="game__row blocks__controls">
        <button type="button" className="game__btn" onClick={() => act({ type: "move", dx: -1 })} aria-label="Move left"><ArrowLeft size={17} /></button>
        <button type="button" className="game__btn" onClick={() => act({ type: "rotate", direction: 1 })} aria-label="Rotate piece"><RotateCw size={17} /></button>
        <button type="button" className="game__btn" onClick={() => act({ type: "move", dx: 1 })} aria-label="Move right"><ArrowRight size={17} /></button>
        <button type="button" className="game__btn" onClick={() => act({ type: "soft-drop" })} aria-label="Move down"><ArrowDown size={17} /></button>
        <button type="button" className="game__btn" onClick={() => act({ type: "drop" })} aria-label="Drop piece"><ChevronsDown size={17} /></button>
      </div>
      <div className="game__row"><button type="button" className="game__btn" onClick={() => act({ type: "toggle" })}>{playLabel}</button><button type="button" className="game__btn" onClick={() => act({ type: "reset" })}>New game</button></div>
      <p className="game__hint">Left/right move. Up or X rotates; Z rotates back. Down soft-drops. Space drops. P pauses. Clear complete rows.</p>
      <p className="sr-only" aria-live="polite">{game.status === "over" ? `Game over. Score ${game.score}.` : ""}</p>
    </div>
  );
}

export default Blocks;
