import { useState, type CSSProperties, type FormEvent } from "react";
import { Folder } from "lucide-react";
import { apps, type AppId } from "./apps";
import { folderDescendants, isFolder, useFolderOrganization, type EntryId, type FolderId } from "./folderOrganization";
import type { OsActions } from "./types";

export default function FolderContents({ folderId, actions }: { folderId: FolderId; actions: OsActions }) {
  const { organization, createFolder, renameFolder, deleteFolder, moveEntries, error, clearError } = useFolderOrganization();
  const folder = organization.folders[folderId];
  const [newName, setNewName] = useState("");
  const [destinations, setDestinations] = useState<Record<string, FolderId | "">>({});
  const [rename, setRename] = useState(false);
  const [renameValue, setRenameValue] = useState(folder?.name ?? "");
  if (!folder) return <p className="os-folder-empty">This folder no longer exists.</p>;

  const create = (event: FormEvent) => {
    event.preventDefault();
    if (createFolder(folderId, newName)) setNewName("");
  };
  const commitRename = (event: FormEvent) => {
    event.preventDefault();
    if (renameFolder(folderId, renameValue)) setRename(false);
  };

  return (
    <div className="os-folder-window">
      <div className="os-folder-toolbar">
        <form onSubmit={create}>
          <label htmlFor={`new-subfolder-${folderId}`}>New subfolder</label>
          <input id={`new-subfolder-${folderId}`} value={newName} maxLength={32} placeholder="Folder name" onChange={(event) => setNewName(event.target.value)} />
          <button type="submit" className="os-button" disabled={!newName.trim()}>Create</button>
        </form>
        {folderId.startsWith("custom-folder-") && (
          <div className="os-folder-toolbar__actions">
            {rename ? (
              <form onSubmit={commitRename}>
                <label htmlFor={`rename-folder-${folderId}`}>Folder name</label>
                <input id={`rename-folder-${folderId}`} value={renameValue} maxLength={32} onChange={(event) => setRenameValue(event.target.value)} />
                <button type="submit" className="os-button">Save name</button>
                <button type="button" className="os-button" onClick={() => { setRename(false); setRenameValue(folder.name); }}>Cancel</button>
              </form>
            ) : <button type="button" className="os-button" onClick={() => setRename(true)}>Rename folder</button>}
            <button type="button" className="os-button os-button--danger" onClick={() => deleteFolder(folderId)}>Delete folder</button>
          </div>
        )}
      </div>
      {error && <p className="os-folder-error" role="alert">{error}<button type="button" onClick={clearError}>Dismiss</button></p>}
      {folder.items.length ? (
        <ul className="os-folder" aria-label={`${folder.name} apps`}>
          {folder.items.map((id) => {
            const childFolder = isFolder(organization, id);
            const def = childFolder ? undefined : apps[id as AppId];
            const Icon = childFolder ? Folder : def!.icon;
            const label = childFolder ? organization.folders[id].name : def!.label;
            const tint = childFolder ? apps.projects.tint : def!.tint;
            const blocked = isFolder(organization, id) ? new Set([id, ...folderDescendants(organization, id)]) : new Set<string>();
            const destination = Object.entries(organization.folders).filter(([candidate]) => !blocked.has(candidate));
            const selectedDestination = destinations[id] ?? folderId;
            return (
              <li key={id} className="os-folder__item">
                <button type="button" className="os-icon" data-entry-id={id} onClick={() => actions.openEntry(id)}>
                  <span className="os-icon__tile" style={{ "--tint": tint } as CSSProperties} aria-hidden="true"><Icon size={24} strokeWidth={1.8} /></span>
                  <span className="os-icon__label">{label}</span>
                  {def && <span className="os-icon__blurb">{def.blurb}</span>}
                </button>
                <label className="sr-only" htmlFor={`move-folder-entry-${folderId}-${id}`}>Move {label} to</label>
                <select id={`move-folder-entry-${folderId}-${id}`} value={selectedDestination} onChange={(event) => setDestinations((current) => ({ ...current, [id]: event.target.value }))}>
                  <option value="">Desktop</option>
                  {destination.map(([target, targetFolder]) => <option key={target} value={target}>{targetFolder.name}</option>)}
                </select>
                <button type="button" className="os-button" onClick={() => moveEntries([id], selectedDestination || null)} disabled={selectedDestination === folderId}>Move</button>
              </li>
            );
          })}
        </ul>
      ) : <p className="os-folder-empty">This folder is empty. Add apps from the desktop or create a subfolder.</p>}
    </div>
  );
}
