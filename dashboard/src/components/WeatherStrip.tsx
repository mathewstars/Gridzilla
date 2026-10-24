// STUB: replaced by the WeatherStrip builder.
import type { State, WeatherFeed } from "../api";
export default function WeatherStrip(_: { s: State; weather: WeatherFeed }) {
  return <div className="panel h-full p-4">Weather</div>;
}
export function WarningBanner(_: { weather: WeatherFeed }) {
  return null;
}
