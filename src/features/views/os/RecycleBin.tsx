import { useRef, useState } from "react";
import { Folder, RotateCcw } from "lucide-react";
import { folderDescendants, useFolderOrganization } from "./folderOrganization";

export default function RecycleBin() {
  const { organization, restoreFolder } = useFolderOrganization();
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="os-recycle-bin" tabIndex={-1}>
      <h2>Deleted folders</h2>
      <p>Restore a folder to bring back everything inside it. Items stay here until restored or Lab OS is reset.</p>
      {organization.trash.length ? (
        <ul aria-label="Deleted folders">
          {organization.trash.map(({ id, parent }) => {
            const count = folderDescendants(organization, id).length;
            return <li key={id}>
              <Folder size={28} aria-hidden="true" />
              <span><strong>{organization.folders[id].name}</strong><small>{count} {count === 1 ? "item" : "items"} · From {parent === null ? "Desktop" : organization.folders[parent]?.name ?? "a removed folder"}</small></span>
              <button type="button" className="os-button" aria-label={`Restore ${organization.folders[id].name}`} onClick={() => {
                const result = restoreFolder(id);
                if (!result) return;
                setMessage(`Restored ${result.name} to ${result.destination}.`);
                ref.current?.focus({ preventScroll: true });
              }}><RotateCcw size={14} aria-hidden="true" /> Restore</button>
            </li>;
          })}
        </ul>
      ) : <p>The Recycle Bin is empty.</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
