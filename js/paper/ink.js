/* Open Note — ui/ink.js
   the stylus — ink laid straight onto the page */

/* ================= stylus ink ================= */
/* Ink belongs to the page, not to a box: page.ink = [{lay, m, c, w, pts}].
   Points live in a width-normalised space — 1000 units across the page, y in the
   same units — so strokes never distort and stay sharp at any zoom or page shape.
   Each stroke sits on a layer and paints above that layer's items, pictures included. */
const PENS = ['#cf3a24', '#1d2328', '#2b7d8c', '#e0a02c', '#ffffff'];
const INK_SIZES = [3, 6, 13];
const INK_NAMES = ['FINE', 'THIN', 'BOLD'];
const SVGNS = 'http://www.w3.org/2000/svg';
let INK_SEQ = 0;                                 // unique mask ids across every render

const rd1 = v => Math.round(v * 10) / 10;
function strokeD(pts){
  if(!pts.length) return '';
  if(pts.length === 1) return 'M' + pts[0][0] + ' ' + pts[0][1] + 'l.01 0';
  let d = 'M' + pts[0][0] + ' ' + pts[0][1];
  if(pts.length === 2) return d + 'L' + pts[1][0] + ' ' + pts[1][1];
  for(let i = 1; i < pts.length - 1; i++){
    const x1 = pts[i][0], y1 = pts[i][1], x2 = pts[i + 1][0], y2 = pts[i + 1][1];
    d += 'Q' + x1 + ' ' + y1 + ' ' + rd1((x1 + x2) / 2) + ' ' + rd1((y1 + y2) / 2);
  }
  const l = pts[pts.length - 1];
  return d + 'L' + l[0] + ' ' + l[1];
}
/* --- the nib: a pen stroke swells where the hand slows down --- */
/* widths come from the distance between samples, so a reloaded stroke redraws
   exactly as it was drawn — no timings to store */
function nibWidths(pts, base){
  const n = pts.length, out = new Array(n);
  let sm = 0;
  for(let i = 0; i < n; i++){
    const d = i ? Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) : 0;
    sm = i ? sm * 0.65 + d * 0.35 : d;
    out[i] = base * clamp(1.12 - sm * 0.024, 0.5, 1.12);
  }
  const t = Math.min(4, n >> 1);                 // thin entry and exit, like a real nib
  for(let i = 0; i < t; i++){
    const k = 0.45 + 0.55 * (i / t);
    out[i] *= k; out[n - 1 - i] *= k;
  }
  return out;
}
/* half-turn of points around a stroke end, from the left offset to the right one */
function capPts(p, dx, dy, r){
  const out = [], K = 8;
  const nx = -dy * r, ny = dx * r;               // left-hand normal
  for(let k = 1; k < K; k++){
    const a = Math.PI * k / K, c = Math.cos(a), s = Math.sin(a);
    out.push([p[0] + nx * c + ny * s, p[1] - nx * s + ny * c]);
  }
  return out;
}
function ringD(p){                               // closed midpoint-smoothed outline
  const n = p.length;
  const mid = (a, b) => rd1((a + b) / 2);
  let d = 'M' + mid(p[n - 1][0], p[0][0]) + ' ' + mid(p[n - 1][1], p[0][1]);
  for(let i = 0; i < n; i++){
    const c = p[i], e = p[(i + 1) % n];
    d += 'Q' + rd1(c[0]) + ' ' + rd1(c[1]) + ' ' + mid(c[0], e[0]) + ' ' + mid(c[1], e[1]);
  }
  return d + 'Z';
}
function nibD(pts, base){
  const n = pts.length;
  if(n === 1){
    const r = Math.max(base * 0.45, 0.4), x = pts[0][0], y = pts[0][1];
    return 'M' + rd1(x - r) + ' ' + rd1(y) + 'a' + rd1(r) + ' ' + rd1(r) + ' 0 1 0 ' + rd1(r * 2) +
           ' 0a' + rd1(r) + ' ' + rd1(r) + ' 0 1 0 ' + rd1(-r * 2) + ' 0z';
  }
  const w = nibWidths(pts, base), L = [], R = [], dirs = [];
  for(let i = 0; i < n; i++){
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    let len = Math.hypot(dx, dy);
    if(!len){ dx = 1; dy = 0; len = 1; }
    dx /= len; dy /= len;
    dirs.push([dx, dy]);
    const h = w[i] / 2;
    L.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
    R.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
  }
  const ring = L.slice();
  const de = dirs[n - 1], ds = dirs[0];
  ring.push(...capPts(pts[n - 1], de[0], de[1], w[n - 1] / 2));
  for(let i = n - 1; i >= 0; i--) ring.push(R[i]);
  ring.push(...capPts(pts[0], -ds[0], -ds[1], w[0] / 2));
  return ringD(ring);
}
const isNib = s => s.m !== 'mark' && s.m !== 'erase';
const strokeGeom = s => isNib(s) ? nibD(s.pts, s.w || 5) : strokeD(s.pts);
function strokePath(s, color){
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', strokeGeom(s));
  if(isNib(s) && !color){
    p.setAttribute('fill', s.c || '#000');
    p.setAttribute('stroke', 'none');
    return p;
  }
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', color || s.c || '#000');
  p.setAttribute('stroke-width', s.w || 4);
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if(s.m === 'mark') p.setAttribute('stroke-opacity', '.32');
  return p;
}
/* an erase stroke masks everything drawn before it, never what comes after —
   the same semantics as a destination-out canvas eraser */
