// One section of the page: an id for the nav anchors, the page container (the 1240 px content width, the side
// gutter) and the vertical air: 120 px top and bottom from 1024, 72 on the phone, and nothing else stacks on it.
// Over the deck's light every section carries the scrim (the light at about 35 %, the deck's "calm"); `light` thins
// it to a shade for the one strong patch (AI). `bleed` drops the container for sections that draw
// their own full-width frame.
import type { HTMLAttributes, ReactNode } from "react";

export function Section({ id, children, className = "", bleed, light, style, ...rest }: { id?: string; children: ReactNode; bleed?: boolean; light?: boolean } & HTMLAttributes<HTMLElement>) {
  // the light patch fades the scrim out and back in over 200 px, so there is no hard edge
  const bg = light ? "linear-gradient(var(--scrim), var(--shade) 200px, var(--shade) calc(100% - 200px), var(--scrim))" : "var(--scrim)";
  return (
    <section id={id} className={`py-[72px] md:py-24 lg:py-[120px] ${className}`} style={{ background: bg, ...style }} {...rest}>
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[calc(var(--content)+2*var(--gutter))] px-[var(--gutter)] ${className}`}>{children}</div>;
}

/** A section title: Clash Display 500, sentence case. Pass `as` for the heading level (h2 by default). */
export function Title({ children, className = "", as: Tag = "h2" }: { children: ReactNode; className?: string; as?: "h2" | "h3" }) {
  return <Tag className={`t-display t-section m-0 ${className}`}>{children}</Tag>;
}
