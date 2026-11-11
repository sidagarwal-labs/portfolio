import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import { ExternalLink } from "lucide-react";
import { placeTip, useWidth, type TipPlace } from "./chart";
import { formatDay, labs, leaderboards, type Lab, type LabRelease } from "./leaderboardData";
import { bestScore, ciHalfWidth, defaultLabs, frontierSteps, labColorMap, recordIndices, releaseTime, scoreTicks, timeTicks } from "./labHistory";

const eciHref = leaderboards.epoch.benchmarks.find((bench) => bench.id === "eci")?.href ?? "https://epoch.ai/benchmarks/eci";
const colors = labColorMap(labs);
const startingLabs = defaultLabs(labs);
const records = labs.map((lab) => new Set(recordIndices(lab.models)));
const frontier = frontierSteps(labs);
const frontierReleases = new Set(frontier.map((step) => `${step.org}\n${step.model}`));
const day = 864e5;

type Point = { key: string; lab: number; index: number; org: string; release: LabRelease; x: number; y: number; record: boolean; frontier: boolean };

const one = (value: number) => value.toFixed(1);
const labStyle = (org: string) => ({ "--lab": colors.get(org) }) as CSSProperties;

function releaseNote(point: Pick<Point, "org" | "record" | "frontier">) {
  if (point.frontier) return "Best score from any lab at release";
  return point.record ? `New best for ${point.org}` : "";
}

function interval(release: LabRelease) {
  return release.low !== undefined && release.high !== undefined ? `${one(release.low)} to ${one(release.high)}` : "";
}

function pointLabel(point: Point) {
  const range = interval(point.release);
  const note = releaseNote(point);
  return `${point.release.model}, ${point.org}, released ${formatDay(point.release.date)}: ECI ${one(point.release.eci)}` +
    `${range ? `, credible interval ${range}` : ""}.${note ? ` ${note}.` : ""}`;
}

