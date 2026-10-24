"""Live weather and official warnings for Gridzilla (stdlib only), for any place in Europe.

Env:   GZ_WEATHER=0 disables fetching (offline demo)   GZ_WEATHER_REFRESH_S=900 (at least 60)
       GZ_WEATHER_LAT / GZ_WEATHER_LON / GZ_WEATHER_NAME   location (default: lat/lon of the top registry node that has
                                                          them, else Wien-Liesing 48.14, 16.29)
       GZ_WEATHER_COUNTRY=AT   ISO code, picks the MeteoAlarm country feed
       GZ_WEATHER_AREA         MeteoAlarm EMMA_ID of the region (e.g. AT923); without it the region is matched by name
       GZ_WEATHER_URL          forecast base URL (Open-Meteo free API by default)

- Forecast: Open-Meteo (global, no key), current values and the next 48 hours.
- Official warnings: MeteoAlarm (EUMETNET, ~38 European countries) is the primary source, chosen by GZ_WEATHER_COUNTRY and
  filtered to the region of the location. The feed carries no area polygons, so the region is matched by EMMA_ID
  (GZ_WEATHER_AREA) or else by the location name; if the name matches no area, the country-level list is kept and
  the summary says those warnings are elsewhere in the country.
  In Austria, GeoSphere Austria's coordinate-based warnings are added as a more local source when they work.
  Never invents a warning: if every source fails, the last known list (or an empty one) is served.
- A background loop refreshes every GZ_WEATHER_REFRESH_S seconds and keeps the last good result (stale: true on failure).
- grid_view maps the forecast onto the platform's simulated grid clock: grid hour h uses the real forecast at the next
  real occurrence of local hour h.
- Factors for the live-weather scenario, applied to the houses outside the program:
    load_x = 1 + 0.016 * max(0, 15 - feels_c), capped at 1.6     heating degrees on apparent temperature:
                                                                  1.0 at 15 °C and above, 1.4 at -10 °C
    pv_x   = sun_wm2 / clear-sky sun_wm2, clipped to 0 .. 1.2    Haurwitz clear-sky model for the sun position at the
                                                                  location, 0 at night, about 1 on a clear day
"""
import json, math, os, re, threading, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

ENABLED = os.environ.get("GZ_WEATHER", "1") != "0"


def refresh_interval(raw, default=900.0, minimum=60.0):
    """GZ_WEATHER_REFRESH_S in seconds: the default for a value that is not a finite number, at least `minimum`."""
    try:
        s = float(raw)
    except (TypeError, ValueError):
        s = math.nan
    if not math.isfinite(s):
        print(f"[weather] GZ_WEATHER_REFRESH_S={raw!r} is not a number, refreshing every {default:.0f} s", flush=True)
        return default
    return max(minimum, s)


REFRESH_S = refresh_interval(os.environ.get("GZ_WEATHER_REFRESH_S", "900"))
LOC = {"name": "Wien-Liesing", "lat": 48.14, "lon": 16.29}
COUNTRY = os.environ.get("GZ_WEATHER_COUNTRY", "AT").upper()
AREA = os.environ.get("GZ_WEATHER_AREA")
# The free Open-Meteo API is for non-commercial use; a production deployment points this at their paid commercial endpoint.
FORECAST_URL = os.environ.get("GZ_WEATHER_URL", "https://api.open-meteo.com/v1/forecast")
VARS = "temperature_2m,apparent_temperature,cloud_cover,shortwave_radiation,wind_speed_10m,wind_gusts_10m,precipitation"
GEOSPHERE = "https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon={lon}&lat={lat}&lang=en"
METEOALARM = "https://feeds.meteoalarm.org/api/v1/warnings/feeds-{}"
MA_FEEDS = {"AT": "austria", "BE": "belgium", "BA": "bosnia-herzegovina", "BG": "bulgaria", "HR": "croatia", "CY": "cyprus",
            "CZ": "czechia", "DK": "denmark", "EE": "estonia", "FI": "finland", "FR": "france", "DE": "germany", "GR": "greece",
            "HU": "hungary", "IS": "iceland", "IE": "ireland", "IL": "israel", "IT": "italy", "LV": "latvia", "LT": "lithuania",
            "LU": "luxembourg", "MT": "malta", "MD": "moldova", "ME": "montenegro", "NL": "netherlands",
            "MK": "republic-of-north-macedonia", "NO": "norway", "PL": "poland", "PT": "portugal", "RO": "romania",
            "RS": "serbia", "SK": "slovakia", "SI": "slovenia", "ES": "spain", "SE": "sweden", "CH": "switzerland",
            "GB": "united-kingdom", "UK": "united-kingdom", "UA": "ukraine"}


