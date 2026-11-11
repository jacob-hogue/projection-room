"""Draws the film frame by frame with pycairo and pipes each scene to FFmpeg.

Run from pieces/spatial-join after pipeline/bench.py and pipeline/fair.py:
  python film/render.py stills            a few full-size test frames
  python film/render.py video             one s<N>.mp4 per scene
  python film/render.py srt captions.srt  the caption file
"""
import math, pickle, subprocess, sys, os
import numpy as np
import cairo
from scipy.cluster.vq import kmeans2

D = pickle.load(open("data.pkl", "rb"))
ST = D["stats"]; G = D["grids"]; N = D["N"]; M = D["M"]
W, H, FPS = 1920, 1080, 30
BG = (0.035, 0.05, 0.07)
INK = (0.93, 0.95, 0.97); MUTE = (0.56, 0.63, 0.71); DIM = (0.33, 0.39, 0.46)
TEAL = (0.18, 0.83, 0.75); AMBER = (0.98, 0.75, 0.14); CORAL = (0.98, 0.44, 0.52); GREEN = (0.45, 0.9, 0.5)

px, py, truth = D["px"], D["py"], D["truth"]
samp = D["samp"]
bx0, by0, bx1, by1 = D["bounds"]
FULL = ((bx0 + bx1) / 2, (by0 + by1) / 2, max(bx1 - bx0, by1 - by0) + 1.0)
ZOOM = D["zoom"]
CORE = (2.5, 4.4, 24.0)
zidx_big = D["zsamp"][:5200]
zidx_small = D["zsamp"][:1700]
dcent = np.array([d[0][:-1].mean(0) for d in D["districts"]])
import shapely
from shapely.geometry import LineString
COARSE = [[np.array(shapely.simplify(LineString(r), 0.05).coords) for r in d if len(r) > 3] for d in D["districts"]]
COARSE = [[r for r in d if len(r) > 3] for d in COARSE]
RBOX = [np.array([[r[:, 0].min(), r[:, 1].min(), r[:, 0].max(), r[:, 1].max()] for r in d]) for d in D["districts"]]
bb = D["bboxes"]
_, plab = kmeans2(np.c_[(bb[:, 0] + bb[:, 2]) / 2, (bb[:, 1] + bb[:, 3]) / 2], 12, seed=3, minit="++")
parents = [(bb[plab == k, 0].min(), bb[plab == k, 1].min(), bb[plab == k, 2].max(), bb[plab == k, 3].max())
           for k in range(12) if (plab == k).any()]

def sm(t, a=0.0, b=1.0):
    if b <= a: return 1.0 if t >= a else 0.0
    x = min(1.0, max(0.0, (t - a) / (b - a)))
    return x * x * (3 - 2 * x)

def lerp(a, b, t): return a + (b - a) * t

class View:
    def __init__(s, view, rect):
        s.cx, s.cy, s.span = view; s.X, s.Y, s.S = rect; s.k = s.S / s.span
    def p(s, x, y):
        return s.X + s.S / 2 + (np.asarray(x) - s.cx) * s.k, s.Y + s.S / 2 - (np.asarray(y) - s.cy) * s.k

def font(c, size, bold=False, fam="Inter"):
    c.select_font_face(fam, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size)

def text(c, s, x, y, size, col=INK, a=1.0, bold=False, align="l", fam="Inter", track=0):
    if a <= 0.003: return 0
    font(c, size, bold, fam)
    if track:
        w = sum(c.text_extents(ch).x_advance + track for ch in s)
        xx = x - (w if align == "r" else w / 2 if align == "c" else 0)
        c.set_source_rgba(*col, a)
        for ch in s:
            c.move_to(xx, y); c.show_text(ch); xx += c.text_extents(ch).x_advance + track
        return w
    w = c.text_extents(s).x_advance
    xx = x - (w if align == "r" else w / 2 if align == "c" else 0)
    c.set_source_rgba(*col, a); c.move_to(xx, y); c.show_text(s)
    return w

def digits(c, s, x, y, size, col=INK, a=1.0, align="l"):
    """Numbers with fixed digit width so counters do not jitter."""
    font(c, size, True, "Inter Display")
    dw = c.text_extents("0").x_advance; cw = c.text_extents(",").x_advance
    adv = [dw if ch.isdigit() else c.text_extents(ch).x_advance if ch != "," else cw for ch in s]
    w = sum(adv); xx = x - (w if align == "r" else w / 2 if align == "c" else 0)
    c.set_source_rgba(*col, a)
    for ch, ad in zip(s, adv):
        e = c.text_extents(ch)
        c.move_to(xx + (ad - e.x_advance) / 2, y); c.show_text(ch); xx += ad
    return w

def rrect(c, x, y, w, h, r):
    c.new_sub_path()
    c.arc(x + w - r, y + r, r, -math.pi / 2, 0); c.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    c.arc(x + r, y + h - r, r, math.pi / 2, math.pi); c.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    c.close_path()

def poly(c, v, xy):
    X, Y = v.p(xy[:, 0], xy[:, 1])
    c.move_to(X[0], Y[0])
    for a, b in zip(X[1:], Y[1:]): c.line_to(a, b)
    c.close_path()

def frame_clip(c, v):
    rrect(c, v.X, v.Y, v.S, v.S, 14); c.clip()

def zpoly(c, v, i):
    far = v.span > 12
    for n, r in enumerate(COARSE[i] if far else D["districts"][i]):
        if not far:
            b = RBOX[i][n]; h = v.span / 2
            if b[0] > v.cx + h or b[2] < v.cx - h or b[1] > v.cy + h or b[3] < v.cy - h: continue
        poly(c, v, r)

def districts(c, v, a=1.0, lw=1.6, fill=True):
    if v.span > 12: lw = min(lw, 1.1)
    for i in range(M):
        c.new_path(); zpoly(c, v, i)
        if fill:
            s = 0.02 * ((i * 7) % 5)
            c.set_source_rgba(0.075 + s, 0.10 + s, 0.14 + s, a); c.fill_preserve()
        c.set_source_rgba(0.50, 0.58, 0.68, 0.9 * a); c.set_line_width(lw); c.stroke()

def points(c, v, idx, a=0.6, r=1.5, n=None, col=(0.86, 0.9, 0.95)):
    if a <= 0.003: return
    if n is not None: idx = idx[:n]
    X, Y = v.p(px[idx], py[idx])
    ok = (X > v.X - 3) & (X < v.X + v.S + 3) & (Y > v.Y - 3) & (Y < v.Y + v.S + 3)
    c.set_source_rgba(*col, a)
    for x, y in zip(X[ok], Y[ok]):
        c.rectangle(x - r, y - r, 2 * r, 2 * r)
    c.fill()

def cells(c, v, name, a_line=1.0, a_in=0.0, a_edge=0.0, lw=1.2, wave=None):
    g = G[name]; half = v.span / 2 + 1.5
    for i, xy in enumerate(g["cells"]):
        cx, cy = xy[0]
        if abs(cx - v.cx) > half or abs(cy - v.cy) > half or g["ncand"][i] == 0: continue
        k = 1.0
        if wave is not None:
            dd = math.hypot(cx - v.cx, cy - v.cy) / (v.span * 0.75)
            k = sm(wave, dd * 0.7, dd * 0.7 + 0.3)
        poly(c, v, xy)
        if g["interior"][i]:
            if a_in > 0: c.set_source_rgba(*TEAL, 0.34 * a_in * k); c.fill_preserve()
        elif a_edge > 0:
            c.set_source_rgba(*AMBER, 0.40 * a_edge * k); c.fill_preserve()
        c.set_source_rgba(0.80, 0.86, 0.93, 0.42 * a_line); c.set_line_width(lw); c.stroke()

