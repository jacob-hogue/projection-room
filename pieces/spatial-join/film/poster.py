"""Still images for the site: the film poster and the index card.

Run from pieces/spatial-join:  python film/poster.py ../../public/spatial-join
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import cairo
import render as R

out = sys.argv[1]
os.makedirs(out, exist_ok=True)

R.header = lambda *a, **k: None          # no scene numbers on stills

def still(fn, t, dy=0):
    surf = cairo.ImageSurface(cairo.FORMAT_RGB24, R.W, R.H); c = cairo.Context(surf)
    c.set_source_rgb(*R.BG); c.paint(); c.translate(0, dy); fn(c, t)
    return surf

# Poster: the four grid systems with their colors explained, centered, no caption.
still(R.s5, 22.0, 85).write_to_png(os.path.join(out, "poster.png"))

# Card: the test case, scaled to the index card's 1600 x 880.
full = still(R.s1, 6.4, 30)
card = cairo.ImageSurface(cairo.FORMAT_RGB24, 1600, 880); c = cairo.Context(card)
c.set_source_rgb(*R.BG); c.paint()
k = 1600 / R.W
c.translate(0, -(R.H * k - 880) / 2); c.scale(k, k); c.set_source_surface(full, 0, 0); c.paint()
card.write_to_png(os.path.join(out, "card.png"))
