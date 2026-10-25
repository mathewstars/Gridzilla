// AI: the one full-strength patch of the deck's light on the page (no section scrim; a thin glass panel, 40 px frame,
// keeps the type at 7:1 or better over the brightest teal). The title, then the spec's body read across
// three typographic columns in its own order (Propose, Guard, Sign, with Phosphor Brain, ShieldCheck and Signature),
// not cards, and its last sentence, the fallback, under them. One column on the phone. Spec section 8.
import type { Icon } from "@phosphor-icons/react";
import { Brain, ShieldCheck, Signature } from "@phosphor-icons/react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import "../styles/proof-plant.css";

const STEPS: { name: string; icon: Icon; body: string }[] = [
  {
    name: "Propose",
    icon: Brain,
    body: "Every fifteen grid minutes a DeepSeek model, self-hosted on the team’s own NVIDIA DGX Spark, reads every transformer’s forecast, the real Vienna weather and official warnings, and proposes one signal or none, with a written reason.",
  },
  {
    name: "Guard",
    icon: ShieldCheck,
    body: "A deterministic guard of about thirty lines (window, depth, rate, owner floors, cooldown on real devices) checks it.",
  },
  {
    name: "Sign",
    icon: Signature,
    body: "Only then does the platform sign and send. The operator chooses autonomous, approve each proposal, or off; every decision is logged with its reasoning and the acks it earned.",
  },
];

export default function Ai() {
  return (
    <Section id="ai" light>
      <Reveal>
        <div className="ai-panel rounded-frame px-6 py-14 text-ink md:px-14 md:py-20 lg:px-20 lg:py-24">
          <Title>
            <span className="block">AI proposes.</span> <span className="block">The guard disposes.</span>
          </Title>
          <ol className="m-0 mt-14 grid list-none gap-12 p-0 md:mt-20 md:grid-cols-3 md:gap-10 lg:gap-16">
            {STEPS.map(({ name, icon: I, body }, i) => (
              <Reveal as="li" key={name} delay={0.1 + i * 0.08} className="min-w-0">
                <I size={36} weight="regular" aria-hidden="true" className="block text-accent" />
                <h3 className="m-0 mt-6 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{name}</h3>
                <p className="mb-0 mt-3 text-[17px] leading-[1.5] text-ink">{body}</p>
              </Reveal>
            ))}
          </ol>
          <p className="mb-0 mt-14 max-w-[60ch] text-[15px] leading-[1.5] text-[rgb(245_245_247/0.82)] md:mt-16">
            A rule-based fallback runs through the same guard when the model is slow or down.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
