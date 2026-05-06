# PNW Smoke Response Dashboard — Design Spec

**Date:** 2026-05-05
**Status:** Final draft — pending user review before implementation planning
**Owner:** gwenbayar.cs@gmail.com

## Purpose

Build a portfolio project that directly demonstrates the skills called for in the
USDA Forest Service AirFire fellowship at the Pacific Northwest Research
Station (Seattle). The fellowship is about prototyping decision-support
dashboards from heterogeneous wildfire and air quality data using AI-assisted
coding. This project is intentionally scoped to mirror that work.

A reviewer opening the repo should see, within a few minutes:

- A working web dashboard for a real PNW smoke event
- Heterogeneous data sources combined (satellite fire detects + ground-based air
  quality monitors + smoke polygons + historic fire occurrence baseline)
- The preferred tech stack from the JD (modern JS/TS, charting libraries,
  Python, Docker)
- Clear framing as a decision-support tool for an air-quality-agency stakeholder

## Goals

- One polished stakeholder view (Air Quality Agency) for one real PNW smoke
  event, end-to-end
- Government / report visual aesthetic — restrained, credible, EPA-briefing feel
- Snapshot-based demo (loads in seconds, never breaks) with the data-acquisition
  code path visible in the repo
- `docker compose up` is the entire setup story
- README documents the AI-assisted coding workflow used to build it

## Non-Goals

- Live API pulls in production paths (snapshot only; live mode is shown in code
  but not the default)
- BlueSky smoke-model integration (out of scope for MVP — too operationally
  fiddly to reproduce)
- Fire-manager and public-health stakeholder views (deferred — depth over
  breadth for the MVP)
- Continental-US coverage (PNW only)
- Mobile-first / responsive design (desktop is the target form factor)

## Stakeholder & Story

**Who:** A state or tribal air-quality agency analyst tracking a multi-day PNW
smoke event in near-real-time.

**The question they need answered:** *Where is smoke right now, which monitors
are exceeding NAAQS, and how is it tracking against the source fires?*

The dashboard will be anchored to a single real event (candidate windows: 2020
Labor Day fires in OR/WA, 2021 Bootleg Fire in south-central OR, or 2023
Bedrock/Lookout fires in OR — final pick during implementation).

## Key Decisions

| Decision                | Choice                                              |
| ----------------------- | --------------------------------------------------- |
| Tech stack              | React + TypeScript + D3 + Chart.js                  |
| Backend                 | Python + FastAPI (read-only API over JSON snapshot) |
| Pipeline                | Python script(s), produce JSON to `data/snapshot/`  |
| Geographic scope        | Pacific Northwest (WA, OR, ID, MT, northern CA)     |
| Time horizon            | Snapshot demo (one cached fire week, ships in repo) |
| Stakeholder coverage    | One polished view — Air Quality Agency              |
| Visual style            | Government / report (light, restrained, muted)      |
| Containerization        | docker-compose (`pipeline`, `api`, `web` services)  |
| Smoke model integration | Skip BlueSky for MVP                                |

## Data Sources

| Source                           | Use                                       | Access                     |
| -------------------------------- | ----------------------------------------- | -------------------------- |
| NASA FIRMS (VIIRS/MODIS)         | Active fire detections during event       | Free API key, CSV by bbox  |
| AirNow                           | Hourly PM2.5 from monitors                | Free API key + public archive |
| NOAA HMS smoke polygons          | Smoke plume layer (daily)                 | Free, KML/SHP              |
| FPA FOD (`data/FPA_FOD_*.sqlite`)| Historic baseline (1992–2015)             | Already on disk            |

## Architecture (§1 — approved 2026-05-05)

Three components, talking via flat files and HTTP:

```
┌──────────────────┐    writes JSON      ┌─────────────────┐    reads JSON      ┌─────────────────┐
│  Python pipeline │ ──────────────────▶ │  FastAPI server │ ─────HTTP/JSON──▶ │  React/TS app   │
│  (data/ → static │                     │  (read-only)    │                    │  (D3 + Chart.js)│
│   JSON snapshot) │                     └─────────────────┘                    └─────────────────┘
└──────────────────┘
        ▲
        │ pulls from
        ├── NASA FIRMS (CSV)
        ├── AirNow archive (CSV)
        ├── NOAA HMS (KML/SHP)
        └── FPA FOD (SQLite, already on disk)
```

**Rationale:**

- **Offline-first pipeline.** Runs once, produces `data/snapshot/<event-id>/`
  checked into the repo so the demo never breaks.
- **Thin FastAPI layer.** Mostly reads JSON and serves it, but provides a real
  API surface (`/api/event`, `/api/monitors`, `/api/fires`,
  `/api/smoke-polygons`) so a reviewer can see how live data would slot in.
  Also a natural place to show Python skill beyond the pipeline.
- **React/TS frontend.** D3 for the map (smoke polygons + fire points + monitor
  stations); Chart.js for PM2.5 time-series (faster to author than D3 for line
  charts).
