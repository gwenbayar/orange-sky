from datetime import date
from pathlib import Path

import responses

from pipeline.airnow import fetch, transform


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
    assert m1["summary"]["hours_exceeded_naaqs"] == 2  # NAAQS 35 µg/m³, both hours over

    ts = {tid: rows for tid, rows in out["timeseries"].items()}
    assert len(ts["M001"]) == 2
    assert ts["M001"][0]["pm25"] == 412.0


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
