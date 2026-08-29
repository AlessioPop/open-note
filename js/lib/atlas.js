/* Open Note — lib/atlas.js
   the world, as numbers. Owes nothing to this app at all.

   Reads js/data/atlasworld.js once and hands back: the arcs as longitudes and
   latitudes, the rings that make the land, the internal borders, the capitals,
   and the projections that flatten any of it onto a square of world units.
   241 countries — every one there is, down to Nauru and the Vatican — because
   the table is Natural Earth's 50m tier simplified back down PER ARC by the
   smallest country using each arc. See tools/atlas/pack.py for why that is the
   only way to give Luxembourg a real border without putting it out of register
   with Germany.

   js/data/atlasdetail.js and js/data/atlasrelief.js are the two tiers on top of
   it, and both are OPTIONAL — everything here works with neither of them
   loaded. The first is rivers, lakes and five hundred cities that are not
   capitals; the second is a normalised height field.

   ONE MORE THING IS BUILT HERE THAN USED TO BE, and it is worth saying which:
   the world is now built per (projection, look, DETAIL STEP, WINDOW). A frame
   costs what is in it, and until those last two the map was handed the whole
   planet at its finest detail whatever it was showing — twenty-seven thousand
   points into a thousand pixels at arm's length, and the other ninety-nine
   hundredths of the world tessellated off the picture at an inch above
   Switzerland. Both steps are quantised so a gesture crosses a boundary a few
   times rather than sixty times a second, and between crossings the promise
   below holds exactly as it always did.

   The one decision everything else rests on: THE WORLD IS DRAWN ONCE AND THEN
   MOVED. Every path here is built in a fixed 4096-unit world square, never in
   the picture's own coordinates, so panning and zooming a map is one transform
   on one group rather than a rebuild — which is the whole of why it is smooth.
   The paths are memoised per projection and look, so the second map on a page
   and the hundredth repaint of the first cost nothing.

   Prefix `geo`. The item that uses all this is js/items/science/atlas.js. */

const GEO_W = 4096;                                // the world square, in world units
const GEO_ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-";
const GEO_MAXLAT = 85.0511287798066;               // where Mercator is cut off, as everyone cuts it

/* ---- the packed tables, opened once ---- */
const GEO_CODE = (() => { const m = {}; for(let i = 0; i < GEO_ALPHA.length; i++) m[GEO_ALPHA[i]] = i; return m; })();

/* one arc: an absolute quantised point and then deltas, zigzag base-64 varints */
function geoUnpackArc(s, sc, tr){
  const pts = [];
  let i = 0, x = 0, y = 0;
  while(i < s.length){
    const v = [0, 0];
    for(let k = 0; k < 2; k++){
      let u = 0, sh = 0, c;
      do { c = GEO_CODE[s[i++]]; u |= (c & 31) << sh; sh += 5; } while(c & 32);
      v[k] = (u & 1) ? ~(u >> 1) : (u >> 1);       /* un-zigzag */
    }
    x += v[0]; y += v[1];
    pts.push([tr[0] + sc[0] * x, tr[1] + sc[1] * y]);
  }
  return pts;
}
let GEO_ARCS = null;
function geoArcs(){
  if(GEO_ARCS) return GEO_ARCS;
  GEO_ARCS = GEO_WORLD.arcs.split(' ').map(s => geoUnpackArc(s, GEO_WORLD.sc, GEO_WORLD.tr));
  return GEO_ARCS;
}

/* ---- coarser copies of the world ----
   The table is the world at the detail its SMALLEST country needs, which is
   far more than a map at arm's length can show: 27,000 points into a picture a
   thousand pixels wide is twenty-seven points per pixel, every one of them
   tessellated on every frame for nothing. So the arcs are simplified again,
   in the browser, at three or four steps of slack, and the map draws whichever
   step matches the zoom. Douglas-Peucker keeps the ends of a run, and an arc's
   ends are the junctions countries meet at — so a coarse step is still in
   register with itself, exactly as the packer's own pass was. */
/* One step per step of zoom, until the table itself runs out of detail. The
   numbers are the size of a pixel in degrees at that zoom — 0.36° at arm's
   length, halving each time in — so a step never throws away anything the
   screen could have shown. The last is the table as it came. */
const GEO_LOD = [0.36, 0.18, 0.09, 0];
const GEO_LOD_MAX = GEO_LOD.length - 1;
function geoDP(pts, tol){
  const n = pts.length;
  if(n < 3 || !tol) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const st = [0, n - 1];
  while(st.length){
    const b = st.pop(), a = st.pop();
    if(b <= a + 1) continue;
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay;
    const L = dx * dx + dy * dy;
    let worst = -1, wi = -1;
    for(let i = a + 1; i < b; i++){
      const px = pts[i][0], py = pts[i][1];
      let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx - px, qy = ay + t * dy - py;
      const d = qx * qx + qy * qy;
      if(d > worst){ worst = d; wi = i; }
    }
    if(worst > tol * tol){ keep[wi] = 1; st.push(a, wi, wi, b); }
  }
  const out = [];
  for(let i = 0; i < n; i++) if(keep[i]) out.push(pts[i]);
  return out;
}
const GEO_SIMP = new Map();
function geoArcsAt(lod){
  if(lod == null || lod >= GEO_LOD_MAX) return geoArcs();
  let hit = GEO_SIMP.get(lod);
  if(hit) return hit;
  const tol = GEO_LOD[lod];
  hit = geoArcs().map(a => geoDP(a, tol));
  GEO_SIMP.set(lod, hit);
  return hit;
}
const geoIdx = s => s ? s.split(',').map(Number) : [];
const geoRings = s => s ? s.split(';').map(geoIdx) : [];

let GEO_CO = null;
/* every country as a name and the rings that fill it. A ring is a list of
   indices into the shared arcs, which is what lets a border be told from a
   coastline by counting who uses it — and, since every country in the table
   shares that one set of arcs, it is also what keeps them all in register with
   each other however finely any one of them is drawn. */
function geoCountries(){
  if(GEO_CO) return GEO_CO;
  GEO_CO = GEO_WORLD.co.split('|').map(rec => {
    const i = rec.indexOf(':');
    return { name: rec.slice(0, i), rings: geoRings(rec.slice(i + 1)) };
  });
  return GEO_CO;
}

/* ---- the tier above ----
   Rivers, lakes and cities, all of them absent-able: a build with only
   atlasworld.js in it draws the same world it always did. The runs are the
   same base-64 varint deltas the arcs are, on the same grid, so there is one
   decoder and not three. */
