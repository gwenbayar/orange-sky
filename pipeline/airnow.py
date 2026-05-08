from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

import requests

NAAQS_PM25_24H = 35.0  # µg/m³
AIRNOW_BASE = "https://files.airnowtech.org/airnow"


def _parse_line(line: str) -> dict | None:
    parts = line.rstrip("\n").split("|")
    if len(parts) < 12:
        return None
    if parts[8] != "PM2.5":
        return None
    return {
        "ts": f"{parts[0]}T{parts[1]}:00Z",
        "id": parts[2],
        "name": parts[3],
        "state": parts[4],
        "lat": float(parts[6]),
        "lon": float(parts[7]),
        "pm25": float(parts[9]),
        "agency": parts[11],
    }


def transform(hourly_files: Iterable[Path]) -> dict:
    """Parse AirNow hourly archive files into a station roster + per-monitor timeseries."""
    by_monitor: dict[str, list[dict]] = defaultdict(list)
    meta: dict[str, dict] = {}
    for path in hourly_files:
        for line in Path(path).read_text().splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            row = _parse_line(line)
            if row is None:
                continue
            by_monitor[row["id"]].append({"ts": row["ts"], "pm25": row["pm25"]})
            meta.setdefault(row["id"], {
                "id": row["id"],
                "name": row["name"],
                "state": row["state"],
                "lat": row["lat"],
                "lon": row["lon"],
                "agency": row["agency"],
            })

    monitors = []
    for mid, rows in by_monitor.items():
        rows.sort(key=lambda r: r["ts"])
        peak = max(r["pm25"] for r in rows)
        hours_over = sum(1 for r in rows if r["pm25"] > NAAQS_PM25_24H)
        m = dict(meta[mid])
        m["summary"] = {"peak": peak, "hours_exceeded_naaqs": hours_over}
        monitors.append(m)
    monitors.sort(key=lambda m: m["id"])

    return {"monitors": monitors, "timeseries": dict(by_monitor)}


def fetch(window_start: date, window_end: date, dest_dir: Path) -> list[Path]:
    """Download AirNow hourly archive files for every hour in [start, end) (UTC).
    Returns list of local file paths."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    cur = window_start
    while cur < window_end:
        for hh in range(24):
            stamp = f"{cur.strftime('%Y%m%d')}{hh:02d}"
            url = f"{AIRNOW_BASE}/{cur.strftime('%Y')}/{cur.strftime('%Y%m%d')}/HourlyData_{stamp}.dat"
            local = dest_dir / f"HourlyData_{stamp}.dat"
            resp = requests.get(url, timeout=60)
            if resp.status_code != 200:
                raise RuntimeError(f"AirNow fetch failed for {stamp}: {resp.status_code}")
            local.write_bytes(resp.content)
            out.append(local)
        cur += timedelta(days=1)
    return out
