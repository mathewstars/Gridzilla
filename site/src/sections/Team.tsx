// Team + links (spec section 10): the three people in a row, each with their real GitHub avatar, name, role and
// handle (the handle links to the profile); under them, straight on the page ground (no tile, owner round 4), the
// four pills centred in a row and the hackathon line centred under them. Colours come from the tokens only (the page theme decides them). Phone: one column, the pills full width.
// On a phone each person is a compact row (avatar left, the words beside it). People rise in once, 80 ms apart; under
// reduced motion they are there.
import { GithubLogo } from "@phosphor-icons/react";
import { Section, Title } from "../ui/Section";
import { PillLink } from "../ui/Button";
import { Reveal } from "../ui/Reveal";
import { LINKS } from "../lib/links";

export const PEOPLE = [
  { name: "Matej Stafurik", org: "victronlab.sk / Coderama", handle: "mathewstars", role: "Lead: protocol, real-device integration (Victron, Viessmann), infrastructure" },
  { name: "Peter Mikeska", org: "", handle: "petermikeska67", role: "Cybersecurity and complete security overhaul; platform, policy guard, tests." },
  { name: "Matthew Stafurik", org: "", handle: "matixacik-cell", role: "Fallback checks and security checks, tests and fallback systems; dashboard, demo mode, pitch deck and trailer." },
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

      <ul className="m-0 mt-6 md:mt-12 grid list-none grid-cols-1 gap-7 p-0 text-center md:grid-cols-3 md:gap-8 lg:gap-14">
        {PEOPLE.map((p, i) => (
          <Reveal as="li" key={p.handle} delay={i * 0.08} className="group flex flex-col items-center max-md:grid max-md:grid-cols-[56px_1fr] max-md:items-start max-md:gap-x-4 max-md:text-left">
            <img
              src={`https://github.com/${p.handle}.png?size=192`}
              width={96}
              height={96}
              alt={p.name}
              loading="lazy"
              decoding="async"
              className="block size-14 rounded-full max-md:row-span-4 md:size-24 bg-fill object-cover shadow-[0_0_0_1px_var(--color-hairline),var(--shadow-card)] transition-[translate,box-shadow] duration-[350ms] ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5 group-hover:shadow-[0_0_0_1px_var(--color-hairline),var(--shadow-lift)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
            />
            <h3 className="m-0 text-[19px] max-md:col-start-2 md:mt-7 md:text-[21px] font-semibold leading-tight tracking-[-0.015em] lg:text-[22px]">{p.name}</h3>
            {p.org && <p className="m-0 mt-1 text-[15px] text-secondary max-md:col-start-2">{p.org}</p>}
            <p className="mx-auto mb-0 mt-3 max-w-[32ch] text-[16px] leading-[1.5] text-secondary max-md:col-start-2 max-md:mx-0 max-md:mt-1">{p.role}</p>
            <a
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-ink no-underline max-md:col-start-2 max-md:mt-0 max-md:justify-self-start"
              href={`https://github.com/${p.handle}`}
              target="_blank"
              rel="noopener"
            >
              <GithubLogo size={18} aria-hidden="true" />
              <span className="t-link">@{p.handle}</span>
            </a>
          </Reveal>
        ))}
      </ul>

      <Reveal className="mt-10 md:mt-12 flex flex-col items-center text-center">
        {/* phone: a 2 x 2 grid of compact pills (one column under 360 px); from 640 a centred row */}
        <div className="team-pills grid w-full grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-center sm:gap-3">
          {TEAM_LINKS.map((l) => (
            <PillLink key={l.label} href={l.href} tone="secondary" className="w-full sm:w-auto">
              {l.label}
            </PillLink>
          ))}
        </div>
        <p className="mx-auto mb-0 mt-6 max-w-[60ch] text-[15px] leading-[1.5] text-secondary">
          Built at the TEB AI Hackathon, Energy Bridge Vienna, <span className="whitespace-nowrap">23 to 25 October 2026</span>. Grid-Serving Storage track.
        </p>
      </Reveal>
    </Section>
  );
}
