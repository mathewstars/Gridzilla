// Slide 1 placeholder: replaced by its builder (see PITCH.md).
import type { SlideProps } from "../types";

export default function Slide1(_: SlideProps) {
  return (
    <div className="p-slide" data-slide="1">
      <div className="p-head" style={{ position: "absolute", left: 120, top: 96 }}>Slide 1</div>
    </div>
  );
}
