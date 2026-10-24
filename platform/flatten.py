"""Gridzilla flattening: the monster's diet plan.

Every transformer gets a 24-hour plan, re-planned every two grid hours, sent as a SHAPE signal: two per-15-minute
ceilings for every house in the program (import and export). The algorithm is water-filling:

  1. forecast the load nobody controls: houses outside the program (weather-aware profile), the program houses' own
     base load, minus their PV;
  2. count the flexible energy behind the transformer: the cars' overnight charge (kWh), the batteries' usable energy
     for the peak, the batteries' free capacity for the midday PV;
  3. find the lowest level L such that the cars' energy fits in the valley below L between plug-in and morning AND the
     peak above L fits in the batteries. L is the flattest shape the street can physically have;
  4. find the lowest export level Le such that the PV surplus above Le fits in the batteries' free capacity;
  5. the per-house ceilings per slot are (L - uncontrolled) / houses and (Le + uncontrolled) / houses.

A car plugged in at 18:00 therefore trickles through the peak and charges fast at 02:00; a battery discharges exactly
the slice above L and recharges from the noon surplus below Le. Owners' own limits always win on the device.
"""
import math

SLOTS = 96                  # 24 h in 15-minute slots
DT = 0.25                   # hours per slot
MARGIN = 0.9                # never plan past 90 % of the rating
EV_KWH_SESSION = 16.0       # a commute: the fleet draws 6-26 kWh when it charges
EV_P_CHARGE = 0.55          # a car charges on about 55 % of nights (home-charging surveys: 2-4 sessions a week)
EV_KWH_DAY = EV_KWH_SESSION * EV_P_CHARGE   # expected kWh per EV house per night
EV_ARRIVE = (17.0, 21.5)    # uncontrolled charging starts spread over the evening arrivals, not all at 17:00
EV_PLUG_H, EV_UNPLUG_H = 17.0, 7.0
PV_KWP_AVG = 8.0            # program houses: average array size
BASE_FLOOR_KW = 2.0         # protocol floor for an import ceiling
EXP_FLOOR_KW = 0.5


def program_base_kw(h):
    """kW an in-program house draws without car, battery or PV: base, morning and evening bumps."""
    h %= 24
    return 0.6 + (3.0 if 17 <= h <= 21 else 0) + (1.5 if 6 <= h <= 8 else 0)


def sun(h):
    return max(0.0, math.sin(((h % 24) - 6) / 12 * math.pi))


def in_window(h, a, b):
    h %= 24
    return (a <= h < b) if a < b else (h >= a or h < b)


def _fill(level, unc, mask):
    return sum(max(0.0, level - u) for u, m in zip(unc, mask) if m) * DT


def _shave(level, unc):
    return sum(max(0.0, u - level) for u in unc) * DT


def _bisect(f, lo, hi, target, rising=True, it=40):
    """Smallest x in [lo, hi] with f(x) >= target (rising f) or f(x) <= target (falling f)."""
    for _ in range(it):
        mid = (lo + hi) / 2
        ok = f(mid) >= target if rising else f(mid) <= target
        if ok: hi = mid
        else: lo = mid
    return hi


