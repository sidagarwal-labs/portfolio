import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

function RouteScrollReset() {
  const location = useLocation();

  useLayoutEffect(() => {
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "auto", block: "start" });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname, location.hash, location.key]);

  return null;
}

export default RouteScrollReset;