- **docker-compose** with three services: `pipeline`, `api`, `web`. Single
  command demo.

This separation directly addresses the JD's "acquiring, cleaning, and combining
heterogeneous datasets" bullet, and the API surface enables a "here's how this
scales to live" narrative in the README.

## Components (§2 — approved 2026-05-05)

### A) Pipeline (`pipeline/`, Python)

Five modules — one per source plus an orchestrator. Each source module exposes
a `fetch(event_window) → DataFrame` and a `transform(df) → dict`.

| Module       | Responsibility                                           | Output                                |
| ------------ | -------------------------------------------------------- | ------------------------------------- |
| `firms.py`   | VIIRS+MODIS active-fire detects for bbox+window          | `fires.json` (point features)         |
| `airnow.py`  | Hourly PM2.5 for PNW monitors                            | `monitors.json` (station meta + ts)   |
| `hms.py`     | Parse NOAA HMS daily smoke KMLs                          | `smoke.json` (polygon features)       |
| `fpa_fod.py` | Aggregate historic baseline from existing SQLite         | `historic.json` (yearly + by-state)   |
| `build.py`   | Orchestrator — calls each, writes `data/snapshot/<event-id>/` | `event.json` (manifest with metadata) |

CLI: `python -m pipeline.build --event=<event-id>`

The event ID resolves to `events/<event-id>.yml`, which is the single source of
truth for window, bbox, and source params. A `--live` flag is exposed in code
(and documented) but snapshot mode (reading checked-in raw files) is the
default.

### B) FastAPI server (`api/`, Python)

Seven read-only endpoints:

```
GET /api/event              → event metadata (name, window, bbox)
GET /api/fires              → fire detections (GeoJSON)
GET /api/monitors           → monitor stations + AQI summary
GET /api/monitors/{id}/ts   → hourly PM2.5 time-series for one monitor
GET /api/smoke-polygons     → daily smoke polygons (GeoJSON)
GET /api/historic/yearly    → FPA FOD yearly aggregates (PNW)
GET /api/historic/by-cause  → FPA FOD cause breakdown
```

### C) Web app (`web/`, React + TypeScript + Vite)

Single dashboard page, three regions:

```
┌──────────────────────────────────────────────────────────────┐
│  Header: event name, date range, source attributions          │
├───────────┬──────────────────────────────────────────────────┤
│           │                                                  │
│ KPI rail  │   Map (D3): smoke polygons + fire points         │
│ • peak    │   + monitor stations colored by current AQI      │
│   PM2.5   │                                                  │
│ • mons    │                                                  │
│   exceed. ├──────────────────────────────────────────────────┤
│ • fires   │   PM2.5 time-series (Chart.js)                   │
│   count   │   — selected monitor, NAAQS reference line       │
│ • acres   │                                                  │
│           ├──────────────────────────────────────────────────┤
│           │   Historic context strip                         │
│           │   — "this event vs PNW 1992–2015" (small chart)  │
└───────────┴──────────────────────────────────────────────────┘
```

State is intentionally minimal — one selected `monitor_id` (drives the
time-series chart) and one selected `day` (drives which smoke polygon shows).
No router, no global state library.

### Folder layout

```
wildfire/
├── data/                          # raw inputs (FPA_FOD sqlite + downloaded snapshots)
├── pipeline/                      # Python: fetch + transform
├── api/                           # FastAPI: serve JSON
├── web/                           # React + TS frontend
├── docker-compose.yml
├── docs/superpowers/specs/...     # this spec
└── README.md                      # cover letter for the repo
```

## Data Flow (§3 — approved 2026-05-05)

### Build-time flow (run once per event; output checked into git)

1. `events/<event-id>.yml` — event config (name, window, bbox, source params).
2. `python -m pipeline.build --event=<event-id>` runs:
   - `firms.fetch()` → CSV to `data/raw/firms/<event>/`
   - `airnow.fetch()` → hourly CSVs to `data/raw/airnow/<event>/`
   - `hms.fetch()` → daily KMLs to `data/raw/hms/<event>/`
   - `fpa_fod.aggregate()` → reads existing `data/FPA_FOD_*.sqlite` (no download)
   - Each `transform()` writes a typed JSON to `data/snapshot/<event>/`.

### Snapshot layout on disk

```
data/snapshot/<event-id>/
├── event.json          # manifest: name, window, bbox, source attributions, build timestamp
├── fires.json          # GeoJSON FeatureCollection of fire detections
├── monitors.json       # [{id, name, lat, lon, agency, summary: {peak, hours_exceeded}}]
├── monitors_ts/        # one file per monitor (avoids one giant file)
│   ├── M001.json       # [{ts, pm25, aqi}]
│   └── ...
├── smoke.json          # GeoJSON FeatureCollection, `day` attribute on each polygon
└── historic.json       # {yearly: [...], by_cause: [...], by_state: [...]}
```

