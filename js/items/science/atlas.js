/* Open Note — items/science/atlas.js
   a map of the world on the page */

/* ================= the atlas =================
   Natural Earth's outlines, drawn as one picture and then MOVED. A flat world
   is built once per projection and look (js/lib/atlas.js keeps the strings),
   and panning or zooming it sets one transform on one group — no path is
   rebuilt, no string is joined, nothing is measured. A turning globe projects
   the same source geometry into one canvas instead: no SVG markup is replaced
   during a gesture, and all visible layers stay attached to the sphere.

   The hand's own motion is js/lib/spring.js — the drag tracks one to one, the
   release keeps the velocity and glides, and the edges of the world push back
   and let go. Three springs (two for the centre, one for the zoom) share one
   requestAnimationFrame, so a fling and a zoom happening at once still paint
   once a frame.

   What is DRAWN on the map is a list of layers, and a layer is the seam this
   feature is built to be extended through: rivers, plates, routes, a shaded
   country, a pin someone dropped are each a defineMapLayer() in a file of
   their own, and appear in the panel and in the record with nothing here
   touched. See the note over defineMapLayer.

   The countries are the second half of the file. A tap picks the one under it
   and writes its name across it at whatever size fits inside its own borders;
   ⌕ walks the map to one by name and lights it; and a country PRESSED AND HELD
   comes up off the map into the hand, to be dropped on the page as a card of
   its own — the `country` item at the bottom, which is the same geometry drawn
   once at one country's own scale. The hold is what tells a country being
   picked up from a map being panned, and it is why neither one moves the other.

   Prefix `atl`. The geometry is js/lib/atlas.js (`geo`), the table is
   js/data/atlasworld.js. */

const ATL_W = 1000;                                // the picture is 1000 wide, like the ink and the plot
const ATL_ZMAX = 5;                                // 32× — as far as 110m outlines are worth pushing
const ATL_NMAX = Math.ceil(ATL_ZMAX);              // the most octaves a detail step may name
const ATL_HYST = 0.6;                              // how far past a boundary the zoom must be pushed to change step
const ATL_FADE = 260;                              // how long a rebuilt height layer takes to arrive, ms
const ATL_MOVE = new Set();                        // maps picked up to be moved about the page
const ATL_LIVE = new Map();                        // id → the springs and the view they drive. Never saved
const ATL_BLINK = 2600;                           // how long ⌕ keeps a country lit, ms
const ATL_HOLD = 330;                              // how long a country is held before it comes off the map, ms
let ATL_NEXT = null;                               // the country the next `country` item is of

/* Mercator unless the record says otherwise. A map made before this line said
   `equirect` in so many words and keeps it; one made since, and one made by a
   feature that never thought about the question, gets the projection every map
   on a screen is drawn in. */
const atlProj = it => it.proj || 'mercator';
const atlGlobe = it => atlProj(it) === 'globe';
const ATL_PROJECTIONS = ['equirect', 'mercator', 'azimuthal', 'globe'];
const CTRY_PROJECTIONS = ATL_PROJECTIONS.slice(0, -1);
const atlNextProjection = (name, modes) => modes[(modes.indexOf(name) + 1) % modes.length];
/* ---- the bar ----
   core builds every item the same toolbar: one glyph per button, in the mono
   face. A map's is dressed AFTER it is built — each glyph becomes a line icon
   with a short label under it, the way a toolbar on a Mac names its tools —
   and the glyph itself is kept on the button as `data-glyph`, so the harness
   and anything else that finds a button by what it said still can.

   IT IS DRESSED AGAIN WHENEVER CORE UNDRESSES IT. The page-layer button
   rewrites its own text on every click ('▤2', '▤3'…), which would wipe the
   icon out of it; a MutationObserver on the bar sees that and dresses the
   button afresh, reading the new number out of the new glyph. Dressing is
   idempotent — a button that already carries its icon is left alone — so the
   observer cannot set itself off.

   Three buttons say what they ARE rather than what they do: the projection
   button carries the current projection's name, the grain button the current
   grain, and the page layer its number. Destructive editing stays in the
   shared page controls rather than being repeated in this map-specific bar. */
const ATL_PROJ_SHORT = { equirect:'Flat', mercator:'Mercator', azimuthal:'Azimuthal', globe:'Globe' };
const ATL_TOOLS = {
  '◍': ['layers', 'Layers', 'layers', 0, 'menu'],
  '◐': ['style', '', 'palette', 0, 'menu'],
  '⌕': ['search', 'Search', 'search', 0, 'dialog'],
  '▣': ['pick', '', 'target', 1],
  '◎': ['projection', '', 'globe', 0, 'menu'],
  '⌂': ['home', 'Reset', 'reset'],
  '⤒': ['front', 'Forward', 'front', 1],
  '⤓': ['back', 'Backward', 'back']
};
function atlToolLabel(b, text){
  b.dataset.label = text;
  const lb = b.querySelector('.lb');
  if(lb && lb.textContent !== text) lb.textContent = text;
}
function atlToolbar(tb, it){
  for(const b of [...tb.querySelectorAll(':scope > button')]){
    if(b.querySelector('.ic')) continue;           /* already dressed */
    const glyph = b.dataset.glyph && !b.textContent.trim() ? b.dataset.glyph : b.textContent.trim();
    if(glyph === '✕'){ b.remove(); continue; }
    const m = glyph.indexOf('▤') === 0
      ? ['page-layer', 'Layer ' + glyph.slice(1), 'stack', 1] : ATL_TOOLS[glyph];
    if(!m) continue;
    const label = m[1] || (m[0] === 'pick' ? (atlTapCont(it) ? 'Continent' : 'Country')
                         : m[0] === 'style' ? atlStyleName(it)
                         : ATL_PROJ_SHORT[atlProj(it)] || 'Projection');
    b.dataset.glyph = glyph; b.dataset.tool = m[0];
    b.innerHTML = icn(m[2]) + '<span class="lb"></span>';
    atlToolLabel(b, label);
    b.setAttribute('aria-label', b.title || label);
    if(m[4]){ b.setAttribute('aria-haspopup', m[4]); b.setAttribute('aria-expanded', 'false'); }
    if(m[3] && !(b.previousElementSibling && b.previousElementSibling.classList.contains('atltoolsep'))){
      const s = document.createElement('i');
      s.className = 'atltoolsep'; s.setAttribute('aria-hidden', 'true');
      tb.insertBefore(s, b);
    }
  }
  if(!tb.__atlmo){
    tb.__atlmo = new MutationObserver(() => atlToolbar(tb, it));
    tb.__atlmo.observe(tb, { childList:true, subtree:true, characterData:true });
  }
}
defineIcon('layers', '<path d="M12 4.6l8 4.1-8 4.1-8-4.1z"/><path d="M4 12.9l8 4.1 8-4.1"/><path d="M4 16.4l8 4.1 8-4.1"/>');
defineIcon('palette', '<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8v16.4A8.2 8.2 0 0 0 12 3.8z" fill="currentColor" stroke="none"/>');
defineIcon('target', '<circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>' +
  '<path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3"/>');
defineIcon('reset', '<path d="M5.6 12.6A6.6 6.6 0 1 0 7.4 7.3"/><path d="M4.9 4.6v3.6h3.6"/>');
defineIcon('front', '<path d="M9.2 14.8H6.4a1.6 1.6 0 0 1-1.6-1.6V6.4a1.6 1.6 0 0 1 1.6-1.6h6.8a1.6 1.6 0 0 1 1.6 1.6v2.8"/>' +
  '<rect x="9.2" y="9.2" width="10" height="10" rx="1.6" fill="currentColor" stroke="none"/>');
defineIcon('back', '<rect x="4.8" y="4.8" width="10" height="10" rx="1.6" fill="currentColor" stroke="none"/>' +
  '<rect x="9.2" y="9.2" width="10" height="10" rx="1.6" fill="var(--atlbar,#1b2128)"/>');
defineIcon('stack', '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M4.5 10h15M4.5 14.5h15"/>');
/* A flat projection is a property of the item. The globe's projection is also
   a property of the live view because its centre moves under the hand. */
const atlVProj = (it, v) => (v && v.proj) || atlProj(it);
const atlPointOn = (v, p) => !v.globe || v.P.visible(p.lon, p.lat);

/* ---- what a tap picks ----
   A country, or the whole continent it is in. `it.tap` is 'cont' for the second
   and absent for the first, so a map made before there were continents on it
   goes on picking countries. Everything downstream of the tap is a REGION —
   `co:12` or `ct:2` — and from there on nothing in this file asks which kind it
   is: one shape, one name, one thing that comes off in the hand. */
const atlTapCont = it => it.tap === 'cont';
/* the region a country belongs to at this map's grain. '' where there is no
   answer at all: open water, or a country the continents table does not place. */
function atlRegOf(it, i){
  if(!(i >= 0)) return '';
  if(!atlTapCont(it)) return 'co:' + i;
  const c = geoContOf(i);
  return c < 0 ? '' : 'ct:' + c;
}

/* ---- the layers ----
   A layer says what it is called, when it is drawn, and either:

     world(ctx) → svg   drawn INSIDE the group that moves. Static geometry in
                        world units; `sw` is its stroke in picture units and is
                        divided by the zoom every frame, so a hairline stays a
                        hairline however far in you go.
     build(ctx) → svg   drawn in the group that does NOT move — labels, pins,
                        anything that should keep its size and its face.
     frame(g, ctx)      called once a frame for a build() layer, to put its
                        children where the view now is. Cheap DOM only: set a
                        transform, add a class. Never innerHTML.

   A layer may declare BOTH, and the picked country is why: its shade belongs
   in the world, where it is the country's own shape, and its name belongs in
   the world too — until the country is smaller than the letters, and then the
   name is the one thing that has to keep its size. One layer, one line in the
   panel, one entry in the record, two spaces to draw in.

   ctx is { it, view, paths } — the record, the geometry of the current view,
   and the built world paths. Order sorts them; `on` is whether a new map has
   it; `group` is the heading it is listed under in the Layers menu. Nothing
   in this file knows what a river is beyond this list.

   `sw` may also be answered per view as `swAt(view)`, for a layer whose ink
   is only worth its cost from some zoom in — see the lakes. */
const ATL_LAYERS = [];
const ATL_GROUPS = ['Land', 'Water', 'Places', 'Reference'];
function defineMapLayer(id, spec){
  ATL_LAYERS.push(Object.assign({ id, order: 50, on: 1, group: 'Land' }, spec));
  ATL_LAYERS.sort((a, b) => a.order - b.order);
}
/* absent means the layer's own default, so an old note gains a new layer and
   a note that has been fiddled with keeps what it was told */
const atlOn = (it, L) => { const o = it.on || {}; return o[L.id] == null ? !!L.on : !!o[L.id]; };

/* ---- latitude and longitude ----
   Meridians and parallels at a step that follows the zoom — 30° at the whole
   world, down to half a degree thirty times in — with the degrees written
   along the left and bottom edges of the picture. The step comes off the same
   sticky detail step the world is built at (atlN), so the lines are rebuilt
   exactly when the rest of the world is and never on a frame of their own.
   Only the lines within the window are made; at one degree that is the
   difference between a few hundred and thirty thousand points. */
const ATL_GSTEP = [30, 15, 5, 2, 1, 0.5];
const atlGStep = v => ATL_GSTEP[Math.min(ATL_GSTEP.length - 1, atlN(v))];
const atlDeg = (d, pos, neg) => {
  const a = Math.abs(d), t = Math.round(a * 10) / 10;
  return (Number.isInteger(t) ? t : t.toFixed(1)) + '°' + (d > 0 ? pos : d < 0 ? neg : '');
};
/* the run of one line, in longitude and latitude — a meridian or a parallel,
   sampled finely enough to bend through any projection here */
const ATL_GRUNS = new Map();
function atlGratRuns(step){
  let hit = ATL_GRUNS.get(step);
  if(hit) return hit;
  hit = { mer: [], par: [] };
  for(let lon = -180; lon < 180 - 1e-9; lon += step){
    const a = []; for(let lat = -90; lat <= 90 + 1e-9; lat += 2) a.push([lon, Math.min(90, lat)]);
    hit.mer.push(a);
  }
  for(let lat = -90 + step; lat < 90 - 1e-9; lat += step){
    const a = []; for(let lon = -180; lon <= 180 + 1e-9; lon += 2) a.push([Math.min(180, lon), lat]);
    hit.par.push(a);
  }
  ATL_GRUNS.set(step, hit);
  return hit;
}
/* the lon/lat rectangle a flat window covers, or the whole world */
function atlGratRange(P, w){
  if(!w || P.round) return { lon0: -180, lon1: 180, lat0: -90, lat1: 90 };
  const a = P.inv(w.x0, w.y1), b = P.inv(w.x1, w.y0);
  return { lon0: a[0], lon1: b[0], lat0: Math.max(-90, a[1]), lat1: Math.min(90, b[1]) };
}
defineMapLayer('grat', {
  label: 'Latitude & longitude', group: 'Reference', order: 20, on: 0, sw: 1.1,
  world(ctx){
    const it = ctx.it, v = ctx.view, P = v.P, W = P.wrap, sm = (it.look || 'smooth') !== 'crisp';
    const step = P.round ? Math.max(10, atlGStep(v)) : atlGStep(v);
    const w = atlWin(it, v), R = atlGratRange(P, w);
    let d = '';
    /* a window is in world units, and its longitudes may run past ±180 on a
       wrapping projection — so a line is tried in its own place and one world
       either side, exactly as a run is drawn by geoRuns */
    const put = (pts) => { for(const q of geoRuns(pts.map(p => P.fwd(p[0], p[1])), W)){
      if(w){ const b = geoRunBox(q); if(b.x1 < w.x0 || b.x0 > w.x1 || b.y1 < w.y0 || b.y0 > w.y1) continue; }
      d += geoRun(q, sm, false); } };
    const lo = Math.floor(R.lon0 / step) * step, hi = Math.ceil(R.lon1 / step) * step;
    for(let lon = lo; lon <= hi + 1e-9; lon += step){
      const L = geoLon(lon), a = [];
      const s0 = w ? Math.max(-90, Math.floor(R.lat0 / step) * step - step) : -90;
      const s1 = w ? Math.min(90, Math.ceil(R.lat1 / step) * step + step) : 90;
      for(let lat = s0; lat <= s1 + 1e-9; lat += Math.min(2, step / 2)) a.push([L, Math.min(90, lat)]);
      put(a);
    }
    const la0 = Math.max(-90 + step, Math.floor(R.lat0 / step) * step), la1 = Math.min(90 - step, Math.ceil(R.lat1 / step) * step);
    for(let lat = la0; lat <= la1 + 1e-9; lat += step){
      const a = [], x0 = w ? Math.floor(R.lon0 / step) * step - step : -180, x1 = w ? Math.ceil(R.lon1 / step) * step + step : 180;
      for(let lon = x0; lon <= x1 + 1e-9; lon += Math.min(2, step / 2)) a.push([lon, lat]);
      put(a);
    }
    return '<path class="atgrat" d="' + d + '"/>';
  },
  /* the degrees along the edges: a pool of text nodes the frame fills */
  build: () => { let h = ''; for(let i = 0; i < 64; i++) h += '<text class="atgl"></text>'; return h; },
  lay(ctx){
    const v = ctx.view, P = v.P;
    if(P.round || v.globe) return [];
    const step = atlGStep(v), out = [], k = v.k;
    const tl = P.inv(v.cx - ATL_W / (2 * k), v.cy - v.H / (2 * k));
    const br = P.inv(v.cx + ATL_W / (2 * k), v.cy + v.H / (2 * k));
    const lat0 = Math.ceil(Math.max(-90, br[1]) / step) * step, lat1 = Math.min(90, tl[1]);
    for(let lat = lat0; lat <= lat1 + 1e-9 && out.length < 32; lat += step){
      const y = (P.fwd(0, lat)[1] - v.cy) * k + v.H / 2;
      if(y < 14 || y > v.H - 18) continue;
      out.push({ text: atlDeg(lat, 'N', 'S'), x: 8, y: y - 4, anchor: 'start' });
    }
    const lon0 = Math.floor(tl[0] / step) * step - step, lon1 = Math.ceil(br[0] / step) * step + step;
    const seen = new Set();
    for(let lon = lon0; lon <= lon1 + 1e-9 && out.length < 64; lon += step){
      const L = Math.round(geoLon(lon) * 100) / 100;
      if(seen.has(L)) continue;
      let x = (P.fwd(L, 0)[0] - v.cx) * k + ATL_W / 2;
      if(P.wrap){ const w = P.wrap * k; while(x < -w / 2) x += w; while(x > ATL_W + w / 2) x -= w; }
      if(x < 24 || x > ATL_W - 24) continue;
      seen.add(L);
      out.push({ text: atlDeg(L, 'E', 'W'), x, y: v.H - 8, anchor: 'middle' });
    }
    return out;
  },
  frame(g, ctx){
    const set = this.lay(ctx), n = g.children.length;
    for(let i = 0; i < n; i++){
      const el = g.children[i], q = set[i];
      if(!q){ if(el.classList.contains('on')){ el.classList.remove('on'); el.textContent = ''; } continue; }
      if(el.textContent !== q.text) el.textContent = q.text;
      el.setAttribute('x', rd1(q.x)); el.setAttribute('y', rd1(q.y));
      if(el.getAttribute('text-anchor') !== q.anchor) el.setAttribute('text-anchor', q.anchor);
      el.classList.add('on');
    }
  }
});
defineMapLayer('land', {
  label: 'Land', order: 30, on: 1, sw: 0,
  world: ctx => '<path class="atland" d="' + ctx.paths.land + '"/>'
});
/* ---- every country its own colour ----
   The school-atlas convention: six tints and no two neighbours alike, decided
   once in the lib (geoCoTints) from who shares a border with whom. WHICH six
   is the style's business — a variable each, --atco0…5, so the same layer is
   pastel on Political, slate on Night and five blues on Blueprint. Off unless
   asked for; the Political style asks for it. */
defineMapLayer('polit', {
  label: 'Countries', order: 31, on: 0, sw: 0,
  world(ctx){
    const it = ctx.it, v = ctx.view, tint = geoCoTints();
    return geoPolPaths(atlVProj(it, v), it.look || 'smooth', atlLodV(it, v), atlWin(it, v)).list
      .map(p => '<path class="atco atco' + tint[p.i] + '" d="' + p.d + '"/>').join('');
  }
});
defineMapLayer('bord', {
  label: 'Borders', order: 40, on: 1, sw: 1.5,
  world: ctx => '<path class="atbord" d="' + ctx.paths.bord + '"/>'
});
/* ---- the height of the land ----
   Nine filled contours, lowest first, so each band covers the one under it —
   see geoReliefBands, which is where the field becomes lines. They are paths
   like everything else here: in world units, smoothed, crisp at any zoom, cut
   to the same window, and a few tens of kilobytes rather than the four hundred
   a picture of the same field costs every export that carries one.

   The sea is then painted back over the lowest band, because a cell is 37 km
   and a coastline is finer than that: one rectangle with the land as a hole,
   under fill-rule evenodd. It costs one more fill of a path the map is already
   drawing, and it is why nothing here needs a clip. */
defineMapLayer('relief', {
  label: 'Height', order: 32, on: 0, sw: 0,
  /* the only layer here that is arithmetic rather than lookup — a marching
     square per cell of the window, nine times over. `heavy` is what keeps that
     off the frames of a zoom, and `fade` is what keeps the answer, when it
     comes, from arriving as a blink. Both are read in atlReworld. */
  heavy: 1, fade: 1,
  world(ctx){
    const it = ctx.it, v = ctx.view, proj = atlVProj(it, v), look = it.look || 'smooth';
    const w = atlWin(it, v), lod = atlLodV(it, v);
    const bands = geoReliefBands(proj, look, lod, w);
    if(!bands.length) return '';
    const P = geoProj(proj);
    const r = w || { x0: 0, y0: 0, x1: GEO_W, y1: P.h };
    const box = 'M' + rd1(r.x0) + ' ' + rd1(r.y0) + 'H' + rd1(r.x1) +
                'V' + rd1(r.y1) + 'H' + rd1(r.x0) + 'Z';
    return bands.map(b => '<path fill="' + b.fill + '" d="' + b.d + '"/>').join('') +
      '<path class="atrelsea" d="' + box + ctx.paths.land + '"/>';
  }
});
/* a lake is a closed run filled with the sea's own colour — which is what
   makes it read as water and not as a hole cut in the paper.

   IT DOES NOT FADE, and that is the one layer here that says so on purpose. A
   fade means two copies of the picture and a transparency group animating over
   both — see atlSwap — and a lake is the one shape on the map that is filled
   AND inked, so a group over it is an offscreen buffer the size of the world.
   The bands earn that because nine filled contours all move at once; a lake at
   a finer step moves by less than a hairline, and the runs that come and go
   with the window come and go half a view outside the picture. There is
   nothing there to fade.

   AND IT IS NOT INKED UNTIL IT IS WORTH INKING. Stroking is the expensive
   half of drawing a path — a closed run is walked once to fill and once more,
   with joins, to outline — and at arm's length a lake is a few pixels of
   sea-coloured fill whose hairline round it adds nothing the eye can see. So
   the outline comes on a step and a half in, where a lake is a shape with a
   shore, and until then four hundred lakes cost one fill of one path. */
defineMapLayer('lakes', {
  label: 'Lakes', group: 'Water', order: 34, on: 1, sw: 1.2,
  swAt: v => v.z < 1.5 ? 0 : 1.2,
  world: ctx => '<path class="atlake" d="' +
    geoDetailPaths(atlVProj(ctx.it, ctx.view), ctx.it.look || 'smooth', atlLodV(ctx.it, ctx.view), atlWin(ctx.it, ctx.view)).lak + '"/>'
});
/* a finer step is a river with tributaries it did not have — which is a change
   worth fading in rather than cutting to, for the same reason the bands are */
defineMapLayer('rivers', {
  label: 'Rivers', group: 'Water', order: 36, on: 0, sw: 1.6, fade: 1,
  world: ctx => '<path class="atriver" d="' +
    geoDetailPaths(atlVProj(ctx.it, ctx.view), ctx.it.look || 'smooth', atlLodV(ctx.it, ctx.view), atlWin(ctx.it, ctx.view)).riv + '"/>'
});
/* the coast is inked separately from the land it fills — see the note over
   geoPaths: a filled ring has to close, and Antarctica's closes across the
   bottom of the world */
defineMapLayer('coast', {
  label: 'Coastline', order: 50, on: 1, sw: 2.4,
  world: ctx => '<path class="atcoast" d="' + ctx.paths.coast + '"/>'
});

/* ---- the seas and the oceans ----
   Names on the water, set the way an atlas sets them: the oceans in tracked
   capitals at the whole world, the seas in a lighter hand from a step in, the
   gulfs and straits from two. Each is a place and a zoom it earns its name at.
   They lay out FIRST among the names — before the capitals — so a capital that
   would land on "Mediterranean Sea" steps aside, and the water keeps its name. */
