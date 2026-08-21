/* Open Note — items/science/fits.js
   a FITS file on the page, and the reader that opens out of it */

/* ================= a FITS file =================
   Astronomy's file format, and the reason it is annoying: everything worth
   knowing is in the headers, the headers are long, and the only way most people
   ever look at one is to open Python and print things until the right keyword
   scrolls past.

   So: drop the file on the sheet and it sits there as a shortcut, like any
   attachment. Click it and the reader opens on `hdu.info()` — the same seven
   columns astropy prints, because that is the table everyone already reads.
   Pick a row and its header comes up underneath, three aligned columns of
   keyword, value and comment, with a search box over it that looks in all
   three. Runs of COMMENT and HISTORY fold themselves away, which is most of
   what makes a header unreadable.

   **The data is described and never shown.** A data unit here is a shape, a
   type and a size — `(2048, 2048) float32 · 4,194,304 values · 16.0 MB`, and
   for a table the columns with what each cell of them holds. Printing a few
   million numbers onto a page would be no use to anybody and would take the tab
   with it. js/lib/fits.js reads the headers and steps over the data without
   ever touching it, so a four-gigabyte cube opens as fast as a small one.

   The file itself goes in the media store like any attachment, and the item
   keeps a small digest of the info table — so the card on the paper still says
   what it is in a print, an export, or a backup opened on another machine. */

const FT_MAXCARDS = 1500;              // cards drawn at once; search narrows the rest
const FT_MAXCOLS = 400;                // …and columns of a very wide table
const FT_CACHE = new Map();            // media id → the parsed file, for as long as the note is open
onNoteOpen(() => FT_CACHE.clear());

/* ---- the icon ----
   The same 96×128 box as every other shortcut, so a folder of mixed things
   still lines up: a plate with a few stars on it and the extension band. */
function ftGlyph(it){
  return svgIcon('<path class="fsheet" d="M6 3 H64 L90 29 V125 H6 Z"/>' +
    '<path class="ffold" d="M64 3 L90 29 H64 Z"/>' +
    '<rect class="ftplate" x="17" y="40" width="62" height="46"/>' +
    '<g class="ftstar"><circle cx="30" cy="52" r="3.1"/><circle cx="52" cy="63" r="4.4"/>' +
    '<circle cx="67" cy="49" r="2.3"/><circle cx="38" cy="75" r="2.6"/><circle cx="64" cy="77" r="3.4"/></g>' +
    '<path class="ftgrid" d="M17 63 H79 M48 40 V86" fill="none"/>' +
    extBand('FITS'));
}
const ftHduWord = n => n + (n === 1 ? ' HDU' : ' HDUs');
function ftMeta(it){
  const d = Array.isArray(it.hdus) ? it.hdus : [];
  const b = [ftHduWord(it.nh || d.length)];
  const img = d.find(h => h.kind === 'image' || h.kind === 'zimage');
  const tab = d.find(h => h.kind === 'table');
  if(img && img.dim && img.dim !== '()') b.push(img.dim.replace(/[()]/g, '') + ' ' + (img.format || ''));
  if(tab) b.push(tab.dim.replace('R x ', ' rows × ').replace('C', ' cols'));
  if(it.size) b.push(fmtBytes(it.size));
  return b.join(' · ');
}
/* ctrl+hover: the info table, short */
function ftPeek(it){
  const d = Array.isArray(it.hdus) ? it.hdus : [];
  return '<div class="sheetbox plist">' + (d.length
    ? d.slice(0, 9).map(h => '<span>' + esc(h.no + '  ' + (h.name || '—') + '  ' + h.klass.replace('HDU', '') +
        '  ' + h.dim) + '</span>').join('') +
      (d.length > 9 ? '<span class="more">+' + (d.length - 9) + ' more</span>' : '')
    : '<span class="more">not read yet</span>') + '</div>';
}

/* ---- getting one onto the page ----
   The digest is what survives without the file: enough to draw the card and its
   peek, and nothing like the headers themselves, which would put a megabyte of
   HISTORY into a document that is rewritten on every keystroke. */
const ftDigest = f => fitsInfo(f).map(r =>
  ({ no:r.no, name:r.name, ver:r.ver, klass:r.klass, cards:r.cards,
     dim:r.dim, format:r.format, bytes:r.bytes, kind:r.kind }));
