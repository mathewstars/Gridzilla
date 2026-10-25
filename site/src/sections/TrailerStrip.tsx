// The trailer strip, right under the hero (owner's round 3b, data/gz-site/round3.md item 2): one line in Clash Display,
// "Watch the trailer", and under it a wide cinematic tile (16:9, the 1240 px content width, radius 24, the deck's glass
// edge) showing the trailer's poster with one centred white play pill. A click plays the real video in the same tile:
// the native video element, its controls only once it plays, paused when it scrolls out of view, never autoplayed and
// never preloaded. The hero's "Watch the trailer" pill calls play() on the ref: it smooth-scrolls here and starts it.
// Adapted from the 21st.dev "Video Thumbnail Player" pattern (poster, centred play, swap to the player in place).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Play } from "@phosphor-icons/react";
import { Container } from "../ui/Section";
import { PillButton } from "../ui/Button";
import { Reveal } from "../ui/Reveal";
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
          <div ref={tile} className="trailer-tile">
            <video
              ref={video}
              src={asset("trailer.mp4")}
              poster={asset("trailer-poster.webp")}
              preload="none"
              playsInline
              controls={started}
              aria-label="The Gridzilla trailer"
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
        </Reveal>
      </Container>
    </section>
  );
});

export default TrailerStrip;
