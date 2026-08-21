# How it's built

Everything below is for working *on* the sketchbook rather than in it.

## The shape of it

```
index.html          the markup, and the base stylesheet — the shell, not the features
js/
  core/             the engine: storage, state, and the page itself
  items/            one file per thing you can put on a page
  ui/               the tools around the book
  lib/              the pieces that owe nothing to this app at all
  boot.js           opens the last book — the last <script> on the page
fonts/              the four families, carried locally — no network to set type
desktop/            the Electron shell: a window around the app, never a part of it
```

**One feature is one file.** A feature's markup, its behaviour, its toolbar buttons, the entry it puts in the add menu and its stylesheet all live together in that one file, and it announces itself to the rest of the app by calling `defineItem()`. Nothing in `core/` mentions a note, a plot or a deck of cards by name — it asks the registry.

## Four rules that keep it that way

1. **No build step, and none coming.** No bundler, no transpiler, no dependencies — nothing in `js/` is generated, and double-clicking `index.html` has to open a working app. `package.json` does not change that: it belongs to the Electron shell in `desktop/`, which *wraps* the app and is never imported by it. Delete `desktop/`, `package.json` and `node_modules/` and everything still runs.
2. **Classic `<script>` files, not ES modules.** A `type="module"` script *never executes* from `file://` — the browser blocks it — so `import` would mean the app only ran off a web server. Classic scripts run both ways, which is also what a phone's WebView will want later. They share one scope: a `const` or `function` in one file is visible in every file loaded after it, and (at run time) in the ones before it too. Nothing is on `window`.
3. **Load order is the dependency graph.** `index.html` lists the files in the order they must load. Three positions are load-bearing: `core/registry.js` is first, because every feature calls into it while it loads; `ui/icons.js` sits just ahead of the items, so a feature can `defineIcon()` its own tile drawing as it loads; and `js/boot.js` is last, because it starts the app and everything must be registered by then. Everything between is grouped for readability.
4. **A feature's CSS travels with the feature.** `addCSS()` collects it and `installItemCSS()` appends it all to the single `<style id="appcss">` at boot. That matters because **Export book** hands you a self-contained `.html` with one inlined stylesheet, read straight out of that tag — so styles in separate `.css` files would silently vanish from every exported book (a `file://` page cannot read an external sheet's rules).

   `fonts/fonts.css` is the one sheet deliberately kept *out* of that tag. Its `@font-face` rules point at files next to it by relative path, which resolve to nothing once an exported book is somewhere else; an export links the families from Google instead (`ui/export.js`), which is what a file meant for sharing wants.

## The desktop shell

`desktop/main.js` is an Electron main process and nothing else — no feature knows it exists. Three things in it are load-bearing:

- **The app is served from `opennote://app`, never `file://`.** Every `file://` page on a machine shares a single origin — literally `file://` — and therefore a single IndexedDB. **Export book** hands you a standalone `.html`; opened off the disk, it lands in the same storage bucket as the real library, alongside every other local page the user has ever opened. Firefox goes the other way and refuses IndexedDB on `file://` outright, which is why `tools/verify/` serves over HTTP rather than opening the file. A privileged standard scheme sidesteps both: the app gets a private, secure, stable origin of its own. **That scheme and host are the identity the user's books are filed under; changing either orphans them.**
- **There is no application menu on Windows or Linux.** Every accelerator a default menu installs is one the page already wants: `Ctrl+Z`/`Ctrl+Shift+Z` are `core/nav.js`'s undo and redo, `Ctrl+A`/`C`/`X` belong to the table, and `Ctrl+R` would reload a notebook mid-sentence. macOS gets the smallest menu that keeps the clipboard working, deliberately without undo/redo roles, so `Cmd+Z` still reaches the page.
- **Closing the window waits for `flush()`.** `core/save.js` debounces 600ms and hangs its last write on `beforeunload`, which cannot await. The shell holds the close, runs `flush()` to completion, then destroys the window — so the desktop app loses less than a browser tab does.

