"""Compare the lineage table against NANPA's own count of codes in service, by year.

nanpa_counts.csv holds the number of general-purpose lower-48 area codes in service at the
end of each listed year, taken from the NANPA NPA report. count_for_year walks lineage.csv
the same way the page does. A difference over 2 in any year fails the build.
"""
from __future__ import annotations

import csv
import pathlib
import sys

from compute import Lineage, load_lineage, original_of

HERE = pathlib.Path(__file__).resolve().parent
TOLERANCE = 2


def load_reference(path: pathlib.Path) -> dict[int, int]:
    with open(path, encoding="utf-8", newline="") as f:
        return {int(r["year"]): int(r["us_lower48_codes"]) for r in csv.DictReader(f)}


def us_originals(path: pathlib.Path = HERE / "originals_1947.csv") -> set[str]:
    with open(path, encoding="utf-8", newline="") as f:
        return {r["code"] for r in csv.DictReader(f)}


def count_for_year(year: int, lineage: Lineage, originals: set[str] | None = None) -> int:
    """Lower-48 codes in service in `year`: every code whose 1947 original is a US original."""
    us = originals if originals is not None else us_originals()
    return sum(1 for c, r in lineage.items() if r.year <= year and original_of(c, lineage) in us)


def main() -> int:
    lineage = load_lineage(HERE / "lineage.csv")
    ref = load_reference(HERE / "nanpa_counts.csv")
    worst = 0
    print(f"{'year':>4} {'nanpa':>6} {'lineage':>8} {'diff':>5}")
    for year, expected in sorted(ref.items()):
        got = count_for_year(year, lineage)
        diff = got - expected
        worst = max(worst, abs(diff))
        print(f"{year:>4} {expected:>6} {got:>8} {diff:>+5}")
    if worst > TOLERANCE:
        print(f"lineage.csv differs from NANPA by more than {TOLERANCE} in at least one year", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
