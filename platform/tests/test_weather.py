"""Offline tests for weather.py: parsing recorded responses and the scenario factors. Never touches the network.

Run:   cd platform && python3 -m unittest discover -s tests
Fixtures: open-meteo-liesing.json and meteoalarm-austria.json are real responses (24 and 20 Oct 2026, trimmed);
geosphere-spec-example.json is the example from GeoSphere's own OpenAPI spec (openapi.hub.geosphere.at/warnapi/v1).
"""
import json, sys, unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import weather  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIX / name).read_text())


def no_network(*a, **k):
    raise AssertionError("tests must not hit the network")


@mock.patch("urllib.request.urlopen", no_network)
class ParseTest(unittest.TestCase):
    def test_open_meteo(self):
        offset, now, hourly = weather.parse_open_meteo(fixture("open-meteo-liesing.json"))
        self.assertEqual(offset, 7200)
        self.assertEqual(set(now), {"temp_c", "feels_c", "cloud_pct", "sun_wm2", "wind_kmh", "gust_kmh", "precip_mm"})
        self.assertEqual(now["temp_c"], 11.5)
        self.assertEqual(len(hourly), 48)
        self.assertEqual(hourly[0]["time"], "2026-10-24T11:00")
        self.assertEqual(hourly[0]["hour"], 11)
        self.assertEqual(hourly[13]["hour"], 0)

    def test_geosphere(self):
        d = fixture("geosphere-spec-example.json")
        ws = weather.parse_geosphere(d, at=datetime(2023, 3, 27, 7, 0, tzinfo=timezone.utc))
        self.assertEqual(len(ws), 2)
        self.assertEqual(ws[0], {"level": "yellow", "type": "wind", "title": ws[0]["title"],
                                 "from": "2023-03-27T06:00:00Z", "to": "2023-03-27T16:00:00Z", "source": "geosphere"})
        self.assertIn("Windwarnung", ws[0]["title"])
        self.assertEqual(weather.parse_geosphere(d, at=datetime(2023, 3, 29, tzinfo=timezone.utc)), [])   # all over

    def test_meteoalarm_region(self):
        d = fixture("meteoalarm-austria.json")
        during = datetime(2026, 10, 22, 8, 0, tzinfo=timezone.utc)
        ws, scope = weather.parse_meteoalarm(d, area="AT923", at=during)
        self.assertEqual(scope, "region")
        self.assertEqual(ws, [{"level": "yellow", "type": "wind", "title": "Stormwarning", "from": "2026-10-22T00:00:00Z",
                               "to": "2026-10-22T10:00:00Z", "source": "meteoalarm"}])
        self.assertEqual(weather.parse_meteoalarm(d, name="Wien-Liesing", at=during), (ws, "region"))
        self.assertEqual(weather.parse_meteoalarm(d, area="AT923", at=datetime(2026, 10, 23, tzinfo=timezone.utc))[0], [])

    def test_meteoalarm_country_fallback(self):
        d = fixture("meteoalarm-austria.json")
        ws, scope = weather.parse_meteoalarm(d, name="Graz", at=datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc))
        self.assertEqual(scope, "country")
        self.assertTrue(ws and all(", " in w["title"] for w in ws))        # titles name the area
        self.assertTrue(any("Innsbruck" in w["title"] for w in ws))


class FactorTest(unittest.TestCase):
    def test_load_factor(self):
        self.assertEqual(weather.load_factor(20), 1.0)
        self.assertEqual(weather.load_factor(15), 1.0)
        self.assertAlmostEqual(weather.load_factor(-10), 1.4)
        self.assertEqual(weather.load_factor(-40), 1.6)
        self.assertLess(weather.load_factor(5), weather.load_factor(0))

    def test_pv_factor(self):
        noon = datetime(2026, 10, 24, 13, 0)           # local CEST, sun highest about 12:50
        clear = weather.clear_sky_wm2(datetime(2026, 10, 24, 12, 30), 7200, 48.14, 16.29)
        self.assertTrue(400 < clear < 650, clear)       # late October in Vienna
        self.assertAlmostEqual(weather.pv_factor(clear, noon, 7200), 1.0, places=2)
        self.assertLess(weather.pv_factor(clear * 0.3, noon, 7200), 0.35)
        self.assertEqual(weather.pv_factor(0, datetime(2026, 10, 24, 22, 0), 7200), 0.0)
        self.assertEqual(weather.pv_factor(50, datetime(2026, 10, 24, 3, 0), 7200), 0.0)


