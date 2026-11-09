import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

function RouteScrollReset() {
  const location = useLocation();
  /* In-page controls (such as tabs mirrored into the query string) keep the reader's place. */
  const keepScroll = Boolean((location.state as { keepScroll?: boolean } | null)?.keepScroll);

  useLayoutEffect(() => {
    if (keepScroll) return;
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "auto", block: "start" });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname, location.hash, location.key, keepScroll]);

  return null;
}

export default RouteScrollReset;