A single-instance lock goes with them: two copies share one IndexedDB, `store.js` resolves a blocked open to `null`, and the second window looks fine right up until it loses the session.

## The module map

### `js/core/` — the engine

| File | Lines | What it does |
|---|---:|---|
| `registry.js` | 126 | `defineItem()`, `defineTool()`, `addCSS()`, `onBookOpen()` — the seam every feature plugs into |
| `store.js` | 68 | IndexedDB for the book, its pages and its blobs, with an in-memory fallback |
| `util.js` | 77 | `uid` `$` `clamp` `esc`, page sizes and page units, the theme palettes, the stored-HTML sanitiser |
| `state.js` | 28 | the open book, its pages, the selection, the zoom |
| `save.js` | 43 | debounced writes back to the store — the two doors every change goes through, which is what undo listens at; a saving page's heading digest rides along |
| `history.js` | 254 | **`undo()` / `redo()`** — what a page said before a change and what it says after, and where one step ends and the next begins |
| `theme.js` | 83 | the theme presets, the colour overrides and the paper grain |
| `zoom.js` | 152 | zoom, panning the desk, and holding the paper still while either changes |
| `richtext.js` | 34 | editing text in place, and the ∑ button |
| `media.js` | 21 | handing stored blobs to the page as object URLs |
| `item.js` | 196 | **`buildItem()`** — builds any item from its spec; also what an item owns and deleting one |
| `drag.js` | 181 | rotate, drag and resize — and the throw: a released item keeps the hand's momentum |
| `page.js` | 167 | **`buildPage()`** — the paper, its items, its ink; and dragging the page bigger |
| `add.js` | 60 | **`addItem()`** — makes whatever the palette asked for, at the size this paper wants |
| `nav.js` | 185 | selection, the keyboard, pages, the spread, `gotoPage()` |
| `book.js` | 58 | making, opening and reading a sketchbook |

### `js/items/` — the things you put on a page

Each one is self-contained and registers itself. The three columns after the name are what it plugs into.