const ATL_SEAS = [
  ['Pacific Ocean', -155, -8, 0, 1], ['Pacific Ocean', 170, 30, 0.6, 1], ['Atlantic Ocean', -36, 26, 0, 1],
  ['Atlantic Ocean', -22, -22, 0.6, 1], ['Indian Ocean', 78, -22, 0, 1], ['Arctic Ocean', -30, 84, 0.6, 1],
  ['Southern Ocean', 70, -62, 0.4, 1],
  ['Mediterranean Sea', 16, 35, 1, 0], ['Caribbean Sea', -75, 15, 1, 0], ['Gulf of Mexico', -90, 25, 1, 0],
  ['Hudson Bay', -85, 60, 1, 0], ['North Sea', 3, 56.5, 1.4, 0], ['Baltic Sea', 19.5, 58, 1.4, 0],
  ['Black Sea', 34, 43.5, 1.4, 0], ['Caspian Sea', 51, 42, 1.4, 0], ['Red Sea', 38, 20, 1.4, 0],
  ['Arabian Sea', 63, 15, 1, 0], ['Bay of Bengal', 88, 14, 1, 0], ['South China Sea', 114, 13, 1, 0],
  ['East China Sea', 125, 29, 1.4, 0], ['Sea of Japan', 135, 40, 1.2, 0], ['Sea of Okhotsk', 150, 54, 1.2, 0],
  ['Bering Sea', -175, 58, 1, 0], ['Coral Sea', 152, -17, 1, 0], ['Tasman Sea', 160, -39, 1, 0],
  ['Gulf of Guinea', 2, 1.5, 1.2, 0], ['Mozambique Channel', 41, -19, 1.6, 0], ['Norwegian Sea', 3, 68, 1.2, 0],
  ['Barents Sea', 40, 74, 1.2, 0], ['Greenland Sea', -8, 76, 1.4, 0], ['Labrador Sea', -55, 58, 1.2, 0],
  ['Philippine Sea', 131, 18, 1.2, 0], ['Andaman Sea', 96, 11, 1.6, 0], ['Persian Gulf', 52, 27, 2, 0],
  ['Gulf of Aden', 48, 12.5, 2, 0], ['Adriatic Sea', 16.5, 43, 2, 0], ['Aegean Sea', 25, 38, 2, 0],
  ['Bay of Biscay', -4.5, 45.5, 2, 0], ['Irish Sea', -5, 53.7, 2.4, 0], ['English Channel', -2.5, 50, 2.6, 0],
  ['Gulf of Bothnia', 20, 62.5, 2, 0], ['Java Sea', 110, -5, 2, 0], ['Banda Sea', 127, -5.5, 2, 0],
  ['Timor Sea', 128, -11, 2, 0], ['Arafura Sea', 136, -9, 2, 0], ['Gulf of Carpentaria', 139, -14, 2, 0],
  ['Yellow Sea', 123.5, 36, 2, 0], ['Gulf of Thailand', 101.5, 10, 2, 0], ['Laccadive Sea', 73, 8, 2.2, 0],
  ['Gulf of Alaska', -146, 57, 1.5, 0], ['Beaufort Sea', -140, 72, 1.5, 0], ['Chukchi Sea', -170, 70, 2, 0],
  ['East Siberian Sea', 160, 73, 2, 0], ['Kara Sea', 70, 75, 2, 0], ['Laptev Sea', 125, 76, 2, 0],
  ['Baffin Bay', -68, 73, 1.5, 0], ['Sargasso Sea', -60, 28, 2, 0], ['Scotia Sea', -45, -57, 2, 0],
  ['Weddell Sea', -45, -73, 1.5, 0], ['Ross Sea', -175, -75, 1.5, 0], ['Gulf of California', -111, 27, 2, 0],
  ['Sulu Sea', 120, 8, 2.5, 0], ['Celebes Sea', 122, 3, 2.5, 0], ['Solomon Sea', 153, -8, 2.5, 0],
  ['Ligurian Sea', 9, 43.5, 3, 0], ['Tyrrhenian Sea', 12, 40, 2.5, 0], ['Ionian Sea', 19, 38, 2.5, 0],
  ['Sea of Azov', 36, 46, 2.5, 0], ['White Sea', 37, 65.5, 2.5, 0], ['Gulf of St. Lawrence', -62, 48, 2.5, 0],
  ['Bay of Fundy', -66, 45, 3, 0], ['Bristol Channel', -4.2, 51.4, 3.2, 0], ['Gulf of Finland', 26, 60, 2.6, 0],
  ['Strait of Gibraltar', -5.6, 35.95, 3.4, 0], ['Bosporus', 29.05, 41.1, 4.2, 0], ['Strait of Hormuz', 56.5, 26.6, 3.4, 0],
  ['Strait of Malacca', 100.5, 3.5, 2.8, 0], ['Bass Strait', 146, -39.7, 2.6, 0], ['Cook Strait', 174.5, -41.3, 3.4, 0],
  ['Great Australian Bight', 131, -34, 1.8, 0], ['Bay of Plenty', 177, -37.5, 3.4, 0], ['Gulf of Oman', 58.5, 24.5, 2.6, 0]
];
const ATL_SEAFS = [17, 26];                        /* a sea, and an ocean */
const ATL_SEAXY = new Map();
function atlSeaXY(proj){
  const P = geoProj(proj);
  let hit = P.globe ? null : ATL_SEAXY.get(proj);
  if(hit) return hit;
  hit = ATL_SEAS.map(t => P.fwd(t[1], t[2]));
  if(!P.globe) ATL_SEAXY.set(proj, hit);
  return hit;
}
function atlSeasLay(ctx){
  const v = ctx.view, xy = atlSeaXY(atlVProj(ctx.it, v)), cands = [];
  for(let i = 0; i < ATL_SEAS.length; i++){
    const t = ATL_SEAS[i];
    if(v.z < t[3]) continue;
    if(v.globe && !v.P.visible(t[1], t[2])) continue;
    const fs = ATL_SEAFS[t[4]], pad = fs * 6;
    const x = (xy[i][0] - v.cx) * v.k + ATL_W / 2;
    if(x < -pad || x > ATL_W + pad) continue;
    const y = (xy[i][1] - v.cy) * v.k + v.H / 2;
    if(y < -pad || y > v.H + pad) continue;
    const w = t[0].length * fs * (t[4] ? 0.72 : 0.5);
    cands.push({ i, x, y, fs, ocean: t[4], box: { x: x - w / 2, y: y - fs * 0.7, w, h: fs * 1.25 } });
  }
  const set = geoLayout(cands, ATL_W, v.H, 6, ctx.taken || atlNameBox(ctx.it, v) || []);
  ctx.taken = (ctx.taken || []).concat(set.map(c => c.box));
  return set;
}
defineMapLayer('seas', {
  label: 'Seas & oceans', group: 'Water', order: 58, on: 1,
  build(){
    return ATL_SEAS.map(t => '<text class="atsea' + (t[4] ? ' atocean' : '') + '">' + esc(t[0]) + '</text>').join('');
  },
  draw(c, ctx, C){
    for(const q of atlSeasLay(ctx)){
      const t = ATL_SEAS[q.i], text = q.ocean ? t[0].toUpperCase() : t[0];
      c.font = (q.ocean ? '500 ' : '500 ') + q.fs + 'px ' + C.disp;
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      if('letterSpacing' in c) c.letterSpacing = (q.ocean ? .22 : .1) * q.fs + 'px';
      c.globalAlpha = .85; c.lineJoin = 'round'; c.lineWidth = 2.5; c.strokeStyle = C.halo;
      c.strokeText(text, q.x, q.y + q.fs * .36);
      c.fillStyle = C.seaname; c.fillText(text, q.x, q.y + q.fs * .36);
      if('letterSpacing' in c) c.letterSpacing = '0px';
    }
  },
  frame(g, ctx){
    const on = new Set();
    for(const q of atlSeasLay(ctx)){
      on.add(q.i);
      const el = g.children[q.i];
      if(!el) continue;
      el.setAttribute('x', rd1(q.x)); el.setAttribute('y', rd1(q.y + q.fs * .36));
      el.classList.add('on');
    }
    if(g.__lit) for(const i of g.__lit) if(!on.has(i)) g.children[i].classList.remove('on');
    g.__lit = on;
  }
});

/* ---- the capitals ----
   Every capital is a node from the start and stays one: the frame moves them,
   shows the ones that fit and fades the rest away. Building them again on a
   pan is what would make the map stutter, and it is why they are not built
   there. How many are offered comes from the zoom; which of those are actually
   set comes from whether their box is clear, biggest city first. */
const ATL_FS = 25;                                 // label size, in picture units
const ATL_DOT = 5;
/* one table per projection, not one at a time: two maps of different
   projections on a page would otherwise each throw the other's out, and
   reproject 199 cities on every frame of both */
const ATL_CAPXY = new Map();
function atlCapXY(proj){
  const P = geoProj(proj);
  let hit = P.globe ? null : ATL_CAPXY.get(proj);
  if(hit) return hit;
  hit = geoCapitals().map(c => P.fwd(c.lon, c.lat));
  if(!P.globe) ATL_CAPXY.set(proj, hit);
  return hit;
}
/* how many are OFFERED at this zoom. It only has to be mean at arm's length,
   where a capital of eighty thousand people would otherwise fill an empty
   ocean; from about two steps in every capital is a candidate and it is the
   collision that decides, which is what makes a close-up of Europe fill up */
const atlCapCount = z => Math.min(geoCapitals().length, Math.round(10 * Math.pow(3, z)));

/* ---- two painters, one layout ----
   Every screen-space layer here is written twice over: once as nodes in the
   SVG, which is what a flat map, a print and an export are made of, and once
   as ink on the live globe's canvas. THE ARITHMETIC IS SHARED AND THE PAINTING
   IS NOT. `lay(ctx)` works out where the names go this frame and is the whole
   of what the two have in common; `frame(g, ctx)` puts nodes there and
   `draw(c, ctx, C)` writes them onto the canvas.

   The canvas half exists because a turning globe with its names in the SVG
   above it stuttered: every frame moved a few dozen text nodes over a picture
   that was itself a fresh raster, and an SVG is rasterised on the processor
   in Firefox — so each turn was one canvas paint and one repaint of a
   megapixel of transparent SVG for twenty labels. On the canvas the same
   twenty labels are twenty fillText calls on a frame already being painted,
   and the SVG is not touched at all while the globe moves. */
function atlInkName(c, C, text, x, y, fs, weight, flip, halo, alpha){
  c.font = weight + ' ' + fs + 'px ' + C.disp;
  c.textAlign = flip ? 'right' : 'left'; c.textBaseline = 'alphabetic';
  c.globalAlpha = alpha; c.lineJoin = 'round'; c.lineWidth = halo; c.strokeStyle = C.halo;
  c.strokeText(text, x, y);
  c.fillStyle = C.lbl; c.fillText(text, x, y);
}
function atlCapsLay(ctx){
    const v = ctx.view, xy = atlCapXY(atlVProj(ctx.it, v)), caps = geoCapitals();
    const n = atlCapCount(v.z), cands = [], pad = ATL_FS;
    for(let i = 0; i < n; i++){
      if(!atlPointOn(v, caps[i])) continue;
      const x = (xy[i][0] - v.cx) * v.k + ATL_W / 2;
      if(x < -pad || x > ATL_W + pad) continue;     /* nowhere near: not worth a box */
      const y = (xy[i][1] - v.cy) * v.k + v.H / 2;
      if(y < -pad || y > v.H + pad) continue;
      /* Barlow Condensed is narrow; this only has to be right enough to keep
         two names off each other, and measuring 199 of them a frame would not */
      const w = caps[i].name.length * ATL_FS * 0.46 + ATL_DOT + 9;
      const flip = x + w > ATL_W - 6;
      cands.push({ i, x, y, flip,
        box: { x: flip ? x - w : x - ATL_DOT, y: y - ATL_FS * 0.62, w: w + ATL_DOT, h: ATL_FS * 1.2 } });
    }
    /* the picked country's name is already down, and it is the one the reader
       asked for — so it is handed to the layout as a box that is taken, and a
       capital that would have landed on it steps aside instead */
    const seed = (ctx.taken || []).concat(atlNameBox(ctx.it, v) || []);
    const set = geoLayout(cands, ATL_W, v.H, 4, seed);
    /* WHAT THE CAPITALS TOOK IS LEFT ON ctx, and the cities read it. One ctx
       is made per frame and every screen-space layer is handed the same one,
       in layer order — so a layer that lays type out can tell the next one
       where not to put any. It is the only thing they share, and it is why a
       city name never lands on a capital's. */
    ctx.taken = seed.concat(set.map(c => c.box));
    return set;
}
defineMapLayer('caps', {
  label: 'Capitals', group: 'Places', order: 60, on: 1,
  build(){
    return geoCapitals().map(c =>
      '<g class="atcap"><circle class="atdot" r="' + ATL_DOT + '"/>' +
      '<text class="atname" x="' + (ATL_DOT + 5) + '" y="' + (ATL_FS * 0.36) + '">' +
      esc(c.name) + '</text></g>').join('');
  },
  draw(c, ctx, C){
    const caps = geoCapitals();
    for(const q of atlCapsLay(ctx)){
      c.globalAlpha = 1; c.beginPath(); c.arc(q.x, q.y, ATL_DOT, 0, Math.PI * 2);
      c.fillStyle = C.mark; c.fill(); c.lineWidth = 2; c.strokeStyle = C.halo; c.stroke();
      atlInkName(c, C, caps[q.i].name, q.x + (q.flip ? -(ATL_DOT + 5) : ATL_DOT + 5),
        q.y + ATL_FS * 0.36, ATL_FS, 600, q.flip, 5, 1);
    }
  },
  frame(g, ctx){
    const on = new Set(), set = atlCapsLay(ctx);
    for(const c of set){
      on.add(c.i);
      const el = g.children[c.i];
      if(!el) continue;
      el.setAttribute('transform', 'translate(' + rd1(c.x) + ' ' + rd1(c.y) + ')');
      const f = c.flip ? '1' : '0';
      if(el.dataset.f !== f){                      /* a name near the right edge reads inwards */
        el.dataset.f = f;
        const t = el.lastElementChild;
        t.setAttribute('x', c.flip ? -(ATL_DOT + 5) : (ATL_DOT + 5));
        t.setAttribute('text-anchor', c.flip ? 'end' : 'start');
      }
      el.classList.add('on');
    }
    /* only the ones that WERE set are put out — walking all 199 every frame is
       199 classList calls for nothing */
    if(g.__lit) for(const i of g.__lit) if(!on.has(i)) g.children[i].classList.remove('on');
    g.__lit = on;
  }
});



/* ---- the cities, and the countries too small to see ----
   The capitals were only ever the beginning of this: at arm's length a map
   wants ten names and going in it wants five hundred, and the mechanism that
   decides which is already written — every candidate is a node from the start,
   the frame moves them, and a name is set only if its box is clear. So the
   cities are the capitals again with two differences. They are smaller, because
   they are not capitals. And they lay out AFTER the capitals, against the boxes
   the capitals took (ctx.taken), so a capital never loses its name to a bigger
   city beside it — which is the one thing that would make the map wrong rather
   than merely crowded. */
const ATL_CFS = ATL_FS * 0.78;
const ATL_CDOT = 3.4;
const ATL_CITYXY = new Map();
function atlCityXY(proj){
  const P = geoProj(proj);
  let hit = P.globe ? null : ATL_CITYXY.get(proj);
  if(hit) return hit;
  hit = geoCities().map(c => P.fwd(c.lon, c.lat));
  if(!P.globe) ATL_CITYXY.set(proj, hit);
  return hit;
}
/* nothing at all until the map is a step and a bit in — a world map with five
   hundred cities on it is not a map, it is a list */
const atlCityCount = z => z < 1.2 ? 0
  : Math.min(geoCities().length, Math.round(10 * Math.pow(3.1, z - 1.2)));

function atlCitiesLay(ctx){
    const v = ctx.view, cs = geoCities();
    const n = atlCityCount(v.z);
    let set = [];
    if(n){
      const xy = atlCityXY(atlVProj(ctx.it, v)), cands = [], pad = ATL_CFS;
      for(let i = 0; i < n; i++){
        if(!atlPointOn(v, cs[i])) continue;
        const x = (xy[i][0] - v.cx) * v.k + ATL_W / 2;
        if(x < -pad || x > ATL_W + pad) continue;
        const y = (xy[i][1] - v.cy) * v.k + v.H / 2;
        if(y < -pad || y > v.H + pad) continue;
        const w = cs[i].name.length * ATL_CFS * 0.46 + ATL_CDOT + 8;
        const flip = x + w > ATL_W - 6;
        cands.push({ i, x, y, flip,
          box: { x: flip ? x - w : x - ATL_CDOT, y: y - ATL_CFS * 0.62, w: w + ATL_CDOT, h: ATL_CFS * 1.2 } });
      }
      set = geoLayout(cands, ATL_W, v.H, 4, ctx.taken || atlNameBox(ctx.it, v) || []);
      ctx.taken = (ctx.taken || []).concat(set.map(c => c.box));
    }
    return set;
}
defineMapLayer('cities', {
  label: 'Cities', group: 'Places', order: 65, on: 1,
  build(){
    return geoCities().map(c =>
      '<g class="atcity"><circle class="atcdot" r="' + ATL_CDOT + '"/>' +
      '<text class="atcname" x="' + (ATL_CDOT + 4) + '" y="' + rd1(ATL_CFS * 0.36) + '">' +
      esc(c.name) + '</text></g>').join('');
  },
  draw(c, ctx, C){
    const cs = geoCities();
    for(const q of atlCitiesLay(ctx)){
      c.globalAlpha = .75; c.beginPath(); c.arc(q.x, q.y, ATL_CDOT, 0, Math.PI * 2);
      c.lineWidth = 1.6; c.strokeStyle = C.lbl; c.stroke();
      atlInkName(c, C, cs[q.i].name, q.x + (q.flip ? -(ATL_CDOT + 4) : ATL_CDOT + 4),
        q.y + ATL_CFS * 0.36, ATL_CFS, 500, q.flip, 3.5, .82);
    }
  },
  frame(g, ctx){
    const on = new Set();
    for(const c of atlCitiesLay(ctx)){
      on.add(c.i);
      const el = g.children[c.i];
      if(!el) continue;
      el.setAttribute('transform', 'translate(' + rd1(c.x) + ' ' + rd1(c.y) + ')');
      const f = c.flip ? '1' : '0';
      if(el.dataset.f !== f){
        el.dataset.f = f;
        const t = el.lastElementChild;
        t.setAttribute('x', c.flip ? -(ATL_CDOT + 4) : (ATL_CDOT + 4));
        t.setAttribute('text-anchor', c.flip ? 'end' : 'start');
      }
      el.classList.add('on');
    }
    if(g.__lit) for(const i of g.__lit) if(!on.has(i)) g.children[i].classList.remove('on');
    g.__lit = on;
  }
});

/* ---- and a ring round the ones the pen is bigger than ----
   Nauru is twenty-one square kilometres. At the whole world it is a fifth of a
   pixel, and at every zoom this map offers it is smaller than the smallest
   thing a reader can aim at — so it is drawn, correctly, and is still not
   THERE. The ring is the atlas's own answer to that: a mark that keeps its
   size while the country grows underneath it, and fades out the moment the
   country is big enough to stand on its own. geoCoAt's `near` is the other
   half — the ring you can see is the ring you can hit. */
const ATL_TINY = 6.5;                              // when a country is smaller than this, ring it
/* A globe keeps a stable set of marker nodes while it turns. Their geographic
   anchors come from the flat projection and are projected afresh each frame;
   otherwise the near-horizon foreshortening would change the list itself and
   make one country's node become another country's marker mid-gesture. */
function atlTinyList(it, v){
  const proj = atlVProj(it, v);
  if(!v.globe) return geoTinyCountries(proj);
  const E = geoProj('equirect');
  return geoTinyCountries('equirect').map(t => {
    const ll = E.inv(t.x, t.y), q = v.P.fwd(ll[0], ll[1]);
    return { i:t.i, span:t.span * 1.5, x:q[0], y:q[1], on:v.P.visible(ll[0], ll[1]) };
  });
}
/* THE RING YOU CAN SEE IS THE RING YOU CAN HIT. A country smaller than the
   marker standing for it cannot be found by testing polygons — there is no
   pixel of San Marino to land on at any zoom — so the marker is hit-tested
   instead, in picture units, exactly where it was drawn and only while it is
   shown. It is asked BEFORE the polygons, and it is the only thing that may
   overrule them: clicking the ring means the ring, even though Italy is under
   it, and clicking ten pixels away means Italy. */
function atlRingAt(it, v, q){
  const list = atlTinyList(it, v);
  let best = -1, bd = ATL_TINY * ATL_TINY;
  for(const t of list){
    if(t.on === false) continue;
    if(t.span * v.k > ATL_TINY * 2) continue;      /* big enough now: not a ring */
    const dx = (t.x - v.cx) * v.k + ATL_W / 2 - q[0];
    const dy = (t.y - v.cy) * v.k + v.H / 2 - q[1];
    const d = dx * dx + dy * dy;
    if(d < bd){ bd = d; best = t.i; }
  }
  return best;
}
function atlTinyLay(ctx){
  const v = ctx.view, list = atlTinyList(ctx.it, v), pad = ATL_TINY * 2, out = [];
  for(let k = 0; k < list.length; k++){
    const t = list[k];
    if(t.on === false) continue;
    if(t.span * v.k > ATL_TINY * 2) continue;       /* big enough now: it speaks for itself */
    const x = (t.x - v.cx) * v.k + ATL_W / 2;
    if(x < -pad || x > ATL_W + pad) continue;
    const y = (t.y - v.cy) * v.k + v.H / 2;
    if(y < -pad || y > v.H + pad) continue;
    out.push({ k, x, y });
  }
  return out;
}
defineMapLayer('tiny', {
  label: 'Small countries', group: 'Places', order: 66, on: 1,
  build(ctx){
    return atlTinyList(ctx.it, ctx.view)
      .map(() => '<g class="attiny"><circle r="' + ATL_TINY + '"/></g>').join('');
  },
  draw(c, ctx, C){
    c.globalAlpha = .55; c.lineWidth = 1.5; c.strokeStyle = C.mark;
    for(const q of atlTinyLay(ctx)){ c.beginPath(); c.arc(q.x, q.y, ATL_TINY, 0, Math.PI * 2); c.stroke(); }
  },
  frame(g, ctx){
    const on = new Set();
    for(const q of atlTinyLay(ctx)){
      const el = g.children[q.k];
      if(!el) continue;
      el.setAttribute('transform', 'translate(' + rd1(q.x) + ' ' + rd1(q.y) + ')');
      el.classList.add('on');
      on.add(q.k);
    }
    if(g.__lit) for(const k of g.__lit) if(!on.has(k)) g.children[k].classList.remove('on');
    g.__lit = on;
  }
});

/* ---- the country you picked ----
   A tap picks the country under it; ⌕ picks one by name. Either way what is
   remembered is `it.sel`, and what draws it is one more layer — so it turns off
   with the others, prints with the rest, and travels in a backup with nothing
   here to arrange.

   The name is drawn INSIDE the group that moves, in world units, and that is
   the whole reason it behaves. geoCoLabel sizes it so that its box is wholly
   inside the country's own outline — never over a border into the next country
   — and a size in world units keeps that true at every zoom there is, because
   the name and the country are magnified by the same number. It is also why a
   very small country's name is very small: it is the country that is small,
   and going in makes both of them readable together.

   `it.sel` is the country's NAME and not its number. tools/atlas/pack.py can
   renumber the table the day Natural Earth changes, and a number would move a
   reader's pin from Chad to Kenya without a word. */
const atlSel = it => (it.sel ? geoRegKeyOf(it.sel) : '');
let ATL_PICKL = null;
const atlPickLayer = () => ATL_PICKL ||
  (ATL_PICKL = ATL_LAYERS.find(L => L.id === 'pick'));
function atlGlobeLabel(v, key){
  if(!v.globe || !key) return null;
  const E = geoProj('equirect'), lb = geoRegLabel('equirect', key);
  if(!lb) return null;
  const ll = E.inv(lb.x, lb.y);
  if(!v.P.visible(ll[0], ll[1])) return null;
  const q = v.P.fwd(ll[0], ll[1]);
  return { x:q[0], y:q[1] };
}
/* the label the capitals have to keep off, in picture units — nothing at all
   unless a country really is picked and the layer that draws it is on */
function atlNameBox(it, v){
  if(!it.sel || !atlOn(it, atlPickLayer())) return null;
  const k = atlSel(it);
  if(!k) return null;
  if(v.globe){
    const a = atlGlobeLabel(v, k);
    if(!a) return null;
    const name = geoRegName(k), w = name.length * ATL_FS * .5 + ATL_TINY + 12;
    return [{ x:(a.x - v.cx) * v.k + ATL_W / 2 - ATL_TINY,
              y:(a.y - v.cy) * v.k + v.H / 2 - ATL_FS * .62,
              w, h:ATL_FS * 1.2 }];
  }
  const lb = geoRegLabel(atlProj(it), k);
  if(!(lb.fs > 0)) return null;
  const w = lb.w * v.k, h = lb.h * v.k;
  return [{ x: (lb.x - v.cx) * v.k + ATL_W / 2 - w / 2,
            y: (lb.y - v.cy) * v.k + v.H / 2 - h / 2, w, h }];
}
/* the halo the name is read through, as a fraction of its own size. It is a
   stroke width in WORLD units set on the element itself: the group's own
   stroke-width is the outline's, and an attribute here beats the one inherited
   from it — see the note in atlPaint about why neither may be a stylesheet
   rule. Thin: it is there to lift the letters off a border or a river, not to
   punch a white slab out of the map. */
const ATL_HALO = 0.07;
/* WHERE TRACKED TYPE ACTUALLY SITS, which is not where it is asked to.
   text-anchor:middle centres the ADVANCE of the line, and letter-spacing adds
   one more space AFTER the last letter — so the ink of a tracked line stands
   half a space to the left of the spot it was centred on. At the tracking an
   atlas uses that is a tenth of the letter height and it reads as a name that
   has slipped off its country. Half a space back is the whole of the fix. */
const atlNameX = fs => fs * GEO_LBL_TRK / 2;
/* one country's name as lines of type, centred on the spot geoCoLabel found —
   horizontally by the line above, vertically on half a cap height, which is
   exactly the middle of a line of capitals and is why the name is set in them.
   A block of n lines is centred by its middle line, not by its first. */
function atlNameSVG(lb, r){
  if(!lb || !(lb.fs > 0)) return '';
  r = r || rd1;                                    /* a card writes at the country's own scale */
  const n = lb.lines.length, fs = lb.fs, x = r(lb.x + atlNameX(fs));
  return '<text class="atconame" x="' + x + '" y="' + r(lb.y) + '" font-size="' + r(fs) +
    '" stroke-width="' + r(fs * ATL_HALO) + '">' +
    lb.lines.map((t, k) => '<tspan x="' + x + '" dy="' +
      r(k ? fs * GEO_LBL_H : fs * (GEO_LBL_MID - (n - 1) * GEO_LBL_H / 2)) + '">' + esc(t) + '</tspan>').join('') +
    '</text>';
}
/* the smallest name worth writing on the country itself. Below this a country
   could not show its own name at the FURTHEST this map ever goes in — Monaco's
   would be a pixel and a half at 32× — so it is not written there at all, and
   the frame writes it beside the country instead, at reading size. */
const ATL_LBL_MIN = 9 / (ATL_W / GEO_W * Math.pow(2, ATL_ZMAX));
const atlOnShape = lb => !!lb && lb.fs >= ATL_LBL_MIN;