function ftSync(it, f){
  const d = ftDigest(f);
  if(JSON.stringify(d) === JSON.stringify(it.hdus || null)) return;
  it.hdus = d; it.nh = d.length;
  queueSave(sheet().id);
}
async function ftRecord(file){
  let f;
  try{ f = await fitsOpen(file); }
  catch(e){ alert(String((e && e.message) || e)); return null; }
  if(file.size > 80 * 1024 * 1024 &&
     !confirm('That file is ' + (file.size / 1048576 | 0) + ' MB. It is kept inside the note, so backups get ' +
              'that much heavier. Keep it anyway?')) return null;
  const id = uid();
  if(!await mediaSet(id, file)){ alert('Could not store that file in this browser.'); return null; }
  MEDIA_URL[id] = URL.createObjectURL(file);
  FT_CACHE.set(id, f);
  return { id: uid(), type:'fits', media:id, name:file.name, size:file.size,
    cap:file.name, hdus:ftDigest(f), nh:f.hdus.length };
}
async function ftAdd(file, at){
  const r = await ftRecord(file);
  if(!r) return;
  const page = sheet();
  const pos = at || { x: 20 + Math.random() * 20, y: 20 + Math.random() * 30 };
  page.items.push({ ...r, x: clamp(pos.x, 2, 86), y: clamp(pos.y, 4, 84), w: 13,
    rot: 0, z: maxZ(page) + 1, lay: curLayerId() });
  queueSave(page.id); SND.plop(); render();
}

/* ================= the reader =================
   One window, built once per opening; typing in the search box repaints the
   panel under it and nothing else, so the caret stays where it was. */
let ftWin = null;                      // { it, f, sel, q, all } while the reader is up

async function ftOpen(it){
  ftWin = { it, f: null, sel: 0, q: '', all: false, pick: new Set() };
  ftFrame('reading the headers…');
  let f = FT_CACHE.get(it.media);
  if(!f){
    const b = await mediaGet(it.media);
    if(!ftWin || ftWin.it !== it) return;
    if(!b) return ftFrame('That file is not in this note any more.');
    try{ f = await fitsOpen(new File([b], it.name || 'file.fits')); }
    catch(e){ return ftFrame(String((e && e.message) || e)); }
    FT_CACHE.set(it.media, f);
  }
  if(!ftWin || ftWin.it !== it) return;              // closed again while it was being read
  ftWin.f = f;
  ftSync(it, f);
  ftFrame(null);
}
function ftFrame(note){
  const w = ftWin;
  if(!w) return;
  const v = $('#fview'), f = w.f;
  const body = winShell(v, w.it.name || 'FITS',
    f ? ftHduWord(f.hdus.length) + ' · ' + fmtBytes(w.it.size) : '',
    f ? [{ a:'copy', g:'⧉', t:'Copy this header, in the 80 columns it is written in' },
         { a:'save', g:'⤓', t:'Save a copy of the file' }, CLOSE_BTN] : [CLOSE_BTN], 'fits');
  viewStop = () => { ftWin = null; };
  if(!f){
    body.innerHTML = '<div class="ftnote">' + esc(note || '…') + '</div>';
    winActs(v, a => { if(a === 'close') closeViewer(); });
    return;
  }
  body.innerHTML =
    '<div class="ftinfo">' + ftInfoHTML(f) + '</div>' +
    '<div class="ftseek"><input class="ftq" type="text" spellcheck="false" autocomplete="off" ' +
      'placeholder="Search this header — keyword, value or comment">' +
      '<label title="Look in every HDU, not just the one below"><input class="ftall" type="checkbox"> all HDUs</label>' +
      '<span class="ftcount"></span></div>' +
    '<div class="ftpane"></div>';
  body.querySelector('.ftinfo').addEventListener('click', e => {
    const row = e.target.closest('.ftrow');
    if(!row) return;
    w.sel = +row.dataset.i; w.pick.clear();
    ftMarkRow(); ftPaint();
  });
  const q = body.querySelector('.ftq');
  q.addEventListener('input', () => { w.q = q.value; ftPaint(); });
  q.addEventListener('keydown', e => { if(e.key === 'Escape'){ e.stopPropagation(); q.value = ''; w.q = ''; ftPaint(); } });
  body.querySelector('.ftall').addEventListener('change', e => { w.all = e.target.checked; ftPaint(); });
  winActs(v, a => {
    if(a === 'close') return void closeViewer();
    if(a === 'copy'){ tbClip(fitsHeaderText(f.hdus[w.sel])); return; }
    withMediaURL(w.it, url => saveAttachment(w.it, url));
  });
  ftMarkRow(); ftPaint();
}
function ftMarkRow(){
  const v = $('#fview');
  v.querySelectorAll('.ftrow').forEach(r => r.classList.toggle('on', +r.dataset.i === ftWin.sel));
}

