import { Navigate, Route, Routes } from "react-router-dom";
import RouteScrollReset from "./RouteScrollReset";
import HomePage from "../features/home/JournalHomePage";
import LiveTicker from "../features/home/LiveTicker";
import ArticlePage from "../features/writing/ArticlePage";

function App() {
  return (
    <>
      <RouteScrollReset />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/writing/:slug" element={<ArticlePage />} />
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
      <LiveTicker />
    </>
  );
}

export default App;