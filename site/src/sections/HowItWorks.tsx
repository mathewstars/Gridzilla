// How it works: a sticky split (after 21st.dev "Sticky Content Wrapper" by @hyperiux, rebuilt on IntersectionObserver
// instead of GSAP). At 1024 and up the four steps scroll on the left and the step crossing the middle of the screen is
// the active one; on the right a pinned frame crossfades (0.4 s) to its real console screenshot. Below 1024 it is one
// column, each screenshot under its own step. Reduced motion: no crossfade, the swap is instant.
import { useEffect, useRef, useState } from "react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { asset } from "../lib/links";
import "../styles/sections-a.css";

// Screenshots: the live console at gridzilla.victronlab.sk, captured headless at 2x (GET only), cropped to one panel.
export const STEPS: { title: string; body: string; shot: string; w: number; h: number; narrow?: { shot: string; w: number; h: number }; alt: string; caption: string }[] = [
  {
    title: "The operator signs a limit.",
    body: "“This street, next three hours, at most three kilowatts import per house.” Signed with Ed25519, scoped to one segment and one time window.",
    shot: "shots/step-signal.webp",
    w: 960,
    h: 848,
    alt: "The console's signal card: an 85 % forecast on Landstrasse, the choice to use the batteries there, the rule check allowed, and signed message 20557 applied by 40 homes.",
    caption: "The console's signal card: what was seen, chosen, checked and signed.",
  },
  {
    title: "Every house checks it.",
    body: "One agent per home verifies the signature, the sequence and the validity window, then merges the limit with the owner’s own limits. The owner always wins.",
    shot: "shots/step-plan.webp",
    w: 1600,
    h: 711,
    alt: "The diet plan for all of Vienna over the next 24 hours: without Gridzilla the evening heads toward the 30 MVA limit, with the plan it stays flat at the level line, the eaten peak in orange.",
    caption: "The diet plan for all of Vienna, the envelope each house merges with its own limits.",
  },
  {
    title: "The hardware follows, in order.",
    body: "Battery first, then the car, hot water, floor heating. A Node-RED flow on a Victron Cerbo GX, the ViCare API on a Viessmann heat pump, thirty lines of JavaScript in the simulators.",
    shot: "shots/step-plant.webp",
    w: 1572,
    h: 1648,
    alt: "The real plant in Blatnica following a signed signal: at most 2 kW from the grid, the grid power chart under the dashed import limit, battery at 50 %, heat pump at 3 kW.",
    caption: "The real plant in Blatnica, holding a signed 2 kW import limit.",
  },
  {
    title: "A signed answer comes back.",
    body: "Acks are honest: “applied” or “partial”, never pretend. When the window ends or the heartbeat stops, everything reverts.",
    shot: "shots/step-log.webp",
    w: 1600,
    h: 560,
    // below 1024 a narrower crop (time, kind, what happened) so the rows stay readable
    narrow: { shot: "shots/step-log-narrow.webp", w: 1000, h: 518 },
    alt: "The platform log: a SUPPORT signal ended when its window was over, then one ack per house saying it reverted at the window end.",
    caption: "The platform log: the window ran out and every house reverted.",
  },
];

function Shot({ s, narrow, className = "" }: { s: (typeof STEPS)[number]; narrow?: boolean; className?: string }) {
  const f = (narrow && s.narrow) || s;
  return <img src={asset(f.shot)} width={f.w} height={f.h} alt={s.alt} loading="lazy" decoding="async" className={`block h-auto max-h-full w-auto max-w-full rounded-[14px] shadow-card ${className}`} />;
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  // the active step is the one crossing the horizontal middle of the screen
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <Section id="how">
      <Reveal>
        <Title>How it works</Title>
      </Reveal>
      <div className="mt-6 lg:mt-0 lg:grid lg:grid-cols-12 lg:gap-14">
        <ol className="m-0 list-none p-0 lg:col-span-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              ref={(el) => { items.current[i] = el; }}
              data-i={i}
              className="py-10 md:py-14 lg:flex lg:min-h-[72svh] lg:flex-col lg:justify-center lg:py-0"
            >
              <Reveal>
                <h3
                  className={`m-0 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] transition-colors duration-[400ms] motion-reduce:transition-none md:text-[32px] ${active === i ? "text-ink" : "text-ink lg:text-tertiary"}`}
                  aria-current={active === i ? "step" : undefined}
                >
                  {s.title}
                </h3>
                <p className="mb-0 mt-4 max-w-[44ch] text-secondary">{s.body}</p>
              </Reveal>
              {/* phone and tablet: the screenshot under its own step */}
              <figure className="tile m-0 mt-8 p-3 md:p-8 lg:hidden">
                <Shot s={s} narrow className="mx-auto" />
                <figcaption className="mx-1 mt-4 text-[14px] text-secondary md:mx-0">{s.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ol>

        {/* desktop: the pinned frame, its screenshot crossfading with the active step */}
        <div className="hidden lg:col-span-7 lg:block">
          <div className="sticky top-0 flex h-[100svh] items-center">
            <figure className="m-0 w-full" aria-label="The console view for the active step">
              <div className="tile relative aspect-[5/4] max-h-[72svh] w-full">
                {STEPS.map((s, i) => (
                  <div
                    key={s.shot}
                    className={`absolute inset-8 flex items-center justify-center transition-opacity duration-[400ms] ease-out motion-reduce:transition-none xl:inset-10 ${active === i ? "opacity-100" : "opacity-0"}`}
                    aria-hidden={active === i ? undefined : true}
                  >
                    <Shot s={s} />
                  </div>
                ))}
              </div>
              {/* the captions share one grid cell, so the row is as tall as the longest of them */}
              <div className="mt-5 grid">
                {STEPS.map((s, i) => (
                  <p
                    key={s.shot}
                    className={`m-0 text-[15px] [grid-area:1/1] text-secondary transition-opacity duration-[400ms] motion-reduce:transition-none ${active === i ? "opacity-100" : "opacity-0"}`}
                    aria-hidden={active === i ? undefined : true}
                  >
                    {s.caption}
                  </p>
                ))}
              </div>
            </figure>
          </div>
        </div>
      </div>
    </Section>
  );
}
