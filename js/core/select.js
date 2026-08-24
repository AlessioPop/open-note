/* Open Note — core/select.js
   marquee selection, its clipboard, and the small set of things a group can do */

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

/* ================= the clipboard =================
   A browser knows how to copy DOM, not canvas records. Left to it, a marquee
   selection becomes a handful of unrelated clipboard pictures; the picture
   paste path then puts every one at the view centre and they arrive stacked.
   Carry one Open Note payload instead: the records, their single group origin,
   internal strings/wires, and the source sheet size that gives percentages a
   physical scale. */
const SELECT_CLIP_MIME = 'application/x-open-note-selection';
const SELECT_CLIP_FORMAT = 'open-note/selection/1';
let SELECT_CLIPBOARD = null;                         // fallback when a host strips custom MIME

const selectionClone = x => JSON.parse(JSON.stringify(x));
const selectionFinite = (x, d) => Number.isFinite(+x) ? +x : d;

function selectionPayload(page, items, idx){
  items = (items || []).filter(Boolean);
  if(!page || !items.length) return null;
  const ids = new Set(items.map(it => it.id));
  const sw = pgW(idx), sh = pgH(idx);
  const x0 = Math.min(...items.map(it => selectionFinite(it.x, 0) * sw / 100));
  const y0 = Math.min(...items.map(it => selectionFinite(it.y, 0) * sh / 100));
  return {
    format: SELECT_CLIP_FORMAT, token: uid(), size:{ w:sw, h:sh }, origin:{ x:x0, y:y0 },
    items: selectionClone(items),
    links: selectionClone((page.links || []).filter(l => l && ids.has(l.a) && ids.has(l.b))),
    wires: selectionClone((page.wires || []).filter(w => w && w.from && w.to &&
      ids.has(w.from.item) && ids.has(w.to.item)))
  };
}

/* Every id inside copied records is new, not only the page item's. A deck's
   cards and blocks, a circuit's nodes and wires, and a plot's chips all keep
   references of their own. Collect first, then rewrite any exact reference to
   one of those ids across the whole payload. */
function selectionFreshIds(root){
  const fresh = {};
  const collect = x => {
    if(!x || typeof x !== 'object') return;
    if(!Array.isArray(x) && typeof x.id === 'string' && x.id)
      fresh[x.id] = fresh[x.id] || uid();
    Object.keys(x).forEach(k => collect(x[k]));
  };
  const rewrite = x => {
    if(!x || typeof x !== 'object') return;
    Object.keys(x).forEach(k => {
      const v = x[k];
      if(typeof v === 'string' && fresh[v]) x[k] = fresh[v];
      else rewrite(v);
    });
  };
  collect(root); rewrite(root);
  return fresh;
}

/* Stored files get new blob ids as well. Sharing the old id would look fine
   until the source note or source item was deleted, at which point the pasted
   picture/video/model would turn blank. One source blob copied twice in a set
   remains one blob in the copy. */
async function selectionFreshMedia(items){
  const old = [...new Set((items || []).flatMap(mediaIds))], fresh = {};
  for(const id of old){
    const b = await mediaGet(id);
    if(!b) continue;
    const nid = uid();
    if(await mediaSet(nid, b)) fresh[id] = nid;
  }
  (items || []).forEach(it => remapMedia(it, id => fresh[id] || id));
  return fresh;
}

/* Materialise the payload on `page`. `live === false` is the pure harness path;
   the real paste saves, redraws, and hands the pasted group back to the select
   tool. Positions and widths pass through source/destination sheet units, so a
   group copied from a differently sized canvas keeps both scale and spacing. */
async function pasteSelection(payload, page, idx, at, live){
  if(!payload || payload.format !== SELECT_CLIP_FORMAT || !Array.isArray(payload.items) ||
     !payload.items.length || !page) return null;
  const copy = selectionClone(payload);
  selectionFreshIds(copy);
  await selectionFreshMedia(copy.items);

  const sw = Math.max(1, selectionFinite(copy.size && copy.size.w, PG_BASE));
  const sh = Math.max(1, selectionFinite(copy.size && copy.size.h, PG_BASE));
  const dw = pgW(idx), dh = pgH(idx);
  const ox = selectionFinite(copy.origin && copy.origin.x,
    Math.min(...copy.items.map(it => selectionFinite(it.x, 0) * sw / 100)));
  const oy = selectionFinite(copy.origin && copy.origin.y,
    Math.min(...copy.items.map(it => selectionFinite(it.y, 0) * sh / 100)));
  const pos = at || viewCentre(page);
  const lay = (() => {
    const ls = layers(idx), wanted = idx && idx.curLayer;
    return (ls.find(L => L.id === wanted) || ls[0]).id;
  })();
  const z0 = maxZ(page);
  const rank = new Map(copy.items.slice().sort((a, b) =>
    selectionFinite(a.z, 1) - selectionFinite(b.z, 1)).map((it, i) => [it.id, i + 1]));
  copy.items.forEach(it => {
    const ux = selectionFinite(it.x, 0) * sw / 100 - ox;
    const uy = selectionFinite(it.y, 0) * sh / 100 - oy;
    it.x = selectionFinite(pos.x, 0) + ux / dw * 100;
    it.y = selectionFinite(pos.y, 0) + uy / dh * 100;
    if(typeof it.w === 'number') it.w = it.w * sw / dw;
    it.lay = lay; it.z = z0 + rank.get(it.id);
  });
  page.items.push(...copy.items);
  if(copy.links && copy.links.length) page.links = (page.links || []).concat(copy.links);
  if(copy.wires && copy.wires.length) page.wires = (page.wires || []).concat(copy.wires);

  if(live !== false){
    queueSave(page.id); SND.plop();
    await render();
    selectMany(copy.items.map(it => it.id));
  }
  return copy;
}

const selectionEditing = () => {
  const a = document.activeElement;
  return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
};
document.addEventListener('copy', e => {
  /* An ordinary one-item pick leaves copy to its feature (table cells, code,
     text). The canvas format is specifically the marquee's multi-item set. */
  if(SELECTED.size < 2 || selectionEditing()) return;
  const payload = selectionPayload(sheet(), selectionItems(), index);
  if(!payload || !e.clipboardData) return;
  const sig = 'Open Note selection · ' + payload.items.length + ' items · ' + payload.token;
  SELECT_CLIPBOARD = { sig, payload };
  try{ e.clipboardData.setData(SELECT_CLIP_MIME, JSON.stringify(payload)); }catch(err){}
  try{ e.clipboardData.setData('text/plain', sig); }catch(err){}
  e.preventDefault();
  SND.tick();
});

window.addEventListener('paste', e => {
  if(selectionEditing() || !e.clipboardData) return;
  let payload = null;
  try{
    const raw = e.clipboardData.getData(SELECT_CLIP_MIME);
    if(raw) payload = JSON.parse(raw);
  }catch(err){}
  if(!payload && SELECT_CLIPBOARD){
    const text = e.clipboardData.getData('text/plain');
    if(text === SELECT_CLIPBOARD.sig) payload = SELECT_CLIPBOARD.payload;
  }
  if(!payload || payload.format !== SELECT_CLIP_FORMAT) return;
  /* Stop the later generic image-paste listener: this one payload owns every
     selected image, and importing clipboard renditions as well would recreate
     the old pile on top. */
  e.preventDefault(); e.stopImmediatePropagation();
  pasteSelection(payload, sheet(), index, viewCentre(sheet()), true);
});

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