### Runtime flow (page load)

1. Browser loads React app from `web/dist`.
2. App fires ~5 parallel `fetch()` calls: `/api/event`, `/api/fires`,
   `/api/monitors`, `/api/smoke-polygons`, `/api/historic/yearly`.
3. FastAPI reads the JSON files from disk on each call (small enough we don't
   pre-cache; can add LRU later if needed).
4. App renders KPI rail and map immediately. Time-series is fetched lazily on
   monitor click via `/api/monitors/{id}/ts`.
5. Day-slider on the smoke layer is pure client-side filtering of the
   already-loaded `smoke.json`.

### File-size sanity check

- `fires.json`: ~1k–10k point features for a week → ≤ ~500 KB
- `smoke.json`: ~7 daily polygons → trivial
- `monitors.json`: ~50–100 stations summary → tiny
- `monitors_ts/*.json`: 168 hours × ~100 monitors split per file → ~5 KB each, lazy-loaded
- `historic.json`: pre-aggregated FPA FOD → tiny

Total payload to first paint < 1 MB. Per-monitor click ~5 KB.

## Error Handling (§4 — approved 2026-05-05)

This is a portfolio app, not a 9-to-5 ops system. Lean handling, three
boundaries.

### Pipeline (Python) — fail loudly, fail early

- Each source `fetch()` validates its response (HTTP 200, expected columns,
  non-empty). On failure, raises with a clear message — not swallowed.
- `pipeline.build` is all-or-nothing: if any source fails, the snapshot is not
  written. Reviewer never sees a partially-built dataset.
- API keys (FIRMS, AirNow) read from `.env`; missing keys produce a clear error
  naming the env var and where to obtain the key. `.env.example` is checked in.
- One retry with exponential backoff on network errors. Beyond that, fail.

### FastAPI — clean 4xx/5xx

- Snapshot file not found → `503 Service Unavailable` with
  `{"error": "Snapshot not built. Run python -m pipeline.build --event=<id>."}`.
  Treated as a known state, not a bug, hence not a 500.
- Unknown `monitor_id` on `/api/monitors/{id}/ts` → `404`.
- Unhandled exceptions → `500` with a generic message (no stack traces leaked);
  FastAPI's default exception middleware is sufficient.

### Frontend — degrade gracefully, never blank-page

- Each region renders independently. If smoke-polygons fetch fails, the map
  still shows fires + monitors with a small "smoke layer unavailable" notice
  in the legend.
- Loading states: skeleton blocks for KPIs, a centered spinner over the map
  area, an empty state ("Select a monitor to view PM2.5 history") for the
  time-series until the user clicks.
- All errors logged to console with the failing endpoint URL. No user-facing
  error toasts in MVP.

### Explicitly out of scope

Retry logic in the frontend, observability stack, alerting, auth, rate-limiting
beyond what FIRMS/AirNow already enforce.

## Testing (§5 — approved 2026-05-05)

Pragmatic coverage — enough to demonstrate discipline without over-testing a
portfolio app.

### Pipeline (`pipeline/tests/`, pytest)

- Unit-test each `transform()` against a small fixture file (real CSV/KML
  snippet committed under `tests/fixtures/`). Assert shape, types, and that
  known sentinel records appear in the output.
- One end-to-end test: run `pipeline.build` against fixture inputs, assert all
  expected files are written and `event.json` matches.
- `fetch()` functions are not exercised live — tested with the `responses`
  library mocking HTTP calls. Standard split: `transform()` = pure logic;
  `fetch()` = mocked I/O.

### API (`api/tests/`, pytest + httpx)

- One test per endpoint: happy path returns expected shape, missing-snapshot
  returns 503, bad ID returns 404. ~7 endpoints × ~2 tests each = ~14 tests.
- Run against a tiny fixture snapshot in `api/tests/fixtures/snapshot/`.

### Frontend (`web/`, Vitest + React Testing Library)

- Component-level: KPI rail renders given fixture data; time-series chart
  renders given fixture data; error state shows when fetch rejects.
- One smoke test mounts the full `<App />` against a mocked API (msw) and
  asserts the dashboard renders without errors.
- No E2E browser tests (Playwright/Cypress) — overkill for MVP. README will
  document a manual smoke test: `docker compose up`, open
  `http://localhost:5173`, click two monitors.

### CI (`.github/workflows/ci.yml`)

- One workflow, three jobs in parallel: `pipeline-tests`, `api-tests`,
  `web-tests`. All green = PR-mergeable.
- No deployment automation in MVP.

### Out of scope

Snapshot/visual regression tests, performance benchmarks, load tests,
accessibility automation. README will note that the UI uses semantic HTML and
WCAG-aware color choices, but axe-core is not run in CI.

## Open Questions

- Which specific event window to anchor the demo to (decided during
  implementation; candidates listed under Stakeholder & Story).
