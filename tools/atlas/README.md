# The world, packed

`js/data/atlasworld.js` is built by `pack.py` from two public-domain files. It is
checked in, so this only has to be run again if the outlines or the capitals
should change.

    curl -sL -o countries-50m.json \
      https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
    curl -sL -o places-110m.geojson \
      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places_simple.geojson

    python3 pack.py countries-50m.json places-110m.geojson ../../js/data/atlasworld.js

Both sources are **Natural Earth**, which is in the public domain: no
attribution is required and no condition is placed on use. The first is the
50m countries as TopoJSON — 1959 arcs shared between the countries on either
side of them, which is what lets a border be told from a coastline by counting
who uses it. The second is the 110m populated places, of which the 199 with
`adm0cap = 1` are national capitals.

What comes out is 145 KB: the arcs as base-64 varints, the rings that make the
land, the arcs that are coast and the arcs that are border, 241 countries, and
the capitals sorted biggest first. `js/lib/atlas.js` is the only thing that
reads it.

## Why 50m simplified per arc, and not 110m as it comes

One tolerance for the whole planet is one tolerance too few. The 110m tier
gives Russia about the right number of points and gives **Luxembourg six** — a
hexagon thirty kilometres from the real border in places, which is a quarter of
the width of the country. And twenty-nine sovereign states are not in it at
all: Nauru, Monaco and the Vatican were never simplified away, they were never
there, because at 1:110,000,000 they are smaller than the pen.

So the tier below is taken and simplified back down **per arc**, with each
arc's tolerance set by the *smallest country that uses it* — a three-hundredth
of that country's own span, never coarser than the 110m tier already was.

**The arcs are shared, and that is the whole of why this works.**
Douglas-Peucker keeps the first and last point of a run, and an arc's ends are
the junctions where countries meet — so simplifying an arc in place moves both
countries either side of it identically, and the coastline, the borders and the
dissolved land all stay in register with each other by construction.
Simplifying one *country* instead is the thing that cannot be done: its
neighbour would keep the old line and the two would disagree by tens of
kilometres along a border they share.

145 KB against 53 KB, for 3.3× the points, every country on Earth, and no mixed
tiers anywhere. The map then draws whichever of four coarser copies matches the
zoom, so what it costs to paint is not what it costs to store — see
`docs/architecture.md` § *Maps, and the layer seam on them*.

## The tiers above it

Two more tables sit on top of the base map, and **both are optional** —
`js/lib/atlas.js` draws the same world it always did with neither of them
loaded.

    curl -sL -o ne_50m_rivers_lake_centerlines.geojson \
      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson
    curl -sL -o ne_50m_lakes.geojson \
      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
    curl -sL -o ne_50m_populated_places_simple.geojson \
      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson
  
    python3 detail.py ne_50m_rivers_lake_centerlines.geojson ne_50m_lakes.geojson \
      ne_50m_populated_places_simple.geojson ../../js/data/atlasdetail.js

75 KB: 254 rivers, 411 lakes and the 500 largest cities that are not capitals.
All Natural Earth, all public domain.

**Why these are simplified, when the base map is 50m too.** There are thirteen
rivers and twenty-four lakes in the 110m tier — the Nile, the Amazon, Baikal
and little else — which is too thin to be worth a layer, so they come from 50m
like everything else. Taken whole that is 45,000 points for water alone, so
they go through Douglas-Peucker at 0.04° ≈ 4 km, which is finer than the
coastlines beside them anywhere but the very smallest country. Nothing is lost that the map
could have shown, and four fifths of the points go.

    curl -sL -o etopo20data.gz https://raw.githubusercontent.com/matplotlib/basemap/master/doc/examples/etopo20data.gz
    curl -sL -o etopo20lats.gz https://raw.githubusercontent.com/matplotlib/basemap/master/doc/examples/etopo20lats.gz
    curl -sL -o etopo20lons.gz https://raw.githubusercontent.com/matplotlib/basemap/master/doc/examples/etopo20lons.gz

    python3 relief.py etopo20data.gz etopo20lats.gz etopo20lons.gz ../../js/data/atlasrelief.js

163 KB: a normalised global height field, 1080 × 540 cells. ETOPO20 is NOAA's
20-arc-minute global relief grid and is public domain; it ships with
matplotlib-basemap, which is where these three files come from.

**Why 20 arc-minutes.** It is the resolution of the map it is drawn on. A cell
is a third of a degree, about 37 km at the equator, and a 110m coastline puts
its points about 10 km apart and simplifies away anything smaller than a few
tens of kilometres — so a finer field would be detail the outline beside it
could not corroborate, and a coarser one would be visibly blockier than the
coast it fills.

The map **contours** this rather than drawing it as a picture — nine closed
lines, filled lowest first — so what ends up on the page is paths like every
other outline, crisp at any magnification and a few tens of kilobytes instead
of four hundred. See `docs/architecture.md`.

**What is stored is normalised**, which is the point of it: every cell is a
height as a fraction of the highest cell there is, held on a **square-root**
scale. Six bits spread evenly over 0–6229 m would put a hundred metres between
one step and the next, and almost all inhabited land is in the first two steps
of that; the root spends the levels where the land is. Sea is nought and
nothing else is, so the ocean is one long run and the run-length coding eats it
whole — two thirds of the planet costs a few hundred characters.