defineMapLayer('pick', {
  label: 'Picked place', group: 'Places', order: 70, on: 1, sw: 2.6,
  world(ctx){
    const it = ctx.it, v = ctx.view, k = atlSel(it), proj = atlVProj(it, v);
    if(!k) return '';
    const lb = v.globe ? null : geoRegLabel(proj, k);
    return '<path class="atpick" d="' + geoRegPath(proj, it.look || 'smooth', k) + '"/>' +
      (lb && atlOnShape(lb) ? atlNameSVG(lb) : '');
  },
  build: () => '<g class="atcap atpickn"><text class="atname" x="' + (ATL_TINY + 6) +
    '" y="' + (ATL_FS * 0.36) + '"></text></g>',
  /* the name beside the place, when it is not written on it — where it goes,
     which way it reads, or nothing */
  lay(ctx){
    const it = ctx.it, v = ctx.view, k = atlSel(it);
    if(!k) return null;
    const anchor = atlGlobeLabel(v, k);
    const lb = !v.globe ? geoRegLabel(atlVProj(it, v), k) : null;
    if((v.globe && !anchor) || (!v.globe && (!lb || atlOnShape(lb)))) return null;
    const x = ((anchor || lb).x - v.cx) * v.k + ATL_W / 2;
    const y = ((anchor || lb).y - v.cy) * v.k + v.H / 2;
    const name = geoRegName(k);
    return { x, y, name, flip: x + name.length * ATL_FS * 0.46 + ATL_TINY + 12 > ATL_W };
  },
  draw(c, ctx, C){
    const q = this.lay(ctx);
    if(q) atlInkName(c, C, q.name, q.x + (q.flip ? -(ATL_TINY + 6) : ATL_TINY + 6),
      q.y + ATL_FS * 0.36, ATL_FS, 600, q.flip, 5, 1);
  },
  frame(g, ctx){
    const el = g.firstElementChild;
    if(!el) return;
    const q = this.lay(ctx);
    if(!q){
      if(el.classList.contains('on')){ el.classList.remove('on'); el.firstElementChild.textContent = ''; }
      return;
    }
    const x = q.x, y = q.y, name = q.name, flip = q.flip;
    if(el.firstElementChild.textContent !== name) el.firstElementChild.textContent = name;
    const f = flip ? '1' : '0';
    if(el.dataset.f !== f){
      el.dataset.f = f;
      const t = el.firstElementChild;
      t.setAttribute('x', flip ? -(ATL_TINY + 6) : (ATL_TINY + 6));
      t.setAttribute('text-anchor', flip ? 'end' : 'start');
    }
    el.setAttribute('transform', 'translate(' + rd1(x) + ' ' + rd1(y) + ')');
    el.classList.add('on');
  }
});

/* ---- how much world, and how finely ----
   A frame costs what is in it, and until these two the map was handed all of
   the world at all of its detail whatever it was showing. `atlLod` picks a
   simplification step from the zoom; `atlWin` is the rectangle of world worth
   building, SNAPPED to a grid half a view across so that panning crosses a
   boundary a few times in a gesture rather than sixty times a second.

   Between crossings nothing is rebuilt and a frame is still one transform —
   the promise at the top of this file is intact. When one is crossed, the
   world layers' markup is replaced, which is a few milliseconds once. */
const atlLod = z => Math.max(0, Math.min(GEO_LOD_MAX, Math.round(z)));
/* Static SVG globes still choose a lighter step while a spring is moving. The
   live globe never asks this function during rotation: its canvas consumes the
   cached raw tables directly. */
function atlLodV(it, v){
  const L = v.globe && ATL_LIVE.get(it.id);
  const moving = L && (L.hand || L.sx.active || L.sy.active);
  return atlLod(moving ? 1 : atlN(v));
}
/* ---- the zoom in whole octaves, and STICKY ----
   THE ONE NUMBER BOTH OF THEM COME FROM, and the reason it exists. The detail
   step and the window used to be read off the live zoom, and the live zoom is
   a spring: it passes a boundary, overshoots it, comes back over it and settles
   on it, so a single flick of the wheel crossed one boundary three or four
   times and rebuilt the world every time it did. With the height layer on,
   that rebuild is a contouring pass, and three or four of them inside half a
   second is what the map was flickering with.

   So the step is quantised and it is sticky: it takes six tenths of an octave
   past the one we are on to leave it, which no overshoot of this spring
   reaches. Between crossings the zoom is a scale on a transform and nothing
   else at all. */
const atlStepOf = (z, prev) => {
  const n = Math.max(0, Math.min(ATL_NMAX, Math.round(z)));
  if(prev == null) return n;
  const p = Math.max(0, Math.min(ATL_NMAX, prev));
  return Math.abs(z - p) > ATL_HYST ? n : p;
};
/* the step a view is at — the sticky one if it came from atlView, the plain one
   for a view somebody put together by hand */
const atlN = v => v.n == null ? Math.max(0, Math.min(ATL_NMAX, Math.round(v.z))) : v.n;
function atlWin(it, v){
  if(v.globe) return null;                         /* the circular horizon is its window */
  /* THE WINDOW IS MEASURED AT THE STEP, NOT AT THE ZOOM. k moves every frame of
     a zoom, and a window that followed k would be a new window — a new clip, a
     new field, a new set of contours — sixty times a second. So it is measured
     at the step. The step's own band is six tenths of an octave either side of
     it, and a window already carries half a view of slack — 1.5 views of reach
     against the 1.52 the bottom of the band asks for — so a fifth of an octave
     of headroom is all it takes for the window to cover every zoom the step
     covers, and never be asked again inside one. Any more than that is world
     nobody is looking at, built and clipped and contoured for nothing. */
  const kq = atlK(it, atlN(v) - 0.2, v);
  const hw = ATL_W / (2 * kq), hh = v.H / (2 * kq);
  /* the whole world fits: no window at all, and no key that changes with the
     pan — which is what keeps a map at arm's length from ever rebuilding */
  if(2 * hw >= GEO_W && 2 * hh >= v.P.h) return null;
  /* half a view of slack, snapped to half a view — so the window is about two
     views across, and a pan crosses a boundary about four times in the time it
     takes to drag the picture past itself. A boundary costs one millisecond. */
  const g = Math.max(hw, hh) / 2;
  return { x0: Math.floor((v.cx - hw - g) / g) * g, x1: Math.ceil((v.cx + hw + g) / g) * g,
           y0: Math.floor((v.cy - hh - g) / g) * g, y1: Math.ceil((v.cy + hh + g) / g) * g };
}
const atlWinKey = w => w ? w.x0 + ',' + w.y0 + ',' + w.x1 + ',' + w.y1 : '';
/* …and back again, so a picture that arrived as markup knows what it covers */
const atlWinOf = k => {
  if(!k) return null;
  const a = k.split(',').map(Number);
  return a.length === 4 && a.every(v => v === v) ? { x0: a[0], y0: a[1], x1: a[2], y1: a[3] } : null;
};
/* what a picture was built for: one string, and the only thing that decides
   whether any geometry is made again */
const atlBuilt = (it, v) => atlLodV(it, v) + '|' + atlWinKey(atlWin(it, v)) +
  (v.globe ? '|' + v.P.lon + ',' + v.P.lat : '');
/* is what is already drawn still reaching the edges of the picture? */
function atlCovers(w, v){
  if(!w) return true;                              /* the whole world is in the DOM */
  const hw = ATL_W / (2 * v.k), hh = v.H / (2 * v.k);
  return v.cx - hw >= w.x0 && v.cx + hw <= w.x1 && v.cy - hh >= w.y0 && v.cy + hh <= w.y1;
}
const atlPathsFor = (it, v) => geoPaths(atlVProj(it, v), it.look || 'smooth', atlLodV(it, v), atlWin(it, v));

/* ---- the view ----
   `k` takes world units to picture units: at z = 0 the world is exactly as
   wide as the picture, and every step of z doubles it. The centre is kept as
   a longitude and a latitude in the record — which is what makes it readable,
   and what lets the projection change under it without the map jumping. */
function atlGeom(it, L){
  const globe = atlGlobe(it);
  /* A ROUND WORLD HAS A SQUARE PICTURE: the disc fills it edge to edge and the
     widget on the page is the disc itself — a sphere, or the polar map. The
     record's own aspect is kept untouched for the day it is a flat map again. */
  const ar = globe || geoProj(atlProj(it)).round ? 1 : clamp(nz(it.ar, 0.5), 0.3, 1.1);
  const lon = globe ? (L ? L.cx : nz(it.lon, 8)) : nz(it.lon, 8);
  const lat = globe ? (L ? L.cy : nz(it.lat, 16)) : nz(it.lat, 16);
  const P = globe ? geoGlobeAt(lon, lat) : geoProj(atlProj(it));
  /* The projection carries its quantised centre, so a built picture can name
     exactly which orientation it contains. */
  return { ar, H: rd1(ATL_W * ar), P, W: ATL_W, globe, lon, lat,
           proj:globe ? 'globe' : atlProj(it) };
}
const atlK = (it, z, g) => {
  g = g || atlGeom(it);
  return ((g.P.round ? Math.min(ATL_W, g.H) : ATL_W) / GEO_W) * Math.pow(2, z);
};
/* as far out as the world may go: never smaller than the picture, in either
   direction — so there is no letterbox to pan into, ever */
function atlZMin(it){
  const g = atlGeom(it);
  if(g.globe) return 0;
  return Math.max(0, Math.log2(g.H / g.P.h * GEO_W / ATL_W));
}
/* where the centre may stand at this zoom: pinned to the middle on an axis the
   world no longer fills */
function atlLimits(it, k){
  const g = atlGeom(it), hw = ATL_W / (2 * k), hh = g.H / (2 * k);
  const wide = 2 * hw >= GEO_W, tall = 2 * hh >= g.P.h;
  return { x0: wide ? GEO_W / 2 : hw, x1: wide ? GEO_W / 2 : GEO_W - hw,
           y0: tall ? g.P.h / 2 : hh, y1: tall ? g.P.h / 2 : g.P.h - hh };
}
function atlView(it, L){
  const g = atlGeom(it, L);
  const z = L ? L.z : clamp(nz(it.zm, 0), atlZMin(it), ATL_ZMAX);
  const k = atlK(it, z, g);
  let cx, cy;
  if(g.globe){ cx = cy = GEO_W / 2; }
  else if(L){ cx = L.cx; cy = L.cy; }
  else {
    const c = g.P.fwd(nz(it.lon, 8), nz(it.lat, 16)), lim = atlLimits(it, k);
    cx = clamp(c[0], lim.x0, lim.x1); cy = clamp(c[1], lim.y0, lim.y1);
  }
  /* the sticky step lives on the live record, because stickiness is a memory
     and a map that is not being handled has nothing to remember */
  const n = atlStepOf(z, L ? L.n : null);
  if(L) L.n = n;
  return { ar: g.ar, H: g.H, P: g.P, W: ATL_W, z, k, cx, cy, n,
           globe:g.globe, lon:g.lon, lat:g.lat, proj:g.proj };
}

/* ---- the live globe canvas ----
   A flat map is one SVG transform. A turning globe cannot be: every point's
   projection changes with its orientation. Rewriting hundreds of kilobytes of
   SVG path data per frame made the hand wait for parsing and let hidden runs
   flash across the horizon. The live globe therefore draws the SAME geographic
   tables into one canvas. It projects points directly, clips at z=0 before a
   line is issued, and never removes a layer while motion is in progress.

   Print and export still use atlSVG below, so they remain resolution-free. */
const ATL_GREG = new Map();
/* ---- the sphere, per frame, without allocating ----
   Everything under here used to speak in objects: a rotated point was a fresh
   `{x,y,z}`, a screen point a fresh `[x,y]`, and a ring a fresh array of them
   built by `.map`. At the detail the live globe runs at, that is about seventy
   thousand points a frame — land, coast, borders, rivers, lakes and nine
   bands of terrain — so the arithmetic was never the trouble and the
   LITTER was: a hundred and forty thousand short-lived objects sixty times a
   second is a minor collection every few frames, and a collection in the
   middle of a turn is exactly the stutter a hand feels.

   So nothing under here allocates. A run's unit vectors are worked out once
   and kept in one Float32Array; a frame rotates them into scratch buffers that
   are grown to the largest run the page has ever drawn and then reused for
   ever; and a path is issued straight into Path2D as numbers. It is the same
   geometry drawing the same picture through the same points — it has just
   stopped making rubbish while it does it.

   AND MOST OF IT IS NEVER READ. Half the sphere faces away at any moment, and
   past the first zoom most of the rest is off the widget, but every run was
   still rotated in full before anything found that out. Each run now carries a
   CAP — the smallest circle on the sphere that contains it, kept as a centre
   and the sine of its angular radius — and one dot product answers both
   questions before a single point is touched: whether the whole of it is
   behind the horizon, and whether the whole of it misses the picture. */
const ATL_GXYZ = new WeakMap();

/* the unit vectors of one run, and the cap that bounds them. Longitude and
   latitude never change, so this is paid once per run for the life of the
   page and a frame is multiplications only. */
function atlGPrep(pts){
  let hit = ATL_GXYZ.get(pts);
  if(hit) return hit;
  const n = pts.length, u = new Float32Array(n * 3);
  let mx = 0, my = 0, mz = 0;
  for(let i = 0, k = 0; i < n; i++, k += 3){
    const p = pts[i], lon = p[0] * GEO_D2R, lat = p[1] * GEO_D2R, c = Math.cos(lat);
    const x = c * Math.cos(lon), y = c * Math.sin(lon), z = Math.sin(lat);
    u[k] = x; u[k + 1] = y; u[k + 2] = z;
    mx += x; my += y; mz += z;
  }
  const d = Math.hypot(mx, my, mz), ok = d > 1e-12;
  const cx = ok ? mx / d : 1, cy = ok ? my / d : 0, cz = ok ? mz / d : 0;
  let cmin = 1;
  for(let i = 0, k = 0; i < n; i++, k += 3){
    const dot = u[k] * cx + u[k + 1] * cy + u[k + 2] * cz;
    if(dot < cmin) cmin = dot;
  }
  /* BOTH TESTS NEED A CAP OF A HEMISPHERE OR LESS. Past that the sine stops
     being monotonic in the angle and the horizon test would throw away a run
     that is half in shot — so a wide cap is switched off rather than
     approximated, by giving it a radius no test can ever be inside. Only a
     run round more than half the world could hit this, and none does. */
  const wide = !(cmin > 1e-9);
  hit = { n, u, cx, cy, cz,
          st: wide ? 2 : Math.sqrt(1 - cmin * cmin),        /* sine of the radius */
          ch: wide ? 4 : Math.sqrt(2 * (1 - cmin)) };       /* …and its chord */
  ATL_GXYZ.set(pts, hit);
  return hit;
}
function atlGlobeRegion(key){
  let hit = ATL_GREG.get(key);
  if(hit) return hit;
  const E = geoProj('equirect');
  hit = geoReg('equirect', key).rings.map(r => r.map(p => E.inv(p[0], p[1])));
  ATL_GREG.set(key, hit);
  return hit;
}
/* ---- the scratch ----
   One buffer for the rotated run and two for the clipper to work between. The
   two clipper buffers are always the SAME length, because clipping swaps them
   four times and a swap between arrays of different sizes is a bug waiting for
   a coastline. Nothing here is re-entrant and nothing here needs to be: one
   canvas is painted at a time, on one thread, to the end. */
let ATL_GR3 = new Float64Array(0);       /* rotated x,y,z per point */
let ATL_GPA = new Float64Array(0);       /* screen x,y — the clipper's two ends */
let ATL_GPB = new Float64Array(0);
function atlGRoom(n){
  /* the slack is the rim arc a ring closes along — 45 points at most — plus
     what Sutherland-Hodgman adds at the corners of the picture */
  const need = (n + 128) * 2;
  if(ATL_GPA.length < need){
    const cap = need + (need >> 1);
    ATL_GPA = new Float64Array(cap); ATL_GPB = new Float64Array(cap);
  }
  return ATL_GPA;
}

/* ---- one frame's rotation, as three axes ----
   atlGlobePaint works these out once and every run reads them. `z` is the
   direction the reader is looking down, which is what a cap is tested against;
   `x` and `y` are where east and north come out on the screen. It is the same
   rotation the old three-line helper did, written as the matrix it always was. */
function atlGAxes(lon, lat){
  const so = Math.sin(lon), co = Math.cos(lon), sl = Math.sin(lat), cl = Math.cos(lat);
  return { xx:-so,      xy:co,       xz:0,
           yx:-sl * co, yy:-sl * so, yz:cl,
           zx:cl * co,  zy:cl * so,  zz:sl };
}
/* how a run stands against this frame: -1 not worth a single point of work,
   1 wholly in front of the horizon, 0 across it. The screen half of the test
   is the cap's own chord, which bounds how far any point of it can project
   from the centre whichever side of the sphere that point is on. */
function atlGCull(G, v){
  const A = v.A, d = G.cx * A.zx + G.cy * A.zy + G.cz * A.zz;
  if(d < -G.st) return -1;
  const R = GEO_GR * v.k;
  const sx = ATL_W / 2 + R * (G.cx * A.xx + G.cy * A.xy + G.cz * A.xz);
  const sy = v.H / 2 - R * (G.cx * A.yx + G.cy * A.yy + G.cz * A.yz);
  const rad = R * G.ch + 2;
  if(sx + rad < 0 || sx - rad > ATL_W || sy + rad < 0 || sy - rad > v.H) return -1;
  return d > G.st ? 1 : 0;
}
/* the whole run into the scratch buffer. Only ever called once the cap has
   said the run is worth reading. */
function atlGSpin(G, v){
  const A = v.A, u = G.u, n = G.n;
  if(ATL_GR3.length < n * 3) ATL_GR3 = new Float64Array(n * 3 + (n >> 1) * 3);
  const r = ATL_GR3;
  for(let i = 0, k = 0; i < n; i++, k += 3){
    const x = u[k], y = u[k + 1], z = u[k + 2];
    r[k]     = x * A.xx + y * A.xy;
    r[k + 1] = x * A.yx + y * A.yy + z * A.yz;
    r[k + 2] = x * A.zx + y * A.zy + z * A.zz;
  }
  return r;
}

/* ---- Sutherland-Hodgman, in place ----
   At deep zoom most of the sphere is beyond the widget, and clipping a filled
   ring to the screen box before Canvas sees it stops its tessellator working
   through a continent thousands of pixels off the picture. Four edges, two
   buffers, and the answer left in whichever one the last pass wrote.

   It returns -1 rather than overrunning. A very ragged ring can gain two
   vertices per edge instead of the one a convex ring gains, and rather than
   size every buffer for a worst case nothing ever meets, an overrun stops the
   clipping there. That is not a fallback with a different answer in it:
   clipping to a half-plane the picture is entirely inside of cannot change
   what is on the picture, so ANY prefix of the four passes draws the same
   pixels — the ring just costs what it used to cost. */
function atlGClipEdge(src, n, dst, cap, side, val){
  if(n < 3) return 0;
  let m = 0;
  let ax = src[(n - 1) * 2], ay = src[(n - 1) * 2 + 1];
  let ai = side === 0 ? ax >= val : side === 1 ? ax <= val
         : side === 2 ? ay >= val : ay <= val;
  for(let i = 0; i < n; i++){
    const bx = src[i * 2], by = src[i * 2 + 1];
    const bi = side === 0 ? bx >= val : side === 1 ? bx <= val
             : side === 2 ? by >= val : by <= val;
    if(ai !== bi){
      if(m >= cap) return -1;
      if(side < 2){
        const t = (val - ax) / (bx - ax);
        dst[m * 2] = val; dst[m * 2 + 1] = ay + (by - ay) * t;
      }else{
        const t = (val - ay) / (by - ay);
        dst[m * 2] = ax + (bx - ax) * t; dst[m * 2 + 1] = val;
      }
      m++;
    }
    if(bi){
      if(m >= cap) return -1;
      dst[m * 2] = bx; dst[m * 2 + 1] = by; m++;
    }
    ax = bx; ay = by; ai = bi;
  }
  return m;
}
/* a screen-space ring, sitting in ATL_GPA, into the path — clipped first if
   the sphere is bigger than the picture it is being drawn into */
function atlGEmit(path, n, v, clip){
  let src = ATL_GPA;
  if(clip && n >= 3){
    const cap = ATL_GPA.length >> 1;
    let dst = ATL_GPB, t, m;
    const EDGE = [0, -2, 1, ATL_W + 2, 2, -2, 3, v.H + 2];
    for(let e = 0; e < 8; e += 2){
      m = atlGClipEdge(src, n, dst, cap, EDGE[e], EDGE[e + 1]);
      if(m < 0) break;                     /* the ring keeps whatever it had */
      n = m; t = src; src = dst; dst = t;
      if(n < 3) return;
    }
  }
  if(n < 3) return;
  path.moveTo(src[0], src[1]);
  for(let i = 1; i < n; i++) path.lineTo(src[i * 2], src[i * 2 + 1]);
  path.closePath();
}

/* ---- one filled ring on the sphere ----
   Every visible piece closes along the circular horizon and never along a
   chord through the globe, which is what stops the far side of a country
   flashing across its own face as it turns. */
function atlGlobeRing(path, v, pts){
  const G = atlGPrep(pts), n = G.n;
  if(n < 3) return;
  const side = atlGCull(G, v);
  if(side < 0) return;
  const R = GEO_GR * v.k, cx = ATL_W / 2, cy = v.H / 2;
  const clip = R > Math.max(ATL_W, v.H);
  const r = atlGSpin(G, v), P = atlGRoom(n);

  /* the whole of it in front: no horizon to walk, so it is one pass */
  if(side > 0){
    for(let i = 0, k = 0; i < n; i++, k += 3){
      P[i * 2] = cx + R * r[k]; P[i * 2 + 1] = cy - R * r[k + 1];
    }
    atlGEmit(path, n, v, clip);
    return;
  }
  /* across the horizon. Start at a HIDDEN vertex, so a visible piece is never
     split in two by the end of the array and then closed twice. */
  let hidden = -1, seen = 0;
  for(let i = 0; i < n; i++){ if(r[i * 3 + 2] >= 0) seen++; else if(hidden < 0) hidden = i; }
  if(!seen) return;
  if(hidden < 0){                        /* the cap said 'across' and it is not */
    for(let i = 0, k = 0; i < n; i++, k += 3){
      P[i * 2] = cx + R * r[k]; P[i * 2 + 1] = cy - R * r[k + 1];
    }
    atlGEmit(path, n, v, clip);
    return;
  }
  let m = 0, fx = 0, fy = 0, lx = 0, ly = 0, open = 0;
  /* the piece is written in screen units and its two ends are remembered in
     the sphere's own, because the rim arc that closes it is an angle */
  const put = (x, y) => {
    if(!m){ fx = x; fy = y; }
    lx = x; ly = y;
    P[m * 2] = cx + R * x; P[m * 2 + 1] = cy - R * y; m++;
  };
  const rim = (i, j) => {
    const az = r[i * 3 + 2], t = az / (az - r[j * 3 + 2]);
    const x = r[i * 3] + (r[j * 3] - r[i * 3]) * t;
    const y = r[i * 3 + 1] + (r[j * 3 + 1] - r[i * 3 + 1]) * t;
    const d = Math.hypot(x, y) || 1;
    put(x / d, y / d);
  };
  const close = () => {
    if(m < 2){ m = 0; return; }
    let a = Math.atan2(-ly, lx);
    let d = Math.atan2(-fy, fx) - a;
    while(d > Math.PI) d -= Math.PI * 2;
    while(d < -Math.PI) d += Math.PI * 2;
    const steps = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 45)));
    for(let k = 1; k <= steps; k++){
      const t = a + d * k / steps;
      P[m * 2] = cx + Math.cos(t) * R; P[m * 2 + 1] = cy + Math.sin(t) * R; m++;
    }
    atlGEmit(path, m, v, clip);
    m = 0;
  };
  for(let s = 0; s < n; s++){
    const i = (hidden + s) % n, j = (i + 1) % n;
    const av = r[i * 3 + 2] >= 0, bv = r[j * 3 + 2] >= 0;
    if(!av && bv){ m = 0; rim(i, j); put(r[j * 3], r[j * 3 + 1]); open = 1; }
    else if(av && bv){
      if(!open){ m = 0; put(r[i * 3], r[i * 3 + 1]); open = 1; }
      put(r[j * 3], r[j * 3 + 1]);
    }else if(av && !bv){
      if(!open){ m = 0; put(r[i * 3], r[i * 3 + 1]); }
      rim(i, j); close(); open = 0;
    }
  }
  if(open) close();
}
function atlGlobePath(v, rings){
  const p = new Path2D();
  for(const r of rings) atlGlobeRing(p, v, r);
  return p;
}
/* ---- one line on the sphere ----
   The same walk without the rim: a coast, a border or a river is an open run,
   so a piece that goes round the back simply stops at the horizon. */
function atlGlobeLine(path, v, pts){
  if(!pts || pts.length < 2) return;
  const G = atlGPrep(pts), n = G.n;
  if(n < 2 || atlGCull(G, v) < 0) return;
  const R = GEO_GR * v.k, cx = ATL_W / 2, cy = v.H / 2, H = v.H;
  const r = atlGSpin(G, v);
  let pen = 0, ax = r[0], ay = r[1], az = r[2];
  for(let i = 1; i < n; i++){
    const k = i * 3, bx = r[k], by = r[k + 1], bz = r[k + 2];
    const av = az >= 0, bv = bz >= 0;
    let sx, sy, ex, ey;
    if(av && bv){ sx = ax; sy = ay; ex = bx; ey = by; }
    else if(av !== bv){
      const t = az / (az - bz);
      const hx = ax + (bx - ax) * t, hy = ay + (by - ay) * t;
      const d = Math.hypot(hx, hy) || 1;
      if(av){ sx = ax; sy = ay; ex = hx / d; ey = hy / d; }
      else  { sx = hx / d; sy = hy / d; ex = bx; ey = by; }
    }else{ pen = 0; ax = bx; ay = by; az = bz; continue; }
    const x0 = cx + R * sx, y0 = cy - R * sy, x1 = cx + R * ex, y1 = cy - R * ey;
    /* both ends off the same side of the picture: no part of the segment can
       be on it, and the pen lifts rather than drawing across a corner */
    if((x0 < 0 && x1 < 0) || (x0 > ATL_W && x1 > ATL_W) ||
       (y0 < 0 && y1 < 0) || (y0 > H && y1 > H)) pen = 0;
    else{
      if(!pen) path.moveTo(x0, y0);
      path.lineTo(x1, y1);
      pen = bv ? 1 : 0;
    }
    ax = bx; ay = by; az = bz;
  }
}
function atlGlobeLines(v, runs){
  const p = new Path2D();
  for(const a of runs) atlGlobeLine(p, v, a);
  return p;
}
function atlResolveColor(host, value){
  const p = document.createElement('i');
  p.style.cssText = 'position:absolute;visibility:hidden;color:' + value;
  host.appendChild(p);
  const c = getComputedStyle(p).color;
  p.remove(); return c;
}
/* THE CANVAS PAINTS IN THE STYLESHEET'S COLOURS. Every colour the map has is a
   --at* variable on the item (see the styles in the CSS below), the SVG rules
   read them directly, and the canvas reads the same variables off its own
   computed style and resolves each through one throwaway element — which is
   what turns a color-mix() into a colour Canvas can be handed. So a style is
   one block of CSS and nothing here knows its name. */