/* ---- hdu.info(), the seven columns astropy prints ---- */
function ftInfoHTML(f){
  let h = '<table class="fttab"><thead><tr><th class="r">No.</th><th>Name</th><th class="r">Ver</th><th>Type</th>' +
          '<th class="r">Cards</th><th>Dimensions</th><th>Format</th></tr></thead><tbody>';
  for(const r of fitsInfo(f))
    h += '<tr class="ftrow" data-i="' + r.no + '" title="' + esc(r.format) + '">' +
      '<td class="r">' + r.no + '</td><td>' + esc(r.name || '—') + '</td><td class="r">' + r.ver + '</td>' +
      '<td>' + esc(r.klass) + '</td><td class="r">' + r.cards + '</td>' +
      '<td class="m">' + esc(r.dim) + '</td><td class="m fmt">' + esc(r.format) + '</td></tr>';
  return h + '</tbody></table>';
}

/* ---- what the data is, without any of it ---- */
function ftChip(k, v){ return '<span class="ftchip"><b>' + esc(k) + '</b>' + esc(v) + '</span>'; }
function ftDataHTML(hd){
  const b = [];
  if(hd.kind === 'empty')
    b.push('<span class="ftchip none">no data — this HDU is a header and nothing else</span>');
  else if(hd.kind === 'image' || hd.kind === 'zimage'){
    const dims = hd.kind === 'zimage' ? hd.zdims : hd.dims;
    const n = dims.reduce((a, c) => a * c, 1);
    b.push(ftChip('shape', fitsShape(dims)));
    b.push(ftChip('dtype', hd.dtype));
    b.push(ftChip('values', n.toLocaleString()));
    b.push(ftChip('in the file', fmtBytes(hd.dataLen)));
    if(hd.kind === 'zimage')
      b.push('<span class="ftchip warn">tile-compressed' + (hd.zcmp ? ' (' + esc(hd.zcmp) + ')' : '') +
        ' — what the table below holds is the compressed tiles</span>');
    else if(hd.bzero != null || hd.bscale != null)
      b.push('<span class="ftchip warn">stored ' + esc(hd.stored) + ', and read as ' +
        esc(hd.bscale == null ? 'value' : hd.bscale + ' × value') +
        (hd.bzero == null ? '' : (hd.bzero < 0 ? ' − ' + Math.abs(hd.bzero) : ' + ' + hd.bzero)) + '</span>');
  }else{
    b.push(ftChip('rows', hd.rows.toLocaleString()));
    b.push(ftChip('columns', String(hd.cols.length)));
    b.push(ftChip('a row', hd.rowBytes.toLocaleString() + ' bytes'));
    b.push(ftChip('in the file', fmtBytes(hd.dataLen)));
    if(hd.heap) b.push(ftChip('heap', fmtBytes(hd.heap)));
  }
  let h = '<div class="ftdata">' + b.join('') + '</div>';
  if(hd.kind === 'table') h += ftColsHTML(hd, 1) + ftPickHTML(hd);
  else if(hd.kind === 'zimage') h += ftColsHTML(hd, 0);
  return h;
}
function ftColsHTML(hd, live){
  const cs = hd.cols.slice(0, FT_MAXCOLS), pick = ftPicked();
  if(!cs.length) return '';
  const asc = hd.xtension === 'TABLE';
  let h = '<table class="fttab ftcols' + (live ? ' live' : '') +
          '"><thead><tr><th>#</th><th>Name</th><th>Format</th><th>Type</th>' +
          '<th>A cell</th><th>Unit</th><th class="r">Values</th></tr></thead><tbody>';
  cs.forEach((c, i) => {
    const per = c.chars ? 1 : Math.max(1, c.rep);
    const why = live ? fitsColWhy(c, asc) : 'x';
    h += '<tr' + (live ? ' data-c="' + i + '"' + (why ? ' class="no" title="' + esc(why) + '"'
          : pick.has(i) ? ' class="pick"' : '') : '') + '>' +
      '<td class="r">' + c.n + '</td><td>' + esc(c.name) + '</td>' +
      '<td class="m">' + esc(c.form) + '</td><td class="m">' + esc(c.type) +
        (c.scale != null || c.zero != null ? ' <i title="this column is rescaled on the way out">scaled</i>' : '') +
      '</td><td class="m">' + esc(fitsCellShape(c)) + '</td><td>' + esc(c.unit || '—') + '</td>' +
      '<td class="r">' + (hd.rows * per).toLocaleString() + '</td></tr>';
  });
  if(hd.cols.length > cs.length)
    h += '<tr><td colspan="7" class="ftmore">…and ' + (hd.cols.length - cs.length) + ' more columns</td></tr>';
  return h + '</tbody></table>';
}

