/* Open Note — core/history.js
   taking it back — the undo stack

   Undo here is not a list of commands. Every feature in the app already says
   "this page changed" the only way it can — queueSave() — and the book says the
   same about itself with queueIndex(); so the stack keeps a copy of what a page
   said before a change and what it says after, and stepping back is putting the
   first one down again. That is why a plot, a folder, a deck of cards and a
   stroke of ink all undo without one of them knowing this file exists.

   The work is all in deciding where one step ends and the next begins. A press
   of the pointer or a command key is a new thing being done and closes whatever
   came before it; typing closes itself after a moment's pause; and anything
   that arrives with no hand behind it — a thrown item still landing after the
   fingers let go — belongs to the step that started it. */

const HIST_WAIT = 700;                 // how long a burst of changes stays open
const HIST_STEPS = 60;                 // …how many steps are kept
const HIST_CHARS = 12e6;               // …and the ceiling on the JSON behind them

const HIST = {
  past: [], future: [],
  shadow: new Map(),                   // page id → what it said at the last step
  idx: null,                           // …and the book's own copy
  pages: new Set(), index: false,      // what has changed since
  drops: [],                           // blobs this burst let go of — see histDrop()
  timer: 0, gen: 0, mark: -1, busy: false
};

/* ---- what a step is made of ---- */
const histSnap = p => JSON.stringify(p);
const histSize = s => s.changes.reduce((n, c) =>
  n + (c.before ? c.before.length : 0) + (c.after ? c.after.length : 0), 0);

/* The note's own copy, less the tools you happen to be holding: nobody means to
   undo a pen colour, the map or the volume. */
const HIST_SKIP = { cur: 1, curLayer: 1 };
const HIST_SKIP_SET = ['stylus', 'map', 'sound', 'vol', 'fade'];
function histIdxSnap(){
  const o = {};
  for(const k in index) if(!HIST_SKIP[k]) o[k] = index[k];
  o.pages = index.pages.map(m => ({ ...m }));
  o.settings = { ...(index.settings || {}) };
  HIST_SKIP_SET.forEach(k => delete o.settings[k]);
  return JSON.stringify(o);
}

/* ---- putting one back ---- */
function histPutPage(id, json){
  if(json == null){                              // the step is that this page was not there
    pages.delete(id); kvDel(kPage(id)); return;
  }
  const src = JSON.parse(json), p = pages.get(id);
  /* in place, because a feature may be holding the page object itself */
  if(!p) pages.set(id, src);
  else { for(const k in p) if(!(k in src)) delete p[k]; Object.assign(p, src); }
  queueSave(id);                                 // history is busy: this writes without recording
}
function histPutIdx(json){
  const src = JSON.parse(json), s = index.settings || {}, held = {};
  HIST_SKIP_SET.forEach(k => { if(k in s) held[k] = s[k]; });
  const lay = index.curLayer;
  for(const k in index) if(!(k in src) && !HIST_SKIP[k]) delete index[k];
  Object.assign(index, src);
  index.curLayer = lay;
  Object.assign(index.settings, held);
  queueIndex();
}

/* ---- what core tells us ---- */
/* a page the book has just read in: what it says now is what everything after
   it is measured against */
function histSeed(page){
  if(page && !HIST.shadow.has(page.id)) HIST.shadow.set(page.id, histSnap(page));
}
function histTouch(pageId){
  if(HIST.busy || !index) return;
  if(pageId) HIST.pages.add(pageId);
  histArm();
}
function histTouchIndex(){
  if(HIST.busy || !index) return;
  HIST.index = true;
  histArm();
}
function histArm(){ clearTimeout(HIST.timer); HIST.timer = setTimeout(histCommit, HIST_WAIT); }

/* A feature that has finished with a blob offers it here rather than to the
   store: the step that dropped it may yet be taken back, and an attachment that
   came back without its file would be a hole on the page. It is binned for real
   when that step falls off the end of the stack — and a step that is undone
   keeps its blobs, because the page is holding them again. */
function histDrop(id){
  if(HIST.busy || !index || !id) return false;
  HIST.drops.push(id);
  return true;
}

/* ---- where one step ends and the next begins ---- */
window.addEventListener('pointerdown', () => { histCommit(); HIST.gen++; }, true);
window.addEventListener('keydown', () => {
  const t = document.activeElement;
  /* letters going into a box are one thing being written, not many things done */
  if(!(t && (t.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(t.tagName)))) histCommit();
  HIST.gen++;
}, true);

