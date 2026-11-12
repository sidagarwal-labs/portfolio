import { useId, useMemo, type ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  addDays,
  buildContributionMix,
  buildLanguageTimeline,
  buildMomentum,
  buildRhythm,
  detectSprints,
  MONTH_LABELS,
  OTHER_LANGUAGES,
  UNKNOWN_LANGUAGE,
  type ContributionMix,
  type LanguageTimeline,
  type Momentum,
  type MixItem,
  type Rhythm,
  type SprintReport
} from "../analytics";
import type { GitHubInsights } from "../contract";
import { bandPath, Chart, linear, linePath, niceMax, niceTicks, XLabels, YGrid } from "./chart";
import { fmtDate, fmtInt, fmtMonth, fmtNum, fmtPct, fmtRange, fmtShortDate, plural, WEEKDAYS } from "./format";
import { languageColor } from "./Overview";

/* Our own views of the same data, under the at-a-glance stats. Every chart has a summary label and a table or list. */

const one = (unit: string) => unit.replace(/s$/, "");
const count = (n: number, unit: string) => plural(n, one(unit), unit);
const pct = (share: number) => fmtPct(share, share > 0 && share < 0.1 ? 1 : 0);

/** Thins tick labels so neighbors stay at least `minGap` px apart. */
function thin<T extends { x: number }>(ticks: T[], minGap: number): T[] {
  const kept: T[] = [];
  for (const tick of ticks) if (!kept.length || tick.x - kept[kept.length - 1].x >= minGap) kept.push(tick);
  return kept;
}

const monthLabel = (month: string) => (month.endsWith("-01") ? month.slice(0, 4) : MONTH_LABELS[Number(month.slice(5, 7)) - 1]);

function Card({ id, title, badge, lead, children }: { id: string; title: string; badge?: ReactNode; lead?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className={`gh-card gh-card--${id}`} data-insight={id} aria-labelledby={headingId}>
      <div className="gh-card__head">
        <h4 id={headingId}>{title}</h4>
        {badge}
      </div>
      {lead && <p className="gh-card__lead">{lead}</p>}
      {children}
    </section>
  );
}

/* ---------- Momentum ---------- */

const TREND_LABEL = { rising: "Rising", cooling: "Cooling", steady: "Steady", quiet: "Quiet", insufficient: "Too short to compare" } as const;

function momentumLead(m: Momentum, unit: string) {
  if (!m.recent || !m.prior) return `The range is too short to compare two periods of at least a week.`;
  const span = m.periodDays === 28 ? "4 weeks" : plural(m.periodDays, "day");
  const recent = `${count(m.recent.total, unit)} in the last ${span}`;
  const prior = `${fmtInt(m.prior.total)} in the ${span} before`;
  switch (m.trend) {
    case "quiet":
      return `No ${unit} in the last ${span} or the ${span} before.`;
    case "rising":
      if (m.change === null) return `${recent}, after none in the ${span} before.`;
      return m.change >= 2 ? `${recent}, ${fmtNum(m.recent.total / m.prior.total, 1)}× the ${prior}.` : `${recent}, up ${fmtPct(m.change)} from ${prior}.`;
    case "cooling":
      return `${recent}, down ${fmtPct(-(m.change ?? 0))} from ${prior}.`;
    default:
      return `${recent}, about level with ${prior}${m.change === null ? "" : ` (${m.change >= 0 ? "+" : "−"}${fmtPct(Math.abs(m.change))})`}.`;
  }
}

function TrendBadge({ trend }: { trend: Momentum["trend"] }) {
  const Icon = trend === "rising" ? TrendingUp : trend === "cooling" ? TrendingDown : Minus;
  return (
    <span className="gh-trend" data-trend={trend}>
      <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
      {TREND_LABEL[trend]}
    </span>
  );
}

const MO_HEIGHT = 150;

