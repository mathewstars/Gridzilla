/*
 * REFERENCE COPY from 21st.dev. NOT wired in (dashboard/tsconfig.json only includes src/, so this file is never built).
 *
 * Block 4: bento / stat cards grid
 * Component: "Stats Bento" by @uilayout.contact (UI Layout)
 * 21st.dev:  https://21st.dev/@uilayout.contact/components/stats-bento   (demo id 25311, component id 12527)
 * Install:   npx shadcn@latest add "https://21st.dev/r/uilayout.contact/stats-bento"   (we do NOT run it)
 * Licence:   no licence header in the source. Treat as a reference layout and re-implement with our own cards.
 *
 * Why this one: a real mixed-size bento in a 6-column grid (one 3x2 hero stat, one 3x1 with a mini bar sparkline, a 1x1
 * and a 2x1), which is the exact shape of our stage: one hero ("kW taken off this street") plus smaller live facts.
 * Pure Tailwind, zero deps, no images.
 *
 * Deps we lack: none. It uses shadcn theme classes (bg-primary, bg-muted, text-muted-foreground, border-border) that we
 * do not define: map them as below.
 *
 * Adapt to our tokens (src/stage/palette.ts, src/index.css, DESIGN.md):
 *  - Card surface: our `.panel` class (white #fff, radius var(--radius-card) 18px, depth by var(--shadow-card), NEVER a
 *    border). Remove every `border border-border`.
 *  - Hero card: bg-primary (near-black) -> keep it WHITE like the rest; the hero earns weight by size and the 2-3x number,
 *    not by an inverted fill. Drop the diagonal repeating-linear-gradient texture (decoration, anti-slop rule).
 *  - Muted cards: bg-muted -> bg-card (all cards white on ground #f5f5f7). Labels: uppercase tracking-widest 10px ->
 *    sentence case, 0.8rem, text-secondary (#6e6e73); Apple does not shout labels.
 *  - Mini bars: bg-foreground -> P.ink; make them real data (last N /api/history points), never a static array.
 *  - Grid: md:grid-cols-6 md:grid-rows-2 gap-4 -> drive spans from kit/layout.ts per breakpoint; at 390 wide it is one
 *    column in story order. Keep gap at 1rem (scales with the clamp() root size for the projector).
 *  - Content for the judges' brief (STORY.md), one live fact per tile, no paragraphs:
 *      hero 3x2  : kW taken off this street now (with vs without) + LoadRing
 *      3x1       : signal window countdown (block 5) "DSO steering ends in 12:40"
 *      1x1       : "Owner in control" = number of homes that accepted / overrode, from /api/state
 *      2x1       : "Curtailment avoided" kWh + "Grid expansion deferred" (years or EUR) from the API
 *      (extra)   : "Open signed profile: Victron + Viessmann live at Blatnica" with the latest signature seq.
 *  - QA: every number carries data-src + data-val (qa/README.md).
 */

// ---------------------------------------------------------------- original source (verbatim) ----------------------
"use client";
import React from "react";

export const StatsBento = () => {
  return (
    <section className="min-h-screen bg-background flex flex-col justify-center">
      <div className="grid grid-cols-1 md:grid-cols-6 md:grid-rows-2 gap-4 max-w-7xl mx-auto">
        {/* Primary Stat */}
        <div className="md:col-span-3 md:row-span-2 bg-primary rounded-3xl p-10 flex flex-col justify-between overflow-hidden relative">
          <div className="absolute bottom-0 left-0 right-0 top-0 bg-[repeating-linear-gradient(45deg,#808080_0px_1px,transparent_1px_10px)] opacity-30 mask-[radial-gradient(ellipse_80%_50%_at_100%_0%,#000_70%,transparent_110%)] pointer-events-none"></div>
          <div>
            <span className="inline-block px-3 py-1 bg-primary-foreground/10 rounded-full text-[10px] font-semibold text-primary-foreground/60 uppercase tracking-widest mb-6">
              Market Share
            </span>
            <h3 className="text-6xl tracking-tighter text-primary-foreground ">
              64%
            </h3>
          </div>
          <p className="text-primary-foreground/60 text-sm max-w-xs">
            Dominating the cloud-native infrastructure market for venture-backed
            startups.
          </p>
        </div>

        {/* Secondary Stat A */}
        <div className="md:col-span-3 bg-muted rounded-3xl p-8 border border-border flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Growth
            </p>
            <p className="text-3xl text-foreground ">+240%</p>
          </div>
          <div className="flex gap-1 items-end h-8">
            {[10, 20, 40, 30, 60, 50, 80, 70, 90, 100, 110].map((h, i) => (
              <div
                key={i}
                className="w-1.5 bg-foreground rounded-full"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Tertiary Stat B */}
        <div className="md:col-span-1 bg-card rounded-3xl p-6 border border-border flex flex-col justify-center text-center">
          <p className="text-2xl text-foreground">12</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Awards
          </p>
        </div>

        {/* Tertiary Stat C */}
        <div className="md:col-span-2 bg-muted rounded-3xl p-6 flex items-center gap-4">
          <div className="size-10 text-2xl rounded-full bg-background text-foreground flex items-center justify-center shrink-0 shadow-sm font-semibold">
            ★
          </div>
          <div>
            <p className="text-sm text-foreground leading-none">4.9 / 5.0</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">
              G2 Peer Reviews
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StatsBento;

// ---------------------------------------------------------------- demo usage ---------------------------------------
// import StatsBento from "@/components/ui/stats-bento";
// export default function StatsBentoDemo() { return <StatsBento />; }
