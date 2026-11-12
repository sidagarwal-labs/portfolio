import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Folder } from "lucide-react";
import { apps, type AppId } from "./apps";
import { entryLabel, folderMoveError, folderParent, isFolder, recycleBinId, recycleError, useFolderOrganization, type EntryId, type FolderId, type FolderOrganization } from "./folderOrganization";

type Point = { x: number; y: number };
/* A destination of recycleBinId moves the items to the Recycle Bin. */
type Transfer = { ids: EntryId[]; destination: FolderId | null; point?: Point; start?: Point };
type DropTarget = { element: HTMLElement; parent: FolderId | null };
type DragPreview = { ids: EntryId[]; point: Point; message: string; invalid: boolean };
type FolderDragApi = {
  preview: DragPreview | null;
  clipboard: EntryId[];
  notice: string;
  startDrag: (event: PointerEvent<HTMLButtonElement>, ids: EntryId[], onBegin?: () => void) => void;
  consumeClick: (event: MouseEvent) => boolean;
  cutEntries: (ids: EntryId[]) => void;
  pasteEntries: (parent: FolderId | null) => void;
  recycle: (ids: EntryId[]) => void;
  handleKeys: (event: KeyboardEvent<HTMLElement>, parent: FolderId | null, selected?: EntryId[]) => void;
  registerDesktopMove: (handler: (transfer: Transfer) => boolean) => () => void;
  dismiss: () => void;
};

const FolderDragContext = createContext<FolderDragApi | null>(null);
const pasteHint = "Paste works on the desktop, in a folder, or in the Recycle Bin. Click one of them, then press Ctrl/Cmd+V.";

function isTextField(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}

function dropError(organization: FolderOrganization, ids: EntryId[], parent: FolderId | null) {
  return parent === recycleBinId ? recycleError(organization, ids) : folderMoveError(organization, ids, parent);
}

function targetAt(point: Point): DropTarget | null {
  const hit = document.elementFromPoint(point.x, point.y);
  const element = hit?.closest<HTMLElement>("[data-folder-drop]");
  if (!element) return null;
  // A covered desktop/folder is not a target through another app's window.
  const window = hit?.closest(".os-win");
  if (window && !window.contains(element)) return null;
  const id = element.dataset.folderDrop;
  return id === undefined ? null : { element, parent: id === "desktop" ? null : id };
}

