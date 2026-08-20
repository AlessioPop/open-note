/* Open Note — ui/bookmarks.js
   bookmark tabs along the book edge */

/* ================= bookmarks (tabs on the book edge) ================= */
/* index.bookmarks = [{id, pageId, label, c, edge:'top'|'right', pos:0..1}] —
   every tab is visible from every page; clicking one flips straight to its page */
let bmChip = null;

function placeTab(tab, bm){
  const on = viewIdx().some(i => index.pages[i].id === bm.pageId);
  tab.className = 'bmark c' + (bm.c || 0) + (bm.edge === 'right' ? ' bm-right' : '') + (on ? ' on' : '');
  if(bm.edge === 'right'){
    tab.style.left = 'auto'; tab.style.right = '0';
    tab.style.top = (bm.pos * 100) + '%';
  } else {
    tab.style.right = 'auto'; tab.style.top = '0';
    tab.style.left = (bm.pos * 100) + '%';
  }
}
function jumpToBookmark(bm){
  const pi = index.pages.findIndex(m => m.id === bm.pageId);
  if(pi >= 0) gotoPage(pi);
}
function syncBmScale(){
  const box = document.querySelector('#pageHost .bmarks');
  if(!box || !BOARD || !BOARD.entries.length) return;
  requestAnimationFrame(() =>
    box.style.setProperty('--scale', (BOARD.entries[0].wrap.offsetWidth / pgW()).toFixed(4)));
}
function renderBookmarks(){
  const host = $('#pageHost');
  const old = host.querySelector('.bmarks');
  if(old) old.remove();
  if(typeof syncAtlas === 'function') syncAtlas();   // any atlas on screen re-reads the bookmarks
  if(!index || !BOARD || !BOARD.entries.length || !(index.bookmarks || []).length) return;
  const box = document.createElement('div');
  box.className = 'bmarks';
  box.style.setProperty('--scale', (BOARD.entries[0].wrap.offsetWidth / pgW()).toFixed(4));
  for(const bm of index.bookmarks){
    const pi = index.pages.findIndex(m => m.id === bm.pageId);
    if(pi < 0) continue;
    const tab = document.createElement('div');
    tab.title = index.pages[pi].title || '';
    tab.innerHTML = '<div class="tabface"><span class="lab"></span></div>';
    const lab = tab.querySelector('.lab');
    lab.textContent = bm.label || (pi === 0 ? 'Cover' : String(pi).padStart(2, '0'));
    placeTab(tab, bm);
    tab.addEventListener('pointerdown', e => {
      if(tab.classList.contains('editing')) return;
      e.stopPropagation();
      const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
      let dragged = false;
      const mv = ev => {
        if(ev.pointerId !== pid) return;
        if(!dragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        dragged = true;
        const hr = host.getBoundingClientRect();
        const dTop = Math.abs(ev.clientY - hr.top), dRight = Math.abs(hr.right - ev.clientX);
        if(dTop <= dRight){ bm.edge = 'top'; bm.pos = clamp((ev.clientX - hr.left) / hr.width, 0.03, 0.97); }
        else { bm.edge = 'right'; bm.pos = clamp((ev.clientY - hr.top) / hr.height, 0.02, 0.92); }
        placeTab(tab, bm);
      };
      const up = ev => {
        if(ev.pointerId !== pid) return;
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if(dragged){ queueIndex(); SND.tape(); }
        else jumpToBookmark(bm);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
    tab.addEventListener('dblclick', e => {
      e.stopPropagation();
      tab.classList.add('editing');
      lab.contentEditable = 'true';
      lab.focus();
      const sel = getSelection(); sel.selectAllChildren(lab);
      lab.addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); lab.blur(); } });
      lab.addEventListener('blur', () => {
        bm.label = lab.textContent.trim().slice(0, 16);
        queueIndex(); renderBookmarks();
      }, { once: true });
    });
    tab.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      openBmChip(tab, bm);
    });
    box.appendChild(tab);
  }
  /* FIRST child, so the paper paints over the strip: a tab's buried end simply
     disappears under the page and only the part poking out is there to click */
  host.insertBefore(box, host.firstChild);
}
function closeBmChip(){ if(bmChip){ bmChip.remove(); bmChip = null; } }
function openBmChip(tab, bm){
  closeBmChip();
  const host = $('#pageHost');
  const hr = host.getBoundingClientRect();
  const tr = (tab.querySelector('.tabface') || tab).getBoundingClientRect();
  bmChip = document.createElement('div');
  bmChip.className = 'strchip';
  const box = host.querySelector('.bmarks');
  bmChip.style.setProperty('--scale', (box && box.style.getPropertyValue('--scale')) || 1);
  bmChip.style.left = ((tr.left + tr.width / 2 - hr.left) / hr.width * 100) + '%';
  bmChip.style.top = ((tr.bottom - hr.top + 16) / hr.height * 100) + '%';
  bmChip.innerHTML = '<button title="Bookmark colour">◑</button><button title="Remove bookmark">✕</button>';
  const btns = bmChip.querySelectorAll('button');
  bmChip.addEventListener('pointerdown', e => e.stopPropagation());
  btns[0].addEventListener('click', e => { e.stopPropagation();
    bm.c = ((bm.c || 0) + 1) % 5; queueIndex(); renderBookmarks(); });
  btns[1].addEventListener('click', e => { e.stopPropagation();
    index.bookmarks = index.bookmarks.filter(x => x !== bm);
    queueIndex(); renderBookmarks(); closeBmChip(); SND.pluck(); });
  host.appendChild(bmChip);
}
$('#bmarkBtn').addEventListener('click', () => {
  const p = (qCtx && qCtx.page) || activePage();
  index.bookmarks = index.bookmarks || [];
  const ex = index.bookmarks.find(b => b.pageId === p.id);
  if(ex) index.bookmarks = index.bookmarks.filter(b => b !== ex);
  else {
    const n = index.bookmarks.length;
    index.bookmarks.push({ id: uid(), pageId: p.id, label: '', c: n % 5,
      edge: 'right', pos: clamp(0.06 + (n * 0.085) % 0.86, 0.02, 0.92) });
    SND.tape();
    if(typeof seedAtlas === 'function') seedAtlas();  // the first one brings the contents page
  }
  queueIndex();
  renderBookmarks();
});

