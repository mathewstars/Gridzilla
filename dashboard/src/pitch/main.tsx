import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "./pitch.css";
import Deck from "./Deck";
import { applyTheme, initialTheme } from "../ops/theme";

// Dark by default, like the rest of the product (?theme=dark|light wins, then the viewer's last choice); set before the
// first paint so the deck never flashes the other theme.
applyTheme(initialTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck />
  </StrictMode>,
);
