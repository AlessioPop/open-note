/* Open Note — core/registry.js
   the one place a new kind of thing announces itself */

/* ================= the item registry =================
   Everything you can put on a page — a note, a plot, a deck of cards — lives in
   its own file under js/items/ and registers itself here. Core never learns any
   type's name: it asks the registry what to draw, what buttons to hang on it,
   what it owns and how to make a new one.

   Adding a kind of item is therefore: write js/items/<name>.js, call
   defineItem() in it, and add one <script> line to index.html. Nothing else in
   the app has to be touched.

   The whole contract, all of it optional bar `html`:

     defineItem('note', {
       add:     { note: base => ({...base, type:'note', w:32}) },  // menu kind → a new item
       sound:   'plop',          // what adding one sounds like: plop | pop | tape
       sizeable: true,           // give it the A− / A+ buttons
       autoWidth: false,         // true if it sizes itself and ignores it.w
       html:    (it, c) => '…',  // its markup. c = {live, urls, page, idx}
       mount:   (el, it, c) => {},          // runs for print and exports too
       tools:   (mk, it, el, page) => {},   // its own toolbar buttons
       wire:    (el, it, page) => {},       // live behaviour, on screen only
       after:   (it, el, page) => {},       // what happens right after it is added
       key:     e => false,                 // true when the feature consumed a local key gesture
       media:   it => [],        // extra stored blobs it owns, beyond it.media
       takes:   (files, at, page) => false,   // claim files dropped on the page
       takesRank: 1,             // …how keenly, when two features could both want them
       fileable: true,           // may be dropped into a folder (bring icon/label/open)
       palette: false,           // keep legacy/programmatic add-kinds out of the main palette
       icon:    it => '…',       // how it looks as an icon — in a folder, or folded down
       label:   it => 'name',    // …what it is called under that icon
       meta:    it => '3 columns · 812 rows',   // …and the line beside the name
       open:    (it, page) => {},             // what a click on that icon opens
       peek:    it => '…',       // what ctrl+hover shows of it
       css:     `…`              // its own styles
     })

   Order matters in only one place: a type must be registered before the first
   page is drawn, which is why index.html loads every items/ file before boot.js. */

const ITEMS = {};                  // type name → its spec
const ADD_KINDS = {};              // add-menu kind → {type, make, spec}
const ITEM_CSS = [];               // every feature's styles, in load order

function defineItem(type, spec){
  if(ITEMS[type]) console.warn('two features both call themselves "' + type + '"');
  spec.type = type;
  ITEMS[type] = spec;
  /* One feature can offer several menu entries — the five text styles are all
     `text`, and the five wireframes are all `solid`. An entry either makes an
     item there and then, or is `{pick}` and goes off to a file dialog first. */
  for(const kind in (spec.add || {})){
    const e = spec.add[kind];
    ADD_KINDS[kind] = typeof e === 'function'
      ? { type, make: e, spec } : { type, pick: e.pick, spec };
  }
  if(spec.css) addCSS(type, spec.css);
  return spec;
}

/* A module's own styles. Features use it, and so do the tools around the book —
   anything that would otherwise have to reach into index.html to be seen. */
function addCSS(label, css){
  ITEM_CSS.push('/* ---- ' + label + ' ---- */\n' + String(css).trim());
}

/* ---- the palette: what the add-panel offers, and on which shelf ----
   A feature that can be added to the page also says where it belongs in the
   palette (js/ui/palette.js) — its shelf, its label, its icon, the sentence
   under the pointer. The palette is drawn entirely from these, so a new
   feature's menu entry lives in the feature's own file, not in index.html.

     defineTool({ kind:'note', cat:'write', group:'Paper', label:'Sticky', icon:'note',
                  hint:'Sticky notes in 5 colours', order:50 })

   `kind` is the add-menu kind the feature registered in defineItem's `add`.
   `group` optionally gives a crowded shelf labelled subsections; `groupOrder`
   orders those sections. `order` sorts within one (default 50, ties keep load order).
   A shelf itself is one line — palette.js declares the five standard ones:

     defineToolCat('write', { label:'Write', icon:'pencil', order:10 })   */
