"""Synthesize a tiny snapshot dir for endpoint tests."""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def snapshot_dir(tmp_path: Path) -> Path:
    """Build a synthetic snapshot under tmp_path and return its directory."""
    snap = tmp_path / "snap"
    snap.mkdir()
    (snap / "event.json").write_text(json.dumps({
        "id": "test-event",
        "name": "Test Event",
        "window": {"start": "2020-09-10", "end": "2020-09-11"},
        "bbox": [-125.0, 41.0, -115.0, 49.0],
        "states": ["WA", "OR"],
        "built_at": "2020-09-15T00:00:00Z",
        "sources": {"firms": {"name": "FIRMS"}},
        "counts": {"fires": 1, "smoke_polygons": 1, "monitors": 2},
    }))
    (snap / "fires.json").write_text(json.dumps({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-122.0, 44.5]},
            "properties": {"acq_datetime": "2020-09-10T18:00:00Z", "confidence": "high", "frp": 55.2},
        }],
    }))
    (snap / "smoke.json").write_text(json.dumps({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [[[-123.0, 45.0], [-122.0, 45.0], [-122.0, 46.0], [-123.0, 46.0], [-123.0, 45.0]]]},
            "properties": {"day": "2020-09-10", "density": "Heavy"},
        }],
    }))
    (snap / "monitors.json").write_text(json.dumps({
        "monitors": [
            {"id": "M001", "name": "Portland", "state": "OR", "lat": 44.65, "lon": -123.10,
             "agency": "MULTNOMAH", "summary": {"peak": 450.0, "hours_exceeded_naaqs": 12}},
            {"id": "M002", "name": "Seattle", "state": "WA", "lat": 47.57, "lon": -122.31,
             "agency": "PSCAA", "summary": {"peak": 185.0, "hours_exceeded_naaqs": 8}},
        ],
    }))
    ts_dir = snap / "monitors_ts"
    ts_dir.mkdir()
    (ts_dir / "M001.json").write_text(json.dumps([
        {"ts": "2020-09-10T13:00:00Z", "pm25": 412.0},
        {"ts": "2020-09-10T14:00:00Z", "pm25": 450.0},
    ]))
    (ts_dir / "M002.json").write_text(json.dumps([
        {"ts": "2020-09-10T13:00:00Z", "pm25": 178.0},
    ]))
    (snap / "historic.json").write_text(json.dumps({
        "yearly": [{"year": 2010, "fires": 100, "acres": 5000.0}],
        "by_cause": [{"cause": "Lightning", "fires": 60, "acres": 3000.0}],
        "by_state": [{"state": "OR", "fires": 40, "acres": 2000.0}],
    }))
    return snap


@pytest.fixture
def client(snapshot_dir: Path) -> TestClient:
    os.environ["SNAPSHOT_DIR"] = str(snapshot_dir)
    from api.main import app
    return TestClient(app)


@pytest.fixture
def empty_snapshot_dir(tmp_path: Path) -> Path:
    """An empty dir — for testing 503 on missing snapshot files."""
    d = tmp_path / "empty"
    d.mkdir()
    return d


@pytest.fixture
def empty_client(empty_snapshot_dir: Path) -> TestClient:
    os.environ["SNAPSHOT_DIR"] = str(empty_snapshot_dir)
    from api.main import app
    return TestClient(app)
