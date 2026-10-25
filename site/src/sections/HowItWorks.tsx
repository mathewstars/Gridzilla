// How it works: a sticky split (after 21st.dev "Sticky Content Wrapper" by @hyperiux, rebuilt on IntersectionObserver
// instead of GSAP). At 1024 and up the four steps scroll on the left and the step crossing the middle of the screen is
// the active one; on the right a pinned frame crossfades (0.4 s) to its real console screenshot. Below 1024 it is one
// column, each screenshot under its own step. Reduced motion: no pinned frame and no crossfade at any width; every
// screenshot sits beside (from 1024) or under its own step, so nothing waits hidden.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { asset } from "../lib/links";
import "../styles/sections-a.css";

// Screenshots: the live console at gridzilla.victronlab.sk in its dark theme, captured headless at 2x (GET only, every
// other request aborted) at the moment the live state matched the step, cropped to one panel.
export const STEPS = [
  {
    title: "The operator signs a limit.",
    body: "“This street, next three hours, at most three kilowatts import per house.” Signed with Ed25519, scoped to one segment and one time window.",
    shot: "shots/step-signal.webp",
    w: 960,
    h: 848,
    alt: "The console's signal card: a 90 % forecast on Atzgersdorf at 22:24, the choice to use the batteries there, the rule check allowed, and signed message 21505 sent to 40 homes, 24 applied.",
    caption: "The console's signal card: what was seen, chosen, checked and signed.",
  },
  {
    title: "Every house checks it.",
    body: "One agent per home verifies the signature, the sequence and the validity window, then merges the limit with the owner’s own limits. The owner always wins.",
    shot: "shots/step-plan.webp",
    w: 1600,
    h: 711,
    alt: "The diet plan for all of Vienna over the next 24 hours: without Gridzilla the evening peaks at 92 % of the 30 MVA limit, with the plan it stays flat at 57 %, the eaten peak in orange.",
    caption: "The diet plan for all of Vienna, the envelope each house merges with its own limits.",
  },
  {
    title: "The hardware follows, in order.",
    body: "Battery first, then the car, hot water, floor heating. A Node-RED flow on a Victron Cerbo GX, the ViCare API on a Viessmann heat pump, thirty lines of JavaScript in the simulators.",
    shot: "shots/step-plant.webp",
    w: 1572,
    h: 1648,
    alt: "The real plant in Blatnica during the hackathon, following a signed signal: at most 5.4 kW from the grid; the grid power drops from about 9.5 kW to 4.5 kW under the dashed import limit while the car keeps charging at 11.3 kW.",
    caption: "The real plant in Blatnica during the hackathon, holding a signed 5.4 kW import limit.",
  },
  {
    title: "A signed answer comes back.",
    body: "Acks are honest: “applied” or “partial”, never pretend. When the window ends or the heartbeat stops, everything reverts.",
    // the log's left part (time, kind, what happened): the whole width would shrink the rows past reading
    shot: "shots/step-log.webp",
    w: 1000,
    h: 518,
    alt: "The platform log: two SUPPORT signals ended when their windows were over, each followed by acks from the houses saying they reverted at the window end.",
    caption: "The platform log: the window ran out and the houses reverted.",
  },
];

function Shot({ s, className = "" }: { s: (typeof STEPS)[number]; className?: string }) {
  return <img src={asset(s.shot)} width={s.w} height={s.h} alt={s.alt} loading="lazy" decoding="async" className={`block h-auto max-h-full w-auto max-w-full rounded-[14px] shadow-card ${className}`} />;
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const still = !!useReducedMotion();
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
    <Section id="how" className={still ? undefined : "lg:pb-0!"}>
      <Reveal>
        <Title>How it works</Title>
      </Reveal>
      <div className="mt-6 lg:mt-0 lg:grid lg:grid-cols-12 lg:gap-14">
        <ol className={`m-0 list-none p-0 ${still ? "lg:col-span-12" : "lg:col-span-5"}`}>
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              ref={(el) => { items.current[i] = el; }}
              data-i={i}
              className={still ? "py-10 first:pt-0 last:pb-0 md:py-14 lg:grid lg:grid-cols-12 lg:items-center lg:gap-14" : "py-10 first:pt-0 last:pb-0 md:py-14 lg:flex lg:min-h-[46svh] lg:flex-col lg:justify-center lg:py-0 lg:last:min-h-[42svh]"}
            >
              <Reveal className={still ? "lg:col-span-5" : undefined}>
                <h3
                  className={`m-0 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] transition-colors duration-[400ms] motion-reduce:transition-none md:text-[32px] ${active === i || still ? "text-ink" : "text-ink lg:text-tertiary"}`}
                  aria-current={active === i && !still ? "step" : undefined}
                >
                  {s.title}
                </h3>
                <p className="mb-0 mt-4 max-w-[44ch] text-secondary">{s.body}</p>
              </Reveal>
              {/* phone and tablet (and every width under reduced motion): the screenshot with its own step */}
              <figure className={`tile m-0 mt-8 p-6 md:p-8 ${still ? "lg:col-span-7 lg:mt-0" : "lg:hidden"}`}>
                <Shot s={s} className="mx-auto" />
                <figcaption className="mx-1 mt-4 text-[14px] text-secondary md:mx-0">{s.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ol>

        {/* desktop: the pinned frame, its screenshot crossfading with the active step */}
        {!still && <div className="hidden lg:col-span-7 lg:block">
          {/* as tall as one step and pinned where a centred step sits, so it stays centred through the last step */}
          <div className="sticky top-[20svh] flex h-[60svh] items-center">
            <figure className="m-0 w-full" aria-label="The console view for the active step">
              <div className="tile relative aspect-[5/4] max-h-[48svh] w-full">
                {STEPS.map((s, i) => (
                  <div
                    key={s.shot}
                    className={`absolute inset-8 flex items-center justify-center transition-opacity duration-[400ms] ease-out motion-reduce:transition-none ${active === i ? "opacity-100" : "opacity-0"}`}
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
        </div>}
      </div>
    </Section>
  );
}