| File | Lines | Registers |
|---|---:|---|
| `text.js` | 41 | `text` — five styles: heading, text, handwriting, mono, marker |
| `note.js` | 27 | `note` |
| `check.js` | 90 | `check` |
| `code.js` | 728 | `code` — the terminal-style code cell: one hand-rolled scanner driven by a table per language (12 of them), the editor schemes as CSS variables plus a Theme scheme mixed from the book's colours, the copy button, typing that recolours under the caret with brackets that close themselves, the band a long one clips to, and the folder glyph and viewer |
| `table.js` | 1650 | `table` — the grid, the formula compiler, rows and columns, the band a long one shows, folding it to an icon, reading a spreadsheet in, and handing two columns to a plot |
| `image.js` | 52 | `image` |
| `video.js` | 83 | `video` |
| `file.js` | 443 | `file` — attachments, the icons everything wears in a folder, and the reader |
| `folder.js` | 366 | `folder` |
| `model.js` | 607 | `model` — the `.obj` parser and the shared WebGL canvas |
| `slides.js` | 927 | `slides` — the deck on the page, and the reader: the spring-driven reel, the grid of every slide, the filmstrip, the zoom, the notes, and a slide taken out as a picture |
| `deck.js` | 1314 | `deck` — flip cards, the scope, the scoreboard |
| `plot.js` | 1289 | `plot` — the expression compiler, the grid, the vectors, and a table's points |
| `chart.js` | 967 | `chart` — pie / donut / 3D / sketch, plain bars and a stacked bar; the legend that edits the rows, validated palettes (ten slots) and the book-coloured ramps, and the label engine: four placements, cornered leader lines, and labels you drag anywhere that remember their offset |
| `solid.js` | 847 | `solid` — five wireframe guides to draw over, each carrying its own measurements: radii, sides, a sweep with the cut faces drawn, and the flat pair's corner handles |
| `molecule.js` | 1107 | `molecule` — the 2D editor with its glass rail and ChemDraw gestures, the hotkeys, the three drawing styles, the ⌕ name-or-SMILES box, and the 3D view: three looks, the momentum orbit, picks that measure, and the solid geometry that keeps it honest — sticks cut off at the ball they leave, space-filling balls masked back to the cap that stands proud of their neighbours, and one outline round the whole of a space-filling model rather than one round every ball |
| `ptable.js` | 154 | `ptable` — the periodic table as a reference card, and `openElementPicker()`, the popover every element chip opens |
| `nuchart.js` | 677 | `nuchart` — the chart of the nuclides: 5646 squares as ten paths, the magic-number rules, four colourings (decay mode, half-life, binding energy per nucleon, neutron separation energy), pan and zoom on a viewBox, Karlsruhe-split squares for the long-lived metastable states, arrows to every daughter and the whole decay chain, and a foot that works the Q values out as you press |
| `mat.js` | 255 | the n×m arithmetic the cards lean on: multiply, transpose, determinant, inverse, powers, and eigen (Hessenberg + shifted QR, null-space eigenvectors). Touches no DOM |
| `cards.js` | 397 | `matrix`, `vecbox` — any size through the ✎ panel, the label algebra (`M⁻¹` undone is `M`), determinants between bars, eigen rows |
| `calc.js` | 264 | `calc` — the written-out product: the animated working, folding it to just the answer, taking it apart again, and standing in as an operand itself |
| `node.js` | 1100 | `node` — five kinds of card, the little graph they make, the wires between them, and the colour wheel |
| `atlas.js` | 161 | `atlas` — the contents block drawn from the bookmarks and each page's headings |
| `washi.js` | 30 | `washi` |
| `sticker.js` | 38 | `sticker` |

### `js/ui/` — the tools around the book

| File | Lines | What it does |
|---|---:|---|
| `layers.js` | 187 | the layer stack and the panel |
| `ink.js` | 332 | the stylus, the nib, and the ink on a page |
| `strings.js` | 512 | pins, strings and arrows between items |
| `icons.js` | 70 | the line-icon set — `icn('table')` — and `defineIcon()` for a feature's own. Loads ahead of the items so they can register icons while loading |
| `glass.js` | 69 | the glass material and the warp that every floating panel shares |
| `palette.js` | 215 | the palette — shelves, tiles and search, drawn from the registry |
| `props.js` | 264 | the properties popover — glass sliders, steppers, the sweep dial and a deed button; `openProps()` for any feature with measurements |
| `bookmarks.js` | 176 | the divider tabs on the book edge, drawn under the paper |
| `mathbar.js` | 100 | the maths toolbar |
| `overview.js` | 35 | the all-pages view |
| `shelf.js` | 122 | the shelf of sketchbooks and canvases |
| `canvas.js` | 358 | the canvas — one endless sheet, growing it, and the map |
| `print.js` | 34 | print / PDF |
| `backup.js` | 74 | back up and restore |
| `export.js` | 93 | the standalone `.html` flipbook |

### `js/lib/` — owes nothing to this app

