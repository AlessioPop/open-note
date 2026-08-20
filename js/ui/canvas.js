/* Open Note — ui/canvas.js
   a canvas: one endless sheet instead of a book of pages */

/* ================= the canvas =================
   A canvas is a book with `kind:'canvas'` and exactly one page in it. Everything
   you can put on a page works on it untouched — what differs is that the sheet
   wears no page furniture (no cover, no folio, no gutter, no flipping), and that
   it GROWS: the rails along its edges add more paper.

   Growing is the whole trick. Everything on the sheet is stored as a fraction of
   it — items at x/y percent, ink in thousandths of the width — so making the
   sheet bigger would slide all of it around. growCanvas() maps every one of
   those numbers back onto the spot it was already on, and pans the desk by the
   same amount, so nothing appears to move at all. */

const CANVAS_W = 1980, CANVAS_H = 1320;      // three normal pages across, two down
const CANVAS_STEP = 660;                     // one page more, each time you ask
const CANVAS_MAX = 16000;                    // the ceiling this kind of book raises for itself

const isCanvas = idx => (((idx || index) || {}).kind) === 'canvas';

async function createCanvas(name){
  /* no grain to start with: it is drawn over the whole sheet, and a sheet is
     bigger than a page. The switch for it is in the menu like everything else. */
  const doc = { kind: 'canvas', pgmax: CANVAS_MAX, theme: 'graph', cur: 0, spread: false,
                settings: { pgw: CANVAS_W, pgh: CANVAS_H, grain: false }, pages: [] };
  const p = blankPage(1, doc);                     // page one, not page zero: no cover items
  p.title = 'Canvas';
  doc.pages = [{ id: p.id, title: p.title, date: p.date }];
  await kvSet(kPage(p.id), p);
  const id = uid();
  await kvSet(kBook(id), doc);
  lib.books.push({ id, name: name || 'Canvas ' + (lib.books.length + 1),
                   created: Date.now(), updated: Date.now() });
  await kvSet(K_LIB, lib);
  return id;
}

/* ---- what the chrome does about it ---- */
let fitPending = false;                          // a canvas opens showing all of itself
function syncCanvas(){
  const on = isCanvas();
  document.body.classList.toggle('canvas', on);
  document.body.classList.toggle('freepan', on);   // the wheel scrolls it at any zoom
  $('#clearPage .lb').textContent = on ? 'Clear canvas' : 'Clear page';
  $('#paperBtn').title = on ? 'Paper of the canvas' : 'Paper of the current page';
  fitPending = on;
  if(on) sizeTag();
  syncMap();
}
onBookOpen(syncCanvas);

/* how big the sheet is now, where the page count sits in a book — and the map
   switch beside it, both made once and then left alone */
function sizeTag(){
  let t = $('#szTag');
  if(!t){
    const bar = $('.tools-bar'), nav = $('.tools-bar .nav');
    const b = document.createElement('button');
    b.id = 'mapBtn'; b.className = 'btn';
    b.textContent = '▦ Map';
    b.title = 'The whole sheet, and where you are on it — drag it to go somewhere';
    b.addEventListener('click', () => {
      index.settings.map = !mapOn();
      syncMap(); queueIndex(); SND.plop();
    });
    bar.insertBefore(b, nav);
    t = document.createElement('span');
    t.id = 'szTag';
    t.title = 'How much paper there is — grow it from the rails along the edges';
    bar.insertBefore(t, nav);
  }
  const s = pgSize(index);
  t.textContent = s.w + ' × ' + s.h;
  return t;
}

/* ---- more paper ---- */
const rd3 = v => Math.round(v * 1000) / 1000;

function growCanvas(side, step){
  if(!isCanvas()) return false;
  commitZoom();                                    // about to measure: no half-applied gesture
  const s = pgSize(index), w = s.w, h = s.h, add = step || CANVAS_STEP;
  const w2 = side === 'l' || side === 'r' ? Math.min(w + add, CANVAS_MAX) : w;
  const h2 = side === 't' || side === 'b' ? Math.min(h + add, CANVAS_MAX) : h;
  if(w2 === w && h2 === h){ SND.pluck(); return false; }   // already as big as it goes
  const ox = side === 'l' ? w2 - w : 0, oy = side === 't' ? h2 - h : 0;
  const page = activePage();
  const corner = sheetPoint(0, 0);                 // where the sheet starts, before it grows
  if(page) remapSheet(page, w, h, w2, h2, ox, oy);
  index.settings.pgw = Math.round(w2); index.settings.pgh = Math.round(h2);
  applyPageSize();
  /* that corner is now `ox` in from the new edge — put it back under the eye, so
     the paper appears from the side you pulled rather than shoving everything */
  holdSheetPoint(corner, ox / w2, oy / h2);
  sizeTag();
  if(page) queueSave(page.id);
  queueIndex(); SND.plop(); render();
  return true;
}

