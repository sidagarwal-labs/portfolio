import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, CodeXml, FileText, Mail, MessageSquare, Monitor, Palette, Power, RotateCcw, Search, Settings as Gear, Wifi, WifiOff } from "lucide-react";
import { profileContent } from "../../../content/siteContent";
import { ReducedMotionOverride, usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import BootSequence, { labLogo } from "../search/BootSequence";
import { hasBooted, rememberBoot } from "../search/bootState";
import { useSiteView } from "../SiteViewContext";
import { siteViews } from "../siteViews";
import { contactLinks, roleLine } from "../viewData";
import { apps, type AppId } from "./apps";
import { isOsMessage, openInNewTab, type OsMessage } from "./embed";
import { isLinkApp, pageApp, routeLink } from "./linkRoutes";
import OsWindow, { clamp } from "./OsWindow";
import type { DeskSize, OsActions, OsStyle, OsWin, Rect } from "./types";
import { clearSavedSettings, clockFormat, currentWallpaper, defaultSettings, OsSettingsContext, readSettings, styleKey, writeSettings, type OsSettings, type OsSettingsApi } from "./settings/osSettings";
import { SignalStatus, SignalsProvider } from "./Signals";
import DesktopIcons, { iconAreaWidth } from "./DesktopIcons";
import StartMenuApps from "./StartMenuApps";
import PhoneHomeApps from "./PhoneHomeApps";
import FeedbackDialog from "./feedback/FeedbackDialog";
import type { FeedbackContext } from "./feedback/feedbackClient";
import "../search/search.css";
import "./os.css";

const phoneQuery = "(max-width: 760px), (max-height: 500px)";
const dayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const contactIcons: Record<string, typeof Mail> = { Email: Mail, LinkedIn: Briefcase, GitHub: CodeXml };

function readStyle(search: string): OsStyle {
  const param = new URLSearchParams(search).get("style");
  if (param === "modern" || param === "retro") return param;
  try {
    return localStorage.getItem(styleKey) === "retro" ? "retro" : "modern";
  } catch {
    return "modern";
  }
}

function writeStyle(style: OsStyle) {
  try {
    localStorage.setItem(styleKey, style);
  } catch {
    return;
  }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function useElementSize(ref: RefObject<HTMLElement>) {
  const [size, setSize] = useState<DeskSize>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize((current) => (
      current.w === element.clientWidth && current.h === element.clientHeight ? current : { w: element.clientWidth, h: element.clientHeight }
    ));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/* Sid Search fills the desktop beside the icons; everything else opens centered, cascading. */
function initialRect(app: AppId, desk: DeskSize, count: number): Rect & { maximized: boolean } {
  const size = apps[app].size;
  if (size === "fill") {
    const x = iconAreaWidth + 12;
    const w = desk.w - x - 16;
    return { x, y: 12, w, h: desk.h - 24, maximized: w < 640 };
  }
  const w = Math.min(size.w, desk.w - 32);
  const h = Math.min(size.h, desk.h - 24);
  const offset = (count % 5) * 28;
  return {
    x: clamp(Math.round((desk.w - w) / 2) + offset - 56, 0, desk.w - w),
    y: clamp(Math.round((desk.h - h) / 2) + offset - 40, 0, desk.h - h),
    w,
    h,
    maximized: false
  };
}

/* A site app reported a new location: push it onto the window's history unless it is the back/forward target. */
function withLocation(win: OsWin, path: string, replace = false): OsWin {
  if (win.pending !== undefined && path === win.pending) return { ...win, pending: undefined };
  if (win.history[win.index] === path) return win;
  /* An in-page change replaces the current entry; returning to the entry just behind it steps back instead. */
  if (replace) {
    if (win.index > 0 && win.history[win.index - 1] === path) return { ...win, index: win.index - 1, pending: undefined };
    return { ...win, history: win.history.map((entry, index) => (index === win.index ? path : entry)), pending: undefined };
  }
  const history = [...win.history.slice(0, win.index + 1), path];
  return { ...win, history, index: history.length - 1, pending: undefined };
}

function isPlainClick(event: ReactMouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function DesktopShell() {
  const deviceReducedMotion = usePrefersReducedMotion();
  const { setView } = useSiteView();
  const location = useLocation();
  const navigate = useNavigate();
  /* Read synchronously so the first paint already shows the saved wallpaper. */
  const [settings, setSettings] = useState<OsSettings>(readSettings);
  const [saved, setSaved] = useState(true);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const still = settings.motion === "reduce" || (settings.motion === "system" && deviceReducedMotion);
  const [booting, setBooting] = useState(() => !still && !hasBooted());
  const [style, setStyle] = useState<OsStyle>(() => readStyle(location.search));
  const phone = useMediaQuery(phoneQuery);
  const rootRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const desk = useElementSize(deskRef);
  const [windows, setWindows] = useState<OsWin[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [appQuery, setAppQuery] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [desktopWindows, setDesktopWindows] = useState<string[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [iconReset, setIconReset] = useState(0);
  const [off, setOff] = useState(false);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const zRef = useRef(1);
  const idRef = useRef(0);
  const targetSeq = useRef(0);
  const launched = useRef(false);
  /* Deep links like /#writing open Sid Search at that section. */
  const initialHash = useRef(location.hash);
  const live = useRef({ windows, desk, phone, style });
  live.current = { windows, desk, phone, style };
  const [feedback, setFeedback] = useState<FeedbackContext>();
  const feedbackOpener = useRef<HTMLElement | null>(null);
  const now = useClock();
  const retro = style === "retro";
  const calendarStart = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const calendarDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const calendarCells = Array.from({ length: Math.ceil((calendarStart + calendarDays) / 7) * 7 }, (_, index) => {
    const day = index - calendarStart + 1;
    return day > 0 && day <= calendarDays ? day : null;
  });

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.osStyle = style;
    return () => {
      delete document.documentElement.dataset.osStyle;
    };
  }, [style]);

  const finishBoot = useCallback(() => {
    rememberBoot();
    setBooting(false);
  }, []);

  useEffect(() => {
    if (booting && still) finishBoot();
  }, [booting, still, finishBoot]);

  useEffect(() => {
    if (rootRef.current) rootRef.current.inert = booting || off;
  }, [booting, off]);

  const focus = useCallback((id: string) => {
    setDesktopWindows([]);
    setWindows((current) => {
      const target = current.find((win) => win.id === id);
      if (!target) return current;
      const top = Math.max(0, ...current.filter((win) => !win.minimized).map((win) => win.z));
      if (!target.minimized && target.z === top) return current;
      const z = ++zRef.current;
      return current.map((win) => (win.id === id ? { ...win, z, minimized: false } : win));
    });
  }, []);

  const open = useCallback((requested: AppId, requestedTarget?: string) => {
    setMenuOpen(false);
    setCalendarOpen(false);
    setDesktopWindows([]);
    const { windows: current, desk: size, phone: onPhone } = live.current;
    const shortcut = apps[requested];
    /* Shortcuts (such as a project's repository) open the app they point to. */
    const app = shortcut.kind === "link" ? shortcut.opens.app : requested;
    const targetValue = shortcut.kind === "link" ? shortcut.opens.target : requestedTarget;
    if (app === "resume" && onPhone) {
      openInNewTab(profileContent.resumeHref);
      return;
    }
    const def = apps[app];
    /* Site apps take a target as the router path to show; native apps keep it as an OsTarget. */
    const page = def.kind === "site" ? targetValue : undefined;
    const target = targetValue === undefined || page !== undefined ? undefined : { value: targetValue, seq: ++targetSeq.current };
    const existing = current.find((win) => win.app === app);
    if (existing) {
      if (target) setWindows((list) => list.map((win) => (win.id === existing.id ? { ...win, target } : win)));
      if (page) {
        const message: OsMessage = { type: "labos:navigate", path: page };
        frames.current.get(existing.id)?.contentWindow?.postMessage(message, window.location.origin);
      }
      focus(existing.id);
      return;
    }
    const hash = app === "search" ? initialHash.current : "";
    if (app === "search") initialHash.current = "";
    const win: OsWin = {
      id: `${app}-${++idRef.current}`,
      app,
      ...initialRect(app, size, current.length),
      z: ++zRef.current,
      minimized: false,
      src: def.kind === "site" ? `${import.meta.env.BASE_URL}${(page ?? def.path)?.slice(1) ?? ""}${hash}` : undefined,
      history: [],
      index: -1,
      target
    };
    setWindows((list) => (list.some((item) => item.app === app) ? list : [...list, win]));
  }, [focus]);

  const close = useCallback((id: string) => setWindows((current) => current.filter((win) => win.id !== id)), []);

  const minimize = useCallback((id: string) => {
    setWindows((current) => current.map((win) => (win.id === id ? { ...win, minimized: true } : win)));
  }, []);

  const toggleMax = useCallback((id: string) => {
    setWindows((current) => current.map((win) => (win.id === id ? { ...win, maximized: !win.maximized } : win)));
  }, []);

  const place = useCallback((id: string, rect: Rect) => {
    setWindows((current) => current.map((win) => (win.id === id ? { ...win, ...rect } : win)));
  }, []);

  const home = useCallback(() => {
    setWindows((current) => (current.some((win) => !win.minimized) ? current.map((win) => ({ ...win, minimized: true })) : current));
  }, []);

  const traverse = useCallback((id: string, delta: number) => {
    const win = live.current.windows.find((item) => item.id === id);
    const index = win ? win.index + delta : -1;
    if (!win || index < 0 || index >= win.history.length) return;
    const path = win.history[index];
    setWindows((current) => current.map((item) => (item.id === id ? { ...item, index, pending: path } : item)));
    const message: OsMessage = { type: "labos:navigate", path };
    frames.current.get(id)?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const reload = useCallback((id: string) => {
    frames.current.get(id)?.contentWindow?.location.reload();
  }, []);

  const registerFrame = useCallback((id: string, frame: HTMLIFrameElement | null) => {
    if (frame) frames.current.set(id, frame);
    else frames.current.delete(id);
  }, []);

  /* Feedback records the frontmost window's app (and page, for site apps) and the current style. */
  const openFeedback = useCallback((opener?: HTMLElement | null) => {
    const { windows: list, style: current } = live.current;
    let top: OsWin | undefined;
    for (const win of list) if (!win.minimized && (!top || win.z > top.z)) top = win;
    feedbackOpener.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setMenuOpen(false);
    setCalendarOpen(false);
    setFeedback({ app: top?.app, path: top && apps[top.app].kind === "site" ? top.history[top.index] : undefined, view: "os", style: current });
  }, []);

  const closeFeedback = useCallback(() => {
    setFeedback(undefined);
    const opener = feedbackOpener.current;
    feedbackOpener.current = null;
    (opener?.isConnected ? opener : startRef.current)?.focus();
  }, []);

  const actions = useMemo<OsActions>(
    () => ({ open, focus, close, minimize, toggleMax, place, home, traverse, reload, registerFrame, setView, feedback: openFeedback }),
    [open, focus, close, minimize, toggleMax, place, home, traverse, reload, registerFrame, setView, openFeedback]
  );

  /* Desktop: Sid Search opens right away. Phone: the home screen comes first unless a deep link asked for a section. */
  const launch = useCallback(() => {
    live.current.windows = [];
    setWindows([]);
    if (!live.current.phone || initialHash.current) open("search");
  }, [open]);

  useEffect(() => {
    if (launched.current || desk.w === 0) return;
    launched.current = true;
    launch();
  }, [desk.w, launch]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isOsMessage(event.data)) return;
      let id: string | undefined;
      frames.current.forEach((frame, key) => {
        if (frame.contentWindow === event.source) id = key;
      });
      if (!id) return;
      const windowId = id;
      const message = event.data;
      if (message.type === "labos:open") open("resume");
      else if (message.type === "labos:link") {
        if (isLinkApp(message.app) && typeof message.target === "string") open(message.app, message.target.slice(0, 200));
      } else if (message.type === "labos:page") {
        if (typeof message.path === "string" && pageApp(message.path) === message.app) {
          open(message.app, message.path.slice(0, 200));
          /* Without this answer the window shows the page itself (see useFrameBridge). */
          if (typeof message.id === "number") {
            const reply: OsMessage = { type: "labos:handled", id: message.id };
            frames.current.get(windowId)?.contentWindow?.postMessage(reply, window.location.origin);
          }
        }
      } else if (message.type === "labos:boot") setBooting(true);
      else if (message.type === "labos:focus") {
        focus(windowId);
        setMenuOpen(false);
        setCalendarOpen(false);
      } else if (message.type === "labos:location") {
        setWindows((current) => current.map((win) => (win.id === windowId ? withLocation(win, message.path, message.replace === true) : win)));
      } else if (message.type === "labos:query") {
        setWindows((current) => current.map((win) => (win.id === windowId && win.query !== message.query ? { ...win, query: message.query } : win)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, focus]);

  useEffect(() => {
    if (!menuOpen && !calendarOpen) return;
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>("input, button, a")?.focus();
    else calendarRef.current?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !startRef.current?.contains(target)) setMenuOpen(false);
      if (!calendarRef.current?.contains(target) && !clockRef.current?.contains(target)) setCalendarOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setCalendarOpen(false);
      (menuOpen ? startRef : clockRef).current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, calendarOpen]);

  const covered = phone && windows.some((win) => !win.minimized);
  useEffect(() => {
    if (homeRef.current) homeRef.current.inert = covered;
  }, [covered]);

  const activeId = useMemo(() => {
    if (off || booting) return undefined;
    let top: OsWin | undefined;
    for (const win of windows) if (!win.minimized && (!top || win.z > top.z)) top = win;
    return top?.id;
  }, [windows, off, booting]);

  const dropStyleParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("style")) {
      params.delete("style");
      const search = params.toString();
      navigate({ search: search ? `?${search}` : "", hash: location.hash }, { replace: true });
    }
  }, [location.search, location.hash, navigate]);

  const changeStyle = useCallback((next: OsStyle) => {
    setStyle(next);
    writeStyle(next);
    dropStyleParam();
  }, [dropStyleParam]);

  const updateSettings = useCallback((patch: Partial<OsSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    setSaved(writeSettings(next));
  }, []);

  const arrangeIcons = useCallback(() => setIconReset((value) => value + 1), []);

  const resetAll = useCallback(() => {
    setSaved(clearSavedSettings());
    settingsRef.current = defaultSettings;
    setSettings(defaultSettings);
    setStyle("modern");
    dropStyleParam();
    setIconReset((value) => value + 1);
  }, [dropStyleParam]);

  const settingsApi = useMemo<OsSettingsApi>(
    () => ({ settings, update: updateSettings, style, setStyle: changeStyle, deviceReducedMotion, phone, saved, arrangeIcons, resetAll }),
    [settings, updateSettings, style, changeStyle, deviceReducedMotion, phone, saved, arrangeIcons, resetAll]
  );
  const timeFormat = useMemo(() => clockFormat(settings.clock, settings.seconds), [settings.clock, settings.seconds]);
  const wall = currentWallpaper(settings);

  const openResume = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (phone || !isPlainClick(event)) return;
    event.preventDefault();
    open("resume");
  };

  /* Contact links to Sid's GitHub open the GitHub app; other contact links keep their normal behavior. */
  const openContact = (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    setMenuOpen(false);
    const route = routeLink(href);
    if (!route || !isPlainClick(event)) return;
    event.preventDefault();
    open(route.app, route.target);
  };

  const shutDown = () => {
    setMenuOpen(false);
    setOff(true);
  };

  const powerOn = () => {
    setMenuOpen(false);
    setCalendarOpen(false);
    setDesktopWindows([]);
    setOff(false);
    launch();
    setBooting(!still);
  };

  const showDesktop = () => {
    if (desktopWindows.length) {
      setWindows((current) => current.map((win) => desktopWindows.includes(win.id) ? { ...win, minimized: false } : win));
      setDesktopWindows([]);
    } else {
      setDesktopWindows(windows.filter((win) => !win.minimized).map((win) => win.id));
      home();
    }
  };

  const taskButtons = windows.map((win) => {
    const def = apps[win.app];
    const Icon = def.icon;
    const current = win.id === activeId;
    return (
      <button
        key={win.id}
        type="button"
        className="os-task"
        aria-pressed={current}
        onClick={() => (current ? minimize(win.id) : focus(win.id))}
        title={win.minimized ? `Restore ${def.title}` : current ? `Minimize ${def.title}` : `Show ${def.title}`}
      >
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        <span>{def.title}</span>
      </button>
    );
  });

  const styleToggle = (
    <button type="button" className="os-style-toggle" onClick={() => changeStyle(retro ? "modern" : "retro")} title={`Switch to ${retro ? "modern" : "retro"} style`} aria-label={`Switch to ${retro ? "modern" : "retro"} style`}>
      <Palette size={15} strokeWidth={2} aria-hidden="true" />
    </button>
  );

  const startButton = (
    <button ref={startRef} type="button" className="os-start" aria-expanded={menuOpen} aria-controls="os-menu" onClick={() => { setCalendarOpen(false); setAppQuery(""); setMenuOpen((value) => !value); }}>
      <img src={labLogo} alt="" width="20" height="20" />
      <span>Start</span>
    </button>
  );

  return (
    <OsProviders api={settingsApi} still={still}>
      <div
        ref={rootRef}
        className={`os os--${style}${phone ? " os--phone" : ""}${still ? " os--still" : ""}${settings.motion === "reduce" ? " os--no-motion" : ""}${wall.tone === "light" ? " os--wall-light" : ""}`}
        data-wallpaper={settings.wallpaper}
        style={{ background: wall.background }}
      >
        <h1 className="sr-only">Sid Agarwal's portfolio, running as Lab OS</h1>

        {phone ? (
          <div className="os-status">
            <time>{timeFormat.format(now)}</time>
            <span className="os-status__name">Lab OS</span>
            <span className="os-status__icons" role="img" aria-label={online ? "Browser online" : "Browser offline"}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
            </span>
          </div>
        ) : null}

        <div ref={deskRef} className="os-desktop">
          {phone ? (
            <div ref={homeRef} className="os-home">
              <section className="os-widget" aria-label="About Sid">
                <img src={labLogo} alt="" width="52" height="52" />
                <div className="os-widget__who">
                  <strong>Sid Agarwal</strong>
                  <span>{roleLine}</span>
                </div>
                <div className="os-widget__actions">
                  <a className="os-button os-button--primary" href={profileContent.resumeHref} target="_blank" rel="noreferrer">Resume</a>
                  {contactLinks.map((link) => (
                    <a key={link.label} className="os-button" href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={(event) => openContact(event, link.href)}>{link.label}</a>
                  ))}
                </div>
              </section>
              <p className="os-home__date"><time dateTime={now.toISOString()}>{dayFormat.format(now)}</time></p>
              <SignalStatus open={open} />
              <PhoneHomeApps open={open} />
              <div className="os-home__footer">
                <button type="button" className="os-button" onClick={() => changeStyle(retro ? "modern" : "retro")}>
                  <Palette size={15} strokeWidth={2} aria-hidden="true" />
                  {retro ? "Modern style" : "Retro style"}
                </button>
                <button type="button" className="os-button" onClick={() => setView("journal")}>Classic site</button>
              </div>
            </div>
          ) : (
            <DesktopIcons desk={desk} open={open} reset={iconReset} />
          )}

          {desk.w > 0 && windows.map((win) => (
            <OsWindow key={win.id} win={win} active={win.id === activeId} phone={phone} desk={desk} actions={actions} />
          ))}
        </div>

        {!phone && (
          <footer className="os-taskbar">
            {startButton}
            <span className="os-quick" aria-label="Quick launch">
              <button type="button" onClick={() => open("search")} title="Open Sid Search" aria-label="Open Sid Search"><Search size={16} aria-hidden="true" /></button>
              <a href={profileContent.resumeHref} onClick={openResume} title="Resume" aria-label="Resume"><FileText size={16} strokeWidth={2} aria-hidden="true" /></a>
              {contactLinks.map((link) => {
                const Icon = contactIcons[link.label] ?? Mail;
                return (
                  <a key={link.label} href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" title={link.label} aria-label={link.label} onClick={(event) => openContact(event, link.href)}>
                    <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  </a>
                );
              })}
            </span>
            <nav className="os-tasks" aria-label="Open windows">{taskButtons}</nav>
            <SignalStatus open={open} />
            <span className="os-tray">
              <span role="img" aria-label={online ? "Browser online" : "Browser offline"} title={online ? "Browser reports a network connection" : "Browser reports no network connection"}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}</span>
              {styleToggle}
              <button type="button" className="os-tray-button" onClick={(event) => openFeedback(event.currentTarget)} title="Send feedback" aria-label="Send feedback">
                <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
              </button>
              <button type="button" className="os-tray-button" onClick={() => open("settings")} title="Open Settings" aria-label="Open Settings">
                <Gear size={15} strokeWidth={2} aria-hidden="true" />
              </button>
              <button ref={clockRef} type="button" className="os-clock" aria-label="Date and calendar" aria-expanded={calendarOpen} aria-controls="os-calendar" onClick={() => { setMenuOpen(false); setCalendarOpen((value) => !value); }}>
                <time dateTime={now.toISOString()}>{timeFormat.format(now)}<span>{dayFormat.format(now)}</span></time>
              </button>
            </span>
            <button type="button" className="os-show-desktop" aria-label={desktopWindows.length ? "Restore windows" : "Show desktop"} title={desktopWindows.length ? "Restore windows" : "Show desktop"} onClick={showDesktop}><Monitor size={14} aria-hidden="true" /></button>
          </footer>
        )}

        {calendarOpen && !phone && (
          <div ref={calendarRef} id="os-calendar" className="os-calendar" role="dialog" aria-label="Calendar" tabIndex={-1}>
            <h2>{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now)}</h2>
            <p>{online ? "Network available" : "Offline - cached data may be shown"}</p>
            <table aria-label="Current month">
              <thead><tr>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <th key={day}>{day}</th>)}</tr></thead>
              <tbody>{Array.from({ length: calendarCells.length / 7 }, (_, week) => (
                <tr key={week}>{calendarCells.slice(week * 7, week * 7 + 7).map((day, column) => <td key={column} aria-current={day === now.getDate() ? "date" : undefined}>{day}</td>)}</tr>
              ))}</tbody>
            </table>
            <button type="button" className="os-button" onClick={() => { setCalendarOpen(false); clockRef.current?.focus(); }}>Close calendar</button>
          </div>
        )}

        {menuOpen && !phone && (
          <div ref={menuRef} id="os-menu" className="os-menu" role="dialog" aria-label="Start menu">
            <div className="os-menu__band" aria-hidden="true"><span>Lab <b>OS</b></span></div>
            <div className="os-menu__main">
              <div className="os-menu__who">
                <img src={labLogo} alt="" width="40" height="40" />
                <div>
                  <strong>Sid Agarwal</strong>
                  <span>{roleLine}</span>
                </div>
              </div>
              <label className="os-menu__search">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Search apps</span>
                <input type="search" value={appQuery} onChange={(event) => setAppQuery(event.target.value)} placeholder="Search apps" />
              </label>
              <div className="os-menu__cols">
                <div>
                  <StartMenuApps query={appQuery} open={open} />
                </div>
                <div>
                  <h2 className="os-menu__heading">Contact</h2>
                  <ul className="os-menu__list" aria-label="Contact">
                    {contactLinks.map((link) => {
                      const Icon = contactIcons[link.label] ?? Mail;
                      return (
                        <li key={link.label}>
                          <a className="os-menu__item" href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={(event) => openContact(event, link.href)}>
                            <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                            {link.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                  <h2 className="os-menu__heading">Style</h2>
                  <div className="os-menu__seg" role="group" aria-label="Style">
                    <button type="button" aria-pressed={!retro} onClick={() => changeStyle("modern")}>Modern</button>
                    <button type="button" aria-pressed={retro} onClick={() => changeStyle("retro")}>Retro</button>
                  </div>
                  <button type="button" className="os-menu__item" onClick={() => { arrangeIcons(); setMenuOpen(false); }}>Arrange desktop icons</button>
                  <h2 className="os-menu__heading">Full-page views</h2>
                  <ul className="os-menu__list" aria-label="Full-page views">
                    {siteViews.filter((view) => view.id !== "os").map((view) => (
                      <li key={view.id}>
                        <button type="button" className="os-menu__item" onClick={() => setView(view.id)}>{view.label}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="os-menu__foot">
                <button type="button" className="os-menu__item os-menu__feedback" onClick={() => openFeedback(startRef.current)}>
                  <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
                  Send feedback
                </button>
                  <button type="button" className="os-menu__item" onClick={powerOn} title="Close apps and restart Lab OS">
                    <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                    Restart
                  </button>
                <button type="button" className="os-menu__item" onClick={shutDown}>
                  <Power size={15} strokeWidth={2} aria-hidden="true" />
                  Shut down
                </button>
              </div>
            </div>
          </div>
        )}
        {feedback && <FeedbackDialog context={feedback} onClose={closeFeedback} />}
      </div>

      {booting && <BootSequence onDone={finishBoot} desktop={false} />}

      {off && (
        <div className={`os-off os-off--${style}`} role="dialog" aria-modal="true" aria-label="Lab OS is shut down">
          <p>{retro ? "It's now safe to turn off your computer." : "Lab OS is shut down."}</p>
          <button type="button" className="os-off__power" onClick={powerOn} autoFocus>
            <Power size={18} strokeWidth={2} aria-hidden="true" />
            Turn on
          </button>
        </div>
      )}
    </OsProviders>
  );
}

/* Apps inside Lab OS read its settings, and its Reduce motion choice replaces the device preference for them. */
function OsProviders({ api, still, children }: { api: OsSettingsApi; still: boolean; children: ReactNode }) {
  return (
    <OsSettingsContext.Provider value={api}>
      <ReducedMotionOverride.Provider value={still}>{children}</ReducedMotionOverride.Provider>
    </OsSettingsContext.Provider>
  );
}

function LabOS() {
  return <SignalsProvider><DesktopShell /></SignalsProvider>;
}

export default LabOS;