export function FolderDragProvider({ children }: { children: ReactNode }) {
  const folders = useFolderOrganization();
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [clipboard, setClipboard] = useState<EntryId[]>([]);
  const [notice, setNotice] = useState("");
  const current = useRef(folders);
  current.current = folders;
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressedClick = useRef(false);
  const desktopMove = useRef<((transfer: Transfer) => boolean) | null>(null);
  const lastPointer = useRef<Element | null>(null);

  useEffect(() => {
    const resetClick = (event: globalThis.PointerEvent) => {
      suppressedClick.current = false;
      lastPointer.current = event.target instanceof Element ? event.target : null;
    };
    document.addEventListener("pointerdown", resetClick, true);
    return () => {
      document.removeEventListener("pointerdown", resetClick, true);
      cleanupRef.current?.();
    };
  }, []);

  const registerDesktopMove = useCallback((handler: (transfer: Transfer) => boolean) => {
    desktopMove.current = handler;
    return () => { if (desktopMove.current === handler) desktopMove.current = null; };
  }, []);

  const transfer = useCallback((request: Transfer) => {
    const { organization, moveEntries, recycleEntries } = current.current;
    const toBin = request.destination === recycleBinId;
    const changed = toBin || request.ids.some((id) => folderParent(organization, id) !== request.destination);
    const touchesDesktop = request.destination === null || request.ids.some((id) => organization.root.includes(id));
    if (dropError(organization, request.ids, request.destination)) {
      if (toBin) recycleEntries(request.ids);
      else moveEntries(request.ids, request.destination);
      return;
    }
    // The desktop records every icon's slot first, so recycled or moved icons can return to where they were.
    if (touchesDesktop && desktopMove.current?.(request) === false) return;
    if (!(toBin ? recycleEntries(request.ids) : moveEntries(request.ids, request.destination))) return;
    // Recycling something else leaves an unrelated cut selection in place, as in a file manager.
    setClipboard((cut) => (toBin ? cut.filter((id) => !request.ids.includes(id)) : []));
    if (changed) {
      const label = request.ids.length === 1 ? entryLabel(organization, request.ids[0]) : `${request.ids.length} items`;
      const destination = request.destination === null ? "Desktop" : toBin ? "Recycle Bin" : organization.folders[request.destination].name;
      setNotice(`Moved ${label} to ${destination}.`);
    } else setNotice("");
  }, []);

  const startDrag = useCallback((event: PointerEvent<HTMLButtonElement>, ids: EntryId[], onBegin?: () => void) => {
    if (event.button !== 0 || !event.isPrimary || !ids.length) return;
    cleanupRef.current?.();
    suppressedClick.current = false;
    const button = event.currentTarget;
    const container = button.closest("[data-entry-container]");
    const icons = [...(container?.querySelectorAll<HTMLElement>("[data-entry-id]") ?? [])].filter((icon) => ids.includes(icon.dataset.entryId ?? ""));
    const desktop = button.closest(".os-desktop");
    const start = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    let active = false;
    let target: DropTarget | null = null;
    event.preventDefault();
    button.focus({ preventScroll: true });
    button.setPointerCapture(pointerId);

    const clearTarget = () => target?.element.removeAttribute("data-drop-state");
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      const point = { x: pointer.clientX, y: pointer.clientY };
      if (!active && Math.hypot(point.x - start.x, point.y - start.y) < 5) return;
      if (!active) {
        active = true;
        onBegin?.();
        desktop?.classList.add("is-moving-entry");
        icons.forEach((icon) => icon.setAttribute("data-entry-dragging", "true"));
        setNotice("");
        current.current.clearError();
      }
      clearTarget();
      target = targetAt(point);
      const hit = target;
      const { organization } = current.current;
      const invalid = hit ? dropError(organization, ids, hit.parent) : "";
      hit?.element.setAttribute("data-drop-state", invalid ? "invalid" : "valid");
      const toBin = hit?.parent === recycleBinId;
      const destination = hit?.parent == null ? "Desktop" : toBin ? "Recycle Bin" : organization.folders[hit.parent]?.name;
      // Rearranging within the same place needs no caption, just the floating icon.
      const unchanged = !!hit && !toBin && !invalid && ids.every((id) => folderParent(organization, id) === hit.parent);
      setPreview({
        ids,
        point,
        invalid: !hit || !!invalid,
        message: invalid || (hit ? (unchanged ? "" : `Move to ${destination}`) : "Drop on a folder, the desktop, or the Recycle Bin")
      });
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", cancelPointer, true);
      document.removeEventListener("keydown", cancelKey, true);
      button.removeEventListener("lostpointercapture", cancelPointer);
      window.removeEventListener("blur", cancel);
      clearTarget();
      icons.forEach((icon) => icon.removeAttribute("data-entry-dragging"));
      desktop?.classList.remove("is-moving-entry");
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      cleanupRef.current = null;
      setPreview(null);
    };
    const cancel = () => {
      suppressedClick.current = active;
      cleanup();
      if (active) setNotice("Move cancelled.");
    };
    const cancelPointer = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId === pointerId) cancel();
    };
    const cancelKey = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      cancel();
    };
    const finish = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      const point = { x: pointer.clientX, y: pointer.clientY };
      const destination = active ? targetAt(point) : null;
      suppressedClick.current = active;
      cleanup();
      if (!active) return;
      if (destination) transfer({ ids, destination: destination.parent, point, start });
      else setNotice("Move cancelled. Drop on a folder, the desktop, or the Recycle Bin.");
    };
    cleanupRef.current = cleanup;
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", cancelPointer, true);
    document.addEventListener("keydown", cancelKey, true);
    button.addEventListener("lostpointercapture", cancelPointer);
    window.addEventListener("blur", cancel);
  }, [transfer]);

  const consumeClick = useCallback((event: MouseEvent) => {
    if (!event.detail || !suppressedClick.current) return false;
    suppressedClick.current = false;
    event.preventDefault();
    return true;
  }, []);

  const cutEntries = (ids: EntryId[]) => {
    if (!ids.length) return;
    setClipboard(ids);
    const label = ids.length === 1 ? entryLabel(folders.organization, ids[0]) : `${ids.length} items`;
    setNotice(`${label} cut. Open the destination, then paste with Ctrl/Cmd+V.`);
  };
  const pasteEntries = (parent: FolderId | null) => {
    if (clipboard.length) transfer({ ids: clipboard, destination: parent });
  };
  const recycle = useCallback((ids: EntryId[]) => {
    if (ids.length) transfer({ ids, destination: recycleBinId });
  }, [transfer]);
  const handleKeys = (event: KeyboardEvent<HTMLElement>, parent: FolderId | null, selected: EntryId[] = []) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || isTextField(target)) return;
    const id = target.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId;
    const ids = id && !selected.includes(id) ? [id] : selected;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x" && ids.length) {
      event.preventDefault();
      event.stopPropagation();
      cutEntries(ids);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && clipboard.length) {
      event.preventDefault();
      event.stopPropagation();
      pasteEntries(id === recycleBinId ? recycleBinId : parent);
    } else if (event.key === "Delete" && !event.ctrlKey && !event.metaKey && !event.altKey && ids.length) {
      event.preventDefault();
      event.stopPropagation();
      // Keep focus in this view once the focused icon leaves it.
      event.currentTarget.focus({ preventScroll: true });
      recycle(ids);
    } else if (event.key === "Escape" && clipboard.length) {
      setClipboard([]);
      setNotice("Move cancelled.");
    }
  };
  const dismiss = () => { setNotice(""); folders.clearError(); };

  /* Ctrl/Cmd+V pastes into wherever the keyboard focus is, or else the last place clicked: a folder window,
     the Recycle Bin, or the desktop. Views that handle keys themselves (icon lists, folder windows) paste first. */
  const clipboardRef = useRef(clipboard);
  clipboardRef.current = clipboard;
  useEffect(() => {
    const paste = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "v") return;
      const ids = clipboardRef.current;
      if (!ids.length || isTextField(event.target)) return;
      const focused = event.target instanceof Element && event.target !== document.body && event.target !== document.documentElement ? event.target : null;
      const origin = focused ?? (lastPointer.current?.isConnected ? lastPointer.current : null);
      const win = origin?.closest<HTMLElement>(".os-win");
      const destination = win ? (win.dataset.app === recycleBinId ? recycleBinId : win.dataset.folderId)
        : !origin || origin.closest(".os-desktop") ? null : undefined;
      if (destination === undefined) {
        setNotice(pasteHint);
        return;
      }
      event.preventDefault();
      transfer({ ids, destination });
    };
    document.addEventListener("keydown", paste);
    return () => document.removeEventListener("keydown", paste);
  }, [transfer]);

  return (
    <FolderDragContext.Provider value={{ preview, clipboard, notice, startDrag, consumeClick, cutEntries, pasteEntries, recycle, handleKeys, registerDesktopMove, dismiss }}>
      {children}
    </FolderDragContext.Provider>
  );
}