const ATL_PAL_KEYS = ['land', 'sea0', 'sea1', 'sea2', 'lake', 'lakeline', 'river', 'coast', 'bord',
                      'lbl', 'halo', 'relsea', 'edge', 'mark', 'seaname', 'co0', 'co1', 'co2', 'co3', 'co4', 'co5'];
function atlGlobePalette(canvas){
  const s = getComputedStyle(canvas), get = k => s.getPropertyValue(k).trim();
  const accent = get('--accent'), disp = get('--disp') || 'sans-serif';
  const raw = ATL_PAL_KEYS.map(k => get('--at' + k));
  const sig = raw.join('|') + '|' + accent + '|' + disp;
  if(canvas.__palette && canvas.__palette.sig === sig) return canvas.__palette;
  const C = { sig, accent, disp, co: [] };
  ATL_PAL_KEYS.forEach((k, n) => {
    const c = atlResolveColor(canvas.parentElement, raw[n] || 'transparent');
    if(k.length === 3 && k.slice(0, 2) === 'co') C.co[+k[2]] = c; else C[k] = c;
  });
  C.pick = atlResolveColor(canvas.parentElement, 'color-mix(in srgb,' + accent + ' 30%,transparent)');
  return (canvas.__palette = C);
}
/* The layer table is searched by id seven times a paint, and it is the same
   seven answers every time. A map is a hash; a turn is sixty paints. */
const ATL_GLAYER = {};
const atlGLayer = id => ATL_GLAYER[id] ||
  (ATL_GLAYER[id] = ATL_LAYERS.find(L => L.id === id));
/* ---- the two DOM questions a frame used to ask ----
   The canvas's own box is a layout and its own colours are a style flush, and
   neither answer can change while a globe is being turned: a hand cannot be on
   the map and on the theme picker at once. So the box is WATCHED rather than
   measured, and the palette is re-read on the frames the map is standing still
   — which is every frame except the ones inside a gesture, including the one a
   gesture ends on and the one a theme change repaints. */
function atlGlobeBox(canvas){
  if(!canvas.__ro && typeof ResizeObserver === 'function'){
    canvas.__ro = new ResizeObserver(es => {
      const r = es[es.length - 1].contentRect;
      if(!(r.width > 0 && r.height > 0)) return;
      const had = canvas.__box;
      canvas.__box = { width:r.width, height:r.height };
      /* A BOX THAT ARRIVES IS A PAINT THAT IS OWED. A map built off the page —
         which is how every item is built — measured nothing, and a frame that
         could not paint must not be the last word: the moment the canvas has a
         size, the picture is asked for again. */
      if(canvas.__wake && (!had || had.width !== r.width || had.height !== r.height)) canvas.__wake();
    });
    canvas.__ro.observe(canvas);
  }
  const b = canvas.__box;
  if(b && b.width > 0 && b.height > 0) return b;
  const r = canvas.getBoundingClientRect();
  return (canvas.__box = { width:r.width, height:r.height });
}
/* ---- the sea and the shade, painted once ----
   Both are radial gradients over the whole of the picture, and a radial
   gradient is worked out PER PIXEL — a square root and a ramp for every one of
   the million this canvas has. The two of them came to three and a half
   milliseconds of every frame, which is a seventh of the budget spent redrawing
   something that had not changed: neither depends on the ORIENTATION, only on
   how big the globe is and what colour the paper is, and turning changes
   neither of those.

   So they are drawn once into two canvases of exactly this canvas's size, and
   a frame blits them. It has to be exactly this size — a tile drawn small and
   stretched costs as much as the gradient did, because resampling is also
   per-pixel arithmetic, while a blit at one to one is a copy and costs about a
   tenth of what either does. They are built under the SAME transform the
   picture uses, so a widget whose box is not the shape of its own view gets
   the same slightly oval gradient it always got.

   The pair is rebuilt when the globe is resized, zoomed or re-themed, and a
   turn does none of those. */
function atlGlobeBack(canvas, C, pw, ph, sx, sy, v, r){
  const sig = pw + 'x' + ph + '|' + Math.round(r * 8) + '|' + C.sig;
  const had = canvas.__back;
  if(had && had.sig === sig) return had;
  const cx = ATL_W / 2, cy = v.H / 2;
  const mk = (old, paint) => {
    const c = old && old.width === pw && old.height === ph ? old : document.createElement('canvas');
    if(c.width !== pw){ c.width = pw; } if(c.height !== ph){ c.height = ph; }
    const g = c.getContext('2d');
    g.setTransform(sx, 0, 0, sy, 0, 0);
    g.clearRect(0, 0, ATL_W, v.H);
    /* NO CLIP IN THE TILE. The disc is the picture's own clip and the tile is
       blitted inside it; a circle cut here as well would put a second
       antialiased edge into the blend and the rim would come out a shade
       different from the one this feature has always drawn. */
    paint(g);
    return c;
  };
  const sea = mk(had && had.sea, g => {
    const q = g.createRadialGradient(cx - r * .26, cy - r * .28, r * .04, cx, cy, r * 1.06);
    q.addColorStop(0, C.sea0); q.addColorStop(.7, C.sea1); q.addColorStop(1, C.sea2);
    g.fillStyle = q; g.fillRect(0, 0, ATL_W, v.H);
  });
  const shade = mk(had && had.shade, g => {
    const q = g.createRadialGradient(cx - r * .28, cy - r * .3, r * .18, cx, cy, r);
    q.addColorStop(.58, 'rgba(0,0,0,0)'); q.addColorStop(1, 'rgba(0,0,0,.19)');
    g.fillStyle = q; g.fillRect(0, 0, ATL_W, v.H);
  });
  return (canvas.__back = { sig, sea, shade });
}
/* ---- how fine to draw it WHILE IT IS MOVING ----
   What is left, once nothing is allocated and nothing is worked out twice, is
   fill rate: a globe filling a page is over a million pixels and a frame
   passes over most of them a dozen times — the sea, the land, nine bands of
   terrain, five kinds of line. That is not a thing to be clever about. It is
   simply more pixels than some machines can paint sixty times a second, and no
   amount of arithmetic saved will change it.

   So the picture is drawn at fewer pixels WHILE THE HAND IS ON IT, and at
   every pixel the moment it stops. The canvas is stretched to its box by CSS
   either way, so a smaller one costs the compositor a scale it was doing
   anyway and costs this function a quarter of its work. It is the same bargain
   atlReworld already strikes with the height field one rung up — do less while
   it is moving, and catch up when it stands still — and it is the honest one
   to strike here, because a globe being flung round is the one moment nobody
   is reading the coastline.

   AND IT IS MEASURED, NOT GUESSED. A machine that paints this in four
   milliseconds never gives up a pixel; one that cannot hold sixteen steps down
   until it can. Nothing here knows what it is running on, so it watches itself.

   IT WATCHES TWO CLOCKS, because either one alone is a lie on some machine.
   How long this function takes is the whole story where the canvas is drawn on
   the processor — and none of it where the canvas is handed to the graphics
   card, because then this returns long before the picture exists and would
   report four milliseconds while the reader watches it stutter. The GAP
   between one frame and the next catches that, and cannot be fooled by where
   the work happens; but it cannot tell FAST from JUST KEEPING UP either, since
   a frame that finishes early still waits for the screen. So: step down when
   either clock says the frame is late, and step back up only when both say
   there is room. Between the two thresholds is a dead band, which is what
   stops it hunting, and a step is held for ten frames whatever they say.

   A gesture ends with one full-resolution frame, which is the one anybody
   actually looks at — see the `owed` line in atlPaint, which is what stops
   that frame being skipped for having moved too little to be worth drawing. */
const ATL_GQ = [1, 0.82, 0.67, 0.55];
const ATL_GAP_LATE = 21, ATL_GAP_ROOM = 17.5;    /* ms between frames */
const ATL_COST_LATE = 13, ATL_COST_ROOM = 7;     /* ms inside this function */
function atlGlobeScale(canvas, moving){
  if(!moving){ canvas.__qn = 0; canvas.__at = 0; canvas.__qheld = 0; return 1; }
  const q = canvas.__qn | 0, gap = canvas.__gap, cost = canvas.__ema;
  if(cost == null) return ATL_GQ[q];
  canvas.__qheld = (canvas.__qheld || 0) + 1;
  if(canvas.__qheld >= 10){
    const late = cost > ATL_COST_LATE || (gap != null && gap > ATL_GAP_LATE);
    const room = cost < ATL_COST_ROOM && (gap == null || gap < ATL_GAP_ROOM);
    if(late && q < ATL_GQ.length - 1){ canvas.__qn = q + 1; canvas.__qheld = 0; }
    else if(room && q > 0){ canvas.__qn = q - 1; canvas.__qheld = 0; }
  }
  return ATL_GQ[canvas.__qn | 0];
}
/* ---- the porthole ----
   The widget IS the sphere: at home the disc fills the square picture edge to
   edge, and going in the sphere grows past the picture, so what is seen is the
   part of it inside the same circle — a porthole onto the surface rather than
   a square cut out of a ball. Everything under here clips to the smaller of
   the two, and the rim it inks is whichever one is showing. */
const atlPorthole = v => Math.min(ATL_W, v.H) / 2;
/* false when nothing could be painted — a canvas with no size yet — so the
   caller does not write the view down as drawn */
function atlGlobePaint(canvas, it, v, moving){
  const box = atlGlobeBox(canvas);
  if(!(box.width > 0 && box.height > 0)) return false;
  const t0 = performance.now();
  const q = atlGlobeScale(canvas, moving);
  const dpr = Math.min(2, devicePixelRatio || 1) * q,
        pw = Math.max(1, Math.round(box.width * dpr)),
        ph = Math.max(1, Math.round(box.height * dpr));
  const resized = canvas.width !== pw || canvas.height !== ph;
  if(resized){ canvas.width = pw; canvas.height = ph; }
  const ctx = canvas.getContext('2d'), sx = pw / ATL_W, sy = ph / v.H;
  const C = (moving && canvas.__palette) || atlGlobePalette(canvas);
  v.A = atlGAxes(v.P.lon * Math.PI / 180, v.P.lat * Math.PI / 180);
  ctx.setTransform(sx, 0, 0, sy, 0, 0); ctx.clearRect(0, 0, ATL_W, v.H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const r = GEO_GR * v.k, cx = ATL_W / 2, cy = v.H / 2, rim = Math.min(r, atlPorthole(v));
  const B = atlGlobeBack(canvas, C, pw, ph, sx, sy, v, r);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rim, 0, Math.PI * 2); ctx.clip();
  /* a clip is kept in device space, so the transform may be put aside for the
     length of a blit without the disc moving */
  const blit = img => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.drawImage(img, 0, 0); ctx.restore(); };
  blit(B.sea);

  /* Tier two already resolves below a pixel across this canvas. Going to the
     source table at deeper zoom only projects off-screen points; keeping this
     cap fixed also means no detail swap when the hand is released. */
  const lod = Math.min(2, atlLod(atlN(v))), raw = geoGlobeRaw(lod), land = atlGlobePath(v, raw.land);
  if(atlOn(it, atlGLayer('grat'))){
    const G = atlGratRuns(Math.max(10, atlGStep(v)));
    ctx.strokeStyle = C.bord; ctx.globalAlpha = .35; ctx.lineWidth = 1.1;
    ctx.stroke(atlGlobeLines(v, G.mer)); ctx.stroke(atlGlobeLines(v, G.par));
  }
  ctx.globalAlpha = 1;
  if(atlOn(it, atlGLayer('land'))){ ctx.fillStyle = C.land; ctx.fill(land, 'evenodd'); }
  if(atlOn(it, atlGLayer('polit'))){
    const tint = geoCoTints();
    raw.co.forEach((rings, i) => {
      if(!rings.length) return;
      ctx.fillStyle = C.co[tint[i]]; ctx.fill(atlGlobePath(v, rings), 'evenodd');
    });
  }
  if(atlOn(it, atlGLayer('relief'))){
    ctx.save(); ctx.clip(land, 'evenodd'); ctx.globalAlpha = .92;
    const rl = Math.min(2, lod);
    for(const b of geoGlobeRelief(rl)){
      ctx.fillStyle = b.fill; ctx.fill(atlGlobePath(v, b.rings));
    }
    ctx.restore();
  }
  if(atlOn(it, atlGLayer('lakes'))){
    ctx.fillStyle = C.lake; ctx.strokeStyle = C.lakeline; ctx.globalAlpha = .95; ctx.lineWidth = 1.2;
    const p = atlGlobePath(v, raw.lakes);
    ctx.fill(p, 'evenodd'); ctx.stroke(p);
  }
  if(atlOn(it, atlGLayer('rivers'))){
    ctx.strokeStyle = C.river; ctx.globalAlpha = .75; ctx.lineWidth = 1.6;
    ctx.stroke(atlGlobeLines(v, raw.rivers));
  }
  if(atlOn(it, atlGLayer('bord'))){
    ctx.strokeStyle = C.bord; ctx.globalAlpha = .3; ctx.lineWidth = 1.5;
    ctx.stroke(atlGlobeLines(v, raw.bord));
  }
  if(atlOn(it, atlGLayer('coast'))){
    ctx.strokeStyle = C.coast; ctx.globalAlpha = .9; ctx.lineWidth = 2.4;
    ctx.stroke(atlGlobeLines(v, raw.coast));
  }
  const key = atlSel(it);
  if(key && atlOn(it, atlPickLayer())){
    const p = atlGlobePath(v, atlGlobeRegion(key));
    ctx.fillStyle = C.pick; ctx.strokeStyle = C.accent; ctx.globalAlpha = 1; ctx.lineWidth = 2.6;
    ctx.fill(p, 'evenodd'); ctx.stroke(p);
  }
  ctx.globalAlpha = 1; blit(B.shade);
  ctx.restore();
  ctx.strokeStyle = C.edge;
  ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, rim - 1), 0, Math.PI * 2); ctx.stroke();
  /* ---- and the names, on the same canvas ----
     One ctx per frame, in layer order, exactly as the SVG frames get it — so
     the cities still lay out against what the capitals took. See atlInkName. */
  const lctx = { it, view: v };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for(const L of ATL_LAYERS) if(L.draw && atlOn(it, L)) L.draw(ctx, lctx, C);
  ctx.globalAlpha = 1;
  /* what that frame cost, smoothed — the only thing atlGlobeScale has to go on,
     and it is kept between gestures so the second drag starts out knowing what
     the first one found out. Only frames WITH THE HAND ON are counted: the one
     full-resolution frame a gesture ends on is not what the next moving frame
     will cost, and a frame that resized the canvas paid for a new backing store
     and two backdrops, which is not what the frame after it will cost either. */
  if(moving && !resized){
    const now = performance.now(), dt = now - t0;
    canvas.__ema = canvas.__ema == null ? dt : canvas.__ema * 0.8 + dt * 0.2;
    /* the gap, and only when it is a FRAME rather than a pause: a finger that
       rests halfway through a drag stops asking for paints, and the second it
       moves again the clock would read half a second and step the picture down
       for no reason at all */
    const gap = canvas.__at ? now - canvas.__at : 0;
    if(gap > 2 && gap < 120)
      canvas.__gap = canvas.__gap == null ? gap : canvas.__gap * 0.85 + gap * 0.15;
    canvas.__at = now;
  }
  return true;
}

/* ---- the picture ----
   The static half: everything print, an export and the overview ever see. The
   pins group is left empty here and filled in mount(), which runs for those
   too — so an exported map carries exactly the labels that fitted. */
function atlSVG(it, view, liveGlobe){
  const v = view || atlView(it, null);
  liveGlobe = !!liveGlobe && v.globe;
  /* Only static SVG uses orientation-keyless globe path caches. Clear them
     here, once per static picture; a live turn never scans or invalidates the
     flat maps' caches. */
  if(v.globe && !liveGlobe) geoClearGlobeCaches();
  const paths = liveGlobe ? {} : atlPathsFor(it, v);
  const ctx = { it, view: v, paths };
  const id = esc(String(it.id));
  let world = '', pins = '';
  for(const L of ATL_LAYERS){
    if(!atlOn(it, L)) continue;
    if(L.world) world += '<g class="atlay" data-l="' + L.id + '" data-sw="' + (L.sw || 2) + '">' +
      (liveGlobe ? '' : L.world(ctx)) + '</g>';
    if(L.build) pins += '<g class="atlay" data-l="' + L.id + '"></g>';
  }
  const globe = v.globe;
  const seaDef = globe
    ? '<radialGradient id="atlsea-' + id + '" cx="34%" cy="27%" r="72%">' +
      '<stop offset="0" class="atsea0"/><stop offset=".72" class="atsea1"/><stop offset="1" class="atsea2"/></radialGradient>' +
      '<radialGradient id="atlshade-' + id + '" cx="32%" cy="25%" r="76%">' +
      '<stop offset=".58" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".19"/></radialGradient>'
    : '<linearGradient id="atlsea-' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" class="atsea0"/><stop offset="1" class="atsea1"/></linearGradient>';
  const globeClip = globe ? '<clipPath id="atlglobe-' + id + '"><circle cx="' + GEO_GR + '" cy="' + GEO_GR +
    '" r="' + GEO_GR + '"/></clipPath>' : '';
  const moving = globe
    ? '<g class="atworld" clip-path="url(#atlglobe-' + id + ')">' +
      '<circle class="atsea" cx="' + GEO_GR + '" cy="' + GEO_GR + '" r="' + GEO_GR +
      '" fill="url(#atlsea-' + id + ')"/>' + world +
      '<circle class="atglobeshade" cx="' + GEO_GR + '" cy="' + GEO_GR + '" r="' + GEO_GR +
      '" fill="url(#atlshade-' + id + ')"/>' +
      '<circle class="atglobeedge" cx="' + GEO_GR + '" cy="' + GEO_GR + '" r="' + (GEO_GR - 2) + '"/></g>'
    : '<rect class="atsea" x="0" y="0" width="' + ATL_W + '" height="' + v.H +
      '" fill="url(#atlsea-' + id + ')"/><g class="atworld">' + world + '</g>';
  /* THE PICTURE'S OWN EDGE IS ROUND WHEN THE WORLD IS: a globe's or a polar
     disc's picture is the porthole — see atlPorthole — and the frame, the hit
     plane and the edge are the same circle. A flat map keeps its rounded
     rectangle. */
  const round = globe || !!v.P.round;
  const cx = ATL_W / 2, cy = v.H / 2, pr = round ? atlPorthole(v) : 0;
  const frame = round
    ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + pr + '"/>'
    : '<rect x="0" y="0" width="' + ATL_W + '" height="' + v.H + '" rx="14"/>';
  const hit = round
    ? '<circle class="athit" cx="' + cx + '" cy="' + cy + '" r="' + pr + '" fill="#000" fill-opacity=".001" pointer-events="all"/>'
    : '<rect class="athit" x="0" y="0" width="' + ATL_W + '" height="' + v.H + '" fill="#000" fill-opacity=".001" pointer-events="all"/>';
  const edge = round
    ? '<circle class="atedge" cx="' + cx + '" cy="' + cy + '" r="' + (pr - 1) + '"/>'
    : '<rect class="atedge" x="1" y="1" width="' + (ATL_W - 2) + '" height="' + rd1(v.H - 2) + '" rx="13"/>';
  return '<svg class="atmap" viewBox="0 0 ' + ATL_W + ' ' + v.H + '" xmlns="http://www.w3.org/2000/svg"' +
    (globe ? ' data-projection="globe"' : '') +
    ' data-built="' + esc(atlBuilt(it, v)) + '"' +
    ' style="aspect-ratio:' + ATL_W + '/' + v.H + '">' +
    '<defs><clipPath id="atl-' + id + '">' + frame + '</clipPath>' +
    globeClip + seaDef + '</defs>' +
    '<g clip-path="url(#atl-' + id + ')">' +
    /* The live globe's picture is a pointerless canvas beneath this SVG. Keep
       a hit plane in the SVG so a drag that crosses ocean never loses its
       target; `pointer-events:all` also makes transparent water start a turn. */
    hit + moving + '<g class="atpins">' + pins + '</g></g>' + edge +
    '</svg>';
}
/* the item wears the shape of its picture: a class core's own selection ring,
   the paper and the shadow all read, so a globe is a sphere on the page and
   the polar disc a disc, not a ball in a box. Set wherever a map is built or
   rebuilt, live or not. */
const atlShape = (el, it) => {
  el.classList.toggle('atround', atlGlobe(it) || !!geoProj(atlProj(it)).round);
  el.dataset.atstyle = atlStyle(it);               /* the colours — see the styles in the CSS */
};
/* ---- the styles ----
   A style is a set of colours for the sea, the land, the lines, the names and
   the six country tints — one block of CSS variables each, keyed by the item's
   data-atstyle. `paper` is the default and follows the note's own theme; the
   rest are fixed pictures that look the same on every sheet. Political is the
   one that also turns a layer on, because tinted countries are what it is. */
const ATL_STYLES = [
  ['paper', 'Paper', 'the note’s own colours'],
  ['atlas', 'Atlas', 'cream land, pale sea, sepia lines'],
  ['political', 'Political', 'every country its own tint'],
  ['night', 'Night', 'a dark sea and slate land'],
  ['blueprint', 'Blueprint', 'white lines on deep blue'],
  ['sepia', 'Sepia', 'parchment and brown ink']
];
const atlStyle = it => ATL_STYLES.some(t => t[0] === it.style) ? it.style : 'paper';
const atlStyleName = it => ATL_STYLES.find(t => t[0] === atlStyle(it))[1];
function atlSetStyle(el, it, page, name){
  if(!ATL_STYLES.some(t => t[0] === name)) return;
  if(name === 'paper') delete it.style; else it.style = name;
  if(name === 'political'){ it.on = Object.assign({}, it.on); it.on.polit = 1; }
  if(el.__atlstyle) atlToolLabel(el.__atlstyle, atlStyleName(it));
  queueSave(page.id); atlRebuild(el, it, page);
  SND.tick();
}
function atlStyleMenu(it){
  const cur = atlStyle(it);
  return '<div class="atlsec">Style</div>' + ATL_STYLES.map(t =>
    '<button class="atlrow atlstyle' + (t[0] === cur ? ' on' : '') + '" data-s="' + t[0] +
    '" role="menuitemradio" aria-checked="' + (t[0] === cur ? 'true' : 'false') + '" title="' + esc(t[2]) + '">' +
    '<i class="atlswatch" data-atstyle="' + t[0] + '" aria-hidden="true"><b style="background:var(--atsea1)"></b>' +
    '<b style="background:var(--atland)"></b><b style="background:var(--atco0)"></b><b style="background:var(--atco3)"></b></i>' +
    '<span>' + esc(t[1]) + '</span><i class="atlck" aria-hidden="true">' + icn('tick') + '</i></button>').join('');
}

/* the one place the view reaches the DOM: a transform, a stroke width a layer,
   and each screen-space layer's own frame. Everything it touches is looked up
   once and hung on the <svg> — a frame must not be querying the document. */
function atlPlan(svg, it){
  if(svg.__plan) return svg.__plan;
  const built = svg.dataset.built || '';
  const plan = { world: svg.querySelector('.atworld'), pinsG: svg.querySelector('.atpins'), lay: [], pins: [],
                 built, heavy: built, hwin: atlWinOf(built.split('|')[1]) };
  for(const g of svg.querySelectorAll('.atworld .atlay'))
    plan.lay.push({ g, sw: +g.dataset.sw || 0, spec: ATL_LAYERS.find(L => L.id === g.dataset.l) });
  plan.slow = plan.lay.some(L => L.spec && L.spec.heavy);
  for(const L of ATL_LAYERS){
    if(!L.frame || !atlOn(it, L)) continue;
    const g = svg.querySelector('.atpins .atlay[data-l="' + L.id + '"]');
    if(g) plan.pins.push({ L, g });
  }
  svg.__plan = plan;
  return plan;
}
/* ---- one layer's markup, changed under the reader ----
   For a line layer the new geometry lands within a hairline of the old and the
   swap is not there to be seen. The height bands are the one exception: a finer
   sample moves a contour by a cell, and nine filled bands all moving at once is
   a blink however quick it is. So a layer may ask to arrive rather than to
   appear — the new markup goes in UNDERNEATH the old, which is then faded off
   the top of it and dropped. The picture is the old one, then both, then the
   new one, and at no point is it nothing.

   The old markup is MOVED, not built again: setting innerHTML detaches those
   nodes, it does not destroy them, so putting them back into the fading group
   costs no parsing at all. */
function atlSwap(g, d, fade){
  if(!fade || !g.firstChild){ g.innerHTML = d; return; }
  /* A PAN CAN CROSS TWO BOUNDARIES INSIDE ONE FADE, and the picture already on
     its way out has nothing left to say — it is a third copy of the same world
     under a second copy of it. Carrying it along would nest one transparency
     group inside another, and every level of that is an offscreen buffer as
     big as the group's box, painted again every frame until it expires. So it
     is dropped rather than kept: what is under it is the whole picture. */
  const keep = [...g.childNodes].filter(n => !(n.classList && n.classList.contains('atfade')));
  g.innerHTML = d + '<g class="atfade"></g>';
  const f = g.lastChild;
  for(const n of keep) f.appendChild(n);
  requestAnimationFrame(() => f.classList.add('off'));
  setTimeout(() => f.remove(), ATL_FADE + 80);
}
/* the world's markup, replaced — only ever because the detail step or the
   window changed. Everything else about a map is the transform.

   `slow` is whether the layers that cost real arithmetic come too. They do not,
   while the hand or a spring is still moving, because contouring a height field
   is tens of milliseconds and a zoom cannot afford one: what is already drawn
   is vector and scales, so the zoom rides on it and the field is contoured once
   when the map stands still. */