let GEO_DET = null;
function geoDetail(){
  if(GEO_DET) return GEO_DET;
  const D = typeof GEO_DETAIL === 'undefined' ? null : GEO_DETAIL;
  const runs = s => s ? s.split(' ').map(x => geoUnpackArc(x, [D.sc, D.sc], D.tr)) : [];
  /* one named feature can own several runs — a river forks, a lake has
     islands, an archipelago is thirty of them */
  const group = (rs, names, counts) => {
    if(!names) return [];
    const cs = counts.split(',').map(Number), out = [];
    let k = 0;
    names.split('|').forEach((n, i) => { out.push({ name: n, runs: rs.slice(k, k + cs[i]) }); k += cs[i]; });
    return out;
  };
  GEO_DET = D ? {
    rivers: group(runs(D.riv), D.rivn, D.rivc),
    lakes:  group(runs(D.lak), D.lakn, D.lakc),
    cities: D.cty.split('|').map((rec, i) => {
      const f = rec.split(',');
      return { name: f[0], of: f[1], lon: +f[2], lat: +f[3], pop: +f[4], rank: i };
    })
  } : { rivers: [], lakes: [], cities: [] };
  return GEO_DET;
}
/* the cities that are not capitals, biggest first — the same promise the
   capitals table makes, so "the first n" is always the n that matter */
const geoCities = () => geoDetail().cities;
const geoRivers = () => geoDetail().rivers;
const geoLakes = () => geoDetail().lakes;
let GEO_CAPS = null;
/* the capitals, biggest first — so "the first n" is always the n that matter */
function geoCapitals(){
  if(GEO_CAPS) return GEO_CAPS;
  GEO_CAPS = GEO_WORLD.cap.split('|').map((rec, i) => {
    const f = rec.split(',');
    return { name: f[0], of: f[1], lon: +f[2], lat: +f[3], pop: +f[4], rank: i };
  });
  return GEO_CAPS;
}

/* ---- projections ----
   Each flattens the globe onto a square GEO_W across, `h` tall. Add one here
   and it is offered everywhere a projection is chosen; nothing else knows the
   list exists. Both of these are separable — x from longitude alone, y from
   latitude alone — but nothing downstream assumes that. */
const GEO_PROJ = {
  equirect: {
    label: 'Flat', h: GEO_W / 2, wrap: GEO_W,
    fwd: (lon, lat) => [(lon + 180) / 360 * GEO_W, (90 - lat) / 360 * GEO_W],
    inv: (x, y) => [x / GEO_W * 360 - 180, 90 - y / GEO_W * 360]
  },
  mercator: {
    label: 'Mercator', h: GEO_W, wrap: GEO_W,
    fwd: (lon, lat) => {
      const p = Math.max(-GEO_MAXLAT, Math.min(GEO_MAXLAT, lat)) * Math.PI / 180;
      return [(lon + 180) / 360 * GEO_W,
              (Math.PI - Math.log(Math.tan(Math.PI / 4 + p / 2))) / (2 * Math.PI) * GEO_W];
    },
    inv: (x, y) => [x / GEO_W * 360 - 180,
                    (2 * Math.atan(Math.exp(Math.PI - y / GEO_W * 2 * Math.PI)) - Math.PI / 2) * 180 / Math.PI]
  }
};
const geoProj = name => GEO_PROJ[name] || GEO_PROJ.equirect;

/* ---- points to a path ----
   `smooth` runs a quadratic through the midpoints of the run, the way a coarse
   ring of samples is made round in items/shapes/solid.js. It is what lets one
   110m outline stand up to being magnified thirty times: the corners round off
   instead of turning into a polygon, and it reads as drawn rather than as
   coarse data. `crisp` is the same points, straight. */
/* Path coordinates are written to a tenth of a world unit — about 2.7 km,
   which is finer than anything a 110m outline knows and keeps the strings
   short. ONE PICTURE NEEDS MORE: a card of a country 700 m across magnifies it
   ten thousand times, and at a tenth of a unit the whole of the Vatican rounds
   onto one point and the shape disappears. geoCoPath raises this for the
   duration of one build; nothing else ever touches it. */
let GEO_PREC = 10;
const geoR = v => Math.round(v * GEO_PREC) / GEO_PREC;
const geoPt = p => geoR(p[0]) + ' ' + geoR(p[1]);
const geoMid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function geoRun(Q, smooth, close){
  const n = Q.length;
  if(n < 2) return '';
  if(smooth && n > 2){
    if(close){
      let d = 'M' + geoPt(geoMid(Q[n - 1], Q[0]));
      for(let i = 0; i < n; i++) d += 'Q' + geoPt(Q[i]) + ' ' + geoPt(geoMid(Q[i], Q[(i + 1) % n]));
      return d + 'Z';
    }
    let d = 'M' + geoPt(Q[0]);
    for(let i = 1; i < n - 1; i++)
      d += 'Q' + geoPt(Q[i]) + ' ' + geoPt(i === n - 2 ? Q[n - 1] : geoMid(Q[i], Q[i + 1]));
    return d;
  }
  return 'M' + Q.map(geoPt).join('L') + (close ? 'Z' : '');
}

/* an arc index the way TopoJSON writes it: ~i is that arc walked backwards */
function geoArcPts(i, P, lod){
  const back = i < 0, a = geoArcsAt(lod)[back ? ~i : i];
  const out = a.map(p => P.fwd(p[0], p[1]));
  return back ? out.reverse() : out;
}
/* ---- the seam down the back of the world ----
   Fiji, Eurasia and two Russian islands sit on both sides of the 180th
   meridian, and come out of the data as a run that leaps the whole width of
   the map — which is what a straight line right across an ocean is. Unrolling
   carries the longitude on past ±180 so the run is continuous again, and the
   run is then drawn a second time one world over, so the half that walked off
   one edge comes back on the other. Everything else has one run and no copy.

   `P.wrap` is the projection's period; a projection without one (a globe, one
   day) says nothing and gets its points back untouched. */
function geoUnroll(pts, W){
  const out = [pts[0]];
  let sh = 0;
  for(let i = 1; i < pts.length; i++){
    const dx = pts[i][0] + sh - out[i - 1][0];
    if(dx > W / 2) sh -= W; else if(dx < -W / 2) sh += W;
    out.push([pts[i][0] + sh, pts[i][1]]);
  }
  return out;
}
function geoRuns(pts, W){
  if(!W || pts.length < 2) return [pts];
  const u = geoUnroll(pts, W);
  let lo = Infinity, hi = -Infinity;
  for(const p of u){ if(p[0] < lo) lo = p[0]; if(p[0] > hi) hi = p[0]; }
  if(lo >= 0 && hi <= W) return [u];
  const runs = [u];
  if(lo < 0) runs.push(u.map(p => [p[0] + W, p[1]]));
  if(hi > W) runs.push(u.map(p => [p[0] - W, p[1]]));
  return runs;
}

/* a ring is its arcs strung end to end; the joint is one shared point, dropped */
function geoRingPts(ring, P, lod){
  const out = [];
  for(const i of ring){
    const seg = geoArcPts(i, P, lod);
    /* pushed, never concat'ed: Eurasia's ring is 101 arcs, and growing a new
       array for each of them is the whole build time spent copying */
    for(let k = out.length ? 1 : 0; k < seg.length; k++) out.push(seg[k]);
  }
  const n = out.length;
  if(n > 1 && out[0][0] === out[n - 1][0] && out[0][1] === out[n - 1][1]) out.pop();
  return out;
}