| File | Lines | What it does |
|---|---:|---|
| `latex.js` | 365 | LaTeX → MathML. No library, nothing downloaded |
| `sound.js` | 81 | the studio sounds, generated live. No audio files |
| `spring.js` | 125 | springs and momentum: analytic springs, release velocity, flick projection. What the throws, spins and card-tosses all move on |
| `nuclide.js` | 6067 | the nuclides: NUBASE2020 packed to a line each — 3558 ground states and 2088 metastable states with their mass excesses, half-lives, spins, branches and abundances — plus what a chart of them needs: every decay mode as a step in (protons, neutrons), Q values and separation energies subtracted from the masses, binding energy per nucleon, the chain down to whatever a nuclide ends on, and the names a physicist types. Touches no DOM |
| `chem.js` | 1334 | the chemistry: 118 elements with their configurations, the molecular graph, implicit hydrogens and lone pairs, Hill formulas and masses, rings and aromaticity, a graph hash that names what you draw, SMILES in and out, the 2D layout, the 3D embedding, VSEPR, and a library of ~200 molecules. Touches no DOM |
| `sheet.js` | 518 | `.xlsx`, `.ods` and `.csv` → plain rows of plain strings. No library: a workbook is a zip of XML, and the browser has an unzipper |
| `pptx.js` | 1907 | `.pptx` → slides that draw themselves as SVG. The same zip, then DrawingML: the colour engine, the preset and freehand geometry, fills and lines, the inheritance chain a slide hangs off, and the text laid out by hand so it needs no layout engine to be redrawn |

## The registry — what a feature can say about itself

Every field is optional except `html`.

```js
defineItem('note', {
  add:     { note: base => ({ ...base, type:'note', w:32 }) },  // menu kind → a new item
  sound:   'plop',           // adding one sounds like: plop | pop | tape
  sizeable: true,            // give it the A− / A+ buttons
  autoWidth: false,          // true if it sizes itself and ignores it.w
  playArea: '.vwrap',        // inner surface that takes the mouse in play mode

  html:    (it, c) => '…',   // its markup. c = {live, urls, page, idx}
  mount:   (el, it, c) => {},          // runs for print and exports too
  tools:   (mk, it, el, page) => {},   // its own toolbar buttons
  wire:    (el, it, page) => {},       // live behaviour, on screen only
  after:   (it, el, page) => {},       // what happens right after it is added

  parts:   it => [],         // nested records that own media of their own
  stream:  true,             // false if its file is read some other way
  exportMaxBytes: null,      // heavier than this and it stays out of an export
  forget:  it => {},         // this item has been deleted — drop any hold on it

  takes:   (files, at, page) => false,  // claim files dropped on the page
  takesRank: 1,              // how keenly, when two features could both want them
  fileable: true,            // may be dropped into a folder (bring icon/label/open)

  icon:    it => '…',        // how it looks as an icon — in a folder, or folded down
  label:   it => 'name',     // …what it is called under that icon
  meta:    it => '6 columns · 812 rows',  // …and the line beside the name
  open:    (it, page) => {}, // what a click on that icon opens
  peek:    it => '…',        // what ctrl+hover shows of it

  css:     `…`               // its own styles
})
```

A feature that can be added also says where it sits in the palette — its shelf, its label, its icon, the sentence in its tooltip — from the same file:

```js
defineTool({ kind:'note', cat:'write', label:'Sticky', icon:'note',
             hint:'Sticky notes in 5 colours', order:30 })
```

`cat` names a shelf — `write`, `math`, `science`, `media`, `shapes` or `decor`, declared in `ui/palette.js`; `defineToolCat()` adds another if a new area of the app ever deserves one — that is how `science` got there when the molecules arrived. `icon` names a drawing in `ui/icons.js`, and `defineIcon()` registers one the set doesn't have. `order` sorts within the shelf; ties keep load order.

**Dropped files.** Core does not know what a `.png`, an `.obj` or an `.xlsx` is. It asks each feature that declares `takes` — keenest first — and the first one to return `true` has taken them; anything nobody claims becomes an attachment. `takesRank` exists for the one real overlap: a model arrives as a handful of files at once (`.obj` + `.mtl` + textures) and has to be asked before the picture feature sees the `.png` among them.

**Icons.** Anything that can be shown as an icon — filed in a folder, or folded down on the page — draws itself through `icon`, names itself through `label`, and describes itself through `meta`. `open` says what a click on it does and `peek` what `Ctrl`+hover shows. A feature that declares none of them falls back to the document icon and the file's name.

Three things every item gets for free, with no field to set:

