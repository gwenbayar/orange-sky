# PNW Smoke Dashboard — Phase 1: Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python data pipeline that ingests four heterogeneous wildfire/air-quality sources for a real PNW smoke event and produces a versioned JSON snapshot under `data/snapshot/<event-id>/` that downstream phases (API, web) consume.

**Architecture:** Five modules in `pipeline/` — one per data source (`fpa_fod`, `hms`, `airnow`, `firms`) plus an orchestrator (`build`). Each source module separates a pure `transform()` (fixture-tested) from a side-effecting `fetch()` (HTTP-mocked). The orchestrator reads an event YAML config, calls each source, and writes a typed JSON layout to disk. Snapshot mode (read pre-downloaded raw files) is the default; `--live` re-pulls from the source APIs.

**Tech Stack:** Python 3.12, pandas, requests, pyyaml, fastkml + shapely, pytest, responses (HTTP mocking).

**Anchor event:** 2020 Labor Day fires (OR/WA). Window: 2020-09-07 → 2020-09-14. Bbox: lat 41–49°N, lon -125 to -115°E.

---

## File Structure

Files this plan creates or modifies:

```
wildfire/
├── pyproject.toml                       # Python project + deps + pytest config
├── .env.example                         # FIRMS_API_KEY, AIRNOW_API_KEY placeholders
├── events/
│   └── 2020-labor-day.yml               # event config (window, bbox, source params)
├── pipeline/
│   ├── __init__.py
│   ├── config.py                        # event YAML loader + dataclass
│   ├── fpa_fod.py                       # historic SQLite aggregator
│   ├── hms.py                           # NOAA HMS KML parser
│   ├── airnow.py                        # AirNow hourly PM2.5
│   ├── firms.py                         # NASA FIRMS active fire detects
│   └── build.py                         # orchestrator + CLI
├── pipeline/tests/
│   ├── __init__.py
│   ├── conftest.py                      # shared fixtures
│   ├── fixtures/
│   │   ├── hms_sample.kml               # tiny real KML snippet
│   │   ├── airnow_sample.csv            # 2 monitors × 4 hours
│   │   └── firms_sample.csv             # 5 fire detects
│   ├── test_config.py
│   ├── test_fpa_fod.py
│   ├── test_hms.py
│   ├── test_airnow.py
│   ├── test_firms.py
│   └── test_build.py
└── data/snapshot/2020-labor-day/        # output, checked in
    ├── event.json
    ├── fires.json
    ├── monitors.json
    ├── monitors_ts/M001.json
    ├── smoke.json
    └── historic.json
```

Each module owns one source. Tests follow the standard split: `transform()` is pure and fixture-tested; `fetch()` is HTTP-mocked with the `responses` library.

---

## Task 1: Python project scaffold

**Files:**
- Create: `pyproject.toml`
- Create: `pipeline/__init__.py`
- Create: `pipeline/tests/__init__.py`
- Create: `.env.example`

- [ ] **Step 1: Create pyproject.toml**

```toml
[project]
name = "pnw-smoke-pipeline"
version = "0.1.0"
description = "Heterogeneous data pipeline for the PNW Smoke Response dashboard."
requires-python = ">=3.12"
dependencies = [
  "pandas>=2.2",
  "requests>=2.32",
  "pyyaml>=6.0",
  "fastkml>=1.0",
  "shapely>=2.0",
  "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "responses>=0.25",
  "ruff>=0.4",
]

[tool.pytest.ini_options]
testpaths = ["pipeline/tests"]
addopts = "-q"

[tool.ruff]
line-length = 100
```

- [ ] **Step 2: Create empty package files**

```python
# pipeline/__init__.py
"""PNW Smoke Dashboard data pipeline."""
__version__ = "0.1.0"
```

```python
# pipeline/tests/__init__.py
```

- [ ] **Step 3: Create .env.example**

```
# Get a free key at https://firms.modaps.eosdis.nasa.gov/api/area/
FIRMS_API_KEY=

# Get a free key at https://docs.airnowapi.org/account/request/
AIRNOW_API_KEY=
```

- [ ] **Step 4: Install and verify**

Run:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest --version
```
Expected: pytest version printed, no errors.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml pipeline/__init__.py pipeline/tests/__init__.py .env.example
git commit -m "chore(pipeline): initial Python scaffold and dev dependencies"
```

---

## Task 2: Event config schema

**Files:**
- Create: `pipeline/config.py`
- Create: `pipeline/tests/test_config.py`
- Create: `events/2020-labor-day.yml`

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_config.py
from pathlib import Path
from pipeline.config import EventConfig, load_event

def test_load_event_2020_labor_day(tmp_path):
    yml = tmp_path / "ev.yml"
    yml.write_text(
        "id: 2020-labor-day\n"
        "name: 2020 Labor Day Fires\n"
        "window:\n"
        "  start: 2020-09-07\n"
        "  end: 2020-09-14\n"
        "bbox: [-125.0, 41.0, -115.0, 49.0]\n"
        "states: [WA, OR, ID, MT, CA]\n"
    )
    cfg = load_event(yml)
    assert isinstance(cfg, EventConfig)
    assert cfg.id == "2020-labor-day"
    assert cfg.window_start.isoformat() == "2020-09-07"
    assert cfg.window_end.isoformat() == "2020-09-14"
    assert cfg.bbox == (-125.0, 41.0, -115.0, 49.0)
    assert "OR" in cfg.states
```

- [ ] **Step 2: Run test to verify failure**

Run: `pytest pipeline/tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pipeline.config'`.