function histCommit(){
  clearTimeout(HIST.timer); HIST.timer = 0;
  if(!index || (!HIST.pages.size && !HIST.index)){ HIST.pages.clear(); HIST.index = false; return; }
  const ids = new Set(HIST.pages), born = new Set();
  /* A page that arrived or left says so through the book's list rather than
     through itself — there is no page left to call queueSave() on. */
  if(HIST.index){
    for(const id of HIST.shadow.keys()) if(!pages.has(id)) ids.add(id);
    for(const id of pages.keys()) if(!HIST.shadow.has(id)){ ids.add(id); born.add(id); }
  }
  const changes = [];
  for(const id of ids){
    const was = HIST.shadow.has(id) ? HIST.shadow.get(id) : null;
    const now = pages.has(id) ? histSnap(pages.get(id)) : null;
    if(was === now) continue;
    /* Only the book's own list can say a page is new. A page that was written
       to before anything had read it in is simply a page nothing remembers the
       start of — taking that for a page that was made here would have undo
       take it away. */
    if(was == null && !born.has(id)){ HIST.shadow.set(id, now); continue; }
    changes.push({ id, before: was, after: now });
  }
  const iWas = HIST.idx, iNow = histIdxSnap();
  const idx = HIST.index && iWas !== iNow ? { before: iWas, after: iNow } : null;
  const drops = HIST.drops;
  HIST.pages.clear(); HIST.index = false; HIST.drops = []; HIST.idx = iNow;
  if(!changes.length && !idx){ drops.forEach(binMedia); return; }   // nothing to come back to
  for(const c of changes) c.after == null ? HIST.shadow.delete(c.id) : HIST.shadow.set(c.id, c.after);

  const step = { changes, index: idx, drops };
  const top = HIST.past[HIST.past.length - 1];
  if(top && HIST.mark === HIST.gen) histMerge(top, step);          // still the same thing done
  else { HIST.past.push(step); HIST.future = []; }
  HIST.mark = HIST.gen;
  histTrim(); histSync();
}
/* the throw that carries on after the hand has let go joins the drag it came from */
function histMerge(a, b){
  for(const c of b.changes){
    const had = a.changes.find(x => x.id === c.id);
    if(had) had.after = c.after; else a.changes.push(c);
  }
  if(b.index) a.index = a.index ? { before: a.index.before, after: b.index.after } : b.index;
  a.drops.push(...b.drops);
  /* a hand that put something back where it found it did nothing at all */
  a.changes = a.changes.filter(c => c.before !== c.after);
  if(a.index && a.index.before === a.index.after) a.index = null;
  if(!a.changes.length && !a.index && !a.drops.length) HIST.past.pop();
}
function histTrim(){
  let n = HIST.past.reduce((t, s) => t + histSize(s), 0);
  while(HIST.past.length > HIST_STEPS || (n > HIST_CHARS && HIST.past.length > 1)){
    const gone = HIST.past.shift();
    n -= histSize(gone);
    gone.drops.forEach(binMedia);                // it can never be taken back now
  }
}

/* ---- taking it back, and putting it back ---- */
async function undo(){
  if(HIST.busy) return;
  histCommit();
  const step = HIST.past.pop();
  if(!step){ SND.nope(); histTag('nothing to undo'); return; }
  HIST.future.push(step);
  SND.undo(); histTag('undone');
  await histApply(step, 'before');
}
async function redo(){
  if(HIST.busy) return;
  histCommit();
  const step = HIST.future.pop();
  if(!step){ SND.nope(); histTag('nothing to redo'); return; }
  HIST.past.push(step);
  SND.redo(); histTag('redone');
  await histApply(step, 'after');
}
async function histApply(step, side){
  HIST.busy = true;
  try{
    for(const c of step.changes){
      histPutPage(c.id, c[side]);
      c[side] == null ? HIST.shadow.delete(c.id) : HIST.shadow.set(c.id, c[side]);
    }
    if(step.index){ histPutIdx(step.index[side]); HIST.idx = step.index[side]; }
    selected = null;
    selectMath(null, null);                      // a chip may be pointing at something no longer there
    if(step.index){                              // the sheet itself may have changed shape
      applyTheme(); sizeTag();
      renderLayers(); syncInkBar();
    }
    await render();
  } finally {
    HIST.busy = false;
    HIST.mark = -1;                              // nothing folds itself into a step already taken back
    HIST.pages.clear(); HIST.index = false;
    histSync();
  }
}

/* ---- what it says for itself ---- */
let histTagTimer = 0;
function histTag(msg){                           // the corner the app already talks in
  const t = $('#saveTag');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(histTagTimer);
  histTagTimer = setTimeout(() => t.classList.remove('show'), 1300);
}
function histSync(){
  $('#undoBtn').classList.toggle('off', !HIST.past.length);
  $('#redoBtn').classList.toggle('off', !HIST.future.length);
}
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);

/* A different note is a different history. What the past was holding on to can
   go — the sheet it would put back is not in this note — but what the FUTURE
   holds must stay: those blobs were handed back to a page when the step was
   undone, and that page is still carrying them. */
onNoteOpen(() => {
  clearTimeout(HIST.timer); HIST.timer = 0;
  HIST.past.forEach(s => s.drops.forEach(binMedia));
  HIST.drops.forEach(binMedia);
  HIST.past = []; HIST.future = []; HIST.drops = [];
  HIST.shadow = new Map();
  for(const [id, p] of pages) HIST.shadow.set(id, histSnap(p));
  HIST.idx = index ? histIdxSnap() : null;
  HIST.pages.clear(); HIST.index = false; HIST.mark = -1; HIST.busy = false;
  histSync();
});
/* on the way out, whatever is only being kept for an undo that can no longer
   happen is let go of — best effort, the same as the last save */
plOnSuspend(() => {
  HIST.past.forEach(s => s.drops.forEach(binMedia));
  HIST.drops.forEach(binMedia);
});
