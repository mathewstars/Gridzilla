// The trailer strip, right under the hero (owner's round 3b, data/gz-site/round3.md item 2): one line in Clash Display,
// "Watch the trailer", and under it a wide cinematic tile (16:9, the 1240 px content width, radius 24, the deck's glass
// edge) showing the trailer's poster with one centred white play pill. A click plays the real video in the same tile:
// the native video element, its controls only once it plays, paused when it scrolls out of view, never autoplayed and
// never preloaded. The hero's "Watch the trailer" pill calls play() on the ref: it smooth-scrolls here and starts it.
// Adapted from the 21st.dev "Video Thumbnail Player" pattern (poster, centred play, swap to the player in place).
// Size (owner, round 4): at rest the tile is at most 760 px wide, centred (the full width on a phone); while it plays it
// grows to the 1240 px content width (0.5 s, ease out expo, Motion animating max-width so nothing is scaled) and a small
// round Enlarge button under its bottom right corner asks for fullscreen; paused or ended, it shrinks back. Reduced
// motion: the size switches without animation. On a phone the native control does fullscreen, so Enlarge is hidden.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowsOut, Play } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { Container } from "../ui/Section";
import { PillButton } from "../ui/Button";
import { EASE, Reveal } from "../ui/Reveal";
import { asset } from "../lib/links";
import "../styles/trailer.css";

export interface TrailerHandle {
  /** scroll the tile into view and start the trailer (call it from a click, so the browser allows sound) */
  play: () => void;
}

const TrailerStrip = forwardRef<TrailerHandle>(function TrailerStrip(_, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const tile = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [wide, setWide] = useState(false);
  const reduceMotion = useReducedMotion();

  const enlarge = () => {
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  };

  const start = () => {
    const v = video.current;
    if (!v) return;
    setStarted(true);
    // play() inside the click keeps the user's gesture, so it starts with sound; if the browser still refuses, the
    // controls are there to press play
    v.play().catch(() => {});
  };

  useImperativeHandle(ref, () => ({
    play() {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      tile.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      start();
    },
  }));

  // pause once the tile is mostly out of view
  useEffect(() => {
    const el = tile.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && video.current && !video.current.paused) video.current.pause();
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="trailer" className="trailer-strip pb-[72px] pt-10 md:pt-14 lg:pb-24 lg:pt-16">
      <Container>
        <Reveal>
          <h2 className="t-display m-0 text-center text-[clamp(28px,2.6vw,44px)] leading-[1.1]">Watch the trailer</h2>
        </Reveal>
        <Reveal delay={0.08} amount={0.2} className="mt-12">
          <motion.div
            className="relative mx-auto"
            initial={false}
            animate={{ maxWidth: wide ? 1240 : 760 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, ease: EASE }}
          >
            <div ref={tile} className="trailer-tile">
              <video
                ref={video}
                src={asset("trailer.mp4")}
                poster={asset("trailer-poster.webp")}
                preload="none"
                playsInline
                controls={started}
                aria-label="The Gridzilla trailer"
                onPlay={() => setWide(true)}
                onPause={() => setWide(false)}
                onEnded={() => setWide(false)}
                className="block aspect-video w-full rounded-[18px] bg-page object-cover"
              />
              {!started && (
                // the whole poster plays it on a click; the pill is the keyboard target
                <div onClick={start} className="trailer-play group absolute inset-[var(--bezel)] grid cursor-pointer place-items-center rounded-[18px]">
                  <PillButton
                    size="lg"
                    badge={<Play size={14} weight="fill" />}
                    aria-label="Play the trailer"
                    onClick={(e) => { e.stopPropagation(); start(); }}
                    className="group-hover:scale-[1.05]"
                  >
                    Play
                  </PillButton>
                </div>
              )}
            </div>
            {started && wide && (
              <button
                type="button"
                onClick={enlarge}
                aria-label="Enlarge the trailer to full screen"
                className="absolute -bottom-14 right-0 hidden size-11 cursor-pointer place-items-center rounded-full border-0 bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-hairline),0_8px_24px_rgb(0_0_0/0.25)] transition-[background-color,transform] duration-150 hover:bg-fill active:scale-[0.96] active:bg-press md:grid"
              >
                <ArrowsOut size={18} weight="bold" />
              </button>
            )}
          </motion.div>
        </Reveal>
      </Container>
    </section>
  );
});

export default TrailerStrip;
