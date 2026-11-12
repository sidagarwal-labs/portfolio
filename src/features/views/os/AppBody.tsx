import { lazy, memo, Suspense, useCallback } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, FileText, Lock, RotateCw } from "lucide-react";
import { profileContent } from "../../../content/siteContent";
import { siteViews } from "../siteViews";
import { contactLinks, roleLine } from "../viewData";
import { apps, type AppId } from "./apps";
import FolderContents from "./FolderContents";
import { frameName, siteUrl } from "./embed";
import type { OsActions, OsTarget, OsWin } from "./types";

const games = {
  snake: lazy(() => import("./games/Snake")),
  blocks: lazy(() => import("./games/Blocks")),
  mines: lazy(() => import("./games/Mines")),
  rankit: lazy(() => import("./games/RankIt")),
  nexttoken: lazy(() => import("./games/NextToken"))
};

const nativeApps = {
  library: lazy(() => import("./library/Library")),
  github: lazy(() => import("./github/GitHubApp")),
  reader: lazy(() => import("./reader/Reader")),
  arxiv: lazy(() => import("./arxiv/ArxivSearch")),
  recyclebin: lazy(() => import("./RecycleBin")),
  settings: lazy(() => import("./settings/Settings"))
};

const host = "agarwal-labs.com";

function splitPath(path: string) {
  const hashAt = path.indexOf("#");
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : path.slice(hashAt);
  const queryAt = beforeHash.indexOf("?");
  return { pathname: queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt), hash };
}

/* What the window's page is at on the real site, so "open in new tab" leaves the OS on the same page. */
function fullPagePath(win: OsWin) {
  const def = apps[win.app];
  const path = win.history[win.index] ?? "/";
  const { pathname, hash } = splitPath(path);
  return pathname === "/" ? `/?view=${def.view}${hash}` : path;
}

function address(win: OsWin) {
  const def = apps[win.app];
  const path = win.history[win.index] ?? "/";
  const { pathname, hash } = splitPath(path);
  if (pathname !== "/") return `${host}${path}`;
  if (def.view === "search") return `${host}/search?q=${win.query ?? "sid+agarwal"}${hash}`;
  return `${host}/${def.view === "journal" ? "" : `?view=${def.view}`}${hash}`;
}

export function BrowserBar({ win, actions }: { win: OsWin; actions: OsActions }) {
  const def = apps[win.app];
  const shown = address(win);
  return (
    <div className="os-toolbar" role="toolbar" aria-label={`${def.title} navigation`}>
      <button type="button" className="os-tool" onClick={() => actions.traverse(win.id, -1)} disabled={win.index <= 0} aria-label="Back" title="Back">
        <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" className="os-tool" onClick={() => actions.traverse(win.id, 1)} disabled={win.index >= win.history.length - 1} aria-label="Forward" title="Forward">
        <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" className="os-tool" onClick={() => actions.reload(win.id)} aria-label="Reload" title="Reload">
        <RotateCw size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="os-address" title={shown}>
        <Lock size={12} strokeWidth={2} aria-hidden="true" />
        <span className="os-address__text">{shown}</span>
      </span>
      <a className="os-tool" href={siteUrl(fullPagePath(win))} target="_blank" rel="noreferrer" aria-label={`Open ${def.title} as a full page in a new tab`} title="Open as a full page">
        <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
      </a>
    </div>
  );
}

function ResumeViewer() {
  const href = profileContent.resumeHref;
  return (
    <div className="os-pdf">
      <div className="os-toolbar">
        <span className="os-address">
          <FileText size={13} strokeWidth={2} aria-hidden="true" />
          <span className="os-address__text">Siddhant_Agarwal_Resume.pdf</span>
        </span>
        <a className="os-tool os-tool--text" href={href} target="_blank" rel="noreferrer">
          <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
          Open
        </a>
        <a className="os-tool os-tool--text" href={href} download="Siddhant_Agarwal_Resume.pdf">
          <Download size={14} strokeWidth={2} aria-hidden="true" />
          Download
        </a>
      </div>
      <object className="os-pdf__doc" data={href} type="application/pdf" aria-label="Sid Agarwal's resume">
        <div className="os-pdf__fallback">
          <FileText size={40} strokeWidth={1.4} aria-hidden="true" />
          <p>This browser can't show PDFs inside a window.</p>
          <a className="os-button" href={href} target="_blank" rel="noreferrer">Open the resume</a>
        </div>
      </object>
    </div>
  );
}

