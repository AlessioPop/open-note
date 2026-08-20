/* Open Note — core/page.js
   building a page, and dragging the paper bigger */

/* ================= page rendering ================= */
function fit(el){
  const w = el.offsetWidth, h = el.offsetHeight; // layout size — unaffected by zoom transform
  if(!w) return;
  /* against the page's own width, so a bigger page is more room, not bigger type */
  el.style.setProperty('--scale', (w / pgW(el.__bIdx)).toFixed(4));
  /* ink is measured in thousandths of the page width, so its box follows the real page */
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
       items/model.js is fourteen of them below this one. Same reason
       core/nav.js guards syncBmScale, and the frame's delay is what makes this
       one show up on a cold start rather than every time. */
    if(typeof repaintModels === 'function') repaintModels();
  });
}

/* ---- drag the paper bigger: corner for both axes, edges for one ----
   The handles hang off the outside of the open view, so nothing on the page
   ever competes with them, and a spread gets one set for both leaves. */
function addGrips(host){
  const chip = document.createElement('div');
  chip.className = 'pgsize';
  host.appendChild(chip);
  [['c', 1, 1], ['x', 1, 0], ['y', 0, 1]].forEach(([kind, ax, ay]) => {
    const g = document.createElement('div');
    g.className = 'pgrip ' + kind;
    g.title = (kind === 'c' ? 'Drag to resize the paper' : kind === 'x' ? 'Drag to widen the paper'
                                                         : 'Drag to lengthen the paper') +
              ' — double-click to go back to the page shape';
    g.addEventListener('pointerdown', e => {
      const page = host.querySelector('.page');
      if(!page || !index) return;
      e.preventDefault(); e.stopPropagation();
      const w0 = pgW(), h0 = pgH();
      const k = page.offsetWidth / w0;               // pixels per page unit, zoom included
      if(!k) return;
      const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
      g.classList.add('on'); host.classList.add('resizing');
      const show = (w, h) => { chip.textContent = Math.round(w) + ' × ' + Math.round(h); };
      show(w0, h0);
      try{ g.setPointerCapture(pid); }catch(err){}
      const mv = ev => {
        if(ev.pointerId !== pid) return;
        const w = ax ? clamp(w0 + (ev.clientX - sx) / k, PG_MIN, PG_MAX) : w0;
        const h = ay ? clamp(h0 + (ev.clientY - sy) / k, PG_MIN, PG_MAX) : h0;
        index.settings.pgw = Math.round(w); index.settings.pgh = Math.round(h);
        applyPageSize();
        host.querySelectorAll('.page').forEach(fit);
        show(w, h);
      };
      const up = ev => {
        if(ev.pointerId !== pid) return;
        g.removeEventListener('pointermove', mv);
        g.removeEventListener('pointerup', up);
        g.removeEventListener('pointercancel', up);
        g.classList.remove('on'); host.classList.remove('resizing');
        $('#aspectSel').value = 'custom';
        queueIndex(); SND.plop();
        render();                                    // strings, arrows and models settle on the new size
      };
      g.addEventListener('pointermove', mv);
      g.addEventListener('pointerup', up);
      g.addEventListener('pointercancel', up);
    });
    g.addEventListener('dblclick', e => {            // back to the shape's own size
      e.stopPropagation();
      delete index.settings.pgw; delete index.settings.pgh;
      applyTheme(); queueIndex(); SND.pluck(); render();
    });
    host.appendChild(g);
  });
  addPaperEdges(host);                               // a sheet that grows hangs its own — ui/canvas.js
}

function buildPage(page, live, urls, bIdx){
  urls = urls || MEDIA_URL;
  const idx = bIdx || index;                     // shelf covers pass their own book's index
  const wrap = document.createElement('div');
  wrap.className = 'page'; wrap.style.setProperty('--scale', '1');
  wrap.__bIdx = idx;                               // fit() needs to know whose page this is
  const n = idx.pages.findIndex(p => p.id === page.id);
  wrap.innerHTML =
    '<div class="surface" data-paper="' + (page.paper || 'grid') + '"></div>' +
    '<div class="grain" style="filter:url(#grain)"></div>' +
    '<div class="slug"><span class="pt" ' + (live ? 'contenteditable' : '') + '>' + esc(page.title) + '</span>' +
    '<span class="pd" ' + (live ? 'contenteditable' : '') + '>' + esc(page.date || '') + '</span></div>' +
    '<div class="folio">' + (n === 0 ? 'COVER' : String(n).padStart(2, '0')) + '</div>';
  const surf = wrap.querySelector('.surface');
  if(migrateSketches(page, idx) && live) queueSave(page.id);
  if(!page.items.length && !(page.ink || []).length && live)
    surf.insertAdjacentHTML('beforeend', '<div class="empty">this page is blank — tape something in</div>');
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
    wrap.addEventListener('pointerdown', () => { activePageId = page.id; }, true);
    wrap.addEventListener('pointerdown', e => {          // finish (or cancel) tying a string
      if(!linking) return;
      e.preventDefault(); e.stopPropagation();
      const itEl = e.target.closest('.item');
      if(itEl && !(page.id === linking.pageId && itEl.dataset.id === linking.fromId)){
        if(page.id === linking.pageId) createLink(page, linking.fromId, itEl.dataset.id, linking.kind);
        else createXLink(linking.page, linking.fromId, page, itEl.dataset.id, linking.kind);   // across the spread
      }
      cancelLinking();
    }, true);
    wrap.querySelector('.pt').addEventListener('input', e => {
      page.title = e.target.textContent.trim(); idx.pages[n].title = page.title; queueSave(page.id); queueIndex(); });
    wrap.querySelector('.pd').addEventListener('input', e => {
      page.date = e.target.textContent.trim(); idx.pages[n].date = page.date; queueSave(page.id); queueIndex(); });
    surf.addEventListener('pointerdown', e => { if(e.target === surf){ select(null); deselectString(); } });
    surf.addEventListener('dblclick', e => { if(e.target === surf) addItem('body', pctFrom(e, surf), page); });
    surf.addEventListener('contextmenu', e => {
      e.preventDefault(); activePageId = page.id;
      openQuickMenu(e.clientX + 4, e.clientY + 4, { page, at: pctFrom(e, surf) });
    });
    surf.addEventListener('dragover', e => e.preventDefault());
    surf.addEventListener('drop', e => {
      e.preventDefault(); activePageId = page.id;
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