def configure(tree=None):
    """Location: env first, then the top registry node that carries lat/lon, then Wien-Liesing.
    A value that is not a number is logged and the location stays as it was."""
    global AREA
    try:
        loc = dict(LOC)
        nodes = [(n, v) for n, v in (tree or {}).items() if v.get("lat") is not None and v.get("lon") is not None]
        if nodes:
            def depth(n):
                d = 0
                while tree[n].get("parent"):
                    n, d = tree[n]["parent"], d + 1
                return d
            n, v = min(nodes, key=lambda nv: depth(nv[0]))
            loc.update(name=v.get("name") or n.split(":", 1)[-1], lat=float(v["lat"]), lon=float(v["lon"]))
        loc["name"] = os.environ.get("GZ_WEATHER_NAME", loc["name"])
        loc["lat"] = float(os.environ.get("GZ_WEATHER_LAT", loc["lat"]))
        loc["lon"] = float(os.environ.get("GZ_WEATHER_LON", loc["lon"]))
        LOC.update(loc)
    except Exception as e:
        print(f"[weather] bad location setting, staying at {LOC['name']} ({LOC['lat']}, {LOC['lon']}): {e}", flush=True)
    if AREA is None and COUNTRY == "AT" and (LOC["lat"], LOC["lon"]) == (48.14, 16.29):
        AREA = "AT923"                  # EMMA_ID of Wien Liesing, the default location
    return LOC


CACHE = {"fetched_at": None, "stale": True, "offset_s": 7200, "now": None, "hourly": [], "warnings": [], "warning_sources": [], "error": None}
_lock = threading.Lock()


def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "gridzilla-platform"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- parsing
def parse_open_meteo(d):
    """Open-Meteo response -> (utc offset s, now dict, hourly list) in the /api/weather field names.
    Hours without a temperature or apparent temperature (JSON null) are dropped."""
    def row(src, i=None):
        g = (lambda k: src[k][i]) if i is not None else (lambda k: src[k])
        return {"temp_c": g("temperature_2m"), "feels_c": g("apparent_temperature"), "cloud_pct": g("cloud_cover"),
                "sun_wm2": g("shortwave_radiation"), "wind_kmh": g("wind_speed_10m"), "gust_kmh": g("wind_gusts_10m"),
                "precip_mm": g("precipitation")}
    h = d["hourly"]
    hourly = [{"time": t, "hour": int(t[11:13]), **row(h, i)} for i, t in enumerate(h["time"])]
    hourly = [r for r in hourly if r["temp_c"] is not None and r["feels_c"] is not None]
    return d.get("utc_offset_seconds") or 0, row(d["current"]), hourly


GS_TYPES = {1: "wind", 2: "rain", 3: "snow", 4: "ice", 5: "thunder", 6: "heat", 7: "frost"}   # warntypid: 1 = storm
LEVELS = {1: "yellow", 2: "orange", 3: "red"}


def parse_geosphere(d, at=None):
    """GeoSphere getWarningsForCoords -> warnings still running or ahead (spec: openapi.hub.geosphere.at/warnapi/v1)."""
    at = at or datetime.now(timezone.utc)
    out = []
    for w in (d.get("properties") or {}).get("warnings") or []:
        p = w.get("properties") or {}
        raw = p.get("rawinfo") or {}
        level, typ = raw.get("wlevel", p.get("warnstufeid")), raw.get("wtype", p.get("warntypid"))
        if level not in LEVELS or not raw.get("start") or not raw.get("end"):
            continue
        t0 = datetime.fromtimestamp(int(raw["start"]), timezone.utc)
        t1 = datetime.fromtimestamp(int(raw["end"]), timezone.utc)
        if t1 <= at:
            continue
        out.append({"level": LEVELS[level], "type": GS_TYPES.get(typ, "other"), "title": p.get("text") or "",
                    "from": iso(t0), "to": iso(t1), "source": "geosphere"})
    return out


MA_TYPES = {1: "wind", 2: "snow", 3: "thunder", 5: "heat", 6: "frost", 10: "rain", 12: "rain", 13: "rain"}


def _words(text):
    return {w for w in re.split(r"[^a-zäöüßàâçéèêëîïôûùÿñæœåøąćęłńóśźżčďěňřšťůžőű]+", (text or "").lower()) if len(w) >= 3}


