/* Open Note — core/select.js
   marquee selection, and the small set of things a group can do */

/* ================= a set, without changing an ordinary pick =================
   `selected` remains the one item whose own toolbar is open. SELECTED contains
   that id for a normal pick, or several ids for a marquee pick; a group gets one
   quiet outline rather than every member opening a wall of toolbars. */
let selectMode = false;

const selectionHas = id => !!id && SELECTED.has(id);
const selectionItems = page => {
  page = page || sheet();
  return page ? page.items.filter(it => SELECTED.has(it.id)) : [];
};

function selectionLeavesMath(ids){
  let changed = false;
  if(typeof mathSel !== 'undefined' && mathSel && (!ids || !ids.has(mathSel.pid))){
    mathSel = null; changed = true;
  }
  if(typeof mathTool !== 'undefined' && mathTool === 'vec' &&
     typeof mathToolPlot !== 'undefined' && mathToolPlot && (!ids || !ids.has(mathToolPlot))){
    mathTool = 'pan'; mathToolPlot = null; changed = true;
  }
  if(changed && typeof repaintPlots === 'function') repaintPlots();
  if(changed && typeof syncMathState === 'function') syncMathState();
}

function select(id){
  const was = selected;
  SELECTED.clear();
  if(id) SELECTED.add(id);
  selected = id || null;
  selectionLeavesMath(SELECTED);
  syncSelectionDOM();
  if(was !== selected && typeof repaintPlots === 'function') repaintPlots();
}

function selectMany(ids){
  const was = selected;
  SELECTED.clear();
  for(const id of ids || []) if(id) SELECTED.add(id);
  selected = SELECTED.size === 1 ? [...SELECTED][0] : null;
  selectionLeavesMath(SELECTED);
  syncSelectionDOM();
  if(was !== selected && typeof repaintPlots === 'function') repaintPlots();
}

function syncSelectionDOM(){
  document.querySelectorAll('#pageHost .item').forEach(el => {
    const inSet = SELECTED.has(el.dataset.id);
    el.classList.toggle('sel', inSet && SELECTED.size === 1);
    el.classList.toggle('multi', inSet && SELECTED.size > 1);
    el.classList.remove('multipreview');
    if(!inSet) el.classList.remove('play');
  });
  /* a molecule that is no longer the one in hand must drop the ghost it was casting */
  if(typeof molHoverAll === 'function') molHoverAll();
  syncSelectionBar();
}

function syncSelectionBar(){
  const b = $('#selectBtn'), host = $('#selectActions'), del = $('#selectDelete');
  if(!b || !host || !del) return;
  const n = SELECTED.size;
  b.classList.toggle('on', selectMode);
  b.setAttribute('aria-pressed', selectMode ? 'true' : 'false');
  b.textContent = selectMode ? '▣ Drag to select' : n > 1 ? '▣ Select (' + n + ')' : '□ Select';
  del.hidden = n === 0;
  host.innerHTML = '';
  const page = sheet(), items = selectionItems(page);
  SELECTION_ACTIONS.slice().sort((a, c) => a.order - c.order).forEach(a => {
    if(a.when && !a.when(items, page)) return;
    const x = document.createElement('button');
    x.className = 'btn'; x.textContent = a.label || a.id; x.title = a.title || x.textContent;
    x.addEventListener('click', () => a.run(selectionItems(page), page));
    host.appendChild(x);
  });
}

function setSelectMode(on, keep){
  selectMode = !!on;
  document.body.classList.toggle('selecting', selectMode);
  if(selectMode){
    if(typeof setDraw === 'function' && drawMode) setDraw(false);
    if(!keep) select(null);
    if(typeof deselectString === 'function') deselectString();
    if(typeof cancelLinking === 'function') cancelLinking();
    if(typeof closeQuickMenu === 'function') closeQuickMenu();
  }
  syncSelectionBar();
}

function deleteSelection(){
  const page = sheet(), items = selectionItems(page);
  if(!page || !items.length) return;
  const nested = items.reduce((n, it) => n + kidsOf(it).length, 0);
  if(nested && !confirm('Delete these ' + items.length + ' things and the ' + nested +
     (nested === 1 ? ' thing filed inside them?' : ' things filed inside them?'))) return;
  removeItems(page, items);
}

$('#selectBtn').addEventListener('click', () => setSelectMode(!selectMode));
$('#selectDelete').addEventListener('click', deleteSelection);

/* ================= the rectangle =================
   It is drawn in the surface's own percentages, so it stays glued to the finger
   through any desk zoom. Items light continuously as the box crosses them; the
   release commits exactly what the preview said it would. */
$('#pageHost').addEventListener('pointerdown', e => {
  if(!selectMode || e.button !== 0) return;
  const surf = e.target.closest && e.target.closest('.surface');
  if(!surf) return;
  e.preventDefault(); e.stopPropagation();
  const pid = e.pointerId, start = { x: e.clientX, y: e.clientY };
  const box = document.createElement('div');
  box.className = 'marquee'; box.setAttribute('aria-hidden', 'true'); surf.appendChild(box);
  try{ surf.setPointerCapture(pid); }catch(err){}

  const picked = new Set();
  const draw = ev => {
    if(ev.pointerId !== pid) return;
    const sr = surf.getBoundingClientRect();
    const l = Math.min(start.x, ev.clientX), r = Math.max(start.x, ev.clientX);
    const t = Math.min(start.y, ev.clientY), b = Math.max(start.y, ev.clientY);
    box.style.left = (l - sr.left) / sr.width * 100 + '%';
    box.style.top = (t - sr.top) / sr.height * 100 + '%';
    box.style.width = (r - l) / sr.width * 100 + '%';
    box.style.height = (b - t) / sr.height * 100 + '%';
    picked.clear();
    surf.querySelectorAll(':scope > .item').forEach(el => {
      const q = el.getBoundingClientRect();
      const hit = q.right >= l && q.left <= r && q.bottom >= t && q.top <= b;
      el.classList.toggle('multipreview', hit);
      if(hit) picked.add(el.dataset.id);
    });
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    surf.removeEventListener('pointermove', draw);
    surf.removeEventListener('pointerup', up);
    surf.removeEventListener('pointercancel', up);
    box.remove();
    selectMany([...picked]);
    setSelectMode(false, true);
    if(SELECTED.size) SND.tick();
  };
  surf.addEventListener('pointermove', draw);
  surf.addEventListener('pointerup', up);
  surf.addEventListener('pointercancel', up);
  draw(e);
}, true);

onNoteOpen(() => { SELECTED.clear(); selected = null; setSelectMode(false, true); });

addCSS('selection', `
/* ---------- marquee and group selection ---------- */
.select-actions{display:contents}
.marquee{position:absolute;z-index:198;border:calc(var(--scale)*1.5px) solid var(--accent2);
  background:color-mix(in srgb,var(--accent2) 13%,transparent);pointer-events:none;border-radius:2px}
.item.multi .body,.item.multipreview .body{box-shadow:0 0 0 calc(var(--scale)*1.5px) var(--accent2)}
.item.multipreview .body{background-color:color-mix(in srgb,var(--accent2) 7%,transparent)}
body.selecting .surface{cursor:crosshair;touch-action:none}
body.selecting .item{pointer-events:none}
@media (pointer:coarse){body.selecting .marquee{border-width:calc(var(--scale)*2.5px)}}
`);
