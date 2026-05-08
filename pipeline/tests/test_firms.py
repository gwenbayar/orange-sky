from datetime import date
from pathlib import Path

import responses

from pipeline.firms import fetch, transform


FIX = Path(__file__).parent / "fixtures" / "firms_sample.csv"
BBOX = (-125.0, 41.0, -115.0, 49.0)


def test_transform_filters_to_bbox_and_emits_geojson():
    out = transform([FIX], bbox=BBOX)
    assert out["type"] == "FeatureCollection"
    # 5 rows in fixture, 1 outside bbox → 4 features
    assert len(out["features"]) == 4
    f0 = out["features"][0]
    assert f0["type"] == "Feature"
    assert f0["geometry"]["type"] == "Point"
    coords = f0["geometry"]["coordinates"]
    assert -125.0 <= coords[0] <= -115.0
    assert 41.0 <= coords[1] <= 49.0
    assert "frp" in f0["properties"]
    assert "acq_datetime" in f0["properties"]


def test_transform_high_confidence_flag():
    out = transform([FIX], bbox=BBOX)
    high = [f for f in out["features"] if f["properties"]["confidence"] == "high"]
    assert len(high) == 1


@responses.activate
def test_fetch_writes_csv(tmp_path):
    body = FIX.read_text()
    url = (
        "https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY123/VIIRS_SNPP_NRT/"
        "-125.0,41.0,-115.0,49.0/8/2020-09-07"
    )
    responses.add(responses.GET, url, body=body, status=200, content_type="text/csv")
    out = fetch(
        api_key="KEY123",
        source="VIIRS_SNPP_NRT",
        bbox=BBOX,
        window_start=date(2020, 9, 7),
        window_end=date(2020, 9, 14),
        dest_dir=tmp_path,
    )
    assert out.exists()
    assert "latitude" in out.read_text()
