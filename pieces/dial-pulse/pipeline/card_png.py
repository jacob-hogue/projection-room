"""Cut the gallery card image from the poster: the map without its caption band.

    python card_png.py <poster.png> <card.png>
"""
from __future__ import annotations

import pathlib
import sys

from PIL import Image

MAP_SHARE = 880 / 1000  # the poster is 1600 by 1000; the map is the top 880


def card(src: pathlib.Path, dst: pathlib.Path) -> int:
    im = Image.open(src)
    w, h = im.size
    out = im.crop((0, 0, w, int(h * MAP_SHARE))).convert("RGB")
    out.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(dst, optimize=True)
    return dst.stat().st_size


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    print(f"{sys.argv[2]}: {card(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])):,} bytes")
