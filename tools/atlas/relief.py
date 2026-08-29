#!/usr/bin/env python3
"""Pack a global height field into js/data/atlasrelief.js.

Source — ETOPO20, the 20-arc-minute global relief grid, as it ships with
matplotlib-basemap (public domain, NOAA):
  https://raw.githubusercontent.com/matplotlib/basemap/master/doc/examples/etopo20data.gz
  https://raw.githubusercontent.com/matplotlib/basemap/master/doc/examples/etopo20lats.gz
  https://raw.githubusercontent.com/matplotlib/basemap/master/doc/examples/etopo20lons.gz

usage: relief.py <etopo20data.gz> <etopo20lats.gz> <etopo20lons.gz> <out.js>

WHY 20 ARC-MINUTES.  It is the resolution of the map it is drawn on. A cell is
a third of a degree, about 37 km at the equator, and a 110m Natural Earth
coastline puts its points about 10 km apart and simplifies away anything
smaller than a few tens of kilometres — so a finer height field would be
detail the outline beside it could not corroborate, and a coarser one would be
visibly blockier than the coast it fills. 1080 × 540 cells.

WHAT IS STORED IS NORMALISED, which is the whole point of it: every cell is a
height as a fraction of the highest cell there is, and `max` is what that
fraction is a fraction of. The fraction is held on a SQUARE-ROOT scale — six
bits spread evenly over 0..6229 m would put a hundred metres between one step
and the next, and almost all inhabited land is in the first two steps of that.
The root spends the levels where the land is. h = max * (v/lv)**2.

Sea is nought and nothing else is, so the ocean is one long run and the
run-length coding eats it whole: two thirds of the planet costs a few hundred
characters. What is left is one character per land cell.
"""
import gzip, sys, io

ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-"
ESC = ALPHA[63]                                     # "and n more of those"
LV = 62                                             # levels above sea: 1..62
W = 1080                                            # cells across, a third of a degree

def enc(u):
    s = ""
    while u >= 32:
        s += ALPHA[(u & 31) | 32]
        u >>= 5
    return s + ALPHA[u]

def read(path):
    return [float(x) for x in gzip.open(path, "rt").read().split()]

def main():
    d = read(sys.argv[1]); lats = read(sys.argv[2]); lons = read(sys.argv[3])
    out_path = sys.argv[4]
    sw, sh = len(lons), len(lats)
    assert sw * sh == len(d), "grid is not lats × lons"

    # ETOPO20 runs south to north and starts its longitudes at 20°E, carrying
    # on past 360 rather than wrapping. Both are put the way the map reads:
    # row 0 the north pole, column 0 the 180th meridian going east.
    lon0, dlon = lons[0], lons[1] - lons[0]
    col = []
    for c in range(W):
        lon = -180.0 + (c + 0.5) * 360.0 / W
        while lon < lon0 - dlon / 2:
            lon += 360.0
        col.append(min(sw - 1, max(0, int(round((lon - lon0) / dlon)))))

    H = sh
    hmax = max(d)
    vals = []
    for r in range(H):
        row = d[(H - 1 - r) * sw:(H - r) * sw]
        for c in range(W):
            h = row[col[c]]
            if h <= 0:
                vals.append(0)
            else:
                v = (h / hmax) ** 0.5
                vals.append(1 + min(LV - 1, int(round((LV - 1) * v))))

    out, i, n = [], 0, len(vals)
    while i < n:
        v = vals[i]; j = i + 1
        while j < n and vals[j] == v:
            j += 1
        out.append(ALPHA[v])
        if j - i > 1:
            out.append(ESC); out.append(enc(j - i - 1))
        i = j
    packed = "".join(out)

    land = sum(1 for v in vals if v)
    src = (
        "/* Open Note — data/atlasrelief.js\n"
        "   A global height field at 20 arc-minutes: %d × %d cells, row 0 the\n"
        "   north, column 0 the 180th meridian. ETOPO20 (NOAA, public domain).\n"
        "   Read by js/lib/atlas.js, and by nothing else: this file is a table,\n"
        "   not code.\n\n"
        "   Every cell is a NORMALISED height on a square-root scale: nought is\n"
        "   sea, and 1..%d stand for metres = max * (v/%d)**2. Run-length coded\n"
        "   over the same 64 characters the arcs use, '%s' meaning \"and n more\n"
        "   of those\" as a base-64 varint — which is how two thirds of the\n"
        "   planet, all of it sea, costs almost nothing.\n"
        "   Rebuilt by tools/atlas/relief.py. */\n"
        "const GEO_RELIEF = {\n"
        "  w: %d, h: %d, lv: %d, max: %.1f,\n"
        "  g: '%s'\n"
        "};\n"
    ) % (W, H, LV, LV, ESC, W, H, LV, hmax, packed)
    io.open(out_path, "w", encoding="utf-8").write(src)
    print("wrote %s  %.1f KB  (%d × %d cells, %d land, highest %.0f m)" %
          (out_path, len(src.encode()) / 1024, W, H, land, hmax))

main()
