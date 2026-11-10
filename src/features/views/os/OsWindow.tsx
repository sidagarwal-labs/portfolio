import { memo, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ChevronLeft, Copy, Minus, Square, X } from "lucide-react";
import AppBody, { BrowserBar } from "./AppBody";
import { apps } from "./apps";
import type { DeskSize, OsActions, OsWin, Rect } from "./types";

const minWidth = 300;
const minHeight = 220;
/* How much of a window must stay on the desktop so its title bar can be grabbed again. */
const grip = 120;

export function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function placeWindow(win: OsWin, desk: DeskSize) {
  if (win.maximized) return { left: 0, top: 0, width: desk.w, height: desk.h };
  const width = Math.min(win.w, desk.w);
  const height = Math.min(win.h, desk.h);
  return { left: clamp(win.x, Math.min(0, grip - width), desk.w - grip), top: clamp(win.y, 0, desk.h - 40), width, height };
}

type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const resizeDirections: Exclude<DragMode, "move">[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

type OsWindowProps = {
  win: OsWin;
  active: boolean;
  phone: boolean;
  desk: DeskSize;
  actions: OsActions;
};

function OsWindow({ win, active, phone, desk, actions }: OsWindowProps) {
  const ref = useRef<HTMLElement>(null);
  const def = apps[win.app];
  const Icon = def.icon;
  const box = placeWindow(win, desk);
  const canGoBack = win.index > 0;

  useLayoutEffect(() => {
    if (ref.current) ref.current.inert = win.minimized;
  }, [win.minimized]);

  /* Moves and resizes write straight to the element and commit once on release, so frames don't re-render mid-drag. */
  const drag = (event: ReactPointerEvent<HTMLElement>, mode: DragMode) => {
    const element = ref.current;
    const desktop = element?.parentElement;
    if (!element || !desktop || event.button !== 0 || phone || win.maximized) return;
    if (mode === "move" && event.target instanceof Element && event.target.closest("button, a, input")) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight };
    const bounds = { w: desktop.clientWidth, h: desktop.clientHeight };
    const next: Rect = { x: start.left, y: start.top, w: start.width, h: start.height };
    desktop.classList.add("is-dragging");

    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (mode === "move") {
        next.x = clamp(start.left + dx, Math.min(0, grip - start.width), bounds.w - grip);
        next.y = clamp(start.top + dy, 0, bounds.h - 40);
        element.style.left = `${next.x}px`;
        element.style.top = `${next.y}px`;
        return;
      }
      if (mode.includes("e")) {
        next.w = clamp(start.width + dx, minWidth, bounds.w - start.left);
      }
      if (mode.includes("w")) {
        next.x = clamp(start.left + dx, 0, start.left + start.width - minWidth);
        next.w = start.left + start.width - next.x;
      }
      if (mode.includes("s")) {
        next.h = clamp(start.height + dy, minHeight, bounds.h - start.top);
      }
      if (mode.includes("n")) {
        next.y = clamp(start.top + dy, 0, start.top + start.height - minHeight);
        next.h = start.top + start.height - next.y;
      }
      element.style.left = `${next.x}px`;
      element.style.top = `${next.y}px`;
      element.style.width = `${next.w}px`;
      element.style.height = `${next.h}px`;
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("lostpointercapture", end);
      desktop.classList.remove("is-dragging");
      actions.place(win.id, next);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", end);
  };

  const className = [
    "os-win",
    `os-win--${def.kind}`,
    active && "is-active",
    win.minimized && "is-minimized",
    win.maximized && !phone && "is-maximized"
  ].filter(Boolean).join(" ");
  const style: CSSProperties = phone
    ? { zIndex: win.z }
    : { left: box.left, top: box.top, width: box.width, height: box.height, zIndex: win.z };

  return (
    <section
      ref={ref}
      className={className}
      style={style}
      aria-label={def.title}
      data-app={def.id}
      onPointerDownCapture={() => actions.focus(win.id)}
      onFocusCapture={() => actions.focus(win.id)}
    >
      {phone ? (
        <header className="os-win__bar">
          <button type="button" className="os-win__home" onClick={actions.home}>
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
            Home
          </button>
          {canGoBack && (
            <button type="button" className="os-win__back" onClick={() => actions.traverse(win.id, -1)} aria-label={`Back in ${def.title}`}>
              <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <h2 className="os-win__title">{def.title}</h2>
          <button type="button" className="os-win__close" onClick={() => actions.close(win.id)} aria-label={`Close ${def.title}`}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
      ) : (
        <header className="os-win__bar" onPointerDown={(event) => drag(event, "move")} onDoubleClick={(event) => {
          if (!(event.target instanceof Element && event.target.closest("button"))) actions.toggleMax(win.id);
        }}>
          <span className="os-win__icon" aria-hidden="true"><Icon size={15} strokeWidth={2} /></span>
          <h2 className="os-win__title">{def.title}</h2>
          <span className="os-win__controls">
            <button type="button" className="os-win__ctl os-win__ctl--min" onClick={() => actions.minimize(win.id)} aria-label={`Minimize ${def.title}`} title="Minimize">
              <Minus size={11} strokeWidth={2.6} aria-hidden="true" />
            </button>
            <button type="button" className="os-win__ctl os-win__ctl--max" onClick={() => actions.toggleMax(win.id)} aria-label={`${win.maximized ? "Restore" : "Maximize"} ${def.title}`} title={win.maximized ? "Restore" : "Maximize"}>
              {win.maximized ? <Copy size={10} strokeWidth={2.4} aria-hidden="true" /> : <Square size={10} strokeWidth={2.6} aria-hidden="true" />}
            </button>
            <button type="button" className="os-win__ctl os-win__ctl--close" onClick={() => actions.close(win.id)} aria-label={`Close ${def.title}`} title="Close">
              <X size={12} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </span>
        </header>
      )}

      {def.kind === "site" && !phone && <BrowserBar win={win} actions={actions} />}

      <div className="os-win__body">
        <AppBody id={win.id} app={win.app} src={win.src} target={win.target} active={active} phone={phone} actions={actions} />
        {/* A PDF viewer swallows clicks, so an inactive one is covered until the window is focused. */}
        {def.kind === "pdf" && !active && <div className="os-win__shield" aria-hidden="true" />}
      </div>

      {!phone && !win.maximized && (
        resizeDirections.map((direction) => <span key={direction} className={`os-win__grip os-win__grip--${direction}`} onPointerDown={(event) => drag(event, direction)} aria-hidden="true" />)
      )}
    </section>
  );
}

export default memo(OsWindow);
