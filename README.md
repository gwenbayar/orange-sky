# OrangeSky: PNW Smoke Response Dashboard

A working prototype of an air-quality-agency decision-support dashboard for a
Pacific Northwest wildfire smoke event. Combines satellite fire detections,
ground-based PM2.5 monitors, smoke-plume polygons, and a historic fire-
occurrence baseline into a single web view.

The shipped event is the **2020 Labor Day Fires** (OR/WA), Sept 7–14, 2020 —
one of the most extreme smoke events on record in the Pacific Northwest.

<img width="1470" height="809" alt="Screenshot 2026-05-09 at 9 47 19 PM" src="https://github.com/user-attachments/assets/78d45ac0-932a-4d43-a160-ffa554479cc6" />
<img width="1469" height="795" alt="Screenshot 2026-05-09 at 9 43 20 PM" src="https://github.com/user-attachments/assets/4679bb52-732d-44a3-aef7-4968fc210e62" />
<img width="1470" height="731" alt="Screenshot 2026-05-09 at 9 43 58 PM" src="https://github.com/user-attachments/assets/6a1da4dd-e938-44b8-95e8-b6ff3caaccd3" />

## What's on screen

- **About panel** — collapsible reading guide pinned at the top of the
  dashboard. Explains what each layer means, the data sources, and the
  caveats. Open by default; users can collapse it after their first read.
- **KPI rail** — peak PM2.5 across all monitors, count of monitors over the
  35 µg/m³ NAAQS threshold, active fire-detect count, total HMS smoke
  polygons (with the day count as a subline).
- **Map** — focused on the event states (WA / OR / ID / MT / CA) plus a
  curated ring of context-state neighbors. A day-strip selector flips the
  map between two views:
  - **Overall** — fires aggregated across the event window (top 4,000 by
    FRP), monitors colored by their event-window peak PM2.5, smoke layer
    hidden (smoke is intrinsically a daily field).
  - **Day in view** — fires + smoke + monitor color all filtered to a single
    day. NOAA HMS smoke is grouped by density (Heavy / Medium / Light), each
    tier rendered as an isolated group with opaque fill + group opacity to
    prevent multi-polygon alpha buildup, and clipped to the event-state
    silhouettes so it follows real borders instead of an arbitrary rectangle.
    Monitors with no reading on the selected day render as faint gray.
  - Click any monitor to drill into its hourly PM2.5 trace.
- **PM2.5 time-series** — hourly trace for the selected monitor, with the
  NAAQS reference and the count of hours over the standard during the window.
- **Historic context strip** — PNW yearly fires from FPA FOD (1992–2015),
  so the event can be read against the long-run baseline.

## Stakeholder & question

**Audience:** A state, tribal, or federal air-quality analyst tracking a
multi-day smoke event in near-real-time.

**The question they need answered:** *Where is smoke right now, which monitors
are exceeding NAAQS, and how is it tracking against the source fires?*

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
