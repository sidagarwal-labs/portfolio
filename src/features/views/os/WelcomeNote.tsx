import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Grip, RotateCcw, X } from "lucide-react";
import { clamp } from "./OsWindow";
import { noteKey, noteSizeKey } from "./settings/osSettings";
import type { DeskSize, OsStyle } from "./types";

export const defaultNote = "Welcome!\n\nThis site represents my interests and passions.\n\nHappy exploring!\n— Sid";
const maxLength = 2000;

/* Desktop placement in desktop pixels. DesktopIcons keeps icons out of the cells it covers, and Sid Search opens beside it. */
export const noteBox = { width: 220, height: 220, top: 12, right: 16 };
export const noteGap = 12;
export type NoteSize = { width: number; height: number };
const defaultSize: NoteSize = { width: noteBox.width, height: noteBox.height };
const minimumSize: NoteSize = { width: 200, height: 160 };

function clampNoteSize(size: NoteSize, desk: DeskSize): NoteSize {
  const width = Math.max(0, desk.w - noteBox.right - noteGap);
  const height = Math.max(0, desk.h - noteBox.top - noteGap);
  return {
    width: clamp(size.width, Math.min(minimumSize.width, width), width),
    height: clamp(size.height, Math.min(minimumSize.height, height), height)
  };
}

function readNoteSize() {
  try {
    const stored = localStorage.getItem(noteSizeKey);
    if (stored === null) return { size: defaultSize, saved: true };
    const raw: unknown = JSON.parse(stored);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || !("width" in raw) || typeof raw.width !== "number" || !Number.isSafeInteger(raw.width) || raw.width < minimumSize.width
      || !("height" in raw) || typeof raw.height !== "number" || !Number.isSafeInteger(raw.height) || raw.height < minimumSize.height) {
      throw new Error("Invalid saved welcome note size");
    }
    return { size: { width: raw.width, height: raw.height }, saved: true };
  } catch (error) {
    console.warn("Saved welcome note size could not be read.", error);
    return { size: defaultSize, saved: false };
  }
}

function writeNoteSize(size: NoteSize) {
  try {
    if (size.width === defaultSize.width && size.height === defaultSize.height) localStorage.removeItem(noteSizeKey);
    else localStorage.setItem(noteSizeKey, JSON.stringify(size));
    return true;
  } catch (error) {
    console.warn("The welcome note size could not be saved.", error);
    return false;
  }
}

function readNote() {
  try {
    return localStorage.getItem(noteKey)?.slice(0, maxLength) ?? defaultNote;
  } catch (error) {
    console.warn("The welcome note could not be read.", error);
    return defaultNote;
  }
}

/* Only the visitor's own text is stored, so a first visit leaves nothing behind. */
function writeNote(text: string) {
  try {
    if (text === defaultNote) localStorage.removeItem(noteKey);
    else localStorage.setItem(noteKey, text);
    return true;
  } catch (error) {
    console.warn("The welcome note could not be saved.", error);
    return false;
  }
}

export function useWelcomeNote(desk: DeskSize) {
  const [text, setText] = useState(readNote);
  const [saved, setSaved] = useState(true);
  const [preferred, setPreferred] = useState(readNoteSize);
  const [preview, previewSize] = useState<NoteSize | null>(null);
  /* A smaller viewport only clamps the display, never the visitor's preferred size. */
  const size = useMemo(() => clampNoteSize(preview ?? preferred.size, desk), [preview, preferred.size, desk]);
  const change = useCallback((next: string) => {
    setText(next);
    setSaved(writeNote(next));
  }, []);
  const resize = useCallback((next: NoteSize) => {
    setPreferred({ size: next, saved: writeNoteSize(next) });
    previewSize(null);
  }, []);
  /* Reset all has already cleared the stored copy along with the other Lab OS keys. */
  const restore = useCallback((cleared: boolean) => {
    setText(defaultNote);
    setSaved(cleared);
    setPreferred({ size: defaultSize, saved: cleared });
    previewSize(null);
  }, []);
  return { text, saved, change, restore, size, sizeSaved: preferred.saved, resize, previewSize };
}

type Props = {
  note: ReturnType<typeof useWelcomeNote>;
  style: OsStyle;
  phone: boolean;
  desk: DeskSize;
  onHide: () => void;
};

type ResizeEdge = "w" | "s" | "sw";

