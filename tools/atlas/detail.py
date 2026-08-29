#!/usr/bin/env python3
"""Pack Natural Earth 50m rivers, lakes and cities into js/data/atlasdetail.js.

Sources (public domain / CC0 — Natural Earth asks for no attribution):
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson

usage: detail.py <rivers.geojson> <lakes.geojson> <places.geojson> <out.js>

WHY 50m AND NOT 110m.  There are thirteen rivers and twenty-four lakes in the
110m tier — the Nile, the Amazon, Baikal and little else — which is too thin to
be worth a layer.  The 50m tier has 462 and 412.  Taken whole it is ten times
the size of the base map, so it is put through Douglas-Peucker at a tolerance
FINER than the 110m coastlines already are (0.04° ≈ 4 km, against a 110m
outline's ~10 km between points): nothing is lost that the map beside it could
have shown, and four fifths of the points go.  What comes out is packed exactly
the way the base map is, so js/lib/atlas.js reads both with one decoder.

The cities are the other half of the same idea.  The base map's 199 capitals
come from the 110m places; this adds the largest places that are NOT capitals,
so a map going in over Europe fills with Milan and Hamburg rather than stopping
at the capitals it started with.

"""
import json, sys, io, math

ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-"
SCALE = 0.0036000360003600037                       # the base map's own quantisation
TOL = 0.04                                          # Douglas-Peucker, in degrees
RIVER_RANK = 5                                      # Natural Earth's own idea of "major"
CITIES = 500

def enc(v):
    u = (-v * 2 - 1) if v < 0 else (v * 2)          # zigzag
    s = ""
    while u >= 32:
        s += ALPHA[(u & 31) | 32]
        u >>= 5
    return s + ALPHA[u]

def pack_run(pts, scale=SCALE):
    """one run of lon/lat, quantised onto a grid and delta'd"""
    out, px, py = [], 0, 0
    for lon, lat in pts:
        x = int(round((lon + 180) / scale))
        y = int(round((lat + 90) / scale))
        out.append(enc(x - px)); out.append(enc(y - py))
        px, py = x, y
    return "".join(out)

def jstr(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")

def dp(pts, tol):
    """Douglas-Peucker. Iterative, because a river can be a thousand points
       and Python's recursion limit is not the place to find that out."""
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

def runs_of(geom):
    """every run of a LineString, MultiLineString, Polygon or MultiPolygon"""
    if not geom:
        return []
    t, c = geom["type"], geom["coordinates"]
    if t == "LineString":
        return [c]
    if t in ("MultiLineString", "Polygon"):
        return list(c)
    if t == "MultiPolygon":
        return [r for poly in c for r in poly]
    return []

def clean(run):
    """to two dimensions, simplified, with the points that quantise onto each
       other dropped — a repeated point is a zero-length segment and ink"""
    pts = dp([(p[0], p[1]) for p in run], TOL)
    out = []
    for p in pts:
        q = (round(p[0] / SCALE), round(p[1] / SCALE))
        if not out or q != out[-1][1]:
            out.append((p, q))
    return [p for p, q in out]

def fold(s):
    """the same folding js/lib/atlas.js matches names on, so "Cote d\'Ivoire"
       at 10m and "Côte d\'Ivoire" at 110m are seen to be one country"""
    import unicodedata
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    for ch in ".,'\u2019()-\\":
        s = s.replace(ch, " ")
    return " ".join(s.lower().split())

def name_of(f):
    p = f["properties"]
    return (p.get("name") or p.get("name_en") or "").replace("|", "/").replace(";", " ")

def collect(features, want_area):
    """(packed runs, names, how many runs each feature owns)"""
    runs, names, counts = [], [], []
    for f in features:
        mine = [clean(r) for r in runs_of(f["geometry"])]
        mine = [r for r in mine if len(r) > 1]
        if not mine:
            continue
        runs.extend(mine)
        names.append(name_of(f))
        counts.append(len(mine))
    return runs, names, counts

def ring_area(r):
    a = 0.0
    for i in range(len(r)):
        x1, y1 = r[i - 1][0], r[i - 1][1]
        x2, y2 = r[i][0], r[i][1]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2

def main():
    rivers = json.load(io.open(sys.argv[1], encoding="utf-8"))["features"]
    lakes = json.load(io.open(sys.argv[2], encoding="utf-8"))["features"]
    places = json.load(io.open(sys.argv[3], encoding="utf-8"))["features"]
    out_path = sys.argv[4]

    rivers = [f for f in rivers if (f["properties"].get("scalerank") or 0) <= RIVER_RANK]
    # biggest lake first, so "the first n" is the n that matter — the same
    # promise the capitals table makes
    lakes.sort(key=lambda f: -max([ring_area(r) for r in runs_of(f["geometry"])] or [0]))

    rruns, rnames, rcounts = collect(rivers, False)
    lruns, lnames, lcounts = collect(lakes, True)

    caps = set()
    for f in places:
        if f["properties"]["adm0cap"]:
            caps.add(f["properties"]["nameascii"])
    city = [f["properties"] for f in places if not f["properties"]["adm0cap"]]
    city.sort(key=lambda p: -(p["pop_max"] or 0))
    city = city[:CITIES]
    cty = "|".join(
        "%s,%s,%.4f,%.4f,%d" % (
            (p["nameascii"] or p["name"]).replace("|", "/").replace(",", " "),
            (p["adm0name"] or "").replace("|", "/").replace(",", " "),
            p["longitude"], p["latitude"], p["pop_max"] or 0)
        for p in city)

    src = (
        "/* Open Note — data/atlasdetail.js\n"
        "   Natural Earth 50m, simplified to the 110m map's own detail:\n"
        "   %d rivers (%d points), %d lakes (%d points) and the %d largest\n"
        "   cities that are not capitals. Public domain (CC0). Read by\n"
        "   js/lib/atlas.js, and by nothing else: this is a table, not code.\n\n"
        "   `riv` and `lak` are runs of base-64 varint deltas on the same grid\n"
        "   the base map's arcs use, so one decoder reads both. `c` is how many\n"
        "   runs each named feature owns — a river forks, a lake has islands.\n"
        "   Rebuilt by tools/atlas/detail.py. */\n"
        "const GEO_DETAIL = {\n"
        "  sc: %r, tr: [-180, -90],\n"
        "  riv: '%s',\n"
        "  rivn: '%s',\n"
        "  rivc: '%s',\n"
        "  lak: '%s',\n"
        "  lakn: '%s',\n"
        "  lakc: '%s',\n"
        "  cty: '%s'\n"
        "};\n"
    ) % (len(rnames), sum(len(r) for r in rruns), len(lnames), sum(len(r) for r in lruns), len(city),
         SCALE,
         " ".join(pack_run(r) for r in rruns), jstr("|".join(rnames)),
         ",".join(str(c) for c in rcounts),
         " ".join(pack_run(r) for r in lruns), jstr("|".join(lnames)),
         ",".join(str(c) for c in lcounts),
         jstr(cty))
    io.open(out_path, "w", encoding="utf-8").write(src)
    print("wrote %s  %.1f KB  (%d rivers / %d pts, %d lakes / %d pts, %d cities)" %
          (out_path, len(src.encode()) / 1024, len(rnames), sum(len(r) for r in rruns),
           len(lnames), sum(len(r) for r in lruns), len(city)))

main()
