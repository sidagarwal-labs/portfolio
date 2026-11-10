import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { canonicalMarketsPath } from "../../live/marketsPath";
import { embeddedView, isOsMessage, isReplaceState, isResumeUrl, openInNewTab, osRunsThisBuild, postToOs, replaceHistoryState, routerPath } from "./embed";
import { pageApp, routeLink } from "./linkRoutes";

const embedded = embeddedView !== undefined;

/* Runs inside a Lab OS window. Outside links to books, podcasts, Microsoft pages, Sid's GitHub, and the arXiv Search
   site open in the OS's Library, Reader, GitHub, and arXiv Search apps; other outside sites open in a new tab (most
   refuse to load in frames). The decision is made here, during the click, so the new-tab fallback keeps the user
   gesture popup blockers require. The resume opens in the OS's PDF window, and links to Markets, Launches, or AI
   leaderboards from another page open that app's window. Other in-site links replace the frame's URL instead of
   pushing browser history: frames share the tab's history, so the OS keeps a separate back/forward stack for each
   window. */
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
      if (url.origin !== window.location.origin) {
        const route = routeLink(url.href);
        if (route && osRunsThisBuild()) postToOs({ type: "labos:link", ...route });
        else openInNewTab(url.href);
      } else if (isResumeUrl(url)) postToOs({ type: "labos:open", app: "resume" });
      else {
        const path = routerPath(url);
        const app = pageApp(path);
        if (app && app !== pageApp(routerPath(new URL(window.location.href)))) postToOs({ type: "labos:page", app, path });
        else navigateRef.current(path, { replace: true, state: anchor.dataset.labosHistory === "replace" ? replaceHistoryState : undefined });
      }
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

  /* An old Markets link is reported as the page it redirects to, so the window's address bar and back/forward
     history never hold the old address. */
  const replace = isReplaceState(location.state);
  useEffect(() => postToOs({ type: "labos:location", path: canonicalMarketsPath(path), ...(replace ? { replace } : {}) }), [path, replace]);
}
