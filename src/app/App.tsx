import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import RouteScrollReset from "./RouteScrollReset";
import LiveTicker from "../features/home/LiveTicker";
import ArticlePage from "../features/writing/ArticlePage";
import RoboticsPage from "../features/robotics/RoboticsPage";
import HomeViews from "../features/views/HomeViews";
import { embeddedView } from "../features/views/os/embed";
import { useFrameBridge } from "../features/views/os/useFrameBridge";
import { SiteViewProvider } from "../features/views/SiteViewContext";
import ViewSwitcher from "../features/views/ViewSwitcher";

/* The live data pages load (with their styles) only when visited. */
const MarketsPage = lazy(() => import("../features/live/MarketsPage"));
const LaunchesPage = lazy(() => import("../features/live/LaunchesPage"));
const LeaderboardsPage = lazy(() => import("../features/live/LeaderboardsPage"));

/* Inside a Lab OS window the OS provides the ticker and the view menu. */
const embedded = embeddedView !== undefined;

function App() {
  const location = useLocation();
  useFrameBridge();

  return (
    <SiteViewProvider>
      <RouteScrollReset />
      <Routes>
        <Route path="/" element={<HomeViews />} />
        <Route path="/writing/:slug" element={<ArticlePage />} />
        <Route path="/robotics" element={<RoboticsPage />} />
        <Route path="/markets" element={<Suspense fallback={null}><MarketsPage /></Suspense>} />
        <Route path="/launches" element={<Suspense fallback={null}><LaunchesPage /></Suspense>} />
        <Route path="/leaderboards" element={<Suspense fallback={null}><LeaderboardsPage /></Suspense>} />
        <Route path="/experience" element={<Navigate to="/#impact" replace />} />
        <Route path="/projects" element={<Navigate to="/#lab" replace />} />
        <Route path="/writing" element={<Navigate to="/#writing" replace />} />
        <Route path="/blog" element={<Navigate to="/#writing" replace />} />
        <Route path="/books" element={<Navigate to="/#library" replace />} />
        <Route path="/reading" element={<Navigate to="/#library" replace />} />
        <Route path="/about" element={<Navigate to="/#impact" replace />} />
        <Route path="/contact" element={<Navigate to="/#contact" replace />} />
        <Route path="/portfolio" element={<Navigate to="/projects" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!embedded && location.pathname === "/" && <ViewSwitcher />}
      {!embedded && <LiveTicker />}
    </SiteViewProvider>
  );
}

export default App;