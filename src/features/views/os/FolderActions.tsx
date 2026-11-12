import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { useFolderDrag } from "./FolderDrag";
import { folderParent, isFolder, isRecycled, useFolderOrganization, type FolderId } from "./folderOrganization";
import { useOsSettings } from "./settings/osSettings";
import type { OsActions } from "./types";

type Editing = { id: FolderId; scope: string };
type Menu = { x: number; y: number; parent: FolderId | null; id?: string; scope: string; opener: HTMLElement };
type FolderActionsApi = {
  editing: Editing | null;
  menu: Menu | null;
  create: (parent: FolderId | null) => void;
  rename: (id: FolderId, scope: string) => void;
  finish: (cancel?: boolean) => void;
  showMenu: (menu: Menu) => void;
  closeMenu: (focus?: boolean) => void;
  open: (id: string) => void;
  remove: (id: FolderId) => void;
};
const Context = createContext<FolderActionsApi | null>(null);

export function useFolderActions() {
  const value = useContext(Context);
  if (!value) throw new Error("useFolderActions must be used inside FolderActionsProvider");
  return value;
}

function surface(target: EventTarget | null) {
  if (!(target instanceof HTMLElement) || target.closest("input, textarea, select, [contenteditable], .os-welcome")) return;
  const desktop = target.closest(".os-desktop");
  const folder = target.closest<HTMLElement>(".os-folder-window");
  if (!desktop || (target.closest(".os-win") && !folder)) return;
  const container = folder ?? target.closest<HTMLElement>("[data-entry-container]") ?? desktop;
  const entry = target.closest<HTMLElement>("[data-entry-id]");
  if (!entry && target.closest("button, a")) return;
  const parent = folder?.dataset.folderDrop ?? null;
  const scope = parent ?? (target.closest(".os-home") ? "home" : "desktop");
  return { parent, scope, id: entry?.dataset.entryId, container };
}

export function FolderActionsProvider({ actions, children }: { actions: OsActions; children: ReactNode }) {
  const { organization, createFolder, clearError, deleteFolder } = useFolderOrganization();
  const { phone } = useOsSettings();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const create = useCallback((parent: FolderId | null) => {
    const id = createFolder(parent);
    if (!id) return;
    if (parent === null) actions.home();
    else actions.openEntry(parent);
    setMenu(null);
    setEditing({ id, scope: parent ?? (phone ? "home" : "desktop") });
  }, [actions, createFolder, phone]);
  const rename = useCallback((id: FolderId, scope: string) => {
    clearError();
    setMenu(null);
    setEditing({ id, scope });
  }, [clearError]);
  const closeMenu = useCallback((focus = true) => {
    if (focus && menu?.opener.isConnected) menu.opener.focus({ preventScroll: true });
    setMenu(null);
  }, [menu]);
  const remove = useCallback((id: FolderId) => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.closest<HTMLElement>(".os-folder-window, [data-entry-container]")?.focus({ preventScroll: true });
    deleteFolder(id);
    setMenu(null);
    setEditing(null);
  }, [deleteFolder]);

  useEffect(() => {
    const contextMenu = (event: MouseEvent) => {
      const location = surface(event.target);
      if (!location || !(event.target instanceof HTMLElement)) return;
      event.preventDefault();
      const opener = event.target.closest<HTMLElement>("[data-entry-id]") ?? location.container;
      if (!(opener instanceof HTMLElement)) return;
      setMenu({ ...location, x: event.clientX, y: event.clientY, opener });
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const location = surface(event.target);
      if (!location || !(event.target instanceof HTMLElement)) return;
      const { id, parent, scope } = location;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        create(parent);
      } else if (event.key === "F2" && id && isFolder(organization, id)) {
        event.preventDefault();
        rename(id, scope);
      } else if (event.key === "Delete" && id && isFolder(organization, id)) {
        event.preventDefault();
        remove(id);
      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const rect = event.target.getBoundingClientRect();
        setMenu({ ...location, x: rect.left, y: rect.bottom, opener: event.target });
      }
    };
    document.addEventListener("contextmenu", contextMenu);
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("keydown", keyDown);
    };
  }, [organization, create, rename, remove]);

  return <Context.Provider value={{ editing, menu, create, rename, finish: (cancel) => { setEditing(null); if (cancel) clearError(); }, showMenu: setMenu, closeMenu, open: actions.openEntry, remove }}>{children}</Context.Provider>;
}

