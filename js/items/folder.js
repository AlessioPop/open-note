/* Open Note — items/folder.js
   folders — a tray you drag things into */

/* ================= folders =================
   A folder is an item that holds other items whole. Anything that can wear an
   icon can go in — an attachment, a picture, a video, a model — and it keeps its
   entire record, so taking it back out puts the real thing back on the page: the
   picture is taped in again, the model gets its window back. */
const CAN_FILE = { file:1, image:1, video:1, model:1, folder:1, deck:1 };
const kidsOf = it => (it && it.kids) || [];
/* …and a feature can say `fileable: true` in its spec instead of being named here */
const canFile = it => !!(it && (CAN_FILE[it.type] || specOf(it).fileable));
function entryName(it){
  const own = specOf(it).label;                    // a feature may name itself
  if(own) return own(it);
  if(it.type === 'folder') return it.cap || it.name || 'Folder';
  if(it.type === 'deck') return it.cap || 'Flip cards';
  if(it.name) return it.name;
  if(it.type === 'image') return 'picture';
  if(it.type === 'model') return '3D model';
  if(it.type === 'video')
    return it.vkind === 'yt' ? 'YouTube video' : it.vkind === 'vimeo' ? 'Vimeo video' : 'video';
  return 'file';
}
/* what it weighs: pictures live in the item itself, everything else in the media store */
function entrySize(it){
  if(it.size) return it.size;
  if(it.type === 'image' && it.src) return Math.round((it.src.length - it.src.indexOf(',') - 1) * 0.75);
  if(it.type === 'folder') return kidsOf(it).reduce((n, k) => n + entrySize(k), 0);
  if(it.type === 'deck') return deckMedia(it).reduce((n, r) => n + entrySize(r), 0);
  return 0;
}
function entryMeta(it){
  const own = specOf(it).meta;                     // …and say what it is worth saying about it
  if(own) return own(it);
  const b = [], k = kidsOf(it).length;
  if(it.type === 'folder') b.push(k ? k + ' item' + (k === 1 ? '' : 's') : 'empty');
  if(it.type === 'deck'){
    const n = cardsOf(it).length, s = deckStats(it);
    b.push(n ? n + ' card' + (n === 1 ? '' : 's') : 'no cards');
    if(s.done) b.push(s.right + '/' + s.done + ' right');
  }
  if(it.pages) b.push(it.pages + ' page' + (it.pages > 1 ? 's' : ''));
  if(it.type === 'model' && it.tris) b.push(it.tris.toLocaleString() + ' tris');
  if(it.vkind === 'yt') b.push('YouTube'); else if(it.vkind === 'vimeo') b.push('Vimeo');
  const s = entrySize(it);
  if(s) b.push(fmtBytes(s));
  return b.join(' · ');
}
/* A folder always says what it holds — in an exported book that list is the only
   way anyone can tell, since nothing over there opens. */
function iconTitle(it, live){
  if(it.type !== 'folder') return entryName(it) + (live ? ' — click to open · ctrl+hover to peek' : '');
  const k = kidsOf(it);
  return entryName(it) + ' — ' + (k.length
    ? k.length + ' item' + (k.length === 1 ? '' : 's') + ': ' +
      k.slice(0, 6).map(entryName).join(', ') + (k.length > 6 ? '…' : '')
    : 'empty') + (live ? ' · click to open' : '');
}
/* a model that has never been on a page has no still yet — pose one for its icon */
function posePoster(it){
  if(it.type !== 'model' || it.poster || !it.media) return Promise.resolve(false);
  return Promise.all([getMesh(it.media), getMats(it)]).then(([m, mt]) => {
    if(!m) return false;
    const src = GLR.draw(m, 400, 300, mdlOpts(it, mt));
    if(!src) return false;
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    c.getContext('2d').drawImage(src, 0, 0);
    try{ it.poster = c.toDataURL('image/png'); }catch(e){ return false; }
    if(it.tris !== m.tris) it.tris = m.tris;
    return true;
  });
}

/* ---- making one ---- */
function dropLinks(page, id){
  if(page.links) page.links = page.links.filter(l => l.a !== id && l.b !== id);
  if(index && index.xlinks && index.xlinks.some(x => x.a === id || x.b === id)){
    index.xlinks = index.xlinks.filter(x => x.a !== id && x.b !== id);
    queueIndex();
  }
}
/* Two things dropped on top of each other become a folder holding both. A folder
   in the mix always survives, so it keeps the name you gave it, and folders stay
   one level deep — a folder is a tray, not a tree. */
