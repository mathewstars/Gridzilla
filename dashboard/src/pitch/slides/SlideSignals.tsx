// Slide 4, the six signal words (1:10, 15 s, Matthew), right after the idea (one signed message) and before the
// monster chart; the six the team's submission names. One key press: the headline is there on the cut, the six cards
// rise in 100 ms apart (like slide 2's facts), two rows of three in the order the script says them (the everyday
// three, then the crisis three), and the closing line follows by itself 1 s after the last card lands. Freeze or
// reduced motion: all on. Words and meanings from README.md's two signal tables, protocol/PROTOCOL.md and
// platform/gridzilla.py MODE_FIELDS; the numbers are the README's examples and the console's defaults (3 kW import
// cap, 2 kW export cap, fill to 90 %), so they are deck figures, not live ones. The envelope (SHAPE, the diet plan,
// re-planned every two grid hours: SHAPE_EVERY_S) is in the closing line, as in the submission.
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { SlideProps } from "../types";
import "./slideSignals.css";

/** Seconds after the slide comes on: the first card starts to rise, the gap between cards, one card's rise. */
const START = 0.4;
const GAP = 0.1;
const RISE = 0.7;
/** The closing line starts to rise 1 s after the last card lands. */
const CLOSE_AT = START + GAP * 5 + RISE + 1.0;

const WORDS = [
  { word: "SUPPORT", tone: "red", when: "Evening peak, or the grid short of power", says: "Take at most 3\u00a0kW from the street." },
  { word: "ABSORB", tone: "green", when: "Noon sun flooding the street", says: "Send back at most 2\u00a0kW." },
  { word: "PREPARE", tone: "orange", when: "A warning: storm, planned outage, attack", says: "Be 90\u00a0% full by 17:00." },
  { word: "STRETCH", tone: "violet", when: "The street is dark, power back at a known time", says: "Run on your own, send nothing back, make it last." },
  { word: "RECOVER", tone: "teal", when: "The transformer is replaced", says: "Refill slowly, not all at once." },
  { word: "RELEASE", tone: "grey", when: "The event is over", says: "You are on your own again." },
] as const;

export default function SlideSignals({ freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const [cards, setCards] = useState(still);
  const [close, setClose] = useState(still);

  useEffect(() => {
    if (still) {
      setCards(true);
      setClose(true);
      return;
    }
    setCards(false);
    setClose(false);
    const timers = [
      window.setTimeout(() => setCards(true), START * 1000),
      window.setTimeout(() => setClose(true), CLOSE_AT * 1000),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, [still]);

  return (
    <div className={`p-slide sw${still ? " sw-still" : ""}`} data-slide="4">
      <h1 className="sw-head p-head">Six words. Signed.</h1>

      <div className="sw-row">
        {WORDS.map((w, i) => (
          <div key={w.word} className={`sw-card sw-${w.tone}${cards ? " is-on" : ""}`} style={{ transitionDelay: still ? "0s" : `${i * GAP}s` }}>
            <div className="sw-word">{w.word}</div>
            <p className="sw-when p-small p-secondary">{w.when}</p>
            <p className="sw-says p-body" data-src="deck" data-label="README.md signal tables, an example message">
              “{w.says}”
            </p>
          </div>
        ))}
      </div>

      <p className={`sw-close p-small p-secondary${close ? " is-on" : ""}`}>
        Plus a 24{"\u2011"}hour envelope per street, renewed every two hours. Every message Ed25519{"\u2011"}signed with a time
        window, ramps randomised so a street never steps in sync, the owner's limits always win, and everything reverts
        when the heartbeat stops.
      </p>
    </div>
  );
}
