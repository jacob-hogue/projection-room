import csv
import pathlib

from check import count_for_year, load_reference
from compute import load_lineage

PIPE = pathlib.Path(__file__).resolve().parents[1]


def test_reference_has_expected_years_and_sources():
    ref = load_reference(PIPE / "nanpa_counts.csv")
    assert set(ref) >= {1947, 1960, 1970, 1980, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025}
    rows = list(csv.DictReader(open(PIPE / "nanpa_counts.csv", encoding="utf-8", newline="")))
    assert list(rows[0].keys()) == ["year", "us_lower48_codes", "source"]
    assert all(r["source"].startswith("http") for r in rows)


def test_count_matches_reference_within_two():
    lineage = load_lineage(PIPE / "lineage.csv")
    ref = load_reference(PIPE / "nanpa_counts.csv")
    for year, expected in sorted(ref.items()):
        got = count_for_year(year, lineage)
        assert abs(got - expected) <= 2, f"{year}: computed {got}, reference {expected}"


def test_1947_count_is_the_originals():
    lineage = load_lineage(PIPE / "lineage.csv")
    assert count_for_year(1947, lineage) == 77
