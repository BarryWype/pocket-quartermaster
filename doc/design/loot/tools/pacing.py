"""Weekly loot pacing for the regular player profile.

Reads matrix.csv (marks per source and category, plus visits per day) and
prints the expected amount of each category per week. Edit CHANCES or the
visits column to see how a change moves the pacing.

Usage: python3 tools/pacing.py [path/to/matrix.csv]
"""
import csv
import sys
from pathlib import Path

CHANCES = {"—": 0.0, "R/2": 0.035, "R": 0.07, "S": 0.25, "O": 0.60, "A": 1.0}
# Fixed extras that aren't a mark: the ruins give a relic every 5th dig.
EXTRAS = {("Ruins, a dig", "Relics"): 1 / 5}
SKIP = {"Source", "Visits per day (regular player)", "Notes"}

path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "matrix.csv"
with path.open(newline="") as f:
    rows = list(csv.DictReader(f))

categories = [c for c in rows[0] if c not in SKIP]
for cat in categories:
    per_day, sources = 0.0, []
    for row in rows:
        visits = float(row["Visits per day (regular player)"])
        chance = CHANCES[row[cat]] + EXTRAS.get((row["Source"], cat), 0.0)
        if chance:
            per_day += chance * visits
            sources.append((chance * visits, row["Source"]))
    top = ", ".join(name for _, name in sorted(sources, reverse=True)[:3])
    print(f"{cat:15} {per_day * 7:6.1f} per week   mostly: {top}")
