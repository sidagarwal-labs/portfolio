import { useEffect, useRef, useState } from "react";

type Props = {
  /* Widget script name, e.g. "advanced-chart" for embed-widget-advanced-chart.js. */
  widget: string;
  config: Record<string, unknown>;
  height: number;
  /* Visible attribution ("NVDA chart by TradingView"), which TradingView requires. */
  attribution: string;
  href: string;
  label: string;
};

/* TradingView widgets are a script that reads its JSON settings from its own text and swaps itself for an iframe.
   The script and its container are built by hand inside an empty host so React never reconciles TradingView's DOM,
   and nothing loads until the card is near the viewport. */
function TradingViewWidget({ widget, config, height, attribution, href, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"waiting" | "loading" | "ready" | "failed">("waiting");
  const settings = JSON.stringify(config);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let slot: HTMLDivElement | undefined;
    setState("waiting");

    const inject = () => {
      setState("loading");
      slot = document.createElement("div");
      slot.className = "tradingview-widget-container";
      slot.style.width = "100%";
      slot.style.height = "100%";
      const target = document.createElement("div");
      target.className = "tradingview-widget-container__widget";
      target.style.width = "100%";
      target.style.height = "100%";
      const script = document.createElement("script");
      script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`;
      script.async = true;
      script.text = settings;
      script.onload = () => setState("ready");
      script.onerror = () => setState("failed");
      slot.append(target, script);
      element.append(slot);
    };

    if (!("IntersectionObserver" in window)) {
      inject();
      return () => slot?.remove();
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      inject();
    }, { rootMargin: "300px 0px" });
    observer.observe(element);
    return () => {
      observer.disconnect();
      slot?.remove();
    };
  }, [widget, settings]);

  return (
    <div className="tv-widget" data-state={state}>
      <div className="tv-widget__frame" style={{ height }}>
        <div ref={host} className="tv-widget__host" />
        {state !== "ready" && (
          <p className="tv-widget__status" role={state === "failed" ? "alert" : undefined}>
            {state === "failed"
              ? <span>The {label} could not load here. <a href={href} target="_blank" rel="noopener noreferrer">Open it on TradingView</a>.</span>
              : `Loading ${label}...`}
          </p>
        )}
      </div>
      <div className="tradingview-widget-copyright">
        <a href={href} rel="noopener nofollow noreferrer" target="_blank">{attribution}</a> by TradingView
      </div>
    </div>
  );
}

export default TradingViewWidget;
