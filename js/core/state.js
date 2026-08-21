/* Open Note — core/state.js
   the open note, its sheet, and what is selected */

/* ================= state =================
   A note is ONE endless sheet. `index` still carries a `pages` array because
   that is the shape on disk and what save.js, history.js and layers.js are
   written against — but it has exactly one entry, and `sheet()` is the only
   way anything asks for it.

   Three names on disk keep the old vocabulary on purpose: the IndexedDB
   database is still `devlog-sketchbook`, the library key is still `library`,
   and a note is still filed under `book:<id>`. Changing any of them orphans
   every note anyone has already made. */
let lib = null;            // {lastOpen, books:[{id,name,created,updated}]} — `books` is the stored field
let curNoteId = null;
let index = null;          // the open note: {kind:'canvas', pgmax, theme, settings:{}, pages:[one]}
let pages = new Map();
let selected = null;
const SELECTED = new Set();             // one id for an ordinary pick; several for a marquee pick
const MEDIA_URL = {};
let zoom = 1, panX = 0, panY = 0;

/* the one sheet, or null before a note is open */
function sheet(){
  const m = index && index.pages[0];
  return m ? pages.get(m.id) || null : null;
}
/* Features ask for "everything on screen" rather than for the sheet, because a
   sheet is what happens to be on screen today. One call site to change if that
   is ever more than one again. */
const openPages = () => { const s = sheet(); return s ? [s] : []; };

function blankSheet(src){
  const s = src || index;
  const def = (s && s.settings && s.settings.defPaper) || 'grid';
  return { id: uid(), title: 'Canvas',
    date: new Date().toISOString().slice(0, 10),
    paper: def, items: [] };
}
