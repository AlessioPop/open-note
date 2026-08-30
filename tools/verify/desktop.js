/* Open Note — tools/verify/desktop.js
   The desktop half of the verification. tools/verify/run.sh drives the app in a
   browser; this drives the shipped Electron shell, and checks the things that
   only exist once there is a window: the custom origin, IndexedDB surviving a
   restart, type set with the network unplugged, and script load order.

   It never reimplements the shell — it requires the real desktop/main.js and
   watches the window that comes out, so a bug in main.js fails the run.

   One phase per process, chosen with PHASE. tools/verify/desktop.sh runs them
   all and adds up the report. Every phase writes to a throwaway userData
   directory, so a run never touches the notes in ~/.config/Open Note. */

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
/* TRACE=1 writes each step to stderr as it happens — for a phase that never
   gets as far as printing its report */
const trace = t => { if (process.env.TRACE) process.stderr.write('TRACE ' + t + '\n'); };
app.on('window-all-closed', () => trace('window-all-closed'));
app.on('before-quit', () => trace('before-quit'));
app.on('will-quit', () => trace('will-quit'));

function watch(win) {
  win.webContents.on('console-message', ev => {
    if (ev.level === 'error' || ev.level === 3)
      errs.push(String(ev.message).slice(0, 140) +
                '  @' + String(ev.sourceId || '').split('/').pop() + ':' + ev.lineNumber);
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));
/* boot.js is async, and waiting only for `lib` is not enough: it is set the
   moment the library is read, while createNote() and openNote() are still in
   flight. A probe that starts there races the app — it sees an empty library, and
   opening a note on top of the one already opening leaves `pages` inconsistent.
   Wait for a settled app instead: a note open, or the shelf showing. */
const booted = js => js(`new Promise(r=>{let n=0;(function p(){
  var ready = typeof lib!=='undefined' && lib &&
    ((typeof index!=='undefined' && index) ||
     document.getElementById('shelf').classList.contains('open'));
  ready || n++>200 ? r(1) : setTimeout(p,100);
})()})`);

function finish() {
  trace('finish');
  console.log('@@REPORT@@');
  console.log(out.join('\n'));
  app.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
}

/* ================= the phases ================= */
const PHASES = {

  /* the window, its origin, and the storage the notes live in */
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
    const items = path.join(ROOT, 'js', 'items');
    for (const shelf of fs.readdirSync(items)) {             // one folder per palette shelf
      const dir = path.join(items, shelf);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.js')) continue;
        const src = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const m of src.matchAll(/defineItem\('([a-z0-9]+)'/g)) declared.add(m[1]);
      }
    }
    const registered = JSON.parse(await js(`JSON.stringify(Object.keys(ITEMS))`));
    const missing = [...declared].filter(t => !registered.includes(t));
    ok('every item file registered its type', missing.length === 0 && declared.size > 0,
       registered.length + ' of ' + declared.size + (missing.length ? ' — missing ' + missing.join(', ') : ''));
    ok('palette built from the registry', await js(`TOOLS.length`) > 20,
       await js(`TOOLS.length`) + ' tools');
    ok('feature CSS installed',
       await js(`document.getElementById('appcss').textContent.length`) > 20000);
    /* desktop.sh compares this across two runs — same id means the notes survived
       the process dying, which is the whole point of the custom origin */
    note('IDENT ' + await js(`lib.books[0].id + '@' + lib.books[0].created`));
    ok('no renderer errors', errs.length === 0, errs.join(' | ') || 'clean');
  },

  /* a note on screen, zoomed and grown — where the load-order bug showed up */
  async note(win, js) {
    await booted(js);
    await js(`lib.books.length ? openNote(lib.books[0].id) : createNote('verify').then(openNote)`);
    await wait(1200);
    ok('a sheet rendered', await js(`!!document.querySelector('.page')`) === true);
    /* Chromium makes a prose Enter a <div>. The next list Enter must stay
       inside it, or the block's virtual newline puts the caret before the
       marker's space and neither Tab direction recognizes the bullet. */
    const listKeys = await js(`(() => {
      const tx = document.createElement('div');
      tx.className = 'txt'; tx.contentEditable = 'true';
      tx.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap';
      tx.innerHTML = 'prose<div>- one</div>';
      document.body.appendChild(tx); tx.focus();
      const text = () => mathFlat(tx).s;
      const put = off => {
        const p = mathFlatPos(tx, off), r = document.createRange(), s = getSelection();
        r.setStart(p[0], p[1]); r.collapse(true); s.removeAllRanges(); s.addRange(r);
      };
      const key = (shift) => !tx.dispatchEvent(new KeyboardEvent('keydown',
        { key:'Tab', shiftKey:!!shift, bubbles:true, cancelable:true }));
      put(text().lastIndexOf('one') + 3);
      tx.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
      const afterEnter = text(), emptyTab = key(false), afterEmptyTab = text();
      const emptyBack = key(true), afterEmptyBack = text();
      document.execCommand('insertText', false, 'two');
      const afterType = text(), tab = key(false), afterTab = text(), back = key(true), afterBack = text();
      tx.remove(); return { afterEnter, emptyTab, afterEmptyTab, emptyBack, afterEmptyBack,
                            afterType, tab, afterTab, back, afterBack };
    })()`);
    ok('a list begun after prose indents and outdents',
       listKeys.afterEnter === 'prose\n- one\n- \n' && listKeys.emptyTab &&
       listKeys.afterEmptyTab === 'prose\n- one\n\t- \n' && listKeys.emptyBack &&
       listKeys.afterEmptyBack === listKeys.afterEnter &&
       listKeys.afterType === 'prose\n- one\n- two\n' && listKeys.tab &&
       listKeys.afterTab === 'prose\n- one\n\t- two\n' && listKeys.back &&
       listKeys.afterBack === listKeys.afterType, JSON.stringify(listKeys));
    const groupClip = await js(`(async () => {
      const srcIdx = { pgmax:16000, settings:{pgw:2000,pgh:1000},
                       layers:[{id:'src-layer',name:'Base'}] };
      const pic = { id:'pic-old', type:'image', x:10, y:20, w:15, z:5,
                    lay:'src-layer', src:'data:image/png;base64,cGljdHVyZQ==' };
      const note = { id:'note-old', type:'note', x:40, y:50, w:10, z:2,
                     lay:'src-layer', html:'kept' };
      const payload = selectionPayload({ items:[pic,note] }, [pic,note], srcIdx);
      const dstIdx = { pgmax:16000, settings:{pgw:1000,pgh:500}, curLayer:'dst-layer',
                       layers:[{id:'dst-layer',name:'Base'}] };
      const dst = { id:'clip-test', items:[] };
      const out = await pasteSelection(payload, dst, dstIdx, {x:5,y:7}, false);
      return out.items.map(it => ({ id:it.id, type:it.type, x:it.x, y:it.y, w:it.w,
                                    src:it.src || '', lay:it.lay }));
    })()`);
    const groupPic = groupClip.find(it => it.type === 'image');
    const groupNote = groupClip.find(it => it.type === 'note');
    ok('a Chromium group paste keeps image data, scale and relative positions',
       groupPic && groupNote && groupPic.id !== 'pic-old' && groupNote.id !== 'note-old' &&
       groupPic.src === 'data:image/png;base64,cGljdHVyZQ==' &&
       Math.abs(groupPic.x - 5) < .001 && Math.abs(groupPic.y - 7) < .001 &&
       Math.abs(groupPic.w - 30) < .001 && Math.abs(groupNote.x - 65) < .001 &&
       Math.abs(groupNote.y - 67) < .001 && Math.abs(groupNote.w - 20) < .001 &&
       groupPic.lay === 'dst-layer' && groupNote.lay === 'dst-layer', JSON.stringify(groupClip));
    ok('the platform seam is filled in',
       await js(`PLAT.name === 'electron' && typeof PLAT.saveFile === 'function'`) === true,
       await js(`PLAT.name`));
    await js(`zoomBy(1.15)`); await wait(300);
    await js(`growSheet('r')`); await wait(600);
    await js(`window.dispatchEvent(new Event('resize'))`); await wait(400);
    ok('zoom, growing the sheet and resize leave no errors', errs.length === 0,
       errs.join(' | ') || 'clean');
    const w = await js(`pgW()`);
    ok('the sheet really grew', w > 1980, 'width ' + w);
    await js(`undo()`); await wait(600);
    ok('and one undo puts it back', await js(`pgW()`) === 1980, await js(`pgW()`));
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

  /* a deck of flip cards taken to the desk: its own frameless window, above the
     rest, still there when the app window has gone — and remembered */
  async desk(win, js) {
    trace('desk: waiting for boot');
    await booted(js);
    trace('desk: booted');
    await js(`lib.books.length ? openNote(lib.books[0].id) : createNote('verify').then(openNote)`);
    await wait(1200);
    const made = await js(`(async () => {
      const page = sheet();
      const it = { id: 'deskdeck', type: 'deck', x: 6, y: 6, w: 54, rot: 0, z: 1, lay: curLayerId(),
        cap: 'Desk deck', i: 0, side: 0, look: 'night', queue: null, hist: [], cards: [newCard(), newCard()] };
      it.cards[0].qb[0].html = 'first'; it.cards[1].qb[0].html = 'second';
      page.items.push(it); await render();
      return deckDesk(it, page);
    })()`);
    ok('deckDesk() opened a window', made === true);
    trace('desk: deckDesk returned ' + made);
    await wait(1500);
    const all = BrowserWindow.getAllWindows();
    const desk = all.find(w => w !== win);
    ok('a second window exists', !!desk, all.length + ' windows');
    if (!desk) return;
    ok('it is desk.html on the app origin', desk.webContents.getURL().startsWith('opennote://app/desk.html?id=deskdeck'),
       desk.webContents.getURL());
    ok('frameless, floating above the rest', desk.isAlwaysOnTop() === true && !desk.isMenuBarVisible());
    const djs = s => desk.webContents.executeJavaScript(s);
    await wait(800);
    ok('the loader became the deck', await djs(`!!document.querySelector('.deck.study[data-deck="deskdeck"]')`) === true);
    ok('wearing its look', await djs(`document.querySelector('.deck').dataset.look`) === 'night');
    ok('two cards, the first up', await djs(`document.querySelector('.dpos').textContent`) === '1 / 2');
    ok('the deck bar is what the window is held by',
       await djs(`getComputedStyle(document.querySelector('.deck.study .dbar')).webkitAppRegion || getComputedStyle(document.querySelector('.deck.study .dbar')).appRegion`) === 'drag');
    ok('the store holds the document', await js(`kvGet('desk:deskdeck').then(d => typeof d === 'string' && d.length > 5000)`) === true);
    ok('the card is remembered next to the notes', (() => {
      try { const l = JSON.parse(fs.readFileSync(path.join(PROFILE, 'desk.json'), 'utf8')); return l.length === 1 && l[0].url.includes('deskdeck'); }
      catch (e) { return false; }
    })());
    /* the app window goes; the card stays and still answers */
    trace('desk: closing the app window');
    win.close();
    await wait(1500);
    trace('desk: after close, windows=' + BrowserWindow.getAllWindows().length);
    ok('closing the app window leaves the card', BrowserWindow.getAllWindows().length === 1 && !desk.isDestroyed());
    await djs(`document.querySelector('[data-a=flip]').click()`);
    ok('…and it still turns', await djs(`document.querySelector('.dslot.on .dcard').classList.contains('flipped')`) === true);
    ok('no renderer errors', errs.length === 0, errs.join(' | ') || 'clean');
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
  let ran = false;                               // the phase runs in the first window only — a desk card is a second
  app.on('browser-window-created', (e, win) => {
    watch(win);
    win.webContents.once('did-finish-load', () => { if (!ran) { ran = true; run(win); } });
  });
  require(path.join(ROOT, 'desktop', 'main.js'));
}
