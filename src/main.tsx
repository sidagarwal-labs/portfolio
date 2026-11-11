import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import FramedNotice from "./app/FramedNotice";
import { strayFrame, strayFrameType } from "./features/views/os/embed";
import "./styles/journal.css";

if (strayFrame === "self") window.top?.postMessage({ type: strayFrameType }, window.location.origin);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {strayFrame ? (
      <FramedNotice context={strayFrame} />
    ) : (
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
);
