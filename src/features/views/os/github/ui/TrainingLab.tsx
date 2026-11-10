import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import {
  assessTrainingData,
  createTrainer,
  DEFAULT_TRAINING_CONFIG,
  FEATURE_NAMES,
  WARMUP_DAYS,
  type EpochMetrics,
  type Trainer,
  type TrainingResult
} from "../analytics";
import type { GitHubInsights } from "../contract";
import { usePrefersReducedMotion } from "../../../../../hooks/usePrefersReducedMotion";
import { peekMemo, storeMemo } from "./cache";
import { Chart, Legend, linear, linePath, niceMax, niceTicks, useSeen, XLabels, YGrid } from "./chart";
import { fmtDate, fmtInt, fmtNum, fmtPct, fmtRange, fmtShortDate, fmtSigned, plural } from "./format";
import { Caveats, Guard, LabSection, Metrics, type MetricItem } from "./LabParts";

const RESULT_KEY = "training-result";
const EPOCH_MS = 32;

type Status = "waiting" | "running" | "paused" | "evaluating" | "done";
type Weights = ReturnType<Trainer["currentWeights"]>;

const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

function Method({ unit, result }: { unit: string; result: TrainingResult | null }) {
  const cfg = result?.config ?? DEFAULT_TRAINING_CONFIG;
  const split = result?.split;
  return (
    <LabSection title="Method">
      <p>
        A hurdle model, trained here in your browser. One logistic regression predicts whether a day has any {unit}; a second, linear regression
        predicts log(count) on active days. The expected count is P(active) × E[count | active], with Duan's smearing factor to undo the log.
      </p>
      <p>
        {FEATURE_NAMES.length - 1} features plus an intercept: weekday, whether yesterday and the same weekday last week were active, log 7-day and
        28-day means, log days since the last active day, and a time trend. Every feature uses only earlier days.
      </p>
      <p>
        Full-batch Adam, learning rate {cfg.learningRate}, L2 {cfg.l2}, {cfg.epochs} epochs, seed {cfg.seed}. The split is by time: the first{" "}
        {WARMUP_DAYS} days only feed the lag features, the next 80% train and the last 20% validate.
        {split &&
          ` Training: ${fmtRange(split.trainFrom, split.trainTo)} (${split.trainDays} days). Validation: ${fmtRange(split.validFrom, split.validTo)} (${split.validDays} days, ${split.validActiveDays} active).`}{" "}
        The loss plotted each epoch is log loss on all days plus the mean squared error of log(count) on active days (L2 term excluded).
      </p>
    </LabSection>
  );
}

export function TrainingLab({ insights, unit }: { insights: GitHubInsights; unit: string }) {
  const guard = useMemo(() => assessTrainingData(insights.days), [insights]);
  if (!guard.ok) return <Guard title="The training run needs more data" reason={guard.reason} method={<Method unit={unit} result={null} />} />;
  return <TrainingRun insights={insights} unit={unit} />;
}

