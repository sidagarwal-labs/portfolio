import { lazy, Suspense, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import JournalHomePage from "../home/JournalHomePage";
import { useSiteView } from "./SiteViewContext";

const ForwardPassPage = lazy(() => import("./forward/ForwardPassPage"));
const TrainingRunPage = lazy(() => import("./training/TrainingRunPage"));
const TerminalPage = lazy(() => import("./terminal/TerminalPage"));
const SearchPage = lazy(() => import("./search/SearchPage"));
const LabOS = lazy(() => import("./os/LabOS"));

/* Lands on the reader's previous section after a view switch, or on the URL fragment once a lazy view mounts. */
function RestoreAnchor() {
  const { takePendingAnchor } = useSiteView();
  const location = useLocation();

  useLayoutEffect(() => {
    const anchor = takePendingAnchor() ?? location.hash.slice(1);
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "auto", block: "start" });
    // Runs once per mounted view; later fragment changes are handled by RouteScrollReset.
  }, []);

  return null;
}

function HomeViews() {
  const { view } = useSiteView();
  const Page = view === "forward" ? ForwardPassPage
    : view === "training" ? TrainingRunPage
    : view === "terminal" ? TerminalPage
    : view === "search" ? SearchPage
    : view === "os" ? LabOS
    : JournalHomePage;

  return (
    <Suspense fallback={null}>
      <Page />
      <RestoreAnchor key={view} />
    </Suspense>
  );
}

export default HomeViews;
