"""Draws the film frame by frame with pycairo and pipes each scene to FFmpeg.

Run from pieces/dial-pulse after the pipeline has written data/:
  python film/render.py stills [dir]      full-size test frames
  python film/render.py video film.mp4    one file per scene, joined without re-encoding
  python film/render.py srt captions.srt  the caption file

Scenes, in order: title, what a dial pulse is, counting an area code, the 1947 map,
who got the fast codes, did bigger places get faster codes, the middle digit,
running out of room, closing card.

Inter is loaded from FONT_DIR for this process when it is not installed. FFMPEG names the encoder.
"""
import csv, ctypes, json, math, os, statistics, subprocess, sys
import numpy as np
import cairo

W, H, FPS = 1920, 1080, 30
BG = (0.035, 0.05, 0.07)
INK = (0.93, 0.95, 0.97); MUTE = (0.56, 0.63, 0.71); DIM = (0.33, 0.39, 0.46)
TEAL = (0.18, 0.83, 0.75); AMBER = (0.98, 0.75, 0.14); CORAL = (0.98, 0.44, 0.52); GREEN = (0.45, 0.9, 0.5)
LINE = (0.24, 0.29, 0.35); PANEL = (0.06, 0.085, 0.115)
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

FONT_DIR = os.environ.get("FONT_DIR", "")
if FONT_DIR and os.name == "nt":
    for f in os.listdir(FONT_DIR):
        if f.lower().endswith(".ttf"):
            ctypes.windll.gdi32.AddFontResourceExW(os.path.join(FONT_DIR, f), 0x10, 0)

# ------------------------------------------------------------------ data
def load_topo(name, obj):
    t = json.load(open(os.path.join(DATA, name), encoding="utf-8"))
    sx, sy = t["transform"]["scale"]; tx, ty = t["transform"]["translate"]
    arcs = []
    for a in t["arcs"]:
        pts = np.cumsum(np.array(a, dtype=float), axis=0)
        arcs.append(np.c_[pts[:, 0] * sx + tx, pts[:, 1] * sy + ty])
    geoms = []
    for g in t["objects"][obj]["geometries"]:
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        geoms.append((g["properties"], [ring for poly in polys for ring in poly]))
    return arcs, geoms, t["bbox"]

ARCS, GEOMS, BBOX = load_topo("areas.topojson", "areas")
S_ARCS, S_GEOMS, _ = load_topo("states.topojson", "states")
NPA = [g[0]["npa"] for g in GEOMS]
M = len(NPA)
LIN = json.load(open(os.path.join(DATA, "lineage.json"), encoding="utf-8"))["codes"]
POP = {r["code"]: int(r["population_1950"]) for r in csv.DictReader(open(os.path.join(DATA, "population_1950.csv"), encoding="utf-8"))}

def pulses(code): return sum(10 if ch == "0" else int(ch) for ch in code)

def base_code(npa, year):
    c = npa; r = LIN[c]
    while r["year"] > year or r["type"] == "overlay":
        c = r["parent"]; r = LIN[c]
    return c

def original(code):
    while LIN[code]["parent"]: code = LIN[code]["parent"]
    return code

ORIGINALS = sorted({original(n) for n in NPA}, key=lambda c: (pulses(c), c))
FAMILY = [c for c in LIN if original(c) in ORIGINALS]
def codes_in_service(year): return sum(1 for c in FAMILY if LIN[c]["year"] <= year)
_kids = {}
for c in FAMILY:
    if LIN[c]["type"] == "overlay": _kids.setdefault(LIN[c]["parent"], []).append(c)
def has_overlay(code, year):
    return any(LIN[k]["year"] <= year or has_overlay(k, year) for k in _kids.get(code, []) if LIN[k]["year"] <= year)

_year = {}
def year_state(year):
    if year not in _year:
        codes = [base_code(n, year) for n in NPA]
        _year[year] = (codes, [has_overlay(c, year) for c in codes], len(set(codes)))
    return _year[year]

RING_XY = []
for props, rings in GEOMS:
    out = []
    for ring in rings:
        pts = [ARCS[i] if i >= 0 else ARCS[~i][::-1] for i in ring]
        out.append(np.vstack([p if k == 0 else p[1:] for k, p in enumerate(pts)]))
    RING_XY.append(out)
OWNERS = {}
for gi, (props, rings) in enumerate(GEOMS):
    for ring in rings:
        for i in ring: OWNERS.setdefault(i if i >= 0 else ~i, set()).add(gi)
CENT = np.array([max(r, key=len).mean(0) for r in RING_XY])
def code_center(code, year=1947):
    idx = [i for i, c in enumerate(year_state(year)[0]) if c == code]
    return CENT[idx].mean(0)