function TrainingRun({ insights, unit }: { insights: GitHubInsights; unit: string }) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [cached] = useState(() => peekMemo<TrainingResult>(insights, RESULT_KEY));
  const [trainer, setTrainer] = useState<Trainer | null>(() => (cached ? null : createTrainer(insights.days)));
  const [history, setHistory] = useState<EpochMetrics[]>(() => cached?.history ?? []);
  const [weights, setWeights] = useState<Weights>(() => cached?.weights ?? trainer?.currentWeights() ?? []);
  const [result, setResult] = useState<TrainingResult | null>(cached ?? null);
  const [status, setStatus] = useState<Status>(cached ? "done" : reduced ? "evaluating" : "waiting");
  const seen = useSeen(rootRef, status === "waiting");
  const total = trainer?.totalEpochs ?? result?.config.epochs ?? DEFAULT_TRAINING_CONFIG.epochs;

  const complete = (run: Trainer) => {
    const finished = run.finish();
    storeMemo(insights, RESULT_KEY, finished);
    setHistory(finished.history.slice());
    setWeights(finished.weights);
    setResult(finished);
    setStatus("done");
  };

  useEffect(() => {
    if (status === "waiting" && seen) setStatus(reduced ? "evaluating" : "running");
  }, [status, seen, reduced]);

  useEffect(() => {
    if (reduced && (status === "running" || status === "paused")) setStatus("evaluating");
  }, [reduced, status]);

  useEffect(() => {
    if (status !== "running" || !trainer) return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      carry = Math.min(carry + now - last, EPOCH_MS * 4);
      last = now;
      let stepped = false;
      while (carry >= EPOCH_MS && trainer.history.length < trainer.totalEpochs) {
        carry -= EPOCH_MS;
        trainer.step();
        stepped = true;
      }
      if (stepped) {
        setHistory(trainer.history.slice());
        setWeights(trainer.currentWeights());
      }
      if (trainer.history.length >= trainer.totalEpochs) {
        setStatus("evaluating");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, trainer]);

  useEffect(() => {
    if (status !== "evaluating" || !trainer) return;
    /* Let the "Evaluating" state paint before the backtest and simulations block the thread for a moment. */
    const timer = window.setTimeout(() => complete(trainer), 30);
    return () => window.clearTimeout(timer);
  }, [status, trainer]);

  const restart = () => {
    const run = createTrainer(insights.days);
    setTrainer(run);
    setHistory([]);
    setWeights(run.currentWeights());
    setResult(null);
    setStatus(reduced ? "evaluating" : "running");
  };

  const epoch = history.length;
  const announce =
    status === "waiting"
      ? "Training starts when this panel is on screen."
      : status === "running"
        ? "Training."
        : status === "paused"
          ? `Paused at epoch ${epoch}.`
          : status === "evaluating"
            ? "Evaluating on the validation days, running the weekly backtest and simulating the forecast."
            : result
              ? `Training finished. Validation MAE ${fmtNum(result.model.mae)}.`
              : "";

  return (
    <div className="gh-lab" ref={rootRef}>
      <LabSection title="Training">
        <div className="gh-train__bar">
          <p className="gh-train__epoch" data-epoch={epoch}>
            Epoch {epoch} of {total}
          </p>
          <progress className="gh-train__progress" max={total} value={epoch} aria-label="Training progress" />
          <div className="gh-train__controls">
            {status === "waiting" && (
              <button type="button" className="os-button" onClick={() => setStatus("running")}>
                <Play size={14} strokeWidth={2} aria-hidden="true" />
                Start
              </button>
            )}
            {(status === "running" || status === "paused") && (
              <button type="button" className="os-button" onClick={() => setStatus(status === "running" ? "paused" : "running")}>
                {status === "running" ? <Pause size={14} strokeWidth={2} aria-hidden="true" /> : <Play size={14} strokeWidth={2} aria-hidden="true" />}
                {status === "running" ? "Pause" : "Resume"}
              </button>
            )}
            {(status === "waiting" || status === "running" || status === "paused") && trainer && (
              <button type="button" className="os-button os-button--primary" onClick={() => complete(trainer)}>
                <SkipForward size={14} strokeWidth={2} aria-hidden="true" />
                Skip to result
              </button>
            )}
            {status === "done" && (
              <button type="button" className="os-button" onClick={restart}>
                <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                Train again
              </button>
            )}
          </div>
        </div>
        <p className="gh-train__status" role="status">
          {announce}
        </p>
        <div className="gh-grid2">
          <LossChart history={history} total={total} />
          <MaeChart history={history} total={total} result={result} />
        </div>
        <WeightsTable weights={weights} epoch={epoch} />
        {status === "done" && result && (
          <p className="gh-fine">The seed is fixed, so training again reproduces the same numbers.</p>
        )}
      </LabSection>
      {result ? (
        <>
          <TrainingResults insights={insights} result={result} unit={unit} />
          <LabSection title="Caveats">
            <Caveats items={trainingCaveats(insights, result)} />
          </LabSection>
        </>
      ) : (
        <LabSection title="Results">
          <p className="gh-muted">Results appear when training finishes.</p>
        </LabSection>
      )}
      <Method unit={unit} result={result} />
    </div>
  );
}

const MARGIN = { left: 40, right: 12, top: 10, bottom: 24 };

function epochAxis(total: number, x: (v: number) => number) {
  return [1, ...niceTicks(0, total, 3).filter((t) => t > 1)].map((t) => ({ x: x(t), label: String(t) }));
}

