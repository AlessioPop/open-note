# Open Note

An artistic, page-based sketchbook for game devlogs. No servers, no accounts, no telemetry — it runs entirely on your machine, and everything it needs to draw itself ships with it.

## Run it

**As a desktop app.** Grab the build for your system from [Releases](../../releases) and open it — nothing to install alongside it, and no browser involved.

| | File | First run |
| --- | --- | --- |
| Linux | `.AppImage` | `chmod +x` it, then open it. Nothing is installed. |
| Windows | `.exe` — installer, or the `portable` one | SmartScreen will warn. **More info → Run anyway.** |
| macOS | `.dmg` | Right-click the app → **Open**, once. Double-clicking shows a "damaged" error. |

The alpha builds are **unsigned**, which is what those two warnings are about — a certificate costs money per year and buys nothing until the app is worth trusting. If that bothers you, build it yourself from source; it is the same code.

**From source**, if you would rather:

```
npm install
npm start
```

**In a browser.** Double-click `index.html`, or serve the folder:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

Everything is saved automatically, on your machine, using IndexedDB. The desktop app and the browser keep **separate** libraries — they are different origins, so a book made in one does not appear in the other. Move one across with **Back up** on one side and **Restore** on the other, and back up regularly either way if the book matters to you.

## Documentation

| Guide | What's in it |
| --- | --- |
| [Manual](docs/manual.md) | Everything you can put on a page — tables, nodes, equations, maths, charts, the stylus, shapes, `.obj` models, `.pptx` decks, attachments, folders, flip cards, layers, pages. |
| [How it's built](docs/architecture.md) | The shape of it, the four rules, the module map, the registry, and how to add a feature without touching anything else. |
| [Apple design notes](.claude/skills/apple-design/SKILL.md) | The fluid-interface playbook the motion follows — springs, velocity handover, momentum, interruptibility, reduced-motion. Governs `js/core/drag.js`, `js/core/zoom.js` and `js/lib/spring.js`. |
| [Verification](tools/verify/README.md) | Two harnesses: `run.sh` drives the app in headless Firefox, `desktop.sh` drives the Electron shell. Both print a pass/fail report; CI gates release builds on the second. |

## Layout

```
index.html        the app shell — markup and base stylesheet, not the features
js/core/          book, page, item, state, store, history, drag, zoom, save
js/items/         one file per item type — note, table, chart, code, model, deck…
js/ui/            palette, toolbars, menus
js/lib/           self-contained libraries — latex, pptx, sheet, spring, sound
fonts/            the four families, carried locally so nothing needs the network
desktop/          the Electron shell — main process and icon; wraps the app, never part of it
tools/verify/     headless-Firefox verification harness
docs/             manual and architecture
```

Only `index.html`, `js/`, `fonts/` and `desktop/` are packaged into a build — `package.json`'s `build.files` is a whitelist, so docs and tooling stay in the repo and out of the app.

## Cutting a release

```
npm version 0.1.0-alpha.2 --no-git-tag-version   # edit the version
git commit -am "Release 0.1.0-alpha.2"
git tag v0.1.0-alpha.2
git push origin main --tags
```

`.github/workflows/release.yml` builds all three platforms on their own runners and collects them into one GitHub Release. A tag carrying `-alpha` or `-beta` is published as a pre-release. Nothing is signed and nothing auto-updates yet.

## The marketing website

It lives in its own repository, `open-note-site`, and ships no app code.
