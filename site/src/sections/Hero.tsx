// The hero: one big rounded frame (Vexo), glass over the deck's moving green light, the nav notched into its top
// edge, the two-line headline, one subline, two pills, and the real console in a thin dark bezel rising from the
// frame's bottom edge. The trailer card sits bottom right and opens the real trailer in a dialog (never preloaded).
// Entry: the frame settles from 0.98, the headline lines rise 24 px 80 ms apart, the console rises last. Reduced
// motion: all of it is simply there.
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Play, X } from "@phosphor-icons/react";
import Nav from "./Nav";
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

export default function Hero() {
  const reduce = useReducedMotion();
  const [trailer, setTrailer] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const open = (e: React.MouseEvent<HTMLElement>) => {
    opener.current = e.currentTarget;
    setTrailer(true);
  };
  const rise = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 0.15 + i * 0.08, ease: EASE } };

  return (
    <header id="top" className="p-[var(--frame-inset)]">
      <motion.div
        className="hero-frame relative isolate flex flex-col overflow-hidden rounded-[var(--radius-frame)]"
        initial={reduce ? false : { scale: 0.98, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE }}
      >
        <Nav />

        <div className="relative z-10 flex flex-col items-center px-4 pt-[clamp(108px,15vh,176px)] text-center md:px-10">
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
            <PillButton tone="secondary" size="lg" badge={<Play size={14} weight="fill" />} onClick={open}>
              Watch the trailer
            </PillButton>
          </motion.div>
        </div>

        {/* the real console, rising out of the frame's bottom edge (the frame crops its lower part) */}
        <div className="relative z-0 mt-10 min-h-[180px] flex-1 md:mt-14">
          <motion.div
            className="hero-device absolute left-1/2 top-0 -translate-x-1/2"
            initial={reduce ? false : { opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.35, ease: EASE }}
          >
            <img
              src={asset("shots/console.webp")}
              width={2880}
              height={1800}
              alt="The Gridzilla operations console: Vienna's 72 transformers, the evening peak with and without Gridzilla, what the AI did, and the live log"
              fetchPriority="high"
              decoding="async"
              className="block h-auto w-full rounded-[14px] lg:rounded-[18px]"
            />
          </motion.div>
        </div>

        <motion.button
          type="button"
          onClick={open}
          aria-label="Watch the trailer"
          className="trailer-card group absolute bottom-6 right-6 z-20 hidden cursor-pointer overflow-hidden rounded-[var(--radius-card)] border-0 p-0 md:block lg:bottom-8 lg:right-8"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
        >
          <img src={asset("trailer-poster.webp")} width={960} height={540} alt="The trailer's first frame: an evening street in Vienna, cars at their chargers" className="block h-full w-full object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)] group-hover:scale-[1.04]" />
          <span className="absolute inset-0 grid place-items-center bg-[rgb(29_29_31/0.18)] transition-colors duration-300 group-hover:bg-[rgb(29_29_31/0.08)]">
            <span className="grid size-14 place-items-center rounded-full bg-ink text-on-ink shadow-[0_8px_24px_rgb(0_0_0/0.35)] transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)] group-hover:scale-110 group-active:scale-95">
              <Play size={20} weight="fill" />
            </span>
          </span>
        </motion.button>
      </motion.div>

      {trailer && <TrailerDialog onClose={() => { setTrailer(false); opener.current?.focus(); }} />}
    </header>
  );
}

/** The real trailer, full width, with sound and controls. Escape, the close button or the backdrop closes it. */
function TrailerDialog({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Gridzilla trailer"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(29_29_31/0.78)] p-4 backdrop-blur-sm"
      onClick={onClose}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="relative w-full max-w-[1200px]"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <video
          src={asset("trailer.mp4")}
          poster={asset("trailer-poster.webp")}
          controls
          autoPlay
          playsInline
          preload="none"
          className="block aspect-video w-full rounded-[var(--radius-card)] bg-page shadow-[0_40px_120px_rgb(0_0_0/0.6)]"
        />
        <button
          ref={close}
          type="button"
          aria-label="Close the trailer"
          onClick={onClose}
          className="absolute -top-14 right-0 grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-ink text-on-ink transition-[background-color,transform] duration-150 hover:bg-white active:scale-95"
        >
          <X size={18} weight="bold" />
        </button>
      </motion.div>
    </motion.div>
  );
}