function WelcomeNote({ note, style, phone, desk, onHide }: Props) {
  const { text, saved, change, size, sizeSaved, resize, previewSize } = note;
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const cancelResize = useRef<(() => void) | null>(null);
  const edited = text !== defaultNote;
  const iconSize = style === "retro" ? 9 : 14;

  useLayoutEffect(() => () => cancelResize.current?.(), [phone, desk.w, desk.h]);

  const drag = (event: ReactPointerEvent<HTMLElement>, edge: ResizeEdge) => {
    const desktop = ref.current?.parentElement;
    if (!desktop || phone || event.button !== 0 || !event.isPrimary || cancelResize.current) return;
    event.preventDefault();
    event.stopPropagation();
    gripRef.current?.focus({ preventScroll: true });
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    const start = { x: event.clientX, y: event.clientY, ...size };
    let next = size;
    desktop.classList.add("is-dragging");

    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      next = clampNoteSize({
        width: edge.includes("w") ? start.width - (pointer.clientX - start.x) : start.width,
        height: edge.includes("s") ? start.height + (pointer.clientY - start.y) : start.height
      }, desk);
      next = { width: Math.round(next.width), height: Math.round(next.height) };
      previewSize(next);
    };
    const finish = (commit: boolean) => {
      cancelResize.current = null;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", release);
      handle.removeEventListener("pointercancel", cancelPointer);
      handle.removeEventListener("lostpointercapture", cancelPointer);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      desktop.classList.remove("is-dragging");
      if (commit && (next.width !== start.width || next.height !== start.height)) resize(next);
      else previewSize(null);
    };
    const release = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      move(pointer);
      finish(true);
    };
    const cancel = () => finish(false);
    const cancelPointer = (pointer: PointerEvent) => {
      if (pointer.pointerId === pointerId) cancel();
    };
    const escape = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      cancel();
    };
    cancelResize.current = cancel;
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", cancelPointer);
    handle.addEventListener("lostpointercapture", cancelPointer);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
  };

  const resizeWithKeys = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (cancelResize.current || event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 8;
    const next = clampNoteSize({
      width: size.width + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
      height: size.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)
    }, desk);
    if (next.width !== size.width || next.height !== size.height) resize(next);
  };

  return (
    <section
      ref={ref}
      className={`os-welcome${phone ? " os-welcome--card" : ""}`}
      aria-label="Welcome note"
      style={phone ? undefined : { ...size, top: noteBox.top, right: noteBox.right }}
    >
      <div className="os-welcome__bar">
        <h2 className="os-welcome__title">{style === "retro" ? "Welcome.txt - Notepad" : "Welcome note"}</h2>
        <button
          type="button"
          className="os-welcome__ctl"
          aria-label="Restore the original note"
          title="Restore the original note"
          disabled={!edited}
          onClick={() => {
            change(defaultNote);
            textRef.current?.focus();
          }}
        >
          <RotateCcw size={iconSize} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button type="button" className="os-welcome__ctl os-welcome__ctl--close" aria-label="Hide welcome note" title="Hide (Settings can show it again)" onClick={onHide}>
          <X size={iconSize} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      <textarea
        ref={textRef}
        className="os-welcome__text"
        aria-label="Welcome note text"
        aria-describedby={`${id}-hint`}
        value={text}
        maxLength={maxLength}
        placeholder="Write a note…"
        onChange={(event) => change(event.target.value)}
      />
      <p id={`${id}-hint`} className="os-welcome__hint" role="status">
        {saved ? "Edit me. Saved in this browser." : "Edits last until this page closes."}
        {!phone && !sizeSaved && " Note size is not saved in this browser."}
      </p>
      {!phone && (
        <>
          <span className="os-welcome__grip os-welcome__grip--w" aria-hidden="true" onPointerDown={(event) => drag(event, "w")} />
          <span className="os-welcome__grip os-welcome__grip--s" aria-hidden="true" onPointerDown={(event) => drag(event, "s")} />
          <button
            ref={gripRef}
            type="button"
            className="os-welcome__grip os-welcome__grip--sw"
            aria-label="Resize welcome note"
            aria-describedby={`${id}-resize-hint ${id}-size`}
            title="Resize note (arrow keys; Shift for larger steps)"
            onPointerDown={(event) => drag(event, "sw")}
            onKeyDown={resizeWithKeys}
          >
            <Grip size={14} aria-hidden="true" />
          </button>
          <p id={`${id}-resize-hint`} className="sr-only">Drag the left or bottom edge, or this corner. Arrow Left widens, Right narrows, Down makes taller, Up makes shorter. Hold Shift for larger steps. Escape cancels a drag.</p>
          <span id={`${id}-size`} className="sr-only" role="status">{size.width} by {size.height} pixels.</span>
        </>
      )}
    </section>
  );
}

export default WelcomeNote;
