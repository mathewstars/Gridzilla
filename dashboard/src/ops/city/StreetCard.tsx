// The selected transformer's street in 3D as a small fixed-aspect card (16:9, never taller than 240 px).
import type { State, Weather, WeatherFeed } from "../../api";
import { nice } from "../../model";
import { StreetScene } from "../../components/street/StreetScene";

export default function StreetCard({ s, weather, feeder, tf }: { s: State; weather: Weather | WeatherFeed | null; feeder: string; tf: string }) {
  const houses = Object.values(s.households ?? {}).filter((h) => h.tf === tf);
  const n = (hs: typeof houses) => hs.reduce((a, h) => a + (h.represents || 1), 0);
  const total = n(houses);
  const following = n(houses.filter((h) => h.ack?.status === "applied" || h.telemetry?.shape));
  return (
    <div className="panel cs">
      <header className="cs-head">
        <h2 className="cg-title">The street</h2>
        <span className="cc-where num">
          {nice(tf)} · {total ? `${following} of ${total} houses following Gridzilla` : "houses loading"}
        </span>
      </header>
      <div className="cs-box">
        <StreetScene s={s} weather={weather} feeder={feeder} tf={tf} interactive across />
      </div>
    </div>
  );
}
