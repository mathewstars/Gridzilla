// The page, in order (data/gz-site/spec.md section 2), over the deck's light (ui/Backdrop). The nav is a fixed bar over everything.
import { useEffect, useRef } from "react";
import Backdrop from "./ui/Backdrop";
import Nav from "./sections/Nav";
import Hero from "./sections/Hero";
import TrailerStrip, { type TrailerHandle } from "./sections/TrailerStrip";
import Problem from "./sections/Problem";
import HowItWorks from "./sections/HowItWorks";
import SixWords from "./sections/SixWords";
import Proof from "./sections/Proof";
import RealPlant from "./sections/RealPlant";
import AtHome from "./sections/AtHome";
import Ai from "./sections/Ai";
import Security from "./sections/Security";
import Team from "./sections/Team";
import Footer from "./sections/Footer";

export default function App() {
  // the hero's "Watch the trailer" pill sends "gz:trailer-play" (in its click, so the video may start with sound)
  const trailer = useRef<TrailerHandle>(null);
  // /at-home is the sendable address of the testimonial. The sections above it keep growing for a moment after first
  // paint (fonts, images, the scroll-driven Six words measuring itself, a lazy chart chunk), so the page is kept on the
  // section from inside a ResizeObserver: its callback runs after layout and before paint, and the scroll is instant,
  // so every correction is applied in the same frame as the shift and none is ever visible. Stops at the first wheel,
  // touch or key, or after six seconds.
  useEffect(() => {
    if (!/^\/(at-home|testimonial)\/?$/.test(location.pathname)) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const settle = () => {
      const el = document.getElementById("home");
      if (!el) return;
      const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 72;   // #home's scroll-margin-top in tokens.css: the one knob
      const drift = el.getBoundingClientRect().top - offset;
      if (Math.abs(drift) > 1) window.scrollTo({ top: window.scrollY + drift, behavior: "instant" as ScrollBehavior });
    };
    settle();
    const ro = new ResizeObserver(settle);
    ro.observe(document.documentElement);
    ro.observe(document.body);
    const stop = () => ro.disconnect();
    const t = setTimeout(stop, 6000);
    const evs: (keyof WindowEventMap)[] = ["wheel", "touchstart", "keydown", "pointerdown"];
    evs.forEach((ev) => addEventListener(ev, stop, { once: true, passive: true }));
    return () => { clearTimeout(t); stop(); evs.forEach((ev) => removeEventListener(ev, stop)); };
  }, []);
  useEffect(() => {
    const play = () => trailer.current?.play();
    addEventListener("gz:trailer-play", play);
    return () => removeEventListener("gz:trailer-play", play);
  }, []);
  return (
    <>
      <Backdrop />
      <Nav />
      <Hero />
      <main>
        <TrailerStrip ref={trailer} />
        <Problem />
        <HowItWorks />
        <SixWords />
        <Proof />
        <RealPlant />
        <AtHome />
        <Ai />
        <Security />
        <Team />
      </main>
      <Footer />
    </>
  );
}