- **Writing.** Put a `<div class="txt">` in your markup and you get in-place editing, the highlighter dots, the ∑ equation button, `$$…$$` compiling on blur, and storage in `it.html`.
- **A caption.** Put a `<figcaption>` in it and you get an editable caption in `it.cap`, typeset the same way.
- **The rest of the toolbar** — pin, arrow, layer, front, back, delete — and dragging, rotating, resizing, layers, ink over the top, print, backup and export.

## Adding a new feature

Say you want a pull-quote on the page. **Two files are touched: the new one, and `index.html`.** (This recipe is how the code cell was really added — `js/items/code.js` is the worked example, one file from tokeniser to stylesheet.)

**1 — write `js/items/quote.js`:**

```js
/* Open Note — items/quote.js
   a pulled quote, set big with a rule down its side */

defineItem('quote', {
  add: { quote: base => ({ ...base, type:'quote', w:46, fs:26, html:'' }) },
  sizeable: true,
  html: it => '<div class="body qblk' + (it.tail ? ' tail' : '') +
    '"><div class="txt st-body" data-ph="pull a line out of the page"></div></div>',
  tools(mk, it, el, page){
    mk('—', 'Credit line on / off', () => {
      it.tail = !it.tail;
      el.querySelector('.qblk').classList.toggle('tail', !!it.tail);
      queueSave(page.id);
    });
  },
  css: `
    .qblk{border-left:.22em solid var(--accent);padding:.2em 0 .2em .6em}
    .qblk .txt{font-style:italic;line-height:1.3}
    .qblk.tail::after{content:"— " attr(data-who);opacity:.6}
  `
});
```

…and give it its place in the palette, still in the same file:

```js
defineTool({ kind:'quote', cat:'write', label:'Quote', icon:'text',
             hint:'A pulled quote with a rule down its side' });
```

**2 — add one line to `index.html`:** the script, in the items group:

```html
<script src="js/items/quote.js"></script>
```

That is the whole job. It now drags, rotates, resizes, takes ink over the top, sits on a layer, gets pinned and arrowed, saves, backs up, restores, prints, goes in the overview and comes out in an exported book — because none of that ever knew what a `quote` was.

**Things that need no extra work:** an item that holds a file (`it.media`), or a map of them (`it.texs`); several menu entries for one type (`add` takes as many as you like — that is how the five text styles and the five wireframes work); an item that can't be made on the spot and needs a file dialog first (`add: { quote: { pick: at => {…} } }`).

## Adding something that isn't an item

A tool around the book — another panel, another exporter — is a file in `js/ui/`, one `<script>` line in `index.html`, and nothing else. It can call `addCSS('mything', \`…\`)` for its own styles, and `onBookOpen(fn)` if it keeps state that a different book should not inherit.

**Drawing between items.** Some of what a page shows belongs to no single item — the strings tied across a detective board, the wires between nodes. On screen a feature puts that up itself, but print, an export, the overview and a shelf cover each build a page from scratch with no live board to hang it on. `onPageOverlay(fn)` is where that is registered: `fn(wrap, page, idx)` is handed the page's wrapper, already laid out, and appends whatever it draws. Both overlays in the app compute their geometry from `getBoundingClientRect()`, which is why the hook fires *after* layout rather than during `buildPage`.

## Undo, without a list of commands

`js/core/history.js` is the whole of it, and no feature knows it is there. The app already has exactly two doors every change in it goes through — `queueSave(pageId)` for a page and `queueIndex()` for the book — so the stack keeps the JSON a page said *before* a change and what it says *after*, and stepping back is putting the first one down again. A plot, a folder, a deck of cards and a stroke of ink all undo without one of them mentioning it, and a feature written tomorrow gets undo on the day it is written, because saving is not optional.

Three things make that work rather than merely function:

