// Ops console theme: dark (default, for the demo) or light. ?theme=dark|light wins, then the viewer's last choice.
// It sets data-theme on <html>; index.css swaps every colour variable, so all components follow without their own code.
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "gz-theme";

export function initialTheme(): Theme {
  const q = new URLSearchParams(location.search).get("theme");
  if (q === "dark" || q === "light") return q;
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* storage blocked */
  }
  return "dark";
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function useTheme() {
  const [t, setT] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || initialTheme());
  useEffect(() => {
    applyTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage blocked */
    }
  }, [t]);
  return [t, setT] as const;
}
