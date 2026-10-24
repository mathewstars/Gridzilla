import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import StageB from "./stage/StageB";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StageB />
  </StrictMode>,
);