function MomentumCard({ momentum, unit, from }: { momentum: Momentum; unit: string; from: string }) {
  const { weeks, peak, window } = momentum;
  const total = weeks.reduce((s, w) => s + w.total, 0);
  const avgLabel = `${window}-week average`;
  const summary = [
    `Weekly ${unit} as bars with a ${avgLabel} line, ${plural(weeks.length, "week")}.`,
    peak ? `Peak: week of ${fmtDate(peak.start)} with ${fmtInt(peak.total)}.` : "",
    "Weekly values are in the table that follows."
  ].join(" ");
  return (
    <Card id="momentum" title="Momentum" badge={total > 0 ? <TrendBadge trend={momentum.trend} /> : undefined} lead={total > 0 ? momentumLead(momentum, unit) : undefined}>
      {total === 0 ? (
        <p className="gh-muted gh-card__empty">No {unit} in this range, so there is no momentum to show.</p>
      ) : (
        <>
          <Chart height={MO_HEIGHT} label={summary} className="gh-mo">
            {(width) => {
              const x0 = 30;
              const x1 = width - 8;
              const y0 = MO_HEIGHT - 20;
              const y1 = 8;
              const band = (x1 - x0) / Math.max(1, weeks.length);
              const xs = weeks.map((_, i) => x0 + band * (i + 0.5));
              const top = niceMax(Math.max(1, ...weeks.map((w) => Math.max(w.total, w.rolling ?? 0))), 3);
              const y = linear(0, top, y0, y1);
              const barWidth = Math.max(1, Math.min(16, band * 0.7));
              const lineYs = weeks.map((w) => (w.rolling === null ? null : y(w.rolling)));
              const area = bandPath(xs, lineYs, weeks.map((w) => (w.rolling === null ? null : y0)));
              const ticks: { x: number; label: string }[] = [];
              weeks.forEach((w, i) => {
                for (let d = 0; d < 7; d++) {
                  const date = addDays(w.start, d);
                  if (date.endsWith("-01") && date >= from) ticks.push({ x: xs[i], label: monthLabel(date.slice(0, 7)) });
                }
              });
              const peakIndex = peak ? weeks.indexOf(peak) : -1;
              return (
                <>
                  <YGrid ticks={niceTicks(0, top, 3)} y={y} x0={x0} x1={x1} />
                  <g>
                    {weeks.map((w, i) => (
                      <rect
                        key={w.start}
                        className="gh-mo__bar"
                        data-partial={w.days < 7 ? "true" : undefined}
                        x={xs[i] - barWidth / 2}
                        y={y(w.total)}
                        width={barWidth}
                        height={Math.max(0, y0 - y(w.total))}
                      />
                    ))}
                  </g>
                  {area && <path className="gh-mo__area" d={area} />}
                  <path className="gh-mo__line" d={linePath(xs, lineYs)} pathLength={1} />
                  {peakIndex >= 0 && <circle className="gh-mo__peak" cx={xs[peakIndex]} cy={y(weeks[peakIndex].total)} r={3.5} />}
                  <XLabels ticks={thin(ticks, 30)} y={MO_HEIGHT - 5} />
                  <g className="gh-hits">
                    {weeks.map((w, i) => (
                      <rect key={w.start} x={x0 + band * i} y={y1} width={band} height={y0 - y1}>
                        <title>
                          {`Week of ${fmtShortDate(w.start)}: ${count(w.total, unit)}${w.days < 7 ? ` (${plural(w.days, "day")} in range)` : ""}${
                            w.rolling === null ? "" : ` · ${avgLabel} ${fmtNum(w.rolling, 1)}`
                          }`}
                        </title>
                      </rect>
                    ))}
                  </g>
                </>
              );
            }}
          </Chart>
          <ul className="gh-legend" aria-hidden="true">
            <li><span className="gh-key gh-key--box gh-key--mo-bar" />Weekly total</li>
            <li><span className="gh-key gh-key--line gh-key--mo-line" />{avgLabel} (per week)</li>
            <li><span className="gh-key gh-key--dot gh-key--mo-peak" />Peak week</li>
          </ul>
          <p className="gh-fine">Weeks start on Sunday, like the calendar. Lighter bars are partial weeks at the ends of the range; the average scales them to 7 days.</p>
          <div className="sr-only">
            <table>
              <caption>Weekly {unit}</caption>
              <thead>
                <tr>
                  <th scope="col">Week of</th>
                  <th scope="col">Total</th>
                  <th scope="col">Days in range</th>
                  <th scope="col">{avgLabel}</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start}>
                    <th scope="row">{fmtDate(w.start)}</th>
                    <td>{w.total}</td>
                    <td>{w.days}</td>
                    <td>{w.rolling === null ? "n/a" : fmtNum(w.rolling, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- Weekly rhythm ---------- */

const ROSE = { size: 232, c: 116, r0: 24, r: 76, ring: 88, label: 106 };
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const point = (r: number, a: number) => `${(ROSE.c + r * Math.cos(a)).toFixed(2)} ${(ROSE.c + r * Math.sin(a)).toFixed(2)}`;
const sector = (r0: number, r1: number, a0: number, a1: number) =>
  `M${point(r0, a0)}L${point(r1, a0)}A${r1} ${r1} 0 0 1 ${point(r1, a1)}L${point(r0, a1)}A${r0} ${r0} 0 0 0 ${point(r0, a0)}Z`;
const arc = (r: number, a0: number, a1: number) => `M${point(r, a0)}A${r} ${r} 0 0 1 ${point(r, a1)}`;

function RhythmCard({ rhythm, unit }: { rhythm: Rhythm; unit: string }) {
  const strongest = rhythm.strongest === null ? null : rhythm.days[rhythm.strongest];
  const consistent = rhythm.mostConsistent === null ? null : rhythm.days[rhythm.mostConsistent];
  const max = Math.max(1, ...rhythm.days.map((d) => d.total));
  const step = (2 * Math.PI) / 7;
  const gap = 0.05;
  const summary = strongest
    ? `Radial chart of ${unit} by weekday. Busiest: ${WEEKDAYS[strongest.weekday]}s with ${fmtInt(strongest.total)} (${pct(strongest.share)}).${
        consistent ? ` Most consistent: ${WEEKDAYS[consistent.weekday]}s, active on ${fmtPct(consistent.activeRate)} of them.` : ""
      } Values by weekday are in the table that follows.`
    : "";
  return (
    <Card
      id="rhythm"
      title="Weekly rhythm"
      lead={strongest ? `${WEEKDAYS[strongest.weekday]}s carry the most ${unit}: ${fmtInt(strongest.total)}, ${pct(strongest.share)} of the total.` : undefined}
    >
      {!strongest ? (
        <p className="gh-muted gh-card__empty">No {unit} in this range.</p>
      ) : (
        <div className="gh-rhythm">
          <svg className="gh-rose" viewBox={`0 0 ${ROSE.size} ${ROSE.size}`} role="img" aria-label={summary}>
            {rhythm.days.map((d) => {
              const mid = -Math.PI / 2 + d.weekday * step;
              const a0 = mid - step / 2 + gap;
              const a1 = mid + step / 2 - gap;
              const r = Math.sqrt(ROSE.r0 ** 2 + (ROSE.r ** 2 - ROSE.r0 ** 2) * (d.total / max));
              const isStrongest = d.weekday === strongest.weekday;
              return (
                <g key={d.weekday} className="gh-rose__day" data-weekday={d.weekday}>
                  <path className="gh-rose__track" d={sector(ROSE.r0, ROSE.r, a0, a1)} />
                  {d.total > 0 && <path className={`gh-rose__petal${isStrongest ? " is-strongest" : ""}`} d={sector(ROSE.r0, r, a0, a1)} />}
                  <path className="gh-rose__ring-track" d={arc(ROSE.ring, a0, a1)} />
                  {d.activeRate > 0 && <path className="gh-rose__ring" d={arc(ROSE.ring, a0, a0 + (a1 - a0) * d.activeRate)} />}
                  <text className={`gh-rose__label${isStrongest ? " is-strongest" : ""}`} x={ROSE.c + ROSE.label * Math.cos(mid)} y={ROSE.c + ROSE.label * Math.sin(mid)} dy="0.35em" textAnchor="middle">
                    {SHORT_DAYS[d.weekday]}
                  </text>
                  <path className="gh-rose__hit" d={sector(ROSE.r0, ROSE.ring + 6, a0, a1)}>
                    <title>{`${WEEKDAYS[d.weekday]}: ${count(d.total, unit)} (${pct(d.share)}), active on ${d.activeDays} of ${d.occurrences} (${fmtPct(d.activeRate)})`}</title>
                  </path>
                </g>
              );
            })}
            <text className="gh-rose__center" x={ROSE.c} y={ROSE.c - 3} textAnchor="middle">{SHORT_DAYS[strongest.weekday]}</text>
            <text className="gh-rose__center-note" x={ROSE.c} y={ROSE.c + 9} textAnchor="middle">busiest</text>
          </svg>
          <div className="gh-rhythm__side">
            <dl className="gh-facts">
              <div data-fact="busiest">
                <dt>Busiest day</dt>
                <dd>{WEEKDAYS[strongest.weekday]} · {fmtInt(strongest.total)} ({pct(strongest.share)})</dd>
              </div>
              {consistent && (
                <div data-fact="consistent">
                  <dt>Most consistent</dt>
                  <dd>{WEEKDAYS[consistent.weekday]} · active on {fmtPct(consistent.activeRate)}</dd>
                </div>
              )}
              <div data-fact="weekend">
                <dt>Weekends</dt>
                <dd>{pct(rhythm.weekendShare)} of {unit}</dd>
              </div>
            </dl>
            <ul className="gh-legend" aria-hidden="true">
              <li><span className="gh-key gh-key--box gh-key--petal" />Petal: total (by area)</li>
              <li><span className="gh-key gh-key--line gh-key--ring" />Ring: share of those days active</li>
            </ul>
          </div>
          <div className="sr-only">
            <table>
              <caption>{unit} by weekday</caption>
              <thead>
                <tr>
                  <th scope="col">Weekday</th>
                  <th scope="col">Total</th>
                  <th scope="col">Share</th>
                  <th scope="col">Active days</th>
                </tr>
              </thead>
              <tbody>
                {rhythm.days.map((d) => (
                  <tr key={d.weekday}>
                    <th scope="row">{WEEKDAYS[d.weekday]}</th>
                    <td>{d.total}</td>
                    <td>{pct(d.share)}</td>
                    <td>{`${d.activeDays} of ${d.occurrences} (${fmtPct(d.activeRate)})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Contribution mix ---------- */

function mixLabel(kind: MixItem["kind"], rest: boolean) {
  switch (kind) {
    case "commits":
      return rest ? "Pushes" : "Commits";
    case "pullRequests":
      return rest ? "Pull requests opened" : "Pull requests";
    case "issues":
      return rest ? "Issues opened" : "Issues";
    case "reviews":
      return "Reviews";
    default:
      return rest ? "Other public events" : "Other";
  }
}

const MIX_SHORT: Partial<Record<MixItem["kind"], string>> = { pullRequests: "PRs", issues: "issues", reviews: "reviews", other: "other" };
const DONUT = { size: 120, r: 44 };

function MixCard({ mix, insights, unit }: { mix: ContributionMix; insights: GitHubInsights; unit: string }) {
  const rest = mix.source === "rest-events";
  const circumference = 2 * Math.PI * DONUT.r;
  const dominant = mix.dominant ? mix.items.find((item) => item.kind === mix.dominant)! : null;
  const commits = mix.items[0].count;
  const prs = mix.items[1].count;
  const t = insights.totals;
  let lead: string | undefined;
  if (dominant) {
    lead = `${mixLabel(dominant.kind, rest)} make up ${pct(dominant.share)} of ${unit}`;
    if (commits > 0 && prs > 0) lead += `, about ${fmtNum(commits / prs, commits / prs < 10 ? 1 : 0)} ${rest ? "pushes" : "commits"} per pull request`;
    lead += ".";
  } else if (mix.other > 0) {
    lead = `None of these ${unit} are ${rest ? "pushes" : "commits"}, pull requests, issues or reviews.`;
  }
  let offset = 0;
  const otherParts = [
    t.repositories > 0 ? `${plural(t.repositories, "repository", "repositories")} created` : "",
    t.restricted > 0 ? `${fmtInt(t.restricted)} private contributions, which GitHub counts without a type` : ""
  ].filter(Boolean);
  return (
    <Card id="mix" title={rest ? "Public event mix" : "Contribution mix"} lead={lead}>
      {mix.total === 0 ? (
        <p className="gh-muted gh-card__empty">No {unit} in this range to break down.</p>
      ) : (
        <>
          <div className="gh-mix">
            <svg className="gh-donut" viewBox={`0 0 ${DONUT.size} ${DONUT.size}`} aria-hidden="true">
              <circle className="gh-donut__track" cx={DONUT.size / 2} cy={DONUT.size / 2} r={DONUT.r} />
              {mix.items.map((item) => {
                const length = item.share * circumference;
                const start = offset;
                offset += length;
                if (length <= 0) return null;
                return (
                  <circle
                    key={item.kind}
                    className="gh-donut__seg"
                    data-kind={item.kind}
                    cx={DONUT.size / 2}
                    cy={DONUT.size / 2}
                    r={DONUT.r}
                    strokeDasharray={`${Math.max(0.6, length - (length > 3 ? 1.2 : 0)).toFixed(2)} ${circumference.toFixed(2)}`}
                    strokeDashoffset={(-start).toFixed(2)}
                    transform={`rotate(-90 ${DONUT.size / 2} ${DONUT.size / 2})`}
                  />
                );
              })}
              {dominant && (
                <>
                  <text className="gh-donut__value" x={DONUT.size / 2} y={DONUT.size / 2 - 1} textAnchor="middle">{fmtPct(dominant.share)}</text>
                  <text className="gh-donut__note" x={DONUT.size / 2} y={DONUT.size / 2 + 13} textAnchor="middle">{MIX_SHORT[dominant.kind] ?? (rest ? "pushes" : "commits")}</text>
                </>
              )}
            </svg>
            <ul className="gh-mix__list">
              {mix.items.map((item) => (
                <li key={item.kind} data-kind={item.kind}>
                  <span className="gh-mix__swatch" data-kind={item.kind} aria-hidden="true" />
                  <span className="gh-mix__label">{mixLabel(item.kind, rest)}</span>
                  <span className="gh-mix__value">
                    {fmtInt(item.count)} <span className="gh-muted">· {pct(item.share)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="gh-fine">
            {rest
              ? "Pushes, not commits: a push counts once however many commits it holds. Other public events include comments, stars and new branches."
              : `Shares of all ${fmtInt(mix.total)} ${unit}.${mix.other > 0 && otherParts.length ? ` Other: ${otherParts.join(" and ")}.` : ""}`}
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------- Languages over time ---------- */

const LT_HEIGHT = 160;

const DISTINCT_COLORS = ["#2da44e", "#bf8700", "#8250df", "#cf222e", "#1b7c83", "#e16f24", "#6b7383"];
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const alike = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 60;
};

/** Language colors, nudged to a distinct hue when two stacked layers would look alike (Python and TypeScript are both blue). */
function seriesColors(names: string[]) {
  const used: string[] = [];
  return names.map((name, i) => {
    let color = name === OTHER_LANGUAGES ? "#c9ced6" : name === UNKNOWN_LANGUAGE ? "#8a919e" : languageColor(name, i);
    if (used.some((u) => alike(u, color))) color = DISTINCT_COLORS.find((c) => !used.some((u) => alike(u, c))) ?? color;
    used.push(color);
    return color;
  });
}

function LanguagesCard({ timeline, unit, rest }: { timeline: LanguageTimeline; unit: string; rest: boolean }) {
  const { months, series, shift } = timeline;
  const colors = useMemo(() => seriesColors(series.map((s) => s.name)), [series]);
  const lead = !series.length
    ? undefined
    : shift
      ? `${shift.name} ${shift.to > shift.from ? "grew" : "shrank"} from ${fmtPct(shift.from)} to ${fmtPct(shift.to)} of estimated activity between the earlier and later months.`
      : `${series[0].name} leads with about ${fmtPct(series[0].share)} of estimated activity${series[1] ? `, then ${series[1].name} (${fmtPct(series[1].share)})` : ""}.`;
  const summary = `Estimated ${unit} by language per month, stacked: ${series.map((s) => `${s.name} about ${fmtInt(s.total)} (${fmtPct(s.share)})`).join(", ")}. Monthly values are in the table that follows.`;
  const basis =
    timeline.basis === "bytes"
      ? "each repository's activity is split by its current language bytes, as measured by GitHub, so a repository that changed languages counts as today's mix"
      : timeline.basis === "primary"
        ? "each repository's activity counts toward its primary language, since public events carry no byte counts"
        : "repositories with byte counts are split by their language bytes, the rest count toward their primary language";
  const covered = rest ? "public events in listed repositories" : "commits in public repositories";
  return (
    <Card id="languages" title="Languages over time" badge={<span className="gh-badge">Estimate</span>} lead={lead}>
      {!series.length ? (
        <p className="gh-muted gh-card__empty">No repository activity in this range to attribute to languages.</p>
      ) : (
        <>
          <Chart height={LT_HEIGHT} label={summary} className="gh-lt">
            {(width) => {
              const x0 = 30;
              const x1 = width - 8;
              const y0 = LT_HEIGHT - 20;
              const y1 = 8;
              const n = months.length;
              const index = n === 1 ? [0, 0] : months.map((_, i) => i);
              // Inset so the first and last month labels stay inside the chart.
              const xs = n === 1 ? [x0, x1] : months.map((_, i) => x0 + 12 + (i * (x1 - x0 - 24)) / (n - 1));
              const top = niceMax(Math.max(1, ...timeline.monthTotals), 3);
              const y = linear(0, top, y0, y1);
              let lower = index.map(() => 0);
              const layers = series.map((s, i) => {
                const upper = index.map((k, j) => lower[j] + s.values[k]);
                const d = bandPath(xs, upper.map(y), lower.map(y));
                lower = upper;
                return { s, d, color: colors[i] };
              });
              const ticks = n === 1 ? [{ x: (x0 + x1) / 2, label: monthLabel(months[0]) }] : thin(months.map((m, i) => ({ x: xs[i], label: monthLabel(m) })), 30);
              const columns = n === 1 ? [{ month: months[0], left: x0, right: x1 }] : months.map((month, i) => ({ month, left: i === 0 ? x0 : (xs[i - 1] + xs[i]) / 2, right: i === n - 1 ? x1 : (xs[i] + xs[i + 1]) / 2 }));
              return (
                <>
                  <YGrid ticks={niceTicks(0, top, 3)} y={y} x0={x0} x1={x1} />
                  {layers.map(({ s, d, color }) => (
                    <path key={s.name} className="gh-lt__layer" data-language={s.name} d={d} style={{ fill: color }} />
                  ))}
                  <XLabels ticks={ticks} y={LT_HEIGHT - 5} />
                  <g className="gh-hits">
                    {columns.map((col, i) => (
                      <rect key={col.month} x={col.left} y={y1} width={Math.max(0, col.right - col.left)} height={y0 - y1}>
                        <title>{`${fmtMonth(col.month)}: ${series.filter((s) => s.values[i] > 0).map((s) => `${s.name} ≈ ${fmtNum(s.values[i], 1)}`).join(", ") || "none"}`}</title>
                      </rect>
                    ))}
                  </g>
                </>
              );
            }}
          </Chart>
          <ul className="gh-langs gh-lt__legend" aria-hidden="true">
            {series.map((s, i) => (
              <li key={s.name}>
                <span className="gh-dot" style={{ background: colors[i] }} />
                {s.name} <span className="gh-muted">{fmtPct(s.share)}</span>
              </li>
            ))}
          </ul>
          <p className="gh-fine">
            Estimate: {basis}. Covers {fmtInt(timeline.attributed)} of {fmtInt(timeline.total)} {unit} ({covered}).
          </p>
          <div className="sr-only">
            <table>
              <caption>Estimated {unit} by language and month</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  {series.map((s) => <th key={s.name} scope="col">{s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {months.map((month, i) => (
                  <tr key={month}>
                    <th scope="row">{fmtMonth(month)}</th>
                    {series.map((s) => <td key={s.name}>{fmtNum(s.values[i], 1)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- Sprints ---------- */

const SPRINT_REPOS = 4;

function SprintsCard({ report, insights, unit, rest }: { report: SprintReport; insights: GitHubInsights; unit: string; rest: boolean }) {
  const { sprints, found } = report;
  const definition = `A sprint is a run of at least ${report.minActiveDays} active days with no more than ${plural(report.maxGap, "quiet day")} in a row, ranked by total.`;
  const top = sprints[0];
  const lead = top
    ? `${plural(found, "sprint")} hold ${pct(report.coverage)} of ${unit}. The biggest ran ${plural(top.length, "day")}, ${fmtRange(top.start, top.end)}, with ${fmtInt(top.total)}.`
    : `No sprints in this range. ${definition}`;
  const index = useMemo(() => new Map(insights.days.map((d, i) => [d.date, i])), [insights]);
  const n = Math.max(1, insights.days.length);
  const marks = useMemo(() => {
    const placed: number[] = [];
    return sprints
      .map((s, i) => ({ s, rank: i + 1, left: ((index.get(s.start) ?? 0) / n) * 100, width: (s.length / n) * 100 }))
      .sort((a, b) => a.left - b.left)
      .map((mark) => {
        const center = mark.left + mark.width / 2;
        const labeled = placed.every((x) => Math.abs(x - center) >= 6);
        if (labeled) placed.push(center);
        return { ...mark, center, labeled };
      });
  }, [sprints, index, n]);
  return (
    <Card id="sprints" title="Sprints" lead={lead}>
      {top && (
        <>
          <div className="gh-sprints__strip" aria-hidden="true">
            <div className="gh-sprints__track">
              {marks.map((mark) => (
                <span key={mark.s.start} className="gh-sprints__seg" data-rank={mark.rank} style={{ left: `${mark.left}%`, width: `max(4px, ${mark.width}%)` }} title={`#${mark.rank}: ${fmtRange(mark.s.start, mark.s.end)}`} />
              ))}
            </div>
            <div className="gh-sprints__ranks">
              {marks.filter((mark) => mark.labeled).map((mark) => (
                <span key={mark.s.start} style={{ left: `${Math.min(97, Math.max(3, mark.center))}%` }}>{mark.rank}</span>
              ))}
            </div>
            <div className="gh-sprints__ends">
              <span>{fmtShortDate(insights.range.from)}</span>
              <span>{fmtShortDate(insights.range.to)}</span>
            </div>
          </div>
          <ol className="gh-sprints">
            {sprints.map((s, i) => {
              const max = Math.max(1, ...s.daily);
              const shown = s.repos.slice(0, SPRINT_REPOS);
              return (
                <li key={s.start} className="gh-sprint" data-rank={i + 1}>
                  <div className="gh-sprint__head">
                    <span className="gh-sprint__rank" aria-hidden="true">{i + 1}</span>
                    <span className="gh-sprint__dates">
                      <span className="sr-only">Sprint {i + 1}: </span>
                      {fmtRange(s.start, s.end)}
                    </span>
                  </div>
                  <p className="gh-sprint__meta">
                    {plural(s.length, "day")} · {s.activeDays} active · {count(s.total, unit)} ({pct(s.share)}) · peak {fmtShortDate(s.peak.date)} ({fmtInt(s.peak.count)})
                  </p>
                  <svg className="gh-sprint__spark" viewBox={`0 0 ${s.daily.length} 20`} preserveAspectRatio="none" aria-hidden="true">
                    {s.daily.map((c, k) => (c > 0 ? <rect key={k} x={k + 0.12} y={20 - Math.max(2, (20 * c) / max)} width={0.76} height={Math.max(2, (20 * c) / max)} /> : null))}
                  </svg>
                  {shown.length > 0 ? (
                    <ul className="gh-sprint__repos" aria-label="Repositories">
                      {shown.map((repo) => (
                        <li key={repo.name}>
                          {repo.name} <span className="gh-muted">{fmtInt(repo.count)}</span>
                        </li>
                      ))}
                      {s.repos.length > SPRINT_REPOS && <li className="is-more">+{s.repos.length - SPRINT_REPOS} more</li>}
                    </ul>
                  ) : (
                    <p className="gh-fine">No activity in a listed public repository.</p>
                  )}
                  {s.unattributed > 0 && shown.length > 0 && <p className="gh-fine">{fmtInt(s.unattributed)} not tied to a listed repository</p>}
                </li>
              );
            })}
          </ol>
          <p className="gh-fine">
            {definition}{" "}
            {rest
              ? "Repositories come from public events in this user's own repositories; events elsewhere are not attributed."
              : "Repositories come from per-repository commit counts in public repositories; private work, pull requests, issues and reviews are not attributed to one."}
            {found > sprints.length && ` Showing the top ${sprints.length} of ${found}.`}
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------- Grid ---------- */

export function Insights({ insights, unit }: { insights: GitHubInsights; unit: string }) {
  const rest = insights.source === "rest-events";
  const momentum = useMemo(() => buildMomentum(insights.days), [insights]);
  const rhythm = useMemo(() => buildRhythm(insights.days), [insights]);
  const mix = useMemo(() => buildContributionMix(insights), [insights]);
  const timeline = useMemo(() => buildLanguageTimeline(insights), [insights]);
  const sprints = useMemo(() => detectSprints(insights.days, insights.repos), [insights]);
  return (
    <section className="gh-section" aria-labelledby="gh-insights-heading">
      <div className="gh-section__head">
        <h3 id="gh-insights-heading">Insights</h3>
        <p className="gh-muted">Our own views of the same {unit}, computed in your browser.</p>
      </div>
      <div className="gh-insights">
        <MomentumCard momentum={momentum} unit={unit} from={insights.range.from} />
        <RhythmCard rhythm={rhythm} unit={unit} />
        <MixCard mix={mix} insights={insights} unit={unit} />
        <LanguagesCard timeline={timeline} unit={unit} rest={rest} />
        <SprintsCard report={sprints} insights={insights} unit={unit} rest={rest} />
      </div>
    </section>
  );
}