/* ---- the three pictures ----
   The world is still built once and then moved. What changed is that "once"
   now means once per (projection, look, LEVEL OF DETAIL, WINDOW), because a
   frame costs what is in it and neither of the last two used to be asked.

   A map at arm's length has the whole world in a thousand pixels and is handed
   twenty-seven points per pixel; a map an inch above Switzerland needs every
   one of those points and needs them only for Switzerland, while the other
   ninety-nine hundredths of the world is tessellated every frame, off the
   picture, for nothing. `lod` answers the first and `win` the second.

   BOTH ARE STEPPED, and that is what keeps the promise. `lod` is one of three
   fixed steps and `win` is snapped to a grid half a view across, so a pan or a
   zoom crosses a boundary a handful of times in a gesture rather than sixty
   times a second. Between crossings nothing is rebuilt and the frame is one
   transform, exactly as before.

   The expensive half — projecting every point and writing every run as a path
   string — is done once per (projection, look, lod) and kept as a table of
   runs with a box each. Windowing is then a box test and a join, which is
   cheap enough to do on the frame that crosses the boundary. */
const GEO_RUN_MEMO = new Map();                    // proj|look|lod → the run table
const GEO_RUN_KEEP = 6;                            // …of which this many are kept

/* ---- a filled ring, cut to the window ----
   Culling by box is enough for a coast or a border, because those are one arc
   each and there are two thousand of them. It is worth nothing at all for the
   LAND, which is one ring for the whole of Eurasia: its box meets every window
   there is, so an inch above Switzerland still tessellates Kamchatka.

   Sutherland-Hodgman against the four edges of the window fixes that, and a
   fill is the one thing it can be used on safely: it takes a closed ring and
   gives back a closed ring, and clipping every ring against the SAME rectangle
   leaves the even-odd count inside that rectangle exactly as it was — so the
   lakes and the holes still come out as holes. The window has a whole view of
   slack round the picture, so the straight runs it leaves along its own edges,
   and the smoothing that rounds them off, are never on screen. */
