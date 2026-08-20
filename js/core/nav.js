/* Open Note — core/nav.js
   selection, keyboard, pages and the spread */

/* ================= selection, nav, pages ================= */
/* flip straight to page n — bookmarks, the atlas and anything else jump with this */
function gotoPage(n){
  if(!index || n < 0 || n >= index.pages.length || viewIdx().includes(n)) return;
  cur = n; selected = null; activePageId = null;
  queueIndex(); SND.flip(); render();
}
function select(id){
  selected = id;
  /* the chip belongs to the plot it is on: picking anything else puts it away */
  if(mathSel && mathSel.pid !== id){ mathSel = null; repaintPlots(); syncMathBar(); }
  document.querySelectorAll('.item').forEach(n => {
    const on = n.dataset.id === id;
    n.classList.toggle('sel', on);
    if(!on) n.classList.remove('play');
  });
}
async function render(){
  cancelLinking(); deselectString(); closeQuickMenu(); closeBmChip();
  /* the page is about to be rebuilt: a properties panel would be left holding
     a dead anchor and editing items that are no longer on screen */
  if(typeof closeProps === 'function') closeProps();
  /* a folder whose item is gone — cleared, deleted, restored over — closes with it */
  if(foldOpen && foldOpen.page.items.indexOf(foldOpen.it) < 0) closeFolder();
  /* a deck being studied can be on the page or inside a folder — the scope closes
     only when it is in neither any more */
  if(SCOPE && !SCOPE.page.items.some(x => x === SCOPE.it || kidsOf(x).indexOf(SCOPE.it) >= 0))
    closeScope();
  BOARD = null; ROPES = [];
  const host = $('#pageHost');
  host.innerHTML = '';
  const idxs = viewIdx();
  document.body.classList.toggle('spread', idxs.length > 1);
  const entries = [];
  for(let k = 0; k < idxs.length; k++){
    const p = await loadPage(idxs[k]);
    const el = buildPage(p, true);
    if(k === 1) el.classList.add('right');
    host.appendChild(el);
    entries.push({ page: p, wrap: el });
    ensureMedia(p); ensureModels(p);
  }
  addGrips(host);
  buildBoard(entries);
  renderBookmarks();
  applyLayerClasses(); syncCapture();
  if($('#lpanel').classList.contains('open')) renderLayers();
  refit();
  const label = idxs.map(i => i === 0 ? 'Cover' : i).join('–');
  $('#folioTag').textContent = label + ' / ' + (index.pages.length - 1);
  $('#paperBtn').textContent = activePage().paper || 'grid';
  const L = $('#edgeL'), R = $('#edgeR');
  L.innerHTML = ''; R.innerHTML = '';
  const last = idxs[idxs.length - 1];
  for(let i = 0; i < Math.min(cur, 12); i++) L.insertAdjacentHTML('beforeend', '<i style="left:' + i * 1.1 + 'px"></i>');
  for(let i = 0; i < Math.min(index.pages.length - 1 - last, 12); i++) R.insertAdjacentHTML('beforeend', '<i style="right:' + i * 1.1 + 'px"></i>');
  if(selected) select(selected);
}
async function go(delta){
  const step = index.spread ? Math.max(1, viewIdx().length) * Math.sign(delta) : delta;
  const t = clamp(cur + step, 0, index.pages.length - 1);
  if(t === cur) return;
  const el = $('#pageHost').firstElementChild;
  if(el) el.classList.add(delta > 0 ? 'flip-next' : 'flip-prev');
  cur = t; selected = null; activePageId = null; queueIndex();
  SND.flip();
  setTimeout(render, 120);
}
$('#prev').addEventListener('click', () => go(-1));
$('#next').addEventListener('click', () => go(1));
$('#spreadBtn').addEventListener('click', () => {
  index.spread = !index.spread;
  $('#spreadBtn').textContent = index.spread ? '▢▢ Spread' : '▢ Single';
  queueIndex(); render();
});
$('#addPage').addEventListener('click', async () => {
  const p = blankPage(index.pages.length);
  pages.set(p.id, p);
  index.pages.splice(cur + 1, 0, { id: p.id, title: p.title, date: p.date });
  cur = cur + 1; selected = null; activePageId = null;
  await kvSet(kPage(p.id), p); queueIndex(); SND.flip(); render();
});
$('#delPage').addEventListener('click', async () => {
  const target = activePage();
  const ti = index.pages.findIndex(m => m.id === target.id);
  if(index.pages.length <= 2){ alert('A sketchbook needs at least a cover and one page.'); return; }
  if(ti === 0){ alert('The cover stays.'); return; }
  if(!confirm('Remove "' + (target.title || 'this page') + '" and everything on it?')) return;
  index.pages.splice(ti, 1);
  if(index.xlinks) index.xlinks = index.xlinks.filter(x => x.ap !== target.id && x.bp !== target.id);
  if(index.bookmarks) index.bookmarks = index.bookmarks.filter(b => b.pageId !== target.id);
  for(const it of target.items) mediaIds(it).forEach(dropMedia);
  pages.delete(target.id); await kvDel(kPage(target.id));
  cur = clamp(cur, 0, index.pages.length - 1); selected = null; activePageId = null;
  queueIndex(); render();
});
$('#clearPage').addEventListener('click', () => {
  const p = activePage();
  if(!p.items.length && !(p.ink || []).length) return;
  if(!confirm('Clear "' + (p.title || 'this page') + '"? Everything on it, ink included, will be removed.')) return;
  for(const it of p.items) mediaIds(it).forEach(dropMedia);
  p.items = []; p.links = []; p.ink = []; selected = null;
  if(index.xlinks && index.xlinks.some(x => x.ap === p.id || x.bp === p.id)){
    index.xlinks = index.xlinks.filter(x => x.ap !== p.id && x.bp !== p.id);
    queueIndex();
  }
  queueSave(p.id); SND.pluck(); render();
});
$('#paperBtn').addEventListener('click', () => {
  const p = activePage();
  p.paper = PAPERS[(PAPERS.indexOf(p.paper || 'grid') + 1) % PAPERS.length];
  queueSave(p.id); render();
});
window.addEventListener('keydown', e => {
  /* the reader sits on top, then the studied card, then the folder it came out of */
  if(e.key === 'Escape' && (closeViewer() || (!SCOPE && closeFolder()))) return;
  const editing = document.activeElement && (document.activeElement.isContentEditable ||
    /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
  if(editing){ if(e.key === 'Escape') document.activeElement.blur(); return; }
  if($('#shelf').classList.contains('open')){
    if(e.key === 'Escape' && curBookId) $('#shelf').classList.remove('open');
    return;
  }
  if(!index) return;
  if(SCOPE){ scopeKey(e); return; }               // one card has the screen: the keys are its own
  if(e.key === ' ' || (e.shiftKey && (e.key === 'a' || e.key === 'A'))){
    e.preventDefault(); quickAtPointer(); return;
  }
  /* taking it back — a stroke of ink, a thing placed, a thing deleted, a page:
     they are all the same step to core/history.js */
  if((e.ctrlKey || e.metaKey) && !e.altKey){
    const k = e.key.toLowerCase();
    if(k === 'z' && !e.shiftKey){ e.preventDefault(); undo(); return; }
    if(k === 'y' || (k === 'z' && e.shiftKey)){ e.preventDefault(); redo(); return; }
  }
  if(!e.ctrlKey && !e.metaKey && !e.altKey){
    if(e.key === 'd' || e.key === 'D'){ e.preventDefault(); setDraw(!drawMode); return; }
    if(e.key === 'l' || e.key === 'L'){ e.preventDefault(); toggleLayers(); return; }
    if(e.key === 'm' || e.key === 'M'){ e.preventDefault(); setMath(!mathMode); return; }
  }
  if(e.key === 'ArrowRight') go(1);
  if(e.key === 'ArrowLeft') go(-1);
  if(e.key === '+' || e.key === '=') zoomBy(1.15);
  if(e.key === '-') zoomBy(1 / 1.15);
  if(e.key === '0'){ commitZoom(); panX = panY = 0; setZoom(1); }
  if(e.key === 'Escape'){
    if(qmenu.classList.contains('open')){ closeQuickMenu(); return; }
    if(linking){ cancelLinking(); return; }
    if(mathAim){ mathAim = null; syncMathBar(); return; }
    if(mathTool === 'vec'){ mathTool = 'pan'; syncMathBar(); return; }
    if(mathSel){ selectMath(null, null); return; }
    if(mathMode){ setMath(false); return; }
    if(drawMode){ setDraw(false); return; }
    if(selString){ deselectString(); return; }
    if(focusLayer){ focusLayer = null; applyLayerClasses(); return; }
    select(null); $('#drawer').classList.remove('open'); $('#sheet').classList.remove('open');
    $('#lpanel').classList.remove('open'); $('#vidModal').classList.remove('open');
  }
  if(e.key === 'Delete' || e.key === 'Backspace'){
    if(selString){ deleteString(selString); return; }
    if(mathSel){                                   // whatever is picked inside a plot goes first
      const f = findItem(mathSel.pid);
      const o = f && mathObj(f.it, mathSel.kind, mathSel.id);
      if(o){
        const arr = mathArr(f.it, mathSel.kind);   // which list it is in is the plot's business
        arr.splice(arr.indexOf(o), 1);
        queueSave(f.page.id); SND.pluck(); selectMath(null, null);
        return;
      }
    }
    if(!selected) return;
    for(const i of viewIdx()){
      const p = pages.get(index.pages[i].id);
      const it = p.items.find(x => x.id === selected);
      if(it){ removeItem(p, it); break; }
    }
  }
});
/* This listener is live from the moment nav.js runs, but syncBmScale only arrives
   with ui/bookmarks.js, nearly forty files further down index.html — and a window
   being created, shown or restored fires a resize inside that gap. refit and fit
   are safe: core/page.js loads just ahead of this one. Same guard core/save.js
   puts on the undo hooks, for the same reason. */
window.addEventListener('resize', () => {
  refit();
  if(typeof syncBmScale === 'function') syncBmScale();
  requestAnimationFrame(() => document.querySelectorAll('#bkGrid .page, #grid .page').forEach(fit));
});
