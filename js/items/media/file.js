/* Open Note — items/file.js
   attachments — a PDF or any file, as a shortcut */

/* ================= attachments (PDFs and other files) =================
   The file itself is kept in the media store like a video; the page only shows
   a shortcut to it — an icon with the file's name under it. Clicking opens the
   real thing in a new tab, and hovering peeks at the first page. */
const fileExt = it => ((String(it.name || '').match(/\.([a-z0-9]{1,5})$/i) || ['', ''])[1] || '').toUpperCase();
const fmtBytes = n => !n ? '' : n >= 1048576 ? (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'
                    : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
/* ---- icons ----
   Everything that can sit in a folder is drawn in the same 96×128 box, so a
   folder of mixed things lines up like a row of desktop icons. A picture and a
   model show themselves; the rest show what they are. */
const svgIcon = inner =>
  '<svg viewBox="0 0 96 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '</svg>';
function extBand(label){
  /* BLEND fits, it just has to shrink for it — a clipped "BLEN" reads as a typo */
  const t = String(label || '').slice(0, 5);
  return '<rect class="fband" x="32" y="94" width="58" height="23"/>' +
    '<text class="fext" x="61" y="111" text-anchor="middle" font-size="' +
      (t.length > 4 ? 11 : t.length > 3 ? 12.5 : 14) + '">' + esc(t) + '</text>';
}
function fileGlyph(it){
  return svgIcon('<path class="fsheet" d="M6 3 H64 L90 29 V125 H6 Z"/>' +
    '<path class="ffold" d="M64 3 L90 29 H64 Z"/>' +
    '<path class="frule" d="M20 56 H76 M20 70 H76 M20 84 H62" fill="none"/>' +
    extBand(fileExt(it) || 'FILE'));
}
function imgGlyph(it){                                /* a photo print of itself */
  return svgIcon('<path class="fsheet" d="M5 9 H91 V119 H5 Z"/>' +
    (it.src
      ? '<image href="' + esc(it.src) + '" x="11" y="15" width="74" height="73" preserveAspectRatio="xMidYMid slice"/>'
      : '<rect class="fplate" x="11" y="15" width="74" height="73"/>' +
        '<circle class="fsun" cx="31" cy="35" r="7"/>' +
        '<path class="fhill" d="M11 88 L34 55 L52 77 L64 65 L85 88 Z"/>') +
    '<rect class="fmatte" x="11" y="15" width="74" height="73" fill="none"/>' +
    extBand(fileExt(it) || 'IMG'));
}
function vidGlyph(it){                                /* a strip of film */
  let perf = '';
  for(let y = 17; y <= 101; y += 14)
    perf += '<rect class="fperf" x="12" y="' + y + '" width="9" height="8" rx="1.5"/>' +
            '<rect class="fperf" x="75" y="' + y + '" width="9" height="8" rx="1.5"/>';
  return svgIcon('<rect class="ffilm" x="5" y="9" width="86" height="110" rx="3"/>' + perf +
    '<rect class="fscr" x="26" y="26" width="44" height="42"/>' +
    '<path class="fplay" d="M43 37 L59 47 L43 57 Z"/>' +
    extBand(it.vkind === 'yt' ? 'YT' : it.vkind === 'vimeo' ? 'VIMEO' : (fileExt(it) || 'VIDEO')));
}
function mdlGlyph(it){                                /* the still it already posed for */
  return svgIcon('<rect class="fcase" x="5" y="8" width="86" height="82" rx="2"/>' +
    '<rect class="fbar2" x="9" y="12" width="78" height="9"/>' +
    '<rect class="fscr" x="9" y="25" width="78" height="61"/>' +
    (it.poster
      ? '<image href="' + esc(it.poster) + '" x="9" y="25" width="78" height="61" preserveAspectRatio="xMidYMid slice"/>'
      : '<g class="fwire" fill="none"><path d="M22 44 H58 V80 H22 Z"/><path d="M36 32 H72 V68 H36 Z"/>' +
        '<path d="M22 44 L36 32 M58 44 L72 32 M58 80 L72 68 M22 80 L36 68"/></g>') +
    extBand(fileExt(it) || 'OBJ'));
}
function foldGlyph(it){                               /* a card folder, papers peeking out */
  const n = kidsOf(it).length;
  return svgIcon('<path class="fdb" d="M5 21 H36 L45 32 H91 V116 H5 Z"/>' +
    (n ? '<rect class="fpaper" x="19" y="33" width="55" height="52" rx="1"/>' +
         (n > 1 ? '<rect class="fpaper" x="31" y="25" width="49" height="56" rx="1"/>' : '') : '') +
    '<path class="fdf" d="M5 43 H91 V116 H5 Z"/>' +
    '<path class="fdl" d="M5 43 H91" fill="none"/>');
}
function deckGlyph(it){                               /* a stack of index cards, ruled in red */
  const n = ((it && it.cards) || []).length;
  return svgIcon(
    '<g transform="rotate(-7 48 66)"><rect class="fsheet" x="10" y="42" width="76" height="52" rx="3"/></g>' +
    '<g transform="rotate(4 48 66)"><rect class="fsheet" x="12" y="38" width="76" height="52" rx="3"/></g>' +
    '<rect class="fsheet" x="10" y="34" width="76" height="52" rx="3"/>' +
    '<path class="fcrule" d="M17 48 H79" fill="none"/>' +
    (n ? '<text class="fnum" x="48" y="76" text-anchor="middle" font-size="26">' + n + '</text>' : ''));
}
function itemGlyph(it){
  const own = specOf(it).icon;                        // a feature may draw its own
  if(own) return own(it);
  return it.type === 'folder' ? foldGlyph(it)
       : it.type === 'image'  ? imgGlyph(it)
       : it.type === 'video'  ? vidGlyph(it)
       : it.type === 'model'  ? mdlGlyph(it)
       : it.type === 'deck'   ? deckGlyph(it)
       : fileGlyph(it);
}
function withMediaURL(it, cb){
  if(MEDIA_URL[it.media]) return cb(MEDIA_URL[it.media]);
  mediaGet(it.media).then(b => { if(b) cb(MEDIA_URL[it.media] = URL.createObjectURL(b)); });
}
function saveAttachment(it, url){
  const a = document.createElement('a');
  a.href = url; a.download = it.name || 'file';
  document.body.appendChild(a); a.click(); a.remove();
}
/* A tab if the browser will give us one — off the disk it won't, since a blob
   from a file:// page has no origin to navigate to. Falls back to saving it. */
function tabAttachment(it, url){
  let w = null;
  try{ w = window.open(url, '_blank'); }catch(e){}
  if(!w) saveAttachment(it, url);
  return !!w;
}
function openAttachment(it){
  if(it.kind === 'pdf') return withMediaURL(it, url => openViewer(it, url));
  const url = MEDIA_URL[it.media];
  if(url) return void tabAttachment(it, url);      // straight off the tap, so no popup block
  mediaGet(it.media).then(b => {
    if(!b){ alert('That file is not in this book any more.'); return; }
    tabAttachment(it, MEDIA_URL[it.media] = URL.createObjectURL(b));
  });
}
/* Every window in the book wears the same chrome — the reader, a picture, a
   model, a folder — so they all read as one desk. */
const CLOSE_BTN = { a:'close', g:'✕', t:'Close (Esc)' };
/* `cls` marks the body, and the window with it — a window holding a short list
   has no business being the size of one holding a document */
function winShell(v, name, meta, btns, cls){
  v.innerHTML =
    '<div class="fwin' + (cls ? ' w-' + cls : '') + '"><div class="fbar"><span class="fnm"></span><span class="fmeta"></span>' +
    '<span class="fbtns">' +
    btns.map(b => '<button data-a="' + b.a + '" title="' + esc(b.t) + '">' + b.g + '</button>').join('') +
    '</span></div><div class="fbody' + (cls ? ' ' + cls : '') + '"></div></div>';
  v.querySelector('.fnm').textContent = name || 'file';
  v.querySelector('.fmeta').textContent = meta || '';
  v.classList.add('on');
  return v.querySelector('.fbody');
}
function winActs(v, fn){
  v.querySelectorAll('.fbtns button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); fn(b.dataset.a);
  }));
}
/* the document opens in the book, in a window of its own */
function openViewer(it, url){
  const v = $('#fview');
  const body = winShell(v, entryName(it), entryMeta(it), [
    { a:'tab',  g:'↗', t:'Open in a new tab, if the browser allows it' },
    { a:'save', g:'⤓', t:'Save a copy' }, CLOSE_BTN]);
  const f = document.createElement('iframe');
  f.src = url;
  body.appendChild(f);
  winActs(v, a => {
    if(a === 'close') closeViewer();
    else if(a === 'save') saveAttachment(it, url);
    else tabAttachment(it, url);
  });
}
let viewStop = null;                               // whatever the open window needs unhooking
function closeViewer(){
  const v = $('#fview');
  if(!v || !v.classList.contains('on')) return false;
  if(viewStop){ viewStop(); viewStop = null; }
  v.classList.remove('on'); v.innerHTML = '';      // drops the viewer, and the memory with it
  return true;
}
$('#fview').addEventListener('pointerdown', e => { if(e.target === e.currentTarget) closeViewer(); });
/* what we can tell about a PDF without a pdf library: is it one, and how long */
async function pdfFacts(file){
  let isPdf = /pdf$/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
  let pages = 0;
  try{
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    isPdf = String.fromCharCode.apply(null, head) === '%PDF-';
    if(isPdf && file.size < 40 * 1024 * 1024){
      const txt = await file.text();               // binary turns to junk, the ascii markers survive
      let m; const re = /\/Count\s+(\d+)/g;
      while((m = re.exec(txt))) pages = Math.max(pages, +m[1]);
      if(!pages) pages = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
    }
  }catch(e){}
  return { isPdf, pages };
}