function atlReworld(svg, it, v, p, slow){
  const paths = atlPathsFor(it, v), ctx = { it, view: v, paths };
  for(const L of p.lay){
    if(!L.spec || !L.spec.world) continue;
    if(L.spec.heavy && !slow) continue;
    const d = L.spec.world(ctx);
    if(d !== L.d){ L.d = d; atlSwap(L.g, d, L.spec.fade); }
  }
  const key = atlBuilt(it, v);
  p.built = key;
  if(slow || !p.slow){ p.heavy = key; p.hwin = atlWin(it, v); }
}
function atlPaint(el, it, v, force){
  const svg = el.querySelector('svg.atmap');
  if(!svg) return;
  const p = atlPlan(svg, it);
  const canvas = el.querySelector('canvas.atglobeview'), liveGlobe = !!canvas && v.globe;
  if(canvas) canvas.classList.toggle('on', liveGlobe);
  if(p.world) p.world.style.visibility = liveGlobe ? 'hidden' : '';
  if(p.pinsG) p.pinsG.style.visibility = liveGlobe ? 'hidden' : '';   /* the canvas writes the names — see atlInkName */
  /* is a hand or a spring still on this map? The flat half has always asked,
     to know whether a rebuild can wait; the globe asks for the same reason one
     rung down — a frame in the middle of a gesture may not stop to ask the
     document a question whose answer cannot have changed. */
  const LV = ATL_LIVE.get(it.id);
  const moving = !!LV && !!(LV.hand || LV.sx.active || LV.sy.active || LV.sz.active);
  if(!liveGlobe){
    const built = atlBuilt(it, v);
    if(p.built !== built || (p.slow && p.heavy !== built)){
      const busy = moving;
      /* a rebuild the hand is owed is put off until the hand stops — unless what
         is drawn no longer reaches the edge of the picture, and then it is not a
         refinement any more but a hole, and holes are not deferred */
      if(p.built !== built || !busy) atlReworld(svg, it, v, p, !busy || !atlCovers(p.hwin, v));
    }
  }
  /* a settling spring's last frames move the picture by a fraction of a pixel.
     Nothing on screen can show that, so nothing on screen is touched for it —
     EXCEPT the frame a globe is owed. A globe that has been turning is standing
     at fewer pixels than its box, and the paint that puts that right is the one
     the springs come to rest on, which is also the one that has not moved far
     enough to be worth drawing. It is worth drawing. */
  const owed = liveGlobe && !moving && (canvas.__qn | 0) > 0;
  const was = p.was;
  if(!force && !owed && was && v.z === was.z && v.proj === was.proj &&
     (!v.globe || (v.P.lon === was.lon && v.P.lat === was.lat)) &&
     Math.abs((v.cx - was.cx) * v.k) < .05 && Math.abs((v.cy - was.cy) * v.k) < .05) return;
  if(liveGlobe){
    /* a canvas with no size yet — the item is being built off the page — paints
       nothing, and the view is NOT written down as drawn: the first frame after
       it has a box paints it, and the box's arrival asks for that frame */
    canvas.__wake = () => atlPaint(el, it, atlView(it, ATL_LIVE.get(it.id) || null), true);
    if(!atlGlobePaint(canvas, it, v, moving)) return;
  }
  else if(p.world) p.world.setAttribute('transform',
    'translate(' + rd1(ATL_W / 2 - v.cx * v.k) + ' ' + rd1(v.H / 2 - v.cy * v.k) + ') scale(' + v.k + ')');
  p.was = { cx: v.cx, cy: v.cy, z: v.z, proj:v.proj, lon:v.P.lon, lat:v.P.lat };
  /* the stroke goes on the group as an ATTRIBUTE and the paths inherit it —
     which is why no rule in the stylesheet may set stroke-width on them: CSS
     beats a presentation attribute and every line would freeze at one width.
     A layer may answer its width per view (swAt): the lakes' ink is off until
     the map is far enough in for a shore to be worth drawing. */
  for(const L of liveGlobe ? [] : p.lay){
    const sw = L.spec && L.spec.swAt ? L.spec.swAt(v) : L.sw;
    const w = Math.round(sw / v.k * 100) / 100;
    if(L.w !== w){ L.w = w; L.g.setAttribute('stroke-width', w); }
  }
  if(liveGlobe || !p.pins.length) return;
  const ctx = { it, view: v };
  for(const q of p.pins) q.L.frame(q.g, ctx);
}

/* ---- the live map ----
   Springs on the centre and the zoom. They are the only thing that ever writes
   the view while a map is being handled; the record is written when they come
   to rest, so a fling is one save and not sixty. */
function atlLive(el, it, page){
  const old = ATL_LIVE.get(it.id);
  if(old){ old.sx.stopAt(); old.sy.stopAt(); old.sz.stopAt(); if(old.raf) cancelAnimationFrame(old.raf); }
  const v = atlView(it, null);
  const L = { el, page, cx: v.globe ? v.lon : v.cx, cy: v.globe ? v.lat : v.cy, z: v.z, raf: 0 };
  const bump = () => {
    if(L.raf) return;
    L.raf = requestAnimationFrame(() => { L.raf = 0; atlPaint(L.el, it, atlView(it, L)); });
  };
  /* standing still is also when the heavy layers are owed their rebuild — see
     atlPaint. One more paint, and the height of the land catches up. */
  const rest = () => {
    if(L.sx.active || L.sy.active || L.sz.active) return;
    atlSettle(it, L);
    atlPaint(L.el, it, atlView(it, L));
  };
  L.sx = spring({ from: L.cx, damping: 1, response: .3, rest: .05, onUpdate: x => { L.cx = x; bump(); }, onRest: rest });
  L.sy = spring({ from: L.cy, damping: 1, response: .3, rest: .05, onUpdate: y => { L.cy = y; bump(); }, onRest: rest });
  L.sz = spring({ from: v.z, damping: 1, response: .22, rest: .0015, restSpeed: .02,
                  onUpdate: z => { L.z = z; bump(); }, onRest: rest });
  ATL_LIVE.set(it.id, L);
  return L;
}
/* the view, back into the record, as a place rather than as world units */
function atlSettle(it, L){
  const ll = atlGlobe(it) ? [geoLon(L.cx), L.cy] : geoProj(atlProj(it)).inv(L.cx, L.cy);
  it.lon = Math.round(ll[0] * 1e4) / 1e4;
  it.lat = Math.round(ll[1] * 1e4) / 1e4;
  it.zm = Math.round(L.z * 1e3) / 1e3;
  if(L.page) queueSave(L.page.id);
}
const atlJump = (L, cx, cy, z) => { L.sx.jump(cx); L.sy.jump(cy); if(z != null) L.sz.jump(z); };

/* ---- the hand ----
   One handler for one finger and for two: a pointer joins a map, the map pans
   or pinches depending on how many are on it, and the last one off decides
   whether it glides. The edges of the world take a third of what is pulled
   past them and spring back when let go. */
const atlBand = (v, lo, hi) => lo >= hi ? lo : v < lo ? lo - (lo - v) * 0.42 : v > hi ? hi + (v - hi) * 0.42 : v;

function atlPointers(svg, el, it, page, L){
  const pts = new Map();
  const fl = flickTrack();
  let mode = 0, st = null, dn = null, carry = null, hold = 0, moved = 0, grab = 0;
  const unhold = () => { if(hold){ clearTimeout(hold); hold = 0; } };

  /* where in the world the pointer is standing */
  const world = e => {
    const v = atlView(it, L), q = svgAt(svg, e);
    return [v.cx + (q[0] - ATL_W / 2) / v.k, v.cy + (q[1] - v.H / 2) / v.k];
  };
  const startPan = e => {
    const v = atlView(it, L), q = svgAt(svg, e), w = world(e);
    /* what is under the finger is worked out ONCE, here — the whole gesture
       hangs off it, and asking again per move would be asking 177 countries a
       question whose answer cannot have changed. */
    st = { k: v.k, px: q[0], py: q[1], cx: L.cx, cy: L.cy,
           lim: v.globe ? null : atlLimits(it, v.k), globe:v.globe,
           co: atlCoUnder(it, v, q, w) };
    const reg = atlRegOf(it, st.co);
    grab = reg && reg === atlSel(it) && atlOn(it, atlPickLayer()) ? 1 : 0;
    mode = 1;
    L.sx.stopAt(); L.sy.stopAt(); L.sz.stopAt();
  };
  const startPinch = () => {
    const a = [...pts.values()], v = atlView(it, L);
    const mid = svgAt(svg, { clientX: (a[0].x + a[1].x) / 2, clientY: (a[0].y + a[1].y) / 2 });
    st = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z: L.z,
           mx: mid[0], my: mid[1], H: v.H, co: -1,
           wx: v.cx + (mid[0] - ATL_W / 2) / v.k, wy: v.cy + (mid[1] - v.H / 2) / v.k };
    mode = 2;
    L.sx.stopAt(); L.sy.stopAt(); L.sz.stopAt();
  };
  /* ---- picking a country up ----
     THE MAP MUST NOT MOVE WHILE A COUNTRY IS COMING OFF IT. It used to: a drag
     was a pan until the hand left the picture, so pulling Brazil onto the page
     dragged the whole world out to the edge with it and then sprang the world
     back — half a screen of travel each way, for a gesture that was never a pan
     at all. The trouble was that the sentence was only finished at the edge,
     and everything before the edge had to be read as a pan and then unread.

     So the gesture says which one it is BEFORE anything moves. Press on a
     country and hold still for a third of a second and the country comes up
     into the hand: the plop is the map saying it let go. Move before that and
     it is a pan, exactly the pan it has always been, and the hold is off. The
     map is never asked to move and put back, because it is never moved.

     THE PICKED COUNTRY NEEDS NO HOLD AT ALL. It is already the one the reader
     asked for — shaded, named, and the only country on the map that is answering
     to the hand — so a drag off it is a drag OF it, and it comes away on the
     first movement. That is what `grab` is: the hold is how you say WHICH
     country, and a country that has already been said needs no saying twice. */
  const startCarry = e => {
    unhold();
    carry = atlCarry(it, atlRegOf(it, st.co));
    atlCarryAt(carry, e);
    SND.plop();
  };
  const movePan = e => {
    const q = svgAt(svg, e);
    if(st.globe){
      const deg = GEO_R2D / (GEO_GR * st.k);
      atlJump(L, st.cx - (q[0] - st.px) * deg,
                 clamp(st.cy + (q[1] - st.py) * deg, -89.5, 89.5));
      return;
    }
    atlJump(L, atlBand(st.cx - (q[0] - st.px) / st.k, st.lim.x0, st.lim.x1),
               atlBand(st.cy - (q[1] - st.py) / st.k, st.lim.y0, st.lim.y1));
  };
  const movePinch = () => {
    const a = [...pts.values()];
    if(a.length < 2) return;
    const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
    const z = clamp(st.z + Math.log2(d / st.d), atlZMin(it), ATL_ZMAX);
    if(atlGlobe(it)){ atlJump(L, L.cx, L.cy, z); return; }
    const k = atlK(it, z), lim = atlLimits(it, k);
    atlJump(L, clamp(st.wx - (st.mx - ATL_W / 2) / k, lim.x0, lim.x1),
               clamp(st.wy - (st.my - st.H / 2) / k, lim.y0, lim.y1), z);
  };
  /* let go: whatever was pulled past the edge comes back, and whatever was
     thrown carries on and slows down the way a sheet of paper would */
  const release = () => {
    const v = atlView(it, L);
    const box = svg.getBoundingClientRect();
    const s2p = box.width ? ATL_W / box.width : 1;
    const vel = mode === 1 ? fl.vel() : { vx: 0, vy: 0 };
    if(v.globe){
      const deg = s2p * GEO_R2D / (GEO_GR * v.k);
      const vlx = -vel.vx * deg, vly = vel.vy * deg;
      L.sx.set({ response:.55 }).to(L.cx + projectFling(vlx, .992), vlx);
      L.sy.set({ response:.55 }).to(clamp(L.cy + projectFling(vly, .992), -89.5, 89.5), vly);
      mode = 0; st = null;
      return;
    }
    const lim = atlLimits(it, v.k);
    const vcx = -vel.vx * s2p / v.k, vcy = -vel.vy * s2p / v.k;
    L.sx.set({ response: .55 }).to(clamp(L.cx + projectFling(vcx, .992), lim.x0, lim.x1), vcx);
    L.sy.set({ response: .55 }).to(clamp(L.cy + projectFling(vcy, .992), lim.y0, lim.y1), vcy);
    mode = 0; st = null;
  };

  svg.addEventListener('pointerdown', e => {
    if(e.button !== 0 && e.pointerType === 'mouse') return;
    if(!el.classList.contains('sel') || ATL_MOVE.has(it.id)) return;  /* not ours yet: it is an item being moved */
    e.stopPropagation(); e.preventDefault();
    select(it.id);
    try{ svg.setPointerCapture(e.pointerId); }catch(err){}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    fl.track(e);
    /* a hand on the map counts as movement, the same as a spring does: a drag
       jumps the springs rather than running them, so without this the height
       field would be contoured again on every window a pan crossed */
    L.hand = 1;
    if(pts.size === 1){ dn = { x: e.clientX, y: e.clientY }; moved = 0; grab = 0;
                        L.sx.set({ response: .3 }); L.sy.set({ response: .3 }); startPan(e);
                        /* the event itself is not kept — it is stale by the time this
                           runs, and all the hold needs of it is where the finger is */
                        if(atlRegOf(it, st.co)){
                          const at = { clientX: e.clientX, clientY: e.clientY };
                          hold = setTimeout(() => { hold = 0; if(!carry && mode === 1) startCarry(at); }, ATL_HOLD);
                        } }
    else if(pts.size === 2){ unhold(); startPinch(); }
  });
  svg.addEventListener('pointermove', e => {
    if(!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    /* moved before the hold was up: this is a pan, and the country stays put —
       unless it is the picked one, which needs no hold and comes away now */
    if(dn && !moved && Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 5){
      moved = 1; unhold();
      if(grab && mode === 1 && !carry) startCarry(e);
    }
    if(carry) return atlCarryAt(carry, e);
    if(mode === 2) movePinch();
    else if(mode === 1){ fl.track(e); movePan(e); }
  });
  const off = e => {
    if(!pts.has(e.pointerId)) return;
    unhold();
    pts.delete(e.pointerId);
    if(!pts.size) L.hand = 0;
    if(carry){                                       /* a country in the hand: nothing else applies */
      if(pts.size) return;
      const i = st.co, still = !moved && e.type === 'pointerup';
      atlDrop(carry, el, it, page, e, atlRegOf(it, i));
      carry = null; mode = 0; st = null;
      /* held and let go without ever going anywhere: the reader took longer
         over the tap than the hold, and a slow tap is still a tap. atlDrop has
         already found the drop inside the picture and done nothing with it. */
      if(still) atlTap(el, it, page, i);
      return;
    }
    if(pts.size === 1 && mode === 2){                /* one finger lifted off a pinch: carry on panning */
      const id = [...pts.keys()][0], p = pts.get(id);
      startPan({ clientX: p.x, clientY: p.y });
      return;
    }
    if(pts.size) return;
    /* a tap is decided on the way up, the way the periodic table decides one:
       the map has the pointer, so nowhere travelled is what makes it a tap and
       not the beginning of a pan */
    if(mode === 1 && st && dn && e.type === 'pointerup' &&
       Math.hypot(e.clientX - dn.x, e.clientY - dn.y) < 5) atlTap(el, it, page, st.co);
    release();
  };
  svg.addEventListener('pointerup', off);
  svg.addEventListener('pointercancel', off);
}

/* ---- what is under the finger ----
   The ring first — see atlRingAt — and then the polygons. ON THE GLOBE THE
   POLYGONS ARE ASKED IN LONGITUDE AND LATITUDE, NOT IN THE PICTURE: the
   country geometry memoised under 'globe' is for whatever orientation happened
   to build it, and a globe that has turned since is a different picture, so
   asking it was picking a country a quarter of a world away from the finger —
   and then, because that country was sometimes the picked one, dragging it off
   the map instead of turning the globe. The point is taken back to the sphere
   through the CURRENT orientation and asked of the flat world, whose geometry
   never moves. `near` is scaled with it: a picture unit at the middle of the
   disc is 1/π of an equirectangular one. */
function atlCoUnder(it, v, q, w){
  const ring = atlRingAt(it, v, q);
  if(ring >= 0) return ring;
  if(!isFinite(w[0]) || !isFinite(w[1])) return -1;
  if(!v.globe) return geoCoAt(atlVProj(it, v), w[0], w[1], ATL_TINY / v.k);
  const ll = v.P.inv(w[0], w[1]);
  if(!isFinite(ll[0]) || !isFinite(ll[1])) return -1;      /* off the disc */
  const e = geoProj('equirect').fwd(ll[0], ll[1]);
  return geoCoAt('equirect', e[0], e[1], ATL_TINY / v.k / Math.PI);
}

/* ---- picking one, and lighting it up ----
   Tapping the country that is already picked puts it back, so the same tap is
   both halves of the gesture and there is nothing to learn. */
function atlTap(el, it, page, i){
  const k = atlRegOf(it, i), name = k ? geoRegName(k) : '';
  atlPick(el, it, page, (it.sel || '') === name ? '' : name, false);
}
function atlPick(el, it, page, name, blink){
  if(name) it.sel = name; else delete it.sel;
  if(page) queueSave(page.id);
  atlDrawPick(el, it, blink);
  SND.tick();
}
/* ⌕ can change the grain too, and the button that shows which one is on may be
   on screen while it does — the same refresh ⊗ does on a card, for the reason */
function atlToolMarks(el, it){
  const b = el && el.__atlgrain;
  if(!b) return;
  b.classList.toggle('on', atlTapCont(it));
  b.title = 'A tap picks: ' + (atlTapCont(it) ? 'the whole continent — click for countries' : 'a country — click for continents');
  atlToolLabel(b, atlTapCont(it) ? 'Continent' : 'Country');
}
/* One layer's markup, replaced. Everything else about the map — the transform,
   every other layer, the springs mid-flight — is left exactly as it stands,
   which is why picking a country while the map is still gliding does not stop
   it. `blink` is what ⌕ adds: a shade that breathes for a moment so the eye
   finds the country it just asked for, and then leaves it alone. */
function atlDrawPick(el, it, blink){
  const g = el.querySelector('.atworld .atlay[data-l="pick"]');
  if(!g) return;
  const L = atlPickLayer();
  const v = atlView(it, ATL_LIVE.get(it.id) || null);
  if(v.globe && el.querySelector('canvas.atglobeview')){
    atlPaint(el, it, v, true);
    return;
  }
  g.innerHTML = L.world({ it, view: v, paths: atlPathsFor(it, v) });
  clearTimeout(g.__blink);
  g.classList.toggle('blink', !!blink);
  if(blink) g.__blink = setTimeout(() => g.classList.remove('blink'), ATL_BLINK);
}
/* ⌕ takes you there rather than putting you there: the three springs are
   retargeted at the country's own box and the map walks, so the reader sees
   WHERE in the world it went — which is most of what a map is for. */
function atlFlyTo(it, key){
  const L = ATL_LIVE.get(it.id);
  if(!L || !key) return;
  if(atlGlobe(it)){
    const E = geoProj('equirect'), b = geoRegMain('equirect', key);
    const ll = E.inv((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 24);
    const z = clamp(Math.log2(GEO_W / (span * 1.8)), 0, ATL_ZMAX);
    const lon = ll[0] + Math.round((L.cx - ll[0]) / 360) * 360;
    L.sz.set({ response:.8 }).to(z);
    L.sx.set({ response:.8 }).to(lon);
    L.sy.set({ response:.8 }).to(clamp(ll[1], -89.5, 89.5));
    return;
  }
  const b = geoRegMain(atlProj(it), key), g = atlGeom(it);
  const bw = Math.max(b.x1 - b.x0, 8), bh = Math.max(b.y1 - b.y0, 8);
  const k = Math.min(ATL_W / (bw * 1.35), g.H / (bh * 1.35));   /* fit it, with air round it */
  const z = clamp(Math.log2(k * GEO_W / ATL_W), atlZMin(it), ATL_ZMAX);
  const kk = atlK(it, z, g), lim = atlLimits(it, kk);
  L.sz.set({ response: .8 }).to(z);
  L.sx.set({ response: .8 }).to(clamp((b.x0 + b.x1) / 2, lim.x0, lim.x1));
  L.sy.set({ response: .8 }).to(clamp((b.y0 + b.y1) / 2, lim.y0, lim.y1));
}

/* ---- the country in the hand ----
   A shape following the pointer, outside the map and outside the paper: it is
   not an item yet and must not be treated as one, because the drop may never
   happen. On the way down it becomes an ordinary `country` card at the point
   it was let go of; brought back over the map, nothing happened at all. */
function atlCarry(it, key){
  /* A detached country is a flat card, even when it came from the sphere; a
     live orthographic projection is meaningful only with the globe and its
     horizon around it. */
  const proj = atlGlobe(it) ? 'mercator' : atlProj(it), b = geoRegMain(proj, key);
  const w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.y1 - b.y0, 1), m = Math.max(w, h) * .07;
  const d = document.createElement('div');
  d.className = 'atcarry';
  d.innerHTML = '<svg viewBox="' + [rd1(b.x0 - m), rd1(b.y0 - m), rd1(w + 2 * m), rd1(h + 2 * m)].join(' ') +
    '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
    '<path d="' + geoRegPath(proj, it.look || 'smooth', key, 1) + '" stroke-width="' +
    rd1(Math.max(w, h) / 110) + '"/></svg><b>' + esc(geoRegName(key)) + '</b>';
  document.body.appendChild(d);
  return d;
}
const atlCarryAt = (d, e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; };
function atlDrop(d, el, it, page, e, key){
  d.remove();
  const svg = el.querySelector('svg.atmap'), surf = el.parentElement;
  if(e.type !== 'pointerup' || !surf || !key) return;   /* cancelled: nothing happened */
  const b = svg.getBoundingClientRect();
  if(e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom) return;
  atlSpawn(geoRegName(key), it, page, pctFrom(e, surf));
}
/* the one way a country card is ever made: the kind is registered like any
   other, and WHICH country is left here for its maker to pick up — an add-kind
   takes no argument of its own, and inventing one for this would change the
   shape of the registry for every feature that never needed it */
function atlSpawn(name, it, page, at){
  /* the card is the same picture at the country's own distance, so it leaves
     the map wearing what the map was wearing: the projection, the outlines, and
     whichever of height, lakes and rivers were on when it came off */
  ATL_NEXT = { co: name, proj: atlGlobe(it) ? 'mercator' : atlProj(it), look: it.look || 'smooth',
               rel: atlOn(it, ATL_LAYERS.find(L => L.id === 'relief')) ? 1 : 0,
               lak: atlOn(it, ATL_LAYERS.find(L => L.id === 'lakes')) ? 1 : 0,
               riv: atlOn(it, ATL_LAYERS.find(L => L.id === 'rivers')) ? 1 : 0 };
  addItem('country', at, page);
}

/* ---- the popovers ----
   One glass surface for the three things the bar opens — the layers, the
   projection and the ⌕ box. It is anchored to the button that asked for it,
   warps out of that button and back into it, and is gone the moment a hand
   touches anything else: the page, the map, another button, the wheel, Esc.
   The layers used to be a panel that sat on the map until it was told to go,
   and a panel that stays is a panel in the way.

   ATL_POP is the one that is open: which map, which button, what kind. Asking
   for the one already open shuts it, so the button is a toggle. */
let ATL_POP = null;
function atlPopEl(){
  let d = $('#atlpop');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'atlpop glass'; d.id = 'atlpop';
  d.setAttribute('role', 'dialog');
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => e.stopPropagation());
  d.addEventListener('dblclick', e => e.stopPropagation());
  d.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  /* one listener for every row it will ever hold — the rows are built afresh
     each time it opens, the listener is not */
  d.addEventListener('click', e => {
    const b = e.target.closest('button');
    if(!b || !ATL_POP) return;
    const { it, el, page } = ATL_POP;
    if(b.dataset.l){
      atlToggleLayer(el, it, page, b.dataset.l);
      const on = atlOn(it, ATL_LAYERS.find(x => x.id === b.dataset.l));
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      SND.tick();
    }
    else if(b.dataset.p){ atlSetProjection(el, it, page, b.dataset.p); atlPopClose(); }
    else if(b.dataset.s){ atlSetStyle(el, it, page, b.dataset.s); atlPopClose(); }
    else if(b.dataset.k) atlAskTake(b.dataset.k);
  });
  return d;
}
function atlPopMark(anchor, open){
  if(!anchor) return;
  anchor.classList.toggle('open', open);
  if(anchor.hasAttribute('aria-expanded')) anchor.setAttribute('aria-expanded', open ? 'true' : 'false');
}
/* above the bar when there is room — the map stays clear — and below it when
   the bar is at the top of the screen */
function atlPopPlace(d, anchor){
  const r = anchor.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
  d.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
  if(r.top - h - 10 >= 8){ d.style.top = 'auto'; d.style.bottom = (innerHeight - r.top + 10) + 'px'; }
  else { d.style.bottom = 'auto'; d.style.top = clamp(r.bottom + 10, 8, innerHeight - h - 8) + 'px'; }
}
/* the surface, open, with `build`'s markup in it — or nothing, when the call
   was the toggle shutting it */
function atlPopOpen(kind, anchor, it, el, page, build){
  const d = atlPopEl();
  if(ATL_POP && ATL_POP.anchor === anchor && ATL_POP.kind === kind){ atlPopClose(); return null; }
  if(ATL_POP) atlPopMark(ATL_POP.anchor, false);
  ATL_POP = { kind, anchor, it, el, page };
  d.dataset.kind = kind;
  d.innerHTML = build(d);
  atlPopMark(anchor, true);
  d.classList.add('open');
  atlPopPlace(d, anchor);
  const r = anchor.getBoundingClientRect();
  warpIn(d, r.left + r.width / 2, r.top + r.height / 2);
  return d;
}
function atlPopClose(){
  const d = $('#atlpop');
  if(!d || !ATL_POP) return;
  atlPopMark(ATL_POP.anchor, false);
  ATL_POP = null;
  if(d.contains(document.activeElement)) document.activeElement.blur();
  warpOut(d, () => { if(!ATL_POP) d.classList.remove('open'); });
}
window.addEventListener('pointerdown', e => {
  if(ATL_POP && !e.target.closest('#atlpop') && !ATL_POP.anchor.contains(e.target)) atlPopClose();
});
window.addEventListener('wheel', e => { if(ATL_POP && !e.target.closest('#atlpop')) atlPopClose(); },
  { passive: true, capture: true });
