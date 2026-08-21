/* Open Note — items/slides.js
   slide decks (.pptx) — read them, walk them, take a slide out as a picture */

/* ================= slide decks =================
   Drop a .pptx on the page and the deck itself lands there: the slide, drawn
   rather than described, with the deck kept whole inside the book. The card on
   the paper walks the slides; **click it and the reader takes the screen** —
   one slide at a time or all of them at once, zoomable, with the speaker notes
   underneath and any slide liftable straight out as a picture.

   Nothing here reads the file: lib/pptx.js turns a deck into SVG and this is
   what you do with it. The two rules it lives by:

   - **A slide is vector, all the way to the page.** It is never a bitmap being
     stretched, so it is sharp at thumbnail size, at full screen, zoomed to 6×,
     and in print. The one place a picture is made is when you ask for one.
   - **Motion starts where the finger is.** The reel is a spring: it tracks the
     drag one to one, takes the flick's own speed with it when you let go, and
     can be caught and thrown back mid-flight. */

const SLD_MAXW = 2400;                    // as wide as a slide is ever rastered
const SLD_POSTER = 1000;                  // …and the still the page keeps of it

/* ---- the decks that are open ----
   Reading a deck costs a moment; drawing a slide out of one costs nothing. So
   a deck is read once and held for as long as the book is, and closing the
   book lets go of every picture in it. */
const SLD_DECKS = new Map();              // media id → { D } or { err }
const SLD_READING = new Map();            // …and the reads still in flight
onNoteOpen(() => {
  for(const v of SLD_DECKS.values()) if(v.D) v.D.free();
  SLD_DECKS.clear(); SLD_READING.clear();
  if(SV) svClose(true);
});
async function slDeck(it){
  const key = it.media;
  if(!key) return { err: 'that deck is not in this book any more' };
  if(SLD_DECKS.has(key)) return SLD_DECKS.get(key);
  if(SLD_READING.has(key)) return SLD_READING.get(key);
  const job = (async () => {
    let out;
    try{
      const blob = await mediaGet(key);
      if(!blob) throw new Error('that deck is not in this book any more');
      /* the reader wants a name, a size and the bytes — which is all a stored
         blob needs wrapping in */
      const D = await pptxRead({ name: it.name || 'deck.pptx', size: blob.size,
        arrayBuffer: () => blob.arrayBuffer() });
      out = { D };
    }catch(err){ out = { err: (err && err.message) || String(err) }; }
    SLD_DECKS.set(key, out);
    SLD_READING.delete(key);
    return out;
  })();
  SLD_READING.set(key, job);
  return job;
}
const slAt = it => clamp(Math.round(it.i || 0), 0, Math.max(0, (it.n || 1) - 1));
const slName = it => it.name || 'slides.pptx';
const slMeta = it => (it.n ? it.n + (it.n === 1 ? ' slide' : ' slides') : '') +
  (it.size ? (it.n ? ' · ' : '') + fmtBytes(it.size) : '');

