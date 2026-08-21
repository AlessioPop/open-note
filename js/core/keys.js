/* Open Note — core/keys.js
   drawing the sheet, what is selected, and the keyboard */

/* ================= drawing the sheet ================= */
async function render(){
  cancelLinking(); deselectString(); closeQuickMenu();
  /* the sheet is about to be rebuilt: a properties panel would be left holding
     a dead anchor and editing items that are no longer on screen */
  if(typeof closeProps === 'function') closeProps();
  /* a folder whose item is gone — cleared, deleted, restored over — closes with it */
  if(foldOpen && foldOpen.page.items.indexOf(foldOpen.it) < 0) closeFolder();
  /* a deck being studied can be on the sheet or inside a folder — the scope closes
     only when it is in neither any more */
  if(SCOPE && !SCOPE.page.items.some(x => x === SCOPE.it || kidsOf(x).indexOf(SCOPE.it) >= 0))
    closeScope();
  BOARD = null; ROPES = [];
  const host = $('#pageHost');
  host.innerHTML = '';
  const p = await loadSheet();
  if(!p) return;
  const el = buildPage(p, true);
  host.appendChild(el);
  ensureMedia(p); ensureModels(p);
  addPaperEdges(host);
  buildBoard([{ page: p, wrap: el }]);
  applyLayerClasses(); syncCapture();
  if($('#lpanel').classList.contains('open')) renderLayers();
  refit();
  $('#paperBtn').textContent = p.paper || 'grid';
  syncSelectionDOM();
}

/* ================= what the chrome does about the sheet ================= */
$('#clearPage').addEventListener('click', () => {
  const p = sheet();
  if(!p.items.length && !(p.ink || []).length) return;
  if(!confirm('Clear this canvas? Everything on it, ink included, will be removed.')) return;
  for(const it of p.items) mediaIds(it).forEach(dropMedia);
  p.items = []; p.links = []; p.ink = []; select(null);
  queueSave(p.id); SND.pluck(); render();
});
$('#paperBtn').addEventListener('click', () => {
  const p = sheet();
  p.paper = PAPERS[(PAPERS.indexOf(p.paper || 'grid') + 1) % PAPERS.length];
  queueSave(p.id); render();
});

/* ================= the keyboard ================= */
window.addEventListener('keydown', e => {
  /* the reader sits on top, then the studied card, then the folder it came out of */
  if(e.key === 'Escape' && (closeViewer() || (!SCOPE && closeFolder()))) return;
  const editing = document.activeElement && (document.activeElement.isContentEditable ||
    /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
  if(editing){ if(e.key === 'Escape') document.activeElement.blur(); return; }
  if($('#shelf').classList.contains('open')){
    if(e.key === 'Escape' && curNoteId) $('#shelf').classList.remove('open');
    return;
  }
  if(!index) return;
  if(SCOPE){ scopeKey(e); return; }               // one card has the screen: the keys are its own
  if(e.key === ' ' || (e.shiftKey && (e.key === 'a' || e.key === 'A'))){
    e.preventDefault(); quickAtPointer(); return;
  }
  /* taking it back — a stroke of ink, a thing placed, a thing deleted:
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
    if(selectMode || SELECTED.size){ setSelectMode(false, true); select(null); return; }
    select(null); $('#drawer').classList.remove('open');
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
    if(SELECTED.size > 1){ deleteSelection(); return; }
    if(!selected) return;
    const p = sheet();
    const it = p && p.items.find(x => x.id === selected);
    if(it) removeItem(p, it);
  }
});

window.addEventListener('resize', () => {
  refit();
  requestAnimationFrame(() => document.querySelectorAll('#bkGrid .page').forEach(fit));
});
