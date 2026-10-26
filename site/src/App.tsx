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
  // /at-home is the sendable address of the testimonial: the same page, opened on that section (the server swaps the
  // preview tags for it, see platform/gridzilla.py). Sections above it (the scroll-driven Six words, images, fonts) keep
  // changing the page height for a while after first paint, so the page re-lands on the section at every height change
  // until the layout is still, the reader scrolls, or four seconds pass. scroll-margin-top in tokens.css clears the bar.
  useEffect(() => {
    if (!/^\/(at-home|testimonial)\/?$/.test(location.pathname)) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const go = () => document.getElementById("home")?.scrollIntoView({ block: "start" });
    let done = false;
    const ro = new ResizeObserver(() => { if (!done) go(); });
    const stop = () => { done = true; ro.disconnect(); };
    ro.observe(document.body);
    go();
    const t = setTimeout(stop, 4000);
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
