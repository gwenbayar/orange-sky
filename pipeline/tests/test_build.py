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
