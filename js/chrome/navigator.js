/* Open Note — chrome/navigator.js
   the file explorer — notebooks, canvases, Markdown and imported files */

/* ================= library shape =================
   `books` remains the stored name for canvas notes so existing libraries keep
   working. The explorer adds two sibling collections: notebooks are folders,
   and files are either editable Markdown or blobs in the existing media store. */
let navActive = null;                    // { kind:'canvas'|'markdown'|'asset', id }
let navFolder = null;                    // where the next thing is created
let navMdId = null;
let navMdMode = 'write';
let navPreviewTimer = 0;
let navImportBusy = false;
let navImportParent = null;
let navNameResolve = null;
let navContext = null;                   // { kind:'root'|'folder'|…, id }
const NAV_EXPANDED = new Set();
const NAV_MD_THEMES = new Set(['canvas','graph','dark','blue','kraft']);

function navNormalizeLibrary(){
  if(!lib) return false;
  let changed = false;
  if(!Array.isArray(lib.notebooks)){ lib.notebooks = []; changed = true; }
  if(!Array.isArray(lib.files)){ lib.files = []; changed = true; }
  for(const b of lib.books || []) if(b.parentId === undefined){ b.parentId = null; changed = true; }
  for(const f of lib.files) if(f.parentId === undefined){ f.parentId = null; changed = true; }
  for(const f of lib.notebooks) if(f.parentId === undefined){ f.parentId = null; changed = true; }

  /* A hand-edited backup can point a folder at itself, at nowhere, or into a
     cycle. Put only the broken link at root; never make the whole tree vanish. */
  const ids = new Set(lib.notebooks.map(f => f.id));
  for(const f of lib.notebooks){
    if(f.parentId && !ids.has(f.parentId)){ f.parentId = null; changed = true; continue; }
    const seen = new Set([f.id]);
    let at = f.parentId;
    while(at){
      if(seen.has(at)){ f.parentId = null; changed = true; break; }
      seen.add(at);
      const p = lib.notebooks.find(x => x.id === at);
      at = p && p.parentId;
    }
  }
  return changed;
}

