import { createContext, useContext } from "react";
import type { OsStyle } from "../types";

/* Lab OS settings live in this browser only. Every key starts with "lab-os-", which About this PC counts. */
export const settingsKey = "lab-os-settings-v1";
export const styleKey = "lab-os-style-v1";
const iconLayoutKey = /^lab-os-icons-v\d+$/;
const ownKey = /^lab-os-/;

export type Motion = "system" | "reduce" | "full";
export type Tone = "dark" | "light";
type Wallpaper = { id: string; label: string; suits: string; background: string; tone: Tone };

/* CSS-only wallpapers, so there is nothing to download. The tone picks label colors that stay readable on it. */
export const wallpapers = [
  { id: "default", label: "Default", suits: "Follows the style", background: "var(--os-wall-default)", tone: "dark" },
  {
    id: "aurora",
    label: "Aurora",
    suits: "Modern",
    background: "radial-gradient(60% 55% at 18% 18%, rgba(46, 204, 150, 0.5), transparent 70%), radial-gradient(55% 60% at 82% 28%, rgba(124, 92, 240, 0.5), transparent 70%), radial-gradient(80% 60% at 50% 105%, rgba(20, 110, 140, 0.55), transparent 70%), #070b16",
    tone: "dark"
  },
  { id: "dusk", label: "Dusk", suits: "Modern", background: "linear-gradient(170deg, #121838 0%, #2d2563 40%, #6a2f6c 72%, #a6405a 100%)", tone: "dark" },
  {
    id: "graphite",
    label: "Graphite",
    suits: "Modern",
    background: "radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1.6px) 0 0 / 22px 22px, linear-gradient(160deg, #2b303b, #14171e)",
    tone: "dark"
  },
  {
    id: "daylight",
    label: "Daylight",
    suits: "Modern",
    background: "radial-gradient(70% 60% at 85% 10%, #ffffff, transparent 70%), linear-gradient(160deg, #dfe8f5 0%, #c3d3ea 55%, #aec3e0 100%)",
    tone: "light"
  },
  { id: "teal", label: "Classic teal", suits: "Retro", background: "#008080", tone: "dark" },
  {
    id: "clouds",
    label: "Clouds",
    suits: "Retro",
    background: "radial-gradient(22% 9% at 22% 24%, rgba(255, 255, 255, 0.9), transparent 70%), radial-gradient(16% 7% at 30% 20%, rgba(255, 255, 255, 0.85), transparent 70%), radial-gradient(26% 10% at 70% 46%, rgba(255, 255, 255, 0.9), transparent 70%), radial-gradient(18% 8% at 78% 42%, rgba(255, 255, 255, 0.85), transparent 70%), radial-gradient(24% 9% at 36% 78%, rgba(255, 255, 255, 0.85), transparent 70%), linear-gradient(180deg, #5e9ee6 0%, #9cc8f2 100%)",
    tone: "light"
  },
  {
    id: "tiles",
    label: "Tiles",
    suits: "Retro",
    background: "linear-gradient(45deg, #26246a 25%, transparent 25%, transparent 75%, #26246a 75%) 0 0 / 24px 24px, linear-gradient(45deg, #26246a 25%, transparent 25%, transparent 75%, #26246a 75%) 12px 12px / 24px 24px, #38368c",
    tone: "dark"
  }
] as const satisfies readonly Wallpaper[];

export type WallpaperId = (typeof wallpapers)[number]["id"] | "solid";
export type ClockHours = "12" | "24";

export type OsSettings = {
  wallpaper: WallpaperId;
  /* The solid color, kept while a preset is shown so switching back restores it. */
  color: string;
  clock: ClockHours;
  seconds: boolean;
  motion: Motion;
};

export const defaultSettings: OsSettings = { wallpaper: "default", color: "#3a6ea5", clock: "12", seconds: false, motion: "system" };

const hexColor = /^#[0-9a-f]{6}$/i;
const isWallpaperId = (value: unknown): value is WallpaperId =>
  value === "solid" || wallpapers.some((wall) => wall.id === value);

/* Each field falls back on its own, so one bad value doesn't discard the rest. */
export function readSettings(): OsSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(settingsKey) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultSettings;
    const field = (name: keyof OsSettings): unknown => Reflect.get(raw, name);
    const wallpaper = field("wallpaper");
    const color = field("color");
    const clock = field("clock");
    const motion = field("motion");
    return {
      wallpaper: isWallpaperId(wallpaper) ? wallpaper : defaultSettings.wallpaper,
      color: typeof color === "string" && hexColor.test(color) ? color.toLowerCase() : defaultSettings.color,
      clock: clock === "24" ? "24" : "12",
      seconds: field("seconds") === true,
      motion: motion === "reduce" || motion === "full" ? motion : "system"
    };
  } catch (error) {
    console.warn("Saved Lab OS settings could not be read.", error);
    return defaultSettings;
  }
}

export function writeSettings(settings: OsSettings) {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.warn("Lab OS settings could not be saved.", error);
    return false;
  }
}

/* Settings, style, and the desktop icon layout. Other Lab OS data, such as game best scores, stays. */
export function clearSavedSettings() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "");
    for (const key of keys) if (key === settingsKey || key === styleKey || iconLayoutKey.test(key)) localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn("Saved Lab OS settings could not be cleared.", error);
    return false;
  }
}

export function labOsStorage() {
  try {
    let bytes = 0;
    let keys = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !ownKey.test(key)) continue;
      keys += 1;
      bytes += new Blob([key, localStorage.getItem(key) ?? ""]).size;
    }
    return { bytes, keys };
  } catch {
    return undefined;
  }
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* Light when black text contrasts better than white. */
export function toneOf(hex: string): Tone {
  const light = luminance(hex);
  return (light + 0.05) / 0.05 > 1.05 / (light + 0.05) ? "light" : "dark";
}

export function currentWallpaper(settings: OsSettings): { label: string; background: string; tone: Tone } {
  if (settings.wallpaper === "solid") return { label: "Solid color", background: settings.color, tone: toneOf(settings.color) };
  return wallpapers.find((wall) => wall.id === settings.wallpaper) ?? wallpapers[0];
}

export function clockFormat(clock: ClockHours, seconds: boolean) {
  const hours24 = clock === "24";
  return new Intl.DateTimeFormat("en-US", {
    hour: hours24 ? "2-digit" : "numeric",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hourCycle: hours24 ? "h23" : "h12"
  });
}

/* What the Settings app reads and changes. The style keeps its own key from before Settings existed. */
export type OsSettingsApi = {
  settings: OsSettings;
  update: (patch: Partial<OsSettings>) => void;
  style: OsStyle;
  setStyle: (style: OsStyle) => void;
  deviceReducedMotion: boolean;
  phone: boolean;
  /* False when browser storage refused the last change. */
  saved: boolean;
  arrangeIcons: () => void;
  resetAll: () => void;
};

export const OsSettingsContext = createContext<OsSettingsApi | null>(null);

export function useOsSettings() {
  const context = useContext(OsSettingsContext);
  if (!context) throw new Error("useOsSettings must be used inside Lab OS");
  return context;
}