const TOOL_CATS = {};              // shelf id → {label, icon, order}
const TOOLS = [];                  // every entry, in load order
function defineToolCat(id, spec){ TOOL_CATS[id] = { order: 50, ...spec, id }; }
function defineTool(spec){ TOOLS.push({ order: 50, ...spec, seq: TOOLS.length }); }

/* Which features want a look at files dropped on the page, keenest first. A
   model claims a whole handful at once — an .obj with its .mtl and its textures
   — so it has to be asked before the picture feature sees the .png among them. */
const fileTakers = () => Object.keys(ITEMS).filter(t => ITEMS[t].takes)
  .sort((a, b) => (ITEMS[b].takesRank || 0) - (ITEMS[a].takesRank || 0));

/* what core asks about an item it has been handed */
const specOf   = it => ITEMS[it && it.type] || {};
/* a card sizes itself from its own contents rather than from it.w */
const autoWidth = it => !!specOf(it).autoWidth;
/* the A− / A+ pair belongs to anything whose writing can be resized */
const sizeable  = it => !!specOf(it).sizeable;

/* Which boxes take LaTeX as you type. A `.txt`, a caption, a table cell and the
   two faces of a flip card all compile $$…$$, and chrome/mathpad.js hangs the
   completions, the live proof and the $ pairing off whichever of them has the
   caret. A feature that puts writing on the page says so once, by selector:

     defineMathBox('.tc')

   Core does not keep the list — this is the only place that knows there is one. */
const MATH_BOXES = [];
const defineMathBox = sel => MATH_BOXES.push(sel);
const mathBoxSel = () => MATH_BOXES.join(',');

/* Some of what a page shows is drawn BETWEEN items rather than inside one — the
   strings tied across a detective board, the wires between nodes. On screen a
   feature can put that up itself, but a print, an export, a thumbnail and a
   shelf cover are built from scratch with no live board to hang it on, so they
   ask here instead. A hook is handed the page's wrapper, already laid out. */
const PAGE_OVERLAYS = [];
const onPageOverlay = fn => PAGE_OVERLAYS.push(fn);
const drawPageOverlays = (wrap, page, idx) => PAGE_OVERLAYS.forEach(f => f(wrap, page, idx));

/* A feature may keep state that belongs to the open book rather than to any one
   item — which decks are being written, which plot the chip is on. Closing a
   book has to clear it, and core should not have to know what "it" is. */
const NOTE_OPEN_HOOKS = [];
const onNoteOpen = fn => NOTE_OPEN_HOOKS.push(fn);
const resetForNewNote = () => NOTE_OPEN_HOOKS.forEach(f => f());

/* Selection owns the gesture and the generic actions; a feature may add one
   operation for a set it understands without teaching core what that set is.

     defineSelectionAction({ id:'tidy-logic', label:'Tidy logic',
       title:'Lay this circuit out in signal order',
       when:(items, page) => true, run:(items, page) => {} }) */
const SELECTION_ACTIONS = [];
function defineSelectionAction(spec){
  if(!spec || !spec.id || typeof spec.run !== 'function') return;
  const at = SELECTION_ACTIONS.findIndex(x => x.id === spec.id);
  if(at >= 0) SELECTION_ACTIONS.splice(at, 1);
  SELECTION_ACTIONS.push({ order: 50, ...spec });
}

/* Styles travel with their feature, but the export writes ONE stylesheet into
   the file it hands you, so everything lands in the single <style id="appcss">
   that index.html already carries. Nothing else has to know. */
function installItemCSS(){
  const tag = document.getElementById('appcss');
  if(!tag || !ITEM_CSS.length) return;
  tag.textContent += '\n\n/* ===== styles that came with the item modules ===== */\n' +
    ITEM_CSS.join('\n\n') + '\n';
}