function LabChart({ shown, lit, showFrontier }: { shown: ReadonlySet<string>; lit: string | null; showFrontier: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipRef = useRef<HTMLDivElement>(null);
  /* A release's details show while the pointer is near its point, and stay pinned after a click, tap, or focus. */
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [place, setPlace] = useState<TipPlace | null>(null);
  /* Roving focus: each lab's series is one tab stop, on the release last visited (the latest at first). */
  const [cursor, setCursor] = useState<Record<number, number>>({});
  const press = useRef<{ touch: boolean; open: string | null }>({ touch: false, open: null });

  const visible = labs.flatMap((lab, index) => (shown.has(lab.org) ? [{ lab, index }] : []));
  const W = width;
  const narrow = W < 520;
  const H = narrow ? 300 : 380;
  const margin = { left: narrow ? 32 : 40, right: narrow ? 10 : 16, top: 26, bottom: 28 };
  const plotW = Math.max(1, W - margin.left - margin.right);
  const plotH = H - margin.top - margin.bottom;

  const times = visible.flatMap(({ lab }) => lab.models.map((release) => releaseTime(release.date)));
  let start = Math.min(...times);
  let end = Math.max(...times);
  if (end - start < 120 * day) {
    const middle = (start + end) / 2;
    start = middle - 60 * day;
    end = middle + 60 * day;
  }
  const pad = (end - start) * 0.03;
  start -= pad;
  end += pad;

  /* The frontier counts every lab, shown or not, so it stays put while labs are toggled. */
  const before = frontier.filter((step) => step.time <= start);
  const inRange = frontier.filter((step) => step.time > start && step.time <= end);
  const frontierFrom = before[before.length - 1];
  const scores = [
    ...visible.flatMap(({ lab }) => lab.models.map((release) => release.eci)),
    ...(showFrontier ? [...inRange, ...(frontierFrom ? [frontierFrom] : [])].map((step) => step.eci) : [])
  ];
  const yMin = Math.floor((Math.min(...scores) - 2) / 10) * 10;
  const yMax = Math.ceil((Math.max(...scores) + 2) / 10) * 10;
  const x = (time: number) => margin.left + ((time - start) / (end - start)) * plotW;
  const y = (eci: number) => margin.top + ((yMax - eci) / (yMax - yMin)) * plotH;
  const yTicks = scoreTicks(yMin, yMax, Math.floor(plotH / 36));
  const xTicks = timeTicks(start, end, Math.min(10, Math.floor(plotW / 52)));
  const radius = narrow ? 3.5 : 4;

  const series = visible.map(({ lab, index }) => ({
    lab,
    index,
    points: lab.models.map((release, at): Point => ({
      key: `${index}-${at}`, lab: index, index: at, org: lab.org, release,
      x: x(releaseTime(release.date)), y: y(release.eci),
      record: records[index].has(at), frontier: frontierReleases.has(`${lab.org}\n${release.model}`)
    }))
  }));
  const points = series.flatMap((item) => item.points);
  const activeKey = picked ?? hovered;
  const active = points.find((point) => point.key === activeKey) ?? null;
  const litOrg = active?.org ?? lit;
  const dimmed = (org: string) => litOrg !== null && org !== litOrg;
  const lineOrder = litOrg ? [...series.filter((item) => item.lab.org !== litOrg), ...series.filter((item) => item.lab.org === litOrg)] : series;

  const linePath = (item: typeof series[number]) => {
    const marks = item.points.filter((point) => point.record);
    const latest = item.points[item.points.length - 1];
    if (!marks.length) return "";
    return marks.map((point, at) => `${at ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ") +
      (latest.x > marks[marks.length - 1].x ? ` H${latest.x.toFixed(1)}` : "");
  };
  let frontierPath = frontierFrom ? `M${x(start).toFixed(1)} ${y(frontierFrom.eci).toFixed(1)}` : "";
  for (const step of inRange) {
    frontierPath += frontierPath ? ` H${x(step.time).toFixed(1)} V${y(step.eci).toFixed(1)}` : `M${x(step.time).toFixed(1)} ${y(step.eci).toFixed(1)}`;
  }
  if (frontierPath) frontierPath += ` H${x(end).toFixed(1)}`;

  const close = () => {
    setHovered(null);
    setPicked(null);
  };

  /* Escape, or a press outside the chart, puts the details away. */
  useEffect(() => {
    if (activeKey === null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && ref.current?.contains(event.target))) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [activeKey, ref]);

  const layout = `${W}|${start}|${end}|${yMin}|${yMax}`;
  useLayoutEffect(() => {
    const chart = ref.current;
    const tip = tipRef.current;
    const circle = activeKey === null ? null : chart?.querySelector(`.lb-point[data-key="${activeKey}"]`);
    if (!chart || !tip || !circle) {
      setPlace(null);
      return;
    }
    const box = chart.getBoundingClientRect();
    const dot = circle.getBoundingClientRect();
    setPlace(placeTip(
      { left: dot.left - box.left - 3, top: dot.top - box.top - 3, right: dot.right - box.left + 3, bottom: dot.bottom - box.top + 3 },
      tip.offsetWidth, tip.offsetHeight, chart.clientWidth, chart.clientHeight
    ));
  }, [activeKey, layout, ref]);

  /* The release nearest the pointer, within reach (in pixels). */
  const nearest = (event: { currentTarget: SVGSVGElement; clientX: number; clientY: number }, reach: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = box.width ? W / box.width : 1;
    const px = (event.clientX - box.left) * scale;
    const py = (event.clientY - box.top) * scale;
    let found: Point | null = null;
    let distance = reach;
    for (const point of points) {
      const gap = Math.hypot(point.x - px, point.y - py);
      /* On a tie, prefer the record, which is the point drawn on top. */
      if (gap <= reach && (!found || gap < distance || (gap === distance && point.record))) {
        found = point;
        distance = gap;
      }
    }
    return found;
  };

  const step = (event: KeyboardEvent<SVGCircleElement>, point: Point) => {
    const last = labs[point.lab].models.length - 1;
    const moves: Record<string, number> = { ArrowRight: point.index + 1, ArrowLeft: point.index - 1, Home: 0, End: last };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.min(last, Math.max(0, moves[event.key]));
    setCursor((current) => ({ ...current, [point.lab]: next }));
    ref.current?.querySelector<SVGCircleElement>(`.lb-point[data-key="${point.lab}-${next}"]`)?.focus();
  };

  const onBlur = (event: FocusEvent<SVGCircleElement>, point: Point) => {
    if (event.relatedTarget instanceof Node && tipRef.current?.contains(event.relatedTarget)) return;
    setPicked((key) => (key === point.key ? null : key));
  };

  const top = frontier[frontier.length - 1];
  const summary = `Showing ${visible.length} of ${labs.length} labs.` +
    (top ? ` The best score so far is ${top.model} from ${top.org}, ECI ${one(top.eci)}, released ${formatDay(new Date(top.time).toISOString())}.` : "") +
    " The table view lists every release.";
  const half = active ? ciHalfWidth(active.release) : undefined;
  const range = active ? interval(active.release) : "";
  const note = active ? releaseNote(active) : "";

  return (
    <div className="lb-chart" ref={ref}>
      {W > 0 && visible.length > 0 && (
        <svg
          className="lb-chart__svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-labelledby="lb-labs-chart-title lb-labs-chart-desc"
          onPointerMove={(event) => {
            if (event.pointerType !== "touch") setHovered(nearest(event, 16)?.key ?? null);
          }}
          onPointerLeave={() => setHovered(null)}
          onPointerDown={(event) => {
            press.current = { touch: event.pointerType === "touch", open: activeKey };
          }}
          onClick={(event) => {
            const target = event.target instanceof Element ? event.target.closest<SVGCircleElement>(".lb-point") : null;
            const hit = points.find((point) => point.key === target?.dataset.key) ?? nearest(event, press.current.touch ? 24 : 16);
            if (!hit) {
              close();
              return;
            }
            /* A second tap on the same release closes its details. */
            if (press.current.touch && press.current.open === hit.key) {
              close();
              return;
            }
            setPicked(hit.key);
            setCursor((current) => ({ ...current, [hit.lab]: hit.index }));
          }}
        >
          <title id="lb-labs-chart-title">Epoch Capabilities Index by release date, one line per lab</title>
          <desc id="lb-labs-chart-desc">{summary}</desc>
          <defs>
            <clipPath id="lb-labs-clip">
              <rect x={margin.left} y={margin.top - 8} width={plotW} height={plotH + 16} />
            </clipPath>
          </defs>
          <g className="lb-axis" aria-hidden="true">
            {yTicks.map((tick) => (
              <g key={tick}>
                <line x1={margin.left} x2={W - margin.right} y1={y(tick)} y2={y(tick)} />
                <text x={margin.left - 6} y={y(tick)} dy="0.32em" textAnchor="end">{tick}</text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <g key={tick.time}>
                <line className="lb-axis__tick" x1={x(tick.time)} x2={x(tick.time)} y1={margin.top + plotH} y2={margin.top + plotH + 4} />
                <text x={x(tick.time)} y={H - 8} textAnchor="middle" data-year={tick.year || undefined}>{tick.label}</text>
              </g>
            ))}
            <text className="lb-axis__title" x={4} y={12}>ECI</text>
          </g>
          {showFrontier && frontierPath && <path className="lb-frontier" d={frontierPath} clipPath="url(#lb-labs-clip)" aria-hidden="true" />}
          <g clipPath="url(#lb-labs-clip)" aria-hidden="true">
            {lineOrder.map((item) => (
              <g key={item.lab.org} className="lb-series" style={labStyle(item.lab.org)} data-dim={dimmed(item.lab.org) || undefined}>
                {item.points.map((point) => point.release.low !== undefined && point.release.high !== undefined && (
                  <line key={point.key} className="lb-whisker" x1={point.x} x2={point.x} y1={y(point.release.high)} y2={y(point.release.low)} />
                ))}
                <path className="lb-line" data-lab={item.lab.org} d={linePath(item)} />
              </g>
            ))}
          </g>
          {series.map((item) => {
            const focusAt = cursor[item.index] ?? item.points.length - 1;
            return (
              <g
                key={item.lab.org}
                className="lb-points"
                role="group"
                aria-label={`${item.lab.org}, ${item.points.length} releases`}
                style={labStyle(item.lab.org)}
                data-lab={item.lab.org}
                data-dim={dimmed(item.lab.org) || undefined}
              >
                {/* Records paint last, so a release that ties a record on the same day cannot hide it. */}
                {[...item.points].sort((a, b) => Number(a.record) - Number(b.record)).map((point) => (
                  <circle
                    key={point.key}
                    className="lb-point"
                    data-key={point.key}
                    data-record={point.record || undefined}
                    data-active={point.key === activeKey || undefined}
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    tabIndex={point.index === focusAt ? 0 : -1}
                    role="img"
                    aria-label={pointLabel(point)}
                    onFocus={() => {
                      setPicked(point.key);
                      setCursor((current) => ({ ...current, [point.lab]: point.index }));
                    }}
                    onBlur={(event) => onBlur(event, point)}
                    onKeyDown={(event) => step(event, point)}
                  />
                ))}
              </g>
            );
          })}
          {active && <circle className="lb-ring" style={labStyle(active.org)} cx={active.x} cy={active.y} r={radius + 4} aria-hidden="true" />}
        </svg>
      )}
      {W > 0 && !visible.length && <p className="live-empty">Pick a lab below to plot its releases.</p>}
      {active && (
        <div
          ref={tipRef}
          className="lb-tip"
          data-testid="lab-tip"
          data-side={place?.side}
          data-pinned={picked !== null || undefined}
          aria-hidden="true"
          style={{ ...labStyle(active.org), ...(place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }) }}
          /* Keeps focus on the point, so its details stay open while the link is pressed. */
          onMouseDown={(event) => event.preventDefault()}
        >
          <p className="lb-tip__title">{active.release.model}</p>
          <p className="lb-tip__lab">{active.org}</p>
          <dl className="lb-tip__stats">
            <div><dt>Released</dt><dd>{formatDay(active.release.date)}</dd></div>
            <div><dt>ECI</dt><dd>{one(active.release.eci)}{half !== undefined && ` ± ${one(half)}`}</dd></div>
            {range && <div><dt>Credible interval</dt><dd>{range}</dd></div>}
          </dl>
          {note && <p className="lb-tip__note">{note}</p>}
          <a className="lb-tip__link" href={eciHref} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
            ECI on Epoch AI <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}

function LabTable({ shown }: { shown: ReadonlySet<string> }) {
  return (
    <div className="lb-labs__scroll" role="region" aria-label="Releases by lab" tabIndex={0}>
      <table className="lb-table lb-labs__table">
        <caption className="lb-caption">Epoch Capabilities Index by release, grouped by lab</caption>
        <thead>
          <tr><th scope="col">Model</th><th scope="col">Released</th><th scope="col">ECI</th></tr>
        </thead>
        {labs.map((lab, index) => shown.has(lab.org) && (
          <tbody key={lab.org} style={labStyle(lab.org)}>
            <tr className="lb-labs__group">
              <th scope="rowgroup" colSpan={3}>
                <span className="lb-swatch" aria-hidden="true" />{lab.org} <small>{lab.models.length} releases · best {one(bestScore(lab))}</small>
              </th>
            </tr>
            {lab.models.map((release, at) => {
              const note = releaseNote({ org: lab.org, record: records[index].has(at), frontier: frontierReleases.has(`${lab.org}\n${release.model}`) });
              const range = interval(release);
              return (
                <tr key={release.model}>
                  <th scope="row" className="lb-model">
                    <span>{release.model}</span>
                    {note && <small>{note}</small>}
                  </th>
                  <td className="lb-date">{formatDay(release.date)}</td>
                  <td className="lb-labs__eci">
                    <strong>{one(release.eci)}</strong>
                    {range && <small>{range}</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function sameLabs(a: ReadonlySet<string>, b: readonly string[]) {
  return a.size === b.length && b.every((org) => a.has(org));
}

function LabTrends() {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(startingLabs));
  const [lit, setLit] = useState<string | null>(null);
  const [showFrontier, setShowFrontier] = useState(true);
  const [asTable, setAsTable] = useState(false);

  const toggle = (org: string) => {
    const next = new Set(shown);
    if (next.has(org)) {
      next.delete(org);
      if (lit === org) setLit(null);
    } else {
      next.add(org);
    }
    setShown(next);
  };
  /* Pressing a lab's name highlights it, showing it first if it is hidden; pressing it again clears the highlight. */
  const highlight = (org: string) => {
    if (!shown.has(org)) {
      setShown(new Set([...shown, org]));
      setLit(org);
    } else {
      setLit(lit === org ? null : org);
    }
  };

  if (!labs.length) return <p className="live-empty">Lab histories are not in this snapshot.</p>;

  return (
    <div className="lb-panel lb-labs">
      <div className="lb-panel__head">
        <p>Each point is a model release, placed by release date and ECI score. A lab's line follows its best score so far: filled points set a new best, hollow ones did not. The dashed line is the best score from any lab.</p>
        <p className="lb-source">ECI from Epoch AI · {labs.length} labs with 3+ scored releases</p>
      </div>
      <div className="lb-labs__bar">
        <p className="lb-labs__hint" hidden={asTable}>Hover over, focus, or tap a point for the release. Tab moves between labs; arrow keys step through a lab's releases.</p>
        <button type="button" className="lb-toggle" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>Show as table</button>
      </div>
      <div className="lb-labs__view" hidden={asTable}>
        <LabChart shown={shown} lit={lit} showFrontier={showFrontier} />
      </div>
      {asTable && (shown.size ? <LabTable shown={shown} /> : <p className="live-empty">Pick a lab below to list its releases.</p>)}
      <ul className="lb-legend" aria-label="Labs">
        {labs.map((lab: Lab) => {
          const on = shown.has(lab.org);
          return (
            <li key={lab.org} style={labStyle(lab.org)} data-on={on || undefined} data-lit={lit === lab.org || undefined}>
              <input type="checkbox" checked={on} aria-label={`Show ${lab.org}`} onChange={() => toggle(lab.org)} />
              <button type="button" aria-pressed={lit === lab.org} aria-label={`Highlight ${lab.org}`} onClick={() => highlight(lab.org)}>
                <span className="lb-swatch" aria-hidden="true" />{lab.org}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="lb-legend__extra">
        <label className="lb-legend__frontier">
          <input type="checkbox" checked={showFrontier} onChange={() => setShowFrontier(!showFrontier)} />
          <span className="lb-legend__dash" aria-hidden="true" />
          Frontier (best of any lab)
        </label>
        <button type="button" className="lb-toggle" disabled={shown.size === labs.length} onClick={() => setShown(new Set(labs.map((lab) => lab.org)))}>Show all labs</button>
        <button
          type="button"
          className="lb-toggle"
          disabled={sameLabs(shown, startingLabs) && lit === null}
          onClick={() => {
            setShown(new Set(startingLabs));
            setLit(null);
          }}
        >
          Reset
        </button>
      </div>
      <p className="lb-more">
        <a href={eciHref} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> About the Epoch Capabilities Index</a>
      </p>
    </div>
  );
}

export default LabTrends;
