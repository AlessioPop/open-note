# Open Note — Manual

Everything you can put on the sheet. For running the app see the [README](../README.md); for working on the code see [How it's built](architecture.md).

## Your notes

The app opens on the note you had open last. **☰ Notes** in the top bar (or the wordmark) takes you to the **shelf**, where every note is shown as a small picture of its own sheet in its own colours; `Esc` goes back to the note.

- Click a note to open it; hover to lift it off the shelf.
- The dashed **∞** card starts a new one.
- Click a note's name to rename it; the **✕** in its corner deletes the whole note after a confirmation.

## The sheet

A note is **one endless sheet of paper**. There are no pages, no cover and nothing to flip — just paper that keeps going, and everything in the app works on it.

- It opens showing all of itself. Drag the bare paper to move around, scroll to pan, `Ctrl`+scroll or `+` / `−` to zoom, and click the percentage to fit the whole sheet on screen again.
- When you run out of room, **click the hatched rail along that edge** — the sheet grows by a page's worth on that side and everything already on it stays exactly where it was. **Or drag the rail** to pull out however much you want, watching the size as you go. It starts three pages wide by two deep and grows to about twenty-four; one `Ctrl`+`Z` puts the paper *and* everything on it back.
- **▦ Map** in the toolbar puts the whole sheet in the corner: everything on it, and a bright rectangle showing where you are. Drag inside it to go somewhere — quicker than panning once the sheet is bigger than a screenful.
- The toolbar says how big the sheet is; so does the shelf, under the name.
- The paper itself — grid / ruled / dots / isometric / blank — is the button in the toolbar, or **⚙ Menu**.

Things scale to the paper they are on: a sticky note is the size it would be on a normal page, not three times the size, and so is a pen stroke.

**On smoothness:** nothing in the app limits the frame rate — it draws when the screen does. Zooming used to be the exception: zoom here is a real layout change (that is what keeps text and ink sharp instead of blowing up a bitmap), and on a big sheet one wheel notch cost ~78 ms, worse the further in you were. Now a turning wheel only scales the sheet on the compositor — 17 ms a notch, vsync — and the sharp version is committed 180 ms after you stop, so it goes very slightly soft mid-gesture and lands crisp. A note also starts without the **paper grain** (⚙ Menu), the one thing on a sheet whose cost grows with the sheet. Turn it on if you want the texture and don't mind the paint.

## What you can put on the sheet

| Tool | What it does |
|---|---|
| Heading / Text / Handwriting | Poster type, serif body text, marker-pen handwriting — `$$…$$` compiles to a typeset equation |
| Marker | Highlighted handwriting — cycle highlight colour with ◑ |
| Checklist | Obsidian-style `- [ ]` tasks — click boxes to tick, double-click to edit; Enter adds a new task |
| Code | A terminal-style code cell, syntax-coloured the way VS Code does it — display only, nothing runs. Python by default, or JavaScript, TypeScript, C, C++, C#, Rust, Go, Java, GDScript, Shell and SQL from the picker in its title bar, which also holds the copy button. ◑ cycles six colour schemes — Dark, Light, Monokai, Dracula, Solarized, and a Theme scheme whose terminal is mixed from the note's own ink and paper, going deeper than the paper when the paper itself is dark. Double-click to type: it recolours under the caret as you go, Tab indents, Enter keeps the line's indent, brackets and quotes close themselves the way the editor's do (type the close and it steps over, backspace an empty pair and both go, Enter between braces opens the block out), and pasting strips any formatting. ⏎ wraps long lines or lets them run; a cell past ~16 lines shows a band of itself with its own scrollbar, and ⊞ shows the whole thing. Drop one on another icon and it files into a folder, wearing a little terminal with its language on the tag — click it in there and it opens highlighted, with copy in the title bar |
| Table | A spreadsheet on the page — cells, four styles, `=SUM(A2:B4)` formulas, sorting, a live readout of what you have picked, and drag it onto a coordinate system to plot it; see **Tables** below |
| Spreadsheet | The same table, read straight out of an `.xlsx`, `.ods` or `.csv` — or just drop the file on the page. A long one shows a band of itself and folds down to an icon; see **Tables** below |
| Sticky | Sticky notes in 5 colours, with a folded corner |
| Flip cards | A deck of index cards — question on the front, answer on the back, laid out how you like and marked ✓ or ✗ as you go |
| Coordinate system | Axes you can drag around, with functions, vectors and a table's points drawn in them — see **Maths** below |
| Node | A small card you wire between a table and a plot: keep some columns, do arithmetic on whole columns, put every number through a formula, or hand in a number on a slider or a colour — see **Nodes** below |
| Logic circuits | Input controls (switch, push button, clock and constants), output controls (lamp and four-bit digit), ten combinational gates including Tri-State and Custom, and SR/D/JK/T flip-flops. Wire port to port and the signals move immediately — see **Logic gates** below |
| Matrix / Vector | Cards you fill in and throw at each other — any size, ✎ reshapes them; multiply, invert, take powers, eigen-decompose, fold a product down to its answer, drop them into a plot |
| Pie chart / Donut / Bar chart / Stacked bar | Charts of named shares, typed straight into their own legend — a pie in four looks (flat, donut, 3D, hand-sketched), up to ten slices in six colour palettes, labels you can flip between four placements or simply drag where you want them; see **Charts** below |
| Cube / Sphere / Torus / Square / Circle | Wireframe shapes to draw over — turn them, size them, set their measurements (a torus's radii, a sweep down to a part shape), fade them back under your pen; the square and circle lie flat and reshape by their corners; see **Shapes to draw over** below |
| Molecule | A molecule drawn the way a chemist draws one — skeletal, condensed or Lewis — with its formula, mass and name under it, a periodic table a click away, a name-or-SMILES box, and a 3D view you can turn and measure; see **Chemistry** below |
| Periodic table | The table on the page as a reference card — tap an element for its number, mass, electronegativity and configuration |
| Chart of nuclides | The whole nuclear chart — 3558 nuclides and 2088 metastable states on the neutron–proton plane, coloured by how they come apart; zoom in, press one for its half-life, branches and Q values, and follow its decay chain to whatever it ends on |
| FITS file | An astronomy `.fits` — or just drop one on the page. Click it and the reader opens on `hdu.info()`; pick an HDU for its header, search the keywords, and see the shape and type of every data unit without a single number of it being loaded. Pick columns of a binary table and **drag them out onto the sheet**, where they land as a table you can plot; see **FITS files** below |
| Picture | Taped-in photos with captions. Also: drag-and-drop or just **paste** a screenshot (Ctrl+V) |
| Video | YouTube / Vimeo links, or a video file from disk (stored inside the note) |
| 3D model | A `.obj` out of Blender — mesh, materials and textures — in a little window you can turn it in |
| Slide deck | A `.pptx`, drawn rather than described — walk it on the page, or click it for the reader: all the slides at once, one at a time, zoomable, with the notes and any slide liftable out as a picture |
| Attachment | A PDF (or any file) kept inside the note as a clickable shortcut — see below |
| Folder | A tray for files, pictures, video and models — or drag two things together to make one |
| Tape | Decorative washi strips, 6 patterns |
| Sticker | Arrow, star, warning, check, bug, heart — recolourable |

Every item: drag to move — **it leans into the push and keeps your momentum when you let go**, sliding a little way like paper on a desk (grab it mid-slide and it's simply yours again) — corner dot to resize, **drag the red handle above an item to rotate it** (hold Shift for 15° snapping), ⤒ / ⤓ to send it to the front or the back, ✕ or `Delete` to remove.

For several things, press **□ Select** in the main toolbar and drag a rectangle around them, like selecting desktop icons. The mode finishes on release; drag any selected member to move the whole arrangement, use **✕ Delete** in the same toolbar (or the keyboard's `Delete`) to remove it, and press `Esc` to clear the selection. The gesture is the same with a mouse, pen or finger.

## Tables

A table works the way a spreadsheet does. Click it once to pick it up like anything else on the page; click again and the cells have the mouse.

- **Cells.** Click one to put the cursor on it, drag across to take a range, or `Shift`-click the far corner. Arrow keys walk it, `Shift`+arrows extend the range, `Tab` and `Enter` step across and down. **Just start typing** and what you type goes into the cell — `Enter` or `Tab` keeps it, `Esc` throws it away, `F2` or a double-click opens a cell to edit what is already there. `Delete` clears the cells you have picked rather than the table.
- **Rows and columns.** When the table is selected it grows a strip of column letters along the top and row numbers down the side. Hover one and it offers **✕** to remove that row or column and **+** to insert another next to it; click it to select the whole row or column. The two faint **+** rails down the right edge and along the bottom add one on the end, and `Tab` off the last cell adds a row the way a spreadsheet does. Drag the line between two column letters to set the column widths — they share the table's width between them, so the table itself stays as wide as you made it. The corner box is what you drag the whole table around by.
- **Formulas.** A cell that starts with `=` is worked out: `=A2+B2`, `=SUM(A2:B4)`, `=ROUND(AVG(B2:B4),1)`. There is `SUM` `AVG` `MIN` `MAX` `COUNT` `MEDIAN` `STDEV` `STDEVP` `VAR` `VARP` `ABS` `SQRT` `ROUND`, the usual `+ − × ÷ ^` and brackets, single cells like `B3` and blocks like `A2:C9`. `STDEV` and `VAR` divide by *n−1* — a sample of a thing rather than the whole of it, the way a spreadsheet means the name; `STDEVP` and `VARP` are there for when it really is the whole. Rows and columns are numbered the way they are labelled, so `A1` is the top-left cell whether or not the first row is a header. Editing a cell shows the formula; leaving it shows the answer, and so do print, the overview and an export. Insert or remove a row and every formula follows the cells it was pointing at; delete a row something depended on and it says `#REF` rather than quietly meaning something else. A formula that ends up depending on itself says `#CYCLE`.
- **What the cells you have picked come to.** Take a range and the strip under the table says `n 24 · Σ 318.4 · x̄ 13.3 · s 2.37 · 8.97…15.98` — how many numbers, their total, their mean, the sample standard deviation and the two ends of the range. Pick a single cell and it just says where you are (`C14`). It is the line every spreadsheet keeps along the bottom of its window, because it is the quickest question anyone asks of a column of readings. The readout belongs to whoever is working in the table, so like the row numbers it only appears while the table is selected.
- **Sorting.** **⇅** sorts every row by the column the cursor is in — smallest first, press it again for largest first. Whole rows move, marks and all, so a row stays the reading it was; numbers come before words and blank cells stay at the bottom either way. A table with formulas in it **refuses to sort** and says why: a reference here is an address, so a `=B4` carried three rows down would still be asking about row 4, which after a sort is somebody else's reading. Take the formulas out (or paste their answers back in) and sort then.
- **How it looks.** ▦ cycles four styles — ruled lines, a full grid, zebra stripes, or nothing at all. **Hdr** makes (or unmakes) the first row a header, ≡ aligns the column left / centre / right, and **B**, *I* and ◑ set the cells you have picked in bold, italic or a highlight. A–/A+ size the type. Everything takes its colours from the note's theme.
- **Paste a block.** Copy cells out of a real spreadsheet and paste them in — tabs and newlines are laid out across the cells, growing the table if it needs the room. `Ctrl+C` copies the range you have picked back out the same way.

### Reading a spreadsheet in

**Drop an `.xlsx`, `.ods`, `.csv` or `.tsv` onto the page** and it arrives as a table, sized and aligned to what is in it. **Spreadsheet** in the add menu does the same through a file dialog, and **Load** on a table already on the page pours a file into that one. A workbook with several sheets asks which one you want.

Nothing is downloaded and no library is vendored in to do it: an `.xlsx` and an `.ods` are both a zip of XML, and the browser already has an unzipper and an XML parser. `js/lib/workbook.js` is the whole of it.

- **Dates come out written down.** A date in a workbook is a *number* — `45352` — and only the format attached to the cell says it is the 1st of March. Those cells are read as `2024-03-01` (or `2024-03-01 15:30:00`, or `15:30:00`), which sorts and reads the same everywhere.
- **Everything else comes out as the number it is.** A cell shown as `15%` holds `0.15` and arrives as `0.15`; one shown to two decimals arrives with all of them. The file's numbers are the data, and rounding them on the way in would be inventing readings that were never taken. Float noise from the spreadsheet (`1.2999999999999998`) is trimmed to the fifteen digits a workbook actually keeps, and a long whole number is left exactly as written — that is an id, not a measurement.
- **A formula in the workbook comes in as its answer.** The value the spreadsheet last worked out is what lands in the cell, since Excel's function library is not this one's.
- **What it can't do it says.** An old binary `.xls` asks to be saved as `.xlsx` or `.csv`. A hidden sheet is skipped — it is usually a workbook's own scaffolding.
- **`.csv` works out its own separator** — comma, semicolon, tab or pipe — and handles quoted fields, including the ones with a comma or a newline inside them. A semicolon file whose numbers are written `1,5` is read as European and comes out `1.5`.
- **An extract says so.** A table holds up to 50,000 rows and 256 columns. Read a bigger sheet than that and the strip under the table carries `first 50,000 of 812,000 rows` for as long as the table exists — on the page, in print, and in an export.

### A big table in a small space

Fifty thousand rows is a fine thing to keep and an impossible thing to draw, so **a table longer than about twenty-five rows shows a band of itself** and the strip underneath says which rows you are looking at: `rows 431–445 of 4,812 · 6 columns`. The header row is pinned above the band, so what you are reading always has its names on it.

- **The wheel scrolls it**, whether or not the table is the thing you are working in — reading a long one should not mean picking it up first. `Ctrl`+wheel is left alone, since everywhere else in the app that is the desk's own zoom. There is a **scrollbar** down the right-hand side to drag, and `PageUp` / `PageDown` / `Ctrl+Home` / `Ctrl+End` walk it. Arrow keys that take the cell cursor off the band bring the band along with them.
- It scrolls by **whole rows**, the way a spreadsheet does, rather than by pixels — a row is as tall as the words wrapped inside it, and a pixel scroll over rows of different heights judders.
- **Click the row count** to change how much shows at once: 10, 15, 25, 40, or the whole thing.
- Only the rows on screen are ever worked out. A formula reaching out of the band still pulls in whatever it needs, one cell at a time.

**⊟ folds the whole table down to an icon** — the same document icon an attachment wears, with the file's name under it and its type on the tag. That is where a 40,000-row table belongs on a page of notes: out of the way, and one click from being read. `Ctrl`+hover peeks at the top corner of the sheet.

**Click the icon and the whole sheet opens in a window** over the sheet — the letters and numbers always out, a cell to a line, click a column letter to sort by it, ⤓ to save it as a `.csv`, and ⊞ to put it back on the page at the size it was. The window keeps its own place in the table, so scrolling in there does not move what is on the paper. Everything else is unchanged: a folded table still travels in a backup, still plots into a coordinate system, and still shows as its icon in print and in an export.

### Plotting a table

**Drag the table onto a coordinate system and drop it.** Two of its columns become the points in it. (Grab the table by its corner box or by anywhere on it while it isn't selected — while it *is* selected the mouse belongs to the cells. The ⇗ button on its toolbar does the same thing without the drag: with one plot on the page it goes straight in, otherwise click the one you meant.)

The options open on the plot the moment it lands:

- **x** and **y** — which column feeds which axis, by the name in its header. `row #` is always offered for x, for a single column of readings.
- **±x** and **±y** — a column holding the error on each, drawn as a whisker with a cap at both ends. Leave them on `—` for none.
- **scatter / line / both** — points on their own, a line through them in order, or both. The line takes the solid / dashed / dotted button beside it, and the dot sets the colour.
- **⤢** fits the window around the points again — worth pressing after the numbers change a lot.

**The headers name the axes.** Whatever the two columns are called is written **centred under the x axis and centred up the side of the y axis**, the way `plt.xlabel()` and `plt.ylabel()` set them, and the series is named after its y column in the key under the picture. Change the heading in the table and the axis follows. Plot a second table against the same axis and both headings are named on it. Want the axis to read *Time (s)* rather than *t*? Write that in the table's header cell — the axis is whatever the column is called.

**They stay connected.** Edit a cell, add a row, paste a new block — every plot drawing that table redraws as you type. The plot keeps its own copy of the numbers, so print, an export and a backup all show the points, and deleting the table leaves the chart standing.

Rows that aren't points are skipped: the header row, and any row whose x or y is a word rather than a number. A `=SUM` or `=AVG` summary row *is* a point if both its cells are numbers — put a word in its first cell, or choose that column for x, and it drops out.

**A plot with data in it becomes a chart.** Its two axes stop sharing a scale — seconds against metres have none — so the picture keeps a shape of its own and each axis is stepped and numbered on its own.

A chart is also **drawn inside a margin**, and everything written on it goes out there: the numbers under the frame and beside it, the ticks pointing outward, the axis names centred outside those. Nothing is ever written over the readings, and nothing has to dodge anything — which is what the old arrangement spent its effort on, with the numbers turned inwards and the corner one left out because there was nowhere else for them to go. The plotting area keeps its 1000 units and the picture grows around it, so the readings sit in the middle of it where they belong. A chart draws its zero lines but no arrowheads: those say *this carries on off the edge of the paper*, which is true of a plane and not of a measured box.

**A coordinate system with no data in it is unchanged**: no margin, axes through the origin with their arrows, numbers written along them, a square of it still square. That is what the vectors and the basis need, and it is the look this is for.

**A spreadsheet's worth of points** is drawn as one shape rather than one element per point, so a chart of tens of thousands of readings still opens. Below about a thousand points each one is a mark of its own that you can put the pointer on.

## Nodes

Dragging a table onto a coordinate system stays the quick way to plot it, and nothing below replaces it. Nodes are the other way: small cards you put on the paper and wire together, for when the numbers need something done to them first.

A sheet with forty columns, of which you want two. Readings in millivolts that ought to be volts. A constant you want to *try* rather than commit to. That is what these are for.

**Add one** from `+ Add…` (or right-click the page) → **Node**. Every node is the same card with a different job, and the drop-down at its top says which:

| Node | In | Out | What it does |
|---|---|---|---|
| **Columns** | a table | a table | Ticks — one per column coming in. Only the ticked ones go on. |
| **Arithmetic** | a table, and `b` | a table | `+ − × ÷ ^` down every column, by a number you type or by whatever is wired into `b`. Two tables side by side pair off column by column; a single column is spread over all of them. |
| **Formula** | a table | a table | An expression run over every number: `sin(x)`, `log(x)`, `x^2`, `1/x`. `x` is each number in turn — the same compiler the plot's `ƒ(x)` uses, so a typo comes back as a sentence. |
| **Number** | — | a number | A number on a slider, with the ends of the slider your own. Drag it and everything downstream moves with it. |
| **Colour** | — | a colour | A colour wheel — drag round it for the hue, out from the middle for how strong, and the slider under it for how light. Or type `#rrggbb`. Wire it into a plot to paint what it is drawing. |

### Wiring them up

Every card has **sockets**: one on the left for each thing it reads, one on the right for what it gives out. Both ways of connecting work, and they do the same thing:

- **Drag from a socket.** Pull out of the socket on the right onto another card — onto one of its sockets, or just onto the card and it finds a free one — or onto a coordinate system, which turns it into points. Pull out of a socket on the left onto whatever should feed it: a table, or another node.
- **Or carry the card.** Drag a table onto a node and it plugs into the first free socket, the same gesture as dropping a table on a plot. The card hops back to where it came from.

Pulling on a socket that is already full **picks that wire up** rather than starting a second one, so moving a lead is one drag. **Click a wire to unplug it.** A node's ⌦ button unplugs everything at once, and ⧉ makes another one beside it.

A wire is refused if it would run in a circle, and it says so rather than drawing something that cannot be worked out.

### What comes out

The line at the foot of each card says what it is giving out — *2 columns · 14 rows* — or, in red, what is wrong: nothing wired in, a column count that doesn't pair up, a formula with a bracket missing. Nothing ever throws; a node that cannot work something out says so and whatever reads it says the same.

**Gaps stay gaps.** An empty cell, a word, a division by zero, a `log` of something that comes out infinite — all of them leave a hole in the column rather than a nought or a spike, and a row with a hole in it is not a point on the plot.

**Columns keep their names, and the names say what happened.** Multiply `h (m)` by 9.81 and the column is called `h (m) × 9.81`; run `x^2` over `t` and it is called `t^2`. That name is what the plot writes on its axis, so a chart labels itself all the way down the chain. Columns are also **kept by name** in a Columns node, so re-importing the sheet with a column inserted at the front does not silently plot the wrong one.

### Down to the plot

Drop a node on a coordinate system — or pull its output socket onto one — and it becomes a series, with the same **x** / **y** / **±x** / **±y** options as a table's. A **Colour** node dropped on a plot paints whichever series is being worked on; picking a colour by hand on the chip takes the wire off again.

**Edit a cell at the top of the chain and the far end moves**, through however many nodes are in between, exactly as a plotted table already did. So does dragging a Number node's slider. Only the plots that actually read through what changed are redrawn.

Nodes save, print, export and back up like anything else on the page, wires and all. A card that cannot work anything out at that moment — in a print, in an export — shows the last thing it was worth, the same way a plotted series carries its points.

Not yet: nodes cannot be filed into a folder. A graph shut inside one would go dark, because a node can only read what is out on the page.

## Logic gates

Digital Lego. Conventional gate symbols on the paper, wired port to port, with
signals arriving the moment you flick a switch, hold a button or a clock ticks.
There is no global run button: the sheet works itself out as its inputs change.

**Add them** from `+ Add…` (or right-click the paper, or Space) → the **Logic**
shelf.

| | What it is |
|---|---|
| **Input controls** | **Switch** sends 0 or 1; its ▣ button cycles lever, rocker and plain 0/1 appearances without changing its behavior. **Push button** sends 1 only while held. **Clock** repeats 0–1; pause/run it and cycle 0.5, 1, 2 or 4 Hz from its toolbar. **Constant 0/1** never change. |
| **Output controls** | **Lamp** reads one bit. **4-bit digit** takes `8`, `4`, `2`, `1` and draws the hexadecimal digit 0–F on a seven-segment face. Neither has an output. |
| **Logic gates** | **AND · OR · NAND · NOR · XOR · XNOR** have inputs `a`, `b`; **NOT · Buffer** have `a`. **Tri-State** has `a`, `en` and outputs high impedance while disabled. **Custom** is the gate whose truth table you fill in. |
| **Flip-flops** | **SR · D · JK · T** sample on the rising edge of `clk` and expose both `q` and `nq` (Q̅). Their stored Q can also be set from the toolbar. |

The symbols are the ANSI ones: inputs on the left, output on the right, the
D-shaped body for AND, the curved one for OR, the extra rear curve for XOR, a
triangle for the buffer, and the same inversion bubble on the nose of NOT, NAND,
NOR and XNOR. They are drawn as vectors in the note's own ink, so they stay
sharp at any zoom, print properly, and take whatever theme and paper you are
working on.

### Wiring them up

Every gate has **ports** — a dot on the edge for each input and for its output.
The dot you can see is small; the target you can hit is three times the size of
it.

- **Drag from a port onto another port.** Out of an output onto an input, or out
  of a bare input onto an output — the same gesture either way round. Every port
  the lead could legally land on lights up while you are dragging, and the one
  under the pointer lights brighter and snaps the lead onto it.
- **Pulling on an input that already has a lead picks that lead up** rather than
  starting a second one, so moving a lead is one drag.
- **Let go over bare paper** and the lead comes out. **Escape** cancels a lead
  you have not landed yet.

**An input takes one lead.** Drop a second one on it and the new one takes the
socket — the old one goes, and the strip along the bottom says so. **An output
may feed as many inputs as you like**; where a lead branches there is a blob, so
you can tell a junction from two leads that merely cross over one another.

**Click a lead to pick it out** — it thickens and a small chip appears on it with
the value it is carrying. `Delete` removes it, and so does the ✕ on the chip.
Escape puts it back. A gate's **⌦** button unplugs every lead on it at once, and
**⧉** makes another gate just like it beside it.

Marquee-select a connected set of logic items and the main toolbar offers
**⇥ Tidy logic**. It resets their rotations, orders them from sources through
gates to outputs, keeps peers in their existing vertical order, and replaces
the selected internal leads with rounded orthogonal routes. The circuit's
connections and values do not change, and the group stays selected afterwards.

**Turn a gate to any angle** with the rotate handle and the leads stay on its
ports — and leave along the way the gate is now facing. Move it, resize it, put
it on another layer: the leads follow.

### What the wires are carrying

Five things, and each one is told from the others by more than its colour, so
none of it depends on you seeing colour or on the page being in colour:

| | The lead | The gate |
|---|---|---|
| **1** | bright and thick | a lamp fills in and grows rays |
| **0** | muted and thin | a lamp is empty and says `0` |
| **not driven** | dashed | a lamp says `?` |
| **high impedance** | long–short dashed | a disabled Tri-State output is disconnected |
| **in a loop** | dotted | the symbol goes dashed and says `!` |

**An input nothing is wired into is not a nought.** A gate with a lead in only
one of its two inputs does not answer as though the other were low — it says it
does not know, and everything downstream of it says the same. That is the
difference between a circuit you have not finished and a circuit that is wrong.

**A circuit wired in a ring says so.** Every gate in the loop, and everything fed
by one, is marked; nothing hangs, nothing recurses and nothing takes any longer
than a circuit that is fine. Cut one lead and the whole thing settles again.

### Flip-flops and clocks

All four flip-flops change only on a **0 → 1 clock edge**. D copies `d`; T holds
for `t=0` and toggles for `t=1`; JK holds, resets, sets and toggles for `jk =
00, 01, 10, 11`; SR holds for `sr=00`, sets for `10`, resets for `01`, and shows
an unknown state for the forbidden `11`. Inputs are sampled together and Q̅ is
always the inverse of Q. A flip-flop breaks a feedback path, so an ordinary
sequential circuit is not mistaken for a combinational loop.

Clock phase is live rather than an undo step: leaving a clock running does not
fill the undo history. Flip-flop state reached on its edges is still saved, so
the circuit opens in the state it reached. Pause a clock before using a backup
as a particular timing snapshot.

### The truth table

Every table-driven gate's **⊞** button opens the table that *is* its behaviour: a column per
input, a column for the output, and a row per combination. **The row the gate is
actually standing on is lit** — flick a switch and the lit row walks. If an input
is not driven, no row claims to be the one it is on, and the line underneath says
which input is missing.

**Put it on the sheet** writes the same table out as an ordinary Open Note table,
which then sorts, exports, feeds a node graph and drops onto a coordinate system
like any other.

For the eight standard gates the table is read-only. An AND that did not mean AND
would be a trap, and that is what the custom gate is for.

### Gates of your own

**Custom** is a gate whose truth table you write. Its **⊞✎** button opens the
same panel, with three things you can change:

- **Name** — what is written on its face, up to 20 characters.
- **Inputs** — one to eight. The answers already written are kept, and a port
  that goes takes its lead with it.
- **The answers** — click any cell in the output column to turn it over.

Eight inputs is the ceiling on purpose: a truth table is 2ⁿ rows, and 256 of them
is already a long scroll. Ports are lettered `a`…`h` and the output is `q`, and
the gate letters them on its own face so you can see which is which.

### Where it ends

Gates and their leads save, print, export and back up like everything else on the
sheet, and undo/redo covers placing a gate, making and breaking a lead, changing
a control, and tidying a circuit. A gate is stored as what it *means* —
`{gate:"nand"}` and a
list of leads between named ports — never as a picture of itself, so a note made
today still draws with tomorrow's symbols.

**Not yet:** shared multi-driver buses, propagation delays, renamable ports on a
custom gate, or folding a group of gates into one reusable gate of its own.

## Equations

Write LaTeX between `$$…$$` in any text box, sticky note, checklist task or picture caption. **When you leave the box it compiles** into a properly set equation; double-click back in and your LaTeX source is there again to edit. The **∑** button in a text item's toolbar wraps whatever you've selected in `$$…$$` (or drops an empty pair at the caret) if you'd rather not type the dollars.

- `$$…$$` (or `\[…\]`) puts the equation on its own centred line; `\(…\)` keeps it running inside the sentence. A bare `$…$` is inline maths too, but only when it holds a TeX signal — a `\`, `^`, `_`, `{` or `}` — so "costs $5 to $10" stays a price while `$v^2$` becomes maths.
- Understood: fractions and `\binom`, roots, sub- and superscripts, primes, Greek and the usual symbols, `\sum \prod \int \lim` (limits go above and below in display maths, beside it inline), `\left(…\right)` brackets that grow with what they hold, `\begin{pmatrix}` / `bmatrix` / `vmatrix` / `cases` / `aligned` / `array`, `\text{…}`, `\mathrm \mathbf \mathbb \mathcal \mathfrak \mathsf \mathtt`, accents (`\hat \bar \vec \tilde \dot \overline`), spacing (`\, \; \quad`), and `\\` to stack several lines.
- A formula that doesn't compile stays on the page in red with the reason in its tooltip — hover it to see *"\\wat is not one I know"* and fix it. Nothing is ever swallowed.
- Equations are **stored as LaTeX**, so they travel in backups and stay editable forever. They are **drawn as MathML**, so print and exports show them with no library, no script and nothing to download — your system's maths font does the typesetting.

This is maths *set on the page*. For maths you can pull about — axes, plotted functions, vectors and matrices — see **Maths** below.

## Maths

**∑ Math** in the bottom bar (or `M`) puts a maths toolbar under the sheet and hands the mouse to the coordinate systems on the page — until you turn it off, dragging inside one moves the *plane* rather than the item. The same bar carries the wireframe shapes to draw over (**Shapes to draw over**, below), and in maths mode dragging one of those turns it. `Esc` steps back out.

### The coordinate system

**＋ Axes** (or *Coordinate system* in the add menu) drops one on the page. It is an item like any other — put it on a layer, size it by its corner, tape things beside it — and it holds everything drawn in it.

- **Drag the axes where you want them.** Pull the x-axis to move the window up and down, the y-axis to move it left and right, or drag anywhere on the paper to move both at once; the point under the mouse stays under the mouse. **The middle mouse button walks the plane about wherever you press**, whatever tool is in your hand. The four boxes in the toolbar set the limits exactly — they take sums, so `pi/2` and `-3/4` are fine.
- **The wheel zooms the plane about the pointer**, whether or not the maths bar is out — you don't have to turn anything on to zoom a chart. A notch is about 12%, and a trackpad creeps rather than leaping. Two things still get past it: `Ctrl`+wheel is the desk's own zoom everywhere in the app, and a plot you have picked up to move (double-click) is an item again, so the wheel scrolls the desk under it — which is how you scroll past a big chart on a canvas.
- **Double-click a plot to pick it up.** It goes red, says *move*, and is a thing on a page again: drag it where you want it, size it by its corner, rotate it. Double-click it once more and you are back inside the grid. (Out of math mode a plot is always just an item, so nothing is ever stuck.) **Fill page** sizes it to the paper and squares the window up to match.
- The window's shape decides the plot's: ask for x from −5 to 5 and y from −4 to 4 and you get a box where **one unit across is one unit up**, so a right angle looks like one and a rotation looks like a rotation. (Drop a table in it and that stops being true, because seconds and metres share no scale — see **Plotting a table** above.)
- **Drop a table on it** and two of its columns become the points in it, with error bars if you have them, and they stay tied to the table as you edit it — **Plotting a table**, above, has the whole of it.
- **▦ grid** cycles **solid → dashed → dotted → blank**, and **axes** goes from numbered, to bare, to no axes at all — a blank system is just a frame to draw a vector in.

### Functions

**ƒ(x)** adds a curve and opens a little box to write it in: `x^2`, `sin(2x)/x`, `1/x`, `sqrt(x)+1`, `exp(-x^2)`, `|x|`, `3(x+1)(x-1)`.

- Multiplication can be left out (`2x`, `3sin(x)`), `^` binds right to left, and `pi`, `tau`, `e` and `phi` are there along with the usual `sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs exp ln log log2 log10 floor ceil round sign min max hypot atan2 mod`.
- Nothing is ever `eval`'d — the formula is compiled by hand, so a typo comes back as a sentence under the box (*"wat is not a function I know"*) instead of a blank plot.
- The curve is drawn where it goes and **broken where it runs off**, so `1/x` and `tan(x)` come out in pieces instead of joined by a vertical line.

### Vectors

Hit **⇗ Vector** and **drag one out of the paper**. Start on the origin and it is rooted there; start anywhere else and you get a free vector with its tail where you began. It snaps to the grid as you go — hold `Shift` to place it by hand — and lands on a round number like `(2, 1)`. **The tool then puts itself away**, so the next drag moves the plane instead of littering it with arrows; press ⇗ again for another one. Every vector wears its arrowhead however stubby it is.

- **A small box appears on the head** with the vector's name and its two numbers in it. Type over them (they take sums too), press the dot to recolour, the line to go **solid / dashed / dotted**, **⊹** to show it as so many î plus so many ĵ, and **✕** to take it off.
- Afterwards, **drag the head to change it, the tail to move where it starts, or the shaft to slide the whole thing**. Click a curve, a vector, or its name in the key under the plot to bring its box back; `Esc` puts it away, `Delete` removes it.

### Cards: vectors, matrices, and what they make together

**▦ Matrix** puts a 2×2 template on the page — brackets, boxes, and a name you can change. **[v] Vector** puts a column vector beside it, with a colour dot on its name. Type into either: `-1`, `1/2`, `sqrt(2)/2` all go in, and a box it can't read goes red and keeps the old value rather than breaking the card. The cards are **quiet**: no paper, no shadow, just numbers sitting on the page — the card frame appears when you click one (and while you drag it, and under one about to be landed on).

**They come in any size.** The **✎** on the toolbar opens the same glass panel the shapes measure themselves in, with **Rows** and **Columns** steppers (a vector gets one for its depth) — up to 8 each way. Growing keeps every number you typed and lays 1s down the new diagonal, so an identity grows into a bigger identity; **↺** steps back to 2×2. The panel also holds **Power**: step *n* and press *M³ on the page* to get the matrix multiplied into itself as a new card.

**Cards are things you throw at other things.**

- **Drop a vector card into a coordinate system** and the vector is drawn there, in its own colour, with its own name. The card hops back where it came from — it is a stamp, not a thing you lose. (Only a 2-vector fits a plane; a deeper one says so.)
- **Drop a 2×2 onto a vector in a plot** and it transforms it. **Drop it anywhere else on the plot** and it becomes the basis.
- **Drop a matrix onto a vector card — or onto another matrix — and they merge into the working**: `M · v = […] · […] = […]`, written out with the answer in its own brackets. The sum is **done in front of you**: the row it comes from and the column it meets light up, and the answer drops into place a box at a time. Sizes are respected — a 2×3 dropped on a 3×2 multiplies (whichever order fits), and two that fit no way round refuse with a sentence saying which sizes met. **↻** does it again, **⇥** puts the answer on the page as a card of its own, and **⊕** draws it in a plot. The operands stay editable, so retyping one redoes the sum.
- **⊟ folds the working away** — just `AB = […]` — and **⊞** opens it back up. Folded or not, **the product is itself a card**: drop it onto the next matrix (or press its **×**) and the chain keeps going, `AB · C`, with the labels following the answer.
- **✂ takes a product apart** — the two cards come back, side by side, exactly as they were written into it.
- The same is on the toolbars if you would rather not drag: **⊙ Apply**, **⊞ Basis**, **× Multiply**, **⊕ Draw it**.

Select a matrix and its toolbar does the rest of the algebra:

- **det** writes the determinant under the card **between tall bars**, `|…| = 5`, the way it is written by hand. **λ** lists the eigenvalues **each with its eigenvector** in brackets beside it — `λ₁ = 3  v₁ = […]` — a conjugate pair folded into one `a ± bi` line, a repeated λ drawing as many independent vectors as the null space really has. Any size of square matrix works (Hessenberg + shifted QR under the hood; eigenvectors read out of `A − λI`).
- **M⁻¹** and **Mᵀ** put the inverse and the transpose on the page **as new matrices** — a singular one says *det = 0 — no inverse* instead, and a 2×3's transpose is a 3×2. **The label walks with the numbers**: inverting `M⁻¹` gives plain `M` back, never `M⁻¹⁻¹`; transposing `Mᵀ` gives `M`; squaring `M³` says `M⁶`; the inverse of `M²` is `M⁻²`.
- Questions that only make sense square — det, λ, inverse, powers — are refused politely on a strip, in a sentence under the card. **I** starts over at the identity. **A− / A+** size a card the way they size text.

### Transformations, shown happening

Applying a matrix **walks it in from the identity**, so you watch the vector turn and stretch into its new place rather than find it somewhere else, and a faint ghost stays where it started.

**⊞ Basis** hands a matrix to a coordinate system as its basis: the grid shears and turns with it, the old square paper stays behind it faintly, and everything drawn in the plot moves because its coordinates now mean something else. **⟲ Basis** puts the standard one back.

**î ĵ** draws the basis vectors at the origin and shades the unit square they span — the area you see *is* the determinant. **Drag their tips** and the paper bends under everything on it, with the toolbar reading the basis out as you go.

A coordinate system is nothing but numbers and SVG, so it costs no library, travels in **backups**, and comes out in print and in an **export** exactly as you left it — the picture, the key underneath, the caption, and every card of working beside it.

## Charts

For numbers you want to *show* rather than plot — what the month went on, what the build is made of. **Pie chart**, **Donut**, **Bar chart** and **Stacked bar** sit on the palette's Math shelf, all of them the same thing underneath: rows of a name and a number. **The legend under the picture is the editor** — click a name or a number and type, `Enter` on the last number starts the next row, ✕ takes one off — and the picture follows every keystroke. The bar and stacked charts are deliberately plain first versions; the family will grow.

- **The labels place themselves.** A slice with room carries its share, written in white or near-ink by the slice's own measured lightness. One too small gets a thin line that runs out of it, **turns a corner, and says its name out in the margin** — and when several crowd one side they stack apart rather than pile up. **⌖ cycles where they sit**: automatic, **beside the slices** (each name just off the rim, the share still inside; anything that would pile up or overflow the margin lines out instead), everything on stalks, or everything inside. **％** cycles what they say — share, value, or nothing — and every slice explains itself under the pointer. On the plain charts ⌖ still means something: bars put their values inside the bar, the stacked bar lifts its names above it on little stems.
- **Or just drag a label.** Every label on the picture is a thing you can pick up and put where you want — out of the pie, into it, anywhere. It remembers its offset from where it *would* have sat (so it stays near its slice as the numbers change), **grows a leader line the moment it leaves its slice and sheds it when dragged back in**, swaps its ink to stay readable either way, and a **double-click sends it home**. ✎ holds the label knobs: a size slider (75–200%), the face they are set in — mono, serif or the note's handwriting — and *Labels back to automatic* to forget every drag at once.
- **◈ cycles the pie's look**: flat, donut (the total sits in the hole), 3D, or a hand-hatched **sketch** face that belongs on this paper. **✎** holds its measurements — where the first slice starts, the size of the hole, the depth of the rim — and *Sort by size*. **◇** turns the same rows into the next kind of chart.
- **◑ cycles six palettes.** Crisp, Vivid, Soft and Warm are fixed sets, **validated for colour-blind and normal-vision separation, lightness and chroma against all four stock papers** (`tools/verify/`'s dataviz checks were run on every set, light and dark steppings separately — the slot *order* is part of what passed, so don't reshuffle it by eye). Tonal and Ink are stepped live from the note's own accent and ink, so they follow any recolouring. A dark paper takes the dark stepping, and the charts repaint themselves when the theme changes.
- **A palette only offers what it can honestly tell apart** — ten slices on Crisp, Vivid and Soft (the ninth and tenth slots were appended through the same validator search, so the first eight kept their exact colours), six on Warm and the ramps — so the legend stops offering new rows at the palette's own cap, and switching palettes skips any too small for the rows you have. Fold a long tail into an "Other" row; slices are parted by a seam of the paper rather than drawn borders.

Like the plots it is arithmetic and SVG — no library, nothing to download — so a chart prints, exports and backs up exactly as it stands, legend and caption included.

## The stylus

**✎ Draw** in the bottom bar (or `D`) turns the whole page into paper you can draw on — circle something on a screenshot, arrow at a bug, scribble in the margin. Ink is not a box you place: it goes wherever you drag the mouse, **straight over pictures, videos, notes and everything else** on its layer.

- **Pen** thickens where you slow down and thins where you speed up, like a real nib. **Marker** lays a translucent band, **Eraser** rubs out ink on the layer you're working on. One nib size (FINE / THIN / BOLD) drives all three.
- `Ctrl+Z` takes back the last stroke — it is the same undo the rest of the app has, so it carries on back through whatever you did before you picked the pen up. **↶ Undo** in the ink bar is the narrower one: the last stroke *on this layer*, wherever it came in the order. **Clear ink** wipes the current layer's ink off the page.
- Strokes are vectors measured against the sheet's width, so they stay crisp at any zoom, they are remapped when the sheet grows, and they follow the paper into print and exports.
- `Esc` (or **✕ Done**) puts the mouse back to moving things.

## Shapes to draw over

A **Cube**, a **Sphere**, a **Torus**, a **Square** and a **Circle** — not pictures of solids, but something to put the pen on top of. Add one from the palette's **Shapes** shelf or from the ∑ Math bar, turn it until it sits the way you want it, and draw over it. The sphere arrives **face on** — equator level, poles upright — because that is how one is usually drawn; ⌂ takes it back there.

**✎ opens its measurements** — a small panel of sliders beside the shape, so you watch it change as you drag:

- A **torus** has its **outer and inner radius** — from a fat ring with a pinhole to a thin band — and a **sweep**: a dial you wind back from 360° to a three-quarter ring, a half donut, a slice, with the angle read out in degrees as you turn it. Where the ring stops, **the cut faces are drawn**: the tube's own circular cross-section, shaded like any face and dashed where it runs behind.
- A **sphere** takes the same sweep — 180° is exactly half a sphere, cut through its poles, with the two flat half-discs of the cut drawn where it opens.
- A **cube** has its three sides — **width, height and depth** — so it can be any box, which is most of what gets drawn over one.
- **↺** puts a shape's numbers back the way they were born.

**The square and the circle lie flat on the page** — no perspective, no pose, just construction lines in the plane of the paper. While one has the mouse (∑ Math, or ⟳ on its toolbar), it wears **corner handles: pull one, along x and y only, and the square becomes any rectangle, the circle any ellipse** — the handle follows the pointer whatever the page's zoom and however the item is rotated. The circle takes a **sweep** too, for half a circle or any arc: the pie's straight edges are drawn to the centre, and the centre lines only reach into the part that is kept. Turning a flat shape *in* the page is the item's own red rotate handle, like anything else on the paper.

They are drawn as construction lines and nothing else: **no frame, no background, nothing behind them**, so the paper and the grid on it run straight through and only the lines are added to the page. The contour — the line you would put down first — is the heavy one, the surface's own grid is lighter, and the far side of it is dashed and faint, so you can build through the form the way you would on paper.

- **Drag it to turn it**, in maths mode or after pressing **⟳** in its toolbar. Right turns it right, down brings the top over — the same hand as the Blender viewer. **Let go with speed and it keeps your spin**, dying away like a wheel left alone; a fresh grab takes it back at once. (The flat pair have nothing to turn — the same gesture is their corner handles instead.)
- **The wheel sizes it at any time, including in the middle of a turn**, and so does holding **Shift** as you drag — press it and let go of it without stopping. **⊖ ⊕** step it, and the corner dot resizes the whole thing on the page as usual. Nothing is clipped at the edge of the item, so winding one up big spills over the page rather than being cut off.
- **◈** switches contour-and-guides / every line / softly shaded. **◐** fades the whole guide back — full, half, faint — so it sits under your drawing instead of competing with it. **◑** cycles its colour, and a guide is one colour throughout so it stays clear of the ink you put on it.
- **◇** steps to the next shape without losing the pose you found — useful for checking a form against a simpler one. **⌂** goes back to the opening three-quarter view. **✥** (or a double-click) hands it back to the page so you can move it about.
- **Every line** (◈) adds the box around the circle and the diagonals across the square — the lines a rectangle or an ellipse gets built from.
- The stylus draws over them the way it draws over photos — ink is caught by a sheet above the whole page — so a guide never takes the pen off you.
- It is arithmetic and SVG, with no mesh and no WebGL behind it, so a guide costs nothing, travels in **backups**, and comes out in print and exports exactly as you left it.

## Chemistry

A **Molecule** goes on the page the way a chemist draws one: skeletal, the carbons implied at the corners, heteroatoms written out with their hydrogens, and nothing behind it but the paper. Under the drawing a small line says what you have — **formula, molar mass, and the name** when the app knows it (about two hundred common molecules, from water to caffeine; two things drawn apart read `ethanol + water`). Add one from the palette's **Science** shelf, or press Space and type `mol`.

**Drawing.** Click the molecule once to pick it up; click again and the pen is yours, with a glass rail down its left edge:

- **The element chip** is what the pen draws. Click it for the **periodic table** — a popover where a single click on any element takes it; while it is open, typing a symbol walks to the element and `Enter` takes it. Or skip the table: with the mouse over the molecule, **type the symbol** — `n`, `o`, `s`, `f`, `c` then `l` for chlorine, `b` then `r` for bromine — and the pen changes; over an atom, that atom changes too.
- **Click empty paper** for an atom. **Drag from an atom** and a bond sprouts where you point, snapping to the angles a chemist would use, with a ghost showing where it will land; **let go on another atom** and it bonds to that one instead. **Click an atom** of the element you are holding and a new bond grows into the widest gap — tapping the end of a chain lengthens it. Click it holding a different element and it is relabelled.
- **Click a bond** to step it single → double → triple; `1` `2` `3` on the keys do the same under the mouse, and the rail's bond button also offers a **wedge and a hash** for stereochemistry.
- **Rings**: benzene first, then 6, 5, 3, 4, 7 and 8 — the ring button steps through them. Click empty paper for a free ring, **a bond to fuse** a ring onto it (naphthalene is two clicks), or **an atom to hang one** from it.
- **Charge** puts + or − on the atom you click (click the rail button again to flip it; `+` and `-` on the keys do the same under the mouse). The **eraser** takes atoms and bonds away, and so does `Delete` under the mouse. **Select** (↖) picks atoms singly or with a box and drags them about; `Esc` lets go of them.
- An atom asked to hold more than it can — a carbon with five bonds — wears a **red halo** until it is fixed. That is a note, not a rule: the page takes whatever you draw.
- Hydrogens are implied the way a textbook implies them; draw one with `h` if you want it written.
- The drawing grows its window as it grows, and the window slides under it so what you have already drawn stays where it was.

**⌕ asks for one by name.** Type `aspirin`, `glucose`, `caffeine` — or a SMILES string like `CC(=O)O` — and it is drawn and laid out. **⟲** tidies anything you drew by hand into the same layout. **◐** steps the style: skeletal → **condensed** (every carbon written, `CH₃`, `OH`) → **Lewis** (every hydrogen drawn and the lone pairs as dots). **ƒ** hides and shows the formula line. **✎** turns the heteroatom colours off for a plain-ink drawing, and **Copy as SMILES** puts the line notation on the clipboard — paste it into the ⌕ box of any other molecule.

**3D.** Press **3D** and the drawing becomes the molecule in space — the same molecule, with its hydrogens materialised and the geometry worked out: water bent at 104.5°, methane a tetrahedron, cyclohexane a chair, ethane staggered, a benzene ring flat, your wedges and hashes honoured. **Drag to turn it, and let go with speed and it keeps turning**, dying away on its own; a fresh grab takes it back at once. The wheel sizes it, a double-click brings it home, ⟲ goes back to the starting view, and **◐** cycles **ball-and-stick**, **sticks** and **space-filling**. **2D** brings the drawing back — nothing is lost either way, because the 3D view is worked out from the drawing rather than stored.

**Click atoms to measure.** One atom says its shape — `bent · sp³ · AX₂E₂ · 104.5°` — two give a **distance** in ångströms, three an **angle**, four a **dihedral**; `Esc` clears the picks. **✎** adds element labels, shows the **lone pairs** where they sit in space, has a **keep turning** switch for a molecule you want to watch while you write, and a size slider.

The **Periodic table** is the second tool on the shelf: the table on the page as a reference card, the categories in muted tints, and a tap on any element writes its number, mass, electronegativity and electron configuration along its foot.

**Chart of nuclides** is the third, and it is a different chart altogether — the one that hangs on the wall of every nuclear physics department. Not the elements but the *nuclides*: every atomic nucleus that has ever been made or found, laid out with **neutrons across and protons up**, so that an element is a single row of it and the periodic table is what is left when you throw the horizontal axis away. There are 3558 of them, plus 2088 metastable states, and the numbers are NUBASE2020 — the evaluated table the wall charts are printed from.

**Read it by colour.** Black is stable, and the black squares trace the *valley of stability* the whole chart is built around. Below the valley there are too many neutrons and the way back up is **β− decay**, in blue; above it there are too few and the way down is **β+ or electron capture**, in red; the heavy corner goes by **α decay**, in yellow, with **spontaneous fission** in green among the superheavies; the ragged edges, where a nucleus cannot hold the last nucleon at all, throw a **proton** or a **neutron** outright. The straight rules across it are the **magic numbers** — 2, 8, 20, 28, 50, 82, 126, the closed shells — and the valley visibly bends where they cross. The dashed diagonal is N = Z, and how far the black squares lean away from it as you go up is the neutron excess heavy nuclei need to hold together.

**Wheel to zoom, drag to move about, double-click for the whole chart again.** Zoomed in, each square writes itself out: symbol and mass number, then the half-life, then the strongest branch. A nuclide with a **long-lived metastable state** has its square split the way the Karlsruhe chart splits it — ground state below, the isomer above — and pressing the top slice chooses the isomer, so ⁹⁹ᵐTc is a thing you can press.

**Press a nuclide** and the foot writes it out: half-life, spin and parity, natural abundance if it has one, the year it was found, and every decay branch with its percentage and the daughter it lands on — with an **arrow drawn on the chart to each one**, which is where the geometry becomes obvious: β− goes up and left, β+ down and right, α down-left two by two. Then the energies — **Qβ−, QEC, Qα, Sn, Sp, binding energy per nucleon and the mass excess** — none of which are stored anywhere. They are worked out from the mass excesses of that nuclide and its neighbours as you press, which is exactly what makes them worth having: the whole chart is one table of masses and everything else is subtraction.

**⇢ follows the chain.** Press it and the strongest branch is followed all the way down, drawn as a staircase and written out along the foot. Uranium-238 takes fourteen steps to lead-206; uranium-235 eleven to lead-207; thorium-232 ten to lead-208; neptunium-237 twelve to thallium-205, which is why that one is not in the ground any more.

**The colouring is a toolbar button.** **Decay** is the classic one above; **T½** shades by half-life on a log scale, which lights up the long-lived spine and the shell closures around it; **B/A** is binding energy per nucleon and draws the iron peak — the maximum is really ⁶²Ni at 8.7945 MeV — and **Sn** is the neutron separation energy, which goes to nothing exactly at the neutron drip line. **⌕** goes to a nuclide by name: `U238`, `238U`, `Tc-99m`, `14C`, `uranium-238`.

Everything here is arithmetic and SVG — no library, no server, nothing downloaded — so molecules travel in backups, print and exports exactly as drawn.

## FITS files (.fits)

Pick **FITS file** in the add menu, or just **drop a `.fits` on the page**. It sits there as a shortcut, like any attachment. **Click it and the reader opens.**

What opens first is **`hdu.info()`** — the same seven columns astropy prints, because that is the table everyone already reads: number, name, version, type, how many cards its header has, its dimensions and its format. Shapes are written the way numpy writes them, outermost axis first, which is `NAXIS` backwards.

**Pick a row** and that HDU comes up underneath it. First what its data *is* — and only what it is:

- an image gives you its **shape, its type, how many values that is and what it weighs in the file** — `(2048, 2048) · uint16 · 4,194,304 values · 8.0 MB`. If it is stored one way and read another (BITPIX 16 with a BZERO of 32768 is how FITS spells *unsigned*), it says so;
- a **binary table** gives you its rows, its columns, how many bytes a row is and how much of the file it takes — then lists every column: name, `TFORM`, type, **the shape of one cell**, unit, and how many values that comes to. A `4E` column is four floats per row, and a `TDIM` of `(2,2)` is a little 2×2 array in every row; both are shown as such;
- an HDU with no data at all — a primary header, which is what most modern files start with — simply says so.

**None of the numbers are ever read.** This is deliberate, and it is what makes the thing usable: a data unit can be four gigabytes, and the file is walked by adding up what each header says its data weighs and stepping over it. Opening a huge file costs the same as opening a small one, and nothing ever tries to draw a million values onto a page.

Then the **header** itself: keyword, value and comment in three columns that line up down the page, values coloured by what they are — strings, numbers, `T`/`F`. Long values broken across `CONTINUE` cards are joined back into the one value they always were, and a `HIERARCH` keyword keeps its real dotted name rather than the word HIERARCH.

**Runs of `COMMENT` and `HISTORY` fold themselves away** where they sit, so the order of the header is still the order of the header — a pipeline that logged two hundred lines into the middle of one is one line until you open it.

**The search box looks in the keyword, the value *and* the comment**, which is the half of it people usually want: half of what anyone hunts for in a header is a filter name or a date sitting in a value field, not a keyword. The first match in each card is lit up. Tick **all HDUs** and it searches the whole file at once, grouped by HDU — click a group's bar to jump to it.

### Pulling a column out

The columns of a binary table are **pickable**. Click one and it lights up; click more to add them; click a picked one to put it back. The line under the list says what you have and, before anything is read, **what will come over** — `2 columns picked · 50,000 of 200,000 rows — every 4th`.

**Then drag any picked column off the window.** The reader steps almost out of sight while you aim — it covers the whole sheet, and you cannot drop on paper you cannot see — with the column names following the pointer. Let go on the sheet and what lands is **an ordinary table**, which is the whole point: it sorts, it exports to `.csv`, it feeds a node graph, and dropping it on a coordinate system plots it. Let go on a table that is already there and the columns join that one instead. `→ table` does the same thing without the drag.

The column names come over as the header row, with the unit in them — `TIME (BJD - 2457000)`, `SAP_FLUX (e-/s)` — so a plot made from them is labelled without anyone typing a label. A column of four floats per row becomes four columns, `FLUX[0]` to `FLUX[3]`; a much wider one gives its first sixteen and says so. `TSCALn` and `TZEROn` are applied on the way out, and a cell holding the file's `TNULLn` comes over as a **gap**, not as a number.

**How much comes over is decided before anything is read, and always confessed** in the table's own foot. A column short enough to fit comes whole. A longer one comes **spread across the whole of it**, every nth row, when the walk is small enough to afford — which is what keeps the shape of a light curve, where taking the first slice would just give you the first hour of the observation. Only when even that would be too much does it take the first 50,000 rows, and it says that too.

Variable-length array columns (`1PE`), bit columns and complex ones are shown greyed, and hovering says why they cannot come. An ASCII table's columns come over as the file prints them.

**⧉** copies the whole header of the picked HDU, in the 80 columns it is written in. **⤓** saves a copy of the file. `Esc` closes the reader.

The file itself is kept inside the note like any attachment. What the note stores *about* it is a small digest — the info table, and nothing else — because a note is rewritten every time you type, and a header can be a megabyte of `HISTORY`. So the card on the paper still says what the file is in a print, an export or a backup opened somewhere else; the headers themselves are read back out of the file when you open it.

`.fits`, `.fit`, `.fts` and `.fz` are recognised, and a gzipped one (`.fits.gz`) is unpacked on the way in. A tile-compressed image is named as such rather than pretended about.

## Blender models (.obj)

Pick **3D model** in the add menu, or just **drag a `.obj` onto the page**. A model doesn't get taped in like a photo — it arrives in **its own little application window**: title bar with the file name and triangle count, chunky bevelled edges, the viewport sunk into the frame, and the caption running along the bottom as a status bar. The title bar lights up when the window is the one you're working on, exactly like a desktop that has been running since 1997. Every colour in it is mixed from the note's own theme, so it turns tan on Kraft and charcoal on Darkroom along with everything else. **▣** takes the frame off if you want the bare viewport.

To look around, hit **⟳** in its toolbar and drag inside the frame to spin it, wheel to zoom, double-click to re-frame. **⟳** again (or clicking anything else) goes back to moving the item around the page.

**Bring the materials too.** Select the `.obj`, its `.mtl` and the texture pictures together in the file dialog — or drag the whole lot onto the page at once — and the model shows up with its own colours and textures on it. In Blender that means *File → Export → Wavefront (.obj)* with **Export Materials** left on, and copying the texture files out of your project folder if they aren't beside the `.obj` already.

- Read from the `.mtl`: one material per `usemtl` run, its diffuse colour (`Kd`) and its diffuse texture (`map_Kd`) — with any path or option flags in front of the file name ignored, so Blender's `//textures/hull.png` still finds `hull.png`. `.png .jpg .gif .webp .bmp` decode; anything else falls back to the flat colour.
- **◑** now starts on the model's own materials and then cycles through the note's palette — a clay render in one of your accents, and back again. **◈** switches shaded / shaded + wireframe / pure wireframe (wireframe is skipped past ~120k triangles).
- Without a `.mtl` nothing changes from before: quads and n-gons, normals, negative indices and multi-object files all read, and a model with no normals gets flat-shaded faces. The title bar says `no ship.mtl` when the `.obj` asked for materials that never arrived.
- The `.obj`, the `.mtl` and every texture are stored inside the note, so they travel in your **backups** and come back together on restore. Deleting the model deletes its textures with it.
- Every model keeps a **still of its last pose** — textures and all — and that is what the shelf, print and the export show. An exported `.html` stays small and readable anywhere instead of shipping megabytes of mesh.
- The stylus draws over models like it draws over photos — ink already sits above the items on its layer — so you can circle a bad silhouette right on the render.
- One shared WebGL canvas draws every model on the page, so a page full of them costs one context. Without WebGL the frame just says so and the poster still prints.

## Slide decks (.pptx)

**Drop a `.pptx` onto the page** (or pick **Slides** in the add menu) and the deck itself lands there — not a link to it, not a screenshot of it: the slide, **drawn**. It arrives in the same little application window a model wears, with the file's name and length in the title bar, the slide sunk into the frame, and a strip underneath saying where you are: `3 / 81`, and a rail you can drag to run through the whole deck.

- **‹ ›** on the slide (or the ones on the toolbar) step a slide at a time. The **wheel** over it does the same, one slide a notch, so you can read a deck without picking it up. `Ctrl`+wheel is left alone, since everywhere else in the app that is the desk's own zoom.
- **Click the slide and the reader takes the screen.** Dark, quiet, the slide as large as it will go, and the deck laid along the bottom as a filmstrip you can scroll and click.
- The deck is kept whole inside the note, so it travels in **backups** and comes back on restore. **⤓** on the toolbar saves the original file back out.

### The reader

- **⊞** puts **every slide on screen at once**, as a grid you scroll; click one to fall back into it. `G` does the same from the keyboard. Only the thumbnails you can actually see are drawn, so a deck of eighty opens as fast as one of eight.
- **Walk it** with `←` `→`, `Space`, `PageUp` / `PageDown`, `Home` / `End`, the arrows either side, or **by dragging the slide itself**: it tracks your hand one to one, takes the flick's own speed with it when you let go, resists at the first and last slide instead of stopping dead, and can be caught and thrown back mid-flight. Press `→` twice quickly and you go two slides, rather than the second press being swallowed by an animation.
- **Zoom** with `+` / `−`, the buttons, `Ctrl`+wheel or a double-click — up to 8×, always about the point you aimed at, with the slide draggable underneath you. `F` (or the percentage) fits it back. **Nothing here is ever a bitmap being stretched**: the slide is vector all the way down, so 800% is as sharp as 100%.
- **≡** shows the **speaker notes** for the slide you are on, and the slide shrinks to make room for them rather than being covered.
- **⤓** saves the slide as a `.png`, at four times the size it was written.
- **⇗ puts the slide on the page as a picture** — taped in as an ordinary Picture item, captioned with the slide's own title, and from then on it is a picture like any other: draw over it, rotate it, file it in a folder, print it.
- `Esc` closes the reader (or leaves the grid, if that is where you are).

### What it can draw

Nothing is downloaded and no library is vendored in for this either. A `.pptx` is a zip of XML, the browser already has an unzipper and an XML parser, and the drawing inside is DrawingML: shapes with a geometry, a fill, a line and a body of text, measured in EMUs. `js/lib/pptx.js` turns that into **SVG measured in slide points**, which is why one drawing serves the card on the page, the thumbnail in the filmstrip, the slide filling the screen and the `.png` you pull out of it.

- **Text is laid out here, not by the browser.** Lines are measured with a canvas and broken by hand, so the SVG holds real `<text>` at real positions — it scales, prints and rasterises with no layout engine in the loop. Fonts are resolved to metric twins where the real one is missing (Calibri → Carlito, Cambria → Caladea, Arial → Liberation Sans), so the lines break where PowerPoint broke them.
- **A slide inherits nearly everything it looks like**, and that chain is followed: shape → its placeholder in the layout → the same placeholder in the master → the master's text styles → the theme. That is why a title lands in the right place, at the right size, in the theme's own accent, having said none of those things about itself.
- Shapes (about fifty preset ones, and freehand geometry), fills (solid, gradient, picture, pattern), lines with their dashes and arrowheads, drop shadows, rotation and flips, groups with their own coordinate space, pictures with their crops, **tables**, **charts** drawn from the numbers cached inside them, and **SmartArt** — which keeps a drawn copy of itself that is simply more shapes.
- **Symbol and Wingdings are alphabets in disguise**: a β is stored as the letter `b`, an arrow as `à`, to be read through a font this machine very likely hasn't got. They are translated into the Unicode that means the same thing and set in the ordinary face, rather than coming out as a row of tofu.
- **The master's furniture is drawn; its placeholders are not.** A footer written on the master is a *default*, not something on your slides — PowerPoint only shows one where the slide itself carries one, so this does too.
- What it cannot draw it says rather than fakes: an `.emf` pasted out of Word is a vector format no browser reads, and gets a quiet dashed frame with `EMF` in it. An old binary `.ppt` asks to be saved as `.pptx`.
- The card on the page keeps a **still of the slide it is showing**, and that is what the shelf, print and the export use — an exported `.html` stays readable instead of shipping the whole deck.

## Attachments (PDFs and other files)

Pick **Attachment** in the add menu, or **drop any file onto the page** that isn't a picture, a video, an `.obj` or a spreadsheet. You don't get the document sprawled across the page — you get a **shortcut to it**: a small document icon with the classic little arrow badge in the corner, and **the file's name written underneath**, so a page of them reads at a glance.

- **Click the icon and the PDF opens**, in a reader that comes up over the sheet (drop the shortcut onto another one and they become a **folder** instead — see below): the browser's own PDF viewer with its page controls, in a window with the file's name and length in the title bar. `Esc`, **✕** or a click outside closes it. **↗** in that title bar hands the file to a new browser tab and **⤓** saves a copy. There's an **↗** button on the item's toolbar too, and dragging the shortcut around never opens anything — only a real click does.
- The reader exists because a note opened straight off the disk (`file://`) *cannot* hand a stored file to a new tab — Firefox and Chrome refuse to navigate to a blob from a page with no origin. Opening it inside the note works everywhere; the tab button is there for when the browser allows it, and quietly saves the file instead when it doesn't. Attachments that aren't PDFs go straight to a tab or a download, since the browser can't display them anyway.
- **Hold `Ctrl` and put the mouse on an icon** and a small card peeks at the first page of the PDF, next to the file name, its page count and its size. The card is the real document rendered by the browser, cropped down to a thumbnail — nothing is decoded until you actually ask for it, so a page full of attachments costs nothing to open. Hovering on its own does nothing, so the mouse can cross a shelf of icons in peace.
- The icon carries the **file type** on a coloured tag (`PDF`, `BLEND`, `CSV`…), so a page of attachments doesn't turn into a row of identical squares.
- The file lives inside the note like a video does: it travels in **backups**, comes back on restore, and is deleted when you delete the shortcut. Rename the label under the icon like any other caption.
- In the **export** the file rides along inside the `.html` and the shortcut downloads it (anything over 15 MB stays behind, and the shortcut is then just a label). Print shows the icon and its name.

The preview is the live document rather than a saved picture, so it shows up in the app but not in print or in an export; making it appear there too would mean vendoring a PDF renderer into the folder to bake a thumbnail at import.

## Folders

A page full of loose shortcuts is still a mess. **Drag one thing on top of another and they file themselves into a folder** — the one underneath lights up while you hold the icon over it, and when you let go a folder is sitting where it was, holding both. Anything that can wear an icon can go in: attachments, pictures, videos, models, decks of flip cards and code cells. Drop a third thing onto the folder and it joins them. Or make an empty one first with **Folder** in the add menu and fill it later.

**Click the folder and it opens into a window** in the same 1997 chrome as the model frames: the contents laid out as icons with their names underneath, the title bar carrying the folder's name and what it holds (`6 items · 14 KB`). `Esc`, **✕** or a click outside closes it.

- **Everything in there is an icon**, and every kind gets its own: a document sheet with its file type on a tag, **a picture showing the actual picture**, a strip of film for a video (badged `YT`, `VIMEO` or `MP4`), and **a model showing the pose it last struck**. A model filed away before it ever sat on a page poses for its still the moment you open the folder.
- **Click one to open it.** A PDF comes up in the reader, a picture and a video get a window of their own, a code cell opens syntax-coloured with a copy button in its title bar, and a model opens **live and full size** — drag inside it to turn it, wheel to zoom, **⌂** to re-frame. Wherever you leave it is where it sits when you put it back on the page.
- **↥ on an icon puts it back on the sheet** as the real thing again — the picture is taped in, the model gets its window, the video its player, all at the size they were. **✕** deletes it from the note, its file with it.
- **`Ctrl` + hover works in here too**: the first page of a PDF, the picture, the first frame of a video, the model's pose. On a folder it lists what's inside.
- **Drop files straight into the open window**, or use **+** in its title bar. They arrive as themselves — a `.png` is a picture, an `.obj` and its `.mtl` are a model, everything else is an attachment.
- Folders stay **one level deep** on purpose: a folder is a tray, not a tree. Drop a folder onto something and that thing goes *into* the folder, keeping the name you gave it. Rename a folder by editing the label under it, like any other caption.
- What a folder holds is part of the note: it's saved with the sheet, travels in **backups**, comes back on restore, and deleting the folder deletes every file it was holding (after asking). In print and in an export a folder shows as its icon and name, with its contents listed in the tooltip — nothing over there opens.

## Flip cards

Pick **Flip cards** in the add menu and a deck of index cards lands on the page — a stack of them, the top one face up, ruled in red across the head the way a real one is. **The question is on the front and the answer is on the back: click the card and it turns over.** `‹` and `›` walk the deck, and it comes round again at the end.

**A card is a little board, not a form.** Everything on it — the question, a picture, a video, a model, the options — is a block you can pick up, drag anywhere and size to taste. A new card starts the way a study card usually is: **one line, written big, sitting in the middle of the card**, because most of them never hold more than that.

### Writing them

A new deck arrives with one blank card and the pen already in your hand; **✎** on the item's toolbar switches between writing and studying. While you are writing, the row under the card is the tool tray:

- **Type straight onto the card.** `$$…$$` compiles into a typeset equation when you leave the box, exactly as it does everywhere else, and **∑** wraps whatever you've selected in the dollars for you.
- **＋ Text** adds another line. **Picture · Video · Model · File** put the real thing on the side you are looking at: a photo, a YouTube / Vimeo link or a video off your disk, a `.obj` out of Blender with its `.mtl` and textures, a PDF you can click open. **Or drop the files straight onto the card.** They live inside the note like everything else — they travel in backups, come back on restore, and go when the card goes.
- **Drag anything on the card to move it; the dot on its corner sizes it** — that is how a picture is scaled to the size you actually want it. Tap a block and its own row appears under the card: **A− / A+** for the writing, **L C R** to line it up, **◧− / ◧+** for the width, **⌖ middle** to plant it dead centre, **✕** to take it off.
- **It lines things up for you.** Drag something near the middle of the card, or level with anything else on it, and a thin red guide appears where it has snapped — middles to middles, edges to edges, and a comfortable margin down each side. Dead centre wins over the rest, so a wide block settles in the middle instead of catching a margin. **Hold `Shift` to put the guides away** and place it by hand.
- **A/B** turns the card into a **multiple choice question**: options with A, B, C down the side, a tick on the ones that are right. One right answer means a single tap answers the card; tick two or more and the reader gets a *Check my answer* button instead. The options are a block like any other — move them where you want them.
- **↺ answer** turns the card over so you can write the other side; `‹ ›` move along the deck; **＋ card** starts a new one after this, **✕ card** throws this one away.

### Studying them

Turn the card, decide how you did, and hit **✓** or **✗** — the deck moves on to the next card by itself. In the scope you can also **throw the card**: drag it right for ✓, left for ✗ — it follows your hand, and on release the speed of the throw decides, or it springs back to the middle for another look. A multiple choice card marks itself the moment you pick, showing the right answer in green and your mistake in red, then turns over to the explanation if there is one. The score sits in the corner of the deck (`8✓ 2✗`), with a line under the title bar filling up as you get through the run.

- **⌖ gives the card the whole screen.** The sheet, the desk and everything else fade out behind it and the card comes up big, on its own. Because everything on a card is measured in the card itself, the same card is simply *bigger* in here — nothing reflows, nothing has to be laid out twice. The keys do the work: **space** turns the card, **← →** walk the deck, **1–9** pick an answer, **r** and **w** mark it right or wrong, **esc** puts the sheet back. A model on a card is live in here — drag inside it to turn it around, wheel to zoom.
- **Σ shows the scoreboard**: how many out of how many, the percentage, a green-and-red bar, and every card in the run listed with how it went. Click any line to jump straight to that card. It comes up on its own when you finish the last card.
- **↻ replays the deck** from the first card with every mark cleared. **↻✗ replays only the ones you got wrong** — the deck then holds just those, says `3 / 7 · missed` where the count goes, and is scored on its own. Replay all afterwards to get the whole deck back. Both are on the item's toolbar and in the scope, and both sit on the scoreboard where you actually want them.

A deck keeps a running tally per card, so you can tell an old friend from one you have never once got right.

**Decks file away like anything else.** Drop a deck onto another item and they go into a folder together, with the deck showing as its own icon — a stack of cards with the count on the front. `Ctrl` + hover lists what is on them; clicking one opens it straight into the scope to study, and `Esc` puts you back in the folder.

In **print** a deck shows the card it is on, question side up. In an **export the cards still turn** — click one and it flips, with the arrows walking the deck, all of it done with no script at all.

## Layers

**▤ Layers** in the top bar (or `L`) opens the stack — layers belong to the note. Ink and items on a higher layer cover everything below; within a layer, ⤒ / ⤓ order things front to back.

- **Click a layer to work on it**: new items and new ink land there, and *everything on the other layers goes faint and stops taking clicks* so you can work without hitting anything else. **Show all** (or `Esc`) brings them back, and the **Fade other layers** switch turns the fading off if you'd rather keep the page as it is.
- The **▤n** button on an item's toolbar moves it to the next layer.
- ◉ hides a layer, ▲ ▼ restack, ✕ removes one — anything on it moves onto the neighbouring layer rather than being thrown away. The number beside a layer counts what it holds on the pages you're looking at.
- Old boxed sketches from earlier versions are converted into page ink the first time a page is opened; a pre-vector bitmap sketch stays as a picture.

**Arrows (connectors):** the **→** button in any item's toolbar draws an arrow to another item — click the target and the arrow snaps between the two, attached to their edges like a PowerPoint connector, following them when they move. Click an arrow to select it: **↝** cycles the shape (straight / curved / bézier — the last used becomes the default for new arrows), **⇄** flips the direction, **◑** recolours, **✕** removes.

**Pins & strings (detective board):** the 📌 button in any item's toolbar pins the item and lets you tie a string to another item — click the second item to knot it (Esc cancels). Strings are simulated: they drape under gravity and swing when you drag whatever they're pinned to. Click a string to select it — ◑ recolours it, ✕ (or `Delete`) cuts it. Strings also show up on the shelf, in print and in exports. Double-click any text to edit it. **Select words with your mouse, then tap a coloured dot in the item's toolbar to highlight them** (⌫H removes a highlight). Videos have a ▶ toggle that switches between *move* mode and *play* mode.

## Adding things — the palette

Press **Space** (or **Shift+A**, or right-click the paper) and the palette warps out of your cursor, Blender-style — pick a tile and the item lands right where you invoked it. The same panel sits behind the **+ Add…** button in the toolbar.

Everything that can go on the sheet is in it, sorted onto seven shelves — **Write · Math · Logic · Science · Media · Shapes · Decor** — each tool an icon with its name under it and a fuller sentence in its tooltip. The panel remembers the shelf you left it on, and **Clear canvas** — which wipes everything off, items and ink, after a confirmation — sits along its foot. `Esc` closes it.

**Or just type.** The search field has focus from the moment the panel opens, so hitting Space and typing `ma` finds Matrix, Marker and 3D model whatever shelf they live on — each wearing a small tag saying which. `Enter` takes the best match, and the arrow keys walk the grid.

## Taking it back

- **`Ctrl`+`Z` undoes the last thing you did; `Ctrl`+`Y` — or `Ctrl`+`Shift`+`Z` — undoes the undo.** The ↶ ↷ pair in the bottom bar does the same with the mouse, and goes dim when there is nothing either way. Sixty steps are kept, and the tape runs backwards to say so.
- **A step is one thing done**, not one write to the store: a whole drag counts once, the throw at the end of it included; a burst of typing counts once and closes when you pause; every stroke of ink is its own.
- It reaches everything the paper is made of, because everything on the paper is saved the same way — a thing placed, deleted, moved, resized, recoloured, filed into a folder or tied to another; ink; a cleared canvas; and the size of the sheet itself, which comes back with every item and every stroke exactly where it was.
- It deliberately leaves alone the things you are *holding* rather than what is on the paper: zoom and pan, the layer, the pen, the map and the sound.
- Inside a text box the keys belong to the box — that is the browser's own undo, letter by letter. Step out of it and `Ctrl`+`Z` takes back the whole burst.
- The stack is per note and per session: opening another note starts a fresh one.

## Menu (⚙)

The drawer holds the note actions (Export / Print / Back up / Restore) plus all customization: theme presets (Graph, Darkroom, Blueprint, Kraft) and full colour overrides — paper, ink, grid lines, both accents, and the desk behind the sheet. Your palette is saved with the note and carried into exports.

**Paper grain** switches the speckle over the paper on and off. It is the one part of a sheet that costs real drawing work — it is a filter blended over the whole surface — so on a sheet grown to several thousand pixels, turning it off is what buys you the smoothest panning and zooming. New notes start without it.

There's also a **studio sounds** toggle with a volume slider — soft pencil scratches while you write and draw, gentle plops when placing things, a layered papery swish when a note opens (slide, and a few fibre crackles — slightly different every time), ticks for checkboxes, and a tape run backwards for an undo — the same sound the other way up for a redo. All generated live with WebAudio; no audio files, and off means off.

## Getting it out (all in ⚙ Menu)

- **Export** — a single self-contained `.html` (read-only) you can send to anyone or publish: the whole sheet as it stands, with local videos embedded inside it. Flip cards still turn over there.
- **Print / PDF** — the sheet via the browser's print dialog.
- **Back up / Restore** — full `.json` snapshot of the open note, including videos; restore it on any machine (it replaces the note you have open).

## Notes

- Images are downscaled to ≤2000 px on import to keep the note light while still holding up under zoom.
- Fonts load from Google Fonts; offline you get clean system fallbacks.
- Data lives in the browser profile that opened the file. Moving the folder is fine; switching browsers means restoring from a backup.
