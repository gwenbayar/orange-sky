from datetime import date
from pathlib import Path

import responses

from pipeline.hms import fetch, transform


FIX = Path(__file__).parent / "fixtures" / "hms_sample.kml"


def test_transform_one_kml_to_geojson():
    out = transform({date(2020, 9, 10): FIX})
    assert out["type"] == "FeatureCollection"
    assert len(out["features"]) == 2
    f0 = out["features"][0]
    assert f0["type"] == "Feature"
    assert f0["geometry"]["type"] == "Polygon"
    assert f0["properties"]["day"] == "2020-09-10"
    assert f0["properties"]["density"] in {"Heavy", "Light"}


def test_transform_multi_day():
    out = transform({
        date(2020, 9, 10): FIX,
        date(2020, 9, 11): FIX,
    })
    days = {f["properties"]["day"] for f in out["features"]}
    assert days == {"2020-09-10", "2020-09-11"}
    assert len(out["features"]) == 4


@responses.activate
def test_fetch_writes_kml(tmp_path):
    body = (FIX).read_bytes()
    url = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/2020/hms_smoke20200910.kml"
    responses.add(responses.GET, url, body=body, status=200)
    out = fetch(date(2020, 9, 10), tmp_path)
    assert out.exists()
    assert out.read_bytes() == body