/* ================= a column, dragged out onto the sheet =================
   Pick columns in the list and drag any one of them off the reader: the window
   gets out of the way while you aim, and what lands is an ordinary **table** —
   which is the whole point, because a table already sorts, exports, feeds a
   node graph and drops onto a coordinate system to be plotted. Drop the drag on
   a table that is already on the sheet and the columns join it instead.

   What comes over is decided by js/lib/fits.js before anything is read, and
   said out loud in the table's own foot: a column that fits comes whole, a long
   one comes spread across the whole of it (every nth row, so the shape survives)
   where that is affordable, and only otherwise as its first rows. */
const ftPicked = () => (ftWin && ftWin.pick) || new Set();
function ftPickHTML(hd){
  const pick = [...ftPicked()], plan = fitsPlan(hd);
  const say = !pick.length
    ? 'Click a column to pick it — then drag it onto the sheet, and it lands there as a table'
    : pick.length + (pick.length === 1 ? ' column picked' : ' columns picked') +
      (plan.why ? ' · ' + plan.why : '') + ' — drag it out onto the sheet, or onto a table already there';
  return '<div class="ftpick' + (pick.length ? ' on' : '') + '"><span class="ftsay">' + esc(say) + '</span>' +
    (pick.length ? '<button class="ftout" title="Put them on the sheet without dragging">→ table</button>' : '') +
    '</div>';
}
function ftSay(msg, bad){
  const el = $('#fview').querySelector('.ftpick');
  if(!el) return;
  el.classList.toggle('bad', !!bad);
  const s = el.querySelector('.ftsay');
  if(s) s.textContent = msg;
}

/* ---- the header ---- */
const FT_TXT = c => c.t === 'txt' && (c.key === 'COMMENT' || c.key === 'HISTORY' || c.key === '');
const ftValStr = c => c.val === null ? '' : c.t === 'bool' ? (c.val ? 'T' : 'F') : String(c.val);
/* the first hit lit up, so a match down in a comment can be seen from the top */
function ftMark(s, q){
  const str = String(s == null ? '' : s);
  if(!q) return esc(str);
  const i = str.toLowerCase().indexOf(q.toLowerCase());
  if(i < 0) return esc(str);
  return esc(str.slice(0, i)) + '<mark>' + esc(str.slice(i, i + q.length)) + '</mark>' + esc(str.slice(i + q.length));
}
function ftCardHTML(c, q){
  return '<div class="ftc' + (FT_TXT(c) ? ' txt' : '') + (c.hier ? ' hier' : '') + '">' +
    '<span class="k">' + ftMark(c.key || (FT_TXT(c) ? '' : '—'), q) + '</span>' +
    '<span class="v ' + c.t + '">' + ftMark(ftValStr(c), q) + '</span>' +
    '<span class="c">' + ftMark(c.cmt || '', q) + '</span></div>';
}
/* A run of COMMENT or HISTORY is a pipeline talking to itself, and there can be
   two hundred of them between one real keyword and the next. Folded in place,
   so the order of the header is still the order of the header. */
