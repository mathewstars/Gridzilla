// STUB (helper C): team + links. Three people in a row with real GitHub avatars, name, role, handle; a row of white
// pills under them. Spec section 10.
import { Section, Title } from "../ui/Section";
import { PillLink } from "../ui/Button";
import { LINKS } from "../lib/links";

export const PEOPLE = [
  { name: "Matej Stafurik (Mathew)", org: "victronlab.sk / Coderama", handle: "mathewstars", role: "Lead: protocol, real-device integration (Victron, Viessmann), infrastructure" },
  { name: "Peter Mikeska", org: "", handle: "petermikeska67", role: "Platform, policy guard, tests" },
  { name: "Matthew Stafurik", org: "", handle: "matixacik-cell", role: "Dashboard, demo mode, pitch deck and trailer" },
];

export default function Team() {
  return (
    <Section id="team">
      <Title>The team</Title>
      <ul className="mt-12 grid list-none gap-10 p-0 md:grid-cols-3">
        {PEOPLE.map((p) => (
          <li key={p.handle}>
            <img src={`https://github.com/${p.handle}.png?size=160`} width={80} height={80} alt={p.name} loading="lazy" className="rounded-full" />
            <h3 className="mb-0 mt-4 text-[20px] font-semibold">{p.name}</h3>
            {p.org && <p className="m-0 text-secondary">{p.org}</p>}
            <p className="mt-2 text-secondary">{p.role}</p>
            <a className="t-link" href={`https://github.com/${p.handle}`} target="_blank" rel="noopener">
              @{p.handle}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-12 flex flex-wrap gap-3">
        <PillLink href={LINKS.console} tone="light">Open the console</PillLink>
        <PillLink href={LINKS.protocol} tone="light">Read the protocol</PillLink>
        <PillLink href={LINKS.deck} tone="light">Pitch deck</PillLink>
        <PillLink href={LINKS.repo} tone="light">GitHub</PillLink>
      </div>
      <p className="mt-10 text-[15px] text-secondary">Built at the TEB AI Hackathon, Energy Bridge Vienna, 23 to 25 October 2026. Grid-Serving Storage track.</p>
    </Section>
  );
}
