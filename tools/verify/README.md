# Checking the sketchbook still works

There is no test runner and no unit test. The app *is* the test, and there are
two of these because the app has two lives:

| | Drives | Covers |
| --- | --- | --- |
| `run.sh` | headless Firefox | the app itself — every feature |
| `desktop.sh` | the Electron shell | what only exists once there is a window |

```bash
tools/verify/run.sh              # checks the project this sits in
tools/verify/run.sh /some/copy   # or any other copy of it

tools/verify/desktop.sh          # needs `npm install` first
```

Both print the same pass/fail report. `desktop.sh` also **exits non-zero** on a
failure, because CI gates the release builds on it.

`run.sh` needs no Node and never will. `desktop.sh` does — but only because
Electron is Node; it still verifies by running the real app and asking it
questions, not by loading modules.

It prints a pass/fail count and every failure. 811 assertions, and they should
all pass — if one doesn't, that is a real regression.

## What it covers

- nothing throws while the 59 script files load, in order;
- the app boots, opens a book and draws a page;
- every entry in the add menu adds the type it claims to;
- every item type builds live, with a body and a toolbar;
- and builds again through `buildPage(page, false)` — the path print, the
  overview and exports all take;
- `$$…$$` compiles to MathML, and a bad formula stays visible;
- the table: that its formulas come out right, that inserting a row carries
  every reference with it and deleting a column leaves `#REF` behind, that a
  circular formula is caught rather than hanging, that the rails and the header
  buttons really add and remove, that the cell cursor walks under the arrow
  keys, that typing opens a cell and `Delete` clears it rather than deleting the
  whole table, and that the static path shows the answers and none of the
  handles;
- the expression compiler does its arithmetic and rejects nonsense;
- the plot draws its curve, its vector and a *filled* arrowhead;
- a table dropped on a plot: that the right columns are picked, that the header
  row names the axes, that error columns come through, that editing a cell moves
  the point, that a plot with data in it keeps a shape of its own while a bare
  one still comes out square, and that the points survive the static path;
- **a long table**: that only the band on screen is drawn *and* only those rows
  are worked out, that the header stays pinned above it, that the wheel scrolls
  it by rows and `ctrl`+wheel is left to the desk, that the cell cursor drags the
  band after it, that the readout adds up what you have picked, that folding it
  gives an icon and a window that scrolls without moving the one on the page,
  that sorting carries whole rows and refuses when there are formulas about, and
  that print gets the band **and the line saying which rows it is**;
- **reading a spreadsheet**: a real `.xlsx` is built inside the harness — a zip
  written byte by byte, stored rather than deflated, since the reader ignores the
  checksum — and read back: shared strings, a date serial written out as a date,
  float noise trimmed, and the table sized and aligned around it. Plus the `.csv`
  path both ways, delimiter sniffing included;
- **reading a slide deck**: a real `.pptx` is built inside the harness the same
  way the workbook is — a zip written byte by byte, stored rather than deflated,
  carrying a master, a layout, a theme, two slides, a picture drawn onto a
  canvas here, a table, a group, freehand geometry, a Symbol run, a slide-number
  field and a page of notes. Read back: that the deck is two slides of 960×540
  points, that the title lands at the master's 44pt in the theme's accent
  through the master's colour map and the theme's major font, that the master's
  band is drawn while the master's *footer* is not — PowerPoint shows one only
  where the slide carries its own — that a Wingdings bullet and a Symbol run
  come out as letters this machine actually has, that a group maps its children
  into its own coordinate space, that freehand geometry, dashes and arrowheads
  survive, that a field knows which slide it is on, that a table draws its cells
  and keeps a cell's own fill, that the notes come through, and that the whole
  thing rasterises with its pictures inlined;