- [ ] **Step 3: Implement config.py**

```python
# pipeline/config.py
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml


@dataclass(frozen=True)
class EventConfig:
    id: str
    name: str
    window_start: date
    window_end: date
    bbox: tuple[float, float, float, float]  # (lon_min, lat_min, lon_max, lat_max)
    states: list[str]


def load_event(path: Path) -> EventConfig:
    raw = yaml.safe_load(Path(path).read_text())
    return EventConfig(
        id=raw["id"],
        name=raw["name"],
        window_start=date.fromisoformat(str(raw["window"]["start"])),
        window_end=date.fromisoformat(str(raw["window"]["end"])),
        bbox=tuple(raw["bbox"]),
        states=list(raw["states"]),
    )
```

- [ ] **Step 4: Run test to verify pass**

Run: `pytest pipeline/tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 5: Create the real event config**

```yaml
# events/2020-labor-day.yml
id: 2020-labor-day
name: 2020 Labor Day Fires (OR/WA)
window:
  start: 2020-09-07
  end: 2020-09-14
bbox: [-125.0, 41.0, -115.0, 49.0]
states: [WA, OR, ID, MT, CA]
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/config.py pipeline/tests/test_config.py events/2020-labor-day.yml
git commit -m "feat(pipeline): event YAML config loader and 2020-labor-day event"
```

---

## Task 3: FPA FOD historic aggregator

This module is pure local SQLite; no network. Does both the `transform` (queries) and the JSON shaping in one place.

**Files:**
- Create: `pipeline/fpa_fod.py`
- Create: `pipeline/tests/test_fpa_fod.py`
- Create: `pipeline/tests/conftest.py`

- [ ] **Step 1: Write conftest with a tiny in-memory FPA FOD fixture**

```python
# pipeline/tests/conftest.py
import sqlite3
import pytest


@pytest.fixture
def tiny_fpa_fod(tmp_path):
    """A 6-row in-file SQLite that mimics the real Fires table schema (subset)."""
    db = tmp_path / "fpa.sqlite"
    con = sqlite3.connect(db)
    con.execute("""
        CREATE TABLE Fires (
            FIRE_YEAR INTEGER, STATE TEXT, STAT_CAUSE_DESCR TEXT,
            FIRE_SIZE REAL, LATITUDE REAL, LONGITUDE REAL
        )
    """)
    rows = [
        (2010, "OR", "Lightning", 12.0, 44.0, -120.0),
        (2010, "OR", "Arson",      3.0, 44.5, -121.0),
        (2010, "WA", "Lightning",  500.0, 47.0, -121.5),
        (2011, "OR", "Lightning",  20.0, 44.0, -120.0),
        (2011, "ID", "Debris Burning", 1.0, 45.0, -114.0),
        (2011, "CA", "Arson",      99000.0, 41.5, -123.0),  # in PNW bbox
    ]
    con.executemany("INSERT INTO Fires VALUES (?,?,?,?,?,?)", rows)
    con.commit()
    con.close()
    return db
```

- [ ] **Step 2: Write the failing test**

```python
# pipeline/tests/test_fpa_fod.py
from pipeline.fpa_fod import aggregate


def test_aggregate_yearly_only_pnw_states(tiny_fpa_fod):
    out = aggregate(tiny_fpa_fod, states=("WA", "OR", "ID", "MT", "CA"))
    yearly = {y["year"]: y for y in out["yearly"]}
    assert yearly[2010]["fires"] == 3
    assert yearly[2010]["acres"] == 515.0
    assert yearly[2011]["fires"] == 3
    assert yearly[2011]["acres"] == 99021.0


def test_aggregate_by_cause_sorted_desc(tiny_fpa_fod):
    out = aggregate(tiny_fpa_fod, states=("WA", "OR", "ID", "MT", "CA"))
    causes = out["by_cause"]
    assert causes[0]["cause"] == "Lightning"
    assert causes[0]["fires"] == 3
    assert causes[-1]["fires"] <= causes[0]["fires"]


def test_aggregate_by_state(tiny_fpa_fod):
    out = aggregate(tiny_fpa_fod, states=("WA", "OR", "ID", "MT", "CA"))
    by_state = {s["state"]: s for s in out["by_state"]}
    assert by_state["OR"]["fires"] == 3
    assert by_state["WA"]["fires"] == 1
    assert "TX" not in by_state  # filter applied
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pytest pipeline/tests/test_fpa_fod.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement fpa_fod.py**

