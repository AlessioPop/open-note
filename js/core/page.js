/* Open Note — core/page.js
   building the sheet and everything on it */

/* ================= the sheet on screen ================= */
function fit(el){
  const w = el.offsetWidth, h = el.offsetHeight; // layout size — unaffected by zoom transform
  if(!w) return;
  /* against the sheet's own width, so a bigger sheet is more room, not bigger type */
  el.style.setProperty('--scale', (w / pgW(el.__bIdx)).toFixed(4));
  /* ink is measured in thousandths of the sheet width, so its box follows the real sheet */
  if(h) el.querySelectorAll('svg.ink').forEach(s =>
    s.setAttribute('viewBox', '0 0 1000 ' + (h / w * 1000).toFixed(1)));
}
/* once per frame however many times it is asked — a wheel can call this a dozen
   times between two paints, and repainting every model that often is wasted work */
let refitRaf = 0;
function refit(){
  if(refitRaf) return;
  refitRaf = requestAnimationFrame(() => {
    refitRaf = 0;
    document.querySelectorAll('#pageHost .page').forEach(fit);
    /* canvases are pixel-sized: redraw at the new scale. Guarded because this
       body runs a frame after refit() was called, and the resize that starts it
       can arrive while index.html is still working through its scripts —
       items/media/model.js is a long way below this one. */
    if(typeof repaintModels === 'function') repaintModels();
  });
}

/* Build a sheet's markup and everything on it. `live` is false for the shelf,
   for print and for an export — the same builder, with nothing wired up. */
function buildPage(page, live, urls, bIdx){
  urls = urls || MEDIA_URL;
  const idx = bIdx || index;                     // shelf covers pass their own note's index
  const wrap = document.createElement('div');
  wrap.className = 'page'; wrap.style.setProperty('--scale', '1');
  wrap.__bIdx = idx;                               // fit() needs to know whose sheet this is
  wrap.innerHTML =
    '<div class="surface" data-paper="' + (page.paper || 'grid') + '"></div>' +
    '<div class="grain" style="filter:url(#grain)"></div>';
  const surf = wrap.querySelector('.surface');
  if(migrateSketches(page, idx) && live) queueSave(page.id);
  if(!page.items.length && !(page.ink || []).length && live)
    surf.insertAdjacentHTML('beforeend', '<div class="empty"></div>');
  const ls = layers(idx), byLay = {};
  /* a hidden layer is hidden everywhere — on screen, in print and in exports */
  page.items.forEach(it => {
    if(!live && ls[layIdx(idx, it.lay)].hidden) return;
    surf.appendChild(buildItem(it, page, live, urls, idx));
  });
  /* one ink sheet per layer, sitting above that layer's items */
  (page.ink || []).forEach(s => {
    const k = ls[layIdx(idx, s.lay)].id;
    (byLay[k] = byLay[k] || []).push(s);
  });
  ls.forEach((L, i) => {
    if(!live && (L.hidden || !(byLay[L.id] || []).length)) return;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ink');
    svg.setAttribute('data-lay', L.id);
    svg.setAttribute('viewBox', '0 0 1000 ' + rd1(1000 * arOf(idx)));
    svg.style.zIndex = 6 + i * LSTEP + LSTEP - 1000;
    surf.appendChild(svg);
    renderInk(svg, byLay[L.id] || []);
  });
  if(live){
    wrap.addEventListener('pointerdown', e => {          // pick, tie, or give up
      if(!linking) return;
      e.preventDefault(); e.stopPropagation();
      linkClick(page, e.target.closest('.item'));
    }, true);
    surf.addEventListener('pointerdown', e => { if(e.target === surf){ select(null); deselectString(); } });
    surf.addEventListener('dblclick', e => { if(e.target === surf) addItem('body', pctFrom(e, surf), page); });
    surf.addEventListener('contextmenu', e => {
      e.preventDefault();
      openQuickMenu(e.clientX + 4, e.clientY + 4, { page, at: pctFrom(e, surf) });
    });
    surf.addEventListener('dragover', e => e.preventDefault());
    surf.addEventListener('drop', e => {
      e.preventDefault();
      const fs = [...(e.dataTransfer.files || [])];
      if(!fs.length) return;
      const at = pctFrom(e, surf);
      /* Whichever feature knows these files takes them — a picture, a video, an
         .obj and its textures, a workbook. Core does not know what any of them
         are; see `takes` in core/registry.js. Anything nobody claims rides along
         as an attachment. */
      for(const t of fileTakers()) if(ITEMS[t].takes(fs, at, page)) return;
      fileToAttach(fs[0], at);
    });
  }
  return wrap;
}
/* where on the paper a click landed, less a nudge that puts the pointer near the
   corner of whatever is about to appear there — the nudge is in page units, so
   it stays a nudge on a sheet ten times the size */
function pctFrom(e, surf){
  const r = surf.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * 100 - pctW(92),
           y: (e.clientY - r.top) / r.height * 100 - pctH(35) };
}
