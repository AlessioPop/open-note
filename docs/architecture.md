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
tools/verify/       the harness: 2355 assertions, driven in headless Firefox
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
3. **One scope, so names are the contract.** The top-level names across all
   script files do not collide, because every file prefixes what it owns —
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
| `registry.js` | 189 | `defineItem()`, `defineTool()`, `defineSelectionAction()`, `defineMathBox()`, `defineCodePen()`, `addCSS()`, `onNoteOpen()` — the seam every feature plugs into |
| `store.js` | 68 | IndexedDB for the note, its sheet and its blobs, with an in-memory fallback |
| `util.js` | 95 | `uid` `$` `clamp` `esc` `copyText`, sheet sizes and page units, the theme palettes, the stored-HTML sanitiser |
| `state.js` | 39 | the open note, its sheet, the selection, the zoom — and `sheet()`, the only way to ask for the paper |
| `save.js` | 41 | debounced writes back to the store — the two doors every change goes through, which is what undo listens at |
| `history.js` | 252 | **`undo()` / `redo()`** — what the sheet said before a change and what it says after, including rebasing live clock state, and where one step ends and the next begins |
| `theme.js` | 95 | the theme presets, shared palette application, the colour overrides and the paper grain |
| `zoom.js` | 153 | zoom, panning the desk, and holding the paper still while either changes |
| `richtext.js` | 34 | editing text in place, and wrapping a selection in `$$…$$` — the compiling itself is `richify()`/`plainify()` in `lib/ticks.js` |
| `media.js` | 21 | handing stored blobs to the page as object URLs |
| `item.js` | 292 | **`buildItem()`** — builds any item from its spec; also what an item owns and deleting one or a selection |
| `drag.js` | 205 | rotate, drag and resize — the throw for one item, rigid movement for a selected group, and three lines that ask a feature whether the thing being dragged is part of an arrangement that travels and resizes as one (`ctryChain`), and whether it has found something to click onto (`ctryDragMove` / `ctryDragDrop`). Whether the thing it is over may be filed with it is asked of the pair (`foldPair`), not of either one, so a feature can go into a folder without ever starting one. Core knows no more about what an arrangement is than that |
| `select.js` | 319 | the toolbar's one-shot marquee, the selected-id set, bulk deletion and feature-owned group actions |
| `page.js` | 101 | **`buildPage()`** — the paper, its items and its ink, live or static |
| `sheet.js` | 207 | **`growSheet()`** — the rails, and every stored fraction remapped so nothing moves when the paper does |
| `add.js` | 57 | **`addItem()`** — makes whatever the palette asked for, at the size this paper wants |
| `keys.js` | 119 | **`render()`** and the keyboard |
| `doc.js` | 74 | making, opening and deleting a note |

### `js/paper/` — drawn on the sheet, belonging to no one item

| File | Lines | What it does |
|---|---:|---|
| `layers.js` | 187 | the layer stack and the panel |
| `ink.js` | 339 | the stylus, the nib, and the ink on the sheet |
| `strings.js` | 467 | pins, strings and arrows between items, and the two Decor tiles that start one |

### `js/chrome/` — the tools around the sheet

