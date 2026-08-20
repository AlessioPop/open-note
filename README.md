# Open Note

An artistic, page-based sketchbook for game devlogs. No servers, no build step, no dependencies — open `index.html` in any modern browser and start taping things in.

## Run it

Double-click `index.html`, or serve the folder if you prefer:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

Everything is saved automatically in your browser (IndexedDB), per browser profile. Use **Back up** regularly if the book matters to you.

## Documentation

| Guide | What's in it |
| --- | --- |
| [Manual](docs/manual.md) | Everything you can put on a page — tables, nodes, equations, maths, charts, the stylus, shapes, `.obj` models, `.pptx` decks, attachments, folders, flip cards, layers, pages. |
| [How it's built](docs/architecture.md) | The shape of it, the four rules, the module map, the registry, and how to add a feature without touching anything else. |
| [Apple design notes](SKILL.md) | The fluid-interface playbook the motion follows — springs, velocity handover, momentum, interruptibility, reduced-motion. Governs `js/core/drag.js`, `js/core/zoom.js` and `js/lib/spring.js`. |
| [Verification](tools/verify/README.md) | `tools/verify/run.sh` drives the app in headless Firefox and prints a report. |

## Layout

```
index.html        the app shell — markup and base stylesheet, not the features
js/core/          book, page, item, state, store, history, drag, zoom, save
js/items/         one file per item type — note, table, chart, code, model, deck…
js/ui/            palette, toolbars, menus
js/lib/           self-contained libraries — latex, pptx, sheet, spring, sound
tools/verify/     headless-Firefox verification harness
docs/             manual and architecture
SKILL.md          Apple fluid-interface notes (also installed as a Claude Code skill)
```

The marketing website lives in its own repository, `open-note-site`, and ships no app code.
