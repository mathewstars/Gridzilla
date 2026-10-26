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
