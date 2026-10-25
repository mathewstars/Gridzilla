// The deck's slide 6 frame (pitch-ops.html): the console's Operations view alone, loaded by Slide5.tsx in an iframe of
// exactly 1920x1080 CSS px that the slide scales by transform. Inside the iframe the window IS 1920x1080, so every media
// query, vh and vw in the console's CSS sees the deck's design frame and the wide two-column layout holds on any
// screen (a Retina MacBook's 1280-1500 CSS px window collapsed it to one column when it was embedded directly).
// The parent's query string is passed through, so ?api= read-only mode and ?theme= work here too; the slide mirrors
// the deck's theme into this document. Keys pressed in here (after a click on a chip) go on to the deck.
import "./liveMode";
import { createRoot } from "react-dom/client";
import OperationsView from "../ops/ops2/OperationsView";
import { useOps } from "../ops/useOps";
import { applyTheme, initialTheme } from "../ops/theme";
import "../index.css";

applyTheme(initialTheme());

addEventListener(
  "keydown",
  (e) => {
    if (e.metaKey || e.ctrlKey || window.parent === window) return;
    const fwd = new KeyboardEvent("keydown", { key: e.key, code: e.code, shiftKey: e.shiftKey, altKey: e.altKey, bubbles: true, cancelable: true });
    window.parent.document.dispatchEvent(fwd);
    if (fwd.defaultPrevented) e.preventDefault();
  },
  true,
);

function OpsLive() {
  const ops = useOps();
  return ops.s ? <OperationsView ops={ops} /> : <div style={{ display: "grid", placeItems: "center", height: "100%" }}>Connecting to the grid.</div>;
}

const root = document.getElementById("root") as HTMLElement;
root.style.cssText = "height:100vh;overflow:hidden;background:var(--color-ground)";
document.body.style.margin = "0";
createRoot(root).render(<OpsLive />);
