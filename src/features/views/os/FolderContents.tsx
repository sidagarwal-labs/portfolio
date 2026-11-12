import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { Folder } from "lucide-react";
import { apps, type AppId } from "./apps";
import { folderTrail, isFolder, useFolderOrganization, type EntryId, type FolderId } from "./folderOrganization";
import { useFolderDrag } from "./FolderDrag";
import { FolderMenuButton, FolderNameEditor, useFolderActions } from "./FolderActions";
import { useActivationFocus } from "./useActivationFocus";
import type { OsActions } from "./types";

export default function FolderContents({ folderId, actions }: { folderId: FolderId; actions: OsActions }) {
  const { organization } = useFolderOrganization();
  const { create } = useFolderActions();
  const { startDrag, consumeClick, clipboard, cutEntries, pasteEntries, handleKeys } = useFolderDrag();
  const folder = organization.folders[folderId];
  const [selected, setSelected] = useState<EntryId[]>([]);
  const [selecting, setSelecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useActivationFocus(ref);

  useEffect(() => {
    setSelected((current) => current.filter((id) => folder?.items.includes(id)));
  }, [folder?.items]);

  if (!folder) return <p className="os-folder-empty">This folder no longer exists.</p>;

  return (
    <div ref={ref} className="os-folder-window" data-folder-drop={folderId} tabIndex={0} aria-label={`${folder.name} folder`} onKeyDown={(event) => {
      handleKeys(event, folderId, selected);
      if (event.defaultPrevented) return;
      if (event.key === "Escape") setSelected([]);
      if (event.key === "Enter" && selected.length > 1 && event.target instanceof Element && event.target.closest("[data-entry-id]")) {
        event.preventDefault();
        selected.forEach((id) => actions.openEntry(id));
      }
    }} onPointerDown={(event) => {
      if (event.target === event.currentTarget || (event.target instanceof Element && event.target.classList.contains("os-folder"))) {
        setSelected([]);
        event.currentTarget.focus({ preventScroll: true });
      }
    }}>
      <nav className="os-folder-path" aria-label="Folder path">
        <button type="button" onClick={actions.home} data-folder-drop="desktop">Desktop</button>
        {folderTrail(organization, folderId).map((id) => (
          <Fragment key={id}>
            <span aria-hidden="true">/</span>
            {id === folderId ? <span className="os-folder-current"><strong>{folder.name}</strong><FolderNameEditor id={id} scope={`title:${id}`} /></span> : (
              <button type="button" onClick={() => actions.openEntry(id)} data-folder-drop={id}>{organization.folders[id].name}</button>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="os-folder-toolbar">
        <button type="button" className="os-button" onClick={() => create(folderId)}>New folder</button>
        <FolderMenuButton id={folderId} scope={`title:${folderId}`} />
        <div className="os-folder-toolbar__actions">
          <button type="button" className="os-button" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected([]); }}>Select items</button>
          {selected.length > 0 && <button type="button" className="os-button" onClick={() => cutEntries(selected)}>Cut</button>}
          {clipboard.length > 0 && <button type="button" className="os-button" onClick={() => pasteEntries(folderId)}>Paste</button>}
        </div>
      </div>
      <p className="sr-only" id={`folder-help-${folderId}`}>Right-click for folder actions, or use the Actions button. F2 renames and Delete moves the selected apps or folders to the Recycle Bin. Drag items into folders, another window, the Recycle Bin, or onto the desktop. Drop onto the path above to move to a parent folder. Control-click to select several. Ctrl or Command X cuts and Ctrl or Command V pastes. On touch screens, enable Select items to drag or cut and paste.</p>
      <ul className="os-folder" aria-label={`${folder.name} apps`} aria-describedby={`folder-help-${folderId}`} data-entry-container data-selecting={selecting}>
        {folder.items.map((id) => {
          const childFolder = isFolder(organization, id);
          const def = childFolder ? apps.projects : apps[id as AppId];
          const Icon = childFolder ? Folder : def.icon;
          const label = childFolder ? organization.folders[id].name : def.label;
          const description = childFolder ? `${organization.folders[id].items.length} items` : def.blurb;
          const isSelected = selected.includes(id);
          return (
            <li key={id} className="os-folder__item">
              <button type="button" className={`os-icon${isSelected ? " is-selected" : ""}${clipboard.includes(id) ? " is-cut" : ""}`} data-entry-id={id} data-folder-drop={childFolder ? id : undefined} aria-label={label} aria-description={description} aria-pressed={isSelected} title={description} onPointerDown={(event) => {
                if (event.pointerType === "touch" && !selecting) return;
                const group = selected.includes(id) ? selected : [id];
                startDrag(event, group, () => setSelected(group));
              }} onClick={(event) => {
                if (consumeClick(event)) return;
                if (selecting || event.ctrlKey || event.metaKey || event.shiftKey) {
                  setSelected(isSelected ? selected.filter((item) => item !== id) : [...selected, id]);
                } else {
                  setSelected([]);
                  actions.openEntry(id);
                }
              }}>
                <span className="os-icon__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={24} strokeWidth={1.8} /></span>
                <span className="os-icon__label">{label}</span>
              </button>
              {childFolder && <><FolderNameEditor id={id} scope={folderId} /><FolderMenuButton id={id} scope={folderId} /></>}
            </li>
          );
        })}
      </ul>
      {!folder.items.length && <p className="os-folder-empty">This folder is empty. Drag apps here or paste items you have cut.</p>}
    </div>
  );
}