def plan_tf(tf, info, h0, other_kw, houses, ev_houses, pv_x, batt_kwh_usable, batt_kwh_free, pv_kwp=PV_KWP_AVG, bias_kw=0.0):
    """other_kw(h) -> kW of the houses outside the program at grid hour h. Returns the plan dict for one transformer."""
    rating = info["rating_kw"]; rev = info.get("reverse_kw", rating)
    hours = [h0 + k * DT for k in range(SLOTS)]
    other = [other_kw(h) for h in hours]
    base = [houses * program_base_kw(h) for h in hours]
    pvx = pv_x if callable(pv_x) else (lambda h: pv_x)
    pv = [houses * pv_kwp * 0.7 * sun(h) * pvx(h) for h in hours]
    unc = [o + b - p + bias_kw for o, b, p in zip(other, base, pv)]            # nobody controls this part; bias = what the last plan missed
    ev_mask = [in_window(h, EV_PLUG_H, EV_UNPLUG_H) for h in hours]
    e_ev = ev_houses * EV_KWH_DAY
    cap = MARGIN * rating
    # naive (no Gridzilla): every car that charges tonight starts at 11 kW when it arrives (arrivals spread over
    # EV_ARRIVE) and stops when full; the fraction of sessions active at hour h is the overlap with that spread
    dur = EV_KWH_SESSION / 11.0
    a0, a1 = EV_ARRIVE
    starts = [a0 + k * 0.25 for k in range(int((a1 - a0) / 0.25))]
    def active_frac(h):
        hh = h % 24
        return sum(1 for st in starts if st <= hh < st + dur or st <= hh + 24 < st + dur) / len(starts)
    naive_ev = [ev_houses * EV_P_CHARGE * 11.0 * active_frac(h) for h in hours]
    naive = [u + n for u, n in zip(unc, naive_ev)]
    # level L: cars fit below it, the peak above it fits in the batteries
    lo, hi = min(unc) - 1, max(max(unc), cap) + 1
    l_ev = _bisect(lambda L: _fill(L, unc, ev_mask), lo, hi, e_ev, rising=True) if e_ev > 0 and any(ev_mask) else lo
    l_batt = _bisect(lambda L: _shave(L, unc), lo, hi, batt_kwh_usable, rising=False)
    level = min(cap, max(l_ev, l_batt, BASE_FLOOR_KW * houses + min(other)))
    # export level: PV surplus above it fits in the batteries' free capacity (unc negative = export)
    exp_unc = [-u for u in unc]
    e_lo, e_hi = 0.0, max(max(exp_unc), 1.0) + 1
    le = _bisect(lambda L: _shave(L, exp_unc), e_lo, e_hi, batt_kwh_free, rising=False)
    le = min(MARGIN * rev, max(le, EXP_FLOOR_KW * houses))
    # what the street draws with the plan: from plug-in on, the cars take whatever room is below L (at most 11 kW each)
    # until their energy is in; the batteries take the slice above L. Greedy, earliest first, like the real chargers.
    fill_room = _fill(level, unc, ev_mask)
    planned, left = [], e_ev
    for u, m in zip(unc, ev_mask):
        add = 0.0
        if m and left > 0:
            add = min(max(0.0, level - u), ev_houses * 11.0, left / DT)
            left -= add * DT
        v = min(u, level) + add                                             # above L the battery discharges the difference
        if v < -le: v = -le                                                  # above Le the battery absorbs the surplus
        planned.append(v)
    shaved = _shave(level, unc)
    imp = [round(max(BASE_FLOOR_KW, (level - o) / houses), 1) for o in other]
    exp = [round(max(0.0, min(15.0, (le + o) / houses)), 1) for o in other]
    peak_naive = max(naive); peak_plan = max(planned)
    return {"tf": tf, "rating_kw": rating, "houses": houses, "ev_houses": ev_houses, "start_h": round(h0 % 24, 2), "bias_kw": round(bias_kw, 1),
            "level_kw": round(level, 1), "export_level_kw": round(le, 1),
            "ev_kwh": round(e_ev, 1), "batt_kwh_usable": round(batt_kwh_usable, 1), "batt_kwh_free": round(batt_kwh_free, 1),
            "shaved_kwh": round(min(shaved, batt_kwh_usable), 1), "shifted_kwh": round(min(e_ev, fill_room), 1),
            "peak_naive_kw": round(peak_naive, 1), "peak_plan_kw": round(peak_plan, 1),
            "peak_naive_pct": round(100 * peak_naive / rating), "peak_plan_pct": round(100 * peak_plan / rating),
            "cars_full": e_ev <= fill_room + 1e-6,
            "hours": [round(h % 24, 2) for h in hours], "other_kw": [round(x, 1) for x in other], "base_kw": [round(x, 1) for x in base],
            "pv_kw": [round(x, 1) for x in pv], "naive_kw": [round(x, 1) for x in naive], "planned_kw": [round(x, 1) for x in planned],
            "import_max_kw": imp, "export_max_kw": exp}


def aggregate(plans, node_name, rating):
    """Sum the per-transformer plans into a plan for a feeder, a substation or the city."""
    if not plans:
        return None
    n = len(plans[0]["hours"])
    s = lambda key: [round(sum(p[key][k] for p in plans), 1) for k in range(n)]
    naive, planned = s("naive_kw"), s("planned_kw")
    out = {"tf": node_name, "rating_kw": rating, "houses": sum(p["houses"] for p in plans), "ev_houses": sum(p["ev_houses"] for p in plans),
           "start_h": plans[0]["start_h"], "level_kw": round(sum(p["level_kw"] for p in plans), 1), "export_level_kw": round(sum(p["export_level_kw"] for p in plans), 1),
           "ev_kwh": round(sum(p["ev_kwh"] for p in plans), 1), "batt_kwh_usable": round(sum(p["batt_kwh_usable"] for p in plans), 1),
           "batt_kwh_free": round(sum(p["batt_kwh_free"] for p in plans), 1), "shaved_kwh": round(sum(p["shaved_kwh"] for p in plans), 1),
           "shifted_kwh": round(sum(p["shifted_kwh"] for p in plans), 1), "peak_naive_kw": round(max(naive), 1), "peak_plan_kw": round(max(planned), 1),
           "peak_naive_pct": round(100 * max(naive) / rating), "peak_plan_pct": round(100 * max(planned) / rating),
           "cars_full": all(p["cars_full"] for p in plans), "hours": plans[0]["hours"],
           "other_kw": s("other_kw"), "base_kw": s("base_kw"), "pv_kw": s("pv_kw"), "naive_kw": naive, "planned_kw": planned,
           "tfs": [{"tf": p["tf"], "rating_kw": p["rating_kw"], "level_kw": p["level_kw"], "peak_naive_pct": p["peak_naive_pct"], "peak_plan_pct": p["peak_plan_pct"], "houses": p["houses"], "ev_houses": p["ev_houses"]} for p in plans]}
    return out
