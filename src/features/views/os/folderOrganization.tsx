import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { apps, desktopApps, desktopDocuments, desktopRows, menuSections, type AppId } from "./apps";

export type FolderId = string;
export type EntryId = AppId | FolderId;
export type FolderContents = { name: string; items: EntryId[] };
export type RecycledEntry = { id: EntryId; parent: FolderId | null; index: number };
export type FolderOrganization = { root: EntryId[]; folders: Record<FolderId, FolderContents>; trash: RecycledEntry[] };
export type Restored = { name: string; destination: string };

/* The Recycle Bin's entry ID doubles as its drop and paste destination. */
export const recycleBinId: FolderId = "recyclebin";
const storageKey = "lab-os-folders-v1";
const maximumFolders = 40;
const maximumDepth = 8;
const maximumNameLength = 32;
const appIds = Object.keys(apps) as AppId[];
const availableApps = appIds.filter((id) => apps[id].kind !== "folder" && id !== "settings");
const folderIds = appIds.filter((id) => apps[id].kind === "folder");
const menuEntryOrder = menuSections.flatMap((section) => section.label === "System" ? [] : section.items);
const hasOwn = (record: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(record, key);
const defaultOrganization: FolderOrganization = {
  root: [...desktopApps],
  trash: [],
  folders: Object.fromEntries(folderIds.map((id) => {
    const def = apps[id];
    return [id, { name: def.label, items: def.kind === "folder" ? [...def.children] : [] }];
  }))
};

export type FolderOrganizationApi = {
  organization: FolderOrganization;
  saved: boolean;
  createFolder: (parent: FolderId | null, name?: string) => FolderId;
  renameFolder: (id: FolderId, name: string) => boolean;
  recycleEntries: (ids: EntryId[]) => boolean;
  restoreEntry: (id: EntryId) => Restored | undefined;
  restoreAll: () => number;
  moveEntries: (ids: EntryId[], parent: FolderId | null) => boolean;
  restoreDefaults: () => void;
  error: string;
  clearError: () => void;
};

const FolderOrganizationContext = createContext<FolderOrganizationApi | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validName(value: string) {
  const name = value.trim();
  return name.length > 0 && name.length <= maximumNameLength ? name : undefined;
}

function isEntries(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

function validateOrganization(value: unknown): FolderOrganization {
  if (!isRecord(value) || !isEntries(value.root) || !isRecord(value.folders)) throw new Error("Saved folders are malformed.");
  const folders: FolderOrganization["folders"] = {};
  const rawFolders = value.folders;
  const ids = Object.keys(rawFolders);
  if (ids.length > maximumFolders + folderIds.length) throw new Error("Too many saved folders.");
  for (const id of ids) {
    if (!id.startsWith("custom-folder-") && !folderIds.includes(id as AppId)) throw new Error("Saved folder ID is invalid.");
    const folder = rawFolders[id];
    if (!isRecord(folder) || typeof folder.name !== "string" || !isEntries(folder.items)) throw new Error("Saved folder is malformed.");
    const name = validName(folder.name);
    if (!name) throw new Error("Saved folder name is malformed.");
    folders[id] = { name, items: folder.items };
  }
  const trash: RecycledEntry[] = [];
  if (value.trash !== undefined) {
    if (!Array.isArray(value.trash)) throw new Error("Saved Recycle Bin is malformed.");
    // Earlier releases recycled custom folders only; those entries keep the same shape.
    for (const item of value.trash) {
      if (!isRecord(item) || typeof item.id !== "string" || item.id === recycleBinId || (!hasOwn(folders, item.id) && !availableApps.includes(item.id as AppId))
        || (item.parent !== null && typeof item.parent !== "string") || typeof item.index !== "number" || !Number.isInteger(item.index) || item.index < 0) {
        throw new Error("Saved Recycle Bin entry is malformed.");
      }
      trash.push({ id: item.id, parent: item.parent, index: item.index });
    }
  }
  const seen = new Set<string>();
  const visit = (entries: string[], depth: number) => {
    if (depth > maximumDepth) throw new Error("Saved folders are nested too deeply.");
    for (const id of entries) {
      if (seen.has(id)) throw new Error(`Saved item "${id}" appears more than once.`);
      seen.add(id);
      if (hasOwn(folders, id)) {
        visit(folders[id].items, depth + 1);
      } else if (!availableApps.includes(id as AppId)) {
        throw new Error(`Saved item "${id}" is not an available app or folder.`);
      }
    }
  };
  const root = [...value.root];
  visit(root, 0);
  for (const item of trash) visit([item.id], 0);
  // Add the new system shortcut to layouts saved before the Recycle Bin existed.
  if (!seen.has("recyclebin")) { root.push("recyclebin"); seen.add("recyclebin"); }
  if (!root.includes("recyclebin")) throw new Error("Recycle Bin must remain on the desktop.");
  if (seen.size !== availableApps.length + ids.length || availableApps.some((id) => !seen.has(id)) || ids.some((id) => !seen.has(id))) {
    throw new Error("Saved folders must contain every app exactly once.");
  }
  for (const id of folderIds) if (!hasOwn(folders, id)) throw new Error(`Default folder "${id}" is missing.`);
  return { root, folders, trash };
}

function readOrganization(): FolderOrganization {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? validateOrganization(JSON.parse(raw)) : defaultOrganization;
  } catch (error) {
    console.warn("Saved folder organization could not be read; using the default folders.", error);
    return defaultOrganization;
  }
}

function parentEntries(organization: FolderOrganization, parent: FolderId | null) {
  return parent === null ? organization.root : organization.folders[parent]?.items;
}

function subTreeHeight(organization: FolderOrganization, id: FolderId): number {
  const children = organization.folders[id]?.items ?? [];
  const nested = children.filter((child) => hasOwn(organization.folders, child));
  return nested.length ? 1 + Math.max(...nested.map((child) => subTreeHeight(organization, child))) : 1;
}

function containsFolder(organization: FolderOrganization, parent: FolderId, candidate: FolderId): boolean {
  if (parent === candidate) return true;
  return (organization.folders[parent]?.items ?? []).some((id) => hasOwn(organization.folders, id) && containsFolder(organization, id, candidate));
}

function nestingDepth(organization: FolderOrganization, parent: FolderId | null): number {
  if (parent === null) return 0;
  const ancestors = (id: FolderId): number => {
    const containing = Object.entries(organization.folders).find(([, folder]) => folder.items.includes(id))?.[0];
    return containing ? 1 + ancestors(containing) : 1;
  };
  return ancestors(parent);
}

function siblingHasName(organization: FolderOrganization, parent: FolderId | null, name: string, except?: FolderId) {
  const siblings = parentEntries(organization, parent) ?? [];
  return siblings.some((id) => id !== except && hasOwn(organization.folders, id) && organization.folders[id].name.toLowerCase() === name.toLowerCase());
}

function unusedName(organization: FolderOrganization, parent: FolderId | null, name: string) {
  let candidate = name;
  for (let suffix = 2; siblingHasName(organization, parent, candidate); suffix += 1) {
    const tail = ` (${suffix})`;
    candidate = `${name.slice(0, maximumNameLength - tail.length)}${tail}`;
  }
  return candidate;
}

export function isRecycled(organization: FolderOrganization, id: EntryId): boolean {
  return organization.trash.some((item) => item.id === id || folderDescendants(organization, item.id).includes(id));
}

export function folderParent(organization: FolderOrganization, id: EntryId): FolderId | null {
  return Object.entries(organization.folders).find(([, folder]) => folder.items.includes(id))?.[0] ?? null;
}

export function folderTrail(organization: FolderOrganization, id: FolderId): FolderId[] {
  const trail = [id];
  let parent = folderParent(organization, id);
  while (parent !== null) {
    trail.unshift(parent);
    parent = folderParent(organization, parent);
  }
  return trail;
}

export function entryLabel(organization: FolderOrganization, id: EntryId) {
  return isFolder(organization, id) ? organization.folders[id].name : apps[id as AppId].label;
}

export function folderMoveError(organization: FolderOrganization, ids: EntryId[], parent: FolderId | null): string {
  if (!ids.length || ids.some((id) => !hasOwn(organization.folders, id) && !availableApps.includes(id as AppId))) {
    return "Choose apps or folders that still exist.";
  }
  if (ids.some((id) => isRecycled(organization, id)) || (parent !== null && isRecycled(organization, parent))) return "Restore items from the Recycle Bin before moving them.";
  if (parent !== null && ids.includes("recyclebin")) return "Recycle Bin stays on the desktop.";
  if (parent !== null && !hasOwn(organization.folders, parent)) return "The destination folder no longer exists.";
  const movingFolders = ids.filter((id) => isFolder(organization, id));
  if (parent !== null && movingFolders.some((id) => containsFolder(organization, id, parent))) {
    return "A folder cannot be moved into itself or one of its child folders.";
  }
  if (movingFolders.some((id) => nestingDepth(organization, parent) + subTreeHeight(organization, id) > maximumDepth)) {
    return `Folders can be nested up to ${maximumDepth} levels.`;
  }
  return "";
}

export function recycleError(organization: FolderOrganization, ids: EntryId[]): string {
  if (!ids.length || ids.some((id) => !hasOwn(organization.folders, id) && !availableApps.includes(id as AppId))) {
    return "Choose apps or folders that still exist.";
  }
  if (ids.includes(recycleBinId)) return "Recycle Bin stays on the desktop.";
  if (ids.some((id) => isRecycled(organization, id))) return "That item is already in the Recycle Bin.";
  return "";
}

/* Puts a recycled item back in its original folder and position, or on the Desktop if that folder is gone,
   recycled, or too deep for it. A restored folder whose name is now taken gets a numbered suffix. */
function restoreFromTrash(organization: FolderOrganization, id: EntryId): { next: FolderOrganization; restored: Restored } | undefined {
  const item = organization.trash.find((entry) => entry.id === id);
  if (!item) return;
  const folder = isFolder(organization, id);
  const parent = item.parent !== null && organization.folders[item.parent] && !isRecycled(organization, item.parent)
    && (!folder || nestingDepth(organization, item.parent) + subTreeHeight(organization, id) <= maximumDepth) ? item.parent : null;
  const name = folder ? unusedName(organization, parent, organization.folders[id].name) : apps[id as AppId].label;
  const items = [...(parentEntries(organization, parent) ?? [])];
  items.splice(Math.min(item.index, items.length), 0, id);
  const folders = { ...organization.folders };
  if (folder) folders[id] = { ...folders[id], name };
  if (parent !== null) folders[parent] = { ...folders[parent], items };
  return {
    next: { root: parent === null ? items : organization.root, folders, trash: organization.trash.filter((entry) => entry.id !== id) },
    restored: { name, destination: parent === null ? "Desktop" : organization.folders[parent].name }
  };
}

let idSequence = 0;

export function FolderOrganizationProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganization] = useState(readOrganization);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const organizationRef = useRef(organization);
  organizationRef.current = organization;

  const commit = useCallback((next: FolderOrganization) => {
    organizationRef.current = next;
    setOrganization(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(true);
      setError("");
    } catch (cause) {
      console.warn("Folder organization could not be saved.", cause);
      setSaved(false);
      setError("Folder changes apply for this session, but browser storage is unavailable.");
    }
  }, []);

  const createFolder = useCallback((parent: FolderId | null, requestedName?: string) => {
    const current = organizationRef.current;
    const name = requestedName === undefined ? unusedName(current, parent, "New folder") : validName(requestedName);
    if (!name) { setError(`Folder names must be 1–${maximumNameLength} characters.`); return ""; }
    if (parent !== null && (!current.folders[parent] || isRecycled(current, parent))) { setError("Choose an existing folder."); return ""; }
    if (nestingDepth(current, parent) >= maximumDepth) { setError(`Folders can be nested up to ${maximumDepth} levels.`); return ""; }
    if (Object.keys(current.folders).length >= maximumFolders + folderIds.length) { setError(`You can create up to ${maximumFolders} custom folders, including those in the Recycle Bin.`); return ""; }
    if (siblingHasName(current, parent, name)) { setError("A folder with that name already exists here."); return ""; }
    idSequence += 1;
    const id = `custom-folder-${crypto.randomUUID?.() ?? `${Date.now()}-${idSequence}`}`;
    if (!parentEntries(current, parent)) { setError("The destination folder no longer exists."); return ""; }
    commit({ ...current, root: parent === null ? [...current.root, id] : current.root, folders: {
      ...current.folders,
      [id]: { name, items: [] },
      ...(parent === null ? {} : { [parent]: { ...current.folders[parent], items: [...current.folders[parent].items, id] } })
    } });
    return id;
  }, [commit]);

  const renameFolder = useCallback((id: FolderId, requestedName: string) => {
    const current = organizationRef.current;
    const folder = current.folders[id];
    const name = validName(requestedName);
    if (!folder || isRecycled(current, id)) { setError("Restore that folder before renaming it."); return false; }
    if (!name) { setError(`Folder names must be 1–${maximumNameLength} characters.`); return false; }
    const parent = Object.entries(current.folders).find(([, entry]) => entry.items.includes(id))?.[0] ?? null;
    if (siblingHasName(current, parent, name, id)) { setError("A folder with that name already exists here."); return false; }
    commit({ ...current, folders: { ...current.folders, [id]: { ...folder, name } } });
    return true;
  }, [commit]);

  const recycleEntries = useCallback((ids: EntryId[]) => {
    const current = organizationRef.current;
    const unique = [...new Set(ids)];
    const invalid = recycleError(current, unique);
    if (invalid) { setError(invalid); return false; }
    // Items inside a folder that is also being recycled go with it.
    const moving = unique.filter((id) => !unique.some((other) => other !== id && isFolder(current, other) && folderDescendants(current, other).includes(id)));
    let root = [...current.root];
    const folders = { ...current.folders };
    const trash = [...current.trash];
    for (const id of moving) {
      const parent = folderParent(current, id);
      // The index at removal time: restoring in reverse removal order rebuilds the original order exactly.
      const index = (parent === null ? root : folders[parent].items).indexOf(id);
      if (parent === null) root = root.filter((entry) => entry !== id);
      else folders[parent] = { ...folders[parent], items: folders[parent].items.filter((entry) => entry !== id) };
      trash.push({ id, parent, index: Math.max(0, index) });
    }
    commit({ root, folders, trash });
    return true;
  }, [commit]);

  const restoreEntry = useCallback((id: EntryId) => {
    const result = restoreFromTrash(organizationRef.current, id);
    if (!result) { setError("That item is no longer in the Recycle Bin."); return; }
    commit(result.next);
    return result.restored;
  }, [commit]);

  /* Undoes the removals newest first, so folders return before items recycled from inside them and siblings keep their order. */
  const restoreAll = useCallback(() => {
    const current = organizationRef.current;
    let next = current;
    for (const item of [...current.trash].reverse()) next = restoreFromTrash(next, item.id)?.next ?? next;
    if (current.trash.length) commit(next);
    return current.trash.length;
  }, [commit]);

  const moveEntries = useCallback((ids: EntryId[], parent: FolderId | null) => {
    const current = organizationRef.current;
    const moving = [...new Set(ids)];
    const invalid = folderMoveError(current, moving, parent);
    if (invalid) { setError(invalid); return false; }
    const target = parentEntries(current, parent);
    if (!target) { setError("The destination folder no longer exists."); return false; }
    if (moving.every((id) => target.includes(id))) { setError(""); return true; }
    let root = [...current.root];
    const folders = { ...current.folders };
    const sources = [null, ...Object.keys(current.folders)];
    for (const source of sources) {
      const entries = source === null ? root : folders[source]?.items;
      if (!entries) continue;
      const remaining = entries.filter((id) => !moving.includes(id));
      if (source === null) root = remaining;
      else folders[source] = { ...folders[source], items: remaining };
    }
    if (parent === null) root = [...root, ...moving];
    else folders[parent] = { ...folders[parent], items: [...folders[parent].items, ...moving] };
    commit({ ...current, root, folders });
    return true;
  }, [commit]);

  const restoreDefaults = useCallback(() => {
    organizationRef.current = defaultOrganization;
    setOrganization(defaultOrganization);
    try {
      localStorage.removeItem(storageKey);
      setSaved(true);
      setError("");
    } catch (cause) {
      console.warn("Default folder organization could not be restored in browser storage.", cause);
      setSaved(false);
      setError("Folder layout was reset for this session, but browser storage could not be cleared.");
    }
  }, []);
  const clearError = useCallback(() => setError(""), []);
  const value = useMemo(() => ({ organization, saved, createFolder, renameFolder, recycleEntries, restoreEntry, restoreAll, moveEntries, restoreDefaults, error, clearError }),
    [organization, saved, createFolder, renameFolder, recycleEntries, restoreEntry, restoreAll, moveEntries, restoreDefaults, error, clearError]);

  return <FolderOrganizationContext.Provider value={value}>{children}</FolderOrganizationContext.Provider>;
}

