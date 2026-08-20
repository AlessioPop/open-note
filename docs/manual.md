# Open Note — Manual

Everything you can put on a page. For running the app see the [README](../README.md); for working on the code see [How it's built](architecture.md).

## Your sketchbooks

The app opens on the **shelf** — every sketchbook shown as a mini cover in its own colours (a fresh install skips the shelf and drops you straight into your first book).

- Click a cover to open it; hover to lift it off the shelf.
- The dashed **+** card starts a new sketchbook; the dashed **∞** card next to it starts a **canvas** instead — see below.
- Click a book's name to rename it; the **✕** in its corner (appears on hover) deletes the whole book after a confirmation.
- **☰ Books** in the top bar (or the wordmark) takes you back to the shelf any time; `Esc` returns to the open book.

## The canvas

A canvas is the other thing on the shelf: **one endless sheet instead of a book of pages**. No cover, no page numbers, no flipping — just paper that keeps going, with everything else exactly as it is in a book. Every tool, the stylus, layers, maths, strings, folders, export and backup all work on it unchanged.

- It opens showing all of itself. Drag the bare paper to move around, scroll to pan, `Ctrl`+scroll or `+` / `−` to zoom, and click the percentage to fit the whole sheet on screen again.
- When you run out of room, **click the hatched rail along that edge** — the sheet grows by a page's worth on that side and everything already on it stays exactly where it was. It starts three pages wide by two deep and grows to about twenty-four.
- **▦ Map** in the toolbar puts the whole sheet in the corner: everything on it, and a bright rectangle showing where you are. Drag inside it to go somewhere — quicker than panning once the sheet is bigger than a screenful.
- The toolbar shows how big the sheet is instead of a page count, and the shelf shows it under the name: `∞ 1980 × 1320`.
- It takes the same theme, colours and paper as a book, from the same **⚙ Menu**.

Things scale to the paper they are on: a sticky note dropped on a canvas is the size it would be on a page, not three times the size, and so is a pen stroke.

**On smoothness:** nothing in the app limits the frame rate — it draws when the screen does. Zooming used to be the exception: zoom here is a real layout change (that is what keeps text and ink sharp instead of blowing up a bitmap), and on a big sheet one wheel notch cost ~78 ms, worse the further in you were. Now a turning wheel only scales the sheet on the compositor — 17 ms a notch, vsync — and the sharp version is committed 180 ms after you stop, so it goes very slightly soft mid-gesture and lands crisp. A canvas also never eases or flips, and starts without the **paper grain** (⚙ Menu), the one thing on a sheet whose cost grows with the sheet. Turn the grain back on if you want the texture and don't mind the paint.

## What you can put on a page

| Tool | What it does |
|---|---|
| Heading / Text / Handwriting | Poster type, serif body text, marker-pen handwriting — `$$…$$` compiles to a typeset equation |
| Marker | Highlighted handwriting — cycle highlight colour with ◑ |
| Checklist | Obsidian-style `- [ ]` tasks — click boxes to tick, double-click to edit; Enter adds a new task |
| Code | A terminal-style code cell, syntax-coloured the way VS Code does it — display only, nothing runs. Python by default, or JavaScript, TypeScript, C, C++, C#, Rust, Go, Java, GDScript, Shell and SQL from the picker in its title bar, which also holds the copy button. ◑ cycles six colour schemes — Dark, Light, Monokai, Dracula, Solarized, and a Theme scheme whose terminal is mixed from the book's own ink and paper, going deeper than the paper when the paper itself is dark. Double-click to type: it recolours under the caret as you go, Tab indents, Enter keeps the line's indent, brackets and quotes close themselves the way the editor's do (type the close and it steps over, backspace an empty pair and both go, Enter between braces opens the block out), and pasting strips any formatting. ⏎ wraps long lines or lets them run; a cell past ~16 lines shows a band of itself with its own scrollbar, and ⊞ shows the whole thing. Drop one on another icon and it files into a folder, wearing a little terminal with its language on the tag — click it in there and it opens highlighted, with copy in the title bar |
| Table | A spreadsheet on the page — cells, four styles, `=SUM(A2:B4)` formulas, sorting, a live readout of what you have picked, and drag it onto a coordinate system to plot it; see **Tables** below |
| Spreadsheet | The same table, read straight out of an `.xlsx`, `.ods` or `.csv` — or just drop the file on the page. A long one shows a band of itself and folds down to an icon; see **Tables** below |
| Sticky | Sticky notes in 5 colours, with a folded corner |
| Flip cards | A deck of index cards — question on the front, answer on the back, laid out how you like and marked ✓ or ✗ as you go |
| Coordinate system | Axes you can drag around, with functions, vectors and a table's points drawn in them — see **Maths** below |
| Node | A small card you wire between a table and a plot: keep some columns, do arithmetic on whole columns, put every number through a formula, or hand in a number on a slider or a colour — see **Nodes** below |
| Matrix / Vector | Cards you fill in and throw at each other — any size, ✎ reshapes them; multiply, invert, take powers, eigen-decompose, fold a product down to its answer, drop them into a plot |
| Pie chart / Donut / Bar chart / Stacked bar | Charts of named shares, typed straight into their own legend — a pie in four looks (flat, donut, 3D, hand-sketched), up to ten slices in six colour palettes, labels you can flip between four placements or simply drag where you want them; see **Charts** below |
| Atlas | A contents block that draws itself from your bookmarks — every bookmark a chapter, every Heading under it a sub-header; click a line to flip there. The first bookmark you make puts one on the starting page |
| Cube / Sphere / Torus / Square / Circle | Wireframe shapes to draw over — turn them, size them, set their measurements (a torus's radii, a sweep down to a part shape), fade them back under your pen; the square and circle lie flat and reshape by their corners; see **Shapes to draw over** below |
| Picture | Taped-in photos with captions. Also: drag-and-drop or just **paste** a screenshot (Ctrl+V) |
| Video | YouTube / Vimeo links, or a video file from disk (stored inside the book) |
| 3D model | A `.obj` out of Blender — mesh, materials and textures — in a little window you can turn it in |
| Slide deck | A `.pptx`, drawn rather than described — walk it on the page, or click it for the reader: all the slides at once, one at a time, zoomable, with the notes and any slide liftable out as a picture |
| Attachment | A PDF (or any file) kept inside the book as a clickable shortcut — see below |
| Folder | A tray for files, pictures, video and models — or drag two things together to make one |
| Tape | Decorative washi strips, 6 patterns |
| Sticker | Arrow, star, warning, check, bug, heart — recolourable |

Every item: drag to move — **it leans into the push and keeps your momentum when you let go**, sliding a little way like paper on a desk (grab it mid-slide and it's simply yours again) — corner dot to resize, **drag the red handle above an item to rotate it** (hold Shift for 15° snapping), ⤒ / ⤓ to send it to the front or the back, ✕ or `Delete` to remove.

## Tables

A table works the way a spreadsheet does. Click it once to pick it up like anything else on the page; click again and the cells have the mouse.

- **Cells.** Click one to put the cursor on it, drag across to take a range, or `Shift`-click the far corner. Arrow keys walk it, `Shift`+arrows extend the range, `Tab` and `Enter` step across and down. **Just start typing** and what you type goes into the cell — `Enter` or `Tab` keeps it, `Esc` throws it away, `F2` or a double-click opens a cell to edit what is already there. `Delete` clears the cells you have picked rather than the table.
- **Rows and columns.** When the table is selected it grows a strip of column letters along the top and row numbers down the side. Hover one and it offers **✕** to remove that row or column and **+** to insert another next to it; click it to select the whole row or column. The two faint **+** rails down the right edge and along the bottom add one on the end, and `Tab` off the last cell adds a row the way a spreadsheet does. Drag the line between two column letters to set the column widths — they share the table's width between them, so the table itself stays as wide as you made it. The corner box is what you drag the whole table around by.
- **Formulas.** A cell that starts with `=` is worked out: `=A2+B2`, `=SUM(A2:B4)`, `=ROUND(AVG(B2:B4),1)`. There is `SUM` `AVG` `MIN` `MAX` `COUNT` `MEDIAN` `STDEV` `STDEVP` `VAR` `VARP` `ABS` `SQRT` `ROUND`, the usual `+ − × ÷ ^` and brackets, single cells like `B3` and blocks like `A2:C9`. `STDEV` and `VAR` divide by *n−1* — a sample of a thing rather than the whole of it, the way a spreadsheet means the name; `STDEVP` and `VARP` are there for when it really is the whole. Rows and columns are numbered the way they are labelled, so `A1` is the top-left cell whether or not the first row is a header. Editing a cell shows the formula; leaving it shows the answer, and so do print, the overview and an exported book. Insert or remove a row and every formula follows the cells it was pointing at; delete a row something depended on and it says `#REF` rather than quietly meaning something else. A formula that ends up depending on itself says `#CYCLE`.
- **What the cells you have picked come to.** Take a range and the strip under the table says `n 24 · Σ 318.4 · x̄ 13.3 · s 2.37 · 8.97…15.98` — how many numbers, their total, their mean, the sample standard deviation and the two ends of the range. Pick a single cell and it just says where you are (`C14`). It is the line every spreadsheet keeps along the bottom of its window, because it is the quickest question anyone asks of a column of readings. The readout belongs to whoever is working in the table, so like the row numbers it only appears while the table is selected.
- **Sorting.** **⇅** sorts every row by the column the cursor is in — smallest first, press it again for largest first. Whole rows move, marks and all, so a row stays the reading it was; numbers come before words and blank cells stay at the bottom either way. A table with formulas in it **refuses to sort** and says why: a reference here is an address, so a `=B4` carried three rows down would still be asking about row 4, which after a sort is somebody else's reading. Take the formulas out (or paste their answers back in) and sort then.
- **How it looks.** ▦ cycles four styles — ruled lines, a full grid, zebra stripes, or nothing at all. **Hdr** makes (or unmakes) the first row a header, ≡ aligns the column left / centre / right, and **B**, *I* and ◑ set the cells you have picked in bold, italic or a highlight. A–/A+ size the type. Everything takes its colours from the book's theme.
- **Paste a block.** Copy cells out of a real spreadsheet and paste them in — tabs and newlines are laid out across the cells, growing the table if it needs the room. `Ctrl+C` copies the range you have picked back out the same way.

### Reading a spreadsheet in

**Drop an `.xlsx`, `.ods`, `.csv` or `.tsv` onto the page** and it arrives as a table, sized and aligned to what is in it. **Spreadsheet** in the add menu does the same through a file dialog, and **Load** on a table already on the page pours a file into that one. A workbook with several sheets asks which one you want.

Nothing is downloaded and no library is vendored in to do it: an `.xlsx` and an `.ods` are both a zip of XML, and the browser already has an unzipper and an XML parser. `js/lib/sheet.js` is the whole of it.

- **Dates come out written down.** A date in a workbook is a *number* — `45352` — and only the format attached to the cell says it is the 1st of March. Those cells are read as `2024-03-01` (or `2024-03-01 15:30:00`, or `15:30:00`), which sorts and reads the same everywhere.
- **Everything else comes out as the number it is.** A cell shown as `15%` holds `0.15` and arrives as `0.15`; one shown to two decimals arrives with all of them. The file's numbers are the data, and rounding them on the way in would be inventing readings that were never taken. Float noise from the spreadsheet (`1.2999999999999998`) is trimmed to the fifteen digits a workbook actually keeps, and a long whole number is left exactly as written — that is an id, not a measurement.
- **A formula in the workbook comes in as its answer.** The value the spreadsheet last worked out is what lands in the cell, since Excel's function library is not this one's.
- **What it can't do it says.** An old binary `.xls` asks to be saved as `.xlsx` or `.csv`. A hidden sheet is skipped — it is usually a workbook's own scaffolding.
- **`.csv` works out its own separator** — comma, semicolon, tab or pipe — and handles quoted fields, including the ones with a comma or a newline inside them. A semicolon file whose numbers are written `1,5` is read as European and comes out `1.5`.
- **An extract says so.** A table holds up to 50,000 rows and 256 columns. Read a bigger sheet than that and the strip under the table carries `first 50,000 of 812,000 rows` for as long as the table exists — on the page, in print, and in an exported book.

### A big table on a small page

Fifty thousand rows is a fine thing to keep and an impossible thing to draw, so **a table longer than about twenty-five rows shows a band of itself** and the strip underneath says which rows you are looking at: `rows 431–445 of 4,812 · 6 columns`. The header row is pinned above the band, so what you are reading always has its names on it.

- **The wheel scrolls it**, whether or not the table is the thing you are working in — reading a long one should not mean picking it up first. `Ctrl`+wheel is left alone, since everywhere else in the app that is the desk's own zoom. There is a **scrollbar** down the right-hand side to drag, and `PageUp` / `PageDown` / `Ctrl+Home` / `Ctrl+End` walk it. Arrow keys that take the cell cursor off the band bring the band along with them.
- It scrolls by **whole rows**, the way a spreadsheet does, rather than by pixels — a row is as tall as the words wrapped inside it, and a pixel scroll over rows of different heights judders.
- **Click the row count** to change how much shows at once: 10, 15, 25, 40, or the whole thing.
- Only the rows on screen are ever worked out. A formula reaching out of the band still pulls in whatever it needs, one cell at a time.

**⊟ folds the whole table down to an icon** — the same document icon an attachment wears, with the file's name under it and its type on the tag. That is where a 40,000-row table belongs on a page of notes: out of the way, and one click from being read. `Ctrl`+hover peeks at the top corner of the sheet.

**Click the icon and the whole sheet opens in a window** over the book — the letters and numbers always out, a cell to a line, click a column letter to sort by it, ⤓ to save it as a `.csv`, and ⊞ to put it back on the page at the size it was. The window keeps its own place in the table, so scrolling in there does not move what is on the paper. Everything else is unchanged: a folded table still travels in a backup, still plots into a coordinate system, and still shows as its icon in print and in an exported book.

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

**A coordinate system with no data in it is unchanged**: no margin, axes through the origin with their arrows, numbers written along them, a square of it still square. That is what the vectors and the basis need, and it is the look the sketchbook is for.

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

Nodes save, print, export and back up like anything else on the page, wires and all. A card that cannot work anything out at that moment — in a print, in an exported book — shows the last thing it was worth, the same way a plotted series carries its points.

Not yet: nodes cannot be filed into a folder. A graph shut inside one would go dark, because a node can only read what is out on the page.

## Equations

Write LaTeX between `$$…$$` in any text box, sticky note, checklist task or picture caption. **When you leave the box it compiles** into a properly set equation; double-click back in and your LaTeX source is there again to edit. The **∑** button in a text item's toolbar wraps whatever you've selected in `$$…$$` (or drops an empty pair at the caret) if you'd rather not type the dollars.

- `$$…$$` (or `\[…\]`) puts the equation on its own centred line; `\(…\)` keeps it running inside the sentence. A bare `$…$` is inline maths too, but only when it holds a TeX signal — a `\`, `^`, `_`, `{` or `}` — so "costs $5 to $10" stays a price while `$v^2$` becomes maths.
- Understood: fractions and `\binom`, roots, sub- and superscripts, primes, Greek and the usual symbols, `\sum \prod \int \lim` (limits go above and below in display maths, beside it inline), `\left(…\right)` brackets that grow with what they hold, `\begin{pmatrix}` / `bmatrix` / `vmatrix` / `cases` / `aligned` / `array`, `\text{…}`, `\mathrm \mathbf \mathbb \mathcal \mathfrak \mathsf \mathtt`, accents (`\hat \bar \vec \tilde \dot \overline`), spacing (`\, \; \quad`), and `\\` to stack several lines.
- A formula that doesn't compile stays on the page in red with the reason in its tooltip — hover it to see *"\\wat is not one I know"* and fix it. Nothing is ever swallowed.
- Equations are **stored as LaTeX**, so they travel in backups and stay editable forever. They are **drawn as MathML**, so the overview, print and exported books show them with no library, no script and nothing to download — your system's maths font does the typesetting.

This is maths *set on the page*. For maths you can pull about — axes, plotted functions, vectors and matrices — see **Maths** below.

## Maths

**∑ Math** in the bottom bar (or `M`) puts a maths toolbar under the book and hands the mouse to the coordinate systems on the page — until you turn it off, dragging inside one moves the *plane* rather than the item. The same bar carries the wireframe shapes to draw over (**Shapes to draw over**, below), and in maths mode dragging one of those turns it. `Esc` steps back out.

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

A coordinate system is nothing but numbers and SVG, so it costs no library, travels in **backups**, and comes out in the overview, in print and in an **exported book** exactly as you left it — the picture, the key underneath, the caption, and every card of working beside it.

## Charts

For numbers you want to *show* rather than plot — what the month went on, what the build is made of. **Pie chart**, **Donut**, **Bar chart** and **Stacked bar** sit on the palette's Math shelf, all of them the same thing underneath: rows of a name and a number. **The legend under the picture is the editor** — click a name or a number and type, `Enter` on the last number starts the next row, ✕ takes one off — and the picture follows every keystroke. The bar and stacked charts are deliberately plain first versions; the family will grow.

- **The labels place themselves.** A slice with room carries its share, written in white or near-ink by the slice's own measured lightness. One too small gets a thin line that runs out of it, **turns a corner, and says its name out in the margin** — and when several crowd one side they stack apart rather than pile up. **⌖ cycles where they sit**: automatic, **beside the slices** (each name just off the rim, the share still inside; anything that would pile up or overflow the margin lines out instead), everything on stalks, or everything inside. **％** cycles what they say — share, value, or nothing — and every slice explains itself under the pointer. On the plain charts ⌖ still means something: bars put their values inside the bar, the stacked bar lifts its names above it on little stems.
- **Or just drag a label.** Every label on the picture is a thing you can pick up and put where you want — out of the pie, into it, anywhere. It remembers its offset from where it *would* have sat (so it stays near its slice as the numbers change), **grows a leader line the moment it leaves its slice and sheds it when dragged back in**, swaps its ink to stay readable either way, and a **double-click sends it home**. ✎ holds the label knobs: a size slider (75–200%), the face they are set in — mono, serif or the book's handwriting — and *Labels back to automatic* to forget every drag at once.
- **◈ cycles the pie's look**: flat, donut (the total sits in the hole), 3D, or a hand-hatched **sketchbook** face that belongs on this paper. **✎** holds its measurements — where the first slice starts, the size of the hole, the depth of the rim — and *Sort by size*. **◇** turns the same rows into the next kind of chart.
- **◑ cycles six palettes.** Crisp, Vivid, Soft and Warm are fixed sets, **validated for colour-blind and normal-vision separation, lightness and chroma against all four stock papers** (`tools/verify/`'s dataviz checks were run on every set, light and dark steppings separately — the slot *order* is part of what passed, so don't reshuffle it by eye). Tonal and Ink are stepped live from the book's own accent and ink, so they follow any recolouring. A dark paper takes the dark stepping, and the charts repaint themselves when the theme changes.
- **A palette only offers what it can honestly tell apart** — ten slices on Crisp, Vivid and Soft (the ninth and tenth slots were appended through the same validator search, so the first eight kept their exact colours), six on Warm and the ramps — so the legend stops offering new rows at the palette's own cap, and switching palettes skips any too small for the rows you have. Fold a long tail into an "Other" row; slices are parted by a seam of the paper rather than drawn borders.

Like the plots it is arithmetic and SVG — no library, nothing to download — so a chart prints, exports and backs up exactly as it stands, legend and caption included.

## The stylus

**✎ Draw** in the bottom bar (or `D`) turns the whole page into paper you can draw on — circle something on a screenshot, arrow at a bug, scribble in the margin. Ink is not a box you place: it goes wherever you drag the mouse, **straight over pictures, videos, notes and everything else** on its layer.

- **Pen** thickens where you slow down and thins where you speed up, like a real nib. **Marker** lays a translucent band, **Eraser** rubs out ink on the layer you're working on. One nib size (FINE / THIN / BOLD) drives all three.
- `Ctrl+Z` takes back the last stroke — it is the same undo the rest of the book has, so it carries on back through whatever you did before you picked the pen up. **↶ Undo** in the ink bar is the narrower one: the last stroke *on this layer*, wherever it came in the order. **Clear ink** wipes the current layer's ink off the page.
- Strokes are vectors measured against the page width, so they stay crisp at any zoom and follow the page into spreads, thumbnails, print and exports. In spread view each page draws on its own.
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
- It is arithmetic and SVG, with no mesh and no WebGL behind it, so a guide costs nothing, travels in **backups**, and comes out in print, the overview and exported books exactly as you left it.

## Blender models (.obj)

Pick **3D model** in the add menu, or just **drag a `.obj` onto the page**. A model doesn't get taped in like a photo — it arrives in **its own little application window**: title bar with the file name and triangle count, chunky bevelled edges, the viewport sunk into the frame, and the caption running along the bottom as a status bar. The title bar lights up when the window is the one you're working on, exactly like a desktop that has been running since 1997. Every colour in it is mixed from the book's own theme, so it turns tan on Kraft and charcoal on Darkroom along with everything else. **▣** takes the frame off if you want the bare viewport.

To look around, hit **⟳** in its toolbar and drag inside the frame to spin it, wheel to zoom, double-click to re-frame. **⟳** again (or clicking anything else) goes back to moving the item around the page.

**Bring the materials too.** Select the `.obj`, its `.mtl` and the texture pictures together in the file dialog — or drag the whole lot onto the page at once — and the model shows up with its own colours and textures on it. In Blender that means *File → Export → Wavefront (.obj)* with **Export Materials** left on, and copying the texture files out of your project folder if they aren't beside the `.obj` already.

- Read from the `.mtl`: one material per `usemtl` run, its diffuse colour (`Kd`) and its diffuse texture (`map_Kd`) — with any path or option flags in front of the file name ignored, so Blender's `//textures/hull.png` still finds `hull.png`. `.png .jpg .gif .webp .bmp` decode; anything else falls back to the flat colour.
- **◑** now starts on the model's own materials and then cycles through the book's palette — a clay render in one of your accents, and back again. **◈** switches shaded / shaded + wireframe / pure wireframe (wireframe is skipped past ~120k triangles).
- Without a `.mtl` nothing changes from before: quads and n-gons, normals, negative indices and multi-object files all read, and a model with no normals gets flat-shaded faces. The title bar says `no ship.mtl` when the `.obj` asked for materials that never arrived.
- The `.obj`, the `.mtl` and every texture are stored inside the book, so they travel in your **backups** and come back together on restore. Deleting the model deletes its textures with it.
- Every model keeps a **still of its last pose** — textures and all — and that is what the overview, the shelf, print and the exported book show. An exported `.html` stays small and readable anywhere instead of shipping megabytes of mesh.
- The stylus draws over models like it draws over photos — ink already sits above the items on its layer — so you can circle a bad silhouette right on the render.
- One shared WebGL canvas draws every model on the page, so a page full of them costs one context. Without WebGL the frame just says so and the poster still prints.

## Slide decks (.pptx)

**Drop a `.pptx` onto the page** (or pick **Slides** in the add menu) and the deck itself lands there — not a link to it, not a screenshot of it: the slide, **drawn**. It arrives in the same little application window a model wears, with the file's name and length in the title bar, the slide sunk into the frame, and a strip underneath saying where you are: `3 / 81`, and a rail you can drag to run through the whole deck.

- **‹ ›** on the slide (or the ones on the toolbar) step a slide at a time. The **wheel** over it does the same, one slide a notch, so you can read a deck without picking it up. `Ctrl`+wheel is left alone, since everywhere else in the app that is the desk's own zoom.
- **Click the slide and the reader takes the screen.** Dark, quiet, the slide as large as it will go, and the deck laid along the bottom as a filmstrip you can scroll and click.
- The deck is kept whole inside the book, so it travels in **backups** and comes back on restore. **⤓** on the toolbar saves the original file back out.

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
- The card on the page keeps a **still of the slide it is showing**, and that is what the overview, the shelf, print and the exported book use — an exported `.html` stays readable instead of shipping the whole deck.

## Attachments (PDFs and other files)

Pick **Attachment** in the add menu, or **drop any file onto the page** that isn't a picture, a video, an `.obj` or a spreadsheet. You don't get the document sprawled across the page — you get a **shortcut to it**: a small document icon with the classic little arrow badge in the corner, and **the file's name written underneath**, so a page of them reads at a glance.

- **Click the icon and the PDF opens**, in a reader that comes up over the book (drop the shortcut onto another one and they become a **folder** instead — see below): the browser's own PDF viewer with its page controls, in a window with the file's name and length in the title bar. `Esc`, **✕** or a click outside closes it. **↗** in that title bar hands the file to a new browser tab and **⤓** saves a copy. There's an **↗** button on the item's toolbar too, and dragging the shortcut around never opens anything — only a real click does.
- The reader exists because a book opened straight off the disk (`file://`) *cannot* hand a stored file to a new tab — Firefox and Chrome refuse to navigate to a blob from a page with no origin. Opening it inside the book works everywhere; the tab button is there for when the browser allows it, and quietly saves the file instead when it doesn't. Attachments that aren't PDFs go straight to a tab or a download, since the browser can't display them anyway.
- **Hold `Ctrl` and put the mouse on an icon** and a small card peeks at the first page of the PDF, next to the file name, its page count and its size. The card is the real document rendered by the browser, cropped down to a thumbnail — nothing is decoded until you actually ask for it, so a page full of attachments costs nothing to open. Hovering on its own does nothing, so the mouse can cross a shelf of icons in peace.
- The icon carries the **file type** on a coloured tag (`PDF`, `BLEND`, `CSV`…), so a page of attachments doesn't turn into a row of identical squares.
- The file lives inside the book like a video does: it travels in **backups**, comes back on restore, and is deleted when you delete the shortcut. Rename the label under the icon like any other caption.
- In the **exported book** the file rides along inside the `.html` and the shortcut downloads it (anything over 15 MB stays behind, and the shortcut is then just a label). Print and the overview show the icon and its name.

The preview is the live document rather than a saved picture, so it shows up in the app but not in print or in an exported book; making it appear there too would mean vendoring a PDF renderer into the folder to bake a thumbnail at import.

## Folders

A page full of loose shortcuts is still a mess. **Drag one thing on top of another and they file themselves into a folder** — the one underneath lights up while you hold the icon over it, and when you let go a folder is sitting where it was, holding both. Anything that can wear an icon can go in: attachments, pictures, videos, models, decks of flip cards and code cells. Drop a third thing onto the folder and it joins them. Or make an empty one first with **Folder** in the add menu and fill it later.

**Click the folder and it opens into a window** in the same 1997 chrome as the model frames: the contents laid out as icons with their names underneath, the title bar carrying the folder's name and what it holds (`6 items · 14 KB`). `Esc`, **✕** or a click outside closes it.

- **Everything in there is an icon**, and every kind gets its own: a document sheet with its file type on a tag, **a picture showing the actual picture**, a strip of film for a video (badged `YT`, `VIMEO` or `MP4`), and **a model showing the pose it last struck**. A model filed away before it ever sat on a page poses for its still the moment you open the folder.
- **Click one to open it.** A PDF comes up in the reader, a picture and a video get a window of their own, a code cell opens syntax-coloured with a copy button in its title bar, and a model opens **live and full size** — drag inside it to turn it, wheel to zoom, **⌂** to re-frame. Wherever you leave it is where it sits when you put it back on the page.
- **↥ on an icon puts it back on the page** as the real thing again — the picture is taped in, the model gets its window, the video its player, all at the size they were. **✕** deletes it from the book, its file with it.
- **`Ctrl` + hover works in here too**: the first page of a PDF, the picture, the first frame of a video, the model's pose. On a folder it lists what's inside.
- **Drop files straight into the open window**, or use **+** in its title bar. They arrive as themselves — a `.png` is a picture, an `.obj` and its `.mtl` are a model, everything else is an attachment.
- Folders stay **one level deep** on purpose: a folder is a tray, not a tree. Drop a folder onto something and that thing goes *into* the folder, keeping the name you gave it. Rename a folder by editing the label under it, like any other caption.
- What a folder holds is part of the book: it's saved with the page, travels in **backups**, comes back on restore, and deleting the folder deletes every file it was holding (after asking). In print and in an exported book a folder shows as its icon and name, with its contents listed in the tooltip — nothing over there opens.

## Flip cards

Pick **Flip cards** in the add menu and a deck of index cards lands on the page — a stack of them, the top one face up, ruled in red across the head the way a real one is. **The question is on the front and the answer is on the back: click the card and it turns over.** `‹` and `›` walk the deck, and it comes round again at the end.

**A card is a little board, not a form.** Everything on it — the question, a picture, a video, a model, the options — is a block you can pick up, drag anywhere and size to taste. A new card starts the way a study card usually is: **one line, written big, sitting in the middle of the card**, because most of them never hold more than that.

### Writing them

A new deck arrives with one blank card and the pen already in your hand; **✎** on the item's toolbar switches between writing and studying. While you are writing, the row under the card is the tool tray:

- **Type straight onto the card.** `$$…$$` compiles into a typeset equation when you leave the box, exactly as it does everywhere else, and **∑** wraps whatever you've selected in the dollars for you.
- **＋ Text** adds another line. **Picture · Video · Model · File** put the real thing on the side you are looking at: a photo, a YouTube / Vimeo link or a video off your disk, a `.obj` out of Blender with its `.mtl` and textures, a PDF you can click open. **Or drop the files straight onto the card.** They live inside the book like everything else — they travel in backups, come back on restore, and go when the card goes.
- **Drag anything on the card to move it; the dot on its corner sizes it** — that is how a picture is scaled to the size you actually want it. Tap a block and its own row appears under the card: **A− / A+** for the writing, **L C R** to line it up, **◧− / ◧+** for the width, **⌖ middle** to plant it dead centre, **✕** to take it off.
- **It lines things up for you.** Drag something near the middle of the card, or level with anything else on it, and a thin red guide appears where it has snapped — middles to middles, edges to edges, and a comfortable margin down each side. Dead centre wins over the rest, so a wide block settles in the middle instead of catching a margin. **Hold `Shift` to put the guides away** and place it by hand.
- **A/B** turns the card into a **multiple choice question**: options with A, B, C down the side, a tick on the ones that are right. One right answer means a single tap answers the card; tick two or more and the reader gets a *Check my answer* button instead. The options are a block like any other — move them where you want them.
- **↺ answer** turns the card over so you can write the other side; `‹ ›` move along the deck; **＋ card** starts a new one after this, **✕ card** throws this one away.

### Studying them

Turn the card, decide how you did, and hit **✓** or **✗** — the deck moves on to the next card by itself. In the scope you can also **throw the card**: drag it right for ✓, left for ✗ — it follows your hand, and on release the speed of the throw decides, or it springs back to the middle for another look. A multiple choice card marks itself the moment you pick, showing the right answer in green and your mistake in red, then turns over to the explanation if there is one. The score sits in the corner of the deck (`8✓ 2✗`), with a line under the title bar filling up as you get through the run.

- **⌖ gives the card the whole screen.** The book, the desk and everything else fade out behind it and the card comes up big, on its own. Because everything on a card is measured in the card itself, the same card is simply *bigger* in here — nothing reflows, nothing has to be laid out twice. The keys do the work: **space** turns the card, **← →** walk the deck, **1–9** pick an answer, **r** and **w** mark it right or wrong, **esc** puts the book back. A model on a card is live in here — drag inside it to turn it around, wheel to zoom.
- **Σ shows the scoreboard**: how many out of how many, the percentage, a green-and-red bar, and every card in the run listed with how it went. Click any line to jump straight to that card. It comes up on its own when you finish the last card.
- **↻ replays the deck** from the first card with every mark cleared. **↻✗ replays only the ones you got wrong** — the deck then holds just those, says `3 / 7 · missed` where the count goes, and is scored on its own. Replay all afterwards to get the whole deck back. Both are on the item's toolbar and in the scope, and both sit on the scoreboard where you actually want them.

A deck keeps a running tally per card, so you can tell an old friend from one you have never once got right.

**Decks file away like anything else.** Drop a deck onto another item and they go into a folder together, with the deck showing as its own icon — a stack of cards with the count on the front. `Ctrl` + hover lists what is on them; clicking one opens it straight into the scope to study, and `Esc` puts you back in the folder.

In **print and in the overview** a deck shows the card it is on, question side up. In an **exported book the cards still turn** — click one and it flips, with the arrows walking the deck, all of it done with no script at all.

## Layers

**▤ Layers** in the top bar (or `L`) opens the stack — layers belong to the book, so every page shares them. Ink and items on a higher layer cover everything below; within a layer, ⤒ / ⤓ order things front to back.

- **Click a layer to work on it**: new items and new ink land there, and *everything on the other layers goes faint and stops taking clicks* so you can work without hitting anything else. **Show all** (or `Esc`) brings them back, and the **Fade other layers** switch turns the fading off if you'd rather keep the page as it is.
- The **▤n** button on an item's toolbar moves it to the next layer.
- ◉ hides a layer, ▲ ▼ restack, ✕ removes one — anything on it moves onto the neighbouring layer rather than being thrown away. The number beside a layer counts what it holds on the pages you're looking at.
- Old boxed sketches from earlier versions are converted into page ink the first time a page is opened; a pre-vector bitmap sketch stays as a picture.

**Arrows (connectors):** the **→** button in any item's toolbar draws an arrow to another item — click the target and the arrow snaps between the two, attached to their edges like a PowerPoint connector, following them when they move (across the spread too). Click an arrow to select it: **↝** cycles the shape (straight / curved / bézier — the last used becomes the default for new arrows), **⇄** flips the direction, **◑** recolours, **✕** removes.

**Pins & strings (detective board):** the 📌 button in any item's toolbar pins the item and lets you tie a string to another item — click the second item to knot it (Esc cancels). In **spread view the string can cross to the facing page**, sagging over the gutter like real yarn (cross-page strings only show while both pages are visible). Strings are simulated: they drape under gravity and swing when you drag whatever they're pinned to. Click a string to select it — ◑ recolours it, ✕ (or `Delete`) cuts it. Same-page strings also show up in the overview, on the shelf, in print and in exported books. Double-click any text to edit it. **Select words with your mouse, then tap a coloured dot in the item's toolbar to highlight them** (⌫H removes a highlight). Videos have a ▶ toggle that switches between *move* mode and *play* mode.

## Adding things — the palette

Press **Space** (or **Shift+A**, or right-click the paper) and the palette warps out of your cursor, Blender-style — pick a tile and the item lands right where you invoked it. The same panel sits behind the **+ Add…** button in the toolbar.

Everything that can go on a page is in it, sorted onto five shelves — **Write · Math · Media · Shapes · Decor** — each tool an icon with its name under it and a fuller sentence in its tooltip. The panel remembers the shelf you left it on, and the page actions (Bookmark / Clear page / Remove page) sit along its foot. `Esc` closes it.

**Or just type.** The search field has focus from the moment the panel opens, so hitting Space and typing `ma` finds Matrix, Marker and 3D model whatever shelf they live on — each wearing a small tag saying which. `Enter` takes the best match, and the arrow keys walk the grid.

## Pages

- `+ Page` inserts after the current page; each page has its own paper — grid / ruled / dots / isometric / blank — via the paper button in the toolbar or **⚙ Menu**, where you can also set the default paper for new pages.
- **Clear page** (in the palette's foot) wipes everything off the current page — items and ink — after a confirmation but keeps the page; **Remove page** deletes the page itself.
- **Spread view** (▢▢) shows two facing pages at once; both are fully editable, and you can **drag an item from one page straight onto the other** — any strings tied to it come along, switching between same-page and cross-page automatically.
- **Page size — drag the paper bigger.** Three handles sit just off the open page: the hatched **corner** takes both directions at once, the **tick on the right edge** widens it, the one **along the bottom** lengthens it. A readout shows the size while you drag. This is not zoom: type, ink and the paper grid stay exactly the size they were, so a bigger page is *more room*, not bigger writing — the same paragraph simply wraps into fewer lines. Everything already on the page keeps its position and its share of the width. **Double-click any handle** to go back to the shape's own size, or pick a shape in **⚙ Menu** (the menu shows *Custom* once you've dragged one).
- **Zoom** with the −/+ buttons, `Ctrl`+scroll, or `+`/`-`/`0` keys; drag the desk around the book to pan. Zoom is true layout zoom — the page really re-renders, so text, sketches and paper patterns stay sharp at any level. Clicking the percentage fits the whole page on the desk when it's bigger than the screen, and takes you back to 100% otherwise.
- Page title and date at the top-left are editable.
- **Bookmarks**: *Bookmark page* in the palette's foot slips a **divider tab onto the fore-edge** — a straight, rounded index tab that really comes out from between the pages: its buried end simply disappears under the paper (the tab strip is drawn beneath the sheet), the page's own shadow falls across the seam, and only the part poking out takes the mouse. Visible from every page; click it to flip straight there. It slides out further on hover and stays pulled out on its own page. Drag a tab along the fore-edge or around onto the top edge, double-click to rename it (it shows the page's name otherwise), right-click for colour (◑, five sticky colours) or remove (✕).
- **The atlas**: your **first bookmark quietly puts a Contents block on the starting page** (after that it's an ordinary item — move it, resize it, delete it, or add another from the palette's Write shelf). Every bookmark is a chapter line wearing its tab's colour swatch, and **every Heading on the pages under that bookmark** (up to the next one) is listed beneath it as a sub-header, dotted leaders out to the page numbers. **Click any line and the book flips there.** It keeps no content of its own — bookmarks and headings are the content — so it can never go stale, and it comes out in print and exports as a proper table of contents (each page's headings ride the book's index as a digest, so even pages not yet loaded list correctly).
- **Page shape**: pick Portrait / A4 / Square / Landscape / Widescreen per book in **⚙ Menu** — that sets the size the handles then start from. Whatever size you land on is carried into print, exports, backups and the shelf covers.
- **All pages** shows a thumbnail overview.
- Arrow keys flip pages.

## Taking it back

- **`Ctrl`+`Z` undoes the last thing you did; `Ctrl`+`Y` — or `Ctrl`+`Shift`+`Z` — undoes the undo.** The ↶ ↷ pair in the bottom bar does the same with the mouse, and goes dim when there is nothing either way. Sixty steps are kept, and the tape runs backwards to say so.
- **A step is one thing done**, not one write to the store: a whole drag counts once, the throw at the end of it included; a burst of typing counts once and closes when you pause; every stroke of ink is its own.
- It reaches everything the paper is made of, because everything on the paper is saved the same way — a thing placed, deleted, moved, resized, recoloured, filed into a folder or tied to another; ink; a cleared page; and a page added or removed, which comes back with everything that was on it, pictures and attachments included.
- It deliberately leaves alone the things that are *where you are standing* rather than what is on the paper: turning a page, zoom and pan, the layer and the pen you are holding, and the sound. A `Ctrl`+`Z` that took back a page turn instead of the change you meant would be worse than no undo at all.
- Undo turns to the page the change happened on, so you always see what came back.
- Inside a text box the keys belong to the box — that is the browser's own undo, letter by letter. Step out of it and `Ctrl`+`Z` takes back the whole burst.
- The stack is per book and per session: opening another sketchbook starts a fresh one.

## Menu (⚙)

The drawer holds the book actions (Export / Print / Back up / Restore) plus all customization: theme presets (Graph, Darkroom, Blueprint, Kraft) and full colour overrides — paper, ink, grid lines, both accents, and the desk behind the book. Your palette is saved with the book and carried into exports.

**Paper grain** switches the speckle over the paper on and off. It is the one part of a sheet that costs real drawing work — it is a filter blended over the whole surface — so on a canvas grown to several thousand pixels, turning it off is what buys you the smoothest panning and zooming. New canvases start without it; books keep it.

There's also a **studio sounds** toggle with a volume slider — soft pencil scratches while you write and draw, gentle plops when placing things, a layered papery page-turn (swish, slide, and a few fibre crackles — slightly different every time), ticks for checkboxes, and a tape run backwards for an undo — the same sound the other way up for a redo. All generated live with WebAudio; no audio files, and off means off.

## Getting it out (all in ⚙ Menu)

- **Export book** — a single self-contained `.html` flipbook (read-only) you can send to anyone or publish. Local videos are embedded inside it.
- **Print / PDF** — every page as A4 via the browser's print dialog.
- **Back up / Restore** — full `.json` snapshot of the open book, including videos; restore it on any machine (it replaces the book you have open).

## Notes

- Images are downscaled to ≤2000 px on import to keep the book light while still holding up under zoom.
- Fonts load from Google Fonts; offline you get clean system fallbacks.
- Data lives in the browser profile that opened the file. Moving the folder is fine; switching browsers means restoring from a backup.

