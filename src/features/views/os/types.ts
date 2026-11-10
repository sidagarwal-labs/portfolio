import type { SiteView } from "../siteViews";
import type { AppId } from "./apps";

export type Rect = { x: number; y: number; w: number; h: number };

/* What a routed link asked a native app to show; seq changes on every request so repeating a link re-applies it. */
export type OsTarget = { value: string; seq: number };

export type OsWin = Rect & {
  id: string;
  app: AppId;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /* Site apps: the frame's first URL. Later navigation never changes it, so the frame is never reloaded by React. */
  src?: string;
  /* Site apps: this window's own back/forward stack of router paths. */
  history: string[];
  index: number;
  /* A path the window was told to navigate to; its location report is not a new history entry. */
  pending?: string;
  /* Sid Search's current query, for the address bar. */
  query?: string;
  /* Native apps: the item a link opened them on. */
  target?: OsTarget;
};

export type OsActions = {
  open: (app: AppId, target?: string) => void;
  focus: (id: string) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  toggleMax: (id: string) => void;
  place: (id: string, rect: Rect) => void;
  home: () => void;
  traverse: (id: string, delta: number) => void;
  reload: (id: string) => void;
  registerFrame: (id: string, frame: HTMLIFrameElement | null) => void;
  setView: (view: SiteView) => void;
};

export type DeskSize = { w: number; h: number };
