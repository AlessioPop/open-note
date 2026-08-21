/* Open Note — boot.js
   start here: open the last note, or the shelf */

/* ================= boot =================
   Every module has loaded and every feature has registered itself by the time
   this runs — which is why it is the last <script> in index.html. */

/* ---- the books that used to be here ----
   Up to 0.1.0-alpha.2 a note could also be a BOOK: a cover, a stack of pages,
   bookmarks down the fore-edge. That is gone, and one endless sheet is all
   there is. A book has nowhere to open any more, so it is offered back as a
   backup file once and then let go of — dropping it silently would be losing
   someone's work without telling them.

   The offer is made once per library and remembered, so a machine that has
   already been through this never sees it again. */
async function retireBooks(){
  if(lib.retiredBooks) return;
  const olds = [];
  for(const b of lib.books){
    const doc = await kvGet(kBook(b.id));
    if(doc && doc.kind !== 'canvas') olds.push({ entry: b, doc });
  }
  if(!olds.length){ lib.retiredBooks = true; await kvSet(K_LIB, lib); return; }
  const names = olds.map(o => '· ' + (o.entry.name || 'Untitled')).join('\n');
  const keep = confirm(
    'Open Note no longer has books of pages — a note is one endless sheet now.\n\n' +
    olds.length + (olds.length === 1 ? ' sketchbook' : ' sketchbooks') + ' cannot be opened any more:\n' +
    names + '\n\nSave ' + (olds.length === 1 ? 'it' : 'them') + ' as backup files before they go?\n' +
    'Cancel removes ' + (olds.length === 1 ? 'it' : 'them') + ' without saving.');
  for(const o of olds){
    if(keep) await downloadBook(o);
    await deleteNote(o.entry.id);
  }
  lib.retiredBooks = true;
  await kvSet(K_LIB, lib);
}

/* the same shape chrome/backup.js writes, straight off the store — the book is
   not open and never will be, so nothing here goes through the live state */
async function downloadBook(o){
  const out = { format: 'open-note/4', index: o.doc, pages: [], media: {} };
  for(const m of o.doc.pages){
    const p = await kvGet(kPage(m.id));
    if(!p) continue;
    out.pages.push(p);
    for(const it of p.items || []) for(const mid of mediaIds(it)){
      if(out.media[mid]) continue;
      const b = await mediaGet(mid);
      if(b) out.media[mid] = await blobToDataURL(b);
    }
  }
  const name = (o.entry.name || 'sketchbook').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sketchbook';
  await plSaveFile(name + '-book.json', new Blob([JSON.stringify(out)], { type: 'application/json' }));
}

(async function init(){
  installItemCSS();                               // the features' own styles join the stylesheet
  lib = await kvGet(K_LIB);
  if(!lib){ lib = { lastOpen: null, books: [], retiredBooks: true }; await kvSet(K_LIB, lib); }
  const d = await db();
  if(!d){ const t = $('#saveTag'); t.textContent = 'no browser storage — use Back up!'; t.classList.add('show'); }
  await retireBooks();
  if(!lib.books.length) await openNote(await createNote('My note'));
  /* straight back to whatever was open — a note app opens the note, not the shelf */
  else if(lib.lastOpen && lib.books.some(b => b.id === lib.lastOpen)) await openNote(lib.lastOpen);
  else await openShelf();
})();
