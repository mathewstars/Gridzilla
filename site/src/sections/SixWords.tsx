// Six words: a bento of exactly six cells, two rows of three at 1024 and up (the first row taller, it carries the noon
// curve), two columns on a tablet, one on a phone. ABSORB shows the real noon export of the Atzgersdorf street (the
// problem chart's own data, cropped to 09:50 to 14:20); STRETCH is the one dark cell, the street gone dark. Words from
// the spec, the same six as the deck's SlideSignals.tsx. Cells rise in 60 ms apart once and lift on hover.
import { lazy, Suspense } from "react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { STREET } from "../data/street";

const StreetChart = lazy(() => import("../charts/StreetChart"));

/** `says` is the message as the houses receive it (in quotes); `then` is what follows, in plain words. */
export const WORDS = [
  { word: "SUPPORT", when: "Evening peak, or the grid short of generation.", says: "Take at most 3 kW from the street." },
  { word: "ABSORB", when: "Noon solar flooding the feeder.", says: "Send back at most 2 kW." },
  { word: "PREPARE", when: "A warning, a storm, planned shedding.", says: "Be 90 % full by 17:00." },
  { word: "STRETCH", when: "The street is dark, restoration time known.", then: "Each house islands and rations battery, heat pump, car and boiler." },
  { word: "RECOVER", when: "The street comes back.", then: "Houses return to the grid gently, no synchronised step." },
  { word: "RELEASE", when: "The event is over.", says: "You are on your own again.", then: "Every limit lifted, signed like the rest." },
] as { word: string; when: string; says?: string; then?: string }[];

// the noon window of the street's plan: hours from its first row (09:50) to 14:20
const NOON = { from: 0, to: 4.5 };
const noon = STREET.rows.slice(0, NOON.to * 4 + 1);
const backWithout = Math.round(-Math.min(...noon.map((r) => r[1])));
const backWith = Math.round(-Math.min(...noon.map((r) => r[2])));

export default function SixWords() {
  return (
    <Section id="words">
      <Reveal>
        <Title>Six words. Signed.</Title>
      </Reveal>
      <ul className="m-0 mt-12 grid list-none grid-cols-1 gap-4 p-0 md:mt-16 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[minmax(400px,auto)_minmax(290px,auto)] lg:gap-5">
        {WORDS.map((w, i) => {
          const dark = w.word === "STRETCH";
          const absorb = w.word === "ABSORB";
          return (
            <Reveal as="li" key={w.word} delay={i * 0.06} amount={0.3} className="flex">
              <div
                className={`flex w-full flex-col rounded-card p-7 transition-[transform,box-shadow] duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0 md:p-8 ${dark ? "bg-night text-night-text" : "bg-ground text-ink"}`}
              >
                <h3 className="t-display m-0 text-[40px] md:text-[44px] lg:text-[48px]">{w.word}</h3>
                {absorb && (
                  <figure className="m-0 mt-6">
                    <div className="h-[112px] lg:h-[128px]">
                      <Suspense fallback={null}>
                        <StreetChart compact from={NOON.from} to={NOON.to} label={`Noon on the ${STREET.name} street: ${backWithout} kW sent back to the grid without Gridzilla, held at ${backWith} kW with it.`} />
                      </Suspense>
                    </div>
                    <figcaption className="t-num mt-2 text-[13px] text-secondary">
                      Noon in {STREET.name}: {backWithout}&nbsp;kW back without, {backWith}&nbsp;kW with.
                    </figcaption>
                  </figure>
                )}
                <div className="mt-auto pt-8">
                  <p className={`m-0 text-[15px] ${dark ? "text-night-secondary" : "text-secondary"}`}>{w.when}</p>
                  <p className="m-0 mt-2 text-[19px] font-medium leading-[1.35] tracking-[-0.015em] md:text-[20px]">
                    {w.says && <>&ldquo;{w.says}&rdquo;</>}
                    {w.says && w.then && " "}
                    {w.then}
                  </p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </ul>
      <Reveal>
        <p className="mb-0 mt-10 max-w-[70ch] text-[15px] text-secondary md:mt-12">
          Plus a 24-hour envelope per street, renewed every two hours. Every message signed with a time window, ramps randomised so a street never steps in sync, the owner&rsquo;s limits always win, and everything reverts when the heartbeat stops.
        </p>
      </Reveal>
    </Section>
  );
}
