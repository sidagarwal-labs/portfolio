import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { apps, desktopApps, desktopDocuments, desktopRows, type AppId } from "./apps";
import type { DeskSize } from "./types";
import { clamp } from "./OsWindow";

export const iconCell = 92;
export const iconAreaWidth = 8 + Math.max(desktopDocuments.length, ...desktopRows.map((row) => row.length)) * iconCell;
type Position = { col: number; row: number };
type Positions = Partial<Record<AppId, Position>>;
// Version the layout once; subsequent manual arrangements keep their normal persistence.
const key = "lab-os-icons-v3";

function readPositions(): Positions {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!raw || typeof raw !== "object") throw new Error("Invalid saved desktop layout");
    const result: Positions = {};
    for (const id of desktopApps) {
      const value: unknown = Reflect.get(raw, id);
      if (!value || typeof value !== "object" || !("col" in value) || !("row" in value)) continue;
      if (typeof value.col === "number" && typeof value.row === "number" && Number.isInteger(value.col) && Number.isInteger(value.row) && value.col >= 0 && value.row >= 0) result[id] = { col: value.col, row: value.row };
    }
    return result;
  } catch (error) {
    console.warn("Saved desktop icon positions could not be read.", error);
    return {};
  }
}

/* Saved icons claim their slots first. An icon with no saved position takes its default slot, or else joins its default
   neighbour wherever the user put it: right of the icon before it in its group (left of the next one if it leads the group). */
function layoutIcons(saved: Positions, columns: number, rows: number): Positions {
  const result: Positions = {};
  const taken = new Map<number, AppId>();
  const slot = (col: number, row: number) => col * rows + row;
  const isFree = (col: number, row: number) => col >= 0 && col < columns && !taken.has(slot(col, row));
  const put = (id: AppId, col: number, row: number) => { result[id] = { col, row }; taken.set(slot(col, row), id); };
  const putFirstFree = (id: AppId) => {
    let next = 0;
    while (taken.has(next)) next += 1;
    put(id, Math.floor(next / rows), next % rows);
  };
  /* Moves the run of icons starting at col one column right, if the row has room past its end. */
  const shiftRight = (col: number, row: number) => {
    let end = col;
    while (end < columns && taken.has(slot(end, row))) end += 1;
    if (end >= columns) return false;
    for (let from = end - 1; from >= col; from -= 1) {
      const id = taken.get(slot(from, row));
      if (!id) continue;
      taken.delete(slot(from, row));
      put(id, from + 1, row);
    }
    return true;
  };
  const putNearest = (id: AppId, col: number, row: number, preferRight: boolean) => {
    for (let distance = 0; distance <= columns; distance += 1) {
      for (const candidate of preferRight ? [col + distance, col - distance] : [col - distance, col + distance]) {
        if (isFree(candidate, row)) { put(id, candidate, row); return; }
      }
    }
    putFirstFree(id);
  };

  const groups = [...desktopRows.map((ids, row) => ({ ids, row })), { ids: desktopDocuments, row: rows - 1 }];
  const layout = groups.flatMap(({ ids, row }) => ids.map((id, col) => ({ id, ids, col: clamp(col, 0, columns - 1), row: clamp(row, 0, rows - 1) })));
  for (const { id } of layout) {
    const position = saved[id];
    if (!position) continue;
    const col = clamp(position.col, 0, columns - 1);
    const row = clamp(position.row, 0, rows - 1);
    if (isFree(col, row)) put(id, col, row);
    else putFirstFree(id);
  }

  /* Returns false to retry once the neighbour has a place (when both icons are new); the retry places it regardless. */
  const placeNew = ({ id, ids, col, row }: (typeof layout)[number], final: boolean) => {
    if (isFree(col, row)) { put(id, col, row); return true; }
    const index = ids.indexOf(id);
    const leads = index === 0;
    const neighbourId = leads ? ids[1] : ids[index - 1];
    const neighbour = neighbourId ? result[neighbourId] : undefined;
    if (!neighbour) {
      if (!final) return false;
      putNearest(id, col, row, true);
    } else if (!leads) {
      const after = neighbour.col + 1;
      if (after < columns && shiftRight(after, neighbour.row)) put(id, after, neighbour.row);
      else putNearest(id, after, neighbour.row, true);
    } else if (isFree(neighbour.col - 1, neighbour.row)) {
      put(id, neighbour.col - 1, neighbour.row);
    } else if (shiftRight(neighbour.col, neighbour.row)) {
      put(id, neighbour.col, neighbour.row);
    } else {
      putNearest(id, neighbour.col - 1, neighbour.row, false);
    }
    return true;
  };
  const waiting: typeof layout = [];
  for (const item of layout) if (!saved[item.id] && !placeNew(item, false)) waiting.push(item);
  for (const item of waiting) placeNew(item, true);
  return result;
}

