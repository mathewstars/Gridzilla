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
  // preview tags for it, see platform/gridzilla.py)
  useEffect(() => {
    if (!/^\/(at-home|testimonial)\/?$/.test(location.pathname)) return;
    // images and fonts above the section arrive after first paint and push it down, so land on it again once the
    // page has loaded (scroll-margin-top in tokens.css keeps it clear of the bar)
    const go = () => document.getElementById("home")?.scrollIntoView({ block: "start" });
    const timers = [setTimeout(go, 250), setTimeout(go, 1200)];
    const onLoad = () => { go(); timers.push(setTimeout(go, 600)); };
    if (document.readyState === "complete") onLoad(); else addEventListener("load", onLoad, { once: true });
    return () => { timers.forEach(clearTimeout); removeEventListener("load", onLoad); };
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
