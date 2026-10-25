// One section of the page: an id for the nav anchors, the page container (the 1240 px content width, the side
// gutter) and the vertical air: 96 px top and bottom from 1024, 72 below, and nothing else stacks on it (round 4).
// Over the deck's light every section carries the scrim (the light at about 35 %, the deck's "calm"); `light` thins
// it to a shade for the one strong patch (AI). `bleed` drops the container for sections that draw
// their own full-width frame.
import type { HTMLAttributes, ReactNode } from "react";

export function Section({ id, children, className = "", bleed, light, fade, style, ...rest }: { id?: string; children: ReactNode; bleed?: boolean; light?: boolean; fade?: boolean } & HTMLAttributes<HTMLElement>) {
  // the light patch fades the scrim out and back in over 200 px, so there is no hard edge; `fade` (the first section
  // under the hero) lets the hero's full light run on and reaches the scrim over 240 px
  const bg = light
    ? "linear-gradient(var(--scrim), var(--shade) 200px, var(--shade) calc(100% - 200px), var(--scrim))"
    : fade
      ? "linear-gradient(transparent, var(--scrim) 240px)"
      : "var(--scrim)";
  return (
    <section id={id} className={`py-[72px] lg:py-24 ${className}`} style={{ background: bg, ...style }} {...rest}>
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[calc(var(--content)+2*var(--gutter))] px-[var(--gutter)] ${className}`}>{children}</div>;
}

/** A section title: Clash Display 500, sentence case, centred on the page (round 4). `as` sets the heading level. */
export function Title({ children, className = "", as: Tag = "h2" }: { children: ReactNode; className?: string; as?: "h2" | "h3" }) {
  return <Tag className={`t-display t-section m-0 mx-auto text-balance text-center ${className}`}>{children}</Tag>;
}

/** A section intro under its title: centred, at most 60ch. */
export function Intro({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`t-lead mx-auto mb-0 mt-6 max-w-[60ch] text-balance text-center text-secondary ${className}`}>{children}</p>;
}
