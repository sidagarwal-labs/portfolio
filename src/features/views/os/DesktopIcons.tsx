import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Folder, type LucideIcon } from "lucide-react";
import { apps, desktopDocuments, desktopRows, type AppId } from "./apps";
import { defaultDesktopGroups, type EntryId, type FolderOrganization } from "./folderOrganization";
import { useFolderDrag } from "./FolderDrag";
import type { DeskSize } from "./types";
import { clamp } from "./OsWindow";
import { noteBox } from "./WelcomeNote";
import { FolderMenuButton, FolderNameEditor } from "./FolderActions";

export const iconCell = 92;
export const iconAreaWidth = 8 + Math.max(desktopDocuments.length, ...desktopRows.map((row) => row.length)) * iconCell;
type Position = { col: number; row: number };
type Positions = Partial<Record<EntryId, Position>>;
const cellKey = ({ col, row }: Position) => `${col},${row}`;
// Version the layout once; subsequent manual arrangements keep their normal persistence.
const key = "lab-os-icons-v3";

function readPositions(): Positions {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!raw || typeof raw !== "object") throw new Error("Invalid saved desktop layout");
    const result: Positions = {};
    for (const id of Object.keys(raw)) {
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

/* Grid cells the welcome note covers in the top-right corner of the desktop. The icon list is inset 8px from the desktop. */
function noteCells(desk: DeskSize, columns: number, rows: number) {
  const cells = new Set<string>();
  const right = desk.w - noteBox.right - 8;
  const left = right - noteBox.width;
  const top = noteBox.top - 8;
  const bottom = top + noteBox.height;
  for (let col = 0; col < columns; col += 1) {
    if (col * iconCell >= right || (col + 1) * iconCell <= left) continue;
    for (let row = 0; row < rows; row += 1) if (row * iconCell < bottom && (row + 1) * iconCell > top) cells.add(cellKey({ col, row }));
  }
  return cells;
}

/* Saved icons claim their slots first. An icon with no saved position takes its default slot, or else joins its default
   neighbour wherever the user put it: right of the icon before it in its group (left of the next one if it leads the group).
   Blocked cells (under the welcome note) are never used. */
function layoutIcons(saved: Positions, columns: number, rows: number, root: EntryId[], blocked: Set<string>): Positions {
  const result: Positions = {};
  const taken = new Map<number, EntryId>();
  const slot = (col: number, row: number) => col * rows + row;
  const isBlocked = (col: number, row: number) => blocked.has(cellKey({ col, row }));
  const isFree = (col: number, row: number) => col >= 0 && col < columns && !taken.has(slot(col, row)) && !isBlocked(col, row);
  const put = (id: EntryId, col: number, row: number) => { result[id] = { col, row }; taken.set(slot(col, row), id); };
  const putFirstFree = (id: EntryId) => {
    let next = 0;
    while (taken.has(next) || isBlocked(Math.floor(next / rows), next % rows)) next += 1;
    put(id, Math.floor(next / rows), next % rows);
  };
  /* Moves the run of icons starting at col one column right, if the row has room past its end. */
  const shiftRight = (col: number, row: number) => {
    let end = col;
    while (end < columns && taken.has(slot(end, row))) end += 1;
    if (end >= columns || isBlocked(end, row)) return false;
    for (let from = end - 1; from >= col; from -= 1) {
      const id = taken.get(slot(from, row));
      if (!id) continue;
      taken.delete(slot(from, row));
      put(id, from + 1, row);
    }
    return true;
  };
  const putNearest = (id: EntryId, col: number, row: number, preferRight: boolean) => {
    for (let distance = 0; distance <= columns; distance += 1) {
      for (const candidate of preferRight ? [col + distance, col - distance] : [col - distance, col + distance]) {
        if (isFree(candidate, row)) { put(id, candidate, row); return; }
      }
    }
    putFirstFree(id);
  };

  const groups = defaultDesktopGroups(root).map((ids, row) => ({
    ids,
    row: ids.every((id) => desktopDocuments.includes(id as AppId)) ? rows - 1 : row
  }));
  const layout = groups.flatMap(({ ids, row }) => ids.map((id, col) => ({ id, ids, col: clamp(col, 0, columns - 1), row: clamp(row, 0, rows - 1) })));
  for (const { id } of layout) {
    const position = saved[id];
    if (!position) continue;
    const col = clamp(position.col, 0, columns - 1);
    const row = clamp(position.row, 0, rows - 1);
    if (isFree(col, row)) put(id, col, row);
    else if (isBlocked(col, row)) putNearest(id, col, row, false);
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

type Box = { left: number; top: number; width: number; height: number };

function DesktopIcons({ desk, open, reset, organization, note }: { desk: DeskSize; open: (id: EntryId) => void; reset: number; organization: FolderOrganization; note: boolean }) {
  const { startDrag, consumeClick, clipboard, handleKeys, registerDesktopMove } = useFolderDrag();
  const [saved, setSaved] = useState(readPositions);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<EntryId[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const listRef = useRef<HTMLUListElement>(null);
  const lastReset = useRef(reset);
  const columns = Math.max(1, Math.floor((desk.w - 16) / iconCell));
  const rows = Math.max(1, Math.floor((desk.h - 16) / iconCell));
  const blocked = useMemo(() => (note ? noteCells(desk, columns, rows) : new Set<string>()), [note, desk, columns, rows]);
  const positions = useMemo(() => layoutIcons(saved, columns, rows, organization.root, blocked), [saved, rows, columns, organization.root, blocked]);

  useEffect(() => {
    setSelected((current) => current.filter((id) => organization.root.includes(id)));
  }, [organization.root]);

  useEffect(() => {
    if (lastReset.current === reset) return;
    lastReset.current = reset;
    setSaved({});
    try { localStorage.removeItem(key); setNotice("Icons arranged."); }
    catch (error) { console.warn("Desktop layout could not be saved.", error); setNotice("Icons arranged for this session; browser storage is unavailable."); }
  }, [reset]);

  /* Pointer down on empty desktop clears the selection; dragging draws a selection box over the icons it touches. */
  useEffect(() => {
    const list = listRef.current;
    const desktop = list?.parentElement;
    if (!list || !desktop) return;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target !== desktop && !(event.target instanceof HTMLLIElement && list.contains(event.target)))) return;
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      const base = additive ? selectedRef.current : [];
      setSelected(base);
      if (!additive && document.activeElement instanceof HTMLElement && list.contains(document.activeElement)) document.activeElement.blur();
      if (event.pointerType === "touch") return;
      event.preventDefault();
      desktop.setPointerCapture(event.pointerId);
      const bounds = desktop.getBoundingClientRect();
      const icons = [...list.querySelectorAll<HTMLElement>(".os-icon")].map((icon) => ({ id: icon.dataset.entryId as EntryId, rect: icon.getBoundingClientRect() }));
      const x = clamp(event.clientX - bounds.left, 0, bounds.width);
      const y = clamp(event.clientY - bounds.top, 0, bounds.height);
      let active = false;
      const move = (pointer: PointerEvent) => {
        if (pointer.pointerId !== event.pointerId) return;
        const px = clamp(pointer.clientX - bounds.left, 0, bounds.width);
        const py = clamp(pointer.clientY - bounds.top, 0, bounds.height);
        if (!active && Math.hypot(px - x, py - y) < 4) return;
        if (!active) desktop.classList.add("is-dragging");
        active = true;
        const box = { left: Math.min(x, px), top: Math.min(y, py), width: Math.abs(px - x), height: Math.abs(py - y) };
        setMarquee(box);
        const left = bounds.left + box.left;
        const top = bounds.top + box.top;
        const hits = icons.filter(({ rect }) => rect.left < left + box.width && rect.right > left && rect.top < top + box.height && rect.bottom > top).map(({ id }) => id);
        setSelected(organization.root.filter((id) => base.includes(id) || hits.includes(id)));
      };
      const finish = () => {
        desktop.removeEventListener("pointermove", move);
        desktop.removeEventListener("pointerup", finish);
        desktop.removeEventListener("pointercancel", finish);
        desktop.removeEventListener("lostpointercapture", finish);
        desktop.classList.remove("is-dragging");
        setMarquee(null);
        if (active) window.requestAnimationFrame(() => list.querySelector<HTMLElement>(".os-icon[aria-pressed='true']")?.focus({ preventScroll: true }));
      };
      desktop.addEventListener("pointermove", move);
      desktop.addEventListener("pointerup", finish);
      desktop.addEventListener("pointercancel", finish);
      desktop.addEventListener("lostpointercapture", finish);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !selectedRef.current.length) return;
      if (event.target === document.body || event.target === desktop || list.contains(event.target as Node)) setSelected([]);
    };
    desktop.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      desktop.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [organization.root]);

  const savePositions = useCallback((next: Positions) => {
    setSaved(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setNotice(""); }
    catch (error) { console.warn("Desktop layout could not be saved.", error); setNotice("Icon positions changed for this session; browser storage is unavailable."); }
  }, []);

  /* Moves icons by a whole number of cells, keeping their spacing; icons in the way take the cells the group left.
     Returns false when the move would put an icon under the welcome note. */
  const moveIcons = useCallback((ids: EntryId[], by: Position) => {
    const from = ids.flatMap((id) => (positions[id] ? [{ id, at: positions[id] }] : []));
    if (!from.length) return true;
    const col = clamp(by.col, -Math.min(...from.map(({ at }) => at.col)), columns - 1 - Math.max(...from.map(({ at }) => at.col)));
    const row = clamp(by.row, -Math.min(...from.map(({ at }) => at.row)), rows - 1 - Math.max(...from.map(({ at }) => at.row)));
    if (!col && !row) return true;
    const next: Positions = { ...saved, ...positions };
    const targets = new Set(from.map(({ at }) => cellKey({ col: at.col + col, row: at.row + row })));
    if ([...targets].some((cell) => blocked.has(cell))) {
      setNotice("The welcome note is using that spot.");
      return false;
    }
    const vacated = from.map(({ at }) => at).filter((at) => !targets.has(cellKey(at)));
    for (const { id, at } of from) next[id] = { col: at.col + col, row: at.row + row };
    for (const other of organization.root) {
      const at = positions[other];
      if (ids.includes(other) || !at || !targets.has(cellKey(at))) continue;
      const nearest = vacated.reduce((best, cell, index) => (Math.abs(cell.col - at.col) + Math.abs(cell.row - at.row) < Math.abs(vacated[best].col - at.col) + Math.abs(vacated[best].row - at.row) ? index : best), 0);
      next[other] = vacated.splice(nearest, 1)[0];
    }
    savePositions(next);
    return true;
  }, [positions, saved, organization.root, columns, rows, blocked, savePositions]);

  useLayoutEffect(() => registerDesktopMove(({ ids, destination, point, start }) => {
    if (destination === null && point && start && ids.every((id) => organization.root.includes(id))) {
      return moveIcons(ids, { col: Math.round((point.x - start.x) / iconCell), row: Math.round((point.y - start.y) / iconCell) });
    }
    const next = { ...saved, ...positions };
    const bounds = listRef.current?.getBoundingClientRect();
    if (destination === null) {
      const incoming = ids.filter((id) => !organization.root.includes(id));
      const occupied = new Set(organization.root.flatMap((id) => !ids.includes(id) && positions[id] ? [cellKey(positions[id])] : []));
      const slots = Array.from({ length: columns * rows }, (_, index) => ({ col: Math.floor(index / rows), row: index % rows }))
        .filter((slot) => !occupied.has(cellKey(slot)) && !blocked.has(cellKey(slot)));
      if (incoming.length > slots.length) {
        setNotice("The desktop is full. Move some items into folders first.");
        return false;
      }
      for (const id of incoming) {
        const preferred = point && bounds
          ? { col: clamp(Math.floor((point.x - bounds.left) / iconCell), 0, columns - 1), row: clamp(Math.floor((point.y - bounds.top) / iconCell), 0, rows - 1) }
          : saved[id] ?? { col: 0, row: 0 };
        slots.sort((a, b) => (Math.abs(a.col - preferred.col) + Math.abs(a.row - preferred.row)) - (Math.abs(b.col - preferred.col) + Math.abs(b.row - preferred.row)));
        next[id] = slots.shift();
      }
    }
    // Keep positions for items inside folders too, so cut/paste can restore their previous desktop slots.
    savePositions(next);
    return true;
  }), [registerDesktopMove, saved, positions, organization.root, columns, rows, blocked, moveIcons, savePositions]);

  return (
    <>
      <p className="sr-only" id="os-icon-help">Click to open. Right-click for actions; Ctrl or Command Shift N creates a folder, F2 renames, and Delete moves a custom folder to the Recycle Bin. Drag to arrange icons or move them into and out of folders. Shift and arrow keys move the focused icon. Drag across the desktop or Control-click icons to select several; Enter opens them and Escape clears the selection. Ctrl or Command X cuts items; Ctrl or Command V pastes them here.</p>
      {marquee && <div className="os-marquee" aria-hidden="true" style={marquee} />}
      <ul ref={listRef} className="os-icons" aria-label="Desktop" aria-describedby="os-icon-help" data-entry-container tabIndex={0} onKeyDown={(event) => handleKeys(event, null, selected)}>
        {organization.root.map((id) => {
          const folder = organization.folders[id];
          const def = folder
            ? { icon: Folder as LucideIcon, label: folder.name, blurb: `${folder.items.length} items`, tint: apps.projects.tint }
            : apps[id as AppId];
          const Icon = def.icon;
          const position = positions[id];
          const isSelected = selected.includes(id);
          return (
            <li key={id} style={{ left: (position?.col ?? 0) * iconCell, top: (position?.row ?? 0) * iconCell }}>
              <button type="button" className={`os-icon${isSelected ? " is-selected" : ""}${clipboard.includes(id) ? " is-cut" : ""}`} data-app={id} data-entry-id={id} data-folder-drop={folder ? id : undefined} aria-label={def.label} aria-pressed={isSelected} title={def.blurb} onPointerDown={(event) => {
                const group = selected.length > 1 && selected.includes(id) ? selected : [id];
                startDrag(event, group, () => { if (group.length === 1) setSelected([]); });
              }}
                onClick={(event) => {
                  if (consumeClick(event)) return;
                  if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    setSelected(isSelected ? selected.filter((other) => other !== id) : organization.root.filter((other) => other === id || selected.includes(other)));
                    return;
                  }
                  setSelected([]);
                  open(id);
                }} onKeyDown={(event) => {
                  if (event.key === "Enter" && isSelected && selected.length > 1) {
                    event.preventDefault();
                    for (const member of selected) open(member);
                    return;
                  }
                  if (!event.shiftKey || !position || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  moveIcons([id], { col: event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0, row: event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0 });
                }}>
                <span className="os-icon__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={26} strokeWidth={1.7} /></span>
                <span className="os-icon__label">{def.label}</span>
              </button>
              {folder && <><FolderNameEditor id={id} scope="desktop" /><FolderMenuButton id={id} scope="desktop" /></>}
            </li>
          );
        })}
      </ul>
      {notice && <p className="os-desktop-notice" role="status">{notice}</p>}
    </>
  );
}

export default DesktopIcons;