```python
# pipeline/fpa_fod.py
import sqlite3
from pathlib import Path
from typing import Iterable


def aggregate(db_path: Path, states: Iterable[str]) -> dict:
    """Read FPA FOD SQLite and produce yearly + by-cause + by-state aggregates,
    filtered to the PNW state set. Pure read-only."""
    placeholders = ",".join("?" * len(tuple(states)))
    states_tuple = tuple(states)

    con = sqlite3.connect(db_path)
    try:
        con.row_factory = sqlite3.Row

        yearly = [
            {"year": r["FIRE_YEAR"], "fires": r["fires"], "acres": r["acres"]}
            for r in con.execute(
                f"""SELECT FIRE_YEAR, COUNT(*) AS fires, ROUND(SUM(FIRE_SIZE), 1) AS acres
                    FROM Fires WHERE STATE IN ({placeholders})
                    GROUP BY FIRE_YEAR ORDER BY FIRE_YEAR""",
                states_tuple,
            )
        ]
        by_cause = [
            {"cause": r["STAT_CAUSE_DESCR"], "fires": r["fires"], "acres": r["acres"]}
            for r in con.execute(
                f"""SELECT STAT_CAUSE_DESCR, COUNT(*) AS fires, ROUND(SUM(FIRE_SIZE), 1) AS acres
                    FROM Fires WHERE STATE IN ({placeholders})
                    GROUP BY STAT_CAUSE_DESCR ORDER BY fires DESC""",
                states_tuple,
            )
        ]
        by_state = [
            {"state": r["STATE"], "fires": r["fires"], "acres": r["acres"]}
            for r in con.execute(
                f"""SELECT STATE, COUNT(*) AS fires, ROUND(SUM(FIRE_SIZE), 1) AS acres
                    FROM Fires WHERE STATE IN ({placeholders})
                    GROUP BY STATE ORDER BY fires DESC""",
                states_tuple,
            )
        ]
    finally:
        con.close()

    return {"yearly": yearly, "by_cause": by_cause, "by_state": by_state}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pytest pipeline/tests/test_fpa_fod.py -v`
Expected: 3 tests PASS.

- [ ] **Step 6: Smoke-run against the real SQLite**

Run:
```bash
python -c "
from pipeline.fpa_fod import aggregate
import json
out = aggregate('data/FPA_FOD_20170508.sqlite', states=('WA','OR','ID','MT','CA'))
print('years:', len(out['yearly']))
print('top cause:', out['by_cause'][0])
print('top state:', out['by_state'][0])
"
```
Expected: prints ~24 years, "Lightning" or similar as top cause, CA top by fires.

- [ ] **Step 7: Commit**

```bash
git add pipeline/fpa_fod.py pipeline/tests/test_fpa_fod.py pipeline/tests/conftest.py
git commit -m "feat(pipeline): FPA FOD historic aggregator (yearly, by-cause, by-state)"
```

---

## Task 4: HMS smoke polygon parser

NOAA HMS publishes daily KMLs of smoke plume polygons.

**Files:**
- Create: `pipeline/hms.py`
- Create: `pipeline/tests/test_hms.py`
- Create: `pipeline/tests/fixtures/hms_sample.kml`

- [ ] **Step 1: Create a tiny real-shape KML fixture**

```xml
<!-- pipeline/tests/fixtures/hms_sample.kml -->
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Smoke (Heavy)</name>
      <ExtendedData>
        <Data name="Density"><value>27.0</value></Data>
      </ExtendedData>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -123.0,45.0 -122.0,45.0 -122.0,46.0 -123.0,46.0 -123.0,45.0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
    <Placemark>
      <name>Smoke (Light)</name>
      <ExtendedData>
        <Data name="Density"><value>5.0</value></Data>
      </ExtendedData>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -120.0,44.0 -119.0,44.0 -119.0,45.0 -120.0,45.0 -120.0,44.0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
  </Document>
</kml>
```

- [ ] **Step 2: Write the failing test**

```python
# pipeline/tests/test_hms.py
from datetime import date
from pathlib import Path

from pipeline.hms import transform


FIX = Path(__file__).parent / "fixtures" / "hms_sample.kml"


def test_transform_one_kml_to_geojson():
    out = transform({date(2020, 9, 10): FIX})
    assert out["type"] == "FeatureCollection"
    assert len(out["features"]) == 2
    f0 = out["features"][0]
    assert f0["type"] == "Feature"
    assert f0["geometry"]["type"] == "Polygon"
    assert f0["properties"]["day"] == "2020-09-10"
    assert f0["properties"]["density"] in {"Heavy", "Light"}


def test_transform_multi_day():
    out = transform({
        date(2020, 9, 10): FIX,
        date(2020, 9, 11): FIX,
    })
    days = {f["properties"]["day"] for f in out["features"]}
    assert days == {"2020-09-10", "2020-09-11"}
    assert len(out["features"]) == 4
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pytest pipeline/tests/test_hms.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement hms.py**

```python
# pipeline/hms.py
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"kml": "http://www.opengis.net/kml/2.2"}

# HMS density bands (µg/m³); map to coarse labels for display.
def _density_label(value: float) -> str:
    if value >= 21:
        return "Heavy"
    if value >= 11:
        return "Medium"
    return "Light"


def _parse_kml(path: Path, day: date) -> list[dict]:
    tree = ET.parse(path)
    root = tree.getroot()
    features: list[dict] = []
    for pm in root.iter("{%s}Placemark" % NS["kml"]):
        # density
        density_val = 0.0
        for d in pm.iter("{%s}Data" % NS["kml"]):
            if d.get("name") == "Density":
                v = d.find("{%s}value" % NS["kml"])
                if v is not None and v.text:
                    density_val = float(v.text)
        # polygon coords
        coords_el = pm.find(
            "{kml}Polygon/{kml}outerBoundaryIs/{kml}LinearRing/{kml}coordinates".replace(
                "{kml}", "{%s}" % NS["kml"]
            )
        )
        if coords_el is None or coords_el.text is None:
            continue
        ring: list[list[float]] = []
        for token in coords_el.text.strip().split():
            lon, lat, *_ = token.split(",")
            ring.append([float(lon), float(lat)])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"day": day.isoformat(), "density": _density_label(density_val)},
        })
    return features


