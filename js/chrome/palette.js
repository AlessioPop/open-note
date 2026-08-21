/* Open Note — ui/palette.js
   the palette — Space, Shift+A, right-click, or + Add… in the toolbar.

   One glass panel instead of a wall of buttons: seven shelves along the top
   (Write · Math · Logic · Science · Media · Shapes · Decor), a grid of icon
   tiles for whichever shelf is open, a search field that looks across all of
   them, and the page actions along the foot. It is drawn entirely from the
   registry — every tile is a defineTool() some feature declared in its own
   file — so a new feature appears here without this file changing. It warps out
   of the exact point it was summoned from (ui/glass.js), and remembers the
   shelf you left it on. */

defineToolCat('write',  { label: 'Write',  icon: 'pencil',  order: 10 });
defineToolCat('math',   { label: 'Math',   icon: 'sigma',   order: 20 });
/* Logic sits beside Math because that is what it is — but on its own shelf
   rather than inside it: thirteen gate tiles buried among the plots would bury
   the plots too, and js/items/logic/ is a folder, which by the rule in
   docs/architecture.md means a shelf of the same name. */
defineToolCat('logic',  { label: 'Logic',  icon: 'logic',   order: 22 });
defineToolCat('science',{ label: 'Science',icon: 'flask',   order: 25 });
defineToolCat('media',  { label: 'Media',  icon: 'image',   order: 30 });
defineToolCat('shapes', { label: 'Shapes', icon: 'cube',    order: 40 });
defineToolCat('decor',  { label: 'Decor',  icon: 'sparkle', order: 50 });

const qmenu = $('#palette');
let qCtx = null, pendingAt = null;
const lastMouse = { x: innerWidth / 2, y: innerHeight / 2 };
window.addEventListener('pointermove', e => { lastMouse.x = e.clientX; lastMouse.y = e.clientY; }, { passive: true });
const takePendingAt = () => { const a = pendingAt; pendingAt = null; return a; };

/* ---- built from the registry ---- */
const palCats = () => Object.values(TOOL_CATS).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
const palTools = cat => TOOLS.filter(t => (t.cat || 'decor') === cat)
  .sort((a, b) => a.order - b.order || a.seq - b.seq);
let curCat = 'write', palClosing = false;
try { curCat = localStorage.getItem('dsk.shelf') || 'write'; } catch(e){}

const palTile = (t, tag) =>
  '<button class="ptile" data-add="' + t.kind + '" title="' + esc(t.hint || t.label) + '">' +
  icn(t.icon) + '<span class="lb">' + esc(t.label) + '</span>' +
  (tag ? '<span class="tag">' + esc(tag) + '</span>' : '') + '</button>';

function rebuildPalette(){
  $('#palTabs').innerHTML = '<span class="pthumb"></span>' + palCats().map(c =>
    '<button class="ptab" data-cat="' + c.id + '" role="tab">' + icn(c.icon) +
    '<span>' + esc(c.label) + '</span></button>').join('');
  if(!TOOL_CATS[curCat]) curCat = palCats()[0].id;
  renderGrid();
}
function renderGrid(calm){
  const q = $('#palSeek').value.trim().toLowerCase();
  const grid = $('#palGrid');
  grid.classList.toggle('calm', !!calm);
  $('#palTabs').classList.toggle('mute', !!q);
  let html;
  if(q){
    const hit = t => { const l = t.label.toLowerCase();
      return l.startsWith(q) ? 0 : l.includes(q) ? 1 : (t.hint || '').toLowerCase().includes(q) ? 2 : -1; };
    const found = TOOLS.map(t => ({ t, s: hit(t) })).filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.t.seq - b.t.seq).map(x => x.t);
    html = found.length ? found.map(t => palTile(t, (TOOL_CATS[t.cat] || {}).label)).join('')
      : '<div class="pnone">nothing called “' + esc(q) + '”</div>';
  } else {
    const tools = palTools(curCat);
    const groups = [];
    for(const t of tools){
      const name = t.group || '';
      let g = groups.find(x => x.name === name);
      if(!g) groups.push(g = { name, order: t.groupOrder == null ? 50 : t.groupOrder, tools: [] });
      g.tools.push(t);
    }
    groups.sort((a, b) => a.order - b.order);
    html = groups.map(g => (g.name ? '<div class="pgroup">' + esc(g.name) + '</div>' : '') +
      g.tools.map(t => palTile(t)).join('')).join('');
  }
  grid.innerHTML = html;
  [...grid.children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 11)));
  document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('on', !q && b.dataset.cat === curCat));
  moveThumb();
}
/* the sliding pill sits under whichever shelf is open */
function moveThumb(){
  const th = qmenu.querySelector('.pthumb'), on = qmenu.querySelector('.ptab.on');
  if(!th) return;
  th.style.opacity = on ? 1 : 0;
  if(on){ th.style.width = on.offsetWidth + 'px'; th.style.transform = 'translateX(' + (on.offsetLeft - 3) + 'px)'; }
}
function setShelf(id){
  curCat = id;
  try { localStorage.setItem('dsk.shelf', id); } catch(e){}
  $('#palSeek').value = '';
  renderGrid();
  /* a taller shelf near the foot of the screen would run off it */
  const r = qmenu.getBoundingClientRect();
  qmenu.style.top = clamp(r.top, 8, innerHeight - qmenu.offsetHeight - 8) + 'px';
}

