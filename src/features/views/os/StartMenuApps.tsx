import { Fragment, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { apps, menuSections, type AppId, type MenuSection } from "./apps";
import { isFolder, orderedRootEntries, type EntryId, type FolderId, type FolderOrganization } from "./folderOrganization";

type Open = (id: EntryId) => void;
type Result = { id: EntryId; path: string[] };

/* Start shows System under Contact in its right column, which keeps the two columns closer in height. */
export const appSections = menuSections.filter((section) => section.label !== "System");
export const systemSections = menuSections.filter((section) => section.label === "System");

function collectEntries(organization: FolderOrganization): Result[] {
  const entries: Result[] = [];
  const visit = (ids: EntryId[], path: string[]) => ids.forEach((id) => {
    if (isFolder(organization, id)) {
      const folder = organization.folders[id];
      entries.push({ id, path });
      visit(folder.items, [...path, folder.name]);
    } else entries.push({ id, path });
  });
  visit(organization.root, []);
  return entries;
}

function entryName(id: EntryId, organization: FolderOrganization) {
  return isFolder(organization, id) ? organization.folders[id].name : apps[id as AppId].label;
}

function StartMenuApps({ query, open, sections = menuSections, organization, createFolder, error, clearError }: {
  query: string;
  open: Open;
  sections?: MenuSection[];
  organization: FolderOrganization;
  createFolder: (parent: FolderId | null, name: string) => FolderId;
  error: string;
  clearError: () => void;
}) {
  const systemOnly = sections.every((section) => section.label === "System");
  const [expanded, setExpanded] = useState<EntryId[]>([]);
  const [newName, setNewName] = useState("");
  const needle = query.trim().toLowerCase();
  const searchable = useMemo(() => collectEntries(organization), [organization]);

  if (needle) {
    const matches = searchable.filter(({ id, path }) => {
      if (isFolder(organization, id)) return false;
      const def = apps[id as AppId];
      return `${def.label} ${def.blurb} ${path.join(" ")}`.toLowerCase().includes(needle);
    });
    if ("settings".includes(needle)) matches.push({ id: "settings", path: [] });
    return (
      <>
        <h2 className="os-menu__heading">Results</h2>
        <ul className="os-menu__list" aria-label="Search results">
          {matches.map(({ id, path }) => {
            const name = entryName(id, organization);
            return (
              <li key={id}>
                <button type="button" className="os-menu__item" onClick={() => open(id)} aria-label={name} aria-description={path.length > 0 ? `in ${path.join(" / ")}` : undefined}>
                  {isFolder(organization, id) ? <Folder size={16} aria-hidden="true" /> : <AppsPlaceholder id={id} />}
                  <span className="os-menu__text"><span>{name}</span>{path.length > 0 && <span className="os-menu__where">in {path.join(" / ")}</span>}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {matches.length === 0 && <p className="os-menu__empty" role="status">No apps match this search.</p>}
      </>
    );
  }

  const toggle = (id: EntryId) => setExpanded((list) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const renderEntry = (id: EntryId, path: string[]): ReactNode => {
    if (!isFolder(organization, id)) {
      const def = apps[id as AppId];
      const Icon = def.icon;
      return (
        <li key={id}>
          <button type="button" className="os-menu__item" onClick={() => open(id)} aria-label={def.label} aria-description={path.length > 0 ? `in ${path.join(" / ")}` : undefined}>
            <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className="os-menu__text">
              <span>{def.label}</span>
            </span>
          </button>
        </li>
      );
    }

    const folder = organization.folders[id];
    const isOpen = expanded.includes(id);
    const Icon = isOpen ? FolderOpen : Folder;
    return (
      <li key={id}>
        <button type="button" className="os-menu__item os-menu__folder" aria-label={folder.name} aria-description={path.length > 0 ? `in ${path.join(" / ")}` : undefined} aria-expanded={isOpen} aria-controls={`os-menu-folder-${id}`} onClick={() => toggle(id)}>
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
          <span className="os-menu__text"><span>{folder.name}</span></span>
          <ChevronRight className="os-menu__chevron" size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <ul id={`os-menu-folder-${id}`} className="os-menu__list os-menu__sub" hidden={!isOpen} aria-label={folder.name}>
          {folder.items.length ? folder.items.map((child) => renderEntry(child, [...path, folder.name])) : <li><span className="os-menu__empty">Empty folder.</span></li>}
        </ul>
      </li>
    );
  };

  if (systemOnly) {
    return (
      <>
        {sections.map((section) => (
          <Fragment key={section.label}>
            <h2 className="os-menu__heading">{section.label}</h2>
            <ul className="os-menu__list" aria-label={section.label}>
              {section.items.map((id) => {
                const def = apps[id];
                const Icon = def.icon;
                return <li key={id}><button type="button" className="os-menu__item" onClick={() => open(id)}><Icon size={16} aria-hidden="true" /><span className="os-menu__text">{def.label}</span></button></li>;
              })}
            </ul>
          </Fragment>
        ))}
      </>
    );
  }

  const orderedRoot = orderedRootEntries(organization.root);
  const roots = orderedRoot.filter((id) => apps[id as AppId]?.kind !== "pdf" && apps[id as AppId]?.kind !== "note");
  const documents = orderedRoot.filter((id) => apps[id as AppId]?.kind === "pdf" || apps[id as AppId]?.kind === "note");
  const submitFolder = (event: FormEvent) => {
    event.preventDefault();
    if (createFolder(null, newName)) setNewName("");
  };

  return (
    <>
      <h2 className="os-menu__heading">Apps</h2>
      <form className="os-menu__new-folder" onSubmit={submitFolder}>
        <label className="sr-only" htmlFor="os-menu-new-folder">New folder name</label>
        <input id="os-menu-new-folder" value={newName} maxLength={32} placeholder="New folder name" onChange={(event) => setNewName(event.target.value)} />
        <button type="submit" className="os-menu__item" disabled={!newName.trim()}>Create folder</button>
      </form>
      {error && <p className="os-menu__empty" role="status">{error} <button type="button" className="os-button" onClick={clearError}>Dismiss</button></p>}
      <ul className="os-menu__list" aria-label="Apps">{roots.map((id) => renderEntry(id, []))}</ul>
      {documents.length > 0 && (
        <>
          <h2 className="os-menu__heading">Documents</h2>
          <ul className="os-menu__list" aria-label="Documents">{documents.map((id) => renderEntry(id, []))}</ul>
        </>
      )}
    </>
  );
}

function AppsPlaceholder({ id }: { id: EntryId }) {
  const def = apps[id as AppId];
  const Icon = def?.icon ?? Folder;
  return <Icon size={16} strokeWidth={1.9} aria-hidden="true" />;
}

export default StartMenuApps;