def transform(kml_by_day: dict[date, Path]) -> dict:
    """Parse one KML per day into a single GeoJSON FeatureCollection,
    tagging each polygon with its `day`."""
    features: list[dict] = []
    for day, path in sorted(kml_by_day.items()):
        features.extend(_parse_kml(path, day))
    return {"type": "FeatureCollection", "features": features}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pytest pipeline/tests/test_hms.py -v`
Expected: 2 tests PASS.

- [ ] **Step 6: Add fetch() with HTTP mocking**

Append to `pipeline/hms.py`:

```python
import requests

HMS_BASE = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons"


def fetch(day: date, dest_dir: Path) -> Path:
    """Download one HMS daily KML for `day` to `dest_dir`. Returns the file path."""
    yyyy = day.strftime("%Y")
    fname = f"hms_smoke{day.strftime('%Y%m%d')}.kml"
    url = f"{HMS_BASE}/{yyyy}/{fname}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / fname
    resp = requests.get(url, timeout=60)
    if resp.status_code != 200 or len(resp.content) == 0:
        raise RuntimeError(f"HMS fetch failed for {day} ({resp.status_code}): {url}")
    out.write_bytes(resp.content)
    return out
```

- [ ] **Step 7: Add a fetch test using `responses`**

Append to `pipeline/tests/test_hms.py`:

```python
import responses
from datetime import date

from pipeline.hms import fetch


@responses.activate
def test_fetch_writes_kml(tmp_path):
    body = (FIX).read_bytes()
    url = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/2020/hms_smoke20200910.kml"
    responses.add(responses.GET, url, body=body, status=200)
    out = fetch(date(2020, 9, 10), tmp_path)
    assert out.exists()
    assert out.read_bytes() == body
```

- [ ] **Step 8: Run all HMS tests**

Run: `pytest pipeline/tests/test_hms.py -v`
Expected: 3 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add pipeline/hms.py pipeline/tests/test_hms.py pipeline/tests/fixtures/hms_sample.kml
git commit -m "feat(pipeline): NOAA HMS daily smoke polygon parser + downloader"
```

---

## Task 5: AirNow hourly PM2.5

AirNow exposes a free API plus public hourly archive files. We use the archive (`https://files.airnowtech.org/airnow/<YYYY>/<YYYYMMDD>/HourlyData_<YYYYMMDDHH>.dat`) since it's a flat CSV-like format that doesn't require an API key for the demo path.

**Files:**
- Create: `pipeline/airnow.py`
- Create: `pipeline/tests/test_airnow.py`
- Create: `pipeline/tests/fixtures/airnow_sample.csv`

- [ ] **Step 1: Create the fixture**

```
# pipeline/tests/fixtures/airnow_sample.csv
# AirNow hourly file is pipe-delimited; columns vary slightly. Test only what we use.
2020-09-10|13:00|M001|Portland Fire Stn|OR|UTC|44.65|-123.10|PM2.5|412.0|UG/M3|MULTNOMAH AQ
2020-09-10|13:00|M002|Seattle Beacon Hill|WA|UTC|47.57|-122.31|PM2.5|178.0|UG/M3|PSCAA
2020-09-10|14:00|M001|Portland Fire Stn|OR|UTC|44.65|-123.10|PM2.5|450.0|UG/M3|MULTNOMAH AQ
2020-09-10|14:00|M002|Seattle Beacon Hill|WA|UTC|47.57|-122.31|PM2.5|185.0|UG/M3|PSCAA
```

- [ ] **Step 2: Write the failing test**

```python
# pipeline/tests/test_airnow.py
from pathlib import Path
from pipeline.airnow import transform

FIX = Path(__file__).parent / "fixtures" / "airnow_sample.csv"


def test_transform_groups_by_monitor_and_summarizes():
    out = transform([FIX])
    monitors = {m["id"]: m for m in out["monitors"]}
    assert set(monitors) == {"M001", "M002"}
    m1 = monitors["M001"]
    assert m1["state"] == "OR"
    assert m1["lat"] == 44.65
    assert m1["lon"] == -123.10
    assert m1["summary"]["peak"] == 450.0
    assert m1["summary"]["hours_exceeded_naaqs"] == 2  # 35 µg/m³ NAAQS, both hours over

    ts = {tid: rows for tid, rows in out["timeseries"].items()}
    assert len(ts["M001"]) == 2
    assert ts["M001"][0]["pm25"] == 412.0
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pytest pipeline/tests/test_airnow.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement airnow.py transform**

```python
# pipeline/airnow.py
from collections import defaultdict
from pathlib import Path
from typing import Iterable

NAAQS_PM25_24H = 35.0  # µg/m³


def _parse_line(line: str) -> dict | None:
    parts = line.rstrip("\n").split("|")
    if len(parts) < 12:
        return None
    if parts[8] != "PM2.5":
        return None
    return {
        "ts": f"{parts[0]}T{parts[1]}:00Z",
        "id": parts[2],
        "name": parts[3],
        "state": parts[4],
        "lat": float(parts[6]),
        "lon": float(parts[7]),
        "pm25": float(parts[9]),
        "agency": parts[11],
    }