/* ---- the peek ----
   A preview is a deliberate act: hold ctrl and put the pointer on an icon. It
   shows the real thing where it can — a PDF's first page, the picture itself,
   the model's pose, the first frame of a video, what a folder holds. */
let peekT = 0, peekFor = null, peekIcon = null, ctrlOn = false;
function hidePeek(){
  clearTimeout(peekT);
  const p = $('#peek');
  if(p){ p.classList.remove('on'); p.innerHTML = ''; }
  peekFor = null;
}
function armPeek(icon, it){
  if(!icon) return;
  icon.__peek = it;
  const on = e => { peekIcon = icon; maybePeek(e.ctrlKey || e.metaKey, icon, it); };
  icon.addEventListener('pointerenter', on);
  icon.addEventListener('pointermove', on);
  icon.addEventListener('pointerleave', () => { if(peekIcon === icon) peekIcon = null; hidePeek(); });
}
function maybePeek(want, icon, it){
  ctrlOn = !!want;
  if(!want || document.body.classList.contains('drawing')){ hidePeek(); return; }
  if(peekFor === it.id) return;
  clearTimeout(peekT);
  peekT = setTimeout(() => showPeek(icon, it), 90);
}
window.addEventListener('keydown', e => {
  if(e.key !== 'Control' && e.key !== 'Meta' || ctrlOn) return;
  ctrlOn = true;                                   // held down while already resting on an icon
  if(peekIcon && peekIcon.__peek) maybePeek(true, peekIcon, peekIcon.__peek);
});
window.addEventListener('keyup', e => { if(e.key === 'Control' || e.key === 'Meta'){ ctrlOn = false; hidePeek(); } });
window.addEventListener('blur', () => { ctrlOn = false; hidePeek(); });