function ftCardsHTML(hd){
  const cs = hd.cards, out = [];
  let i = 0, drawn = 0;
  while(i < cs.length && drawn < FT_MAXCARDS){
    const c = cs[i];
    if(FT_TXT(c)){
      let j = i;
      while(j < cs.length && FT_TXT(cs[j]) && cs[j].key === c.key) j++;
      if(j - i >= 4){
        out.push('<details class="ftfold"><summary>' + esc(c.key || 'blank') + ' · ' + (j - i) + ' cards</summary>' +
          cs.slice(i, j).map(x => ftCardHTML(x, '')).join('') + '</details>');
        drawn++; i = j; continue;
      }
    }
    out.push(ftCardHTML(c, '')); drawn++; i++;
  }
  if(i < cs.length)
    out.push('<div class="ftmore">…and ' + (cs.length - i) + ' more cards — search to narrow it down</div>');
  return out.join('');
}
function ftFoundHTML(w){
  const hs = w.all ? w.f.hdus : [w.f.hdus[w.sel]];
  const res = fitsFind(hs, w.q) || [];
  if(!res.length) return '<div class="ftnote">nothing in ' + (w.all ? 'this file' : 'this header') +
    ' says “' + esc(w.q) + '”.</div>';
  let h = '', last = null;
  for(const r of res.slice(0, FT_MAXCARDS)){
    if(w.all && r.hdu !== last){
      last = r.hdu;
      h += '<div class="fthit" data-i="' + r.hdu.i + '">' + r.hdu.i + ' · ' + esc(r.hdu.name || r.hdu.klass) + '</div>';
    }
    h += ftCardHTML(r.card, w.q);
  }
  if(res.length > FT_MAXCARDS) h += '<div class="ftmore">…and ' + (res.length - FT_MAXCARDS) + ' more matches</div>';
  return h;
}
function ftPaint(){
  const w = ftWin;
  if(!w || !w.f) return;
  const pane = $('#fview').querySelector('.ftpane');
  if(!pane) return;
  const hd = w.f.hdus[w.sel] || w.f.hdus[0];
  const hits = w.q ? (fitsFind(w.all ? w.f.hdus : [hd], w.q) || []).length : 0;
  const tot = w.all ? w.f.hdus.reduce((n, x) => n + x.cards.length, 0) : hd.cards.length;
  const tag = $('#fview').querySelector('.ftcount');
  if(tag) tag.textContent = w.q ? hits + ' of ' + tot + ' cards' : tot + (tot === 1 ? ' card' : ' cards');
  pane.innerHTML = '<div class="fthead">' + esc(hd.i + ' · ' + (hd.name || hd.klass)) +
      '<i>' + esc(hd.klass) + '</i></div>' +
    (w.q ? '' : ftDataHTML(hd)) +
    '<div class="ftcards">' + (w.q ? ftFoundHTML(w) : ftCardsHTML(hd)) + '</div>';
  ftWireCols(pane);
  const jump = pane.querySelectorAll('.fthit');
  jump.forEach(el => el.addEventListener('click', () => {
    w.sel = +el.dataset.i; w.q = ''; w.all = false; w.pick.clear();
    const q = $('#fview').querySelector('.ftq'), a = $('#fview').querySelector('.ftall');
    if(q) q.value = ''; if(a) a.checked = false;
    ftMarkRow(); ftPaint();
  }));
}

/* ---- picking, and pulling out ----
   A press that goes nowhere picks the column; one that travels is a drag. The
   reader fades almost away while it does — it covers the whole sheet, and you
   cannot aim at paper you cannot see. */
