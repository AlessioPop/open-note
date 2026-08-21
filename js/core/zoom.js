/* Open Note — core/zoom.js
   zoom and panning the desk */

/* ================= zoom & pan ================= */
const stage = $('#stage'), book = $('#book');
/* One transform per FRAME, not one per event. A trackpad or a 1000Hz mouse
   fires far more move and wheel events than the screen will ever draw, and the
   percentage only has to be rewritten when it has actually changed. */
let viewRaf = 0, shownZoom = -1;
function writeView(){
  if(viewRaf){ cancelAnimationFrame(viewRaf); viewRaf = 0; }
  book.style.transform = 'translate(' + panX + 'px,' + panY + 'px)' +
                         (liveK === 1 ? '' : ' scale(' + liveK + ')');
  const z = liveZoom();
  if(shownZoom !== z){
    shownZoom = z;
    $('#zoomTag').textContent = Math.round(z * 100) + '%';
  }
  viewMoved();                                     // whatever follows the view — the map in chrome/map.js
}
function applyView(){
  if(!viewRaf) viewRaf = requestAnimationFrame(writeView);
}

/* ---- holding the paper still while it changes size ----
   The desk does NOT keep a sheet bigger than itself in the middle, and where it
   does keep it moves when the sheet's layout size changes — measured at 484px
   of jump on one zoom. Nothing here may assume otherwise, so anything that
   resizes the sheet notes where a point of it is beforehand and puts that point
   back afterwards. Which point is the caller's business: a zoom being committed
   looks identical before and after, so any point will do; growing the paper
   wants the corner the old sheet started at. */
function sheetPoint(fx, fy){
  writeView();                                     // measure what is on screen, not what is queued
  const r = book.getBoundingClientRect();
  return { x: r.left + fx * r.width, y: r.top + fy * r.height };
}
function holdSheetPoint(p, fx, fy){
  writeView();
  const r = book.getBoundingClientRect();
  panX += p.x - (r.left + fx * r.width);
  panY += p.y - (r.top + fy * r.height);
  writeView();
}
/* The .12s ease on .book is for the jumps — fitting the sheet, recentring.
   While a pan is actually running it would only make the paper lag behind the
   hand, so it is switched off until the wheel stops turning. (Dragging the desk
   is already covered by .stage.panning.) */
let lerpOff = 0;
function panningNow(){
  book.classList.add('nolerp');
  clearTimeout(lerpOff);
  lerpOff = setTimeout(() => book.classList.remove('nolerp'), 140);
}
/* ---- zooming while the wheel is still turning ----
   Zoom here is a LAYOUT change: the page really does get bigger, which is what
   keeps text, ink and paper patterns sharp instead of blowing up a bitmap. The
   bill for that is a relayout and a repaint of the whole sheet — measured at
   ~26ms a notch on a big canvas, and it grows the further in you are, which is
   exactly when it is least affordable.
   So a turning wheel only scales the sheet on the compositor, which is free and
   very slightly soft, and the real zoom is committed 180ms after it stops. */
let liveK = 1, zoomRest = 0;
const liveZoom = () => zoom * liveK;
/* Zoom pushes everything away from the middle of the sheet — on a page you never
   notice, but the middle of a canvas can be a screenful away, so zooming flings
   you across the paper. The pan is corrected to hold one point still instead:
   the pointer for a wheel, the middle of the desk for a button or a key. A point
   sitting d from the sheet's middle ends up at k·d, so the pan owes it (1−k)·d —
   and d is measured off the screen rather than assumed, because where the desk
   holds a sheet bigger than itself is the desk's own business. */
