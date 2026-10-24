import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Stage from "./stage/Stage";

// index.html shows the ONE stage (design/STAGE.md); StageA stays in the tree for reference and b.html keeps serving B.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Stage />
  </StrictMode>,
);
