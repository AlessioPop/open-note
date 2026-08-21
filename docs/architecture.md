# How it's built

Everything below is for working *on* Open Note rather than in it.

## The shape of it

```
index.html          the markup, the base stylesheet, and the script list — the shell, not the features
js/
  platform/         the seam between the app and its host — a browser, Electron, later a phone
  core/             the engine: storage, the note, the sheet, items, history, the view
  paper/            what is drawn on the sheet but belongs to no single item
  chrome/           the tools around the sheet
  items/            one folder per palette shelf, one file per thing you can put on the sheet
  lib/              algorithms that owe nothing to this app
  data/             tables the lib files read. Data, never code
  boot.js           opens the last note — the last <script> on the page
fonts/              the four families, carried locally — no network to set type
desktop/            the Electron shell: a window around the app, never a part of it
tools/verify/       the harness: 988 assertions, driven in headless Firefox
```

**A note is one endless sheet.** It starts three normal pages across and two
down and grows from the rails along its edges. There are no pages, no cover, no
spread and no bookmarks — up to `0.1.0-alpha.2` there were, and `js/boot.js`
still offers an old sketchbook back as a backup file the first time it sees one.

**One feature is one file.** A feature's markup, its behaviour, its toolbar
buttons, the entry it puts in the add menu and its stylesheet all live together
in that one file, and it announces itself to the rest of the app by calling
`defineItem()`. Nothing in `core/` mentions a note, a plot or a deck of cards by
name — it asks the registry.

## Five rules that keep it that way

1. **No build step, and none coming.** No bundler, no transpiler, no
   dependencies — nothing in `js/` is generated, and double-clicking
   `index.html` has to open a working app. `package.json` belongs to the
   Electron shell in `desktop/`, which *wraps* the app and is never imported by
   it. Delete `desktop/`, `package.json` and `node_modules/` and everything
   still runs.
2. **Classic `<script>` files, not ES modules.** A `type="module"` script *never
   executes* from `file://` — the browser blocks it — so `import` would mean the
   app only ran off a web server. Classic scripts run both ways, which is also
   what a phone's WebView will want. They share one scope: a `const` or
   `function` in one file is visible in every file loaded after it, and (at run
   time) in the ones before it too. Nothing is on `window`.
3. **One scope, so names are the contract.** 1350-odd top-level names across 68
   files and no two collide, because every file prefixes what it owns —
   `chem*`, `nuc*`, `tb*`, `nd*`. A new file must do the same. Nothing enforces
   it, which is exactly why it is written down here.
4. **The registry is the only seam a feature needs.** Adding a kind of item is
   two touches: the new file, and one `<script>` line in `index.html`. If a
   change needs a third, the seam is missing something — add it to
   `core/registry.js` rather than working around it.
5. **The platform seam is the only place a host may differ.** See below.

## The platform seam

`js/platform/platform.js` declares four calls and nothing else fills them in;
`js/platform/web.js` implements them for a browser tab and for the Electron
window. **An iOS or Android shell adds its own file beside `web.js`, loads it
last, and overwrites whichever of the four it must — and touches nothing else in
the app.**

| Call | Why it cannot be shared |
|---|---|
| `plSaveFile(name, blob)` | A browser downloads it. A phone has no downloads folder and must go through the native share sheet. |
| `plPrint()` | `window.print()` on a desktop; iOS needs `UIPrintInteractionController` from the native side. |
| `plOnSuspend(fn)` | `beforeunload` never fires on iOS. `web.js` listens on all three of `beforeunload`, `pagehide` and a hidden `visibilitychange`. |
| `PLAT.touch` / `PLAT.canDownload` | What the app may assume about the hand and the filesystem. |

Two things deliberately need **no** seam. **Storage**: IndexedDB works in every
WebView the app will run in, and `core/store.js` already falls back to memory
where it does not. **Picking a file**: `<input type="file">` opens the photo
library, the files app and a desktop file dialog alike.

