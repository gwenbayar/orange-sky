import sqlite3
import pytest


@pytest.fixture
def tiny_fpa_fod(tmp_path):
    """A 6-row in-file SQLite that mimics the real Fires table schema (subset)."""
    db = tmp_path / "fpa.sqlite"
    con = sqlite3.connect(db)
    con.execute("""
        CREATE TABLE Fires (
            FIRE_YEAR INTEGER, STATE TEXT, STAT_CAUSE_DESCR TEXT,
            FIRE_SIZE REAL, LATITUDE REAL, LONGITUDE REAL
        )
    """)
    rows = [
        (2010, "OR", "Lightning", 12.0, 44.0, -120.0),
        (2010, "OR", "Arson",      3.0, 44.5, -121.0),
        (2010, "WA", "Lightning",  500.0, 47.0, -121.5),
        (2011, "OR", "Lightning",  20.0, 44.0, -120.0),
        (2011, "ID", "Debris Burning", 1.0, 45.0, -114.0),
        (2011, "CA", "Arson",      99000.0, 41.5, -123.0),  # in PNW bbox
    ]
    con.executemany("INSERT INTO Fires VALUES (?,?,?,?,?,?)", rows)
    con.commit()
    con.close()
    return db