| File | Lines | What it does |
|---|---:|---|
| `icons.js` | 72 | the line-icon set — `icn('table')` — and `defineIcon()` for a feature's own. Loads ahead of the items so they can register icons while loading |
| `glass.js` | 69 | the glass material and the warp that every floating panel shares |
| `palette.js` | 224 | the palette — shelves, labelled groups, tiles and search, drawn from the registry |
| `props.js` | 362 | the properties popover — glass sliders, steppers, the sweep dial, a deed button, a row of colour swatches with a wheel and a row of named chips (`pick`, each in its own colours — the deck's looks are chosen from one); `openProps()` for any feature with measurements, and `placePanel()`, the above-then-beside-then-below rule every panel an item opens off its toolbar follows |
| `mathpad.js` | 549 | writing maths: the `$` that pairs itself and opens out into a display block (and the `` ` `` that pairs itself by `lib/ticks.js`'s rules), the completion list built from the compiler's own tables, and the formula typeset under the caret as it is written. It serves contenteditable canvas writing and plain Markdown textareas through one selection/text seam. The rules are plain functions over (text, offset), so the harness can drive them without a caret |
| `tickpad.js` | 45 | typing inside a ```fence``` in any writing box: ⇥ and ⇧⇥, ⏎ keeping the indent, brackets and quotes closing themselves. None of the rules are here — they are the code cell's, reached through the registry's code pen |
| `markpad.js` | 91 | what the keyboard does to the marks in a writing box. A list: ⏎ making the next bullet and ending the list on an empty one, ⇥ and ⇧⇥ moving one in and out. None of the rules are here either — they are `lib/marks.js`'s, and inside a fence they stand aside for `tickpad.js`. A key another handler has already taken is read off `defaultPrevented`, and an indent is written into the box by hand rather than through the editor's `insertText`, which is free to turn a tab it is handed into a space. Then ⌃B and ⌃I, shared with Markdown through the same plain-text seam, which put the stars round what is picked out or take them off — the shortcut writes the mark rather than markup, so the browser's own bold never gets the key |
| `map.js` | 174 | the map: the whole sheet, and where you are standing on it |
| `shelf.js` | 106 | the shelf of notes |
| `navigator.js` | 650 | the toggleable library tree: nested folders, contextual actions, drag-to-folder/root and imported-file readers |
| `markdown.js` | 305 | Markdown authoring, preview, per-file themes and plain-text editing. It reuses the registered code pen and the shared maths/compiler keyboard instead of owning parallel renderers |
| `wiki.js` | 381 | `[[links]]` between library files: the syntax, what a name resolves to, the list that offers one while you type, the rewrite that carries a rename, and `wkIndex()` — the nodes and edges the dashboard's graph is drawn from |
| `dashboard.js` | 754 | the dashboard — the month, what you were last in, and the year in days. It owns `lib.activity`, the one record in the app of days rather than of last-touched, and `dashMark()` is what `core/save.js` calls on every flush |
| `print.js` | 32 | print / PDF |
| `backup.js` | 80 | back up and restore |
| `export.js` | 90 | the standalone `.html` |

### `js/items/` — the things you put on the sheet

Each one is self-contained and registers itself. **The folder is the palette
shelf** — a new file under `items/science/` had better call
`defineTool({ cat:'science', … })`, and a new shelf is one `defineToolCat()` in
`chrome/palette.js` plus a folder to match. Seven of them so far: `write`,
`math`, `logic`, `science`, `media`, `shapes`, `decor`.

| File | Lines | Registers |
|---|---:|---|
| `write/text.js` | 49 | `text` — five styles: heading, text, handwriting, mono, marker |
| `write/note.js` | 32 | `note` |
| `write/check.js` | 96 | `check` |
| `write/code.js` | 865 | `code` — the terminal-style code cell: one hand-rolled scanner driven by a table per language (12 of them), the editor schemes as CSS variables plus a Theme scheme mixed from the note's colours, the copy button, typing that recolours under the caret with brackets that close themselves, the band a long one clips to, and the folder glyph and viewer. `cdKey()` is that keyboard as a plain function over (writing, selection, key), and the code pen it registers is the same cell built into a ```fence``` in a sentence — bar, picker, colours and all, less the traffic lights |
| `write/deck.js` | 1934 | `deck` — flip cards: the eight looks (a set of CSS variables each), widgets off the palette on a card (the feature's own html/mount/wire/tools through the registry, --scale from the card's width), the scope with the throw and its stamps, the scoreboard over a pure score model with the record of runs, and the deck taken to the desk — the same standalone document parked in the store under `desk:<id>` for `desk.html` to become, or saved as a file; the scoreboard's own renderer travels with it |
| `math/table.js` | 1659 | `table` — the grid, the formula compiler, rows and columns, the band a long one shows, folding it to an icon, reading a workbook in, and handing two columns to a plot |
| `math/plot.js` | 1572 | `plot` — the coordinate system: the window and its log axes, the lattice (square or polar), ticks that turn into powers of ten and never overlap, one sampler for every kind of curve (explicit, polar, parametric, complex), the marching-squares equations and shaded regions through `lib/contour.js`, the vectors, a table's points, and the axis names you click to edit |
| `math/plotpanel.js` | 565 | the expressions panel beside a plot — one row per thing drawn, the colour dot that is also the switch, the typeset preview, the keyboard, the polar/log/name footer. Live-only: print and export never build it |
| `math/chart.js` | 962 | `chart` — pie / donut / 3D / sketch, plain bars and a stacked bar; the legend that edits the rows, validated palettes (ten slots) and the note-coloured ramps, and the label engine: four placements, cornered leader lines, and labels you drag anywhere that remember their offset |
| `math/cards.js` | 397 | `matrix`, `vecbox` — any size through the ✎ panel, the label algebra (`M⁻¹` undone is `M`), determinants between bars, eigen rows |
| `math/calc.js` | 263 | `calc` — the written-out product: the animated working, folding it to just the answer, taking it apart again, and standing in as an operand itself |
| `math/node.js` | 1099 | `node` — five kinds of card, the little graph they make, the wires between them, and the colour wheel |
| `logic/gate.js` | 1819 | `logic` — the component definitions, shared symbols, five-state evaluator, clock scheduler, truth tables and backward-compatible standalone logic items |
| `logic/circuit.js` | 982 | `circuit` — the contained editor, categorized drag palette, resizable local pan/zoom viewport, common-circuit library, nested port wires and signal-flow layout |
| `science/ptable.js` | 154 | `ptable` — the periodic table as a reference card, and `openElementPicker()`, the popover every element chip opens |
| `science/nuchart.js` | 680 | `nuchart` — the chart of the nuclides: 5646 squares as ten paths, the magic-number rules, four colourings, pan and zoom on a viewBox, Karlsruhe-split squares for the long-lived metastable states, arrows to every daughter and the whole decay chain, and a foot that works the Q values out as you press |
| `science/fits.js` | 617 | `fits` — an astronomy file as a shortcut, and the reader behind it: `hdu.info()`, the header in three aligned columns with a search over all of them, COMMENT and HISTORY runs folded in place, every data unit given as a shape and a type rather than as numbers, and columns you pick and drag off the window onto the sheet, where they land as an ordinary table |
| `science/molecule.js` | 2606 | `molecule` — the 2D editor with its glass rail and ChemDraw gestures: the ghost the pointer casts ahead of every click and the valence check that refuses the ones that could not exist, the chain and the row of fused rings dragged out under a running count, the ⟮CH₂⟯ₙ repeat bracket that folds a long chain short without touching the molecule, the lasso and its turn/chirality/move/copy menu, the hydrogen bond kept in a list of its own so chem.js never sees it but respected by tidy, the hotkeys, the three drawing styles, the ⌕ name-or-SMILES box, flat transparent 2D/3D SVG and PNG exports plus clipboard-only ChemFig LaTeX with shifted skeletal double bonds, direct whole-widget corner resizing, and the quiet >/< disclosure for a simultaneous live 3D companion, additive correspondence highlighting with a neutral ghost-free pointer and a screen-space aura above the three 3D looks, momentum orbit, and separately coloured measurement picks |
| `science/feynman.js` | 734 | `feynman` — lattice-aligned particle diagrams, Standard Model vertex validation and transparent SVG, PNG and TikZ-Feynman exports |
| `science/atlas.js` | 2114 | `atlas` and `country` — a map of the world and one region off it, a country or a whole continent: the layer registry every extra thing drawn on a map goes through (`defineMapLayer`), the view as a longitude, a latitude and a zoom, spring-driven pan with momentum and rubber-banded edges, wheel and pinch zoom about the pointer, eleven layers including the hypsometric height field and the water, the capitals and then the cities that come up to meet you as you go in, a tap that picks the country under it — or, with `▣` on, the whole continent it is in — and writes its name across it as an atlas sets one, tracked capitals at a fraction of the room the shape has rather than the biggest that fits; a ring on every country the pen is bigger than, the ⌕ box that walks the map to a country or a continent and lights it, a region pressed and held — or simply dragged, if it is the one already picked — that comes up off the map as a card of its own, shaped like the country rather than boxed in a card, carrying the height, the lakes and the rivers the map was wearing, clipped to its own border — and a plate of a continent drawn the same way, filled in one piece with its borders as hairlines inside it, its coast in the heavier pen and as many of its capitals as the greedy layout can set — and clicking together with its neighbours into an arrangement that is in register with the world and travels, resizes and reprojects as one until `⊗` pulls a card back out of it — the sticky detail step and the window a frame is built for, the heavy layer that waits for the map to stand still and then fades in over the one it replaces, and the glass panel of layers built out of the registry |
| `media/image.js` | 78 | `image` |
| `media/video.js` | 87 | `video` |
| `media/model.js` | 614 | `model` — the `.obj` parser and the shared WebGL canvas |
| `media/slides.js` | 927 | `slides` — the deck on the sheet, and the reader: the spring-driven reel, the grid of every slide, the filmstrip, the zoom, the notes, and a slide taken out as a picture |
| `media/file.js` | 448 | `file` — attachments, the icons everything wears in a folder, and the reader |
| `media/folder.js` | 376 | `folder` |
| `shapes/solid.js` | 806 | `solid` — five wireframe guides to draw over, each carrying its own measurements |
| `decor/washi.js` | 33 | `washi` |
| `decor/sticker.js` | 41 | `sticker` |

### `js/lib/` — owes nothing to this app

No DOM in any of them, with three stated exceptions: `latex.js`, `ticks.js`
and `marks.js` call `addCSS()` for the stylesheet their markup needs, which is
why `core/registry.js` is the one thing loaded ahead of this whole layer. The
last two also reach the DOM for the same reason `latex.js` does — they compile
writing in place — and each hangs one delegated listener on the thing its markup
carries: `ticks.js` for the copy button on a fenced block, `marks.js` for the box
on a task.

| File | Lines | What it does |
|---|---:|---|
| `sound.js` | 193 | the studio sounds, generated live. No audio files |
| `spring.js` | 125 | springs and momentum: analytic springs, release velocity, flick projection. What the throws, spins and card-tosses all move on |
| `graph.js` | 130 | where the dots go: a force-directed layout, laid out into the shape of the frame it will be read in, deterministic so the same library lands the same way twice |
| `mathexpr.js` | 502 | the expression compiler: text → a small tree → a real evaluator, a complex one, and a LaTeX emitter; `mxCompile` says what kind of thing was typed (a function of x, an equation, a region, a polar or parametric curve, a list of points) and `mxNum`/`mxFn` are the two narrow doors the cards, the window boxes and the formula node use |
| `contour.js` | 180 | marching squares over a picture-sized grid: the zero line of a field as chained polylines (a pole is told from a root by bisecting towards it), and the region it is positive as row-merged rectangles plus cell polygons |
| `latex.js` | 460 | LaTeX → MathML. No library, nothing downloaded — plus the flatten/scan pair that tells a caret which formula it is standing in, which `chrome/mathpad.js` writes with |
| `ticks.js` | 296 | code ticks: `` `a phrase` `` and ```` ```a block``` ````, compiled and taken apart the way `latex.js` does formulas — plus what typing a backtick does, and `richify()`/`plainify()`, the pair every writing surface in the app goes through — marks, then ticks, then maths, and unwound in the opposite order. A fenced block itself is built by whatever registered the code pen — the code cell does — and setting its language from the bar rewrites the fence's own opening line, then leaves the box to save itself on the `input` that follows |
| `marks.js` | 504 | the marks writing wears: `# ` `## ` `### ` a heading, `- ` a bullet, `- [ ] ` a task with a box to tick, `---` a rule, `**bold**`, `*italic*`, and `->` an arrow — compiled and taken apart the way `latex.js` does formulas. First of the three passes, so a heading or a bullet may hold a formula or a phrase of code while a `#` or an `->` inside a fence or a formula is left where it is; a heading is sized in `em`, keeps the face of the box it is in, and differs from the step above it only in size, and a nested bullet carries a hairline down from the one it belongs to. `markEnter()`, `markTab()` and `markWrap()` are here too — what ⏎, ⇥ and ⌃B/⌃I do, over (text, offset) with no DOM in sight — and every marker reads a non-breaking space as a space, since that is what a browser's editor leaves behind wherever it thinks a space might collapse |
| `matrix.js` | 255 | the n×m arithmetic the cards lean on: multiply, transpose, determinant, inverse, powers, and eigen (Hessenberg + shifted QR, null-space eigenvectors) |
| `fits.js` | 477 | a `.fits` → its HDUs, their headers, and the shape of every data unit; the walk steps over the data without touching it, so a four-gigabyte cube opens as fast as a small one. Then one column of a binary table, on request — planned before it is read, so what comes back is bounded whatever the file weighs |
| `workbook.js` | 518 | `.xlsx`, `.ods` and `.csv` → plain rows of plain strings. No library: a workbook is a zip of XML, and the browser has an unzipper |
| `pptx.js` | 1907 | `.pptx` → slides that draw themselves as SVG. The same zip, then DrawingML: the colour engine, the preset and freehand geometry, fills and lines, the inheritance chain a slide hangs off, and the text laid out by hand |
| `chem.js` | 1147 | the chemistry: the molecular graph, implicit hydrogens and lone pairs, Hill formulas and masses, rings and aromaticity, the indexed offline name catalog, a graph hash that names what you draw, SMILES in and out, the 2D layout with exact regular-polygon arcs for constrained rings and rigid-branch untangling for large structures, the 3D embedding and VSEPR |
| `nuclide.js` | 264 | the physics of the nuclide chart: reading NUBASE in, every decay mode as a step in (protons, neutrons), Q values and separation energies subtracted from the masses, binding energy per nucleon, and the chain down to whatever a nuclide ends on |
| `atlas.js` | 1421 | the world as numbers: the packed arcs unpacked, the projections (flat and Mercator, each declaring its period), the seam down the back of the world unrolled so a country on both sides of the 180th meridian is drawn on both sides, rings and arcs to path strings — smoothed through their midpoints so a 110m outline stands up to being magnified — memoised per projection and look, and the greedy box layout that decides which city names fit. Then the countries as shapes: every one pulled into a single coordinate frame so an even-odd insideness test means something, which country a point is in (with a reach, for the ones smaller than a finger), the pole of inaccessibility, the size a country's own name is set at — the largest that fits wholly inside its outline, less the air an atlas leaves round one — the part of a country anyone means by its name, name search over aliases, and then **regions**: a country and a continent answer the same five questions through one key, `co:12` or `ct:2`, with a continent's outline split into its own coast and the borders inside it by counting how many of its countries drew each segment. Then rivers and lakes, and the height field unpacked and contoured into filled bands by marching squares. Everything it builds is memoised per projection, look, **detail step and window** — the last two being what stops a map drawing the whole planet at full detail to show one country |

### `js/data/` — tables, not code

Split out of `lib/` on purpose. They are read once at load and never again, they
have no logic in them at all, and keeping them separate is what stops a grep, a
search or an agent's context filling with six thousand lines of mass excesses.
Each loads immediately before the `lib/` file that reads it.

| File | Lines | What it is |
|---|---:|---|
| `nuclides.js` | 5809 | NUBASE2020 packed to a line each — 3558 ground states and 2088 metastable states with their mass excesses, half-lives, spins, branches and abundances. Read by `lib/nuclide.js` |
| `elements.js` | 340 | the 118 elements with their configurations, radii and colours, plus the hand-picked teaching names that take precedence in the molecule catalog. Read by `lib/chem.js` |
| `molecules.js` | 9804 | 9796 generated PubChem records which, with the hand-picked set, make 10,000 unique offline structures and more than 17,000 searchable canonical/IUPAC names. Each carries a precomputed graph hash, so recognition does not parse the catalog. Rebuilt by `tools/chem/build-catalog.mjs`; read by `lib/chem.js` |
| `atlasworld.js` | 26 | Natural Earth 50m **simplified per arc** (public domain): 1959 arcs of coastline and border packed as base-64 varints, the rings that make the land, which arcs are coast and which are border, **241 countries — every one there is**, and 199 capitals biggest first. Each arc carries the tolerance of the smallest country that uses it, so Luxembourg has a real border and Russia costs what it always did. 145 KB. Rebuilt by `tools/atlas/pack.py`. Read by `lib/atlas.js` |
| `atlasdetail.js` | 20 | Natural Earth 50m simplified to the map's own detail: 254 rivers, 411 lakes and the 500 largest cities that are not capitals. 75 KB. Rebuilt by `tools/atlas/detail.py`. Read by `lib/atlas.js`, which works without it |
| `atlasrelief.js` | 16 | a normalised global height field at 20 arc-minutes — 1080 × 540 cells on a square-root scale, run-length coded, sea collapsing to almost nothing. ETOPO20 (NOAA, public domain). 163 KB. Rebuilt by `tools/atlas/relief.py`. Read by `lib/atlas.js`, which works without it |

## The registry — what a feature can say about itself

Every field is optional except `html`.

```js
defineItem('note', {
  add:     { note: base => ({ ...base, type:'note', w:32 }) },  // menu kind → a new item
  sound:   'plop',           // adding one sounds like: plop | pop | tape
  sizeable: true,            // give it the A− / A+ buttons
  dropWhenBlank: true,       // it is nothing but its writing: left with none,
                             // it takes itself off the page again
  autoWidth: false,          // true if it sizes itself and ignores it.w — or a
                             // function of the item, and then the reader chooses
                             // and it.w is the ceiling it wraps at: a writing box
                             // hugs its writing until the handle pins it
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
  filedOnly: true,           // …into one already there, but never starting a new one

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

`cat` names a user-facing shelf — `write`, `math`, `science`, `media`, `shapes`
or `decor`, declared in `chrome/palette.js`. Source folders remain technical
module boundaries, while the shelf is chosen for how a person looks for the
feature: the contained logic editor lives in `items/logic/` but is found under
Science. `defineToolCat()` adds another if a new area of the app deserves one.
`icon` names a
drawing in `chrome/icons.js`, and `defineIcon()` registers one the set doesn't
have. `order` sorts within the shelf; ties keep load order.

An item spec may declare `palette:false` when its add-kinds exist only for
backward compatibility or programmatic use. Standalone `logic` records use that
escape hatch: old notes still build and edit them, while the one public Logic
circuit tile under Science adds the contained workflow. The palette remains a view over the
registry rather than a second source of item construction rules.

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
  editing, the highlighter — one swatch opening a panel of colours, a wheel and
  ⌫ — `$$…$$` compiling on blur, and storage in `it.html`.
- **A caption.** Put a `<figcaption>` in it and you get an editable caption in
  `it.cap`, typeset the same way.
- **The rest of the toolbar** — layer, front, back, delete, and a width button
  if the feature lets its boxes be pinned — and dragging, rotating, resizing,
  layers, ink over the top, print, backup and export. Pins, strings and arrows
  are *not* here: they are two clicks between two items rather than a property
  of one, so they are tiles on the Decor shelf (`js/paper/strings.js`).

### A group is still ordinary items

`core/select.js` keeps a `Set` of selected ids while the older `selected` name
continues to mean the single item whose own toolbar is open. A normal click
puts one id in the set; the main-toolbar marquee puts several there. Dragging
one member applies the same pointer delta to every record, and `removeItems()`
does one save/render after all feature cleanup has run. There is no group item,
wrapper or second coordinate system to migrate, serialize or undo.

Feature-specific group operations register through `defineSelectionAction()`.
Core only asks `when(items, page)` whether to show a button and calls
`run(items, page)`; it knows neither what a circuit is nor how one should be
laid out. Logic uses that seam for **Tidy logic**, while another feature can add
an operation without a type branch in selection or the toolbar.

## Maps, and the layer seam on them

`items/science/atlas.js` is built to be added to rather than edited. The map
itself owns three things and no more: where in the world it is looking, how the
hand moves it, and the order things are painted in. **Everything drawn on it is
a layer**, and a layer is one `defineMapLayer()` in a file of its own:

```js
defineMapLayer('rivers', {
  label: 'Rivers', order: 35, on: 0, sw: 1.2,
  world: ctx => '<path class="atriver" d="' + riverPath(ctx.it.proj) + '"/>'
});
```

It then appears in the map's layer panel, in the record as `it.on.rivers`, in
print, in an export and in a backup, with nothing in `atlas.js` touched. Two
hooks, and a layer may use either or both:

- `world(ctx) → svg` is drawn **inside the group that moves**, in world units.
  Its `sw` is a stroke width in picture units and is divided by the zoom on
  every frame, so a hairline stays a hairline however far in the map goes.
- `build(ctx) → svg` is drawn in the group that does **not** move, and
  `frame(g, ctx)` is called once a frame to put its children where the view now
  is. That is how the capitals keep their size and their typeface while the
  world slides under them.

The picked country uses both, and is why the seam is shaped that way: its shade
belongs in the world, where it is the country's own shape, and its name belongs
in the world too — until the country is smaller than the letters, and then the
name is the one thing that has to keep its size. One layer, one line in the
panel, one entry in the record, two spaces to draw in.

**`ctx` is one object per frame, and every screen-space layer is handed the
same one, in layer order.** That is the only thing the layers share, and it is
how type is laid out across a map rather than per layer: the capitals write the
boxes they took onto `ctx.taken`, and the cities lay out against them. A city
name therefore never lands on a capital's, and neither lands on the picked
country's name, without any layer knowing what the others are.

The rule that makes a map smooth is that **the world is built once and then
moved**. `lib/atlas.js` memoises the path strings; a pan or a zoom writes one
`transform` and a few stroke widths, and touches no geometry at all. A `frame`
hook that rebuilds markup, measures text or queries the document has broken
that, and it will not be obvious from a screenshot — only from the frame rate.
Everything the paint touches is looked up once and kept on the `<svg>` for that
reason.

**"Once" means once per projection, look, DETAIL STEP and WINDOW**, and the
last two are what make the difference between a map and a slideshow. A frame
costs what is in it. Without them the map handed the browser the whole planet
at its finest detail whatever it was showing: twenty-seven thousand points into
a thousand pixels at arm's length, and ninety-nine hundredths of the world
tessellated off the picture at an inch above Switzerland.

- `atlStepOf(z, prev)` is the one number the other two come off: the zoom in
  **whole octaves**, and **sticky** — it takes six tenths of an octave past the
  step you are on to leave it. The zoom is a spring, and a spring crosses a
  boundary on the way out, again on the way back and once more settling on it.
  Read the step off the live zoom and each of those crossings is a rebuild.
- `atlLod(n)` picks one of four simplification steps, each the size of a pixel
  in degrees at that zoom, so a step never throws away anything the screen could
  have shown. The coarse copies are made in the browser with Douglas-Peucker,
  which keeps the ends of every arc — and an arc's ends are the junctions
  countries meet at, so a coarse world is still in register with itself.
- `atlWin(it, v)` is the rectangle worth building, **snapped** to half a view,
  so a pan crosses a boundary about four times in the time it takes to drag the
  picture past itself rather than sixty times a second. It is measured **at the
  step, not at the zoom**: `k` moves every frame of a zoom, and a window that
  followed `k` was a new window — a new clip, a new set of contours — sixty
  times a second. A fifth of an octave of headroom is enough for the window to
  cover every zoom its step covers, because a window already carries half a
  view of slack. Crossing a boundary costs about a millisecond; between
  crossings nothing is rebuilt at all.
- Two and a half octaves of zoom is **four rebuilds over 241 frames**, and the
  harness holds it there. It used to be a rebuild on every frame there was.

**And one layer is too expensive even once a step.** The height field is
contoured with marching squares — tens of milliseconds, where a frame is
sixteen — so `relief` declares `heavy`, and a heavy layer is not rebuilt while
a hand or a spring is still moving. What is already drawn is vector: the zoom
rides on it, and the field is contoured once when the map stands still. The one
exception is coverage. A refinement can wait; a hole cannot, so if what is in
the DOM no longer reaches the edge of the picture the rebuild happens on the
spot whatever is moving.

Two more things keep a step change from being seen at all:

- **The bands are nested.** `GEO_BAND_SET` draws five levels at arm's length
  and nine close in, and every level a coarse set draws is in every finer one.
  Refining therefore *adds* a contour between two already on the map and never
  moves ground to a different tint — which is the difference between detail
  arriving and the map changing colour under the reader.
- **A rebuilt layer arrives rather than appears.** A layer may declare `fade`,
  and `atlSwap` then puts the new markup in *underneath* the old, moves the old
  nodes into a group over the top of it and fades that group off. The old nodes
  are moved, not built again — setting `innerHTML` detaches them, it does not
  destroy them — so the fade costs one empty `<g>` and no parsing. The picture
  is the old one, then both, then the new one, and at no point is it nothing.

Culling by box is enough for a coast or a border, which are one arc each and
there are two thousand of them. It is worth **nothing** for the land, which is
one ring for the whole of Eurasia — its box meets every window there is. So a
filled ring that straddles the window is cut to it with Sutherland-Hodgman
first. Clipping every ring against the same rectangle leaves the even-odd count
inside that rectangle exactly as it was, so the lakes and the holes still come
out as holes, and the window has a whole view of slack so the straight runs
along its own edges are never on screen.

Measured, with every layer on: 45,000 characters of path drawn at 32×, against
750,000 before — and no clip mask at all, where there used to be one built from
a thirty-thousand-point path on every frame.

**The countries are the second half of `lib/atlas.js`, and the whole of it
rests on one decision: every ring of a country is pulled into a single
coordinate frame.** It is the seam down the back of the world in a different
disguise. Fiji comes out of the data as two islands one on each side of the
180th meridian and Russia as one ring that walks straight over it; unrolling
makes a ring continuous again, but a ring is only continuous with *itself*, so
two rings of one country can end up a whole world apart and an even-odd
crossing count over rings in two frames is nonsense. `geoCoGeom` unrolls every
ring, pulls each to within half a world of the first, and slides the country
back over the map if that left its middle off the edge. Everything after it —
which country a click is in, the pole of inaccessibility, the largest name that
fits inside the outline, the box a map flies to — lives in that frame.

Four of those are worth knowing about before changing anything near them:

- **A name that fits.** `geoCoLabel` grows the box the name would occupy until
  an edge of the country cuts it, over one, two or three lines, and takes
  whichever carries the bigger letter. The answer is a size in *world* units,
  because the name is drawn inside the group that moves — so a name sized to
  fit its country goes on fitting it at every zoom, with nothing per frame.
- **The part of a country anyone means by its name.** France's box runs from
  French Guiana to Réunion and its middle is the mid-Atlantic. `geoCoMain` is
  the largest ring plus everything near it, measured in that ring's own spans,
  so Japan keeps its islands and Indonesia keeps Papua while Guiana and Réunion
  are left where they are. The full box is still what a click is tested
  against; `geoCoMain` is what a map flies to and a card is framed on.
- **A continent is a set of them, and the set is a shape.** `geoReg(proj, key)`
  builds one record for `co:12` or `ct:2` and everything above works off it, so
  the label, the spot, the path, the box and the capitals never learn which kind
  they have. The only real work is the outline of a *set*, and it is not a
  polygon union and does not need to be: the arcs are shared, so two countries
  of the set that touch draw the border between them twice from the same points,
  and a piece of outline drawn once is on the edge of the union. One pass over
  the segments gives the continent's coast and its inland borders together, and
  it is exact. The set is built from each country's `geoCoMain`, so a plate of
  Europe is Europe and not Europe drawn across the Atlantic to hold Guiana. The
  membership itself is not in the outlines and cannot be got from them — it is a
  table of seven lists at the bottom of the country section, and the two places
  it is a judgement rather than a fact (Russia with Asia, Turkey with Asia) say
  so where they are written.
- **The countries the pen is bigger than.** They are all in the table now —
  the base map is the 50m tier simplified per arc, so Nauru, Monaco and the
  Vatican are ordinary countries sharing ordinary arcs. What they still need is
  a way to be *seen* and *hit*: the map rings them while they are smaller than
  a full stop, `atlRingAt` hit-tests that ring in picture units before any
  polygon is consulted — the ring you can see is the ring you can hit — and
  `geoCoAt` takes a reach for the same countries in open water.

**Why the table is 50m simplified per arc, and not 110m.** One tolerance for
the whole planet is one tolerance too few. The 110m tier gave Russia about the
right number of points and gave Luxembourg *six* — a hexagon thirty kilometres
from the real border, a quarter of the width of the country — and it contained
no Nauru, Monaco or Vatican at all. Simplifying one *country* finer is the
thing that cannot be done: its neighbour would keep the old line and the two
would disagree by tens of kilometres along a shared border. Simplifying one
*arc* can, because Douglas-Peucker keeps the ends of a run and an arc's ends
are the junctions — so both countries either side of it move identically, and
the coastline, the borders and the dissolved land stay in register by
construction. Each arc takes the tolerance of the smallest country that uses
it. 145 KB against 53 KB, for 3.3× the points and every country on Earth.

**The height of the land is drawn, not photographed**, and that is the same
argument again. A picture of the field is the obvious thing: stretch 1080 cells
across a world, go in thirty times, and every cell is thirty pixels of soft
blur beside a coastline that is still perfectly sharp — and four hundred
kilobytes of PNG travels inside every export of every map that has it on. So
`geoReliefBands` runs marching squares over the cells instead, giving the
closed line where the land crosses each of nine heights, fills them lowest
first so each band covers the one below it, and hands back paths in world
units: smoothed like every other outline here, crisp at any magnification, cut
to the same window, and a few tens of kilobytes. It does not invent detail —
the cells are still a third of a degree — but the edge between two tints is now
a line rather than a gradient across thirty pixels of nothing.

The coast is not the field's to draw: a cell is 37 km and a coastline is finer,
so the lowest band spills into the sea. The sea is painted back over it — one
rectangle with the land path as a hole, under `fill-rule: evenodd` — which
costs one more fill of a path the map is drawing anyway, and is why nothing
there needs a clip either.

Projections are the same kind of list: an entry in `GEO_PROJ` with `fwd`, `inv`,
its height and the period it wraps at. A projection that does not wrap says
nothing, and the antimeridian handling stands down for it.

## Circuits, and the graph seam under them## Circuits, and the graph seam under them

`js/items/logic/gate.js` and `logic/circuit.js` need a **directed, port-level,
functional** connection between components, and it is worth writing down why
they do not reuse either of the two connection models already here.

**`page.links` cannot express it.** A string is `{id, a, b, c}` — two item ids
and a colour, undirected, and meaning whatever the person who tied it meant. An
arrow adds a direction but attaches to the *box* of an item rather than to
anything in particular on it, and is still decoration: nothing reads it. A wire
between gates has to name a port at each end, has to know which way it points,
and is the only reason the circuit computes anything. Forcing that into the
string record would have meant a link whose `a` and `b` sometimes mean an item
and sometimes an item-and-a-port, read by two files that disagree about which.

Older standalone logic items keep a second list beside `page.links`:

```js
page.wires = [
  { id, from: { item: 'src-id', port: 'q' },
        to:   { item: 'dst-id', port: 'a' },
        clean: 1, route: 0 } // the last two exist only after Tidy logic
]
```

and an item is stored as what it *means*, never as a picture of itself:

```js
{ id, type: 'logic', gate: 'nand', x, y, w, rot, z, lay }
{ id, type: 'logic', gate: 'sw',   on: 1, … }
{ id, type: 'logic', gate: 'clk',  hz: 2, paused: false, … }
{ id, type: 'logic', gate: 'dff',  q: 1, clk: 0, … }
{ id, type: 'logic', gate: 'cust', def: { name, n, table: [0,0,0,1] }, … }
```

New circuits contain the same records and wire shape inside one page item:

```js
{
  id, type: 'circuit', x, y, w, rot, z, lay,
  nodes: [{ id, type: 'logic', gate: 'sw', on: 1, x, y, w, z }, …],
  wires: [{ id, from: { item, port }, to: { item, port }, clean, route }, …]
}
```

The evaluator accepts a deliberately tiny page-shaped interface: `{id, items,
wires}`. `circuit.js` exposes its `nodes` and `wires` through that adapter, with
the real parent page id used for persistence. Model-provider, repaint and redraw
hooks let the shared clock, evaluator and truth-table code see nested components
without teaching `gate.js` the container's DOM or teaching core about logic.

Editor mode is runtime UI state, not document meaning. `LC_MODE` defaults every
circuit to `move`; the whole component body then owns one pointer gesture that
tracks movement 1:1, while a release inside its seven-pixel hysteresis remains a
switch/clock tap or push-button hold. `inspect` maps the same body tap to
`LC_PICK` and its local action strip. Ports win before either recognizer, so
wiring never depends on mode. The scrollable rail stops wheel propagation while
leaving the event's default action intact: its catalogue scrolls natively rather
than panning the sheet.

The rail is only a component catalogue. A seven-pixel pointer hysteresis lets a
tile remain an ordinary click or become a drag with a lightweight ghost; the
drop point is converted into the circuit's normalized coordinates and handed to
the same `lcAdd()` path. Modes, Tidy, zoom, canvas visibility and the example
library are contributed through the ordinary item `tools()` hook. They appear
only in the contextual selection toolbar, outside the circuit body's measured
layout, so control wrapping cannot change canvas geometry during resize.

The contained circuit is a resizable page item with its own view. Stored `zoom`,
`viewX` and `viewY` map stable world positions into the stage; wheel zoom keeps
the world point under the pointer anchored and empty-canvas drag changes only
the view centre. Component drag and palette drop apply the inverse mapping back
into world coordinates. Wires, nodes and static output remain one transformed
layer, while the inspector and toolbar stay at a stable readable size above it.

Frame resize is deliberately independent. A local `ResizeObserver` reapplies a
viewport-density factor of `min(1, 48 / environment.w)` to the shared world
layer. A wider frame therefore exposes more world while components retain their
physical size; a narrower frame may make them smaller but never magnifies them.
Core drag stays generic and explicit local zoom remains an independent control.

`LC_PRESETS` is declarative data: a name, searchable description and arrays of
ordinary node and wire records. Loading Half adder, Full adder or any of the
other examples creates fresh ids and then returns to the exact same evaluator,
renderer and editor as a hand-built graph. There is no template component, no
parallel simulation path and nothing special to preserve in a backup.

The **geometry** is shared, though — `pinPoint()` from `paper/strings.js`, the
overlay's coordinate space, and `onPageOverlay()` for the static render — so
there is one way of drawing a line between two things on the sheet and three
features using it.

**The evaluator knows nothing about Boolean logic.** `lgEval(page)` walks the
wire graph in dependency order and asks each node what it is worth; only
`lgOne()` reads a truth table or a component's small evaluator. That is the seam a scientific
dataflow would grow along later: ports are *named* rather than numbered, values
are an open set rather than a bit, and the order, the fan-out and the cycle
handling are all indifferent to what is travelling. `js/items/math/node.js` is
the older, table-shaped graph and stays where it is; nothing has been merged on
speculation.

**Order starts with Kahn's algorithm.** Start with the gates nothing feeds, and
let a gate join the queue once every input it has is settled. Its remainder
contains both the actual cycles and their downstream tails. Two iterative
Kosaraju walks identify the strongly connected cores as `e`, then one final
dependency pass evaluates the tail from those errors. That distinction lets a
disabled Tri-State electrically isolate a bad input and emit `z`. There is no
recursion or iteration limit, and the work stays linear in components and leads,
so a ring cannot hang or blow the stack.

**Five signal states, not two.** `0`, `1`, `x` (unknown or undriven), `z`
(high impedance) and `e` (this cannot settle). An undriven input is emphatically
not a nought, a disabled tri-state gate remains distinct from it, and a loop is
distinct from both. The value stays scalar all the way through evaluation,
ports, stored wires and rendering.

**Stored state is an explicit graph boundary.** A flip-flop's Q is a source for
the combinational pass, so its incoming dependencies are cut before Kahn's
walk and feedback through it is not marked as a loop. `lgAdvance()` evaluates
the old circuit once, detects every rising edge, calculates every next state,
then commits them together. The one clock scheduler owns all running clock
items. Its phase is runtime state; only reached flip-flop state is queued for
persistence, with history capture disabled so a running note cannot consume
its undo stack.

**Tidy logic changes geometry, never topology.** Both the legacy selection
action and the contained editor share the signal-ranking function (with
flip-flops as new sources), preserve vertical peer order, spring stored
positions to the layout and mark their wires for rounded orthogonal routing.
The same stored route goes through live, print and export. A new pointer gesture
interrupts the springs and commits their current positions.

**Nothing is cached.** Working a sheet out is one Map and one sweep, and a stale
answer after an undo would be a wrong picture on the paper. That is a far worse
trade than the microseconds a cache saves, and it is why `html()` can compute the
value it draws rather than reading one off the item — which in turn is why a
print, a thumbnail and an export come out right without anything having to repaint
them first.

### Ports are measured, never assumed

The one genuinely hard part. An item on this sheet may be turned to any angle,
and **a turned gate's ports are nowhere near the edges of its bounding box** —
`getBoundingClientRect()` on the item gives the axis-aligned box of the *rotated*
symbol, so `edgePoint()` (which the arrows in `strings.js` use) is wrong for a
wire.

What is true at every angle: rotation about an element's own centre maps that
centre to itself, so the middle of a small symmetric element's box **is** that
element, turned or not. So every port is a `<circle>` in the gate's own SVG, and
a lead's anchor is that circle's box centre read off the DOM — exact at 0°, at
37° and at anything the app grows later. The tangent a lead leaves along is
`it.rot` turned into a unit vector, so a wire comes out of the nose of a gate
rather than off to one side of it.

Anything else that ever needs to attach to a *place on* an item rather than to
the item should do the same: put something in the DOM there and measure it.

Contained circuits add one useful exception because their editor owns a stable
normalized `1000 × 620` coordinate system and does not rotate its internal
components. Their port coordinates come from the very same symbol geometry and
are converted directly into that viewBox. Live drawing and static output thus
produce identical paths without a layout measurement; legacy standalone items
retain the rotation-aware DOM measurement above.

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

**2355 assertions**, and they are the real specification of this app. Among them:
that all 90 script files load without throwing; that library normalization
recovers orphaned entries and breaks folder cycles; that a `[[link]]` finds its
file whatever its case or extension, ignores one written inside code, survives
a rename of either end, and appears in the graph's index at both of its ends;
that a display equation opened on its own line compiles as one block rather
than reaching across the lines around it, that a click on a line carrying a
formula lands where it was aimed because the source behind the compiled run is
counted rather than the glyphs on screen, and that undo in a Markdown document
puts the whole document back; that the dashboard counts
local days rather than UTC ones, counts writing rather than reading, never
counts the same save twice, seeds itself from the timestamps a library already
had, and draws fifty-three weeks with the days still to come left blank; that Markdown previews,
editing, tasks and saved themes work end to end; that a fresh note is one empty
sheet 1980 × 1320 with four rails and no page furniture at all; that the
sheet-unit helpers are exact no-ops on a 660-unit sheet and scale by exactly a
third on the real one; that every add-menu entry adds the type it claims to;
that the palette and the registry agree in both directions — every tile a
registered kind, every public kind a tile; that nothing tilts on its way onto the
paper; that a text box, a sticky and a checklist are each as wide as their
longest line with `it.w` only the ceiling they wrap at, that the resize handle
pins one there and the ↔ button hands it back, and that a card which always
sizes itself refuses to be pinned and is offered no button; that a writing box
carries exactly one highlighter and no equation, pin or arrow button, that the
panel behind it paints from a chip and from the wheel and takes a highlight off
again, and that pins, strings and arrows are Decor tiles whose two clicks pick
the ends and tie the knot; that a text box, a sticky or a checklist left with no
writing takes itself off the page, that one still holding a word does not, that
an item with a panel open on it is left alone, and that an undo brings a
vanished one straight back; that growing the sheet leaves every item and every stroke exactly where
the eye had it, that one `Ctrl`+`Z` puts the paper *and* everything on it back,
and that there is a ceiling; that a zoom gesture scales rather than relays out
and holds the point you aimed at; that every item type builds both live and
through `buildPage(page, false)` — the path print and exports take; that a code
cell colours a python line the way the editor would and reparses it as rust;
that a table works out its formulas, reads a real `.xlsx` built in the harness,
and hands two columns to a plot; that every country on Earth is in exactly one
continent, that a continent's coast and the borders inside it are its countries'
own outlines counted once each, that its name is set inside that coast and
across those borders, and that a card of France brought up against a card of
Europe clicks into it at Europe's own scale with one point of the world at one
point on the paper in both; that the expression compiler reads `x^2+y^2=1`
as an equation, `y<x^2` as a strict region and `r=cos(2θ)` as polar, writes
every one of them back out as LaTeX the typesetter accepts, and refuses `xy` with
advice; that the unit circle comes out one closed curve two units across and a
circle cut by the window comes out two arcs, that `1/x = y` never draws its pole,
that `y<x^2` shades one see-through region under one dashed boundary and
`y>=x^2` the other side under a solid one, that `r=1` is a circle until the
basis is sheared and an ellipse after, that `e^(ix)` draws its real and imaginary
parts, and that print draws the same shading without touching the record; that a
log axis names its decades and rules 2…9 quietly between them, puts the basis
back and refuses a matrix, and that `y=x` on log–log is straight; that a window
in the millions writes its numbers as powers of ten with no two touching; and
that the expressions panel is absent from the static page, adds a row on ⏎, takes
an empty one off on ⌫, hides a curve from its dot and never wakes the LaTeX pad;
that a `$` typed in a writing box comes back as
a pair and a second one opens it out onto three tidy lines, that `\fra` offers
`\frac{}{}` first and ⏎ writes it with the caret in its first pair, and that
everything the completion list offers really compiles; that a chart draws one slice per positive row
with the labels the label engine promises; that a node graph works out each card
once and says so rather than hanging when it is wired in a circle; that every one
of the eight built-in truth tables comes out right on every row of it, that an
input nothing is wired into is *not* read as a nought, that a second lead into
one input replaces the first rather than joining it, that a circuit wired in a
ring is marked rather than run for ever, and that a gate turned a quarter turn
swings its ports a quarter turn — which is the whole of the rotation-aware port
geometry, held honest; that tri-state isolation, the four-bit display, all four
flip-flop tables and real rising edges agree; that Science contains one public
Logic circuit whose contextual rail holds all four named families;
that nested controls operate without page selection, components stay above
translucent leads, local Delete preserves the environment, local zoom leaves its
frame alone and frame resize does not enlarge components, palette tiles drag to a chosen point, the
canvas surface can disappear, common circuits search and load as ordinary
working graphs, Tidy restores signal order, and static rendering retains the
nested graph; and that legacy
marquee-selected circuits move, delete and tidy without changing their
connections; that a real
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
the computed style of 76 selectors, which is how a rule that changed file and
lost its place in the cascade gets caught. See `tools/verify/README.md` for what
it covers and the traps in extending it.
