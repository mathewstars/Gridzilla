// STUB (helper B): the real plant. Split: a live tile on the left (src/lib/live.ts, GET /live-api/state every 30 s,
// quiet fallback), the words on the right. Spec section 7.
import { Section, Title } from "../ui/Section";

export default function RealPlant() {
  return (
    <Section id="plant">
      <Title className="max-w-[18ch]">Two real devices, one house in Blatnica, Slovakia.</Title>
      <p className="t-lead mt-8 max-w-[56ch] text-secondary">
        A Victron plant (Cerbo GX, MultiPlus-II, battery, EV Charging Station) and a Viessmann Vitocal heat pump through the ViCare cloud. A signed message goes out over a public broker, the battery and the heat pump move, signed acks come back.
      </p>
      <p className="mt-8 text-[15px] text-secondary">The battery sat at 20 % during the hackathon, so live demos leaned on the heat pump and the car charger.</p>
    </Section>
  );
}
