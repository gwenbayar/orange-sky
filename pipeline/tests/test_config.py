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
