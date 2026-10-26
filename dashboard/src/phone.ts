// Phones, for the deck and the console: under 900 px wide, or a landscape phone (500 px tall or less). Desktop windows
// (the smallest the deck and the console are shown on is 1240x635) never match, so everything gated on it leaves the
// desktop exactly as it was. CSS uses the same query: @media (max-width: 899.98px), (max-height: 500px).
import { useEffect, useState } from "react";

export const PHONE_Q = "(max-width: 899.98px), (max-height: 500px)";
/** A touch screen without hover (phones, tablets): the touch controls show there too. */
export const TOUCH_Q = "(hover: none) and (pointer: coarse)";

export function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
}

export const usePhone = () => useMedia(PHONE_Q);
