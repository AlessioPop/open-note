/* Open Note — core/drag.js
   rotate, drag and resize */

/* ================= rotate / drag / resize ================= */
function startRotate(e, it, el, page){
  e.stopPropagation(); e.preventDefault();
  if(el._fling) el._fling();                 // the hand wins over any glide or lean still going
  if(el._tiltStop) el._tiltStop();
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  el.setPointerCapture(e.pointerId);
  const mv = ev => {
    let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
    a = ev.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
    it.rot = ((a + 540) % 360) - 180;
    el.style.transform = 'rotate(' + it.rot + 'deg)';
    wakeRopes();
  };
  const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up); queueSave(page.id); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function surfaceRect(el){ return el.parentElement.getBoundingClientRect(); }
function pageOfEl(el){
  const w = el.closest('.page');
  const en = BOARD && BOARD.entries.find(x => x.wrap === w);
  return en ? en.page : null;
}
/* what the icon is hovering over: the topmost other item under the pointer, if it
   is something a folder can be made of. The dragged item is pointer-transparent. */
function dropTarget(ev, selfEl){
  for(const n of document.elementsFromPoint(ev.clientX, ev.clientY)){
    const el = n.closest && n.closest('#pageHost .item');
    if(!el || el === selfEl) continue;
    const pg = pageOfEl(el);
    const it = pg && pg.items.find(x => x.id === el.dataset.id);
    return canFile(it) ? { el, it, page: pg } : null;
  }
  return null;
}
function startDrag(e, it, el, page){
  let curPage = page, surf = el.parentElement, r = surf.getBoundingClientRect();
  let wrapEl = el.closest('.page');
  let sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
  /* how far a thing may hang off the paper, and how close to the far edge it
     may start — page units, so a big sheet doesn't swallow it whole */
  const offX = pctW(80), offY = pctH(35), inX = 100 - pctW(26), inY = 100 - pctH(26);
  const home = { x: it.x, y: it.y };
  let moved = false, over = null;
  const mark = t => {
    if((t && t.el) === (over && over.el)) return;
    if(over) over.el.classList.remove('dropinto');
    over = t;
    if(over) over.el.classList.add('dropinto');
  };
  const pid = e.pointerId;
  try{ el.setPointerCapture(pid); }catch(err){}
  /* a grab takes over from any glide still in flight — the spring state is the
     live it.x/it.y, so the hand simply picks up where the throw had got to */
  if(el._fling) el._fling();
  ox = it.x; oy = it.y;
  const fl = flickTrack();
  fl.track(e);
  let tsp = null;                                          // the carry tilt, springing after the hand
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    if(!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    if(!moved){
      hidePeek();                                          // a preview has no business following a drag
      if(wrapEl) wrapEl.classList.add('carry');            // unclip: the item may hang over the edge
    }
    moved = true; el.classList.add('dragging');
    it.x = clamp(ox + (ev.clientX - sx) / r.width * 100, -offX, inX);
    it.y = clamp(oy + (ev.clientY - sy) / r.height * 100, -offY, inY);
    el.style.left = it.x + '%'; el.style.top = it.y + '%';
    if(canFile(it)) mark(dropTarget(ev, el));      // …and drop it on another to file them together
    else if(MATH_CARD[it.type]) mark(mathDrop(ev, el, it));   // …or onto a plot, or another card
    /* carried paper leans into the push — a few degrees, sprung, gone at rest */
    fl.track(ev);
    if(!SPRING_STILL.matches){
      if(!tsp){
        if(el._tiltStop) el._tiltStop();
        tsp = spring({ response: .3, damping: 1, rest: .04, onUpdate: v => {
          el.style.transform = 'rotate(' + ((it.rot || 0) + v) + 'deg)';
        }});
        el._tiltStop = () => { tsp.stopAt(); el.style.transform = 'rotate(' + (it.rot || 0) + 'deg)'; };
      }
      tsp.to(clamp(fl.vel().vx * .013, -7.5, 7.5));
    }
    wakeRopes();
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    el.classList.remove('dragging');
    if(wrapEl) wrapEl.classList.remove('carry');
    const drop = over;
    mark(null);
    if(moved && drop && drop.page === curPage){
      if(tsp) el._tiltStop();                   // filing rebuilds the page; the tilt goes with it
      it.x = clamp(it.x, -offX, inX);
      if(drop.math){ doMathDrop(curPage, it, drop, home); return; }
      foldMerge(curPage, it, drop.it);
      render();
      return;
    }
    if(moved){
      it.x = clamp(it.x, -offX, inX);           // settle back inside the sheet
      el.style.left = it.x + '%';
      queueSave(curPage.id); SND.plop();
      if(tsp) tsp.to(0);                        // the lean settles home to the item's own rotation
      flingItem(el, it, curPage, fl.vel(), r,   // the release keeps the hand's momentum
        { x0: -offX, x1: inX, y0: -offY, y1: inY });
    }
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
/* ---- the throw ----
   Project the release momentum to a landing spot, keep it on the paper, and
   hand the springs the pointer's own velocity — so there is no seam between
   the drag and the glide. The springs write it.x/it.y as they go: grabbing
   the item mid-flight just picks it up where it is, and the strings tied to
   it swing along the whole way. */
function flingItem(el, it, page, v, r, B){
  if(SPRING_STILL.matches || Math.abs(v.vx) + Math.abs(v.vy) < 170) return;
  const tx = clamp(it.x + projectFling(v.vx) / r.width * 100, B.x0, B.x1);
  const ty = clamp(it.y + projectFling(v.vy) / r.height * 100, B.y0, B.y1);
  const done = () => {
    if(sx.active || sy.active) return;
    el._fling = null;
    queueSave(page.id);
  };
  /* a re-render swaps the element out from under a glide — let that end it */
  const guard = fn => val => { if(!el.isConnected){ el._fling && el._fling(); return; } fn(val); };
  const sx = spring({ from: it.x, response: .48, damping: .85, rest: .02,
    onUpdate: guard(val => { it.x = val; el.style.left = val + '%'; wakeRopes(); }), onRest: done });
  const sy = spring({ from: it.y, response: .48, damping: .85, rest: .02,
    onUpdate: guard(val => { it.y = val; el.style.top = val + '%'; }), onRest: done });
  el._fling = () => { sx.stopAt(); sy.stopAt(); el._fling = null; };
  sx.to(tx, v.vx / r.width * 100);
  sy.to(ty, v.vy / r.height * 100);
}
function startResize(e, it, el, page){
  e.stopPropagation();
  const r = surfaceRect(el), sx = e.clientX, ow = it.w;
  el.setPointerCapture(e.pointerId);
  const mn = minItemW();
  const mv = ev => { it.w = clamp(ow + (ev.clientX - sx) / r.width * 100, mn, 100); el.style.width = it.w + '%'; wakeRopes(); };
  const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); queueSave(page.id); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
}
