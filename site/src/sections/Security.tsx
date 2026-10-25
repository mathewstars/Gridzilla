// Security: the lead sentence as the title, then the five items as a 3 + 2 grid of equal columns (the message itself
// on the first row: signatures, replay, ramps; the house's limits and failure on the second), and under them, full
// width, the residual risk we did not solve on a quiet tile. Each item opens with its claim in ink. Two columns on a
// tablet, one on the phone. Words from the spec, section 9.
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import "../styles/proof-plant.css";

export const SECURITY: { lead: string; rest: string }[][] = [
  [
    { lead: "Ed25519 end to end,", rest: " platform key pinned at the device on first use." },
    { lead: "Sequence numbers and short validity windows", rest: " against replay." },
    { lead: "Randomised ramps,", rest: " so no signal can create a synchronised step." },
  ],
  [
    { lead: "Owner limits can only tighten the envelope;", rest: " SUPPORT is the only signal that spends energy and it is capped." },
    { lead: "Fail-safe revert when heartbeats stop;", rest: " homes connect outbound only; acks are honest (“partial”, never “applied” when a write was rejected)." },
  ],
];

const Item = ({ lead, rest }: { lead: string; rest: string }) => (
  <li className="m-0 max-w-[40ch] text-[19px] leading-[1.45] tracking-[-0.014em] text-secondary">
    <span className="font-semibold text-ink">{lead}</span>
    {rest}
  </li>
);

export default function Security() {
  return (
    <Section id="security">
      <Reveal>
        <Title className="sec-lead max-w-[22ch]">Designed for an attacker who controls the broker, a vendor cloud or the platform itself.</Title>
      </Reveal>
      <Reveal>
        <ul className="m-0 mt-12 grid list-none gap-10 p-0 md:mt-16 md:grid-cols-2 md:gap-x-12 lg:grid-cols-3 lg:gap-x-14 lg:gap-y-12">
          {SECURITY.flat().map((s) => <Item key={s.lead} {...s} />)}
        </ul>
      </Reveal>
      <Reveal delay={0.08}>
        <p className="m-0 mt-12 rounded-card bg-ground p-6 text-[17px] leading-[1.5] text-secondary md:mt-16 md:p-8">
          <span className="font-semibold text-ink">Residual risk we did not solve:</span> a compromised platform can still issue legitimate-looking, within-policy signals. The guard and the owner limits bound the damage; they do not prevent it.
        </p>
      </Reveal>
    </Section>
  );
}
