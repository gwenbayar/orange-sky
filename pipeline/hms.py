from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"kml": "http://www.opengis.net/kml/2.2"}

# HMS density bands (µg/m³); map to coarse labels for display.
def _density_label(value: float) -> str:
    if value >= 21:
        return "Heavy"
    if value >= 11:
        return "Medium"
    return "Light"


def _parse_kml(path: Path, day: date) -> list[dict]:
    tree = ET.parse(path)
    root = tree.getroot()
    features: list[dict] = []
    for pm in root.iter("{%s}Placemark" % NS["kml"]):
        # density
        density_val = 0.0
        for d in pm.iter("{%s}Data" % NS["kml"]):
            if d.get("name") == "Density":
                v = d.find("{%s}value" % NS["kml"])
                if v is not None and v.text:
                    density_val = float(v.text)
        # polygon coords
        coords_el = pm.find(
            "{kml}Polygon/{kml}outerBoundaryIs/{kml}LinearRing/{kml}coordinates".replace(
                "{kml}", "{%s}" % NS["kml"]
            )
        )
        if coords_el is None or coords_el.text is None:
            continue
        ring: list[list[float]] = []
        for token in coords_el.text.strip().split():
            lon, lat, *_ = token.split(",")
            ring.append([float(lon), float(lat)])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"day": day.isoformat(), "density": _density_label(density_val)},
        })
    return features


def transform(kml_by_day: dict[date, Path]) -> dict:
    """Parse one KML per day into a single GeoJSON FeatureCollection,
    tagging each polygon with its `day`."""
    features: list[dict] = []
    for day, path in sorted(kml_by_day.items()):
        features.extend(_parse_kml(path, day))
    return {"type": "FeatureCollection", "features": features}


import requests

HMS_BASE = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons"


def fetch(day: date, dest_dir: Path) -> Path:
    """Download one HMS daily KML for `day` to `dest_dir`. Returns the file path."""
    yyyy = day.strftime("%Y")
    fname = f"hms_smoke{day.strftime('%Y%m%d')}.kml"
    url = f"{HMS_BASE}/{yyyy}/{fname}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / fname
    resp = requests.get(url, timeout=60)
    if resp.status_code != 200 or len(resp.content) == 0:
        raise RuntimeError(f"HMS fetch failed for {day} ({resp.status_code}): {url}")
    out.write_bytes(resp.content)
    return out
