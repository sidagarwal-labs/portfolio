import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { apps, desktopApps, desktopDocuments, desktopRows, type AppId } from "./apps";
import type { DeskSize } from "./types";
import { clamp } from "./OsWindow";

export const iconCell = 92;
export const iconAreaWidth = 8 + Math.max(desktopDocuments.length, ...desktopRows.map((row) => row.length)) * iconCell;
type Position = { col: number; row: number };
type Positions = Partial<Record<AppId, Position>>;
// Version the layout once; subsequent manual arrangements keep their normal persistence.
const key = "lab-os-icons-v2";

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

function DesktopIcons({ desk, open, reset }: { desk: DeskSize; open: (id: AppId) => void; reset: number }) {
  const [saved, setSaved] = useState(readPositions);
  const [notice, setNotice] = useState("");
  const suppressClick = useRef<AppId | null>(null);
  const lastReset = useRef(reset);
  const columns = Math.max(1, Math.floor((desk.w - 16) / iconCell));
  const rows = Math.max(1, Math.floor((desk.h - 16) / iconCell));
  const positions = useMemo(() => {
    const result: Positions = {};
    const used = new Set<number>();
    const layout = [
      ...desktopRows.flatMap((items, row) => items.map((id, col) => ({ id, col, row }))),
      ...desktopDocuments.map((id, col) => ({ id, col, row: rows - 1 }))
    ];
    /* Saved icons claim their slots first, so an icon added later takes a free slot instead of moving the user's icons. */
    const ordered = [...layout.filter(({ id }) => saved[id]), ...layout.filter(({ id }) => !saved[id])];
    for (const { id, col, row } of ordered) {
      const desired = saved[id] ?? { col, row };
      let slot = clamp(desired.col, 0, columns - 1) * rows + clamp(desired.row, 0, rows - 1);
      if (used.has(slot)) {
        slot = 0;
        while (used.has(slot)) slot += 1;
      }
      used.add(slot);
      result[id] = { col: Math.floor(slot / rows), row: slot % rows };
    }
    return result;
  }, [saved, rows, columns]);

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
