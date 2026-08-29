#!/usr/bin/env python3
"""Pack Natural Earth into js/data/atlasworld.js.

Sources (both public domain / CC0 — Natural Earth asks for no attribution):
  https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places_simple.geojson

usage: pack.py <countries-50m.json> <ne_110m_populated_places_simple.geojson> <out.js>

WHY 50m, SIMPLIFIED, RATHER THAN 110m AS IT COMES.

The 110m tier is one tolerance for the whole planet, and a planet is not one
size. It gives Russia about the right number of points and it gives Luxembourg
SIX — a hexagon thirty kilometres away from the real border in places, which is
a quarter of the width of the country. Twenty-nine sovereign states it does not
contain at all: Nauru, Monaco, the Vatican are not simplified away, they were
never there, because at 1:110,000,000 they are smaller than the pen.

So the tier below is taken and simplified back down PER ARC, with each arc's
tolerance set by the SMALLEST country that uses it — a share of that country's
own span, never coarser than the 110m tier already was. Big countries keep
roughly the outline they had; small ones keep the detail they need; every
country is there.

THE ARCS ARE SHARED, AND THAT IS WHY THIS WORKS. Douglas-Peucker keeps the
first and last point of a run, and an arc's ends are the junctions where
countries meet — so simplifying an arc in place moves both countries either
side of it identically, and the coastline, the borders and the dissolved land
all stay in register with each other by construction. Simplifying one COUNTRY
instead of one ARC is the thing that cannot be done: its neighbour would keep
the old line and the two would disagree by tens of kilometres.

What comes out is 135 KB against the old 53 KB, for 3.3× the points, every
country on Earth, and no mixed tiers anywhere.
"""
import json, sys, io, math

ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-"
SPLIT = 300          # how many steps across its own span a country is allowed
FLOOR = 0.08         # …but never coarser than this, which is about the 110m tier
assert len(ALPHA) == 64 and len(set(ALPHA)) == 64

def enc(v):
    u = (-v * 2 - 1) if v < 0 else (v * 2)          # zigzag
    s = ""
    while u >= 32:
        s += ALPHA[(u & 31) | 32]
        u >>= 5
    return s + ALPHA[u]

def jstr(s):
    """safe inside a single-quoted JS string — Cote d'Ivoire is why"""
    return s.replace("\\", "\\\\").replace("'", "\\'")

def rings_of(geom):
    """every ring of a Polygon or MultiPolygon, flat — holes come out with the
       rest and are drawn with fill-rule:evenodd, which needs no winding"""
    if geom["type"] == "Polygon":
        return list(geom["arcs"])
    return [r for poly in geom["arcs"] for r in poly]