/* ================= the map =================
   A sheet you can only see a corner of needs somewhere to look at the whole
   thing. The map draws the sheet, what is on it and where you are standing;
   drag it — or just click — to stand somewhere else.

   It is two layers on purpose: a <canvas> holding the sheet, redrawn only when
   the sheet itself changes, and a plain div for the viewport rectangle, which
   moves every frame you pan and must therefore cost nothing. */
const MAP_W = 190, MAP_H = 150, MAP_MIN = 26;
let mapEl = null, mapCv = null, mapVp = null;

/* the sheet's shape, fitted into a corner of the screen. A sheet grown far more
   one way than the other keeps a usable sliver rather than a hairline — the map
   is then a little stretched, which nothing here minds: every coordinate in it
   is a fraction of the box, not a length. */
function mapBox(ar){
  let w = MAP_W, h = w * ar;
  if(h > MAP_H){ h = MAP_H; w = Math.max(MAP_MIN, h / ar); }
  if(h < MAP_MIN){ h = MAP_MIN; }
  return { w: Math.round(w), h: Math.round(h) };
}

function buildMap(){
  if(mapEl) return mapEl;
  mapEl = document.createElement('div');
  mapEl.className = 'cmap';
  mapEl.innerHTML = '<canvas></canvas><div class="cvp"></div>';
  document.querySelector('.app').appendChild(mapEl);
  mapCv = mapEl.querySelector('canvas');
  mapVp = mapEl.querySelector('.cvp');
  mapEl.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const pid = e.pointerId;
    const org = sheetOrigin(), b = mapCv.getBoundingClientRect();
    if(!org || !b.width) return;
    const jump = ev => mapGoto(org, (ev.clientX - b.left) / b.width, (ev.clientY - b.top) / b.height);
    try{ mapEl.setPointerCapture(pid); }catch(err){}
    mapEl.classList.add('on');
    jump(e);
    const mv = ev => { if(ev.pointerId === pid) jump(ev); };
    const up = ev => { if(ev.pointerId !== pid) return;
      mapEl.classList.remove('on');
      mapEl.removeEventListener('pointermove', mv);
      mapEl.removeEventListener('pointerup', up);
      mapEl.removeEventListener('pointercancel', up); };
    mapEl.addEventListener('pointermove', mv);
    mapEl.addEventListener('pointerup', up);
    mapEl.addEventListener('pointercancel', up);
  });
  return mapEl;
}

/* Where the sheet lies when the pan is zero — measured, because the desk's idea
   of that is its own once the sheet is the bigger of the two. It cannot change
   while a drag is running, so it is taken once at the start of one. */
function sheetOrigin(){
  const surf = curSurface(); if(!surf) return null;
  writeView();
  const r = surf.getBoundingClientRect();
  return { x: r.left - panX, y: r.top - panY, w: r.width, h: r.height };
}
/* Put the point (fx, fy) of the sheet in the middle of the desk. Stated as the
   pan it WANTS, never as a correction to the pan it has: the sheet is written to
   the screen once a frame, so several moves inside one frame would each measure
   the same stale rectangle and each apply the whole correction again — a drag
   that flies off instead of following the finger. */
function mapGoto(org, fx, fy){
  if(!org) return;
  const st = stage.getBoundingClientRect();
  panX = (st.left + st.right) / 2 - (org.x + clamp(fx, 0, 1) * org.w);
  panY = (st.top + st.bottom) / 2 - (org.y + clamp(fy, 0, 1) * org.h);
  applyView();
}
const curSurface = () => document.querySelector('#pageHost .surface');