function addStroke(st, s){
  if(s.m === 'erase'){
    if(!st.painted && st.mask) return st.mask.appendChild(strokePath(s, '#000'));   // merge consecutive erases
    if(!st.painted && !st.mask) return strokePath(s, '#000');                        // nothing to erase yet
    const id = 'inkm' + (++INK_SEQ);
    /* the whole sheet and a margin — read off the viewBox, so a long canvas gets
       a mask as long as it is rather than a page's worth */
    const mh = (+(st.svg.getAttribute('viewBox') || '').split(/\s+/)[3] || 3000) + 400;
    const mask = document.createElementNS(SVGNS, 'mask');
    mask.setAttribute('id', id); mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', -200); mask.setAttribute('y', -200);
    mask.setAttribute('width', 1400); mask.setAttribute('height', mh);
    const bg = document.createElementNS(SVGNS, 'rect');
    bg.setAttribute('x', -200); bg.setAttribute('y', -200);
    bg.setAttribute('width', 1400); bg.setAttribute('height', mh);
    bg.setAttribute('fill', '#fff');
    mask.appendChild(bg);
    const p = mask.appendChild(strokePath(s, '#000'));
    const wrapped = document.createElementNS(SVGNS, 'g');
    wrapped.setAttribute('mask', 'url(#' + id + ')');
    wrapped.appendChild(st.top);
    const top = document.createElementNS(SVGNS, 'g');
    top.appendChild(wrapped);
    st.svg.appendChild(mask);
    st.svg.appendChild(top);
    st.top = top; st.mask = mask; st.painted = false;
    return p;
  }
  st.painted = true;
  return st.top.appendChild(strokePath(s));
}
function renderInk(svg, strokes){
  svg.innerHTML = '';
  const st = { svg, top: document.createElementNS(SVGNS, 'g'), mask: null, painted: false };
  svg.appendChild(st.top);
  for(const s of strokes || []) addStroke(st, s);
  svg.__st = st;
  return st;
}
const inkOf = (page, layId) => (page.ink || []).filter(s => layKey(s) === layId);
/* redraw one layer's ink on the open page after an undo / clear */
function redrawInk(page, layId){
  const wrap = BOARD && BOARD.wraps[page.id];
  const svg = wrap && wrap.querySelector('svg.ink[data-lay="' + layId + '"]');
  if(svg) renderInk(svg, inkOf(page, layId));
}

/* ---- drawing on the page ---- */
let drawMode = false;
function inkCfg(){                                /* 'stylus', not 'ink' — settings.ink is the ink COLOUR */
  const s = index.settings.stylus = index.settings.stylus || {};
  if(!s.c) s.c = PENS[0];
  if(!s.w) s.w = INK_SIZES[1];
  if(!s.mode) s.mode = 'pen';
  return s;
}
/* a transparent sheet over the page catches the stylus, so ink lands on top of
   pictures and everything else instead of on whatever was clicked */
