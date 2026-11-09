import { Check, Layers } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { forgetBoot } from "./search/bootState";
import { useSiteView } from "./SiteViewContext";
import { siteViews } from "./siteViews";
import "./views.css";

function ViewSwitcher() {
  const { view, setView } = useSiteView();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const current = siteViews.find((option) => option.id === view) ?? siteViews[0];

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  /* Lab OS has its own menu for switching views. */
  if (view === "os") return null;

  return (
    <div className="view-switcher" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className="view-switcher__toggle"
        aria-expanded={open}
        aria-controls="view-switcher-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Layers size={14} aria-hidden="true" />
        <span>View: {current.label}</span>
      </button>
      {open && (
        <div className="view-switcher__panel" id="view-switcher-panel" role="group" aria-label="Choose a site view">
          <ul>
            {siteViews.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={option.id === view}
                  onClick={() => {
                    setOpen(false);
                    if ((option.id === "search" || option.id === "os") && option.id !== view) forgetBoot();
                    setView(option.id);
                  }}
                >
                  <span className="view-switcher__label">
                    {option.label}
                    {option.id === view && <Check size={14} aria-hidden="true" />}
                  </span>
                  <span className="view-switcher__description">{option.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ViewSwitcher;
