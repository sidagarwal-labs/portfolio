import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { GitHubInsights } from "../contract";
import { LaunchLab } from "./LaunchLab";
import { MarketLab } from "./MarketLab";
import { RepoLabPanel } from "./RepoLabPanel";
import { TrainingLab } from "./TrainingLab";

const TABS = [
  { id: "training", label: "Training run", blurb: "A hurdle model learns to predict daily activity, epoch by epoch." },
  { id: "market", label: "Market", blurb: "Activity as a price index, with indicators and two statistical tests." },
  { id: "launch", label: "Launch", blurb: "Change-point detection splits the year into stages." },
  { id: "repos", label: "Data science lab", blurb: "Repositories clustered with k-means and projected with PCA." }
] as const;

type TabId = (typeof TABS)[number]["id"];

/** ARIA tabs; each lab mounts (and computes) the first time its tab opens, then stays mounted. */
export function Labs({ insights, unit }: { insights: GitHubInsights; unit: string }) {
  const baseId = useId();
  const [active, setActive] = useState<TabId>("training");
  const [opened, setOpened] = useState<Set<TabId>>(() => new Set<TabId>(["training"]));
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: TabId, focus = false) => {
    setActive(id);
    setOpened((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    if (focus) tabRefs.current[id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(TABS[next].id, true);
  };

  return (
    <section className="gh-labs" aria-labelledby={`${baseId}-heading`}>
      <div className="gh-labs__head">
        <h3 id={`${baseId}-heading`}>Labs</h3>
        <p className="gh-muted">Four models run in your browser on the data above. Each shows its method, results and where it falls short.</p>
      </div>
      <div className="gh-tabs" role="tablist" aria-label="Labs" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            className="gh-tab"
            aria-selected={active === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => select(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          className="gh-panel"
          data-lab={tab.id}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={active !== tab.id}
          tabIndex={0}
        >
          <p className="gh-panel__blurb">{tab.blurb}</p>
          {opened.has(tab.id) && (
            <>
              {tab.id === "training" && <TrainingLab insights={insights} unit={unit} />}
              {tab.id === "market" && <MarketLab insights={insights} unit={unit} />}
              {tab.id === "launch" && <LaunchLab insights={insights} unit={unit} />}
              {tab.id === "repos" && <RepoLabPanel insights={insights} />}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
