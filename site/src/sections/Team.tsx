// Team + links (spec section 10): the three people in a row, each with their real GitHub avatar, name, role and
// handle (the handle links to the profile); under them one tinted panel with the four white pills and the hackathon
// line. Phone: one column, the pills full width. People rise in once, 80 ms apart; under reduced motion they are there.
import { GithubLogo } from "@phosphor-icons/react";
import { Section, Title } from "../ui/Section";
import { PillLink } from "../ui/Button";
import { Reveal } from "../ui/Reveal";
import { LINKS } from "../lib/links";

export const PEOPLE = [
  { name: "Matej Stafurik (Mathew)", org: "victronlab.sk / Coderama", handle: "mathewstars", role: "Lead: protocol, real-device integration (Victron, Viessmann), infrastructure" },
  { name: "Peter Mikeska", org: "", handle: "petermikeska67", role: "Platform, policy guard, tests" },
  { name: "Matthew Stafurik", org: "", handle: "matixacik-cell", role: "Dashboard, demo mode, pitch deck and trailer" },
];

// the first two labels are shared intents with the rest of the page: keep them exactly as written
const TEAM_LINKS = [
  { label: "Open the console", href: LINKS.console },
  { label: "Read the protocol", href: LINKS.protocol },
  { label: "Pitch deck", href: LINKS.deck },
  { label: "GitHub", href: LINKS.repo },
];

export default function Team() {
  return (
    <Section id="team">
      <Reveal>
        <Title>The team</Title>
      </Reveal>

      <ul className="m-0 mt-14 grid list-none grid-cols-1 gap-12 p-0 md:mt-20 md:grid-cols-3 md:gap-8 lg:gap-14">
        {PEOPLE.map((p, i) => (
          <Reveal as="li" key={p.handle} delay={i * 0.08} className="group flex flex-col items-start">
            <img
              src={`https://github.com/${p.handle}.png?size=192`}
              width={96}
              height={96}
              alt={p.name}
              loading="lazy"
              decoding="async"
              className="block size-24 rounded-full bg-fill object-cover shadow-[0_0_0_4px_#fff,var(--shadow-card)] transition-[translate,box-shadow] duration-[350ms] ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5 group-hover:shadow-[0_0_0_4px_#fff,var(--shadow-lift)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
            />
            <h3 className="m-0 mt-7 text-[21px] font-semibold leading-tight tracking-[-0.015em] lg:text-[22px]">{p.name}</h3>
            {p.org && <p className="m-0 mt-1 text-[15px] text-secondary">{p.org}</p>}
            <p className="m-0 mt-3 max-w-[32ch] text-[16px] leading-[1.5] text-secondary">{p.role}</p>
            <a
              className="t-link mt-5 inline-flex items-center gap-2 text-[15px] font-medium text-ink"
              href={`https://github.com/${p.handle}`}
              target="_blank"
              rel="noopener"
            >
              <GithubLogo size={18} aria-hidden="true" />
              <span>@{p.handle}</span>
            </a>
          </Reveal>
        ))}
      </ul>

      <Reveal className="mt-16 rounded-[var(--radius-card)] bg-ground p-5 md:mt-24 md:p-8 lg:p-10 xl:flex xl:items-center xl:justify-between xl:gap-10">
        <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap xl:shrink-0">
          {TEAM_LINKS.map((l) => (
            <PillLink key={l.label} href={l.href} tone="light" className="w-full justify-between pl-6 sm:w-auto sm:justify-center sm:pl-[22px]">
              {l.label}
            </PillLink>
          ))}
        </div>
        <p className="m-0 mt-7 max-w-[44ch] text-[15px] leading-[1.5] text-secondary xl:mt-0 xl:min-w-0 xl:text-right">
          Built at the TEB AI Hackathon, Energy Bridge Vienna, <span className="whitespace-nowrap">23 to 25 October 2026</span>. Grid-Serving Storage track.
        </p>
      </Reveal>
    </Section>
  );
}