def dp(pts, tol):
    """Douglas-Peucker, iterative. The FIRST AND LAST POINT ARE ALWAYS KEPT,
       which is the whole reason this may be run on an arc: they are the
       junctions two countries share."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        worst, wi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            t = (((px - ax) * dx + (py - ay) * dy) / L) if L else 0.0
            t = 0.0 if t < 0 else 1.0 if t > 1 else t
            d = math.hypot(ax + t * dx - px, ay + t * dy - py)
            if d > worst:
                worst, wi = d, i
        if worst > tol:
            keep[wi] = True
            stack.append((a, wi)); stack.append((wi, b))
    return [p for p, k in zip(pts, keep) if k]

def main():
    topo = json.load(io.open(sys.argv[1], encoding="utf-8"))
    places = json.load(io.open(sys.argv[2], encoding="utf-8"))
    out_path = sys.argv[3]

    tr = topo["transform"]
    sc, tl = tr["scale"], tr["translate"]
    countries = topo["objects"]["countries"]["geometries"]
    land = topo["objects"]["land"]["geometries"][0]

    # the arcs come quantised and delta'd; undo both to simplify in degrees
    def deq(arc):
        x = y = 0
        out = []
        for dx, dy in arc:
            x += dx; y += dy
            out.append((tl[0] + sc[0] * x, tl[1] + sc[1] * y))
        return out
    A = [deq(a) for a in topo["arcs"]]

    # every country's span, in degrees — its own idea of how big it is
    span = []
    for c in countries:
        xs, ys = [], []
        for ring in rings_of(c):
            for ai in ring:
                for p in A[ai if ai >= 0 else ~ai]:
                    xs.append(p[0]); ys.append(p[1])
        span.append(max(max(xs) - min(xs), max(ys) - min(ys)) if xs else 1.0)

    # each arc takes the tolerance of the smallest country that uses it
    tol = [FLOOR] * len(A)
    for i, c in enumerate(countries):
        t = min(max(span[i] / SPLIT, 1e-5), FLOOR)
        for ring in rings_of(c):
            for ai in ring:
                j = ai if ai >= 0 else ~ai
                tol[j] = min(tol[j], t)

    # simplify, then put the points back on the source's own grid — the source
    # was already quantised onto it, so this loses nothing that DP had not
    packed, npts = [], 0
    for j, a in enumerate(A):
        q = []
        for lon, lat in dp(a, tol[j]):
            xy = (int(round((lon - tl[0]) / sc[0])), int(round((lat - tl[1]) / sc[1])))
            if not q or xy != q[-1]:
                q.append(xy)
        if len(q) < 2:
            q = q * 2 if q else [(0, 0), (0, 0)]
        npts += len(q)
        s, px, py = "", 0, 0
        for x, y in q:
            s += enc(x - px) + enc(y - py)
            px, py = x, y
        packed.append(s)

    # how many country rings use each arc: once is a coastline, twice a border
    use = [0] * len(A)
    for c in countries:
        for ring in rings_of(c):
            for a in ring:
                use[a if a >= 0 else ~a] += 1
    coast = [i for i, n in enumerate(use) if n <= 1]
    bord = [i for i, n in enumerate(use) if n > 1]

    co = "|".join(
        c["properties"]["name"].replace("|", "/").replace(":", " ") + ":" +
        ";".join(",".join(str(a) for a in ring) for ring in rings_of(c))
        for c in countries)

    caps = [f["properties"] for f in places["features"] if f["properties"]["adm0cap"] == 1]
    caps.sort(key=lambda p: -(p["pop_max"] or 0))
    cap = "|".join(
        "%s,%s,%.4f,%.4f,%d" % (
            p["name"].replace("|", "/").replace(",", " "),
            (p["adm0name"] or "").replace("|", "/").replace(",", " "),
            p["longitude"], p["latitude"], p["pop_max"] or 0)
        for p in caps)

    src = (
        "/* Open Note — data/atlasworld.js\n"
        "   Natural Earth 50m simplified per arc: %d countries, %d arcs,\n"
        "   %d points, %d capitals. Public domain (CC0) — Natural Earth asks\n"
        "   for no attribution and places no conditions on use. Read by\n"
        "   js/lib/atlas.js, and by nothing else: this file is a table, not code.\n\n"
        "   Each arc was simplified with the tolerance of the SMALLEST country\n"
        "   that uses it — a %dth of that country's own span, never coarser than\n"
        "   %.2f°. Because the arcs are shared and Douglas-Peucker keeps the ends,\n"
        "   both countries either side of a border moved identically and the\n"
        "   coast, the borders and the dissolved land are all still in register.\n\n"
        "   `arcs` is one base-64 varint stream per arc, space separated: an\n"
        "   absolute quantised x, y and then deltas, the way TopoJSON writes\n"
        "   them. `sc`/`tr` put those integers back on the globe. Rings are\n"
        "   lists of arc indices, ~i meaning that arc walked backwards.\n"
        "   Rebuilt by tools/atlas/pack.py. */\n"
        "const GEO_WORLD = {\n"
        "  sc: [%r, %r], tr: [%r, %r],\n"
        "  arcs: '%s',\n"
        "  land: '%s',\n"
        "  coast: '%s',\n"
        "  bord: '%s',\n"
        "  co: '%s',\n"
        "  cap: '%s'\n"
        "};\n"
    ) % (len(countries), len(A), npts, len(caps), SPLIT, FLOOR,
         sc[0], sc[1], tl[0], tl[1],
         jstr(" ".join(packed)),
         ";".join(",".join(str(a) for a in r) for r in rings_of(land)),
         ",".join(str(i) for i in coast),
         ",".join(str(i) for i in bord),
         jstr(co), jstr(cap))
    io.open(out_path, "w", encoding="utf-8").write(src)
    print("wrote %s  %.1f KB  (%d countries, %d arcs, %d points, %d capitals)" %
          (out_path, len(src.encode()) / 1024, len(countries), len(A), npts, len(caps)))

main()
