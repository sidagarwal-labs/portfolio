import { useState } from "react";
import { folderTrail, useFolderOrganization, type EntryId } from "./folderOrganization";

export default function FolderManager({ open }: { open: (id: EntryId) => void }) {
  const { organization, createFolder } = useFolderOrganization();
  const [name, setName] = useState("");

  const submitFolder = (event: React.FormEvent) => {
    event.preventDefault();
    const id = createFolder(null, name);
    if (id) setName("");
  };

  return (
    <section className="os-folder-manager" aria-labelledby="os-folder-manager-title">
      <h2 id="os-folder-manager-title">Folder organization</h2>
      <p className="os-folder-manager__hint">Drag apps into, out of, or between open folders. Ctrl/Cmd+X and Ctrl/Cmd+V also move items. Open a folder below to organize it; your layout is shared with Start and the phone home screen.</p>
      <form className="os-folder-manager__create" onSubmit={submitFolder}>
        <label htmlFor="os-new-folder-name">New folder on desktop</label>
        <input id="os-new-folder-name" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="Folder name" />
        <button type="submit" className="os-button" disabled={!name.trim()}>Create folder</button>
      </form>
      <ul className="os-folder-manager__items" aria-label="Folders">
        {Object.entries(organization.folders).map(([id, folder]) => {
          const path = folderTrail(organization, id).slice(0, -1).map((parent) => organization.folders[parent].name);
          return (
            <li key={id} className="os-folder-manager__item">
              <span className="os-folder-manager__name">{folder.name}<span className="os-folder-manager__path">{path.join(" / ") || "Desktop"}</span></span>
              <button type="button" className="os-button" onClick={() => open(id)} aria-label={`Open ${folder.name} folder`}>Open</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