function wireDraw(cap, page, surf){
  let cur = null, path = null, raf = 0, pid = null, st = null, soundAt = 0;
  const P = e => {
    const r = surf.getBoundingClientRect();
    return [rd1((e.clientX - r.left) / r.width * 1000), rd1((e.clientY - r.top) / r.width * 1000)];
  };
  const paint = () => { raf = 0; if(cur && path) path.setAttribute('d', strokeGeom(cur)); };
  cap.addEventListener('pointerdown', e => {
    if(e.button !== 0 || cur) return;
    e.preventDefault();
    const cfg = inkCfg(), layId = curLayerId();
    const wrap = BOARD && BOARD.wraps[page.id];
    const svg = wrap && wrap.querySelector('svg.ink[data-lay="' + layId + '"]');
    if(!svg) return;
    st = svg.__st || renderInk(svg, inkOf(page, layId));
    pid = e.pointerId;
    try{ cap.setPointerCapture(pid); }catch(err){}
    /* the nib is written in thousandths of the sheet, so on a big one the same
       number would be a fat brush: pgK() keeps it the width it draws on a page */
    cur = { lay: layId, m: cfg.mode, c: cfg.c,        /* one nib size drives all three tools */
            w: rd1(cfg.w * pgK() * (cfg.mode === 'erase' ? 6.5 : cfg.mode === 'mark' ? 4.3 : 1)),
            pts: [P(e)] };
    (page.ink = page.ink || []).push(cur);
    path = addStroke(st, cur);
    path.setAttribute('d', strokeGeom(cur));
    soundAt = e.timeStamp;
    SND.penStart(cfg.mode, e.pressure);
  });
  cap.addEventListener('pointermove', e => {
    if(!cur || e.pointerId !== pid) return;
    const p = P(e), last = cur.pts[cur.pts.length - 1];
    const travel = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if(travel < 1.2 * pgK()) return;   // same hand, any sheet
    cur.pts.push(p);
    if(!raf) raf = requestAnimationFrame(paint);   // one repaint per frame, however fast the mouse
    SND.penMove(travel / Math.max(1, e.timeStamp - soundAt), e.pressure);
    soundAt = e.timeStamp;
  });
  const stop = e => {
    if(!cur || (e && e.pointerId !== pid)) return;
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    path.setAttribute('d', strokeGeom(cur));
    cur = null; path = null; st = null;
    SND.penStop();
    queueSave(page.id);
  };
  cap.addEventListener('pointerup', stop);
  cap.addEventListener('pointercancel', stop);
  cap.addEventListener('contextmenu', e => {
    e.preventDefault();
    openQuickMenu(e.clientX + 4, e.clientY + 4, { page, at: pctFrom(e, surf) });
  });
}
function syncCapture(){
  if(!BOARD) return;
  const z = 6 + layers(index).length * LSTEP + 5000;
  for(const en of BOARD.entries){
    const surf = en.wrap.querySelector('.surface');
    const has = surf.querySelector('.inkcap');
    if(drawMode && !has){
      const cap = document.createElement('div');
      cap.className = 'inkcap';
      cap.style.zIndex = z;
      wireDraw(cap, en.page, surf);
      surf.appendChild(cap);
    } else if(!drawMode && has) has.remove();
  }
}
function setDraw(on){
  drawMode = !!on;
  document.body.classList.toggle('drawing', drawMode);
  $('#drawBtn').classList.toggle('on', drawMode);
  $('#inkbar').classList.toggle('open', drawMode);
  if(drawMode){
    SND.preparePen();
    if(typeof setSelectMode === 'function' && selectMode) setSelectMode(false, true);
    select(null); deselectString(); cancelLinking(); closeQuickMenu();
  }
  syncInkBar(); syncCapture();
}
function undoInk(){
  const p = sheet(), lay = curLayerId();
  for(let i = (p.ink || []).length - 1; i >= 0; i--){
    if(layKey(p.ink[i]) !== lay) continue;
    p.ink.splice(i, 1);
    redrawInk(p, lay); queueSave(p.id); SND.pluck();
    return;
  }
}
function syncInkBar(){
  if(!index) return;
  const cfg = inkCfg();
  const cols = $('#inkColors');
  if(!cols.children.length) PENS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.title = 'Ink colour'; b.dataset.col = c;
    b.addEventListener('click', () => { inkCfg().c = c; queueIndex(); syncInkBar(); });
    cols.appendChild(b);
  });
  [...cols.children].forEach(b => b.classList.toggle('on', b.dataset.col === cfg.c));
  $('#inkSize').textContent = INK_NAMES[Math.max(0, INK_SIZES.indexOf(cfg.w))];
  document.querySelectorAll('#inkbar [data-ink]').forEach(b => b.classList.toggle('on', b.dataset.ink === cfg.mode));
  const L = layers(index)[layIdx(index, curLayerId())];
  $('#inkLay').textContent = L ? L.name : 'Base';
}
$('#drawBtn').addEventListener('click', () => setDraw(!drawMode));
$('#inkDone').addEventListener('click', () => setDraw(false));
$('#inkSize').addEventListener('click', () => {
  const cfg = inkCfg();
  cfg.w = INK_SIZES[(INK_SIZES.indexOf(cfg.w) + 1) % INK_SIZES.length];
  queueIndex(); syncInkBar();
});
document.querySelectorAll('#inkbar [data-ink]').forEach(b =>
  b.addEventListener('click', () => { inkCfg().mode = b.dataset.ink; queueIndex(); syncInkBar(); }));
