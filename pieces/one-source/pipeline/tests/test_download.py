from download import BANDS, band_where, pages, parse_grouped


def test_bands_cover_the_calendar_without_overlap():
    assert [b.name for b in BANDS] == ["before2015", "2015to2019", "2020to2022", "2023to2024", "2025on"]
    assert band_where(BANDS[0]) == "POLY_TYPE IN ('FEE','TAX') AND LAST_EDIT < 20150101"
    assert band_where(BANDS[4]) == "POLY_TYPE IN ('FEE','TAX') AND LAST_EDIT >= 20250101"
    assert band_where(BANDS[2]) == "POLY_TYPE IN ('FEE','TAX') AND LAST_EDIT >= 20200101 AND LAST_EDIT < 20230101"


def test_pages_walk_offsets_until_a_short_page():
    sizes = iter([2000, 2000, 164])
    offsets = []

    def fetch(offset):
        offsets.append(offset)
        return [{}] * next(sizes)

    assert len(pages(fetch, 2000)) == 4164
    assert offsets == [0, 2000, 4000]


def test_parse_grouped_maps_town_id_to_attributes():
    raw = {"features": [{"attributes": {"TOWN_ID": 328, "n": 7164, "fy": 2026}}]}
    assert parse_grouped(raw) == {328: {"TOWN_ID": 328, "n": 7164, "fy": 2026}}
