// Slide 5, the live demo: the stage itself, full-bleed, imported from src/stage (never copied).
import Stage from "../../stage/Stage";
import type { SlideProps } from "../types";

export default function Slide5(_: SlideProps) {
  return (
    <div className="p-stage" data-slide="5">
      <Stage />
    </div>
  );
}