- **the deck on the page and the reader**: that a dropped `.pptx` is claimed by
  the slides feature and lands knowing its length and shape, that the card draws
  the slide itself and walks it, that it keeps a still which is what print takes,
  and that the reader opens where the card was, walks a slide at a time, refuses
  to go before the first, shows every slide in the grid and draws them, zooms by
  scaling rather than redrawing, shows the notes written under *that* slide,
  lifts a slide onto the page as a captioned picture, and closes on `Esc`;
- **a chart's margin**: that its viewBox opens out around the plotting area, that
  no number is written over that area and none falls off the picture, that the
  axis names are centred on their axes the way `plt.xlabel` sets them, that the
  y one is rotated, and that a bare plane still has no margin at all;
- that a spreadsheet's worth of points goes down as one path rather than fifty
  thousand elements, while a readable number of them stays one mark each;
- **the node graph**: that a table comes out of it as columns with words and
  blanks as gaps, that each card is worked out once and remembered until
  something changes, that Columns keeps its ticks by name when a column is
  inserted in front of them, that arithmetic pairs columns up or refuses and
  says which counts didn't match, that a formula that comes out infinite leaves
  a hole rather than a spike, that a graph wired in a circle says so instead of
  running, that a cell edited two nodes upstream moves the point on the plot
  while a table nothing reads leaves it alone, that a slider dragged in the
  middle carries down the wires, that a lead really can be pulled out of a
  socket and dropped on a table, out of a card into a socket, and onto a plot to
  become a series — and that print draws the wires too;
- **the colour wheel**: that the hue goes round from straight up and reads back
  as the hue that drew it, that a colour taken down to black still remembers its
  hue on the way up again, that a hex typed in sets the wheel and a colour set
  behind its back is worked out rather than believed, and that dragging the
  wheel moves the dot **without the card being rebuilt underneath it**;
- the wireframe guides draw lines with no `NaN` in any path;
- **the pie and its family**: one slice per positive row wearing the palette's
  slots in order with a paper seam between them, labels inside in ink picked by
  the slice's lightness, the too-small slices led out on cornered lines that
  keep apart, ⌖ seating names beside their slices and lining out what would
  pile up, a label given an offset keeping it — with a leader once outside its
  slice, none back inside, and a double-click clearing it — the ✎ slider
  riding every label as a `font-size` attribute and the face as a class on the
  svg, ten slices in ten colours on crisp with the + row closing at the cap,
  all four looks and all six palettes drawn with no `NaN`, the dark
  stepping arriving with a dark paper, typing in the legend growing a slice,
  the warm palette holding to its six slots, bars staying one colour, and the
  static path keeping the legend as words rather than inputs;
- **undo**: that placing, deleting and moving are each one step and each comes
  back whole, that a real drag *and the throw at the end of it* take one
  `Ctrl`+`Z` between them while two strokes of real ink take one each, that a
  burst of typing is one step, that a deleted item's file is still in the store
  while the delete can be taken back and comes back with it, that a page added
  and a page removed both go back — the removed one carrying what was on it,
  with the book turning to the page it put back — that turning a page is not a
  step at all, that doing something new drops what was waiting to be put back,
  that `Ctrl`+`Z`, `Ctrl`+`Y` and `Ctrl`+`Shift`+`Z` are wired to the right ends
  of it, and that an empty stack says so rather than throwing;
- **a computed-style fingerprint of 61 selectors**, so a rule that moved file
  and lost the cascade is caught;
- the page-unit helpers still come out as the numbers they replaced on a normal
  page — if `pgK()` isn't 1 there, every default width and nib has moved;
- a canvas: that it opens as one sheet with no page furniture, and that pulling
  a rail leaves every item and every stroke exactly where it was;
- that a burst of pans writes the transform **once, on the next frame** — if
  `applyView()` ever goes back to writing per event, this catches it;
- the paper-grain switch, both ways, down to the computed `display`;
- that a zoom gesture leaves `zoom` alone and puts a `scale()` on the sheet, and
  that committing it swaps the scale for the real thing;
