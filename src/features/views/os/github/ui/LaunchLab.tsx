import { useMemo, useState } from "react";
import { buildLaunch, pelt, type LaunchModel } from "../analytics";
import type { GitHubInsights } from "../contract";
import { usePrefersReducedMotion } from "../../../../../hooks/usePrefersReducedMotion";
import { labMemo } from "./cache";
import { Chart, Legend, linear, linePath, monthTicks, niceMax, niceTicks, XLabels, YGrid } from "./chart";
import { fmtDate, fmtInt, fmtNum, fmtPct, fmtRange, fmtShortDate, plural } from "./format";
import { Caveats, Guard, LabSection, Metrics } from "./LabParts";

const M = { left: 44, right: 40, top: 14, bottom: 22 };

function Method({ unit, model }: { unit: string; model: LaunchModel | null }) {
  return (
    <LabSection title="Method">
      <p>
        Change-point detection with PELT (pruned exact linear time), which finds the split of the daily series into segments of constant rate that
        minimizes a Poisson cost plus a penalty per extra segment. Daily {unit} are overdispersed (their variance is larger than their mean), so the
        penalty is scaled by an estimated dispersion φ{model ? ` = ${fmtNum(model.dispersion)}` : ""}: penalty = 2φ·ln(days)
        {model ? ` = ${fmtNum(model.penalty, 1)}` : ""}. Segments are at least {model?.minSize ?? 7} days long.
      </p>
      <p>
        Altitude is cumulative {unit}; velocity is the trailing 7-day mean. Each stage is named after the repository with the most activity inside it.
        The rocket marks a real day of data; nothing is simulated.
      </p>
    </LabSection>
  );
}

export function LaunchLab({ insights, unit }: { insights: GitHubInsights; unit: string }) {
  const computed = labMemo(insights, "launch", () => buildLaunch(insights));
  if (!computed.ok) return <Guard title="The launch model could not run" reason={computed.error} />;
  const model = computed.value;
  if (!model.trajectory.length) return <Guard title="No days to segment" reason="This profile has no daily data in range." method={<Method unit={unit} model={null} />} />;
  return <LaunchView insights={insights} model={model} unit={unit} />;
}

function useSensitivity(insights: GitHubInsights, model: LaunchModel) {
  return labMemo(insights, "launch-sensitivity", () => {
    const counts = insights.days.map((d) => Math.max(0, d.count || 0));
    const run = (penalty: number) => pelt(counts, { penalty, minSize: model.minSize }).length;
    return {
      half: run(model.penalty * 0.5),
      double: run(model.penalty * 2),
      poisson: model.dispersion > 1 ? run(model.penalty / model.dispersion) : null
    };
  });
}