function geoClipEdge(pts, side, v){
  /* side: 0 x>=v, 1 x<=v, 2 y>=v, 3 y<=v */
  const inside = p => side === 0 ? p[0] >= v : side === 1 ? p[0] <= v
                    : side === 2 ? p[1] >= v : p[1] <= v;
  const cut = (a, b) => {
    const t = side < 2 ? (v - a[0]) / (b[0] - a[0]) : (v - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const out = [];
  for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const a = pts[j], b = pts[i], ia = inside(a), ib = inside(b);
    if(ib){ if(!ia) out.push(cut(a, b)); out.push(b); }
    else if(ia) out.push(cut(a, b));
  }
  return out;
}
function geoClipRing(pts, w){
  let q = geoClipEdge(pts, 0, w.x0);
  if(q.length) q = geoClipEdge(q, 1, w.x1);
  if(q.length) q = geoClipEdge(q, 2, w.y0);
  if(q.length) q = geoClipEdge(q, 3, w.y1);
  return q;
}
function geoRunBox(pts){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for(const p of pts){
    if(p[0] < x0) x0 = p[0]; if(p[0] > x1) x1 = p[0];
    if(p[1] < y0) y0 = p[1]; if(p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}
/* every run of the world as a path string and the box it lives in. `k` says
   which picture it belongs to: 0 land, 1 coast, 2 border. */
function geoRunTable(proj, look, lod){
  const key = proj + '|' + look + '|' + lod;
  let hit = GEO_RUN_MEMO.get(key);
  if(hit){                                          /* keep it, and keep it recent */
    GEO_RUN_MEMO.delete(key); GEO_RUN_MEMO.set(key, hit);
    return hit;
  }
  const P = geoProj(proj), sm = look !== 'crisp', W = P.wrap;
  const runs = [];
  const add = (pts, close, k) => {
    for(const q of geoRuns(pts, W)){
      const d = geoRun(q, sm, close);
      /* a filled ring keeps its points as well as its string: the string is
         what a window it lies wholly inside gets, and the points are what one
         it straddles is cut from */
      if(d) runs.push(close ? { d, k, b: geoRunBox(q), p: q } : { d, k, b: geoRunBox(q) });
    }
  };
  for(const r of geoRings(GEO_WORLD.land)) add(geoRingPts(r, P, lod), true, 0);
  for(const i of geoIdx(GEO_WORLD.coast)) add(geoArcPts(i, P, lod), false, 1);
  for(const i of geoIdx(GEO_WORLD.bord)) add(geoArcPts(i, P, lod), false, 2);
  hit = { runs, grat: geoGraticule(P, 30) };
  GEO_RUN_MEMO.set(key, hit);
  while(GEO_RUN_MEMO.size > GEO_RUN_KEEP) GEO_RUN_MEMO.delete(GEO_RUN_MEMO.keys().next().value);
  return hit;
}
/* the same world twice is the same object: a second map on a page, and every
   repaint of the first, must cost nothing at all. One slot per key, because
   the window it is for is the only window anyone is looking at. */
const GEO_MEMO = new Map();
function geoPaths(proj, look, lod, win){
  if(lod == null) lod = GEO_LOD_MAX;
  const key = proj + '|' + look + '|' + lod;
  const wk = win ? [win.x0, win.y0, win.x1, win.y1].join(',') : '';
  let hit = GEO_MEMO.get(key);
  if(hit && hit.wk === wk) return hit;
  const T = geoRunTable(proj, look, lod);
  /* WHAT IS FILLED AND WHAT IS DRAWN ARE TWO DIFFERENT PATHS, and that is not
     tidiness: a filled ring has to close, and Antarctica's closes straight
     across the bottom of the world. Fill the rings, ink the coast — the arcs
     that only one country owns, drawn as open runs — and that closing line has
     nowhere to appear. Holes and lakes come out right under fill-rule:evenodd,
     so no ring here has to be wound any particular way. */
  const sm = look !== 'crisp';
  const out = ['', '', ''];
  for(const r of T.runs){
    if(!win){ out[r.k] += r.d; continue; }
    if(r.b.x1 < win.x0 || r.b.x0 > win.x1 || r.b.y1 < win.y0 || r.b.y0 > win.y1) continue;
    if(!r.p || (r.b.x0 >= win.x0 && r.b.x1 <= win.x1 && r.b.y0 >= win.y0 && r.b.y1 <= win.y1)) {
      out[r.k] += r.d; continue;                    /* wholly inside, or not a fill */
    }
    const q = geoClipRing(r.p, win);
    if(q.length > 2) out[r.k] += geoRun(q, sm, true);
  }
  hit = { land: out[0], coast: out[1], bord: out[2], grat: T.grat, wk, lod };
  GEO_MEMO.set(key, hit);
  while(GEO_MEMO.size > GEO_RUN_KEEP) GEO_MEMO.delete(GEO_MEMO.keys().next().value);
  return hit;
}

/* meridians and parallels, sampled rather than drawn straight — these two
   projections would not need it, the next one will */
function geoGraticule(P, step){
  let d = '';
  for(let lon = -180; lon <= 180; lon += step){
    const pts = [];
    for(let lat = -90; lat <= 90; lat += 3) pts.push(P.fwd(lon, lat));
    d += geoRun(pts, false, false);
  }
  for(let lat = -90 + step; lat < 90; lat += step){
    const pts = [];
    for(let lon = -180; lon <= 180; lon += 5) pts.push(P.fwd(lon, lat));
    d += geoRun(pts, false, false);
  }
  return d;
}

/* ---- laying labels out ----
   Greedy, most important first: a label is placed if its box is clear of every
   box already down. Kept here rather than in the item because it is arithmetic
   over rectangles and the harness can drive it without a map. */
function geoFits(box, taken){
  for(const b of taken)
    if(box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h) return false;
  return true;
}
function geoLayout(cands, W, H, pad, seed){
  const taken = seed ? seed.slice() : [], out = [];
  pad = pad == null ? 0 : pad;
  for(const c of cands){
    const b = c.box;
    /* the WHOLE label has to be on the picture — half a name cut off by the
       edge of the map reads as a mistake, not as a map that carries on */
    if(b.x < pad || b.y < pad || b.x + b.w > W - pad || b.y + b.h > H - pad) continue;
    if(!geoFits(b, taken)) continue;
    taken.push(b); out.push(c);
  }
  return out;
}

/* ---- countries as shapes ----
   The rings in the table were enough to fill the land, and until now that is
   all anything asked of them. A country you can point at, shade, name and pull
   off the map needs four more things: one coordinate frame per country so that
   an insideness test means anything at all; a shape of its own to draw; the
   spot furthest inside it, to write its name at; and the biggest that name can
   be set without leaving the country.

   THE FRAME IS THE WHOLE TRICK, and it is the seam down the back of the world
   again in a different disguise. Fiji comes out of the data as two islands one
   on each side of the 180th meridian; Russia comes out as one ring that walks
   straight over it. geoUnroll makes a ring continuous again — but a ring is
   only continuous with ITSELF, so two rings of one country can end up a whole
   world apart, and an even-odd crossing count over rings in two frames is
   nonsense. So: unroll every ring, pull each one to within half a world of the
   first, and then slide the whole country back over the map if that left its
   middle off the edge. Everything below lives in that frame; the three shifts
   in geoCoAt are how a point in the picture finds its way into it. */
const GEO_CO_GEOM = new Map();                     // projection → one record per country
const geoMeanX = pts => { let s = 0; for(const p of pts) s += p[0]; return s / pts.length; };
/* Canada is a thousand points, and hunting for the middle of it walks every one
   of them four hundred times. The hunt does not need them: a coarse copy moves
   the answer by less than the search step, so the rings are thinned once here
   and the exact ones are kept for the two questions that really are exact —
   which country a click is in, and whether a name has left it. */
const GEO_THIN = 300;
function geoThin(rings){
  let n = 0;
  for(const r of rings) n += r.length;
  if(n <= GEO_THIN) return rings;
  const step = Math.ceil(n / GEO_THIN);
  return rings.map(r => {
    if(r.length <= 8) return r;
    const out = [];
    for(let i = 0; i < r.length; i += step) out.push(r[i]);
    return out.length > 2 ? out : r;
  });
}

function geoCoGeom(proj){
  let hit = GEO_CO_GEOM.get(proj);
  if(hit) return hit;
  const P = geoProj(proj), W = P.wrap;
  hit = geoCountries().map(c => {
    const rings = c.rings.map(r => geoRingPts(r, P))
      .map(pts => W && pts.length > 1 ? geoUnroll(pts, W) : pts)
      .filter(r => r.length > 2);
    if(W && rings.length > 1){                     /* every ring into the first one's frame */
      const ref = geoMeanX(rings[0]);
      for(let i = 1; i < rings.length; i++){
        const sh = Math.round((ref - geoMeanX(rings[i])) / W) * W;
        if(sh) rings[i] = rings[i].map(p => [p[0] + sh, p[1]]);
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const r of rings) for(const p of r){
      if(p[0] < x0) x0 = p[0]; if(p[0] > x1) x1 = p[0];
      if(p[1] < y0) y0 = p[1]; if(p[1] > y1) y1 = p[1];
    }
    if(W){                                          /* Fiji's middle sits off the right edge */
      const sh = -Math.floor(((x0 + x1) / 2) / W) * W;
      if(sh){ for(let i = 0; i < rings.length; i++) rings[i] = rings[i].map(p => [p[0] + sh, p[1]]);
              x0 += sh; x1 += sh; }
    }
    /* area only ever decides which of two countries a click belongs to, so the
       winding the rings happen to have does not matter — the magnitude does */
    let area = 0;
    for(const r of rings){
      let a = 0;
      for(let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
      area += Math.abs(a) / 2;
    }
    return { name: c.name, rings, simp: geoThin(rings), area, box: { x0, y0, x1, y1 } };
  });
  GEO_CO_GEOM.set(proj, hit);
  return hit;
}
const geoCoBox = (proj, i) => geoCoGeom(proj)[i].box;

/* ---- the part of a country you mean when you say its name ----
   France's box runs from French Guiana to Réunion, which is correct and is
   also the middle of the Atlantic. Nobody asking to be shown France means
   that. So: take the largest ring, and then everything near it — near being
   measured in that ring's own spans, so Japan keeps its islands and Indonesia
   keeps Papua, while Guiana, Réunion and the Canaries are left where they are.
   The full box is still what a click is tested against; this is what a map
   flies to, what a card is framed on, and what the shape in the hand is.
   Everything outside it is still THE COUNTRY — it is only not the picture. */
const GEO_CO_MAIN = new Map();
function geoCoMain(proj, i){
  const key = proj + '|' + i;
  let hit = GEO_CO_MAIN.get(key);
  if(hit) return hit;
  const g = geoCoGeom(proj)[i], boxes = g.rings.map(r => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, a = 0;
    for(let k = 0, j = r.length - 1; k < r.length; j = k++){
      const p = r[k];
      if(p[0] < x0) x0 = p[0]; if(p[0] > x1) x1 = p[0];
      if(p[1] < y0) y0 = p[1]; if(p[1] > y1) y1 = p[1];
      a += r[j][0] * p[1] - p[0] * r[j][1];
    }
    return { x0, y0, x1, y1, a: Math.abs(a) / 2, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  });
  let m = 0;
  for(let k = 1; k < boxes.length; k++) if(boxes[k].a > boxes[m].a) m = k;
  const main = boxes[m];
  const reach = Math.max((main.x1 - main.x0), (main.y1 - main.y0)) * 2.5 + 24;
  const keep = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  boxes.forEach((b, k) => {
    if(k !== m && Math.hypot(b.cx - main.cx, b.cy - main.cy) > reach) return;
    keep.push(k);
    if(b.x0 < x0) x0 = b.x0; if(b.x1 > x1) x1 = b.x1;
    if(b.y0 < y0) y0 = b.y0; if(b.y1 > y1) y1 = b.y1;
  });
  hit = { x0, y0, x1, y1, rings: keep };
  GEO_CO_MAIN.set(key, hit);
  return hit;
}

/* ---- who is where ----
   Even-odd, so a country with a hole in it (South Africa, with Lesotho cut out
   of it) answers no for a point in the hole with nothing here to say so. */
function geoInRings(rings, x, y){
  let inside = false;
  for(const r of rings)
    for(let i = 0, j = r.length - 1; i < r.length; j = i++){
      const a = r[i], b = r[j];
      if((a[1] > y) !== (b[1] > y) &&
         x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  return inside;
}
let GEO_CO_ORDER = null;
/* smallest first, so a click inside an enclave is the enclave and not the
   country wrapped round it */
function geoCoOrder(proj){
  if(GEO_CO_ORDER && GEO_CO_ORDER.proj === proj) return GEO_CO_ORDER.list;
  const g = geoCoGeom(proj);
  const list = g.map((c, i) => i).sort((a, b) => g[a].area - g[b].area);
  GEO_CO_ORDER = { proj, list };
  return list;
}
/* a point in world units → the country under it, or -1 for open water.

   `near` is a reach, in world units, and it is what makes Nauru clickable. A
   country smaller than the finger looking for it cannot be hit by landing ON
   it — there is no pixel of it to land on — so under that size it is hit by
   landing NEAR it instead. Only shapes smaller than the reach are eligible, so
   the reach can never steal a click from a country you really are inside. */
function geoCoAt(proj, x, y, near){
  const g = geoCoGeom(proj), W = geoProj(proj).wrap;
  const shifts = W ? [0, W, -W] : [0];
  for(const i of geoCoOrder(proj)){
    const c = g[i];
    for(const s of shifts){
      const px = x + s;
      if(px < c.box.x0 || px > c.box.x1 || y < c.box.y0 || y > c.box.y1) continue;
      if(geoInRings(c.rings, px, y)) return i;
    }
  }
  if(!near) return -1;
  let best = -1, bd = near * near;
  for(const t of geoTinyCountries(proj)){
    if(t.span > near) continue;
    for(const s of shifts){
      const dx = t.x - (x + s), dy = t.y - y, d = dx * dx + dy * dy;
      if(d < bd){ bd = d; best = t.i; }
    }
  }
  return best;
}
/* the countries small enough that at some zoom they are smaller than a full
   stop. Nothing is wrong with the outline — it is the right outline — but a
   country a fifth of a pixel across is not on the map in any sense that
   matters, and this is the list the map rings until they can stand alone. */
const GEO_TINY = new Map();
const GEO_TINY_SPAN = 44;                          // world units, about 4°
function geoTinyCountries(proj){
  let hit = GEO_TINY.get(proj);
  if(hit) return hit;
  hit = [];
  geoCoGeom(proj).forEach((c, i) => {
    const span = Math.max(c.box.x1 - c.box.x0, c.box.y1 - c.box.y0);
    if(span <= GEO_TINY_SPAN)
      hit.push({ i, span, x: (c.box.x0 + c.box.x1) / 2, y: (c.box.y0 + c.box.y1) / 2 });
  });
  GEO_TINY.set(proj, hit);
  return hit;
}

/* ---- one country's own outline ----
   Built the way geoPaths builds the world, out of the country's frame rings and
   through geoRuns, so Russia's eastern tip still comes back on the other edge. */
const GEO_CO_PATH = new Map();
function geoCoPath(proj, look, i, mainOnly){
  const key = proj + '|' + look + '|' + i + (mainOnly ? '|m' : '');
  let hit = GEO_CO_PATH.get(key);
  if(hit != null) return hit;
  const W = geoProj(proj).wrap, sm = look !== 'crisp';
  const g = geoCoGeom(proj)[i], rings = g.rings;
  const use = mainOnly ? geoCoMain(proj, i).rings.map(k => rings[k]) : rings;
  /* enough places to keep a hundred distinct points across the country,
     however small the country is */
  const span = Math.max(g.box.x1 - g.box.x0, g.box.y1 - g.box.y0, 1e-9);
  const was = GEO_PREC;
  GEO_PREC = Math.max(10, Math.pow(10, Math.ceil(Math.log10(100 / span))));
  hit = use.map(r => geoRuns(r, W).map(q => geoRun(q, sm, true)).join('')).join('');
  GEO_PREC = was;
  GEO_CO_PATH.set(key, hit);
  return hit;
}

/* ---- the spot furthest inside a country ----
   The pole of inaccessibility: a coarse grid over the box, then five rounds of
   closing in on the best cell. It is looked up once per country per projection
   and then remembered, because it is the only arithmetic here that is not
   cheap — and because the answer never changes. */
function geoSegDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}
/* how far the point is from the outline — positive inside it, negative out */
function geoRingsDist(rings, x, y){
  let d = Infinity;
  for(const r of rings)
    for(let i = 0, j = r.length - 1; i < r.length; j = i++){
      const t = geoSegDist(x, y, r[j][0], r[j][1], r[i][0], r[i][1]);
      if(t < d) d = t;
    }
  return geoInRings(rings, x, y) ? d : -d;
}
const GEO_CO_SPOT = new Map();
function geoCoSpot(proj, i){
  const key = proj + '|' + i;
  let hit = GEO_CO_SPOT.get(key);
  if(hit) return hit;
  const g = geoCoGeom(proj)[i], b = g.box, R = g.simp;
  const w = b.x1 - b.x0, h = b.y1 - b.y0, N = 18;
  let best = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, r: -Infinity };
  for(let a = 0; a < N; a++) for(let c = 0; c < N; c++){
    const x = b.x0 + w * (a + .5) / N, y = b.y0 + h * (c + .5) / N;
    const d = geoRingsDist(R, x, y);
    if(d > best.r) best = { x, y, r: d };
  }
  let step = Math.max(w, h) / N;
  for(let k = 0; k < 5; k++){
    step /= 2;
    for(let a = -1; a <= 1; a++) for(let c = -1; c <= 1; c++){
      if(!a && !c) continue;
      const x = best.x + a * step, y = best.y + c * step;
      const d = geoRingsDist(R, x, y);
      if(d > best.r) best = { x, y, r: d };
    }
  }
  GEO_CO_SPOT.set(key, best);
  return best;
}

/* ---- a name that fits inside the country ----
   The rule is the one an atlas keeps: a name belongs to the shape it is written
   on, and a name that reaches over a border is worse than no name. So the box
   the name would occupy is grown until an edge of the country cuts it, and the
   answer is a size in WORLD units — the label is drawn inside the group that
   moves, so it grows with the country and the rule holds at every zoom. */
const GEO_LBL_W = 0.47;                            // a condensed face, near enough
const GEO_LBL_H = 1.06;                            // one line to the next

function geoSegCross(ax, ay, bx, by, cx, cy, dx, dy){
  const s = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return s(ax, ay, bx, by, cx, cy) !== s(ax, ay, bx, by, dx, dy) &&
         s(cx, cy, dx, dy, ax, ay) !== s(cx, cy, dx, dy, bx, by);
}
/* is the rectangle clear of every edge? the caller has already put its middle
   inside, so an outline that never cuts it means the whole box is in */
function geoRectClear(rings, x0, y0, x1, y1){
  for(const r of rings)
    for(let i = 0, j = r.length - 1; i < r.length; j = i++){
      const ax = r[j][0], ay = r[j][1], bx = r[i][0], by = r[i][1];
      if(Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 ||
         Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
      if((ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) ||
         (bx >= x0 && bx <= x1 && by >= y0 && by <= y1)) return false;
      if(geoSegCross(ax, ay, bx, by, x0, y0, x1, y0) ||
         geoSegCross(ax, ay, bx, by, x1, y0, x1, y1) ||
         geoSegCross(ax, ay, bx, by, x1, y1, x0, y1) ||
         geoSegCross(ax, ay, bx, by, x0, y1, x0, y0)) return false;
    }
  return true;
}
/* the biggest font size whose box, centred on the spot, is still inside */
function geoFitFs(rings, x, y, hi, wPer, hPer){
  let lo = 0;
  for(let k = 0; k < 16; k++){
    const fs = (lo + hi) / 2, w = fs * wPer / 2, h = fs * hPer / 2;
    if(geoRectClear(rings, x - w, y - h, x + w, y + h)) lo = fs; else hi = fs;
  }
  return lo;
}
/* the name over one, two or three lines — a wide country wants one, a round
   one wants three, and whichever carries the bigger letter wins */
function geoSplitName(words, n){
  const per = words.join(' ').length / n, lines = [];
  let cur = '';
  for(const w of words){
    if(cur && cur.length + 1 + w.length > per && lines.length < n - 1){ lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  lines.push(cur);
  return lines;
}
const GEO_CO_LBL = new Map();
function geoCoLabel(proj, i){
  const key = proj + '|' + i;
  let hit = GEO_CO_LBL.get(key);
  if(hit) return hit;
  const g = geoCoGeom(proj)[i], sp = geoCoSpot(proj, i);
  const words = g.name.split(' ');
  const tries = [[g.name]];
  for(let n = 2; n <= Math.min(3, words.length); n++) tries.push(geoSplitName(words, n));
  const ceil = Math.max(g.box.x1 - g.box.x0, g.box.y1 - g.box.y0);
  let best = { fs: 0, lines: [g.name] };
  if(sp.r > 0) for(const lines of tries){
    const wPer = Math.max(...lines.map(t => t.length)) * GEO_LBL_W, hPer = lines.length * GEO_LBL_H;
    const fs = geoFitFs(g.rings, sp.x, sp.y, ceil / hPer, wPer, hPer);
    if(fs > best.fs) best = { fs, lines };
  }
  hit = { x: sp.x, y: sp.y, r: sp.r, fs: best.fs, lines: best.lines,
          w: Math.max(...best.lines.map(t => t.length)) * GEO_LBL_W * best.fs,
          h: best.lines.length * GEO_LBL_H * best.fs };
  GEO_CO_LBL.set(key, hit);
  return hit;
}

/* ---- looking a country up by name ----
   Natural Earth writes the short form and abbreviates it — "Dem. Rep. Congo",
   "Bosnia and Herz.", "Eq. Guinea" — and nobody types that. The aliases are
   what people actually write, including the longer names the capitals table
   uses for the same places, which is also how a country card finds its
   capital. Everything is matched on a folded key, so "Cote d'Ivoire" typed
   without the circumflex still lands on Côte d'Ivoire. */
const GEO_ALIAS = {
  'united states': 'United States of America', 'usa': 'United States of America',
  'us': 'United States of America', 'america': 'United States of America',
  'uk': 'United Kingdom', 'great britain': 'United Kingdom', 'britain': 'United Kingdom',
  'england': 'United Kingdom', 'scotland': 'United Kingdom', 'wales': 'United Kingdom',
  'holland': 'Netherlands', 'burma': 'Myanmar', 'czech republic': 'Czechia',
  'swaziland': 'eSwatini', 'ivory coast': "Côte d'Ivoire",
  'congo kinshasa': 'Dem. Rep. Congo', 'congo brazzaville': 'Congo',
  'democratic republic of the congo': 'Dem. Rep. Congo', 'drc': 'Dem. Rep. Congo',
  'zaire': 'Dem. Rep. Congo', 'republic of the congo': 'Congo',
  'dominican republic': 'Dominican Rep.', 'central african republic': 'Central African Rep.',
  'bosnia': 'Bosnia and Herz.', 'bosnia and herzegovina': 'Bosnia and Herz.',
  'north macedonia': 'Macedonia', 'guinea bissau': 'Guinea-Bissau',
  'east timor': 'Timor-Leste', 'the bahamas': 'Bahamas',
  'equatorial guinea': 'Eq. Guinea', 'solomon islands': 'Solomon Is.',
  'the gambia': 'Gambia', 'south sudan': 'S. Sudan', 'western sahara': 'W. Sahara',
  'falkland islands': 'Falkland Is.', 'northern cyprus': 'N. Cyprus',
  'south korea': 'South Korea', 'north korea': 'North Korea',
  'russian federation': 'Russia', 'persia': 'Iran', 'siam': 'Thailand',
  'ceylon': 'Sri Lanka', 'papua': 'Papua New Guinea', 'png': 'Papua New Guinea',
  'uae': 'United Arab Emirates', 'emirates': 'United Arab Emirates',
  'french southern and antarctic lands': 'Fr. S. Antarctic Lands'
};
const geoCoKey = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[.,'\u2019()\-]/g, ' ').replace(/\s+/g, ' ').trim();

let GEO_CO_NAME = null;
function geoCoNames(){
  if(GEO_CO_NAME) return GEO_CO_NAME;
  const by = new Map(), rows = [];
  geoCountries().forEach((c, i) => {
    by.set(geoCoKey(c.name), i);
    rows.push({ key: geoCoKey(c.name), name: c.name, i });
  });
  for(const a in GEO_ALIAS){
    const i = by.get(geoCoKey(GEO_ALIAS[a]));
    if(i == null) continue;
    const k = geoCoKey(a);
    if(!by.has(k)){ by.set(k, i); rows.push({ key: k, name: geoCountries()[i].name, i }); }
  }
  rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  GEO_CO_NAME = { by, rows };
  return GEO_CO_NAME;
}
/* a name → its number, or -1. Takes the app's own record, an alias, or the
   longer form the capitals table writes. */
function geoCoIndexOf(name){
  const k = geoCoKey(name);
  if(!k) return -1;
  const i = geoCoNames().by.get(k);
  return i == null ? -1 : i;
}
const geoCoName = i => { const c = geoCountries()[i]; return c ? c.name : ''; };
/* the countries a typed word could mean, best first: exact, then what starts
   with it, then what merely contains it. One row per country however many of
   its names matched. */
function geoFindCo(q, max){
  max = max || 9;
  const rows = geoCoNames().rows;
  q = geoCoKey(q);
  const out = [], seen = new Set();
  const take = r => { if(!seen.has(r.i) && out.length < max){ seen.add(r.i); out.push(r.i); } };
  if(!q){
    for(const r of rows) take(r);
    return out;
  }
  for(const r of rows) if(r.key === q) take(r);
  for(const r of rows) if(r.key.startsWith(q)) take(r);
  for(const r of rows) if(r.key.indexOf(q) > 0) take(r);
  return out;
}
/* the capitals of one country, biggest first — the capitals table writes some
   country names out in full where the outlines abbreviate them, so it is
   matched through the same aliases rather than by string equality */
function geoCoCapitals(i){
  return geoCapitals().filter(c => geoCoIndexOf(c.of) === i);
}

/* ---- rivers and lakes ----
   Built the same way the world is and kept the same way: one string per
   projection and look, so a map with rivers on costs a transform per frame
   like every other map. Rivers are open runs, lakes are closed ones — a lake
   is filled with the sea's own colour by whoever draws it, which is what makes
   it read as water rather than as a hole. */
const GEO_DET_MEMO = new Map(), GEO_DET_WIN = new Map();
/* the water, run by run with a box each — the same table the world keeps, for
   the same reason: a map an inch above Switzerland should not be drawing the
   Amazon */
function geoDetailRuns(proj, look, lod){
  const key = proj + '|' + look + '|' + lod;
  let hit = GEO_DET_MEMO.get(key);
  if(hit) return hit;
  const P = geoProj(proj), sm = look !== 'crisp', W = P.wrap;
  const tol = lod == null || lod >= GEO_LOD_MAX ? 0 : GEO_LOD[lod];
  const runs = [];
  const add = (list, close, k) => {
    for(const f of list) for(const r of f.runs){
      /* simplified in longitude and latitude, the same as the world's arcs —
         at arm's length a lake three pixels across is one point either way,
         and there are four hundred of them */
      const t = tol ? geoDP(r, tol) : r;
      if(t.length < 2) continue;
      for(const q of geoRuns(t.map(p => P.fwd(p[0], p[1])), W)){
        const d = geoRun(q, sm, close);
        if(d) runs.push({ d, k, b: geoRunBox(q) });
      }
    }
  };
  add(geoRivers(), false, 0);
  add(geoLakes(), true, 1);
  hit = runs;
  GEO_DET_MEMO.set(key, hit);
  while(GEO_DET_MEMO.size > GEO_RUN_KEEP) GEO_DET_MEMO.delete(GEO_DET_MEMO.keys().next().value);
  return hit;
}
function geoDetailPaths(proj, look, lod, win){
  const key = proj + '|' + look + '|' + lod;
  const wk = win ? [win.x0, win.y0, win.x1, win.y1].join(',') : '';
  let hit = GEO_DET_WIN.get(key);
  if(hit && hit.wk === wk) return hit;
  const out = ['', ''];
  for(const r of geoDetailRuns(proj, look, lod)){
    if(win && (r.b.x1 < win.x0 || r.b.x0 > win.x1 || r.b.y1 < win.y0 || r.b.y0 > win.y1)) continue;
    out[r.k] += r.d;
  }
  hit = { riv: out[0], lak: out[1], wk };
  GEO_DET_WIN.set(key, hit);
  while(GEO_DET_WIN.size > GEO_RUN_KEEP) GEO_DET_WIN.delete(GEO_DET_WIN.keys().next().value);
  return hit;
}

/* ---- the height field ----
   js/data/atlasrelief.js is 1080 × 540 normalised heights, run-length coded.
   What comes back here is one byte per cell; what the map does with it is the
   contouring below. Nothing in this file paints a pixel. */
let GEO_REL = null;
function geoRelief(){
  if(GEO_REL) return GEO_REL;
  const R = typeof GEO_RELIEF === 'undefined' ? null : GEO_RELIEF;
  if(!R) return (GEO_REL = { w: 0, h: 0, lv: 1, max: 1, g: new Uint8Array(0) });
  const g = new Uint8Array(R.w * R.h), s = R.g;
  let i = 0, k = 0;
  while(i < s.length && k < g.length){
    const v = GEO_CODE[s[i++]];
    g[k++] = v;
    if(i < s.length && s[i] === '-'){              /* "and n more of those" */
      i++;
      let u = 0, sh = 0, c;
      do { c = GEO_CODE[s[i++]]; u |= (c & 31) << sh; sh += 5; } while(c & 32);
      for(let j = 0; j < u && k < g.length; j++) g[k++] = v;
    }
  }
  GEO_REL = { w: R.w, h: R.h, lv: R.lv, max: R.max, g };
  return GEO_REL;
}
/* a cell back into metres — the scale is a square root, so this is where the
   squaring lives and nothing else has to know about it */
const geoHeightAt = (lon, lat) => {
  const R = geoRelief();
  if(!R.w) return 0;
  const x = Math.min(R.w - 1, Math.max(0, Math.floor((lon + 180) / 360 * R.w)));
  const y = Math.min(R.h - 1, Math.max(0, Math.floor((90 - lat) / 180 * R.h)));
  const v = R.g[y * R.w + x];
  return v ? R.max * Math.pow(v / R.lv, 2) : 0;
};
/* green lowland, yellow, brown, grey rock, snow — on the normalised value, so
   the ramp is stretched exactly where the square-root scale put the detail */
const GEO_TINT = [[0, 74, 127, 63], [.16, 123, 166, 79], [.32, 200, 197, 101],
                  [.48, 217, 167, 78], [.64, 179, 115, 58], [.78, 138, 90, 60],
                  [.90, 179, 168, 156], [1, 255, 255, 255]];
function geoTint(t){
  let i = 1;
  while(i < GEO_TINT.length - 1 && t > GEO_TINT[i][0]) i++;
  const a = GEO_TINT[i - 1], b = GEO_TINT[i];
  const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}
/* ---- and the height of the land, DRAWN ----
   A picture of a field is the obvious thing and it is the wrong thing. Stretch
   1080 cells across a world and go in thirty times and every cell is thirty
   pixels of soft blur beside a coastline that is still perfectly sharp; and
   the picture has to travel, at four hundred kilobytes, inside every export of
   every map that has it on.

   So the field is CONTOURED instead. Marching squares over the cells gives the
   closed line where the land crosses each of nine heights; the lines are
   filled lowest-first so each band paints over the one below it; and the whole
   thing is then the same kind of object as everything else on the map — paths
   in world units, smoothed through their midpoints like every other outline
   here, crisp at any magnification, culled by the same window, and a few tens
   of kilobytes rather than four hundred.

   It does not invent detail. The cells are still a third of a degree, and what
   the smoothing does to a contour is exactly what it does to a coastline: it
   draws the curve the samples imply instead of the staircase they spell. What
   changes is that the edge between two tints is now a line rather than a
   gradient across thirty pixels of nothing.

   THE COAST IS STILL NOT THE FIELD'S TO DRAW. A cell is 37 km and a coastline
   is finer, so the lowest band spills into the sea. The sea is painted back
   over it — one rectangle with the land path as a hole, under fill-rule
   evenodd — which costs one more fill of a path the map is drawing anyway, and
   is why nothing here needs a clip. */
const GEO_BANDS = [0.5, 6, 13, 20, 28, 36, 44, 52, 58];   // raw levels, lowest first
const GEO_STEP = [10, 5, 3, 1];                           // cells per sample, per lod
/* …and how many of the nine are worth drawing at that step. Nine tints over a
   world four hundred pixels wide is nine bands nobody can tell apart, at four
   times the cost of the five they could. */
const GEO_BAND_N = [4, 5, 6, 9];
const geoBandsAt = lod => {
  const n = GEO_BAND_N[Math.max(0, Math.min(GEO_BAND_N.length - 1, lod == null ? GEO_LOD_MAX : lod))];
  if(n >= GEO_BANDS.length) return GEO_BANDS;
  const out = [];
  for(let i = 0; i < n; i++) out.push(GEO_BANDS[Math.round(i * (GEO_BANDS.length - 1) / (n - 1))]);
  return out;
};

/* one closed contour at a time. The grid is padded with sea all round, so
   every line closes and there is no open end to reason about; the winding
   comes out of the case table, so a valley inside a plateau is a hole under
   fill-rule nonzero with nothing here to say so. */
const GEO_MS = [
  null, [3, 0], [0, 1], [3, 1], [1, 2], null, [0, 2], [3, 2],
  [2, 3], [2, 0], null, [2, 1], [1, 3], [1, 0], [0, 3], null
];
/* the two saddles, resolved by which way the middle of the cell leans */
const GEO_MS5 = [[3, 0], [1, 2]], GEO_MS5B = [[3, 2], [1, 0]];
const GEO_MSA = [[0, 1], [2, 3]], GEO_MSAB = [[0, 3], [2, 1]];

function geoContours(S, W, H, t){
  /* S is (W+2)×(H+2) with a ring of sea; edge keys are integers, so joining
     one segment to the next is a map lookup and not a search */
  const nx = W + 1, ny = H + 1;
  const hkey = (i, j) => j * nx + i;                       /* the top edge of cell i,j */
  const vkey = (i, j) => nx * (ny + 1) + j * (nx + 1) + i; /* its left edge */
  const next = new Map(), pt = new Map();
  const at = (i, j) => S[j * (W + 2) + i];
  const lerp = (a, b) => (t - a) / (b - a);
  for(let j = 0; j < H + 1; j++) for(let i = 0; i < W + 1; i++){
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const m = (a >= t ? 1 : 0) | (b >= t ? 2 : 0) | (c >= t ? 4 : 0) | (d >= t ? 8 : 0);
    if(m === 0 || m === 15) continue;
    let segs;
    if(m === 5) segs = (a + b + c + d) / 4 >= t ? GEO_MS5B : GEO_MS5;
    else if(m === 10) segs = (a + b + c + d) / 4 >= t ? GEO_MSAB : GEO_MSA;
    else segs = [GEO_MS[m]];
    /* 0 top, 1 right, 2 bottom, 3 left */
    const key = e => e === 0 ? hkey(i, j) : e === 1 ? vkey(i + 1, j)
                   : e === 2 ? hkey(i, j + 1) : vkey(i, j);
    const xy = e => e === 0 ? [i + lerp(a, b), j]
                  : e === 1 ? [i + 1, j + lerp(b, c)]
                  : e === 2 ? [i + lerp(d, c), j + 1] : [i, j + lerp(a, d)];
    for(const sg of segs){
      const ka = key(sg[0]), kb = key(sg[1]);
      pt.set(ka, xy(sg[0])); pt.set(kb, xy(sg[1]));
      next.set(ka, kb);
    }
  }
  const loops = [], seen = new Set();
  for(const start of next.keys()){
    if(seen.has(start)) continue;
    const ring = [];
    let k = start, guard = next.size + 2;
    while(k != null && !seen.has(k) && guard-- > 0){
      seen.add(k); ring.push(pt.get(k));
      k = next.get(k);
    }
    if(ring.length > 2) loops.push(ring);
  }
  return loops;
}

const GEO_BAND_MEMO = new Map();
/* the bands as {d, fill}, lowest first — paint them in order and each covers
   the one below it, which is what makes nine closed lines into a filled map */
function geoReliefBands(proj, look, lod, win){
  const R = geoRelief();
  if(!R.w) return [];
  const key = proj + '|' + look + '|' + lod + '|' + (win ? [win.x0, win.y0, win.x1, win.y1].join(',') : '');
  let hit = GEO_BAND_MEMO.get(key);
  if(hit) return hit;
  const P = geoProj(proj), sm = look !== 'crisp';
  const step = GEO_STEP[Math.max(0, Math.min(GEO_STEP.length - 1, lod == null ? GEO_LOD_MAX : lod))];
  /* which cells are worth looking at: the window, in the grid's own indices */
  let i0 = 0, i1 = R.w, j0 = 0, j1 = R.h;
  if(win){
    const lo0 = P.inv(win.x0, (win.y0 + win.y1) / 2)[0], lo1 = P.inv(win.x1, (win.y0 + win.y1) / 2)[0];
    const la0 = P.inv((win.x0 + win.x1) / 2, win.y0)[1], la1 = P.inv((win.x0 + win.x1) / 2, win.y1)[1];
    i0 = Math.max(0, Math.floor((Math.min(lo0, lo1) + 180) / 360 * R.w) - 2);
    i1 = Math.min(R.w, Math.ceil((Math.max(lo0, lo1) + 180) / 360 * R.w) + 2);
    j0 = Math.max(0, Math.floor((90 - Math.max(la0, la1)) / 180 * R.h) - 2);
    j1 = Math.min(R.h, Math.ceil((90 - Math.min(la0, la1)) / 180 * R.h) + 2);
  }
  const W = Math.max(1, Math.ceil((i1 - i0) / step)), H = Math.max(1, Math.ceil((j1 - j0) / step));
  const S = new Float32Array((W + 2) * (H + 2));           // a ring of sea round it
  for(let j = 0; j < H; j++){
    const sy = Math.min(R.h - 1, j0 + j * step) * R.w;
    for(let i = 0; i < W; i++)
      S[(j + 1) * (W + 2) + i + 1] = R.g[sy + Math.min(R.w - 1, i0 + i * step)];
  }
  /* a sample sits at the middle of its cell; these two put one back on the globe */
  const lonOf = gi => -180 + (i0 + (gi - 1) * step + 0.5) * 360 / R.w;
  const latOf = gj => 90 - (j0 + (gj - 1) * step + 0.5) * 180 / R.h;
  hit = [];
  for(const t of geoBandsAt(lod)){
    let d = '';
    for(const ring of geoContours(S, W, H, t)){
      const pts = ring.map(p => P.fwd(lonOf(p[0]), latOf(p[1])));
      d += geoRun(pts, sm, true);
    }
    if(d) hit.push({ d, fill: geoTintHex((t - 1) / (R.lv - 1)) });
  }
  GEO_BAND_MEMO.set(key, hit);
  while(GEO_BAND_MEMO.size > GEO_RUN_KEEP) GEO_BAND_MEMO.delete(GEO_BAND_MEMO.keys().next().value);
  return hit;
}
const geoHex = v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
const geoTintHex = t => { const c = geoTint(t); return '#' + geoHex(c[0]) + geoHex(c[1]) + geoHex(c[2]); };