window.addEventListener('resize', () => atlPopClose());
window.addEventListener('keydown', e => {
  if(e.key === 'Escape' && ATL_POP){ e.stopPropagation(); atlPopClose(); }
}, true);

/* ---- the layers, as a menu of switches ----
   Built from the registry under the headings the layers name for themselves,
   so a layer written tomorrow is listed tonight. A switch flips the layer
   there and then — the map rebuilds under the open menu — and the menu stays
   until the hand goes elsewhere. */
function atlLayersMenu(it){
  return ATL_GROUPS.map(g => {
    const rows = ATL_LAYERS.filter(L => (L.group || 'Land') === g);
    if(!rows.length) return '';
    return '<div class="atlsec">' + esc(g) + '</div>' + rows.map(L => {
      const on = atlOn(it, L);
      return '<button class="atlrow' + (on ? ' on' : '') + '" data-l="' + esc(L.id) +
        '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><span>' +
        esc(L.label || L.id) + '</span><i class="atlsw" aria-hidden="true"></i></button>';
    }).join('');
  }).join('');
}
/* ---- the projection, as a menu with a tick ---- */
function atlProjMenu(it){
  const cur = atlProj(it);
  return '<div class="atlsec">Projection</div>' + ATL_PROJECTIONS.map(p =>
    '<button class="atlrow' + (p === cur ? ' on' : '') + '" data-p="' + p +
    '" role="menuitemradio" aria-checked="' + (p === cur ? 'true' : 'false') + '"><span>' +
    esc(geoProj(p).label) + '</span><i class="atlck" aria-hidden="true">' + icn('tick') + '</i></button>').join('');
}
defineIcon('tick', '<path d="M6 12.4l3.9 3.9 8.1-8.6"/>');
/* the same place, on the new sheet: the centre is carried across as a
   longitude and a latitude, and the zoom is clamped to what the new
   projection allows */
function atlSetProjection(el, it, page, name){
  const old = atlProj(it), L = ATL_LIVE.get(it.id);
  if(name === old) return;
  let ll = [nz(it.lon, 8), nz(it.lat, 16)];
  if(L) ll = old === 'globe' ? [geoLon(L.cx), L.cy] : geoProj(old).inv(L.cx, L.cy);
  it.proj = name;
  it.lon = ll[0]; it.lat = ll[1];
  if(L){
    L.z = clamp(L.z, atlZMin(it), ATL_ZMAX);
    if(name === 'globe') atlJump(L, ll[0], clamp(ll[1], -89.5, 89.5), L.z);
    else { const c = geoProj(name).fwd(ll[0], ll[1]); atlJump(L, c[0], c[1], L.z); }
  }
  const b = el.__atlproj;
  if(b){ atlToolLabel(b, ATL_PROJ_SHORT[name] || 'Projection'); b.title = 'Projection: ' + geoProj(name).label; }
  queueSave(page.id); atlRebuild(el, it, page);
  SND.tick();
}

/* ---- the ⌕ box: a country by name ----
   The same field the molecules have, over the same kind of list. It serves
   the map and the card both: on a map picking a name walks there and lights
   it up, on a card it is simply which country the card is of. It offers
   CONTINENTS as well as countries — all seven of them when nothing has been
   typed, which is how a reader finds out they can be had at all. */
function atlAskMenu(){
  return '<label class="atlfield">' + icn('search') +
    '<input placeholder="Country or continent" spellcheck="false" autocomplete="off" aria-label="Find a country or a continent"></label>' +
    '<div class="atsug" role="listbox"></div>';
}
function atlAsk(anchor, it, el, page){
  const d = atlPopOpen('search', anchor, it, el, page, atlAskMenu);
  if(!d) return;
  const inp = d.querySelector('input'), sug = d.querySelector('.atsug');
  const list = () => {
    sug.innerHTML = geoFindReg(inp.value, 9).map(k => {
      /* what is said about it under the name: a country's capital, and how many
         countries a continent is — which is the same kind of fact one line down */
      const cont = geoRegKind(k) === 'ct';
      const c = cont ? null : geoCoCapitals(geoRegNum(k))[0];
      const n = cont ? geoContinents()[geoRegNum(k)].cos.length + ' countries' : c ? c.name : '—';
      return '<button data-k="' + k + '" role="option">' + esc(geoRegName(k)) +
        '<small>' + esc(n) + '</small></button>';
    }).join('');
    atlPopPlace(d, anchor);
  };
  inp.addEventListener('input', list);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); atlPopClose(); }
    if(e.key === 'Enter'){ e.preventDefault(); const b = sug.querySelector('button'); if(b) atlAskTake(b.dataset.k); }
    if(e.key === 'ArrowDown'){ e.preventDefault(); const b = sug.querySelector('button'); if(b) b.focus(); }
  });
  sug.addEventListener('keydown', e => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if(!b) return;
    if(e.key === 'Escape'){ e.preventDefault(); atlPopClose(); }
    if(e.key === 'Enter'){ e.preventDefault(); atlAskTake(b.dataset.k); }
    if(e.key === 'ArrowDown' && b.nextElementSibling){ e.preventDefault(); b.nextElementSibling.focus(); }
    if(e.key === 'ArrowUp'){ e.preventDefault(); (b.previousElementSibling || inp).focus(); }
  });
  list();                                          /* nothing typed: the first few, alphabetically */
  inp.focus({ preventScroll: true });
}
function atlAskClose(){ if(ATL_POP && ATL_POP.kind === 'search') atlPopClose(); }
function atlAskTake(key){
  if(!ATL_POP || !key) return;
  const { it, el, page } = ATL_POP;
  atlPopClose();
  if(it.type === 'country'){
    it.co = geoRegName(key); queueSave(page.id); ctryRedraw(el, it, page);
    /* a card that is now a different country is a different shape and a
       different box, so an arrangement it is part of is laid out again round it */
    ctryWeigh(page, it); ctryLayFrom(page, it);
    SND.pop(); return;
  }
  /* THE BOX AND THE MAP AGREE ABOUT WHAT IS BEING PICKED. Ask for a continent
     and the map picks continents from now on; ask for a country and it is back
     to countries. Otherwise the thing just asked for could not be dragged off
     the map, because a press on it would have meant something else. */
  if(geoRegKind(key) === 'ct') it.tap = 'cont'; else delete it.tap;
  atlPick(el, it, page, geoRegName(key), true);
  atlFlyTo(it, key);
  atlToolMarks(el, it);
  SND.pop();
}

/* the wheel zooms about the pointer — by an amount, not a step, so a trackpad
   creeps and a notch is a notch. Ctrl+wheel is still the desk's own zoom. */
function atlZoom(el, it, L, svg, ev, dz){
  const v = atlView(it, L);
  const q = svgAt(svg, ev);
  const z = clamp(L.sz.target + dz, atlZMin(it), ATL_ZMAX);
  if(Math.abs(z - L.sz.target) < 1e-6) return;
  if(v.globe){ L.sz.to(z); return; }
  const wx = v.cx + (q[0] - ATL_W / 2) / v.k, wy = v.cy + (q[1] - v.H / 2) / v.k;
  const k = atlK(it, z, v), lim = atlLimits(it, k);
  L.sz.to(z);
  L.sx.set({ response: .22 }).to(clamp(wx - (q[0] - ATL_W / 2) / k, lim.x0, lim.x1));
  L.sy.set({ response: .22 }).to(clamp(wy - (q[1] - v.H / 2) / k, lim.y0, lim.y1));
}
/* …and the home button walks it back rather than cutting to it */
function atlHome(el, it, L){
  const z = atlZMin(it);
  if(atlGlobe(it)){
    const lon = 8 + Math.round((L.cx - 8) / 360) * 360;
    L.sz.to(z);
    L.sx.set({ response:.45 }).to(lon);
    L.sy.set({ response:.45 }).to(16);
    return;
  }
  const P = geoProj(atlProj(it)), c = P.fwd(8, 16), k = atlK(it, z);
  const lim = atlLimits(it, k);
  L.sz.to(z);
  L.sx.set({ response: .45 }).to(clamp(c[0], lim.x0, lim.x1));
  L.sy.set({ response: .45 }).to(clamp(c[1], lim.y0, lim.y1));
}

/* ---- a layer, flipped ----
   The menu that flips it is atlLayersMenu; what is on is remembered with
   the note, and absent means the layer's own default. */
function atlToggleLayer(el, it, page, id){
  const L = ATL_LAYERS.find(x => x.id === id);
  if(!L) return;
  it.on = Object.assign({}, it.on);
  it.on[id] = atlOn(it, L) ? 0 : 1;
  queueSave(page.id);
  atlRebuild(el, it, page);
}
/* the world's own geometry changed — a layer came or went, or the projection
   did. Everything else is a transform, and never comes through here. */
function atlRebuild(el, it, page){
  const old = el.querySelector('svg.atmap');
  if(!old) return;
  /* built for where the map is NOW, not for where the record last settled —
     a rebuild while zoomed in must not go through the whole world on the way */
  old.outerHTML = atlSVG(it, atlView(it, ATL_LIVE.get(it.id) || null), !!el.querySelector('canvas.atglobeview'));
  atlShape(el, it);
  const L = ATL_LIVE.get(it.id) || atlLive(el, it, page);
  L.el = el;
  atlBuildPins(el, it);
  atlPaint(el, it, atlView(it, L));
  atlPointers(el.querySelector('svg.atmap'), el, it, page, L);
  atlWheel(el, it, page, L);
}
function atlBuildPins(el, it){
  const v = atlView(it, ATL_LIVE.get(it.id) || null);
  const ctx = { it, view: v, paths:v.globe && el.querySelector('canvas.atglobeview') ? {} : atlPathsFor(it, v) };
  for(const L of ATL_LAYERS){
    if(!L.build || !atlOn(it, L)) continue;
    const g = el.querySelector('.atpins .atlay[data-l="' + L.id + '"]');
    if(g && !g.firstChild) g.innerHTML = L.build(ctx);
  }
}
function atlWheel(el, it, page, L){
  const svg = el.querySelector('svg.atmap');
  if(!svg) return;
  svg.addEventListener('wheel', e => {
    if(e.ctrlKey || e.metaKey || ATL_MOVE.has(it.id)) return;
    e.preventDefault(); e.stopPropagation();
    atlZoom(el, it, L, svg, e, clamp(wheelPx(e), -140, 140) * -0.0026);
  }, { passive: false });
}

/* ---- a map is still a thing on a page ----
   The same bargain a plot makes: once selected the map owns what happens
   inside it, and a double-click hands it back to the notebook so it can be
   dragged, rotated and filed like anything else. */
function atlMove(el, it, on){
  if(on) ATL_MOVE.add(it.id); else ATL_MOVE.delete(it.id);
  el.classList.toggle('atmove', !!on);
}

function wireAtlas(el, it, page){
  const tb = el.querySelector(':scope > .tools');
  if(tb) atlToolbar(tb, it);                        /* shared buttons exist by wire time */
  const L = atlLive(el, it, page);
  if(ATL_MOVE.has(it.id)) el.classList.add('atmove');
  atlShape(el, it);
  atlBuildPins(el, it);
  atlPaint(el, it, atlView(it, L));
  const svg = el.querySelector('svg.atmap');
  if(svg){
    svg.addEventListener('mousedown', e => { if(e.button === 1) e.preventDefault(); });
    atlPointers(svg, el, it, page, L);
    atlWheel(el, it, page, L);
  }
  el.addEventListener('dblclick', e => {
    e.stopPropagation(); e.preventDefault();
    atlMove(el, it, !ATL_MOVE.has(it.id));
  });
}

/* ---- how it is named when it is an icon ---- */
function atlGlyph(it){
  return svgIcon('<path class="fsheet" d="M5 9 H91 V119 H5 Z"/>' +
    '<circle class="fplate" cx="48" cy="56" r="31"/>' +
    '<path class="frule" d="M17 56 H79" fill="none"/>' +
    '<path class="frule" d="M48 25c9 9 13.5 19.3 13.5 31S57 78 48 87c-9-9-13.5-19.3-13.5-31S39 34 48 25z" fill="none"/>' +
    extBand('WORLD'));
}
const atlWhere = it => {
  const la = nz(it.lat, 16), lo = nz(it.lon, 8);
  return Math.abs(la).toFixed(1) + (la < 0 ? '°S' : '°N') + ' ' +
         Math.abs(lo).toFixed(1) + (lo < 0 ? '°W' : '°E');
};

defineItem('atlas', {
  add: { atlas: base => ({ ...base, type:'atlas', w:52, rot:0, cap:'',
                           proj:'mercator', look:'smooth', ar:0.5,
                           lon:8, lat:16, zm:0, on:{} }) },
  sound: 'plop',
  html: (it, c) => '<figure class="body atlas"><div class="atbox">' +
    (c.live ? '<canvas class="atglobeview" aria-hidden="true"></canvas>' : '') +
    atlSVG(it, null, c.live) + '</div><figcaption></figcaption></figure>',
  /* print, the overview and an export come through here too, which is how a
     map that was never on screen still gets its labels put in the right place */
  mount(el, it, c){
    atlShape(el, it);
    atlBuildPins(el, it);
    atlPaint(el, it, atlView(it, c.live ? ATL_LIVE.get(it.id) : null));
    if(!c.live) el.querySelectorAll('.atpins .atcap:not(.on)').forEach(n => n.remove());
  },
  forget(it){
    ATL_LIVE.delete(it.id); ATL_MOVE.delete(it.id);
    if(ATL_POP && ATL_POP.it.id === it.id) atlPopClose();
  },
  tools(mk, it, el, page){
    mk('◍', 'Layers — what is drawn on the map',
      b => atlPopOpen('layers', b, it, el, page, () => atlLayersMenu(it)));
    el.__atlstyle = mk('◐', 'Style — the colours of the sea, the land and the countries',
      b => atlPopOpen('style', b, it, el, page, () => atlStyleMenu(it)));
    mk('⌕', 'Find a country or a continent — the map walks there and lights it up',
      b => atlAsk(b, it, el, page));
    /* ---- the grain ----
       One button, and it changes one thing: what a press on the map means. The
       shading, the name, the hold and the drag off onto the page all read
       `it.sel`, and none of them knows the difference. The button says which
       grain is ON, and is lit when it is the wider one. */
    const tg = mk('▣', '', () => {
      const k = atlSel(it);
      if(atlTapCont(it)) delete it.tap; else it.tap = 'cont';
      atlToolMarks(el, it);
      /* what was picked is picked again at the new grain — a country widens to
         the continent it is in, and a continent, which no tap could now mean,
         is put back down */
      let name = it.sel || '';
      if(atlTapCont(it) && geoRegKind(k) === 'co'){
        const c = geoContOf(geoRegNum(k));
        name = c >= 0 ? geoContName(c) : '';
      }else if(!atlTapCont(it) && geoRegKind(k) === 'ct') name = '';
      atlPick(el, it, page, name, false);
    });
    tg.__it = it; el.__atlgrain = tg;
    atlToolMarks(el, it);
    /* the projection is a menu with a tick, and the button wears the answer */
    const projection = mk('◎', 'Projection: ' + geoProj(atlProj(it)).label,
      b => atlPopOpen('projection', b, it, el, page, () => atlProjMenu(it)));
    el.__atlproj = projection;
    /* …and the way back out: the whole world again, walked to rather than cut to */
    mk('⌂', 'Reset the view — back out to the whole world', () => {
      const L = ATL_LIVE.get(it.id);
      if(L) atlHome(el, it, L);
      SND.tick();
    });
  },
  wire(el, it, page){ wireAtlas(el, it, page); },
  icon: it => atlGlyph(it),
  label: () => 'World',
  meta: it => geoProj(atlProj(it)).label + ' · ' + atlWhere(it)
});
onNoteOpen(() => { ATL_LIVE.clear(); ATL_MOVE.clear(); ATL_NEXT = null; atlPopClose(); });

/* ---- how it looks ----
   Quiet: a wash of sea, a wash of land, and hairlines. The lines take their
   colour from the ink, so the outline is dark on paper and white in the dark
   themes with nothing here to switch. NOTHING in here may set stroke-width on
   a path under .atworld — see the note in atlPaint. */
