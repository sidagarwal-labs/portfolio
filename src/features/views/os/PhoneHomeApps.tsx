import type { CSSProperties } from "react";
import { Folder, type LucideIcon } from "lucide-react";
import { apps, type AppId } from "./apps";
import { isFolder, orderedRootEntries, type EntryId, type FolderOrganization } from "./folderOrganization";

/* The phone home screen: the Start menu's groups as icons. Folders open as full-screen windows of their apps. */
function PhoneHomeApps({ open, organization }: { open: (id: EntryId) => void; organization: FolderOrganization }) {
  return (
    <ul className="os-home__grid" aria-label="Apps">
      {[...orderedRootEntries(organization.root), "settings"].map((id) => {
        const folder = isFolder(organization, id);
        const def = folder ? { label: organization.folders[id].name, icon: Folder as LucideIcon, tint: apps.projects.tint } : apps[id as AppId];
        const Icon = def.icon;
        return (
          <li key={id}>
            <button type="button" className="os-icon" onClick={() => open(id)}>
              <span className="os-icon__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={26} strokeWidth={1.7} /></span>
              <span className="os-icon__label">{def.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default PhoneHomeApps;
