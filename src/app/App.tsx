import { Navigate, Route, Routes } from "react-router-dom";
import RouteScrollReset from "./RouteScrollReset";
import HomePage from "../features/home/HomePage";

function App() {
  return (
    <>
      <RouteScrollReset />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/experience" element={<Navigate to="/#impact" replace />} />
        <Route path="/projects" element={<Navigate to="/#lab" replace />} />
        <Route path="/writing" element={<Navigate to="/projects" replace />} />
        <Route path="/blog" element={<Navigate to="/projects" replace />} />
        <Route path="/books" element={<Navigate to="/#library" replace />} />
        <Route path="/contact" element={<Navigate to="/#contact" replace />} />
        <Route path="/portfolio" element={<Navigate to="/projects" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;