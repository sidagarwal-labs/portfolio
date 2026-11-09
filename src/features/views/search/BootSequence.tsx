import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FileText, Folder, Globe, Lock, MousePointer2, Search } from "lucide-react";

type Stage = "power" | "post" | "os" | "desktop" | "browser" | "search" | "expand";

const timeline: [Stage | "done", number][] = [
  ["post", 450],
  ["os", 1500],
  ["desktop", 2200],
  ["browser", 2950],
  ["search", 3600],
  ["expand", 4300],
  ["done", 4800]
];
const osTimeline: [Stage | "done", number][] = [["post", 450], ["os", 1500], ["done", 2200]];

const postLines = [
  "AGARWAL LABS BIOS",
  "Memory check ............ OK",
  "Mounting /projects ...... OK",
  "Mounting /writing ....... OK",
  "Mounting /bookshelf ..... OK",
  "Network ................. agarwal-labs.com",
  "Starting Lab OS"
];

export const labLogo = `${import.meta.env.BASE_URL}icon-192.png`;

const address = "agarwal-labs.com";
const typedQuery = "Sid Agarwal";

/* Decorative power-on → POST → OS → desktop → browser → search intro. Click, Escape, or the button skips it. */
function BootSequence({ onDone, desktop = true }: { onDone: () => void; desktop?: boolean }) {
  const [stage, setStage] = useState<Stage>("power");
  const skipRef = useRef<HTMLButtonElement>(null);
  const clock = useMemo(() => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()), []);

  useEffect(() => {
    skipRef.current?.focus({ preventScroll: true });
    const timers = (desktop ? timeline : osTimeline).map(([next, at]) => window.setTimeout(() => (next === "done" ? onDone() : setStage(next)), at));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone, desktop]);

  return (
    <div className="se-boot" data-stage={stage} onClick={onDone}>
      <div className="se-boot__screen" aria-hidden="true">
        <div className="se-boot__flash" />

        <pre className="se-boot__post">
          {postLines.map((line, index) => (
            <span key={line} style={{ "--i": index } as CSSProperties}>{line}</span>
          ))}
        </pre>

        <div className="se-boot__os">
          <img src={labLogo} alt="" width="72" height="72" />
          <span>Lab OS</span>
          <span className="se-boot__progress"><i /></span>
        </div>

        {desktop && <div className="se-boot__desktop">
          <ul className="se-boot__icons">
            <li className="se-boot__icon--browser"><span><Globe size={24} strokeWidth={1.6} /></span>Browser</li>
            <li><span><FileText size={24} strokeWidth={1.6} /></span>resume.pdf</li>
            <li><span><Folder size={24} strokeWidth={1.6} /></span>projects</li>
          </ul>
          <MousePointer2 className="se-boot__cursor" size={22} strokeWidth={1.6} />
          <div className="se-boot__taskbar">
            <span><img src={labLogo} alt="" width="20" height="20" />Lab OS</span>
            <span>{clock}</span>
          </div>

          <div className="se-boot__window">
            <div className="se-boot__window-bar">
              <span className="se-chrome__dots"><i /><i /><i /></span>
              <span className="se-boot__address">
                <Lock size={12} strokeWidth={2} />
                <span className="se-boot__typed" style={{ "--n": address.length } as CSSProperties}>{address}</span>
              </span>
            </div>
            <div className="se-boot__home">
              <span className="se-boot__logo"><img src={labLogo} alt="" width="44" height="44" /><span>sid</span> search</span>
              <span className="se-boot__query">
                <Search size={17} strokeWidth={2} />
                <span className="se-boot__typed" style={{ "--n": typedQuery.length } as CSSProperties}>{typedQuery}</span>
              </span>
            </div>
          </div>
        </div>}
      </div>

      <button
        ref={skipRef}
        type="button"
        className="se-boot__skip"
        onClick={(event) => {
          event.stopPropagation();
          onDone();
        }}
      >
        Skip intro
      </button>
    </div>
  );
}

export default BootSequence;