- **Where a step is cut.** A press of the pointer or a command key is a new thing being done and closes whatever came before it; typing is not, and closes itself 700 ms after the last letter; and anything that arrives with no hand behind it — the springs of a thrown item still writing `it.x` a second after the fingers let go — folds into the step that started it. That is why a drag and its throw take one `Ctrl`+`Z`, five letters take one, and two strokes of ink take two.
- **What is deliberately not in a step.** `cur` (which page you are on), the layer you are working on, the pen, the map, the sound, and the atlas's headings digest are all stripped out of the book's snapshot before it is compared. They are where you are standing and what you are holding rather than what is on the paper, and an undo that swallowed a page turn instead of the change you meant would be worse than no undo at all. It cuts the other way too: because the digest is derived, a page saving its headings can never look like something you did.
- **Blobs outlive the delete.** `dropMedia()` offers the blob to the stack before the store gets it — a video or an attachment that came back without its file would be a hole on the page. It is binned for real when the step that dropped it falls off the end of the stack, and an *undone* step keeps its blobs, because the page is holding them again.

Only the book's own list of pages may say a page is new: a page that is written to before anything has read it in is one whose start nothing remembers, and it is quietly adopted rather than treated as a page made here — the alternative is an undo that deletes it. The cost of all this is one `JSON.stringify` of the pages that changed, at the end of a burst, plus one copy of each page as it was read in for those to be measured against. Sixty steps, or about 12 MB of JSON, whichever runs out first.

## Page units, and the canvas

Everything on a sheet is stored as a **fraction of that sheet** — an item at `x`/`y` percent, `it.w` percent wide, ink in thousandths of the width. That is what lets a page be any shape without a single stored number changing meaning. It has one consequence worth knowing: *the same number is bigger on bigger paper*. A sticky note at `w:32` is a third of whatever it lands on.

So sizes that are meant to be physical — a feature's default width, the margin a new item lands inside, the nib of the pen — go through three helpers in `core/util.js`:

```js
pgK()        // rescales a width written as a percentage of a normal 660-unit page
pctW(u)      // u page units, as a percentage of this sheet's width
pctH(u)      // …of its height
```

On a normal page `pgK()` is exactly `1` and `pctW(92)` is exactly the `14` it replaced, so a book behaves as it always did — the harness asserts precisely that.

**One write per frame.** Pointer and wheel events arrive far faster than the screen redraws — a 1000Hz mouse, a precision trackpad — so `applyView()` and `refit()` each coalesce into a single `requestAnimationFrame`, and the zoom percentage is only rewritten when it changes. Anything else you add to a continuous gesture should do the same. The `.12s` ease on `.book` is for the jumps (fitting, recentring) and is switched off *during* a gesture — `.stage.panning` covers dragging, `.book.nolerp` covers the wheel — because on a live pan an ease is just lag.

**The desk is painted twice, on purpose.** `body` carries `background: var(--desk)` and so does `html`, because the thing the *window* shows is the canvas, and the canvas only ever got the body's colour by propagating up to it. Anything that stops the body painting leaves the canvas unpainted — and an unpainted canvas is not a grey window but a see-through one. A `var()` that will not parse is exactly such a thing: it does not fall back, it takes the whole `background` declaration with it. So the two places a colour can arrive are both guarded. The theme presets are written on `body[data-theme=…]`, which the root cannot read, so `applyTheme()` hands it the resolved desk (`deskOf()`) and **Export book** writes the same value onto the exported `<html>`; and an override is only applied when it is a plain hex colour, since those come out of restored backups as well as out of the picker, and one bad value would take the paper's paint out from under the whole book. The print sheet resets **both** (`html,body{background:#fff}`) — reset only the body and every printed page comes out with the desk behind it.

**Never assume where the desk is holding the paper.** `.stage` is `overflow: clip`, not `hidden`, with an explicit `min-height: 0`. `hidden` makes it a *scroll container*, and a scroll container shifts an overflowing child about to keep its overflow reachable — so the sheet's **layout** position changed whenever its transform changed (measured: 484px of jump on one zoom, which is what "it teleports" looks like). `clip` clips identically without being scrollable; the explicit `min-height` is needed because a flex item only gives up its content-sized minimum for `overflow: hidden` on its own, and without it the desk grows to fit the sheet and pushes the toolbar off screen.

