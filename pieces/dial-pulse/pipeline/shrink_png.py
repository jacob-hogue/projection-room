"""Reduce a PNG to a 256-color palette. The posters are flat fills and text, so the
palette version is identical to the eye and about a third of the size.

    python shrink_png.py <in.png> [out.png]
"""
from __future__ import annotations

import pathlib
import sys

from PIL import Image


def shrink(src: pathlib.Path, dst: pathlib.Path | None = None, colors: int = 256) -> int:
    dst = dst or src
    im = Image.open(src).convert("RGB")
    im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(dst, optimize=True)
    return dst.stat().st_size


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    src = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src
    print(f"{out}: {shrink(src, out):,} bytes")
