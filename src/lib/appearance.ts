export type Appearance = "light" | "dark" | "system";
export type ColorTheme = Exclude<Appearance, "system">;

export const isAppearance = (value: unknown): value is Appearance =>
  value === "light" || value === "dark" || value === "system";

let preference: Appearance = "light";
let system: MediaQueryList;
let parentRoot: HTMLElement | undefined;

function applyAppearance() {
  const inherited = parentRoot?.dataset.theme;
  const theme: ColorTheme = inherited === "light" || inherited === "dark"
    ? inherited
    : preference === "system" ? (system.matches ? "dark" : "light") : preference;
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
}

export function setAppearance(next: Appearance) {
  preference = next;
  applyAppearance();
}

/* Run before React paints, including in newly opened/navigated portfolio frames. Only our own
   documents opt in; no styles are injected into third-party frames or the browser's PDF viewer.
   Observing the parent also works when storage is blocked and for nested same-origin frames. */
export function initializeAppearance(initial: Appearance) {
  preference = initial;
  system = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(applyAppearance);
  try {
    if (window.parent !== window && window.parent.location.origin === window.location.origin) {
      parentRoot = window.parent.document.documentElement;
    }
  } catch {
    // A cross-origin parent has no authority over this page's appearance.
  }
  const watch = () => {
    if (parentRoot) observer.observe(parentRoot, { attributes: true, attributeFilter: ["data-theme"] });
    system.addEventListener("change", applyAppearance);
    applyAppearance();
  };
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    system.removeEventListener("change", applyAppearance);
  });
  window.addEventListener("pageshow", watch);
  watch();
}