/* ---- the card on the page ---- */
function slHTML(it, c){
  const ar = +it.ar > 0.2 ? +it.ar : 16 / 9;
  const n = it.n || 1, i = slAt(it);
  return '<figure class="body sld' + (it.frame === 'plain' ? '' : ' win') +
    '" style="--slar:' + (Math.round(ar * 1000) / 1000) + '">' +
    (it.frame === 'plain' ? '' :
      '<div class="wbar"><span class="wnm">' + esc(slName(it)) + '</span>' +
      '<span class="wmeta">' + esc(slMeta(it)) + '</span>' +
      '<span class="wbtns"><i>–</i><i>▫</i><i>✕</i></span></div>') +
    '<div class="wpane"><div class="slstage">' +
      (c.live
        ? '<div class="slreel"></div>' +
          '<div class="slhud"><button class="slnav" data-a="prev" title="Previous slide">‹</button>' +
          '<button class="slnav" data-a="next" title="Next slide">›</button></div>' +
          '<div class="slnote">reading ' + esc(slName(it)) + '…</div>'
        : it.poster ? '<img class="slstill" alt="" src="' + esc(it.poster) + '">'
        : '<div class="slph">' + esc(slName(it)) + '</div>') +
    '</div></div>' +
    '<div class="slfoot"><span class="slpos">' + (i + 1) + ' / ' + n + '</span>' +
    '<div class="slrail" title="Drag to run through the deck"><i style="left:' +
      (n > 1 ? (i / n * 100) : 0) + '%;width:' + (100 / n) + '%"></i></div>' +
    '<button class="slopen" data-a="open" title="Open the reader (or just click the slide)">⤢</button></div>' +
    '<figcaption></figcaption></figure>';
}
/* put slide i on the card — the drawing is cached, so this is a string swap */
async function slShow(el, it, page, i, quiet){
  const stage = el.querySelector('.slstage');
  const reel = el && el.querySelector('.slreel');
  if(!reel) return;
  const got = await slDeck(it);
  const note = el.querySelector('.slnote');
  if(got.err){
    if(note){ note.textContent = got.err; note.classList.add('bad'); }
    return;
  }
  const D = got.D;
  /* what the deck really is, learnt on the first read */
  if(it.n !== D.count || !it.ar){
    it.n = D.count; it.ar = D.w / D.h;
    if(el.querySelector('.wmeta')) el.querySelector('.wmeta').textContent = slMeta(it);
    el.querySelector('figure').style.setProperty('--slar', Math.round(it.ar * 1000) / 1000);
    queueSave(page.id);
  }
  const at = clamp(Math.round(i), 0, D.count - 1);
  const S = await D.slide(at);
  if(!el.isConnected) return;
  reel.innerHTML = S.svg;
  if(note) note.remove();
  if(it.i !== at){ it.i = at; queueSave(page.id); }
  const pos = el.querySelector('.slpos');
  if(pos) pos.textContent = (at + 1) + ' / ' + D.count;
  const bar = el.querySelector('.slrail i');
  if(bar){ bar.style.left = (at / D.count * 100) + '%'; bar.style.width = (100 / D.count) + '%'; }
  if(stage) stage.classList.add('ready');
  if(!quiet) SND.tick();
  slPoster(it, page, D, at);
  /* the ones on either side, so stepping through is instant */
  if(at + 1 < D.count) D.slide(at + 1);
  if(at > 0) D.slide(at - 1);
}
/* the still that print, the overview, the shelf and exported books show */
const SLD_POSTER_T = new Map();
function slPoster(it, page, D, at){
  if(it.pi === at && it.poster) return;
  clearTimeout(SLD_POSTER_T.get(it.id));
  SLD_POSTER_T.set(it.id, setTimeout(async () => {
    try{
      const S = await D.slide(at, { inline: true });
      let url = await pptxRaster(S.svg, D.w, D.h, SLD_POSTER, 'image/png');
      /* a slide that is mostly photograph makes an enormous .png, and the still
         is only ever seen small — so past a point it is kept as a photo would be */
      if(url.length > 900 * 1024) url = await pptxRaster(S.svg, D.w, D.h, SLD_POSTER, 'image/jpeg', .84);
      it.poster = url; it.pi = at;
      queueSave(page.id);
    }catch(e){}
  }, 420));
}
function slStep(el, it, page, d){
  const n = it.n || 1;
  const at = clamp(slAt(it) + d, 0, n - 1);
  if(at === slAt(it)) return;
  slShow(el, it, page, at);
}
function slWire(el, it, page){
  slShow(el, it, page, slAt(it), true);
  const stage = el.querySelector('.slstage');
  /* the arrows and the rail belong to the deck; everything else on the card is
     still the paper, so dragging it moves the item as usual */
  el.querySelectorAll('.slnav,.slopen').forEach(b => {
    b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
    b.addEventListener('click', e => {
      e.stopPropagation();
      const a = b.dataset.a;
      if(a === 'open') openSlides(it, page, e.clientX, e.clientY);
      else slStep(el, it, page, a === 'next' ? 1 : -1);
    });
  });
  const rail = el.querySelector('.slrail');
  if(rail) rail.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    const r = rail.getBoundingClientRect(), pid = e.pointerId;
    const to = x => {
      const n = it.n || 1;
      const at = clamp(Math.floor((x - r.left) / Math.max(1, r.width) * n), 0, n - 1);
      if(at !== slAt(it)) slShow(el, it, page, at, true);
    };
    to(e.clientX);
    try{ rail.setPointerCapture(pid); }catch(err){}
    const mv = ev => { if(ev.pointerId === pid) to(ev.clientX); };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      rail.removeEventListener('pointermove', mv);
      rail.removeEventListener('pointerup', up);
      rail.removeEventListener('pointercancel', up);
    };
    rail.addEventListener('pointermove', mv);
    rail.addEventListener('pointerup', up);
    rail.addEventListener('pointercancel', up);
  });
  if(!stage) return;
  /* the wheel walks the deck, the way it scrolls a long table — ctrl+wheel is
     left alone, since everywhere else in the app that is the desk's own zoom */
  let wheelAt = 0;
  stage.addEventListener('wheel', e => {
    if(e.ctrlKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    const now = performance.now();
    if(now - wheelAt < 190) return;          // one slide a notch, however fast the wheel spins
    wheelAt = now;
    slStep(el, it, page, (e.deltaY || e.deltaX) > 0 ? 1 : -1);
  }, { passive: false });
  /* a tap on the slide opens the reader; a drag is still a drag, so the tap is
     decided on the way up rather than on the way down */
  stage.addEventListener('pointerdown', e => {
    if(e.target.closest('.slnav')) return;
    const sx = e.clientX, sy = e.clientY, ix = it.x, iy = it.y, pid = e.pointerId;
    const up = ev => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if(ev.type !== 'pointerup' || ev.pointerId !== pid) return;
      if(Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5 || it.x !== ix || it.y !== iy) return;
      openSlides(it, page, ev.clientX, ev.clientY);
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
}

/* ---- taking a deck in ---- */
async function slRecord(file){
  if(file.size > 120 * 1024 * 1024 &&
     !confirm('That deck is ' + (file.size / 1048576 | 0) + ' MB. It is kept whole inside the book, so backups get that much heavier. Add it anyway?')) return null;
  const id = uid();
  const ok = await mediaSet(id, file);
  if(!ok){ alert('Could not store that deck in this browser.'); return null; }
  /* read it once now, so the card arrives knowing its shape and its length */
  let n = 0, ar = 16 / 9;
  try{
    const D = await pptxRead(file);
    n = D.count; ar = D.w / D.h;
    SLD_DECKS.set(id, { D });
  }catch(err){
    alert('That deck could not be read.\n\n' + ((err && err.message) || err));
    await mediaDel(id);
    return null;
  }
  return { id: uid(), type: 'slides', media: id, name: file.name, size: file.size,
    n, i: 0, ar, frame: 'win', cap: file.name.replace(/\.pptx?m?$/i, '') };
}
async function slFromFile(file, at, page){
  const r = await slRecord(file);
  if(!r) return;
  page = page || sheet();
  const pos = at || { x: 10 + Math.random() * 12, y: 14 + Math.random() * 22 };
  const it = { ...r, x: clamp(pos.x, 2, 52), y: clamp(pos.y, 4, 76),
    w: clamp(52 * pgK(), 20, 96), rot: 0, z: maxZ(page) + 1, lay: curLayerId() };
  page.items.push(it);
  queueSave(page.id); SND.plop();
  await render();
  select(it.id);
}
$('#pptxInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if(f) slFromFile(f, takePendingAt());
  e.target.value = '';
});

/* ================= the reader =================
   The screen belongs to the deck: a dark stage, one slide on it, the rest of
   them a keystroke away. Everything that moves here is a spring — nothing has
   a duration, so nothing has to finish before you may change your mind. */
let SV = null;

function openSlides(it, page, ox, oy){
  if(SV) svClose(true);
  const v = $('#sview');
  if(!v) return;
  SV = { it, page, D: null, i: slAt(it), mode: 'slide', tiles: [], thumbs: [],
    notes: false, io: null, ios: null, el: {}, pending: 0, drag: null };
  v.innerHTML =
    '<div class="svtop glass">' +
      '<span class="svnm"></span><span class="svttl"></span>' +
      '<span class="svsp"></span>' +
      '<span class="svpos"></span>' +
      '<span class="svacts">' +
        '<button data-a="grid" title="All slides (G)">⊞</button>' +
        '<button data-a="notes" title="Speaker notes (N)">≡</button>' +
        '<button data-a="out" title="Zoom out (−)">−</button>' +
        '<button class="svzoom" data-a="fit" title="Fit the slide (F)">100%</button>' +
        '<button data-a="in" title="Zoom in (+)">+</button>' +
        '<button data-a="png" title="Save this slide as a .png">⤓</button>' +
        '<button data-a="page" title="Put this slide on the page as a picture">⇗</button>' +
        '<button data-a="close" title="Close (Esc)">✕</button>' +
      '</span>' +
    '</div>' +
    '<div class="svbody">' +
      '<div class="svstage"><div class="svreel">' +
        '<div class="svfr p"></div><div class="svfr c"></div><div class="svfr n"></div>' +
      '</div>' +
      '<button class="svarr l" data-a="prev" title="Previous slide (←)">‹</button>' +
      '<button class="svarr r" data-a="next" title="Next slide (→)">›</button>' +
      '<div class="svwait">reading ' + esc(slName(it)) + '…</div></div>' +
      '<div class="svgrid"><div class="svgw"></div></div>' +
    '</div>' +
    '<div class="svnotes glass"><b>Notes</b><p></p></div>' +
    '<div class="svstrip glass"><div class="svsw"></div></div>';
  v.classList.add('on');
  document.body.classList.add('reading');
  const q = s => v.querySelector(s);
  SV.el = { v, top: q('.svtop'), stage: q('.svstage'), reel: q('.svreel'),
    fr: [q('.svfr.p'), q('.svfr.c'), q('.svfr.n')], grid: q('.svgrid'), gw: q('.svgw'),
    strip: q('.svstrip'), sw: q('.svsw'), notes: q('.svnotes'), wait: q('.svwait'),
    pos: q('.svpos'), nm: q('.svnm'), ttl: q('.svttl'), zoom: q('.svzoom') };
  SV.el.nm.textContent = slName(it);

  /* the reel, the zoom and the pan: three springs, and the only three numbers
     the reader has to hold in its head */
  SV.sx = spring({ damping: 1, response: .38, rest: .0016, restSpeed: .02,
    onUpdate: x => { SV.el.reel.style.transform = 'translate3d(' + (x * 100) + '%,0,0)'; },
    onRest: () => svSettle() });
  SV.z = spring({ damping: 1, response: .3, rest: .002, restSpeed: .02, onUpdate: () => svPaint() });
  SV.px = spring({ damping: 1, response: .3, onUpdate: () => svPaint() });
  SV.py = spring({ damping: 1, response: .3, onUpdate: () => svPaint() });
  SV.z.jump(1);

  v.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if(b) return svAct(b.dataset.a, e);
    if(e.target === v || e.target === SV.el.stage) svClose();
  });
  SV.el.stage.addEventListener('pointerdown', svGrab);
  SV.el.stage.addEventListener('dblclick', e => {
    e.preventDefault();
    SV.z.value > 1.05 ? svFit() : svZoomTo(2.2, e.clientX, e.clientY);
  });
  SV.el.stage.addEventListener('wheel', e => {
    e.preventDefault();
    if(e.ctrlKey || e.metaKey || SV.z.target > 1.02){
      return svZoomTo(SV.z.target * (e.deltaY > 0 ? 1 / 1.13 : 1.13), e.clientX, e.clientY);
    }
    svWheel(e);
  }, { passive: false });
  SV.el.grid.addEventListener('scroll', () => hidePeek(), { passive: true });
  warpIn(SV.el.v, ox, oy);
  window.addEventListener('resize', svFitSoon);

  slDeck(it).then(got => {
    if(!SV || SV.it !== it) return;
    if(got.err){ SV.el.wait.textContent = got.err; SV.el.wait.classList.add('bad'); return; }
    SV.D = got.D;
    SV.i = clamp(SV.i, 0, got.D.count - 1);
    SV.el.wait.remove();
    svSize(); svGridTiles(); svFrames(true); svSync();
  });
}
function svAct(a, e){
  if(!SV) return;
  if(a === 'close') return svClose();
  if(a === 'prev') return svGo(-1);
  if(a === 'next') return svGo(1);
  if(a === 'grid') return svMode(SV.mode === 'grid' ? 'slide' : 'grid', e);
  if(a === 'notes') return svNotes(!SV.notes);
  if(a === 'in') return svZoomTo(SV.z.target * 1.4);
  if(a === 'out') return svZoomTo(SV.z.target / 1.4);
  if(a === 'fit') return svFit();
  if(a === 'png') return svPNG();
  if(a === 'page') return svToPage();
  if(a === 'go'){
    const b = e && e.target.closest('[data-i]');
    if(b) svJump(+b.dataset.i, e);
  }
}
/* ---- the three frames on the reel ---- */
function svFrames(hard){
  if(!SV || !SV.D) return;
  const at = [SV.i - 1, SV.i, SV.i + 1];
  SV.el.fr.forEach((f, k) => {
    const i = at[k];
    if(i < 0 || i >= SV.D.count){ f.innerHTML = ''; f.dataset.i = ''; return; }
    if(!hard && f.dataset.i === String(i)) return;
    f.dataset.i = String(i);
    f.innerHTML = '';
    SV.D.slide(i).then(S => {
      if(SV && f.dataset.i === String(i)) f.innerHTML = S.svg;
      if(SV && i === SV.i) svPaint();
    });
  });
  SV.sx.jump(0);
  svSize(); svPaint();
}
function svSync(){
  if(!SV || !SV.D) return;
  SV.el.pos.textContent = (SV.i + 1) + ' / ' + SV.D.count;
  const S = SV.D.slides[SV.i];
  SV.el.ttl.textContent = (S && S.title) || '';
  SV.el.notes.querySelector('p').textContent = (S && S.notes) || 'No notes on this slide.';
  SV.el.sw.querySelectorAll('.svth').forEach(t => {
    const on = +t.dataset.i === SV.i;
    t.classList.toggle('on', on);
    if(on) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });
  SV.el.gw.querySelectorAll('.svtile').forEach(t => t.classList.toggle('on', +t.dataset.i === SV.i));
  SV.el.v.querySelector('.svarr.l').classList.toggle('off', SV.i <= 0);
  SV.el.v.querySelector('.svarr.r').classList.toggle('off', SV.i >= SV.D.count - 1);
  /* whatever is on screen is what the card on the paper shows too */
  if(SV.it.i !== SV.i){
    SV.it.i = SV.i;
    queueSave(SV.page.id);
    const el = document.querySelector('#pageHost .item[data-id="' + SV.it.id + '"]');
    if(el) slShow(el, SV.it, SV.page, SV.i, true);
  }
}
/* how big the slide can be drawn here: the biggest box of the deck's own shape
   that fits the stage. Worked out rather than left to the CSS, because an <svg>
   carrying only a viewBox has no size to fit anything into. */
