/* Open Note — ui/layers.js
   layers — they belong to the book, not the page */

/* ================= layers ================= */
/* index.layers = [{id,name,hidden}], bottom → top, shared by every page in the book.
   Items and ink strokes carry lay:<id>; anything whose layer is missing or unknown
   belongs to the bottom one, so nothing can ever fall out of the book. */
const LSTEP = 100000;                            // z-index room reserved per layer
function layers(idx){
  const s = idx || index;
  if(!s.layers || !s.layers.length) s.layers = [{ id: uid(), name: 'Base' }];
  return s.layers;
}
function layIdx(idx, id){
  const ls = layers(idx), i = ls.findIndex(l => l.id === id);
  return i < 0 ? 0 : i;
}
const layKey = o => layers(index)[layIdx(index, o && o.lay)].id;
function curLayerId(){
  const ls = layers(index);
  if(!index.curLayer || !ls.some(l => l.id === index.curLayer)) index.curLayer = ls[0].id;
  return index.curLayer;
}
const zOf = (idx, it) => 6 + layIdx(idx, it.lay) * LSTEP + clamp(it.z || 1, 1, LSTEP - 2000);
function arOf(idx){
  const p = pgSize(idx);
  return p.h / p.w;
}
let focusLayer = null;                           // isolated layer — not saved with the book
const fadeOn = () => index.settings.fade !== false;

function applyLayerClasses(){
  if(!index) return;
  document.body.classList.toggle('focusing', !!focusLayer);
  const hid = {};
  layers(index).forEach(L => { hid[L.id] = !!L.hidden; });
  document.querySelectorAll('#pageHost .item, #pageHost svg.ink').forEach(el => {
    const id = el.dataset.lay;
    el.classList.toggle('lfoc', !focusLayer || id === focusLayer);
    el.classList.toggle('lhide', !!hid[id]);
  });
  const L = focusLayer && layers(index).find(l => l.id === focusLayer);
  $('#layBtn').textContent = L ? '▤ ' + L.name.slice(0, 14) : '▤ Layers';
  $('#layBtn').classList.toggle('on', !!L);
}
function applyLayerZ(){
  if(!BOARD) return;
  for(const en of BOARD.entries){
    en.page.items.forEach(it => {
      const el = en.wrap.querySelector('.item[data-id="' + it.id + '"]');
      if(el) el.style.zIndex = zOf(index, it);
    });
    en.wrap.querySelectorAll('svg.ink').forEach(s => {
      s.style.zIndex = 6 + layIdx(index, s.dataset.lay) * LSTEP + LSTEP - 1000;
    });
  }
  const cz = 6 + layers(index).length * LSTEP + 5000;
  document.querySelectorAll('#pageHost .inkcap').forEach(c => { c.style.zIndex = cz; });
}
function selectLayer(id){
  const ls = layers(index);
  const L = ls.find(l => l.id === id) || ls[0];
  index.curLayer = L.id;
  L.hidden = false;                              // you can't work on a layer you can't see
  focusLayer = fadeOn() ? L.id : null;
  queueIndex(); applyLayerClasses(); renderLayers(); syncInkBar();
}
function layCounts(){
  const c = {};
  if(!BOARD) return c;
  for(const en of BOARD.entries){
    en.page.items.forEach(it => { const k = layKey(it); c[k] = (c[k] || 0) + 1; });
    (en.page.ink || []).forEach(s => { const k = layKey(s); c[k] = (c[k] || 0) + 1; });
  }
  return c;
}
function renderLayers(){
  if(!index) return;
  const box = $('#lrows'); box.innerHTML = '';
  const ls = layers(index), sel = curLayerId(), cnt = layCounts();
  for(let i = ls.length - 1; i >= 0; i--){       // top layer first, like every layer stack
    const L = ls[i];
    const row = document.createElement('div');
    row.className = 'lrow' + (L.id === sel ? ' on' : '') + (L.hidden ? ' off' : '');
    row.innerHTML = '<button class="mini eye" title="Show / hide">' + (L.hidden ? '◌' : '◉') + '</button>' +
      '<span class="nm" contenteditable spellcheck="false"></span>' +
      '<span class="cnt">' + (cnt[L.id] || '') + '</span>' +
      '<button class="mini up" title="Move layer up">▲</button>' +
      '<button class="mini dn" title="Move layer down">▼</button>' +
      '<button class="mini del" title="Remove layer">✕</button>';
    const nm = row.querySelector('.nm');
    nm.textContent = L.name;
    row.addEventListener('click', () => selectLayer(L.id));
    const on = (sel2, fn) => row.querySelector(sel2)
      .addEventListener('click', e => { e.stopPropagation(); fn(); });
    on('.eye', () => { L.hidden = !L.hidden; queueIndex(); applyLayerClasses(); renderLayers(); });
    on('.up', () => moveLayer(i, 1));
    on('.dn', () => moveLayer(i, -1));
    on('.del', () => dropLayer(L));
    nm.addEventListener('click', e => e.stopPropagation());
    nm.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); nm.blur(); } });
    nm.addEventListener('blur', () => {
      L.name = nm.textContent.trim().slice(0, 22) || 'Layer';
      nm.textContent = L.name;
      queueIndex(); applyLayerClasses(); syncInkBar();
    });
    box.appendChild(row);
  }
  $('#fadeSwitch').classList.toggle('on', fadeOn());
  $('#fadeSwitch').setAttribute('aria-checked', fadeOn());
}
function moveLayer(i, dir){
  const ls = layers(index), j = i + dir;
  if(j < 0 || j >= ls.length) return;
  const t = ls[i]; ls[i] = ls[j]; ls[j] = t;
  queueIndex(); applyLayerZ(); renderLayers(); SND.plop();
}
async function addLayer(){
  const ls = layers(index);
  const L = { id: uid(), name: 'Layer ' + (ls.length + 1) };
  ls.splice(layIdx(index, curLayerId()) + 1, 0, L);
  selectLayer(L.id);
  await render();                                // every page needs an ink sheet for it
  renderLayers(); SND.plop();
}
async function dropLayer(L){
  const ls = layers(index);
  if(ls.length < 2){ alert('A note keeps at least one layer.'); return; }
  const i = ls.indexOf(L), to = ls[i === 0 ? 1 : i - 1];
  if(!confirm('Remove the layer "' + L.name + '"? Everything on it moves onto "' + to.name + '".')) return;
  const p = await loadSheet();
  if(p){
    let ch = false;
    p.items.forEach(it => { if(it.lay === L.id){ it.lay = to.id; ch = true; } });
    (p.ink || []).forEach(s => { if(s.lay === L.id){ s.lay = to.id; ch = true; } });
    if(ch) queueSave(p.id);
  }
  ls.splice(i, 1);
  if(focusLayer === L.id) focusLayer = null;
  if(index.curLayer === L.id) index.curLayer = to.id;
  queueIndex(); await render(); renderLayers(); syncInkBar(); SND.pluck();
}
function toggleLayers(force){
  const p = $('#lpanel');
  const on = force == null ? !p.classList.contains('open') : !!force;
  p.classList.toggle('open', on);
  if(on) renderLayers();
}
$('#layBtn').addEventListener('click', () => toggleLayers());
$('#layClose').addEventListener('click', () => toggleLayers(false));
$('#layAdd').addEventListener('click', addLayer);
$('#layShowAll').addEventListener('click', () => { focusLayer = null; applyLayerClasses(); });
$('#fadeSwitch').addEventListener('click', () => {
  index.settings.fade = !fadeOn();
  focusLayer = fadeOn() ? curLayerId() : null;
  queueIndex(); applyLayerClasses(); renderLayers();
});
$('#fadeSwitch').addEventListener('keydown', e => {
  if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); $('#fadeSwitch').click(); }
});

