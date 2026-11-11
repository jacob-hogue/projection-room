"""Draws the film frame by frame with pycairo and pipes each scene to FFmpeg.

Run from pieces/parcel-problem:
  python film/render.py stills            a few full-size test frames
  python film/render.py video             one s<N>.mp4 per scene, joined into film.mp4
  python film/render.py srt captions.srt  the caption file

Scenes, in order: title, what a parcel map is, five copies, how a copy is refreshed,
three problems, one source of record, review before it counts, the nightly job, everyone reads the same map,
before and after, closing card.

Inter is loaded from FONT_DIR for this process when it is not installed. FFMPEG names the encoder.
"""
import ctypes, math, os, subprocess, sys
import numpy as np
import cairo

W, H, FPS = 1920, 1080, 30
BG = (0.035, 0.05, 0.07)
INK = (0.93, 0.95, 0.97); MUTE = (0.56, 0.63, 0.71); DIM = (0.33, 0.39, 0.46)
TEAL = (0.18, 0.83, 0.75); AMBER = (0.98, 0.75, 0.14); CORAL = (0.98, 0.44, 0.52); GREEN = (0.45, 0.9, 0.5)
LINE = (0.24, 0.29, 0.35); PANEL = (0.06, 0.085, 0.115)
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
HERE = os.path.dirname(os.path.abspath(__file__))

FONT_DIR = os.environ.get("FONT_DIR", "")
if FONT_DIR and os.name == "nt":
    for f in os.listdir(FONT_DIR):
        if f.lower().endswith(".ttf"):
            ctypes.windll.gdi32.AddFontResourceExW(os.path.join(FONT_DIR, f), 0x10, 0)

PARCELS = 48212          # parcels in the example county
CHANGED = 312            # parcels edited on the example day
OFFICES = [("Assessor", "sets property values", "Parcel_ID", "edits happen here", 0),
           ("Planning", "reviews building permits", "ParcelNumber", "copied monthly", 30),
           ("Public works", "maintains roads and pipes", "PID", "copied by hand", 999),
           ("Dispatch", "sends fire crews and ambulances", "PARCEL_NO", "copied weekly", 7),
           ("Open data", "publishes the map to the public", "MapLot", "copied nightly", 2)]

def sm(t, a=0.0, b=1.0):
    if b <= a: return 1.0 if t >= a else 0.0
    x = min(1.0, max(0.0, (t - a) / (b - a)))
    return x * x * (3 - 2 * x)

def lerp(a, b, t): return a + (b - a) * t

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

def box(c, x, y, w, h, a=1.0, col=LINE, fill=PANEL, lw=2, r=14):
    if a <= 0.003: return
    rrect(c, x, y, w, h, r); c.set_source_rgba(*fill, a); c.fill_preserve()
    c.set_source_rgba(*col, a); c.set_line_width(lw); c.stroke()

def arrow(c, x1, y1, x2, y2, p=1.0, col=MUTE, a=1.0, lw=3, head=True):
    """A straight arrow drawn from its tail by progress p."""
    if p <= 0 or a <= 0.003: return
    x = lerp(x1, x2, p); y = lerp(y1, y2, p)
    c.set_source_rgba(*col, a); c.set_line_width(lw); c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.move_to(x1, y1); c.line_to(x, y); c.stroke()
    if head and p >= 0.999:
        ang = math.atan2(y2 - y1, x2 - x1)
        c.move_to(x2, y2)
        c.line_to(x2 - 16 * math.cos(ang - 0.42), y2 - 16 * math.sin(ang - 0.42))
        c.line_to(x2 - 16 * math.cos(ang + 0.42), y2 - 16 * math.sin(ang + 0.42))
        c.close_path(); c.fill()

def tick(c, x, y, a=1.0, col=GREEN, r=17):
    if a <= 0.003: return
    c.new_path(); c.arc(x, y, r, 0, 2 * math.pi); c.set_source_rgba(*col, a); c.fill()
    c.set_source_rgba(*BG, a); c.set_line_width(4); c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.move_to(x - 8, y + 1); c.line_to(x - 2, y + 7); c.line_to(x + 9, y - 6); c.stroke()

def tag(c, s, x, y, size=28, col=INK, a=1.0):
    if a <= 0.003: return
    font(c, size, True); w = c.text_extents(s).x_advance
    rrect(c, x - w / 2 - 12, y - size - 6, w + 24, size + 20, 8); c.set_source_rgba(0, 0, 0, 0.78 * a); c.fill()
    text(c, s, x, y, size, col, a, True, align="c")

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
    """Caption windows for a scene. Each caption stays up for its reading time (2 words a second
    plus 0.8 s), then 1.6 s more with the picture still, then a short gap before the next."""
    t = 0.5; caps = []; starts = []
    for i, s in enumerate(texts):
        d = len(s.split()) / 2.0 + 0.8 + 1.6 + (extra[i] if i < len(extra) else 0.0)
        caps.append((t, t + d, s)); starts.append(t); t += d + 0.6
    return t + 0.4, caps, starts

RX = 940

