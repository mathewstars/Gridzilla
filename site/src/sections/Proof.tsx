// STUB (helper B): proof. A stat band, four big Clash Display numbers ticking up once (ui/Ticker), one line each, one
// number can carry the accent. Numbers from the submission. Spec section 6.
import { Section } from "../ui/Section";

export const PROOF = [
  { value: 36, unit: "%", line: "one street off its evening peak (511 to 325 kW)" },
  { value: 5, unit: "MW", line: "Vienna with 2,000 enrolled houses (31.2 to 26.2 MW, 16 %)" },
  { value: 2176, unit: "", line: "programme houses on 72 transformers across Vienna (271 simulated households, each standing for eight)" },
  { value: 0, unit: "kW", line: "a street where no car charged that night, which is the honest answer" },
];

export default function Proof() {
  return (
    <Section id="proof">
      <h2 className="sr-only">Proof</h2>
      <ul className="grid list-none gap-10 p-0 md:grid-cols-4">
        {PROOF.map((p) => (
          <li key={p.line}>
            <div className="t-display t-num text-[56px]">
              {p.value.toLocaleString("en-US")}
              {p.unit && ` ${p.unit}`}
            </div>
            <p className="mt-3 text-secondary">{p.line}</p>
          </li>
        ))}
      </ul>
      <p className="mt-12 text-[15px] text-secondary">Measured on the simulated fleet tonight. The without curve is the same houses, same cars, same weather, no signal.</p>
    </Section>
  );
}