STOPS = [(0.969, 0.863, 0.561), (0.941, 0.545, 0.384), (0.851, 0.275, 0.549), (0.494, 0.243, 0.651), (0.231, 0.145, 0.388)]
PMIN, PMAX = 5, 28
def ramp(p):
    x = min(1.0, max(0.0, (p - PMIN) / (PMAX - PMIN))) * (len(STOPS) - 1)
    i = min(len(STOPS) - 2, int(x)); f = x - i
    return tuple(STOPS[i][k] + (STOPS[i + 1][k] - STOPS[i][k]) * f for k in range(3))

# ------------------------------------------------------------------ drawing helpers
def sm(t, a=0.0, b=1.0):
    if b <= a: return 1.0 if t >= a else 0.0
    x = min(1.0, max(0.0, (t - a) / (b - a)))
    return x * x * (3 - 2 * x)

def lerp(a, b, t): return a + (b - a) * t
def lerp_col(a, b, t): return tuple(lerp(x, y, t) for x, y in zip(a, b))

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
    if a <= 0.003: return w
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

def tag(c, s, x, y, size=28, col=INK, a=1.0):
    if a <= 0.003: return
    font(c, size, True); w = c.text_extents(s).x_advance
    rrect(c, x - w / 2 - 12, y - size - 6, w + 24, size + 20, 8); c.set_source_rgba(0, 0, 0, 0.8 * a); c.fill()
    text(c, s, x, y, size, col, a, True, align="c")

def ring_mark(c, x, y, col=INK, a=1.0, r=13):
    if a <= 0.003: return
    c.new_path(); c.arc(x, y, r, 0, 2 * math.pi); c.set_source_rgba(*col, a); c.set_line_width(3.5); c.stroke()

def header(c, num, label, a=1.0):
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

def beats(texts, extra=()):
    """Caption windows: reading time at 2 words a second plus 0.8 s, then 1.6 s with the
    picture still, then a short gap before the next caption."""
    t = 0.5; caps = []; starts = []
    for i, s in enumerate(texts):
        d = len(s.split()) / 2.0 + 0.8 + 1.6 + (extra[i] if i < len(extra) else 0.0)
        caps.append((t, t + d, s)); starts.append(t); t += d + 0.6
    return t + 0.4, caps, starts

# ------------------------------------------------------------------ the map
MAPR = (90, 130, 1180, 740)
RX = 1330
_k = min(MAPR[2] / (BBOX[2] - BBOX[0]), MAPR[3] / (BBOX[3] - BBOX[1]))
_ox = MAPR[0] + (MAPR[2] - (BBOX[2] - BBOX[0]) * _k) / 2; _oy = MAPR[1] + (MAPR[3] - (BBOX[3] - BBOX[1]) * _k) / 2
def P(xy):
    xy = np.asarray(xy, dtype=float)
    return np.c_[_ox + (xy[..., 0] - BBOX[0]) * _k, _oy + (BBOX[3] - xy[..., 1]) * _k] if xy.ndim == 2 else (_ox + (xy[0] - BBOX[0]) * _k, _oy + (BBOX[3] - xy[1]) * _k)
RING_PX = [[P(r) for r in rings] for rings in RING_XY]
ARC_PX = [P(a) for a in ARCS]
S_ARC_PX = [P(a) for a in S_ARCS]
_s_owner = {}
for gi, (props, rings) in enumerate(S_GEOMS):
    for ring in rings:
        for i in ring: _s_owner.setdefault(i if i >= 0 else ~i, set()).add(gi)
S_INNER = [i for i, o in _s_owner.items() if len(o) == 2]

def path(c, pts):
    c.move_to(pts[0, 0], pts[0, 1])
    for x, y in pts[1:]: c.line_to(x, y)

def poly_path(c, i):
    for r in RING_PX[i]:
        path(c, r); c.close_path()

MID = {"0": TEAL, "1": AMBER}
def fill_of(code, mode):
    if mode == "middle": return MID.get(code[1], (0.3, 0.34, 0.4))
    return ramp(pulses(code))

