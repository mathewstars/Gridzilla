// The hero: full bleed, edge to edge like the deck's title slide; the deck's moving green light fills the viewport, a
// soft shade behind the words keeps them readable. The two-line headline, one subline, two pills, and the real console
// in a thin dark bezel rising from the hero's bottom edge (centred, at most 1320 px), fading into the ground over its
// last 180 px so the hero has no hard cut. "Watch the trailer" scrolls to the trailer strip under the hero (#trailer)
// and sends the window event "gz:trailer-play" so the strip can start the video from this click. Entry: the headline lines rise 24 px 80 ms apart, the console rises last. Reduced
// motion: all of it is simply there.
import { motion, useReducedMotion } from "motion/react";
import { Play } from "@phosphor-icons/react";
import { PillButton, PillLink } from "../ui/Button";
import { EASE } from "../ui/Reveal";
import { LINKS, asset } from "../lib/links";

// On a phone the second sentence breaks after "The whole" (owner, 25 Oct): One signed limit. / The whole / street listens.
const LINES = [
  "One signed limit.",
  <>
    The whole <br className="md:hidden" />
    street listens.
  </>,
];

/** Ask the trailer strip (#trailer) to scroll into view and play: App passes "gz:trailer-play" to its play(). */
function watchTrailer() {
  window.dispatchEvent(new Event("gz:trailer-play"));
}

export default function Hero() {
  const reduce = useReducedMotion();
  const rise = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 0.15 + i * 0.08, ease: EASE } };

  return (
    <header id="top" className="hero relative isolate flex flex-col overflow-hidden">
      <div className="relative z-10 flex flex-col items-center px-4 pt-[clamp(112px,16vh,200px)] text-center md:px-10">
        <h1 className="t-display hero-h1 m-0">
          {LINES.map((l, i) => (
            <motion.span key={i} className="block" {...rise(i)}>
              {l}
            </motion.span>
          ))}
        </h1>
        <motion.p className="hero-sub mb-0 mt-6 max-w-[46ch] text-[rgb(245_245_247/0.9)] md:mt-7" {...rise(2)}>
          One bounded limit from the operator. Every battery, charger and heat pump on the street keeps the transformer under its rating.
        </motion.p>
        <motion.div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 min-[480px]:w-auto min-[480px]:flex-row min-[480px]:items-center md:mt-9" {...rise(3)}>
          <PillLink href={LINKS.console} size="lg" badge>
            Open the console
          </PillLink>
          <PillButton tone="secondary" size="lg" badge={<Play size={14} weight="fill" />} onClick={watchTrailer}>
            Watch the trailer
          </PillButton>
        </motion.div>
      </div>

      {/* the real console, rising out of the hero's bottom edge (the hero crops its lower part, the mask fades it out) */}
      <div className="hero-device-well relative z-0 mt-10 min-h-[180px] flex-1 md:mt-12">
        <motion.div
          className="hero-device absolute left-1/2 top-0 -translate-x-1/2"
          initial={reduce ? false : { opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.35, ease: EASE }}
        >
          <picture>
            {/* the phone shows the console 680 px wide: a 1360 px copy, at most 120 KB (G8) */}
            <source media="(max-width: 767px)" srcSet={asset("shots/console-phone.webp")} width={1360} height={765} />
            <img
              src={asset("shots/console.webp")}
              width={2880}
              height={1620}
              alt="The Gridzilla operations console: Vienna's 72 transformers, the evening peak with and without Gridzilla, what the AI did, and the live log"
              fetchPriority="high"
              decoding="async"
              className="block h-auto w-full rounded-[14px] lg:rounded-[18px]"
            />
          </picture>
        </motion.div>
      </div>
    </header>
  );
}
