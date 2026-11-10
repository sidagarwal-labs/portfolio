import type { CSSProperties } from "react";
import { apps } from "../apps";
import type { OsActions, OsTarget } from "../types";
import { Overview } from "./Overview";
import "./arxiv.css";

const def = apps.arxiv;

export default function ArxivSearch({ actions }: { target?: OsTarget; actions: OsActions }) {
  const Icon = def.icon;
  return (
    <div className="ax">
      <header className="ax-head">
        <span className="ax-head__tile" style={{ "--tint": def.tint } as CSSProperties} aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
        <div className="ax-head__id">
          <p className="ax-head__name">{def.title}</p>
          <p className="ax-head__sub">Hybrid retrieval and LLM reranking for arXiv papers</p>
        </div>
      </header>
      <div className="ax-scroll">
        <Overview actions={actions} />
      </div>
    </div>
  );
}
