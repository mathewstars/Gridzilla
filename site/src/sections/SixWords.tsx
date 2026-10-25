// STUB (helper A): six words. Bento, 6 cells exactly, 2 rows of 3, different row heights; ABSORB carries the noon solar
// curve, STRETCH a tinted dark-ground panel. Words from dashboard/src/pitch/slides/SlideSignals.tsx. Spec section 5.
import { Section, Title } from "../ui/Section";

export const WORDS = [
  { word: "SUPPORT", when: "Evening peak, or the grid short of generation.", says: "Take at most 3 kW from the street." },
  { word: "ABSORB", when: "Noon solar flooding the feeder.", says: "Send back at most 2 kW." },
  { word: "PREPARE", when: "A warning, a storm, planned shedding.", says: "Be 90 % full by 17:00." },
  { word: "STRETCH", when: "The street is dark, restoration time known.", says: "Each house islands and rations battery, heat pump, car and boiler." },
  { word: "RECOVER", when: "The street comes back.", says: "Houses return to the grid gently, no synchronised step." },
  { word: "RELEASE", when: "The event is over.", says: "You are on your own again. Every limit lifted, signed like the rest." },
];

export default function SixWords() {
  return (
    <Section id="words">
      <Title>Six words. Signed.</Title>
      <ul className="mt-12 grid list-none gap-6 p-0 md:grid-cols-3">
        {WORDS.map((w) => (
          <li key={w.word}>
            <h3 className="t-display m-0 text-[32px]">{w.word}</h3>
            <p className="mt-2 text-secondary">{w.when}</p>
            <p className="mt-2">{w.says}</p>
          </li>
        ))}
      </ul>
      <p className="mt-12 max-w-[70ch] text-[15px] text-secondary">
        Plus a 24-hour envelope per street, renewed every two hours. Every message signed with a time window, ramps randomised so a street never steps in sync, the owner&rsquo;s limits always win, and everything reverts when the heartbeat stops.
      </p>
    </Section>
  );
}