/* ---- how it looks ---- */
addCSS('layers', `
/* layer isolation — everything outside the chosen layer goes faint */
body.focusing #pageHost .item:not(.lfoc),body.focusing #pageHost svg.ink:not(.lfoc){opacity:.13;filter:grayscale(1);pointer-events:none}
#pageHost .lhide{display:none!important}
body[data-theme="dark"] .washi,body[data-theme="blue"] .washi{mix-blend-mode:normal;opacity:.8}
/* ---------- layers panel ---------- */
.lpanel{position:fixed;right:14px;top:52px;z-index:78;display:none;width:252px;background:#1c1f23;color:#e6e3db;border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:10px;font-family:var(--mono);box-shadow:0 18px 44px rgba(0,0,0,.55)}
.lpanel.open{display:block}
.lpanel .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.lpanel .head span{font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.5}
.lpanel button{font-family:var(--mono);color:#e6e3db}
.lpanel .act{font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:5px 7px;border:1px solid rgba(255,255,255,.14);border-radius:2px}
.lpanel .act:hover{border-color:var(--accent);color:#fff}
.lrow{display:flex;align-items:center;gap:3px;padding:5px 6px;border:1px solid transparent;border-radius:2px;cursor:pointer;font-size:11px;letter-spacing:.04em}
.lrow:hover{background:rgba(255,255,255,.05)}
.lrow.on{border-color:var(--accent);background:rgba(255,255,255,.06)}
.lrow .nm{flex:1;min-width:0;outline:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-bottom:1px dotted transparent}
.lrow .nm:focus{border-color:#8a877f;color:#fff}
.lrow.off .nm{opacity:.42;text-decoration:line-through}
.lrow .mini{font-size:11px;line-height:1;padding:3px 4px;border-radius:2px;opacity:.55}
.lrow .mini:hover{opacity:1;color:#fff;background:rgba(255,255,255,.1)}
.lrow .cnt{font-size:9px;letter-spacing:.1em;opacity:.4;padding-right:2px}
.lfoot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.1);font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.8}
.lhint{font-size:9px;letter-spacing:.1em;text-transform:uppercase;opacity:.4;margin-top:8px;line-height:1.5}
`);
