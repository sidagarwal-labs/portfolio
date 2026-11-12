import { useRef, useState, type CSSProperties } from "react";
import { Folder, RotateCcw } from "lucide-react";
import { apps, type AppId } from "./apps";
import { useFolderDrag } from "./FolderDrag";
import { folderDescendants, isFolder, recycleBinId, useFolderOrganization, type FolderId } from "./folderOrganization";
import { useActivationFocus } from "./useActivationFocus";

/* Recycled apps and folders, newest first. Dropping, pasting, or pressing Delete on items sends them here. */
export default function RecycleBin() {
  const { organization, restoreEntry, restoreAll } = useFolderOrganization();
  const { handleKeys, clipboard, pasteEntries } = useFolderDrag();
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useActivationFocus(ref);
  const from = (parent: FolderId | null) => (parent === null ? "Desktop" : organization.folders[parent]?.name ?? "a removed folder");
  const keepFocus = () => ref.current?.focus({ preventScroll: true });
  const items = [...organization.trash].reverse();
  return (
    <div ref={ref} className="os-recycle-bin" data-folder-drop={recycleBinId} tabIndex={-1} aria-label="Recycle Bin" onKeyDown={(event) => handleKeys(event, recycleBinId)}>
      <header className="os-recycle-bin__head">
        <div>
          <h2>Recycle Bin</h2>
          <p>Drag apps or folders here, press Delete on them, or cut them and paste here. Restore puts each one back where it was.</p>
        </div>
        <div className="os-recycle-bin__actions">
          {clipboard.length > 0 && <button type="button" className="os-button" onClick={() => pasteEntries(recycleBinId)}>Paste</button>}
          {items.length > 1 && <button type="button" className="os-button" onClick={() => {
            const count = restoreAll();
            if (count) setMessage(`Restored ${count} items.`);
            keepFocus();
          }}><RotateCcw size={14} aria-hidden="true" /> Restore all</button>}
        </div>
      </header>
      {items.length ? (
        <ul aria-label="Recycled items">
          {items.map(({ id, parent }) => {
            const folder = isFolder(organization, id);
            const app = folder ? undefined : apps[id as AppId];
            const name = folder ? organization.folders[id].name : app!.label;
            const Icon = app?.icon ?? Folder;
            const count = folder ? folderDescendants(organization, id).length : 0;
            return <li key={id}>
              <span className="os-recycle-bin__tile" style={{ "--tint": app?.tint ?? apps.projects.tint } as CSSProperties} aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
              <span><strong>{name}</strong><small>{folder ? `${count} ${count === 1 ? "item" : "items"}` : "App"} · From {from(parent)}</small></span>
              <button type="button" className="os-button" aria-label={`Restore ${name}`} onClick={() => {
                const result = restoreEntry(id);
                if (!result) return;
                setMessage(`Restored ${result.name} to ${result.destination}.`);
                keepFocus();
              }}><RotateCcw size={14} aria-hidden="true" /> Restore</button>
            </li>;
          })}
        </ul>
      ) : <p className="os-recycle-bin__empty">The Recycle Bin is empty.</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