# ------------------------------------------------------------------ the hand-made block of parcels
_rng = np.random.default_rng(11)
def _row(n):
    w = _rng.uniform(0.8, 1.25, n); w = w / w.sum()
    x = np.concatenate([[0], np.cumsum(w)])
    return [(x[i], x[i + 1]) for i in range(n)]
LOTS = []                                    # (x0, y0, x1, y1) in a unit box 1.0 wide, 0.84 tall
for by0, by1 in [(0.04, 0.38), (0.46, 0.80)]:
    mid = (by0 + by1) / 2
    for a0, a1 in _row(6): LOTS.append((a0, by0, a1, mid))
    for a0, a1 in _row(6): LOTS.append((a0, mid, a1, by1))
TARGET = 8                                   # the lot the assessor splits
BLOCK_H = 0.84

def block(c, x, y, w, n=24, split=0.0, mark=None, a=1.0, lw=2.0, lot=None):
    """The block of 24 lots. split draws the new lot line across the target lot;
    mark tints the target: 'new' teal, 'ok' green, 'stale' amber."""
    if a <= 0.003: return
    pad = 0.035 * w; iw = w - 2 * pad
    lot = TARGET if lot is None else lot
    box(c, x, y, w, 0.76 * iw + 2 * pad, a, r=12)
    for i, (x0, y0, x1, y1) in enumerate(LOTS[:n]):
        X0 = x + pad + x0 * iw; X1 = x + pad + x1 * iw; Y0 = y + pad + (y0 - 0.04) * iw; Y1 = y + pad + (y1 - 0.04) * iw
        g = 0.02 * ((i * 7) % 5)
        c.rectangle(X0, Y0, X1 - X0, Y1 - Y0)
        c.set_source_rgba(0.085 + g, 0.115 + g, 0.155 + g, a); c.fill_preserve()
        if i == lot and mark:
            col = {"new": TEAL, "ok": GREEN, "stale": AMBER}[mark]
            c.set_source_rgba(*col, 0.42 * a); c.fill_preserve()
        c.set_source_rgba(0.50, 0.58, 0.68, 0.9 * a); c.set_line_width(lw); c.stroke()
        if i == TARGET and split > 0:
            xm = (X0 + X1) / 2
            c.move_to(xm, Y0); c.line_to(xm, lerp(Y0, Y1, split))
            c.set_source_rgba(*INK, a); c.set_line_width(lw + 1.5); c.stroke()

def lot_center(x, y, w, i=TARGET):
    pad = 0.035 * w; iw = w - 2 * pad; x0, y0, x1, y1 = LOTS[i]
    return x + pad + (x0 + x1) / 2 * iw, y + pad + ((y0 + y1) / 2 - 0.04) * iw

def block_h(w): return 0.76 * (w - 0.07 * w) + 0.07 * w