function svSize(){
  if(!SV || !SV.D) return;
  /* the laid-out size, not the drawn one: the reader arrives on a scale
     animation, and a rect measured through that is a rect of the wrong moment */
  const rw = SV.el.reel.offsetWidth, rh = SV.el.reel.offsetHeight;
  if(!rw || !rh) return;
  const w = Math.min(rw, rh * SV.D.ratio);
  SV.el.v.style.setProperty('--svw', Math.floor(w) + 'px');
  SV.el.v.style.setProperty('--svh', Math.floor(w / SV.D.ratio) + 'px');
}
/* …and again once whatever is moving has stopped */
const svSizeSoon = () => requestAnimationFrame(() => requestAnimationFrame(svSize));
const svR = v => Math.round(v * 100) / 100;
const svPaint = () => {
  if(!SV) return;
  const f = SV.el.fr[1];
  const z = SV.z.value;
  f.style.transform = 'translate3d(' + svR(SV.px.value) + 'px,' + svR(SV.py.value) + 'px,0) scale(' + svR(z) + ')';
  SV.el.zoom.textContent = Math.round(z * 100) + '%';
  SV.el.stage.classList.toggle('zoomed', z > 1.02);
};
/* ---- walking the deck ---- */
function svGo(d){
  if(!SV || !SV.D || SV.mode !== 'slide') return;
  /* a second press while one is still in flight lands the first and starts the
     next, rather than being swallowed by an animation nobody wants to wait for */
  if(SV.pending){ SV.sx.stopAt(); svSettle(); }
  if(SV.i + d < 0 || SV.i + d >= SV.D.count){
    /* nothing that way: lean and come back, the way a shelf of them would */
    SV.sx.stopAt();
    SV.sx.jump(-d * .045);
    SV.sx.to(0);
    return;
  }
  svFit(true);
  SV.pending = -d;
  SV.sx.set({ damping: 1, response: .38 });     // a keystroke carries no momentum of its own
  SV.sx.to(-d);
}
function svSettle(){
  if(!SV) return;
  if(!SV.pending) return;
  SV.i = clamp(SV.i - SV.pending, 0, SV.D.count - 1);
  SV.pending = 0;
  svFrames();
  svSync();
  SND.tick();
}
function svJump(i, e){
  if(!SV || !SV.D) return;
  SV.i = clamp(i, 0, SV.D.count - 1);
  SV.pending = 0;
  svFit(true);
  svMode('slide', e);
  svFrames(true);
  svSync();
}
let svWheelAt = 0;
function svWheel(e){
  const now = performance.now();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if(now - svWheelAt < 260 || Math.abs(d) < 2) return;
  svWheelAt = now;
  svGo(d > 0 ? 1 : -1);
}
/* the drag: one to one under the finger, thrown where the flick was going */
function svGrab(e){
  if(!SV || !SV.D || SV.mode !== 'slide' || e.button > 0) return;
  if(e.target.closest('.svarr')) return;
  const stage = SV.el.stage;
  const track = flickTrack();
  const pid = e.pointerId;
  const zoomed = SV.z.value > 1.02;
  const W = Math.max(1, stage.clientWidth);
  const x0 = e.clientX, y0 = e.clientY;
  const base = zoomed ? { x: SV.px.value, y: SV.py.value } : { x: SV.sx.value };
  let moved = false;
  try{ stage.setPointerCapture(pid); }catch(err){}
  SV.sx.stopAt(); SV.px.stopAt(); SV.py.stopAt();
  stage.classList.add('grabbing');
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    track.track(ev);
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if(Math.hypot(dx, dy) > 4) moved = true;
    if(zoomed){
      SV.px.jump(base.x + dx); SV.py.jump(base.y + dy);
      return;
    }
    let v = base.x + dx / W;
    /* nothing past the first slide or the last one — it resists instead */
    if((SV.i === 0 && v > 0) || (SV.i === SV.D.count - 1 && v < 0)) v = svRubber(v);
    SV.sx.jump(v);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    stage.removeEventListener('pointermove', mv);
    stage.removeEventListener('pointerup', up);
    stage.removeEventListener('pointercancel', up);
    stage.classList.remove('grabbing');
    const vel = track.vel();
    if(zoomed){
      /* a thrown slide keeps sliding, then settles back inside its edges */
      SV.px.to(svClampPan(SV.px.value + projectFling(vel.vx, .985), 'x'), vel.vx);
      SV.py.to(svClampPan(SV.py.value + projectFling(vel.vy, .985), 'y'), vel.vy);
      return;
    }
    if(!moved) return;
    const v = vel.vx / W;                       // reel widths a second
    const land = SV.sx.value + projectFling(v, .985);
    let to = 0;
    if(land > .5 && SV.i > 0) to = 1;
    else if(land < -.5 && SV.i < SV.D.count - 1) to = -1;
    SV.pending = to;
    /* a flick earns a little overshoot; a slow drag settles flat */
    SV.sx.set({ damping: Math.abs(v) > .8 ? .82 : 1, response: .36 });
    SV.sx.to(to, v);
  };
  stage.addEventListener('pointermove', mv);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
}
const svRubber = v => {
  const k = Math.abs(v);
  return Math.sign(v) * (k * .55) / (1 + k * 1.6);
};
function svClampPan(v, axis){
  if(!SV) return 0;
  const st = SV.el.stage.getBoundingClientRect();
  const f = SV.el.fr[1].firstElementChild;
  const r = f ? f.getBoundingClientRect() : st;
  const z = SV.z.target;
  const w = (r.width / Math.max(.01, SV.z.value)) * z, h = (r.height / Math.max(.01, SV.z.value)) * z;
  const room = axis === 'x' ? Math.max(0, (w - st.width) / 2) : Math.max(0, (h - st.height) / 2);
  return clamp(v, -room, room);
}
/* ---- zoom ---- */
function svZoomTo(k, cx, cy){
  if(!SV) return;
  const z0 = SV.z.target, z = clamp(k, 1, 8);
  if(Math.abs(z - z0) < .001) return;
  /* the spot under the pointer stays under it */
  if(cx != null){
    const st = SV.el.stage.getBoundingClientRect();
    const ax = cx - (st.left + st.width / 2) - SV.px.target;
    const ay = cy - (st.top + st.height / 2) - SV.py.target;
    SV.px.to(svClampPan(SV.px.target - ax * (z / z0 - 1), 'x'));
    SV.py.to(svClampPan(SV.py.target - ay * (z / z0 - 1), 'y'));
  }
  SV.z.to(z);
  if(z <= 1.001){ SV.px.to(0); SV.py.to(0); }
}
function svFit(now){
  if(!SV) return;
  if(now){ SV.z.jump(1); SV.px.jump(0); SV.py.jump(0); return; }
  SV.z.to(1); SV.px.to(0); SV.py.to(0);
}
let svFitT = 0;
function svFitSoon(){
  clearTimeout(svFitT);
  svFitT = setTimeout(() => { if(SV){ svSize(); svPaint(); } }, 120);
}
/* ---- all of them at once ---- */
function svMode(m, e){
  if(!SV || SV.mode === m) return;
  SV.mode = m;
  SV.el.v.classList.toggle('showall', m === 'grid');
  SV.el.top.querySelector('[data-a="grid"]').classList.toggle('on', m === 'grid');
  if(m === 'grid'){
    svFit(true);
    warpIn(SV.el.grid, e && e.clientX, e && e.clientY);
    const on = SV.el.gw.querySelector('.svtile.on');
    if(on) on.scrollIntoView({ block: 'center' });
    svMount();
  }else{
    warpIn(SV.el.stage, e && e.clientX, e && e.clientY);
    svSizeSoon();
  }
}
function svGridTiles(){
  if(!SV || !SV.D) return;
  let h = '';
  for(let i = 0; i < SV.D.count; i++)
    h += '<button class="svtile" data-a="go" data-i="' + i + '" style="aspect-ratio:' +
      (Math.round(SV.D.ratio * 1000) / 1000) + '"><span class="svn">' + (i + 1) + '</span></button>';
  SV.el.gw.innerHTML = h;
  SV.el.sw.innerHTML = h.replace(/svtile/g, 'svth');
  /* only the ones you can see are drawn — a deck of eighty is a lot of slide */
  const watch = root => new IntersectionObserver(es => {
    for(const en of es) if(en.isIntersecting) svFill(en.target);
  }, { root, rootMargin: '220px' });
  SV.io = watch(SV.el.grid);
  SV.ios = watch(SV.el.sw);
  SV.el.gw.querySelectorAll('.svtile').forEach(t => SV.io.observe(t));
  SV.el.sw.querySelectorAll('.svth').forEach(t => SV.ios.observe(t));
}
/* the watcher only speaks up once the grid has been laid out, so the first
   screenful is filled by hand rather than a beat late */
