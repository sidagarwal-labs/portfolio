import { Fragment, useState } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { apps, folderApps, menuSections, type AppId } from "./apps";

type Open = (id: AppId) => void;
type Entry = { id: AppId; folder?: string };

/* Every app the menu opens, with folders flattened in place, so search also finds the apps inside them. */
const searchable = menuSections.flatMap((section) => section.items.flatMap((id): Entry[] => {
  const children = folderApps(id);
  return children.length ? children.map((child) => ({ id: child, folder: apps[id].label })) : [{ id }];
}));

function MenuApp({ id, folder, open }: { id: AppId; folder?: string; open: Open }) {
  const def = apps[id];
  const Icon = def.icon;
  const hint = folder ? `os-menu-in-${id}` : undefined;
  return (
    <li>
      <button type="button" className="os-menu__item" onClick={() => open(id)} aria-label={folder ? def.label : undefined} aria-describedby={hint}>
        <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
        <span className="os-menu__text">
          <span>{def.label}</span>
          {folder && <span id={hint} className="os-menu__where">in {folder}</span>}
        </span>
      </button>
    </li>
  );
}

/* The Start menu's app groups. Folders stay open until the menu closes; a search lists matching apps flat. */
function StartMenuApps({ query, open }: { query: string; open: Open }) {
  const [expanded, setExpanded] = useState<AppId[]>([]);
  const needle = query.trim().toLowerCase();

  if (needle) {
    const matches = searchable.filter(({ id, folder }) => `${apps[id].label} ${apps[id].blurb} ${folder ?? ""}`.toLowerCase().includes(needle));
    return (
      <>
        <h2 className="os-menu__heading">Results</h2>
        <ul className="os-menu__list" aria-label="Search results">
          {matches.map(({ id, folder }) => <MenuApp key={id} id={id} folder={folder} open={open} />)}
        </ul>
        {matches.length === 0 && <p className="os-menu__empty" role="status">No apps match this search.</p>}
      </>
    );
  }

  const toggle = (id: AppId) => setExpanded((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  return (
    <>
      {menuSections.map((section) => (
        <Fragment key={section.label}>
          <h2 className="os-menu__heading">{section.label}</h2>
          <ul className="os-menu__list" aria-label={section.label}>
            {section.items.map((id) => {
              const children = folderApps(id);
              if (!children.length) return <MenuApp key={id} id={id} open={open} />;
              const isOpen = expanded.includes(id);
              const Icon = isOpen ? FolderOpen : apps[id].icon;
              return (
                <li key={id}>
                  <button type="button" id={`os-menu-folder-${id}`} className="os-menu__item os-menu__folder" aria-expanded={isOpen} aria-controls={`os-menu-${id}`} onClick={() => toggle(id)}>
                    <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                    <span className="os-menu__text">{apps[id].label}</span>
                    <ChevronRight className="os-menu__chevron" size={14} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <ul id={`os-menu-${id}`} className="os-menu__list os-menu__sub" aria-labelledby={`os-menu-folder-${id}`} hidden={!isOpen}>
                    {children.map((child) => <MenuApp key={child} id={child} open={open} />)}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
    </>
  );
}

export default StartMenuApps;
