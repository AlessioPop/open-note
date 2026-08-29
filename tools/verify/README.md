# Checking Open Note still works

There is no test runner and no unit test. The app *is* the test, and there are
two of these because the app has two lives:

| | Drives | Covers |
| --- | --- | --- |
| `run.sh` | headless Firefox | the app itself — every feature, 2146 assertions |
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

It prints a pass/fail count and every failure. 2146 assertions, and they should
all pass — if one doesn't, that is a real regression.

## What it covers

- nothing throws while the 90 script files load, in order;
- the app boots, opens a note and draws its sheet — one sheet, 1980 × 1320,
  four rails, and no page furniture of any kind;
- every entry in the add menu adds the type it claims to;
- every item type builds live, with a body and a toolbar;
- and builds again through `buildPage(page, false)` — the path print and
  exports both take;
- `$$…$$` compiles to MathML, and a bad formula stays visible;
- **writing maths**: that a box flattens to one string with its breaks and that
  every offset in it round-trips back into the DOM; that a `$` writes the pair,
  that a second one inside that pair opens out three tidy lines and takes a line
  of its own when there is writing beside it, that it steps over a closer rather
  than doubling it, and that well inside a formula a `$` is only a `$`; that an
  unclosed `$` is not a formula and `\$` is not a delimiter; that `\fra` offers
  `\frac{}{}` first and `\begin{pm` offers `pmatrix`, that everything the list
  offers really compiles, and that the writing surfaces declared themselves to
  the registry. Then the keyboard end to end on a real `.txt` with the caret in
  it: the `$` arriving as a `beforeinput`, ↑ ↓ walking the list, ⏎ writing the
  snippet with the caret in its first pair, ⇥ walking to the next empty one, ⇥
  handed back to whoever else wants it outside a formula, Escape putting the
  list away without stopping the typing, and the pad going when the box does;
  and that the pad is as wide as the equation in it — at its floor for a short one,
  grown but under its ceiling for a long one, with nothing cut off, and back down
  again when the formula shrinks;
- **code ticks**: that a phrase in backticks is a hit and an unclosed one is not,
  that a phrase does not run over a line, that three backticks open a block and
  the word after the fence names its language, that a `$$` inside a fence is not
  maths and a backtick inside a formula is the formula's; that a `` ` `` writes
  the pair, a second grows it, a third opens the fence onto three lines and takes
  a line of its own when there is writing beside it, that it steps over a closer,
  and that inside a fence a `` ` `` and a `$` are only themselves; then a box
  compiled and taken apart again — the `<code>`, the block with its language, its
  code and its copy button, the writing either side left alone, what `sanitize()`
  stores (the backticks, never the markup), that pressing copy is not the start of
  a drag, and that maths and code in one box each leave the other alone; that a
  block is the code cell — its bar with no traffic lights on it, its language
  named in full, its colours off the same scanner — that the language is a
  picker where picking it can be kept and a label where it cannot, that picking
  one rewrites the fence's own opening line and asks the box to store itself,
  and that a printed block keeps the colours and loses the buttons. Then the keyboard end to end on a real `.txt`, ⇥ ⇧⇥ ⏎ and a bracket
  inside the fence and none of them outside it;
- **the marks a line wears**: that `# ` `## ` `### ` are three levels and more
  hashes still stop at three, that `---` alone is a rule, that a hash in a
  sentence, a `#1` and a hash with nothing after it are none of those, and that a
  heading inside a fence or inside a formula is left where it is; then a box
  compiled and taken apart again — the block with the hashes off its front and
  kept as its source, the writing either side left alone, the line's own ending
  going with it so no empty line is left under a heading built out of `<br>`s and
  handed straight back when it is unwound, what `sanitize()` stores (the hashes,
  never the markup), and marks, code and maths in one box each leaving the others
  alone; then a real text item, where leaving the box compiles the heading and
  the rule, what is stored is what was typed, coming back gives the hashes back,
  and the printed page carries the heading;
