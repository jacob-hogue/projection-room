import csv
import pathlib

import pytest

LINEAGE = pathlib.Path(__file__).resolve().parents[1] / "lineage.csv"


@pytest.fixture(scope="module")
def rows():
    with open(LINEAGE, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def test_columns(rows):
    assert list(rows[0].keys()) == ["code", "parent", "year", "type", "note", "source"]


def test_codes_unique_and_three_digits(rows):
    codes = [r["code"] for r in rows]
    assert len(codes) == len(set(codes))
    assert all(c.isdigit() and len(c) == 3 for c in codes)


def test_originals_are_1947_with_no_parent(rows):
    originals = [r for r in rows if r["type"] == "original"]
    assert len(originals) == 86
    assert all(r["year"] == "1947" and r["parent"] == "" for r in originals)


def test_parents_exist_and_are_older(rows):
    by = {r["code"]: r for r in rows}
    for r in rows:
        if r["type"] != "original":
            assert r["parent"] in by, f"{r['code']} parent {r['parent']} missing"
            assert int(by[r["parent"]]["year"]) <= int(r["year"]), r["code"]


def test_types_and_sources(rows):
    assert all(r["type"] in {"original", "split", "overlay"} for r in rows)
    assert all(r["source"].startswith("http") for r in rows)


def test_known_rows(rows):
    by = {r["code"]: r for r in rows}
    assert by["718"]["parent"] == "212" and by["718"]["year"] == "1984" and by["718"]["type"] == "split"
    assert by["917"]["parent"] == "212" and by["917"]["type"] == "overlay"
    assert by["909"]["year"] == "1992" and by["909"]["parent"] == "714"