def parse_meteoalarm(d, area=None, name=None, at=None):
    """MeteoAlarm country feed -> (warnings, scope). Region filter by EMMA_ID `area`, else by the words of `name`
    in the area description; scope is "region", or "country" when neither is given or the name matches no area
    (titles then carry the area). English text preferred, expired warnings dropped. CAP messages that are not
    Actual, Cancel messages, and every message an Update or Cancel references are dropped."""
    at = at or datetime.now(timezone.utc)
    feed = [w.get("alert") or {} for w in d.get("warnings") or []]
    superseded = {ref.split(",")[1] for a in feed for ref in (a.get("references") or "").split() if ref.count(",") >= 2}
    alerts = [a for a in feed if a.get("status", "Actual") == "Actual" and a.get("msgType") != "Cancel"
              and a.get("identifier") not in superseded]

    def areas(i):
        return i.get("area") or []

    if area:
        hit = lambda ar: any(g.get("value") == area for g in ar.get("geocode") or [])
    elif name and any(_words(name) <= _words(ar.get("areaDesc")) for a in feed for i in a.get("info") or [] for ar in areas(i)):
        hit = lambda ar: _words(name) <= _words(ar.get("areaDesc"))
    else:
        hit = None
    out = {}
    for a in alerts:
        infos = [i for i in a.get("info") or [] if hit is None or any(hit(ar) for ar in areas(i))]
        if not infos:
            continue
        info = next((i for i in infos if i.get("language", "").startswith("en")), infos[0])
        par = {p.get("valueName"): p.get("value", "") for p in info.get("parameter") or []}
        try:
            level = int(par.get("awareness_level", "").split(";")[0]) - 1     # 2 = yellow, 3 = orange, 4 = red
            typ = int(par.get("awareness_type", "").split(";")[0])
            t0 = datetime.fromisoformat(info.get("onset") or info["effective"])
            t1 = datetime.fromisoformat(info["expires"])
        except (ValueError, KeyError):
            continue
        if level not in LEVELS or t1 <= at:
            continue
        title = info.get("headline") or info.get("event") or ""
        if hit is None:
            title += ", " + ", ".join(ar.get("areaDesc", "") for ar in areas(info))
        key = (level, typ, info.get("onset"), info.get("expires"), title)     # Update messages repeat the same warning
        out[key] = {"level": LEVELS[level], "type": MA_TYPES.get(typ, "other"), "title": title,
                    "from": iso(t0.astimezone(timezone.utc)), "to": iso(t1.astimezone(timezone.utc)), "source": "meteoalarm"}
    return list(out.values()), ("country" if hit is None else "region")


# ---------------------------------------------------------------- factors
def load_factor(feels_c):
    """Heating demand of the houses outside the program: 1.0 at 15 °C apparent and above, +0.016 per degree below."""
    return round(min(1.6, 1.0 + 0.016 * max(0.0, 15.0 - feels_c)), 3)


def clear_sky_wm2(local_time, offset_s, lat=None, lon=None):
    """Haurwitz clear-sky global horizontal irradiance at a moment given in local time."""
    lat, lon = LOC["lat"] if lat is None else lat, LOC["lon"] if lon is None else lon
    t = local_time - timedelta(seconds=offset_s)                 # UTC
    doy = t.timetuple().tm_yday
    decl = math.radians(23.44) * math.sin(2 * math.pi * (284 + doy) / 365)
    b = 2 * math.pi * (doy - 81) / 364
    eot = 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)       # equation of time, minutes
    solar_h = t.hour + t.minute / 60 + lon / 15 + eot / 60
    ha = math.radians(15 * (solar_h - 12))
    la = math.radians(lat)
    cz = math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)
    return 1098 * cz * math.exp(-0.057 / cz) if cz > 0.01 else 0.0


def pv_factor(sun_wm2, local_time, offset_s):
    """Measured sun relative to clear sky. Open-Meteo radiation is the mean of the preceding hour, so the
    reference is taken half an hour earlier."""
    clear = clear_sky_wm2(local_time - timedelta(minutes=30), offset_s)
    if clear < 20 or sun_wm2 is None:
        return 0.0
    return round(min(1.2, max(0.0, sun_wm2 / clear)), 3)


# ---------------------------------------------------------------- grid clock
def local_now(offset_s):
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=offset_s)


def next_occurrence(hourly, hour, offset_s, at=None):
    """The forecast row at the next real occurrence of local hour of day `hour` (this hour counts)."""
    at = (at or local_now(offset_s)).replace(minute=0, second=0, microsecond=0)
    for r in hourly:
        if r["hour"] == hour and datetime.fromisoformat(r["time"]) >= at:
            return r
    return None


