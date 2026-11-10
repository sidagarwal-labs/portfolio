import { useId, useMemo } from "react";
import { buildMarket, type MarketModel } from "../analytics";
import type { GitHubInsights } from "../contract";
import { labMemo } from "./cache";
import { bandPath, Chart, Legend, linear, linePath, monthTicks, niceMax, niceTicks, XLabels, YGrid } from "./chart";
import { binomialTailHalf, fmtDate, fmtInt, fmtNum, fmtP, fmtPct, fmtSigned, plural } from "./format";
import { Caveats, Guard, LabSection, Metrics } from "./LabParts";

const M = { left: 40, right: 12, top: 10, bottom: 22 };

function Method({ unit, model }: { unit: string; model: MarketModel | null }) {
  return (
    <LabSection title="Method">
      <p>
        The daily {unit} become a price index:{" "}
        <code>{model?.formula ?? "price = 100 × (1 + EWMA7(daily contributions)) / (1 + mean daily contributions)"}</code>. An index of 100 means an
        average day{model ? ` (${fmtNum(model.meanDaily)} ${unit} per day here)` : ""}. Each candle is a Sunday-to-Saturday week: open and close are the
        index on its first and last day, high and low its extremes. Hollow candles are partial weeks.
      </p>
      <p>
        Overlays: 4-week simple moving average and 8-week Bollinger bands (±2σ) on weekly closes; Wilder RSI(14) and MACD(12, 26, 9) on the daily index.
      </p>
      <p>
        Two tests on complete-week totals, both walk-forward or resampling based so nothing peeks ahead: a one-sided permutation test of lag-1
        autocorrelation (do busy weeks follow busy weeks?), and a backtest of a trend rule against a majority-label baseline.
      </p>
    </LabSection>
  );
}

export function MarketLab({ insights, unit }: { insights: GitHubInsights; unit: string }) {
  const computed = labMemo(insights, "market", () => buildMarket(insights.days));
  if (!computed.ok) return <Guard title="The market model could not run" reason={computed.error} />;
  const model = computed.value;
  if ("insufficient" in model) return <Guard title="The market model needs more weeks" reason={model.insufficient} method={<Method unit={unit} model={null} />} />;
  return <MarketView insights={insights} model={model} unit={unit} />;
}