/* ---- images ----
   Every kind of thing is made in two steps: a RECORD, which is the thing itself
   and nothing about where it sits, and a placer that gives it a spot on the page.
   A folder wants the record on its own, with no spot at all. */

/* ---- how it looks ---- */
addCSS('bookmarks', `
/* bookmark tabs — straight divider tabs riding the fore-edge. The strip that
   holds them sits UNDER the paper (first child of the host), so a tab really
   does come out from between the pages: no tape on the page, the sheet's own
   shadow falls across the buried end, and only the part poking out takes the
   mouse. Rounded outer corners, a darker seam where it slips under. */
.bmarks{position:absolute;inset:0;pointer-events:none}
.bmark{position:absolute;top:0;transform:translateX(-50%);width:calc(var(--scale)*78px);height:calc(var(--scale)*30px)}
.bmark.bm-right{transform:translateY(-50%);width:calc(var(--scale)*30px);height:calc(var(--scale)*78px)}
.tabface{position:absolute;inset:0;pointer-events:auto;cursor:pointer;display:flex;align-items:flex-start;justify-content:center;
  padding-top:calc(var(--scale)*6px);
  font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.13em;text-transform:uppercase;color:var(--bmfg,#fff);
  background:linear-gradient(0deg,rgba(0,0,0,.16),rgba(0,0,0,0) 40%,rgba(255,255,255,.15) 88%,rgba(0,0,0,.06)),var(--bmc,var(--accent));
  border-radius:calc(var(--scale)*8px) calc(var(--scale)*8px) 0 0;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.15),inset 0 calc(var(--scale)*-7px) calc(var(--scale)*8px) rgba(0,0,0,.10);
  filter:drop-shadow(0 calc(var(--scale)*2px) calc(var(--scale)*2.5px) rgba(0,0,0,.35));
  transform:translateY(-74%);transition:transform .16s ease}
.bmark:hover .tabface{transform:translateY(-86%)}
.bmark.on .tabface{transform:translateY(-90%)}
.bmark.on:hover .tabface{transform:translateY(-96%)}
.bmark.bm-right .tabface{writing-mode:vertical-rl;align-items:flex-start;padding-top:0;padding-right:calc(var(--scale)*5px);
  background:linear-gradient(90deg,rgba(0,0,0,.16),rgba(0,0,0,0) 40%,rgba(255,255,255,.15) 88%,rgba(0,0,0,.06)),var(--bmc,var(--accent));
  border-radius:0 calc(var(--scale)*8px) calc(var(--scale)*8px) 0;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.15),inset calc(var(--scale)*7px) 0 calc(var(--scale)*8px) rgba(0,0,0,.10);
  transform:translateX(74%)}
.bmark.bm-right:hover .tabface{transform:translateX(86%)}
.bmark.bm-right.on .tabface{transform:translateX(90%)}
.bmark.bm-right.on:hover .tabface{transform:translateX(96%)}
.bmark.c1{--bmc:var(--accent2)}
.bmark.c2{--bmc:var(--ink);--bmfg:var(--paper)}
.bmark.c3{--bmc:#e8c93e;--bmfg:#3a3009}
.bmark.c4{--bmc:#e58ab2;--bmfg:#4d1330}
.bmark .lab{outline:none;max-width:100%;overflow:hidden;white-space:nowrap;padding:0 calc(var(--scale)*4px)}
.bmark.bm-right .lab{padding:calc(var(--scale)*4px) 0}
.bmark.editing .tabface{cursor:text}
`);