def transform(hourly_files: Iterable[Path]) -> dict:
    """Parse AirNow hourly archive files into a station roster + per-monitor timeseries."""
    by_monitor: dict[str, list[dict]] = defaultdict(list)
    meta: dict[str, dict] = {}
    for path in hourly_files:
        for line in Path(path).read_text().splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            row = _parse_line(line)
            if row is None:
                continue
            by_monitor[row["id"]].append({"ts": row["ts"], "pm25": row["pm25"]})
            meta.setdefault(row["id"], {
                "id": row["id"],
                "name": row["name"],
                "state": row["state"],
                "lat": row["lat"],
                "lon": row["lon"],
                "agency": row["agency"],
            })

    monitors = []
    for mid, rows in by_monitor.items():
        rows.sort(key=lambda r: r["ts"])
        peak = max(r["pm25"] for r in rows)
        hours_over = sum(1 for r in rows if r["pm25"] > NAAQS_PM25_24H)
        m = dict(meta[mid])
        m["summary"] = {"peak": peak, "hours_exceeded_naaqs": hours_over}
        monitors.append(m)
    monitors.sort(key=lambda m: m["id"])

    return {"monitors": monitors, "timeseries": dict(by_monitor)}
```

- [ ] **Step 5: Run test to verify pass**

Run: `pytest pipeline/tests/test_airnow.py -v`
Expected: PASS.

- [ ] **Step 6: Add fetch with HTTP mocking**

Append to `pipeline/airnow.py`:

```python
from datetime import date, timedelta
import requests

AIRNOW_BASE = "https://files.airnowtech.org/airnow"


