/* Open Note — desktop/main.js
   the Electron shell: one window, a real origin, and a saved note on the way out.

   This file is a wrapper around the app, never a part of it. Nothing in js/ knows
   it exists, and index.html still opens on its own in a browser exactly as before
   — which is rule 1 in docs/architecture.md and stays true. */

const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

/* The app is the folder above this one: index.html and js/, exactly as a browser
   would see them. Nothing served from here is allowed to reach outside it. */
const ROOT = path.join(__dirname, '..');
const SCHEME = 'opennote';
const HOST = 'app';
const START = SCHEME + '://' + HOST + '/index.html';
const DEV = process.argv.includes('--dev') || !app.isPackaged;

/* ================= a real origin =================
   The app is NOT loaded over file://. A file:// page has an opaque origin, and an
   opaque origin gets no IndexedDB — core/store.js would fall through to its
   in-memory fallback and every note would die with the window. Registering our
   own standard scheme gives the page a stable, secure origin (opennote://app), so
   IndexedDB, localStorage and blob URLs all behave like they do on a web server.

   Scheme and host are load-bearing for as long as the app ships: they ARE the
   identity IndexedDB files the user's notes under. Changing either orphans them.
   js/platform/platform.js states the same contract for the iOS and Android
   shells: all three must serve the app from opennote://app. */
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true }
}]);

function serve(req) {
  const { host, pathname } = new URL(req.url);
  if (host !== HOST) return new Response('not found', { status: 404 });
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.resolve(ROOT, '.' + rel);
  /* ../../etc/passwd and friends never leave the app folder */
  if (file !== ROOT && !file.startsWith(ROOT + path.sep))
    return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

/* ================= where the window was last =================
   Remembered per install, next to the notes rather than in the repo. */
const stateFile = () => path.join(app.getPath('userData'), 'window.json');

function lastBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch (e) {}
  return { width: 1280, height: 860 };
}

function rememberBounds(win) {
  try {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch (e) {}
}

/* ================= the menu =================
   There isn't one on Windows or Linux. The app has its own toolbar, and every
   accelerator a default menu installs is one the page already wants: Ctrl+Z and
   Ctrl+Shift+Z are core/nav.js's undo/redo, Ctrl+A/C/X belong to the table, and
   Ctrl+R would reload a note out from under someone mid-sentence.

   macOS is the exception — with no menu at all, Cmd+C and Cmd+V stop working
   there. So it gets the smallest menu that keeps the clipboard alive, and
   deliberately no undo/redo roles, so Cmd+Z still falls through to the page and
   behaves the same on all three platforms. */
function installMenu() {
  if (process.platform !== 'darwin') return Menu.setApplicationMenu(null);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'Edit', submenu: [
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { role: 'pasteAndMatchStyle' }, { role: 'selectAll' }
    ] },
    { role: 'windowMenu' }
  ]));
}

function createWindow() {
  const saved = lastBounds();
  const win = new BrowserWindow({
    ...saved,
    minWidth: 900,
    minHeight: 620,
    title: 'Open Note',
    /* Linux reads the window icon off the running process; packaged builds get
       theirs from the installer instead, so this only matters when running from
       source. Windows and macOS take it from the build. */
    icon: path.join(__dirname, 'icon.png'),
    /* the desk colour, so the first frame is the app rather than a white flash */
    backgroundColor: '#2a2e33',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      devTools: DEV
    }
  });
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL(START);

  /* An attachment asks for a tab (items/file.js). There are no tabs here, so we
     refuse — and file.js already falls back to saving it, which gets a proper
     Save dialog. A real link goes to the user's actual browser, never in here.
     The one window the app may open is a desk card (desk.html — a deck of flip
     cards on its own), and that gets the small floating window below. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    /* Not `allow`: a window Chromium opens for window.open() belongs to its
       opener and dies with it, and the whole point of a desk card is to outlive
       the app window. So the shell opens one of its own and says no to the page —
       whose window.open() then returns null, which platform/web.js reads as
       "the host took it" when it is running in here. */
    if (isDesk(url)) { openDesk(url); return { action: 'deny' }; }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  /* Nothing navigates the app window away from the app. */
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(SCHEME + '://' + HOST)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  if (DEV) {
    win.webContents.on('before-input-event', (e, input) => {
      const k = (input.key || '').toLowerCase();
      if (input.type !== 'keyDown') return;
      if (k === 'f12' || (input.control && input.shift && k === 'i')) {
        win.webContents.toggleDevTools();
        e.preventDefault();
      }
    });
  }

  ['resize', 'move'].forEach(ev => win.on(ev, () => rememberBounds(win)));

  /* ================= the note goes down with the window =================
     core/save.js debounces its writes by 600ms and hangs the last one on the
     suspend hooks in platform/web.js — but none of those can await, so closing
     within that window could tear the renderer down mid-transaction and lose the
     last edit. Here we can do better than a browser: hold the close, run flush()
     to completion, then go. flush is a top-level function in a classic script,
     so it is reachable. */
  let flushed = false;
  win.on('close', e => {
    rememberBounds(win);
    if (flushed || win.webContents.isDestroyed()) return;
    e.preventDefault();
    win.webContents.executeJavaScript('flush()')
      .catch(() => {})
      .then(() => { flushed = true; win.destroy(); });
  });

  return win;
}

