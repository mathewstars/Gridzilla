// The page, in order (data/gz-site/spec.md section 2), over the deck's light (ui/Backdrop). The nav is a fixed bar over everything.
import Backdrop from "./ui/Backdrop";
import Nav from "./sections/Nav";
import Hero from "./sections/Hero";
import Problem from "./sections/Problem";
import HowItWorks from "./sections/HowItWorks";
import SixWords from "./sections/SixWords";
import Proof from "./sections/Proof";
import RealPlant from "./sections/RealPlant";
import Ai from "./sections/Ai";
import Security from "./sections/Security";
import Team from "./sections/Team";
import Footer from "./sections/Footer";

export default function App() {
  return (
    <>
      <Backdrop />
      <Nav />
      <Hero />
      <main>
        <Problem />
        <HowItWorks />
        <SixWords />
        <Proof />
        <RealPlant />
        <Ai />
        <Security />
        <Team />
      </main>
      <Footer />
    </>
  );
}