function navFolderById(id){ return id && lib.notebooks.find(f => f.id === id); }
function navFileById(id){ return id && lib.files.find(f => f.id === id); }
function navBookById(id){ return id && lib.books.find(b => b.id === id); }
function navEntry(kind, id){
  if(kind === 'folder') return navFolderById(id);
  if(kind === 'canvas') return navBookById(id);
  return navFileById(id);
}
function navParentOf(kind, id){ const e = navEntry(kind, id); return e ? e.parentId || null : null; }
function navExt(name){ return ((String(name || '').match(/\.([a-z0-9]{1,8})$/i) || ['', ''])[1] || '').toLowerCase(); }
function navAssetType(f){
  const x = navExt(f && f.name);
  if(f && f.itemType === 'fits' || /^(fits|fit|fts|fz)$/.test(x)) return 'fits';
  if(f && f.openKind === 'pdf' || x === 'pdf') return 'pdf';
  if(/^(xlsx|xlsm|ods|csv|tsv|tab)$/.test(x)) return 'table';
  if(/^(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/.test(x)) return 'image';
  if(/^(mp4|webm|mov|m4v|ogv)$/.test(x)) return 'video';
  if(/^(pptx|pptm|ppt)$/.test(x)) return 'slides';
  if(/^(json|txt|log|xml|yaml|yml)$/.test(x)) return 'text';
  return 'asset';
}
function navKindLabel(kind, e){
  if(kind === 'folder') return 'Folder';
  if(kind === 'canvas') return 'Canvas note';
  if(kind === 'markdown') return 'Markdown file';
  const t = navAssetType(e);
  return t === 'table' ? 'Table' : t === 'fits' ? 'FITS file' : t === 'pdf' ? 'PDF' : 'File';
}

function navPathParts(parentId){
  const out = [], seen = new Set();
  let at = parentId;
  while(at && !seen.has(at)){
    seen.add(at);
    const f = navFolderById(at);
    if(!f) break;
    out.unshift(f.name || 'Untitled folder');
    at = f.parentId;
  }
  return out;
}
function navPathFor(kind, id){
  const e = navEntry(kind, id);
  const parts = navPathParts(e && e.parentId);
  if(e) parts.push(e.name || (kind === 'folder' ? 'Untitled folder' : 'Untitled'));
  return parts;
}
function navCurrentPath(){
  if(navActive && navEntry(navActive.kind, navActive.id)) return navPathFor(navActive.kind, navActive.id);
  if(curNoteId && navBookById(curNoteId)) return navPathFor('canvas', curNoteId);
  return [];
}
function navSetDocumentTitle(){
  const p = navCurrentPath();
  document.title = p.length ? p[p.length - 1] + ' — Open Note' : 'Open Note';
}

/* ================= panel state ================= */
function navSetOpen(on, remember){
  document.body.classList.toggle('nav-open', !!on);
  $('#navBtn').classList.toggle('on', !!on);
  $('#navBtn').setAttribute('aria-pressed', String(!!on));
  $('#navigator').setAttribute('aria-hidden', String(!on));
  if(remember !== false) try{ localStorage.setItem('dsk.navigator', on ? '1' : '0'); }catch(e){}
  requestAnimationFrame(refit);
}
function navInitialOpen(){
  let got = null;
  try{ got = localStorage.getItem('dsk.navigator'); }catch(e){}
  /* Start with the canvas exactly where existing users left it. The Files
     button is always visible, and from the first choice onward the panel keeps
     that choice. This also avoids surprising a small desktop window. */
  return got == null ? false : got === '1';
}
function navToggle(){ navSetOpen(!document.body.classList.contains('nav-open')); }

/* ================= tree ================= */
function navLoadExpanded(){
  try{ (JSON.parse(localStorage.getItem('dsk.nav.expanded') || '[]') || []).forEach(id => NAV_EXPANDED.add(id)); }
  catch(e){}
}
function navSaveExpanded(){
  try{ localStorage.setItem('dsk.nav.expanded', JSON.stringify([...NAV_EXPANDED])); }catch(e){}
}
function navRevealFolder(id){
  let at = id;
  while(at){
    NAV_EXPANDED.add(at);
    const folder = navFolderById(at); at = folder && folder.parentId;
  }
  navSaveExpanded();
}
function navAllAt(parentId){
  const out = [];
  for(const f of lib.notebooks) if((f.parentId || null) === (parentId || null)) out.push({ kind:'folder', data:f });
  for(const b of lib.books) if((b.parentId || null) === (parentId || null)) out.push({ kind:'canvas', data:b });
  for(const f of lib.files) if((f.parentId || null) === (parentId || null))
    out.push({ kind:f.kind === 'markdown' ? 'markdown' : 'asset', data:f });
  return out.sort((a, b) => {
    if((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
    return String(a.data.name || '').localeCompare(String(b.data.name || ''), undefined,
      { numeric:true, sensitivity:'base' });
  });
}
function navHasMatch(folderId, q){
  for(const e of navAllAt(folderId)){
    const text = navPathFor(e.kind, e.data.id).join(' / ').toLowerCase();
    if(text.includes(q) || e.kind === 'folder' && navHasMatch(e.data.id, q)) return true;
  }
  return false;
}
function navGlyph(kind, e, open){
  if(kind === 'folder') return '';
  if(kind === 'canvas') return '<span class="nav-glyph canvas" aria-hidden="true">∞</span>';
  if(kind === 'markdown') return '<span class="nav-glyph md" aria-hidden="true">M<span>↓</span></span>';
  const type = navAssetType(e), x = navExt(e.name).slice(0, 4).toUpperCase() || 'FILE';
  const mark = type === 'fits' ? '✦' : type === 'table' ? '▦' : type === 'image' ? '▧' : type === 'video' ? '▷' : '';
  return '<span class="nav-glyph file ' + type + '" aria-hidden="true"><i>' + (mark || esc(x)) + '</i></span>';
}
function navIsActive(kind, id){ return !!navActive && navActive.kind === kind && navActive.id === id; }
function navFolderContains(folderId, maybeChild){
  let at = maybeChild;
  const seen = new Set();
  while(at && !seen.has(at)){
    if(at === folderId) return true;
    seen.add(at);
    const f = navFolderById(at);
    at = f && f.parentId;
  }
  return false;
}

function navMakeRow(kind, e, depth, query){
  const isFolder = kind === 'folder';
  const expanded = isFolder && (query || NAV_EXPANDED.has(e.id));
  const row = document.createElement('div');
  row.className = 'nav-row' + (navIsActive(kind, e.id) ? ' active' : '');
  row.style.setProperty('--depth', depth);
  row.dataset.kind = kind; row.dataset.id = e.id;
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-level', String(depth + 1));
  if(isFolder) row.setAttribute('aria-expanded', String(!!expanded));
  row.draggable = true;
  row.title = navPathFor(kind, e.id).join(' / ') + ' · ' + navKindLabel(kind, e);
  row.innerHTML = (isFolder
      ? '<button class="nav-twist' + (expanded ? ' expanded' : '') + '" aria-label="' +
        (expanded ? 'Collapse' : 'Expand') + ' folder">&gt;</button>'
      : '<span class="nav-twist"></span>') +
    navGlyph(kind, e, expanded) + '<button class="nav-row-main"><span class="nav-row-name"></span></button>' +
    '<span class="nav-row-acts"><button data-act="rename" title="Rename" aria-label="Rename">✎</button>' +
    '<button data-act="delete" title="Delete" aria-label="Delete">✕</button></span>';
  row.querySelector('.nav-row-name').textContent = e.name || (isFolder ? 'Untitled folder' : 'Untitled');

  const open = () => {
    if(isFolder){
      navFolder = e.id;
      if(NAV_EXPANDED.has(e.id)) NAV_EXPANDED.delete(e.id); else NAV_EXPANDED.add(e.id);
      navSaveExpanded(); navRender();
      return;
    }
    if(kind === 'canvas') openNote(e.id);
    else if(kind === 'markdown') navOpenMarkdown(e.id);
    else navOpenAsset(e.id);
    if(innerWidth <= 900) navSetOpen(false);
  };
  row.querySelector('.nav-row-main').addEventListener('click', open);
  const twist = row.querySelector('button.nav-twist');
  if(twist) twist.addEventListener('click', ev => { ev.stopPropagation(); open(); });
  row.querySelector('[data-act="rename"]').addEventListener('click', ev => { ev.stopPropagation(); navRename(kind, e.id); });
  row.querySelector('[data-act="delete"]').addEventListener('click', ev => { ev.stopPropagation(); navDelete(kind, e.id); });
  row.addEventListener('contextmenu', ev => navOpenContext(ev, kind, e.id));

  row.addEventListener('dragstart', ev => {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/x-open-note-entry', JSON.stringify({ kind, id:e.id }));
    ev.dataTransfer.setData('text/plain', e.name || 'Untitled');
    row.classList.add('dragging'); document.body.classList.add('nav-dragging');
  });
  row.addEventListener('dragend', () => { row.classList.remove('dragging'); document.body.classList.remove('nav-dragging'); });
  if(isFolder){
    row.addEventListener('dragover', ev => { ev.preventDefault(); ev.stopPropagation(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', ev => { ev.preventDefault(); ev.stopPropagation(); row.classList.remove('drag-over'); navDrop(ev, e.id); });
  }
  return { row, expanded };
}

function navAppendLevel(host, parentId, depth, query){
  let added = 0;
  for(const ent of navAllAt(parentId)){
    if(query){
      const own = navPathFor(ent.kind, ent.data.id).join(' / ').toLowerCase().includes(query);
      if(!own && !(ent.kind === 'folder' && navHasMatch(ent.data.id, query))) continue;
    }
    const made = navMakeRow(ent.kind, ent.data, depth, query);
    host.appendChild(made.row); added++;
    if(ent.kind === 'folder' && made.expanded) added += navAppendLevel(host, ent.data.id, depth + 1, query);
  }
  return added;
}
function navRender(){
  if(!lib) return;
  navNormalizeLibrary();
  const tree = $('#navTree'), q = ($('#navSeek').value || '').trim().toLowerCase();
  tree.innerHTML = '';
  const added = navAppendLevel(tree, null, 0, q);
  if(!added){
    const empty = document.createElement('div'); empty.className = 'nav-empty';
    empty.textContent = q ? 'No files match “' + $('#navSeek').value.trim() + '”.' : 'Your library is empty.';
    tree.appendChild(empty);
  }
  const count = lib.books.length + lib.files.length;
  $('#navCount').textContent = count + ' file' + (count === 1 ? '' : 's');
  navSetDocumentTitle();
}

/* ================= create, move, rename, delete ================= */
function navUniqueName(wanted, parentId, kind, skipId){
  const pool = kind === 'folder' ? lib.notebooks : kind === 'canvas' ? lib.books : lib.files;
  const used = new Set(pool.filter(e => e.id !== skipId && (e.parentId || null) === (parentId || null))
    .map(e => String(e.name || '').toLowerCase()));
  if(!used.has(wanted.toLowerCase())) return wanted;
  const m = /^(.*?)(\.[^.]+)?$/.exec(wanted), stem = m[1], ext = m[2] || '';
  let n = 2;
  while(used.has((stem + ' ' + n + ext).toLowerCase())) n++;
  return stem + ' ' + n + ext;
}
function navFinishName(value){
  if(!navNameResolve) return;
  const done = navNameResolve; navNameResolve = null;
  $('#navNameBox').hidden = true;
  done(value == null ? null : String(value).trim());
}
function navAskName(label, initial, action){
  if(navNameResolve) navFinishName(null);
  $('#navNameLabel').textContent = label;
  $('#navNameSave').textContent = action || 'Create';
  $('#navNameInput').value = initial || '';
  $('#navNameBox').hidden = false;
  requestAnimationFrame(() => { $('#navNameInput').focus(); $('#navNameInput').select(); });
  return new Promise(res => { navNameResolve = res; });
}
async function navCreateFolder(parentId = navFolder){
  let name = await navAskName('Folder name', 'New folder', 'Create');
  if(!name) return;
  name = navUniqueName(name, parentId, 'folder');
  const f = { id:uid(), name, parentId:parentId || null, created:Date.now(), updated:Date.now() };
  lib.notebooks.push(f); navRevealFolder(parentId); NAV_EXPANDED.add(f.id); navFolder = f.id;
  queueLib(); navSaveExpanded(); navRender();
}
async function navCreateMarkdown(parentId = navFolder){
  let name = await navAskName('Markdown file name', 'Untitled.md', 'Create');
  if(!name) return;
  if(!/\.md$/i.test(name)) name += '.md';
  name = navUniqueName(name, parentId, 'markdown');
  const f = { id:uid(), kind:'markdown', name, parentId:parentId || null, theme:'canvas',
    content:'', created:Date.now(), updated:Date.now() };
  lib.files.push(f); navRevealFolder(parentId); queueLib(); navRender(); await navOpenMarkdown(f.id, true);
}
async function navCreateCanvas(parentId = navFolder){
  let name = await navAskName('Canvas name', 'Untitled canvas', 'Create');
  if(!name) return;
  name = navUniqueName(name, parentId, 'canvas');
  const id = await createNote(name), b = navBookById(id);
  if(b) b.parentId = parentId || null;
  navRevealFolder(parentId);
  await kvSet(K_LIB, lib);
  await openNote(id);
}
async function navRename(kind, id){
  const e = navEntry(kind, id); if(!e) return;
  let name = await navAskName('Rename ' + navKindLabel(kind, e).toLowerCase(), e.name || 'Untitled', 'Rename');
  if(!name) return;
  if(kind === 'markdown' && !/\.md$/i.test(name)) name += '.md';
  name = navUniqueName(name, e.parentId || null, kind, id);
  e.name = name; e.updated = Date.now(); queueLib();
  if(kind === 'markdown' && navMdId === id) $('#mdName').value = name;
  navRender();
  if($('#shelf').classList.contains('open')) buildShelf();
}
async function navDelete(kind, id){
  const e = navEntry(kind, id); if(!e) return;
  if(kind === 'folder'){
    const n = navAllAt(id).length;
    if(!confirm('Delete folder “' + (e.name || 'Untitled') + '”? ' +
      (n ? 'Its ' + n + ' direct item' + (n === 1 ? '' : 's') + ' will move up one level.' : 'It is empty.'))) return;
    const up = e.parentId || null;
    lib.notebooks.filter(x => x.parentId === id).forEach(x => { x.parentId = up; });
    lib.books.filter(x => x.parentId === id).forEach(x => { x.parentId = up; });
    lib.files.filter(x => x.parentId === id).forEach(x => { x.parentId = up; });
    lib.notebooks = lib.notebooks.filter(x => x.id !== id);
    NAV_EXPANDED.delete(id); if(navFolder === id) navFolder = up;
    queueLib(); navSaveExpanded(); navRender(); return;
  }
  const message = kind === 'canvas'
    ? 'Delete “' + (e.name || 'this canvas') + '” and everything on it? This cannot be undone.'
    : 'Delete “' + (e.name || 'this file') + '” from the library? This cannot be undone.';
  if(!confirm(message)) return;
  const wasActive = navIsActive(kind, id);
  if(kind === 'canvas') await deleteNote(id);
  else{
    if(kind === 'asset' && e.media){ await mediaDel(e.media); dropMedia(e.media); }
    lib.files = lib.files.filter(x => x.id !== id);
    await kvSet(K_LIB, lib);
  }
  if(wasActive){
    if(kind === 'markdown') navLeaveMarkdown();
    if(kind === 'asset') closeViewer();
    navActive = null;
    await navOpenFallback();
  }
  navRender();
  if($('#shelf').classList.contains('open')) buildShelf();
}
async function navOpenFallback(){
  const b = lib.books[0];
  if(b) return openNote(b.id);
  const md = lib.files.find(f => f.kind === 'markdown');
  if(md) return navOpenMarkdown(md.id);
  return openNote(await createNote('My note'));
}
function navMove(kind, id, parentId){
  const e = navEntry(kind, id); if(!e || (e.parentId || null) === (parentId || null)) return;
  if(kind === 'folder' && navFolderContains(id, parentId)) return;
  e.parentId = parentId || null; e.updated = Date.now();
  navFolder = e.parentId;
  if(parentId) navRevealFolder(parentId);
  queueLib(); navRender(); return true;
}
function navDrop(ev, parentId){
  const files = [...(ev.dataTransfer.files || [])];
  if(files.length){ navFolder = parentId || null; navImportFiles(files, parentId || null); return; }
  try{
    const d = JSON.parse(ev.dataTransfer.getData('text/x-open-note-entry') || 'null');
    if(d && d.kind && d.id) navMove(d.kind, d.id, parentId || null);
  }catch(e){}
}

/* ================= contextual file actions ================= */
function navChooseImport(parentId = navFolder){
  navImportParent = parentId || null;
  $('#navFileInput').value = '';
  $('#navFileInput').click();
}
function navCloseContext(){
  navContext = null;
  const menu = $('#navMenu'); menu.hidden = true; menu.classList.remove('ready'); menu.innerHTML = '';
}
function navContextButton(cmd, icon, label, hint, danger){
  return '<button role="menuitem" data-nav-cmd="' + cmd + '"' + (danger ? ' class="danger"' : '') + '>' +
    '<span class="nav-menu-icon" aria-hidden="true">' + icon + '</span><span>' + label + '</span>' +
    (hint ? '<kbd>' + hint + '</kbd>' : '') + '</button>';
}
function navOpenContext(ev, kind, id){
  ev.preventDefault(); ev.stopPropagation();
  const menu = $('#navMenu'), parentId = kind === 'folder' ? id : null;
  navContext = { kind, id, parentId };
  let html = '';
  if(kind !== 'root') html += navContextButton('open', kind === 'folder' ? '▾' : '↗', kind === 'folder' ? 'Open folder' : 'Open', 'Enter');
  if(kind === 'root' || kind === 'folder'){
    if(html) html += '<div class="nav-menu-rule"></div>';
    html += navContextButton('new-md', '＋', 'New Markdown file', '') +
      navContextButton('new-canvas', '∞', 'New canvas', '') +
      navContextButton('new-folder', '▱', 'New folder', '') +
      navContextButton('import', '⇧', 'Import files here', '');
  }
  if(kind !== 'root'){
    html += '<div class="nav-menu-rule"></div>' + navContextButton('rename', '✎', 'Rename', '');
    if(navParentOf(kind, id)) html += navContextButton('move-root', '↰', 'Move to root', '');
    html += navContextButton('delete', '✕', 'Delete', '', true);
  }
  menu.innerHTML = html; menu.hidden = false;
  const box = menu.getBoundingClientRect();
  menu.style.left = clamp(ev.clientX, 8, Math.max(8, innerWidth - box.width - 8)) + 'px';
  menu.style.top = clamp(ev.clientY, 8, Math.max(8, innerHeight - box.height - 8)) + 'px';
  menu.style.setProperty('--ctx-x', clamp(ev.clientX - parseFloat(menu.style.left), 0, box.width) + 'px');
  menu.style.setProperty('--ctx-y', clamp(ev.clientY - parseFloat(menu.style.top), 0, box.height) + 'px');
  requestAnimationFrame(() => menu.classList.add('ready'));
}
async function navRunContext(cmd){
  const ctx = navContext;
  if(!ctx) return;
  navCloseContext();
  const parentId = ctx.kind === 'folder' ? ctx.id : null;
  if(cmd === 'new-md') return navCreateMarkdown(parentId);
  if(cmd === 'new-canvas') return navCreateCanvas(parentId);
  if(cmd === 'new-folder') return navCreateFolder(parentId);
  if(cmd === 'import') return navChooseImport(parentId);
  if(cmd === 'rename') return navRename(ctx.kind, ctx.id);
  if(cmd === 'move-root') return navMove(ctx.kind, ctx.id, null);
  if(cmd === 'delete') return navDelete(ctx.kind, ctx.id);
  if(cmd !== 'open') return;
  if(ctx.kind === 'folder'){
    navFolder = ctx.id; NAV_EXPANDED.add(ctx.id); navSaveExpanded(); navRender(); return;
  }
  if(ctx.kind === 'canvas') return openNote(ctx.id);
  if(ctx.kind === 'markdown') return navOpenMarkdown(ctx.id);
  return navOpenAsset(ctx.id);
}

/* ================= importing and opening files ================= */
async function navImportFiles(files, parentId){
  if(navImportBusy || !files || !files.length) return;
  navImportBusy = true;
  if(parentId) navRevealFolder(parentId);
  const made = [];
  try{
    for(const file of files){
      if(/\.md$/i.test(file.name || '')){
        const f = { id:uid(), kind:'markdown', name:navUniqueName(file.name, parentId, 'markdown'),
          parentId:parentId || null, content:await file.text(), created:Date.now(), updated:Date.now() };
        lib.files.push(f); made.push({ kind:'markdown', id:f.id }); continue;
      }
      let rec = null;
      if(typeof fitsIsFile === 'function' && fitsIsFile(file) && typeof ftRecord === 'function') rec = await ftRecord(file);
      else rec = await attachRecord(file);
      if(!rec) continue;
      const f = { id:uid(), kind:'asset', name:navUniqueName(file.name || 'file', parentId, 'asset'),
        parentId:parentId || null, media:rec.media, size:file.size, mime:file.type || '',
        itemType:rec.type || 'file', openKind:rec.kind || 'file', pages:rec.pages,
        hdus:rec.hdus, nh:rec.nh, created:Date.now(), updated:Date.now() };
      lib.files.push(f); made.push({ kind:'asset', id:f.id });
    }
    await kvSet(K_LIB, lib); navRender();
    if(made.length === 1){
      if(made[0].kind === 'markdown') await navOpenMarkdown(made[0].id);
      else await navOpenAsset(made[0].id);
    }
  }finally{ navImportBusy = false; $('#navFileInput').value = ''; }
}
function navAssetRecord(f){
  return { ...f, id:f.id, type:f.itemType || 'file', kind:f.openKind || 'file', cap:f.name };
}
async function navOpenWorkbook(f){
  const b = await mediaGet(f.media);
  if(!b){ alert('That file is not in the library any more.'); return; }
  let bk;
  try{ bk = await sheetRead(new File([b], f.name || 'table.csv', { type:f.mime || b.type || '' })); }
  catch(err){ alert('That table could not be read.\n\n' + ((err && err.message) || err)); return; }
  const sheets = bk.sheets.filter(s => s.rows.length);
  if(!sheets.length){ alert('There is nothing in ' + f.name + '.'); return; }
  const sh = sheets.length === 1 ? sheets[0] : await tbAskSheet(bk, sheets);
  if(!sh) return;
  const it = { id:uid(), type:'table', fs:13, rot:0, ts:'lines', cap:f.name,
    rows:[['']], cw:[1], al:['l'], col:1 };
  tbFill(it, sh, f.name);
  const page = sheet();
  if(page){
    openTable(it, page);
    const put = $('#fview [data-a="page"]'); if(put) put.remove();
    return;
  }
  /* A library can contain only Markdown and files after its last canvas was
     removed. The table is still readable then; it simply has no canvas to be
     unfolded onto or history to join. */
  it.vr = 0; it.vh = 24;
  const v = $('#fview'), body = winShell(v, tbName(it), tbMeta(it),
    [{ a:'csv', g:'⤓', t:'Save it as a .csv' }, CLOSE_BTN], 'tsheet');
  const w = tbWin(it);
  body.innerHTML = '<div class="tbl" data-ts="lines"><div class="tbox' + (w.on ? ' win' : '') + '">' +
    tbGridHTML(it, false) + '</div><div class="tfoot"><span class="tcount">' + esc(tbCountText(it)) +
    '</span><span class="tstat">library preview</span></div></div>';
  winActs(v, a => { if(a === 'csv') tbSaveCSV(it); else closeViewer(); });
}
async function navOpenAsset(id){
  const f = navFileById(id); if(!f || f.kind !== 'asset') return;
  navActive = { kind:'asset', id }; navFolder = f.parentId || null;
  navRender();
  const rec = navAssetRecord(f), type = navAssetType(f);
  if(type === 'fits') return ftOpen({ ...rec, type:'fits', hdus:f.hdus, nh:f.nh });
  if(type === 'table') return navOpenWorkbook(f);
  if(type === 'image') return withMediaURL(rec, url => openPicView({ ...rec, type:'image', src:url }));
  if(type === 'video') return openVidView({ ...rec, type:'video', vkind:'file' });
  openAttachment(rec);
}

/* ================= Markdown editor ================= */
function navMarkdownFile(){ return navFileById(navMdId); }
function navMarkdownStats(){
  const src = $('#mdSource').value || '';
  const words = (src.trim().match(/\S+/g) || []).length;
  $('#mdWords').textContent = words + ' word' + (words === 1 ? '' : 's') + ' · ' + src.length.toLocaleString() + ' characters';
}
function navMdInline(src){
  const code = [];
  let s = String(src || '').replace(/`([^`]+)`/g, (_, v) => '\u0000' + (code.push(v) - 1) + '\u0000');
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const u = href.replace(/&amp;/g, '&');
    return /^(https?:|mailto:|#)/i.test(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + label + '</a>' : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/__([^_]+)__/g, '<strong>$1</strong>')
       .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
       .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
       .replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const value = code[+i];
    return '<code class="tick" data-tick="' + esc('`' + value + '`') + '">' + esc(value) + '</code>';
  });
}
function navMarkdownHTML(source){
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  let out = '', para = [], list = '', quote = [], code = null, lang = '';
  const flushPara = () => { if(para.length){ out += '<p>' + navMdInline(para.join(' ')) + '</p>'; para = []; } };
  const flushList = () => { if(list){ out += '</' + list + '>'; list = ''; } };
  const flushQuote = () => { if(quote.length){ out += '<blockquote>' + navMdInline(quote.join(' ')) + '</blockquote>'; quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    if(code !== null){
      if(/^\s*```/.test(line)){ out += '<pre data-lang="' + esc(lang) + '"><code>' + esc(code.join('\n')) + '</code></pre>'; code = null; lang = ''; }
      else code.push(line);
      continue;
    }
    const fence = /^\s*```\s*([^\s]*)/.exec(line);
    if(fence){ flushAll(); code = []; lang = fence[1] || ''; continue; }
    if(!line.trim()){ flushAll(); continue; }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if(h){ flushAll(); const n = h[1].length; out += '<h' + n + '>' + navMdInline(h[2]) + '</h' + n + '>'; continue; }
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){ flushAll(); out += '<hr>'; continue; }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if(q){ flushPara(); flushList(); quote.push(q[1]); continue; }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if(task){ flushPara(); flushQuote(); if(list && list !== 'ul') flushList(); if(!list){ out += '<ul class="tasks">'; list = 'ul'; }
      out += '<li><input type="checkbox" data-md-task="' + i + '"' + (task[1].toLowerCase() === 'x' ? ' checked' : '') +
        ' aria-label="Mark task ' + (task[1].toLowerCase() === 'x' ? 'incomplete' : 'complete') + '"><span>' + navMdInline(task[2]) + '</span></li>'; continue; }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if(bullet){ flushPara(); flushQuote(); if(list && list !== 'ul') flushList(); if(!list){ out += '<ul>'; list = 'ul'; }
      out += '<li>' + navMdInline(bullet[1]) + '</li>'; continue; }
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if(num){ flushPara(); flushQuote(); if(list && list !== 'ol') flushList(); if(!list){ out += '<ol>'; list = 'ol'; }
      out += '<li>' + navMdInline(num[1]) + '</li>'; continue; }
    flushList(); flushQuote(); para.push(line.trim());
  }
  if(code !== null) out += '<pre data-lang="' + esc(lang) + '"><code>' + esc(code.join('\n')) + '</code></pre>';
  flushAll();
  return out || '<div class="md-preview-empty">Nothing to preview yet.</div>';
}
function navRenderMarkdownPreview(){
  const preview = $('#mdPreview');
  preview.innerHTML = navMarkdownHTML($('#mdSource').value);
  const pen = typeof codePen === 'function' && codePen();
  preview.querySelectorAll('pre[data-lang]').forEach(pre => {
    const lang = pre.dataset.lang || '', code = (pre.querySelector('code') || pre).textContent || '';
    if(!pen || !pen.node) return;
    const src = '```' + lang + '\n' + code + '\n```';
    const node = pen.node({ blk:true, src, lang, code }, true, preview);
    const scheme = node.querySelector('.csch'); if(scheme) scheme.remove();
    pre.replaceWith(node);
  });
  if(typeof mathify === 'function') mathify(preview);
}
function navQueueMarkdownPreview(){
  clearTimeout(navPreviewTimer);
  navPreviewTimer = setTimeout(() => { navPreviewTimer = 0; navRenderMarkdownPreview(); }, 100);
}

/* Editing stays in the textarea, so undo, copy/paste and the stored file remain
   ordinary Markdown. These helpers only write the same punctuation by hand. */
function navMdPut(from, to, text, pickA, pickB){
  const box = $('#mdSource');
  box.focus({ preventScroll:true });
  box.setRangeText(text, from, to, 'end');
  const a = pickA == null ? from + text.length : pickA;
  box.setSelectionRange(a, pickB == null ? a : pickB);
  box.dispatchEvent(new Event('input', { bubbles:true }));
}
function navMdWrap(open, close, placeholder){
  const box = $('#mdSource'), s = box.value;
  let a = box.selectionStart, b = box.selectionEnd, chosen = s.slice(a, b);
  close = close == null ? open : close;
  if(a >= open.length && s.slice(a - open.length, a) === open && s.slice(b, b + close.length) === close){
    navMdPut(a - open.length, b + close.length, chosen, a - open.length, b - open.length); return;
  }
  if(chosen.startsWith(open) && chosen.endsWith(close) && chosen.length >= open.length + close.length){
    const bare = chosen.slice(open.length, chosen.length - close.length);
    navMdPut(a, b, bare, a, a + bare.length); return;
  }
  if(!chosen){
    let l = a, r = a;
    while(l > 0 && /[\p{L}\p{N}_-]/u.test(s[l - 1])) l--;
    while(r < s.length && /[\p{L}\p{N}_-]/u.test(s[r])) r++;
    if(r > l){ a = l; b = r; chosen = s.slice(l, r); }
  }
  chosen = chosen || placeholder || '';
  const text = open + chosen + close, p = a + open.length;
  navMdPut(a, b, text, p, p + chosen.length);
}
function navMdPrefix(kind){
  const box = $('#mdSource'), s = box.value, a = box.selectionStart, b = box.selectionEnd;
  const from = s.lastIndexOf('\n', Math.max(0, a - 1)) + 1;
  let to = s.indexOf('\n', b); if(to < 0) to = s.length;
  const lines = s.slice(from, to).split('\n');
  const own = kind === 'heading' ? /^\s*##\s+/ : kind === 'task' ? /^\s*[-*+]\s+\[[ xX]\]\s+/ : /^\s*[-*+]\s+/;
  const allOwn = lines.every(line => own.test(line));
  const next = lines.map(line => {
    if(allOwn) return line.replace(own, '');
    const indent = (/^\s*/.exec(line) || [''])[0];
    const bare = line.slice(indent.length).replace(/^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '');
    const mark = kind === 'heading' ? '## ' : kind === 'task' ? '- [ ] ' : '- ';
    return indent + mark + bare;
  }).join('\n');
  navMdPut(from, to, next, from, from + next.length);
}
function navMdBlock(kind){
  const box = $('#mdSource'), s = box.value, a = box.selectionStart, b = box.selectionEnd;
  const chosen = s.slice(a, b), before = a && s[a - 1] !== '\n' ? '\n' : '', after = b < s.length && s[b] !== '\n' ? '\n' : '';
  if(kind === 'rule'){
    const text = before + '---\n' + after;
    navMdPut(a, b, text, a + text.length - after.length); return;
  }
  const fence = kind === 'mathblock' ? '$$' : '```';
  const text = before + fence + '\n' + chosen + '\n' + fence + after;
  const p = a + before.length + fence.length + 1;
  navMdPut(a, b, text, p, p + chosen.length);
}
function navMdAction(action){
  if(navMdMode !== 'write') navSetMarkdownMode('write');
  if(action === 'bold') return navMdWrap('**', '**', 'bold');
  if(action === 'italic') return navMdWrap('*', '*', 'italic');
  if(action === 'code') return navMdWrap('`', '`', 'code');
  if(action === 'math') return navMdWrap('$', '$', 'x');
  if(action === 'heading' || action === 'bullet' || action === 'task') return navMdPrefix(action);
  if(action === 'codeblock' || action === 'mathblock' || action === 'rule') return navMdBlock(action);
}
function navMdSmartEnter(e){
  const box = e.currentTarget;
  if(box.selectionStart !== box.selectionEnd) return false;
  const s = box.value, at = box.selectionStart, from = s.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
  const line = s.slice(from, at);
  let prefix = '', body = '';
  let m = /^(\s*[-*+]\s+\[[ xX]\]\s+)(.*)$/.exec(line);
  if(m){ prefix = m[1].replace(/\[[xX]\]/, '[ ]'); body = m[2]; }
  else if((m = /^(\s*[-*+]\s+)(.*)$/.exec(line))){ prefix = m[1]; body = m[2]; }
  else if((m = /^(\s*)(\d+)([.)]\s+)(.*)$/.exec(line))){ prefix = m[1] + (+m[2] + 1) + m[3]; body = m[4]; }
  else if((m = /^(\s*>\s?)(.*)$/.exec(line))){ prefix = m[1]; body = m[2]; }
  if(!prefix) return false;
  e.preventDefault();
  if(!body.trim()) navMdPut(from, at, '\n', from + 1);
  else navMdPut(at, at, '\n' + prefix, at + prefix.length + 1);
  return true;
}
function navMdIndent(e){
  const box = e.currentTarget, s = box.value, a = box.selectionStart, b = box.selectionEnd;
  const from = s.lastIndexOf('\n', Math.max(0, a - 1)) + 1;
  let to = s.indexOf('\n', b); if(to < 0) to = s.length;
  const block = s.slice(from, to), isBlock = a !== b || /^(\s*)(?:[-*+]\s+|\d+[.)]\s+|>\s?)/.test(block);
  if(!isBlock && !e.shiftKey){ e.preventDefault(); navMdPut(a, b, '  ', a + 2); return true; }
  if(!isBlock) return false;
  e.preventDefault();
  const next = block.split('\n').map(line => e.shiftKey ? line.replace(/^(?:  |\t)/, '') : '  ' + line).join('\n');
  navMdPut(from, to, next, from, from + next.length); return true;
}
function navToggleTask(line, checked){
  const box = $('#mdSource'), lines = box.value.replace(/\r\n?/g, '\n').split('\n');
  if(!lines[line]) return;
  lines[line] = lines[line].replace(/^(\s*[-*+]\s+)\[[ xX]\]/, '$1[' + (checked ? 'x' : ' ') + ']');
  box.value = lines.join('\n'); box.dispatchEvent(new Event('input', { bubbles:true }));
  navRenderMarkdownPreview();
}
function navSetMarkdownMode(mode){
  navMdMode = mode === 'preview' ? 'preview' : 'write';
  $('#mdHost').classList.toggle('previewing', navMdMode === 'preview');
  for(const [id, on] of [['mdWriteBtn', navMdMode === 'write'], ['mdPreviewBtn', navMdMode === 'preview']]){
    $('#' + id).classList.toggle('on', on); $('#' + id).setAttribute('aria-pressed', String(on));
  }
  if(navMdMode === 'preview') navRenderMarkdownPreview();
  else requestAnimationFrame(() => $('#mdSource').focus({ preventScroll:true }));
}
function navSaveMarkdown(){
  const f = navMarkdownFile(); if(!f) return;
  f.content = $('#mdSource').value; f.updated = Date.now(); queueLib(); navMarkdownStats(); navQueueMarkdownPreview();
}
function navRenameOpenMarkdown(){
  const f = navMarkdownFile(); if(!f) return;
  let name = $('#mdName').value.trim() || 'Untitled.md';
  if(!/\.md$/i.test(name)) name += '.md';
  f.name = navUniqueName(name, f.parentId || null, 'markdown', f.id);
  f.updated = Date.now(); $('#mdName').value = f.name; queueLib(); navRender();
}
async function navOpenMarkdown(id, focus){
  const f = navFileById(id); if(!f || f.kind !== 'markdown') return;
  await flush(); closeViewer(); closeFolder();
  navMdId = id; navActive = { kind:'markdown', id }; navFolder = f.parentId || null;
  document.body.classList.add('md-open'); $('#mdHost').hidden = false;
  $('#mdName').value = f.name || 'Untitled.md'; $('#mdSource').value = f.content || '';
  lib.lastEntry = { kind:'markdown', id }; queueLib();
  navMarkdownStats(); navRenderMarkdownPreview(); navSetMarkdownMode('write'); navRender();
  if(focus !== false) requestAnimationFrame(() => $('#mdSource').focus({ preventScroll:true }));
}
function navLeaveMarkdown(){
  if(!navMdId) return;
  navSaveMarkdown(); clearTimeout(navPreviewTimer); navPreviewTimer = 0;
  navMdId = null; document.body.classList.remove('md-open'); $('#mdHost').hidden = true;
}
function navCanvasOpened(id){
  navLeaveMarkdown();
  const b = navBookById(id);
  navActive = { kind:'canvas', id }; navFolder = b && b.parentId || null;
  if(lib){ lib.lastEntry = { kind:'canvas', id }; queueLib(); }
  navRender();
}

/* ================= wiring ================= */
function navBoot(){
  navNormalizeLibrary(); navLoadExpanded(); navSetOpen(navInitialOpen(), false); navRender();
}
$('#navBtn').addEventListener('click', navToggle);
$('#navClose').addEventListener('click', () => navSetOpen(false));
$('#navScrim').addEventListener('click', () => navSetOpen(false));
$('#navFileInput').addEventListener('change', e => navImportFiles([...e.target.files], navImportParent));
$('#navNameCancel').addEventListener('click', () => navFinishName(null));
$('#navNameSave').addEventListener('click', () => navFinishName($('#navNameInput').value));
$('#navNameInput').addEventListener('keydown', e => {
  if(e.key === 'Enter'){ e.preventDefault(); navFinishName(e.target.value); }
  if(e.key === 'Escape'){ e.preventDefault(); navFinishName(null); }
});
$('#navSeek').addEventListener('input', navRender);
$('#navTree').addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.files.length ? 'copy' : 'move'; });
$('#navTree').addEventListener('drop', e => { if(e.target.closest('.nav-row[data-kind="folder"]')) return; e.preventDefault(); navDrop(e, null); });
$('#navTree').addEventListener('contextmenu', e => { if(!e.target.closest('.nav-row')) navOpenContext(e, 'root', null); });
$('#navMenu').addEventListener('pointerdown', e => e.stopPropagation());
$('#navMenu').addEventListener('click', e => {
  const button = e.target.closest('[data-nav-cmd]'); if(button) navRunContext(button.dataset.navCmd);
});
document.addEventListener('pointerdown', e => { if(navContext && !e.target.closest('#navMenu')) navCloseContext(); }, true);
window.addEventListener('blur', navCloseContext);
window.addEventListener('resize', navCloseContext);
$('#mdSource').addEventListener('input', navSaveMarkdown);
$('#mdSource').addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && !e.altKey){
    const key = e.key.toLowerCase();
    if(key === 'e' && !e.shiftKey){ e.preventDefault(); navSetMarkdownMode('preview'); return; }
  }
  if(e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) navMdSmartEnter(e);
  else if(e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) navMdIndent(e);
});
$('#mdFormat').addEventListener('pointerdown', e => { if(e.target.closest('[data-md-act]')) e.preventDefault(); });
$('#mdFormat').addEventListener('click', e => { const b = e.target.closest('[data-md-act]'); if(b) navMdAction(b.dataset.mdAct); });
$('#mdPreview').addEventListener('change', e => {
  const task = e.target.closest('[data-md-task]'); if(task) navToggleTask(+task.dataset.mdTask, task.checked);
});
$('#mdName').addEventListener('change', navRenameOpenMarkdown);
$('#mdName').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); } });
$('#mdWriteBtn').addEventListener('click', () => navSetMarkdownMode('write'));
$('#mdPreviewBtn').addEventListener('click', () => navSetMarkdownMode('preview'));
$('#mdDownload').addEventListener('click', async () => {
  const f = navMarkdownFile(); if(!f) return;
  navSaveMarkdown(); await plSaveFile(f.name || 'note.md', new Blob([f.content || ''], { type:'text/markdown;charset=utf-8' }));
});
window.addEventListener('keydown', e => {
  if(e.key === 'Escape' && navContext){ e.preventDefault(); navCloseContext(); return; }
  if((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e'){
    e.preventDefault(); navToggle();
  }
});

/* ---- how it looks ---- */
addCSS('navigator', `
/* The file explorer is a structural, heavier material. It changes the desk's
   usable width on a pointer-sized screen and becomes an overlay under a thumb. */
.app{min-width:0;padding-left:0;transition:padding-left .28s cubic-bezier(.22,.74,.24,1)}
body.nav-open .app{padding-left:286px}
.navigator{position:fixed;z-index:64;inset:0 auto 0 0;width:286px;display:flex;flex-direction:column;min-height:0;
  color:#e8e5dd;background:rgba(20,23,27,.94);border-right:1px solid rgba(255,255,255,.09);
  box-shadow:14px 0 34px rgba(0,0,0,.18);backdrop-filter:blur(22px) saturate(130%);
  transform:translateX(-100%);transition:transform .28s cubic-bezier(.22,.74,.24,1);font-family:var(--mono)}
body.nav-open .navigator{transform:translateX(0)}
.nav-head{display:flex;align-items:center;gap:12px;padding:calc(17px + env(safe-area-inset-top)) 14px 12px calc(16px + env(safe-area-inset-left))}
.nav-kicker{font-size:9px;line-height:1.2;letter-spacing:.2em;text-transform:uppercase;color:#858b91}
.nav-title{font-family:var(--disp);font-size:25px;line-height:1;letter-spacing:.035em;text-transform:uppercase;margin-top:3px}
.nav-icon-btn{margin-left:auto;color:#92979d;width:30px;height:30px;border-radius:7px;font:12px var(--mono)}
.nav-icon-btn:hover{color:#fff;background:rgba(255,255,255,.08)}
.nav-row-main:active,.nav-row-acts button:active{transform:scale(.97)}
.nav-namebox{margin:0 10px 9px;padding:9px;border:1px solid color-mix(in srgb,var(--accent2) 45%,transparent);border-radius:7px;background:rgba(0,0,0,.3)}
.nav-namebox[hidden]{display:none}.nav-namebox label{display:block;color:#899198;font-size:8px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
.nav-namebox input{display:block;width:100%;border:1px solid #4c545a;border-radius:5px;outline:0;background:#111419;color:#fff;padding:7px 8px;font:10px var(--mono)}
.nav-namebox input:focus{border-color:var(--accent2)}.nav-namebox div{display:flex;justify-content:flex-end;gap:5px;margin-top:7px}
.nav-namebox button{padding:5px 7px;border-radius:4px;color:#939aa0;font:8px var(--mono);letter-spacing:.06em;text-transform:uppercase}
.nav-namebox button:hover{color:#fff;background:rgba(255,255,255,.08)}#navNameSave{color:#fff;background:color-mix(in srgb,var(--accent2) 52%,#222)}
.nav-search{display:flex;align-items:center;gap:7px;margin:0 10px 8px;padding:0 9px;height:31px;border-radius:7px;background:rgba(0,0,0,.22);color:#737a80;border:1px solid transparent}
.nav-search:focus-within{border-color:color-mix(in srgb,var(--accent2) 70%,transparent);color:#bfc5c9}
.nav-search input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:#e8e5dd;font:10px var(--mono);letter-spacing:.025em}
.nav-search input::placeholder{color:#697077}
.nav-tree{flex:1;min-height:0;overflow:auto;padding:2px 7px 20px;scrollbar-width:thin;scrollbar-color:#41474c transparent}
.nav-row{height:31px;display:flex;align-items:center;position:relative;border-radius:6px;color:#abb0b5}
.nav-row{--indent:calc(var(--depth)*15px);padding-left:var(--indent)}
.nav-row:hover{background:rgba(255,255,255,.052);color:#e6e8e9}
.nav-row.active{color:#fff;background:color-mix(in srgb,var(--accent2) 22%,transparent)}
.nav-row.active::before{content:"";position:absolute;left:1px;top:7px;bottom:7px;width:2px;border-radius:2px;background:var(--accent2)}
.nav-row.drag-over{background:color-mix(in srgb,var(--accent2) 30%,transparent);box-shadow:inset 0 0 0 1px var(--accent2)}
.nav-row.dragging{opacity:.34}.nav-dragging .nav-row[data-kind="folder"]{cursor:copy}
.nav-twist{flex:0 0 18px;width:18px;height:28px;padding:0;display:grid;place-items:center;color:#717980;font:12px/1 var(--mono);transition:transform .12s ease}
.nav-twist.expanded{transform:rotate(90deg)}
span.nav-twist{display:block}
.nav-glyph{flex:0 0 21px;width:21px;height:21px;display:grid;place-items:center;margin-right:3px;color:#98a0a7}
.nav-glyph.canvas{font:22px/1 var(--disp);color:var(--accent2)}
.nav-glyph.md{position:relative;border:1px solid #717980;border-radius:2px;font:bold 9px var(--mono);color:#c5c9cc}
.nav-glyph.md span{position:absolute;font-size:7px;right:1px;bottom:0;color:var(--accent2)}
.nav-glyph.file{position:relative;width:17px;height:21px;margin-left:2px;margin-right:5px;border:1px solid #727980;border-radius:2px;background:#30353a}
.nav-glyph.file::after{content:"";position:absolute;right:-1px;top:-1px;border-style:solid;border-width:0 0 5px 5px;border-color:transparent transparent #727980 transparent}
.nav-glyph.file i{font:normal 6px var(--mono);letter-spacing:-.02em;color:#c7cbce;max-width:15px;overflow:hidden}
.nav-glyph.file.pdf i{color:#f08a71}.nav-glyph.file.fits i{font-size:12px;color:#91bedf}.nav-glyph.file.table i{font-size:12px;color:#77c69d}
.nav-glyph.file.image i,.nav-glyph.file.video i{font-size:11px;color:#d9b873}
.nav-row-main{flex:1;min-width:0;height:100%;padding:0 3px;text-align:left;color:inherit;font:10.5px var(--mono)}
.nav-row-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-row-acts{display:none;align-items:center;padding-right:3px;background:linear-gradient(90deg,transparent,#24282c 16%)}
.nav-row:hover .nav-row-acts,.nav-row:focus-within .nav-row-acts{display:flex}
.nav-row-acts button{width:24px;height:25px;padding:0;color:#858c92;border-radius:4px;font:10px var(--mono)}
.nav-row-acts button:hover{background:rgba(255,255,255,.09);color:#fff}
.nav-row-acts button[data-act="delete"]:hover{background:var(--accent);color:#fff}
.nav-empty{padding:38px 20px;color:#737a80;text-align:center;font-size:10px;line-height:1.55}
.nav-foot{display:flex;justify-content:space-between;gap:10px;padding:9px calc(12px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));
  border-top:1px solid rgba(255,255,255,.06);color:#71787e;font-size:8px;letter-spacing:.08em;text-transform:uppercase}
.nav-scrim{display:none}

/* Pointer menus use one compact material wherever the tree was clicked. */
.nav-menu{position:fixed;z-index:96;width:218px;padding:5px;border:1px solid rgba(255,255,255,.13);border-radius:9px;
  color:#e8eaec;background:rgba(28,31,36,.97);box-shadow:0 14px 36px rgba(0,0,0,.42);backdrop-filter:blur(18px) saturate(135%);
  font-family:var(--mono);transform-origin:var(--ctx-x,12px) var(--ctx-y,12px);opacity:0;transform:scale(.94)}
.nav-menu[hidden]{display:none}.nav-menu.ready{opacity:1;transform:scale(1);transition:opacity .11s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.nav-menu button{display:grid;grid-template-columns:22px 1fr auto;align-items:center;width:100%;min-height:30px;padding:4px 7px;border-radius:5px;
  color:#d4d7da;font:10px var(--mono);text-align:left}
.nav-menu button:hover,.nav-menu button:focus-visible{outline:0;color:#fff;background:rgba(255,255,255,.09)}
.nav-menu button.danger{color:#e99383}.nav-menu button.danger:hover{color:#fff;background:#a84434}
.nav-menu-icon{color:#929aa1;text-align:center;font-size:12px}.nav-menu button:hover .nav-menu-icon{color:var(--accent2)}
.nav-menu button.danger:hover .nav-menu-icon{color:#fff}.nav-menu kbd{color:#697178;font:7px var(--mono)}
.nav-menu-rule{height:1px;margin:4px 5px;background:rgba(255,255,255,.08)}

/* A Markdown file is a document, not a sheet item. The canvas stays mounted
   behind it so switching back is immediate and no edit is lost. */
.md-host{flex:1;min-height:0;background:color-mix(in srgb,var(--desk) 86%,#111);color:var(--ink);display:flex;flex-direction:column}
.md-host[hidden]{display:none}
body.md-open .stage,body.md-open .tools-bar,body.md-open .cmap{display:none}
body.md-open #layBtn,body.md-open #setBtn{display:none}
.md-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.075);background:rgba(0,0,0,.16);color:#ddd}
.md-identity{display:flex;align-items:baseline;gap:10px;min-width:0}
.md-kind{font:8px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:#777f85}
#mdName{min-width:100px;width:min(34vw,420px);border:0;border-bottom:1px solid transparent;outline:0;background:transparent;color:#e8e5dd;font:600 16px var(--body);padding:3px 2px}
#mdName:hover,#mdName:focus{border-color:#5b6268}
.md-modes{display:flex;padding:2px;border-radius:7px;background:rgba(0,0,0,.24)}
.md-modes button,.md-download{padding:6px 9px;border-radius:5px;color:#90979d;font:9px var(--mono);letter-spacing:.06em;text-transform:uppercase}
.md-modes button.on{background:#3a4046;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.md-download{border:1px solid rgba(255,255,255,.1);color:#bbc0c4}.md-download:hover{color:#fff;border-color:var(--accent2)}
.md-format{display:flex;align-items:center;gap:2px;min-height:38px;padding:4px max(9px,calc((100% - 1060px)/2 + 9px));overflow-x:auto;
  border-bottom:1px solid rgba(255,255,255,.065);background:rgba(0,0,0,.11);color:#8e969c;scrollbar-width:none}
.md-format::-webkit-scrollbar{display:none}.md-format button{flex:none;min-width:29px;height:28px;padding:0 6px;border-radius:5px;color:#aeb4b9;font:11px var(--mono)}
.md-format button:hover,.md-format button:focus-visible{outline:0;color:#fff;background:rgba(255,255,255,.09)}
.md-format button:active{transform:scale(.94)}.md-format-rule{flex:none;width:1px;height:17px;margin:0 4px;background:rgba(255,255,255,.09)}
.md-format-hint{margin-left:auto;white-space:nowrap;color:#687078;font:8px var(--mono);letter-spacing:.04em}
.md-paper{flex:1;min-height:0;width:min(100%,1060px);margin:0 auto;background:var(--paper);box-shadow:0 0 38px rgba(0,0,0,.2);display:flex}
#mdSource,.md-preview{flex:1;width:100%;min-width:0;margin:0;border:0;outline:0;resize:none;overflow:auto;background:var(--paper);color:var(--ink);
  padding:clamp(34px,7vw,84px) clamp(28px,8vw,110px);font-size:16px;line-height:1.68}
#mdSource{font-family:var(--mono);font-size:13px;line-height:1.75;tab-size:2;caret-color:var(--accent)}
.md-preview{display:none;font-family:var(--body)}
.md-host.previewing #mdSource{display:none}.md-host.previewing .md-preview{display:block}
.md-preview h1,.md-preview h2,.md-preview h3,.md-preview h4,.md-preview h5,.md-preview h6{font-family:var(--disp);line-height:1.1;text-transform:none;margin:1.65em 0 .55em;letter-spacing:-.01em}
.md-preview h1{font-size:2.45em;margin-top:0}.md-preview h2{font-size:1.85em;border-bottom:1px solid var(--line);padding-bottom:.28em}.md-preview h3{font-size:1.45em}
.md-preview p{margin:.8em 0}.md-preview a{color:var(--accent2);text-underline-offset:.16em}.md-preview strong{font-weight:700}
.md-preview code{font: .84em var(--mono);background:color-mix(in srgb,var(--line) 45%,transparent);padding:.12em .35em;border-radius:3px}
.md-preview pre{position:relative;overflow:auto;background:color-mix(in srgb,var(--ink) 92%,#000);color:var(--paper);padding:1.15em 1.3em;border-radius:7px;line-height:1.55}
.md-preview pre code{background:none;padding:0;color:inherit}.md-preview pre[data-lang]:not([data-lang=""])::after{content:attr(data-lang);position:absolute;right:9px;top:7px;font:8px var(--mono);letter-spacing:.1em;text-transform:uppercase;opacity:.5}
.md-preview .cbx.cfence{margin:1.25em 0;font-size:.84em}.md-preview .cbx.cfence .csch{display:none}
.md-preview blockquote{margin:1.1em 0;padding:.1em 0 .1em 1em;border-left:3px solid var(--accent2);color:var(--soft)}
.md-preview ul,.md-preview ol{padding-left:1.45em}.md-preview li{margin:.3em 0}.md-preview .tasks{list-style:none;padding-left:.1em}
.md-preview .tasks li{display:flex;gap:.65em;align-items:flex-start}.md-preview .tasks input{margin-top:.38em;accent-color:var(--accent2);cursor:pointer}
.md-preview hr{border:0;border-top:1px solid var(--line);margin:2em 0}.md-preview-empty{color:var(--soft);font-style:italic}
.md-status{display:flex;justify-content:space-between;gap:12px;padding:6px 14px;background:rgba(0,0,0,.18);color:#747c82;font:8px var(--mono);letter-spacing:.07em;text-transform:uppercase}

@media (max-width:900px){
  body.nav-open .app{padding-left:0}.navigator{width:min(86vw,310px)}
  body.nav-open .navigator{box-shadow:20px 0 50px rgba(0,0,0,.5)}
  .nav-scrim{display:block;position:fixed;z-index:63;inset:0;background:rgba(5,7,9,.44);opacity:0;pointer-events:none;transition:opacity .28s ease}
  body.nav-open .nav-scrim{opacity:1;pointer-events:auto}
}
@media (max-width:620px){
  .md-kind{display:none}#mdName{width:42vw;font-size:14px}.md-download{display:none}
  #mdSource,.md-preview{padding:28px 22px}.md-bar{padding:8px}.md-status span:last-child,.md-format-hint{display:none}
}
@media (pointer:coarse){
  .nav-row{height:40px}.nav-row-acts{display:flex}.nav-row-acts button{width:31px;height:32px}.nav-search{height:38px}
  .nav-menu button{min-height:42px}.md-format button{min-width:38px;height:34px}
}
@media (prefers-reduced-motion:reduce){
  .app,.navigator,.nav-scrim{transition:opacity .16s ease}.navigator{transform:none;opacity:0;pointer-events:none}
  body.nav-open .navigator{opacity:1;pointer-events:auto}
}
@media (prefers-reduced-transparency:reduce){.navigator{background:#171a1e;backdrop-filter:none}}
@media (prefers-contrast:more){.navigator{background:#101215;border-right-color:#fff}.nav-row.active{outline:1px solid #fff}}
`);
