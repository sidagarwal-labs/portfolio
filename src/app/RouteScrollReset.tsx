import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

function RouteScrollReset() {
  const location = useLocation();

  useLayoutEffect(() => {
    const rootElement = document.documentElement;
    const previousScrollBehavior = rootElement.style.scrollBehavior;

    rootElement.style.scrollBehavior = "auto";
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.body.scrollTop = 0;
    rootElement.scrollTop = 0;

    const restoreScrollBehavior = window.requestAnimationFrame(() => {
      rootElement.style.scrollBehavior = previousScrollBehavior;
    });

    return () => {
      window.cancelAnimationFrame(restoreScrollBehavior);
      rootElement.style.scrollBehavior = previousScrollBehavior;
    };
  }, [location.pathname]);

  return null;
}

export default RouteScrollReset;