function MarketView({ insights, model, unit }: { insights: GitHubInsights; model: MarketModel; unit: string }) {
  const mo = model.momentum;
  const tb = model.trendBacktest;
  const correct = Math.round(tb.accuracy * tb.n);
  const baselineCorrect = Math.round(tb.baselineAccuracy * tb.n);
  const coinP = binomialTailHalf(correct, tb.n);
  const mcError = Math.sqrt((mo.pValue * (1 - mo.pValue)) / Math.max(1, mo.permutations));
  const s = model.summary;

  return (
    <div className="gh-lab">
      <LabSection title="Results">
        <Metrics
          items={[
            { id: "change", label: "Index change", value: `${fmtSigned(s.changePct, 1)}%`, note: `${fmtNum(s.open, 1)} to ${fmtNum(s.close, 1)}` },
            { id: "drawdown", label: "Max drawdown", value: `${fmtNum(s.maxDrawdownPct, 1)}%`, note: `range ${fmtNum(s.low, 1)}–${fmtNum(s.high, 1)}` },
            {
              id: "momentum",
              label: "Lag-1 autocorrelation",
              value: `r = ${fmtNum(mo.statistic)}`,
              note: `p = ${fmtP(mo.pValue)}, ${mo.significant ? "significant" : "not significant"}`,
              tone: mo.significant ? "good" : "neutral"
            },
            {
              id: "trend",
              label: "Trend rule accuracy",
              value: fmtPct(tb.accuracy, 1),
              note: `vs ${fmtPct(tb.baselineAccuracy, 1)} majority baseline`,
              tone: tb.edge > 0 ? "good" : "bad"
            }
          ]}
        />
        <PriceChart model={model} />
        <div className="gh-grid2">
          <RsiChart model={model} />
          <MacdChart model={model} />
        </div>
        <h5>Momentum test</h5>
        <p>
          {mo.hypothesis} Over {mo.n} complete weeks, r = {fmtNum(mo.statistic)}. Shuffling the weeks {fmtInt(mo.permutations)} times gives a one-sided
          p-value of {fmtP(mo.pValue)} (simulation error about ±{fmtNum(mcError, 3)}).{" "}
          {mo.significant
            ? "That is significant at the 5% level: busy weeks do tend to follow busy weeks."
            : "That is not significant at the 5% level, so the data does not rule out that the persistence is chance."}
        </p>
        <p>
          After a week above the median ({fmtNum(mo.medianWeek, 1)} {unit}), the next week was also above it {fmtPct(mo.hitRate)} of the time (
          {plural(mo.hitPairs, "such week")}), against {fmtPct(mo.baseRate)} for weeks in general.
        </p>
        <h5>Trend-rule backtest</h5>
        <p>
          Rule: {tb.rule}. Over {plural(tb.n, "walk-forward week")} it was right {correct} times ({fmtPct(tb.accuracy, 1)}). The baseline ("{lowerFirst(tb.baselineRule)}") was right{" "}
          {baselineCorrect} times ({fmtPct(tb.baselineAccuracy, 1)}), an edge of {fmtSigned(tb.edge * 100, 1)} points.
          {tb.baselineAccuracy < 0.5 &&
            " The baseline scores below 50%: the label that had been more common so far was usually wrong the next week, so beating it is a low bar."}{" "}
          Against a coin flip, {correct} of {tb.n} has a one-sided p-value of {fmtP(coinP)}
          {coinP >= 0.05 ? ", so the rule is not distinguishable from guessing." : ", unlikely under pure guessing."}
        </p>
      </LabSection>
      <LabSection title="Caveats">
        <Caveats items={marketCaveats(insights, model, unit)} />
      </LabSection>
      <Method unit={unit} model={model} />
    </div>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function useCandleLayout(model: MarketModel) {
  return useMemo(() => {
    let offset = 0;
    return model.candles.map((candle, i) => {
      const i0 = offset;
      offset += candle.days;
      return { candle, i, i0, i1: offset - 1, center: (i0 + offset - 1) / 2 };
    });
  }, [model]);
}

function PriceChart({ model }: { model: MarketModel }) {
  const clipId = useId().replace(/:/g, "");
  const layout = useCandleLayout(model);
  const { bollinger, sma4 } = model.indicators;
  const n = model.daily.length;
  const values = [...model.candles.flatMap((c) => [c.high, c.low]), ...(bollinger.upper.filter((v) => v !== null) as number[])];
  const lowBand = bollinger.lower.filter((v) => v !== null) as number[];
  const lo = Math.max(0, Math.min(...values, ...lowBand));
  const hi = Math.max(...values);
  const ticks = niceTicks(lo, hi, 4);
  const top = Math.max(hi, ticks[ticks.length - 1]);
  const bottom = Math.min(lo, ticks[0]);
  const H = 230;
  const up = model.candles.filter((c) => c.close >= c.open).length;
  const label = `Weekly candles of the activity index, ${model.candles.length} weeks: ${up} closed at or above their open, ${model.candles.length - up} below. Index ranged ${fmtNum(model.summary.low, 1)} to ${fmtNum(model.summary.high, 1)}; it opened at ${fmtNum(model.summary.open, 1)} and closed at ${fmtNum(model.summary.close, 1)}.`;
  return (
    <figure className="gh-figure">
      <figcaption>Activity index, weekly candles</figcaption>
      <Chart height={H} label={label}>
        {(w) => {
          const x = linear(-0.5, n - 0.5, M.left, w - M.right);
          const y = linear(bottom, top, H - M.bottom, M.top);
          const centers = layout.map((l) => x(l.center));
          const day = x(1) - x(0);
          return (
            <>
              <defs>
                <clipPath id={clipId}>
                  <rect x={M.left} y={M.top} width={Math.max(0, w - M.left - M.right)} height={H - M.top - M.bottom} />
                </clipPath>
              </defs>
              <YGrid ticks={ticks.filter((t) => t >= bottom && t <= top)} y={y} x0={M.left} x1={w - M.right} />
              <XLabels ticks={monthTicks(model.daily.map((d) => d.date), x)} y={H - 6} />
              <g clipPath={`url(#${clipId})`}>
                <path className="gh-band" d={bandPath(centers, bollinger.upper.map((v) => (v === null ? null : y(v))), bollinger.lower.map((v) => (v === null ? null : y(v))))} />
                {layout.map(({ candle, i0, i1, center }) => {
                  const cx = x(center);
                  const body = Math.max(1.5, (i1 - i0 + 1) * day * 0.62);
                  const rising = candle.close >= candle.open;
                  return (
                    <g key={candle.start} className={`gh-candle ${rising ? "is-up" : "is-down"}${candle.partial ? " is-partial" : ""}`}>
                      <line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} />
                      <rect x={cx - body / 2} width={body} y={y(Math.max(candle.open, candle.close))} height={Math.max(1, Math.abs(y(candle.open) - y(candle.close)))}>
                        <title>{`Week of ${fmtDate(candle.start)}: open ${fmtNum(candle.open, 1)}, high ${fmtNum(candle.high, 1)}, low ${fmtNum(candle.low, 1)}, close ${fmtNum(candle.close, 1)}, ${candle.volume} that week${candle.partial ? " (partial week)" : ""}`}</title>
                      </rect>
                    </g>
                  );
                })}
                <path className="gh-line gh-line--sma" d={linePath(centers, sma4.map((v) => (v === null ? null : y(v))))} />
              </g>
            </>
          );
        }}
      </Chart>
      <Legend
        items={[
          { label: "Up week", className: "gh-key--up", shape: "box" },
          { label: "Down week", className: "gh-key--down", shape: "box" },
          { label: "SMA(4)", className: "gh-line--sma" },
          { label: "Bollinger (8, ±2σ)", className: "gh-band", shape: "box" }
        ]}
      />
    </figure>
  );
}

function RsiChart({ model }: { model: MarketModel }) {
  const rsi = model.indicators.rsi14;
  const n = rsi.length;
  const H = 120;
  const valid = rsi.filter((v) => v !== null) as number[];
  const last = valid[valid.length - 1];
  const above = valid.filter((v) => v > 70).length;
  const below = valid.filter((v) => v < 30).length;
  const label = `RSI(14) of the daily index${last !== undefined ? `, last ${fmtNum(last, 0)}` : ""}. Above 70 on ${above} days, below 30 on ${below} days.`;
  return (
    <figure className="gh-figure">
      <figcaption>RSI(14)</figcaption>
      <Chart height={H} label={label}>
        {(w) => {
          const x = linear(0, Math.max(1, n - 1), M.left, w - M.right);
          const y = linear(0, 100, H - M.bottom, M.top);
          return (
            <>
              <YGrid ticks={[0, 30, 70, 100]} y={y} x0={M.left} x1={w - M.right} />
              <rect className="gh-zone" x={M.left} width={Math.max(0, w - M.left - M.right)} y={y(70)} height={y(30) - y(70)} />
              <XLabels ticks={monthTicks(model.daily.map((d) => d.date), x, 48)} y={H - 6} />
              <path className="gh-line gh-line--rsi" d={linePath(rsi.map((_, i) => x(i)), rsi.map((v) => (v === null ? null : y(v))))} />
            </>
          );
        }}
      </Chart>
    </figure>
  );
}

function MacdChart({ model }: { model: MarketModel }) {
  const { macd, signal, histogram } = model.indicators.macd;
  const n = macd.length;
  const H = 120;
  const all = [...macd, ...signal, ...histogram].filter((v) => v !== null) as number[];
  const extent = Math.max(1, ...all.map(Math.abs));
  const span = niceMax(extent, 2);
  const ticks = [-span, 0, span];
  let crossings = 0;
  for (let i = 1; i < n; i++) {
    const a = histogram[i - 1];
    const b = histogram[i];
    if (a !== null && b !== null && Math.sign(a) !== Math.sign(b) && b !== 0) crossings++;
  }
  const label = `MACD(12, 26, 9) of the daily index. The MACD line crossed its signal line ${crossings} times.`;
  return (
    <figure className="gh-figure">
      <figcaption>MACD(12, 26, 9)</figcaption>
      <Chart height={H} label={label}>
        {(w) => {
          const x = linear(0, Math.max(1, n - 1), M.left, w - M.right);
          const y = linear(-span, span, H - M.bottom, M.top);
          const barW = Math.max(1, (x(1) - x(0)) * 0.8);
          let hist = "";
          histogram.forEach((v, i) => {
            if (v === null) return;
            const y0 = y(0);
            const y1 = y(v);
            hist += `M${(x(i) - barW / 2).toFixed(1)} ${y0.toFixed(1)}h${barW.toFixed(1)}V${y1.toFixed(1)}h${(-barW).toFixed(1)}Z`;
          });
          return (
            <>
              <YGrid ticks={ticks} y={y} x0={M.left} x1={w - M.right} />
              <XLabels ticks={monthTicks(model.daily.map((d) => d.date), x, 48)} y={H - 6} />
              <path className="gh-hist" d={hist} />
              <path className="gh-line gh-line--macd" d={linePath(macd.map((_, i) => x(i)), macd.map((v) => (v === null ? null : y(v))))} />
              <path className="gh-line gh-line--signal" d={linePath(signal.map((_, i) => x(i)), signal.map((v) => (v === null ? null : y(v))))} />
            </>
          );
        }}
      </Chart>
      <Legend
        items={[
          { label: "MACD", className: "gh-line--macd" },
          { label: "Signal", className: "gh-line--signal" },
          { label: "Histogram", className: "gh-hist", shape: "box" }
        ]}
      />
    </figure>
  );
}

function marketCaveats(insights: GitHubInsights, model: MarketModel, unit: string) {
  const mo = model.momentum;
  const items = [
    `The index is smoothed ${unit}, not a price, and nothing is traded. RSI, MACD and Bollinger bands are borrowed from trading as ways to describe momentum and volatility; they are not shown to predict anything here.`,
    `The EWMA smooths the daily series, so the indicators lag real changes by days. The first weeks have no SMA or bands until enough history exists.`,
    `${mo.n} weeks is a small sample for an autocorrelation test${mo.significant ? "" : ": a modest real persistence could still miss the 5% threshold"}.`,
    `The trend-rule backtest scores ${plural(model.trendBacktest.n, "prediction")}; a few weeks either way changes the accuracy by several points.`
  ];
  if (insights.source === "rest-events") items.push("This profile has about 13 weeks of public events, so both tests have very little data to work with.");
  return items;
}