function svMount(){
  if(!SV) return;
  SV.el.gw.querySelectorAll('.svtile').forEach(t => {
    const r = t.getBoundingClientRect();
    if(r.top < innerHeight + 220 && r.bottom > -220) svFill(t);
  });
}
function svFill(t){
  if(!SV || !SV.D || t.dataset.on) return;
  t.dataset.on = '1';
  const i = +t.dataset.i;
  SV.D.slide(i).then(S => {
    if(!SV || !t.isConnected) return;
    t.insertAdjacentHTML('afterbegin', S.svg);
    if(S.title) t.title = (i + 1) + '. ' + S.title;
  });
}
function svNotes(on){
  if(!SV) return;
  SV.notes = !!on;
  SV.el.v.classList.toggle('shownotes', SV.notes);
  SV.el.top.querySelector('[data-a="notes"]').classList.toggle('on', SV.notes);
  svSizeSoon();                         // the stage just got shorter; the slide follows it
}
/* ---- a slide, taken out ---- */
async function svPicture(px){
  if(!SV || !SV.D) return null;
  const S = await SV.D.slide(SV.i, { inline: true });
  let url = await pptxRaster(S.svg, SV.D.w, SV.D.h, px || SLD_MAXW, 'image/png');
  if(url.length > 3.5 * 1024 * 1024)
    url = await pptxRaster(S.svg, SV.D.w, SV.D.h, px || SLD_MAXW, 'image/jpeg', .9);
  return url;
}
async function svPNG(){
  const b = SV && SV.el.top.querySelector('[data-a="png"]');
  if(b) b.classList.add('busy');
  try{
    const url = await svPicture();
    const a = document.createElement('a');
    a.href = url;
    a.download = slName(SV.it).replace(/\.[^.]+$/, '') + ' — slide ' + (SV.i + 1) +
      (/^data:image\/jpeg/.test(url) ? '.jpg' : '.png');
    document.body.appendChild(a); a.click(); a.remove();
  }catch(err){ alert('That slide could not be saved as a picture.\n\n' + ((err && err.message) || err)); }
  if(b) b.classList.remove('busy');
}
async function svToPage(){
  if(!SV) return;
  const b = SV.el.top.querySelector('[data-a="page"]');
  b.classList.add('busy');
  const page = SV.page, D = SV.D, i = SV.i, it = SV.it;
  try{
    const url = await svPicture(1800);
    const S = D.slides[i];
    const p = page || sheet();
    p.items.push({ id: uid(), type: 'image', src: url, frame: 'plain',
      name: slName(it).replace(/\.[^.]+$/, '') + ' — slide ' + (i + 1) + '.png',
      cap: (S && S.title) || (slName(it).replace(/\.[^.]+$/, '') + ' · slide ' + (i + 1)),
      x: clamp(8 + Math.random() * 8, 2, 60), y: clamp(10 + Math.random() * 20, 4, 74),
      w: clamp(52 * pgK(), 20, 96), rot: 0, z: maxZ(p) + 1, lay: curLayerId() });
    queueSave(p.id); SND.plop();
    svClose();
    await render();
  }catch(err){
    b.classList.remove('busy');
    alert('That slide could not be turned into a picture.\n\n' + ((err && err.message) || err));
  }
}
function svClose(quick){
  const v = $('#sview');
  if(!SV || !v){ return false; }
  const S = SV;
  SV = null;
  if(S.io) S.io.disconnect();
  if(S.ios) S.ios.disconnect();
  if(S.sx) S.sx.stopAt();
  if(S.z) S.z.stopAt();
  if(S.px) S.px.stopAt();
  if(S.py) S.py.stopAt();
  window.removeEventListener('resize', svFitSoon);
  document.body.classList.remove('reading');
  const done = () => { v.classList.remove('on', 'showall', 'shownotes'); v.innerHTML = ''; };
  if(quick) done(); else warpOut(v, done);
  return true;
}
/* the reader has the keyboard while it is up — the book must not flip behind it */
window.addEventListener('keydown', e => {
  if(!SV) return;
  const k = e.key;
  const hit = () => { e.preventDefault(); e.stopPropagation(); };
  if(k === 'Escape'){ hit(); if(SV.mode === 'grid') svMode('slide'); else svClose(); return; }
  if(k === 'ArrowRight' || k === 'PageDown' || k === ' '){ hit(); svGo(1); return; }
  if(k === 'ArrowLeft' || k === 'PageUp'){ hit(); svGo(-1); return; }
  if(k === 'Home'){ hit(); svJump(0); return; }
  if(k === 'End'){ hit(); svJump((SV.D ? SV.D.count : 1) - 1); return; }
  if(k === 'g' || k === 'G'){ hit(); svMode(SV.mode === 'grid' ? 'slide' : 'grid'); return; }
  if(k === 'n' || k === 'N'){ hit(); svNotes(!SV.notes); return; }
  if(k === 'f' || k === 'F' || k === '0'){ hit(); svFit(); return; }
  if(k === '+' || k === '='){ hit(); svZoomTo(SV.z.target * 1.4); return; }
  if(k === '-'){ hit(); svZoomTo(SV.z.target / 1.4); return; }
  if(k === 'ArrowDown'){ hit(); svGo(1); return; }
  if(k === 'ArrowUp'){ hit(); svGo(-1); return; }
}, true);