function foldMerge(page, drag, target){
  const eat = x => { dropLinks(page, x.id); page.items = page.items.filter(y => y.id !== x.id); };
  if(target.type === 'folder'){
    target.kids = kidsOf(target).concat(drag.type === 'folder' ? kidsOf(drag) : [drag]);
    eat(drag);
  }else if(drag.type === 'folder'){
    drag.kids = kidsOf(drag).concat([target]);     // the folder itself stays, where it was dropped
    eat(target);
  }else{
    page.items.push({ id: uid(), type:'folder', x: target.x, y: target.y,
      w: target.type === 'file' ? target.w : 13, rot: target.rot || 0,
      z: maxZ(page) + 1, lay: target.lay, cap: 'Folder', kids: [target, drag] });
    eat(target); eat(drag);
  }
  queueSave(page.id); SND.plop();
}

/* ---- the window it opens into ---- */
let foldOpen = null;                               // {it, page} while a folder is open
function openFolder(it, page){
  it.kids = kidsOf(it);
  foldOpen = { it, page: page || activePage() };
  renderFolder();
  /* models that came in as files have never posed for a still — do it now */
  Promise.all(it.kids.map(posePoster)).then(got => {
    if(!got.some(Boolean) || !foldOpen || foldOpen.it !== it) return;
    queueSave(foldOpen.page.id); renderFolder();
  });
}
function closeFolder(){
  if(!foldOpen) return false;
  foldOpen = null;
  const v = $('#fold');
  v.classList.remove('on'); v.innerHTML = '';
  hidePeek();
  return true;
}
function renderFolder(){
  if(!foldOpen) return;
  const it = foldOpen.it, kids = kidsOf(it), v = $('#fold');
  const body = winShell(v, entryName(it), entryMeta(it), [
    { a:'add', g:'+', t:'Put a file in this folder' }, CLOSE_BTN], 'fgrid');
  if(!kids.length)
    body.innerHTML = '<div class="fempty">Empty — drop files in here, or drag something on top of the folder.</div>';
  kids.forEach((k, i) => {
    const t = document.createElement('div');
    t.className = 'ftile'; t.dataset.i = i;
    t.innerHTML = '<div class="ficon" title="' + esc(iconTitle(k, true)) + '">' + itemGlyph(k) + '</div>' +
      '<span class="fnm2"></span>' +
      '<span class="tacts"><button data-a="out" title="Put this back on the page">↥</button>' +
      '<button data-a="del" title="Delete it from the book">✕</button></span>';
    t.querySelector('.fnm2').textContent = entryName(k);
    body.appendChild(t);
    armPeek(t.querySelector('.ficon'), k);
  });
  body.addEventListener('click', e => {
    const tile = e.target.closest('.ftile');
    if(!tile) return;
    const i = +tile.dataset.i, b = e.target.closest('button[data-a]');
    if(b) e.stopPropagation();
    if(b && b.dataset.a === 'out') foldOut(i);
    else if(b && b.dataset.a === 'del') foldDel(i);
    else { hidePeek(); openEntry(kidsOf(foldOpen.it)[i], foldOpen.page); }
  });
  body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('over'); });
  body.addEventListener('dragleave', e => { if(e.target === body) body.classList.remove('over'); });
  body.addEventListener('drop', e => {
    e.preventDefault(); body.classList.remove('over');
    const fs = [...(e.dataTransfer.files || [])];
    if(fs.length) intoFolder(fs);
  });
  winActs(v, a => { if(a === 'close') closeFolder(); else $('#foldInput').click(); });
}
$('#fold').addEventListener('pointerdown', e => { if(e.target === e.currentTarget) closeFolder(); });
$('#foldInput').addEventListener('change', e => {
  if(e.target.files.length) intoFolder([...e.target.files]);
  e.target.value = '';
});
/* files land in a folder the same way they land on a page — a picture is still a
   picture in here, an .obj with its .mtl is still a model */
async function intoFolder(files){
  if(!foldOpen) return;
  const it = foldOpen.it, page = foldOpen.page;
  const all = [].concat(files || []).filter(Boolean);
  const recs = [];
  if(all.some(f => /\.obj$/i.test(f.name))){
    const r = await modelRecord(all);
    if(r) recs.push(r);
  }else for(const f of all){
    const r = /^image\//.test(f.type) ? await imageRecord(f)
            : /^video\//.test(f.type) ? await videoRecord(f)
            : await attachRecord(f);
    if(r) recs.push(r);
  }
  if(!recs.length || !foldOpen || foldOpen.it !== it) return;
  it.kids = kidsOf(it).concat(recs);
  queueSave(page.id); SND.plop();
  openFolder(it, page); render();
}
function foldOut(i){                               /* back onto the page, its old self again */
  const it = foldOpen.it, page = foldOpen.page;
  const e = kidsOf(it).splice(i, 1)[0];
  if(!e) return;
  e.x = clamp((it.x || 0) + 5 + (i % 3) * 4, -8, 92);
  e.y = clamp((it.y || 0) + 9 + Math.floor(i / 3) * 4, -2, 90);
  e.z = maxZ(page) + 1;
  e.lay = e.lay || it.lay;
  if(e.rot == null) e.rot = 0;
  if(!e.w) e.w = e.type === 'file' ? 13 : e.type === 'image' ? 42 : e.type === 'video' ? 52
              : e.type === 'deck' ? 52 : 44;
  page.items.push(e);
  queueSave(page.id); SND.plop();
  renderFolder(); render();
}
function foldDel(i){
  const it = foldOpen.it, page = foldOpen.page;
  const e = kidsOf(it)[i];
  if(!e) return;
  if(kidsOf(e).length &&
     !confirm('Delete "' + entryName(e) + '" and the ' + kidsOf(e).length + ' things in it?')) return;
  it.kids.splice(i, 1);
  mediaIds(e).forEach(dropMedia);
  queueSave(page.id); SND.pluck();
  renderFolder(); render();
}

