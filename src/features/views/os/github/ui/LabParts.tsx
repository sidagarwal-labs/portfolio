import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

export function LabSection({ title, children, className }: { title: "Method" | "Results" | "Caveats" | string; children: ReactNode; className?: string }) {
  return (
    <section className={`gh-lab__section${className ? ` ${className}` : ""}`} aria-label={title}>
      <h4>{title}</h4>
      {children}
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
