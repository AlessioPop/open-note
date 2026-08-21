/* Open Note — chrome/map.js
   the map: the whole sheet, and where you are standing on it */

/* ================= the map =================
   A sheet you can only see a corner of needs somewhere to look at the whole
   thing. The map draws the sheet, what is on it and where you are standing;
   drag it — or just click — to stand somewhere else.

   It is two layers on purpose: a <canvas> holding the sheet, redrawn only when
   the sheet itself changes, and a plain div for the viewport rectangle, which
   moves every frame you pan and must therefore cost nothing. */
const MAP_W = 190, MAP_H = 150, MAP_MIN = 26;
let mapEl = null, mapCv = null, mapVp = null;

const mapOn = () => index && index.settings.map !== false;

/* the switch for it, beside the size — made once and then left alone */
function mapButton(){
  if($('#mapBtn')) return;
  const bar = $('.tools-bar'), b = document.createElement('button');
  b.id = 'mapBtn'; b.className = 'btn';
  b.textContent = '▦ Map';
  b.title = 'The whole sheet, and where you are on it — drag it to go somewhere';
  b.addEventListener('click', () => {
    index.settings.map = !mapOn();
    syncMap(); queueIndex(); SND.plop();
  });
  bar.insertBefore(b, $('#szTag') || null);
}

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
  if(!mapOn() || !mapCv) return;
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
  const page = sheet(); if(!page) return;
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

function syncMap(){
  const on = mapOn();
  document.body.classList.toggle('map', !!on);
  const b = $('#mapBtn');
  if(b) b.classList.toggle('on', !!on);
  if(on){ buildMap(); drawMap(); }
}
onNoteOpen(() => { mapButton(); syncMap(); });

/* ---- how it looks ---- */
addCSS('map', `
/* ---------- the map ---------- */
.cmap{position:fixed;right:14px;bottom:calc(70px + env(safe-area-inset-bottom));z-index:74;display:none;cursor:crosshair;
  border:1px solid rgba(255,255,255,.18);border-radius:2px;overflow:hidden;
  box-shadow:0 14px 34px rgba(0,0,0,.5);touch-action:none;opacity:.82;transition:opacity .18s}
body.map .cmap{display:block}
.cmap:hover,.cmap.on{opacity:1;border-color:var(--accent2)}
.cmap canvas{display:block}
.cmap .cvp{position:absolute;border:1.5px solid var(--accent);background:rgba(255,255,255,.10);
  pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.19)}
body.drawing .cmap{display:none}
@media (max-width:640px){.cmap{display:none!important}}
`);