/* the sheet and everything on it — only when that changes */
function drawMap(){
  if(!isCanvas() || !mapOn() || !mapCv) return;
  const s = pgSize(index), ar = s.h / s.w;
  const box = mapBox(ar), w = box.w, h = box.h;
  const dpr = Math.min(2, devicePixelRatio || 1);
  mapEl.style.width = w + 'px'; mapEl.style.height = h + 'px';
  mapCv.style.width = w + 'px'; mapCv.style.height = h + 'px';
  mapCv.width = Math.round(w * dpr); mapCv.height = Math.round(h * dpr);
  const c = mapCv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.body);
  const ink = cs.getPropertyValue('--ink').trim() || '#191f24';
  c.fillStyle = cs.getPropertyValue('--paper').trim() || '#e9e6dd';
  c.fillRect(0, 0, w, h);
  const page = activePage(); if(!page) return;
  const surf = curSurface(), sh = surf ? surf.offsetHeight : 0;
  c.fillStyle = ink; c.globalAlpha = 0.42;
  for(const it of page.items){
    const el = surf && surf.querySelector('.item[data-id="' + it.id + '"]');
    const iw = (autoWidth(it) && el ? el.offsetWidth / surf.offsetWidth * 100 : it.w || 8) / 100 * w;
    const ih = el && sh ? el.offsetHeight / sh * h : iw * 0.6;
    c.fillRect(it.x / 100 * w, it.y / 100 * h, Math.max(1.5, iw), Math.max(1.5, ih));
  }
  c.globalAlpha = 1;
  /* ink is in thousandths of the sheet's WIDTH on both axes: 1000 across, 1000·ar down */
  const kx = w / 1000, ky = h / (1000 * ar);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for(const st of page.ink || []){
    const pts = st.pts || []; if(pts.length < 2) continue;
    c.strokeStyle = st.c || ink;
    c.lineWidth = Math.max(0.5, (st.w || 4) * kx);
    c.beginPath();
    c.moveTo(pts[0][0] * kx, pts[0][1] * ky);
    for(let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * kx, pts[i][1] * ky);
    c.stroke();
  }
  syncMapView();
}

/* where you are standing — every frame of every pan, so nothing here may cost */
function syncMapView(){
  if(!mapVp) return;
  const surf = curSurface(); if(!surf) return;
  const r = surf.getBoundingClientRect(), st = stage.getBoundingClientRect();
  if(!r.width || !r.height) return;
  const x = (st.left - r.left) / r.width, y = (st.top - r.top) / r.height;
  const x2 = (st.right - r.left) / r.width, y2 = (st.bottom - r.top) / r.height;
  const l = clamp(x, 0, 1), t = clamp(y, 0, 1);
  mapVp.style.left = l * 100 + '%';
  mapVp.style.top = t * 100 + '%';
  mapVp.style.width = (clamp(x2, 0, 1) - l) * 100 + '%';
  mapVp.style.height = (clamp(y2, 0, 1) - t) * 100 + '%';
}
/* core calls this from the one place the view is written */
function viewMoved(){ if(mapVp && document.body.classList.contains('map')) syncMapView(); }

const mapOn = () => index && index.settings.map !== false;
function syncMap(){
  const on = isCanvas() && mapOn();
  document.body.classList.toggle('map', !!on);
  const b = $('#mapBtn');
  if(b) b.classList.toggle('on', !!on);
  if(on){ buildMap(); drawMap(); }
}

/* every position on the sheet, put back where it was before the sheet changed */
function remapSheet(page, w, h, w2, h2, ox, oy){
  const kx = w / w2, ky = h / h2;                  // a percent of the old sheet, as one of the new
  const bx = 100 * ox / w2, by = 100 * oy / h2;
  for(const it of page.items){
    it.x = rd3(it.x * kx + bx);
    it.y = rd3(it.y * ky + by);
    if(typeof it.w === 'number') it.w = rd3(it.w * kx);
  }
  /* ink is in thousandths of the WIDTH on both axes — hence kx twice, and a
     stroke's own width shrinks with it so the line keeps its weight */
  const ib = 1000 * ox / w2, iby = 1000 * oy / w2;
  for(const st of page.ink || []){
    st.pts = (st.pts || []).map(p => [rd1(p[0] * kx + ib), rd1(p[1] * kx + iby)]);
    st.w = rd1((st.w || 4) * kx);
  }
}

/* ---- the rails, and dragging the paper itself ----
   core/page.js hangs these off the page after every render, the same way it
   hangs the resize grips. On a book they are nothing at all. */
function addPaperEdges(host){
  if(!isCanvas()) return;
  for(const side of ['l', 'r', 't', 'b']){
    const g = document.createElement('button');
    g.className = 'prail ' + side;
    g.title = 'More paper this way (+' + CANVAS_STEP + ')';
    g.addEventListener('click', e => { e.stopPropagation(); growCanvas(side); });
    host.appendChild(g);
  }
  wirePaperPan(host);
  /* the sheet has just been rebuilt, so the map is out of date — and the items
     are on screen now, which is where their heights come from. Anything let go
     of on the sheet (an item dropped, a stroke finished) redraws it too. */
  requestAnimationFrame(drawMap);
  host.addEventListener('pointerup', () => requestAnimationFrame(drawMap));
  /* the first draw after opening one: stand back far enough to see all the paper
     there is, edges and rails included */
  if(fitPending){ fitPending = false; requestAnimationFrame(() => fitToDesk(true)); }
}