class GridViewTest(unittest.TestCase):
    def setUp(self):
        offset, now, hourly = weather.parse_open_meteo(fixture("open-meteo-liesing.json"))
        self.data = {"offset_s": offset, "hourly": hourly}
        self.at = datetime(2026, 10, 24, 11, 40)        # real local time when the fixture was recorded

    def test_maps_grid_hours_to_next_real_occurrence(self):
        view = weather.grid_view(17.6, self.data, self.at)
        self.assertEqual(len(view), 24)
        self.assertEqual([r["h"] for r in view[:3]], [17.0, 18.0, 19.0])
        by_h = {r["h"]: r for r in view}
        today18 = next(r for r in self.data["hourly"] if r["time"] == "2026-10-24T18:00")
        self.assertEqual(by_h[18.0]["temp_c"], today18["temp_c"])
        tomorrow9 = next(r for r in self.data["hourly"] if r["time"] == "2026-10-25T09:00")
        self.assertEqual(by_h[9.0]["temp_c"], tomorrow9["temp_c"])
        self.assertEqual(by_h[2.0]["pv_x"], 0.0)
        for r in view:
            self.assertGreaterEqual(r["load_x"], 1.0)

    def test_summary(self):
        view = weather.grid_view(15, self.data, self.at)
        s = weather.summary(view, [])
        self.assertTrue(s.endswith(".") and "evening" in s, s)
        s = weather.summary(view, [{"level": "orange", "type": "wind", "title": "x", "from": "", "to": ""}])
        self.assertIn("official orange wind warning", s)

    def test_location_config(self):
        tree = {"region:x": {"parent": None}, "sub:a": {"parent": "region:x", "lat": 48.2, "lon": 17.1},
                "tf:b": {"parent": "sub:a", "lat": 1.0, "lon": 2.0}}
        with mock.patch.dict(weather.LOC, {"name": "Wien-Liesing", "lat": 48.14, "lon": 16.29}), \
                mock.patch.dict("os.environ", {}, clear=False):
            for k in ("GZ_WEATHER_LAT", "GZ_WEATHER_LON", "GZ_WEATHER_NAME"):
                __import__("os").environ.pop(k, None)
            self.assertEqual(weather.configure(tree), {"name": "sub:a", "lat": 48.2, "lon": 17.1})
            with mock.patch.dict("os.environ", {"GZ_WEATHER_LAT": "52.5", "GZ_WEATHER_LON": "13.4", "GZ_WEATHER_NAME": "Berlin"}):
                self.assertEqual(weather.configure(tree), {"name": "Berlin", "lat": 52.5, "lon": 13.4})


class RefreshTest(unittest.TestCase):
    def test_outage_keeps_last_good_data(self):
        om, ma, gs = fixture("open-meteo-liesing.json"), fixture("meteoalarm-austria.json"), fixture("geosphere-spec-example.json")
        answers = lambda url: om if "forecast" in url else ma if "meteoalarm" in url else gs
        with mock.patch.dict(weather.CACHE, {}), mock.patch.object(weather, "COUNTRY", "AT"), \
                mock.patch.object(weather, "get_json", side_effect=answers):
            self.assertTrue(weather.refresh())
            self.assertFalse(weather.CACHE["stale"])
            self.assertEqual(weather.CACHE["warning_sources"], ["meteoalarm:region", "geosphere"])
            with mock.patch.object(weather, "get_json", side_effect=OSError("network down")):
                self.assertFalse(weather.refresh())
            self.assertTrue(weather.CACHE["stale"])
            self.assertEqual(len(weather.CACHE["hourly"]), 48)
            snap = weather.snapshot(17)
            self.assertTrue(snap["stale"])
            self.assertEqual(set(snap), {"location", "source", "fetched_at", "stale", "now", "hourly", "warnings",
                                         "summary", "grid_view"})


if __name__ == "__main__":
    unittest.main()