def grid_view(sim_h, data=None, at=None):
    """The next 24 grid hours, each with the real forecast at the next real occurrence of that local hour."""
    data = data or CACHE
    out = []
    for k in range(24):
        h = (int(sim_h) + k) % 24
        r = next_occurrence(data["hourly"], h, data["offset_s"], at)
        if not r:
            continue
        out.append({"h": float(h), "temp_c": r["temp_c"], "sun_wm2": r["sun_wm2"], "cloud_pct": r["cloud_pct"],
                    "wind_kmh": r["wind_kmh"], "load_x": load_factor(r["feels_c"]),
                    "pv_x": pv_factor(r["sun_wm2"], datetime.fromisoformat(r["time"]), data["offset_s"]),
                    "feels_c": r["feels_c"], "gust_kmh": r["gust_kmh"]})
    return out


_fx = {"key": None, "by_hour": {}}


def factors_at(hour):
    """(load_x, pv_x) at grid hour `hour`, linear between whole hours; None without weather data."""
    key = (CACHE["fetched_at"], local_now(CACHE["offset_s"]).hour)
    if _fx["key"] != key:
        try:
            by = {int(r["h"]): (r["load_x"], r["pv_x"]) for r in grid_view(0)}
        except Exception as e:
            print(f"[weather] no live-weather factors: {e}", flush=True)
            by = {}
        _fx["by_hour"], _fx["key"] = by, key
    by = _fx["by_hour"]
    if not by:
        return None
    hour %= 24
    h0 = int(hour)
    a, b = by.get(h0), by.get((h0 + 1) % 24)
    if not a or not b:
        return a or b
    f = hour - h0
    return a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f


# ---------------------------------------------------------------- summary
def summary(view, warnings, sources=()):
    """One plain-English sentence about the next 6 grid hours. `sources` as in CACHE["warning_sources"]: a
    country-level MeteoAlarm warning is said to be elsewhere in the country, with its area."""
    if not view:
        return "No weather data." if ENABLED else "Weather is off (GZ_WEATHER=0)."
    six = [dict(r) for r in view[:6]]
    parts = []
    evening = [r for r in six if 16 <= r["h"] <= 21]
    if evening:
        r = min(evening, key=lambda r: r["feels_c"])
        temp = f"{r['temp_c']:.0f} °C at {int(r['h']):02d}:00 (feels {r['feels_c']:.0f} °C)"
        if r["feels_c"] < 5:
            parts.append(f"Cold evening: {temp}, so expect a strong heat-pump peak")
        elif r["feels_c"] < 12:
            parts.append(f"Cool evening: {temp}, so expect a normal heat-pump peak")
        else:
            parts.append(f"Mild evening: {temp}, so little heating on top of the usual peak")
    else:
        r = min(six, key=lambda r: r["feels_c"])
        parts.append(f"{r['temp_c']:.0f} °C at {int(r['h']):02d}:00 (feels {r['feels_c']:.0f} °C)"
                     + (", so heat pumps run hard" if r["feels_c"] < 5 else ""))
    day = [r for r in six if r["pv_x"] > 0]
    if day:
        best = max(day, key=lambda r: r["sun_wm2"])
        if best["sun_wm2"] >= 400 and best["pv_x"] >= 0.6:
            parts.append(f"strong sun around {int(best['h']):02d}:00 ({best['sun_wm2']:.0f} W/m²), so expect PV backflow at midday")
        elif best["sun_wm2"] < 150:
            parts.append("little sun" + (f" after {int(day[0]['h']):02d}:00" if len(day) > 1 else ""))
        else:
            parts.append(f"some sun, up to {best['sun_wm2']:.0f} W/m² at {int(best['h']):02d}:00")
    gust = max(six, key=lambda r: r["gust_kmh"] or 0)
    if (gust["gust_kmh"] or 0) >= 60:
        parts.append(f"gusts up to {gust['gust_kmh']:.0f} km/h around {int(gust['h']):02d}:00")
    if warnings:
        country_wide = "meteoalarm:country" in sources
        far = lambda w: country_wide and w["source"] == "meteoalarm"
        w = next((w for w in warnings if not far(w)), warnings[0])
        text = f"official {w['level']} {w['type']} warning"
        if far(w):
            text += f" elsewhere in {COUNTRY}, for {w['title'].split(', ', 1)[-1]}"
        parts.append(text + (f" (+{len(warnings) - 1} more)" if len(warnings) > 1 else ""))
    return "; ".join(parts) + "."