Even so, nothing computes where the sheet *will be*. `sheetPoint()` / `holdSheetPoint()` note where a point of the paper is on screen, let the layout change, then put that point back — zoom anchoring, committing a gesture and growing the canvas all go through them. Anything new that resizes the sheet should too.

**A gesture is cheap, its result is expensive.** `setZoom()` is a layout change: the page really does get bigger and everything on it re-renders, which is what keeps type and ink sharp — and costs ~26 ms on a big canvas, *more* the further in you are. So `zoomBy()` runs the gesture on the compositor instead (`translate(pan) scale(k)` on `#book`, which is exactly equivalent because layout zoom also grows the sheet about its centre) and calls `commitZoom()` 180 ms after the wheel stops. Measured: 78 ms a notch → 17 ms. The gesture is anchored on the pointer, so zooming holds the spot you aimed at instead of flinging you away from the middle of the sheet. Anything that measures real geometry — `growCanvas()`, `fitToDesk()` — calls `commitZoom()` first, and `setZoom()` cancels any gesture in flight, so there is no state to get wrong. Note that `getBoundingClientRect()` already accounts for the live scale; only `offsetWidth` and the `zoom` variable don't.

`js/ui/canvas.js` is what those helpers are for. **A canvas is a book with `kind:'canvas'` and one page in it**, no cover; `pgmax` on the document raises the paper ceiling `pgSize()` clamps to, and the sheet grows from there. `growCanvas(side)` adds a page's worth on one side and then maps every stored fraction — items, their widths, every ink point and stroke weight — back onto the spot it already occupied, panning the desk by the same amount so nothing appears to move. Core knows none of this: it hangs the rails off the page through `addPaperEdges(host)` the way it hangs the resize grips, and everything else is a `body.canvas` class the feature's own stylesheet answers.

## Checking it still works

There is no test runner and no Node here — the app *is* the test. To poke at it by hand:

```bash
python3 -m http.server 8000        # then open http://localhost:8000
```

For a change worth being sure about, there is a harness that drives the app in headless Firefox and has the page **post its results back**:

```bash
tools/verify/run.sh
```

