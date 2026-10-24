import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import StageA from "./stage/StageA";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StageA />
  </StrictMode>,
);
