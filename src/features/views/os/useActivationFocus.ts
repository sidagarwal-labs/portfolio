import { useEffect, type RefObject } from "react";

/* Moves keyboard focus into a window's content when the window opens or comes to the front, so shortcuts such as
   Ctrl/Cmd+V act on the window the user just brought forward. Focus already inside this window or in a text field stays put. */
export function useActivationFocus(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    const win = element?.closest(".os-win");
    if (!element || !win) return;
    let wasActive = false;
    const sync = () => {
      const active = win.classList.contains("is-active");
      if (active && !wasActive) {
        const focused = document.activeElement;
        const busy = focused instanceof HTMLElement && focused !== document.body
          && (win.contains(focused) || !!focused.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
        if (!busy) element.focus({ preventScroll: true });
      }
      wasActive = active;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(win, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [ref]);
}