function DesktopIcons({ desk, open, reset }: { desk: DeskSize; open: (id: AppId) => void; reset: number }) {
  const [saved, setSaved] = useState(readPositions);
  const [notice, setNotice] = useState("");
  const suppressClick = useRef<AppId | null>(null);
  const lastReset = useRef(reset);
  const columns = Math.max(1, Math.floor((desk.w - 16) / iconCell));
  const rows = Math.max(1, Math.floor((desk.h - 16) / iconCell));
  const positions = useMemo(() => layoutIcons(saved, columns, rows), [saved, rows, columns]);

  useEffect(() => {
    if (lastReset.current === reset) return;
    lastReset.current = reset;
    setSaved({});
    try { localStorage.removeItem(key); setNotice("Icons arranged."); }
    catch (error) { console.warn("Desktop layout could not be saved.", error); setNotice("Icons arranged for this session; browser storage is unavailable."); }
  }, [reset]);

  const moveIcon = (id: AppId, destination: Position) => {
    const target = { col: clamp(destination.col, 0, columns - 1), row: clamp(destination.row, 0, rows - 1) };
    const occupied = desktopApps.find((other) => other !== id && positions[other]?.col === target.col && positions[other]?.row === target.row);
    const next = { ...positions, [id]: target, ...(occupied ? { [occupied]: positions[id] } : {}) };
    setSaved(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setNotice(""); }
    catch (error) { console.warn("Desktop layout could not be saved.", error); setNotice("Icon positions changed for this session; browser storage is unavailable."); }
  };

  const drag = (event: ReactPointerEvent<HTMLButtonElement>, id: AppId) => {
    if (event.button !== 0) return;
    const button = event.currentTarget;
    const tile = button.parentElement;
    const start = positions[id];
    if (!tile || !start) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    const x = event.clientX;
    const y = event.clientY;
    let dx = 0;
    let dy = 0;
    let moved = false;
    const move = (pointer: PointerEvent) => {
      dx = pointer.clientX - x;
      dy = pointer.clientY - y;
      moved ||= Math.hypot(dx, dy) > 5;
      if (moved) { tile.style.transform = `translate(${dx}px, ${dy}px)`; tile.style.zIndex = "1"; }
    };
    const cleanup = () => {
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerup", finish);
      button.removeEventListener("pointercancel", cleanup);
      button.removeEventListener("lostpointercapture", cleanup);
      tile.style.transform = "";
      tile.style.zIndex = "";
    };
    const finish = () => {
      cleanup();
      if (moved) {
        suppressClick.current = id;
        moveIcon(id, { col: start.col + Math.round(dx / iconCell), row: start.row + Math.round(dy / iconCell) });
        window.setTimeout(() => { suppressClick.current = null; }, 0);
      }
    };
    button.addEventListener("pointermove", move);
    button.addEventListener("pointerup", finish);
    button.addEventListener("pointercancel", cleanup);
    button.addEventListener("lostpointercapture", cleanup);
  };

  return (
    <>
      <p className="sr-only" id="os-icon-help">Click to open. Drag to move icons; they snap to the grid. Shift and arrow keys also move the focused icon.</p>
      <ul className="os-icons" aria-label="Desktop" aria-describedby="os-icon-help">
        {desktopApps.map((id) => {
          const Icon = apps[id].icon;
          const position = positions[id];
          return (
            <li key={id} style={{ left: (position?.col ?? 0) * iconCell, top: (position?.row ?? 0) * iconCell }}>
              <button type="button" className="os-icon" title={apps[id].blurb} onPointerDown={(event) => drag(event, id)}
                onClick={() => { if (suppressClick.current !== id) open(id); }} onKeyDown={(event) => {
                  if (!event.shiftKey || !position || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  moveIcon(id, { col: position.col + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0), row: position.row + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0) });
                }}>
                <span className="os-icon__tile" style={{ "--tint": apps[id].tint } as CSSProperties} aria-hidden="true"><Icon size={26} strokeWidth={1.7} /></span>
                <span className="os-icon__label">{apps[id].label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {notice && <p className="os-desktop-notice" role="status">{notice}</p>}
    </>
  );
}

export default DesktopIcons;
