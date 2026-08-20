/* Open Note — items/atlas.js
   the atlas — a contents block that knows where the bookmarks are */

/* ================= the atlas =================
   A table of contents that draws itself: every bookmark is a chapter line,
   and every Heading on the pages under that bookmark (up to the next one) is
   a sub-header beneath it. Click a line and the book flips there. It keeps no
   content of its own — bookmarks and headings ARE the content — so it can
   never go stale, and deleting it loses nothing.

   The first bookmark ever made quietly puts one on the starting page
   (seedAtlas, called from ui/bookmarks.js); after that it is an ordinary item
   — move it, resize it, delete it, or add another from the palette.

   Print, exports and shelf covers build pages before the rest of the book is
   in memory, so each page's headings are also kept as a digest on the book's
   index (`index.pages[n].heads`), written whenever the page is saved
   (syncPageMeta, called from core/save.js). Live pages read their items
   directly; everything else reads the digest. */

function titleTexts(p){
  const d = document.createElement('div');
  return p.items.filter(x => x.type === 'text' && x.st === 'title')
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map(x => { d.innerHTML = x.html || ''; return d.textContent.replace(/\s+/g, ' ').trim(); })
    .filter(Boolean)
    .map(s => s.slice(0, 60));
}
/* keep the index's digest of one page true; says whether it changed */
function syncPageMeta(p){
  if(!index) return false;
  const n = index.pages.findIndex(m => m.id === p.id);
  if(n < 0) return false;
  const heads = titleTexts(p), meta = index.pages[n];
  if(JSON.stringify(meta.heads || []) === JSON.stringify(heads)) return false;
  meta.heads = heads;
  return true;
}
function headsOf(idx, n){
  const meta = idx.pages[n];
  if(idx === index){
    const p = pages.get(meta.id);
    if(p) return titleTexts(p);
  }
  return meta.heads || [];
}
/* the chapters: bookmarks in page order, each with the headings of its range */
function atlasEntries(idx){
  const bms = (idx.bookmarks || [])
    .map(bm => ({ bm, n: idx.pages.findIndex(m => m.id === bm.pageId) }))
    .filter(x => x.n >= 0)
    .sort((a, b) => a.n - b.n);
  return bms.map((x, i) => {
    const end = i + 1 < bms.length ? bms[i + 1].n : idx.pages.length;
    const subs = [];
    for(let n = x.n; n < end; n++) headsOf(idx, n).forEach(t => subs.push({ n, t }));
    return { n: x.n, c: x.bm.c || 0, subs,
      label: x.bm.label || idx.pages[x.n].title || String(x.n).padStart(2, '0') };
  });
}
function atlasBody(it, c){
  const idx = (c && c.idx) || index;
  const pad2 = n => String(n).padStart(2, '0');
  let rows = '';
  for(const e of atlasEntries(idx)){
    rows += '<a class="abm" data-go="' + e.n + '"><i class="aswatch c' + e.c + '"></i>' +
      '<span class="albl">' + esc(e.label) + '</span><i class="adots"></i>' +
      '<span class="apg">' + pad2(e.n) + '</span></a>';
    for(const s of e.subs)
      rows += '<a class="asub" data-go="' + s.n + '"><span class="albl">' + esc(s.t) + '</span>' +
        '<i class="adots"></i><span class="apg">' + pad2(s.n) + '</span></a>';
  }
  return '<div class="body atlas"><div class="ahead">Contents</div>' +
    (rows ? '<div class="arows">' + rows + '</div>'
          : '<div class="anone">bookmark a page and it appears here</div>') +
    '</div>';
}
function wireAtlas(el){
  el.querySelectorAll('[data-go]').forEach(a => {
    a.addEventListener('pointerdown', e => e.stopPropagation());
    a.addEventListener('click', e => { e.stopPropagation(); gotoPage(+a.dataset.go); });
  });
}
/* a bookmark changed while an atlas is on screen: redraw its rows in place */
function syncAtlas(){
  document.querySelectorAll('#pageHost .item[data-type="atlas"]').forEach(el => {
    const pg = pageOfEl(el);
    const it = pg && pg.items.find(x => x.id === el.dataset.id);
    if(!it) return;
    el.querySelector('.atlas').outerHTML = atlasBody(it, { idx: index });
    wireAtlas(el);
  });
}
/* the first bookmark brings the atlas with it — once, onto the starting page */
function seedAtlas(){
  if(!index || index.atlasSeeded) return;
  index.atlasSeeded = 1;
  queueIndex();
  loadPage(0).then(p => {
    if(!p || p.items.some(x => x.type === 'atlas')) return;
    p.items.push({ id: uid(), type: 'atlas', x: 12, y: 58, w: 52, rot: 0,
      z: maxZ(p) + 1, lay: curLayerId(), fs: 15 });
    queueSave(p.id);
    if(viewIdx().includes(0)) render();
  });
}
/* older books have no digest yet: read their pages once, write it, move on */
onBookOpen(() => {
  if(!index || !(index.bookmarks || []).length) return;
  if(!index.pages.some(m => !m.heads)) return;
  Promise.all(index.pages.map((m, i) => m.heads ? null : loadPage(i))).then(ps => {
    let dirty = false;
    ps.forEach(p => { if(p && syncPageMeta(p)) dirty = true; });
    if(dirty){ queueIndex(); syncAtlas(); }
  });
});

