// STUB (helper B): AI. One wide panel on dark ground (#1d1d1f, the ONLY dark surface), three typographic columns
// Propose / Guard / Sign with Phosphor Brain, ShieldCheck, Signature. Spec section 8.
import { Section, Title } from "../ui/Section";

export default function Ai() {
  return (
    <Section id="ai">
      <Title>AI proposes. The guard disposes.</Title>
      <p className="mt-8 max-w-[70ch] text-secondary">
        Every fifteen grid minutes a DeepSeek model, self-hosted on the team&rsquo;s own NVIDIA DGX Spark, reads every transformer&rsquo;s forecast, the real Vienna weather and official warnings, and proposes one signal or none, with a written reason. A deterministic guard of about thirty lines (window, depth, rate, owner floors, cooldown on real devices) checks it. Only then does the platform sign and send. The operator chooses autonomous, approve each proposal, or off; every decision is logged with its reasoning and the acks it earned. A rule-based fallback runs through the same guard when the model is slow or down.
      </p>
    </Section>
  );
}