# ---------------------------------------------------------------- fetch and serve
def fetch_warnings():
    """MeteoAlarm for the country (primary), plus GeoSphere for the coordinates in Austria. A warning both report once
    is kept as MeteoAlarm's copy for the region, but as GeoSphere's local copy when MeteoAlarm only gave the country list.
    Returns (warnings, sources that answered); an empty source list means every source failed."""
    out, ok, scope = [], [], None
    feed = MA_FEEDS.get(COUNTRY)
    if feed:
        try:
            ws, scope = parse_meteoalarm(get_json(METEOALARM.format(feed)), AREA, LOC["name"])
            out += ws
            ok.append(f"meteoalarm:{scope}")
        except Exception as e:
            print(f"[weather] MeteoAlarm warnings failed: {e}", flush=True)
    else:
        print(f"[weather] no MeteoAlarm feed for country {COUNTRY}", flush=True)
    if COUNTRY == "AT":
        try:
            ws = parse_geosphere(get_json(GEOSPHERE.format(lat=LOC["lat"], lon=LOC["lon"])))
            same = lambda w: (w["type"], w["from"], w["to"])      # the same warning reaches MeteoAlarm from GeoSphere
            if scope == "country":
                local = {same(w) for w in ws}
                out = [w for w in out if same(w) not in local] + ws
            else:
                seen = {same(w) for w in out}
                out += [w for w in ws if same(w) not in seen]
            ok.append("geosphere")
        except Exception as e:
            print(f"[weather] GeoSphere warnings failed: {e}", flush=True)
    return out, ok


def refresh():
    """Forecast and warnings, each kept from the last good fetch when its source fails. True if the forecast came."""
    q = urllib.parse.urlencode({"latitude": LOC["lat"], "longitude": LOC["lon"], "timezone": "auto",
                                "forecast_hours": 48, "hourly": VARS, "current": VARS})
    try:
        offset, cur, hourly = parse_open_meteo(get_json(f"{FORECAST_URL}?{q}"))
        error = None
    except Exception as e:
        error = f"forecast: {e}"
        print(f"[weather] forecast fetch failed, serving last good data: {e}", flush=True)
    warnings, ok = fetch_warnings()
    with _lock:
        if error:
            CACHE["stale"], CACHE["error"] = True, error
        else:
            CACHE.update({"fetched_at": iso(datetime.now(timezone.utc)), "stale": False, "offset_s": offset,
                          "now": cur, "hourly": hourly, "error": None})
        if ok:                       # every warning source down: keep the last list we know
            CACHE["warnings"], CACHE["warning_sources"] = warnings, ok
    forecast = "no forecast" if error else f"{cur['temp_c']} °C, {len(hourly)} h forecast"
    print(f"[weather] {LOC['name']}: {forecast}, {len(warnings)} warnings "
          f"({', '.join(ok) or 'no warning source answered'})", flush=True)
    return error is None


def loop(tree=None):
    """Background refresh, started from gridzilla.main() with the registry tree. Never raises."""
    configure(tree)
    if not ENABLED:
        print("[weather] off (GZ_WEATHER=0)", flush=True)
        return
    while True:
        try:
            refresh()
        except Exception as e:
            print(f"[weather] {e}", flush=True)
        time.sleep(REFRESH_S)


def active_warnings():
    t = iso(datetime.now(timezone.utc))
    return [w for w in CACHE["warnings"] if w["to"] > t]


def snapshot(sim_h):
    """/api/weather"""
    with _lock:
        view, warnings = grid_view(sim_h), active_warnings()
        return {"location": dict(LOC), "source": "open-meteo",
                "fetched_at": CACHE["fetched_at"], "stale": CACHE["stale"], "now": CACHE["now"],
                "hourly": CACHE["hourly"], "warnings": warnings,
                "summary": summary(view, warnings, CACHE["warning_sources"]),
                "grid_view": [{k: r[k] for k in ("h", "temp_c", "sun_wm2", "cloud_pct", "wind_kmh", "load_x", "pv_x")}
                              for r in view]}


def llm_context(sim_h):
    """Compact weather block for DeepSeek, None without data or when it cannot be built."""
    try:
        with _lock:
            view, warnings = grid_view(sim_h), active_warnings()
            if not view:
                return None
            return {"summary": summary(view, warnings, CACHE["warning_sources"]), "stale": CACHE["stale"],
                    "next_6_grid_hours": [{k: r[k] for k in ("h", "temp_c", "feels_c", "sun_wm2", "wind_kmh", "load_x", "pv_x")}
                                          for r in view[:6]],
                    "warnings": [{k: w[k] for k in ("level", "type", "title", "from", "to")} for w in warnings]}
    except Exception as e:
        print(f"[weather] no weather context for the autopilot: {e}", flush=True)
        return None
