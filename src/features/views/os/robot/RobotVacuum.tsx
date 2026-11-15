import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { AlertTriangle, Check, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { robotVacuumDone, robotVacuumLog, robotVacuumRoadmap } from "../../../../content/robotVacuum";
import ArticleBlocks from "../../../writing/ArticleBlocks";
import { useWidth } from "../../../live/chart";
import { apps } from "../apps";
import { siteUrl } from "../embed";
import type { OsActions, OsTarget } from "../types";
import { loadRobotStatus, type BatteryReading, type Consumable, type RobotStatus } from "./robotStatus";
import "./robot.css";

const def = apps.robotvacuum;
const tabs = [
  { id: "status", label: "Status" },
  { id: "log", label: "Build log" },
  { id: "roadmap", label: "Roadmap" }
] as const;

type TabId = (typeof tabs)[number]["id"];
type Load = { state: "loading" } | { state: "ready"; status: RobotStatus } | { state: "error"; message: string };

const timeoutMs = 15_000;
const staleAfterMs = 24 * 60 * 60 * 1000;
const stampFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const readingFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const readingTimeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const utcDayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const relativeFormat = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const consumables = [
  { key: "mainBrush", label: "Main brush" },
  { key: "sideBrush", label: "Side brush" },
  { key: "filter", label: "Filter" }
] as const;

/* Snapshot fields the robot didn't report are null. */
const known = (value: number | null, format = (number: number) => numberFormat.format(number)) => (value === null ? "Unknown" : format(value));

/* A date-only reset ("2026-11-15") is a calendar day, so it is shown as written rather than shifted into the visitor's zone. */
const resetDay = (value: string) => (value.length === 10 ? utcDayFormat : dayFormat).format(new Date(value));

const capitalize = (sentence: string) => sentence[0].toUpperCase() + sentence.slice(1);

function powerText(charging: boolean | null, docked: boolean | null) {
  const parts = [charging === null ? "" : charging ? "charging" : "not charging", docked === null ? "" : docked ? "on the dock" : "off the dock"].filter(Boolean);
  return capitalize(parts.length ? parts.join(", ") : "charging and dock status unknown");
}

function partNote({ hoursLeft, lastReset }: Consumable) {
  return capitalize([hoursLeft === null ? "hours left unknown" : `${numberFormat.format(hoursLeft)} h left`, lastReset === null ? "no reset recorded" : `reset ${resetDay(lastReset)}`].join(" · "));
}

function relativeTime(iso: string, now: number) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (seconds > -45) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["day", 86_400], ["hour", 3600], ["minute", 60]];
  const [unit, size] = units.find(([, length]) => Math.abs(seconds) >= length) ?? ["minute", 60];
  return relativeFormat.format(Math.round(seconds / size), unit);
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${numberFormat.format(hours)} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function useRobotStatus() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    setLoad({ state: "loading" });
    loadRobotStatus(controller.signal)
      .then((status) => setLoad({ state: "ready", status }))
      .catch((error: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        const message = timedOut ? "The status snapshot took too long to load." : error instanceof Error ? error.message : "The status snapshot didn't load.";
        console.warn("Robot status snapshot failed.", error);
        setLoad({ state: "error", message });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);
  return { load, reload: () => setAttempt((count) => count + 1) };
}

