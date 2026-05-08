from datetime import date
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests

BBox = tuple[float, float, float, float]

FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def transform(csv_paths: Iterable[Path], bbox: BBox) -> dict:
    """Combine FIRMS CSVs, filter to bbox, emit a Point GeoJSON FeatureCollection."""
    lon_min, lat_min, lon_max, lat_max = bbox
    frames = [pd.read_csv(p) for p in csv_paths]
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if df.empty:
        return {"type": "FeatureCollection", "features": []}

    df = df[
        (df.longitude >= lon_min)
        & (df.longitude <= lon_max)
        & (df.latitude >= lat_min)
        & (df.latitude <= lat_max)
    ].copy()

    # Combine acq_date + acq_time (HHMM) into ISO datetime.
    df["acq_time"] = df["acq_time"].astype(str).str.zfill(4)
    df["acq_datetime"] = (
        df["acq_date"].astype(str) + "T" + df["acq_time"].str[:2] + ":" + df["acq_time"].str[2:] + ":00Z"
    )

    features = []
    for _, r in df.iterrows():
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(r.longitude), float(r.latitude)]},
            "properties": {
                "acq_datetime": r["acq_datetime"],
                "confidence": str(r["confidence"]),
                "frp": float(r["frp"]),
                "satellite": str(r["satellite"]),
                "daynight": str(r["daynight"]),
            },
        })
    return {"type": "FeatureCollection", "features": features}


def fetch(
    api_key: str,
    source: str,                 # "VIIRS_SNPP_NRT" or "MODIS_NRT"
    bbox: BBox,
    window_start: date,
    window_end: date,
    dest_dir: Path,
) -> Path:
    """Download FIRMS CSV for the bbox + window. Returns the local file path."""
    if not api_key:
        raise RuntimeError("FIRMS_API_KEY not set; see .env.example")
    days = (window_end - window_start).days + 1
    if days > 10:
        raise ValueError("FIRMS API limits area requests to 10 days")
    lon_min, lat_min, lon_max, lat_max = bbox
    area = f"{lon_min},{lat_min},{lon_max},{lat_max}"
    url = (
        f"{FIRMS_API}/{api_key}/{source}/{area}/{days}/{window_start.isoformat()}"
    )
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"firms_{source}_{window_start.isoformat()}_{window_end.isoformat()}.csv"
    resp = requests.get(url, timeout=120)
    if resp.status_code != 200 or len(resp.text) == 0:
        raise RuntimeError(f"FIRMS fetch failed ({resp.status_code}): {url}")
    out.write_text(resp.text)
    return out
