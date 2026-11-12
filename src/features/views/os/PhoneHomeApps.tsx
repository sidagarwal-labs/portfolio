import { useState, type CSSProperties } from "react";
import { Folder, type LucideIcon } from "lucide-react";
import { apps, type AppId } from "./apps";
import { isFolder, orderedRootEntries, recycleBinId, type EntryId, type FolderOrganization } from "./folderOrganization";
import { useFolderDrag } from "./FolderDrag";
import { FolderMenuButton, FolderNameEditor, useFolderActions } from "./FolderActions";

/* The phone home screen: the Start menu's groups as icons. Folders open as full-screen windows of their apps. */
function PhoneHomeApps({ open, organization }: { open: (id: EntryId) => void; organization: FolderOrganization }) {
  const { startDrag, consumeClick, handleKeys, clipboard, pasteEntries } = useFolderDrag();
  const { create } = useFolderActions();
  const [arranging, setArranging] = useState(false);
  return (
    <div className="os-home__apps">
      <div className="os-home__organize">
        <button type="button" className="os-button" onClick={() => create(null)}>New folder</button>
        <button type="button" className="os-button" aria-pressed={arranging} onClick={() => setArranging(!arranging)}>Arrange apps</button>
        {clipboard.length > 0 && <button type="button" className="os-button" onClick={() => pasteEntries(null)}>Paste</button>}
      </div>
      {arranging && <p className="os-home__hint" role="status">Drag apps onto folders. Inside a folder, turn on Select items and drag onto its Desktop path to move items out.</p>}
      <ul className="os-home__grid" aria-label="Apps" data-entry-container data-selecting={arranging} tabIndex={0} onKeyDown={(event) => handleKeys(event, null)}>
        {[...orderedRootEntries(organization.root), "settings"].map((id) => {
          const folder = isFolder(organization, id);
          const def = folder ? { label: organization.folders[id].name, icon: Folder as LucideIcon, tint: apps.projects.tint } : apps[id as AppId];
          const Icon = def.icon;
          return (
            <li key={id}>
              <button type="button" className={`os-icon${clipboard.includes(id) ? " is-cut" : ""}`} aria-label={def.label} data-entry-id={id === "settings" ? undefined : id} data-folder-drop={folder || id === recycleBinId ? id : undefined} onPointerDown={(event) => {
                if (id === "settings" || (event.pointerType === "touch" && !arranging)) return;
                startDrag(event, [id]);
              }} onClick={(event) => { if (!consumeClick(event)) open(id); }}>
                <span className="os-icon__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={26} strokeWidth={1.7} /></span>
                <span className="os-icon__label">{def.label}</span>
              </button>
              {folder && <><FolderNameEditor id={id} scope="home" /><FolderMenuButton id={id} scope="home" /></>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PhoneHomeApps;
