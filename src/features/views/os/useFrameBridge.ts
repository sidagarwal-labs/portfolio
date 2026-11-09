import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { embeddedView, isOsMessage, isResumeUrl, openInNewTab, postToOs, routerPath } from "./embed";

const embedded = embeddedView !== undefined;

/* Runs inside a Lab OS window. Outside sites open in a new tab (most refuse to load in frames), the resume
   opens in the OS's PDF window, and in-site links replace the frame's URL instead of pushing browser history:
   frames share the tab's history, so the OS keeps a separate back/forward stack for each window. */
export function useFrameBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const path = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    if (!embedded) return;
    document.documentElement.dataset.embedded = "";

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      event.preventDefault();
      if (url.origin !== window.location.origin) openInNewTab(url.href);
      else if (isResumeUrl(url)) postToOs({ type: "labos:open", app: "resume" });
      else navigateRef.current(routerPath(url), { replace: true });
    };
    const onPointerDown = () => postToOs({ type: "labos:focus" });
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin || !isOsMessage(event.data)) return;
      if (event.data.type === "labos:navigate") navigateRef.current(event.data.path, { replace: true });
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => postToOs({ type: "labos:location", path }), [path]);
}
