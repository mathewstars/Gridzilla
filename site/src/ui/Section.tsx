// One section of the page: an id for the nav anchors, the page container (1280 max, the side gutter) and the
// vertical air (density 3). Over the deck's light every section carries the scrim (the light at about 35 %, the deck's
// "calm"); `light` drops it for the one full-strength patch (AI). `bleed` drops the container for sections that draw
// their own full-width frame.
import type { HTMLAttributes, ReactNode } from "react";

export function Section({ id, children, className = "", bleed, light, ...rest }: { id?: string; children: ReactNode; bleed?: boolean; light?: boolean } & HTMLAttributes<HTMLElement>) {
  return (
    <section id={id} className={`${light ? "" : "bg-[var(--scrim)]"} py-24 md:py-32 lg:py-40 ${className}`} {...rest}>
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1280px] px-[var(--gutter)] ${className}`}>{children}</div>;
}

/** A section title: Clash Display 500, sentence case. Pass `as` for the heading level (h2 by default). */
export function Title({ children, className = "", as: Tag = "h2" }: { children: ReactNode; className?: string; as?: "h2" | "h3" }) {
  return <Tag className={`t-display t-section m-0 ${className}`}>{children}</Tag>;
}
