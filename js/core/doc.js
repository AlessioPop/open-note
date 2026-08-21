/* Open Note — core/doc.js
   making, opening and reading a note */

/* ================= the note =================
   A note is one endless sheet. It starts three normal pages across and two
   down, and grows from the rails along its edges — core/sheet.js.

   No grain to start with: the grain is an SVG filter rasterised over the whole
   sheet, and a sheet is much bigger than a page. The switch for it is in the
   menu like everything else. */
const SHEET_W = 1980, SHEET_H = 1320;        // three normal pages across, two down
const SHEET_MAX = 16000;                     // how big it may ever get

async function createNote(name){
  const doc = { kind: 'canvas', pgmax: SHEET_MAX, theme: 'graph',
                settings: { pgw: SHEET_W, pgh: SHEET_H, grain: false }, pages: [] };
  const p = blankSheet(doc);
  doc.pages = [{ id: p.id, title: p.title, date: p.date }];
  await kvSet(kPage(p.id), p);
  const id = uid();
  await kvSet(kBook(id), doc);
  lib.books.push({ id, name: name || 'Note ' + (lib.books.length + 1),
                   created: Date.now(), updated: Date.now() });
  await kvSet(K_LIB, lib);
  return id;
}

async function openNote(id){
  await flush();                                  // park whatever note was open before
  const doc = await kvGet(kBook(id));
  if(!doc){ alert('This note could not be loaded.'); return; }
  curNoteId = id;
  index = doc; index.settings = index.settings || {};
  pages = new Map();
  select(null);
  panX = panY = 0; setZoom(1);
  layers(index); curLayerId(); queueIndex();      // stable layer ids from the first open
  focusLayer = null; setDraw(false); setMath(false); renderLayers();
  resetForNewNote();                              // features drop whatever they were holding
  applyTheme(); syncSound();
  lib.lastOpen = id; queueLib();
  await render();
  $('#shelf').classList.remove('open');
  SND.flip();
}

/* the sheet, read in the first time it is asked for */
async function loadSheet(){
  const meta = index && index.pages[0];
  if(!meta) return null;
  if(!pages.has(meta.id)){
    const p = await kvGet(kPage(meta.id));
    pages.set(meta.id, p || { id:meta.id, title:meta.title, date:meta.date, paper:'grid', items:[] });
    /* what it says as it comes in is what an undo puts back */
    if(typeof histSeed === 'function') histSeed(pages.get(meta.id));
  }
  return pages.get(meta.id);
}

async function deleteNote(id){
  const doc = await kvGet(kBook(id));
  if(doc) for(const m of doc.pages){
    const p = pages.get(m.id) || await kvGet(kPage(m.id));
    if(p) for(const it of p.items || []) for(const mid of mediaIds(it)){ await mediaDel(mid); dropMedia(mid); }
    await kvDel(kPage(m.id));
    pages.delete(m.id);
  }
  await kvDel(kBook(id));
  lib.books = lib.books.filter(b => b.id !== id);
  if(lib.lastOpen === id) lib.lastOpen = null;
  if(curNoteId === id){ curNoteId = null; index = null; $('#pageHost').innerHTML = ''; }
  await kvSet(K_LIB, lib);
}
