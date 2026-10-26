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
  // /at-home is the sendable address of the testimonial: once the page has loaded, jump to the section, bar height
  // subtracted, instantly (the page scrolls smoothly by CSS, so an animated jump here would be overtaken by the layout
  // still settling above). One more silent correction a second later for anything that loaded late.
  useEffect(() => {
    if (!/^\/(at-home|testimonial)\/?$/.test(location.pathname)) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const jump = () => {
      const el = document.getElementById("home");
      const bar = document.querySelector<HTMLElement>('nav[aria-label="Main"]')?.offsetHeight ?? 72;
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar, behavior: "instant" as ScrollBehavior });
    };
    const timers: number[] = [];
    const onLoad = () => { jump(); timers.push(window.setTimeout(jump, 1000)); };
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