One thing that is not code at all but binds all three shells: **the app must be
served from its own origin.** Every `file://` page on a machine shares a single
origin — literally `file://` — and therefore a single IndexedDB; Firefox goes
the other way and refuses IndexedDB on `file://` outright, which is why
`tools/verify/` serves over HTTP rather than opening the file. Electron
registers `opennote://app` as a privileged standard scheme; on iOS that is a
`WKURLSchemeHandler` and on Android a `WebViewAssetLoader`. **That scheme and
host are the identity the user's notes are filed under, so all three shells must
agree on `opennote://app` — changing either orphans every note.**

Three names on disk also keep the old vocabulary on purpose, for the same
reason: the database is `devlog-sketchbook`, the library key is `library`, and a
note is filed under `book:<id>`.

## Touch, and the phone that is coming

Everything already moves on pointer events, so a finger drives every gesture in
the app today. What has been done ahead of a port, and what has not:

- `viewport-fit=cover` plus `env(safe-area-inset-*)` on the bar, the toolbar,
  the drawer, the shelf and the map — the four edges a notch or a home bar eats.
- `@media (pointer:coarse)` grows the item toolbar, the resize grip and the
  shelf's delete button, and stops anything depending on hover to be reachable.
- **Not yet done:** a two-finger pinch on the sheet (the wheel path in
  `core/zoom.js` is where it belongs), and a long-press standing in for the
  right-click that opens the palette.

## The desktop shell

`desktop/main.js` is an Electron main process and nothing else — no feature
knows it exists. Three things in it are load-bearing:

- **The app is served from `opennote://app`, never `file://`** — see above.
- **There is no application menu on Windows or Linux.** Every accelerator a
  default menu installs is one the page already wants: `Ctrl+Z`/`Ctrl+Shift+Z`
  are `core/history.js`'s undo and redo, `Ctrl+A`/`C`/`X` belong to the table,
  and `Ctrl+R` would reload a note mid-sentence. macOS gets the smallest menu
  that keeps the clipboard working, deliberately without undo/redo roles, so
  `Cmd+Z` still reaches the page.
- **Closing the window waits for `flush()`.** `core/save.js` debounces 600 ms
  and hangs its last write on `plOnSuspend`, none of whose three hooks can
  await. The shell holds the close, runs `flush()` to completion, then destroys
  the window — so the desktop app loses less than a browser tab does.

A single-instance lock goes with them: two copies share one IndexedDB,
`store.js` resolves a blocked open to `null`, and the second window looks fine
right up until it loses the session.

## The module map

### `js/platform/` — the seam

| File | Lines | What it does |
|---|---:|---|
| `platform.js` | 51 | the four calls, and why each one cannot be shared |
| `web.js` | 36 | them, for a browser tab and for the Electron window |

### `js/core/` — the engine

| File | Lines | What it does |
|---|---:|---|
| `registry.js` | 123 | `defineItem()`, `defineTool()`, `addCSS()`, `onNoteOpen()` — the seam every feature plugs into |
| `store.js` | 68 | IndexedDB for the note, its sheet and its blobs, with an in-memory fallback |
| `util.js` | 68 | `uid` `$` `clamp` `esc`, sheet sizes and page units, the theme palettes, the stored-HTML sanitiser |
| `state.js` | 38 | the open note, its sheet, the selection, the zoom — and `sheet()`, the only way to ask for the paper |
| `save.js` | 40 | debounced writes back to the store — the two doors every change goes through, which is what undo listens at |
| `history.js` | 243 | **`undo()` / `redo()`** — what the sheet said before a change and what it says after, and where one step ends and the next begins |
| `theme.js` | 89 | the theme presets, the colour overrides and the paper grain |
| `zoom.js` | 153 | zoom, panning the desk, and holding the paper still while either changes |
| `richtext.js` | 34 | editing text in place, and the ∑ button |
| `media.js` | 21 | handing stored blobs to the page as object URLs |
| `item.js` | 196 | **`buildItem()`** — builds any item from its spec; also what an item owns and deleting one |
| `drag.js` | 155 | rotate, drag and resize — and the throw: a released item keeps the hand's momentum |
| `page.js` | 104 | **`buildPage()`** — the paper, its items and its ink, live or static |
| `sheet.js` | 207 | **`growSheet()`** — the rails, and every stored fraction remapped so nothing moves when the paper does |
| `add.js` | 58 | **`addItem()`** — makes whatever the palette asked for, at the size this paper wants |
| `keys.js` | 126 | **`render()`**, the selection and the keyboard |
| `doc.js` | 73 | making, opening and deleting a note |