function LossChart({ history, total }: { history: EpochMetrics[]; total: number }) {
  const max = niceMax(history.reduce((m, h) => Math.max(m, h.trainLoss, h.validationLoss), 0));
  const last = history[history.length - 1];
  const label = last
    ? `Loss by epoch. Epoch ${last.epoch}: training ${fmtNum(last.trainLoss, 3)}, validation ${fmtNum(last.validationLoss, 3)}.`
    : "Loss by epoch. Training has not started.";
  return (
    <figure className="gh-figure">
      <figcaption>Loss per epoch</figcaption>
      <Chart height={170} label={label}>
        {(w) => {
          const x = linear(1, total, MARGIN.left, w - MARGIN.right);
          const y = linear(0, max, 170 - MARGIN.bottom, MARGIN.top);
          const xs = history.map((h) => x(h.epoch));
          return (
            <>
              <YGrid ticks={niceTicks(0, max, 3)} y={y} x0={MARGIN.left} x1={w - MARGIN.right} />
              <XLabels ticks={epochAxis(total, x)} y={170 - 6} />
              <path className="gh-line gh-line--train" d={linePath(xs, history.map((h) => y(h.trainLoss)))} />
              <path className="gh-line gh-line--valid" d={linePath(xs, history.map((h) => y(h.validationLoss)))} />
            </>
          );
        }}
      </Chart>
      <Legend items={[{ label: "Training", className: "gh-line--train" }, { label: "Validation", className: "gh-line--valid" }]} />
    </figure>
  );
}

function MaeChart({ history, total, result }: { history: EpochMetrics[]; total: number; result: TrainingResult | null }) {
  const refs = result ? [result.bestBaseline.mae, result.referenceZeroMae] : [];
  const max = niceMax(Math.max(0, ...history.map((h) => h.validationMae), ...refs));
  const last = history[history.length - 1];
  const label = [
    last ? `Validation MAE by epoch; epoch ${last.epoch}: ${fmtNum(last.validationMae)}.` : "Validation MAE by epoch. Training has not started.",
    result ? `Best baseline ${fmtNum(result.bestBaseline.mae)}; always predicting 0: ${fmtNum(result.referenceZeroMae)}.` : ""
  ].join(" ");
  return (
    <figure className="gh-figure">
      <figcaption>Validation MAE per epoch (lower is better)</figcaption>
      <Chart height={170} label={label}>
        {(w) => {
          const x = linear(1, total, MARGIN.left, w - MARGIN.right);
          const y = linear(0, max, 170 - MARGIN.bottom, MARGIN.top);
          return (
            <>
              <YGrid ticks={niceTicks(0, max, 3)} y={y} x0={MARGIN.left} x1={w - MARGIN.right} />
              <XLabels ticks={epochAxis(total, x)} y={170 - 6} />
              {result && (
                <>
                  <line className="gh-ref gh-ref--baseline" x1={MARGIN.left} x2={w - MARGIN.right} y1={y(result.bestBaseline.mae)} y2={y(result.bestBaseline.mae)} />
                  <line className="gh-ref gh-ref--zero" x1={MARGIN.left} x2={w - MARGIN.right} y1={y(result.referenceZeroMae)} y2={y(result.referenceZeroMae)} />
                </>
              )}
              <path className="gh-line gh-line--valid" d={linePath(history.map((h) => x(h.epoch)), history.map((h) => y(h.validationMae)))} />
            </>
          );
        }}
      </Chart>
      <Legend
        items={[
          { label: "Model", className: "gh-line--valid" },
          ...(result
            ? [
                { label: result.bestBaseline.label, className: "gh-ref--baseline", shape: "dash" as const },
                { label: "Always 0", className: "gh-ref--zero", shape: "dash" as const }
              ]
            : [])
        ]}
      />
    </figure>
  );
}

