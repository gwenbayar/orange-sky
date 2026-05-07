import sqlite3
from pathlib import Path
from typing import Iterable


def aggregate(db_path: Path, states: Iterable[str]) -> dict:
    """Read FPA FOD SQLite and produce yearly + by-cause + by-state aggregates,
    filtered to the PNW state set. Pure read-only."""
    states_tuple = tuple(states)
    placeholders = ",".join("?" * len(states_tuple))

    con = sqlite3.connect(db_path)
    try:
        con.row_factory = sqlite3.Row

        yearly = [
            {"year": r["FIRE_YEAR"], "fires": r["fires"], "acres": r["acres"]}
            for r in con.execute(
                f"""SELECT FIRE_YEAR, COUNT(*) AS fires, ROUND(SUM(FIRE_SIZE), 1) AS acres
                    FROM Fires WHERE STATE IN ({placeholders})
                    GROUP BY FIRE_YEAR ORDER BY FIRE_YEAR""",
                states_tuple,
            )
        ]
        by_cause = [
            {"cause": r["STAT_CAUSE_DESCR"], "fires": r["fires"], "acres": r["acres"]}
            for r in con.execute(
                f"""SELECT STAT_CAUSE_DESCR, COUNT(*) AS fires, ROUND(SUM(FIRE_SIZE), 1) AS acres
                    FROM Fires WHERE STATE IN ({placeholders})
                    GROUP BY STAT_CAUSE_DESCR ORDER BY fires DESC""",
                states_tuple,
            )
        ]
        by_state = [
            {"state": r["STATE"], "fires": r["fires"], "acres": r["acres"]}
            for r in con.execute(
                f"""SELECT STATE, COUNT(*) AS fires, ROUND(SUM(FIRE_SIZE), 1) AS acres
                    FROM Fires WHERE STATE IN ({placeholders})
                    GROUP BY STATE ORDER BY fires DESC""",
                states_tuple,
            )
        ]
    finally:
        con.close()

    return {"yearly": yearly, "by_cause": by_cause, "by_state": by_state}
