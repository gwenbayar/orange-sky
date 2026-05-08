"""Read-only HTTP API over a built snapshot tree.

Reads JSON files from the directory named by SNAPSHOT_DIR (default
`data/snapshot/2020-labor-day`). Each endpoint serves a slice of the snapshot
to the dashboard. Missing files return 503; unknown monitor IDs return 404.
"""
import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

DEFAULT_SNAPSHOT_DIR = "data/snapshot/2020-labor-day"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")

app = FastAPI(title="PNW Smoke Dashboard API", version="0.1.0")

# CORS open in dev so the Vite dev server (Phase 3) can call us from a different port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _snapshot_dir() -> Path:
    return Path(os.environ.get("SNAPSHOT_DIR", DEFAULT_SNAPSHOT_DIR))


def _load_json(name: str) -> dict:
    path = _snapshot_dir() / name
    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Snapshot file missing: {name}. Run `python -m pipeline.build --event=<id>`.",
        )
    return json.loads(path.read_text())


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "snapshot_dir": str(_snapshot_dir())}


@app.get("/api/event")
def event() -> dict:
    return _load_json("event.json")


@app.get("/api/fires")
def fires() -> dict:
    return _load_json("fires.json")


@app.get("/api/smoke-polygons")
def smoke_polygons() -> dict:
    return _load_json("smoke.json")


@app.get("/api/monitors")
def monitors() -> dict:
    return _load_json("monitors.json")


@app.get("/api/monitors/{monitor_id}/ts")
def monitor_timeseries(monitor_id: str) -> list[dict]:
    if not _SAFE_ID.match(monitor_id):
        raise HTTPException(status_code=400, detail="Invalid monitor ID format.")
    path = _snapshot_dir() / "monitors_ts" / f"{monitor_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Monitor not found: {monitor_id}")
    return json.loads(path.read_text())


@app.get("/api/historic/yearly")
def historic_yearly() -> list[dict]:
    return _load_json("historic.json")["yearly"]


@app.get("/api/historic/by-cause")
def historic_by_cause() -> list[dict]:
    return _load_json("historic.json")["by_cause"]