function WeightsTable({ weights, epoch }: { weights: Weights; epoch: number }) {
  const bias = weights.find((w) => w.feature === "bias");
  const rows = weights.filter((w) => w.feature !== "bias");
  const scale = Math.max(0.25, ...rows.map((w) => Math.max(Math.abs(w.activeWeight), Math.abs(w.countWeight))));
  const bar = (value: number) => {
    const width = (Math.min(1, Math.abs(value) / scale) * 50).toFixed(2);
    return (
      <span className="gh-wbar" aria-hidden="true">
        <span className={value >= 0 ? "is-pos" : "is-neg"} style={value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
      </span>
    );
  };
  return (
    <div className="gh-table-wrap">
      <table className="gh-table gh-weights">
        <caption>
          Weights at epoch {epoch} (standardized features){bias ? `; intercepts ${fmtSigned(bias.activeWeight)} and ${fmtSigned(bias.countWeight)}` : ""}
        </caption>
        <thead>
          <tr>
            <th scope="col">Feature</th>
            <th scope="col">P(active)</th>
            <th scope="col">log(count)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature}>
              <th scope="row">{row.feature}</th>
              <td>
                {bar(row.activeWeight)}
                <span className="gh-num">{fmtSigned(row.activeWeight)}</span>
              </td>
              <td>
                {bar(row.countWeight)}
                <span className="gh-num">{fmtSigned(row.countWeight)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function constantRateScores(insights: GitHubInsights, result: TrainingResult) {
  const p = Math.min(1 - 1e-6, Math.max(1e-6, result.trainActiveRate));
  const valid = insights.days.filter((d) => d.date >= result.split.validFrom && d.date <= result.split.validTo);
  let logLoss = 0;
  let brier = 0;
  let squared = 0;
  for (const day of valid) {
    const active = day.count > 0;
    logLoss -= active ? Math.log(p) : Math.log(1 - p);
    brier += (p - (active ? 1 : 0)) ** 2;
    squared += day.count ** 2;
  }
  const n = Math.max(1, valid.length);
  return { rate: p, logLoss: logLoss / n, brier: brier / n, zeroRmse: Math.sqrt(squared / n) };
}

function TrainingResults({ insights, result, unit }: { insights: GitHubInsights; result: TrainingResult; unit: string }) {
  const r = result;
  const constant = useMemo(() => constantRateScores(insights, r), [insights, r]);
  const bt = r.backtestSummary;
  const btLabel = r.baselines.find((b) => b.id === bt.baselineId)?.label ?? bt.baselineId;
  const week1 = r.forecastWeeks[0];
  const coverage = Math.round((r.forecastMethod.highQuantile - r.forecastMethod.lowQuantile) * 100);
  const zeroWins = r.referenceZeroMae <= r.model.mae;
  const beatsAll = r.beatsBaselines && !zeroWins;
  const btWins = bt.modelMae < bt.baselineMae;
  const llBetter = r.model.logLoss < constant.logLoss;
  const brierBetter = r.model.brier < constant.brier;
  const auc = r.model.auc;
  const aucTone = auc === null ? undefined : auc >= 0.7 ? "good" : auc <= 0.55 ? "bad" : "neutral";

  // Lead with how well the model separates active from quiet days; MAE on a zero-heavy series favors predicting 0.
  const metrics: MetricItem[] = [
    { id: "auc", label: "AUC, active vs quiet days", value: auc === null ? "n/a" : fmtNum(auc), note: "0.50 is chance", tone: aucTone },
    {
      id: "log-loss",
      label: "Log loss vs constant rate",
      value: `${fmtNum(r.model.logLoss, 3)} vs ${fmtNum(constant.logLoss, 3)}`,
      note: `lower is better; Brier ${fmtNum(r.model.brier, 3)} vs ${fmtNum(constant.brier, 3)}`,
      tone: llBetter ? "good" : "bad"
    },
    { id: "model-mae", label: "Model MAE (validation)", value: fmtNum(r.model.mae), note: `per day; RMSE ${fmtNum(r.model.rmse)}`, tone: beatsAll ? "good" : r.beatsBaselines ? "neutral" : "bad" },
    { id: "best-baseline", label: "Best baseline MAE", value: fmtNum(r.bestBaseline.mae), note: r.bestBaseline.label },
    { id: "zero-mae", label: "Always-0 MAE", value: fmtNum(r.referenceZeroMae), note: zeroWins ? "lower than the model" : "higher than the model", tone: zeroWins ? "bad" : "good" },
    { id: "backtest", label: "Weekly backtest MAE", value: `${fmtNum(bt.modelMae)} vs ${fmtNum(bt.baselineMae)}`, note: `model vs ${lowerFirst(btLabel)}, ${plural(bt.weeks, "week")}`, tone: btWins ? "good" : "bad" },
    ...(week1
      ? [{ id: "forecast", label: `Forecast, ${fmtRange(week1.start, week1.end)}`, value: fmtNum(week1.expected, 1), note: `${coverage}% interval ${fmtInt(week1.low)}–${fmtInt(week1.high)}` }]
      : [])
  ];

  const scores = `log loss ${fmtNum(r.model.logLoss, 3)} and Brier score ${fmtNum(r.model.brier, 3)}, against ${fmtNum(constant.logLoss, 3)} and ${fmtNum(constant.brier, 3)} for a constant ${fmtPct(constant.rate, 1)} chance of activity`;
  const headline =
    auc === null
      ? `On the ${r.split.validDays} validation days the model scores ${scores}. AUC is not defined because the validation days are all active or all quiet.`
      : llBetter && brierBetter && auc >= 0.7
        ? `The model is best at telling active days from quiet ones. On the ${r.split.validDays} validation days it reaches AUC ${fmtNum(auc)} (0.50 is chance), with ${scores}.`
        : `As a classifier of active versus quiet days the model reaches AUC ${fmtNum(auc)} on the ${r.split.validDays} validation days (0.50 is chance), with ${scores}${llBetter && brierBetter ? "" : llBetter || brierBetter ? ": it only partly beats that constant" : ": it does not beat that constant"}.`;

  const predictors = r.baselines.length + 1;
  const best = `${lowerFirst(r.bestBaseline.label)} at ${fmtNum(r.bestBaseline.mae)}`;
  const zero = `always predicting 0 scores ${fmtNum(r.referenceZeroMae)}`;
  const maeLine = beatsAll
    ? `Its mean absolute error, ${fmtNum(r.model.mae)} ${unit} per day, is lower than all ${predictors} simple predictors. The best baseline, ${best}, is ${fmtPct(r.skillVsBest, 1)} worse, and ${zero}.`
    : r.beatsBaselines
      ? `On count error the picture is mixed. Its mean absolute error, ${fmtNum(r.model.mae)} ${unit} per day, beats all ${r.baselines.length} baselines (best: ${best}), but ${zero}, lower still. MAE rewards predicting the median, and the median day here has no activity.`
      : zeroWins
        ? `Its mean absolute error, ${fmtNum(r.model.mae)} ${unit} per day, does not beat the best baseline, ${best}, and ${zero}, lower still. MAE rewards predicting the median, and the median day here has no activity.`
        : `Its mean absolute error, ${fmtNum(r.model.mae)} ${unit} per day, does not beat the best baseline, ${best}.`;

  const verdict = [
    headline,
    maeLine,
    `In the weekly walk-forward backtest (refit at each of ${plural(bt.weeks, "week")}), the model's error on weekly totals is ${fmtNum(bt.modelMae)} against ${fmtNum(bt.baselineMae)} for the ${lowerFirst(btLabel)} baseline: the model ${btWins ? "wins" : "loses"}.`
  ];

  return (
    <LabSection title="Results">
      <Metrics items={metrics} />
      {verdict.map((text, i) => <p key={text} className={i === 0 ? "gh-lab__lead" : undefined}>{text}</p>)}
      <div className="gh-table-wrap">
        <table className="gh-table">
          <caption>Validation error per day, {fmtRange(r.split.validFrom, r.split.validTo)}</caption>
          <thead>
            <tr>
              <th scope="col">Predictor</th>
              <th scope="col">MAE</th>
              <th scope="col">RMSE</th>
            </tr>
          </thead>
          <tbody>
            <tr className="is-model">
              <th scope="row">Hurdle model</th>
              <td>{fmtNum(r.model.mae)}</td>
              <td>{fmtNum(r.model.rmse)}</td>
            </tr>
            {r.baselines.map((b) => (
              <tr key={b.id}>
                <th scope="row">{b.label}</th>
                <td>{fmtNum(b.mae)}</td>
                <td>{fmtNum(b.rmse)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Always 0</th>
              <td>{fmtNum(r.referenceZeroMae)}</td>
              <td>{fmtNum(constant.zeroRmse)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="gh-grid2">
        <BacktestChart result={r} label={btLabel} />
        <ForecastChart insights={insights} result={r} coverage={coverage} />
      </div>
      <p>
        Forecast for the next {plural(r.forecast.length, "day")}, from a refit on every day and {fmtInt(r.forecastMethod.simulations)} simulations:{" "}
        {r.forecastWeeks.map((w) => `${fmtShortDate(w.start)}: ${fmtNum(w.expected, 1)} (${fmtInt(w.low)}–${fmtInt(w.high)})`).join("; ")}.
      </p>
      {r.calibration.length > 0 && (
        <div className="gh-table-wrap">
          <table className="gh-table">
            <caption>Calibration of P(active) on validation days</caption>
            <thead>
              <tr>
                <th scope="col">Mean predicted</th>
                <th scope="col">Observed active</th>
                <th scope="col">Days</th>
              </tr>
            </thead>
            <tbody>
              {r.calibration.map((bin) => (
                <tr key={`${bin.predicted}-${bin.n}`}>
                  <td>{fmtPct(bin.predicted)}</td>
                  <td>{fmtPct(bin.observed)}</td>
                  <td>{bin.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="gh-fine">
        Count part: {plural(r.countModel.trainActiveDays, "active training day")}, residual SD {fmtNum(r.countModel.residualSd)} on the log scale, smearing
        factor {fmtNum(r.countModel.smearing)}. Training days were active {fmtPct(r.trainActiveRate, 1)} of the time.
      </p>
    </LabSection>
  );
}

function BacktestChart({ result, label }: { result: TrainingResult; label: string }) {
  const rows = result.backtest;
  const max = niceMax(Math.max(1, ...rows.flatMap((w) => [w.actual, w.predicted, w.baseline])));
  const H = 180;
  const summary = `Weekly walk-forward backtest, ${rows.length} weeks. Weekly totals: ${rows
    .map((w) => `${fmtShortDate(w.weekStart)} actual ${fmtInt(w.actual)}, model ${fmtNum(w.predicted, 1)}, baseline ${fmtNum(w.baseline, 1)}`)
    .join("; ")}.`;
  return (
    <figure className="gh-figure">
      <figcaption>Walk-forward backtest, weekly totals</figcaption>
      <Chart height={H} label={summary}>
        {(w) => {
          const band = (w - MARGIN.left - MARGIN.right) / Math.max(1, rows.length);
          const cx = (i: number) => MARGIN.left + band * (i + 0.5);
          const y = linear(0, max, H - MARGIN.bottom, MARGIN.top);
          const every = Math.max(1, Math.ceil(52 / band));
          return (
            <>
              <YGrid ticks={niceTicks(0, max, 3)} y={y} x0={MARGIN.left} x1={w - MARGIN.right} />
              {rows.map((row, i) => (
                <rect key={row.weekStart} className="gh-bar" x={cx(i) - band * 0.32} width={band * 0.64} y={y(row.actual)} height={Math.max(0, y(0) - y(row.actual))} />
              ))}
              <path className="gh-line gh-line--baseline" d={linePath(rows.map((_, i) => cx(i)), rows.map((row) => y(row.baseline)))} />
              <path className="gh-line gh-line--valid" d={linePath(rows.map((_, i) => cx(i)), rows.map((row) => y(row.predicted)))} />
              {rows.map((row, i) => (
                <circle key={row.weekStart} className="gh-dot-mark" cx={cx(i)} cy={y(row.predicted)} r={2.5} />
              ))}
              <XLabels ticks={rows.map((row, i) => ({ x: cx(i), label: i % every === 0 ? fmtShortDate(row.weekStart) : "" })).filter((t) => t.label)} y={H - 6} />
            </>
          );
        }}
      </Chart>
      <Legend
        items={[
          { label: "Actual", className: "gh-bar", shape: "box" },
          { label: "Model", className: "gh-line--valid" },
          { label: label, className: "gh-line--baseline", shape: "dash" }
        ]}
      />
    </figure>
  );
}

function ForecastChart({ insights, result, coverage }: { insights: GitHubInsights; result: TrainingResult; coverage: number }) {
  const blocks = useMemo(() => {
    const n = insights.days.length;
    const out: { start: string; total: number }[] = [];
    for (let k = 8; k >= 1; k--) {
      const from = n - 7 * k;
      if (from < 0) continue;
      const slice = insights.days.slice(from, from + 7);
      out.push({ start: slice[0].date, total: slice.reduce((s, d) => s + d.count, 0) });
    }
    return out;
  }, [insights]);
  const weeks = result.forecastWeeks;
  const count = blocks.length + weeks.length;
  const max = niceMax(Math.max(1, ...blocks.map((b) => b.total), ...weeks.map((w) => w.high)));
  const H = 180;
  const summary = `Last ${blocks.length} weeks of actual totals, then a ${weeks.length}-week forecast with ${coverage}% intervals: ${weeks
    .map((w) => `${fmtShortDate(w.start)} ${fmtNum(w.expected, 1)} (${fmtInt(w.low)} to ${fmtInt(w.high)})`)
    .join("; ")}.`;
  return (
    <figure className="gh-figure">
      <figcaption>Forecast, 7-day totals with {coverage}% intervals</figcaption>
      <Chart height={H} label={summary}>
        {(w) => {
          const band = (w - MARGIN.left - MARGIN.right) / Math.max(1, count);
          const cx = (i: number) => MARGIN.left + band * (i + 0.5);
          const y = linear(0, max, H - MARGIN.bottom, MARGIN.top);
          const split = MARGIN.left + band * blocks.length;
          const every = Math.max(1, Math.ceil(52 / band));
          const labels = [...blocks.map((b) => b.start), ...weeks.map((wk) => wk.start)];
          return (
            <>
              <YGrid ticks={niceTicks(0, max, 3)} y={y} x0={MARGIN.left} x1={w - MARGIN.right} />
              {blocks.map((b, i) => (
                <rect key={b.start} className="gh-bar" x={cx(i) - band * 0.32} width={band * 0.64} y={y(b.total)} height={Math.max(0, y(0) - y(b.total))} />
              ))}
              <line className="gh-ref gh-ref--split" x1={split} x2={split} y1={MARGIN.top} y2={H - MARGIN.bottom} />
              {weeks.map((wk, j) => {
                const i = blocks.length + j;
                return (
                  <g key={wk.start}>
                    <rect className="gh-bar gh-bar--forecast" x={cx(i) - band * 0.32} width={band * 0.64} y={y(wk.expected)} height={Math.max(0, y(0) - y(wk.expected))} />
                    <line className="gh-whisker" x1={cx(i)} x2={cx(i)} y1={y(wk.low)} y2={y(wk.high)} />
                    <line className="gh-whisker" x1={cx(i) - 5} x2={cx(i) + 5} y1={y(wk.high)} y2={y(wk.high)} />
                    <line className="gh-whisker" x1={cx(i) - 5} x2={cx(i) + 5} y1={y(wk.low)} y2={y(wk.low)} />
                  </g>
                );
              })}
              <XLabels ticks={labels.map((label, i) => ({ x: cx(i), label: i % every === 0 ? fmtShortDate(label) : "" })).filter((t) => t.label)} y={H - 6} />
              <text className="gh-chart__note" x={split + 4} y={MARGIN.top + 8}>forecast</text>
            </>
          );
        }}
      </Chart>
      <Legend
        items={[
          { label: "Actual", className: "gh-bar", shape: "box" },
          { label: "Expected", className: "gh-bar--forecast", shape: "box" },
          { label: `${coverage}% interval`, className: "gh-whisker" }
        ]}
      />
    </figure>
  );
}

function trainingCaveats(insights: GitHubInsights, r: TrainingResult) {
  const items = [
    `Validation covers ${plural(r.split.validDays, "day")}, ${r.split.validActiveDays} of them active. One large day can move the MAE noticeably.`
  ];
  if (r.referenceZeroMae <= r.model.mae) {
    items.push(`On sparse data MAE favors predicting 0 (always-0 scores ${fmtNum(r.referenceZeroMae)}). That is why the AUC, log loss and weekly totals are reported too.`);
  }
  const bt = r.backtestSummary;
  items.push(
    bt.modelMae < bt.baselineMae
      ? `The backtest covers only ${plural(bt.weeks, "week")}; a win over that many weeks is suggestive, not conclusive.`
      : `The model loses the weekly backtest, so its small daily edge on one validation window does not carry over to weekly totals. Treat the forecast as a rough range, not a prediction.`
  );
  const anyZero = r.forecastWeeks.some((w) => w.low === 0);
  items.push(
    `Forecast intervals come from ${fmtInt(r.forecastMethod.simulations)} simulations that feed simulated days back into the lag features and resample training residuals (daily counts capped at ${fmtInt(r.forecastMethod.countCap)}). They assume the coming weeks look like the past.${anyZero ? " A lower bound of 0 means a fully quiet week is plausible." : ""}`
  );
  items.push("Weights are on standardized features, and the lag and rolling-mean features are correlated, so read them as how this fit uses each feature, not as causes.");
  if (insights.source === "rest-events") {
    items.push("This profile comes from public events: about 90 days, one count per event (a push counts once however many commits it holds), so the training window is short.");
  }
  if (insights.days.length && r.split.validTo !== insights.days[insights.days.length - 1].date) {
    items.push(`Validation ends ${fmtDate(r.split.validTo)}, before the last day of data.`);
  }
  return items;
}
