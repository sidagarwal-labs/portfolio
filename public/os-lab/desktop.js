/* Support for guests with a graphical desktop (KolibriOS): screen mode tracking and readiness. */

/* v86 reports every mode change as [width, height, bpp]. Text modes report columns and rows with bpp 0. */
export function trackScreen(emu, onChange) {
  const screen = { width: 0, height: 0, bpp: 0, graphical: false };
  const waiters = new Set();
  emu.add_listener("screen-set-size", ([width, height, bpp]) => {
    Object.assign(screen, { width, height, bpp, graphical: bpp > 0 });
    onChange?.(screen);
    for (const waiter of waiters) waiter();
  });
  screen.until = (test, timeoutMs) => new Promise((resolve) => {
    if (test(screen)) return resolve(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    const waiter = () => test(screen) && done(true);
    function done(found) {
      clearTimeout(timer);
      waiters.delete(waiter);
      resolve(found);
    }
    waiters.add(waiter);
  });
  return screen;
}

/* A desktop is up once the guest switches to a graphics mode at least 640 pixels wide (boot menus use text or 320×200). */
export const desktopShown = (screen) => screen.graphical && screen.width >= 640;
