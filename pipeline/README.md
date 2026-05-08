# Data Pipeline

Builds the JSON snapshot consumed by the API and web app for one PNW smoke
event. Default is snapshot mode: read pre-downloaded raw files, transform,
write `data/snapshot/<event-id>/`. Live fetchers exist in each source module
and are exercised by `scripts/fetch_raw.py` to (re-)populate raw inputs.

## Sources

| Source     | Output                              | Access                              |
| ---------- | ----------------------------------- | ----------------------------------- |
| NASA FIRMS | Active fire detects (GeoJSON)       | Free API key                        |
| NOAA HMS   | Daily smoke polygons (GeoJSON)      | Public, no key                      |
| AirNow     | Hourly PM2.5 by monitor             | Public archive, no key (snapshot)   |
| FPA FOD    | Historic baseline (1992–2015)       | Local SQLite file (`data/`)         |

## Setup (one-time)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # then add FIRMS_API_KEY (free, ~2 min to register)
```

You also need `data/FPA_FOD_20170508.sqlite` on disk. It is gitignored due to
size (759 MB); download once and keep it locally.

## Build the shipped snapshot

The 2020 Labor Day fires snapshot is already committed under
`data/snapshot/2020-labor-day/`. To rebuild it from scratch:

```bash
python scripts/fetch_raw.py 2020-labor-day  # ~10–15 min, downloads to data/raw/
python -m pipeline.build --event=2020-labor-day
```

## Tests

```bash
pytest pipeline/tests -v
```

All HTTP fetches are mocked with the `responses` library; tests do not hit the
network.

## Adding a new event

1. Copy `events/2020-labor-day.yml` to `events/<id>.yml` and edit window, bbox,
   states.
2. `python scripts/fetch_raw.py <id>` to download raw inputs.
3. `python -m pipeline.build --event=<id>` to build the snapshot.
4. Commit `data/snapshot/<id>/`.

## Notes for archive quirks

A few real-world details that may surprise readers of the design spec — all
discovered when building the 2020 Labor Day snapshot against the live archives:

### FIRMS source selection: NRT vs SP

NASA FIRMS publishes two product lines per sensor:
- **NRT** (Near Real-Time) — covers roughly the last 60 days only.
- **SP** (Standard Processing, science-quality) — the historical archive.

`scripts/fetch_raw.py` uses `VIIRS_SNPP_SP` because the 2020 event is far
outside the NRT window. SP area requests are capped at **5 days per call**
(NRT is 10), so the script chunks the event window into 5-day requests.

### AirNow archive format

The plan reference and earlier fixtures used pipe-delimited `HourlyData_*.dat`,
but the live archive at `files.airnowtech.org/airnow/<YYYY>/<YYYYMMDD>/` serves
**`HourlyAQObs_<YYYYMMDDHH>.dat`** — a CSV with a header row and double-quoted
fields. The parser uses `csv.DictReader` keyed by column name (AQSID,
StateName, PM25, ValidDate, ValidTime, …) so a future column reorder by EPA
will not silently break the pipeline.

The archive feed is global. `airnow.transform()` accepts an optional
`states=("WA", "OR", …)` filter; `pipeline.build` passes the event's `states`
list so PNW snapshots don't carry every monitor on the planet.

### NOAA HMS smoke polygons URL

The live URL pattern is
`https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML/<YYYY>/<MM>/hms_smoke<YYYYMMDD>.kml`
(month-segmented). Older archive references show `…/Smoke_Polygons/<YYYY>/…`
without the `KML/<MM>/` segment; that path is stale.

### FIRMS post-filter policy

VIIRS at 375 m resolution generates many low-FRP detects from warm soil and
sun-glint. For the 8-day 2020 event in PNW, raw VIIRS SP returned ~72,000
points across the bbox — too many to ship in git or render usefully. The
build orchestrator (`pipeline/build.py`) drops:

- detections with `confidence == "low"` (or `"l"`),
- detections with `frp < 20 MW`.

Coordinates are rounded to 4 decimals (~11 m). Properties are trimmed to
`acq_datetime`, `confidence`, `frp` — the dashboard does not render
`satellite` or `daynight`. The retained ~14k strongest detections preserve
the spatial story of the event while keeping `fires.json` around 2 MB.

The thresholds live as constants at the top of `pipeline/build.py`. Promoting
them to `EventConfig` is on the follow-up list — different events (e.g., a
small grass fire) would call for different cuts.

## Module layout

```
pipeline/
├── config.py          # EventConfig dataclass + YAML loader
├── firms.py           # NASA FIRMS active-fire detects (transform + fetch)
├── hms.py             # NOAA HMS smoke polygons (transform + fetch)
├── airnow.py          # AirNow hourly PM2.5 (transform + fetch)
├── fpa_fod.py         # FPA FOD historic aggregator (read-only SQLite)
├── build.py           # orchestrator + CLI; writes data/snapshot/<id>/
└── tests/             # pytest, fixture-based; HTTP mocked via `responses`
```
