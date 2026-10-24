// The hero chart (design/STAGE.md 7.1): one card, one curve, read with the pitch sentence "blue is with Gridzilla, grey
// is without, orange is the peak eaten". The last hours measured (blue with, grey dashed without, the orange gap), and
// from Now on dad's diet plan (/api/flatten): the grey "without" hill, the green line the street is held to ("the plan"),
// the peak it eats in orange. Red is only the limit. The active signal's limited-time window sits on the
// time axis. The card title (useStory momentOf) says in plain words what the plan does here. The shell's Card owns surface and padding.
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useFlatten } from "../../api";
import { P } from "../palette";
import LiveCurve from "../kit/LiveCurve";
import { curveTitle } from "../kit/plan";
import { signalOn, type StoryState } from "../useStory";

/** Props: `st` from useStory(). Fills its card (flex column): title, legend, then the plot takes the rest, never less
 *  than 200 px (phone) to 300 px (wide) tall. The plot's minimum also follows the window height: at 1920x1080 a 300 px
 *  floor (plus the two-line legend) made this card, and with it the top row, taller than its share of one screen. */
export default function HeroCurve({ st }: { st: StoryState }) {
  const { s, tf, history, moment } = st;
  const flat = useFlatten(tf || null);
  const still = useReducedMotion();
  const plan = flat.plan;
  const sig = s && tf ? signalOn(s, tf) : null;
  // The title names what the plot shows: the backflow title only while the chart draws the backflow limit (LiveCurve
  // reports it), else the grid hour's evening / plan title, worded like the headline's moment (useStory momentOf).
  const [revDrawn, setRevDrawn] = useState(false);
  const title = tf && s ? curveTitle(tf, moment?.hour ?? s.sim_hour, revDrawn) : moment?.title ?? "The street with and without Gridzilla";
  // Draw only once the history poll has answered for this transformer, so the first picture already holds the last
  // 6 hours (the poll keeps the previous street's payload until then).
  const histReady = !!(tf && history?.nodes && tf in history.nodes);

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <h2
        className="font-semibold"
        style={{ fontSize: "clamp(1.125rem, 0.9rem + 0.45vw, 1.75rem)", lineHeight: 1.14, letterSpacing: "0.007em", color: P.ink, textWrap: "balance", marginBottom: "0.6em" }}
      >
        {title}
      </h2>
      {s && tf && histReady ? (
        // A new transformer crossfades in (0.6 s); its curve starts fresh instead of gliding from the last street.
        <motion.div
          key={tf}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.3, 1] }}
        >
          <LiveCurve
            stage
            s={s}
            history={history}
            node={tf}
            header={false}
            plan={plan}
            signal={sig}
            span={{ past: 6, future: 18, narrow: { past: 2, future: 9 } }}
            legend="above"
            minPlot="clamp(248px, min(30cqi, 22vh), 300px)" // vh cap keeps 1920x1080 one screen
            planSrc={`flatten:${tf}`}
            onRev={setRevDrawn}
          />
        </motion.div>
      ) : (
        <p className="flex-1" style={{ fontSize: "1.0625rem", color: P.tertiary }}>
          {s && tf ? "Loading the last 6 hours" : "Waiting for the first readings"}
        </p>
      )}
    </div>
  );
}
