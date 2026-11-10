import { useEffect, useMemo, useState } from "react";
import { Pause, Play, StepBack, StepForward } from "lucide-react";
import { buildRepoLab, type RepoLab } from "../analytics";
import type { GitHubInsights } from "../contract";
import { usePrefersReducedMotion } from "../../../../../hooks/usePrefersReducedMotion";
import { labMemo } from "./cache";
import { Chart, linear, niceTicks, XLabels, YGrid } from "./chart";
import { fmtDate, fmtInt, fmtNum, fmtPct, fmtSigned, plural } from "./format";
import { Caveats, Guard, LabSection, Metrics } from "./LabParts";

export const CLUSTER_COLORS = ["#2a4fbf", "#d1495b", "#2e9e6b", "#c98a12", "#7b4fbf", "#3a8fb7", "#8a6d1f", "#5b6270"];
const color = (cluster: number) => CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
const FRAME_MS = 900;

function strength(score: number) {
  if (score > 0.7) return "strong structure";
  if (score > 0.5) return "reasonable structure";
  if (score > 0.25) return "weak structure";
  return "no substantial structure";
}

function Method({ lab }: { lab: RepoLab | null }) {
  return (
    <LabSection title="Method">
      <p>
        Each public, non-fork repository becomes a row of {lab?.featureNames.length ?? 9} features: log size, log contributions, log active days, log age,
        log stars plus forks, log days since the last push, and the language family (Python-like, web, other) as one-hot columns. Features are
        standardized (z-scores).
      </p>
      <p>
        k-means with k-means++ seeding and {lab?.restarts ?? 10} restarts per k, for k = 2 to {lab ? lab.silhouetteByK[lab.silhouetteByK.length - 1].k : 5}. k is
        chosen by the highest mean silhouette. For the picture, PCA projects the standardized features onto their first two principal components; the
        clustering itself runs in the full space.{lab ? ` Ages are measured to ${fmtDate(lab.referenceDate)}.` : ""}
      </p>
    </LabSection>
  );
}

export function RepoLabPanel({ insights }: { insights: GitHubInsights }) {
  const computed = labMemo(insights, "repos", () => buildRepoLab(insights.repos));
  if (!computed.ok) return <Guard title="The clustering could not run" reason={computed.error} />;
  const lab = computed.value;
  if ("insufficient" in lab) return <Guard title="Too few repositories to cluster" reason={lab.insufficient} method={<Method lab={null} />} />;
  return <RepoLabView insights={insights} lab={lab} />;
}