# ------------------------------------------------------------------ one dot per parcel
COLS, CELL = 241, 3
ROWS = math.ceil(PARCELS / COLS)
GX, GY = 90 + (760 - COLS * CELL) // 2, 196
_changed = np.sort(np.random.default_rng(5).choice(PARCELS, CHANGED, replace=False))
_mask = None
def dot_mask():
    global _mask
    if _mask is None:
        _mask = cairo.ImageSurface(cairo.FORMAT_A8, W, H); cc = cairo.Context(_mask)
        cc.set_source_rgba(1, 1, 1, 1)
        for i in range(PARCELS):
            cc.rectangle(GX + (i % COLS) * CELL, GY + (i // COLS) * CELL, 2, 2)
        cc.fill()
    return _mask

def dots(c, col, a=1.0, upto=1.0):
    """All parcels as dots; upto clips the grid from the top for a sweep."""
    if a <= 0.003 or upto <= 0: return
    c.save(); c.rectangle(GX - 2, GY - 2, COLS * CELL + 4, (ROWS * CELL + 4) * upto); c.clip()
    c.set_source_rgba(*col, a); c.mask_surface(dot_mask(), 0, 0); c.restore()

def changed_dots(c, col, n=CHANGED, a=1.0, r=3.5):
    if a <= 0.003 or n <= 0: return
    c.set_source_rgba(*col, a)
    for i in _changed[:n]:
        c.rectangle(GX + (i % COLS) * CELL + 1 - r, GY + (i // COLS) * CELL + 1 - r, 2 * r, 2 * r)
    c.fill()

def grid_frame(c, a=1.0):
    rrect(c, 90, 118, 760, 760, 14); c.set_source_rgba(*LINE, a); c.set_line_width(2); c.stroke()
    text(c, f"{PARCELS:,} parcels. One dot each.", 114, 168, 28, MUTE, a)

# ------------------------------------------------------------------ scenes
def scene_title(c, t):
    a = sm(t, 0.3, 1.2)
    text(c, "THE PROJECTION ROOM", W / 2, 400, 26, TEAL, a, True, align="c", track=4)
    text(c, "The Parcel Problem", W / 2, 540, 124, INK, a, True, align="c", fam="Inter Display")
    text(c, "One parcel map, five copies, and the way back to one", W / 2, 624, 40, MUTE, sm(t, 0.9, 1.8), align="c")
TITLE = (4.6, scene_title, [(0.5, 4.2, "Today, we will be discussing the parcel problem.")])

W_DUR, W_CAPS, WS = beats(["A parcel map shows every piece of land in a county,\nwith a record of who owns it.",
                           "Five county offices use that map every day,\neach for a different job."], (2.0, 3.0))
def scene_what(c, t):
    header(c, 1, "What a parcel map is", sm(t, 0.2, 0.9))
    n = int(24 * sm(t, 0.5, 3.4)) if t < 3.4 else 24
    hi = sm(t, 3.8, 4.4)
    block(c, 90, 190, 760, n, mark="new" if hi > 0.5 else None)
    if hi > 0:
        cx, cy = lot_center(90, 190, 760); tag(c, "One parcel", cx, cy - 70, 28, INK, hi)
    text(c, "One map of", RX, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "who owns what", RX, 287, 62, INK, 1, True, fam="Inter Display")
    b1 = sm(t, WS[1], WS[1] + 0.5)
    ca = sm(t, 4.2, 5.0) * (1 - b1)
    if ca > 0:
        box(c, RX, 350, 860, 330, ca)
        text(c, "ONE PARCEL RECORD", RX + 36, 404, 24, TEAL, ca, True, track=3)
        for i, (k, val) in enumerate([("Parcel ID", "07-118-022"), ("Owner", "Jane Doe"), ("Size", "0.24 acres")]):
            text(c, k, RX + 36, 474 + i * 70, 30, MUTE, ca); text(c, val, RX + 240, 474 + i * 70, 36, INK, ca, True)
    for i, (name, job, *_r) in enumerate(OFFICES):
        a = sm(t, WS[1] + 0.5 + i * 0.9, WS[1] + 1.1 + i * 0.9)
        text(c, name, RX, 384 + i * 92, 40, INK, a, True); text(c, job, RX, 384 + i * 92 + 40, 30, MUTE, a)
WHAT = (W_DUR, scene_what, W_CAPS)

MW, MG = 300, 40
MX = (W - 5 * MW - 4 * MG) // 2
C_DUR, C_CAPS, CS = beats(["Each office keeps its own copy of the parcel map\nand refreshes it on its own schedule.",
                           "On Monday the assessor splits one lot in two.\nOnly the assessor's copy shows it.",
                           "The other copies catch up days or weeks later.\nUntil then, five maps give different answers.",
                           "Even the column that holds the parcel ID\nhas a different name in every copy."], (2.5, 1.5, 6.0, 1.0))
def scene_copies(c, t):
    header(c, 2, "Five copies", sm(t, 0.2, 0.9))
    text(c, "Each office keeps its own copy", 90, 196, 56, INK, sm(t, 0.3, 1.0), True, fam="Inter Display")
    text(c, "Example county. Numbers are illustrative.", W - 90, 192, 28, DIM, sm(t, 0.6, 1.3), align="r")
    split_t = CS[1] + 0.6
    day = 1 + 29 * sm(t, CS[2] + 0.8, CS[2] + 7.5) if t >= CS[2] else 1
    names = sm(t, CS[3] + 0.3, CS[3] + 1.0)
    shown = 0
    for i, (name, job, field, sched, catch) in enumerate(OFFICES):
        x = MX + i * (MW + MG); a = sm(t, 0.8 + i * 0.55, 1.4 + i * 0.55)
        did = t >= split_t
        has = did and (catch == 0 or (t >= CS[2] and day >= catch))
        sp = sm(t, split_t, split_t + 0.9) if catch == 0 else (1.0 if has else 0.0)
        block(c, x, 250, MW, split=sp, mark=("ok" if has else "stale") if did else None, a=a)
        text(c, name, x, 250 + block_h(MW) + 56, 36, INK, a, True)
        text(c, field, x, 250 + block_h(MW) + 100, 30, lerp_col(MUTE, AMBER, names), a, names > 0.5)
        text(c, sched, x, 250 + block_h(MW) + 142, 28, MUTE, a)
        if did:
            sa = sm(t, split_t + 0.9, split_t + 1.5)
            text(c, "shows the split" if has else "out of date", x, 250 + block_h(MW) + 190, 28, GREEN if has else AMBER, sa, True)
            shown += 1 if has else 0
    if t >= split_t + 0.9:
        a = sm(t, split_t + 0.9, split_t + 1.6)
        text(c, "DAY", MX, 800, 24, MUTE, a, True, track=3)
        digits(c, f"{int(day)}", MX, 868, 64, INK, a)
        text(c, "MAPS THAT SHOW THE SPLIT", MX + 300, 800, 24, MUTE, a, True, track=3)
        w = digits(c, f"{shown}", MX + 300, 868, 64, GREEN if shown == 5 else AMBER, a)
        text(c, "of 5", MX + 300 + w + 18, 868, 40, MUTE, a)

def lerp_col(a, b, t): return tuple(lerp(x, y, t) for x, y in zip(a, b))
COPIES = (C_DUR, scene_copies, C_CAPS)

O_DUR, O_CAPS, OS = beats(["Each copy is a hosted layer: the online version\nof the map that web maps and apps read.",
                           "To refresh it, the office overwrites the whole layer.\nEvery row is deleted and loaded again.",
                           "But only 312 parcels changed that day.\nThe other 47,900 were rewritten for nothing.",
                           "And once field crews turn on offline sync,\nthe layer refuses to be overwritten at all."], (1.0, 3.5, 4.5, 1.5))
def scene_overwrite(c, t):
    header(c, 3, "How a copy is refreshed", sm(t, 0.2, 0.9))
    grid_frame(c, sm(t, 0.3, 1.0))
    sweep = sm(t, OS[1] + 0.6, OS[1] + 5.0)
    b2 = sm(t, OS[2] + 0.3, OS[2] + 1.0); b3 = sm(t, OS[3] + 0.2, OS[3] + 0.9)
    dots(c, (0.62, 0.68, 0.76), 0.75 * sm(t, 0.6, 2.0))
    if t >= OS[1]:
        dots(c, CORAL, lerp(1.0, 0.45, b2) * (1 - b3), sweep)
    if t >= OS[2]:
        changed_dots(c, GREEN, int(CHANGED * sm(t, OS[2] + 0.6, OS[2] + 2.4)), 1 - b3)
    if b3 > 0:
        rrect(c, 150, 440, 640, 120, 14); c.set_source_rgba(0, 0, 0, 0.82 * b3); c.fill()
        text(c, "Overwrite refused", 470, 518, 56, CORAL, b3, True, align="c", fam="Inter Display")
    text(c, "How a copy", RX, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "gets refreshed", RX, 287, 62, INK, 1, True, fam="Inter Display")
    a = sm(t, 1.0, 1.8)
    text(c, "Hosted layer", RX, 378, 40, TEAL, a, True)
    text(c, "The online copy of a map that web maps and apps read.", RX, 428, 30, MUTE, a)
    c.move_to(RX, 480); c.line_to(RX + 860, 480); c.set_source_rgba(*LINE, 1); c.set_line_width(2); c.stroke()
    a1 = sm(t, OS[1] + 0.3, OS[1] + 0.9) * (1 - b2)
    if a1 > 0:
        text(c, "ROWS DELETED AND RELOADED", RX, 560, 24, MUTE, a1, True, track=3)
        digits(c, f"{int(PARCELS * sweep):,}", RX - 4, 690, 120, CORAL, a1)
    a2 = b2 * (1 - b3)
    if a2 > 0:
        rx = RX + 330
        s1 = sm(t, OS[2] + 0.4, OS[2] + 1.0) * (1 - b3); s2 = sm(t, OS[2] + 2.0, OS[2] + 2.6) * (1 - b3); s3 = sm(t, OS[2] + 3.8, OS[2] + 4.4) * (1 - b3)
        digits(c, f"{PARCELS:,}", rx, 580, 70, CORAL, s1, align="r"); text(c, "rows rewritten", rx + 28, 576, 38, MUTE, s1)
        text(c, "−", RX, 666, 60, MUTE, s2, True); digits(c, f"{CHANGED}", rx, 670, 70, GREEN, s2, align="r"); text(c, "parcels that changed", rx + 28, 666, 38, MUTE, s2)
        c.move_to(RX, 698); c.line_to(rx + 420, 698); c.set_source_rgba(*MUTE, s3); c.set_line_width(3); c.stroke()
        digits(c, f"{PARCELS - CHANGED:,}", rx, 782, 70, INK, s3, align="r"); text(c, "rewritten for nothing", rx + 28, 778, 38, INK, s3, True)
    if b3 > 0:
        text(c, "Offline sync", RX, 560, 40, TEAL, b3, True)
        text(c, "Lets field crews edit with no signal and send", RX, 610, 30, MUTE, b3)
        text(c, "their edits back later.", RX, 650, 30, MUTE, b3)
        text(c, "A layer with sync turned on cannot be overwritten.", RX, 740, 34, INK, sm(t, OS[3] + 1.2, OS[3] + 1.9))
OVERWRITE = (O_DUR, scene_overwrite, O_CAPS)

P3 = [("No single source of record", "Five copies, and none of them is the official one.", "Keep one database of record"),
      ("Every refresh rewrites everything", f"{PARCELS:,} rows moved to carry {CHANGED} changes.", "Send only what changed"),
      ("Readers share a layer with editors", "Apps that only look sit on the map staff edit.", "Give readers their own read-only outputs")]
T_DUR, T_CAPS, TS = beats(["So there are three separate problems here.",
                           "Each one has a fix that GIS teams already use."], (4.0, 3.5))
def scene_three(c, t):
    header(c, 4, "Three problems", sm(t, 0.2, 0.9))
    for i, (prob, plain, fix) in enumerate(P3):
        y = 250 + i * 215
        a = sm(t, TS[0] + 0.4 + i * 1.4, TS[0] + 1.0 + i * 1.4)
        digits(c, str(i + 1), 110, y + 6, 76, CORAL, a)
        text(c, prob, 220, y, 54, INK, a, True, fam="Inter Display")
        text(c, plain, 220, y + 52, 32, MUTE, a)
        f = sm(t, TS[1] + 0.4 + i * 1.2, TS[1] + 1.0 + i * 1.2)
        text(c, "Fix", 220, y + 108, 30, TEAL, f, True)
        text(c, fix, 290, y + 108, 34, TEAL, f, True)
THREE = (T_DUR, scene_three, T_CAPS)

def cylinder(c, x, y, w, h, a=1.0, col=TEAL):
    if a <= 0.003: return
    ry = 34
    c.save()
    c.new_path(); c.move_to(x, y + ry); c.line_to(x, y + h - ry)
    c.save(); c.translate(x + w / 2, y + h - ry); c.scale(w / 2, ry); c.arc_negative(0, 0, 1, math.pi, 0); c.restore()
    c.line_to(x + w, y + ry)
    c.save(); c.translate(x + w / 2, y + ry); c.scale(w / 2, ry); c.arc_negative(0, 0, 1, 0, math.pi); c.restore()
    c.close_path(); c.set_source_rgba(col[0] * 0.16, col[1] * 0.16, col[2] * 0.16, a); c.fill_preserve()
    c.set_source_rgba(*col, a); c.set_line_width(3); c.stroke()
    c.save(); c.translate(x + w / 2, y + ry); c.scale(w / 2, ry); c.new_path(); c.arc(0, 0, 1, 0, 2 * math.pi); c.restore()
    c.set_source_rgba(*col, a); c.set_line_width(3); c.stroke()
    c.restore()

EDITORS = [("Assessor", "at a desk"), ("Planning", "in a web browser"), ("Public works", "in a web browser"), ("Field crew", "on a phone, offline")]
S_DUR, S_CAPS, SS = beats(["Start with one database that holds the official parcels.\nThis is the source of record.",
                           "Staff edit it through one editing service. It is a door\ninto the database, not another copy.",
                           "The database stamps every change with who made it\nand when. That stamp is called editor tracking."], (1.5, 3.0, 2.0))
def source_diagram(c, t, t_db, t_ed, x0=0, y0=0, live=1.0):
    db = sm(t, t_db, t_db + 0.8)
    cylinder(c, 1010 + x0, 230 + y0, 380, 400, db)
    text(c, "Parcels", 1200 + x0, 440 + y0, 60, INK, db, True, align="c", fam="Inter Display")
    text(c, "source of record", 1200 + x0, 492 + y0, 32, TEAL, db, True, align="c")
    sv = sm(t, t_ed, t_ed + 0.7)
    box(c, 560 + x0, 250 + y0, 320, 360, sv)
    text(c, "Editing", 720 + x0, 400 + y0, 44, INK, sv, True, align="c"); text(c, "service", 720 + x0, 452 + y0, 44, INK, sv, True, align="c")
    text(c, "one door for every edit", 720 + x0, 506 + y0, 28, MUTE, sv, align="c")
    arrow(c, 880 + x0, 430 + y0, 1002 + x0, 430 + y0, sm(t, t_ed + 0.6, t_ed + 1.2), MUTE, sv)
    for i, (who, how) in enumerate(EDITORS):
        a = sm(t, t_ed + 1.2 + i * 0.5, t_ed + 1.8 + i * 0.5); y = 236 + y0 + i * 102
        box(c, 110 + x0, y, 340, 88, a)
        text(c, who, 134 + x0, y + 38, 32, INK, a, True); text(c, how, 134 + x0, y + 72, 28, MUTE, a)
        arrow(c, 450 + x0, y + 44, 552 + x0, 430 + y0 + (i - 1.5) * 30, sm(t, t_ed + 1.6 + i * 0.5, t_ed + 2.2 + i * 0.5), MUTE, a)

def scene_source(c, t):
    header(c, 5, "One source of record", sm(t, 0.2, 0.9))
    source_diagram(c, t, SS[0] + 0.4, SS[1] + 0.4)
    a = sm(t, SS[0] + 1.2, SS[0] + 2.0)
    text(c, "Source of record", 1450, 320, 34, TEAL, a, True)
    for i, l in enumerate(["The one copy", "everyone agrees", "is correct."]): text(c, l, 1450, 372 + i * 42, 32, MUTE, a)
    e = sm(t, SS[2] + 0.4, SS[2] + 1.1)
    if e > 0:
        box(c, 560, 690, 1270, 170, e, TEAL, (0.03, 0.10, 0.10))
        text(c, "EDITOR TRACKING", 596, 742, 24, TEAL, e, True, track=3)
        for i, (k, v, x) in enumerate([("Parcel", "07-118-022", 596), ("Changed by", "assessor, desk 3", 960), ("When", "Monday, 2:14 pm", 1440)]):
            aa = sm(t, SS[2] + 1.0 + i * 0.7, SS[2] + 1.6 + i * 0.7)
            text(c, k, x, 790, 28, MUTE, aa); text(c, v, x, 834, 36, INK, aa, True)
SOURCE = (S_DUR, scene_source, S_CAPS)

DRAFTS = [("Planning draft", TARGET), ("Public works draft", TARGET), ("Field crew draft", 16)]
V_DUR, V_CAPS, VS = beats(["Each office edits in its own version: a private draft\nthat nobody else sees yet.",
                           "A field crew with no signal edits on the phone.\nWhen the signal returns, those edits sync into a draft too.",
                           "The assessor's office checks each draft against the record.\nA parcel changed in two drafts is flagged for a person to decide.",
                           "Only posted edits become the record."], (2.5, 3.0, 3.5, 3.5))
def scene_review(c, t):
    header(c, 6, "Review before it counts", sm(t, 0.2, 0.9))
    flag = sm(t, VS[2] + 1.6, VS[2] + 2.3); posted = sm(t, VS[3] + 0.6, VS[3] + 1.4)
    for i, (name, lot) in enumerate(DRAFTS):
        y = 130 + i * 246
        a = sm(t, VS[0] + 0.4 + i * 0.7, VS[0] + 1.0 + i * 0.7) if i < 2 else sm(t, VS[1] + 0.3, VS[1] + 0.9)
        conflict = i < 2 and flag > 0.5 and posted < 0.5
        mark = "ok" if posted > 0.5 else "stale" if conflict else "new"
        block(c, 110, y, 230, mark=mark, a=a, lot=lot)
        text(c, name, 110, y + block_h(230) + 34, 30, INK, a, True)
        if i == 2:
            off = 1 - sm(t, VS[1] + 3.2, VS[1] + 3.8)
            text(c, "offline, on the phone" if off > 0.5 else "synced", 360, y + block_h(230) + 34, 28, AMBER if off > 0.5 else TEAL, a)
            go = sm(t, VS[1] + 3.8, VS[1] + 4.6)
        else:
            go = sm(t, VS[0] + 1.6 + i * 0.7, VS[0] + 2.3 + i * 0.7)
        arrow(c, 350, y + 90, 552, 450 + (i - 1) * 60, go, MUTE, a)
    g = sm(t, VS[0] + 0.3, VS[0] + 1.0); hot = t >= VS[2] and posted < 1
    box(c, 560, 300, 400, 300, g, TEAL if hot else LINE, (0.03, 0.10, 0.10) if hot else PANEL, 3 if hot else 2)
    text(c, "Reconcile", 760, 420, 44, INK, g, True, align="c"); text(c, "and post", 760, 472, 44, INK, g, True, align="c")
    text(c, "assessor's office", 760, 526, 28, TEAL if hot else MUTE, g, align="c")
    cylinder(c, 1100, 250, 340, 400, g)
    text(c, "Parcels", 1270, 452, 54, INK, g, True, align="c", fam="Inter Display")
    text(c, "source of record", 1270, 500, 30, TEAL, g, True, align="c")
    arrow(c, 960, 450, 1092, 450, posted, GREEN, 1.0, 4)
    fa = flag * (1 - sm(t, VS[3] + 0.2, VS[3] + 0.7))
    if fa > 0:
        box(c, 560, 660, 880, 96, fa, AMBER, (0.12, 0.09, 0.02))
        text(c, "Flagged: parcel 07-118-022 changed in two drafts", 590, 720, 32, AMBER, fa, True)
    pa = sm(t, VS[3] + 1.4, VS[3] + 2.0)
    if pa > 0:
        box(c, 560, 660, 880, 96, pa, GREEN, (0.03, 0.10, 0.05))
        text(c, "Posted: three drafts, one record", 590, 720, 32, GREEN, pa, True)
    da = sm(t, VS[0] + 1.2, VS[0] + 1.9)
    text(c, "Version", 1490, 320, 34, TEAL, da, True)
    for i, l in enumerate(["A private draft", "of the record."]): text(c, l, 1490, 372 + i * 42, 32, MUTE, da)
REVIEW = (V_DUR, scene_review, V_CAPS)

J_DUR, J_CAPS, JS = beats(["Each night a job asks the database one question:\nwhat was added, edited or deleted since the last run?",
                           "It checks those changes before anyone sees them. If a check\nfails, the run stops and yesterday's outputs stay live.",
                           "Then it sends only those 312 changes to the hosted layer.\nNothing is overwritten.",
                           "The same changes go into two files: one for analysts,\nand one for web maps outside ArcGIS."], (3.0, 3.0, 4.5, 3.0))
def scene_job(c, t):
    header(c, 7, "The nightly job", sm(t, 0.2, 0.9))
    grid_frame(c, sm(t, 0.3, 1.0))
    dots(c, (0.62, 0.68, 0.76), 0.6 * sm(t, 0.4, 1.4))
    found = sm(t, JS[0] + 0.8, JS[0] + 3.6); sent = sm(t, JS[2] + 0.5, JS[2] + 1.5)
    changed_dots(c, lerp_col(TEAL, GREEN, sent), int(CHANGED * found), 1.0, lerp(3.5, 4.5, sent))
    text(c, "The nightly job", RX, 215, 62, INK, 1, True, fam="Inter Display")
    text(c, "Runs at 2:00 am, after the day's edits.", RX, 270, 32, MUTE, sm(t, 0.5, 1.2))
    step = 1 if t < JS[1] else 2 if t < JS[2] else 3
    for n, lab in enumerate(["Find what changed.", "Check the changes.", "Publish only the changes."]):
        a = sm(t, 0.6 + n * 0.3, 1.2 + n * 0.3); y = 352 + n * 54; on = step == n + 1
        text(c, str(n + 1), RX, y, 34, TEAL if on else DIM, a, True); text(c, lab, RX + 40, y, 34, INK if on else DIM, a, on)
    c.move_to(RX, 500); c.line_to(RX + 860, 500); c.set_source_rgba(*LINE, 1); c.set_line_width(2); c.stroke()
    o1 = 1 - sm(t, JS[1] - 0.4, JS[1]); o2 = 1 - sm(t, JS[2] - 0.4, JS[2]); o3 = 1 - sm(t, JS[3] - 0.4, JS[3])
    if step == 1:
        a = sm(t, JS[0] + 0.6, JS[0] + 1.2) * o1
        w = digits(c, f"{int(CHANGED * found)}", RX - 3, 690, 120, TEAL, a)
        text(c, f"of {PARCELS:,} parcels changed", RX + w + 24, 650, 36, MUTE, a)
        text(c, "added, edited or deleted", RX + w + 24, 694, 28, DIM, a)
    elif step == 2:
        for i, (k, v) in enumerate([("Row counts", "nothing lost or doubled"), ("Shapes", "every parcel outline is valid"), ("Column names", "the same ones the apps expect")]):
            a = sm(t, JS[1] + 0.5 + i * 0.3, JS[1] + 1.1 + i * 0.3) * o2; y = 580 + i * 88
            text(c, k, RX, y, 38, INK, a, True); text(c, v, RX, y + 38, 28, MUTE, a)
            tick(c, RX + 830, y - 4, sm(t, JS[1] + 1.8 + i * 0.9, JS[1] + 2.3 + i * 0.9) * o2)
    else:
        b = (1 - sm(t, JS[3] - 0.4, JS[3])) if t < JS[3] else 0
        if b > 0:
            a = sm(t, JS[2] + 0.4, JS[2] + 1.0) * b; g = sm(t, JS[2] + 1.0, JS[2] + 2.4)
            text(c, "Overwrite", RX, 570, 30, MUTE, a); digits(c, f"{PARCELS:,}", RX + 860, 570, 34, CORAL, a, align="r")
            rrect(c, RX, 586, max(8, 860 * g), 52, 6); c.set_source_rgba(*CORAL, 0.9 * a); c.fill()
            a2 = sm(t, JS[2] + 2.6, JS[2] + 3.2) * b
            text(c, "Changes only", RX, 700, 30, MUTE, a2)
            rrect(c, RX, 716, 8, 52, 3); c.set_source_rgba(*GREEN, a2); c.fill()
            digits(c, f"{CHANGED}", RX + 30, 756, 44, GREEN, a2); text(c, "rows", RX + 130, 754, 32, GREEN, a2, True)
            text(c, f"{CHANGED} ÷ {PARCELS:,} = 0.6% of the rows", RX, 836, 32, INK, sm(t, JS[2] + 4.2, JS[2] + 4.9) * b)
        if t >= JS[3]:
            for i, (k, v, col) in enumerate([("Hosted layer", "for web maps in ArcGIS Online", GREEN),
                                             ("GeoParquet file", "one file analysts can query directly", TEAL),
                                             ("PMTiles file", "one file that other web maps can draw", TEAL)]):
                a = sm(t, JS[3] + 0.4 + i * 1.0, JS[3] + 1.0 + i * 1.0); y = 590 + i * 92
                c.new_path(); c.arc(RX + 12, y - 12, 9, 0, 2 * math.pi); c.set_source_rgba(*col, a); c.fill()
                text(c, k, RX + 40, y, 38, INK, a, True); text(c, v, RX + 40, y + 38, 28, MUTE, a)
JOB = (J_DUR, scene_job, J_CAPS)

R_DUR, R_CAPS, RS = beats(["Now every office reads from those outputs.\nNobody keeps a copy of their own.",
                           "The assessor splits a lot on Monday afternoon.\nBy Tuesday morning, all five maps show it."], (3.5, 6.0))
def scene_readers(c, t):
    header(c, 8, "Everyone reads the same map", sm(t, 0.2, 0.9))
    sp0 = RS[1] + 0.6; night = RS[1] + 3.0; land = RS[1] + 4.6
    for i, (lab, sub, x) in enumerate([("Source of record", "posted edits only", 250), ("Nightly job", "2:00 am", 770), ("Read-only outputs", "nobody edits these", 1290)]):
        a = sm(t, 0.5 + i * 0.7, 1.1 + i * 0.7)
        hot = (i == 0 and sp0 <= t < night) or (i == 1 and night <= t < land) or (i == 2 and t >= land)
        box(c, x, 150, 380, 120, a, TEAL if hot else LINE, (0.03, 0.10, 0.10) if hot else PANEL, 3 if hot else 2)
        text(c, lab, x + 190, 202, 36, INK, a, True, align="c"); text(c, sub, x + 190, 244, 28, TEAL if hot else MUTE, a, align="c")
        if i < 2: arrow(c, x + 380 + 14, 210, x + 520 - 14, 210, sm(t, 1.0 + i * 0.7, 1.6 + i * 0.7), MUTE, a)
    if sp0 <= t < night: tag(c, "Monday 2:14 pm: lot split", 440, 318, 28, TEAL, sm(t, sp0, sp0 + 0.5) * (1 - sm(t, night - 0.4, night)))
    bus = sm(t, 2.6, 3.4)
    if bus > 0:
        c.set_source_rgba(*MUTE, bus); c.set_line_width(3)
        c.move_to(1480, 270); c.line_to(1480, 350); c.move_to(MX + MW / 2, 350); c.line_to(MX + 4 * (MW + MG) + MW / 2, 350); c.stroke()
    split = sm(t, land, land + 0.9); did = t >= land
    for i, (name, *_r) in enumerate(OFFICES):
        x = MX + i * (MW + MG); a = sm(t, 3.0 + i * 0.35, 3.6 + i * 0.35)
        arrow(c, x + MW / 2, 350, x + MW / 2, 412, sm(t, 3.2 + i * 0.35, 3.8 + i * 0.35), MUTE, a)
        block(c, x, 420, MW, split=split, mark="ok" if did else None, a=a)
        text(c, name, x, 420 + block_h(MW) + 52, 34, INK, a, True)
        text(c, "shows the split" if did else "reads the outputs", x, 420 + block_h(MW) + 92, 28, GREEN if did else MUTE, a, did)
    if did:
        a = sm(t, land + 0.9, land + 1.5)
        text(c, "MAPS THAT SHOW THE SPLIT", W / 2 + 40, 836, 24, MUTE, a, True, align="r", track=3)
        w = digits(c, "5", W / 2 + 80, 848, 64, GREEN, a); text(c, "of 5", W / 2 + 80 + w + 18, 848, 40, MUTE, a)
READERS = (R_DUR, scene_readers, R_CAPS)

BA = [("Copies to keep in step", "5", "0"), ("Rows rewritten per refresh", f"{PARCELS:,}", f"{CHANGED}"), ("Places a parcel can be edited", "5", "1")]
B_DUR, B_CAPS, BS = beats(["Before: five copies and five refresh jobs.\nAfter: one source of record and one nightly job.",
                           "All five maps now show the same parcels,\nand each refresh moves 99 percent fewer rows."], (3.5, 1.0))
def scene_result(c, t):
    header(c, 9, "Before and after", sm(t, 0.2, 0.9))
    text(c, "Before and after", 130, 215, 62, INK, sm(t, 0.3, 1.0), True, fam="Inter Display")
    a0 = sm(t, 0.8, 1.5)
    text(c, "BEFORE", 1250, 300, 26, CORAL, a0, True, align="r", track=3); text(c, "AFTER", 1430, 300, 26, TEAL, a0, True, track=3)
    for i, (lab, b, af) in enumerate(BA):
        y = 430 + i * 160; a = sm(t, BS[0] + 0.5 + i * 1.3, BS[0] + 1.1 + i * 1.3); a2 = sm(t, BS[0] + 1.1 + i * 1.3, BS[0] + 1.7 + i * 1.3)
        text(c, lab, 130, y - 14, 42, INK, a)
        digits(c, b, 1250, y, 92, CORAL, a, align="r")
        arrow(c, 1290, y - 32, 1390, y - 32, a2, MUTE, a2, 4)
        digits(c, af, 1430, y, 92, TEAL, a2)
        if i < 2:
            c.move_to(130, y + 56); c.line_to(W - 130, y + 56); c.set_source_rgba(*LINE, a); c.set_line_width(2); c.stroke()
RESULT = (B_DUR, scene_result, B_CAPS)

def scene_closing(c, t):
    a = sm(t, 0.3, 1.2)
    text(c, "THE PROJECTION ROOM", W / 2, 400, 26, TEAL, a, True, align="c", track=4)
    text(c, "The Parcel Problem", W / 2, 540, 124, INK, a, True, align="c", fam="Inter Display")
    text(c, "One source of record. Every map reads the same parcels.", W / 2, 624, 40, MUTE, sm(t, 0.9, 1.8), align="c")
    text(c, "jacob-hogue.github.io/projection-room", W / 2, 720, 28, DIM, sm(t, 1.4, 2.2), align="c")
CLOSING = (4.6, scene_closing, [(0.5, 4.2, "That was the parcel problem. Thank you for watching.")])

SCENES = [TITLE, WHAT, COPIES, OVERWRITE, THREE, SOURCE, REVIEW, JOB, READERS, RESULT, CLOSING]

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
        picks = [(0, 3.0), (1, WS[0] + 6.0), (1, W_DUR - 1.5), (2, CS[1] + 4.0), (2, CS[2] + 9.0), (2, C_DUR - 1.5),
                 (3, OS[1] + 4.0), (3, OS[2] + 6.0), (3, O_DUR - 1.5), (4, T_DUR - 1.5), (5, SS[1] + 5.0), (5, S_DUR - 1.5),
                 (6, VS[1] + 5.5), (6, VS[2] + 5.0), (6, V_DUR - 1.5),
                 (7, JS[0] + 5.0), (7, JS[1] + 5.0), (7, JS[2] + 6.0), (7, J_DUR - 1.5), (8, RS[0] + 5.0), (8, R_DUR - 1.5),
                 (9, B_DUR - 1.5), (10, 3.0)]
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
