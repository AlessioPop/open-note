/* Open Note — items/science/atlas.js
   a map of the world on the page */

/* ================= the atlas =================
   Natural Earth's 110m outlines, drawn as one picture and then MOVED. The
   world is built once per projection and look (js/lib/atlas.js keeps the
   strings), and panning or zooming a map sets one transform on one group —
   no path is rebuilt, no string is joined, nothing is measured. That is the
   whole reason it stays smooth under the hand, and it is worth protecting:
   anything here that starts rebuilding geometry per frame has broken it.

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
   ⌕ walks the map to one by name and lights it; and a country dragged OUT of
   the picture comes off it as a card of its own — the `country` item at the
   bottom, which is the same geometry drawn once at one country's own scale.

   Prefix `atl`. The geometry is js/lib/atlas.js (`geo`), the table is
   js/data/atlasworld.js. */

const ATL_W = 1000;                                // the picture is 1000 wide, like the ink and the plot
const ATL_ZMAX = 5;                                // 32× — as far as 110m outlines are worth pushing
const ATL_MOVE = new Set();                        // maps picked up to be moved about the page
const ATL_LIVE = new Map();                        // id → the springs and the view they drive. Never saved
const ATL_PANEL = new Set();                       // …and whose layer panel is open
const ATL_BLINK = 2600;                            // how long ⌕ keeps a country lit, ms
let ATL_NEXT = null;                               // the country the next `country` item is of

/* Mercator unless the record says otherwise. A map made before this line said
   `equirect` in so many words and keeps it; one made since, and one made by a
   feature that never thought about the question, gets the projection every map
   on a screen is drawn in. */
const atlProj = it => it.proj || 'mercator';

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
   it. Nothing in this file knows what a graticule is beyond this list. */
const ATL_LAYERS = [];
function defineMapLayer(id, spec){
  ATL_LAYERS.push(Object.assign({ id, order: 50, on: 1 }, spec));
  ATL_LAYERS.sort((a, b) => a.order - b.order);
}
/* absent means the layer's own default, so an old note gains a new layer and
   a note that has been fiddled with keeps what it was told */
const atlOn = (it, L) => { const o = it.on || {}; return o[L.id] == null ? !!L.on : !!o[L.id]; };

