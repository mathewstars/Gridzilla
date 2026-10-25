// The closing call: full bleed like the hero, the deck's light at nearly full strength so the page ends the way the deck
// looks, the ask in big type, the white pill to write to the team, and the small print with the four links on a glass bar.
import { EnvelopeSimple } from "@phosphor-icons/react";
import { PillLink } from "../ui/Button";
import { Reveal } from "../ui/Reveal";
import { LINKS } from "../lib/links";
import { Container } from "../ui/Section";

const SMALL = [
  { label: "Console", href: LINKS.console },
  { label: "Deck", href: LINKS.deck },
  { label: "Protocol", href: LINKS.protocol },
  { label: "GitHub", href: LINKS.repo },
];

export default function Footer() {
  return (
    <footer className="closing-frame pb-4 pt-14 md:pb-8 md:pt-20 lg:pt-24">
      <Container>
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <h2 className="t-display m-0 mx-auto max-w-[16ch] text-balance text-[clamp(36px,5.4vw,104px)]">We are looking for one street transformer to pilot this winter.</h2>
          </Reveal>
          <Reveal className="mt-8 md:mt-10" delay={0.1}>
            <PillLink href={LINKS.mail} size="lg" badge={<EnvelopeSimple size={18} weight="bold" />}>
              Talk to the team
            </PillLink>
          </Reveal>
        </div>
        <div className="mt-12 flex flex-col gap-4 rounded-[var(--radius-card)] bg-[var(--glass)] px-6 py-3 text-[15px] text-secondary lg:text-[14px] md:flex-row md:items-center md:justify-between lg:mt-24">
          <p className="m-0">Gridzilla, 2026</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-7 p-0">
            {SMALL.map((l) => (
              <li key={l.label}>
                <a href={l.href} target="_blank" rel="noopener" className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink no-underline">
                  <span className="t-link">{l.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