def border(c, v, a=1.0):
    rrect(c, v.X, v.Y, v.S, v.S, 14); c.set_source_rgba(0.24, 0.29, 0.35, a); c.set_line_width(2); c.stroke()

def header(c, num, label, a=1.0):
    num += 2
    text(c, f"{num:02d}", 90, 78, 26, TEAL, a, True)
    text(c, label.upper(), 136, 78, 26, MUTE, a, True, track=3)
    text(c, "THE PROJECTION ROOM", W - 90, 78, 22, DIM, a, True, align="r", track=3)

def caption(c, t, caps):
    for t0, t1, s in caps:
        if t0 <= t <= t1:
            a = min(sm(t, t0, t0 + 0.25), 1 - sm(t, t1 - 0.25, t1))
            lines = s.split("\n"); size = 46; lh = 60
            font(c, size); wmax = max(c.text_extents(l).x_advance for l in lines)
            bh = lh * len(lines) + 34; by = 1046 - bh; bw = wmax + 80
            rrect(c, W / 2 - bw / 2, by, bw, bh, 16); c.set_source_rgba(0, 0, 0, 0.72 * a); c.fill()
            for i, l in enumerate(lines):
                text(c, l, W / 2, by + 17 + lh * (i + 1) - 16, size, INK, a, align="c")

MAPR = (90, 118, 760)
RX = 940

def big_counter(c, label, value, y, col=INK, a=1.0, size=120):
    text(c, label.upper(), RX, y, 24, MUTE, a, True, track=3)
    digits(c, f"{int(value):,}", RX - 4, y + size + 8, size, col, a)

# ------------------------------------------------------------------ scenes
def s1(c, t):
    z = sm(t, 3.0, 6.2)
    v = View((lerp(FULL[0], CORE[0], z), lerp(FULL[1], CORE[1], z), math.exp(lerp(math.log(FULL[2]), math.log(CORE[2]), z))), MAPR)
    c.save(); frame_clip(c, v)
    districts(c, v, sm(t, 0.2, 1.4))
    points(c, v, samp, 0.6, 1.3, int(len(samp) * sm(t, 0.9, 3.6)))
    c.restore(); border(c, v)
    header(c, 1, "The test case", sm(t, 0.2, 0.9))
    a = sm(t, 0.5, 1.4)
    text(c, "Which taxi zone was", RX, 330, 84, INK, a, True, fam="Inter Display")
    text(c, "each pickup in?", RX, 430, 84, INK, a, True, fam="Inter Display")
    a2 = sm(t, 1.6, 2.4)
    text(c, "Uber pickups", RX + 22 + digits(c, f"{N:,}", RX, 560, 54, TEAL, a2), 560, 40, MUTE, a2)
    text(c, "taxi zones", RX + 22 + digits(c, f"{M}", RX, 630, 54, TEAL, a2), 630, 40, MUTE, a2)
    text(c, "New York City, September 2014.", RX, 716, 28, DIM, sm(t, 2.4, 3.2))
    text(c, "Pickups: FiveThirtyEight. Zones: NYC TLC.", RX, 754, 28, DIM, sm(t, 2.4, 3.2))
S1 = (6.5, s1, [(0.5, 6.1, "That works for a handful of points. Now a real case:\na million Uber pickups and 263 New York taxi zones.")])

incore = lambda i: abs(px[i] - CORE[0]) < 9 and abs(py[i] - CORE[1]) < 9
hl = [int(i) for i in samp[:800] if truth[i] >= 0 and incore(i)][:6]

def ring(c, x, y, col, r=11, a=1.0):
    c.new_path(); c.arc(x, y, r, 0, 2 * math.pi); c.set_source_rgba(*col, a); c.set_line_width(3.5); c.stroke()
    c.new_path(); c.arc(x, y, 3.5, 0, 2 * math.pi); c.set_source_rgba(*col, a); c.fill()

_cache = {}
def base_full(c, v):
    k = (v.cx, v.cy, v.span)
    if k not in _cache:
        sf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H); cc = cairo.Context(sf)
        districts(cc, v); points(cc, v, samp, 0.4, 1.3); _cache[k] = sf
    c.set_source_surface(_cache[k], 0, 0); c.paint()

PK = int(np.argmin((px[:200000] + 0.3376) ** 2 + (py[:200000] - 5.971) ** 2 + (truth[:200000] < 0) * 1e6))
TZ = int(truth[PK])
_d = np.hypot(dcent[:, 0] - px[PK], dcent[:, 1] - py[PK]); _d[TZ] = 1e9
NEAR = [int(i) for i in np.argsort(_d)[:3]]
_rest = [i for i in range(M) if i not in NEAR and i != TZ]
_pos = int(len(_rest) * 0.35)
ORDER2 = NEAR + _rest[:_pos] + [TZ] + _rest[_pos:]
TZPOS = ORDER2.index(TZ)
V1 = (float(px[PK]), float(py[PK]), 4.6)
YES = N - int((truth < 0).sum())
ZN = D["names"]
A_END, SLOT, F0, F1, C0, D0 = 6.5, 2.5, 14.5, 22.0, 30.0, 40.2