/* ---- opening what is in there ---- */
function openEntry(e, page){
  if(!e) return;
  const own = specOf(e).open;                    // a feature may open its own window
  if(own) return void own(e, page);
  if(e.type === 'deck') return void openScope(e, page);   // a deck opens where you study it
  if(e.type === 'folder') return openFolder(e, page);
  if(e.type === 'image') return openPicView(e);
  if(e.type === 'video') return openVidView(e);
  if(e.type === 'model') return openMdlView(e, page);
  openAttachment(e);
}
function openPicView(it){
  const v = $('#fview');
  const body = winShell(v, entryName(it), entryMeta(it), [
    { a:'save', g:'⤓', t:'Save a copy' }, CLOSE_BTN], 'fplate');
  const im = document.createElement('img');
  im.alt = entryName(it); im.src = it.src || '';
  body.appendChild(im);
  winActs(v, a => { if(a === 'close') closeViewer(); else saveAttachment(it, it.src || ''); });
}
function openVidView(it){
  const v = $('#fview');
  const btns = it.media ? [{ a:'save', g:'⤓', t:'Save a copy' }, CLOSE_BTN] : [CLOSE_BTN];
  const body = winShell(v, entryName(it), entryMeta(it), btns, 'fplate');
  if(it.vkind === 'yt' || it.vkind === 'vimeo'){
    const f = document.createElement('iframe');
    f.src = it.vkind === 'yt' ? 'https://www.youtube-nocookie.com/embed/' + it.vid + '?rel=0'
                              : 'https://player.vimeo.com/video/' + it.vid;
    f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    f.setAttribute('allowfullscreen', '');
    body.appendChild(f);
  }else{
    const el = document.createElement('video');
    el.controls = true;
    body.appendChild(el);
    withMediaURL(it, u => { el.src = u; });
  }
  winActs(v, a => {
    if(a === 'close') closeViewer();
    else withMediaURL(it, u => saveAttachment(it, u));
  });
}
/* the same live model as on the page, in a window big enough to turn it around */
function openMdlView(it, page){
  const v = $('#fview');
  const body = winShell(v, entryName(it), entryMeta(it), [
    { a:'home', g:'⌂', t:'Back to the starting view' }, CLOSE_BTN], 'fmdl');
  body.innerHTML = '<div class="mwrap"><canvas class="mv"></canvas></div>';
  const save = () => { if(page) queueSave(page.id); };
  let mesh = null, mats = null;
  const draw = () => paintModel(body, it, mesh, mats);
  mdlNote(body.querySelector('canvas.mv'), 'reading ' + entryName(it) + '…');
  Promise.all([getMesh(it.media), getMats(it)]).then(([m, mt]) => {
    if(!v.classList.contains('on')) return;
    mesh = m; mats = mt;
    if(m){
      const bits = [m.tris.toLocaleString() + ' tris'];
      if(matCount(mt)) bits.push(matCount(mt) + ' mat' + (matCount(mt) > 1 ? 's' : '') +
                                 (texCount(mt) ? ', ' + texCount(mt) + ' tex' : ''));
      v.querySelector('.fmeta').textContent = bits.join(' · ');
      if(it.tris !== m.tris){ it.tris = m.tris; save(); }
    }
    draw();
  });
  const cv = body.querySelector('canvas.mv');
  cv.addEventListener('pointerdown', e => {
    if(!mesh) return;
    e.preventDefault();
    const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
    const y0 = it.yaw || 0, p0 = it.pitch || 0;
    try{ cv.setPointerCapture(pid); }catch(err){}
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      it.yaw = y0 + (ev.clientX - sx) * 0.011;
      it.pitch = clamp(p0 + (ev.clientY - sy) * 0.011, -1.5, 1.5);
      draw();
    };
    const up = () => {
      cv.removeEventListener('pointermove', mv);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      save();
    };
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  });
  cv.addEventListener('wheel', e => {
    if(!mesh) return;
    e.preventDefault();
    it.dist = clamp((it.dist || MDL_HOME.dist) * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 1.3, 18);
    draw(); save();
  }, { passive: false });
  const home = () => { it.yaw = MDL_HOME.yaw; it.pitch = MDL_HOME.pitch; it.dist = MDL_HOME.dist; draw(); save(); };
  cv.addEventListener('dblclick', home);
  winActs(v, a => { if(a === 'close') closeViewer(); else home(); });
  const onSize = () => draw();
  window.addEventListener('resize', onSize);
  viewStop = () => window.removeEventListener('resize', onSize);
  requestAnimationFrame(draw);                     // once the window has its real size
}

