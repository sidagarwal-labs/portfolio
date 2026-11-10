import { useLayoutEffect, useRef } from "react";
import { useLocation, type Location } from "react-router-dom";
import { isReplaceState } from "../features/views/os/embed";

/* The home page's views (Journal, Sid Search, Lab OS, …) share "/" and differ only by ?view=, so the view is part of
   the page. Other query parameters (a Markets ticker, a Leaderboards tab) are in-page state. */
const pageOf = (location: Location) => `${location.pathname}?view=${new URLSearchParams(location.search).get("view") ?? ""}`;

function RouteScrollReset() {
  const location = useLocation();
  const previous = useRef<Location>();

  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = location;
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }
    /* In-page controls mirrored into the query string keep the reader's place, even when they re-select the
       current state (such as picking the Markets company that's already previewed). */
    if (last && pageOf(last) === pageOf(location) && (last.search !== location.search || isReplaceState(location.state))) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  return null;
}

export default RouteScrollReset;