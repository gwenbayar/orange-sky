import argparse
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

from pipeline import airnow, firms, fpa_fod, hms
from pipeline.config import EventConfig, load_event


_SAFE_ID = re.compile(r"[^A-Za-z0-9_-]")

# FIRMS post-filter thresholds. VIIRS at 375m generates many low-FRP detects from
# warm soil/sun-glint; the dashboard map is unreadable at 70k+ points. Dropping
# low-confidence + FRP<10 MW retains the headline fires while keeping the
# committed snapshot reasonable in size.
_FIRMS_DROP_LOW_CONFIDENCE = True
_FIRMS_MIN_FRP_MW = 20.0
_LOW_CONF_VALUES = {"l", "low"}


def _safe_filename(value: str) -> str:
    """Sanitize a monitor ID for use as a filename. Replaces non-alphanumeric/_/- with `_`."""
    return _SAFE_ID.sub("_", value)


def _filter_fires(fires: dict) -> dict:
    """Drop low-confidence and very weak (FRP < threshold) fire detections, round
    coords to 4 decimals (~11m), and strip properties the dashboard doesn't render."""
    kept = []
    for f in fires["features"]:
        props = f["properties"]
        if _FIRMS_DROP_LOW_CONFIDENCE and props.get("confidence", "").lower() in _LOW_CONF_VALUES:
            continue
        if float(props.get("frp", 0.0)) < _FIRMS_MIN_FRP_MW:
            continue
        lon, lat = f["geometry"]["coordinates"]
        kept.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]},
            "properties": {
                "acq_datetime": props["acq_datetime"],
                "confidence": props["confidence"],
                "frp": round(float(props["frp"]), 1),
            },
        })
    return {"type": "FeatureCollection", "features": kept}


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")))


def _kmls_by_day(raw_hms_dir: Path) -> dict[date, Path]:
    out: dict[date, Path] = {}
    for kml in sorted(raw_hms_dir.glob("hms_smoke*.kml")):
        # filename pattern: hms_smokeYYYYMMDD.kml
        stem = kml.stem.replace("hms_smoke", "")
        out[date.fromisoformat(f"{stem[0:4]}-{stem[4:6]}-{stem[6:8]}")] = kml
    return out


def build_snapshot(
    cfg: EventConfig,
    raw_dir: Path,
    fpa_db: Path,
    out_dir: Path,
) -> None:
    """Snapshot mode: read pre-downloaded raw files under `raw_dir/{firms,hms,airnow}/`,
    aggregate FPA FOD from `fpa_db`, and write the snapshot tree under `out_dir`."""
    out_dir.mkdir(parents=True, exist_ok=True)

    fires = _filter_fires(firms.transform(
        sorted((raw_dir / "firms").glob("*.csv")),
        bbox=cfg.bbox,
    ))
    smoke = hms.transform(_kmls_by_day(raw_dir / "hms"))
    air = airnow.transform(
        sorted((raw_dir / "airnow").glob("HourlyAQObs_*.dat")),
        states=cfg.states,
    )
    historic = fpa_fod.aggregate(fpa_db, states=tuple(cfg.states))

    _write_json(out_dir / "fires.json", fires)
    _write_json(out_dir / "smoke.json", smoke)
    _write_json(out_dir / "monitors.json", {"monitors": air["monitors"]})
    for mid, rows in air["timeseries"].items():
        safe = _safe_filename(mid)
        _write_json(out_dir / "monitors_ts" / f"{safe}.json", rows)
    _write_json(out_dir / "historic.json", historic)

    manifest = {
        "id": cfg.id,
        "name": cfg.name,
        "window": {"start": cfg.window_start.isoformat(), "end": cfg.window_end.isoformat()},
        "bbox": list(cfg.bbox),
        "states": list(cfg.states),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "firms": {"name": "NASA FIRMS (VIIRS/MODIS active fire detections)"},
            "hms": {"name": "NOAA Hazard Mapping System smoke polygons"},
            "airnow": {"name": "AirNow hourly PM2.5"},
            "fpa_fod": {"name": "USFS FPA FOD historic occurrences (1992–2015)"},
        },
        "counts": {
            "fires": len(fires["features"]),
            "smoke_polygons": len(smoke["features"]),
            "monitors": len(air["monitors"]),
        },
    }
    _write_json(out_dir / "event.json", manifest)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--event", required=True, help="Event ID — must match events/<id>.yml")
    p.add_argument("--raw-dir", default="data/raw", help="Root of raw inputs")
    p.add_argument("--fpa-db", default="data/FPA_FOD_20170508.sqlite")
    p.add_argument("--out-dir", default="data/snapshot")
    args = p.parse_args()

    cfg = load_event(Path(f"events/{args.event}.yml"))
    build_snapshot(
        cfg,
        raw_dir=Path(args.raw_dir) / args.event,
        fpa_db=Path(args.fpa_db),
        out_dir=Path(args.out_dir) / args.event,
    )


if __name__ == "__main__":
    main()
