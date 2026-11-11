import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Lock, RotateCw, Unplug } from "lucide-react";
import { arxivSearchOrigin } from "../../../../content/arxivSearch";
import { isStrayFrameMessage } from "../embed";

/* How long the live site gets to say it is running before the window offers a new tab instead. */
const readyTimeoutMs = 6000;
const readyType = "arxiv-search:ready";
const host = new URL(arxivSearchOrigin).host;

type Phase = "loading" | "ready" | "blocked";

const isReady = (data: unknown) => typeof data === "object" && data !== null && (data as { type?: unknown }).type === readyType;

/* The live site in a frame. It only counts as running once the site posts its ready message, which it sends to
   agarwal-labs.com parents named by the frame's referrer, so the referrer policy must keep the origin. If the
   message never comes (the site is down or slow, or this page runs elsewhere and framing is refused), the frame
   stays covered and a new-tab fallback appears. A late message still reveals the site. */
export function LivePanel({ path }: { path: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [cameBack, setCameBack] = useState(false);
  const src = `${arxivSearchOrigin}${path}`;

  useEffect(() => {
    setPhase("loading");
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.origin === window.location.origin && isStrayFrameMessage(event.data)) putBack();
      else if (event.origin === arxivSearchOrigin && isReady(event.data)) setPhase("ready");
    };
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => setPhase((current) => (current === "ready" ? current : "blocked")), readyTimeoutMs);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [src, attempt]);

  const reload = () => {
    setCameBack(false);
    setAttempt((current) => current + 1);
  };

  /* A link in the live site led back to this site, which is already open around this window, so arXiv Search
     goes back in the frame (issue #92). */
  function putBack() {
    setCameBack(true);
    setPhase("loading");
    setAttempt((current) => current + 1);
  }

  /* Backs up the stray frame's own message: the frame's page can only be read once it is on this site's origin. */
  const checkFrame = () => {
    try {
      const location = frameRef.current?.contentWindow?.location;
      if (location && location.href !== "about:blank" && location.origin === window.location.origin) putBack();
    } catch {
      /* Still on arXiv Search (another origin). */
    }
  };

  const ready = phase === "ready";

  return (
    <div className="ax-live" data-phase={phase}>
      <div className="os-toolbar ax-live__bar">
        <button type="button" className="os-tool" onClick={reload} aria-label="Reload arXiv Search" title="Reload">
          <RotateCw size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="os-address" title={src}>
          <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
          <span className="os-address__text">{host}{path === "/" ? "" : path}</span>
        </div>
        <a className="os-tool os-tool--text" href={src} target="_blank" rel="noreferrer">
          Open in new tab
          <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
        </a>
      </div>
      {cameBack && (
        <p className="ax-live__note" role="status">
          Agarwal Labs is already open, so arXiv Search was put back in this window.
        </p>
      )}
      <div className="ax-live__stage">
        <iframe
          key={`${src}#${attempt}`}
          ref={frameRef}
          className="os-frame ax-live__frame"
          src={src}
          title="arXiv Search live site"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          allow="clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={checkFrame}
          tabIndex={ready ? undefined : -1}
          aria-hidden={ready ? undefined : true}
        />
        {ready && <div className="ax-live__shield" aria-hidden="true" />}
        <div className="ax-live__cover" role="status" hidden={ready}>
          {phase === "loading" && (
            <p className="ax-live__loading">
              <LoaderCircle className="ax-spin" size={16} strokeWidth={2} aria-hidden="true" />
              Connecting to arXiv Search…
            </p>
          )}
          {phase === "blocked" && (
            <div className="ax-fallback">
              <span className="ax-fallback__icon" aria-hidden="true"><Unplug size={22} strokeWidth={1.8} /></span>
              <h3>arXiv Search didn't load in this window</h3>
              <p>The live site didn't respond in time or couldn't be shown here. You can try again, or open it in its own tab.</p>
              <div className="ax-actions">
                <a className="os-button os-button--primary" href={src} target="_blank" rel="noreferrer">
                  Open arXiv Search in a new tab
                  <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                </a>
                <button type="button" className="os-button" onClick={reload}>
                  <RotateCw size={14} strokeWidth={2} aria-hidden="true" />
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