function Bar({ value, tone }: { value: number; tone?: "low" | "mid" | "ok" }) {
  return (
    <span className="rv-bar" data-tone={tone ?? (value < 20 ? "low" : value < 50 ? "mid" : "ok")} aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

function BatteryChart({ history }: { history: BatteryReading[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 150;
  const pad = { left: 40, right: 16, top: 18, bottom: 24 };
  const times = history.map((reading) => Date.parse(reading.t));
  const first = times[0];
  const last = times[times.length - 1];
  const span = last - first;
  const sameDay = new Date(first).toDateString() === new Date(last).toDateString();
  const label = (iso: string) => (sameDay ? readingTimeFormat : readingFormat).format(new Date(iso));
  const plotWidth = Math.max(0, width - pad.left - pad.right);
  const x = (time: number) => pad.left + (span > 0 ? ((time - first) / span) * plotWidth : plotWidth / 2);
  const y = (value: number) => pad.top + (1 - value / 100) * (height - pad.top - pad.bottom);
  const points = history.map((reading, index) => ({ x: x(times[index]), y: y(reading.battery), reading }));
  const summary = history.length === 1
    ? `Battery read ${history[0].battery}% at ${label(history[0].t)}.`
    : `Battery went from ${history[0].battery}% at ${label(history[0].t)} to ${history[history.length - 1].battery}% at ${label(history[history.length - 1].t)}, over ${history.length} readings.`;
  const labelled = history.length <= 12 ? points : [points[0], points[points.length - 1]];

  return (
    <div className="rv-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary}>
          {[0, 50, 100].map((tick) => (
            <g key={tick} className="rv-axis">
              <line className="rv-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
              <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{tick}%</text>
            </g>
          ))}
          <g className="rv-axis">
            <text x={points[0].x} y={height - 6} textAnchor={points.length > 1 ? "start" : "middle"}>{label(history[0].t)}</text>
            {points.length > 1 && <text x={points[points.length - 1].x} y={height - 6} textAnchor="end">{label(history[history.length - 1].t)}</text>}
          </g>
          {points.length > 1 && <polyline className="rv-line" points={points.map((point) => `${point.x},${point.y}`).join(" ")} />}
          {points.map((point) => <circle key={point.reading.t} className="rv-dot" cx={point.x} cy={point.y} r={4} />)}
          {labelled.map((point, index) => (
            <text key={point.reading.t} className="rv-dot__label" x={point.x} y={point.y - 9} textAnchor={labelled.length > 1 && index === 0 ? "start" : labelled.length > 1 && index === labelled.length - 1 ? "end" : "middle"}>
              {point.reading.battery}%
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

function StatusView({ status, now, onRefresh }: { status: RobotStatus; now: number; onRefresh: () => void }) {
  const id = useId();
  const { robot, maintenance, lifetime, battery, uptime } = status;
  const relative = relativeTime(status.updatedAt, now);
  const stale = now - Date.parse(status.updatedAt) > staleAfterMs;
  const power = powerText(robot.charging, robot.docked);

  return (
    <>
      <div className="rv-updated">
        <p>
          <span className="rv-updated__label">Last updated</span>{" "}
          <time dateTime={status.updatedAt}>{stampFormat.format(new Date(status.updatedAt))}</time>{" "}
          <span className="rv-updated__age">({relative})</span>
        </p>
        <button type="button" className="os-button" onClick={onRefresh}>
          <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
          Refresh
        </button>
      </div>
      {stale && <p className="rv-stale">This snapshot is from {relative}, so the robot may have changed since.</p>}

      <dl className="rv-stats">
        <div className="rv-stat rv-stat--battery" data-unknown={robot.battery === null ? "true" : undefined}>
          <dt>Battery</dt>
          {robot.battery === null ? (
            <>
              <dd className="rv-stat__value">Unknown</dd>
              <dd className="rv-stat__note rv-stat__note--warn">Battery reading stuck, diagnosing. The build log has the details.</dd>
            </>
          ) : (
            <>
              <dd className="rv-stat__value">{robot.battery}%</dd>
              <dd><Bar value={robot.battery} /></dd>
            </>
          )}
          <dd className="rv-stat__note">{power}</dd>
        </div>
        <div className="rv-stat">
          <dt>State</dt>
          <dd className="rv-stat__value rv-stat__value--text">{robot.state ?? "Unknown"}</dd>
        </div>
        <div className="rv-stat" data-error={robot.error ? "true" : undefined}>
          <dt>Errors</dt>
          <dd className="rv-stat__value rv-stat__value--text">{robot.error ?? "None"}</dd>
        </div>
        <div className="rv-stat">
          <dt>Model</dt>
          <dd className="rv-stat__value rv-stat__value--text">{robot.model}</dd>
        </div>
      </dl>

      <section className="rv-section" aria-labelledby={`${id}-history`}>
        <h3 id={`${id}-history`}>Battery history</h3>
        {battery.history.length > 0 ? (
          <>
            {robot.battery === null && <p className="rv-muted">The current reading is unknown. These are the last trusted readings.</p>}
            <BatteryChart history={battery.history} />
            <details className="rv-readings">
              <summary>Readings ({battery.history.length})</summary>
              <table className="rv-table">
                <thead><tr><th scope="col">Time</th><th scope="col">Battery</th></tr></thead>
                <tbody>
                  {battery.history.map((reading) => (
                    <tr key={reading.t}>
                      <td><time dateTime={reading.t}>{stampFormat.format(new Date(reading.t))}</time></td>
                      <td>{reading.battery}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : <p className="rv-muted">No readings yet.</p>}
      </section>

      <section className="rv-section" aria-labelledby={`${id}-maintenance`}>
        <h3 id={`${id}-maintenance`}>Maintenance</h3>
        <ul className="rv-parts">
          {consumables.map(({ key, label }) => {
            const part: Consumable = maintenance[key];
            return (
              <li key={key} className="rv-part">
                <span className="rv-part__name">{label}</span>
                {part.percentLeft === null ? <span className="rv-bar" aria-hidden="true" /> : <Bar value={part.percentLeft} />}
                <span className="rv-part__value" data-unknown={part.percentLeft === null ? "true" : undefined}>{known(part.percentLeft, (value) => `${numberFormat.format(value)}%`)}</span>
                <span className="rv-part__note">{partNote(part)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="rv-columns">
        <section className="rv-section" aria-labelledby={`${id}-lifetime`}>
          <h3 id={`${id}-lifetime`}>Lifetime</h3>
          <dl className="rv-facts">
            <div><dt>Cleans</dt><dd>{known(lifetime.cleans)}</dd></div>
            <div><dt>Cleaning time</dt><dd>{known(lifetime.minutes, duration)}</dd></div>
            <div><dt>Area cleaned</dt><dd>{known(lifetime.areaM2, (value) => `${numberFormat.format(value)} m²`)}</dd></div>
          </dl>
        </section>
        <section className="rv-section" aria-labelledby={`${id}-health`}>
          <h3 id={`${id}-health`}>Battery health</h3>
          <dl className="rv-facts">
            <div><dt>Charge cycles, last 7 days</dt><dd>{numberFormat.format(battery.chargeCycles)}</dd></div>
            <div><dt>Charge sessions, last 7 days</dt><dd>{numberFormat.format(battery.chargeSessions)}</dd></div>
            <div><dt>Reboots, last 7 days</dt><dd>{known(uptime.rebootsLast7d)}</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}

export default function RobotVacuum({ target }: { target?: OsTarget; actions: OsActions }) {
  const baseId = useId();
  const [active, setActive] = useState<TabId>("status");
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const { load, reload } = useRobotStatus();
  const now = useNow();

  useEffect(() => {
    const match = tabs.find((tab) => tab.id === target?.value);
    if (match) setActive(match.id);
  }, [target]);

  const select = (id: TabId, focus = false) => {
    setActive(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(tabs[next].id, true);
  };

  const panel = (id: TabId) => ({
    role: "tabpanel",
    id: `${baseId}-panel-${id}`,
    "aria-labelledby": `${baseId}-tab-${id}`,
    hidden: active !== id,
    tabIndex: 0
  });

  const Icon = def.icon;
  return (
    <div className="rv">
      <header className="rv-head">
        <span className="rv-head__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
        <div className="rv-head__id">
          <p className="rv-head__name">{def.title}</p>
          <p className="rv-head__sub">MOVA L600: build log and read-only status</p>
        </div>
        <div className="rv-tabs" role="tablist" aria-label="Robot Vacuum" onKeyDown={onKeyDown}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              className="rv-tab"
              aria-selected={active === tab.id}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => select(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="rv-panel" {...panel("status")}>
        <div className="rv-page">
          <p className="rv-notice">
            <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
            <span>A read-only public snapshot. There are no remote controls here, and the robot-control code stays private.</span>
          </p>
          {load.state === "loading" && (
            <p className="rv-loading" role="status">
              <LoaderCircle className="rv-spin" size={16} strokeWidth={2} aria-hidden="true" />
              Loading the latest snapshot…
            </p>
          )}
          {load.state === "error" && (
            <div className="rv-error" role="alert">
              <span className="rv-error__icon" aria-hidden="true"><AlertTriangle size={20} strokeWidth={2} /></span>
              <div className="rv-error__text">
                <h3>Status unavailable</h3>
                <p>{load.message}</p>
                <p>The build log and roadmap still work.</p>
                <button type="button" className="os-button" onClick={reload}>
                  <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
                  Try again
                </button>
              </div>
            </div>
          )}
          {load.state === "ready" && <StatusView status={load.status} now={now} onRefresh={reload} />}
        </div>
      </div>

      <div className="rv-panel" {...panel("log")}>
        <article className="rv-page rv-log" aria-labelledby={`${baseId}-log-title`}>
          <header className="rv-log__head">
            <h2 id={`${baseId}-log-title`}>{robotVacuumLog.title}</h2>
            <p className="rv-muted">{robotVacuumLog.date} · {robotVacuumLog.readTime} read</p>
            <a className="os-button" href={siteUrl(`/writing/${robotVacuumLog.slug}`)} target="_blank" rel="noreferrer">
              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
              Open as a full page
            </a>
          </header>
          <div className="article-body rv-log__body">
            <ArticleBlocks blocks={robotVacuumLog.content} headingLevel={3} idPrefix="rv-log-" />
          </div>
        </article>
      </div>

      <div className="rv-panel" {...panel("roadmap")}>
        <div className="rv-page rv-roadmap">
          <section className="rv-section" aria-labelledby={`${baseId}-done`}>
            <h3 id={`${baseId}-done`}>Done</h3>
            <ul className="rv-steps rv-steps--done">
              {robotVacuumDone.map((item) => (
                <li key={item}><Check size={15} strokeWidth={2.4} aria-hidden="true" /><span>{item}</span></li>
              ))}
            </ul>
          </section>
          <section className="rv-section" aria-labelledby={`${baseId}-next`}>
            <h3 id={`${baseId}-next`}>Next</h3>
            <ol className="rv-steps">
              {robotVacuumRoadmap.map((item) => <li key={item}><span>{item}</span></li>)}
            </ol>
          </section>
          <p className="rv-muted">Everything on this site stays read-only. The build log has the details behind each step.</p>
        </div>
      </div>
    </div>
  );
}
