# PNW Smoke Response Dashboard

A working prototype of an air-quality-agency decision-support dashboard for a
Pacific Northwest wildfire smoke event. Combines satellite fire detections,
ground-based PM2.5 monitors, smoke-plume polygons, and a historic fire-
occurrence baseline into a single web view.

Built as a portfolio project for the **USDA Forest Service AirFire fellowship
at the Pacific Northwest Research Station** (Seattle). The fellowship is about
prototyping decision-support dashboards from heterogeneous wildfire/air-
quality data using AI-assisted coding; this repo intentionally mirrors that
scope.

The shipped event is the **2020 Labor Day Fires** (OR/WA), Sept 7–14, 2020 —
one of the most extreme smoke events on record in the Pacific Northwest.

## Stakeholder & question

**Audience:** A state, tribal, or federal air-quality analyst tracking a
multi-day smoke event in near-real-time.

**The question they need answered:** *Where is smoke right now, which monitors
are exceeding NAAQS, and how is it tracking against the source fires?*

## What's on screen

- **KPI rail** — peak PM2.5, monitors over the 35 µg/m³ NAAQS threshold,
  active fire-detect count, smoke-day count
- **Map** — US state outlines, daily NOAA HMS smoke polygons,
  FIRMS active-fire detects (top 4 000 by FRP for SVG performance), and
  AirNow monitors colored by their AQI category. Click a monitor to drill
  into its hourly PM2.5 history.
- **PM2.5 time-series** — hourly trace for the selected monitor, with the
  NAAQS reference and the count of hours over the standard during the window.
- **Historic context strip** — PNW yearly fires from FPA FOD (1992–2015),
  so the event can be read against the long-run baseline.

## How this maps to the fellowship JD

| JD bullet                                        | Where in this repo                               |
| ------------------------------------------------ | ------------------------------------------------ |
| Acquire, clean, combine heterogeneous datasets   | `pipeline/` — 4 source modules + orchestrator    |
| Modern JS/HTML/CSS, charting libraries           | `web/` — React + TypeScript, D3-geo, Chart.js    |
| Python in an IDE                                 | `pipeline/` and `api/` (pytest, ruff)            |
| Docker                                           | `api/Dockerfile`, `web/Dockerfile`, `docker-compose.yml` |
| AI-assisted coding workflow                      | `docs/superpowers/specs/`, `docs/superpowers/plans/` (full design + plans + commit history) |
| Decision-support tailored to AQ stakeholders     | Single-stakeholder framing throughout the UI     |

## Tech stack

- **Pipeline** — Python 3.12, pandas, requests, pyyaml, fastkml, shapely,
  pytest (HTTP mocked via `responses`)
- **API** — FastAPI 0.136, uvicorn, httpx (test)
- **Web** — React 19, TypeScript, Vite 8, D3-geo, topojson-client, Chart.js
- **CI** — GitHub Actions (pytest + tsc/vite build, parallel jobs)
- **Container** — `docker compose up` runs the API + the nginx-served web
  bundle with the API proxied behind it

## Quick start (Docker)

```bash
docker compose up --build
# API:  http://localhost:8000/docs
# Web:  http://localhost:5173
```

The committed snapshot under `data/snapshot/2020-labor-day/` is mounted into
the API container, so no live API keys or downloads are needed to demo.

## Quick start (local dev)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn api.main:app --port 8000 --reload   # backend
# in another terminal
cd web && npm install && npm run dev        # frontend (Vite proxies /api → :8000)
```

Open `http://localhost:5173`.

## Rebuilding the snapshot from scratch

```bash
cp .env.example .env   # add a free FIRMS API key
python scripts/fetch_raw.py 2020-labor-day   # downloads to data/raw/ (~10–15 min)
python -m pipeline.build --event=2020-labor-day
```

This regenerates everything under `data/snapshot/2020-labor-day/`. The 759 MB
`data/FPA_FOD_20170508.sqlite` must be on disk locally (gitignored due to
size; download instructions in `pipeline/README.md`).

## Repo layout

```
.
├── pipeline/          # Python data pipeline (4 sources + orchestrator)
├── api/               # FastAPI server (read-only, 8 endpoints over the snapshot)
├── web/               # React + TS + Vite dashboard
├── events/            # Per-event YAML configs (window, bbox, states)
├── scripts/           # Fetch helpers
├── data/snapshot/     # Built snapshot — committed
├── data/raw/          # Downloaded source files — gitignored
├── docs/superpowers/  # Design spec + per-phase implementation plans
├── docker-compose.yml
└── .github/workflows/ # CI
```

## Data sources

| Source     | Purpose                              | License/access                       |
| ---------- | ------------------------------------ | ------------------------------------ |
| NASA FIRMS | Active fire detects (VIIRS_SNPP_SP)  | Free, requires API key               |
| NOAA HMS   | Daily smoke plume polygons (KML)     | Public, no key                       |
| AirNow     | Hourly PM2.5 by monitor (HourlyAQObs)| Public archive, no key               |
| FPA FOD    | Historic fire occurrences 1992–2015  | Local SQLite (download once)         |
| us-atlas   | State outlines (TopoJSON)            | Public domain                        |

See `pipeline/README.md` for live-archive details (FIRMS NRT vs SP, AirNow
CSV format change, NOAA HMS URL layout, fires post-filter policy).


## Tests

```bash
pytest                # 26 tests: pipeline + api
cd web && npm run build   # tsc + vite (type-check + production build)
```

## Limitations / known follow-ups

These are flagged in code review notes inside the design spec; not blockers
for the demo:

- `fires.json` is ~2.2 MB after filtering — over the per-file budget the
  design spec set. A future iteration would render fires via Canvas or as
  pre-tiled MVT.
- FIRMS post-filter thresholds (FRP ≥ 20 MW, drop low-confidence) are
  hardcoded in `pipeline/build.py`. Promoting them to `EventConfig` would
  let different events tune their own cuts.
- BlueSky smoke-model integration is out of scope for the MVP — would
  require a separate ingestion module.
- No browser end-to-end tests yet (Playwright). Manual smoke test only.

## License

MIT (see `LICENSE` if present, else assumed for portfolio purposes).
