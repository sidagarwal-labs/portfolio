import { useState } from "react";
import { apps, type AppId } from "./apps";
import { folderDescendants, isFolder, useFolderOrganization, type EntryId, type FolderId } from "./folderOrganization";
import "./folder-manager.css";

type Row = { id: EntryId; name: string; path: string[]; parentId: FolderId | null; folder: boolean };

function rowsFor(organization: ReturnType<typeof useFolderOrganization>["organization"]): Row[] {
  const rows: Row[] = [];
  const visit = (items: EntryId[], path: string[], parentId: FolderId | null) => {
    for (const id of items) {
      if (isFolder(organization, id)) {
        rows.push({ id, name: organization.folders[id].name, path, parentId, folder: true });
        visit(organization.folders[id].items, [...path, organization.folders[id].name], id);
      } else {
        rows.push({ id, name: apps[id as AppId].label, path, parentId, folder: false });
      }
    }
  };
  visit(organization.root, [], null);
  return rows;
}

export default function FolderManager() {
  const { organization, saved, createFolder, renameFolder, deleteFolder, moveEntries, error, clearError } = useFolderOrganization();
  const [name, setName] = useState("");
  const [destinations, setDestinations] = useState<Record<string, FolderId | "">>({});
  const rows = rowsFor(organization);
  const destinationOptions = rows.filter((row) => row.folder);
  const status = error || (saved ? "" : "Folder changes apply for this session, but browser storage is unavailable.");

  const submitFolder = (event: React.FormEvent) => {
    event.preventDefault();
    const id = createFolder(null, name);
    if (id) setName("");
  };

  return (
    <section className="os-folder-manager" aria-labelledby="os-folder-manager-title">
      <h2 id="os-folder-manager-title">Folder organization</h2>
      <p className="os-folder-manager__hint">Move apps between the desktop and nested folders. This layout is shared with Start and the phone home screen.</p>
      <form className="os-folder-manager__create" onSubmit={submitFolder}>
        <label htmlFor="os-new-folder-name">New folder on desktop</label>
        <input id="os-new-folder-name" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="Folder name" />
        <button type="submit" className="os-button" disabled={!name.trim()}>Create folder</button>
      </form>
      <ul className="os-folder-manager__items" aria-label="Apps and folders">
        {rows.map((row) => {
          const currentParent = row.path.length ? row.path[row.path.length - 1] : "Desktop";
          const selectedParent = destinations[row.id] ?? row.parentId ?? "";
          const forbidden = row.folder ? new Set([row.id, ...folderDescendants(organization, row.id)]) : new Set<string>();
          const folders = destinationOptions.filter((option) => !forbidden.has(option.id));
          const isDefault = row.folder && !row.id.startsWith("custom-folder-");
          return (
            <li key={row.id} className="os-folder-manager__item" data-folder-item={row.id}>
              <span className="os-folder-manager__name">{row.name}<span className="os-folder-manager__path">{currentParent}</span></span>
              <label className="sr-only" htmlFor={`os-folder-destination-${row.id}`}>Move {row.name} to</label>
              <select id={`os-folder-destination-${row.id}`} value={selectedParent} onChange={(event) => setDestinations((current) => ({ ...current, [row.id]: event.target.value }))}>
                <option value="">Desktop</option>
                {folders.map((option) => <option key={option.id} value={option.id}>{option.path.length ? `${option.path.join(" / ")} / ` : ""}{option.name}</option>)}
              </select>
              <button type="button" className="os-button" onClick={() => moveEntries([row.id], selectedParent || null)} disabled={(selectedParent || null) === row.parentId}>Move</button>
              {row.folder && !isDefault && (
                <>
                  <button type="button" className="os-button" onClick={() => {
                    const next = window.prompt("Rename folder", row.name);
                    if (next !== null) renameFolder(row.id, next);
                  }}>Rename</button>
                  <button type="button" className="os-button os-button--danger" onClick={() => deleteFolder(row.id)}>Delete</button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {status && <p className="os-set__status" role="status">{status}</p>}
      {error && <button type="button" className="os-button" onClick={clearError}>Dismiss</button>}
    </section>
  );
}