def draw_map(c, year, mode="pulses", alpha=None, focus=None, a=1.0):
    """alpha: per-polygon opacity (reveal). focus: codes kept bright; the rest dim."""
    codes, over, _n = year_state(year)
    for i in range(M):
        al = a * (alpha[i] if alpha is not None else 1.0)
        if al <= 0.003: continue
        if focus is not None and codes[i] not in focus: al *= 0.22
        c.new_path(); poly_path(c, i)
        col = fill_of(codes[i], mode)
        c.set_source_rgba(*col, al); c.fill_preserve()
        c.set_source_rgba(*col, al); c.set_line_width(0.8); c.stroke()
        if over[i] and mode == "pulses":
            c.save(); c.new_path(); poly_path(c, i); c.clip()
            x0, y0, x1, y1 = c.clip_extents()
            c.set_source_rgba(1, 1, 1, 0.34 * al); c.set_line_width(1.6)
            s = math.floor((x0 - (y1 - y0)) / 9) * 9
            while s < x1:
                c.move_to(s, y1); c.line_to(s + (y1 - y0), y0); s += 9
            c.stroke(); c.restore()
    if alpha is None:
        c.set_line_join(cairo.LINE_JOIN_ROUND)
        for i in S_INNER:
            path(c, S_ARC_PX[i])
        c.set_source_rgba(1, 1, 1, 0.10 * a); c.set_line_width(1.0); c.stroke()
        for ai, own in OWNERS.items():
            own = list(own)
            if len(own) == 2 and codes[own[0]] != codes[own[1]]: path(c, ARC_PX[ai])
        c.set_source_rgba(*BG, 0.95 * a); c.set_line_width(1.6); c.stroke()
        for ai, own in OWNERS.items():
            if len(own) == 1: path(c, ARC_PX[ai])
        c.set_source_rgba(0.82, 0.86, 0.92, 0.55 * a); c.set_line_width(1.2); c.stroke()

_cache = {}
def map_cached(c, year, mode="pulses", focus=None, a=1.0):
    k = (year, mode, tuple(sorted(focus)) if focus else None)
    if k not in _cache:
        sf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H); draw_map(cairo.Context(sf), year, mode, None, focus); _cache[k] = sf
    c.set_source_surface(_cache[k], 0, 0); c.paint_with_alpha(a)

def legend(c, x, y, a=1.0, w=440, title="PULSES TO DIAL THE CODE"):
    text(c, title, x, y, 24, MUTE, a, True, track=3)
    n = PMAX - PMIN + 1; cw = w / n
    for i in range(n):
        c.rectangle(x + i * cw, y + 18, cw + 0.6, 26); c.set_source_rgba(*ramp(PMIN + i), a); c.fill()
    text(c, "5  quick", x, y + 82, 28, INK, a); text(c, "slow  28", x + w, y + 82, 28, INK, a, align="r")

def source_note(c, a=1.0):
    text(c, "Boundaries: UCLA Geoportal, 2015.", RX, 800, 28, DIM, a)
    text(c, "Code history: NANPA.", RX, 838, 28, DIM, a)

# ------------------------------------------------------------------ scenes
def scene_title(c, t):
    a = sm(t, 0.3, 1.2)
    text(c, "THE PROJECTION ROOM", W / 2, 400, 26, TEAL, a, True, align="c", track=4)
    text(c, "The dial-pulse map", W / 2, 540, 124, INK, a, True, align="c", fam="Inter Display")
    text(c, "Area codes, measured in clicks", W / 2, 624, 40, MUTE, sm(t, 0.9, 1.8), align="c")
TITLE = (4.6, scene_title, [(0.5, 4.2, "Today, we will be discussing the dial-pulse map.")])

# --- the dial
DC = (470, 500); DR = 300; STOP = math.radians(38)
def hole_angle(k): return STOP - math.radians(55 + 30 * (k - 1))
def turn_for(k): return math.radians(55 + 30 * (k - 1))
def dial(c, rot, a=1.0, lit=None):
    cx, cy = DC
    c.new_path(); c.arc(cx, cy, DR + 26, 0, 2 * math.pi); c.set_source_rgba(0.07, 0.095, 0.13, a); c.fill_preserve()
    c.set_source_rgba(*LINE, a); c.set_line_width(3); c.stroke()
    for k in range(1, 11):                                   # the numbers stay put under the wheel
        ang = hole_angle(k); x = cx + (DR - 62) * math.cos(ang); y = cy + (DR - 62) * math.sin(ang)
        text(c, str(k % 10), x, y + 15, 44, INK if lit == k else MUTE, a, True, align="c", fam="Inter Display")
    c.new_path(); c.arc(cx, cy, DR, 0, 2 * math.pi)
    for k in range(1, 11):
        ang = hole_angle(k) + rot; x = cx + (DR - 62) * math.cos(ang); y = cy + (DR - 62) * math.sin(ang)
        c.new_sub_path(); c.arc_negative(x, y, 40, 2 * math.pi, 0)
    c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    c.set_source_rgba(0.16, 0.20, 0.26, 0.82 * a); c.fill()
    c.set_fill_rule(cairo.FILL_RULE_WINDING)
    for k in range(1, 11):
        ang = hole_angle(k) + rot; x = cx + (DR - 62) * math.cos(ang); y = cy + (DR - 62) * math.sin(ang)
        c.new_path(); c.arc(x, y, 40, 0, 2 * math.pi); c.set_source_rgba(0.5, 0.58, 0.68, a); c.set_line_width(2.5); c.stroke()
    c.new_path(); c.arc(cx, cy, 78, 0, 2 * math.pi); c.set_source_rgba(0.10, 0.13, 0.17, a); c.fill()
    sx = cx + (DR + 8) * math.cos(STOP + 0.16); sy = cy + (DR + 8) * math.sin(STOP + 0.16)
    c.set_source_rgba(*INK, a); c.set_line_width(12); c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.move_to(sx, sy); c.line_to(cx + (DR - 100) * math.cos(STOP + 0.16), cy + (DR - 100) * math.sin(STOP + 0.16)); c.stroke()

