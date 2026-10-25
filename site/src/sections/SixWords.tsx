// Six words: a signal explorer, the deck's slide 4 made interactive. At 1024 and up the six words stand as vertical tabs
// on the left (the active one in ink with its tone as a 3 px rule, a soft tile following the mouse) and one glass tile
// on the right shows the active signal: its chart, the situation, the operator's message and what the house does.
// Scrolling drives it (round 3): the explorer pins below the nav inside a tall track and walks the six words in short
// steps of 45 vh, crossfading the tile in 0.25 s; clicking a word or an arrow key scrolls to that word's step; past the
// last step it lets go. Reduced motion: no pin, the plain tab explorer. Below 1024 the six are a scroll-snap row of
// compact cards with a "1 of 6" counter and 44 px previous and next buttons, never pinned.
// Content and charts: sixwords/signals.ts and sixwords/SignalChart.tsx.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Section, Title } from "../ui/Section";
import { Reveal, EASE } from "../ui/Reveal";
import SignalChart from "./sixwords/SignalChart";
import { RATION_ORDER, SIGNALS, type Signal } from "./sixwords/signals";
import "../styles/sections-a.css";
import "./sixwords/sixwords.css";

const tone = (s: Signal) => `tone-${s.word.toLowerCase()}`;

function Message({ s, className }: { s: Signal; className: string }) {
  return (
    <p className={className}>
      <span className="sw-q">&ldquo;</span>
      {s.says}
      <span className="sw-q">&rdquo;</span>
    </p>
  );
}