let ftHaul = null;                     // { cols, ghost, over } while a drag is in flight
function ftWireCols(pane){
  const w = ftWin, tb = pane.querySelector('.ftcols.live');
  const out = pane.querySelector('.ftout');
  if(out) out.addEventListener('click', () => ftPour([...w.pick].sort((a, b) => a - b), null, null));
  if(!tb) return;
  tb.addEventListener('pointerdown', e => {
    const tr = e.target.closest('tr[data-c]');
    if(!tr || tr.classList.contains('no')) return;
    e.preventDefault();
    const i = +tr.dataset.c, sx = e.clientX, sy = e.clientY, pid = e.pointerId;
    let moved = false;
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      if(!moved){
        if(Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        moved = true;
        /* dragging a column nobody picked drags that one alone */
        if(!w.pick.has(i)){ w.pick.clear(); w.pick.add(i); ftPaint(); }
        ftHaulStart();
      }
      ftHaulMove(ev);
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if(!moved){                                    // a tap: pick it, or put it back
        if(w.pick.has(i)) w.pick.delete(i); else w.pick.add(i);
        ftPaint();
        return;
      }
      ftHaulEnd(ev, ev.type === 'pointerup');
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
function ftHaulStart(){
  const hd = ftWin.f.hdus[ftWin.sel];
  const names = [...ftWin.pick].sort((a, b) => a - b).map(i => (hd.cols[i] || {}).name || '?');
  const g = document.createElement('div');
  g.className = 'ftghost';
  g.innerHTML = names.slice(0, 5).map(n => '<span>' + esc(n) + '</span>').join('') +
    (names.length > 5 ? '<span>+' + (names.length - 5) + ' more</span>' : '');
  document.body.appendChild(g);
  ftHaul = { ghost: g, over: null };
  $('#fview').classList.add('ftaway');
}
function ftHaulMove(ev){
  if(!ftHaul) return;
  ftHaul.ghost.style.left = ev.clientX + 'px';
  ftHaul.ghost.style.top = ev.clientY + 'px';
  const t = ftTableUnder(ev);
  if((t && t.el) === (ftHaul.over && ftHaul.over.el)) return;
  if(ftHaul.over) ftHaul.over.el.classList.remove('dropinto');
  ftHaul.over = t;
  if(t) t.el.classList.add('dropinto');
}
function ftHaulEnd(ev, ok){
  const h = ftHaul;
  ftHaul = null;
  if(!h) return;
  h.ghost.remove();
  if(h.over) h.over.el.classList.remove('dropinto');
  $('#fview').classList.remove('ftaway');
  if(!ok || !ftWin) return;
  const surf = document.querySelector('#pageHost .surface');
  const r = surf && surf.getBoundingClientRect();
  /* let go off the paper and nothing happens — the picks are still picked */
  if(!h.over && (!r || ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom))
    return ftSay('let go over the sheet, or over a table already on it');
  ftPour([...ftWin.pick].sort((a, b) => a - b), h.over, h.over ? null : pctFrom(ev, surf));
}
function ftTableUnder(ev){
  for(const n of document.elementsFromPoint(ev.clientX, ev.clientY)){
    const el = n.closest && n.closest('#pageHost .item');
    if(!el) continue;
    const pg = pageOfEl(el);
    const it = pg && pg.items.find(x => x.id === el.dataset.id);
    return it && it.type === 'table' ? { el, it, page: pg } : null;
  }
  return null;
}

/* ---- and what lands ---- */
async function ftPour(idxs, target, at){
  const w = ftWin;
  if(!w || !w.f || !idxs.length) return;
  const hd = w.f.hdus[w.sel];
  ftSay('reading ' + idxs.length + (idxs.length === 1 ? ' column…' : ' columns…'));
  let got;
  try{ got = await fitsColumns(w.f, hd, idxs, fitsPlan(hd)); }
  catch(e){ return ftSay(String((e && e.message) || e), 1); }
  if(!ftWin) return;                                 // closed while it was being read
  const page = sheet();
  const name = (hd.name || ('HDU ' + hd.i)) + ' · ' + (w.it.name || 'fits');
  const it = target ? ftInto(target.it, got) : ftNewTable(got, name, at, page);
  closeViewer();
  queueSave(page.id); SND.plop();
  await render();
  select(it.id);
}
function ftNote(it, got){
  if(got.note) it.note = got.note; else delete it.note;
}
function ftNewTable(got, name, at, page){
  /* readings are set smaller than writing, the way a table read off a file is */
  const it = { id: uid(), type:'table', fs:13, rot:0, z: maxZ(page) + 1, lay: curLayerId(),
    ts:'lines', cap:'', rows:[['']], cw:[1], al:['l'] };
  const put = tbFill(it, got, name);
  ftNote(it, got);
  it.w = clamp((8 + put.units * 1.25) * pgK(), 26, 94);
  const pos = at || viewCentre(page);
  it.x = clamp(pos.x, 2, Math.max(2, 100 - it.w));
  it.y = clamp(pos.y, 4, 88);
  page.items.push(it);
  return it;
}
/* dropped on a table that is already there: the columns go in beside what it
   holds. A table with no header row does not want the names in a reading row. */
function ftInto(it, got){
  const block = tbHead(it) ? got.rows : got.rows.slice(1);
  tbPour(it, 0, tbNC(it), block);
  delete it.sort;                                    // whatever it was sorted by no longer sorts it
  ftNote(it, got);
  tbCW(it); tbAl(it); tbAutoAlign(it); tbFit(it);
  tbSync(it);                                        // a plot reading it is reading it still
  return it;
}

/* ================= the item ================= */
defineItem('fits', {
  add: { fits: { pick: at => { pendingAt = at || null; $('#fitsInput').click(); } } },
  sound: 'plop',
  exportMaxBytes: 12 * 1024 * 1024,   // heavier than this and it stays out of an export
  takesRank: 3,                       // asked before the picture and the workbook, so a .fits is never an attachment
  takes(fs, at){
    const f = (fs || []).find(fitsIsFile);
    if(!f) return false;
    ftAdd(f, at);
    return true;
  },
  html: (it, c) => shortcutHTML(it, c, false),
  icon: ftGlyph,
  label: it => it.name || 'FITS file',
  meta: ftMeta,
  peek: ftPeek,
  open: it => ftOpen(it),
  tools(mk, it){ mk('↗', 'Read this FITS file — the HDUs, and their headers', () => ftOpen(it)); },
  wire(el, it, page){ wireIcon(el, it, page); }
});
$('#fitsInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if(f) ftAdd(f, takePendingAt());
  e.target.value = '';
});

/* ---- how it looks ---- */
addCSS('fits', `
/* the shortcut's own plate — a bit of sky with a crosshair over it */
.ficon .ftplate{fill:color-mix(in srgb,#1b2436 82%,var(--paper))}
.ficon .ftstar{fill:#f2ead8}
.ficon .ftgrid{stroke:color-mix(in srgb,var(--accent2) 76%,#fff);stroke-width:1.8;opacity:.8}
/* the reader: the info table, a search bar, then whichever HDU is picked */
.fview .fbody.fits{background:color-mix(in srgb,var(--paper) 94%,#fff);display:flex;flex-direction:column;
  overflow:hidden;font-family:var(--mono);color:var(--ink)}
.fview .w-fits{width:min(1180px,95vw)}
.ftnote{padding:22px;font-size:12px;letter-spacing:.04em;opacity:.75}
.ftinfo{flex:none;max-height:31%;overflow:auto;border-bottom:1px solid color-mix(in srgb,var(--ink) 22%,var(--paper))}
.fttab{width:100%;border-collapse:collapse;font-size:11.5px;line-height:1.45}
.fttab th{position:sticky;top:0;z-index:1;text-align:left;font-weight:400;padding:5px 9px;
  background:color-mix(in srgb,var(--accent2) 20%,var(--paper));
  border-bottom:1px solid color-mix(in srgb,var(--ink) 26%,var(--paper));
  letter-spacing:.1em;text-transform:uppercase;font-size:9.5px;opacity:.95;white-space:nowrap}
.fttab td{padding:4px 9px;border-bottom:1px solid color-mix(in srgb,var(--ink) 9%,var(--paper));white-space:nowrap}
.fttab td.r,.fttab th.r{text-align:right;font-variant-numeric:tabular-nums}
.fttab td.m{opacity:.86}
.fttab td.fmt{max-width:34ch;overflow:hidden;text-overflow:ellipsis}
.fttab td i{font-style:normal;opacity:.6;font-size:10px}
.ftrow{cursor:pointer}
.ftrow:hover td{background:color-mix(in srgb,var(--accent) 10%,transparent)}
.ftrow.on td{background:color-mix(in srgb,var(--accent) 22%,transparent)}
.ftrow.on td:first-child{box-shadow:inset 2.5px 0 0 var(--accent)}
.ftmore{padding:6px 9px;font-size:10.5px;opacity:.6;letter-spacing:.04em}
/* the search bar */
.ftseek{flex:none;display:flex;align-items:center;gap:10px;padding:7px 9px;
  background:color-mix(in srgb,var(--paper) 80%,var(--ink));
  border-bottom:1px solid color-mix(in srgb,var(--ink) 22%,var(--paper))}
.ftseek .ftq{flex:1;min-width:0;font:inherit;font-size:11.5px;padding:5px 8px;color:var(--ink);
  background:color-mix(in srgb,var(--paper) 96%,#fff);border:0;
  box-shadow:inset 1.4px 1.4px 0 color-mix(in srgb,var(--ink) 34%,var(--paper)),
             inset -1.4px -1.4px 0 color-mix(in srgb,var(--paper) 60%,#fff)}
.ftseek label{display:flex;align-items:center;gap:5px;font-size:10.5px;letter-spacing:.06em;
  opacity:.8;white-space:nowrap;cursor:pointer}
.ftcount{font-size:10px;letter-spacing:.08em;opacity:.6;white-space:nowrap;min-width:11ch;text-align:right}
/* the picked HDU */
.ftpane{flex:1;min-height:0;overflow:auto}
.fthead{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:10px;
  padding:6px 10px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:#f3f0ea;background:color-mix(in srgb,var(--accent2) 78%,var(--ink))}
.fthead i{font-style:normal;opacity:.7}
.ftdata{display:flex;flex-wrap:wrap;gap:6px;padding:9px 10px;
  background:color-mix(in srgb,var(--accent) 8%,var(--paper))}
.ftchip{display:inline-flex;align-items:baseline;gap:6px;padding:3px 8px;font-size:11px;
  background:color-mix(in srgb,var(--paper) 96%,#fff);
  box-shadow:inset 1.2px 1.2px 0 color-mix(in srgb,var(--paper) 60%,#fff),
             inset -1.2px -1.2px 0 color-mix(in srgb,var(--ink) 34%,var(--paper))}
.ftchip b{font-weight:400;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;opacity:.6}
.ftchip.warn{background:color-mix(in srgb,#d8a53c 30%,var(--paper))}
.ftchip.none{opacity:.7}
.ftcols{border-top:1px solid color-mix(in srgb,var(--ink) 18%,var(--paper))}
/* the cards: keyword, value, comment, in three tracks that line up down the page */
.ftcards{padding:4px 0 18px}
.ftc{display:grid;grid-template-columns:22ch minmax(10ch,26ch) 1fr;gap:0 12px;padding:1.5px 10px;
  font-size:11.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.ftc:hover{background:color-mix(in srgb,var(--accent) 9%,transparent)}
.ftc .k{color:color-mix(in srgb,var(--accent2) 74%,var(--ink))}
.ftc .v{font-variant-numeric:tabular-nums}
.ftc .v.str{color:color-mix(in srgb,#3f7d4e 76%,var(--ink))}
.ftc .v.int,.ftc .v.float{color:color-mix(in srgb,#a2532a 78%,var(--ink))}
.ftc .v.bool{color:color-mix(in srgb,#7a4fa8 76%,var(--ink))}
.ftc .c{opacity:.55}
.ftc.txt .k{opacity:.5}
.ftc.txt .c{grid-column:2/4;opacity:.62}
.ftc.hier .k{color:color-mix(in srgb,#7a4fa8 70%,var(--ink))}
.ftc mark{background:color-mix(in srgb,var(--accent) 55%,#fff);color:var(--ink)}
.ftfold{margin:1px 10px;background:color-mix(in srgb,var(--ink) 5%,transparent)}
.ftfold>summary{cursor:pointer;padding:3px 6px;font-size:10.5px;letter-spacing:.08em;opacity:.7;list-style:none}
.ftfold>summary::-webkit-details-marker{display:none}
.ftfold>summary::before{content:"▸ ";opacity:.8}
.ftfold[open]>summary::before{content:"▾ "}
.ftfold .ftc{padding-left:16px}
.fthit{position:sticky;top:0;padding:4px 10px;margin-top:6px;font-size:10px;letter-spacing:.12em;
  text-transform:uppercase;cursor:pointer;color:#f3f0ea;
  background:color-mix(in srgb,var(--accent2) 56%,var(--ink))}
.fthit:hover{background:var(--accent2)}
/* picking columns, and hauling them out onto the paper */
.ftcols.live tr[data-c]{cursor:grab}
.ftcols.live tr[data-c]:hover td{background:color-mix(in srgb,var(--accent) 10%,transparent)}
.ftcols.live tr.pick td{background:color-mix(in srgb,var(--accent) 26%,transparent)}
.ftcols.live tr.pick td:first-child{box-shadow:inset 2.5px 0 0 var(--accent)}
.ftcols.live tr.no{opacity:.42;cursor:not-allowed}
.ftpick{display:flex;align-items:center;gap:10px;padding:7px 10px;font-size:10.5px;letter-spacing:.05em;
  border-top:1px solid color-mix(in srgb,var(--ink) 18%,var(--paper));opacity:.72}
.ftpick.on{opacity:1;background:color-mix(in srgb,var(--accent) 12%,var(--paper))}
.ftpick.bad{background:color-mix(in srgb,#c2452c 22%,var(--paper));opacity:1}
.ftpick .ftsay{flex:1;min-width:0}
.ftout{flex:none;font:inherit;font-size:10.5px;letter-spacing:.08em;padding:4px 10px;color:var(--ink);
  background:color-mix(in srgb,var(--paper) 96%,#fff);
  box-shadow:inset 1.4px 1.4px 0 color-mix(in srgb,var(--paper) 60%,#fff),
             inset -1.4px -1.4px 0 color-mix(in srgb,var(--ink) 40%,var(--paper))}
.ftout:hover{background:color-mix(in srgb,var(--accent) 26%,var(--paper))}
/* the reader gets out of the way while you aim — you cannot drop on paper you cannot see */
.fview{transition:opacity .12s ease}
.fview.ftaway{opacity:.05;pointer-events:none}
.ftghost{position:fixed;z-index:99;pointer-events:none;transform:translate(-14px,-50%);
  display:flex;flex-direction:column;gap:2px;font-family:var(--mono)}
.ftghost span{font-size:11px;padding:3px 9px;color:#f3f0ea;letter-spacing:.04em;
  background:color-mix(in srgb,var(--accent2) 86%,var(--ink));box-shadow:0 6px 16px rgba(0,0,0,.45)}
@media (pointer:coarse){ .ftc{font-size:12.5px} .fttab{font-size:12.5px} }
`);
defineIcon('fits', '<path d="M4.5 5.5h15v13h-15z"/><path d="M4.5 12h15M12 5.5v13"/>' +
  '<circle cx="8.2" cy="8.7" r="1.05"/><circle cx="15.6" cy="15.4" r="1.35"/><circle cx="16.2" cy="8.4" r=".8"/>');
defineTool({ kind:'fits', cat:'science', label:'FITS file', icon:'fits', order:40,
  hint:'An astronomy .fits — read its HDUs and search the headers' });