- **bullets, tasks and arrows**: that every `- ` line is a bullet and a tab or
  two spaces is one step in, that `- [ ] ` and `- [x] ` are a task and a done
  one, that a dash with nothing after it, a dash mid-sentence and `---` are none
  of those, and that a bullet inside a fence is code; what ⏎ does on a list line
  — the next bullet at the same depth, an unticked task after a ticked one, the
  list ending on an empty bullet and stepping back out when that one is nested —
  and what ⇥ and ⇧⇥ do, both of them leaving ordinary writing and a fence alone;
  then a box compiled and taken apart again, the depth on the row, the box that
  is not part of the writing, and what `sanitize()` stores; then the arrow, left
  alone inside code and inside a formula but not inside a bullet; then a real
  text item, where clicking a box ticks the task off, the one bracket in the
  source is what changed, and the printed page carries the list; and the
  keyboard end to end on a real `.txt`, ⏎ and ⇥ on a bullet, the step landing as
  a tab and coming off cleanly, neither key touching ordinary writing and
  neither taking one another handler has already claimed; and — since a browser
  swaps a space for a non-breaking one wherever it thinks the space might
  collapse — that an indent and a marker written with those still read as an
  indent and a marker, and such a task still ticks off;
- **bold and italic**: that two stars, one and three are bold, italic and both,
  that arithmetic, an unclosed star and a pair that would reach onto the next
  line are none of them, and that a star inside code or a formula is that
  language's own; a box compiled and taken apart again, and what `sanitize()`
  stores; then what ⌃B and ⌃I do to what is picked out — the stars going round
  it, coming off again whether or not they were picked out with it, the pair
  written with nothing picked, and neither key ours inside a formula or across a
  line ending; then both of them end to end on a real `.txt`, with what was
  picked out still picked out afterwards;
- **what a key does inside code**: `cdKey()`, the one rule table the cell and a
  fence in a sentence are both typed under — ⇥ writing the language's own step
  (four spaces in python, a tab in go), ⇧⇥ taking one off, both of them moving
  every line of a selection and handing it back picked out for the next ⇥, a
  blank line left blank, ⏎ keeping the indent and opening a block out between
  braces, brackets and quotes closing themselves, stepping over a close already
  there, wrapping what is picked out, backspace taking an empty pair, and an
  ordinary letter left to whoever else wants it; and that a fence names its
  language the way everything else does (`py`, `C++`, `zsh`, and nonsense → none);
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
- **reading a FITS file**: a real `.fits` is built inside the harness the same
  way — 80-column cards padded out to whole 2880-byte blocks — with three HDUs,
  a `CONTINUE`d long string, a `HIERARCH` keyword, a Fortran `D` exponent, an
  unsigned image and a binary table. Read back: that it walks to three HDUs and
  each one's header starts exactly where the last one's data ended, that the
  chain adds up to the whole file, that `info()` names and shapes them the way
  astropy prints them (numpy order, so NAXIS backwards), that a repeat count is
  the shape of one *cell* and not a row count, that BZERO 32768 on BITPIX 16
  means unsigned, and that the search looks in the value and the comment as well
  as the keyword. Then the reader: that the info table is what opens, that a run
  of `COMMENT` folds itself away, that picking a table row lists its columns
  with a cell shape each, that typing narrows the header and lights the match,
  that searching every HDU crosses from a table into the primary — and that what
  lands on the page is a **digest**, with no card text in it at all, because a
  note is rewritten on every keystroke and headers are long;
