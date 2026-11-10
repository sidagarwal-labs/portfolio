import type { CSSProperties } from "react";
import { apps, menuSections, type AppId } from "./apps";

const homeApps = menuSections.flatMap((section) => section.items);

/* The phone home screen: the Start menu's groups as icons. Folders open as full-screen windows of their apps. */
function PhoneHomeApps({ open }: { open: (id: AppId) => void }) {
  return (
    <ul className="os-home__grid" aria-label="Apps">
      {homeApps.map((id) => {
        const def = apps[id];
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