### `js/paper/` — drawn on the sheet, belonging to no one item

| File | Lines | What it does |
|---|---:|---|
| `layers.js` | 187 | the layer stack and the panel |
| `ink.js` | 331 | the stylus, the nib, and the ink on the sheet |
| `strings.js` | 430 | pins, strings and arrows between items |

### `js/chrome/` — the tools around the sheet

| File | Lines | What it does |
|---|---:|---|
| `icons.js` | 69 | the line-icon set — `icn('table')` — and `defineIcon()` for a feature's own. Loads ahead of the items so they can register icons while loading |
| `glass.js` | 69 | the glass material and the warp that every floating panel shares |
| `palette.js` | 210 | the palette — shelves, tiles and search, drawn from the registry |
| `props.js` | 264 | the properties popover — glass sliders, steppers, the sweep dial and a deed button; `openProps()` for any feature with measurements |
| `mathbar.js` | 101 | the maths toolbar |
| `map.js` | 174 | the map: the whole sheet, and where you are standing on it |
| `shelf.js` | 100 | the shelf of notes |
| `print.js` | 32 | print / PDF |
| `backup.js` | 80 | back up and restore |
| `export.js` | 90 | the standalone `.html` |

### `js/items/` — the things you put on the sheet

Each one is self-contained and registers itself. **The folder is the palette
shelf** — a new file under `items/science/` had better call
`defineTool({ cat:'science', … })`, and a new shelf is one `defineToolCat()` in
`chrome/palette.js` plus a folder to match.

| File | Lines | Registers |
|---|---:|---|
| `write/text.js` | 47 | `text` — five styles: heading, text, handwriting, mono, marker |
| `write/note.js` | 30 | `note` |
| `write/check.js` | 93 | `check` |
| `write/code.js` | 728 | `code` — the terminal-style code cell: one hand-rolled scanner driven by a table per language (12 of them), the editor schemes as CSS variables plus a Theme scheme mixed from the note's colours, the copy button, typing that recolours under the caret with brackets that close themselves, the band a long one clips to, and the folder glyph and viewer |
| `write/deck.js` | 1313 | `deck` — flip cards, the scope, the scoreboard |
| `math/table.js` | 1655 | `table` — the grid, the formula compiler, rows and columns, the band a long one shows, folding it to an icon, reading a workbook in, and handing two columns to a plot |
| `math/plot.js` | 1277 | `plot` — the expression compiler, the grid, the vectors, and a table's points |
| `math/chart.js` | 967 | `chart` — pie / donut / 3D / sketch, plain bars and a stacked bar; the legend that edits the rows, validated palettes (ten slots) and the note-coloured ramps, and the label engine: four placements, cornered leader lines, and labels you drag anywhere that remember their offset |
| `math/cards.js` | 397 | `matrix`, `vecbox` — any size through the ✎ panel, the label algebra (`M⁻¹` undone is `M`), determinants between bars, eigen rows |
| `math/calc.js` | 264 | `calc` — the written-out product: the animated working, folding it to just the answer, taking it apart again, and standing in as an operand itself |
| `math/node.js` | 1099 | `node` — five kinds of card, the little graph they make, the wires between them, and the colour wheel |
| `science/ptable.js` | 154 | `ptable` — the periodic table as a reference card, and `openElementPicker()`, the popover every element chip opens |
| `science/nuchart.js` | 680 | `nuchart` — the chart of the nuclides: 5646 squares as ten paths, the magic-number rules, four colourings, pan and zoom on a viewBox, Karlsruhe-split squares for the long-lived metastable states, arrows to every daughter and the whole decay chain, and a foot that works the Q values out as you press |
| `science/fits.js` | 617 | `fits` — an astronomy file as a shortcut, and the reader behind it: `hdu.info()`, the header in three aligned columns with a search over all of them, COMMENT and HISTORY runs folded in place, every data unit given as a shape and a type rather than as numbers, and columns you pick and drag off the window onto the sheet, where they land as an ordinary table |
| `science/molecule.js` | 1106 | `molecule` — the 2D editor with its glass rail and ChemDraw gestures, the hotkeys, the three drawing styles, the ⌕ name-or-SMILES box, and the 3D view: three looks, the momentum orbit, picks that measure, and the solid geometry that keeps it honest |
| `media/image.js` | 56 | `image` |
| `media/video.js` | 87 | `video` |
| `media/model.js` | 614 | `model` — the `.obj` parser and the shared WebGL canvas |
| `media/slides.js` | 927 | `slides` — the deck on the sheet, and the reader: the spring-driven reel, the grid of every slide, the filmstrip, the zoom, the notes, and a slide taken out as a picture |
| `media/file.js` | 448 | `file` — attachments, the icons everything wears in a folder, and the reader |
| `media/folder.js` | 368 | `folder` |
| `shapes/solid.js` | 847 | `solid` — five wireframe guides to draw over, each carrying its own measurements |
| `decor/washi.js` | 33 | `washi` |
| `decor/sticker.js` | 41 | `sticker` |