export function useFolderOrganization() {
  const context = useContext(FolderOrganizationContext);
  if (!context) throw new Error("useFolderOrganization must be used inside Lab OS");
  return context;
}

export function isFolder(organization: FolderOrganization, id: EntryId): id is FolderId {
  return hasOwn(organization.folders, id);
}

export function folderDescendants(organization: FolderOrganization, id: FolderId): EntryId[] {
  const children = organization.folders[id]?.items ?? [];
  return children.flatMap((child) => isFolder(organization, child) ? [child, ...folderDescendants(organization, child)] : [child]);
}

export function orderedRootEntries(root: EntryId[]) {
  const remaining = new Set(root);
  return [...menuEntryOrder.filter((id) => remaining.delete(id)), ...root.filter((id) => remaining.has(id))];
}

export function defaultDesktopGroups(root: EntryId[]) {
  const visible = new Set(root);
  const placed = new Set<EntryId>();
  const groups: EntryId[][] = desktopRows.flatMap((row) => {
    const items = row.filter((id) => visible.has(id));
    items.forEach((id) => placed.add(id));
    return items.length ? [items] : [];
  });
  const docs = desktopDocuments.filter((id) => visible.has(id));
  docs.forEach((id) => placed.add(id));
  if (docs.length) groups.push(docs);
  for (const id of root) {
    if (placed.has(id)) continue;
    groups.push([id]);
    placed.add(id);
  }
  return groups;
}