addCSS('atlas', `
/* ---------- the atlas ---------- */
.item[data-type="atlas"]{--atlu:clamp(.72,var(--scale),1.12);--atlbar:#1b2128}
/* ---- the bar ----
   A floating strip of glass over the map, centred, one line: line icons with
   their names under them, in groups. It is the same material every floating
   surface in the app is made of, dark so the map under it stays the picture. */
.item[data-type="atlas"] > .tools{
  left:50%;transform:translateX(-50%);width:max-content;
  max-width:min(calc(100vw - 28px),calc(var(--atlu)*1240px));
  gap:calc(var(--atlu)*2px);align-items:stretch;overflow-x:auto;overflow-y:hidden;
  scrollbar-width:none;padding:calc(var(--atlu)*5px);
  margin-bottom:calc(var(--atlu)*12px);border:0;
  border-radius:calc(var(--atlu)*16px);color:#eef2f3;
  background:
    linear-gradient(160deg,rgba(255,255,255,.075),rgba(255,255,255,.02) 45%,rgba(255,255,255,0) 75%),
    color-mix(in srgb,var(--atlbar) 86%,transparent);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),inset 0 1px 0 rgba(255,255,255,.1),
    0 calc(var(--atlu)*14px) calc(var(--atlu)*40px) rgba(0,0,0,.42),0 2px 8px rgba(0,0,0,.28);
  backdrop-filter:blur(calc(var(--atlu)*24px)) saturate(1.5);
  -webkit-backdrop-filter:blur(calc(var(--atlu)*24px)) saturate(1.5);
  isolation:isolate}
.item[data-type="atlas"] > .tools::-webkit-scrollbar{display:none}
.item.sel[data-type="atlas"] > .tools{animation:atlbarin .2s cubic-bezier(.2,.8,.25,1) both}
@keyframes atlbarin{from{opacity:0;transform:translateX(-50%) translateY(calc(var(--atlu)*5px)) scale(.985)}
  to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
.item[data-type="atlas"] > .tools > button{
  position:relative;flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:calc(var(--atlu)*4px);min-width:calc(var(--atlu)*62px);height:calc(var(--atlu)*54px);
  padding:0 calc(var(--atlu)*8px);border-radius:calc(var(--atlu)*11px);
  font-size:0;line-height:1;color:rgba(240,244,246,.8);opacity:1;
  transition:background-color .14s ease,color .14s ease,transform .12s cubic-bezier(.2,.8,.3,1)}
.item[data-type="atlas"] > .tools > button .ic{width:calc(var(--atlu)*22px);height:calc(var(--atlu)*22px);flex:none}
.item[data-type="atlas"] > .tools > button .lb{
  font-family:system-ui,-apple-system,"SF Pro Text","Helvetica Neue",sans-serif;
  font-size:max(9.5px,calc(var(--atlu)*10.5px));font-weight:500;letter-spacing:.01em;white-space:nowrap}
.item[data-type="atlas"] > .tools > button:hover{background:rgba(255,255,255,.085);color:#fff}
.item[data-type="atlas"] > .tools > button:active{transform:scale(.94)}
.item[data-type="atlas"] > .tools > button.on,
.item[data-type="atlas"] > .tools > button.open{color:#fff;background:color-mix(in srgb,var(--accent2) 36%,transparent)}
.item[data-type="atlas"] > .tools > .atltoolsep{
  display:block;flex:0 0 1px;width:1px;align-self:center;height:calc(var(--atlu)*28px);
  margin:0 calc(var(--atlu)*5px);background:rgba(255,255,255,.14);pointer-events:none}
/* Keep the rotation pin clear of the taller centred material. */
.item.sel[data-type="atlas"] > .rot{margin-bottom:calc(var(--atlu)*88px)}
@media (prefers-reduced-motion:reduce){
  .item.sel[data-type="atlas"] > .tools{animation:none}
  .item[data-type="atlas"] > .tools > button{transition:none}
  .item[data-type="atlas"] > .tools > button:active{transform:none}}
@media (prefers-reduced-transparency:reduce){
  .item[data-type="atlas"] > .tools{background:var(--atlbar);backdrop-filter:none;-webkit-backdrop-filter:none}}
@media (prefers-contrast:more){
  .item[data-type="atlas"] > .tools{background:#0b0f13;box-shadow:inset 0 0 0 1px #e8f4f6}
  .item[data-type="atlas"] > .tools > button{color:#fff}}
/* ---- the styles ----
   EVERY COLOUR THE MAP PAINTS IS A VARIABLE, set here per data-atstyle and
   read by the SVG rules below and by the globe's canvas (atlGlobePalette).
   'paper' is the note's own theme mixed the way the map always mixed it; the
   others are fixed pictures. A style is this block and a line in ATL_STYLES,
   and nothing else. The six country tints are what the Countries layer fills
   with; on Paper they are hues folded into the land so they sit on any sheet. */
[data-atstyle]{
  --atsea0:color-mix(in srgb,var(--accent2) 15%,var(--paper));
  --atsea1:color-mix(in srgb,var(--accent2) 10%,var(--paper));
  --atsea2:color-mix(in srgb,var(--accent2) 30%,var(--paper));
  --atland:color-mix(in srgb,var(--paper) 88%,var(--ink));
  --atcoast:var(--ink);--atbord:var(--ink);
  --atlake:color-mix(in srgb,var(--accent2) 34%,var(--paper));
  --atlakeline:color-mix(in srgb,var(--accent2) 70%,var(--ink));
  --atriver:color-mix(in srgb,var(--accent2) 72%,var(--ink));
  --atrelsea:color-mix(in srgb,var(--accent2) 12%,var(--paper));
  --atlbl:var(--ink);--athalo:var(--paper);
  --atedge:color-mix(in srgb,var(--ink) 58%,var(--accent2));--atmark:var(--accent);
  --atseaname:color-mix(in srgb,var(--accent2) 62%,var(--ink));
  --atco0:color-mix(in srgb,#e8825a 30%,var(--atland));--atco1:color-mix(in srgb,#e2b93b 32%,var(--atland));
  --atco2:color-mix(in srgb,#6fae6a 30%,var(--atland));--atco3:color-mix(in srgb,#5f8fd6 28%,var(--atland));
  --atco4:color-mix(in srgb,#b07cc6 28%,var(--atland));--atco5:color-mix(in srgb,#4fb3b0 30%,var(--atland))}
[data-atstyle="atlas"]{
  --atsea0:#d3e6f0;--atsea1:#c4dbe9;--atsea2:#adcbdf;--atland:#f2ebd8;--atcoast:#5d4f3c;--atbord:#86755c;
  --atlake:#c4dbe9;--atlakeline:#6e93ad;--atriver:#5d8dab;--atrelsea:#cbdfeb;--atlbl:#2a241d;--athalo:#f7f2e6;
  --atedge:#86755c;--atseaname:#4d7a95;
  --atco0:#f0d3bd;--atco1:#efe1b0;--atco2:#d3e2bf;--atco3:#cbd8e8;--atco4:#e3d2e4;--atco5:#c9e0d8}
[data-atstyle="political"]{
  --atsea0:#dbeaf3;--atsea1:#cfe2ee;--atsea2:#bcd5e6;--atland:#ece7dc;--atcoast:#4c463f;--atbord:#6f6760;
  --atlake:#cfe2ee;--atlakeline:#6b8fa8;--atriver:#6b8fa8;--atrelsea:#d4e5ef;--atlbl:#201d19;--athalo:#fbf9f4;
  --atedge:#6f6760;--atseaname:#4f7d9b;
  --atco0:#f5c7b2;--atco1:#f3dd98;--atco2:#bfdcb0;--atco3:#b9cdee;--atco4:#dcc4e4;--atco5:#b3dbd6}
[data-atstyle="night"]{
  --atsea0:#101c2b;--atsea1:#0c1522;--atsea2:#080e18;--atland:#2b3441;--atcoast:#d3dde8;--atbord:#8a9ab0;
  --atlake:#142536;--atlakeline:#4a6d8f;--atriver:#4d86ad;--atrelsea:#101c2b;--atlbl:#e9eff6;--athalo:#0b121c;
  --atedge:#6f8aa8;--atmark:#ff9a62;--atseaname:#7ea3c4;
  --atco0:#4a3a3c;--atco1:#4a4634;--atco2:#344a3b;--atco3:#334458;--atco4:#443a52;--atco5:#33484a}
[data-atstyle="blueprint"]{
  --atsea0:#16437f;--atsea1:#123a70;--atsea2:#0e2f5c;--atland:#1d5096;--atcoast:#eaf3ff;--atbord:#a9c6ee;
  --atlake:#123a70;--atlakeline:#cfe0f7;--atriver:#cfe0f7;--atrelsea:#16437f;--atlbl:#ffffff;--athalo:#123a70;
  --atedge:#cfe0f7;--atmark:#ffd166;--atseaname:#dbe8fb;
  --atco0:#245ea9;--atco1:#1a4b8f;--atco2:#2b69b7;--atco3:#17458a;--atco4:#3071bf;--atco5:#1f57a0}
[data-atstyle="sepia"]{
  --atsea0:#e9dec7;--atsea1:#e0d2b6;--atsea2:#d3c19f;--atland:#cbb691;--atcoast:#4a3a26;--atbord:#72603f;
  --atlake:#e0d2b6;--atlakeline:#7f6a47;--atriver:#7f6a47;--atrelsea:#e2d6bd;--atlbl:#382b1b;--athalo:#efe5d0;
  --atedge:#72603f;--atseaname:#7a6446;
  --atco0:#d2b48f;--atco1:#cdbb8a;--atco2:#bdb88e;--atco3:#c2b797;--atco4:#c9ae95;--atco5:#bcb28c}
.atlas{display:block}
.atbox{position:relative}
.atglobeview{display:none;position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.atglobeview.on{display:block}
svg.atmap{position:relative;z-index:1;display:block;width:100%;height:auto;background:none;touch-action:none;
  shape-rendering:geometricPrecision}
/* ---- a round world is a disc on the page ----
   No paper behind it, no padding round it, and the ring core draws round a
   selected item follows the disc: what sits on the page is the ball itself,
   with the shadow a ball casts. */
.item.atround .atlas{background:none;padding:0;box-shadow:none}
.item.atround .atbox{border-radius:50%;overflow:hidden;
  box-shadow:0 calc(var(--scale)*10px) calc(var(--scale)*26px) rgba(0,0,0,.3)}
.item.sel.atround > .body{box-shadow:none}
.item.sel.atround .atbox{box-shadow:0 0 0 1px var(--accent2),
  0 calc(var(--scale)*10px) calc(var(--scale)*26px) rgba(0,0,0,.3)}
.item.atround .atlas figcaption{padding-top:calc(var(--scale)*6px)}
.item.atround .atlas figcaption:empty::before{content:none}
.item.sel.atround .atlas figcaption:empty::before{content:"caption";opacity:.35}
.item.sel.atround .atlas figcaption:empty{min-height:1em}
.atmap .atsea0{stop-color:var(--atsea0);stop-opacity:1}
.atmap .atsea1{stop-color:var(--atsea1);stop-opacity:1}
.atmap .atsea2{stop-color:var(--atsea2);stop-opacity:1}
.atmap .atedge{fill:none;stroke:var(--line);stroke-width:2;opacity:.8}
.atmap[data-projection="globe"] .atedge{opacity:.34}
.atmap .atglobeshade{pointer-events:none}
.atmap .atglobeedge{fill:none;stroke:var(--atedge);
  stroke-width:2;vector-effect:non-scaling-stroke;pointer-events:none}
.atmap .atlay{fill:none;stroke-linejoin:round;stroke-linecap:round}
/* a layer that has just been rebuilt at a finer step: the old picture, on top
   of the new one, on its way out. See atlSwap — nothing else ever has this */
.atmap .atfade{transition:opacity .26s linear}   /* ATL_FADE */
.atmap .atfade.off{opacity:0}
@media (prefers-reduced-motion:reduce){.atmap .atfade{transition:none}}
.atmap path.atland{fill:var(--atland);fill-rule:evenodd;stroke:none}
/* the countries, each in its tint — see the layer */
.atmap path.atco{fill-rule:evenodd;stroke:none}
.atmap .atco0{fill:var(--atco0)}.atmap .atco1{fill:var(--atco1)}.atmap .atco2{fill:var(--atco2)}
.atmap .atco3{fill:var(--atco3)}.atmap .atco4{fill:var(--atco4)}.atmap .atco5{fill:var(--atco5)}
.atmap path.atgrat{fill:none;stroke:var(--atbord);stroke-opacity:.35}
/* the degrees along the edges, and the names on the water */
.atmap text.atgl{visibility:hidden;font-family:var(--mono);font-size:12px;letter-spacing:.04em;
  fill:var(--atlbl);fill-opacity:.62;stroke:var(--athalo);stroke-width:3;paint-order:stroke;pointer-events:none}
.atmap text.atgl.on{visibility:visible}
.atmap text.atsea{visibility:hidden;font-family:var(--disp);font-size:${ATL_SEAFS[0]}px;font-weight:500;
  letter-spacing:.1em;text-anchor:middle;fill:var(--atseaname);fill-opacity:.85;
  stroke:var(--athalo);stroke-width:2.5;paint-order:stroke;stroke-linejoin:round;pointer-events:none}
.atmap text.atsea.atocean{font-size:${ATL_SEAFS[1]}px;letter-spacing:.22em;text-transform:uppercase}
.atmap text.atsea.on{visibility:visible;animation:atpin .18s ease-out}
.atmap path.atcoast{fill:none;stroke:var(--atcoast);stroke-opacity:.9}
.atmap path.atbord{fill:none;stroke:var(--atbord);stroke-opacity:.3}
/* ---- the names ----
   Every capital, city and ring is a node from the start, and the frame decides
   which of them is set. A node that is not set is INVISIBLE, not transparent:
   visibility:hidden costs the painter nothing, where opacity:0 still has to be
   considered, and — the part that showed up as lag — a TRANSITION on opacity
   made every name that came or went during a pan its own running animation,
   sixty of them a second at the edges of the picture, each one an offscreen
   group to composite. A name now arrives with a short fade, played once, and
   leaves at once, which is what a label on a moving map does anyway. */
.atmap .atcap,.atmap .atcity,.atmap .attiny{visibility:hidden;opacity:0;pointer-events:none}
.atmap .atcap.on,.atmap .atcity.on{visibility:visible;opacity:1;animation:atpin .18s ease-out}
.atmap .attiny.on{visibility:visible;opacity:.55;animation:atpin .2s ease-out}
@keyframes atpin{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.atmap .atcap.on,.atmap .atcity.on,.atmap .attiny.on{animation:none}}
.atmap circle.atdot{fill:var(--atmark);stroke:var(--athalo);stroke-width:2}
.atmap text.atname{font-family:var(--disp);font-size:${ATL_FS}px;font-weight:600;letter-spacing:.4px;
  fill:var(--atlbl);stroke:var(--athalo);stroke-width:5;paint-order:stroke;stroke-linejoin:round}
/* the picked country: a wash of the accent over it, its own outline inked, and
   its name written across it. All of it is in WORLD units inside the group that
   moves, which is why the name goes on fitting the country however far in the
   map is taken.

   THE NAME IS SET THE WAY AN ATLAS SETS ONE and not the way a heading is:
   capitals, tracked out, one weight down from a title, in ink the map can be
   read through and behind a halo thin enough to be a halo. The size is not the
   biggest that fits either — geoCoLabel keeps GEO_LBL_AIR of the room it found
   and gives the rest back, because a name grown until the border stops it is a
   sticker on a country rather than a label on a map. */
.atmap path.atpick{fill:color-mix(in srgb,var(--accent) 30%,transparent);fill-rule:evenodd;
  stroke:var(--accent);stroke-linejoin:round}
.atconame{font-family:var(--disp);font-weight:600;text-transform:uppercase;
  letter-spacing:${GEO_LBL_TRK}em;text-anchor:middle;
  fill:color-mix(in srgb,var(--atlbl,var(--ink)) 74%,transparent);
  stroke:color-mix(in srgb,var(--athalo,var(--paper)) 78%,transparent);
  paint-order:stroke;stroke-linejoin:round;pointer-events:none}
/* ⌕ lit it: it breathes for a moment and is then left alone */
.atmap .atlay.blink path.atpick{animation:atblink 1.1s ease-in-out 0s infinite}
@keyframes atblink{
  0%,100%{fill-opacity:.28;stroke-opacity:.55}
  50%{fill-opacity:.85;stroke-opacity:1}
}
@media (prefers-reduced-motion: reduce){ .atmap .atlay.blink path.atpick{animation:none;fill-opacity:.7} }
/* a country in the hand, on its way off the map. Not an item yet — the drop
   may never happen — so it is a shape following the pointer and nothing else */
.atcarry{position:fixed;left:0;top:0;z-index:90;pointer-events:none;width:132px;
  transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;
  filter:drop-shadow(0 6px 14px rgba(0,0,0,.35))}
.atcarry svg{display:block;width:100%;height:96px;overflow:visible}
.atcarry path{fill:color-mix(in srgb,var(--accent) 62%,var(--paper));stroke:var(--ink);
  stroke-linejoin:round;fill-rule:evenodd}
.atcarry b{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:#fff;
  background:var(--accent);padding:2px 7px;border-radius:2px;white-space:nowrap}
/* ---- the popover ----
   One glass surface for the layers, the projection and the ⌕ box, anchored to
   the button that opened it. Rows are 32 high and read in the system face;
   a layer is a switch, a projection is a tick, a country is a line with its
   capital at the far end. */
.atlpop{position:fixed;z-index:83;display:none;width:236px;padding:6px;border-radius:14px;
  font-family:system-ui,-apple-system,"SF Pro Text","Helvetica Neue",sans-serif;color:#e9eaef;
  will-change:transform,filter,opacity}
.atlpop.open{display:block}
.atlsec{padding:8px 10px 4px;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:rgba(233,234,239,.42)}
.atlsec:first-child{padding-top:5px}
.atlrow{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;height:32px;
  padding:0 10px;border-radius:9px;font-family:inherit;font-size:12.5px;font-weight:450;
  color:rgba(233,234,239,.9);text-align:left;transition:background-color .12s ease}
.atlrow:hover,.atlrow:focus-visible{background:rgba(255,255,255,.08);color:#fff;outline:none}
.atlrow:active{background:rgba(255,255,255,.12)}
/* the switch — a track and a knob, the knob thrown over with a little overshoot */
.atlsw{position:relative;flex:none;width:30px;height:18px;border-radius:9px;background:rgba(255,255,255,.18);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);transition:background-color .2s ease}
.atlsw::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .24s cubic-bezier(.3,1.25,.5,1)}
.atlrow.on .atlsw{background:var(--accent2)}
.atlrow.on .atlsw::after{transform:translateX(12px)}
/* the style rows: four dots of the style — sea, land, two tints — before the name */
.atlrow.atlstyle{justify-content:flex-start}
.atlrow.atlstyle > span{flex:1}
.atlswatch{display:flex;gap:3px;flex:none;padding:3px;border-radius:99px;background:rgba(255,255,255,.06)}
.atlswatch b{display:block;width:11px;height:11px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
/* the tick */
.atlck{display:flex;flex:none;width:16px;height:16px;opacity:0;color:var(--accent2);transition:opacity .12s}
.atlck .ic{width:16px;height:16px}
.atlrow.on .atlck{opacity:1}
/* the field */
.atlfield{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:9px;
  background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);cursor:text;
  transition:box-shadow .14s ease}
.atlfield .ic{width:15px;height:15px;opacity:.55;flex:none}
.atlfield input{flex:1;min-width:0;background:none;border:0;outline:0;color:inherit;font:inherit;font-size:12.5px}
.atlfield input::placeholder{color:rgba(233,234,239,.4)}
.atlfield:focus-within{box-shadow:inset 0 0 0 1.5px var(--accent2)}
.atsug{display:flex;flex-direction:column;gap:1px;margin-top:6px;max-height:230px;overflow:auto;scrollbar-width:thin}
.atsug:empty{margin:0}
.atsug button{display:flex;justify-content:space-between;align-items:baseline;gap:10px;width:100%;
  padding:7px 10px;border-radius:9px;font-family:inherit;font-size:12.5px;color:rgba(233,234,239,.9);text-align:left}
.atsug button small{font-size:11px;opacity:.5;white-space:nowrap}
.atsug button:hover,.atsug button:focus{background:var(--accent2);color:#fff;outline:none}
.atsug button:hover small,.atsug button:focus small{opacity:.85}
@media (prefers-reduced-motion:reduce){.atlrow,.atlsw,.atlsw::after,.atlck,.atlfield{transition:none}}
/* the height of the land: hypsometric tints, the convention rather than the
   theme — but the theme owns the sea painted back over the coast, and how
   heavily the tints are laid on */
.atmap .atlay[data-l="relief"]{opacity:.92}
.atmap .atlay[data-l="relief"] path{stroke:none}
.atmap path.atrelsea{fill:var(--atrelsea);fill-rule:evenodd}
/* water. A lake is the sea's own colour, which is what makes it read as water.
   FILL-OPACITY AND STROKE-OPACITY, NEVER PLAIN OPACITY, AND THAT IS THE WHOLE
   OF WHY LAKES ARE FAST. Bare opacity on a shape that is both filled and inked
   is a GROUP: the browser has to paint the shape into an offscreen buffer the
   size of its box and composite it, and this path's box is the whole world
   — four thousand units square, times the zoom, redone on every frame of every
   pan. The two paint opacities say the same thing about one shape and need no
   buffer at all. The stroke-only paths below are the same rule, kept the same
   way: nothing under .atworld may carry a bare opacity of its own. */
.atmap path.atlake{fill:var(--atlake);fill-opacity:.95;stroke:var(--atlakeline);stroke-opacity:.95}
.atmap path.atriver{fill:none;stroke:var(--atriver);stroke-opacity:.75}
/* the cities: the capitals again, quieter — see the note over the layer */
.atmap circle.atcdot{fill:none;stroke:var(--atlbl);stroke-width:1.6;opacity:.75}
.atmap text.atcname{font-family:var(--disp);font-size:${rd1(ATL_CFS)}px;font-weight:500;letter-spacing:.3px;
  fill:var(--atlbl);opacity:.82;stroke:var(--athalo);stroke-width:3.5;paint-order:stroke;stroke-linejoin:round}
/* and the ring round a country smaller than the pen */
.atmap .attiny circle{fill:none;stroke:var(--atmark);stroke-width:1.5}
/* selected, the map takes the hand; picked up, it is an item again */
.item.sel[data-type="atlas"] svg.atmap{cursor:grab}
.item.sel[data-type="atlas"] svg.atmap:active{cursor:grabbing}
.item.sel[data-type="atlas"].atmove svg.atmap{cursor:grab}
.item.atmove .atlas{box-shadow:0 0 0 calc(var(--scale)*2px) var(--accent),
  0 calc(var(--scale)*10px) calc(var(--scale)*22px) rgba(0,0,0,.25)}
.item.atround.atmove .atlas{box-shadow:none}
.item.atround.atmove .atbox{box-shadow:0 0 0 calc(var(--scale)*2px) var(--accent),
  0 calc(var(--scale)*10px) calc(var(--scale)*22px) rgba(0,0,0,.25)}
.item.atmove .atlas::after{content:"✥ move — double-click to work in the map";position:absolute;
  right:0;top:100%;margin-top:calc(var(--scale)*3px);white-space:nowrap;pointer-events:none;
  font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.08em;
  color:#fff;background:var(--accent);padding:calc(var(--scale)*2px) calc(var(--scale)*6px);border-radius:2px}
`);

/* its tile in the palette */
defineIcon('globe', '<circle cx="12" cy="12" r="8.2"/><path d="M3.9 12h16.2"/>' +
  '<path d="M12 3.8c2.4 2.4 3.6 5.1 3.6 8.2s-1.2 5.8-3.6 8.2c-2.4-2.4-3.6-5.1-3.6-8.2s1.2-5.8 3.6-8.2z"/>');
defineTool({ kind:'atlas', cat:'science', label:'World', icon:'globe', order:60,
  hint:'A map of the world — pan it, zoom it, and the capitals come up to meet you' });

/* ================= one country =================
   What comes off the map when a country is dragged out of it, and a tile on the
   Science shelf in its own right. It is the same geometry seen from one
   country's own distance: nothing here pans, nothing zooms, nothing is live,
   and there is no transform on anything — the viewBox IS the country's box, so
   the shape arrives at the size of the card whatever size the card is. Which is
   also why print, an export and a thumbnail get it with no mount() at all.

   `co` is the country's name, the same as a map's `it.sel`, and for the same
   reason. Prefix `ctry`. */
function ctryGeom(it){
  const proj = atlProj(it), key = geoRegKeyOf(it.co);
  if(!key) return null;
  const b = geoRegMain(proj, key);
  /* NO FLOOR ON THE SPAN, and no fixed number of decimal places on the
     viewBox. Both are the same mistake: a card is the one picture in this
     feature drawn at the country's OWN scale rather than the world's, and the
     Vatican is a fiftieth of a world unit across. Rounded to a tenth of a unit
     it is a point; floored at one unit it is a speck in fifty Vaticans of
     empty sea. Everything here is measured in `u`, the country's own span. */
  const w = Math.max(b.x1 - b.x0, 1e-9), h = Math.max(b.y1 - b.y0, 1e-9);
  const u = Math.max(w, h), m = u * 0.06;
  const p = Math.max(1, Math.pow(10, Math.ceil(4 - Math.log10(u))));
  const r = v => Math.round(v * p) / p;
  const cont = geoRegKind(key) === 'ct';
  return { key, cont, i: cont ? -1 : geoRegNum(key), at: geoReg(proj, key).at,
           proj, look: it.look || 'smooth', b, w, h, u, m, r,
           vb: [r(b.x0 - m), r(b.y0 - m), r(w + 2 * m), r(h + 2 * m)] };
}
/* a capital into the region's own frame — Suva is at 178°E and Fiji's frame is
   just past the 180th, so the dot has to be carried the same way the rings were.
   A region knows where it put each of its countries, and it is that country's
   place a capital is carried to: Papeete is in Oceania's frame to the EAST of
   Australia, which is the same side of the picture French Polynesia is on. */
function ctryCapXY(g, c){
  const P = geoProj(g.proj), q = P.fwd(c.lon, c.lat), W = P.wrap;
  if(!W) return q;
  const home = g.at.get(geoCoIndexOf(c.of));
  q[0] += Math.round(((home == null ? (g.b.x0 + g.b.x1) / 2 : home) - q[0]) / W) * W;
  return q;
}
/* ---- every capital in a continent, and the ones that fit ----
   The map's own layout, in the card's own units: biggest city first, a name is
   set if its box is clear of every box already down, and the continent's own
   name is handed in as a box that is taken before any of them. A plate of
   Africa carries a dozen names and not fifty-six, and they are the dozen an
   atlas would have set. */
function ctryCapsSVG(G, sw){
  const g = G.g, r = g.r, vb = G.vb, fs = g.u / 34, dot = g.u / 150;
  const cands = [];
  for(const c of geoRegCapitals(g.key)){
    const q = ctryCapXY(g, c);
    /* Barlow Condensed is narrow, and this only has to be right enough to keep
       two names off each other — the same measure the map makes */
    const w = c.name.length * fs * 0.46 + dot * 3;
    const flip = q[0] + w > vb[0] + vb[2];
    cands.push({ c, x: q[0], y: q[1], flip,
      box: { x: (flip ? q[0] - w : q[0] - dot) - vb[0], y: q[1] - fs * 0.62 - vb[1],
             w: w + dot, h: fs * 1.2 } });
  }
  const lb = G.under ? null : G.lb;
  const seed = lb && lb.fs > 0
    ? [{ x: lb.x - lb.w / 2 - vb[0], y: lb.y - lb.h / 2 - vb[1], w: lb.w, h: lb.h }] : [];
  return geoLayout(cands, vb[2], vb[3], 0, seed).map(t =>
    '<g class="ctrycap"><circle class="ctrydot" cx="' + r(t.x) + '" cy="' + r(t.y) +
    '" r="' + r(dot) + '" stroke-width="' + r(dot * 0.55) + '"/>' +
    '<text class="ctrycapn" x="' + r(t.x + (t.flip ? -dot * 2.1 : dot * 2.1)) +
    '" y="' + r(t.y + fs * 0.34) + '" font-size="' + r(fs) +
    '" stroke-width="' + r(fs * 0.17) + '" text-anchor="' + (t.flip ? 'end' : 'start') +
    '">' + esc(t.c.name) + '</text></g>').join('');
}
/* ---- the picture's own box ----
   The country's box, plus the room a name written UNDER the shape takes. Two
   things need it and they must agree to the unit: ctrySVG, which draws it, and
   the arrangement below, which lines two cards up by their boxes. So it is
   worked out once, here, and neither of them may work it out again.

   The card is framed on the country, so almost every name fits it at a readable
   size — Chile's is thin because Chile is thin. The exception is an
   archipelago: the Marshall Islands are a thousandth of their own box, and a
   name written inside one of those islands would be a smudge. Those get their
   name under the shape instead, where an atlas puts the name of anything too
   small to carry one, and the picture opens out to make room. The threshold is
   read against GEO_LBL_W's own metric — the tracked capitals a name is set in
   — which is why it is not the round number it looks like it should be. */
function ctryVB(it){
  const g = ctryGeom(it);
  if(!g) return null;
  const lb = ctryOn(it, 'lbl') ? geoRegLabel(g.proj, g.key) : null;
  const under = lb && lb.fs < g.u / 110 ? g.u / 9 : 0;
  return { g, lb, under,
           vb: [g.vb[0], g.vb[1], g.vb[2], under ? g.r(g.vb[3] + under * 1.5) : g.vb[3]] };
}
function ctrySVG(it){
  const G = ctryVB(it), g = G && G.g;
  if(!g) return '<svg class="ctrysvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 62"' +
    ' style="aspect-ratio:100/62"><text class="ctryno" x="50" y="38">?</text></svg>';
  const r = g.r;
  /* THE PEN IS THE ARRANGEMENT'S, NOT THE CARD'S. A card on its own is drawn at
     one country across the picture and its outline is a fraction of that span.
     Clicked together, the cards share one scale — and an outline that stayed a
     fraction of each country's OWN span would draw Belgium's coast four times
     finer than France's, which reads as Belgium drawn faintly rather than as
     Belgium drawn small. `gu` is the run's own span, written onto every card of
     it by ctryWeigh, and the outline is measured against that.

     THE TYPE IS NOT. A pen is the map's and a name is the shape's: a Brussels
     set at France's scale is wider than Belgium and is cut off by the edge of
     its own card, and a country too small to carry its capital's name at a
     readable size is a country that is small here — which is the true thing,
     and what an atlas shows. So `u` is the pen and `g.u` is everything set in
     type, and the two are different on purpose. */
  const u = it.gu > 0 ? it.gu : g.u, sw = u / 190;
  const lb = G.lb, under = G.under, vb = G.vb;
  let s = '<svg class="ctrysvg" xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') +
    '" style="aspect-ratio:' + vb[2] + '/' + vb[3] + '">';
  if(ctryOn(it, 'ctx')){
    /* the neighbours, faintly. It is the world's own path, in the world's own
       units, and the edge of the picture is what crops it — no clip, no second
       projection, and the memoised string the map is already drawn from */
    const P = geoPaths(g.proj, g.look), W = geoProj(g.proj).wrap;
    const copy = t => '<g' + (t ? ' transform="translate(' + t + ' 0)"' : '') + '>' +
      '<path class="ctxland" d="' + P.land + '"/><path class="ctxbord" d="' + P.bord + '"/></g>';
    s += '<g class="ctxall" stroke-width="' + r(sw * 0.7) + '">' + copy(0) +
      (W && g.b.x1 > W ? copy(W) : '') + (W && g.b.x0 < 0 ? copy(-W) : '') + '</g>';
  }
  const shape = geoRegPath(g.proj, g.look, g.key, 1);
  /* ---- the ink ----
     A country is one outline and the fill carries it. A continent is a set of
     countries filled as one — the even-odd rule unions them, because they meet
     exactly along the arcs they share — and its ink is two pens rather than
     one: the borders inside it, and the coast round the outside of it. Stroking
     the fill instead would draw every internal border at the weight of a coast,
     which is the one thing a plate of a continent must not look like. */
  const ink = g.cont
    ? '<path class="ctrybord" d="' + geoRegBord(g.proj, g.look, g.key) +
      '" stroke-width="' + r(sw * 0.6) + '"/>' +
      '<path class="ctrycoast" d="' + geoRegCoast(g.proj, g.look, g.key) +
      '" stroke-width="' + r(sw) + '"/>'
    : '';
  s += '<path class="ctryland' + (g.cont ? ' ctryflat' : '') + '" d="' + shape +
    '" stroke-width="' + r(sw) + '"/>' + ink;
  /* ---- the land as it really is ----
     The map's own height, lake and river layers, at the country's own distance
     and CLIPPED TO THE COUNTRY. That clip is the whole difference between the
     two pictures and it is deliberate: a map is a piece of the world and its
     rivers run off the edge of it, but a card is one country, and a card whose
     water and terrain spilled over the border into a neighbour it does not
     draw would read as a mistake. So the border is where they stop — which is
     also what an atlas does on the page facing a country's own entry.

     The window handed down is the country's own box, so a card of Luxembourg
     contours Luxembourg and not the world, and the step is the finest there is
     because nothing here zooms: this is the one distance the card is ever seen
     at. Both are memoised in js/lib/atlas.js, so a second card of the same
     country costs nothing at all. */
  const rel = ctryOn(it, 'rel'), lak = ctryOn(it, 'lak'), riv = ctryOn(it, 'riv');
  if(rel || lak || riv){
    /* Fiji's frame sits just past the 180th and the field's does not, so the
       window is asked for in the world's own frame and the answer carried back
       — the same carry ctryCapXY does for the capital */
    const wr = geoProj(g.proj).wrap;
    const sh = wr ? Math.round(((g.b.x0 + g.b.x1) / 2 - wr / 2) / wr) * wr : 0;
    const win = { x0: g.b.x0 - g.m - sh, y0: g.b.y0 - g.m,
                  x1: g.b.x1 + g.m - sh, y1: g.b.y1 + g.m };
    /* the card's own zoom, counted in the octaves a map counts in: the picture
       is the country's span and not the world's, so a card of Luxembourg is
       nine steps in and a card of Russia is barely one. The detail step follows
       from it exactly as it does on a map — which is what keeps a card of
       Russia from contouring a sixth of the planet a cell at a time. */
    const lod = atlLod(Math.round(Math.log2(GEO_W / g.u)));
    let inner = '';
    if(rel) for(const b of geoReliefBands(g.proj, g.look, lod, win))
      inner += '<path fill="' + b.fill + '" d="' + b.d + '"/>';
    if(lak || riv){
      const w = geoDetailPaths(g.proj, g.look, lod, win);
      if(lak && w.lak) inner += '<path class="ctrylake" d="' + w.lak +
        '" stroke-width="' + r(sw * 0.7) + '"/>';
      if(riv && w.riv) inner += '<path class="ctryriver" d="' + w.riv +
        '" stroke-width="' + r(sw * 0.9) + '"/>';
    }
    if(inner){
      const cp = 'ctryc-' + esc(String(it.id));
      s += '<defs><clipPath id="' + cp + '"><path d="' + shape + '"/></clipPath></defs>' +
        '<g clip-path="url(#' + cp + ')"' + (sh ? ' transform="translate(' + r(sh) + ' 0)"' : '') +
        '>' + inner + '</g>' +
        /* the outline again, over the top: the fill under it has been painted
           over, and half of a stroke sits inside its own shape */
        (g.cont ? ink : '<path class="ctryedge" d="' + shape + '" stroke-width="' + r(sw) + '"/>');
    }
  }
  if(lb) s += under
    ? '<text class="atconame" x="' + r((g.b.x0 + g.b.x1) / 2 + atlNameX(under)) +
      '" y="' + r(g.b.y1 + g.m + under * 0.85) +
      '" font-size="' + r(under) + '" stroke-width="' + r(under * ATL_HALO) + '">' +
      esc(geoRegName(g.key)) + '</text>'
    : atlNameSVG(lb, r);
  if(ctryOn(it, 'cp') && g.cont) s += ctryCapsSVG(G, sw);
  else if(ctryOn(it, 'cp')){
    const c = geoCoCapitals(g.i)[0];
    if(c){
      const q = ctryCapXY(g, c), fs = g.u / 21, dot = g.u / 80;
      /* the name reads outwards from the dot, and turns round rather than
         walking off the right-hand edge of the picture */
      const flip = q[0] + fs * 0.5 * c.name.length > g.b.x1;
      s += '<g class="ctrycap"><circle class="ctrydot" cx="' + r(q[0]) + '" cy="' + r(q[1]) +
        '" r="' + r(dot) + '" stroke-width="' + r(dot * 0.55) + '"/>' +
        '<text class="ctrycapn" x="' + r(q[0] + (flip ? -dot * 2.1 : dot * 2.1)) + '" y="' + r(q[1] + fs * 0.34) +
        '" font-size="' + r(fs) + '" stroke-width="' + r(fs * 0.17) + '" text-anchor="' +
        (flip ? 'end' : 'start') + '">' + esc(c.name) + '</text></g>';
    }
  }
  return s + '</svg>';
}
function ctryRedraw(el, it, page){
  const old = el.querySelector('svg.ctrysvg');
  if(old) old.outerHTML = ctrySVG(it);
}