### `js/lib/` — owes nothing to this app

No DOM in any of them, with one stated exception: `latex.js` calls `addCSS()`
for the stylesheet its markup needs, which is why `core/registry.js` is the one
thing loaded ahead of this whole layer.

| File | Lines | What it does |
|---|---:|---|
| `sound.js` | 81 | the studio sounds, generated live. No audio files |
| `spring.js` | 125 | springs and momentum: analytic springs, release velocity, flick projection. What the throws, spins and card-tosses all move on |
| `latex.js` | 365 | LaTeX → MathML. No library, nothing downloaded |
| `matrix.js` | 255 | the n×m arithmetic the cards lean on: multiply, transpose, determinant, inverse, powers, and eigen (Hessenberg + shifted QR, null-space eigenvectors) |
| `fits.js` | 477 | a `.fits` → its HDUs, their headers, and the shape of every data unit; the walk steps over the data without touching it, so a four-gigabyte cube opens as fast as a small one. Then one column of a binary table, on request — planned before it is read, so what comes back is bounded whatever the file weighs |
| `workbook.js` | 518 | `.xlsx`, `.ods` and `.csv` → plain rows of plain strings. No library: a workbook is a zip of XML, and the browser has an unzipper |
| `pptx.js` | 1907 | `.pptx` → slides that draw themselves as SVG. The same zip, then DrawingML: the colour engine, the preset and freehand geometry, fills and lines, the inheritance chain a slide hangs off, and the text laid out by hand |
| `chem.js` | 994 | the chemistry: the molecular graph, implicit hydrogens and lone pairs, Hill formulas and masses, rings and aromaticity, a graph hash that names what you draw, SMILES in and out, the 2D layout, the 3D embedding and VSEPR |
| `nuclide.js` | 265 | the physics of the nuclide chart: reading NUBASE in, every decay mode as a step in (protons, neutrons), Q values and separation energies subtracted from the masses, binding energy per nucleon, and the chain down to whatever a nuclide ends on |

### `js/data/` — tables, not code

Split out of `lib/` on purpose. They are read once at load and never again, they
have no logic in them at all, and keeping them separate is what stops a grep, a
search or an agent's context filling with six thousand lines of mass excesses.
Each loads immediately before the `lib/` file that reads it.

| File | Lines | What it is |
|---|---:|---|
| `nuclides.js` | 5809 | NUBASE2020 packed to a line each — 3558 ground states and 2088 metastable states with their mass excesses, half-lives, spins, branches and abundances. Read by `lib/nuclide.js` |
| `elements.js` | 340 | the 118 elements with their configurations, radii and colours, and a library of ~200 molecules as SMILES. Read by `lib/chem.js` |

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

  takes:   (files, at, page) => false,  // claim files dropped on the sheet
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

A feature that can be added also says where it sits in the palette — its shelf,
its label, its icon, the sentence in its tooltip — from the same file:

