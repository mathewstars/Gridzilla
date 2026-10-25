// Proof: a titled stat band. The heading and one sub line say where the numbers come from (the Vienna fleet), then three
// big Clash Display numbers that count up once as they come into view (ui/Ticker), each with a bold label above it on
// the number's left edge and its explanation under it; no cards and no lines between them, then the footnote. The
// 36 % carries the accent: it is the one green number. Numbers from the team's submission, labels from the owner's
// round 2 (data/gz-site/round2.md item 2). Three equal columns across the content width from 768, each centred (round
// 4), one column on the phone. The owner took out the fourth number (0 kW) on 25 Oct.
import { Intro, Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { Ticker } from "../ui/Ticker";
import "../styles/proof-plant.css";

export const PROOF = [
  { label: "One street", value: 36, unit: "%", line: "One street off its evening peak (511 to 325 kW).", accent: true },
  { label: "All of Vienna", value: 5, unit: "MW", line: "Vienna with 2,000 enrolled houses (31.2 to 26.2 MW, 16\u00a0%)." },
  { label: "Houses in the programme", value: 2176, unit: "", line: "Programme houses on 72 transformers across Vienna (271 simulated households, each standing for eight)." },
];

export default function Proof() {
  return (
    <Section id="proof">
      <Reveal>
        <Title className="max-w-[20ch]">Measured tonight on the Vienna fleet.</Title>
        <Intro>
          Two thousand simulated houses on 72 transformers, following the real weather. The same houses with no signal give the without curve.
        </Intro>
      </Reveal>
      <ul className="m-0 mt-12 grid list-none grid-cols-1 gap-y-12 p-0 text-center md:grid-cols-3 md:gap-x-10 lg:gap-x-14">
        {PROOF.map((p, i) => (
          <Reveal as="li" key={p.label} delay={i * 0.08} className="min-w-0">
            <h3 className="m-0 text-[15px] font-semibold leading-[1.3] text-ink md:text-[17px]">{p.label}</h3>
            <p
              className={`m-0 mt-3 whitespace-nowrap font-display text-[clamp(44px,5.6vw,96px)] font-semibold leading-none tracking-[-0.03em] md:mt-4 ${p.accent ? "text-accent-text" : "text-ink"}`}
            >
              <Ticker value={p.value} />
              {p.unit && <span className="proof-unit font-medium">{" "}{p.unit}</span>}
            </p>
            <p className="mx-auto mb-0 mt-4 max-w-[30ch] text-[15px] leading-[1.45] text-secondary md:mt-5 md:text-[17px]">{p.line}</p>
          </Reveal>
        ))}
      </ul>
      <Reveal delay={0.2}>
        <p className="mx-auto mb-0 mt-12 max-w-[60ch] text-center text-[15px] leading-[1.5] text-secondary">
          Measured on the simulated fleet tonight. The without curve is the same houses, same cars, same weather, no signal.
        </p>
      </Reveal>
    </Section>
  );
}
