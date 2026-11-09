import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { embeddedView } from "./os/embed";
import { baseView, defaultView, homeSectionIds, isSiteView, type SiteView } from "./siteViews";

const storageKey = "site-view-v1";

function readStoredView(): SiteView {
  try {
    const stored = localStorage.getItem(storageKey);
    return isSiteView(stored) ? stored : defaultView;
  } catch {
    return defaultView;
  }
}

function writeStoredView(view: SiteView) {
  try {
    localStorage.setItem(storageKey, view);
  } catch {
    return;
  }
}

function sectionInView() {
  if (window.scrollY < 40) return undefined;
  const marker = window.innerHeight * 0.3;
  let current: string | undefined;
  for (const id of homeSectionIds) {
    const element = document.getElementById(id);
    if (element && element.getBoundingClientRect().top <= marker) current = id;
  }
  return current;
}

type SiteViewState = {
  view: SiteView;
  activeView: SiteView;
  setView: (view: SiteView) => void;
  takePendingAnchor: () => string | undefined;
};

const SiteViewContext = createContext<SiteViewState | null>(null);

export function SiteViewProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [storedView, setStoredView] = useState(readStoredView);
  const pendingAnchor = useRef<string>();
  const paramView = new URLSearchParams(location.search).get("view");
  /* An app inside a Lab OS window keeps its own view and never touches the shared stored choice. */
  const view = embeddedView ?? (isSiteView(paramView) ? paramView : storedView);
  const activeView = location.pathname === "/" ? view : baseView;

  useEffect(() => {
    if (!embeddedView && isSiteView(paramView) && paramView !== storedView) {
      setStoredView(paramView);
      writeStoredView(paramView);
    }
  }, [paramView, storedView]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (activeView === baseView) delete root.dataset.view;
    else root.dataset.view = activeView;
  }, [activeView]);

  const setView = useCallback((next: SiteView) => {
    pendingAnchor.current = sectionInView();
    setStoredView(next);
    writeStoredView(next);
    const params = new URLSearchParams(location.search);
    if (next === defaultView) params.delete("view");
    else params.set("view", next);
    const search = params.toString();
    navigate({ pathname: "/", search: search ? `?${search}` : "", hash: "" }, { replace: true });
  }, [location.search, navigate]);

  const takePendingAnchor = useCallback(() => {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = undefined;
    return anchor;
  }, []);

  const value = useMemo(() => ({ view, activeView, setView, takePendingAnchor }), [view, activeView, setView, takePendingAnchor]);

  return <SiteViewContext.Provider value={value}>{children}</SiteViewContext.Provider>;
}

export function useSiteView() {
  const context = useContext(SiteViewContext);
  if (!context) throw new Error("useSiteView must be used inside SiteViewProvider");
  return context;
}