def fetch(window_start: date, window_end: date, dest_dir: Path) -> list[Path]:
    """Download AirNow hourly archive files for every hour in [start, end) (UTC).
    Returns list of local file paths."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    cur = window_start
    while cur < window_end:
        for hh in range(24):
            stamp = f"{cur.strftime('%Y%m%d')}{hh:02d}"
            url = f"{AIRNOW_BASE}/{cur.strftime('%Y')}/{cur.strftime('%Y%m%d')}/HourlyData_{stamp}.dat"
            local = dest_dir / f"HourlyData_{stamp}.dat"
            resp = requests.get(url, timeout=60)
            if resp.status_code != 200:
                raise RuntimeError(f"AirNow fetch failed for {stamp}: {resp.status_code}")
            local.write_bytes(resp.content)
            out.append(local)
        cur += timedelta(days=1)
    return out
```

- [ ] **Step 7: Add a fetch test**

Append to `pipeline/tests/test_airnow.py`:

```python
import responses
from datetime import date
from pipeline.airnow import fetch


@responses.activate
def test_fetch_one_day_writes_24_files(tmp_path):
    body = FIX.read_bytes()
    for hh in range(24):
        url = (
            f"https://files.airnowtech.org/airnow/2020/20200910/HourlyData_20200910{hh:02d}.dat"
        )
        responses.add(responses.GET, url, body=body, status=200)
    out = fetch(date(2020, 9, 10), date(2020, 9, 11), tmp_path)
    assert len(out) == 24
    assert all(p.exists() for p in out)
```

- [ ] **Step 8: Run all AirNow tests**

Run: `pytest pipeline/tests/test_airnow.py -v`
Expected: 2 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add pipeline/airnow.py pipeline/tests/test_airnow.py pipeline/tests/fixtures/airnow_sample.csv
git commit -m "feat(pipeline): AirNow hourly PM2.5 archive parser + downloader"
```

---

## Task 6: NASA FIRMS active-fire detects

FIRMS API returns CSV by area + date range. Requires a free API key (`FIRMS_API_KEY`).

**Files:**
- Create: `pipeline/firms.py`
- Create: `pipeline/tests/test_firms.py`
- Create: `pipeline/tests/fixtures/firms_sample.csv`

- [ ] **Step 1: Create the fixture**

```csv
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
44.55,-122.30,330.1,0.4,0.4,2020-09-10,1812,N,nominal,2.0NRT,295.1,12.5,D
45.10,-121.90,355.6,0.4,0.4,2020-09-10,1812,N,high,2.0NRT,310.4,55.2,D
46.21,-121.50,310.2,0.4,0.4,2020-09-11,0930,N,low,2.0NRT,278.5,3.3,N
44.55,-122.30,328.0,0.4,0.4,2020-09-12,1820,N,nominal,2.0NRT,290.5,8.8,D
40.20,-122.00,305.1,0.4,0.4,2020-09-12,1820,N,nominal,2.0NRT,275.3,5.5,D
```

(The last row is at lat 40.20 — just outside our 41–49 bbox; should be filtered out.)

- [ ] **Step 2: Write the failing test**

```python
# pipeline/tests/test_firms.py
from pathlib import Path
from pipeline.firms import transform

FIX = Path(__file__).parent / "fixtures" / "firms_sample.csv"
BBOX = (-125.0, 41.0, -115.0, 49.0)


def test_transform_filters_to_bbox_and_emits_geojson():
    out = transform([FIX], bbox=BBOX)
    assert out["type"] == "FeatureCollection"
    # 5 rows in fixture, 1 outside bbox → 4 features
    assert len(out["features"]) == 4
    f0 = out["features"][0]
    assert f0["type"] == "Feature"
    assert f0["geometry"]["type"] == "Point"
    coords = f0["geometry"]["coordinates"]
    assert -125.0 <= coords[0] <= -115.0
    assert 41.0 <= coords[1] <= 49.0
    assert "frp" in f0["properties"]
    assert "acq_datetime" in f0["properties"]


def test_transform_high_confidence_flag():
    out = transform([FIX], bbox=BBOX)
    high = [f for f in out["features"] if f["properties"]["confidence"] == "high"]
    assert len(high) == 1
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pytest pipeline/tests/test_firms.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement firms.py transform**

```python
# pipeline/firms.py
from pathlib import Path
from typing import Iterable

import pandas as pd

BBox = tuple[float, float, float, float]


def transform(csv_paths: Iterable[Path], bbox: BBox) -> dict:
    """Combine FIRMS CSVs, filter to bbox, emit a Point GeoJSON FeatureCollection."""
    lon_min, lat_min, lon_max, lat_max = bbox
    frames = [pd.read_csv(p) for p in csv_paths]
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if df.empty:
        return {"type": "FeatureCollection", "features": []}

    df = df[
        (df.longitude >= lon_min)
        & (df.longitude <= lon_max)
        & (df.latitude >= lat_min)
        & (df.latitude <= lat_max)
    ].copy()

    # Combine acq_date + acq_time (HHMM) into ISO datetime.
    df["acq_time"] = df["acq_time"].astype(str).str.zfill(4)
    df["acq_datetime"] = (
        df["acq_date"].astype(str) + "T" + df["acq_time"].str[:2] + ":" + df["acq_time"].str[2:] + ":00Z"
    )

    features = []
    for _, r in df.iterrows():
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(r.longitude), float(r.latitude)]},
            "properties": {
                "acq_datetime": r["acq_datetime"],
                "confidence": str(r["confidence"]),
                "frp": float(r["frp"]),
                "satellite": str(r["satellite"]),
                "daynight": str(r["daynight"]),
            },
        })
    return {"type": "FeatureCollection", "features": features}
```

- [ ] **Step 5: Run test to verify pass**

Run: `pytest pipeline/tests/test_firms.py -v`
Expected: 2 tests PASS.

- [ ] **Step 6: Add fetch with HTTP mocking**

Append to `pipeline/firms.py`:

```python
import os
from datetime import date

import requests

FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def fetch(
    api_key: str,
    source: str,                 # "VIIRS_SNPP_NRT" or "MODIS_NRT"
    bbox: BBox,
    window_start: date,
    window_end: date,
    dest_dir: Path,
) -> Path:
    """Download FIRMS CSV for the bbox + window. Returns the local file path."""
    if not api_key:
        raise RuntimeError("FIRMS_API_KEY not set; see .env.example")
    days = (window_end - window_start).days + 1
    if days > 10:
        raise ValueError("FIRMS API limits area requests to 10 days")
    lon_min, lat_min, lon_max, lat_max = bbox
    area = f"{lon_min},{lat_min},{lon_max},{lat_max}"
    url = (
        f"{FIRMS_API}/{api_key}/{source}/{area}/{days}/{window_start.isoformat()}"
    )
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"firms_{source}_{window_start.isoformat()}_{window_end.isoformat()}.csv"
    resp = requests.get(url, timeout=120)
    if resp.status_code != 200 or len(resp.text) == 0:
        raise RuntimeError(f"FIRMS fetch failed ({resp.status_code}): {url}")
    out.write_text(resp.text)
    return out
```

- [ ] **Step 7: Add a fetch test**

Append to `pipeline/tests/test_firms.py`:

```python
import responses
from datetime import date
from pipeline.firms import fetch


@responses.activate
def test_fetch_writes_csv(tmp_path):
    body = FIX.read_text()
    url = (
        "https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY123/VIIRS_SNPP_NRT/"
        "-125.0,41.0,-115.0,49.0/8/2020-09-07"
    )
    responses.add(responses.GET, url, body=body, status=200, content_type="text/csv")
    out = fetch(
        api_key="KEY123",
        source="VIIRS_SNPP_NRT",
        bbox=BBOX,
        window_start=date(2020, 9, 7),
        window_end=date(2020, 9, 14),
        dest_dir=tmp_path,
    )
    assert out.exists()
    assert "latitude" in out.read_text()
```

- [ ] **Step 8: Run all FIRMS tests**

Run: `pytest pipeline/tests/test_firms.py -v`
Expected: 3 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add pipeline/firms.py pipeline/tests/test_firms.py pipeline/tests/fixtures/firms_sample.csv
git commit -m "feat(pipeline): NASA FIRMS active-fire detect downloader + transform"
```

---

## Task 7: Build orchestrator (snapshot mode)

Wires the four sources together against an event YAML and writes the snapshot tree.

**Files:**
- Create: `pipeline/build.py`
- Create: `pipeline/tests/test_build.py`

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_build.py
import json
import shutil
from datetime import date
from pathlib import Path

import pytest

from pipeline.build import build_snapshot
from pipeline.config import EventConfig


@pytest.fixture
def fake_raw_tree(tmp_path):
    """Produces a `data/raw/<event>/` tree with fixture content for all 4 sources."""
    fix_dir = Path(__file__).parent / "fixtures"
    raw = tmp_path / "raw" / "2020-labor-day"
    (raw / "firms").mkdir(parents=True)
    (raw / "hms").mkdir(parents=True)
    (raw / "airnow").mkdir(parents=True)
    shutil.copy(fix_dir / "firms_sample.csv", raw / "firms" / "firms.csv")
    shutil.copy(fix_dir / "hms_sample.kml", raw / "hms" / "hms_smoke20200910.kml")
    shutil.copy(fix_dir / "airnow_sample.csv", raw / "airnow" / "HourlyData_2020091013.dat")
    return raw


def test_build_writes_full_snapshot_tree(tmp_path, fake_raw_tree, tiny_fpa_fod):
    cfg = EventConfig(
        id="2020-labor-day",
        name="Test",
        window_start=date(2020, 9, 10),
        window_end=date(2020, 9, 11),
        bbox=(-125.0, 41.0, -115.0, 49.0),
        states=["WA", "OR", "ID", "MT", "CA"],
    )
    out = tmp_path / "snapshot" / "2020-labor-day"
    build_snapshot(cfg, raw_dir=fake_raw_tree, fpa_db=tiny_fpa_fod, out_dir=out)

    # Files exist
    for fname in ("event.json", "fires.json", "smoke.json", "monitors.json", "historic.json"):
        assert (out / fname).exists(), fname
    assert (out / "monitors_ts").is_dir()
    ts_files = list((out / "monitors_ts").iterdir())
    assert len(ts_files) >= 1

    # Manifest sanity
    manifest = json.loads((out / "event.json").read_text())
    assert manifest["id"] == "2020-labor-day"
    assert manifest["window"]["start"] == "2020-09-10"
    assert "sources" in manifest
```

- [ ] **Step 2: Run test to verify failure**

Run: `pytest pipeline/tests/test_build.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement build.py**

```python
# pipeline/build.py
import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path

from pipeline import airnow, firms, fpa_fod, hms
from pipeline.config import EventConfig, load_event


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")))


def _kmls_by_day(raw_hms_dir: Path) -> dict[date, Path]:
    out: dict[date, Path] = {}
    for kml in sorted(raw_hms_dir.glob("hms_smoke*.kml")):
        # filename: hms_smokeYYYYMMDD.kml
        stem = kml.stem.replace("hms_smoke", "")
        out[date.fromisoformat(f"{stem[0:4]}-{stem[4:6]}-{stem[6:8]}")] = kml
    return out


def build_snapshot(
    cfg: EventConfig,
    raw_dir: Path,
    fpa_db: Path,
    out_dir: Path,
) -> None:
    """Snapshot mode: read pre-downloaded raw files under `raw_dir/{firms,hms,airnow}/`,
    aggregate FPA FOD from `fpa_db`, and write the snapshot tree under `out_dir`."""
    out_dir.mkdir(parents=True, exist_ok=True)

    fires = firms.transform(
        sorted((raw_dir / "firms").glob("*.csv")),
        bbox=cfg.bbox,
    )
    smoke = hms.transform(_kmls_by_day(raw_dir / "hms"))
    air = airnow.transform(sorted((raw_dir / "airnow").glob("HourlyData_*.dat")))
    historic = fpa_fod.aggregate(fpa_db, states=tuple(cfg.states))

    _write_json(out_dir / "fires.json", fires)
    _write_json(out_dir / "smoke.json", smoke)
    _write_json(out_dir / "monitors.json", {"monitors": air["monitors"]})
    for mid, rows in air["timeseries"].items():
        _write_json(out_dir / "monitors_ts" / f"{mid}.json", rows)
    _write_json(out_dir / "historic.json", historic)

    manifest = {
        "id": cfg.id,
        "name": cfg.name,
        "window": {"start": cfg.window_start.isoformat(), "end": cfg.window_end.isoformat()},
        "bbox": list(cfg.bbox),
        "states": list(cfg.states),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "firms": {"name": "NASA FIRMS (VIIRS/MODIS active fire detections)"},
            "hms": {"name": "NOAA Hazard Mapping System smoke polygons"},
            "airnow": {"name": "AirNow hourly PM2.5"},
            "fpa_fod": {"name": "USFS FPA FOD historic occurrences (1992–2015)"},
        },
        "counts": {
            "fires": len(fires["features"]),
            "smoke_polygons": len(smoke["features"]),
            "monitors": len(air["monitors"]),
        },
    }
    _write_json(out_dir / "event.json", manifest)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--event", required=True, help="Event ID — must match events/<id>.yml")
    p.add_argument("--raw-dir", default="data/raw", help="Root of raw inputs")
    p.add_argument("--fpa-db", default="data/FPA_FOD_20170508.sqlite")
    p.add_argument("--out-dir", default="data/snapshot")
    args = p.parse_args()

    cfg = load_event(Path(f"events/{args.event}.yml"))
    build_snapshot(
        cfg,
        raw_dir=Path(args.raw_dir) / args.event,
        fpa_db=Path(args.fpa_db),
        out_dir=Path(args.out_dir) / args.event,
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify pass**

Run: `pytest pipeline/tests/test_build.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full pipeline test suite**

Run: `pytest pipeline/tests -v`
Expected: All tests PASS (config 1, fpa_fod 3, hms 3, airnow 2, firms 3, build 1 = 13 tests).

- [ ] **Step 6: Commit**

```bash
git add pipeline/build.py pipeline/tests/test_build.py
git commit -m "feat(pipeline): build orchestrator + CLI for snapshot assembly"
```

---

## Task 8: Real-event snapshot — download + build + commit

This is the one-time data acquisition step. We download raw files for the 2020 Labor Day event window, run the build, and commit the snapshot output.

**Files:**
- Create: `data/raw/2020-labor-day/{firms,hms,airnow}/...` (gitignored)
- Create: `data/snapshot/2020-labor-day/...` (committed)
- Create: `scripts/fetch_raw.py` (helper for one-shot download)

- [ ] **Step 1: Write the fetch helper**

```python
# scripts/fetch_raw.py
"""One-shot helper: download raw inputs for an event into data/raw/<event>/."""
import os
import sys
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

from pipeline import airnow, firms, hms
from pipeline.config import load_event


def main(event_id: str) -> None:
    load_dotenv()
    cfg = load_event(Path(f"events/{event_id}.yml"))
    raw = Path("data/raw") / event_id

    # FIRMS — VIIRS only for MVP; window must be ≤10 days (we have 8).
    firms_key = os.environ.get("FIRMS_API_KEY", "")
    firms.fetch(
        api_key=firms_key,
        source="VIIRS_SNPP_NRT",
        bbox=cfg.bbox,
        window_start=cfg.window_start,
        window_end=cfg.window_end,
        dest_dir=raw / "firms",
    )

    # HMS — one KML per day in [start, end]
    cur = cfg.window_start
    while cur <= cfg.window_end:
        hms.fetch(cur, raw / "hms")
        cur += timedelta(days=1)

    # AirNow — hourly archive across the window
    airnow.fetch(cfg.window_start, cfg.window_end + timedelta(days=1), raw / "airnow")

    print(f"Done. Raw inputs in {raw}")


if __name__ == "__main__":
    main(sys.argv[1])
```

- [ ] **Step 2: Set up `.env` (manual, one-time)**

Run:
```bash
cp .env.example .env
```
Edit `.env`, paste your FIRMS API key. (AirNow archive doesn't need a key for the snapshot path.)

- [ ] **Step 3: Run the fetcher for 2020 Labor Day**

Run:
```bash
python scripts/fetch_raw.py 2020-labor-day
```
Expected: `data/raw/2020-labor-day/firms/*.csv`, `hms/*.kml` (8 files), `airnow/*.dat` (~192 files) on disk. May take 5–15 minutes for AirNow due to per-hour requests.

If a single AirNow hour or HMS day fails (sometimes the most recent few days of HMS are missing), note which one. The 2020 window is old enough that all files should be fully populated.

- [ ] **Step 4: Build the snapshot**

Run:
```bash
python -m pipeline.build --event=2020-labor-day
```
Expected: `data/snapshot/2020-labor-day/` populated with `event.json`, `fires.json`, `smoke.json`, `monitors.json`, `monitors_ts/*.json`, `historic.json`.

- [ ] **Step 5: Sanity-check the snapshot**

Run:
```bash
python -c "
import json
from pathlib import Path
m = json.loads(Path('data/snapshot/2020-labor-day/event.json').read_text())
print('event:', m['name'])
print('counts:', m['counts'])
"
```
Expected: hundreds of fires, ~8 smoke days × ~5–15 polygons each, ~50–150 monitors.

- [ ] **Step 6: Verify total snapshot size**

Run: `du -sh data/snapshot/2020-labor-day`
Expected: well under 5 MB total. If it exceeds 10 MB, stop and revisit — likely too many monitors slipped through; filter `monitors.json` to PNW states only by adding a `state in cfg.states` filter inside `airnow.transform()`.

- [ ] **Step 7: Commit the snapshot (NOT the raw)**

The `.gitignore` already excludes `data/raw/`. Stage only the snapshot and helper script:

```bash
git add scripts/fetch_raw.py data/snapshot/2020-labor-day
git commit -m "data: 2020 Labor Day fires snapshot + fetch helper"
```

---

## Task 9: Pipeline README

A short README so a reviewer can re-run the pipeline.

**Files:**
- Create: `pipeline/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Data Pipeline

Builds the JSON snapshot consumed by the API and web app for one PNW smoke event.

## Sources

| Source     | Output                              | Access            |
| ---------- | ----------------------------------- | ----------------- |
| NASA FIRMS | Active fire detects (GeoJSON)       | Free API key      |
| NOAA HMS   | Daily smoke polygons (GeoJSON)      | Public, no key    |
| AirNow     | Hourly PM2.5 by monitor             | Public archive    |
| FPA FOD    | Historic baseline (1992–2015)       | Local SQLite file |

## One-time setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # then add FIRMS_API_KEY
```

You also need `data/FPA_FOD_20170508.sqlite` on disk. (It's gitignored due to size.)

## Build a snapshot

For the shipped 2020 Labor Day event, the snapshot is already committed under
`data/snapshot/2020-labor-day/`. To rebuild it:

```bash
python scripts/fetch_raw.py 2020-labor-day  # ~5–15 min, downloads to data/raw/
python -m pipeline.build --event=2020-labor-day
```

## Tests

```bash
pytest pipeline/tests -v
```

All HTTP fetches are mocked with the `responses` library; tests do not hit the network.

## Adding a new event

1. Create `events/<id>.yml` (copy `events/2020-labor-day.yml`).
2. Run `python scripts/fetch_raw.py <id>` then `python -m pipeline.build --event=<id>`.
3. Commit `data/snapshot/<id>/`.
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/README.md
git commit -m "docs(pipeline): README with sources, setup, and build instructions"
```

---

## Task 10: Phase-1 close-out

- [ ] **Step 1: Full test suite green**

Run: `pytest -v`
Expected: All tests PASS.

- [ ] **Step 2: Verify snapshot tree is committed**

Run: `git ls-files data/snapshot/2020-labor-day | head`
Expected: lists `event.json`, `fires.json`, `smoke.json`, `monitors.json`, `historic.json`, and per-monitor TS files.

- [ ] **Step 3: Tag the phase milestone**

Run:
```bash
git tag phase-1-pipeline
git log --oneline | head
```

Phase 1 is complete. Plan #2 (FastAPI server) will read from `data/snapshot/2020-labor-day/`.

---

## Out of Scope (deferred to later phases)

- FastAPI server and endpoints (Phase 2)
- React/TS frontend (Phase 3)
- Docker compose and CI workflow (Phase 4)
- BlueSky smoke-model output (out of scope per spec)
- Live mode end-to-end exercise (the code path exists; the demo path is snapshot)
