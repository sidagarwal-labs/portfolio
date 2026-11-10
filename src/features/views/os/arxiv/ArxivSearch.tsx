import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { arxivSearchOrigin } from "../../../../content/arxivSearch";
import { apps } from "../apps";
import type { OsActions, OsTarget } from "../types";
import { LivePanel } from "./LivePanel";
import { Overview } from "./Overview";
import "./arxiv.css";

const def = apps.arxiv;
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Try it live" }
] as const;

type TabId = (typeof tabs)[number]["id"];

/* A routed link's page on the live site. The home page opens the overview; any other page opens in Try it live. */
function livePath(value: string | undefined): string | null {
  if (!value || value === "/") return null;
  try {
    const url = new URL(value, arxivSearchOrigin);
    if (url.origin !== arxivSearchOrigin) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path === "/" ? null : path;
  } catch {
    return null;
  }
}

export default function ArxivSearch({ target, actions }: { target?: OsTarget; actions: OsActions }) {
  const baseId = useId();
  const initial = livePath(target?.value);
  const [active, setActive] = useState<TabId>(initial ? "live" : "overview");
  const [path, setPath] = useState(initial ?? "/");
  /* The frame loads the first time Try it live opens, then stays mounted so switching tabs keeps the session. */
  const [liveOpened, setLiveOpened] = useState(Boolean(initial));
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const select = (id: TabId, focus = false) => {
    setActive(id);
    if (id === "live") setLiveOpened(true);
    if (focus) tabRefs.current[id]?.focus();
  };

  useEffect(() => {
    if (!target) return;
    const next = livePath(target.value);
    if (next) setPath(next);
    setActive(next ? "live" : "overview");
    if (next) setLiveOpened(true);
  }, [target]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(tabs[next].id, true);
  };

  const Icon = def.icon;
  return (
    <div className="ax">
      <header className="ax-head">
        <span className="ax-head__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
        <div className="ax-head__id">
          <p className="ax-head__name">{def.title}</p>
          <p className="ax-head__sub">Hybrid retrieval and LLM reranking for arXiv papers</p>
        </div>
        <div className="ax-tabs" role="tablist" aria-label="arXiv Search" onKeyDown={onKeyDown}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              className="ax-tab"
              aria-selected={active === tab.id}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => select(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>
      <div
        role="tabpanel"
        id={`${baseId}-panel-overview`}
        className="ax-panel ax-scroll"
        aria-labelledby={`${baseId}-tab-overview`}
        hidden={active !== "overview"}
        tabIndex={0}
      >
        <Overview actions={actions} onTryLive={() => select("live", true)} />
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-live`}
        className="ax-panel ax-panel--live"
        aria-labelledby={`${baseId}-tab-live`}
        hidden={active !== "live"}
      >
        {liveOpened && <LivePanel path={path} />}
      </div>
    </div>
  );
}
