// The deck's moving light, exactly as dashboard/src/pitch/shell/Backdrop.tsx sets it for the dark theme: Paper Shaders'
// Mesh Gradient (21st.dev @paper-design, bg/mesh-gradient.tsx, unchanged), green and teal on near-black, speed 0.4.
// Its own chunk: ui/Backdrop.tsx imports this file lazily after first paint.
import { ShaderBackground, setPalette } from "./mesh-gradient";

export const DARK = ["#040706", "#0b5d3d", "#0f8f7f", "#06261c"];
export const SPEED = 0.4;

setPalette([...DARK], false, SPEED);

export default function MeshLight({ className }: { className?: string }) {
  return <ShaderBackground className={className} />;
}