/* ---- video ---- */

defineItem('folder', {
  add: { folder: base => ({ ...base, type:'folder', w:13, cap:'Folder', kids:[],
                            rot: 0 }) },
  html: (it, c) => shortcutHTML(it, c, true),
  /* what it holds owns media of its own, and goes with it when it is deleted,
     backed up or restored */
  parts: it => kidsOf(it),
  tools(mk, it, el, page){ mk('⊞', 'Open this folder', () => openFolder(it, page)); },
  wire(el, it, page){ wireIcon(el, it, page); }
});

/* ---- how it looks ---- */
addCSS('folder', `
/* the count belongs on the folder's own front, not hanging off the corner */
.fbadge.fcount{left:auto;right:7%;bottom:13%;width:25%;height:19%;font-size:calc(var(--scale)*11px)}
/* drop one thing on another and they file themselves together */
.item.dragging{pointer-events:none}
.item.dropinto .body{box-shadow:0 0 0 2px var(--accent),0 0 0 calc(var(--scale)*7px) color-mix(in srgb,var(--accent) 28%,transparent)}
.item.dropinto .ficon{transform:translateY(calc(var(--scale)*-3px)) scale(1.07)}
/* a picture or a video gets the same window, on a dark mount */
.fview .fbody.fplate{background:#111;display:grid;place-items:center;overflow:auto}
.fview .fbody.fplate img,.fview .fbody.fplate video{max-width:100%;max-height:100%;display:block;background:#000}
.fview .fbody.fplate iframe{width:100%;height:auto;max-height:100%;aspect-ratio:16/9;background:#000}
/* a model gets the live one, big enough to turn around in */
.fview .fbody.fmdl{background:linear-gradient(180deg,color-mix(in srgb,var(--paper) 93%,var(--ink)),color-mix(in srgb,var(--paper) 74%,var(--ink)))}
.fview .fbody.fmdl .mwrap{aspect-ratio:auto;width:100%;height:100%}
.fview .fbody.fmdl canvas{width:100%;height:100%;cursor:grab}
.fview .fbody.fmdl canvas:active{cursor:grabbing}
/* the folder window: what it holds, laid out like a desktop */
.fview.foldview{z-index:94}
/* as tall as what it holds, up to a point — an almost-empty folder is a small window */
.foldview .fwin{width:min(760px,88vw);height:auto;min-height:180px;max-height:min(600px,82vh)}
.fview .fbody.fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:5px;
  align-content:start;overflow:auto;padding:12px;
  background:linear-gradient(180deg,color-mix(in srgb,var(--paper) 93%,var(--ink)),color-mix(in srgb,var(--paper) 80%,var(--ink)))}
.fview .fbody.fgrid.over{outline:2px dashed var(--accent);outline-offset:-7px}
.ftile{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;
  padding:9px 5px 8px;cursor:pointer;border:1px solid transparent}
.ftile:hover{background:color-mix(in srgb,var(--accent2) 15%,transparent);
  border-color:color-mix(in srgb,var(--accent2) 45%,transparent)}
.ftile .ficon{width:58px;height:auto}
.ftile .fnm2{font-family:var(--mono);font-size:10px;line-height:1.3;text-align:center;color:var(--ink);
  overflow-wrap:anywhere;max-height:2.7em;overflow:hidden}
.ftile .tacts{position:absolute;top:2px;right:2px;display:none;gap:2px}
.ftile:hover .tacts{display:flex}
.ftile .tacts button{width:19px;height:16px;display:grid;place-items:center;font-family:var(--mono);
  font-size:10px;line-height:1;color:var(--ink);background:var(--wf);
  box-shadow:inset 1.4px 1.4px 0 var(--wl),inset -1.4px -1.4px 0 var(--wd)}
.ftile .tacts button:hover{background:var(--accent);color:#fff}
.fempty{grid-column:1/-1;padding:40px 20px;text-align:center;font-family:var(--mono);font-size:11px;
  letter-spacing:.06em;line-height:1.7;color:var(--soft)}
`);
/* its tile in the palette */
defineTool({ kind:'folder', cat:'media', label:'Folder', icon:'folder', order:50,
  hint:'A tray for files, pictures, video and models — or drag two things together' });