def bf_state(t):
    """Returns (index of zone being asked or None, answered?, zones asked so far)."""
    if t < A_END: return None, False, 0
    if t < A_END + 3 * SLOT:
        i = int((t - A_END) // SLOT); ans = (t - A_END) % SLOT > 1.3
        return i, ans, i + (1 if ans else 0)
    if t < F0: return None, False, 3
    if t < F1:
        f = sm(t, F0, F1) ** 1.25
        i = min(M - 1, 3 + int(f * (M - 3)))
        return i, True, i + 1
    return None, False, M

def tag(c, s, x, y, size=26, col=INK, a=1.0):
    font(c, size, True); w = c.text_extents(s).x_advance
    rrect(c, x - w / 2 - 12, y - size - 6, w + 24, size + 20, 8); c.set_source_rgba(0, 0, 0, 0.78 * a); c.fill()
    text(c, s, x, y, size, col, a, True, align="c")

def s2(c, t):
    z = sm(t, F0, F0 + 3.0)
    view = (lerp(V1[0], FULL[0], z), lerp(V1[1], FULL[1], z), math.exp(lerp(math.log(V1[2]), math.log(FULL[2]), z)))
    v = View(view, MAPR)
    cur, ans, cnt = bf_state(t)
    found = cnt > TZPOS
    c.save(); frame_clip(c, v)
    if z >= 1: base_full(c, v)
    else: districts(c, v, 1, 2.0); points(c, v, samp, 0.4, lerp(1.8, 1.3, z))
    if t < F0:                                   # slow questions, one zone at a time
        for i in range(3):
            zi = ORDER2[i]
            if cur is not None and i < cur or (cur is None and t >= A_END):
                c.new_path(); zpoly(c, v, zi); c.set_source_rgba(*CORAL, 0.22); c.fill()
        if cur is not None:
            zi = ORDER2[cur]; c.new_path(); zpoly(c, v, zi)
            if ans: c.set_source_rgba(*CORAL, 0.5); c.fill()
            else:
                c.set_source_rgba(*INK, 0.22); c.fill_preserve(); c.set_source_rgba(*INK, 1); c.set_line_width(4); c.stroke()
    elif cur is not None:                        # fast sweep with a fading trail
        for j in range(max(3, cur - 9), cur + 1):
            if ORDER2[j] == TZ: continue
            c.new_path(); zpoly(c, v, ORDER2[j]); c.set_source_rgba(*CORAL, 0.6 * (1 - (cur - j) / 10)); c.fill()
    if found:
        c.new_path(); zpoly(c, v, TZ); c.set_source_rgba(*GREEN, 0.65); c.fill()
    X, Y = v.p(px[PK], py[PK])
    if C0 <= t < D0:                             # the same job for every pickup
        rs = np.random.default_rng(int(t * 8)); a3 = sm(t, C0, C0 + 0.8)
        for i in samp[rs.integers(0, len(samp), 34)]:
            xx, yy = v.p(px[i], py[i]); c.new_path(); c.arc(xx, yy, 7, 0, 2 * math.pi)
            c.set_source_rgba(*INK, 0.9 * a3); c.set_line_width(2.5); c.stroke()
    ring(c, X, Y, INK, 13)
    if t < F0 and cur is not None:
        cx_, cy_ = v.p(*dcent[ORDER2[cur]]); tag(c, ZN[ORDER2[cur]], cx_, cy_ - 46)
    la = sm(t, 0.9, 1.6) * (1 - sm(t, A_END - 0.4, A_END))
    if la > 0: tag(c, "One pickup", X, Y - 30, 28, INK, la)
    c.restore(); border(c, v)

    header(c, 2, "Brute force")
    text(c, "Check every pickup", RX, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "against every zone", RX, 287, 62, INK, 1, True, fam="Inter Display")
    step = 1 if t < A_END else 2 if t < C0 else 3
    for n, lab in enumerate(["Take one pickup.", "Ask every zone: is this pickup inside you?", "Repeat for every pickup."]):
        a = sm(t, 0.4 + n * 0.3, 1.0 + n * 0.3); y = 372 + n * 54
        on = step == n + 1
        text(c, str(n + 1), RX, y, 34, TEAL if on else DIM, a, True)
        text(c, lab, RX + 40, y, 34, INK if on else DIM, a, on)
    c.move_to(RX, 510); c.line_to(RX + 860, 510); c.set_source_rgba(0.24, 0.29, 0.35, 1); c.set_line_width(2); c.stroke()

    if step == 1:
        a = sm(t, 1.8, 2.6) * (1 - sm(t, A_END - 0.4, A_END))
        text(c, "We do not know its zone yet.", RX, 590, 38, INK, a)
        text(c, "One test = one pickup checked against one zone.", RX, 650, 32, MUTE, a)
    elif step == 2:
        a = sm(t, A_END, A_END + 0.5)
        if cur is not None:
            nm = ZN[ORDER2[cur]]
            text(c, f"Inside {nm}?", RX, 590, 38, INK, a)
            if ans:
                yes = ORDER2[cur] == TZ
                text(c, "Yes" if yes else "No", RX + 860, 590, 38, GREEN if yes else CORAL, a, True, align="r")
        elif t >= F1:
            text(c, "Every zone has been asked.", RX, 590, 38, INK, sm(t, F1, F1 + 0.5))
        w = digits(c, f"{cnt}", RX - 3, 730, 104, CORAL, a)
        text(c, "of 263 zones asked", RX + w + 22, 700, 36, MUTE, a)
        text(c, "tests for this one pickup", RX + w + 22, 742, 28, DIM, a)
        if found:
            af = 1.0
            text(c, "Yes from:", RX, 812, 34, MUTE, af); text(c, ZN[TZ], RX + 170, 812, 34, GREEN, af, True)
        else:
            text(c, "Yes from: none so far", RX, 812, 34, DIM, a)
        text(c, "It cannot stop at the first yes. Zones can overlap.", RX, 860, 28, DIM, sm(t, F0 + 3.5, F0 + 4.3))
    else:
        fo = 1 - sm(t, D0 - 0.5, D0)
        rx = RX + 440
        a1 = sm(t, C0 + 0.4, C0 + 1.1) * fo; a2 = sm(t, C0 + 2.4, C0 + 3.1) * fo; a3 = sm(t, C0 + 4.6, C0 + 5.3) * fo
        digits(c, f"{N:,}", rx, 610, 70, INK, a1, align="r"); text(c, "pickups", rx + 28, 606, 40, MUTE, a1)
        text(c, "×", RX, 696, 60, MUTE, a2, True); digits(c, f"{M}", rx, 700, 70, INK, a2, align="r"); text(c, "zones", rx + 28, 696, 40, MUTE, a2)
        c.move_to(RX, 728); c.line_to(rx + 250, 728); c.set_source_rgba(*MUTE, a3); c.set_line_width(3); c.stroke()
        digits(c, f"{N * M:,}", rx, 812, 70, CORAL, a3, align="r"); text(c, "tests", rx + 28, 808, 40, CORAL, a3, True)
        b1 = sm(t, D0 + 0.2, D0 + 1.0)
        if b1 > 0:
            text(c, "What those 270 million tests returned", RX, 590, 36, INK, b1)
            BW = 860; g = sm(t, D0 + 0.8, D0 + 2.6); yb = 640
            rrect(c, RX, yb, max(8, BW * g), 76, 6); c.set_source_rgba(*CORAL, 0.92 * b1); c.fill()
            c.rectangle(RX, yb - 14, 5, 104); c.set_source_rgba(*GREEN, sm(t, D0 + 2.6, D0 + 3.2)); c.fill()
            a4 = sm(t, D0 + 2.8, D0 + 3.6)
            text(c, f"Yes: about {YES / 1e6:.1f} million", RX + 22, yb + 132, 34, GREEN, a4, True)
            text(c, f"No: about {(N * M - YES) / 1e6:.1f} million", RX + BW, yb + 132, 34, CORAL, a4, True, align="r")
            text(c, f"{ST['nested']['time']:.1f} seconds on one core, nearly all of it wasted.", RX, yb + 206, 32, MUTE, sm(t, D0 + 4.4, D0 + 5.2))
S2 = (50.6, s2, [(0.5, 6.2, "Start with one pickup. We want to know\nwhich taxi zone it is in."),
                 (6.6, 14.3, "With no index, the computer has to ask every zone,\none at a time. Is this pickup inside you?"),
                 (14.6, 23.2, "It keeps asking after the first yes, because zones can\noverlap. Even the far side of the city gets a test."),
                 (23.5, 29.7, "That is 263 tests to place one pickup.\nOnly one of them says yes."),
                 (30.2, 39.8, "Now repeat that for every one of the 1,028,136 pickups.\nA million pickups times 263 zones is 270 million tests."),
                 (40.4, 50.1, "Only about one million of those tests say yes.\nThe other 269 million were wasted work.")])

rt_pts = []
for i in samp[400:3000]:
    h = int(((px[i] >= bb[:, 0]) & (px[i] <= bb[:, 2]) & (py[i] >= bb[:, 1]) & (py[i] <= bb[:, 3])).sum())
    if h in (2, 3) and truth[i] >= 0 and incore(i): rt_pts.append(int(i))
    if len(rt_pts) == 5: break

def s3(c, t):
    v = View(CORE, MAPR)
    c.save(); frame_clip(c, v); base_full(c, v)
    active = None
    for n, pi in enumerate(rt_pts):
        a0 = 5.0 + n * 1.15
        if a0 <= t < a0 + 1.15: active = pi
    hits = set()
    if active is not None:
        hits = set(np.flatnonzero((px[active] >= bb[:, 0]) & (px[active] <= bb[:, 2]) & (py[active] >= bb[:, 1]) & (py[active] <= bb[:, 3])))
    order = np.argsort(bb[:, 0] + bb[:, 1])
    for n, j in enumerate(order):
        a = sm(t, 0.6 + n * 0.035, 1.0 + n * 0.035)
        b = bb[j]; X0, Y0 = v.p(b[0], b[3]); X1, Y1 = v.p(b[2], b[1])
        if j in hits:
            c.new_path(); zpoly(c, v, j); c.set_source_rgba(*(GREEN if j == truth[active] else CORAL), 0.45); c.fill()
            c.rectangle(X0, Y0, X1 - X0, Y1 - Y0); c.set_source_rgba(*AMBER, 1); c.set_line_width(4); c.stroke()
        else:
            c.rectangle(X0, Y0, X1 - X0, Y1 - Y0)
            c.set_source_rgba(*AMBER, (0.5 if active is None else 0.15) * a); c.set_line_width(1.4); c.stroke()
    ap = sm(t, 2.6, 3.4) * (1 if active is None else 0.5)
    c.set_dash([10, 8])
    for b in parents:
        X0, Y0 = v.p(b[0], b[3]); X1, Y1 = v.p(b[2], b[1])
        c.rectangle(X0, Y0, X1 - X0, Y1 - Y0); c.set_source_rgba(*INK, 0.75 * ap); c.set_line_width(2.4); c.stroke()
    c.set_dash([])
    if active is not None: ring(c, *v.p(px[active], py[active]), INK)
    c.restore(); border(c, v)
    header(c, 3, "R-tree")
    text(c, "Filter by", RX, 250, 68, INK, 1, True, fam="Inter Display")
    text(c, "bounding box first", RX, 330, 68, INK, 1, True, fam="Inter Display")
    text(c, "A bounding box is the smallest rectangle around a zone.", RX, 390, 30, MUTE, sm(t, 0.6, 1.4))
    big_counter(c, "Point-in-zone tests", ST["rtree"]["tests"] * sm(t, 4.6, 9.0), 450, AMBER)
    a = sm(t, 7.2, 8.0)
    text(c, f"{N * M / ST['rtree']['tests']:.0f}x fewer tests than brute force.", RX, 680, 34, MUTE, a)
    text(c, "Boxes overlap, so half the tests are still wasted,", RX, 730, 34, MUTE, a)
    text(c, "and every pickup still searches the tree of boxes.", RX, 776, 34, MUTE, a)
S3 = (11.2, s3, [(0.5, 4.8, "An R-tree draws the smallest rectangle around each\nzone, then groups nearby rectangles into bigger ones."),
                 (5.0, 10.8, "Checking a rectangle is cheap. A pickup only gets the\nfull test for boxes it lands in: about 2, not 263.")])

def swatch(c, x, y, col, a):
    rrect(c, x, y - 26, 34, 34, 6); c.set_source_rgba(*col, 0.55 * a); c.fill()

def s4(c, t):
    z = sm(t, 0.5, 2.6)
    view = (lerp(CORE[0], ZOOM[0], z), lerp(CORE[1], ZOOM[1], z), math.exp(lerp(math.log(CORE[2]), math.log(ZOOM[2]), z)))
    v = View(view, MAPR)
    c.save(); frame_clip(c, v)
    districts(c, v, 1, lerp(1.6, 3.0, z))
    cells(c, v, "h3", sm(t, 2.4, 3.6), sm(t, 4.6, 5.0), sm(t, 8.4, 8.8), 1.3,
          wave=None if t < 4.6 else (t - 4.6) / 1.6 if t < 8.4 else None)
    points(c, v, samp, 0.5 * (1 - z), 1.5); points(c, v, zidx_big, 0.7 * z, 2.0)
    districts(c, v, 1, lerp(1.6, 3.0, z), fill=False)
    c.restore(); border(c, v)
    header(c, 4, "Grid index")
    text(c, "Turn geometry", RX, 250, 68, INK, 1, True, fam="Inter Display")
    text(c, "into cell IDs", RX, 330, 68, INK, 1, True, fam="Inter Display")
    a = sm(t, 4.8, 5.6)
    swatch(c, RX, 440, TEAL, a); text(c, "Cell inside one zone", RX + 54, 440, 36, INK, a)
    text(c, "Match on the cell number. No geometry.", RX + 54, 486, 30, MUTE, a)
    a = sm(t, 8.5, 9.3)
    swatch(c, RX, 570, AMBER, a); text(c, "Cell crosses a boundary", RX + 54, 570, 36, INK, a)
    text(c, "Still needs a point-in-zone test.", RX + 54, 616, 30, MUTE, a)
    a = sm(t, 9.6, 10.4)
    digits(c, f"{round(ST['h3']['settled'] * 100)}%", RX - 4, 790, 120, TEAL, a)
    text(c, "of pickups settled by ID alone", RX + 290, 752, 34, MUTE, a)
    text(c, "H3 resolution 10, this dataset", RX + 290, 794, 28, DIM, a)
S4 = (12.4, s4, [(0.5, 4.3, "Grid indexes turn the problem around. Lay cells\nover the map and stamp every pickup with a cell ID."),
                 (4.5, 8.2, "A cell that sits fully inside one zone is settled\nby matching integers. No geometry at all."),
                 (8.4, 12.0, "Only pickups in cells that cross a boundary\nstill need a point-in-zone test.")])

import json
FA = json.load(open("data/fairness.json"))
BLOCK = FA["target"]
PAN = [("geohash", "Geohash", "Rectangles, 7 characters", ""), ("s2", "S2", "Squares, level 16", ""),
       ("h3", "H3", "Hexagons, resolution 10", ""), ("a5", "A5", "Pentagons, resolution 15", "")]

def s5(c, t):
    header(c, 5, "Four grid systems")
    S = 420
    for n, (key, name, sub, lvl) in enumerate(PAN):
        x = 60 + n * 460; y = 205
        a = sm(t, 0.4 + n * 0.5, 1.2 + n * 0.5)
        text(c, name, x, 152, 52, INK, a, True, fam="Inter Display")
        text(c, sub, x, 190, 28, MUTE, a)
        v = View(ZOOM, (x, y, S))
        c.save(); frame_clip(c, v)
        districts(c, v, a, 2.4)
        tw = t - (12.0 + n * 0.4)
        on = 1.0 if tw > 0 else 0.0
        cells(c, v, key, a, on, on, 1.0, wave=tw / 1.8 if 0 < tw < 2.6 else None)
        points(c, v, zidx_small, 0.65 * a, 1.5)
        districts(c, v, a, 2.4, fill=False)
        c.restore(); border(c, v, a)
        a3 = sm(t, 24.0 + n * 0.3, 24.8 + n * 0.3)
        ar = ST[key]["cell_km2"]; big = ar / BLOCK > 1.3
        text(c, f"{ar / BLOCK:.1f} city blocks per cell", x, y + S + 54, 36, AMBER if big else INK, a3, True)
    a2 = sm(t, 12.0, 12.8)
    swatch(c, 60, 800, TEAL, a2); text(c, "Inside one zone: answered by cell number", 110, 800, 32, INK, a2)
    swatch(c, 980, 800, AMBER, a2); text(c, "Crosses a zone boundary: needs a test", 1030, 800, 32, INK, a2)
S5 = (37.4, s5, [(0.5, 10.8, "The same few blocks of Manhattan under four grid systems.\nEach one tiles the map with a different shape."),
                 (11.6, 23.4, "Teal cells sit inside one zone and are answered by cell\nnumber. Amber cells cross a boundary and still need a test."),
                 (24.0, 36.9, "Grids only come in fixed cell sizes, so these four do not match.\nThat makes this a picture of the shapes, not a fair comparison.")])

SER = [("geohash", "Geohash", AMBER), ("s2", "S2", (0.66, 0.60, 1.0)), ("h3", "H3", TEAL), ("a5", "A5", CORAL)]

def sw(c, t):
    header(c, 6, "A fair comparison")
    text(c, "How many tests does each grid need?", 90, 166, 50, INK, sm(t, 0.2, 0.8), True, fam="Inter Display")
    text(c, "Both axes are logarithmic. Each gridline is 10 times the last.", 90, 210, 28, DIM, sm(t, 1.2, 2.0))
    X0, X1, Y0, Y1 = 380, 1470, 270, 740
    lx = lambda a: X0 + (math.log10(30) - math.log10(a)) / (math.log10(30) - math.log10(0.006)) * (X1 - X0)
    ly = lambda v: Y1 - (math.log10(v) - math.log10(5e5)) / (math.log10(4e7) - math.log10(5e5)) * (Y1 - Y0)
    a = sm(t, 0.6, 1.6)
    for v, lab in [(1e6, "1 million"), (1e7, "10 million")]:
        c.move_to(X0, ly(v)); c.line_to(X1, ly(v)); c.set_source_rgba(0.2, 0.25, 0.31, a); c.set_line_width(1.5); c.stroke()
        text(c, lab, X0 - 18, ly(v) + 11, 30, MUTE, a, align="r")
    for v, lab in [(10, "10"), (1, "1"), (0.1, "0.1"), (0.01, "0.01")]:
        c.move_to(lx(v), Y0); c.line_to(lx(v), Y1); c.set_source_rgba(0.2, 0.25, 0.31, a); c.set_line_width(1.5); c.stroke()
        text(c, lab, lx(v), Y1 + 40, 30, MUTE, a, align="c")
    text(c, "TESTS NEEDED", 90, Y0 + 14, 24, MUTE, a, True, track=3)
    text(c, "lower is better", 90, Y0 + 50, 28, DIM, a)
    text(c, "CELL SIZE", 90, Y1 + 26, 24, MUTE, a, True, track=3)
    text(c, "square kilometers", 90, Y1 + 60, 28, DIM, a)
    text(c, "smaller cells", X1 + 26, Y1 + 40, 28, DIM, a)
    c.move_to(X1 + 208, Y1 + 31); c.line_to(X1 + 250, Y1 + 31); c.move_to(X1 + 238, Y1 + 21); c.line_to(X1 + 250, Y1 + 31); c.line_to(X1 + 238, Y1 + 41)
    c.set_source_rgba(*DIM, a); c.set_line_width(3); c.stroke()
    av = sm(t, 42.0, 43.2)
    for v, lab, hot in [(3.41, "Central Park", 0), (BLOCK, "one city block", av)]:
        col = tuple(lerp(m, q, hot) for m, q in zip(MUTE, TEAL))
        c.move_to(lx(v), Y1); c.line_to(lx(v), Y1 + 54); c.set_source_rgba(*col, a); c.set_line_width(2.5); c.stroke()
        text(c, lab, lx(v), Y1 + 88, 28, col, a, hot > 0.5, align="c")
    # R-tree reference
    yr = ly(ST["rtree"]["tests"]); ar = sm(t, 30.5, 31.6)
    c.set_dash([14, 10]); c.move_to(X0, yr); c.line_to(X1, yr); c.set_source_rgba(*INK, 0.9 * ar); c.set_line_width(3); c.stroke(); c.set_dash([])
    text(c, "R-tree", X1 + 26, yr - 4, 32, INK, ar, True)
    text(c, f"{ST['rtree']['tests'] / 1e6:.2f} million tests", X1 + 26, yr + 32, 28, MUTE, ar)
    ab = sm(t, 33.0, 34.0)
    text(c, "Above: more tests than the R-tree", X0 + 16, yr - 20, 28, CORAL, ab, True)
    text(c, "Below: fewer tests", X0 + 16, yr + 46, 28, GREEN, ab, True)
    # one-block marker
    if av > 0:
        c.move_to(lx(BLOCK), Y0); c.line_to(lx(BLOCK), Y1); c.set_source_rgba(*TEAL, 0.95 * av); c.set_line_width(4); c.stroke()
    # the curves
    prog = sm(t, 20.0, 25.0)
    if prog > 0:
        xc = X0 + (X1 - X0) * prog
        c.save(); c.rectangle(X0 - 20, Y0 - 30, xc - X0 + 34, Y1 - Y0 + 60); c.clip()
        for key, nm, col in SER:
            pts = sorted([(v["cell_km2"], v["tests"]) for k, v in ST.items() if k.startswith(key + "_")], reverse=True)
            c.new_path()
            for i, (ar_, te) in enumerate(pts):
                (c.move_to if i == 0 else c.line_to)(lx(ar_), ly(te))
            c.set_source_rgba(*col, 1); c.set_line_width(5); c.set_line_join(cairo.LINE_JOIN_ROUND); c.stroke()
            for ar_, te in pts:
                c.new_path(); c.arc(lx(ar_), ly(te), 9, 0, 2 * math.pi); c.set_source_rgba(*BG, 1); c.fill_preserve()
                c.set_source_rgba(*col, 1); c.set_line_width(4); c.stroke()
        c.restore()
    for n, (key, nm, col) in enumerate(SER):
        al = sm(t, 20.0 + n * 0.3, 20.8 + n * 0.3); y = Y0 + 36 + n * 50
        c.new_path(); c.arc(X1 + 36, y - 11, 10, 0, 2 * math.pi); c.set_source_rgba(*col, al); c.fill()
        text(c, nm, X1 + 60, y, 34, INK, al)
    # one dot explained
    ad = sm(t, 11.4, 12.2) * (1 - sm(t, 19.2, 20.0))
    if ad > 0:
        e = ST["h3_9"]; X, Y = lx(e["cell_km2"]), ly(e["tests"])
        c.new_path(); c.arc(X, Y, 11, 0, 2 * math.pi); c.set_source_rgba(*BG, ad); c.fill_preserve(); c.set_source_rgba(*TEAL, ad); c.set_line_width(5); c.stroke()
        c.new_path(); c.arc(X, Y, 26, 0, 2 * math.pi); c.set_source_rgba(*INK, 0.9 * ad); c.set_line_width(3); c.stroke()
        c.set_dash([8, 8]); c.move_to(X, Y + 26); c.line_to(X, Y1); c.move_to(X - 26, Y); c.line_to(X0, Y)
        c.set_source_rgba(*INK, 0.55 * ad); c.set_line_width(2); c.stroke(); c.set_dash([])
        bx, by = X - 470, Y - 190
        rrect(c, bx, by, 430, 150, 12); c.set_source_rgba(0.09, 0.12, 0.16, 0.96 * ad); c.fill()
        text(c, "H3 at resolution 9", bx + 22, by + 44, 32, TEAL, ad, True)
        text(c, f"Cells of {e['cell_km2']:.3f} sq km", bx + 22, by + 88, 30, INK, ad)
        text(c, f"{e['tests'] / 1e6:.1f} million tests needed", bx + 22, by + 128, 30, INK, ad)
SW = (53.2, sw, [(0.5, 10.6, "This chart asks one question of every grid: how many\npoint-in-zone tests does it need? Lower is better."),
                 (11.2, 19.6, "Each dot is one grid at one cell size.\nMoving right means smaller cells."),
                 (20.2, 30.0, "As cells shrink, every grid needs fewer tests,\nand all four follow almost the same line."),
                 (30.6, 41.6, "The dashed line is the R-tree. Grids with big cells sit\nabove it, which means more work than the R-tree."),
                 (42.2, 52.7, "To compare fairly, read all four at the same cell size.\nWe use one city block, 0.02 square kilometers.")])

HH = sorted([(k, nm) for k, nm, _ in SER], key=lambda q: FA["grids"][q[0]]["tests"][0])
ANG = FA["angles"]

def sh(c, t):
    header(c, 7, "Head to head")
    text(c, "Tests needed when every grid uses city-block cells", 90, 170, 50, INK, sm(t, 0.2, 0.8), True, fam="Inter Display")
    X0, BW, MAXV = 330, 1090, 2.4e6
    rows = [(nm, TEAL, FA["grids"][k]["tests"], FA["shape"][k] / FA["shape"]["h3"]) for k, nm in HH] + [("R-tree", AMBER, FA["rtree"], None)]
    aw = sm(t, 25.0, 26.2); ae = sm(t, 37.0, 38.0)
    for n, (nm, col, vals, edge) in enumerate(rows):
        y = 240 + n * 92; v0 = vals[0]; mn, mx = min(vals), max(vals)
        g = sm(t, 0.8 + n * 0.3, 2.4 + n * 0.3)
        text(c, nm, X0 - 24, y + 40, 36, INK, sm(t, 0.5 + n * 0.25, 1.1 + n * 0.25), align="r")
        ln = v0 / MAXV * BW * g
        rrect(c, X0, y, max(ln, 4), 56, 6); c.set_source_rgba(*col, 0.9); c.fill()
        x1, x2 = X0 + mn / MAXV * BW, X0 + mx / MAXV * BW
        if aw > 0:
            c.move_to(x1, y + 28); c.line_to(x2, y + 28); c.move_to(x1, y + 10); c.line_to(x1, y + 46); c.move_to(x2, y + 10); c.line_to(x2, y + 46)
            c.set_source_rgba(*INK, aw); c.set_line_width(4); c.stroke()
        if edge is None:
            w = digits(c, f"{v0 * g / 1e6:.2f}M", X0 + 22, y + 40, 36, BG, 1)
            text(c, f"swings {(mx - mn) / np.mean(vals) * 100:.0f}%", X0 + 22 + w + 26, y + 38, 30, BG, aw, True)
        else:
            xt = X0 + mx / MAXV * BW + 20
            w = digits(c, f"{v0 * g / 1e6:.2f}M", xt, y + 40, 36, INK, sm(t, 1.0 + n * 0.3, 1.6 + n * 0.3))
            text(c, f"swings {(mx - mn) / np.mean(vals) * 100:.0f}%", xt + w + 26, y + 38, 30, MUTE, aw)
    af = sm(t, 3.0, 4.0)
    text(c, "Bar: the city as mapped. Values are interpolated to exactly 0.02 sq km.", 90, 760, 28, DIM, af)
    text(c, "Thin line: the range when the city is turned six ways.", 90, 800, 28, DIM, aw)
    # inset: the city turning under a fixed grid
    ai = sm(t, 11.5, 12.5)
    if ai > 0:
        ix, iy, isz = 1500, 232, 330
        steps = len(ANG); T0, T1 = 12.5, 24.0
        if t < T0: ang = 0.0
        elif t < T1:
            f = (t - T0) / (T1 - T0) * steps; i = min(steps - 1, int(f)); fr = f - i
            ang = ANG[i] + (ANG[min(i + 1, steps - 1)] - ANG[i]) * sm(fr, 0.75, 1.0)
        else: ang = ANG[-1] * (1 - sm(t, T1, T1 + 1.5))
        v = View((FULL[0], FULL[1], FULL[2] * 1.22), (ix, iy, isz))
        c.save(); frame_clip(c, v)
        c.rectangle(ix, iy, isz, isz); c.set_source_rgba(0.06, 0.08, 0.11, ai); c.fill()
        for q in range(1, 8):
            c.move_to(ix + q * isz / 8, iy); c.line_to(ix + q * isz / 8, iy + isz); c.move_to(ix, iy + q * isz / 8); c.line_to(ix + isz, iy + q * isz / 8)
        c.set_source_rgba(*TEAL, 0.35 * ai); c.set_line_width(1.5); c.stroke()
        ra = math.radians(ang); ca, sa_ = math.cos(ra), math.sin(ra)
        for d in COARSE:
            for r in d:
                dx, dy = r[:, 0] - FULL[0], r[:, 1] - FULL[1]
                poly(c, v, np.c_[FULL[0] + dx * ca - dy * sa_, FULL[1] + dx * sa_ + dy * ca])
        c.set_source_rgba(0.16, 0.2, 0.26, ai); c.fill_preserve(); c.set_source_rgba(0.62, 0.7, 0.8, 0.9 * ai); c.set_line_width(0.8); c.stroke()
        c.restore(); border(c, v, ai)
        text(c, f"City turned {ang:.0f} degrees", ix + isz / 2, iy + isz + 40, 28, INK, ai, True, align="c")
        text(c, "The grid stays put", ix + isz / 2, iy + isz + 76, 26, MUTE, ai, align="c")
SH = (49.2, sh, [(0.5, 10.8, "Now all four grids have cells the size of one city block.\nTheir results are within about 8 percent of each other."),
                 (11.5, 24.4, "One more check. Zone edges follow the street grid, so a grid\ncould get lucky by lining up with it. We turned the city six ways."),
                 (25.0, 36.5, "The thin lines show how far each result moved. Square cells\nswing by 15 to 19 percent. Hexagons and pentagons barely move."),
                 (37.0, 48.7, "H3 needs the fewest tests because a hexagon has the least\nedge for its area, so fewer cells cross a zone boundary.")])

_gt = sorted(ST[k]["time"] for k in ("geohash", "s2", "h3", "a5"))
ST["grid"] = {"time": float(np.median(_gt))}
BARS = [("Brute force", "nested", CORAL), ("R-tree", "rtree", AMBER), ("Grid index", "grid", TEAL)]

def s6(c, t):
    header(c, 8, "The clock")
    text(c, f"Join time for {N:,} pickups, one core", 90, 170, 50, INK, sm(t, 0.2, 0.8), True, fam="Inter Display")
    z = sm(t, 4.6, 6.4)
    amax = math.exp(lerp(math.log(ST['nested']['time'] * 1.02), math.log(1.15), z))
    X0, BW = 400, 1280
    for n, (lab, key, col) in enumerate(BARS):
        y = 250 + n * 112; val = ST[key]["time"]
        g = sm(t, 0.6 + n * 0.25, 2.0 + n * 0.25)
        ln = min(1.0, val / amax) * BW * g
        text(c, lab, X0 - 24, y + 48, 36, INK, sm(t, 0.4 + n * 0.2, 1.0 + n * 0.2), align="r")
        rrect(c, X0, y, max(ln, 4), 70, 6); c.set_source_rgba(*col, 0.9); c.fill()
        s = f"{val * g:.2f} s"
        if ln > BW - 320: digits(c, s, X0 + ln - 22 - (62 * z if key == "nested" else 0), y + 49, 40, BG, 1, align="r")
        else: digits(c, s, X0 + ln + 18, y + 49, 40, INK, sm(t, 0.8 + n * 0.25, 1.4 + n * 0.25))
        if key == "nested" and z > 0.05:
            for k in range(3):
                xx = X0 + BW - 14 - k * 16
                c.move_to(xx - 8, y + 14); c.line_to(xx + 6, y + 35); c.line_to(xx - 8, y + 56)
                c.set_source_rgba(*BG, z); c.set_line_width(4); c.stroke()
    an = sm(t, 6.6, 7.4); gm = ST["grid"]["time"]
    text(c, f"About {ST['rtree']['time'] / gm:.0f}x faster than the R-tree, {ST['nested']['time'] / gm:.0f}x faster than brute force.", 90, 670, 38, INK, an, True)
    text(c, f"Grid index: the middle of the four grids ({_gt[0]:.2f} to {_gt[-1]:.2f} s), with cell IDs already stored.", 90, 770, 28, DIM, 1)
    text(c, "Median of 9 runs, brute force once. Same point-in-zone test in every method.", 90, 810, 28, DIM, 1)
S6 = (11.4, s6, [(0.5, 4.4, "Brute force takes over five seconds. The R-tree\nreturns the same answer in under one."),
                 (4.6, 11.0, "With cell IDs stored, a grid index finishes in about a fifth\nof a second. The four grids differ by less than timing noise.")])

ROWS = [("R-tree", AMBER, "No setup, any shape, one machine. Hard to split across many."),
        ("H3", TEAL, "The safe default, with the widest tool support."),
        ("S2 and Geohash", TEAL, "Small cells fit exactly inside big ones, and IDs sort by place."),
        ("A5", TEAL, "Every cell has the same area, so counts compare fairly. Newer.")]

def s7(c, t):
    header(c, 9, "Choosing")
    text(c, "Pick the index for the workload", 90, 190, 64, INK, sm(t, 0.2, 0.8), True, fam="Inter Display")
    for n, (nm, col, ds) in enumerate(ROWS):
        a = sm(t, 0.8 + n * 0.5, 1.5 + n * 0.5); y = 300 + n * 104
        rrect(c, 90, y - 44, 8, 64, 4); c.set_source_rgba(*col, a); c.fill()
        text(c, nm, 124, y, 42, INK, a, True)
        text(c, ds, 520, y, 36, MUTE, a)
    a = sm(t, 3.4, 4.2); y = 760
    c.move_to(90, y - 62); c.line_to(W - 90, y - 62); c.set_source_rgba(0.24, 0.29, 0.35, a); c.set_line_width(2); c.stroke()
    text(c, f"Every method returned the same zone for all {N:,} pickups.", 90, y, 36, INK, a, True)
    text(c, "Data: Uber pickups, September 2014 (FiveThirtyEight). Zones: NYC TLC.", 90, y + 52, 30, MUTE, a)
S7 = (9.6, s7, [(0.5, 4.6, "On speed the grids are close.\nChoose on what else you need from the index."),
                (4.8, 9.2, "Then tune the resolution and measure\non your own data.")])


# ------------------------------------------------------------------ intro scenes
VIOLET = (0.66, 0.60, 1.0)
SD = [("North", TEAL, np.array([(0.5, 5.5), (3, 6.2), (5.5, 5.2), (9.5, 6.0), (9.5, 9.5), (0.5, 9.5)]), (5.0, 8.6)),
      ("West", AMBER, np.array([(0.5, 0.5), (4.6, 0.5), (5.2, 2.8), (5.5, 5.2), (3, 6.2), (0.5, 5.5)]), (2.0, 1.4)),
      ("East", VIOLET, np.array([(4.6, 0.5), (9.5, 0.5), (9.5, 6.0), (5.5, 5.2), (5.2, 2.8)]), (7.6, 1.4))]
SP = [(2.0, 7.8), (7.2, 7.6), (1.9, 3.2), (3.6, 4.6), (7.6, 2.9), (6.6, 4.5)]

def crossings(p, poly_xy):
    """Ray cast to the right. Returns x positions where the ray crosses an edge."""
    out = []; n = len(poly_xy)
    for i in range(n):
        (x1, y1), (x2, y2) = poly_xy[i], poly_xy[(i + 1) % n]
        if (y1 > p[1]) != (y2 > p[1]):
            x = x1 + (p[1] - y1) * (x2 - x1) / (y2 - y1)
            if x > p[0]: out.append(x)
    return sorted(out)

SOWN = [next(i for i, d in enumerate(SD) if len(crossings(p, d[2])) % 2 == 1) for p in SP]
SV = View((5, 5, 10.2), MAPR)

def simple_map(c, a=1.0, hot=None, dim_pts=False):
    c.save(); frame_clip(c, SV)
    for i, (nm, col, xy, lp) in enumerate(SD):
        poly(c, SV, np.vstack([xy, xy[:1]]))
        c.set_source_rgba(*col, (0.42 if hot == i else 0.13) * a); c.fill_preserve()
        c.set_source_rgba(*col, 0.95 * a); c.set_line_width(3.5); c.stroke()
        X, Y = SV.p(*lp); text(c, nm.upper(), X, Y, 30, col, 0.95 * a, True, align="c", track=3)
    c.restore(); border(c, SV, a)

def simple_pts(c, a=1.0, active=None, only=None):
    for i, p in enumerate(SP):
        if only is not None and i != only: continue
        X, Y = SV.p(*p)
        if active == i:
            c.new_path(); c.arc(X, Y, 24, 0, 2 * math.pi); c.set_source_rgba(*INK, 0.9 * a); c.set_line_width(3.5); c.stroke()
        c.new_path(); c.arc(X, Y, 10, 0, 2 * math.pi); c.set_source_rgba(*INK, a); c.fill()
        text(c, f"P{i + 1}", X + 20, Y - 16, 28, INK, a, True)

def sa(c, t):
    a = sm(t, 0.3, 1.1)
    text(c, "THE PROJECTION ROOM", W / 2, 330, 26, TEAL, a, True, align="c", track=4)
    text(c, "The Spatial Join", W / 2, 520, 150, INK, a, True, align="c", fam="Inter Display")
    text(c, "What it is, how it is usually done, and five ways to make it fast", W / 2, 620, 38, MUTE, sm(t, 0.9, 1.7), align="c")
SA = (4.6, sa, [(0.5, 4.2, "Today, we will be discussing the spatial join.")])

def sb(c, t):
    a = sm(t, 0.2, 1.0)
    T0, STEP = 5.6, 1.15
    k = int((t - T0) // STEP) if t >= T0 else -1
    act = k if 0 <= k < len(SP) else None
    simple_map(c, a, hot=SOWN[act] if act is not None else None)
    simple_pts(c, sm(t, 1.0, 1.8), act)
    hdr = sm(t, 0.2, 0.9)
    header(c, -1, "What a spatial join is", hdr)
    text(c, "Match rows by location", RX, 250, 68, INK, hdr, True, fam="Inter Display")
    ta = sm(t, 2.0, 2.8); y0 = 350
    text(c, "POINT", RX, y0, 24, MUTE, ta, True, track=3); text(c, "DISTRICT", RX + 300, y0, 24, MUTE, ta, True, track=3)
    c.move_to(RX, y0 + 18); c.line_to(RX + 640, y0 + 18); c.set_source_rgba(0.24, 0.29, 0.35, ta); c.set_line_width(2); c.stroke()
    for i in range(len(SP)):
        y = y0 + 76 + i * 66
        if act == i:
            rrect(c, RX - 18, y - 44, 676, 60, 8); c.set_source_rgba(1, 1, 1, 0.07); c.fill()
        text(c, f"P{i + 1}", RX, y, 40, INK, ta, True)
        done = sm(t, T0 + i * STEP + 0.35, T0 + i * STEP + 0.7)
        text(c, "?", RX + 300, y, 40, DIM, ta * (1 - done))
        nm, col = SD[SOWN[i]][0], SD[SOWN[i]][1]
        text(c, nm, RX + 300, y, 40, col, done, True)
SB = (13.6, sb, [(0.5, 5.3, "In GIS, a join occurs when rows from two layers\nare matched by location instead of a shared key."),
                 (5.5, 13.2, "Here each point picks up the name of the district\nit falls inside. That is a spatial join.")])

PT = 3
ORDER = [0, 2, 1]

def sc(c, t):
    T0, STEP = 2.0, 2.6
    k = min(2, int((t - T0) // STEP)) if t >= T0 else -1
    cur = ORDER[k] if k >= 0 else None
    done_all = t > T0 + 3 * STEP
    simple_map(c, 1.0, hot=SOWN[PT] if done_all else cur)
    simple_pts(c, 0.25); simple_pts(c, 1.0, PT, only=PT)
    p = SP[PT]
    if cur is not None and not done_all:
        f = sm(t, T0 + k * STEP, T0 + k * STEP + 1.1)
        xe = lerp(p[0], 9.9, f)
        X0, Y0 = SV.p(*p); X1, _ = SV.p(xe, p[1])
        c.save(); frame_clip(c, SV)
        c.move_to(X0, Y0); c.line_to(X1, Y0); c.set_source_rgba(*INK, 0.95); c.set_line_width(3); c.set_dash([14, 9]); c.stroke(); c.set_dash([])
        for x in crossings(p, SD[cur][2]):
            if x <= xe:
                X, Y = SV.p(x, p[1])
                c.new_path(); c.arc(X, Y, 13, 0, 2 * math.pi); c.set_source_rgba(*BG, 1); c.fill_preserve()
                c.set_source_rgba(*SD[cur][1], 1); c.set_line_width(5); c.stroke()
        c.restore()
    header(c, 0, "The traditional way")
    text(c, "Point in polygon,", RX, 250, 68, INK, 1, True, fam="Inter Display")
    text(c, "one pair at a time", RX, 330, 68, INK, 1, True, fam="Inter Display")
    text(c, f"Testing P{PT + 1} against each district", RX, 420, 32, MUTE, sm(t, 1.2, 2.0))
    for n, di in enumerate(ORDER):
        a = sm(t, T0 + n * STEP + 1.2, T0 + n * STEP + 1.7)
        y = 520 + n * 92; nc = len(crossings(p, SD[di][2])); inside = nc % 2 == 1
        text(c, SD[di][0], RX, y, 44, SD[di][1], a, True)
        text(c, f"{nc} crossing" + ("" if nc == 1 else "s"), RX + 200, y, 38, INK, a)
        text(c, "inside" if inside else "outside", RX + 520, y, 38, GREEN if inside else MUTE, a, inside)
S_C = (12.4, sc, [(0.5, 5.6, "Traditionally, this is done by testing each point\nagainst each polygon, one pair at a time."),
                  (5.8, 12.0, "The test draws a ray from the point and counts the\nedges it crosses. An odd count means inside.")])

def sz(c, t):
    """Closing card. Same layout as the opening title card."""
    a = sm(t, 0.3, 1.1)
    text(c, "THE PROJECTION ROOM", W / 2, 330, 26, TEAL, a, True, align="c", track=4)
    text(c, "The Spatial Join", W / 2, 520, 150, INK, a, True, align="c", fam="Inter Display")
    text(c, "Match the cell size to your data, then measure", W / 2, 620, 38, MUTE, sm(t, 0.9, 1.7), align="c")
    a2 = sm(t, 1.8, 2.6)
    text(c, "Jacob Hogue", W / 2, 740, 36, INK, a2, True, align="c")
    text(c, "jacob-hogue.github.io/projection-room", W / 2, 790, 28, MUTE, a2, align="c")
SZ = (4.6, sz, [(0.5, 4.2, "That was the spatial join. Thank you for watching.")])

SCENES = [SA, SB, S_C, S1, S2, S3, S4, S5, SW, SH, S6, S7, SZ]

FIRST_DATA = 3                                   # scenes from here on use the slower pacing
KOVER = {"sc": 1.5}
KSLOW = {"s2": 1.2, "s7": 2.7, "s5": 1.0, "sw": 1.0, "sh": 1.0}
def pace(i, scene):
    dur, fn, caps = scene
    if i < FIRST_DATA:
        if fn.__name__ in KOVER: return KOVER[fn.__name__]
        need = max((len(txt.split()) / 2.5 + 0.5) / (t1 - t0) for t0, t1, txt in caps)
        return min(2.1, max(1.4, need))
    if fn.__name__ in KSLOW: return KSLOW[fn.__name__]
    need = max((len(txt.split()) / 2.0 + 0.8) / (t1 - t0) for t0, t1, txt in caps)
    return min(2.8, max(1.9, need))
KS = [pace(i, sc) for i, sc in enumerate(SCENES)]

def holds(i):
    """Pauses (scene time, real seconds) where the picture freezes so a caption can be finished."""
    if i < FIRST_DATA: return []
    caps = SCENES[i][2]
    return [(t1 - 0.3, 2.2 if n == len(caps) - 1 else 1.4) for n, (t0, t1, txt) in enumerate(caps)]
HS = [holds(i) for i in range(len(SCENES))]

def real_of(i, t):
    return t * KS[i] + sum(h for th, h in HS[i] if th < t)

def scene_of(i, r):
    k = KS[i]; t = 0.0; rr = 0.0
    for th, h in HS[i]:
        seg = (th - t) * k
        if r < rr + seg: return t + (r - rr) / k
        rr += seg; t = th
        if r < rr + h: return th
        rr += h
    return t + (r - rr) / k

def real_len(i):
    return SCENES[i][0] * KS[i] + sum(h for th, h in HS[i])

def draw(si, t):
    """t is scene time; real time is t * KS[si]."""
    dur, fn, caps = SCENES[si]
    surf = cairo.ImageSurface(cairo.FORMAT_RGB24, W, H); c = cairo.Context(surf)
    c.set_source_rgb(*BG); c.paint()
    fn(c, t); caption(c, t, caps)
    f = min(sm(t, 0, 0.35), 1 - sm(t, dur - 0.35, dur))
    if f < 1: c.set_source_rgba(*BG, 1 - f); c.paint()
    return surf

if __name__ == "__main__":
    if sys.argv[1] == "stills":
        for si, t in [(12, 4.0)]:
            draw(si, t).write_to_png(f"still_{si + 1}_{t}.png")
    elif sys.argv[1] == "srt":
        def ts(t):
            return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{t % 60:06.3f}".replace(".", ",")
        off = 0; n = 1; out = []
        for i, (dur, fn, caps) in enumerate(SCENES):
            for a, b, txt in caps:
                out.append(f"{n}\n{ts(off + real_of(i, a))} --> {ts(off + real_of(i, b))}\n{txt}\n"); n += 1
            off += round(real_len(i) * FPS) / FPS
        open(sys.argv[2], "w").write("\n".join(out))
        print("total", round(off, 1), "s", [(round(k, 2), round(real_len(i), 1)) for i, k in enumerate(KS)])
    else:
        for si in [int(a) for a in sys.argv[2:]] or range(len(SCENES)):
            tmp = f"tmp_s{si + 1}.mp4"
            p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}",
                                  "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
                                  "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
            last_t = None; buf = None
            for f in range(int(round(real_len(si) * FPS))):
                t = scene_of(si, f / FPS)
                if t != last_t: buf = bytes(draw(si, t).get_data()); last_t = t
                p.stdin.write(buf)
            p.stdin.close()
            if p.wait() == 0: os.replace(tmp, f"s{si + 1}.mp4"); print("scene", si + 1, "ok", flush=True)
