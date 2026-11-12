import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { apps, desktopApps, desktopDocuments, desktopRows, menuSections, type AppId } from "./apps";

export type FolderId = string;
export type EntryId = AppId | FolderId;
export type FolderContents = { name: string; items: EntryId[] };
export type FolderOrganization = { root: EntryId[]; folders: Record<FolderId, FolderContents> };

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
  folders: Object.fromEntries(folderIds.map((id) => {
    const def = apps[id];
    return [id, { name: def.label, items: def.kind === "folder" ? [...def.children] : [] }];
  }))
};

export type FolderOrganizationApi = {
  organization: FolderOrganization;
  saved: boolean;
  createFolder: (parent: FolderId | null, name: string) => FolderId;
  renameFolder: (id: FolderId, name: string) => boolean;
  deleteFolder: (id: FolderId) => void;
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

function validateOrganization(value: unknown): FolderOrganization {
  if (!isRecord(value) || !Array.isArray(value.root) || !isRecord(value.folders)) throw new Error("Saved folders are malformed.");
  const folders: FolderOrganization["folders"] = {};
  const rawFolders = value.folders;
  const ids = Object.keys(rawFolders);
  if (ids.length > maximumFolders + folderIds.length) throw new Error("Too many saved folders.");
  for (const id of ids) {
    const folder = rawFolders[id];
    if (!isRecord(folder) || typeof folder.name !== "string" || !Array.isArray(folder.items)) throw new Error("Saved folder is malformed.");
    const name = validName(folder.name);
    if (!name || folder.items.some((item) => typeof item !== "string")) throw new Error("Saved folder contents are malformed.");
    folders[id] = { name, items: folder.items as string[] };
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
  visit(value.root as string[], 0);
  if (seen.size !== availableApps.length + ids.length || availableApps.some((id) => !seen.has(id)) || ids.some((id) => !seen.has(id))) {
    throw new Error("Saved folders must contain every app exactly once.");
  }
  for (const id of folderIds) if (!hasOwn(folders, id)) throw new Error(`Default folder "${id}" is missing.`);
  return { root: value.root as string[], folders };
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

  const createFolder = useCallback((parent: FolderId | null, requestedName: string) => {
    const current = organizationRef.current;
    const name = validName(requestedName);
    if (!name) { setError(`Folder names must be 1–${maximumNameLength} characters.`); return ""; }
    if (parent !== null && !current.folders[parent]) { setError("Choose an existing folder."); return ""; }
    if (nestingDepth(current, parent) >= maximumDepth) { setError(`Folders can be nested up to ${maximumDepth} levels.`); return ""; }
    if (Object.keys(current.folders).length >= maximumFolders + folderIds.length) { setError(`You can create up to ${maximumFolders} custom folders.`); return ""; }
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
    if (!folder) { setError("That folder no longer exists."); return false; }
    if (!name) { setError(`Folder names must be 1–${maximumNameLength} characters.`); return false; }
    const parent = Object.entries(current.folders).find(([, entry]) => entry.items.includes(id))?.[0] ?? null;
    if (siblingHasName(current, parent, name, id)) { setError("A folder with that name already exists here."); return false; }
    commit({ ...current, folders: { ...current.folders, [id]: { ...folder, name } } });
    return true;
  }, [commit]);

  const deleteFolder = useCallback((id: FolderId) => {
    const current = organizationRef.current;
    if (!id.startsWith("custom-folder-") || !current.folders[id]) { setError("Only custom folders can be deleted."); return; }
    const parent = Object.entries(current.folders).find(([, entry]) => entry.items.includes(id))?.[0] ?? null;
    const siblings = parentEntries(current, parent);
    if (!siblings) { setError("The destination folder no longer exists."); return; }
    const nextFolders = { ...current.folders };
    delete nextFolders[id];
    const items = [...siblings.slice(0, siblings.indexOf(id)), ...current.folders[id].items, ...siblings.slice(siblings.indexOf(id) + 1)];
    commit({ root: parent === null ? items : current.root, folders: parent === null ? nextFolders : {
      ...nextFolders,
      [parent]: { ...current.folders[parent], items }
    } });
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
    commit({ root, folders });
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
  const value = useMemo(() => ({ organization, saved, createFolder, renameFolder, deleteFolder, moveEntries, restoreDefaults, error, clearError }),
    [organization, saved, createFolder, renameFolder, deleteFolder, moveEntries, restoreDefaults, error, clearError]);

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