/* ---- how it looks folded down, and in a folder ---- */
function slGlyph(it){
  return svgIcon('<rect class="fsheet" x="4" y="16" width="88" height="60" rx="3"/>' +
    (it && it.poster
      ? '<image href="' + esc(it.poster) + '" x="8" y="20" width="80" height="52" preserveAspectRatio="xMidYMid slice"/>'
      : '<path class="frule" d="M16 34 H70 M16 48 H60 M16 60 H48" fill="none"/>') +
    '<rect class="fmatte" x="4" y="16" width="88" height="60" fill="none"/>' +
    '<path class="fstand" d="M48 76 V88 M30 90 H66" fill="none"/>' +
    extBand(it && it.n ? it.n + (it.n > 999 ? '' : '') : 'PPTX'));
}

defineItem('slides', {
  add: { slides: { pick: at => { pendingAt = at || null; $('#pptxInput').click(); } } },
  sound: 'plop',
  /* a deck is read as a zip, never streamed as a blob url, and it stays out of
     an exported book the way a model's megabytes of mesh do — the still goes
     instead, which is what an export could show anyway */
  stream: false,
  fileable: true,
  /* no rank of its own: a .pptx is not a picture, a workbook or a mesh, so
     nobody else is going to want it and the order it is asked in is nothing */
  takes(fs, at, page){
    const f = fs && fs[0];
    if(!f || pptxKind(f) !== 'pptx') return false;
    slFromFile(f, at, page);
    return true;
  },
  html: (it, c) => slHTML(it, c),
  wire: (el, it, page) => slWire(el, it, page),
  icon:  it => slGlyph(it),
  label: it => slName(it),
  meta:  it => slMeta(it),
  open:  (it, page) => openSlides(it, page),
  /* the peek is the still the card already keeps, so it needs nothing filled in */
  peek:  it => '<div class="sheetbox shot">' + (it.poster
    ? '<img alt="" src="' + esc(it.poster) + '">'
    : '<div class="pwait">slide ' + (slAt(it) + 1) + '…</div>') + '</div>',
  forget(it){ if(SV && SV.it === it) svClose(true); },
  tools(mk, it, el, page){
    mk('⤢', 'Open the reader — all the slides, full screen', b => {
      const r = b.getBoundingClientRect();
      openSlides(it, page, r.left + r.width / 2, r.top + r.height / 2);
    });
    mk('‹', 'Previous slide', () => slStep(el, it, page, -1));
    mk('›', 'Next slide', () => slStep(el, it, page, 1));
    mk('▣', 'Window frame on / off', () => {
      it.frame = it.frame === 'plain' ? 'win' : 'plain';
      queueSave(page.id); render();
    });
    mk('⤓', 'Save the deck itself', () => {
      if(MEDIA_URL[it.media]) return saveAttachment(it, MEDIA_URL[it.media]);
      mediaGet(it.media).then(b => {
        if(!b) return alert('That deck is not in this book any more.');
        saveAttachment(it, MEDIA_URL[it.media] = URL.createObjectURL(b));
      });
    });
  }
});