def dial_run(t, t0, k):
    """Wind the wheel for digit k from t0, then let it spin back. Returns (rotation, clicks so far, done)."""
    wind = 0.5 + 0.11 * k; back = 0.28 * k + 0.5
    if t < t0: return 0.0, 0, False
    if t < t0 + wind: return turn_for(k) * sm(t, t0, t0 + wind), 0, False
    if t < t0 + wind + 0.35: return turn_for(k), 0, False
    f = min(1.0, (t - t0 - wind - 0.35) / back)
    return turn_for(k) * (1 - f), min(k, int(f * k + 0.999)) if f > 0 else 0, f >= 1

D_DUR, D_CAPS, DS = beats(["On a rotary phone, you dialed each digit by turning\na wheel and letting it spin back.",
                           "As it spun back, it sent clicks down the line.\nDialing 2 sent two clicks.",
                           "Dialing 0 sent ten. The network called\nthose clicks dial pulses."], (1.0, 2.0, 3.5))
def scene_dial(c, t):
    header(c, 1, "What a dial pulse is", sm(t, 0.2, 0.9))
    r2, n2, d2 = dial_run(t, DS[1] + 0.6, 2); r0, n0, d0 = dial_run(t, DS[2] + 0.6, 10)
    second = t >= DS[2]
    rot, n, k = (r0, n0, 10) if second else (r2, n2, 2)
    dial(c, rot, sm(t, 0.3, 1.2), k if t >= DS[1] else None)
    text(c, "One click", RX - 390, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "for each number", RX - 390, 287, 62, INK, 1, True, fam="Inter Display")
    if t >= DS[1]:
        a = sm(t, DS[1], DS[1] + 0.5)
        text(c, "DIGIT DIALED", RX - 390, 400, 24, MUTE, a, True, track=3)
        digits(c, str(k % 10), RX - 390, 520, 120, INK, a)
        text(c, "CLICKS SENT", RX - 60, 400, 24, MUTE, a, True, track=3)
        digits(c, str(n), RX - 60, 520, 120, TEAL, a)
        for i in range(k):
            on = i < n
            rrect(c, RX - 390 + i * 46, 580, 30, 56, 6)
            c.set_source_rgba(*(TEAL if on else LINE), a); c.fill()
    if second:
        a = sm(t, DS[2] + 5.4, DS[2] + 6.1)
        text(c, "Dial pulse", RX - 390, 730, 40, TEAL, a, True)
        text(c, "One click sent down the line as the wheel spins back.", RX - 390, 778, 30, MUTE, a)
DIAL = (D_DUR, scene_dial, D_CAPS)

K_DUR, K_CAPS, KS = beats(["An area code is three digits, so its cost is three\nnumbers added together.",
                           "For New York's 212, that is 2 plus 1 plus 2.\nFive pulses.",
                           "South Dakota's 605 is 6 plus 10 plus 5. Twenty-one pulses,\nmore than four times as long to dial."], (2.0, 2.5, 3.0))