function LaunchView({ insights, model, unit }: { insights: GitHubInsights; model: LaunchModel; unit: string }) {
  const sensitivity = useSensitivity(insights, model);
  const traj = model.trajectory;
  const finalAltitude = traj[traj.length - 1].altitude;
  const shifts = model.stages.slice(1).map((stage, i) => {
    const prev = model.stages[i];
    return { date: stage.from, from: prev.rate, to: stage.rate, ratio: prev.rate > 0 ? stage.rate / prev.rate : null };
  });

  return (
    <div className="gh-lab">
      <LabSection title="Results">
        <Metrics
          items={[
            { id: "stages", label: "Stages found", value: String(model.stages.length), note: plural(model.changePoints.length, "change point") },
            {
              id: "peak-velocity",
              label: "Peak velocity",
              value: model.maxVelocity ? `${fmtNum(model.maxVelocity.velocity)}/day` : "none",
              note: model.maxVelocity ? `7 days to ${fmtDate(model.maxVelocity.date)}` : "no activity"
            },
            { id: "altitude", label: "Final altitude", value: fmtInt(finalAltitude), note: `${unit} in ${plural(traj.length, "day")}` }
          ]}
        />
        <TrajectoryChart model={model} unit={unit} />
        <ol className="gh-stages">
          {model.stages.map((stage) => (
            <li key={stage.index} className="gh-stage" data-stage={stage.index + 1}>
              <p className="gh-stage__title">
                Stage {stage.index + 1}: {stage.dominantRepo ? `led by ${stage.dominantRepo}` : stage.total === 0 ? "quiet" : "no public repository attributed"},{" "}
                {fmtNum(stage.rate)}/day
              </p>
              <p className="gh-stage__meta">
                {fmtRange(stage.from, stage.to)} · {plural(stage.days, "day")} · {fmtInt(stage.total)} {unit}
                {stage.dominantRepo ? ` · ${stage.dominantRepo} holds ${fmtPct(stage.dominantShare)} of repository-attributed activity` : ""}
              </p>
            </li>
          ))}
        </ol>
        {shifts.length > 0 && (
          <p>
            Rate changes at each boundary:{" "}
            {shifts
              .map((s) => `${fmtShortDate(s.date)}, ${fmtNum(s.from)} to ${fmtNum(s.to)} per day${s.ratio !== null ? ` (×${fmtNum(s.ratio, s.ratio < 0.1 ? 2 : 1)})` : ""}`)
              .join("; ")}
            .
          </p>
        )}
        {model.maxVelocity && (
          <p>
            Peak velocity was {fmtNum(model.maxVelocity.velocity)} {unit} per day over the 7 days ending {fmtDate(model.maxVelocity.date)}
            {(() => {
              const stage = model.stages.find((s) => s.from <= model.maxVelocity!.date && s.to >= model.maxVelocity!.date);
              return stage ? `, inside stage ${stage.index + 1}` : "";
            })()}
            .
          </p>
        )}
      </LabSection>
      <LabSection title="Caveats">
        <Caveats
          items={[
            sensitivity.ok
              ? `The stage count depends on the penalty: half of it gives ${plural(sensitivity.value.half, "stage")}, double gives ${plural(sensitivity.value.double, "stage")}.${
                  sensitivity.value.poisson !== null
                    ? ` A plain Poisson penalty (φ = 1) would give ${plural(sensitivity.value.poisson, "stage")}, splitting at bursts rather than at changes in pace.`
                    : ""
                }`
              : `Penalty sensitivity could not be computed: ${sensitivity.error}`,
            "PELT assumes a constant rate within each stage. Real activity is bursty inside stages too, so a long stage can hide short spikes.",
            "Stage names are the most active repository in the stage. Activity in private repositories counts toward the rate but is never attributed or named.",
            ...(insights.source === "rest-events" ? ["With about 90 days of public events, there is room for only a few stages of the 7-day minimum length."] : [])
          ]}
        />
      </LabSection>
      <Method unit={unit} model={model} />
    </div>
  );
}

