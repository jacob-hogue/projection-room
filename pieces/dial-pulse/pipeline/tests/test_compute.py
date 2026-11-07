import pathlib

import pytest

from compute import codes_in_effect, load_lineage, original_of, polygon_codes

FIXTURE = pathlib.Path(__file__).resolve().parent / "fixtures" / "lineage_small.csv"


@pytest.fixture(scope="module")
def L():
    return load_lineage(FIXTURE)


def test_original_of(L):
    assert original_of("347", L) == "212"
    assert original_of("212", L) == "212"


def test_codes_in_effect_1947(L):
    assert codes_in_effect(1947, L) == {"212"}


def test_codes_in_effect_2000(L):
    assert codes_in_effect(2000, L) == {"212", "718", "917", "347"}


def test_polygon_codes_before_split(L):
    assert polygon_codes("718", 1980, L) == ["212"]


def test_polygon_codes_with_overlays(L):
    assert polygon_codes("718", 2000, L) == ["718", "347"]
    assert polygon_codes("212", 2000, L) == ["212", "917"]


def test_missing_code_raises(L):
    with pytest.raises(KeyError, match="999"):
        polygon_codes("999", 2000, L)
