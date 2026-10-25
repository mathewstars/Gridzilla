// The closing frame: the hero's gradient turned upside down so the page is bookended, the ask in big type, one pill
// to write to the team, and the small print with the four links again.
import { EnvelopeSimple } from "@phosphor-icons/react";
import { PillLink } from "../ui/Button";
import { Reveal } from "../ui/Reveal";
import { LINKS } from "../lib/links";

const SMALL = [
  { label: "Console", href: LINKS.console },
  { label: "Deck", href: LINKS.deck },
  { label: "Protocol", href: LINKS.protocol },
  { label: "GitHub", href: LINKS.repo },
];

export default function Footer() {
  return (
    <footer className="p-[var(--frame-inset)] pt-0">
      <div className="closing-frame relative overflow-hidden rounded-[var(--radius-frame)] px-6 pb-8 pt-20 md:px-12 md:pt-28 lg:px-16 lg:pb-10 lg:pt-36">
        <div className="grid items-end gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-9">
            <h2 className="t-display m-0 max-w-[16ch] text-[clamp(36px,5.4vw,104px)]">We are looking for one street transformer to pilot this winter.</h2>
          </Reveal>
          <Reveal className="lg:col-span-3 lg:flex lg:justify-end" delay={0.1}>
            <PillLink href={LINKS.mail} size="lg" badge={<EnvelopeSimple size={18} weight="bold" />}>
              Talk to the team
            </PillLink>
          </Reveal>
        </div>
        <div className="mt-20 flex flex-col gap-4 text-[14px] text-secondary md:mt-28 md:flex-row md:items-center md:justify-between lg:mt-36">
          <p className="m-0">Gridzilla, 2026</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-7 gap-y-2 p-0">
            {SMALL.map((l) => (
              <li key={l.label}>
                <a href={l.href} target="_blank" rel="noopener" className="t-link text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
