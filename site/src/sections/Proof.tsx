// Proof: a stat band. Four big Clash Display numbers that count up once as they come into view (ui/Ticker), one line
// of words under each, no cards and no lines between them, then the footnote. The 36 % carries the accent: it is the
// one green number (owner's dark change order). Numbers from the team's submission,
// spec section 6. Four across from 1280, two by two from 768, one column on the phone.
import { Section } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { Ticker } from "../ui/Ticker";
import "../styles/proof-plant.css";

export const PROOF = [
  { value: 36, unit: "%", line: "One street off its evening peak (511 to 325 kW).", accent: true },
  { value: 5, unit: "MW", line: "Vienna with 2,000 enrolled houses (31.2 to 26.2 MW, 16 %)." },
  { value: 2176, unit: "", line: "Programme houses on 72 transformers across Vienna (271 simulated households, each standing for eight)." },
  { value: 0, unit: "kW", line: "A street where no car charged that night, which is the honest answer." },
];

export default function Proof() {
  return (
    <Section id="proof">
      <h2 className="sr-only">Proof</h2>
      <ul className="m-0 grid list-none gap-x-12 gap-y-12 p-0 md:grid-cols-2 md:gap-y-20 xl:grid-cols-4 xl:gap-x-10">
        {PROOF.map((p, i) => (
          <Reveal as="li" key={p.line} delay={i * 0.08} className="min-w-0">
            <p className={`proof-num m-0 whitespace-nowrap font-display font-semibold ${p.accent ? "text-accent-text" : "text-ink"}`}>
              <span className="relative inline-block">
                <Ticker value={p.value} />
                {p.unit && <span className="proof-unit font-medium">{"\u2009"}{p.unit}</span>}
              </span>
            </p>
            <p className="mb-0 mt-5 max-w-[30ch] text-[17px] leading-[1.45] text-secondary md:mt-6">{p.line}</p>
          </Reveal>
        ))}
      </ul>
      <Reveal delay={0.2}>
        <p className="mb-0 mt-16 max-w-[62ch] text-[15px] leading-[1.5] text-secondary md:mt-24">
          Measured on the simulated fleet tonight. The without curve is the same houses, same cars, same weather, no signal.
        </p>
      </Reveal>
    </Section>
  );
}