```js
defineTool({ kind:'note', cat:'write', label:'Sticky', icon:'note',
             hint:'Sticky notes in 5 colours', order:30 })
```

`cat` names a shelf — `write`, `math`, `science`, `media`, `shapes` or `decor`,
declared in `chrome/palette.js`, and **the same word as the folder the file is
in**. `defineToolCat()` adds another if a new area of the app ever deserves one
— that is how `science` got there when the molecules arrived. `icon` names a
drawing in `chrome/icons.js`, and `defineIcon()` registers one the set doesn't
have. `order` sorts within the shelf; ties keep load order.

**Dropped files.** Core does not know what a `.png`, an `.obj` or an `.xlsx` is.
It asks each feature that declares `takes` — keenest first — and the first one
to return `true` has taken them; anything nobody claims becomes an attachment.
`takesRank` exists for the one real overlap: a model arrives as a handful of
files at once (`.obj` + `.mtl` + textures) and has to be asked before the
picture feature sees the `.png` among them.

**Icons.** Anything that can be shown as an icon — filed in a folder, or folded
down on the sheet — draws itself through `icon`, names itself through `label`,
and describes itself through `meta`. `open` says what a click on it does and
`peek` what `Ctrl`+hover shows. A feature that declares none of them falls back
to the document icon and the file's name.

Three things every item gets for free, with no field to set:

- **Writing.** Put a `<div class="txt">` in your markup and you get in-place
  editing, the highlighter dots, the ∑ equation button, `$$…$$` compiling on
  blur, and storage in `it.html`.
- **A caption.** Put a `<figcaption>` in it and you get an editable caption in
  `it.cap`, typeset the same way.
- **The rest of the toolbar** — pin, arrow, layer, front, back, delete — and
  dragging, rotating, resizing, layers, ink over the top, print, backup and
  export.

## Adding a new feature

Say you want a pull-quote on the sheet. **Two files are touched: the new one,
and `index.html`.**

**1 — write `js/items/write/quote.js`** (`write`, because that is the shelf it
will sit on):

```js
/* Open Note — items/write/quote.js
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

defineTool({ kind:'quote', cat:'write', label:'Quote', icon:'text',
             hint:'A pulled quote with a rule down its side' });
```

**2 — add one line to `index.html`,** in the `items/write` group:

```html
<script src="js/items/write/quote.js"></script>
```

That is the whole job. It now drags, rotates, resizes, takes ink over the top,
sits on a layer, gets pinned and arrowed, saves, backs up, restores, prints, and
comes out in an export — because none of that ever knew what a `quote` was.

**Things that need no extra work:** an item that holds a file (`it.media`), or a
map of them (`it.texs`); several menu entries for one type (`add` takes as many
as you like — that is how the five text styles and the five wireframes work); an
item that can't be made on the spot and needs a file dialog first
(`add: { quote: { pick: at => {…} } }`).

## Adding something that isn't an item

A tool around the sheet — another panel, another exporter — is a file in
`js/chrome/`, one `<script>` line in `index.html`, and nothing else. It can call
`addCSS('mything', \`…\`)` for its own styles, and `onNoteOpen(fn)` if it keeps
state that a different note should not inherit.

**Drawing between items.** Some of what the sheet shows belongs to no single
item — the strings tied across a detective board, the wires between nodes. On
screen a feature puts that up itself, but print, an export and a shelf card each
build the sheet from scratch with no live board to hang it on. `onPageOverlay(fn)`
is where that is registered: `fn(wrap, page, idx)` is handed the sheet's wrapper,
already laid out, and appends whatever it draws. Both overlays in the app compute
their geometry from `getBoundingClientRect()`, which is why the hook fires
*after* layout rather than during `buildPage`.

## Undo, without a list of commands

`js/core/history.js` is the whole of it, and no feature knows it is there. The
app already has exactly two doors every change in it goes through —
`queueSave(pageId)` for the sheet and `queueIndex()` for the note — so the stack
keeps the JSON the sheet said *before* a change and what it says *after*, and
stepping back is putting the first one down again. A plot, a folder, a deck of
cards and a stroke of ink all undo without one of them mentioning it, and a
feature written tomorrow gets undo on the day it is written, because saving is
not optional.

