const bootKey = "search-view-booted-v1";

export function hasBooted() {
  try {
    return sessionStorage.getItem(bootKey) === "1";
  } catch {
    return false;
  }
}

export function rememberBoot() {
  try {
    sessionStorage.setItem(bootKey, "1");
  } catch {
    // Storage can be unavailable in private modes; the intro just replays.
  }
}

/* Choosing the Search view from the switcher should play the intro again. */
export function forgetBoot() {
  try {
    sessionStorage.removeItem(bootKey);
  } catch {
    // Nothing stored, nothing to forget.
  }
}