924 assertions: that all 64 script files load without throwing, that every add-menu entry adds the type it claims to, that a bookmark goes on as a straight fore-edge tab drawn under the paper, that saving a page writes its headings onto the book's index, that the first bookmark seeds the atlas onto the starting page exactly once, that the atlas lists a bookmark as a chapter with the page's Heading under it and clicking the line really flips there, that nothing tilts on its way onto the page any more, that the palette and the registry agree in both directions — every tile a registered kind, every kind a tile — that it opens, searches across its shelves with the best match first, and really adds from a click on a tile, that a code cell colours a python line the way the editor would — keyword, function, string, escape, comment and number each in its own ink — reparses it as rust from the picker in its bar, steps its six schemes round on ◑, deepens its theme-mixed terminal the moment the paper goes dark and lifts it back, recompiles the tokens under the caret as you type without ever growing by a phantom line, closes brackets and quotes as pairs that type over, delete together and open out on Enter, clips a long cell to a scrolling band that ⊞ lets back out, files into a folder wearing its terminal glyph and opens from there into the highlighted viewer, and prints as colours with a plain label standing in for its picker and copy button, that a torus keeps its inner radius inside its outer through the ✎ panel's sliders, sweeps to a part ring with no NaN in any path at any angle of any shape, that a sphere starts face on, and that pulling a corner handle really reshapes the flat square, that a matrix stepped up to 3×3 grows as an identity and its eigen rows really satisfy `A·v = λ·v` (complex pairs holding the trace and the determinant), that inverting `M⁻¹` says plain `M` with the original numbers home again, that a 2×3 dropped on a 3×2 multiplies and two 2×3s refuse, that a folded product multiplies on and ✂ brings both cards back, that a card wears no paper until it is chosen, that every item type builds both live and through `buildPage(page, false)` — the path print, the overview and exports take — that the maths compiles, that a table works out its formulas and carries them through a row being inserted, that a long one draws only the band it is showing and scrolls by rows under the wheel, that folding it down gives an icon and a window, that sorting moves whole rows and leaves blanks at the bottom, that a real `.xlsx` built in the harness comes back with its dates written down and its shared strings in place, that a chart's numbers and axis names are laid outside the plotting area and centred the way `plt.xlabel` sets them, that a node graph works out each card once and says so rather than hanging when it is wired in a circle, that a lead really can be dragged out of a socket onto a table and that a cell edited two nodes upstream moves the point on the plot, that a colour wheel taken down to black still remembers its hue on the way back up, that a pie draws one slice per positive row in the palette's own slot order with a paper seam between them, writes its labels inside in ink picked by the slice's lightness and leads the too-small ones out on cornered lines that keep apart, seats names beside their slices on ⌖ while lining out what would pile up, keeps a dragged label's offset — leader grown outside its slice, shed once it is home, gone on a double-click — scales every label from the ✎ slider and carries ten slices in ten colours, holds its six palettes distinct on every look with no NaN in any path, takes the dark stepping the moment the paper goes dark, and grows a slice while you type into its legend, that a real `.pptx` built in the harness — master, layout, theme, picture, table, group, freehand geometry, a Symbol run, a slide-number field and a page of notes — comes back as two slides whose title lands at the master's 44pt in the theme's accent through the master's colour map, whose bullets are said in letters this machine has, whose master band is drawn while its master footer is not, whose group maps its children into its own space and whose field knows which slide it is on, that the card on the page walks the deck and keeps a still of it for print, and that the reader opens where the card was, walks, grids, zooms, shows the notes written under that slide and lifts one out onto the page as a picture, that one `Ctrl`+`Z` takes back a whole drag and the throw at the end of it and no more, that a burst of typing is one step where two strokes of ink are two, that a deleted item comes back with the file it owns still in the store, that a removed page comes back with everything that was on it and the book turns to the page it put back, that turning a page is not a step at all and that doing something new drops what was waiting to be put back, that a canvas grows without moving anything already on it, that a zoom gesture scales rather than relaying out and holds the point you aimed at, that ethanol built by clicks, drags and keystrokes says `C₂H₆O` and 46.07, that `c` then `l` makes a chlorine, that a carbon with five bonds wears its halo, that rings fuse on a bond and hang from an atom, that `caffeine` typed into the ⌕ box arrives laid out, that the 3D view of it has every ball and no `NaN`, its bonds within 12 % of their lengths, that it turns under a drag and measures under a click, that the periodic table has 118 cells and the picker takes `b` `r` `Enter` as bromine, that the chart of the nuclides parses all 5646 of them with every element's abundances adding to 100 %, subtracts the right Q values out of the mass excesses, peaks its binding-energy curve on ⁶²Ni, knows a step across the chart for every decay mode bar the ones that fission, and walks the four natural series to lead, lead, lead and thallium — that the card draws them as ten paths rather than four thousand rectangles with no NaN in any of its four colourings, picks the square under a press and the metastable state out of the top slice of a split one, keeps the spot under the pointer through a wheel zoom, moves three nuclides under a three-nuclide drag, writes the symbol, mass number and half-life into the squares once there is room, draws an arrow to every daughter and fourteen of them down uranium-238's chain, and goes to a nuclide typed into its ⌕ box, and that **Export book** really produces a file with every feature's styles in it. It also fingerprints the computed style of 61 selectors, which is how a rule that changed file and lost its place in the cascade gets caught. See `tools/verify/README.md` for what it covers and the traps in extending it.