Three things make that work rather than merely function:

- **Where a step is cut.** A press of the pointer or a command key is a new
  thing being done and closes whatever came before it; typing is not, and closes
  itself 700 ms after the last letter; and anything that arrives with no hand
  behind it — the springs of a thrown item still writing `it.x` a second after
  the fingers let go — folds into the step that started it. That is why a drag
  and its throw take one `Ctrl`+`Z`, five letters take one, and two strokes of
  ink take two.
- **What is deliberately not in a step.** The layer you are working on, the pen,
  the map, and the sound are all stripped out of the note's snapshot before it
  is compared. They are what you are holding rather than what is on the paper.
- **Blobs outlive the delete.** `dropMedia()` offers the blob to the stack
  before the store gets it — a video or an attachment that came back without its
  file would be a hole on the sheet. It is binned for real when the step that
  dropped it falls off the end of the stack, and an *undone* step keeps its
  blobs, because the sheet is holding them again.

Growing the paper is a step like any other, and undoing it puts every item and
every stroke back where it was, because `growSheet()` writes the sheet and the
index together and history is watching both.

## Sheet units, and growing the paper

Everything on the sheet is stored as a **fraction of that sheet** — an item at
`x`/`y` percent, `it.w` percent wide, ink in thousandths of the width. That is
what lets the paper be any size without a single stored number changing meaning.
It has one consequence worth knowing: *the same number is bigger on bigger
paper*. A sticky note at `w:32` is a third of whatever it lands on.

So sizes that are meant to be physical — a feature's default width, the margin a
new item lands inside, the nib of the pen — go through three helpers in
`core/util.js`:

```js
pgK()        // rescales a width written as a percentage of a normal 660-unit page
pctW(u)      // u sheet units, as a percentage of this sheet's width
pctH(u)      // …of its height
```

On a 660-unit sheet `pgK()` is exactly `1` and `pctW(92)` is exactly the `14` it
replaced; on the 1980-unit sheet a note actually starts at, both come out
exactly a third of that. The harness asserts precisely both.

**Growing is the whole trick.** `growSheet(side)` adds a page's worth on one
side — or a rail dragged out adds however much you pull — and then
`remapSheet()` maps every stored fraction (items, their widths, every ink point
and stroke weight) back onto the spot it already occupied, panning the desk by
the same amount so nothing appears to move. A rail is a real `<button>`, so
Enter and a screen reader grow the sheet too; the drag only suppresses the click
it would otherwise end with.

**One write per frame.** Pointer and wheel events arrive far faster than the
screen redraws — a 1000 Hz mouse, a precision trackpad — so `applyView()` and
`refit()` each coalesce into a single `requestAnimationFrame`, and the zoom
percentage is only rewritten when it changes. Anything else you add to a
continuous gesture should do the same. The `.12s` ease on `.book` is for the
jumps (fitting, recentring) and is switched off *during* a gesture —
`.stage.panning` covers dragging the desk, `.book.nolerp` covers the wheel —
because on a live pan an ease is just lag.

**The desk is painted twice, on purpose.** `body` carries
`background: var(--desk)` and so does `html`, because the thing the *window*
shows is the canvas, and the canvas only ever got the body's colour by
propagating up to it. Anything that stops the body painting leaves the canvas
unpainted — and an unpainted canvas is not a grey window but a see-through one.
A `var()` that will not parse is exactly such a thing: it does not fall back, it
takes the whole `background` declaration with it. So the two places a colour can
arrive are both guarded. The theme presets are written on `body[data-theme=…]`,
which the root cannot read, so `applyTheme()` hands it the resolved desk
(`deskOf()`) and **Export** writes the same value onto the exported `<html>`;
and an override is only applied when it is a plain hex colour, since those come
out of restored backups as well as out of the picker, and one bad value would
take the paper's paint out from under the whole note. The print sheet resets
**both** (`html,body{background:#fff}`).

