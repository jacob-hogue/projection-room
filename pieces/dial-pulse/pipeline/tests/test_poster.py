import pathlib
import struct

import pytest

PUBLIC = pathlib.Path(__file__).resolve().parents[4] / "public" / "dial-pulse"

pytestmark = pytest.mark.skipif(
    not (PUBLIC / "poster.svg").exists(), reason="run `make poster` first"
)


def png_size(path: pathlib.Path) -> tuple[int, int]:
    with open(path, "rb") as f:
        head = f.read(24)
    assert head[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    width, height = struct.unpack(">II", head[16:24])
    return width, height


def test_poster_svg_is_the_1947_map():
    svg = (PUBLIC / "poster.svg").read_text(encoding="utf-8")
    assert svg.startswith("<svg")
    assert 'data-year="1947"' in svg
    assert svg.count('class="outline"') == 77
    assert svg.count('class="area"') >= 230
    assert "New York" in svg and "Los Angeles" in svg


def test_poster_png_is_3200_by_2000():
    assert png_size(PUBLIC / "poster.png") == (3200, 2000)
    assert (PUBLIC / "poster.png").stat().st_size < 1_000_000