export function useFolderDrag() {
  const context = useContext(FolderDragContext);
  if (!context) throw new Error("useFolderDrag must be used inside Lab OS");
  return context;
}

export function FolderDragLayer() {
  const { preview, notice, dismiss } = useFolderDrag();
  const { organization, error } = useFolderOrganization();
  const first = preview?.ids[0];
  const def = first && !isFolder(organization, first) ? apps[first as AppId] : apps.projects;
  const Icon = first && isFolder(organization, first) ? Folder : def.icon;
  const count = preview?.ids.length ?? 0;
  // Near the right edge the caption flips to the cursor's left so it never covers the drop target.
  const flipped = !!preview && preview.point.x > window.innerWidth - 270;
  const top = preview ? Math.max(0, Math.min(preview.point.y + 10, window.innerHeight - 64)) : 0;
  return (
    <>
      {preview && first && (
        <div className={`os-entry-drag${preview.invalid ? " is-invalid" : ""}${flipped ? " is-flipped" : ""}`} aria-hidden="true" style={flipped ? { right: window.innerWidth - preview.point.x + 10, top } : { left: preview.point.x + 10, top }}>
          <span className="os-entry-drag__ghost">
            <span className="os-icon__tile" style={{ "--tint": def.tint } as CSSProperties}><Icon size={20} /></span>
            {count > 1 && <span className="os-entry-drag__count">{count}</span>}
          </span>
          {preview.message && <span className="os-entry-drag__label">{preview.message}</span>}
        </div>
      )}
      {(error || notice) && (
        <div className="os-folder-notice" role={error ? "alert" : "status"}>
          <span>{error || notice}</span>
          <button type="button" onClick={dismiss} aria-label="Dismiss folder notification">Dismiss</button>
        </div>
      )}
    </>
  );
}
