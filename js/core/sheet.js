/* Open Note — core/sheet.js
   the endless sheet: how big it is, and growing it */

/* ================= growing the sheet =================
   Everything on the sheet is stored as a fraction of it — items at x/y percent,
   ink in thousandths of the width — so making the sheet bigger would slide all
   of it around. remapSheet() maps every one of those numbers back onto the spot
   it was already on, and the desk is panned by the same amount, so nothing
   appears to move at all.

   The rails along the edges are how you ask. Click one for a page more; drag it
   for however much you want. */
const SHEET_STEP = 660;                          // one page more, each time you click

const rd3 = v => Math.round(v * 1000) / 1000;

/* how big the sheet is now — made once and then left alone */
function sizeTag(){
  let t = $('#szTag');
  if(!t){
    const bar = $('.tools-bar');
    t = document.createElement('span');
    t.id = 'szTag';
    t.title = 'How much paper there is — grow it from the rails along the edges';
    bar.appendChild(t);
  }
  const s = pgSize(index);
  t.textContent = s.w + ' × ' + s.h;
  return t;
}

/* Grow one side to an absolute size. `commit` is false while a rail is being
   dragged — the numbers are written and the sheet redrawn, but nothing is saved
   and no sound is made until the hand lets go. */
function resizeSheet(side, w2, h2, commit){
  const s = pgSize(index), w = s.w, h = s.h;
  w2 = clamp(Math.round(w2), PG_MIN, SHEET_MAX);
  h2 = clamp(Math.round(h2), PG_MIN, SHEET_MAX);
  if(w2 === w && h2 === h) return false;
  const ox = side === 'l' ? w2 - w : 0, oy = side === 't' ? h2 - h : 0;
  const page = sheet();
  const corner = sheetPoint(0, 0);                 // where the sheet starts, before it grows
  if(page) remapSheet(page, w, h, w2, h2, ox, oy);
  index.settings.pgw = w2; index.settings.pgh = h2;
  applyPageSize();
  /* that corner is now `ox` in from the new edge — put it back under the eye, so
     the paper appears from the side you pulled rather than shoving everything */
  holdSheetPoint(corner, ox / w2, oy / h2);
  sizeTag();
  if(commit){
    if(page) queueSave(page.id);
    queueIndex(); SND.plop(); render();
  } else {
    document.querySelectorAll('#pageHost .page').forEach(fit);
  }
  return true;
}

/* one page more on the side you clicked */
function growSheet(side, step){
  commitZoom();                                    // about to measure: no half-applied gesture
  const s = pgSize(index), add = step || SHEET_STEP;
  const horiz = side === 'l' || side === 'r';
  if(!resizeSheet(side, horiz ? s.w + add : s.w, horiz ? s.h : s.h + add, true)){
    SND.pluck(); return false;                     // already as big as it goes
  }
  return true;
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

/* ---- the rails ----
   core/page.js hangs these off the sheet after every render. They straddle the
   edge — mostly on the desk, a sliver on the paper — so the stage can never
   clip them out of reach when the sheet fills the desk. */
let fitPending = false;                          // a note opens showing all of itself

function addPaperEdges(host){
  for(const side of ['l', 'r', 't', 'b']){
    const g = document.createElement('button');
    g.className = 'prail ' + side;
    g.title = 'More paper this way — click for +' + SHEET_STEP + ', or drag the edge out';
    wireRail(g, side);
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

/* A click is a page more. A drag is however much you pull — live, so you can see
   what you are getting, and saved once at the end so a pull is one undo step. */
function wireRail(g, side){
  const horiz = side === 'l' || side === 'r';
  const away = side === 'r' || side === 'b' ? 1 : -1;   // which way is "outwards"
  /* A rail is a <button>, so Enter, the space bar and a screen reader all
     activate it — and none of those send a pointer event. The click listener is
     what actually grows it; the drag below only suppresses the click it would
     otherwise end with. */
  g.addEventListener('click', e => {
    e.stopPropagation();
    if(g._dragged){ g._dragged = false; return; }
    growSheet(side);
  });
  g.addEventListener('pointerdown', e => {
    if(e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    commitZoom();
    const page = document.querySelector('#pageHost .page');
    if(!page || !index) return;
    const s0 = pgSize(index);
    const k = page.offsetWidth / s0.w;                  // pixels per sheet unit, zoom included
    if(!k) return;
    const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
    let moved = false;
    g.classList.add('on');
    try{ g.setPointerCapture(pid); }catch(err){}
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      const d = (horiz ? ev.clientX - sx : ev.clientY - sy) * away / k;
      if(!moved && Math.abs(d * k) < 4) return;
      moved = true;
      const now = pgSize(index);
      resizeSheet(side, horiz ? s0.w + d : now.w, horiz ? now.h : s0.h + d, false);
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      g.removeEventListener('pointermove', mv);
      g.removeEventListener('pointerup', up);
      g.removeEventListener('pointercancel', up);
      g.classList.remove('on');
      if(!moved) return;                                // a click: the click handler has it
      g._dragged = true;                                // …and this one is not a click
      const p = sheet();
      if(p) queueSave(p.id);
      queueIndex(); SND.plop(); render();
    };
    g.addEventListener('pointermove', mv);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
  });
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

/* a note opens showing all of itself */
onNoteOpen(() => { fitPending = true; sizeTag(); });

/* ---- how it looks ---- */
addCSS('sheet', `
/* ---------- the sheet, and the rails that grow it ---------- */
#szTag{font-family:var(--mono);font-size:11px;letter-spacing:.1em;opacity:.6}
/* the rails: click the edge you have run out of, and there is more of it */
.prail{position:absolute;z-index:69;padding:0;border:0;background:none;cursor:pointer;touch-action:none}
.prail.l{left:-14px;top:0;bottom:0;width:20px;cursor:ew-resize}
.prail.r{right:-14px;top:0;bottom:0;width:20px;cursor:ew-resize}
.prail.t{top:-14px;left:0;right:0;height:20px;cursor:ns-resize}
.prail.b{bottom:-14px;left:0;right:0;height:20px;cursor:ns-resize}
.prail::after{content:"";position:absolute;inset:3px;border-radius:3px;opacity:.13;
  transition:opacity .15s,inset .12s;
  background:repeating-linear-gradient(-45deg,transparent 0 5px,var(--accent2) 5px 6px)}
.prail:hover::after,.prail:focus-visible::after,.prail.on::after{opacity:.85;inset:0}
body.drawing .prail{display:none}
`);