function RepoLabView({ insights, lab }: { insights: GitHubInsights; lab: RepoLab }) {
  const reduced = usePrefersReducedMotion();
  const frames = lab.iterations;
  const [frame, setFrame] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    if (frame >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setFrame((f) => Math.min(frames.length - 1, f + 1)), reduced ? 0 : FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [playing, frame, frames.length, reduced]);

  const current = frames[frame];
  const updates = frames.length - 1;
  const moved = frames.length > 1 ? frames[frames.length - 1].assignments.filter((c, i) => c !== frames[0].assignments[i]).length : 0;
  const maxK = lab.silhouetteByK[lab.silhouetteByK.length - 1]?.k ?? lab.k;
  const rising = lab.silhouetteByK.every((s, i, all) => i === 0 || s.score > all[i - 1].score);
  const atCap = lab.k === maxK;
  const negatives = lab.points.filter((p) => p.silhouette < 0);
  const [ev1, ev2] = lab.explainedVariance;
  const bestInertia = Math.min(...lab.restartInertias);
  const worstInertia = Math.max(...lab.restartInertias);
  const matchedBest = lab.restartInertias.filter((v) => v - bestInertia <= 1e-6 * Math.max(1, bestInertia)).length;

  const drivers = (pc: "pc1" | "pc2") =>
    [...lab.loadings]
      .sort((a, b) => Math.abs(b[pc]) - Math.abs(a[pc]))
      .slice(0, 2)
      .map((l) => `${l.feature} (${fmtSigned(l[pc])})`)
      .join(" and ");

  const zeroVariance = useMemo(
    () => lab.featureNames.filter((name) => lab.points.every((p) => Math.abs((p.features[name] ?? 0) - (lab.points[0].features[name] ?? 0)) < 1e-12)),
    [lab]
  );

  const activePoint = active === null ? null : lab.points[active];

  return (
    <div className="gh-lab">
      <Method lab={lab} />
      <LabSection title="Results">
        <Metrics
          items={[
            { id: "k", label: "Clusters (k)", value: String(lab.k), note: `best silhouette of k = ${lab.silhouetteByK[0]?.k ?? 2}–${maxK}` },
            { id: "silhouette", label: "Mean silhouette", value: fmtNum(lab.silhouette), note: strength(lab.silhouette), tone: lab.silhouette > 0.5 ? "good" : "neutral" },
            { id: "variance", label: "Variance shown", value: fmtPct(ev1 + ev2, 1), note: `PC1 ${fmtPct(ev1, 1)}, PC2 ${fmtPct(ev2, 1)}` },
            { id: "updates", label: "Lloyd updates", value: String(updates), note: `${plural(lab.points.length, "repository", "repositories")}` }
          ]}
        />
        <div className="gh-scatter-wrap">
          <Chart height={300} label={`PCA scatter of ${lab.points.length} repositories, colored by cluster at frame ${frame + 1} of ${frames.length}.`} role="group" className="gh-scatter">
            {(w) => <Scatter lab={lab} frame={current} width={w} active={active} setActive={setActive} />}
          </Chart>
          <p className="gh-scatter__readout" aria-live="polite">
            {activePoint
              ? `${activePoint.name}: ${lab.clusters[current.assignments[active as number]]?.label ?? `cluster ${current.assignments[active as number] + 1}`}, silhouette ${fmtNum(activePoint.silhouette)}; ${plural(activePoint.raw.contributions, "contribution")} on ${plural(activePoint.raw.activeDays, "day")}, ${fmtInt(activePoint.raw.ageDays)} days old, ${activePoint.raw.language ?? "no primary language"}.`
              : "Point at or tab to a repository to see its details."}
          </p>
        </div>
        <div className="gh-frames">
          <button type="button" className="os-button" onClick={() => setFrame((f) => Math.max(0, f - 1))} disabled={frame === 0} aria-label="Previous frame">
            <StepBack size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="os-button"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                if (frame >= frames.length - 1) setFrame(0);
                setPlaying(true);
              }
            }}
            disabled={frames.length < 2}
          >
            {playing ? <Pause size={14} strokeWidth={2} aria-hidden="true" /> : <Play size={14} strokeWidth={2} aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="os-button" onClick={() => setFrame((f) => Math.min(frames.length - 1, f + 1))} disabled={frame >= frames.length - 1} aria-label="Next frame">
            <StepForward size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <p className="gh-frames__label" data-frame={frame + 1} data-frames={frames.length}>
            Frame {frame + 1} of {frames.length}: {frame === 0 ? "k-means++ seeds and first assignment" : `after update ${frame}`}, inertia {fmtNum(current.inertia)}
          </p>
        </div>
        <p>
          The animated run is the best of {lab.restarts} restarts. It stopped after {plural(updates, "update")}
          {updates === 1 && moved === 0
            ? ": the seeding already produced the final assignment, so the one update only moved the centroids and no repository changed cluster."
            : `; ${plural(moved, "repository", "repositories")} changed cluster between the first and last frame.`}{" "}
          Final inertia across restarts ranged from {fmtNum(bestInertia)} to {fmtNum(worstInertia)}; {matchedBest} of {lab.restartInertias.length} reached the best.
        </p>
        <ul className="gh-clusters">
          {lab.clusters.map((cluster) => (
            <li key={cluster.id}>
              <span className="gh-dot" style={{ background: color(cluster.id) }} aria-hidden="true" />
              <span className="gh-clusters__label">{cluster.label}</span> <span className="gh-muted">({cluster.size})</span>
              <span className="gh-clusters__members">{cluster.members.join(", ")}</span>
            </li>
          ))}
        </ul>
        <div className="gh-grid2">
          <SilhouetteChart lab={lab} />
          <div>
            <p>
              Silhouette picks k = {lab.k} ({fmtNum(lab.silhouette)}).
              {atCap && rising
                ? ` Scores rose with every k tried (${lab.silhouetteByK.map((s) => `${s.k}: ${fmtNum(s.score)}`).join(", ")}), so a larger k might score higher; with ${lab.points.length} repositories that would mean clusters of one or two.`
                : ` Scores by k: ${lab.silhouetteByK.map((s) => `${s.k}: ${fmtNum(s.score)}`).join(", ")}.`}
            </p>
            <p>
              The two components shown explain {fmtPct(ev1 + ev2, 1)} of the standardized variance. PC1 is driven mostly by {drivers("pc1")}; PC2 by {drivers("pc2")}.
            </p>
            {negatives.length > 0 && (
              <p>
                {plural(negatives.length, "repository has", "repositories have")} a negative silhouette (closer on average to another cluster than to its own):{" "}
                {negatives.map((p) => p.name).join(", ")}.
              </p>
            )}
          </div>
        </div>
      </LabSection>
      <LabSection title="Caveats">
        <Caveats
          items={[
            `A mean silhouette of ${fmtNum(lab.silhouette)} is ${strength(lab.silhouette)} by the usual rule of thumb (above 0.5 reasonable, above 0.7 strong)${lab.silhouette <= 0.5 ? ", so the groups overlap" : ""}.`,
            ...(zeroVariance.length
              ? [`${zeroVariance.join(", ")} ${zeroVariance.length === 1 ? "is" : "are"} identical for every repository here, so ${zeroVariance.length === 1 ? "it carries" : "they carry"} no information.`]
              : []),
            `${plural(lab.points.length, "repository", "repositories")} is a small sample; one new repository can reshuffle the clusters.`,
            `The scatter shows ${fmtPct(ev1 + ev2, 0)} of the variance. Points that look close here can be far apart in the full ${lab.featureNames.length}-dimensional space.`,
            "Cluster names are generated from each centroid's most distinctive features, not written by hand. Forks are excluded.",
            ...(insights.source === "rest-events" ? ["Public events only cover about 90 days, so contribution counts per repository are partial."] : [])
          ]}
        />
      </LabSection>
    </div>
  );
}

