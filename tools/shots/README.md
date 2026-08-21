# The pictures in the README

    tools/shots/run.sh              every scene
    tools/shots/run.sh molecules    just that one

Five of them: `canvas`, `molecules`, `nuclides`, `data`, `logic`.

Output lands in `docs/img/`, which `README.md` links to.

A screenshot taken by hand goes stale the first time a colour, a font or a
layout changes, and nobody notices until someone points at the repo. So none of
these are taken by hand. `scenes.js` is appended after the app's own scripts —
the same trick `tools/verify/probe.js` uses — clears the sheet, builds a known
arrangement **through the same `add` entries the palette uses**, and stands back
far enough to see all of it. `tools/verify/serve.py` holds the load event open
with `/slow` while that happens; when the hold runs out the page finishes
loading and Firefox takes the shot.

One Firefox per scene, because `--screenshot` fires once, on load. A fresh
profile each time, so `boot.js` finds an empty IndexedDB, makes one note and
opens it — which is the blank sheet every scene starts from.

Nothing here is a mock-up. **A shot that comes out wrong is the app being
wrong**, which is the point: these are as much a check as `probe.js` is, just
one a person has to look at.

## Adding a scene

Add a function to `SCENES` in `scenes.js`, give it a size in `SIZE`, and name it
on the command line. If it has to touch the app after the first render — wiring
a node into a plot, say, so the series carries what a real drop would put in it
— add a second function called `<name>After`.

## Traps

- **Every item's fields must be the real ones.** `put()` goes through
  `ADD_KINDS[kind].make`, so a type gets its proper defaults, but anything you
  override has to match what the feature reads: a plot's functions are
  `{id, expr, c, s}`, a checklist is markdown lines in `it.html`, a sticky
  note's colour is one of `'' c2 c3 c4 c5`.
- **A fixed-aspect item gets *taller in percent* on a shorter sheet.** Items are
  stored as a fraction of the paper, but a plot, a chart and the nuclide chart
  all size their height from their width in pixels. Shrink `SIZE` and they grow
  as a share of the sheet, and start overlapping whatever is below them.
- **Ink is in thousandths of the sheet's WIDTH on both axes.** On a 1980 × 1240
  sheet the bottom edge is at y = 626, not 1000.
- **Give every table and figure a caption.** An empty one shows its grey
  `caption` placeholder, which looks like a defect in a screenshot. (A logic
  gate is the exception: its placeholder only appears on a gate you have picked
  up, so a circuit of a dozen of them is not a circuit of a dozen ghost words.)
- **Anything drawn *between* items is laid after the render, not during it.**
  The strings and the node wires are put up by `drawStaticStrings`, but the
  logic leads are measured off the port dots, which do not exist until the sheet
  has been rendered — hence `logicAfter()` calling `lgSync()`. A scene that
  wires things together and shows no wires has forgotten its `After`.
- The recompression at the end is lossless on purpose. Quantising to a 256
  colour palette halves the files again but bands the desk's gradient.
