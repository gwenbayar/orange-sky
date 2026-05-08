from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml


@dataclass(frozen=True)
class EventConfig:
    id: str
    name: str
    window_start: date
    window_end: date
    bbox: tuple[float, float, float, float]  # (lon_min, lat_min, lon_max, lat_max)
    states: list[str]


def load_event(path: Path) -> EventConfig:
    raw = yaml.safe_load(Path(path).read_text())
    return EventConfig(
        id=raw["id"],
        name=raw["name"],
        window_start=date.fromisoformat(str(raw["window"]["start"])),
        window_end=date.fromisoformat(str(raw["window"]["end"])),
        bbox=tuple(raw["bbox"]),
        states=list(raw["states"]),
    )