function Readme({ actions }: { actions: OsActions }) {
  const appList: AppId[] = ["search", "library", "github", "projects", "arxiv", "forward", "designs"];
  return (
    <div className="os-note">
      <p><strong>Hi, I'm Sid Agarwal.</strong> {roleLine}.</p>
      <p>This site is a browser-based desktop simulation, and its apps are my portfolio. It does not control your computer or files.</p>
      <p>Drag desktop icons to arrange them; Shift + arrow keys also move a focused icon. Positions are saved in this browser. Drag title bars to move windows, their edges or corners to resize, and double-click a title bar to maximize. The taskbar restores minimized apps. Settings, in Start or behind the taskbar's gear, changes the wallpaper, style, clock, and motion.</p>
      <p>Sid Search, Library, and GitHub start on the top row of the desktop. arXiv Search has its own icon beside the Projects folder on the second row. Projects, Other designs, and Games start with shortcuts to my projects, other site designs, and games. Right-click empty space for New folder, or use the New folder buttons in Start, Settings, Home, and folder windows. Names edit inline: Enter saves, Escape cancels, and F2 renames a folder. Folder Actions buttons also offer Rename and Move to Recycle Bin. Delete moves any app or folder (with everything inside it) to Recycle Bin, and so does dropping it on the Recycle Bin or cutting it and pasting into an open Recycle Bin; Restore brings it back to where it was. Drag apps or folders onto a folder icon, between open folder windows, or back onto the desktop. The path at the top of a folder also accepts drops onto its parent or Desktop. Control-click to select several items; Ctrl/Cmd+X and Ctrl/Cmd+V cut and paste. On touch screens, enable Arrange apps on Home or Select items inside a folder before dragging. Your folder layout is shared with Start and the phone home screen. Settings can restore the default layout, clearing the Recycle Bin too. Resume, README.txt, and Recycle Bin start at the bottom-left of the desktop.</p>
      <ul>
        {appList.map((id) => (
          <li key={id}>
            <button type="button" className="os-note__link" onClick={() => actions.open(id)}>{apps[id].label}</button>
            {id === "search" ? ": start here. " : ": "}
            {apps[id].blurb}
          </li>
        ))}
        <li>
          <button type="button" className="os-note__link" onClick={() => actions.open("games")}>Games</button>: {apps.games.blurb}
        </li>
        {(["markets", "launches", "leaderboards"] as const).map((id) => (
          <li key={id}>
            <button type="button" className="os-note__link" onClick={() => actions.open(id)}>{apps[id].label}</button>: {apps[id].blurb}
          </li>
        ))}
      </ul>
      <p>The taskbar widgets for NVDA, SpaceX, and the top AI model open those three apps.</p>
      <p>Forward pass and Training run include a real, small attention language model. Press Train to update its weights locally; the chart measures cross-entropy loss. It is an educational demo, not a chatbot. Training is capped and uses no visitor data or API calls.</p>
      <p className="os-note__links">
        In a hurry?{" "}
        <button type="button" className="os-note__link" onClick={() => actions.open("resume")}>Resume</button>
        {contactLinks.map((link) => (
          <span key={link.label}>
            {" · "}
            <a href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{link.label}</a>
          </span>
        ))}
      </p>
      <p className="os-note__links">
        Prefer a regular web page?{" "}
        {siteViews.filter((view) => view.id !== "os").map((view, index) => (
          <span key={view.id}>
            {index > 0 && " · "}
            <button type="button" className="os-note__link" onClick={() => actions.setView(view.id)}>{view.label}</button>
          </span>
        ))}
      </p>
    </div>
  );
}

type AppBodyProps = {
  id: string;
  app: AppId;
  folderId?: string;
  src?: string;
  target?: OsTarget;
  active: boolean;
  phone: boolean;
  actions: OsActions;
};

function AppBody({ id, app, folderId, src, target, active, actions }: AppBodyProps) {
  const def = apps[app];
  const frameRef = useCallback((frame: HTMLIFrameElement | null) => actions.registerFrame(id, frame), [actions, id]);

  if (def.kind === "site" && def.view) {
    return <iframe ref={frameRef} className="os-frame" name={frameName(def.view)} src={src} title={def.title} />;
  }
  if (def.kind === "pdf") return <ResumeViewer />;
  if (def.kind === "note") return <Readme actions={actions} />;
  if (def.kind === "folder") return <FolderContents folderId={folderId ?? app} actions={actions} />;
  if (def.kind === "link") return null;
  if (def.kind === "app") {
    const Native = nativeApps[app as keyof typeof nativeApps];
    return (
      <Suspense fallback={<p className="os-loading">Loading…</p>}>
        <Native target={target} actions={actions} />
      </Suspense>
    );
  }
  const Game = games[app as keyof typeof games];
  return (
    <Suspense fallback={<p className="os-loading">Loading…</p>}>
      <Game active={active} />
    </Suspense>
  );
}

export default memo(AppBody);