function TrajectoryChart({ model, unit }: { model: LaunchModel; unit: string }) {
  const reduced = usePrefersReducedMotion();
  const traj = model.trajectory;
  const n = traj.length;
  const [day, setDay] = useState(n - 1);
  const index = Math.min(n - 1, Math.max(0, day));
  const point = traj[index];
  const stageIndex = model.stages.findIndex((s) => s.from <= point.date && s.to >= point.date);
  const readout = `${fmtDate(point.date)}: altitude ${fmtInt(point.altitude)}, velocity ${fmtNum(point.velocity)}/day${stageIndex >= 0 ? `, stage ${stageIndex + 1}` : ""}.`;
  const altMax = niceMax(traj[n - 1].altitude);
  const velMax = niceMax(Math.max(1, ...traj.map((t) => t.velocity)));
  const H = 240;
  const dates = useMemo(() => traj.map((t) => t.date), [traj]);
  const label = `Altitude (cumulative ${unit}) and velocity (7-day mean) from ${fmtDate(traj[0].date)} to ${fmtDate(traj[n - 1].date)}, with ${model.stages.length} stages: ${model.stages
    .map((s) => `${fmtShortDate(s.from)} to ${fmtShortDate(s.to)} at ${fmtNum(s.rate)} per day`)
    .join("; ")}.`;

  return (
    <figure className="gh-figure">
      <figcaption>Altitude and velocity, with PELT stages</figcaption>
      <Chart
        height={H}
        label={label}
        className="gh-launch"
      >
        {(w) => {
          const x = linear(0, Math.max(1, n - 1), M.left, w - M.right);
          const ya = linear(0, altMax, H - M.bottom, M.top);
          const yv = linear(0, velMax, H - M.bottom, M.top);
          const xs = traj.map((_, i) => x(i));
          const altPath = linePath(xs, traj.map((t) => ya(t.altitude)));
          const area = `${altPath}L${x(n - 1).toFixed(1)} ${ya(0).toFixed(1)}L${x(0).toFixed(1)} ${ya(0).toFixed(1)}Z`;
          let offset = 0;
          const bands = model.stages.map((s) => {
            const i0 = offset;
            offset += s.days;
            return { s, x0: x(Math.max(0, i0 - 0.5)), x1: x(Math.min(n - 1, offset - 0.5)) };
          });
          const peakIndex = model.maxVelocity ? dates.indexOf(model.maxVelocity.date) : -1;
          const rx = x(index);
          const ry = ya(point.altitude);
          return (
            <>
              {bands.map(({ s, x0, x1 }) => (
                <rect key={s.index} className={`gh-stageband${s.index % 2 ? " is-odd" : ""}`} x={x0} y={M.top} width={Math.max(0, x1 - x0)} height={H - M.top - M.bottom} />
              ))}
              {bands.map(({ s, x0, x1 }) =>
                x1 - x0 > 22 ? (
                  <text key={`l${s.index}`} className="gh-stageband__label" x={(x0 + x1) / 2} y={M.top + 11} textAnchor="middle">
                    {s.index + 1}
                  </text>
                ) : null
              )}
              <YGrid ticks={niceTicks(0, altMax, 4)} y={ya} x0={M.left} x1={w - M.right} />
              <YGrid ticks={niceTicks(0, velMax, 4)} y={yv} x0={M.left} x1={w - M.right} side="right" />
              <XLabels ticks={monthTicks(dates, x)} y={H - 6} />
              <path className="gh-area" d={area} />
              <path className="gh-line gh-line--altitude" d={altPath} />
              <path className="gh-line gh-line--velocity" d={linePath(xs, traj.map((t) => yv(t.velocity)))} />
              {model.changePoints.map((date) => {
                const i = dates.indexOf(date);
                return i < 0 ? null : <line key={date} className="gh-ref gh-ref--change" x1={x(i - 0.5)} x2={x(i - 0.5)} y1={M.top} y2={H - M.bottom} />;
              })}
              {peakIndex >= 0 && model.maxVelocity && (
                <g className="gh-peak">
                  <circle cx={x(peakIndex)} cy={yv(model.maxVelocity.velocity)} r={4} />
                  <text x={x(peakIndex) + (x(peakIndex) > w / 2 ? -7 : 7)} y={yv(model.maxVelocity.velocity) + 4} textAnchor={x(peakIndex) > w / 2 ? "end" : "start"}>
                    peak {fmtNum(model.maxVelocity.velocity, 1)}/day
                  </text>
                </g>
              )}
              <line className="gh-scrub" x1={rx} x2={rx} y1={M.top} y2={H - M.bottom} />
              <g className={`gh-rocket${reduced ? "" : " is-animated"}`} style={{ transform: `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)` }}>
                <path d="M0 -9 L4 -2 L4 5 L0 3 L-4 5 L-4 -2 Z" />
              </g>
              <rect
                className="gh-launch__hit"
                x={M.left}
                y={M.top}
                width={Math.max(0, w - M.left - M.right)}
                height={H - M.top - M.bottom}
                onPointerMove={(event) => {
                  const box = (event.currentTarget as SVGRectElement).getBoundingClientRect();
                  const ratio = (event.clientX - box.left) / Math.max(1, box.width);
                  setDay(Math.round(ratio * (n - 1)));
                }}
              />
              <text className="gh-axis gh-axis__title" x={M.left} y={M.top - 4}>
                altitude
              </text>
              <text className="gh-axis gh-axis__title" x={w - M.right} y={M.top - 4} textAnchor="end">
                velocity/day
              </text>
            </>
          );
        }}
      </Chart>
      <Legend
        items={[
          { label: "Altitude (cumulative)", className: "gh-line--altitude" },
          { label: "Velocity (7-day mean)", className: "gh-line--velocity" },
          { label: "Change point", className: "gh-ref--change", shape: "dash" }
        ]}
      />
      <div className="gh-scrubber">
        <label>
          <span>Day to inspect</span>
          <input type="range" min={0} max={n - 1} step={1} value={index} onChange={(event) => setDay(Number(event.target.value))} aria-valuetext={readout} />
        </label>
        <p className="gh-scrubber__readout">{readout}</p>
      </div>
    </figure>
  );
}
