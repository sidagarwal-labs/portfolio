import { useId, useLayoutEffect, useRef, useState } from "react";
import { arxivMilestones, arxivStages, formatCount, formatPercent, formatScore } from "../../../../content/arxivSearch";

/* The hill-climbing chart: nDCG@10 at each milestone, drawn at the container's real width so labels stay legible. */

const height = 280;
const margin = { top: 38, right: 16, bottom: 28, left: 42 };
const yMin = 0.5;
const yMax = 0.9;
const ticks = [0.5, 0.6, 0.7, 0.8, 0.9];
const baseJudgments = arxivMilestones[0].judgments;
const lastIndex = arxivMilestones.length - 1;
const stage2Start = arxivMilestones.findIndex((milestone) => milestone.stage === 2);
/* Start, end of retrieval, and the current system get value labels; the readout covers the rest. */
const labeled = new Set([0, stage2Start - 1, lastIndex]);

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.floor(element.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const mark = (judgments: number) => (judgments !== baseJudgments ? "*" : "");

export function HillChart() {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(lastIndex);
  const count = arxivMilestones.length;
  const band = Math.max(0, width - margin.left - margin.right) / count;
  const bottom = height - margin.bottom;
  const x = (index: number) => margin.left + (index + 0.5) * band;
  const y = (value: number) => margin.top + ((yMax - value) / (yMax - yMin)) * (bottom - margin.top);
  const split = margin.left + stage2Start * band;
  const right = width - margin.right;
  const points = arxivMilestones.map((milestone, index) => ({ milestone, index, x: x(index), y: y(milestone.ndcg) }));
  const path = (from: number, to: number) => points.slice(from, to + 1).map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("");
  const current = arxivMilestones[active];
  const first = arxivMilestones[0];
  const last = arxivMilestones[lastIndex];
  const label = `Line chart of nDCG@10 across ${count} milestones, from ${formatScore(first.ndcg)} at ${first.key} (${first.name}) to ${formatScore(last.ndcg)} at ${last.key}. Stage 1 retrieval covers ${first.key} to ${arxivMilestones[stage2Start - 1].key}; Stage 2 reranking covers ${arxivMilestones[stage2Start].key} to ${last.key}. The table below lists every point.`;

  return (
    <div className="ax-chart">
      <div ref={ref} className="ax-chart__plot" style={{ height }} onPointerLeave={() => setActive(lastIndex)}>
        {width > 0 && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
            <rect className="ax-stage ax-stage--1" x={margin.left} y={0} width={Math.max(0, split - margin.left)} height={bottom} />
            <rect className="ax-stage ax-stage--2" x={split} y={0} width={Math.max(0, right - split)} height={bottom} />
            <line className="ax-stage__divider" x1={split} x2={split} y1={0} y2={bottom} />
            {([1, 2] as const).map((stage) => {
              const left = (stage === 1 ? margin.left : split) + 8;
              return (
                <text key={stage} className="ax-stage__label" x={left} y={15}>
                  <tspan className="ax-stage__name">Stage {stage}</tspan>
                  <tspan x={left} dy={13}>{arxivStages[stage].short}</tspan>
                </text>
              );
            })}
            <g className="ax-axis">
              {ticks.map((tick) => (
                <g key={tick}>
                  <line className="ax-grid" x1={margin.left} x2={right} y1={y(tick)} y2={y(tick)} />
                  <text x={margin.left - 7} y={y(tick)} dy="0.32em" textAnchor="end">{tick.toFixed(2)}</text>
                </g>
              ))}
              {points.map((point) => (
                <text key={point.milestone.key} className={point.index === active ? "is-active" : undefined} x={point.x} y={height - 9} textAnchor="middle">{point.milestone.key}</text>
              ))}
            </g>
            <path className="ax-line" d={path(0, lastIndex - 1)} />
            <path className="ax-line ax-line--remeasured" d={path(lastIndex - 1, lastIndex)} />
            {points.map((point) => (
              <g key={point.milestone.key} className={`ax-point ax-point--${point.milestone.stage}${point.index === active ? " is-active" : ""}`}>
                <circle cx={point.x} cy={point.y} r={point.index === active ? 6 : 4.5} />
                {labeled.has(point.index) && (
                  /* The last points sit against the stage divider and the plot's edge, so their labels end at the point. */
                  <text x={point.x + (point.index === lastIndex ? -8 : point.index === stage2Start - 1 ? 4 : 0)} y={point.y - 11} textAnchor={point.index === 0 ? "middle" : "end"}>
                    {formatScore(point.milestone.ndcg)}{mark(point.milestone.judgments)}
                  </text>
                )}
              </g>
            ))}
            {points.map((point) => (
              <rect key={point.milestone.key} className="ax-hit" x={margin.left + point.index * band} y={margin.top} width={band} height={bottom - margin.top}
                onPointerEnter={() => setActive(point.index)} onClick={() => setActive(point.index)} />
            ))}
          </svg>
        )}
      </div>
      <p className="ax-chart__readout" aria-hidden="true">
        <strong>{current.key}</strong> {current.name}, {arxivStages[current.stage].label.toLowerCase()}: nDCG@10 <strong>{formatScore(current.ndcg)}{mark(current.judgments)}</strong>
        {current.gain === null ? "" : ` (step +${formatScore(current.gain)})`}, Source MRR@10 {formatScore(current.mrr)}, Source R@10 {formatPercent(current.recall)}.
      </p>
      <ul className="ax-legend" aria-hidden="true">
        <li><span className="ax-key ax-key--1" />Stage 1 retrieval</li>
        <li><span className="ax-key ax-key--2" />Stage 2 reranking</li>
        <li><span className="ax-key ax-key--line" />Scored on {formatCount(baseJudgments)} judgments</li>
        <li><span className="ax-key ax-key--dash" />*Last step scored on {formatCount(last.judgments)}</li>
      </ul>
    </div>
  );
}

export function MilestoneTable() {
  const captionId = useId();
  return (
    <div className="ax-table-block">
      {/* Outside the scroller, so the caption stays readable when the table scrolls sideways on a phone. */}
      <p className="ax-table__caption" id={captionId}>
        Hill-climbing milestones on 100 dev queries ({formatCount(baseJudgments)} judgments; * {formatCount(arxivMilestones[lastIndex].judgments)})
      </p>
      <div className="ax-table-wrap" role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className="ax-table" aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Stage</th>
              <th scope="col">Milestone</th>
              <th scope="col">nDCG@10</th>
              <th scope="col">Step gain</th>
              <th scope="col">Source MRR@10</th>
              <th scope="col">Source R@10</th>
            </tr>
          </thead>
          <tbody>
            {arxivMilestones.map((milestone) => (
              <tr key={milestone.key} data-key={milestone.key} data-stage={milestone.stage}>
                <th scope="row">{milestone.key}</th>
                <td>{milestone.stage === 1 ? "1: retrieval" : "2: reranking"}</td>
                <td className="ax-table__name">{milestone.name}</td>
                <td>{formatScore(milestone.ndcg)}{mark(milestone.judgments)}</td>
                <td>{milestone.gain === null ? "–" : `+${formatScore(milestone.gain)}${mark(milestone.judgments)}`}</td>
                <td>{formatScore(milestone.mrr)}</td>
                <td>{formatPercent(milestone.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
