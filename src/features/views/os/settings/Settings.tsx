import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { siteViews } from "../../siteViews";
import { apps } from "../apps";
import FolderManager from "../FolderManager";
import type { OsActions, OsStyle, OsTarget } from "../types";
import { clockFormat, currentWallpaper, labOsStorage, useOsSettings, wallpapers, type ClockHours, type Motion } from "./osSettings";
import "./settings.css";

const installedApps = Object.values(apps).filter((app) => app.kind === "app" || app.kind === "game" || app.kind === "site").length;
const styles: { id: OsStyle; label: string }[] = [{ id: "modern", label: "Modern" }, { id: "retro", label: "Retro" }];
const clocks: { id: ClockHours; label: string }[] = [{ id: "12", label: "12-hour" }, { id: "24", label: "24-hour" }];
const motions: { id: Motion; label: string }[] = [{ id: "system", label: "System" }, { id: "reduce", label: "On" }, { id: "full", label: "Off" }];
const fullPageViews = siteViews.filter((view) => view.id !== "os");

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
}

/* Ticks on its own so the rest of Settings doesn't re-render every second. */
function ClockPreview({ clock, seconds }: { clock: ClockHours; seconds: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <time className="os-set__preview" dateTime={now.toISOString()}>{clockFormat(clock, seconds).format(now)}</time>;
}

export default function Settings({ actions }: { target?: OsTarget; actions: OsActions }) {
  const { settings, update, style, setStyle, deviceReducedMotion, phone, saved, arrangeIcons, resetAll } = useOsSettings();
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const resetRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wall = currentWallpaper(settings);
  const storage = labOsStorage();

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const cancel = () => {
    setConfirming(false);
    resetRef.current?.focus();
  };

  const onConfirmKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    cancel();
  };

  const confirmReset = () => {
    resetAll();
    setMessage("Lab OS settings were reset.");
    cancel();
  };

  return (
    <div className="os-set">
      <div className="os-set__page">
        <section className="os-set__section">
          <h2>Personalization</h2>
          <fieldset className="os-set__group">
            <legend>Wallpaper</legend>
            <div className="os-set__walls">
              {wallpapers.map((option) => (
                <label key={option.id} className="os-set-wall">
                  <input
                    type="radio"
                    name={`${id}-wall`}
                    value={option.id}
                    checked={settings.wallpaper === option.id}
                    onChange={() => update({ wallpaper: option.id })}
                    aria-labelledby={`${id}-${option.id}`}
                    aria-describedby={`${id}-${option.id}-suits`}
                  />
                  <span className="os-set-wall__swatch" style={{ background: option.background }} aria-hidden="true">
                    <Check size={14} strokeWidth={3} />
                  </span>
                  <span id={`${id}-${option.id}`} className="os-set-wall__name">{option.label}</span>
                  <span id={`${id}-${option.id}-suits`} className="os-set-wall__suits">{option.suits}</span>
                </label>
              ))}
              <label className="os-set-wall">
                <input
                  type="radio"
                  name={`${id}-wall`}
                  value="solid"
                  checked={settings.wallpaper === "solid"}
                  onChange={() => update({ wallpaper: "solid" })}
                  aria-labelledby={`${id}-solid`}
                  aria-describedby={`${id}-solid-suits`}
                />
                <span className="os-set-wall__swatch" style={{ background: settings.color }} aria-hidden="true">
                  <Check size={14} strokeWidth={3} />
                </span>
                <span id={`${id}-solid`} className="os-set-wall__name">Solid color</span>
                <span id={`${id}-solid-suits`} className="os-set-wall__suits">Pick any color</span>
              </label>
            </div>
            <div className="os-set__row">
              <label htmlFor={`${id}-color`}>Color</label>
              <input id={`${id}-color`} className="os-set__color" type="color" value={settings.color} onChange={(event) => update({ wallpaper: "solid", color: event.target.value.toLowerCase() })} />
              <span className="os-set__hint">Choosing a color switches to Solid color.</span>
            </div>
          </fieldset>
          <fieldset className="os-set__group">
            <legend>Welcome note</legend>
            <div className="os-set__choices">
              <label className="os-set-choice">
                <input type="checkbox" checked={settings.note} onChange={(event) => update({ note: event.target.checked })} />
                Show welcome note
              </label>
            </div>
            <p className="os-set__hint">Your note text and desktop size stay in this browser. Drag its left or bottom edge to resize, or focus its corner and use arrow keys. Reset all restores the original text and size.</p>
          </fieldset>
        </section>

        <section className="os-set__section">
          <h2>System</h2>
          <fieldset className="os-set__group">
            <legend>Style</legend>
            <div className="os-set__choices">
              {styles.map((option) => (
                <label key={option.id} className="os-set-choice">
                  <input type="radio" name={`${id}-style`} value={option.id} checked={style === option.id} onChange={() => setStyle(option.id)} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="os-set__group">
            <legend>Clock</legend>
            <div className="os-set__choices">
              {clocks.map((option) => (
                <label key={option.id} className="os-set-choice">
                  <input type="radio" name={`${id}-clock`} value={option.id} checked={settings.clock === option.id} onChange={() => update({ clock: option.id })} />
                  {option.label}
                </label>
              ))}
              <label className="os-set-choice">
                <input type="checkbox" checked={settings.seconds} onChange={(event) => update({ seconds: event.target.checked })} />
                Show seconds
              </label>
            </div>
            <p className="os-set__hint">Preview: <ClockPreview clock={settings.clock} seconds={settings.seconds} /></p>
          </fieldset>
          <fieldset className="os-set__group" aria-describedby={`${id}-motion-hint`}>
            <legend>Reduce motion</legend>
            <div className="os-set__choices">
              {motions.map((option) => (
                <label key={option.id} className="os-set-choice">
                  <input type="radio" name={`${id}-motion`} value={option.id} checked={settings.motion === option.id} onChange={() => update({ motion: option.id })} />
                  {option.label}
                </label>
              ))}
            </div>
            <p id={`${id}-motion-hint`} className="os-set__hint">
              System follows this device, which {deviceReducedMotion ? "asks for reduced motion" : "allows motion"}. On stops window, menu, and app animations, and skips the boot screen.
            </p>
          </fieldset>
        </section>

        <div className="os-set__section">
          <FolderManager open={actions.openEntry} />
        </div>

        <section className="os-set__section" aria-labelledby={`${id}-views`}>
          <h2 id={`${id}-views`}>Full-page views</h2>
          <p className="os-set__intro">A full-page view swaps Lab OS for another design of the whole site; its View button brings you back.</p>
          <ul className="os-set__views" aria-label="Full-page views">
            {fullPageViews.map((view) => (
              <li key={view.id}>
                <button type="button" className="os-set-view" onClick={() => actions.setView(view.id)} aria-labelledby={`${id}-view-${view.id}-name`} aria-describedby={`${id}-view-${view.id}`}>
                  <span id={`${id}-view-${view.id}-name`} className="os-set-view__name">{view.label}</span>
                  <span id={`${id}-view-${view.id}`} className="os-set-view__about">{view.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="os-set__section">
          <h2>Reset</h2>
          {!phone && (
            <div className="os-set__action">
              <p>Put the desktop icons back in their original places.</p>
              <button type="button" className="os-button" onClick={() => { arrangeIcons(); setMessage("Desktop icons arranged."); }}>Arrange icons</button>
            </div>
          )}
          <div className="os-set__action">
            <p>Clear the wallpaper, style, clock, motion, icon layout, folders, Recycle Bin, and welcome note this browser saved for Lab OS.</p>
            <button ref={resetRef} type="button" className="os-button" aria-expanded={confirming} aria-controls={`${id}-confirm`} onClick={() => { setMessage(""); setConfirming(true); }}>
              Reset all Lab OS settings…
            </button>
          </div>
          <div id={`${id}-confirm`} className="os-set__confirm" role="group" aria-labelledby={`${id}-confirm-text`} hidden={!confirming} onKeyDown={onConfirmKey}>
            <p id={`${id}-confirm-text`}>Reset all Lab OS settings? Game best scores stay.</p>
            <div className="os-set__buttons">
              <button type="button" className="os-button os-button--danger" onClick={confirmReset}>Reset everything</button>
              <button ref={cancelRef} type="button" className="os-button" onClick={cancel}>Cancel</button>
            </div>
          </div>
          <p className="os-set__status" role="status">{message}</p>
          {!saved && <p className="os-set__hint">This browser isn't saving settings, so changes last until the page closes.</p>}
        </section>

        <section className="os-set__section">
          <h2>Feedback</h2>
          <div className="os-set__action">
            <p>Give the site a thumbs up or down, with an optional comment. It's posted publicly as a GitHub issue.</p>
            <button type="button" className="os-button" onClick={(event) => actions.feedback(event.currentTarget)}>Send feedback</button>
          </div>
        </section>

        <section className="os-set__section">
          <h2>About this PC</h2>
          <dl className="os-set__specs">
            <div><dt>Operating system</dt><dd>Lab OS</dd></div>
            <div><dt>Style</dt><dd>{style === "retro" ? "Retro" : "Modern"}</dd></div>
            <div><dt>Wallpaper</dt><dd>{wall.label}</dd></div>
            <div><dt>Installed apps</dt><dd>{installedApps}</dd></div>
            <div><dt>Storage used</dt><dd>{storage ? `${formatBytes(storage.bytes)} in ${storage.keys} ${storage.keys === 1 ? "key" : "keys"}` : "Unavailable"}</dd></div>
            {navigator.hardwareConcurrency ? <div><dt>Processor</dt><dd>{navigator.hardwareConcurrency} threads</dd></div> : null}
            <div><dt>Display</dt><dd>{window.screen.width} × {window.screen.height}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}
