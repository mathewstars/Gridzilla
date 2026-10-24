#!/usr/bin/env python3
"""Generate the Vienna-scale registry (platform/registry.yaml) and simulated households (agent/houses.json).

    python3 tools/gen-vienna.py

Deterministic (seeded). The real Blatnica plant and its heat pump stay on the first transformer of the first feeder.
Each simulated household stands for 10 real ones on the board (represents: 10). Households may have a battery,
an EV charger, and a heat pump or an electric boiler; every one of them is a Gridzilla device with the same agent logic.
"""
import json, random, pathlib, yaml

random.seed(2026)
ROOT = pathlib.Path(__file__).resolve().parent.parent

# Vienna grid: 110/22 kV substations -> 22 kV feeders -> street transformers (district names)
SUBS = {   # 110/22 kV substations with Wiener Netze names -> 22 kV feeders -> street transformers (district / Grätzl names)
    "sub:wien-sued":      {"rating_kw": 63000, "feeders": {"feeder:liesing-3":   ["atzgersdorf", "mauer", "siebenhirten"],
                                                            "feeder:favoriten-1": ["oberlaa", "rothneusiedl", "unterlaa"],
                                                            "feeder:inzersdorf-2": ["inzersdorf", "erlaa", "vosendorf"]}},
    "sub:wien-nord":      {"rating_kw": 63000, "feeders": {"feeder:floridsdorf-2": ["stammersdorf", "strebersdorf", "jedlesee"],
                                                            "feeder:donaustadt-4":  ["essling", "breitenlee", "suessenbrunn"],
                                                            "feeder:kagran-1":      ["kagran", "hirschstetten", "aspern"]}},
    "sub:wien-west":      {"rating_kw": 63000, "feeders": {"feeder:penzing-1":   ["huetteldorf", "hadersdorf", "weidlingau"],
                                                            "feeder:hietzing-2":  ["speising", "lainz", "ober-st-veit"],
                                                            "feeder:ottakring-3": ["ottakring", "wilhelminenberg", "hernals"]}},
    "sub:wien-ost":       {"rating_kw": 63000, "feeders": {"feeder:simmering-1": ["simmering", "kaiserebersdorf", "albern"],
                                                            "feeder:schwechat-2": ["schwechat", "mannswoerth", "rannersdorf"],
                                                            "feeder:lobau-3":     ["lobau", "muehlleiten", "gross-enzersdorf"]}},
    "sub:kendlerstrasse": {"rating_kw": 63000, "feeders": {"feeder:rudolfsheim-1": ["rudolfsheim", "fuenfhaus", "schmelz"],
                                                            "feeder:meidling-2":    ["meidling", "altmannsdorf", "hetzendorf"],
                                                            "feeder:margareten-3":  ["margareten", "wieden", "mariahilf"]}},
    "sub:wien-mitte":     {"rating_kw": 63000, "feeders": {"feeder:landstrasse-1": ["landstrasse", "erdberg", "st-marx"],
                                                            "feeder:leopoldstadt-2": ["leopoldstadt", "prater", "stuwerviertel"],
                                                            "feeder:innere-stadt-3": ["innere-stadt", "josefstadt", "alsergrund"]}},
    "sub:bisamberg":      {"rating_kw": 63000, "feeders": {"feeder:korneuburg-1": ["korneuburg", "langenzersdorf", "bisamberg"],
                                                            "feeder:gerasdorf-2":  ["gerasdorf", "seyring", "kapellerfeld"],
                                                            "feeder:stockerau-3":  ["stockerau", "leobendorf", "spillern"]}},
    "sub:schwarzenbergplatz": {"rating_kw": 63000, "feeders": {"feeder:doebling-1": ["doebling", "grinzing", "nussdorf"],
                                                                "feeder:waehring-2": ["waehring", "gersthof", "poetzleinsdorf"],
                                                                "feeder:brigittenau-3": ["brigittenau", "zwischenbruecken", "nordbahnhof"]}},
}
REPRESENTS = 4
tree = {"region:at": {"parent": None}}
devices, houses = [], []
tf_index = 0
for sub, sd in SUBS.items():
    tree[sub] = {"parent": "region:at", "rating_kw": sd["rating_kw"]}
    for feeder, tfs in sd["feeders"].items():
        tree[feeder] = {"parent": sub, "rating_kw": 4000}
        for name in tfs:
            tf_index += 1
            tf = f"tf:{name}-{tf_index}"
            rating = random.choice([250, 400, 400, 630])
            n = random.choice([3, 4, 4, 5]) if rating >= 400 else 3
            # size the street so the transformer sits at ~80-95 % at the evening peak without signals:
            # a program house peaks ~6 kW (house + part-time EV + heat), a house outside the program ~3.3 kW (ADMD incl. a few EVs)
            target = rating * random.uniform(0.80, 0.95)
            other = max(15, int((target - n * REPRESENTS * 6.0) / 3.3))
            tree[tf] = {"parent": feeder, "rating_kw": rating, "reverse_kw": rating, "other_houses": other}
            for k in range(n):
                hid = f"sim-{name}-{random.randint(10, 99)}"
                while any(d["id"] == hid for d in devices): hid = f"sim-{name}-{random.randint(10, 99)}"
                kw = random.choice([5, 5, 8, 10]); kwh = {5: 10, 8: 15, 10: 20}[kw] + random.choice([0, 5])
                combo = random.choices(["battery", "battery+ev", "battery+hp", "battery+boiler", "battery+ev+hp", "battery+ev+boiler", "battery+hp+boiler", "battery+ev+hp+boiler"],
                                       [0.12, 0.16, 0.16, 0.08, 0.20, 0.08, 0.08, 0.12])[0]
                has_ev = "ev" in combo; heats = [t for t in ("heatpump", "boiler") if (t == "heatpump" and "hp" in combo) or (t == "boiler" and "boiler" in combo)]
                heat = "+".join(heats) if heats else "none"
                devices.append({"id": hid, "tf": tf, "vendor": random.choice(["sim", "goodwe", "huawei", "fronius", "sma"]),
                                "kw": kw, "kwh": kwh, "feedin_max_kw": kw, "represents": REPRESENTS,
                                **({"ev_kw": 11} if has_ev else {}), **({"heat": heat} if heat != "none" else {})})
                h = {"id": hid, "kw": kw, "kwh": kwh, "feedin_max_kw": kw, "pv_kwp": random.choice([4, 6, 8, 10, 12]),
                     "soc": random.randint(25, 95), "start_hour": 16, "base_load_kw": round(random.uniform(0.3, 0.9), 1),
                     "peak_load_kw": round(random.uniform(2.0, 5.0), 1),
                     "owner": {"min_soc": random.choice([15, 20, 20, 25, 30]), "max_charge_kw": kw, "max_discharge_kw": kw, "opt_out": False}}
                if has_ev:
                    h["ev"] = {"kw": random.choice([7.4, 11, 11, 22]), "plugged": random.choice([[17, 23], [18, 23], [10, 16], [19, 24]])}
                h["heat"] = []
                if "heatpump" in heats:
                    h["heat"].append({"type": "heatpump", "kw": random.choice([2.5, 3, 4]), "tank_l": random.choice([200, 300]), "dhw_set_c": random.choice([48, 50, 52]),
                                      "floor_c": 40, "boost_c": 55})
                if "boiler" in heats:
                    h["heat"].append({"type": "boiler", "kw": random.choice([2, 3]), "tank_l": random.choice([120, 200]), "dhw_set_c": random.choice([55, 60]),
                                      "floor_c": 45, "boost_c": 65})
                if not h["heat"]: del h["heat"]
                houses.append(h)