**Never assume where the desk is holding the paper.** `.stage` is
`overflow: clip`, not `hidden`, with an explicit `min-height: 0`. `hidden` makes
it a *scroll container*, and a scroll container shifts an overflowing child
about to keep its overflow reachable — so the sheet's **layout** position changed
whenever its transform changed (measured: 484 px of jump on one zoom, which is
what "it teleports" looks like). `clip` clips identically without being
scrollable; the explicit `min-height` is needed because a flex item only gives
up its content-sized minimum for `overflow: hidden` on its own, and without it
the desk grows to fit the sheet and pushes the toolbar off screen.

Even so, nothing computes where the sheet *will be*. `sheetPoint()` /
`holdSheetPoint()` note where a point of the paper is on screen, let the layout
change, then put that point back — zoom anchoring, committing a gesture and
growing the sheet all go through them. Anything new that resizes the sheet
should too.

**A gesture is cheap, its result is expensive.** `setZoom()` is a layout change:
the sheet really does get bigger and everything on it re-renders, which is what
keeps type and ink sharp — and costs ~26 ms on a big sheet, *more* the further
in you are. So `zoomBy()` runs the gesture on the compositor instead
(`translate(pan) scale(k)` on `#book`, which is exactly equivalent because
layout zoom also grows the sheet about its centre) and calls `commitZoom()`
180 ms after the wheel stops. Measured: 78 ms a notch → 17 ms. The gesture is
anchored on the pointer, so zooming holds the spot you aimed at instead of
flinging you away from the middle of the sheet. Anything that measures real
geometry — `growSheet()`, `fitToDesk()` — calls `commitZoom()` first, and
`setZoom()` cancels any gesture in flight, so there is no state to get wrong.
Note that `getBoundingClientRect()` already accounts for the live scale; only
`offsetWidth` and the `zoom` variable don't.

## Checking it still works

There is no test runner — the app *is* the test. To poke at it by hand:

```bash
python3 -m http.server 8000        # then open http://localhost:8000
```

For a change worth being sure about, there is a harness that drives the app in
headless Firefox and has the page **post its results back**:

```bash
tools/verify/run.sh
```

**988 assertions**, and they are the real specification of this app. Among them:
that all 68 script files load without throwing; that a fresh note is one empty
sheet 1980 × 1320 with four rails and no page furniture at all; that the
sheet-unit helpers are exact no-ops on a 660-unit sheet and scale by exactly a
third on the real one; that every add-menu entry adds the type it claims to;
that the palette and the registry agree in both directions — every tile a
registered kind, every kind a tile; that nothing tilts on its way onto the
paper; that growing the sheet leaves every item and every stroke exactly where
the eye had it, that one `Ctrl`+`Z` puts the paper *and* everything on it back,
and that there is a ceiling; that a zoom gesture scales rather than relays out
and holds the point you aimed at; that every item type builds both live and
through `buildPage(page, false)` — the path print and exports take; that a code
cell colours a python line the way the editor would and reparses it as rust;
that a table works out its formulas, reads a real `.xlsx` built in the harness,
and hands two columns to a plot; that a chart draws one slice per positive row
with the labels the label engine promises; that a node graph works out each card
once and says so rather than hanging when it is wired in a circle; that a real
`.pptx` built in the harness comes back as two slides through the master's
colour map; that a real `.fits` built in the harness walks to three HDUs whose
headers start exactly where the last one's data ended, that a `CONTINUE` card is
folded back into the string it belongs to and BZERO 32768 is read as unsigned,
and that what lands on the page is a digest rather than a megabyte of `HISTORY`,
and that a column dragged off that reader arrives as a table holding the readings
that went into the file — scaled, `TNULL`s left as gaps, and the sentence saying
how much of a long one came over; that ethanol built by clicks says `C₂H₆O` and 46.07 and its 3D view
has every ball and no `NaN`; that the chart of the nuclides parses all 5646 of
them, peaks its binding-energy curve on ⁶²Ni and walks the four natural series
to lead, lead, lead and thallium; and that **Export** really produces one file
with every feature's styles in it and no flipbook chrome. It also fingerprints
the computed style of 61 selectors, which is how a rule that changed file and
lost its place in the cascade gets caught. See `tools/verify/README.md` for what
it covers and the traps in extending it.