defineMapLayer('grat', {
  label: 'Graticule', order: 20, on: 0, sw: 1.1,
  world: ctx => '<path class="atgrat" d="' + ctx.paths.grat + '"/>'
});
defineMapLayer('land', {
  label: 'Land', order: 30, on: 1, sw: 0,
  world: ctx => '<path class="atland" d="' + ctx.paths.land + '"/>'
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
  world(ctx){
    const it = ctx.it, v = ctx.view, proj = atlProj(it), look = it.look || 'smooth';
    const w = atlWin(it, v), lod = atlLod(v.z);
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
   makes it read as water and not as a hole cut in the paper */
defineMapLayer('lakes', {
  label: 'Lakes', order: 34, on: 1, sw: 1.2,
  world: ctx => '<path class="atlake" d="' +
    geoDetailPaths(atlProj(ctx.it), ctx.it.look || 'smooth', atlLod(ctx.view.z), atlWin(ctx.it, ctx.view)).lak + '"/>'
});
defineMapLayer('rivers', {
  label: 'Rivers', order: 36, on: 0, sw: 1.6,
  world: ctx => '<path class="atriver" d="' +
    geoDetailPaths(atlProj(ctx.it), ctx.it.look || 'smooth', atlLod(ctx.view.z), atlWin(ctx.it, ctx.view)).riv + '"/>'
});
/* the coast is inked separately from the land it fills — see the note over
   geoPaths: a filled ring has to close, and Antarctica's closes across the
   bottom of the world */
defineMapLayer('coast', {
  label: 'Coastline', order: 50, on: 1, sw: 2.4,
  world: ctx => '<path class="atcoast" d="' + ctx.paths.coast + '"/>'
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
  let hit = ATL_CAPXY.get(proj);
  if(hit) return hit;
  const P = geoProj(proj);
  hit = geoCapitals().map(c => P.fwd(c.lon, c.lat));
  ATL_CAPXY.set(proj, hit);
  return hit;
}
/* how many are OFFERED at this zoom. It only has to be mean at arm's length,
   where a capital of eighty thousand people would otherwise fill an empty
   ocean; from about two steps in every capital is a candidate and it is the
   collision that decides, which is what makes a close-up of Europe fill up */
const atlCapCount = z => Math.min(geoCapitals().length, Math.round(10 * Math.pow(3, z)));

defineMapLayer('caps', {
  label: 'Capitals', order: 60, on: 1,
  build(){
    return geoCapitals().map(c =>
      '<g class="atcap"><circle class="atdot" r="' + ATL_DOT + '"/>' +
      '<text class="atname" x="' + (ATL_DOT + 5) + '" y="' + (ATL_FS * 0.36) + '">' +
      esc(c.name) + '</text></g>').join('');
  },
  frame(g, ctx){
    const v = ctx.view, xy = atlCapXY(atlProj(ctx.it)), caps = geoCapitals();
    const n = atlCapCount(v.z), cands = [], pad = ATL_FS;
    for(let i = 0; i < n; i++){
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
    const on = new Set();
    /* the picked country's name is already down, and it is the one the reader
       asked for — so it is handed to the layout as a box that is taken, and a
       capital that would have landed on it steps aside instead */
    const seed = atlNameBox(ctx.it, v) || [];
    const set = geoLayout(cands, ATL_W, v.H, 4, seed);
    /* WHAT THE CAPITALS TOOK IS LEFT ON ctx, and the cities read it. One ctx
       is made per frame and every screen-space layer is handed the same one,
       in layer order — so a layer that lays type out can tell the next one
       where not to put any. It is the only thing they share, and it is why a
       city name never lands on a capital's. */
    ctx.taken = seed.concat(set.map(c => c.box));
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
  let hit = ATL_CITYXY.get(proj);
  if(hit) return hit;
  const P = geoProj(proj);
  hit = geoCities().map(c => P.fwd(c.lon, c.lat));
  ATL_CITYXY.set(proj, hit);
  return hit;
}
/* nothing at all until the map is a step and a bit in — a world map with five
   hundred cities on it is not a map, it is a list */
const atlCityCount = z => z < 1.2 ? 0
  : Math.min(geoCities().length, Math.round(10 * Math.pow(3.1, z - 1.2)));

defineMapLayer('cities', {
  label: 'Cities', order: 65, on: 1,
  build(){
    return geoCities().map(c =>
      '<g class="atcity"><circle class="atcdot" r="' + ATL_CDOT + '"/>' +
      '<text class="atcname" x="' + (ATL_CDOT + 4) + '" y="' + rd1(ATL_CFS * 0.36) + '">' +
      esc(c.name) + '</text></g>').join('');
  },
  frame(g, ctx){
    const v = ctx.view, cs = geoCities();
    const n = atlCityCount(v.z);
    const on = new Set();
    if(n){
      const xy = atlCityXY(atlProj(ctx.it)), cands = [], pad = ATL_CFS;
      for(let i = 0; i < n; i++){
        const x = (xy[i][0] - v.cx) * v.k + ATL_W / 2;
        if(x < -pad || x > ATL_W + pad) continue;
        const y = (xy[i][1] - v.cy) * v.k + v.H / 2;
        if(y < -pad || y > v.H + pad) continue;
        const w = cs[i].name.length * ATL_CFS * 0.46 + ATL_CDOT + 8;
        const flip = x + w > ATL_W - 6;
        cands.push({ i, x, y, flip,
          box: { x: flip ? x - w : x - ATL_CDOT, y: y - ATL_CFS * 0.62, w: w + ATL_CDOT, h: ATL_CFS * 1.2 } });
      }
      const set = geoLayout(cands, ATL_W, v.H, 4, ctx.taken || atlNameBox(ctx.it, v) || []);
      for(const c of set){
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
      ctx.taken = (ctx.taken || []).concat(set.map(c => c.box));
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
/* THE RING YOU CAN SEE IS THE RING YOU CAN HIT. A country smaller than the
   marker standing for it cannot be found by testing polygons — there is no
   pixel of San Marino to land on at any zoom — so the marker is hit-tested
   instead, in picture units, exactly where it was drawn and only while it is
   shown. It is asked BEFORE the polygons, and it is the only thing that may
   overrule them: clicking the ring means the ring, even though Italy is under
   it, and clicking ten pixels away means Italy. */
function atlRingAt(it, v, q){
  const list = geoTinyCountries(atlProj(it));
  let best = -1, bd = ATL_TINY * ATL_TINY;
  for(const t of list){
    if(t.span * v.k > ATL_TINY * 2) continue;      /* big enough now: not a ring */
    const dx = (t.x - v.cx) * v.k + ATL_W / 2 - q[0];
    const dy = (t.y - v.cy) * v.k + v.H / 2 - q[1];
    const d = dx * dx + dy * dy;
    if(d < bd){ bd = d; best = t.i; }
  }
  return best;
}
defineMapLayer('tiny', {
  label: 'Small countries', order: 66, on: 1,
  build(ctx){
    return geoTinyCountries(atlProj(ctx.it))
      .map(() => '<g class="attiny"><circle r="' + ATL_TINY + '"/></g>').join('');
  },
  frame(g, ctx){
    const v = ctx.view, list = geoTinyCountries(atlProj(ctx.it)), pad = ATL_TINY * 2;
    const on = new Set();
    for(let k = 0; k < list.length; k++){
      const t = list[k];
      if(t.span * v.k > ATL_TINY * 2) continue;     /* big enough now: it speaks for itself */
      const x = (t.x - v.cx) * v.k + ATL_W / 2;
      if(x < -pad || x > ATL_W + pad) continue;
      const y = (t.y - v.cy) * v.k + v.H / 2;
      if(y < -pad || y > v.H + pad) continue;
      const el = g.children[k];
      if(!el) continue;
      el.setAttribute('transform', 'translate(' + rd1(x) + ' ' + rd1(y) + ')');
      el.classList.add('on');
      on.add(k);
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
const atlSel = it => (it.sel ? geoCoIndexOf(it.sel) : -1);
const atlPickLayer = () => ATL_LAYERS.find(L => L.id === 'pick');
/* the label the capitals have to keep off, in picture units — nothing at all
   unless a country really is picked and the layer that draws it is on */
function atlNameBox(it, v){
  if(!it.sel || !atlOn(it, atlPickLayer())) return null;
  const i = atlSel(it);
  if(i < 0) return null;
  const lb = geoCoLabel(atlProj(it), i);
  if(!(lb.fs > 0)) return null;
  const w = lb.w * v.k, h = lb.h * v.k;
  return [{ x: (lb.x - v.cx) * v.k + ATL_W / 2 - w / 2,
            y: (lb.y - v.cy) * v.k + v.H / 2 - h / 2, w, h }];
}
/* one country's name as lines of type, centred on the spot geoCoLabel found.
   The halo is a stroke width in WORLD units set on the element itself: the
   group's own stroke-width is the outline's, and an attribute here beats the
   one inherited from it — see the note in atlPaint about why neither may be
   a stylesheet rule. */
function atlNameSVG(lb, r){
  if(!lb || !(lb.fs > 0)) return '';
  r = r || rd1;                                    /* a card writes at the country's own scale */
  const n = lb.lines.length, fs = lb.fs, x = r(lb.x);
  return '<text class="atconame" x="' + x + '" y="' + r(lb.y) + '" font-size="' + r(fs) +
    '" stroke-width="' + r(fs * 0.16) + '">' +
    lb.lines.map((t, k) => '<tspan x="' + x + '" dy="' +
      r(k ? fs * GEO_LBL_H : fs * (0.34 - (n - 1) * GEO_LBL_H / 2)) + '">' + esc(t) + '</tspan>').join('') +
    '</text>';
}
/* the smallest name worth writing on the country itself. Below this a country
   could not show its own name at the FURTHEST this map ever goes in — Monaco's
   would be a pixel and a half at 32× — so it is not written there at all, and
   the frame writes it beside the country instead, at reading size. */
const ATL_LBL_MIN = 9 / (ATL_W / GEO_W * Math.pow(2, ATL_ZMAX));
const atlOnShape = lb => !!lb && lb.fs >= ATL_LBL_MIN;

defineMapLayer('pick', {
  label: 'Picked country', order: 70, on: 1, sw: 2.6,
  world(ctx){
    const it = ctx.it, i = atlSel(it);
    if(i < 0) return '';
    const lb = geoCoLabel(atlProj(it), i);
    return '<path class="atpick" d="' + geoCoPath(atlProj(it), it.look || 'smooth', i) + '"/>' +
      (atlOnShape(lb) ? atlNameSVG(lb) : '');
  },
  build: () => '<g class="atcap atpickn"><text class="atname" x="' + (ATL_TINY + 6) +
    '" y="' + (ATL_FS * 0.36) + '"></text></g>',
  frame(g, ctx){
    const el = g.firstElementChild;
    if(!el) return;
    const it = ctx.it, v = ctx.view, i = atlSel(it);
    const lb = i < 0 ? null : geoCoLabel(atlProj(it), i);
    if(!lb || atlOnShape(lb)){                     /* the country writes its own name */
      if(el.classList.contains('on')){ el.classList.remove('on'); el.firstElementChild.textContent = ''; }
      return;
    }
    const x = (lb.x - v.cx) * v.k + ATL_W / 2, y = (lb.y - v.cy) * v.k + v.H / 2;
    const name = geoCoName(i);
    if(el.firstElementChild.textContent !== name) el.firstElementChild.textContent = name;
    const flip = x + name.length * ATL_FS * 0.46 + ATL_TINY + 12 > ATL_W;
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
function atlWin(it, v){
  const hw = ATL_W / (2 * v.k), hh = v.H / (2 * v.k);
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
const atlPathsFor = (it, v) => geoPaths(atlProj(it), it.look || 'smooth', atlLod(v.z), atlWin(it, v));

/* ---- the view ----
   `k` takes world units to picture units: at z = 0 the world is exactly as
   wide as the picture, and every step of z doubles it. The centre is kept as
   a longitude and a latitude in the record — which is what makes it readable,
   and what lets the projection change under it without the map jumping. */
function atlGeom(it){
  const ar = clamp(nz(it.ar, 0.5), 0.3, 1.1);
  return { ar, H: rd1(ATL_W * ar), P: geoProj(atlProj(it)), W: ATL_W };
}
/* as far out as the world may go: never smaller than the picture, in either
   direction — so there is no letterbox to pan into, ever */
function atlZMin(it){
  const g = atlGeom(it);
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
  const g = atlGeom(it);
  const z = L ? L.z : clamp(nz(it.zm, 0), atlZMin(it), ATL_ZMAX);
  const k = ATL_W / GEO_W * Math.pow(2, z);
  let cx, cy;
  if(L){ cx = L.cx; cy = L.cy; }
  else {
    const c = g.P.fwd(nz(it.lon, 8), nz(it.lat, 16)), lim = atlLimits(it, k);
    cx = clamp(c[0], lim.x0, lim.x1); cy = clamp(c[1], lim.y0, lim.y1);
  }
  return { ar: g.ar, H: g.H, P: g.P, W: ATL_W, z, k, cx, cy };
}

/* ---- the picture ----
   The static half: everything print, an export and the overview ever see. The
   pins group is left empty here and filled in mount(), which runs for those
   too — so an exported map carries exactly the labels that fitted. */
function atlSVG(it, view){
  const v = view || atlView(it, null);
  const paths = atlPathsFor(it, v);
  const ctx = { it, view: v, paths };
  const id = esc(String(it.id));
  let world = '', pins = '';
  for(const L of ATL_LAYERS){
    if(!atlOn(it, L)) continue;
    if(L.world) world += '<g class="atlay" data-l="' + L.id + '" data-sw="' + (L.sw || 2) + '">' + L.world(ctx) + '</g>';
    if(L.build) pins += '<g class="atlay" data-l="' + L.id + '"></g>';
  }
  return '<svg class="atmap" viewBox="0 0 ' + ATL_W + ' ' + v.H + '" xmlns="http://www.w3.org/2000/svg"' +
    ' data-built="' + esc(atlLod(v.z) + '|' + atlWinKey(atlWin(it, v))) + '"' +
    ' style="aspect-ratio:' + ATL_W + '/' + v.H + '">' +
    '<defs><clipPath id="atl-' + id + '"><rect x="0" y="0" width="' + ATL_W + '" height="' + v.H + '" rx="14"/></clipPath>' +
    '<linearGradient id="atlsea-' + id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" class="atsea0"/><stop offset="1" class="atsea1"/></linearGradient></defs>' +
    '<g clip-path="url(#atl-' + id + ')">' +
    '<rect class="atsea" x="0" y="0" width="' + ATL_W + '" height="' + v.H + '" fill="url(#atlsea-' + id + ')"/>' +
    '<g class="atworld">' + world + '</g><g class="atpins">' + pins + '</g></g>' +
    '<rect class="atedge" x="1" y="1" width="' + (ATL_W - 2) + '" height="' + rd1(v.H - 2) + '" rx="13"/>' +
    '</svg>';
}

/* the one place the view reaches the DOM: a transform, a stroke width a layer,
   and each screen-space layer's own frame. Everything it touches is looked up
   once and hung on the <svg> — a frame must not be querying the document. */
function atlPlan(svg, it){
  if(svg.__plan) return svg.__plan;
  const plan = { world: svg.querySelector('.atworld'), lay: [], pins: [], built: svg.dataset.built || '' };
  for(const g of svg.querySelectorAll('.atworld .atlay'))
    plan.lay.push({ g, sw: +g.dataset.sw || 0, spec: ATL_LAYERS.find(L => L.id === g.dataset.l) });
  for(const L of ATL_LAYERS){
    if(!L.frame || !atlOn(it, L)) continue;
    const g = svg.querySelector('.atpins .atlay[data-l="' + L.id + '"]');
    if(g) plan.pins.push({ L, g });
  }
  svg.__plan = plan;
  return plan;
}
/* the world's markup, replaced — only ever because the detail step or the
   window changed. Everything else about a map is the transform. */
function atlReworld(svg, it, v, p){
  const paths = atlPathsFor(it, v), ctx = { it, view: v, paths };
  for(const L of p.lay){
    if(!L.spec.world) continue;
    const d = L.spec.world(ctx);
    if(d !== L.d){ L.d = d; L.g.innerHTML = d; }
  }
  p.built = atlLod(v.z) + '|' + atlWinKey(atlWin(it, v));
}
function atlPaint(el, it, v, force){
  const svg = el.querySelector('svg.atmap');
  if(!svg) return;
  const p = atlPlan(svg, it);
  const built = atlLod(v.z) + '|' + atlWinKey(atlWin(it, v));
  if(p.built !== built) atlReworld(svg, it, v, p);
  /* a settling spring's last frames move the picture by a fraction of a pixel.
     Nothing on screen can show that, so nothing on screen is touched for it */
  const was = p.was;
  if(!force && was && v.z === was.z &&
     Math.abs((v.cx - was.cx) * v.k) < .05 && Math.abs((v.cy - was.cy) * v.k) < .05) return;
  p.was = { cx: v.cx, cy: v.cy, z: v.z };
  if(p.world) p.world.setAttribute('transform',
    'translate(' + rd1(ATL_W / 2 - v.cx * v.k) + ' ' + rd1(v.H / 2 - v.cy * v.k) + ') scale(' + v.k + ')');
  /* the stroke goes on the group as an ATTRIBUTE and the paths inherit it —
     which is why no rule in the stylesheet may set stroke-width on them: CSS
     beats a presentation attribute and every line would freeze at one width */
  for(const L of p.lay){
    const w = Math.round(L.sw / v.k * 100) / 100;
    if(L.w !== w){ L.w = w; L.g.setAttribute('stroke-width', w); }
  }
  if(!p.pins.length) return;
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
  const L = { el, page, cx: v.cx, cy: v.cy, z: v.z, raf: 0 };
  const bump = () => {
    if(L.raf) return;
    L.raf = requestAnimationFrame(() => { L.raf = 0; atlPaint(L.el, it, atlView(it, L)); });
  };
  const rest = () => { if(!L.sx.active && !L.sy.active && !L.sz.active) atlSettle(it, L); };
  L.sx = spring({ from: v.cx, damping: 1, response: .3, rest: .5, onUpdate: x => { L.cx = x; bump(); }, onRest: rest });
  L.sy = spring({ from: v.cy, damping: 1, response: .3, rest: .5, onUpdate: y => { L.cy = y; bump(); }, onRest: rest });
  L.sz = spring({ from: v.z, damping: 1, response: .22, rest: .0015, restSpeed: .02,
                  onUpdate: z => { L.z = z; bump(); }, onRest: rest });
  ATL_LIVE.set(it.id, L);
  return L;
}
/* the view, back into the record, as a place rather than as world units */
function atlSettle(it, L){
  const P = geoProj(atlProj(it)), ll = P.inv(L.cx, L.cy);
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
  let mode = 0, st = null, dn = null, carry = null;

  /* where in the world the pointer is standing */
  const world = e => {
    const v = atlView(it, L), q = svgAt(svg, e);
    return [v.cx + (q[0] - ATL_W / 2) / v.k, v.cy + (q[1] - v.H / 2) / v.k];
  };
  const startPan = e => {
    const v = atlView(it, L), q = svgAt(svg, e), w = world(e);
    /* what is under the finger is worked out ONCE, here — the whole gesture
       hangs off it, and asking again per move would be asking 177 countries a
       question whose answer cannot have changed. The box is read once for the
       same reason: reading it per move is a layout in the middle of a drag. */
    const ring = atlRingAt(it, v, q);
    st = { k: v.k, px: q[0], py: q[1], cx: L.cx, cy: L.cy, lim: atlLimits(it, v.k),
           co: ring >= 0 ? ring : geoCoAt(atlProj(it), w[0], w[1], ATL_TINY / v.k),
           box: svg.getBoundingClientRect() };
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
  /* ---- out of the map, still holding land ----
     The gesture IS the sentence. Inside the picture a drag pans, which is what
     it has always been, so nothing that worked before has been taken away. It
     is only when the hand leaves the picture still holding a country that the
     map lets go: the pan it was until a moment ago springs back to where it
     started, and the country comes with the hand instead. */
  const outside = e => {
    const b = st.box, m = 14;
    return e.clientX < b.left - m || e.clientX > b.right + m ||
           e.clientY < b.top - m || e.clientY > b.bottom + m;
  };
  const startCarry = e => {
    carry = atlCarry(it, st.co);
    atlCarryAt(carry, e);
    L.sx.set({ response: .4 }).to(st.cx);
    L.sy.set({ response: .4 }).to(st.cy);
    SND.plop();
  };
  const movePan = e => {
    if(st.co >= 0 && !ATL_MOVE.has(it.id) && outside(e)) return startCarry(e);
    const q = svgAt(svg, e);
    atlJump(L, atlBand(st.cx - (q[0] - st.px) / st.k, st.lim.x0, st.lim.x1),
               atlBand(st.cy - (q[1] - st.py) / st.k, st.lim.y0, st.lim.y1));
  };
  const movePinch = () => {
    const a = [...pts.values()];
    if(a.length < 2) return;
    const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
    const z = clamp(st.z + Math.log2(d / st.d), atlZMin(it), ATL_ZMAX);
    const k = ATL_W / GEO_W * Math.pow(2, z), lim = atlLimits(it, k);
    atlJump(L, clamp(st.wx - (st.mx - ATL_W / 2) / k, lim.x0, lim.x1),
               clamp(st.wy - (st.my - st.H / 2) / k, lim.y0, lim.y1), z);
  };
  /* let go: whatever was pulled past the edge comes back, and whatever was
     thrown carries on and slows down the way a sheet of paper would */
  const release = () => {
    const v = atlView(it, L), lim = atlLimits(it, v.k);
    const box = svg.getBoundingClientRect();
    const s2p = box.width ? ATL_W / box.width : 1;
    const vel = mode === 1 ? fl.vel() : { vx: 0, vy: 0 };
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
    if(pts.size === 1){ dn = { x: e.clientX, y: e.clientY };
                        L.sx.set({ response: .3 }); L.sy.set({ response: .3 }); startPan(e); }
    else if(pts.size === 2) startPinch();
  });
  svg.addEventListener('pointermove', e => {
    if(!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(carry) return atlCarryAt(carry, e);
    if(mode === 2) movePinch();
    else if(mode === 1){ fl.track(e); movePan(e); }
  });
  const off = e => {
    if(!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if(carry){                                       /* a country in the hand: nothing else applies */
      if(pts.size) return;
      atlDrop(carry, el, it, page, e, st.co);
      carry = null; mode = 0; st = null;
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

/* ---- picking one, and lighting it up ----
   Tapping the country that is already picked puts it back, so the same tap is
   both halves of the gesture and there is nothing to learn. */
function atlTap(el, it, page, i){
  const name = i < 0 ? '' : geoCoName(i);
  atlPick(el, it, page, (it.sel || '') === name ? '' : name, false);
}
function atlPick(el, it, page, name, blink){
  if(name) it.sel = name; else delete it.sel;
  if(page) queueSave(page.id);
  atlDrawPick(el, it, blink);
  SND.tick();
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
  g.innerHTML = L.world({ it, view: v, paths: atlPathsFor(it, v) });
  clearTimeout(g.__blink);
  g.classList.toggle('blink', !!blink);
  if(blink) g.__blink = setTimeout(() => g.classList.remove('blink'), ATL_BLINK);
}
/* ⌕ takes you there rather than putting you there: the three springs are
   retargeted at the country's own box and the map walks, so the reader sees
   WHERE in the world it went — which is most of what a map is for. */
function atlFlyTo(it, i){
  const L = ATL_LIVE.get(it.id);
  if(!L) return;
  const b = geoCoMain(atlProj(it), i), g = atlGeom(it);
  const bw = Math.max(b.x1 - b.x0, 8), bh = Math.max(b.y1 - b.y0, 8);
  const k = Math.min(ATL_W / (bw * 1.35), g.H / (bh * 1.35));   /* fit it, with air round it */
  const z = clamp(Math.log2(k * GEO_W / ATL_W), atlZMin(it), ATL_ZMAX);
  const kk = ATL_W / GEO_W * Math.pow(2, z), lim = atlLimits(it, kk);
  L.sz.set({ response: .8 }).to(z);
  L.sx.set({ response: .8 }).to(clamp((b.x0 + b.x1) / 2, lim.x0, lim.x1));
  L.sy.set({ response: .8 }).to(clamp((b.y0 + b.y1) / 2, lim.y0, lim.y1));
}

/* ---- the country in the hand ----
   A shape following the pointer, outside the map and outside the paper: it is
   not an item yet and must not be treated as one, because the drop may never
   happen. On the way down it becomes an ordinary `country` card at the point
   it was let go of; brought back over the map, nothing happened at all. */
function atlCarry(it, i){
  const proj = atlProj(it), b = geoCoMain(proj, i);
  const w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.y1 - b.y0, 1), m = Math.max(w, h) * .07;
  const d = document.createElement('div');
  d.className = 'atcarry';
  d.innerHTML = '<svg viewBox="' + [rd1(b.x0 - m), rd1(b.y0 - m), rd1(w + 2 * m), rd1(h + 2 * m)].join(' ') +
    '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
    '<path d="' + geoCoPath(proj, it.look || 'smooth', i, 1) + '" stroke-width="' +
    rd1(Math.max(w, h) / 110) + '"/></svg><b>' + esc(geoCoName(i)) + '</b>';
  document.body.appendChild(d);
  return d;
}
const atlCarryAt = (d, e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; };
function atlDrop(d, el, it, page, e, i){
  d.remove();
  const svg = el.querySelector('svg.atmap'), surf = el.parentElement;
  if(e.type !== 'pointerup' || !surf) return;        /* cancelled: nothing happened */
  const b = svg.getBoundingClientRect();
  if(e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom) return;
  atlSpawn(geoCoName(i), it, page, pctFrom(e, surf));
}
/* the one way a country card is ever made: the kind is registered like any
   other, and WHICH country is left here for its maker to pick up — an add-kind
   takes no argument of its own, and inventing one for this would change the
   shape of the registry for every feature that never needed it */
function atlSpawn(name, it, page, at){
  ATL_NEXT = { co: name, proj: atlProj(it), look: it.look || 'smooth' };
  addItem('country', at, page);
}

/* ---- the ⌕ box: a country by name ----
   The same glass box the molecules use, over the same kind of list. It serves
   the map and the country card both: on a map picking a name walks there and
   lights it up, on a card it is simply which country the card is of. */
let ATL_ASK = null;
function atlAskEl(){
  let d = $('#atlask');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'atlask glass'; d.id = 'atlask';
  d.innerHTML = '<input placeholder="a country — Japan, Peru, Côte d’Ivoire, USA…" spellcheck="false">' +
    '<div class="atsug"></div>';
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => e.stopPropagation());
  const inp = d.querySelector('input'), sug = d.querySelector('.atsug');
  const list = () => {
    sug.innerHTML = geoFindCo(inp.value, 9).map(i => {
      const c = geoCoCapitals(i)[0];
      return '<button data-i="' + i + '">' + esc(geoCoName(i)) +
        '<small>' + esc(c ? c.name : '—') + '</small></button>';
    }).join('');
  };
  d.__list = list;
  inp.addEventListener('input', list);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); atlAskClose(); }
    if(e.key === 'Enter'){ e.preventDefault(); const b = sug.querySelector('button'); if(b) atlAskTake(+b.dataset.i); }
    if(e.key === 'ArrowDown'){ e.preventDefault(); const b = sug.querySelector('button'); if(b) b.focus(); }
  });
  sug.addEventListener('keydown', e => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if(!b) return;
    if(e.key === 'Escape'){ e.preventDefault(); atlAskClose(); }
    if(e.key === 'Enter'){ e.preventDefault(); atlAskTake(+b.dataset.i); }
    if(e.key === 'ArrowDown' && b.nextElementSibling){ e.preventDefault(); b.nextElementSibling.focus(); }
    if(e.key === 'ArrowUp'){ e.preventDefault(); (b.previousElementSibling || inp).focus(); }
  });
  sug.addEventListener('click', e => { const b = e.target.closest('button'); if(b) atlAskTake(+b.dataset.i); });
  return d;
}
function atlAsk(anchor, it, el, page){
  const d = atlAskEl();
  if(d.classList.contains('open') && ATL_ASK && ATL_ASK.anchor === anchor) return atlAskClose();
  ATL_ASK = { it, el, page, anchor };
  d.classList.add('open');
  const inp = d.querySelector('input');
  inp.value = ''; d.__list();                        /* nothing typed: the first few, alphabetically */
  const r = anchor.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
  d.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
  if(r.top - h - 10 >= 8){ d.style.top = 'auto'; d.style.bottom = (innerHeight - r.top + 10) + 'px'; }
  else { d.style.bottom = 'auto'; d.style.top = clamp(r.bottom + 10, 8, innerHeight - h - 8) + 'px'; }
  warpIn(d, r.left + r.width / 2, r.top + r.height / 2);
  inp.focus({ preventScroll: true });
}
function atlAskClose(){
  const d = $('#atlask');
  if(!d || !d.classList.contains('open') || !ATL_ASK) return;
  ATL_ASK = null;
  if(d.contains(document.activeElement)) document.activeElement.blur();
  warpOut(d, () => { if(!ATL_ASK) d.classList.remove('open'); });
}
function atlAskTake(i){
  if(!ATL_ASK || !(i >= 0)) return;
  const { it, el, page } = ATL_ASK;
  atlAskClose();
  if(it.type === 'country'){ it.co = geoCoName(i); queueSave(page.id); ctryRedraw(el, it, page); SND.pop(); return; }
  atlPick(el, it, page, geoCoName(i), true);
  atlFlyTo(it, i);
  SND.pop();
}
window.addEventListener('pointerdown', e => {
  if(ATL_ASK && !e.target.closest('#atlask') &&
     !(ATL_ASK.anchor === e.target || ATL_ASK.anchor.contains(e.target))) atlAskClose();
});

/* the wheel zooms about the pointer — by an amount, not a step, so a trackpad
   creeps and a notch is a notch. Ctrl+wheel is still the desk's own zoom. */
function atlZoom(el, it, L, svg, ev, dz){
  const v = atlView(it, L);
  const q = svgAt(svg, ev);
  const wx = v.cx + (q[0] - ATL_W / 2) / v.k, wy = v.cy + (q[1] - v.H / 2) / v.k;
  const z = clamp(L.sz.target + dz, atlZMin(it), ATL_ZMAX);
  if(Math.abs(z - L.sz.target) < 1e-6) return;
  const k = ATL_W / GEO_W * Math.pow(2, z), lim = atlLimits(it, k);
  L.sz.to(z);
  L.sx.set({ response: .22 }).to(clamp(wx - (q[0] - ATL_W / 2) / k, lim.x0, lim.x1));
  L.sy.set({ response: .22 }).to(clamp(wy - (q[1] - v.H / 2) / k, lim.y0, lim.y1));
}
/* …and the home button walks it back rather than cutting to it */
function atlHome(el, it, L){
  const P = geoProj(atlProj(it)), c = P.fwd(8, 16), z = atlZMin(it), k = ATL_W / GEO_W * Math.pow(2, z);
  const lim = atlLimits(it, k);
  L.sz.to(z);
  L.sx.set({ response: .45 }).to(clamp(c[0], lim.x0, lim.x1));
  L.sy.set({ response: .45 }).to(clamp(c[1], lim.y0, lim.y1));
}

/* ---- the layer panel ----
   Built from the registry, so a layer written tomorrow is listed tonight. */
function atlPanel(el, it, page){
  const p = el.querySelector('.atpanel');
  if(!p) return;
  p.classList.toggle('open', ATL_PANEL.has(it.id));
  p.innerHTML = ATL_LAYERS.map(L =>
    '<button data-l="' + esc(L.id) + '"' + (atlOn(it, L) ? ' class="on"' : '') + '>' +
    esc(L.label || L.id) + '</button>').join('');
}
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
  old.outerHTML = atlSVG(it, atlView(it, ATL_LIVE.get(it.id) || null));
  atlPanel(el, it, page);
  const L = ATL_LIVE.get(it.id) || atlLive(el, it, page);
  L.el = el;
  atlBuildPins(el, it);
  atlPaint(el, it, atlView(it, L));
  atlPointers(el.querySelector('svg.atmap'), el, it, page, L);
  atlWheel(el, it, page, L);
}
function atlBuildPins(el, it){
  const v = atlView(it, ATL_LIVE.get(it.id) || null);
  const ctx = { it, view: v, paths: atlPathsFor(it, v) };
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
  const L = atlLive(el, it, page);
  if(ATL_MOVE.has(it.id)) el.classList.add('atmove');
  atlPanel(el, it, page);
  atlBuildPins(el, it);
  atlPaint(el, it, atlView(it, L));
  const svg = el.querySelector('svg.atmap');
  if(svg){
    svg.addEventListener('mousedown', e => { if(e.button === 1) e.preventDefault(); });
    atlPointers(svg, el, it, page, L);
    atlWheel(el, it, page, L);
  }
  const p = el.querySelector('.atpanel');
  if(p){
    p.addEventListener('pointerdown', e => e.stopPropagation());
    p.addEventListener('dblclick', e => e.stopPropagation());
    p.addEventListener('click', e => {
      const b = e.target.closest('button');
      if(b) atlToggleLayer(el, it, page, b.dataset.l);
    });
  }
  el.addEventListener('dblclick', e => {
    if(e.target.closest('.atpanel')) return;
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
  html: (it, c) => '<figure class="body atlas"><div class="atbox">' + atlSVG(it) +
    (c.live ? '<div class="atpanel"></div>' : '') + '</div><figcaption></figcaption></figure>',
  /* print, the overview and an export come through here too, which is how a
     map that was never on screen still gets its labels put in the right place */
  mount(el, it, c){
    atlBuildPins(el, it);
    atlPaint(el, it, atlView(it, c.live ? ATL_LIVE.get(it.id) : null));
    if(!c.live) el.querySelectorAll('.atpins .atcap:not(.on)').forEach(n => n.remove());
  },
  forget(it){
    ATL_LIVE.delete(it.id); ATL_MOVE.delete(it.id); ATL_PANEL.delete(it.id);
    if(ATL_ASK && ATL_ASK.it.id === it.id) atlAskClose();
  },
  tools(mk, it, el, page){
    mk('◍', 'Layers — what is drawn on the map', () => {
      if(ATL_PANEL.has(it.id)) ATL_PANEL.delete(it.id); else ATL_PANEL.add(it.id);
      atlPanel(el, it, page);
    });
    mk('⌕', 'Find a country — the map walks there and lights it up', b => atlAsk(b, it, el, page));
    mk('⇱', 'Take the picked country off onto the page — or drag it out of the map',
      () => { const i = atlSel(it); if(i >= 0) atlSpawn(geoCoName(i), it, page, { x: it.x + pctW(40), y: it.y + pctH(40) }); });
    mk('◎', 'Projection — flat or Mercator', b => {
      it.proj = atlProj(it) === 'mercator' ? 'equirect' : 'mercator';
      b.title = 'Projection: ' + geoProj(it.proj).label;
      const L = ATL_LIVE.get(it.id);
      if(L){                                        /* the same place, on the new sheet */
        const c = geoProj(atlProj(it)).fwd(nz(it.lon, 8), nz(it.lat, 16));
        L.z = clamp(L.z, atlZMin(it), ATL_ZMAX);
        atlJump(L, c[0], c[1], L.z);
      }
      queueSave(page.id); atlRebuild(el, it, page);
    });
    mk('◈', 'Outlines — drawn round, or straight off the data', b => {
      it.look = it.look === 'crisp' ? 'smooth' : 'crisp';
      b.title = 'Outlines: ' + (it.look === 'crisp' ? 'straight' : 'round');
      queueSave(page.id); atlRebuild(el, it, page);
    });
    mk('▭', 'How tall the map is', b => {
      openProps(b, {
        title: 'Map',
        rows: [{ t:'range', label:'Height', min:30, max:110, step:2,
                 get: () => Math.round(clamp(nz(it.ar, .5), .3, 1.1) * 100),
                 set: v => { it.ar = v / 100; },
                 fmt: v => v + '%' }],
        onchange(){ atlRebuild(el, it, page); },
        onsave(){ queueSave(page.id); },
        onreset(){ it.ar = 0.5; atlRebuild(el, it, page); queueSave(page.id); }
      });
    });
    mk('⌂', 'The whole world again', () => { const L = ATL_LIVE.get(it.id); if(L) atlHome(el, it, L); });
    mk('✥', 'Move it about the page — or double-click it', () => atlMove(el, it, !ATL_MOVE.has(it.id)));
  },
  wire(el, it, page){ wireAtlas(el, it, page); },
  icon: it => atlGlyph(it),
  label: () => 'World',
  meta: it => geoProj(atlProj(it)).label + ' · ' + atlWhere(it)
});
onNoteOpen(() => { ATL_LIVE.clear(); ATL_MOVE.clear(); ATL_PANEL.clear(); ATL_NEXT = null; atlAskClose(); });

/* ---- how it looks ----
   Quiet: a wash of sea, a wash of land, and hairlines. The lines take their
   colour from the ink, so the outline is dark on paper and white in the dark
   themes with nothing here to switch. NOTHING in here may set stroke-width on
   a path under .atworld — see the note in atlPaint. */
addCSS('atlas', `
/* ---------- the atlas ---------- */
.atlas{display:block}
.atbox{position:relative}
svg.atmap{display:block;width:100%;height:auto;background:none;touch-action:none;
  shape-rendering:geometricPrecision}
.atmap .atsea0{stop-color:color-mix(in srgb,var(--accent2) 15%,var(--paper));stop-opacity:1}
.atmap .atsea1{stop-color:color-mix(in srgb,var(--accent2) 10%,var(--paper));stop-opacity:1}
.atmap .atedge{fill:none;stroke:var(--line);stroke-width:2;opacity:.8}
.atmap .atlay{fill:none;stroke-linejoin:round;stroke-linecap:round}
.atmap path.atland{fill:color-mix(in srgb,var(--paper) 88%,var(--ink));fill-rule:evenodd;stroke:none}
.atmap path.atcoast{fill:none;stroke:var(--ink);opacity:.9}
.atmap path.atbord{fill:none;stroke:var(--ink);opacity:.3}
.atmap path.atgrat{fill:none;stroke:var(--line);opacity:.55}
/* the capitals: every one is a node from the start, and the frame decides which
   of them is set. The fade is what stops one popping in as the zoom crosses it */
.atmap .atcap{opacity:0;pointer-events:none;transition:opacity .22s ease-out}
.atmap .atcap.on{opacity:1}
.atmap circle.atdot{fill:var(--accent);stroke:var(--paper);stroke-width:2}
.atmap text.atname{font-family:var(--disp);font-size:${ATL_FS}px;font-weight:600;letter-spacing:.4px;
  fill:var(--ink);stroke:var(--paper);stroke-width:5;paint-order:stroke;stroke-linejoin:round}
@media (prefers-reduced-motion: reduce){ .atmap .atcap{transition:none} }
/* the picked country: a wash of the accent over it, its own outline inked, and
   its name written across it at whatever size fits inside its borders. All of
   it is in WORLD units inside the group that moves, which is why the name goes
   on fitting the country however far in the map is taken. */
.atmap path.atpick{fill:color-mix(in srgb,var(--accent) 30%,transparent);
  stroke:var(--accent);stroke-linejoin:round}
.atconame{font-family:var(--disp);font-weight:700;letter-spacing:.02em;text-anchor:middle;
  fill:var(--ink);stroke:var(--paper);paint-order:stroke;stroke-linejoin:round;pointer-events:none}
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
/* the ⌕ box — the molecules' one, over countries */
.atlask{position:fixed;z-index:83;display:none;width:250px;padding:10px;border-radius:13px;
  font-family:var(--mono);will-change:transform,filter,opacity}
.atlask.open{display:block}
.atlask input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.07);border:0;outline:0;
  border-radius:8px;color:inherit;font-family:var(--mono);font-size:12px;padding:7px 9px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.atlask input::placeholder{color:rgba(233,234,239,.35)}
.atlask input:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}
.atsug{display:flex;flex-direction:column;gap:2px;margin-top:6px;max-height:210px;overflow:auto}
.atsug:empty{margin:0}
.atsug button{display:flex;justify-content:space-between;gap:10px;align-items:baseline;text-align:left;
  padding:5px 8px;border-radius:7px;font-size:10.5px;letter-spacing:.04em;
  color:rgba(233,234,239,.85);background:rgba(255,255,255,.035)}
.atsug button small{opacity:.5;white-space:nowrap}
.atsug button:hover,.atsug button:focus{background:var(--accent);color:#fff;outline:none}
.atsug button:hover small,.atsug button:focus small{opacity:.75}
/* the height of the land: hypsometric tints, the convention rather than the
   theme — but the theme owns the sea painted back over the coast, and how
   heavily the tints are laid on */
.atmap .atlay[data-l="relief"]{opacity:.92}
.atmap .atlay[data-l="relief"] path{stroke:none}
.atmap path.atrelsea{fill:color-mix(in srgb,var(--accent2) 12%,var(--paper));fill-rule:evenodd}
/* water. A lake is the sea's own colour, which is what makes it read as water */
.atmap path.atlake{fill:color-mix(in srgb,var(--accent2) 34%,var(--paper));
  stroke:color-mix(in srgb,var(--accent2) 70%,var(--ink));opacity:.95}
.atmap path.atriver{fill:none;stroke:color-mix(in srgb,var(--accent2) 72%,var(--ink));opacity:.75}
/* the cities: the capitals again, quieter — see the note over the layer */
.atmap .atcity{opacity:0;pointer-events:none;transition:opacity .22s ease-out}
.atmap .atcity.on{opacity:1}
.atmap circle.atcdot{fill:none;stroke:var(--ink);stroke-width:1.6;opacity:.75}
.atmap text.atcname{font-family:var(--disp);font-size:${rd1(ATL_CFS)}px;font-weight:500;letter-spacing:.3px;
  fill:var(--ink);opacity:.82;stroke:var(--paper);stroke-width:4;paint-order:stroke;stroke-linejoin:round}
/* and the ring round a country smaller than the pen */
.atmap .attiny{opacity:0;pointer-events:none;transition:opacity .25s ease-out}
.atmap .attiny.on{opacity:.55}
.atmap .attiny circle{fill:none;stroke:var(--accent);stroke-width:1.5}
@media (prefers-reduced-motion: reduce){ .atmap .atcity,.atmap .attiny{transition:none} }
/* the panel of layers — glass, inside the map, and only ever on screen */
.atpanel{position:absolute;right:calc(var(--scale)*8px);top:calc(var(--scale)*8px);z-index:24;
  display:none;flex-direction:column;gap:calc(var(--scale)*2px);padding:calc(var(--scale)*4px);
  border-radius:calc(var(--scale)*8px);background:color-mix(in srgb,var(--paper) 78%,transparent);
  border:1px solid color-mix(in srgb,var(--ink) 12%,transparent);
  backdrop-filter:blur(calc(var(--scale)*9px)) saturate(1.4);
  box-shadow:0 calc(var(--scale)*6px) calc(var(--scale)*18px) rgba(0,0,0,.16)}
.atpanel.open{display:flex}
.atpanel button{font-family:var(--mono);font-size:calc(var(--scale)*11px);letter-spacing:.05em;
  color:var(--soft);text-align:left;white-space:nowrap;border-radius:calc(var(--scale)*5px);
  padding:calc(var(--scale)*4px) calc(var(--scale)*9px)}
.atpanel button:hover{color:var(--ink);background:color-mix(in srgb,var(--ink) 7%,transparent)}
.atpanel button.on{color:var(--ink);background:color-mix(in srgb,var(--accent2) 20%,transparent)}
/* selected, the map takes the hand; picked up, it is an item again */
.item.sel[data-type="atlas"] svg.atmap{cursor:grab}
.item.sel[data-type="atlas"] svg.atmap:active{cursor:grabbing}
.item.sel[data-type="atlas"].atmove svg.atmap{cursor:grab}
.item.atmove .atlas{box-shadow:0 0 0 calc(var(--scale)*2px) var(--accent),
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
  const proj = atlProj(it), i = geoCoIndexOf(it.co);
  if(i < 0) return null;
  const b = geoCoMain(proj, i);
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
  return { i, proj, look: it.look || 'smooth', b, w, h, u, m, r,
           vb: [r(b.x0 - m), r(b.y0 - m), r(w + 2 * m), r(h + 2 * m)] };
}
/* a capital into the country's own frame — Suva is at 178°E and Fiji's frame is
   just past the 180th, so the dot has to be carried the same way the rings were */
function ctryCapXY(g, c){
  const P = geoProj(g.proj), q = P.fwd(c.lon, c.lat), W = P.wrap;
  if(W) q[0] += Math.round(((g.b.x0 + g.b.x1) / 2 - q[0]) / W) * W;
  return q;
}
function ctrySVG(it){
  const g = ctryGeom(it);
  if(!g) return '<svg class="ctrysvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 62"' +
    ' style="aspect-ratio:100/62"><text class="ctryno" x="50" y="38">?</text></svg>';
  const r = g.r, sw = g.u / 190;
  /* The card is framed on the country, so almost every name fits it at a
     readable size — Chile's is thin because Chile is thin. The exception is an
     archipelago: the Marshall Islands are a thousandth of their own box, and a
     name written inside one of those islands would be a smudge. Those get
     their name under the shape instead, where an atlas puts the name of
     anything too small to carry one, and the picture opens out to make room. */
  const lb = (it.lbl == null || it.lbl) ? geoCoLabel(g.proj, g.i) : null;
  const under = lb && lb.fs < g.u / 60 ? g.u / 9 : 0;
  const vb = [g.vb[0], g.vb[1], g.vb[2], under ? r(g.vb[3] + under * 1.5) : g.vb[3]];
  let s = '<svg class="ctrysvg" xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') +
    '" style="aspect-ratio:' + vb[2] + '/' + vb[3] + '">';
  if(it.ctx){
    /* the neighbours, faintly. It is the world's own path, in the world's own
       units, and the edge of the picture is what crops it — no clip, no second
       projection, and the memoised string the map is already drawn from */
    const P = geoPaths(g.proj, g.look), W = geoProj(g.proj).wrap;
    const copy = t => '<g' + (t ? ' transform="translate(' + t + ' 0)"' : '') + '>' +
      '<path class="ctxland" d="' + P.land + '"/><path class="ctxbord" d="' + P.bord + '"/></g>';
    s += '<g class="ctxall" stroke-width="' + r(sw * 0.7) + '">' + copy(0) +
      (W && g.b.x1 > W ? copy(W) : '') + (W && g.b.x0 < 0 ? copy(-W) : '') + '</g>';
  }
  s += '<path class="ctryland" d="' + geoCoPath(g.proj, g.look, g.i, 1) +
       '" stroke-width="' + r(sw) + '"/>';
  if(lb) s += under
    ? '<text class="atconame" x="' + r((g.b.x0 + g.b.x1) / 2) + '" y="' + r(g.b.y1 + g.m + under * 0.85) +
      '" font-size="' + r(under) + '" stroke-width="' + r(under * 0.16) + '">' +
      esc(geoCoName(g.i)) + '</text>'
    : atlNameSVG(lb, r);
  if(it.cp == null || it.cp){
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
/* one of the card's three switches, and the button that says which way it is */
function ctryFlip(el, it, page, key, b, label){
  it[key] = (it[key] == null || it[key]) ? 0 : 1;
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
    '<path class="fplate" d="' + geoCoPath(g.proj, 'crisp', g.i, 1) + '"/></g>' +
    extBand('LAND'));
}

defineItem('country', {
  add: { country: base => {
    const n = ATL_NEXT; ATL_NEXT = null;
    return { ...base, type:'country', w:26, rot:0, cap:'',
             co: (n && n.co) || 'France', proj: (n && n.proj) || 'mercator',
             look: (n && n.look) || 'smooth', lbl:1, cp:1, ctx:0 };
  } },
  sound: 'plop',
  fileable: true,
  html: it => '<figure class="body ctry">' + ctrySVG(it) + '<figcaption></figcaption></figure>',
  tools(mk, it, el, page){
    mk('⌕', 'Which country', b => atlAsk(b, it, el, page));
    const sw = (g, k, t) => { const b = mk(g, t, x => ctryFlip(el, it, page, k, x, t));
                              b.classList.toggle('on', it[k] == null || !!it[k]); return b; };
    sw('A', 'lbl', 'Its name across it');
    sw('★', 'cp', 'Its capital marked');
    sw('◌', 'ctx', 'The countries round it, faintly');
    mk('◈', 'Outlines — drawn round, or straight off the data', b => {
      it.look = it.look === 'crisp' ? 'smooth' : 'crisp';
      b.title = 'Outlines: ' + (it.look === 'crisp' ? 'straight' : 'round');
      queueSave(page.id); ctryRedraw(el, it, page);
    });
    mk('◎', 'Projection — flat or Mercator', b => {
      it.proj = atlProj(it) === 'mercator' ? 'equirect' : 'mercator';
      b.title = 'Projection: ' + geoProj(it.proj).label;
      queueSave(page.id); ctryRedraw(el, it, page);
    });
  },
  icon: it => ctryGlyph(it),
  label: it => it.co || 'Country',
  meta: it => {
    const i = geoCoIndexOf(it.co), c = i < 0 ? null : geoCoCapitals(i)[0];
    return (c ? c.name + ' · ' : '') + geoProj(atlProj(it)).label;
  },
  css: `
/* ---------- one country ---------- */
.ctry{display:block}
/* the picture CLIPS, and it has to: the neighbours are the whole world's path
   drawn in the world's own units, and it is the edge of the card that crops it
   to the country. The name that goes under a shape too small to carry one is
   inside the viewBox rather than outside it — see ctrySVG */
svg.ctrysvg{display:block;width:100%;height:auto;background:none;overflow:hidden;
  shape-rendering:geometricPrecision}
svg.ctrysvg *{stroke-linejoin:round;stroke-linecap:round}
.ctrysvg path.ctryland{fill:color-mix(in srgb,var(--accent2) 26%,var(--paper));fill-rule:evenodd;
  stroke:var(--ink)}
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
defineTool({ kind:'country', cat:'science', label:'Country', icon:'country', order:65,
  hint:'One country on its own — its shape, its name and its capital. Or drag one straight out of the World map' });