/* ---- summoning it ----
   x/y is where the panel goes; ox/oy (optional) is where it warps out of —
   the two differ when it opens above the + Add… button. */
function openQuickMenu(x, y, ctx, above, ox, oy){
  qCtx = ctx || null;
  palClosing = false;
  $('#palSeek').value = '';
  qmenu.classList.add('open');
  renderGrid();
  const w = qmenu.offsetWidth, h = qmenu.offsetHeight;
  qmenu.style.left = clamp(x, 8, innerWidth - w - 8) + 'px';
  qmenu.style.top = clamp(above ? y - h - 10 : y, 8, innerHeight - h - 8) + 'px';
  warpIn(qmenu, ox == null ? x : ox, oy == null ? y : oy);
  $('#palSeek').focus({ preventScroll: true });
}
function closeQuickMenu(){
  qCtx = null;
  if(!qmenu.classList.contains('open') || palClosing) return;
  palClosing = true;
  if(qmenu.contains(document.activeElement)) document.activeElement.blur();
  /* reopening mid-warp cancels this and clears the flag — a stale callback
     must not take the freshly opened panel down with it */
  warpOut(qmenu, () => {
    if(!palClosing) return;
    qmenu.classList.remove('open'); palClosing = false;
  });
}
function quickAtPointer(){
  let ctx = null;
  const el = document.elementFromPoint(lastMouse.x, lastMouse.y);
  const surf = el && el.closest ? el.closest('.surface') : null;
  if(surf && BOARD){
    const en = BOARD.entries.find(x => x.wrap === surf.closest('.page'));
    if(en){
      ctx = { page: en.page, at: pctFrom({ clientX: lastMouse.x, clientY: lastMouse.y }, surf) };
    }
  }
  openQuickMenu(lastMouse.x + 6, lastMouse.y + 6, ctx);
}
$('#qaddBtn').addEventListener('click', e => {
  e.stopPropagation();
  if(qmenu.classList.contains('open')) return closeQuickMenu();
  const r = e.currentTarget.getBoundingClientRect();
  openQuickMenu(r.left, r.top, null, true, r.left + r.width / 2, r.top);
});

/* ---- what a click in it does ---- */
qmenu.addEventListener('click', e => {
  const tab = e.target.closest('.ptab');
  if(tab) return setShelf(tab.dataset.cat);
  /* a tile or a page action was picked — the feature's own handler has already
     run (they bind closer to the target), so the panel can go */
  if(e.target.closest('[data-add],.pact')) closeQuickMenu();
});
window.addEventListener('pointerdown', e => {
  if(qmenu.classList.contains('open') && !e.target.closest('#palette') && e.target.id !== 'qaddBtn')
    closeQuickMenu();
});

/* ---- the keyboard ----
   The field has focus from the moment the panel opens, so typing searches.
   Esc clears what was typed, then closes; Enter takes the first answer;
   arrows step out of the field and walk the grid. */