function Scatter({ lab, frame, width, active, setActive }: { lab: RepoLab; frame: RepoLab["iterations"][number]; width: number; active: number | null; setActive: (i: number | null) => void }) {
  const H = 300;
  const pad = { left: 36, right: 14, top: 14, bottom: 26 };
  const extent = useMemo(() => {
    const xs = [...lab.points.map((p) => p.x), ...lab.iterations.flatMap((f) => f.centroids.map((c) => c[0]))];
    const ys = [...lab.points.map((p) => p.y), ...lab.iterations.flatMap((f) => f.centroids.map((c) => c[1]))];
    const span = (v: number[]) => {
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      const margin = Math.max(0.2, (hi - lo) * 0.08);
      return [lo - margin, hi + margin] as const;
    };
    return { x: span(xs), y: span(ys) };
  }, [lab]);
  const x = linear(extent.x[0], extent.x[1], pad.left, width - pad.right);
  const y = linear(extent.y[0], extent.y[1], H - pad.bottom, pad.top);
  const point = active === null ? null : lab.points[active];
  return (
    <>
      <YGrid ticks={niceTicks(extent.y[0], extent.y[1], 4)} y={y} x0={pad.left} x1={width - pad.right} />
      <XLabels ticks={niceTicks(extent.x[0], extent.x[1], 5).map((t) => ({ x: x(t), label: String(t) }))} y={H - 10} />
      <text className="gh-axis gh-axis__title" x={width - pad.right} y={H - 10 - 12} textAnchor="end">PC1</text>
      <text className="gh-axis gh-axis__title" x={pad.left + 4} y={pad.top + 10}>PC2</text>
      {frame.centroids.map((c, id) => (
        <g key={id} className="gh-centroid" style={{ color: color(id) }} transform={`translate(${x(c[0]).toFixed(1)} ${y(c[1]).toFixed(1)})`}>
          <path d="M-6 -6L6 6M-6 6L6 -6" />
        </g>
      ))}
      {lab.points.map((p, i) => {
        const cluster = frame.assignments[i];
        return (
          <circle
            key={p.nameWithOwner}
            className={`gh-point${active === i ? " is-active" : ""}`}
            cx={x(p.x)}
            cy={y(p.y)}
            r={active === i ? 7 : 5.5}
            fill={color(cluster)}
            tabIndex={0}
            role="img"
            aria-label={`${p.name}, ${lab.clusters[cluster]?.label ?? `cluster ${cluster + 1}`}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        );
      })}
      {point && (
        <text
          className="gh-point__label"
          x={x(point.x) + (x(point.x) > width / 2 ? -10 : 10)}
          y={y(point.y) - 9}
          textAnchor={x(point.x) > width / 2 ? "end" : "start"}
        >
          {point.name.length > 34 ? `${point.name.slice(0, 33)}…` : point.name}
        </text>
      )}
    </>
  );
}

function SilhouetteChart({ lab }: { lab: RepoLab }) {
  const H = 150;
  const pad = { left: 36, right: 10, top: 16, bottom: 24 };
  const rows = lab.silhouetteByK;
  const max = Math.max(0.5, ...rows.map((r) => r.score));
  const min = Math.min(0, ...rows.map((r) => r.score));
  return (
    <figure className="gh-figure">
      <figcaption>Mean silhouette by k</figcaption>
      <Chart height={H} label={`Mean silhouette by k: ${rows.map((r) => `k = ${r.k}, ${fmtNum(r.score)}`).join("; ")}. Chosen k = ${lab.k}.`}>
        {(w) => {
          const band = (w - pad.left - pad.right) / Math.max(1, rows.length);
          const y = linear(min, max, H - pad.bottom, pad.top);
          return (
            <>
              <YGrid ticks={niceTicks(min, max, 3)} y={y} x0={pad.left} x1={w - pad.right} />
              {rows.map((r, i) => {
                const cx = pad.left + band * (i + 0.5);
                return (
                  <g key={r.k}>
                    <rect className={`gh-bar${r.k === lab.k ? " gh-bar--chosen" : ""}`} x={cx - band * 0.3} width={band * 0.6} y={Math.min(y(r.score), y(0))} height={Math.abs(y(0) - y(r.score))} />
                    <text className="gh-axis gh-bar__value" x={cx} y={Math.min(y(r.score), y(0)) - 4} textAnchor="middle">{fmtNum(r.score)}</text>
                  </g>
                );
              })}
              <XLabels ticks={rows.map((r, i) => ({ x: pad.left + band * (i + 0.5), label: `k=${r.k}` }))} y={H - 6} />
            </>
          );
        }}
      </Chart>
    </figure>
  );
}
