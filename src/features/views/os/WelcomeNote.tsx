import { useCallback, useId, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { noteKey } from "./settings/osSettings";
import type { OsStyle } from "./types";

export const defaultNote = "Welcome!\n\nThis site represents my interests and passions.\n\nHappy exploring!\n— Sid";
const maxLength = 2000;

/* Desktop placement in desktop pixels. DesktopIcons keeps icons out of the cells it covers, and Sid Search opens beside it. */
export const noteBox = { width: 220, height: 220, top: 12, right: 16 };
export const noteGap = 12;

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

export function useWelcomeNote() {
  const [text, setText] = useState(readNote);
  const [saved, setSaved] = useState(true);
  const change = useCallback((next: string) => {
    setText(next);
    setSaved(writeNote(next));
  }, []);
  /* Reset all has already cleared the stored copy along with the other Lab OS keys. */
  const restore = useCallback(() => {
    setText(defaultNote);
    setSaved(true);
  }, []);
  return { text, saved, change, restore };
}

type Props = {
  text: string;
  saved: boolean;
  style: OsStyle;
  phone: boolean;
  onChange: (text: string) => void;
  onHide: () => void;
};

function WelcomeNote({ text, saved, style, phone, onChange, onHide }: Props) {
  const id = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const edited = text !== defaultNote;
  const iconSize = style === "retro" ? 9 : 14;

  return (
    <section
      className={`os-welcome${phone ? " os-welcome--card" : ""}`}
      aria-label="Welcome note"
      style={phone ? undefined : { width: noteBox.width, height: noteBox.height, top: noteBox.top, right: noteBox.right }}
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
            onChange(defaultNote);
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
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className="os-welcome__hint">{saved ? "Edit me. Saved in this browser." : "Edits last until this page closes."}</p>
    </section>
  );
}

export default WelcomeNote;