function zoomBy(f, ax, ay){
  const from = liveZoom();
  const want = clamp(from * f, zMin(), 3);
  if(want === from) return;                        // already as far as it goes
  writeView();
  const r = book.getBoundingClientRect(), st = stage.getBoundingClientRect();
  if(!r.width || !r.height) return;
  const px = ax == null ? (st.left + st.right) / 2 : ax;
  const py = ay == null ? (st.top + st.bottom) / 2 : ay;
  const fx = (px - r.left) / r.width, fy = (py - r.top) / r.height;   // the bit of sheet under it
  liveK = want / zoom;
  panningNow();                                    // no easing while a gesture is running
  holdSheetPoint({ x: px, y: py }, fx, fy);        // …and it is still under it afterwards
  clearTimeout(zoomRest);
  zoomRest = setTimeout(commitZoom, 180);
}
/* Make it real: sharp again, and the geometry honest for anything measuring.
   The scale comes off the sheet in the same breath as the layout grows, and
   that swap must not be eased — left to the .12s transition it reads as the
   zoom springing back the moment you let go. */
function commitZoom(){
  if(liveK === 1) return;
  panningNow();
  const p = sheetPoint(0, 0);                      // the scaled sheet, as the eye has it
  setZoom(liveZoom());                             // …now the real size, wherever the desk puts it
  holdSheetPoint(p, 0, 0);                         // …and back where the eye had it
}
/* how far back you may stand: far enough to see the whole sheet, however big it
   has been grown — on a normal page this is the 0.4 it always was */
const zMin = () => Math.min(0.4, 900 / pgW(), 700 / pgH());
function setZoom(z){
  clearTimeout(zoomRest); liveK = 1;                // this is the real one: any gesture is over
  zoom = clamp(z, zMin(), 3);
  /* land exactly on 100% when you are within a hair of it — a hair, though: a
     trackpad can ask for 102%, and swallowing that reads as the zoom undoing itself */
  if(Math.abs(zoom - 1) < 0.015){ zoom = 1; }
  /* layout zoom, not transform scale: pages really change size and re-render,
     so text, ink and paper patterns stay sharp at any magnification */
  document.body.style.setProperty('--zoom', zoom);
  applyView(); refit();
}
$('#zoomIn').addEventListener('click', () => zoomBy(1.2));
$('#zoomOut').addEventListener('click', () => zoomBy(1 / 1.2));
/* show the whole sheet if it is bigger than the desk, else 100%. Clicking the
   percentage toggles between the two; `always` asks for the fit outright. */
function fitToDesk(always){
  commitZoom();                                    // measuring, so no half-applied gesture
  panX = panY = 0;
  const host = $('#pageHost'), r = host && host.getBoundingClientRect();
  if(r && r.width && (always || zoom === 1)){
    const st = stage.getBoundingClientRect();
    const k = Math.min((st.width - 30) / (r.width / zoom), (st.height - 30) / (r.height / zoom));
    if(k < 0.97){ setZoom(k); return; }
  }
  setZoom(1);
}
$('#zoomTag').addEventListener('click', () => fitToDesk());
/* a wheel notch, a trackpad pinch and a tilt wheel all arrive here in different
   units — normalise to pixels, then zoom by an amount rather than a step, so a
   pinch creeps and a notch still moves the ~10% it always did */
const wheelPx = e => e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
stage.addEventListener('wheel', e => {
  if(e.ctrlKey || e.metaKey){
    e.preventDefault();
    zoomBy(Math.exp(-clamp(wheelPx(e), -120, 120) * 0.002), e.clientX, e.clientY);
  } else {
    /* the sheet is very often bigger than the desk, so the wheel scrolls it at
       any zoom rather than only when zoomed in */
    e.preventDefault();
    panX -= e.deltaX; panY -= e.deltaY; panningNow(); applyView();
  }
}, { passive: false });
stage.addEventListener('pointerdown', e => {
  if(e.target !== stage && e.target !== book) return;
  stage.classList.add('panning');
  const sx = e.clientX - panX, sy = e.clientY - panY;
  stage.setPointerCapture(e.pointerId);
  const mv = ev => { panX = ev.clientX - sx; panY = ev.clientY - sy; applyView(); };
  const up = () => { stage.classList.remove('panning');
    stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up); };
  stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
});