/* ================= countries that click together =================
   Two cards of countries that share a border, brought near each other on the
   paper, snap into the arrangement the world has them in — and then move as
   one until they are pulled apart.

   THE ONE IDEA THIS RESTS ON: a card's viewBox IS its country's box in world
   units, so two cards are in register exactly when they are drawn at the same
   number of percent per world unit and their viewBox origins stand that many
   percent apart. There is no second projection, no re-render, no shared
   picture — it is one multiplication per card, and it is why a Belgium that
   has clicked onto France is really Belgium where France's border leaves off
   rather than a picture arranged to look like it.

   `glue` names ONE other card, and an arrangement is the connected run of
   them — the same shape a chain of `[[links]]` has, and for the same reason: a
   set has to be stored somewhere and an id on each end stores it without a
   table for core to know about. Whichever card the hand is on is the one the
   rest are laid out from, so there is no leader to lose and no order to keep.

   THE HAND IS THE ONLY THING THAT DECIDES SCALE. A card dragged up to another
   takes that one's scale, because that one is standing still and the reader is
   looking at it. When it cannot — Luxembourg's scale would put France six
   sheets wide — the two swap parts and the small one comes to the big one
   instead. Either way exactly one card is asked to move and the reader was
   already moving it. */

/* how many percent of the sheet's HEIGHT one percent of its width is worth.
   x, y and w are all percentages, but not all of the same thing. */
const ctryAsp = () => pgW() / pgH();
/* ---- when two countries click ----
   TWICE TOUCHING, and both times it is the same question asked of two different
   pictures. On the paper: has the reader actually brought these two shapes
   together? In the world: are they two countries that meet? Neither is a
   distance the reader has to guess at, and there is no third number.

   The first is the hitbox, and it wants to be small — while a card is inside it
   the click is on offer and the card lights up, and everywhere else the card is
   simply being moved. It used to be a card's box plus a further eighth of the
   sheet, which is most of the paper and made the two of them fight the hand.
   It is now the countries' own boxes, meeting.

   WHAT IS DELIBERATELY NOT ASKED is whether the card is already about where it
   will land. It cannot be: two cards of the same width are at two different
   scales, so a Spain brought up against a France has to grow by half to sit
   under it, and no drop can be both touching now and touching after. Bringing
   them together is the whole of what the reader has to do; putting them right
   is the whole of what the click is for. */
const CTRY_TOUCH = 0.06;                           // of the smaller country: how near still counts as touching
const CTRY_TOUCHMAX = 1.5;                         // …and never further apart than this, in width-%
const CTRY_SIZE = [0.4, 260];                      // and how big a card may be asked to become
/* the country cards on a page, in the order they are drawn */
const ctryCards = page => (page && page.items || []).filter(x => x.type === 'country' && ctryGeom(x));
/* everything stuck to this one, itself excluded — the run walked both ways,
   because `glue` is written on whichever card arrived second */
function ctryStuck(page, it){
  const all = ctryCards(page), seen = new Set([it.id]), q = [it], out = [];
  while(q.length){
    const c = q.pop();
    for(const o of all){
      if(seen.has(o.id) || (o.glue !== c.id && c.glue !== o.id)) continue;
      seen.add(o.id); out.push(o); q.push(o);
    }
  }
  return out;
}
const ctryHeld = (page, it) => it.type === 'country' && ctryStuck(page, it).length > 0;
/* one card's frame: where its viewBox stands, and what a world unit is worth
   in it. Everything below is this and arithmetic. */
function ctryFrame(it){
  const G = ctryVB(it);
  return G && it.w > 0 ? { vb: G.vb, proj: G.g.proj, s: it.w / G.vb[2], x: it.x, y: it.y } : null;
}
/* where `it` must stand, and how wide it must be, for its country to sit
   where the world puts it inside the frame `f` */
function ctryPlace(f, it){
  const G = ctryVB(it);
  if(!G || G.g.proj !== f.proj) return null;
  const W = geoProj(f.proj).wrap;
  let dx = G.vb[0] - f.vb[0];
  /* the seam down the back of the world: Alaska and Chukotka are neighbours
     and their boxes are a world apart, so the offset is taken the short way */
  if(W) dx -= Math.round(dx / W) * W;
  return { w: f.s * G.vb[2], x: f.x + dx * f.s,
           y: f.y + (G.vb[1] - f.vb[1]) * f.s * ctryAsp() };
}
/* ---- one space to measure in ----
   x and w are percentages of the sheet's width and y is a percentage of its
   height, which is three quantities and two units. A box here is all four in
   WIDTH-percent, and everything that compares two cards compares boxes. */
function ctryBox(x, y, w, h){ return { x, y: y / ctryAsp(), w, h }; }
/* THE COUNTRY'S OWN BOX, not the card's, wherever the card is standing. A card
   is its country plus a margin all the way round — six percent of the span, so
   a shape has air and does not sit against its own edge — and two margins
   meeting is not two countries meeting. This is the box whose edge the reader
   can see, and it is the only box anything below measures. */
function ctryLandAt(p, it){
  const G = ctryVB(it);
  if(!G || !(p.w > 0)) return null;
  const s = p.w / G.vb[2], b = G.g.b;
  return ctryBox(p.x + (b.x0 - G.vb[0]) * s, p.y + (b.y0 - G.vb[1]) * s * ctryAsp(),
                 (b.x1 - b.x0) * s, (b.y1 - b.y0) * s);
}
const ctryLandOf = it => ctryLandAt(it, it);       // …which is where it is standing now
/* HOW NEAR TWO CARDS ARE IS THE GAP BETWEEN THEIR BOXES, and it has to be:
   two middles is the obvious measure and it is wrong, because a card fifty
   times the size of another has its middle a quarter of a sheet from its own
   corner. Luxembourg brought up against France is touching it and half a sheet
   from its middle. Nought if they touch or overlap. */
function ctryGap(a, b){
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}
/* …and how much of a gap still reads as none. A fraction of the smaller of the
   two, so the same gesture works at any size the cards are drawn at. */
const ctryTouches = (a, b) => ctryGap(a, b) <=
  Math.min(CTRY_TOUCHMAX, CTRY_TOUCH * Math.min(Math.max(a.w, a.h), Math.max(b.w, b.h)));
/* would this card go there? Only if what it becomes is a card — not a speck
   and not three sheets — and only if, once it is there, the two countries are
   touching. That second test is the world's own, and it is the whole of what
   keeps Japan from clicking onto Brazil when it is dropped right on top of it:
   they ARE together on the paper, and the place the world puts them is a world
   apart. It is also why Portugal will not click straight onto France: Spain is
   between them and they do not meet. */
function ctryTry(f, move, stay){
  const p = ctryPlace(f, move);
  if(!p || !(p.w >= CTRY_SIZE[0] && p.w <= CTRY_SIZE[1])) return null;
  const there = ctryLandAt(p, move), here = ctryLandOf(stay);
  return there && here && ctryTouches(there, here) ? { at: p, far: ctryGap(there, here) } : null;
}
/* the best click this card could make: which other card, which of the two
   takes the other's scale, and where whichever of them moves ends up */
function ctrySnap(page, it){
  const mine = new Set([it.id, ...ctryStuck(page, it).map(x => x.id)]);
  const lMe = ctryLandOf(it), fMe = ctryFrame(it);
  if(!lMe || !fMe) return null;
  let best = null;
  for(const A of ctryCards(page)){
    if(mine.has(A.id)) continue;
    const lA = ctryLandOf(A), fA = ctryFrame(A);
    if(!lA || !fA) continue;
    if(!ctryTouches(lA, lMe)) continue;            /* not brought together: not asked */
    /* the card in the hand takes the standing one's frame if it can. If it
       cannot — the standing one is so much smaller that this card at its scale
       would be sheets wide — then the standing one comes to this one instead,
       which is the same arrangement reached from the other end. */
    let r = ctryTry(fA, it, A), move = it;
    if(!r){ r = ctryTry(fMe, A, it); move = A; }
    if(!r) continue;
    const score = ctryGap(lA, lMe) + r.far;
    if(best && best.score <= score) continue;
    best = { score, on: A, move, at: r.at };
  }
  return best;
}
/* a card put where a placement says, records and DOM together. The width is
   written straight onto the element: applyWidth is core's, and this is one
   number of the same kind. */
function ctrySet(it, p){
  it.x = p.x; it.y = p.y; it.w = p.w;
  const el = document.querySelector('#pageHost .item[data-id="' + it.id + '"]');
  if(!el) return;
  el.style.left = it.x + '%'; el.style.top = it.y + '%'; el.style.width = it.w + '%';
}
/* THE ONE THING THAT LAYS AN ARRANGEMENT OUT: every card stuck to this one,
   put where this one's frame says it goes. Move a card and call this and the
   whole run follows; rescale a card and call this and the whole run rescales.
   It is the same call either way, which is why there is no leader. */
function ctryLayFrom(page, it){
  const f = ctryFrame(it);
  if(!f) return;
  for(const o of ctryStuck(page, it)){
    const p = ctryPlace(f, o);
    if(p) ctrySet(o, p);
  }
}
/* one pen for the whole run, and the span it is measured against is the
   BIGGEST country in the arrangement rather than whichever card the hand
   happens to be on — so the weight of every line on the paper does not depend
   on what was dragged last. It changes only when the membership does, which is
   why it is not part of laying an arrangement out: that runs every frame of a
   drag, and this redraws pictures. */
function ctryWeigh(page, it){
  const run = [it, ...ctryStuck(page, it)].filter(ctryGeom);
  const gu = run.length > 1 ? Math.max(...run.map(x => ctryGeom(x).u)) : 0;
  for(const x of run){
    const was = x.gu || 0;
    if(gu) x.gu = gu; else delete x.gu;
    if((x.gu || 0) === was) continue;
    const el = document.querySelector('#pageHost .item[data-id="' + x.id + '"]');
    if(el) ctryRedraw(el, x, page);
  }
}
/* ---- the hand ----
   core/drag.js calls these two and knows nothing else about any of it. */
function ctryChain(page, it){
  if(it.type !== 'country' || !ctryStuck(page, it).length) return null;
  return { carry: () => ctryLayFrom(page, it) };
}
/* while the card is under the hand: the run comes along, and the nearest click
   is shown by putting whichever card moves where it would land. A preview that
   is the answer itself is the only one that cannot lie about it. */
function ctryDragMove(page, it, chain){
  if(chain) chain.carry();
  if(it.type !== 'country') return null;
  const snap = ctrySnap(page, it);
  if(!snap) return null;
  const to = document.querySelector('#pageHost .item[data-id="' + snap.on.id + '"]');
  return to ? { el: to, it: snap.on, page, snap } : null;
}
/* let go: the click itself. Both ends are written — `glue` on the card that
   moved — and then the run is laid out from it, so a card arriving with three
   already stuck to it brings all three into the new frame at once. */
function ctryDragDrop(page, it, drop){
  const s = drop && drop.snap;
  if(!s) return null;
  const was = { x: s.move.x, y: s.move.y, w: s.move.w };
  ctrySet(s.move, s.at);
  /* whichever of the two moved is the one that names the other: the card that
     stood still keeps whatever it was already stuck to */
  (s.move === it ? it : s.on).glue = (s.move === it ? s.on : it).id;
  ctryLayFrom(page, s.move);
  if(s.move !== it) ctryLayFrom(page, it);
  ctryWeigh(page, s.move);
  ctryUnglueBtns();
  queueSave(page.id);
  SND.pop();
  return was;
}
/* ---- and pulling them apart ----
   One card leaves the run: what named it lets go, and what it named lets go of
   it. Nothing moves — a card that has just been unstuck is exactly where the
   reader was looking at it, and the next drag takes it away on its own. */
function ctryUnglue(page, it){
  const others = ctryStuck(page, it);
  if(!others.length && it.glue == null) return false;
  delete it.glue;
  for(const o of ctryCards(page)) if(o.glue === it.id) delete o.glue;
  /* the card that left, and whatever is left of what it left — a run that has
     lost its biggest country is drawn with a finer pen, and says so at once */
  ctryWeigh(page, it);
  for(const o of others) ctryWeigh(page, o);
  ctryUnglueBtns();
  queueSave(page.id);
  SND.unpop();                                     /* the click, played backwards */
  return true;
}
/* the button knows whether it is lit, and the arrangement changes under it —
   so every card's button is asked again whenever any of them does */
function ctryUnglueBtns(){
  for(const el of document.querySelectorAll('#pageHost .item[data-type="country"]')){
    const b = el.__ctryglue;
    if(b) b.classList.toggle('on', !!(b.__it && (b.__it.glue != null ||
      ctryCards(b.__page).some(o => o.glue === b.__it.id))));
  }
}
/* ---- the card's switches, and what a missing one means ----
   The name and the capital are ON unless they were turned off: they were on
   the card before there was a field to say so, and an old card must not lose
   them. The neighbours, the height, the lakes and the rivers are OFF unless
   they were turned on, for the mirror of the same reason — a card made before
   they existed, or dragged off a map that was not showing them, must not come
   back from this change wearing something nobody asked it for.

   One table, read by the picture, by the switch and by the button's own face,
   so there is exactly one answer to the question. */
const CTRY_DEF = { lbl: 1, cp: 1, ctx: 0, rel: 0, lak: 0, riv: 0 };
const ctryOn = (it, k) => it[k] == null ? !!CTRY_DEF[k] : !!it[k];
function ctryFlip(el, it, page, key, b, label){
  it[key] = ctryOn(it, key) ? 0 : 1;
  b.title = label + ': ' + (it[key] ? 'on' : 'off');
  b.classList.toggle('on', !!it[key]);
  queueSave(page.id); ctryRedraw(el, it, page); SND.tick();
}
function ctryGlyph(it){
  const g = ctryGeom(it);
  const sheet = '<path class="fsheet" d="M5 9 H91 V119 H5 Z"/>';
  if(!g) return svgIcon(sheet + extBand('LAND'));
  /* the country itself, fitted into the same 96×128 box everything else uses */
  const k = Math.min(66 / g.w, 66 / g.h);
  return svgIcon(sheet +
    '<g transform="translate(48 50) scale(' + (Math.round(k * 1e4) / 1e4) + ') translate(' +
    rd1(-(g.b.x0 + g.b.x1) / 2) + ' ' + rd1(-(g.b.y0 + g.b.y1) / 2) + ')">' +
    '<path class="fplate" d="' + geoRegPath(g.proj, 'crisp', g.key, 1) + '"/></g>' +
    extBand('LAND'));
}

/* One maker for both entries in the menu. A card is a REGION — one country, or
   a whole continent — and which one is either what came off the map or the one
   the entry starts you with. The type stays `country` whichever it is: it is
   what every card ever saved calls itself, and a second type would be this
   whole half of the file again for the sake of a word. */
function ctryNew(base, def, w){
  const n = ATL_NEXT; ATL_NEXT = null;
  return { ...base, type:'country', w, rot:0, cap:'',
           co: (n && n.co) || def, proj: (n && n.proj) || 'mercator',
           look: (n && n.look) || 'smooth', lbl:1, cp:1, ctx:0,
           rel: (n && n.rel) || 0, lak: (n && n.lak) || 0, riv: (n && n.riv) || 0 };
}
/* is this card a whole continent? — which changes what two of its buttons say
   and nothing else at all */
const ctryCont = it => geoRegKind(geoRegKeyOf(it.co)) === 'ct';

defineItem('country', {
  add: { country: base => ctryNew(base, 'France', 26),
         continent: base => ctryNew(base, 'Africa', 40) },
  sound: 'plop',
  /* it goes into a folder, but two cards dropped on each other never make one:
     on the paper they are shapes being pushed about, and touching is how they
     click together. See foldPair() in items/media/folder.js. */
  fileable: true,
  filedOnly: true,
  html: it => '<figure class="body ctry">' + ctrySVG(it) + '<figcaption></figcaption></figure>',
  tools(mk, it, el, page){
    mk('⌕', 'Which country — or which continent', b => atlAsk(b, it, el, page));
    const sw = (g, k, t) => { const b = mk(g, t, x => ctryFlip(el, it, page, k, x, t));
                              b.classList.toggle('on', ctryOn(it, k)); return b; };
    sw('A', 'lbl', 'Its name across it');
    sw('★', 'cp', ctryCont(it) ? 'The capitals in it, as many as will fit' : 'Its capital marked');
    sw('◌', 'ctx', 'The countries round it, faintly');
    sw('▲', 'rel', 'The height of its land');
    sw('◉', 'lak', 'Its lakes');
    sw('≈', 'riv', 'Its rivers');
    mk('◈', 'Outlines — drawn round, or straight off the data', b => {
      it.look = it.look === 'crisp' ? 'smooth' : 'crisp';
      b.title = 'Outlines: ' + (it.look === 'crisp' ? 'straight' : 'round');
      queueSave(page.id); ctryRedraw(el, it, page);
    });
    /* THE PROJECTION IS THE ARRANGEMENT'S, not one card's. Two cards clicked
       together are in register because their boxes are in one frame, and a
       card reprojected on its own would be in a frame of its own — the same
       border in two places. So it carries the run with it, and the run is laid
       out again from it. */
    mk('◎', 'Projection — flat, Mercator or azimuthal equidistant', b => {
      it.proj = atlNextProjection(atlProj(it), CTRY_PROJECTIONS);
      b.title = 'Projection: ' + geoProj(it.proj).label;
      for(const o of ctryStuck(page, it)){
        o.proj = it.proj;
        const oe = document.querySelector('#pageHost .item[data-id="' + o.id + '"]');
        if(oe) ctryRedraw(oe, o, page);
      }
      queueSave(page.id); ctryRedraw(el, it, page); ctryLayFrom(page, it);
    });
    /* the run comes apart here, and only here: a drag never breaks one, so a
       card cannot be shaken loose by accident */
    const ug = mk('⊗', 'Unstick it from its neighbours', () => {
      if(!ctryUnglue(page, it)) SND.nope();
    });
    ug.__it = it; ug.__page = page; el.__ctryglue = ug;
    ug.classList.toggle('on', !!(it.glue != null || ctryCards(page).some(o => o.glue === it.id)));
  },
  icon: it => ctryGlyph(it),
  label: it => it.co || 'Country',
  meta: it => {
    const k = geoRegKeyOf(it.co), cont = geoRegKind(k) === 'ct';
    const c = !k || cont ? null : geoCoCapitals(geoRegNum(k))[0];
    const n = cont ? geoContinents()[geoRegNum(k)].cos.length + ' countries' : c ? c.name : '';
    return (n ? n + ' · ' : '') + geoProj(atlProj(it)).label;
  },
  css: `
/* ---------- one country ----------
   THE CARD IS THE COUNTRY AND NOT A CARD. No paper behind it, no padding round
   it and no rectangle of shadow under it: what lifts off the page is the shape
   itself, through a drop-shadow that follows the alpha the SVG actually paints.
   The same three lines .solid, .mol and .fey use, for the same reason — the
   thing on the paper is the drawing, and a box round it is furniture.

   The caption keeps its place under the shape but stops announcing itself: a
   grey word "caption" floating under Chile with no card to sit on reads as a
   mistake, so it is offered while the card is selected and silent otherwise. */
.ctry{display:block;background:none;padding:0;box-shadow:none}
.ctry figcaption{padding-top:calc(var(--scale)*4px)}
.ctry figcaption:empty::before{content:none}
.item.sel .ctry figcaption:empty::before{content:"caption";opacity:.35}
.item.sel .ctry figcaption:empty{min-height:1em}
/* the picture CLIPS, and it has to: the neighbours are the whole world's path
   drawn in the world's own units, and it is the edge of the card that crops it
   to the country. The name that goes under a shape too small to carry one is
   inside the viewBox rather than outside it — see ctrySVG */
svg.ctrysvg{display:block;width:100%;height:auto;background:none;overflow:hidden;
  shape-rendering:geometricPrecision;
  filter:drop-shadow(0 calc(var(--scale)*3px) calc(var(--scale)*5px) rgba(0,0,0,.28))}
/* …and not while it is being carried: core owns the shadow under a moving item
   and its is the honest one, so the shape's own comes off rather than being
   rasterised a second time under the hand */
.item.dragging svg.ctrysvg{filter:none}
/* one country about to click onto another. core/drag.js marks it the way it
   marks a folder about to swallow something; this says the opposite thing —
   not "in here" but "up against me" — so it is a line along the shape rather
   than a box round the card. */
.item[data-type="country"].dropinto .body{box-shadow:none}
.item[data-type="country"].dropinto svg.ctrysvg{
  filter:drop-shadow(0 0 calc(var(--scale)*2px) var(--accent))
         drop-shadow(0 0 calc(var(--scale)*7px) color-mix(in srgb,var(--accent) 55%,transparent))}
svg.ctrysvg *{stroke-linejoin:round;stroke-linecap:round}
.ctrysvg path.ctryland{fill:color-mix(in srgb,var(--accent2) 26%,var(--paper));fill-rule:evenodd;
  stroke:var(--ink)}
/* the height, the lakes and the rivers, in the map's own colours so the card
   and the map it came off read as one picture. The bands carry their fill as
   an attribute — they are nine different colours and no rule could name them —
   so no rule here may set a fill on them. The outline is drawn a second time
   over the top of all of it; see ctrySVG. */
.ctrysvg path.ctrylake{fill:color-mix(in srgb,var(--accent2) 34%,var(--paper));fill-opacity:.92;
  fill-rule:evenodd;stroke:color-mix(in srgb,var(--accent2) 62%,var(--ink));stroke-opacity:.92}
.ctrysvg path.ctryriver{fill:none;stroke:color-mix(in srgb,var(--accent2) 72%,var(--ink));stroke-opacity:.75}
.ctrysvg path.ctryedge{fill:none;stroke:var(--ink)}
/* a continent's fill carries no outline of its own — the ink is the two pens
   below, and stroking the fill would draw every border in it as a coast */
.ctrysvg path.ctryflat{stroke:none}
.ctrysvg path.ctrycoast{fill:none;stroke:var(--ink)}
.ctrysvg path.ctrybord{fill:none;stroke:var(--ink);stroke-opacity:.34}
.ctrysvg .ctxall{fill:none}
.ctrysvg path.ctxland{fill:color-mix(in srgb,var(--paper) 93%,var(--ink));fill-rule:evenodd;stroke:none}
.ctrysvg path.ctxbord{fill:none;stroke:var(--ink);opacity:.22}
.ctrysvg circle.ctrydot{fill:var(--accent);stroke:var(--paper)}
.ctrysvg text.ctrycapn{font-family:var(--disp);font-weight:600;letter-spacing:.3px;
  fill:var(--ink);stroke:var(--paper);paint-order:stroke;stroke-linejoin:round}
.ctrysvg text.ctryno{font-family:var(--disp);font-size:34px;text-anchor:middle;fill:var(--soft);opacity:.5}
`
});
defineIcon('country', '<path d="M4.6 8.2 8 5l3.4 2 3.6-1.4 4.4 3.1-1.1 4.6 1 3.5-3.7 2.6-4.2-.6-3.4 2-3.8-2.6.6-3.9-2-2.9z"/>');
defineIcon('continent', '<path d="M3.3 8.6 7.2 4.1l4.7 1.6 5.1-1.9 3.7 3.5-1.6 5.5 1.2 4-5 3.5-5.1-1.1-4.3 2.3-3.6-3.4 1.1-4.7z"/>' +
  '<path d="M7.2 4.1 9.9 11l-3.8 3.7"/><path d="M9.9 11l6.6 1.5"/>');
defineTool({ kind:'country', cat:'science', label:'Country', icon:'country', order:65,
  hint:'One country on its own — its shape, its name and its capital. Or drag one straight out of the World map' });
defineTool({ kind:'continent', cat:'science', label:'Continent', icon:'continent', order:66,
  hint:'A whole continent, drawn in one piece with its countries inside it. Or set the World map to pick continents and drag one out' });