- **pulling a FITS column out**: that the plan is made before the read — a short
  column whole, a long one every *n*th row where the walk is affordable, its
  first rows where it is not, each with the sentence that says so; that the
  values that come back are the values that went in, that a float32 is written
  to the seven figures it carries rather than the seventeen it does not, that
  `TSCALn`/`TZEROn` are applied and a `TNULLn` comes over as a gap; that a
  vector column becomes one column per element; that a variable-length, bit or
  complex column is refused in a sentence. Then the gesture: that a tap picks a
  column and another tap puts it back, that what lands on the sheet is an
  ordinary table with the column names and units as its header row, and that a
  drop on a table already there joins the columns to it, names on the header row
  and gaps intact;
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
- **logic gates**: that every one of the eight built-in definitions carries the
  table a textbook prints and that the inverting four really are the plain four
  turned over and given one bubble; that a real circuit driven by two switches
  gives the right answer on all four rows of all eight; that the first input is
  the high bit of the row number, which only a lopsided custom table can prove;
  that one output feeds three gates at once and three inverters in a row invert;
  that a gate with nothing wired into one input says it does not know rather than
  reading it as a nought, and that not knowing carries downstream; that a second
  lead into one input replaces the first rather than joining it, that a gate
  refuses to be wired into itself, and that an output cannot be wired to an
  output; that a ring is worked out rather than run for ever, that both gates in
  it and everything hanging off it are marked while a gate nowhere near it is
  untouched, and that cutting one lead lets the whole thing settle; that all five
  signal states differ by more than their colour; that Tri-State emits `z` while
  disabled, isolates a loop and passes both bits while enabled; that a four-bit digit reads 1010
  as A; that SR, D, JK and T implement their characteristic tables, D changes on
  a real rising edge and Q-bar is inverse; that the push button holds only until
  release and the clock scheduler advances without a simulation step; that the
  Science shelf has one contained Logic circuit, whose contextual rail has the four
  labelled families and every named component once in a wheel-isolated,
  scrollable catalogue; that its workspace controls stay in the contextual
  item toolbar and the canvas has no control header or labels; that Move is the default and a component body drags directly without a
  hover handle; that a palette tile drags to a chosen position as well as
  accepting a click; that Inspector exposes switch Style and
  truth-table actions; that a nested switch operates without selecting the
  environment or opening its toolbar, component stubs stop cleanly at their
  outlines, components render above translucent leads, local zoom leaves the
  circuit frame unchanged and frame resize does not enlarge components, Canvas hides only the surface, circuit search
  loads an ordinary working half adder, Tidy restores signal order, local
  Delete removes a component rather than its environment and closes its stale
  truth-table panel, and static output
  keeps every nested component and lead; that a switch can really change from
  lever to rocker to plain 0/1; that a lead really can be
  dragged from an output onto an input, from a bare input onto an output, picked
  up off an input it already drives and moved, and dropped on bare paper to come
  out; that repaint preserves an in-progress lead and Escape restores a lead
  being rewired; that clicking one picks it out and `Delete` takes it away; that deleting a
  gate takes every lead on it; that **a gate turned a quarter turn swings its
  output port a quarter turn about its own middle** — nowhere near the edge of
  its box — and that turning it does not stretch the reach of its ports; that
  moving and resizing a gate move the lead with it; that marquee selection picks
  exactly what its rectangle crosses, moves the group rigidly, deletes it in one
  operation, and offers Tidy only for a connected circuit; that Tidy restores
  signal order, resets rotations and stores orthogonal leads without changing
  their endpoints; that the truth-table panel
  opens beside the gate rather than on top of it, lights the row the gate is
  standing on, lights none while an input is bare, walks the lit row when a
  switch is flicked, refuses to be typed over on a built-in, and writes itself
  out as an ordinary table; that a custom gate's answers *can* be clicked, that a
  third input doubles the table while keeping what was written, and that the
  symbol grows a port to match; that a symbol knows its value the moment it is
  built, with no repaint — which is what print, thumbnails and exports depend on;
  that placing a gate, making a connection and flicking a switch are each one
  `Ctrl`+`Z`; that the leads are written to the store with the sheet and read
  back saying the same thing, that a backup carries them and does not renumber
  the items they point at, and that print, an export and a thumbnail draw the
  leads, the junction blobs and the values; and that the symbols take each
  theme's ink rather than a baked-in black;
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
  while the delete can be taken back and comes back with it, that **growing the
  sheet is one step that puts the paper *and* everything on it back**, that
  doing something new drops what was waiting to be put back,
  that `Ctrl`+`Z`, `Ctrl`+`Y` and `Ctrl`+`Shift`+`Z` are wired to the right ends
  of it, and that an empty stack says so rather than throwing;
- **a computed-style fingerprint of 76 selectors**, so a rule that moved file
  and lost the cascade is caught;
- the sheet-unit helpers are exact no-ops on a 660-unit sheet — if `pgK()` isn't
  1 there, every default width and nib has moved — and scale by exactly a third
  on the 1980-unit sheet a note really starts at;
- growing the sheet: that a rail click, a rail drag and `growSheet()` all leave
  every item and every stroke exactly where it was, and that there is a ceiling;
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
- **chemistry**: that the library parses and names itself, that ethanol built
  by a click, a drag, a chain tap and keystrokes reads `C₂H₆O` at 46.07, that
  `c` then `l` relabels to chlorine and `2` doubles the bond under the mouse,
  that a bond click cycles its order, that `-` charges an atom, that a carbon
  with five bonds wears the red halo, that the window slides so the drawing
  stays put as it grows, that rings go on empty paper, fuse on a bond and hang
  from an atom, that `caffeine` in the ⌕ box arrives laid out, that the
  condensed and Lewis styles draw, that the corner handle scales the 2D and 3D
  panes together, that paper exports have transparent SVG/PNG grounds, black
  connections and flat element colours, and that the ChemFig clipboard action
  copies only molecule code with exact angles, lengths, ring hooks, shifted
  skeletal double bonds and dotted hydrogen bonds, that highlight mode has a
  neutral pointer and no editing ghost, that the 3D view has
  every ball with no `NaN`, bonds within 12 % and no drift, that a drag turns it
  and a click picks a shape, that the wheel sizes it, that labels, lone pairs
  and space-fill draw with gradient ids unique to the live item, that it all builds
  statically, that the periodic table has 118 cells with rows no taller than
  its cells, taps neon and puts cerium on the f-block row, and that the picker opens, takes a click on Cl
  and `b` `r` `Enter` as bromine;
