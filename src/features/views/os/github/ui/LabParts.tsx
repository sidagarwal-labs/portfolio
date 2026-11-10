import { useId, useState, type ReactNode } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";

/** Method and Caveats start folded so each lab leads with its charts; pass `foldable` to override. */
export function LabSection({ title, children, className, foldable }: { title: "Method" | "Results" | "Caveats" | string; children: ReactNode; className?: string; foldable?: boolean }) {
  const canFold = foldable ?? (title === "Method" || title === "Caveats");
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const classes = `gh-lab__section${canFold ? " gh-lab__section--fold" : ""}${className ? ` ${className}` : ""}`;
  if (!canFold) {
    return (
      <section className={classes} aria-label={title}>
        <h4>{title}</h4>
        {children}
      </section>
    );
  }
  return (
    <section className={classes} aria-label={title} data-open={open}>
      <div className="gh-lab__fold-head">
        <h4>{title}</h4>
        <button type="button" className="gh-link-button gh-lab__fold" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
          {open ? "Hide details" : "Show details"}
          <span className="sr-only"> for {title}</span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="gh-lab__fold-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** Shown instead of a model when it refuses the data (or fails); never a crash. */
export function Guard({ title, reason, method }: { title: string; reason: string; method?: ReactNode }) {
  return (
    <div className="gh-lab">
      {method && <LabSection title="Method">{method}</LabSection>}
      <div className="gh-guard" role="note">
        <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
        <div>
          <p className="gh-guard__title">{title}</p>
          <p>{reason}</p>
        </div>
      </div>
    </div>
  );
}

export type MetricItem = { id: string; label: string; value: string; note?: string; tone?: "good" | "bad" | "neutral" };

export function Metrics({ items }: { items: MetricItem[] }) {
  return (
    <dl className="gh-metrics">
      {items.map((item) => (
        <div key={item.id} className={`gh-metric${item.tone ? ` gh-metric--${item.tone}` : ""}`} data-metric={item.id}>
          <dt>{item.label}</dt>
          <dd className="gh-metric__value">{item.value}</dd>
          {item.note && <dd className="gh-metric__note">{item.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Caveats({ items }: { items: string[] }) {
  return (
    <ul className="gh-caveats">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