def code_sum(c, code, y, t, t0, col, place):
    a = sm(t, t0, t0 + 0.6)
    text(c, place, 190, y - 150, 34, MUTE, a)
    x = 190
    for i, ch in enumerate(code):
        ai = sm(t, t0 + 0.3 + i * 0.5, t0 + 0.8 + i * 0.5)
        digits(c, ch, x, y, 150, INK, a)
        p = 10 if ch == "0" else int(ch)
        for j in range(p):
            rrect(c, x + 4 + (j % 5) * 20, y + 26 + (j // 5) * 30, 14, 22, 4); c.set_source_rgba(*col, ai); c.fill()
        text(c, f"{p}", x + 50, y + 122, 34, col, ai, True, align="c")
        if i < 2: text(c, "+", x + 150, y + 122, 34, MUTE, ai, True, align="c")
        x += 200
    at = sm(t, t0 + 2.0, t0 + 2.6)
    text(c, "=", 830, y - 30, 90, MUTE, at, True)
    w = digits(c, str(pulses(code)), 930, y, 150, col, at)
    text(c, "pulses", 930 + w + 24, y - 6, 54, col, at, True)
    bw = 620 * pulses(code) / 21
    rrect(c, 930, y + 40, bw * at, 34, 6); c.set_source_rgba(*col, 0.9 * at); c.fill()
def scene_code(c, t):
    header(c, 2, "Counting an area code", sm(t, 0.2, 0.9))
    code_sum(c, "212", 380, t, KS[1] + 0.3, ramp(5), "New York City")
    code_sum(c, "605", 720, t, KS[2] + 0.3, ramp(21), "South Dakota")
    a = sm(t, KS[0] + 0.4, KS[0] + 1.1) * (1 - sm(t, KS[1] - 0.3, KS[1] + 0.2))
    text(c, "Area code", W / 2, 420, 44, MUTE, a, align="c")
    digits(c, "2  1  2", W / 2, 600, 190, INK, a, align="c")
    text(c, "three digits, three turns of the wheel", W / 2, 690, 34, MUTE, a, align="c")
CODE = (K_DUR, scene_code, K_CAPS)

RANK = np.argsort(np.argsort([pulses(c) * 1000 + int(c) for c in year_state(1947)[0]], kind="stable"), kind="stable")
M_DUR, M_CAPS, MS = beats(["In 1947 AT&T gave these 48 states 77 area codes.\nEach one is colored by its pulses.",
                           "Gold codes were quick to dial.\nPlum codes were slow."], (5.0, 2.5))
def map_frame(c, a=1.0):
    rrect(c, MAPR[0] - 16, MAPR[1] - 10, MAPR[2] + 32, MAPR[3] + 20, 14); c.set_source_rgba(*LINE, a); c.set_line_width(2); c.stroke()
def scene_map(c, t):
    header(c, 3, "The 1947 map", sm(t, 0.2, 0.9))
    map_frame(c, sm(t, 0.2, 0.9))
    p = sm(t, MS[0] + 0.8, MS[0] + 6.5)
    if p >= 1: map_cached(c, 1947)
    else: draw_map(c, 1947, alpha=[min(1.0, max(0.0, (p * 1.08 * M - RANK[i]) / (0.08 * M))) for i in range(M)])
    text(c, "77 codes,", RX, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "5 to 21 pulses", RX, 287, 62, INK, 1, True, fam="Inter Display")
    legend(c, RX, 390, sm(t, MS[0] + 0.6, MS[0] + 1.3))
    n = sum(1 for i in range(M) if RANK[i] < p * M)
    a = sm(t, MS[0] + 0.8, MS[0] + 1.4)
    shown = len({year_state(1947)[0][i] for i in range(M) if RANK[i] < p * M})
    text(c, "CODES ON THE MAP", RX, 580, 24, MUTE, a, True, track=3)
    digits(c, str(shown), RX - 3, 690, 104, INK, a)
    text(c, "quickest first", RX + 150, 680, 30, MUTE, a * (1 - sm(t, MS[0] + 6.5, MS[0] + 7.0)))
    source_note(c, sm(t, MS[0] + 1.2, MS[0] + 1.9))
MAP47 = (M_DUR, scene_map, M_CAPS)

CITY = [("212", "New York", 0), ("213", "Los Angeles", 1), ("312", "Chicago", 2), ("313", "Detroit", 3)]
Y_DUR, Y_CAPS, YS = beats(["The quickest code of all, 212, went to New York.\nIt was the busiest phone market in the country.",
                           "Los Angeles got 213. Chicago got 312. Detroit got 313.\nSix, six and seven pulses."], (2.0, 4.0))
def scene_cities(c, t):
    header(c, 4, "Who got the fast codes", sm(t, 0.2, 0.9))
    map_frame(c)
    on = [code for code, name, i in CITY if (i == 0 and t >= YS[0] + 0.8) or (i > 0 and t >= YS[1] + 0.5 + (i - 1) * 1.3)]
    dimp = sm(t, YS[0] + 0.3, YS[0] + 1.1)
    map_cached(c, 1947, a=1 - dimp * 0.0)
    if dimp > 0:
        c.save(); rrect(c, MAPR[0] - 15, MAPR[1] - 9, MAPR[2] + 30, MAPR[3] + 18, 13); c.clip()
        c.set_source_rgba(*BG, 0.74 * dimp); c.paint(); c.restore()
        for code in on:
            for i, cd in enumerate(year_state(1947)[0]):
                if cd == code:
                    c.new_path(); poly_path(c, i); c.set_source_rgba(*ramp(pulses(code)), 1); c.fill()
    text(c, "The fastest codes", RX, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "went to big cities", RX, 287, 62, INK, 1, True, fam="Inter Display")
    for code, name, i in CITY:
        t0 = YS[0] + 0.8 if i == 0 else YS[1] + 0.5 + (i - 1) * 1.3
        a = sm(t, t0, t0 + 0.6)
        x, y = P(code_center(code)); ring_mark(c, x, y, INK, a)
        dx, dy = {"212": (-30, 66), "213": (60, -34), "312": (-120, -30), "313": (110, -34)}[code]
        tag(c, f"{code}  {name}", x + dx, y + dy, 28, INK, a)
        yy = 400 + i * 96
        digits(c, code, RX, yy, 60, ramp(pulses(code)), a)
        text(c, name, RX + 150, yy - 22, 34, INK, a, True)
        text(c, f"{pulses(code)} pulses", RX + 150, yy + 16, 30, MUTE, a)
    legend(c, RX, 770, 1.0, 380)
CITIES = (Y_DUR, scene_cities, Y_CAPS)

CH = (220, 220, 1000, 530)                 # plot area: x, y, w, h
def cx_(p): return CH[0] + (p - 4) / (22 - 4) * CH[2]
def cy_(m): return CH[1] + CH[3] - m / 8.5 * CH[3]
BANDS = [(5, 9), (18, 21)]
def band_median(lo, hi): return statistics.median([POP[c] for c in ORIGINALS if c in POP and lo <= pulses(c) <= hi]) / 1e6
G_DUR, G_CAPS, GS = beats(["Did places with more people get quicker codes?\nEach dot is one 1947 area code.",
                           "New York's 212 sits here: 5 pulses to dial,\nand 7.9 million people living there in 1950.",
                           "Codes of 5 to 9 pulses served a typical 2.7 million people.\nCodes of 18 to 21 pulses served 0.8 million.",
                           "The pattern is loose. North Carolina's 704 took 21 pulses\nand served 4.1 million people."], (3.0, 2.0, 3.0, 2.0))
def scene_chart(c, t):
    header(c, 5, "People and pulses", sm(t, 0.2, 0.9))
    text(c, "Did places with more people get quicker codes?", 90, 170, 52, INK, sm(t, 0.3, 1.0), True, fam="Inter Display")
    a = sm(t, 0.6, 1.4)
    c.set_source_rgba(*LINE, a); c.set_line_width(2)
    c.move_to(CH[0], CH[1]); c.line_to(CH[0], CH[1] + CH[3]); c.line_to(CH[0] + CH[2], CH[1] + CH[3]); c.stroke()
    for m in (2, 4, 6, 8):
        c.move_to(CH[0], cy_(m)); c.line_to(CH[0] + CH[2], cy_(m)); c.set_source_rgba(*LINE, 0.45 * a); c.set_line_width(1); c.stroke()
        text(c, f"{m}", CH[0] - 18, cy_(m) + 10, 28, MUTE, a, align="r")
    for p in (5, 10, 15, 20):
        text(c, f"{p}", cx_(p), CH[1] + CH[3] + 40, 28, MUTE, a, align="c")
    text(c, "Pulses to dial the code. Fewer is quicker.", CH[0] + CH[2] / 2, CH[1] + CH[3] + 84, 30, MUTE, a, align="c")
    c.save(); c.translate(120, CH[1] + CH[3] / 2); c.rotate(-math.pi / 2)
    text(c, "People living there in 1950, millions", 0, 0, 30, MUTE, a, align="c"); c.restore()
    order = [cd for cd in ORIGINALS if cd in POP]
    shown = int(len(order) * sm(t, GS[0] + 1.0, GS[0] + 4.5))
    for i, cd in enumerate(order[:shown]):
        hot = (cd == "212" and t >= GS[1]) or (cd == "704" and t >= GS[3])
        c.new_path(); c.arc(cx_(pulses(cd)) + ((int(cd) % 7) - 3) * 2.2, cy_(POP[cd] / 1e6), 13 if hot else 9, 0, 2 * math.pi)
        c.set_source_rgba(*ramp(pulses(cd)), 1.0 if hot else 0.85); c.fill_preserve()
        c.set_source_rgba(*(INK if hot else BG), 1); c.set_line_width(3 if hot else 1.5); c.stroke()
    a1 = sm(t, GS[1] + 0.4, GS[1] + 1.0)
    tag(c, "212  New York City", cx_(5) + 190, cy_(7.89) + 10, 28, INK, a1)
    for n, (lo, hi) in enumerate(BANDS):
        a2 = sm(t, GS[2] + 0.5 + n * 1.6, GS[2] + 1.1 + n * 1.6)
        if a2 <= 0: continue
        m = band_median(lo, hi)
        c.set_source_rgba(*TEAL, a2); c.set_line_width(5); c.set_dash([14, 8])
        c.move_to(cx_(lo) - 22, cy_(m)); c.line_to(cx_(hi) + 22, cy_(m)); c.stroke(); c.set_dash([])
        tag(c, f"typical: {m:.1f} million", (cx_(lo) + cx_(hi)) / 2, cy_(m) - 22 if n == 0 else cy_(m) - 60, 28, TEAL, a2)
    a3 = sm(t, GS[3] + 0.4, GS[3] + 1.0)
    tag(c, "704  North Carolina", cx_(21) - 40, cy_(4.06) - 30, 28, INK, a3)
    text(c, "Dot color", RX + 60, 300, 30, MUTE, a); legend(c, RX + 60, 350, a, 420)
    text(c, "Typical = the middle value", RX + 60, 520, 28, DIM, sm(t, GS[2] + 0.5, GS[2] + 1.1))
    text(c, "of that group of codes.", RX + 60, 558, 28, DIM, sm(t, GS[2] + 0.5, GS[2] + 1.1))
    text(c, "Population: 1950 Census.", RX + 60, 800, 28, DIM, a)
CHART = (G_DUR, scene_chart, G_CAPS)

I_DUR, I_CAPS, IS = beats(["The middle digit carried a second message.\nA 0 meant one code covered the whole state.",
                           "A 1 meant the state was divided\namong several codes."], (3.0, 3.0))
def scene_middle(c, t):
    header(c, 6, "The middle digit", sm(t, 0.2, 0.9))
    map_frame(c)
    codes = year_state(1947)[0]
    f = sm(t, 0.3, 1.2)
    map_cached(c, 1947, a=1 - 0.75 * f)
    zero = sm(t, IS[0] + 0.8, IS[0] + 1.8); one = sm(t, IS[1] + 0.5, IS[1] + 1.5)
    for i, cd in enumerate(codes):
        al = zero if cd[1] == "0" else one
        if al <= 0: continue
        c.new_path(); poly_path(c, i); c.set_source_rgba(*MID[cd[1]], 0.85 * al); c.fill()
    for ai, own in OWNERS.items():
        own = list(own)
        if len(own) == 2 and codes[own[0]] != codes[own[1]]: path(c, ARC_PX[ai])
    c.set_source_rgba(*BG, 0.95); c.set_line_width(1.6); c.stroke()
    text(c, "What the middle", RX, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "digit meant", RX, 287, 62, INK, 1, True, fam="Inter Display")
    for n, (dg, col, head, sub, eg, al) in enumerate([("0", TEAL, "One code for the state", "Florida was 305.", "3 0 5", zero),
                                                      ("1", AMBER, "State split among codes", "New York City was 212.", "2 1 2", one)]):
        y = 420 + n * 200
        rrect(c, RX, y - 44, 56, 56, 8); c.set_source_rgba(*col, al); c.fill()
        digits(c, dg, RX + 28, y - 2, 44, BG, al, align="c")
        text(c, head, RX + 78, y - 6, 36, INK, al, True)
        text(c, sub, RX + 78, y + 38, 30, MUTE, al)
    n0 = len({cd for cd in codes if cd[1] == "0"}); n1 = len({cd for cd in codes if cd[1] == "1"})
    text(c, f"{n0} codes with a 0, {n1} with a 1.", RX, 820, 30, DIM, one)
MIDDLE = (I_DUR, scene_middle, I_CAPS)

R_DUR, R_CAPS, RS = beats(["As phones multiplied, the codes ran short. The first fix was\na split: cut a territory in two and give one part a new code.",
                           "By 1991 the map held 117 codes,\nall of them made by splitting.",
                           "In 1992 a second fix arrived, the overlay: a new code\nlaid over the same ground. Overlays are striped here.",
                           "By 2025 these 48 states carried 367 codes on 237 territories.\nThe last boundary split was in 2007."], (4.0, 4.0, 7.0, 2.0))
def year_at(t):
    if t < RS[0] + 1.5: return 1947.0
    if t < RS[1]: return lerp(1947, 1960, sm(t, RS[0] + 1.5, RS[1] - 2.0))
    if t < RS[2]: return lerp(1960, 1991, sm(t, RS[1] + 0.6, RS[2] - 2.2))
    if t < RS[2] + 2.5: return 1991 + sm(t, RS[2] + 1.0, RS[2] + 2.0)
    return lerp(1992, 2025, sm(t, RS[2] + 2.5, RS[3] - 2.0))
def scene_growth(c, t):
    header(c, 7, "Running out of room", sm(t, 0.2, 0.9))
    map_frame(c)
    y = int(round(year_at(t)))
    map_cached(c, y)
    text(c, "YEAR", RX, 200, 24, MUTE, 1, True, track=3)
    digits(c, str(y), RX - 4, 320, 130, INK, 1)
    text(c, "CODES IN SERVICE", RX, 400, 24, MUTE, 1, True, track=3)
    digits(c, str(codes_in_service(y)), RX - 3, 500, 100, TEAL, 1)
    text(c, "TERRITORIES ON THE MAP", RX, 570, 24, MUTE, 1, True, track=3)
    digits(c, str(year_state(y)[2]), RX - 3, 650, 76, INK, 1)
    a = sm(t, RS[0] + 0.5, RS[0] + 1.2) * (1 - sm(t, RS[2] - 0.4, RS[2]))
    text(c, "Split", RX, 730, 36, TEAL, a, True)
    text(c, "One territory becomes two.", RX, 774, 30, MUTE, a)
    text(c, "One part gets a new code.", RX, 812, 30, MUTE, a)
    b = sm(t, RS[2] + 0.3, RS[2] + 1.0)
    text(c, "Overlay", RX, 730, 36, TEAL, b, True)
    text(c, "A second code on the same", RX, 774, 30, MUTE, b)
    text(c, "ground. Shown with stripes.", RX, 812, 30, MUTE, b)
    legend(c, MAPR[0] + 10, MAPR[1] + MAPR[3] - 96, 1.0, 270, "PULSES")
GROWTH = (R_DUR, scene_growth, R_CAPS)

def scene_closing(c, t):
    a = sm(t, 0.3, 1.2)
    text(c, "THE PROJECTION ROOM", W / 2, 400, 26, TEAL, a, True, align="c", track=4)
    text(c, "The dial-pulse map", W / 2, 540, 124, INK, a, True, align="c", fam="Inter Display")
    text(c, "77 codes in 1947. 367 by 2025.", W / 2, 624, 40, MUTE, sm(t, 0.9, 1.8), align="c")
    text(c, "jacob-hogue.github.io/projection-room", W / 2, 720, 28, DIM, sm(t, 1.4, 2.2), align="c")
CLOSING = (4.6, scene_closing, [(0.5, 4.2, "That was the dial-pulse map. Thank you for watching.")])

SCENES = [TITLE, DIAL, CODE, MAP47, CITIES, CHART, MIDDLE, GROWTH, CLOSING]

def draw(si, t):
    dur, fn, caps = SCENES[si]
    surf = cairo.ImageSurface(cairo.FORMAT_RGB24, W, H); c = cairo.Context(surf)
    c.set_source_rgb(*BG); c.paint()
    fn(c, t); caption(c, t, caps)
    f = min(sm(t, 0, 0.35), 1 - sm(t, dur - 0.35, dur))
    if f < 1: c.set_source_rgba(*BG, 1 - f); c.paint()
    return surf

def frames(si): return int(round(SCENES[si][0] * FPS))

if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "stills":
        out = sys.argv[2] if len(sys.argv) > 2 else "."
        picks = [(0, 3.0), (1, DS[1] + 2.4), (1, D_DUR - 1.5), (2, KS[1] - 1.0), (2, K_DUR - 1.5), (3, MS[0] + 4.0), (3, M_DUR - 1.5),
                 (4, Y_DUR - 1.5), (5, GS[1] + 3.0), (5, G_DUR - 1.5), (6, I_DUR - 1.5), (7, RS[0] + 6.0), (7, RS[2] - 1.0), (7, R_DUR - 1.5), (8, 3.0)]
        for si, t in picks:
            draw(si, t).write_to_png(os.path.join(out, f"still_{si + 1:02d}_{t:05.1f}.png"))
        print(len(picks), "stills; total", round(sum(s[0] for s in SCENES), 1), "s")
    elif mode == "still":
        draw(int(sys.argv[2]), float(sys.argv[3])).write_to_png(sys.argv[4])
    elif mode == "srt":
        def ts(t):
            return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{t % 60:06.3f}".replace(".", ",")
        off = 0.0; n = 1; out = []
        for i, (dur, fn, caps) in enumerate(SCENES):
            for a, b, txt in caps:
                out.append(f"{n}\n{ts(off + a)} --> {ts(off + b)}\n{txt}\n"); n += 1
            off += frames(i) / FPS
        open(sys.argv[2], "w", encoding="utf-8").write("\n".join(out))
        print("total", round(off, 1), "s", [round(s[0], 1) for s in SCENES])
    else:
        out = sys.argv[2] if len(sys.argv) > 2 else "film.mp4"
        work = os.path.dirname(os.path.abspath(out))
        parts = []
        for si in range(len(SCENES)):
            tmp = os.path.join(work, f"tmp_s{si + 1}.mp4"); parts.append(tmp)
            p = subprocess.Popen([FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}",
                                  "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
                                  "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
            for f in range(frames(si)):
                p.stdin.write(bytes(draw(si, f / FPS).get_data()))
            p.stdin.close(); p.wait()
            print("scene", si + 1, round(SCENES[si][0], 1), "s", flush=True)
        lst = os.path.join(work, "tmp_list.txt")
        open(lst, "w").write("".join(f"file '{os.path.basename(p)}'\n" for p in parts))
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy",
                        "-movflags", "+faststart", out], check=True, cwd=work)
        for p in parts + [lst]: os.remove(p)
        print("wrote", out)