function peekBody(it){
  const own = specOf(it).peek;                        // …and say what a peek at it shows
  if(own) return own(it);
  if(it.type === 'folder'){
    const k = kidsOf(it);
    return '<div class="sheetbox plist">' + (k.length
      ? k.slice(0, 9).map(x => '<span>' + esc(entryName(x)) + '</span>').join('') +
        (k.length > 9 ? '<span class="more">+' + (k.length - 9) + ' more</span>' : '')
      : '<span class="more">empty</span>') + '</div>';
  }
  if(it.type === 'deck'){
    const cs = cardsOf(it);
    return '<div class="sheetbox plist">' + (cs.length
      ? cs.slice(0, 9).map((c, i) => '<span>' + (i + 1) + '. ' + esc(cardText(c) || 'card ' + (i + 1)) + '</span>').join('') +
        (cs.length > 9 ? '<span class="more">+' + (cs.length - 9) + ' more</span>' : '')
      : '<span class="more">no cards yet</span>') + '</div>';
  }
  if(it.type === 'image') return '<div class="sheetbox shot"><img alt=""></div>';
  if(it.type === 'model')
    return '<div class="sheetbox shot">' + (it.poster ? '<img alt="">' : '<div class="pwait">posing…</div>') + '</div>';
  if(it.type === 'video')
    return '<div class="sheetbox shot">' + (it.vkind === 'file' ? '<video muted preload="metadata"></video>'
      : '<div class="pwait">' + (it.vkind === 'yt' ? 'YouTube' : 'Vimeo') + ' — open it to play</div>') + '</div>';
  return it.kind === 'pdf' ? '<div class="sheetbox"><div class="pwait">first page…</div></div>' : '';
}
function fillPeek(p, it){
  const box = p.querySelector('.sheetbox');
  if(!box) return;
  const drop = () => { const w = box.querySelector('.pwait'); if(w) w.remove(); };
  if(it.type === 'image'){ box.querySelector('img').src = it.src || ''; return; }
  if(it.type === 'model'){
    const im = box.querySelector('img');
    if(im) im.src = it.poster || '';
    else posePoster(it).then(() => { if(peekFor === it.id && it.poster) showPeek(peekIcon, it, true); });
    return;
  }
  if(it.type === 'video' && it.vkind === 'file')
    return withMediaURL(it, u => {
      if(peekFor !== it.id) return;
      const v = box.querySelector('video'); if(v) v.src = u;
    });
  if(it.type !== 'file' || it.kind !== 'pdf') return;
  withMediaURL(it, url => {
    if(peekFor !== it.id) return;
    const f = document.createElement('iframe');
    f.setAttribute('scrolling', 'no');
    f.setAttribute('tabindex', '-1');
    /* the viewer's own toolbar is cropped off the top by the css transform */
    f.src = url + '#page=1&zoom=page-width&view=FitH&toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0';
    f.addEventListener('load', drop);
    box.appendChild(f);
    setTimeout(drop, 1200);
  });
}
function showPeek(icon, it, again){
  const p = $('#peek');
  if(!p || !icon || (peekFor === it.id && !again)) return;
  peekFor = it.id;
  const meta = entryMeta(it);
  p.innerHTML = peekBody(it) +
    '<div class="pmeta"><b>' + esc(entryName(it)) + '</b>' +
    (meta ? '<i>' + esc(meta) + '</i>' : '') + '</div>';
  p.classList.add('on');
  placePeek(p, icon);
  fillPeek(p, it);
}
function placePeek(p, icon){
  const r = icon.getBoundingClientRect(), pr = p.getBoundingClientRect();
  /* inside a window it steps clear of the whole window, not just the icon, so it
     never covers the row you are reading */
  const host = icon.closest('.fwin');
  const hr = host ? host.getBoundingClientRect() : r;
  let x = hr.right + 12;
  if(x + pr.width > innerWidth - 8) x = hr.left - pr.width - 12;
  if(x < 8) x = r.right + 12;
  p.style.left = clamp(x, 8, Math.max(8, innerWidth - pr.width - 8)) + 'px';
  p.style.top = clamp(r.top + r.height / 2 - pr.height / 2, 8, Math.max(8, innerHeight - pr.height - 8)) + 'px';
}
function wireIcon(el, it, page){
  const icon = el.querySelector('.ficon');
  if(!icon) return;
  /* The item grabs the pointer to drag itself, which retargets the click away from
     this icon — so the tap is decided here, on the way up, wherever it lands. */
  icon.addEventListener('pointerdown', e => {
    const sx = e.clientX, sy = e.clientY, ix = it.x, iy = it.y, pid = e.pointerId;
    if(it.media) withMediaURL(it, () => {});       // have the file ready before the finger lifts
    const up = ev => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if(ev.type !== 'pointerup' || ev.pointerId !== pid) return;
      if(Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5 || it.x !== ix || it.y !== iy) return;
      hidePeek();                                  // a tap, not the end of a drag
      const open = specOf(it).open;                // …and what opens when it is tapped
      if(open) open(it, page);
      else if(it.type === 'folder') openFolder(it, page);
      else openAttachment(it);
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
  armPeek(icon, it);
}
async function attachRecord(file){
  if(file.size > 80 * 1024 * 1024 &&
     !confirm('That file is ' + (file.size / 1048576 | 0) + ' MB. It is stored inside the book, so backups get that much heavier. Attach it anyway?')) return null;
  const id = uid();
  const ok = await mediaSet(id, file);
  if(!ok){ alert('Could not store that file in this browser.'); return null; }
  MEDIA_URL[id] = URL.createObjectURL(file);
  const f = await pdfFacts(file);
  return { id: uid(), type: 'file', media: id, name: file.name,
    kind: f.isPdf ? 'pdf' : 'file', size: file.size,
    pages: f.pages || undefined, cap: file.name };
}
async function fileToAttach(file, at){
  const r = await attachRecord(file);
  if(!r) return;
  const page = sheet();
  const pos = at || { x: 20 + Math.random() * 20, y: 20 + Math.random() * 30 };
  page.items.push({ ...r, x: clamp(pos.x, 2, 86), y: clamp(pos.y, 4, 84), w: 13,
    rot: 0, z: maxZ(page) + 1, lay: curLayerId() });
  queueSave(page.id); SND.plop(); render();
}
$('#fileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if(f) fileToAttach(f, takePendingAt()); e.target.value = '';
});
window.addEventListener('pointerdown', e => { if(!e.target.closest || !e.target.closest('.ficon')) hidePeek(); }, true);

/* A shortcut, not the document: the icon opens the real file. Folders wear the
   same markup — same box, same caption — so a page of them lines up. */
function shortcutHTML(it, c, fold){
  const href = !fold && c.urls[it.media];        // exports carry the file inline; the app uses a blob url
  const tag = c.live || !href ? 'div' : 'a';
  return '<figure class="body shortcut' + (fold ? ' fold' : '') + '"><' + tag + ' class="ficon"' +
    (tag === 'a' ? ' href="' + esc(href) + '" download="' + esc(it.name || 'file') + '"' : '') +
    ' title="' + esc(iconTitle(it, c.live)) + '">' +
    itemGlyph(it) + '<span class="fbadge' + (fold ? ' fcount' : '') + '">' +
    (fold ? kidsOf(it).length : '↗') + '</span></' + tag + '>' +
    '<figcaption></figcaption></figure>';
}

defineItem('file', {
  add: { file: { pick: at => { pendingAt = at || null; $('#fileInput').click(); } } },
  exportMaxBytes: 15 * 1024 * 1024,   // heavier than this and it stays out of an export
  html: (it, c) => shortcutHTML(it, c, false),
  tools(mk, it){ mk('↗', 'Open this file', () => openAttachment(it)); },
  wire(el, it, page){ wireIcon(el, it, page); }
});

/* ---- how it looks ---- */
addCSS('file', `
/* attachments — a desktop shortcut to a file kept inside the book */
.shortcut{background:none;padding:0;box-shadow:none;text-align:center}
.ficon{position:relative;width:100%;aspect-ratio:3/4;cursor:pointer;filter:drop-shadow(0 calc(var(--scale)*4px) calc(var(--scale)*5px) rgba(0,0,0,.35));transition:transform .12s ease}
.ficon svg{display:block;width:100%;height:100%}
.ficon .fsheet{fill:color-mix(in srgb,var(--paper) 52%,#fff);stroke:color-mix(in srgb,var(--ink) 62%,var(--paper));stroke-width:2.5}
.ficon .ffold{fill:color-mix(in srgb,var(--ink) 22%,var(--paper));stroke:color-mix(in srgb,var(--ink) 62%,var(--paper));stroke-width:2.5}
.ficon .frule{stroke:color-mix(in srgb,var(--ink) 38%,var(--paper));stroke-width:3.4;stroke-linecap:round}
.ficon .fband{fill:var(--accent)}
.ficon .fext{fill:#fff;font-family:var(--mono);font-weight:700;letter-spacing:.06em}
/* a picture shows itself, a film is a strip of film, a model is the pose it struck,
   and a folder is a card folder — all in the same box, all mixed from the theme */
.ficon .fplate{fill:color-mix(in srgb,var(--accent2) 26%,var(--paper))}
.ficon .fsun{fill:#e8c93e}
.ficon .fhill{fill:color-mix(in srgb,var(--accent2) 72%,var(--ink))}
.ficon .fmatte{stroke:color-mix(in srgb,var(--ink) 34%,var(--paper));stroke-width:2}
.ficon .ffilm{fill:color-mix(in srgb,var(--ink) 88%,var(--paper))}
.ficon .fperf{fill:color-mix(in srgb,var(--paper) 84%,#fff)}
.ficon .fscr{fill:color-mix(in srgb,var(--ink) 94%,var(--paper))}
.ficon .fplay{fill:#fff}
.ficon .fcase{fill:color-mix(in srgb,var(--paper) 74%,var(--ink));stroke:color-mix(in srgb,var(--ink) 58%,var(--paper));stroke-width:2.5}
.ficon .fbar2{fill:var(--accent2)}
.ficon .fwire{stroke:color-mix(in srgb,var(--accent2) 70%,#fff);stroke-width:2.6;stroke-linejoin:round}
.ficon .fdb{fill:color-mix(in srgb,#d8a53c 58%,var(--paper));stroke:color-mix(in srgb,var(--ink) 58%,var(--paper));stroke-width:2.5}
.ficon .fdf{fill:color-mix(in srgb,#f0c766 72%,var(--paper));stroke:color-mix(in srgb,var(--ink) 58%,var(--paper));stroke-width:2.5}
.ficon .fdl{stroke:color-mix(in srgb,var(--ink) 22%,var(--paper));stroke-width:2}
.ficon .fpaper{fill:color-mix(in srgb,var(--paper) 55%,#fff);stroke:color-mix(in srgb,var(--ink) 32%,var(--paper));stroke-width:2}
/* the little curled arrow that says "this points at something" */
.ficon .fbadge{position:absolute;left:0;bottom:calc(var(--scale)*2px);width:38%;height:28.5%;
  display:grid;place-items:center;background:color-mix(in srgb,var(--paper) 86%,var(--ink));
  box-shadow:inset 1px 1px 0 color-mix(in srgb,var(--paper) 60%,#fff),inset -1px -1px 0 color-mix(in srgb,var(--ink) 60%,var(--paper));
  font-size:calc(var(--scale)*13px);line-height:1;color:var(--ink);font-family:var(--mono)}
/* the label runs wider than the icon, the way a desktop icon's does */
.shortcut figcaption{padding-top:calc(var(--scale)*5px);text-align:center;overflow-wrap:anywhere;line-height:1.25;
  width:154%;margin-left:-27%;
  font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.02em;color:var(--ink);opacity:.9}
.shortcut figcaption:empty::before{content:"file"}
.shortcut.fold figcaption:empty::before{content:"folder"}
.item.sel .shortcut figcaption{background:var(--accent2);color:#fff;opacity:1}
a.ficon{display:block;text-decoration:none}
/* ctrl+hover preview: the real first page (or picture, or pose), in a bevelled card */
.peek{position:fixed;z-index:98;display:none;padding:5px;pointer-events:none;
  background:color-mix(in srgb,var(--paper) 86%,var(--ink));
  box-shadow:inset 1px 1px 0 color-mix(in srgb,var(--paper) 60%,#fff),inset -1px -1px 0 color-mix(in srgb,var(--ink) 55%,var(--paper)),0 14px 34px rgba(0,0,0,.5)}
.peek.on{display:block}
.peek .sheetbox{position:relative;width:228px;height:290px;overflow:hidden;background:#fff;
  box-shadow:inset 1px 1px 0 color-mix(in srgb,var(--ink) 45%,var(--paper))}
/* wider than the box on purpose: the viewer's scrollbar is clipped off the right */
.peek iframe{position:absolute;left:0;top:0;width:812px;height:1060px;border:0;pointer-events:none;
  transform:scale(.3) translateY(-34px);transform-origin:0 0;background:#fff}
.peek .pmeta{margin-top:5px;width:228px;font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--ink)}
.peek .pmeta b{display:block;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.peek .pmeta i{display:block;font-style:normal;opacity:.6;margin-top:2px}
.peek .pwait{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--mono);font-size:10px;
  letter-spacing:.1em;color:#666;background:#fff}
.peek .sheetbox.shot{display:grid;place-items:center;background:#14181c}
.peek .sheetbox.shot img,.peek .sheetbox.shot video{max-width:100%;max-height:100%;object-fit:contain;display:block}
.peek .sheetbox.shot .pwait{background:#14181c;color:#9aa0a6}
.peek .sheetbox.plist{height:auto;max-height:290px;display:flex;flex-direction:column;gap:3px;padding:8px;
  background:color-mix(in srgb,var(--paper) 90%,#fff)}
.peek .plist span{font-family:var(--mono);font-size:10px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.peek .plist .more{opacity:.55}
/* the reader: a browser cannot always open a blob in a tab (a book opened straight
   off the disk never can), so the document opens here, inside the book */
.fview{position:fixed;inset:0;z-index:96;display:none;background:rgba(8,10,12,.74);padding:24px;place-items:center}
.fview.on{display:grid}
.fview .fwin{--wf:color-mix(in srgb,var(--paper) 86%,var(--ink));
  --wl:color-mix(in srgb,var(--wf) 38%,#fff);--wd:color-mix(in srgb,var(--wf) 52%,#000);
  --wk:color-mix(in srgb,var(--wf) 16%,#000);--scale:1;    /* icons in here are page-sized */
  width:min(1080px,92vw);height:min(940px,90vh);display:flex;flex-direction:column;
  background:var(--wf);padding:5px;
  box-shadow:inset 1.4px 1.4px 0 var(--wl),inset -1.4px -1.4px 0 var(--wk),
             inset 2.8px 2.8px 0 var(--wf),inset -2.8px -2.8px 0 var(--wd),0 26px 60px rgba(0,0,0,.6)}
.fview .fbar{display:flex;align-items:center;gap:8px;flex:none;padding:4px 4px 4px 9px;color:#f3f0ea;
  background:linear-gradient(90deg,var(--accent2) 0%,color-mix(in srgb,var(--accent2) 26%,var(--wf)) 100%);
  font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.fview .fnm{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fview .fmeta{flex:1 1 0;min-width:0;text-align:right;opacity:.75;white-space:nowrap;overflow:hidden;font-size:10px}
.fview .fbtns{display:flex;gap:3px;flex:none}
.fview .fbtns button{display:grid;place-items:center;width:24px;height:20px;font-size:11px;line-height:1;
  color:var(--ink);background:var(--wf);font-family:var(--mono);
  box-shadow:inset 1.4px 1.4px 0 var(--wl),inset -1.4px -1.4px 0 var(--wd)}
.fview .fbtns button:hover{background:color-mix(in srgb,var(--wf) 70%,#fff)}
.fview .fbody{flex:1;min-height:0;margin-top:5px;background:#fff;
  box-shadow:inset 1.4px 1.4px 0 var(--wd),inset -1.4px -1.4px 0 var(--wl)}
.fview .fbody iframe{display:block;width:100%;height:100%;border:0;background:#fff}
`);
/* its tile in the palette */
defineTool({ kind:'file', cat:'media', label:'Attachment', icon:'clip', order:40,
  hint:'A PDF (or any file) kept in the book as a clickable shortcut' });