/** The tile's content for one signal: chart, the situation, the message, what the house does. */
function Panel({ s }: { s: Signal }) {
  return (
    <>
      <SignalChart word={s.word} label={s.caption} />
      {s.word === "STRETCH" && (
        <ol className="m-0 mt-5 grid list-none grid-cols-4 gap-3 p-0" aria-label="The order the house rations in">
          {RATION_ORDER.map((r, i) => (
            <li key={r} className="flex flex-col gap-2">
              <span className="flex h-7 items-end" aria-hidden="true">
                <span className="sw-bar block w-full" style={{ height: `${100 - i * 22}%` }} />
              </span>
              <span className="text-[14px] text-secondary">{r}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="m-0 mt-4 max-w-[64ch] text-[14px] leading-snug text-secondary">{s.caption}</p>
      <p className="m-0 mt-8 text-[17px] text-secondary">{s.when}</p>
      <Message s={s} className="m-0 mt-2 text-[28px] font-medium leading-[1.25] tracking-[-0.02em] text-ink" />
      <p className="m-0 mt-3 max-w-[60ch] text-[17px] text-secondary">{s.does}</p>
    </>
  );
}

/** Desktop: the tabs and the tile. `active` and `onPick` come from the scroll (pinned) or from plain tab state. */
function Explorer({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const s = SIGNALS[active];
  const slide = { duration: reduce ? 0 : 0.35, ease: EASE };

  const onKey = (e: KeyboardEvent) => {
    const n = SIGNALS.length;
    const go = { ArrowDown: active + 1, ArrowRight: active + 1, ArrowUp: active - 1, ArrowLeft: active - 1, Home: 0, End: n - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const next = (go + n) % n;
    onPick(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="grid grid-cols-12 gap-10 xl:gap-14">
      <div role="tablist" aria-orientation="vertical" aria-label="The six signal words" className="col-span-4 flex flex-col gap-1" onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        {SIGNALS.map((w, i) => (
          <button
            key={w.word}
            ref={(el) => { tabs.current[i] = el; }}
            id={`sw-tab-${w.word}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls="sw-panel"
            tabIndex={i === active ? 0 : -1}
            className={`sw-tab ${tone(w)}`}
            onClick={() => onPick(i)}
            onMouseEnter={() => setHover(i)}
          >
            {hover === i && <motion.span layoutId="sw-hover" className="sw-hover" transition={slide} aria-hidden="true" />}
            {i === active && <motion.span layoutId="sw-rule" className="sw-rule" transition={slide} aria-hidden="true" />}
            {w.word}
          </button>
        ))}
      </div>

      <div id="sw-panel" role="tabpanel" aria-labelledby={`sw-tab-${s.word}`} className={`tile col-span-8 grid p-8 xl:p-10 ${tone(s)}`}>
        <AnimatePresence initial={false}>
          <motion.div
            key={s.word}
            className="[grid-area:1/1]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
          >
            <Panel s={s} />
          </motion.div>
        </AnimatePresence>
        {/* every signal laid out unseen in the same cell, so the tile is as tall as the tallest and never jumps */}
        {SIGNALS.map((g) => (
          <div key={g.word} className="invisible [grid-area:1/1]" aria-hidden="true">
            <Panel s={g} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Reduced motion: the explorer as plain tabs, nothing pinned. */
function TabExplorer() {
  const [active, setActive] = useState(0);
  return (
    <Reveal amount={0.2}>
      <Explorer active={active} onPick={setActive} />
    </Reveal>
  );
}

const STEP_VH = 0.45;
const N = SIGNALS.length;

/** The scroll-driven explorer: a track as tall as the stage plus six steps of 45 vh; the stage sticks below the nav,
 *  centred in the space under it, and the scroll position inside the track picks the word. */
function PinnedExplorer() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ stageH: 700, vh: 900, nav: 72 });
  const [active, setActive] = useState(0);
  const { scrollY } = useScroll();

  useLayoutEffect(() => {
    const measure = () =>
      setM({
        stageH: stage.current?.offsetHeight ?? 700,
        vh: window.innerHeight,
        nav: document.querySelector<HTMLElement>('nav[aria-label="Main"]')?.offsetHeight ?? 72,
      });
    measure();
    const ro = new ResizeObserver(measure);
    if (stage.current) ro.observe(stage.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const top = Math.max(m.nav + 16, (m.vh - m.stageH + m.nav) / 2);
  const step = STEP_VH * m.vh;

  const update = useCallback(() => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    // once the whole track has gone up past the screen the explorer rests on the first word again, unseen
    const idx = r.bottom < 0 ? 0 : Math.min(N - 1, Math.max(0, Math.floor((top - r.top) / step)));
    setActive((a) => (a === idx ? a : idx));
  }, [top, step]);
  useMotionValueEvent(scrollY, "change", update);
  useEffect(update, [update]);

  // a word picked by click or key: scroll to the middle of its step
  const pick = (i: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    window.scrollTo({ top: scrollY.get() + r.top - top + (i + 0.5) * step, behavior: "smooth" });
  };

  return (
    <div ref={track} className="relative" style={{ height: m.stageH + N * step }}>
      <div ref={stage} className="sticky" style={{ top }}>
        <Reveal amount={0.2}>
          <Explorer active={active} onPick={pick} />
        </Reveal>
      </div>
    </div>
  );
}

/** Phone and tablet: the scroll-snap row of six compact cards. */
function Cards() {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const row = useRef<HTMLUListElement>(null);
  const cards = useRef<(HTMLLIElement | null)[]>([]);

  // the current card is the one at least 60 % inside the row
  useEffect(() => {
    const root = row.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.i));
      },
      { root, threshold: 0.6 },
    );
    cards.current.forEach((c) => c && io.observe(c));
    return () => io.disconnect();
  }, []);

  const go = (i: number) => {
    const root = row.current;
    const card = cards.current[i];
    if (root && card) root.scrollTo({ left: card.offsetLeft - root.offsetLeft, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div>
      <ul ref={row} className="sw-row relative m-0 list-none p-0" tabIndex={0} aria-label="The six signal words, one card each">
        {SIGNALS.map((s, i) => (
          <li key={s.word} ref={(el) => { cards.current[i] = el; }} data-i={i} className={`sw-card ${tone(s)} ${i === current ? "is-current" : ""}`} aria-current={i === current ? "true" : undefined}>
            <div className="tile h-full p-6">
              <div className="sw-card-in flex h-full flex-col">
                <h3 className="m-0 font-display text-[30px] font-semibold leading-none tracking-[0.03em]">{s.word}</h3>
                <div className="mt-5">
                  <SignalChart word={s.word} label={s.caption} compact />
                </div>
                <p className="m-0 mt-5 text-[15px] text-secondary">{s.when}</p>
                <Message s={s} className="m-0 mt-2 text-[20px] font-medium leading-[1.3] tracking-[-0.015em] text-ink" />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-between">
        <p className="t-num m-0 text-[15px] text-secondary" aria-live="polite">
          {current + 1} of {SIGNALS.length}
        </p>
        <div className="flex gap-3">
          <button type="button" className="sw-step" aria-label="Previous signal word" disabled={current === 0} onClick={() => go(current - 1)}>
            <CaretLeft size={20} weight="bold" aria-hidden="true" />
          </button>
          <button type="button" className="sw-step" aria-label="Next signal word" disabled={current === SIGNALS.length - 1} onClick={() => go(current + 1)}>
            <CaretRight size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SixWords() {
  const reduce = useReducedMotion();
  return (
    <Section id="words">
      <Reveal>
        <Title>Six words. Signed.</Title>
      </Reveal>
      <div className="mt-12 hidden md:mt-16 lg:block">{reduce ? <TabExplorer /> : <PinnedExplorer />}</div>
      <Reveal className="mt-10 lg:hidden" amount={0.2}>
        <Cards />
      </Reveal>
      <Reveal>
        <p className="mb-0 mt-10 max-w-[70ch] text-[15px] text-secondary md:mt-12">
          Plus a 24-hour envelope per street, renewed every two hours. Every message signed with a time window, ramps randomised so a street never steps in sync, the owner&rsquo;s limits always win, and everything reverts when the heartbeat stops.
        </p>
      </Reveal>
    </Section>
  );
}