- **the chart of the nuclides**: the table first — that NUBASE parses to 5646
  nuclides with numbers that are numbers, that every element in nature adds up
  to 100 %, that half-lives read back as seconds with their limits kept, that
  the Q values and separation energies subtracted out of the mass excesses come
  out right for ²³⁸U, ¹⁴C and ²²⁶Ra, that the binding-energy peak is ⁶²Ni at
  8.7945 MeV/A, that every decay mode in the data is a step across the chart bar
  the four that fission, that every beta minus lands on a nuclide that is really
  there, and that the four natural series run to ²⁰⁶Pb, ²⁰⁷Pb, ²⁰⁸Pb and ²⁰⁵Tl
  in fourteen, eleven, ten and twelve steps. Then the card — that it lands
  straight showing the whole chart, that its 3558 ground states and 756
  metastable slices are drawn as ten paths and not four thousand rectangles,
  that the magic numbers are ruled across it, that all four colourings draw with
  no `NaN` and a key that matches, that the foot writes uranium-238 out in full
  with an arrow to each daughter, that a press picks the square under it and the
  top slice of a split square is the metastable state, that the wheel zooms
  about the pointer and leaves the spot under it, that a three-nuclide drag
  moves it three nuclides, that zoomed in the squares carry their symbol, mass
  number and half-life and the side counts name the elements, that ⇢ follows
  uranium-238 fourteen arrows down to lead, that the ⌕ box reads `Tc-99m` as it
  is typed and Enter goes there, and that it prints whole with no buttons;
- **the world**: the tables first — 1959 arcs and 27,056 points, all 241
  countries there are, 199 capitals biggest first, 254 rivers, 411 lakes and the
  500 largest cities that are not capitals; that the coarse copies of the world
  really are coarser and that **every arc still starts and ends where it did**,
  which is the whole reason a coarse world is still in register with itself;
  that Luxembourg is not a hexagon any more and Russia did not get more
  expensive for it; that a projection and its inverse are each other, that
  Mercator is cut where everyone cuts it, that the world is built once and kept
  and that no line runs across it where the map is seamed. Then the countries as
  shapes: that Paris is in France and the mid-Atlantic is in nothing, that an
  enclave beats the country round it, that a country on both sides of the 180th
  is still one country, that a country smaller than a finger is hit by landing
  *near* it and that the reach can never steal a click from a country you are
  inside; that all 206 names are placed and sized and **not one of the 206
  crosses its own outline** — checked the hard way, against every edge of every
  ring — that a name is broken over lines when that makes it bigger, and that
  what a country *means* is its main body rather than its every island, so
  France is France and not the mid-Atlantic. Then the height field: that it
  unpacks to 1080 × 540, that two thirds of it is sea, that the Himalaya are the
  highest thing on it, and that it is drawn once per projection and kept. Then a
  map: that a new one is Mercator, that every city is a node from the start and
  none is named at arm's length, that going in fills the map and **not one city
  name is written over a capital's**, that picking a country writes down its
  name rather than its number and rebuilds one layer and no geometry, that a
  country too small to write on is named beside itself instead, that ⌕ lights
  one up and aims the springs at its own box, that dragging one out of the map
  puts it on the page while the map stays where it was and carrying it back does
  nothing at all; and the country card — its viewBox, its name, its capital, its
  three switches, and that it prints with no buttons; that a pan inside the
  window the world was built for **rebuilds no geometry at all** while a jump
  that crosses a detail step rebuilds deliberately and draws a fraction of what
  it drew; and that the height of the land is nine filled contours with no
  picture and no clip anywhere, a window really is a fraction of the world, and
  the coarsest step draws less than the finest;
- **Export for real** — a known handful of items is put on the sheet, the blob
  is intercepted, and it is checked for every feature's styles and for the
  absence of any flipbook chrome.

## The desktop shell — `desktop.sh`

Five phases, each its own process and its own throwaway `userData`, so a run
never touches the notes in `~/.config/Open Note`. It requires the real
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
   The hold is 45 s; the probe takes ~30 s of page time. If it ever outgrows
   the hold, the symptom is "NO REPORT — the probe never ran", not a failure.
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
