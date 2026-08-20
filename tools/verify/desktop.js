/* Open Note — tools/verify/desktop.js
   The desktop half of the verification. tools/verify/run.sh drives the app in a
   browser; this drives the shipped Electron shell, and checks the things that
   only exist once there is a window: the custom origin, IndexedDB surviving a
   restart, type set with the network unplugged, and script load order.

   It never reimplements the shell — it requires the real desktop/main.js and
   watches the window that comes out, so a bug in main.js fails the run.

   One phase per process, chosen with PHASE. tools/verify/desktop.sh runs them
   all and adds up the report. Every phase writes to a throwaway userData
   directory, so a run never touches the books in ~/.config/Open Note. */

const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const PHASE = process.env.PHASE || 'boot';
const PROFILE = process.env.PROFILE;
const RACE_APP = process.env.RACE_APP;          // patched copy, for the race phase

if (!PROFILE) { console.error('PROFILE is required'); app.exit(2); }
app.setPath('userData', PROFILE);
app.disableHardwareAcceleration();              // CI has no GPU worth the trouble

const out = [], errs = [];
const ok = (name, cond, detail) =>
  out.push((cond ? 'PASS  ' : 'FAIL  ') + name + (detail === undefined ? '' : '  → ' + detail));
const note = t => out.push('----  ' + t);