defineItem('atlas', {
  add: { atlas: base => ({ ...base, type: 'atlas', w: 52, rot: 0, fs: 15 }) },
  sizeable: true,
  html: (it, c) => atlasBody(it, c),
  wire(el){ wireAtlas(el); }
});

/* ---- how it looks ---- */
addCSS('atlas', `
/* the contents block — quiet ink on the page, like the cards */
.atlas{display:flex;flex-direction:column;padding:.55em .7em;color:var(--ink);
  font-size:calc(var(--fs,15)*var(--scale)*1px);line-height:1.3}
.item[data-type="atlas"] .atlas{background:transparent;box-shadow:none;
  transition:background-color .16s ease,box-shadow .16s ease}
.item.sel .atlas,.item.dragging .atlas{
  background:color-mix(in srgb,var(--paper) 86%,transparent);
  box-shadow:0 0 0 1px var(--accent2),0 8px 18px rgba(0,0,0,.28)}
.ahead{font-family:var(--mono);font-size:.6em;letter-spacing:.3em;text-transform:uppercase;
  color:color-mix(in srgb,var(--ink) 62%,transparent);padding-bottom:.9em;
  border-bottom:calc(var(--scale)*1px) solid color-mix(in srgb,var(--ink) 24%,transparent)}
.arows{display:flex;flex-direction:column;gap:.42em;margin-top:.75em}
.abm,.asub{display:flex;align-items:baseline;gap:.45em;cursor:pointer;color:inherit}
.abm .albl{font-family:var(--disp);font-weight:700;font-size:.94em;text-transform:uppercase;
  letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asub{padding-left:1.5em;color:color-mix(in srgb,var(--ink) 76%,transparent)}
.asub .albl{font-family:var(--body);font-size:.8em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.abm:hover .albl,.asub:hover .albl{color:var(--accent)}
.adots{flex:1;min-width:1.2em;align-self:flex-end;margin-bottom:.32em;
  border-bottom:calc(var(--scale)*1.6px) dotted color-mix(in srgb,var(--ink) 32%,transparent)}
.apg{font-family:var(--mono);font-size:.72em;letter-spacing:.08em;
  color:color-mix(in srgb,var(--ink) 68%,transparent);font-variant-numeric:tabular-nums}
/* the little tab swatch echoes the bookmark it points at */
.aswatch{width:1em;height:.52em;align-self:center;flex:none;
  border-radius:.12em .3em .3em .12em;background:var(--bmc,var(--accent));
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.16)}
.aswatch.c1{--bmc:var(--accent2)}
.aswatch.c2{--bmc:var(--ink)}
.aswatch.c3{--bmc:#e8c93e}
.aswatch.c4{--bmc:#e58ab2}
.anone{font-family:var(--hand);font-size:.9em;color:color-mix(in srgb,var(--ink) 52%,transparent);margin-top:.7em}
`);
/* its tile in the palette */
defineTool({ kind: 'atlas', cat: 'write', label: 'Atlas', icon: 'atlas', order: 70,
  hint: 'A contents block — every bookmark a chapter, every heading under it; click to flip there' });