# the real plant and its heat pump stay on the first transformer (Blatnica demo plant on top)
first_tf = next(t for t in tree if t.startswith("tf:"))
real = [
    {"id": "real-powerplant-blatnica", "tf": first_tf, "vendor": "victron", "kw": 10, "kwh": 15, "feedin_max_kw": 10, "represents": REPRESENTS, "ev_kw": 11, "household": "blatnica",
     "note": "the real Victron plant on VRM: Cerbo GX, MultiPlus-II, battery, EV Charging Station"},
    {"id": "vicare-blatnica", "tf": first_tf, "vendor": "viessmann", "kw": 3, "kwh": 0, "feedin_max_kw": 0, "represents": REPRESENTS, "heat": "heatpump", "household": "blatnica",
     "note": "the real Viessmann Vitocal at the same house, via ViCare"},
]
registry = {
    "tree": tree,
    "devices": real + devices,
    "policy": {"max_window_min": 1440, "max_stretch_window_min": 4320, "max_support_per_node_per_day": 96, "max_export_min_kw_per_device": 5,
               "max_import_cap_floor_kw": 2, "heartbeat_s": 30, "ramp_s": [20, 90],
               "autopilot_interval_s": 15, "autopilot_trigger_pct": 85, "autopilot_release_pct": 60, "autopilot_cooldown_min": 10, "autopilot_max_per_hour": 6},
}
hdr = ("# Gridzilla registry: Vienna-scale grid tree and the devices in the program. GENERATED by tools/gen-vienna.py, edit that instead.\n"
       "# Tree nodes are \"kind:name\". Kinds top down: region, sub (110/22 kV), feeder (22 kV), tf (street transformer).\n"
       "# other_houses: houses on the transformer NOT in the program (synthetic background load). represents: real houses per simulated device.\n"
       "# household: devices that belong to one house (grouped on the board). heat: heatpump | boiler (a controllable thermal load).\n\n")
(ROOT / "platform" / "registry.yaml").write_text(hdr + yaml.safe_dump(registry, sort_keys=False, width=140))
(ROOT / "agent" / "houses.json").write_text(json.dumps(houses, indent=1) + "\n")
n_tf = sum(1 for t in tree if t.startswith("tf:"))
print(f"tree: {len(SUBS)} substations, {sum(len(s['feeders']) for s in SUBS.values())} feeders, {n_tf} transformers; "
      f"{len(devices)} simulated households (+2 real) = {REPRESENTS * (len(devices) + 2)} houses represented; "
      f"EV: {sum(1 for d in devices if 'ev_kw' in d)}, heat pumps: {sum(1 for d in devices if 'heatpump' in d.get('heat', ''))}, boilers: {sum(1 for d in devices if 'boiler' in d.get('heat', ''))}, "
      f"all four: {sum(1 for d in devices if 'ev_kw' in d and d.get('heat') == 'heatpump+boiler')}")
