// Feeder switcher: a white button that opens a searchable white menu of every feeder, grouped by substation, each with
// its busiest transformer's load. Arrow keys move, Enter picks, Esc closes.
import { CaretDown, Check } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { State } from "../../api";
import { feeders, nice, tfsOf } from "../../model";
import { LoadPill, feederWorst } from "./shared";

interface Row {
  id: string;
  name: string;
  sub: string;
  tfs: string[];
  worst: number | null;
}

export default function FeederPicker({ s, feeder, setFeeder }: { s: State; feeder: string; setFeeder: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const uid = useId();

  const rows: Row[] = useMemo(
    () =>
      feeders(s).map((id) => ({
        id,
        name: nice(id),
        sub: s.tree[id]?.parent ?? "",
        tfs: tfsOf(s, id),
        worst: feederWorst(s, id),
      })),
    [s],
  );

  // Groups shown in the menu. Without a search: "Busiest right now" first (the demo story), then every substation.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (r: Row) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      nice(r.sub).toLowerCase().includes(needle) ||
      r.tfs.some((t) => nice(t).toLowerCase().includes(needle));
    const subs = [...new Set(rows.map((r) => r.sub))];
    const out: { title: string; rows: Row[] }[] = [];
    if (!needle) {
      const busy = [...rows].sort((a, b) => Math.abs(b.worst ?? 0) - Math.abs(a.worst ?? 0)).slice(0, 3);
      out.push({ title: "Busiest right now", rows: busy });
    }
    subs.forEach((sub) => {
      const rs = rows.filter((r) => r.sub === sub && hit(r)).sort((a, b) => a.name.localeCompare(b.name));
      if (rs.length) out.push({ title: `${nice(sub)} substation`, rows: rs });
    });
    return out;
  }, [rows, q]);
  const flat = groups.flatMap((g) => g.rows.map((r) => ({ ...r, key: `${g.title}|${r.id}` })));

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, flat.findIndex((r) => r.id === feeder)));
    const t = window.setTimeout(() => input.current?.focus(), 10);
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", away);
    };
    // only when the menu opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (id: string) => {
    setFeeder(id);
    setOpen(false);
    setQ("");
    btn.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) pick(flat[active].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
  };

  const cur = rows.find((r) => r.id === feeder);
  let idx = -1;

  return (
    <div ref={wrap} className="relative min-w-0">
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex w-full min-w-0 items-center gap-4 rounded-[14px] py-2 pl-4 pr-3.5 text-left shadow-[var(--shadow-card)] transition-[background-color,transform] duration-100 ease-linear hover:bg-fill-2 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_#fff,0_0_0_5px_var(--color-ink)] active:scale-[0.98] active:bg-fill sm:w-auto ${open ? "bg-fill-2" : "bg-card"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="t-caption block leading-none">Street feeder</span>
          <span className="mt-1 block text-[1.0625rem] font-semibold leading-tight tracking-[-0.016em] text-ink">{cur?.name ?? "Pick a feeder"}</span>
        </span>
        <LoadPill pct={cur?.worst ?? null} />
        <CaretDown size={14} weight="bold" className="shrink-0 text-secondary" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[18px] bg-card shadow-[0_12px_48px_rgb(0_0_0/0.14),0_1px_3px_rgb(0_0_0/0.06)]">
          <div className="p-2.5 pb-1">
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              role="combobox"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-activedescendant={flat[active] ? `${uid}-${active}` : undefined}
              aria-label="Search feeders, substations or transformers"
              placeholder="Search feeder, substation, transformer"
              className="w-full rounded-[10px] bg-fill px-3 py-2 text-[0.9375rem] text-ink outline-none placeholder:text-tertiary"
            />
          </div>
          <div ref={list} id={`${uid}-list`} role="listbox" aria-label="Feeders" className="scroll-thin max-h-[min(26rem,60vh)] overflow-y-auto px-2 pb-2">
            {flat.length === 0 && <div className="t-small px-3 py-6 text-center">No feeder matches "{q}"</div>}
            {groups.map((g) => (
              <div key={g.title} role="group" aria-label={g.title} className="pt-2">
                <div className="t-caption px-3 pb-1">{g.title}</div>
                {g.rows.map((r) => {
                  idx += 1;
                  const i = idx;
                  const on = i === active;
                  const sel = r.id === feeder;
                  return (
                    <div
                      key={`${g.title}|${r.id}`}
                      id={`${uid}-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={sel}
                      onPointerMove={() => setActive(i)}
                      onClick={() => pick(r.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 transition-colors duration-100 active:bg-fill ${on ? "bg-fill-2" : ""}`}
                    >
                      <span className="flex w-4 shrink-0 justify-center text-ink">{sel && <Check size={14} weight="bold" aria-hidden />}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[0.9375rem] leading-snug text-ink ${sel ? "font-semibold" : ""}`}>{r.name}</span>
                        <span className="t-caption block">
                          {r.tfs.length} transformers: {r.tfs.map((t) => nice(t)).join(", ")}
                        </span>
                      </span>
                      <LoadPill pct={r.worst} size="sm" />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
