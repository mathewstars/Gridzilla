// STUB (helper B): security. Grouped list in two columns, five items, no hairline under every row. Spec section 9.
import { Section, Title } from "../ui/Section";

export const SECURITY = [
  "Ed25519 end to end, platform key pinned at the device on first use.",
  "Sequence numbers and short validity windows against replay.",
  "Randomised ramps, so no signal can create a synchronised step.",
  "Owner limits can only tighten the envelope; SUPPORT is the only signal that spends energy and it is capped.",
  "Fail-safe revert when heartbeats stop; homes connect outbound only; acks are honest (“partial”, never “applied” when a write was rejected).",
];

export default function Security() {
  return (
    <Section id="security">
      <Title className="max-w-[20ch]">Designed for an attacker who controls the broker, a vendor cloud or the platform itself.</Title>
      <ul className="mt-12 grid list-none gap-6 p-0 md:grid-cols-2">
        {SECURITY.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="mt-12 max-w-[70ch] text-[15px] text-secondary">
        Residual risk we did not solve: a compromised platform can still issue legitimate-looking, within-policy signals. The guard and the owner limits bound the damage; they do not prevent it.
      </p>
    </Section>
  );
}