/* ================= desk cards =================
   A deck of flip cards taken to the desk (items/write/deck.js → desk.html) is a
   small window of its own: no frame — the deck's own bar is what you hold it
   by — floating above the rest, and NOT tied to the app window: close Open
   Note and the card stays, and the app stays up for it. Which cards were out,
   and where, is remembered next to the notes, so they come back with the app. */
const DESK = SCHEME + '://' + HOST + '/desk.html';
const isDesk = url => typeof url === 'string' && url.startsWith(DESK);
const deskFile = () => path.join(app.getPath('userData'), 'desk.json');
const desks = new Map();                             // BrowserWindow → its url

function deskOptions(bounds) {
  return {
    width: 640, height: 580, minWidth: 380, minHeight: 340, ...(bounds || {}),
    frame: false, alwaysOnTop: true, title: 'Open Note — desk card',
    backgroundColor: '#101214', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: DEV }
  };
}
function rememberDesks() {
  try {
    const out = [];
    for (const [w, url] of desks) if (!w.isDestroyed()) out.push({ url, ...w.getNormalBounds() });
    fs.writeFileSync(deskFile(), JSON.stringify(out));
  } catch (e) {}
}
const deskId = url => { try { return new URL(url).searchParams.get('id'); } catch (e) { return null; } };
/* one window per deck: asked again, the card that is already out reloads to the
   rewritten deck and comes to the front */
function openDesk(url, bounds) {
  const id = deskId(url);
  for (const [w, u] of desks) if (!w.isDestroyed() && deskId(u) === id) {
    w.loadURL(url); w.show(); w.focus();
    return w;
  }
  const w = new BrowserWindow(deskOptions(bounds));
  w.loadURL(url);
  desks.set(w, url);
  ['resize', 'move'].forEach(ev => w.on(ev, rememberDesks));
  w.on('closed', () => { desks.delete(w); rememberDesks(); });
  rememberDesks();
  return w;
}
function restoreDesks() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(deskFile(), 'utf8')); } catch (e) {}
  if (!Array.isArray(list)) return;
  for (const d of list) {
    if (!isDesk(d.url)) continue;
    const b = Number.isFinite(d.width) && Number.isFinite(d.height)
      ? { x: d.x, y: d.y, width: d.width, height: d.height } : null;
    openDesk(d.url, b);
  }
}
const mainWindow = () => BrowserWindow.getAllWindows().find(w => !desks.has(w)) || null;

/* ================= one copy at a time =================
   Two instances share one userData directory, so they would open the same
   IndexedDB twice. store.js resolves an onblocked open to null, which silently
   drops the second window into memory-only mode — it looks like it is working
   right up until it loses everything. So the second launch just raises the
   first window instead. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    /* the app window if there is one — with only desk cards out, a second
       launch is the way back in */
    const win = mainWindow() || createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    installMenu();
    createWindow();
    restoreDesks();
    app.on('activate', () => {
      if (!mainWindow()) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
