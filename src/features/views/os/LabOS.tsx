import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, CodeXml, FileText, Mail, Monitor, Palette, Power, RotateCcw, Search, Wifi, WifiOff } from "lucide-react";
import { profileContent } from "../../../content/siteContent";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import BootSequence, { labLogo } from "../search/BootSequence";
import { hasBooted, rememberBoot } from "../search/bootState";
import { useSiteView } from "../SiteViewContext";
import { siteViews } from "../siteViews";
import { contactLinks, roleLine } from "../viewData";
import { apps, desktopApps, gameApps, phoneApps, type AppId } from "./apps";
import { isOsMessage, openInNewTab, type OsMessage } from "./embed";
import OsWindow, { clamp } from "./OsWindow";
import type { DeskSize, OsActions, OsWin, Rect } from "./types";
import { SignalStatus, SignalsProvider } from "./Signals";
import DesktopIcons, { iconCell } from "./DesktopIcons";
import "../search/search.css";
import "./os.css";

type OsStyle = "modern" | "retro";

const styleKey = "lab-os-style-v1";
const phoneQuery = "(max-width: 760px), (max-height: 500px)";
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
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

function iconColumnsWidth(deskHeight: number) {
  const rows = Math.max(1, Math.floor((deskHeight - 16) / iconCell));
  return 8 + Math.ceil(desktopApps.length / rows) * iconCell;
}

/* Sid Search fills the desktop beside the icons; everything else opens centered, cascading. */
function initialRect(app: AppId, desk: DeskSize, count: number): Rect & { maximized: boolean } {
  const size = apps[app].size;
  if (size === "fill") {
    const x = iconColumnsWidth(desk.h) + 12;
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
function withLocation(win: OsWin, path: string): OsWin {
  if (win.pending !== undefined && path === win.pending) return { ...win, pending: undefined };
  if (win.history[win.index] === path) return win;
  const history = [...win.history.slice(0, win.index + 1), path];
  return { ...win, history, index: history.length - 1, pending: undefined };
}

function isPlainClick(event: ReactMouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function DesktopShell() {
  const reducedMotion = usePrefersReducedMotion();
  const { setView } = useSiteView();
  const location = useLocation();
  const navigate = useNavigate();
  const [booting, setBooting] = useState(() => !reducedMotion && !hasBooted());
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
  const launched = useRef(false);
  /* Deep links like /#writing open Sid Search at that section. */
  const initialHash = useRef(location.hash);
  const live = useRef({ windows, desk, phone });
  live.current = { windows, desk, phone };
  const now = useClock();
  const retro = style === "retro";
  const visibleApps = [...desktopApps.filter((id) => id !== "games"), ...gameApps].filter((id) => `${apps[id].label} ${apps[id].blurb}`.toLowerCase().includes(appQuery.trim().toLowerCase()));
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
    if (booting && reducedMotion) finishBoot();
  }, [booting, reducedMotion, finishBoot]);

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

  const open = useCallback((app: AppId) => {
    setMenuOpen(false);
    setCalendarOpen(false);
    setDesktopWindows([]);
    const { windows: current, desk: size, phone: onPhone } = live.current;
    if (app === "resume" && onPhone) {
      openInNewTab(profileContent.resumeHref);
      return;
    }
    const existing = current.find((win) => win.app === app);
    if (existing) {
      focus(existing.id);
      return;
    }
    const def = apps[app];
    const hash = app === "search" ? initialHash.current : "";
    if (app === "search") initialHash.current = "";
    const win: OsWin = {
      id: `${app}-${++idRef.current}`,
      app,
      ...initialRect(app, size, current.length),
      z: ++zRef.current,
      minimized: false,
      src: def.kind === "site" ? `${import.meta.env.BASE_URL}${def.path?.slice(1) ?? ""}${hash}` : undefined,
      history: [],
      index: -1
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

  const actions = useMemo<OsActions>(
    () => ({ open, focus, close, minimize, toggleMax, place, home, traverse, reload, registerFrame, setView }),
    [open, focus, close, minimize, toggleMax, place, home, traverse, reload, registerFrame, setView]
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
      else if (message.type === "labos:boot") setBooting(true);
      else if (message.type === "labos:focus") {
        focus(windowId);
        setMenuOpen(false);
        setCalendarOpen(false);
      } else if (message.type === "labos:location") {
        setWindows((current) => current.map((win) => (win.id === windowId ? withLocation(win, message.path) : win)));
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

  const changeStyle = (next: OsStyle) => {
    setStyle(next);
    writeStyle(next);
    const params = new URLSearchParams(location.search);
    if (params.has("style")) {
      params.delete("style");
      const search = params.toString();
      navigate({ search: search ? `?${search}` : "", hash: location.hash }, { replace: true });
    }
  };

  const openResume = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (phone || !isPlainClick(event)) return;
    event.preventDefault();
    open("resume");
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
    setBooting(!reducedMotion);
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
    <>
      <div ref={rootRef} className={`os os--${style}${phone ? " os--phone" : ""}`}>
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
                    <a key={link.label} className="os-button" href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{link.label}</a>
                  ))}
                </div>
              </section>
              <p className="os-home__date"><time dateTime={now.toISOString()}>{dayFormat.format(now)}</time></p>
              <SignalStatus open={open} />
              <ul className="os-home__grid" aria-label="Apps">
                {phoneApps.map((id) => {
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
                  <a key={link.label} href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" title={link.label} aria-label={link.label}>
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
                  <h2 className="os-menu__heading">Apps</h2>
                  <ul className="os-menu__list" aria-label="Apps">
                    {visibleApps.map((id) => {
                      const def = apps[id];
                      const Icon = def.icon;
                      return (
                        <li key={id}>
                          <button type="button" className="os-menu__item" onClick={() => open(id)}>
                            <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                            {def.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {visibleApps.length === 0 && <p role="status">No apps match this search.</p>}
                </div>
                <div>
                  <h2 className="os-menu__heading">Contact</h2>
                  <ul className="os-menu__list" aria-label="Contact">
                    {contactLinks.map((link) => {
                      const Icon = contactIcons[link.label] ?? Mail;
                      return (
                        <li key={link.label}>
                          <a className="os-menu__item" href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={() => setMenuOpen(false)}>
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
                  <button type="button" className="os-menu__item" onClick={() => { setIconReset((value) => value + 1); setMenuOpen(false); }}>Arrange desktop icons</button>
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
    </>
  );
}

function LabOS() {
  return <SignalsProvider><DesktopShell /></SignalsProvider>;
}

export default LabOS;