$('#palSeek').addEventListener('input', () => renderGrid(true));
$('#palSeek').addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    e.stopPropagation(); e.preventDefault();
    if(e.currentTarget.value){ e.currentTarget.value = ''; renderGrid(true); }
    else closeQuickMenu();
  }
  if(e.key === 'Enter'){
    e.stopPropagation();
    const t = $('#palGrid .ptile'); if(t) t.click();
  }
  if(e.key === 'ArrowDown'){
    e.stopPropagation(); e.preventDefault();
    const t = $('#palGrid .ptile'); if(t) t.focus();
  }
});
qmenu.addEventListener('keydown', e => {
  const t = e.target.closest('.ptile');
  if(!t || !/^Arrow/.test(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  const tiles = [...document.querySelectorAll('#palGrid .ptile')];
  const i = tiles.indexOf(t), cols = 4;
  const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1
    : e.key === 'ArrowDown' ? i + cols : i - cols;
  if(e.key === 'ArrowUp' && i < cols) return $('#palSeek').focus();
  if(tiles[j]) tiles[j].focus();
});

/* the footer buttons carry their icons; the shelves and tiles carry theirs */
document.querySelectorAll('.pact[data-icon]').forEach(b =>
  b.insertAdjacentHTML('afterbegin', icn(b.dataset.icon)));
$('#palSeek').insertAdjacentHTML('beforebegin', icn('search'));
rebuildPalette();

/* ---- how it looks ---- */
addCSS('palette', `
/* ---------- the palette ---------- */
.palette{position:fixed;z-index:80;display:none;width:474px;border-radius:18px;padding:13px 13px 9px;font-family:var(--mono);will-change:transform,filter,opacity}
.palette.open{display:block}
.psearch{display:flex;align-items:center;gap:9px;height:34px;padding:0 12px;border-radius:11px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.psearch .ic{width:15px;height:15px;opacity:.5;flex:none}
.psearch input{flex:1;min-width:0;background:none;border:0;outline:0;color:inherit;font-family:var(--mono);font-size:12px;letter-spacing:.04em}
.psearch input::placeholder{color:rgba(233,234,239,.38);text-transform:uppercase;font-size:10px;letter-spacing:.14em}
.ptabs{position:relative;display:flex;margin:10px 0 0;padding:3px;border-radius:12px;background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);transition:opacity .18s}
.ptabs.mute{opacity:.3;pointer-events:none}
.pthumb{position:absolute;top:3px;bottom:3px;left:3px;border-radius:9px;background:rgba(255,255,255,.11);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),0 2px 7px rgba(0,0,0,.28);transition:transform .3s cubic-bezier(.3,1.35,.45,1),width .3s cubic-bezier(.3,1.35,.45,1),opacity .18s}
.ptab{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px 5px;border-radius:9px;color:rgba(233,234,239,.6);font-family:var(--mono);font-size:8.5px;letter-spacing:.15em;text-transform:uppercase;transition:color .15s}
.ptab .ic{width:17px;height:17px}
.ptab:hover,.ptab.on{color:#fff}
.pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding:11px 0 3px;min-height:100px;
  max-height:min(56vh,520px);overflow:auto;scrollbar-width:thin}
.pgroup{grid-column:1/-1;margin:4px 3px -1px;font-size:8px;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(233,234,239,.42)}
.ptile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;height:78px;border-radius:13px;color:rgba(233,234,239,.88);background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);transition:background .15s,transform .15s,box-shadow .15s,color .15s;animation:ptin .26s cubic-bezier(.2,.9,.3,1) both;animation-delay:calc(var(--i,0)*16ms)}
.pgrid.calm .ptile{animation:none}
@keyframes ptin{from{opacity:0;transform:translateY(9px) scale(.94)}}
.ptile .ic{width:25px;height:25px;opacity:.9}
.ptile .lb{max-width:100%;padding:0 5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;opacity:.72}
.ptile .tag{position:absolute;top:6px;right:8px;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;opacity:.38}
.ptile:hover{background:rgba(255,255,255,.085);color:#fff;transform:translateY(-1px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.13),0 7px 18px rgba(0,0,0,.28)}
.ptile:hover .lb{opacity:.95}
.pnone{grid-column:1/-1;align-self:center;text-align:center;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.4;padding:26px 0}
.pfoot{display:flex;gap:6px;margin-top:6px;padding-top:9px;border-top:1px solid rgba(255,255,255,.07)}
.pact{display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:9px;font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(233,234,239,.72);background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);transition:background .15s,color .15s}
.pact:hover{color:#fff;background:rgba(255,255,255,.085)}
.pact .ic{width:14px;height:14px;opacity:.8;flex:none}
.phint{margin-top:8px;text-align:center;font-size:8px;letter-spacing:.18em;text-transform:uppercase;opacity:.32}
@media (prefers-reduced-motion: reduce){.ptile{animation:none}.pthumb{transition:none}}
`);