/* ---- how it looks ---- */
addCSS('slides', `
/* ---------- the card on the page ---------- */
.sld{background:none;padding:0;box-shadow:none}
.sld .slstage{position:relative;aspect-ratio:var(--slar,1.7778);overflow:hidden;background:#fff;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.10)}
.sld .slreel,.sld .slstill{position:absolute;inset:0}
.sld .slreel svg,.sld .slstill{display:block;width:100%;height:100%;object-fit:contain}
.sld .slph{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:6%;
  font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.06em;color:var(--soft)}
.sld .slnote{position:absolute;inset:auto 0 0 0;padding:calc(var(--scale)*5px);text-align:center;
  background:rgba(0,0,0,.55);color:#f2f0ea;font-family:var(--mono);font-size:calc(var(--scale)*9px);letter-spacing:.1em}
.sld .slnote.bad{background:var(--accent);color:#fff}
/* the two arrows: they belong to the slide, so they only appear over it */
.sld .slhud{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;
  padding:0 calc(var(--scale)*4px);opacity:0;transition:opacity .16s ease;pointer-events:none}
.sld .slstage:hover .slhud,.item.sel .sld .slhud{opacity:1}
.sld .slnav{pointer-events:auto;width:calc(var(--scale)*22px);height:calc(var(--scale)*30px);
  display:grid;place-items:center;border-radius:calc(var(--scale)*4px);
  font-size:calc(var(--scale)*17px);line-height:1;color:#fff;background:rgba(18,20,24,.5);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);transition:background .12s ease,transform .12s ease}
.sld .slnav:hover{background:rgba(18,20,24,.78)}
.sld .slnav:active{transform:scale(.94)}
/* the strip under it: where you are, and a rail to run through the deck */
.sld .slfoot{display:flex;align-items:center;gap:calc(var(--scale)*6px);
  padding:calc(var(--scale)*4px) calc(var(--scale)*2px) 0;
  font-family:var(--mono);font-size:calc(var(--scale)*9px);letter-spacing:.1em;color:var(--soft)}
.sld .slpos{flex:none}
.sld .slrail{position:relative;flex:1;height:calc(var(--scale)*5px);cursor:pointer;
  background:color-mix(in srgb,var(--ink) 16%,transparent);border-radius:99px;overflow:hidden}
.sld .slrail i{position:absolute;top:0;bottom:0;min-width:3px;background:var(--accent2);border-radius:99px;
  transition:left .18s cubic-bezier(.3,.7,.3,1),width .18s ease}
.sld .slopen{flex:none;color:var(--soft);font-size:calc(var(--scale)*11px);line-height:1;padding:0 2px}
.sld .slopen:hover{color:var(--accent)}
.sld figcaption:empty::before{content:"slides"}
/* the window frame, mixed from the book's own theme — the same one a model wears */
.sld.win{
  --wf:color-mix(in srgb,var(--paper) 86%,var(--ink));
  --wl:color-mix(in srgb,var(--wf) 38%,#fff);--wd:color-mix(in srgb,var(--wf) 52%,#000);
  --wk:color-mix(in srgb,var(--wf) 16%,#000);--wb:max(1px,calc(var(--scale)*1.4px));
  --wt:color-mix(in srgb,var(--soft) 55%,var(--desk));
  background:var(--wf);padding:calc(var(--scale)*4px);
  box-shadow:inset var(--wb) var(--wb) 0 var(--wl),
             inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wk),
             inset calc(var(--wb)*2) calc(var(--wb)*2) 0 var(--wf),
             inset calc(var(--wb)*-2) calc(var(--wb)*-2) 0 var(--wd),
             calc(var(--scale)*4px) calc(var(--scale)*5px) 0 rgba(0,0,0,.24)}
.sld.win .wbar{display:flex;align-items:center;gap:calc(var(--scale)*5px);user-select:none;
  padding:calc(var(--scale)*3px) calc(var(--scale)*3px) calc(var(--scale)*3px) calc(var(--scale)*6px);
  background:var(--wt);color:#f3f0ea;
  font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.12em;text-transform:uppercase}
.item.sel .sld.win .wbar{background:linear-gradient(90deg,var(--accent2) 0%,color-mix(in srgb,var(--accent2) 26%,var(--wf)) 100%)}
.sld.win .wnm{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sld.win .wmeta{flex:1 1 0;min-width:0;text-align:right;opacity:.72;white-space:nowrap;overflow:hidden;font-size:calc(var(--scale)*8.5px)}
.sld.win .wbtns{display:flex;gap:calc(var(--scale)*2px);flex:none}
.sld.win .wbtns i{display:grid;place-items:center;font-style:normal;color:var(--ink);
  width:calc(var(--scale)*14px);height:calc(var(--scale)*12px);font-size:calc(var(--scale)*8px);line-height:1;
  background:var(--wf);box-shadow:inset var(--wb) var(--wb) 0 var(--wl),inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wd)}
.sld.win .wpane{margin-top:calc(var(--scale)*4px);padding:var(--wb);background:var(--wd);
  box-shadow:inset var(--wb) var(--wb) 0 var(--wd),inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wl)}
.sld.win .slfoot{padding:calc(var(--scale)*4px) calc(var(--scale)*4px) 0}
.sld.win figcaption{margin-top:calc(var(--scale)*4px);padding:calc(var(--scale)*3px) calc(var(--scale)*6px);
  background:var(--wf);color:var(--ink);opacity:.85;letter-spacing:.02em;
  box-shadow:inset var(--wb) var(--wb) 0 var(--wd),inset calc(var(--wb)*-1) calc(var(--wb)*-1) 0 var(--wl)}
.ficon .fstand{stroke:color-mix(in srgb,var(--ink) 55%,var(--paper));stroke-width:3.4;stroke-linecap:round}

/* ---------- the reader ---------- */
/* minmax(0,1fr) on the column, not auto: the filmstrip is nine thousand pixels
   of thumbnails, and an auto column would grow to fit every one of them */
.sview{position:fixed;inset:0;z-index:97;display:none;
  grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;
  background:rgba(9,10,13,.96);-webkit-backdrop-filter:blur(26px) saturate(1.2);backdrop-filter:blur(26px) saturate(1.2)}
.sview.on{display:grid}
body.reading .peek{display:none}
/* the bar along the top: a floating layer, not a strip of chrome */
.sview .svtop{display:flex;align-items:center;gap:10px;padding:9px 12px;margin:10px 10px 0;border-radius:13px;
  font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:#e9eaef}
.sview .svnm{flex:none;text-transform:uppercase;opacity:.9;max-width:26vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sview .svttl{flex:0 1 auto;min-width:0;opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  letter-spacing:.02em;font-family:var(--body);font-size:13px}
.sview .svsp{flex:1}
.sview .svpos{flex:none;opacity:.75;font-variant-numeric:tabular-nums}
.sview .svacts{display:flex;gap:4px;flex:none}
.sview .svacts button{display:grid;place-items:center;min-width:30px;height:26px;padding:0 7px;border-radius:8px;
  color:#e9eaef;font-family:var(--mono);font-size:12px;line-height:1;background:rgba(255,255,255,.06);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);transition:background .12s ease,transform .1s ease}
.sview .svacts button:hover{background:rgba(255,255,255,.16)}
.sview .svacts button:active{transform:scale(.94)}
.sview .svacts button.on{background:var(--accent2);color:#fff;box-shadow:none}
.sview .svacts button.busy{opacity:.5;pointer-events:none}
.sview .svzoom{font-variant-numeric:tabular-nums;min-width:46px!important}
/* the stage */
.sview .svbody{position:relative;min-height:0;overflow:hidden}
.sview .svstage{position:absolute;inset:0;display:grid;place-items:center;padding:18px 44px;
  touch-action:none;cursor:default;overflow:hidden}
.sview .svstage.zoomed{cursor:grab}
.sview .svstage.grabbing{cursor:grabbing}
.sview .svreel{position:relative;width:100%;height:100%;will-change:transform}
/* left/right rather than inset:0 — a box with inset:0 and left:-100% keeps its
   right edge where it was and comes out twice as wide, which leaves the slide
   either side of this one half on screen */
.sview .svfr{position:absolute;top:0;bottom:0;left:0;width:100%;display:grid;place-items:center}
.sview .svfr.p{left:-100%}
.sview .svfr.n{left:100%}
/* the sheet is measured rather than left to the browser: an <svg> with a viewBox
   and no size of its own has no width to fit into, so the reader works out what
   fits and hands it over in --svw/--svh */
.sview .svfr svg{display:block;width:var(--svw,80%);height:var(--svh,45%);
  background:#fff;border-radius:3px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 4px 12px rgba(0,0,0,.4)}
.sview .svfr.c{will-change:transform}
.sview .svwait{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:#9aa0a6}
.sview .svwait.bad{color:var(--accent);max-width:60vw;text-align:center}
.sview .svarr{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:64px;border-radius:12px;
  display:grid;place-items:center;font-size:26px;line-height:1;color:#fff;background:rgba(22,24,29,.42);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);opacity:0;transition:opacity .18s ease,background .12s ease,transform .12s ease}
.sview .svarr.l{left:6px}
.sview .svarr.r{right:6px}
.sview .svbody:hover .svarr{opacity:1}
.sview .svarr:hover{background:rgba(22,24,29,.8)}
.sview .svarr:active{transform:translateY(-50%) scale(.94)}
.sview .svarr.off{opacity:0!important;pointer-events:none}
/* all of them at once */
.sview .svgrid{position:absolute;inset:0;overflow:auto;padding:16px;display:none}
.sview.showall .svgrid{display:block}
.sview.showall .svstage{visibility:hidden;pointer-events:none}
.sview .svgw{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));
  max-width:1500px;margin:0 auto}
.sview .svtile{position:relative;display:block;width:100%;background:#fff;border-radius:5px;overflow:hidden;
  box-shadow:0 6px 18px rgba(0,0,0,.45);transition:transform .16s cubic-bezier(.2,.9,.27,1),box-shadow .16s ease;
  outline:2px solid transparent;outline-offset:2px}
.sview .svtile:hover{transform:translateY(-3px) scale(1.012);box-shadow:0 14px 32px rgba(0,0,0,.55)}
.sview .svtile.on{outline-color:var(--accent2)}
.sview .svtile svg,.sview .svth svg{position:absolute;inset:0;width:100%;height:100%}
.sview .svn{position:absolute;left:6px;bottom:5px;z-index:2;padding:1px 6px;border-radius:6px;
  background:rgba(12,14,18,.62);color:#fff;font-family:var(--mono);font-size:10px;letter-spacing:.08em}
/* the filmstrip */
.sview .svstrip{margin:0 10px 10px;border-radius:13px;padding:8px}
.sview.showall .svstrip{display:none}
.sview .svsw{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;padding:2px}
.sview .svth{position:relative;flex:none;width:104px;background:#fff;border-radius:4px;overflow:hidden;
  box-shadow:0 2px 6px rgba(0,0,0,.4);outline:2px solid transparent;outline-offset:2px;
  transition:transform .16s cubic-bezier(.2,.9,.27,1),outline-color .16s ease}
.sview .svth:hover{transform:translateY(-2px)}
.sview .svth.on{outline-color:var(--accent2);transform:translateY(-2px)}
.sview .svth .svn{left:3px;bottom:2px;padding:0 4px;font-size:9px}
/* the notes */
.sview .svnotes{display:none;margin:0 10px 10px;border-radius:13px;padding:10px 14px;max-height:26vh;overflow:auto}
.sview.shownotes .svnotes{display:block}
.sview .svnotes b{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.16em;
  text-transform:uppercase;opacity:.5;margin-bottom:5px}
.sview .svnotes p{margin:0;white-space:pre-wrap;font-family:var(--body);font-size:14px;line-height:1.55;color:#e9eaef}
@media (max-width:760px){
  .sview .svttl{display:none}
  .sview .svstage{padding:10px 8px}
  .sview .svarr{opacity:1;width:32px;height:52px}
}
@media (prefers-reduced-motion:reduce){
  .sview .svtile,.sview .svth{transition:none}
}
`);
/* its tile in the palette */
defineIcon('slides', '<rect x="3" y="4.5" width="18" height="12" rx="1.6"/>' +
  '<path d="M12 16.5v3M8.5 19.5h7M6.5 8.5h8M6.5 11.5h5"/>');
defineTool({ kind:'slides', cat:'media', label:'Slides', icon:'slides', order:35,
  hint:'A .pptx — the slides themselves, read and walked through on the page' });