function watch(win) {
  win.webContents.on('console-message', ev => {
    if (ev.level === 'error' || ev.level === 3)
      errs.push(String(ev.message).slice(0, 140) +
                '  @' + String(ev.sourceId || '').split('/').pop() + ':' + ev.lineNumber);
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));
/* boot.js is async, and waiting only for `lib` is not enough: it is set the
   moment the library is read, while createBook() and openBook() are still in
   flight. A probe that starts there races the app — it sees an empty library, and
   opening a book on top of the one already opening leaves `pages` inconsistent.
   Wait for a settled app instead: a book open, or the shelf showing. */
const booted = js => js(`new Promise(r=>{let n=0;(function p(){
  var ready = typeof lib!=='undefined' && lib &&
    ((typeof index!=='undefined' && index) ||
     document.getElementById('shelf').classList.contains('open'));
  ready || n++>200 ? r(1) : setTimeout(p,100);
})()})`);

function finish() {
  console.log('@@REPORT@@');
  console.log(out.join('\n'));
  app.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
}

/* ================= the phases ================= */
const PHASES = {

  /* the window, its origin, and the storage the books live in */
  async boot(win, js) {
    await booted(js);
    ok('origin is the app scheme', await js(`location.origin`) === 'opennote://app',
       await js(`location.origin`));
    ok('not running off file://', !(await js(`location.protocol`)).startsWith('file'));
    ok('secure context', await js(`isSecureContext`) === true);
    ok('IndexedDB opened, not the memory fallback', await js(`db().then(d=>!!d)`) === true);
    ok('library round-trips through IndexedDB',
       await js(`kvGet('library').then(v=>v&&Array.isArray(v.books)?v.books.length:-1)`) >= 1);
    ok('flush() is reachable for the save-on-close hook',
       await js(`typeof flush`) === 'function');
    ok('flush() runs to completion', await js(`flush().then(()=>'ok')`) === 'ok');
    /* Ask the item files themselves how many there should be rather than carrying
       a number here — a hard-coded count silently tracks whatever happened to be
       in the tree the day it was written, and fails on any branch that adds or
       removes a feature. This also catches the real failure: a file that loaded
       but never registered. */
    const declared = new Set();
    for (const file of fs.readdirSync(path.join(ROOT, 'js', 'items'))) {
      if (!file.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(ROOT, 'js', 'items', file), 'utf8');
      for (const m of src.matchAll(/defineItem\('([a-z0-9]+)'/g)) declared.add(m[1]);
    }
    const registered = JSON.parse(await js(`JSON.stringify(Object.keys(ITEMS))`));
    const missing = [...declared].filter(t => !registered.includes(t));
    ok('every item file registered its type', missing.length === 0 && declared.size > 0,
       registered.length + ' of ' + declared.size + (missing.length ? ' — missing ' + missing.join(', ') : ''));
    ok('palette built from the registry', await js(`TOOLS.length`) > 20,
       await js(`TOOLS.length`) + ' tools');
    ok('feature CSS installed',
       await js(`document.getElementById('appcss').textContent.length`) > 20000);
    /* desktop.sh compares this across two runs — same id means the books survived
       the process dying, which is the whole point of the custom origin */
    note('IDENT ' + await js(`lib.books[0].id + '@' + lib.books[0].created`));
    ok('no renderer errors', errs.length === 0, errs.join(' | ') || 'clean');
  },

  /* a book on screen, zoomed and paged — where the load-order bug showed up */
  async book(win, js) {
    await booted(js);
    await js(`lib.books.length ? openBook(lib.books[0].id) : createBook('verify').then(openBook)`);
    await wait(1200);
    ok('a page rendered', await js(`!!document.querySelector('.page')`) === true);
    await js(`zoomBy(1.15)`); await wait(300);      // core/zoom.js → syncBmScale()
    await js(`go(1)`); await wait(500);             // core/nav.js  → gotoPage
    await js(`window.dispatchEvent(new Event('resize'))`); await wait(400);
    ok('zoom, page turn and resize leave no errors', errs.length === 0,
       errs.join(' | ') || 'clean');
    /* a bookmark makes syncBmScale actually do something rather than early-return */
    await js(`index.bookmarks=[{id:uid(),pageId:index.pages[0].id,label:'v',c:0,edge:'top',pos:0.3}];
              renderBookmarks();`);
    await wait(400);
    ok('bookmarks render', await js(`!!document.querySelector('#pageHost .bmarks')`) === true);
    await js(`document.querySelector('#pageHost .bmarks').style.setProperty('--scale','0')`);
    await js(`window.dispatchEvent(new Event('resize'))`); await wait(500);
    const scale = await js(`document.querySelector('#pageHost .bmarks').style.getPropertyValue('--scale')`);
    ok('syncBmScale restores the tab scale on resize', parseFloat(scale) > 0, '--scale ' + scale);
  },

  /* the network does not exist: type must still be set in the real faces */
  async offline(win, js) {
    await booted(js);
    await js(`document.fonts.ready`);
    ok('fonts.css declared its faces', await js(`document.fonts.size`) > 0,
       await js(`document.fonts.size`) + ' faces');
    for (const spec of ['700 74px "Barlow Condensed"', '600 15px "Barlow Condensed"',
                        '500 30px "Caveat"', '700 30px "Caveat"',
                        '400 13px "IBM Plex Mono"', '500 13px "IBM Plex Mono"',
                        '400 18px "Newsreader"', '600 18px "Newsreader"',
                        'italic 400 18px "Newsreader"'])
      ok('loads offline: ' + spec,
         await js(`document.fonts.load('${spec}').then(a=>a.length&&a.every(f=>f.status==='loaded'))`) === true);

    /* The fallback here is serif, never monospace: IBM Plex Mono has the same
       advance width as the system mono face, so the two measure identically even
       when the real font is in use, and the check would pass for the wrong reason. */
    for (const fam of ['Barlow Condensed', 'Caveat', 'IBM Plex Mono', 'Newsreader']) {
      const w = await js(`(async()=>{const c=document.createElement('canvas').getContext('2d');
        await document.fonts.load('400 40px "${fam}"');
        c.font='400 40px "${fam}", serif';       const a=c.measureText('Handgloves 0123').width;
        c.font='400 40px "NoSuchFamily___", serif'; const b=c.measureText('Handgloves 0123').width;
        return [+a.toFixed(2), +b.toFixed(2)];})()`);
      ok('real face, not a fallback: ' + fam, Math.abs(w[0] - w[1]) > 0.5,
         w[0] + 'px vs ' + w[1] + 'px');
    }
    ok('all four families present',
       JSON.parse(await js(`JSON.stringify([...new Set([...document.fonts].map(f=>f.family))])`)).length === 4);
    ok('nothing reached the network', BLOCKED.length === 0, BLOCKED.join(' | ') || 'zero http(s)');
  },

  /* Load order is the dependency graph (docs/architecture.md, rule 3). A listener
     registered in core/ must not call something that only arrives in ui/: a window
     being created or shown fires resize while the page is still loading scripts.
     This copy fires one in that exact gap. */
  async race(win, js) {
    await wait(1500);
    ok('no load-order errors while scripts are still arriving', errs.length === 0,
       errs.join(' | ') || 'clean');
  }
};

/* ================= wiring ================= */
const BLOCKED = [];
if (PHASE === 'offline') {
  app.on('ready', () => {
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      /* only the real network is cut — the app's own reads go through net.fetch
         inside protocol.handle and are file:// underneath */
      if (/^(https?|wss?):/i.test(d.url)) { BLOCKED.push(d.url.slice(0, 80)); return cb({ cancel: true }); }
      cb({});
    });
  });
}

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s);
  try { await PHASES[PHASE](win, js); }
  catch (e) { ok('phase ' + PHASE + ' completed', false, e.message); }
  finish();
}

if (PHASE === 'race') {
  /* a patched copy, loaded straight off the disk — the shell plays no part here */
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1200, height: 800 });
    watch(win);
    await win.loadFile(path.join(RACE_APP, 'index.html'));
    await run(win);
  });
} else {
  app.on('browser-window-created', (e, win) => {
    watch(win);
    win.webContents.once('did-finish-load', () => run(win));
  });
  require(path.join(ROOT, 'desktop', 'main.js'));
}