- the map: that it has the sheet's shape, carries a viewport box, walks the desk
  when clicked, drags without compounding, and goes away when switched off;
- that the spot under the pointer survives a zoom **and its commit**, on a sheet
  bigger than the desk — where the desk moves the paper about underneath you;
- that growing the paper leaves what is on it where the eye had it;
- that a huge sheet does not push the desk, and the toolbar with it, off screen;
- **Export book for real** — the blob is intercepted and checked for every
  feature's styles.

## The desktop shell — `desktop.sh`

Five phases, each its own process and its own throwaway `userData`, so a run
never touches the books in `~/.config/Open Note`. It requires the real
`desktop/main.js` rather than reimplementing it, so a bug in the shell fails the
run.

- **boot** — the page is served from `opennote://app` and not `file://`, the
  context is secure, IndexedDB really opens rather than falling through to
  `store.js`'s in-memory fallback, the library round-trips, `flush()` is both
  reachable and resolves (the save-on-close hook depends on it), and all 24 item
  types and the palette are there.
- **persist** — boot runs twice against one profile and the book's id must come
  back identical. A different id means the library was silently rebuilt, which is
  data loss wearing a working app.
- **book** — opens a book, zooms, turns a page and resizes, and requires a clean
  console throughout. Then puts a real bookmark on the page and checks
  `syncBmScale` restores the tab scale.
- **offline** — every `http(s)` request is cancelled at the session, and the four
  families must still load and *measure* as themselves.
- **race** — a copy of the app with a `resize` fired in the gap between
  `core/nav.js` and `ui/bookmarks.js`, holding rule 3 in
  `docs/architecture.md` honest.

### Four traps

1. **Cut only `http(s)`/`ws`, never everything.** `protocol.handle` serves the
   app through `net.fetch` on a `file://` URL underneath, so a blanket block in
   `onBeforeRequest` cancels the app's own scripts — and the page half-loads
   instead of failing, which reads as a font bug.
2. **`document.fonts.check()` lies.** With no matching `@font-face` at all it
   still answers `true`, because it reports what the text *can* be drawn with.
   Use `document.fonts.load()` and check every face came back `loaded`.
3. **Measure against `serif`, never `monospace`.** IBM Plex Mono has the same
   advance width as the system mono face — 504px against 504px — so a mono
   fallback measures identically whether the real font loaded or not.
4. **The shelf is not a book.** With a library already on disk the app opens the
   shelf, and a probe that stops there never renders a page. The load-order bug
   above lived entirely in code that only runs with a book open, which is why
   **book** is its own phase.

## The three traps

Each of these cost real time before the harness worked:

1. **Always a fresh `--profile`.** A shared one hits "Firefox is already
   running"; a reused one keeps the last run's IndexedDB, so the app opens the
   shelf instead of a book and nothing matches.
2. **The screenshot fires on `load`, which beats any async probe.** `run.sh`
   holds `load` open by serving a deliberately slow subresource (`/slow?ms=`).
3. **App-level `let`/`const` are not on `window`.** From `probe.js` they are
   reachable as bare identifiers only — `typeof index !== 'undefined' && index`,
   never `window.index`.

Two more, if you extend `probe.js`:

- Synthetic `PointerEvent`s do no hit testing. Dispatching on the `<svg>` makes
  `e.target` the svg, so handle-based branches never run — dispatch
  `pointerdown` **on the handle element**, then move and up on the svg.
- `render()` rebuilds every item, so any node captured earlier is detached.
  Re-query in each stage.
- **Headless never gives the caret focus.** A new item lands with `startEdit()`
  called on it, so it keeps its `editing` class, and an item being edited
  refuses a drag — clear the class (and blur) before dispatching one. It is also
  why `document.activeElement` is `BODY` when the app thinks you are typing.

Never `pkill -f` anything matching the server's command line — the shell's own
command line contains that text and pkill kills the shell.