function NameInput({ id, name }: { id: FolderId; name: string }) {
  const { renameFolder } = useFolderOrganization();
  const { finish } = useFolderActions();
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.select(); }, []);
  const end = (cancel = false) => {
    if (done.current || (!cancel && !renameFolder(id, value))) return;
    done.current = true;
    const icon = ref.current?.parentElement?.querySelector<HTMLElement>("[data-entry-id]")
      ?? ref.current?.closest(".os-folder-window")?.querySelector<HTMLElement>(".os-folder-toolbar .os-folder-more");
    finish(cancel);
    icon?.focus({ preventScroll: true });
  };
  return (
    <input ref={ref} className="os-folder-name" aria-label="Folder name" value={value} maxLength={32} autoFocus
      onChange={(event) => setValue(event.target.value)} onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); end(event.key === "Escape"); }
      }}
      onBlur={() => end()} />
  );
}

export function FolderNameEditor({ id, scope }: Editing) {
  const { editing } = useFolderActions();
  const { organization } = useFolderOrganization();
  return editing?.id === id && editing.scope === scope && organization.folders[id]
    ? <NameInput key={id} id={id} name={organization.folders[id].name} /> : null;
}

export function FolderMenuButton({ id, scope }: Editing) {
  const { showMenu } = useFolderActions();
  const { organization } = useFolderOrganization();
  return (
    <button type="button" className="os-folder-more" aria-label={`Actions for ${organization.folders[id].name}`} aria-haspopup="menu" onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      showMenu({ id, scope, parent: folderParent(organization, id), x: rect.left, y: rect.bottom, opener: event.currentTarget });
    }}><MoreHorizontal size={16} aria-hidden="true" /></button>
  );
}

export function FolderActionLayer() {
  const { menu, closeMenu, create, rename, open, remove } = useFolderActions();
  const { organization } = useFolderOrganization();
  const { cutEntries, pasteEntries, clipboard } = useFolderDrag();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const element = ref.current;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(4, Math.min(menu.x, window.innerWidth - rect.width - 4))}px`;
    element.style.top = `${Math.max(4, Math.min(menu.y, window.innerHeight - rect.height - 4))}px`;
    element.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: Event) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) closeMenu(false); };
    const cancel = () => closeMenu();
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
    };
  }, [menu, closeMenu]);
  if (!menu) return null;
  const { id, scope, parent } = menu;
  const folder = id && isFolder(organization, id) && !isRecycled(organization, id);
  const act = (action: () => void) => { closeMenu(); action(); };
  return (
    <div ref={ref} role="menu" aria-label="Folder actions" className="os-folder-menu" style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => {
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")];
      const index = items.findIndex((item) => item === document.activeElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        closeMenu();
      }
    }}>
      {id && <button type="button" role="menuitem" onClick={() => act(() => open(id))}>Open</button>}
      {!id && <button type="button" role="menuitem" onClick={() => act(() => create(parent))}>New folder <kbd>Ctrl/Cmd+Shift+N</kbd></button>}
      {folder && <button type="button" role="menuitem" onClick={() => act(() => rename(id, scope))}>Rename <kbd>F2</kbd></button>}
      {id && id !== "recyclebin" && <button type="button" role="menuitem" onClick={() => act(() => cutEntries([id]))}>Cut <kbd>Ctrl/Cmd+X</kbd></button>}
      {(!id || folder) && <button type="button" role="menuitem" disabled={!clipboard.length} onClick={() => act(() => pasteEntries(folder ? id : parent))}>Paste <kbd>Ctrl/Cmd+V</kbd></button>}
      {folder && <button type="button" role="menuitem" disabled={!id.startsWith("custom-folder-")} onClick={() => act(() => remove(id))}>Move to Recycle Bin <kbd>Delete</kbd></button>}
      {!id && <button type="button" role="menuitem" onClick={() => act(() => open("recyclebin"))}>Open Recycle Bin</button>}
    </div>
  );
}