/* a sheet bigger than the desk leaves no desk to grab, so the bare paper drags
   it — the same gesture, on the only thing left to take hold of */
function wirePaperPan(host){
  const surf = host.querySelector('.surface');
  if(!surf) return;
  surf.addEventListener('pointerdown', e => {
    if(e.target !== surf || e.button !== 0 || drawMode) return;
    const sx = e.clientX - panX, sy = e.clientY - panY, pid = e.pointerId;
    stage.classList.add('panning');
    try{ surf.setPointerCapture(pid); }catch(err){}
    const mv = ev => { if(ev.pointerId !== pid) return;
      panX = ev.clientX - sx; panY = ev.clientY - sy; applyView(); };
    const up = ev => { if(ev.pointerId !== pid) return;
      stage.classList.remove('panning');
      surf.removeEventListener('pointermove', mv);
      surf.removeEventListener('pointerup', up);
      surf.removeEventListener('pointercancel', up); };
    surf.addEventListener('pointermove', mv);
    surf.addEventListener('pointerup', up);
    surf.addEventListener('pointercancel', up);
  });
}

/* ---- how it looks ---- */
addCSS('canvas', `
/* ---------- the canvas: one endless sheet ---------- */
/* page furniture a sheet with no pages has no use for */
body.canvas .nav,body.canvas #addPage,body.canvas #spreadBtn,body.canvas #allBtn,
body.canvas #delPage,body.canvas #bmarkBtn,body.canvas .edges,body.canvas .bmarks,
body.canvas .pgrip,body.canvas .pgsize,body.canvas .slug,body.canvas .folio{display:none}
body.canvas .drawer .row:has(#aspectSel),body.canvas .drawer .row:has(#defPaperSel){display:none}
#szTag,#mapBtn{display:none}
body.canvas #mapBtn{display:inline-block}
body.canvas #szTag{display:inline;font-family:var(--mono);font-size:11px;letter-spacing:.1em;opacity:.6}
/* the sheet: no cover, no gutter, no margin rule — the same paper the whole way.
   Nothing here ever flips, so the 3D context and the settle animation that a
   book's pages want are only work the compositor doesn't need to do. */
body.canvas .book{perspective:none}
body.canvas .page{border-radius:2px;transition:none;box-shadow:0 16px 44px rgba(0,0,0,.5)}
body.canvas .page::before,body.canvas .page::after{display:none}
body.canvas .surface{cursor:grab}
body.canvas .surface .item{cursor:auto}
body.canvas .stage.panning .surface{cursor:grabbing}
body.canvas .empty{color:transparent}
body.canvas .empty::after{content:"an endless sheet — put anything anywhere, then pull the edges out";
  position:absolute;left:0;right:0;color:var(--soft)}
/* the rails: click the edge you have run out of, and there is more of it */
/* they straddle the edge — mostly on the desk, a sliver on the paper, so the
   stage can never clip them out of reach when the sheet fills the desk */
.prail{position:absolute;z-index:69;padding:0;border:0;background:none;cursor:pointer;touch-action:none}
.prail.l{left:-14px;top:0;bottom:0;width:20px}
.prail.r{right:-14px;top:0;bottom:0;width:20px}
.prail.t{top:-14px;left:0;right:0;height:20px}
.prail.b{bottom:-14px;left:0;right:0;height:20px}
.prail::after{content:"";position:absolute;inset:3px;border-radius:3px;opacity:.13;
  transition:opacity .15s,inset .12s;
  background:repeating-linear-gradient(-45deg,transparent 0 5px,var(--accent2) 5px 6px)}
.prail:hover::after,.prail:focus-visible::after{opacity:.85;inset:0}
body.drawing .prail{display:none}
/* ---- the map ---- */
.cmap{position:fixed;right:14px;bottom:70px;z-index:74;display:none;cursor:crosshair;
  border:1px solid rgba(255,255,255,.18);border-radius:2px;overflow:hidden;
  box-shadow:0 14px 34px rgba(0,0,0,.5);touch-action:none;opacity:.82;transition:opacity .18s}
body.canvas.map .cmap{display:block}
.cmap:hover,.cmap.on{opacity:1;border-color:var(--accent2)}
.cmap canvas{display:block}
.cmap .cvp{position:absolute;border:1.5px solid var(--accent);background:rgba(255,255,255,.10);
  pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.19)}
body.drawing .cmap{display:none}
@media (max-width:640px){.cmap{display:none!important}}
/* on the shelf, a canvas is a wide sheet rather than a book cover */
.bk.cnv .page{border-radius:2px}
.bk.new.wide .face{aspect-ratio:1.5/1}
`);