$('#inkUndo').addEventListener('click', undoInk);
$('#inkClear').addEventListener('click', () => {
  const p = sheet(), lay = curLayerId();
  if(!inkOf(p, lay).length) return;
  const L = layers(index)[layIdx(index, lay)];
  if(!confirm('Wipe the ink on "' + L.name + '" from this page?')) return;
  p.ink = (p.ink || []).filter(s => layKey(s) !== lay);
  redrawInk(p, lay); queueSave(p.id); SND.pluck();
});

/* ---- old boxed sketches become page ink ---- */
function migrateSketches(page, idx){
  if(!page.items.some(it => it.type === 'sketch')) return false;
  const ar = arOf(idx), keep = [];
  page.ink = page.ink || [];
  for(const it of page.items){
    if(it.type !== 'sketch'){ keep.push(it); continue; }
    const bw = (it.w || 50) * 10, bh = bw * 600 / 900;          // the old pad was 900×600
    const cx = it.x * 10 + bw / 2, cy = it.y * 10 * ar + bh / 2;
    const k = bw / 900, a = (it.rot || 0) * Math.PI / 180;
    const co = Math.cos(a), si = Math.sin(a);
    for(const s of it.strokes || []){
      const pts = s.pts.map(([x, y]) => {
        const dx = (x - 450) * k, dy = (y - 300) * k;
        return [rd1(cx + dx * co - dy * si), rd1(cy + dx * si + dy * co)];
      });
      page.ink.push({ lay: null, m: s.m, c: s.c, w: rd1((s.w || 4) * k), pts });
    }
    if(it.src)                                                   // pre-vector bitmap: keep it as a picture
      keep.push({ id: it.id, type: 'image', x: it.x, y: it.y, w: it.w, rot: it.rot || 0,
                  z: it.z || 1, lay: it.lay, src: it.src, cap: '', frame: 'plain' });
  }
  page.items = keep;
  return true;
}

/* ---- how it looks ---- */
addCSS('ink', `
/* ---------- stylus ink & layers ---------- */
svg.ink{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.inkcap{position:absolute;inset:0;touch-action:none;cursor:crosshair}
body.drawing svg.strings,body.drawing .bmarks{pointer-events:none}
body.drawing .item .tools,body.drawing .item .rs,body.drawing .item .rot{display:none!important}
/* ---------- stylus bar ---------- */
.inkbar{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:76;display:none;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;width:max-content;max-width:min(96vw,900px);background:#1c1f23;color:#e6e3db;border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:8px 10px;font-family:var(--mono);box-shadow:0 18px 44px rgba(0,0,0,.55)}
.inkbar.open{display:flex}
.inkbar .lab{font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.5}
.inkbar .lab b{font-weight:400;opacity:1;color:#fff}
.inkbar button{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 8px;border:1px solid rgba(255,255,255,.14);border-radius:2px;color:#e6e3db}
.inkbar button:hover{border-color:var(--accent);color:#fff}
.inkbar button.on{border-color:var(--accent);color:#fff;background:rgba(255,255,255,.06)}
.inkbar .swatch{width:17px;height:17px;border-radius:50%;padding:0;border:1px solid rgba(255,255,255,.35)}
.inkbar .swatch:hover{border-color:#fff}
.inkbar .swatch.on{box-shadow:0 0 0 2px var(--accent2);border-color:rgba(0,0,0,.3)}
.inkbar .divider{width:1px;align-self:stretch;background:rgba(255,255,255,.14)}
`);
