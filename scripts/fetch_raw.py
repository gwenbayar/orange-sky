"""One-shot helper: download raw inputs for an event into data/raw/<event>/."""
import os
import sys
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

from pipeline import airnow, firms, hms
from pipeline.config import load_event

# FIRMS Standard Processing (SP) area-CSV requests are capped at 5 days/request.
FIRMS_MAX_DAYS = 5


def main(event_id: str) -> None:
    load_dotenv()
    cfg = load_event(Path(f"events/{event_id}.yml"))
    raw = Path("data/raw") / event_id

    # FIRMS — VIIRS only for MVP. For historic events (>~2 months old), NRT data
    # is no longer hosted by FIRMS; use SP (Standard Processing). SP area requests
    # are capped at 5 days, so we chunk the window.
    firms_key = os.environ.get("FIRMS_API_KEY", "")
    chunk_start = cfg.window_start
    while chunk_start <= cfg.window_end:
        chunk_end = min(chunk_start + timedelta(days=FIRMS_MAX_DAYS - 1), cfg.window_end)
        firms.fetch(
            api_key=firms_key,
            source="VIIRS_SNPP_SP",
            bbox=cfg.bbox,
            window_start=chunk_start,
            window_end=chunk_end,
            dest_dir=raw / "firms",
        )
        chunk_start = chunk_end + timedelta(days=1)

    # HMS — one KML per day in [start, end]
    cur = cfg.window_start
    while cur <= cfg.window_end:
        hms.fetch(cur, raw / "hms")
        cur += timedelta(days=1)

    # AirNow — hourly archive across the window
    airnow.fetch(cfg.window_start, cfg.window_end + timedelta(days=1), raw / "airnow")

    print(f"Done. Raw inputs in {raw}")


if __name__ == "__main__":
    main(sys.argv[1])
