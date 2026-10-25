// Security: the lead sentence as the title, then five items in two columns grouped with air (no line under each row):
// the message itself on the left (signatures, replay, ramps), the house's limits and failure on the right, and under
// those the residual risk we did not solve, on the quiet tint. Each item opens with its claim in ink. One column on
// the phone. Words from the spec, section 9.
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
      <div className="mt-14 grid gap-10 md:mt-20 md:grid-cols-2 md:gap-x-16 lg:gap-x-24">
        <Reveal>
          <ul className="m-0 grid list-none gap-10 p-0">
            {SECURITY[0].map((s) => <Item key={s.lead} {...s} />)}
          </ul>
        </Reveal>
        <Reveal delay={0.08} className="flex flex-col gap-10">
          <ul className="m-0 grid list-none gap-10 p-0">
            {SECURITY[1].map((s) => <Item key={s.lead} {...s} />)}
          </ul>
          <p className="m-0 max-w-[48ch] rounded-card bg-ground p-7 text-[17px] leading-[1.5] text-secondary md:p-8">
            <span className="font-semibold text-ink">Residual risk we did not solve:</span> a compromised platform can still issue legitimate-looking, within-policy signals. The guard and the owner limits bound the damage; they do not prevent it.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}
