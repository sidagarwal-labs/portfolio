import { ArrowLeft, ExternalLink } from "lucide-react";
import type { StrayFrame } from "../features/views/os/embed";
import "./framed-notice.css";

/* Shown instead of the site when it loads in a frame that isn't a Lab OS window (see strayFrame in embed.ts). */
export default function FramedNotice({ context }: { context: StrayFrame }) {
  const canGoBack = window.history.length > 1;
  const href = window.location.href;

  return (
    <main className="framed-notice" aria-labelledby="framed-notice-title">
      <div className="framed-notice__card">
        <h1 id="framed-notice-title">{context === "self" ? "You're already on Agarwal Labs" : "Agarwal Labs opens in its own tab"}</h1>
        <p>
          {context === "self"
            ? "This link led back to the site that's already open around this window, so it isn't opened again here."
            : "This site can't run inside another page. Open it in a new tab to continue."}
        </p>
        <div className="framed-notice__actions">
          {context === "self" && canGoBack && (
            <button type="button" className="framed-notice__button" onClick={() => window.history.back()}>
              <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
              Go back
            </button>
          )}
          <a className="framed-notice__button framed-notice__button--primary" href={href} target="_blank" rel="noopener">
            {context === "self" ? "Open this page in a new tab" : "Open Agarwal Labs"}
            <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </div>
    </main>
  );
}
