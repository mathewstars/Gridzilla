import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import OpsApp from "./ops/OpsApp";

// index.html is the operations console (ops.md); the presentation stage lives at #/present.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OpsApp />
  </StrictMode>,
);
