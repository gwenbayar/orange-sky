import csv
from collections import defaultdict
from datetime import date, timedelta
from io import StringIO
from pathlib import Path
from typing import Iterable

import requests

NAAQS_PM25_24H = 35.0  # µg/m³
AIRNOW_BASE = "https://files.airnowtech.org/airnow"

# AirNow `HourlyAQObs_*.dat` is a CSV with a header row. _parse_row pulls
# fields by name (via csv.DictReader) so column reordering won't silently
# break us.


def _iter_rows(path: Path):
    """Yield dict rows from one HourlyAQObs CSV file."""
    text = Path(path).read_text(errors="replace")
    reader = csv.DictReader(StringIO(text))
    for row in reader:
        yield row


def _parse_row(row: dict) -> dict | None:
    pm25 = (row.get("PM25") or "").strip()
    if not pm25:
        return None
    try:
        pm25_val = float(pm25)
    except ValueError:
        return None
    try:
        lat = float(row["Latitude"])
        lon = float(row["Longitude"])
    except (KeyError, ValueError, TypeError):
        return None
    valid_date = (row.get("ValidDate") or "").strip()  # "MM/DD/YY"
    valid_time = (row.get("ValidTime") or "").strip()  # "HH:MM"
    if not valid_date or not valid_time:
        return None
    try:
        mm, dd, yy = valid_date.split("/")
        ts = f"20{yy}-{mm}-{dd}T{valid_time}:00Z"
    except ValueError:
        return None
    return {
        "ts": ts,
        "id": (row.get("AQSID") or "").strip(),
        "name": (row.get("SiteName") or "").strip(),
        "state": (row.get("StateName") or "").strip(),
        "lat": lat,
        "lon": lon,
        "pm25": pm25_val,
        "agency": (row.get("DataSource") or "").strip(),
    }


def transform(hourly_files: Iterable[Path], states: Iterable[str] | None = None) -> dict:
    """Parse AirNow HourlyAQObs CSV files into a station roster + per-monitor timeseries.

    If `states` is provided, only monitors in those StateName values are included
    (e.g. ('WA','OR','ID','MT','CA') for PNW snapshots)."""
    state_filter = {s.upper() for s in states} if states else None
    by_monitor: dict[str, list[dict]] = defaultdict(list)
    meta: dict[str, dict] = {}
    for path in hourly_files:
        for raw in _iter_rows(Path(path)):
            row = _parse_row(raw)
            if row is None or not row["id"]:
                continue
            if state_filter is not None and row["state"].upper() not in state_filter:
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
        # Per-day peak — lets the dashboard color monitors by that day's worst
        # reading instead of the event-window peak. Day key is the UTC date
        # from the timestamp; rounded to 1 decimal to match `summary.peak`.
        daily: dict[str, float] = {}
        for r in rows:
            day = r["ts"][:10]
            if r["pm25"] > daily.get(day, float("-inf")):
                daily[day] = r["pm25"]
        daily_peak = {d: round(v, 1) for d, v in sorted(daily.items())}
        m = dict(meta[mid])
        m["summary"] = {"peak": peak, "hours_exceeded_naaqs": hours_over}
        m["daily_peak"] = daily_peak
        monitors.append(m)
    monitors.sort(key=lambda m: m["id"])

    return {"monitors": monitors, "timeseries": dict(by_monitor)}


def fetch(window_start: date, window_end: date, dest_dir: Path) -> list[Path]:
    """Download AirNow `HourlyAQObs_*.dat` archive files for every hour in
    [start, end) (UTC). Returns list of local file paths."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    cur = window_start
    while cur < window_end:
        for hh in range(24):
            stamp = f"{cur.strftime('%Y%m%d')}{hh:02d}"
            url = f"{AIRNOW_BASE}/{cur.strftime('%Y')}/{cur.strftime('%Y%m%d')}/HourlyAQObs_{stamp}.dat"
            local = dest_dir / f"HourlyAQObs_{stamp}.dat"
            resp = requests.get(url, timeout=60)
            if resp.status_code != 200:
                raise RuntimeError(f"AirNow fetch failed for {stamp}: {resp.status_code}")
            local.write_bytes(resp.content)
            out.append(local)
        cur += timedelta(days=1)
    return out
