import { useFolderActions } from "./FolderActions";
import type { EntryId } from "./folderOrganization";

export default function FolderManager({ open }: { open: (id: EntryId) => void }) {
  const { create } = useFolderActions();
  return (
    <section className="os-folder-manager" aria-labelledby="os-folder-manager-title">
      <h2 id="os-folder-manager-title">Folder organization</h2>
      <p className="os-folder-manager__hint">Right-click the desktop or a folder for actions. F2 renames a folder; Delete moves custom folders and their contents to the Recycle Bin. Drag apps between folders, or use Ctrl/Cmd+X and Ctrl/Cmd+V.</p>
      <div className="os-folder-manager__create">
        <button type="button" className="os-button" onClick={() => create(null)}>New folder on desktop</button>
        <button type="button" className="os-button" onClick={() => open("recyclebin")}>Open Recycle Bin</button>
      </div>
    </section>
  );
}
