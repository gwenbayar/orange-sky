"""End-to-end endpoint tests against a synthetic snapshot."""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_event(client):
    r = client.get("/api/event")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "test-event"
    assert body["window"]["start"] == "2020-09-10"


def test_fires_geojson_shape(client):
    r = client.get("/api/fires")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert body["features"][0]["properties"]["confidence"] == "high"


def test_smoke_polygons(client):
    r = client.get("/api/smoke-polygons")
    assert r.status_code == 200
    body = r.json()
    assert body["features"][0]["properties"]["day"] == "2020-09-10"


def test_monitors(client):
    r = client.get("/api/monitors")
    assert r.status_code == 200
    body = r.json()
    assert {m["id"] for m in body["monitors"]} == {"M001", "M002"}


def test_monitor_timeseries_happy(client):
    r = client.get("/api/monitors/M001/ts")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    assert rows[0]["pm25"] == 412.0


def test_monitor_timeseries_404_unknown(client):
    r = client.get("/api/monitors/MZZZ/ts")
    assert r.status_code == 404


def test_monitor_timeseries_400_bad_id(client):
    # An ID with a dot — fails the [A-Za-z0-9_-]+ safe-id regex.
    r = client.get("/api/monitors/M001.evil/ts")
    assert r.status_code == 400


def test_historic_yearly(client):
    r = client.get("/api/historic/yearly")
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["year"] == 2010


def test_historic_by_cause(client):
    r = client.get("/api/historic/by-cause")
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["cause"] == "Lightning"


def test_503_on_missing_snapshot(empty_client):
    """If the snapshot dir is empty, all data endpoints return 503."""
    for path in ("/api/event", "/api/fires", "/api/smoke-polygons",
                 "/api/monitors", "/api/historic/yearly", "/api/historic/by-cause"):
        r = empty_client.get(path)
        assert r.status_code == 503, f"{path}: {r.status_code}"
        assert "Snapshot" in r.json()["detail"]
