# API

Read-only FastAPI server over the snapshot built in `pipeline/`. Reads JSON
files from `$SNAPSHOT_DIR` (default `data/snapshot/2020-labor-day`).

## Run

```bash
source .venv/bin/activate
uvicorn api.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the auto-generated Swagger UI.

## Endpoints

| Method | Path                          | Description                           |
| ------ | ----------------------------- | ------------------------------------- |
| GET    | `/api/health`                 | liveness                              |
| GET    | `/api/event`                  | event manifest (window, bbox, counts) |
| GET    | `/api/fires`                  | FIRMS detects (GeoJSON FeatureCollection) |
| GET    | `/api/smoke-polygons`         | HMS daily smoke polygons (GeoJSON)    |
| GET    | `/api/monitors`               | AirNow monitor stations + summaries   |
| GET    | `/api/monitors/{id}/ts`       | hourly PM2.5 timeseries for one monitor |
| GET    | `/api/historic/yearly`        | FPA FOD yearly aggregates (PNW)       |
| GET    | `/api/historic/by-cause`      | FPA FOD cause breakdown               |

## Errors

- `503` — snapshot file missing on disk (run `python -m pipeline.build --event=<id>` first)
- `404` — unknown monitor id
- `400` — monitor id failed safe-id regex (`[A-Za-z0-9_-]+`)

## Tests

```bash
pytest api/tests -v
```

Tests use FastAPI's `TestClient` against a synthetic snapshot built per-test.
No network needed.
