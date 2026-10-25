// The page's only button shape: a pill (dark or light), optionally with the round arrow badge at its end.
// One label per intent across the page: "Open the console", "Watch the trailer", "Read the protocol".
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";

type Tone = "dark" | "light" | "onnight";
type Size = "sm" | "md" | "lg";
interface Common {
  tone?: Tone;
  size?: Size;
  /** the round arrow badge (Vexo); on by default for links that leave the page */
  badge?: boolean | ReactNode;
  children: ReactNode;
  className?: string;
}

const cls = (tone: Tone, size: Size, badge: boolean, extra = "") =>
  ["pill", `pill-${tone}`, size !== "md" && `pill-${size}`, badge && "pill-badge", extra].filter(Boolean).join(" ");

function Badge({ icon }: { icon: boolean | ReactNode }) {
  return (
    <span className="pill-icon" aria-hidden="true">
      {icon === true ? <ArrowUpRight size={16} weight="bold" /> : icon}
    </span>
  );
}

export function PillLink({ tone = "dark", size = "md", badge, children, className, href, ...rest }: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = !!href && /^https?:/.test(href);
  const b = badge ?? external;
  return (
    <a href={href} className={cls(tone, size, !!b, className)} {...(external ? { target: "_blank", rel: "noopener" } : {})} {...rest}>
      <span>{children}</span>
      {b && <Badge icon={b} />}
    </a>
  );
}

export function PillButton({ tone = "dark", size = "md", badge, children, className, type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cls(tone, size, !!badge, className)} {...rest}>
      <span>{children}</span>
      {badge && <Badge icon={badge} />}
    </button>
  );
}
