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
const ATL_PANEL = new Set();                       // …and whose layer panel is open
const ATL_BLINK = 2600;                            // how long ⌕ keeps a country lit, ms
const ATL_HOLD = 330;                              // how long a country is held before it comes off the map, ms
let ATL_NEXT = null;                               // the country the next `country` item is of

/* Mercator unless the record says otherwise. A map made before this line said
   `equirect` in so many words and keeps it; one made since, and one made by a
   feature that never thought about the question, gets the projection every map
   on a screen is drawn in. */
const atlProj = it => it.proj || 'mercator';

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
  /* the only layer here that is arithmetic rather than lookup — a marching
     square per cell of the window, nine times over. `heavy` is what keeps that
     off the frames of a zoom, and `fade` is what keeps the answer, when it
     comes, from arriving as a blink. Both are read in atlReworld. */
  heavy: 1, fade: 1,
  world(ctx){
    const it = ctx.it, v = ctx.view, proj = atlProj(it), look = it.look || 'smooth';
    const w = atlWin(it, v), lod = atlLod(atlN(v));
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
   nothing there to fade. */
defineMapLayer('lakes', {
  label: 'Lakes', order: 34, on: 1, sw: 1.2,
  world: ctx => '<path class="atlake" d="' +
    geoDetailPaths(atlProj(ctx.it), ctx.it.look || 'smooth', atlLod(atlN(ctx.view)), atlWin(ctx.it, ctx.view)).lak + '"/>'
});
/* a finer step is a river with tributaries it did not have — which is a change
   worth fading in rather than cutting to, for the same reason the bands are */
defineMapLayer('rivers', {
  label: 'Rivers', order: 36, on: 0, sw: 1.6, fade: 1,
  world: ctx => '<path class="atriver" d="' +
    geoDetailPaths(atlProj(ctx.it), ctx.it.look || 'smooth', atlLod(atlN(ctx.view)), atlWin(ctx.it, ctx.view)).riv + '"/>'
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
const atlSel = it => (it.sel ? geoRegKeyOf(it.sel) : '');
const atlPickLayer = () => ATL_LAYERS.find(L => L.id === 'pick');
/* the label the capitals have to keep off, in picture units — nothing at all
   unless a country really is picked and the layer that draws it is on */
function atlNameBox(it, v){
  if(!it.sel || !atlOn(it, atlPickLayer())) return null;
  const k = atlSel(it);
  if(!k) return null;
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
  label: 'Picked place', order: 70, on: 1, sw: 2.6,
  world(ctx){
    const it = ctx.it, k = atlSel(it);
    if(!k) return '';
    const lb = geoRegLabel(atlProj(it), k);
    return '<path class="atpick" d="' + geoRegPath(atlProj(it), it.look || 'smooth', k) + '"/>' +
      (atlOnShape(lb) ? atlNameSVG(lb) : '');
  },
  build: () => '<g class="atcap atpickn"><text class="atname" x="' + (ATL_TINY + 6) +
    '" y="' + (ATL_FS * 0.36) + '"></text></g>',
  frame(g, ctx){
    const el = g.firstElementChild;
    if(!el) return;
    const it = ctx.it, v = ctx.view, k = atlSel(it);
    const lb = k ? geoRegLabel(atlProj(it), k) : null;
    if(!lb || atlOnShape(lb)){                     /* the country writes its own name */
      if(el.classList.contains('on')){ el.classList.remove('on'); el.firstElementChild.textContent = ''; }
      return;
    }
    const x = (lb.x - v.cx) * v.k + ATL_W / 2, y = (lb.y - v.cy) * v.k + v.H / 2;
    const name = geoRegName(k);
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
  /* THE WINDOW IS MEASURED AT THE STEP, NOT AT THE ZOOM. k moves every frame of
     a zoom, and a window that followed k would be a new window — a new clip, a
     new field, a new set of contours — sixty times a second. So it is measured
     at the step. The step's own band is six tenths of an octave either side of
     it, and a window already carries half a view of slack — 1.5 views of reach
     against the 1.52 the bottom of the band asks for — so a fifth of an octave
     of headroom is all it takes for the window to cover every zoom the step
     covers, and never be asked again inside one. Any more than that is world
     nobody is looking at, built and clipped and contoured for nothing. */
  const kq = ATL_W / GEO_W * Math.pow(2, atlN(v) - 0.2);
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
const atlBuilt = (it, v) => atlLod(atlN(v)) + '|' + atlWinKey(atlWin(it, v));
/* is what is already drawn still reaching the edges of the picture? */
function atlCovers(w, v){
  if(!w) return true;                              /* the whole world is in the DOM */
  const hw = ATL_W / (2 * v.k), hh = v.H / (2 * v.k);
  return v.cx - hw >= w.x0 && v.cx + hw <= w.x1 && v.cy - hh >= w.y0 && v.cy + hh <= w.y1;
}
const atlPathsFor = (it, v) => geoPaths(atlProj(it), it.look || 'smooth', atlLod(atlN(v)), atlWin(it, v));

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
  /* the sticky step lives on the live record, because stickiness is a memory
     and a map that is not being handled has nothing to remember */
  const n = atlStepOf(z, L ? L.n : null);
  if(L) L.n = n;
  return { ar: g.ar, H: g.H, P: g.P, W: ATL_W, z, k, cx, cy, n };
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
    ' data-built="' + esc(atlBuilt(it, v)) + '"' +
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
  const built = svg.dataset.built || '';
  const plan = { world: svg.querySelector('.atworld'), lay: [], pins: [],
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
  const built = atlBuilt(it, v);
  if(p.built !== built || (p.slow && p.heavy !== built)){
    const L = ATL_LIVE.get(it.id);
    const busy = !!L && !!(L.hand || L.sx.active || L.sy.active || L.sz.active);
    /* a rebuild the hand is owed is put off until the hand stops — unless what
       is drawn no longer reaches the edge of the picture, and then it is not a
       refinement any more but a hole, and holes are not deferred */
    if(p.built !== built || !busy) atlReworld(svg, it, v, p, !busy || !atlCovers(p.hwin, v));
  }
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
  /* standing still is also when the heavy layers are owed their rebuild — see
     atlPaint. One more paint, and the height of the land catches up. */
  const rest = () => {
    if(L.sx.active || L.sy.active || L.sz.active) return;
    atlSettle(it, L);
    atlPaint(L.el, it, atlView(it, L));
  };
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
    const ring = atlRingAt(it, v, q);
    st = { k: v.k, px: q[0], py: q[1], cx: L.cx, cy: L.cy, lim: atlLimits(it, v.k),
           co: ring >= 0 ? ring : geoCoAt(atlProj(it), w[0], w[1], ATL_TINY / v.k) };
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
  b.title = 'A tap picks: ' + (atlTapCont(it) ? 'the whole continent' : 'a country');
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
function atlFlyTo(it, key){
  const L = ATL_LIVE.get(it.id);
  if(!L || !key) return;
  const b = geoRegMain(atlProj(it), key), g = atlGeom(it);
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
function atlCarry(it, key){
  const proj = atlProj(it), b = geoRegMain(proj, key);
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
  ATL_NEXT = { co: name, proj: atlProj(it), look: it.look || 'smooth',
               rel: atlOn(it, ATL_LAYERS.find(L => L.id === 'relief')) ? 1 : 0,
               lak: atlOn(it, ATL_LAYERS.find(L => L.id === 'lakes')) ? 1 : 0,
               riv: atlOn(it, ATL_LAYERS.find(L => L.id === 'rivers')) ? 1 : 0 };
  addItem('country', at, page);
}

/* ---- the ⌕ box: a country by name ----
   The same glass box the molecules use, over the same kind of list. It serves
   the map and the card both: on a map picking a name walks there and lights it
   up, on a card it is simply which country the card is of. It offers CONTINENTS
   as well as countries — all seven of them when nothing has been typed, which is
   how a reader finds out they can be had at all. */
let ATL_ASK = null;
function atlAskEl(){
  let d = $('#atlask');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'atlask glass'; d.id = 'atlask';
  d.innerHTML = '<input placeholder="a country or a continent — Japan, Peru, Africa…" spellcheck="false">' +
    '<div class="atsug"></div>';
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => e.stopPropagation());
  const inp = d.querySelector('input'), sug = d.querySelector('.atsug');
  const list = () => {
    sug.innerHTML = geoFindReg(inp.value, 9).map(k => {
      /* what is said about it under the name: a country's capital, and how many
         countries a continent is — which is the same kind of fact one line down */
      const cont = geoRegKind(k) === 'ct';
      const c = cont ? null : geoCoCapitals(geoRegNum(k))[0];
      const n = cont ? geoContinents()[geoRegNum(k)].cos.length + ' countries' : c ? c.name : '—';
      return '<button data-k="' + k + '">' + esc(geoRegName(k)) +
        '<small>' + esc(n) + '</small></button>';
    }).join('');
  };
  d.__list = list;
  inp.addEventListener('input', list);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); atlAskClose(); }
    if(e.key === 'Enter'){ e.preventDefault(); const b = sug.querySelector('button'); if(b) atlAskTake(b.dataset.k); }
    if(e.key === 'ArrowDown'){ e.preventDefault(); const b = sug.querySelector('button'); if(b) b.focus(); }
  });
  sug.addEventListener('keydown', e => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if(!b) return;
    if(e.key === 'Escape'){ e.preventDefault(); atlAskClose(); }
    if(e.key === 'Enter'){ e.preventDefault(); atlAskTake(b.dataset.k); }
    if(e.key === 'ArrowDown' && b.nextElementSibling){ e.preventDefault(); b.nextElementSibling.focus(); }
    if(e.key === 'ArrowUp'){ e.preventDefault(); (b.previousElementSibling || inp).focus(); }
  });
  sug.addEventListener('click', e => { const b = e.target.closest('button'); if(b) atlAskTake(b.dataset.k); });
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
function atlAskTake(key){
  if(!ATL_ASK || !key) return;
  const { it, el, page } = ATL_ASK;
  atlAskClose();
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
    mk('⌕', 'Find a country or a continent — the map walks there and lights it up',
      b => atlAsk(b, it, el, page));
    /* ---- the grain ----
       One button, and it changes one thing: what a press on the map means. The
       shading, the name, the hold, the drag off onto the page and ⇱ all read
       `it.sel` and none of them knows the difference. */
    const tg = mk('▣', 'A tap picks: a country', b => {
      const k = atlSel(it);
      if(atlTapCont(it)) delete it.tap; else it.tap = 'cont';
      b.classList.toggle('on', atlTapCont(it));
      b.title = 'A tap picks: ' + (atlTapCont(it) ? 'the whole continent' : 'a country');
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
    tg.classList.toggle('on', atlTapCont(it));
    tg.title = 'A tap picks: ' + (atlTapCont(it) ? 'the whole continent' : 'a country');
    tg.__it = it; el.__atlgrain = tg;
    mk('⇱', 'Take what is picked off onto the page — or drag it out of the map',
      () => { const k = atlSel(it);
              if(k) atlSpawn(geoRegName(k), it, page, { x: it.x + pctW(40), y: it.y + pctH(40) }); });
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
/* a layer that has just been rebuilt at a finer step: the old picture, on top
   of the new one, on its way out. See atlSwap — nothing else ever has this */
.atmap .atfade{transition:opacity .26s linear}   /* ATL_FADE */
.atmap .atfade.off{opacity:0}
@media (prefers-reduced-motion:reduce){.atmap .atfade{transition:none}}
.atmap path.atland{fill:color-mix(in srgb,var(--paper) 88%,var(--ink));fill-rule:evenodd;stroke:none}
.atmap path.atcoast{fill:none;stroke:var(--ink);stroke-opacity:.9}
.atmap path.atbord{fill:none;stroke:var(--ink);stroke-opacity:.3}
.atmap path.atgrat{fill:none;stroke:var(--line);stroke-opacity:.55}
/* the capitals: every one is a node from the start, and the frame decides which
   of them is set. The fade is what stops one popping in as the zoom crosses it */
.atmap .atcap{opacity:0;pointer-events:none;transition:opacity .22s ease-out}
.atmap .atcap.on{opacity:1}
.atmap circle.atdot{fill:var(--accent);stroke:var(--paper);stroke-width:2}
.atmap text.atname{font-family:var(--disp);font-size:${ATL_FS}px;font-weight:600;letter-spacing:.4px;
  fill:var(--ink);stroke:var(--paper);stroke-width:5;paint-order:stroke;stroke-linejoin:round}
@media (prefers-reduced-motion: reduce){ .atmap .atcap{transition:none} }
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
.atmap path.atpick{fill:color-mix(in srgb,var(--accent) 30%,transparent);
  stroke:var(--accent);stroke-linejoin:round}
.atconame{font-family:var(--disp);font-weight:600;text-transform:uppercase;
  letter-spacing:${GEO_LBL_TRK}em;text-anchor:middle;
  fill:color-mix(in srgb,var(--ink) 74%,transparent);
  stroke:color-mix(in srgb,var(--paper) 78%,transparent);
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
/* water. A lake is the sea's own colour, which is what makes it read as water.
   FILL-OPACITY AND STROKE-OPACITY, NEVER PLAIN OPACITY, AND THAT IS THE WHOLE
   OF WHY LAKES ARE FAST. Bare opacity on a shape that is both filled and inked
   is a GROUP: the browser has to paint the shape into an offscreen buffer the
   size of its box and composite it, and this path's box is the whole world
   — four thousand units square, times the zoom, redone on every frame of every
   pan. The two paint opacities say the same thing about one shape and need no
   buffer at all. The stroke-only paths below are the same rule, kept the same
   way: nothing under .atworld may carry a bare opacity of its own. */
.atmap path.atlake{fill:color-mix(in srgb,var(--accent2) 34%,var(--paper));
  fill-opacity:.95;stroke:color-mix(in srgb,var(--accent2) 70%,var(--ink));stroke-opacity:.95}
.atmap path.atriver{fill:none;stroke:color-mix(in srgb,var(--accent2) 72%,var(--ink));stroke-opacity:.75}
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
    mk('◎', 'Projection — flat or Mercator', b => {
      it.proj = atlProj(it) === 'mercator' ? 'equirect' : 'mercator';
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
