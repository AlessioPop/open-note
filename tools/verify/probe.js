/* Verification probe. Appended after the app's own scripts.
   Script-level let/const in the app are reachable here as bare identifiers
   only — never as window.<name>. */
(function () {
  var out = [];
  var ok = function (name, cond, extra) {
    out.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '   << ' + (extra || '')));
  };
  var send = function () {
    try { fetch('/report', { method: 'POST', body: out.join('\n') }); } catch (e) {}
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function waitFor(fn, ms) {
    var t0 = Date.now();
    return new Promise(function (res, rej) {
      (function poll() {
        var v;
        try { v = fn(); } catch (e) { v = null; }
        if (v) return res(v);
        if (Date.now() - t0 > (ms || 15000)) return rej(new Error('timeout'));
        setTimeout(poll, 60);
      })();
    });
  }

  var Q = function (s) { return document.querySelector(s); };
  var QA = function (s) { return [].slice.call(document.querySelectorAll(s)); };
  var byType = function (t) { return Q('#pageHost .item[data-type="' + t + '"]'); };

  async function stage(name, fn) {
    try { await fn(); }
    catch (e) { ok(name + ' (stage threw)', false, e.message + ' | ' + (e.stack || '').split('\n')[0]); }
  }

  (async function run() {
    /* ---- nothing blew up while the scripts loaded ---- */
    await stage('script load', async function () {
      var errs = window.__errs || [];
      ok('no load-time errors', errs.length === 0, errs.join(' ;; '));
    });

    /* ---- boot ---- */
    await stage('boot', async function () {
      await waitFor(function () { return typeof index !== 'undefined' && index; }, 20000);
      ok('index exists', !!index);
      ok('library exists', typeof lib !== 'undefined' && !!lib && Array.isArray(lib.books));
      /* a fresh profile has no notes -> straight into the first one */
      await waitFor(function () { return Q('#pageHost .page'); }, 20000);
      ok('a sheet rendered', !!Q('#pageHost .page'));
      ok('sheet has a surface', !!Q('#pageHost .page .surface'));
      ok('a fresh note is empty', QA('#pageHost .item').length === 0,
        'found ' + QA('#pageHost .item').length);
      ok('a fresh note is one sheet', index.pages.length === 1, index.pages.length);
      ok('a fresh note is three pages across', pgW() === SHEET_W && pgH() === SHEET_H,
        pgW() + ' x ' + pgH());
      ok('no page furniture: no folio', !Q('#pageHost .folio'));
      ok('no page furniture: no slug', !Q('#pageHost .slug'));
      ok('no page furniture: no page nav', !Q('#prev') && !Q('#next') && !Q('#addPage'));
      ok('four rails to pull', QA('#pageHost .prail').length === 4,
        QA('#pageHost .prail').length + ' rails');
      ok('it says how big it is', !!Q('#szTag') && /1980/.test(Q('#szTag').textContent),
        Q('#szTag') && Q('#szTag').textContent);
      /* The page-unit helpers must be no-ops on a sheet of the BASE size — that
         is what "the same physical size on any paper" means, and every default
         width, margin and nib in the app is written against it. On the real
         sheet, three times as wide, they must scale by exactly a third. */
      var sw = index.settings.pgw, sh = index.settings.pgh;
      index.settings.pgw = PG_BASE; index.settings.pgh = 884;
      ok('page units: a base sheet is the base', pgK() === 1, 'pgK=' + pgK());
      ok('page units: 92 units is the old 14%', Math.abs(pctW(92) - 14) < 0.1, pctW(92));
      ok('page units: 35 units is the old 4%', Math.abs(pctH(35) - 4) < 0.1, pctH(35));
      ok('page units: the smallest item is still 6%', minItemW() === 6, minItemW());
      index.settings.pgw = sw; index.settings.pgh = sh;
      ok('page units: a sheet three times as wide scales by a third',
        Math.abs(pgK() - PG_BASE / SHEET_W) < 1e-9 &&
        Math.abs(pctW(92) * 3 - 100 * 92 / PG_BASE) < 1e-9,
        'pgK=' + pgK() + ' pctW(92)=' + pctW(92));
      ok('page units: zoom still stops at 0.4', zMin() === 0.4, zMin());
      /* a note opens fitted to the desk; the zoom checks below want a known start */
      setZoom(1);

      /* the view is written once a frame, not once an event */
      var t0 = book.style.transform;
      panX += 40; applyView(); panX += 40; applyView(); panX += 40; applyView();
      ok('view: a burst of pans writes nothing yet', book.style.transform === t0, book.style.transform);
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      ok('view: one frame later it is where it should be',
        book.style.transform.indexOf('translate(' + panX + 'px') === 0, book.style.transform);
      panX = 0; applyView();

      /* a turning wheel scales the sheet; the layout zoom follows when it stops */
      var z0 = zoom, twoFrames = function () {
        return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      };
      zoomBy(1.2);
      ok('zoom: the gesture itself does not relayout', zoom === z0, 'zoom went to ' + zoom);
      ok('zoom: it scales the sheet instead', Math.abs(liveZoom() - z0 * 1.2) < 1e-9, liveZoom());
      await twoFrames();
      ok('zoom: the scale is on the compositor', /scale\(/.test(book.style.transform), book.style.transform);
      ok('zoom: the readout follows the gesture', Q('#zoomTag').textContent === '120%',
        Q('#zoomTag').textContent);
      commitZoom();
      ok('zoom: committing makes it real', Math.abs(zoom - z0 * 1.2) < 1e-9, zoom);
      ok('zoom: the commit is not eased — it would read as a spring-back',
        book.classList.contains('nolerp'));
      await twoFrames();
      ok('zoom: and takes the scale off again', !/scale\(/.test(book.style.transform),
        book.style.transform);
      setZoom(1); await twoFrames();

      /* zooming holds the point you aimed at, wherever the sheet is standing */
      panX = 180; panY = -90; applyView(); await twoFrames();
      var surf0 = Q('#pageHost .surface');
      var aim = { x: 520, y: 330 };
      var under = function () {
        var r = surf0.getBoundingClientRect();
        return { x: (aim.x - r.left) / r.width, y: (aim.y - r.top) / r.height };
      };
      var was = under();
      zoomBy(1.6, aim.x, aim.y); await twoFrames();
      var now = under();
      ok('zoom: the point under the pointer stays under it',
        Math.abs(now.x - was.x) < 0.004 && Math.abs(now.y - was.y) < 0.004,
        was.x.toFixed(4) + ',' + was.y.toFixed(4) + ' -> ' + now.x.toFixed(4) + ',' + now.y.toFixed(4));
      commitZoom(); await twoFrames();
      ok('zoom: and stays there once it is committed',
        Math.abs(under().x - was.x) < 0.004 && Math.abs(under().y - was.y) < 0.004,
        JSON.stringify(under()));
      panX = panY = 0; setZoom(1); await twoFrames();

      /* A note starts WITHOUT the grain — it is rasterised over the whole sheet,
         and a sheet is far bigger than a page. The switch brings it back. */
      ok('grain: a fresh note has none', document.body.classList.contains('nograin') &&
        index.settings.grain === false);
      ok('grain: the grain layer really is gone',
        getComputedStyle(Q('#pageHost .grain')).display === 'none');
      Q('#grainSwitch').click();
      ok('grain: the switch turns it on', !document.body.classList.contains('nograin') &&
        index.settings.grain === true);
      ok('grain: and it is really drawn',
        getComputedStyle(Q('#pageHost .grain')).display !== 'none');
      Q('#grainSwitch').click();
      ok('grain: and off again', document.body.classList.contains('nograin'));
    });

    /* ---- every add-menu kind actually adds what it says ---- */
    await stage('addItem', async function () {
      var page = sheet();
      page.items = [];
      await render();
      var kinds = [
        ['title', 'text'], ['body', 'text'], ['hand', 'text'], ['mono', 'text'],
        ['marker', 'text'], ['check', 'check'], ['code', 'code'], ['table', 'table'], ['note', 'note'], ['folder', 'folder'],
        ['deck', 'deck'], ['plot', 'plot'], ['matrix', 'matrix'], ['vecbox', 'vecbox'],
        ['cube', 'solid'], ['sphere', 'solid'], ['torus', 'solid'],
        ['square', 'solid'], ['circle', 'solid'],
        ['pie', 'chart'], ['donut', 'chart'], ['bars', 'chart'], ['stack', 'chart'],
        ['washi', 'washi'], ['sticker', 'sticker'], ['molecule', 'molecule'], ['ptable', 'ptable'], ['nuchart', 'nuchart']
      ];
      for (var i = 0; i < kinds.length; i++) {
        var kind = kinds[i][0], want = kinds[i][1];
        var before = page.items.length;
        addItem(kind, { x: 10, y: 10 }, page);
        await sleep(90);
        var added = page.items[page.items.length - 1];
        ok('addItem(' + kind + ') adds one item', page.items.length === before + 1,
          'went from ' + before + ' to ' + page.items.length);
        ok('addItem(' + kind + ') has type ' + want, added && added.type === want,
          'got type ' + (added && added.type));
        if (kind === 'cube' || kind === 'sphere' || kind === 'torus' ||
            kind === 'square' || kind === 'circle')
          ok('addItem(' + kind + ') keeps its shape', added && added.kind === kind,
            'got kind ' + (added && added.kind));
        if (want === 'text' && kind !== 'title')
          ok('addItem(' + kind + ') style is ' + kind, added && added.st === kind,
            'got st ' + (added && added.st));
      }
      /* setMath / deckEdit may have been switched on by the adds above */
      setMath(false);
      await render();
    });

    /* ---- the palette: drawn from the registry, searchable, and it adds ---- */
    await stage('palette', async function () {
      var page = sheet();
      page.items = []; await render();
      /* the registry and the panel agree in both directions */
      var kinds = TOOLS.map(function (t) { return t.kind; });
      ok('palette: every tile is a registered add-kind',
        kinds.every(function (k) { return ADD_KINDS[k]; }),
        kinds.filter(function (k) { return !ADD_KINDS[k]; }).join(','));
      ok('palette: every add-kind has a tile',
        Object.keys(ADD_KINDS).every(function (k) { return kinds.indexOf(k) >= 0; }),
        Object.keys(ADD_KINDS).filter(function (k) { return kinds.indexOf(k) < 0; }).join(','));
      openQuickMenu(320, 180);
      ok('palette: opens', Q('#palette').classList.contains('open'));
      ok('palette: seven shelves', QA('#palTabs .ptab').length === 7,
        QA('#palTabs .ptab').length + ' tabs');
      setShelf('write');
      var tiles = QA('#palGrid .ptile');
      ok('palette: the write shelf holds its tools',
        tiles.length === TOOLS.filter(function (t) { return t.cat === 'write'; }).length,
        tiles.length + ' tiles');
      ok('palette: every tile wears an icon and a name', tiles.every(function (t) {
        return t.querySelector('svg.ic') && t.querySelector('.lb').textContent; }));
      ok('palette: the thumb sits under the open shelf',
        Q('#palTabs .ptab.on') && Q('#palTabs .ptab.on').dataset.cat === 'write');
      /* search looks across every shelf and puts label matches first */
      Q('#palSeek').value = 'table';
      Q('#palSeek').dispatchEvent(new Event('input'));
      ok('palette: search finds across shelves', !!Q('#palGrid .ptile[data-add="table"]'));
      ok('palette: best match first', QA('#palGrid .ptile')[0].dataset.add === 'table',
        QA('#palGrid .ptile')[0] && QA('#palGrid .ptile')[0].dataset.add);
      Q('#palSeek').value = 'zzzz';
      Q('#palSeek').dispatchEvent(new Event('input'));
      ok('palette: a miss says so', !!Q('#palGrid .pnone'));
      /* the one sheet action lives in its foot */
      ok('palette: the sheet action is in the foot', !!Q('#palette #clearPage'));
      /* a real click on a tile adds the real thing, and the panel goes */
      setShelf('write');
      var before = page.items.length;
      Q('#palGrid .ptile[data-add="note"]').click();
      await sleep(120);
      ok('palette: clicking a tile adds the item', page.items.length === before + 1 &&
        page.items[page.items.length - 1].type === 'note',
        'items ' + before + ' -> ' + page.items.length);
      await waitFor(function () { return !Q('#palette').classList.contains('open'); }, 3000);
      ok('palette: and the panel has gone', !Q('#palette').classList.contains('open'));
      page.items = []; await render();
    });

    /* ---- the code cell: tokens, languages, schemes, and the bar ---- */
    await stage('code cell', async function () {
      var page = sheet();
      page.items = []; await render();
      addItem('code', { x: 8, y: 8 }, page);
      await sleep(120);
      var it = page.items[0];
      ok('code: lands as python on the theme scheme',
        it && it.type === 'code' && it.lang === 'python' && it.sch === 'auto',
        JSON.stringify(it || null));
      var el = byType('code');
      ok('code: cell built', !!el && !!el.querySelector('.cbx') && !!el.querySelector('.ced'));
      ok('code: the bar holds a language picker and a copy button',
        !!el.querySelector('select.clang') && !!el.querySelector('.ccopy'));
      var ced = el.querySelector('.ced');
      var tokOf = function (word) {
        var sp = [].slice.call(el.querySelectorAll('.ced span')).find(function (s) { return s.textContent === word; });
        return sp && sp.className;
      };
      /* a python snippet colours the way the editor would */
      it.code = 'import os\n\ndef greet(name):\n    # say hello\n    print("hi \\n" + name, 2)\n';
      cdRender(ced, it);
      ok('code: import is control flow', tokOf('import') === 'tk-fl', tokOf('import'));
      ok('code: def is a keyword', tokOf('def') === 'tk-kw', tokOf('def'));
      ok('code: greet is a function', tokOf('greet') === 'tk-fn', tokOf('greet'));
      ok('code: name is a plain name', tokOf('name') === 'tk-vr', tokOf('name'));
      ok('code: print is a call', tokOf('print') === 'tk-fn', tokOf('print'));
      ok('code: 2 is a number', tokOf('2') === 'tk-nm', tokOf('2'));
      ok('code: the comment is a comment', tokOf('# say hello') === 'tk-cm', tokOf('# say hello'));
      ok('code: the string is a string', tokOf('"hi ') === 'tk-st',
        [].slice.call(el.querySelectorAll('.ced .tk-st')).map(function (s) { return s.textContent; }).join('|'));
      ok('code: the escape stands out in it', tokOf('\\n') === 'tk-es', tokOf('\\n'));
      /* the picker really reparses — the same words mean different things in rust */
      var sel = el.querySelector('select.clang');
      sel.value = 'rust';
      sel.dispatchEvent(new Event('change'));
      await sleep(30);
      ok('code: the picker switches the language', it.lang === 'rust', it.lang);
      it.code = 'fn main() {\n    let mut x: i32 = 5;\n    println!("x = {}", x);\n}\n';
      cdRender(ced, it);
      ok('code: fn let mut are rust keywords', ['fn', 'let', 'mut'].every(function (w) { return tokOf(w) === 'tk-kw'; }));
      ok('code: i32 is a type', tokOf('i32') === 'tk-ty', tokOf('i32'));
      ok('code: println! is a macro call', tokOf('println!') === 'tk-fn', tokOf('println!'));
      /* ◑ steps the schemes; the theme scheme measures the paper */
      var bx = el.querySelector('.cbx');
      ok('code: starts on the theme scheme, un-deepened on light paper',
        bx.dataset.sch === 'auto' && !bx.classList.contains('cdk'));
      var btn = [].slice.call(el.querySelectorAll('.tools button')).find(function (b) { return b.textContent === '◑'; });
      ok('code: the scheme button is on the toolbar', !!btn);
      btn.click();
      ok('code: ◑ steps onto Dark', it.sch === 'dark' && bx.dataset.sch === 'dark');
      var bg = getComputedStyle(el.querySelector('.cwin')).backgroundColor;
      ok('code: Dark paints the VS Code ground', bg === 'rgb(30, 30, 30)', bg);
      var guard = 0;
      while (it.sch !== 'auto' && guard++ < 8) btn.click();
      ok('code: the wheel comes back round to Theme', it.sch === 'auto');
      index.theme = 'dark'; applyTheme();
      await sleep(120);
      ok('code: a dark paper deepens the theme scheme', bx.classList.contains('cdk'));
      index.theme = 'graph'; applyTheme();
      await sleep(120);
      ok('code: light paper lifts it back', !bx.classList.contains('cdk'));
      /* the copy button must at least not throw with the clipboard walled off */
      var threw = false;
      try { el.querySelector('.ccopy').click(); } catch (e) { threw = true; }
      ok('code: the copy button clicks without throwing', !threw);
      /* the editor: typing recolours under the caret */
      cdEdit(el, it);
      ok('code: double-click arms the editor', el.classList.contains('editing') && ced.isContentEditable);
      ced.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, 'let x = 1;');
      await sleep(30);
      ok('code: typing recompiles the tokens live',
        it.code.indexOf('let x = 1;') === 0 && !!ced.querySelector('.tk-kw'), JSON.stringify(it.code));
      el.classList.remove('editing'); ced.contentEditable = 'false';   // headless fires no blur
      /* print and export take the static path: colours and a label, no controls */
      var st = buildPage(page, false, {});
      var sc = st.querySelector('.item[data-type=code]');
      ok('code: prints its colours', !!sc && sc.querySelectorAll('.ced span').length >= 3,
        sc && sc.querySelectorAll('.ced span').length);
      ok('code: print names the language as a label, not a picker',
        !!sc.querySelector('span.clang') && !sc.querySelector('select'));
      ok('code: print carries no copy button', !sc.querySelector('.ccopy'));
      /* typing must not grow the cell — the editor's padding <br> must never
         read back as a line of its own */
      it.lang = 'python';
      cdEdit(el, it);
      ced.focus();
      document.execCommand('selectAll'); document.execCommand('delete');
      document.execCommand('insertText', false, 'a');
      var h1 = el.querySelector('.cwin').offsetHeight;
      document.execCommand('insertText', false, 'b');
      document.execCommand('insertText', false, 'c');
      await sleep(30);
      ok('code: three keystrokes are three characters', it.code === 'abc', JSON.stringify(it.code));
      ok('code: and the cell has not grown', el.querySelector('.cwin').offsetHeight === h1,
        h1 + ' -> ' + el.querySelector('.cwin').offsetHeight);
      /* brackets close themselves, type over, and delete as a pair */
      var press = function (key) {
        ced.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
      };
      press('(');
      ok('code: ( brings its close along', it.code === 'abc()', JSON.stringify(it.code));
      press(')');
      ok('code: ) types over the close already there', it.code === 'abc()', JSON.stringify(it.code));
      cdSetCaret(ced, 4);
      press('Backspace');
      await sleep(30);
      ok('code: backspace between an empty pair takes both', it.code === 'abc', JSON.stringify(it.code));
      document.execCommand('selectAll'); document.execCommand('delete');
      document.execCommand('insertText', false, 'x = ');
      press('"');
      ok('code: a quote closes itself after a space', it.code === 'x = ""', JSON.stringify(it.code));
      press('"');
      ok('code: a second quote steps out instead of doubling', it.code === 'x = ""', JSON.stringify(it.code));
      document.execCommand('selectAll'); document.execCommand('delete');
      document.execCommand('insertText', false, 'd = ');
      press('{');
      press('Enter');
      await sleep(30);
      ok('code: Enter between braces opens the block out', it.code === 'd = {\n    \n}',
        JSON.stringify(it.code));
      el.classList.remove('editing'); ced.contentEditable = 'false';   // headless fires no blur
      /* a long cell clips to a band with its own scrollbar; ⊞ shows it all */
      var many = [];
      for (var li = 0; li < 30; li++) many.push('line' + li);
      it.code = many.join('\n');
      cdRender(ced, it);
      ok('code: a long one clips to a band', el.querySelector('.cbx').classList.contains('clip'));
      var cw = el.querySelector('.cwin');
      ok('code: and the band scrolls', cw.scrollHeight > cw.clientHeight,
        cw.scrollHeight + ' vs ' + cw.clientHeight);
      var tallBtn = [].slice.call(el.querySelectorAll('.tools button'))
        .find(function (b) { return b.textContent === '⊞'; });
      ok('code: the expand button is on the toolbar', !!tallBtn);
      tallBtn.click();
      ok('code: ⊞ shows the whole thing', it.tall === true &&
        !el.querySelector('.cbx').classList.contains('clip'));
      tallBtn.click();
      ok('code: and ⊟ clips it back', !it.tall && el.querySelector('.cbx').classList.contains('clip'));
      /* it files into a folder, wears its terminal glyph, and opens highlighted */
      ok('code: a code cell may be filed', canFile({ type: 'code' }));
      var rec = { id: uid(), type: 'code', code: 'print(1)\n', lang: 'python', sch: 'auto', w: 40 };
      var fold = { id: uid(), type: 'folder', x: 40, y: 40, w: 13, rot: 0, z: 60,
                   lay: curLayerId(), cap: 'Folder', kids: [rec] };
      page.items.push(fold);
      await render();
      openFolder(fold, page);
      ok('code: the folder shows its terminal glyph', !!Q('#fold .ftile .ficon svg .cgw'));
      ok('code: the tile is named after the language',
        /Python snippet/.test(Q('#fold .ftile .fnm2') && Q('#fold .ftile .fnm2').textContent),
        Q('#fold .ftile .fnm2') && Q('#fold .ftile .fnm2').textContent);
      Q('#fold .ftile .ficon').click();
      await sleep(60);
      ok('code: clicking it opens the highlighted viewer',
        Q('#fview').classList.contains('on') && !!Q('#fview .cvpre .tk-fn'));
      ok('code: the viewer offers copy', !!Q('#fview .fbtns button[data-a=copy]'));
      closeViewer();
      closeFolder();
      page.items = []; await render();
    });

    /* ---- the shapes carry their measurements: radii, sides, sweep ---- */
    await stage('solid measurements', async function () {
      var page = sheet();
      page.items = []; await render();
      /* a torus knows its two radii and how far round it goes */
      addItem('torus', { x: 12, y: 12 }, page); await sleep(90);
      var it = page.items[0], el = byType('solid');
      var P = solidP(it);
      ok('torus: born full, outer 100 inner 40',
        P.out === 1 && Math.abs(P.in - 0.4) < 1e-9 && P.sweep === 360, JSON.stringify(P));
      var d0 = el.querySelector('svg.msolid').innerHTML;
      P.sweep = 270; paintSolid(el, it);
      var d1 = el.querySelector('svg.msolid').innerHTML;
      ok('torus: sweeping it back changes the drawing', d0 !== d1);
      ok('torus: a part ring has its cut faces', d1.length > d0.length * 0.5 && d1.indexOf('sct') >= 0);
      ok('torus: no NaN in a swept mesh', d1.indexOf('NaN') < 0);
      P.out = 0.8; P.in = 0.79; paintSolid(el, it);   /* the def pins inner under outer */
      ok('torus: inner pinned under outer draws clean',
        el.querySelector('svg.msolid').innerHTML.indexOf('NaN') < 0);
      /* the ✎ panel: rows from the registry of measurements, sliders that bite */
      select(it.id);
      var pbtn = el.querySelector('.tools button[title^="Its measurements"]');
      ok('solid: has a measurements button', !!pbtn);
      pbtn.click();
      ok('props: opens', Q('#props').classList.contains('open'));
      ok('props: torus shows two radii and a sweep',
        QA('#props .prrow').length === 3 && QA('#props .prdial').length === 1,
        QA('#props .prrow').length + ' rows');
      var sl = Q('#props .prrow input[type=range]');
      sl.value = 60; sl.dispatchEvent(new Event('input'));
      ok('props: the slider moves the shape', Math.abs(solidP(it).out - 0.6) < 1e-9, solidP(it).out);
      ok('props: and the inner radius kept inside it', solidP(it).in <= solidP(it).out - 0.06 + 1e-9);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(function () { return !Q('#props').classList.contains('open'); }, 3000);
      ok('props: esc puts it away', !Q('#props').classList.contains('open'));
      /* a sphere starts face on, and sweeps down to a slice */
      addItem('sphere', { x: 40, y: 12 }, page); await sleep(90);
      var sp = page.items[1];
      ok('sphere: starts face on', sp.yaw === 0 && sp.pitch === 0, sp.yaw + ',' + sp.pitch);
      solidP(sp).sweep = 180;
      var spEl = QA('#pageHost .item[data-type="solid"]')[1];
      paintSolid(spEl, sp);
      ok('sphere: half of one draws clean',
        spEl.querySelector('svg.msolid').innerHTML.indexOf('NaN') < 0);
      /* the flat pair: face on, cornered, and the circle takes an arc */
      addItem('square', { x: 12, y: 44 }, page); await sleep(90);
      var sq = page.items[2], sqEl = QA('#pageHost .item[data-type="solid"]')[2];
      ok('square: lies flat', !!sqEl.querySelector('.solid.flat'));
      ok('square: wears four corner handles', sqEl.querySelectorAll('.shnd').length === 4);
      var h = sqEl.querySelector('.shnd[data-cx="1"][data-cy="1"]');
      var sr = sqEl.querySelector('svg.msolid').getBoundingClientRect();
      var sx0 = solidP(sq).sx;
      h.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 9,
        clientX: sr.left + sr.width * 0.75, clientY: sr.top + sr.height * 0.6, bubbles: true }));
      h.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9,
        clientX: sr.left + sr.width * 0.9, clientY: sr.top + sr.height * 0.62, bubbles: true }));
      h.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true }));
      ok('square: pulling a corner reshapes it',
        Math.abs(solidP(sq).sx - sx0) > 0.05 && Math.abs(solidP(sq).sx - solidP(sq).sy) > 0.05,
        sx0 + ' -> ' + solidP(sq).sx + ' × ' + solidP(sq).sy);
      addItem('circle', { x: 44, y: 44 }, page); await sleep(90);
      var ci = page.items[3], ciEl = QA('#pageHost .item[data-type="solid"]')[3];
      solidP(ci).sweep = 180; solidP(ci).sx = 1.1; paintSolid(ciEl, ci);
      ok('circle: half an ellipse draws clean',
        ciEl.querySelector('svg.msolid').innerHTML.indexOf('NaN') < 0);
      /* nothing anywhere in the battery comes out NaN */
      var bad = '';
      var probeKinds = ['sphere', 'torus', 'circle'];
      for (var ki = 0; ki < probeKinds.length; ki++) {
        for (var sw = 0; sw < 6; sw++) {
          it.kind = probeKinds[ki]; it.p = null;
          solidP(it).sweep = [15, 90, 180, 270, 355, 360][sw];
          paintSolid(el, it);
          if (el.querySelector('svg.msolid').innerHTML.indexOf('NaN') >= 0)
            bad += probeKinds[ki] + '@' + solidP(it).sweep + ' ';
        }
      }
      ok('solids: no NaN at any sweep of any shape', bad === '', bad);
      setMath(false);
      page.items = []; await render();
    });

    /* ---- matrices of any size: reshape, invert, eigen, fold, detach ---- */
    await stage('nm cards', async function () {
      var page = sheet();
      page.items = []; await render();
      var byTitle = function (id, re) {
        return QA('#pageHost .item[data-id="' + id + '"] .tools button').filter(function (b) {
          return re.test(b.title); })[0];
      };
      var byTxt = function (id, s) {
        return QA('#pageHost .item[data-id="' + id + '"] .tools button').filter(function (b) {
          return b.textContent === s; })[0];
      };
      var mkIt = function (extra) {
        var b = { id: uid(), x: 8, y: 8, rot: 0, z: 1, lay: curLayerId(), fs: 16, res: null };
        for (var k in extra) b[k] = extra[k];
        return b;
      };

      /* the engine, straight out */
      var E = mtxEig(MTX(2, 2, [2, 1, 1, 2]));
      var ls = E.vals.map(function (v) { return v.re; }).sort(function (a, b) { return a - b; });
      ok('eig: [2 1;1 2] gives 1 and 3', Math.abs(ls[0] - 1) < 1e-8 && Math.abs(ls[1] - 3) < 1e-8,
        JSON.stringify(ls));
      var e3 = E.vals.filter(function (v) { return Math.abs(v.re - 3) < 1e-8; })[0];
      ok('eig: λ=3 keeps [1, 1]', e3 && e3.vec && Math.abs(e3.vec[0] - 1) < 1e-6 &&
        Math.abs(e3.vec[1] - 1) < 1e-6, JSON.stringify(e3 && e3.vec));
      var A3 = [4, 1, 2, 0, 3, -1, 0, 0, 1];
      var E3 = mtxEig(MTX(3, 3, A3));
      var resid = 0;
      E3.vals.forEach(function (v) {
        if (Math.abs(v.im) > 1e-9 || !v.vec) return;
        for (var i = 0; i < 3; i++) {
          var s = 0;
          for (var j = 0; j < 3; j++) s += A3[i * 3 + j] * v.vec[j];
          resid = Math.max(resid, Math.abs(s - v.re * v.vec[i]));
        }
      });
      ok('eig: A·v = λ·v on a 3×3', E3.vals.every(function (v) { return v.vec; }) && resid < 1e-6,
        'resid ' + resid + ' ' + JSON.stringify(E3.vals));
      var R2 = mtxEig(MTX(2, 2, [0, -1, 1, 0]));
      ok('eig: a rotation comes back ± i', R2.vals.length === 2 && R2.vals.every(function (v) {
        return Math.abs(v.re) < 1e-9 && Math.abs(Math.abs(v.im) - 1) < 1e-9; }),
        JSON.stringify(R2.vals));
      var A4 = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, -2, 0, 0, 2, 1];
      var E4 = mtxEig(MTX(4, 4, A4));
      var sum4 = E4.vals.reduce(function (s, v) { return s + v.re; }, 0);
      var prod4 = E4.vals.reduce(function (s, v) {
        return s * (Math.abs(v.im) > 1e-9 ? Math.hypot(v.re, v.im) : Math.abs(v.re)); }, 1);
      ok('eig: two complex pairs hold the trace', Math.abs(sum4 - 2) < 1e-6, 'sum ' + sum4);
      ok('eig: …and the determinant', Math.abs(prod4 - 5) < 1e-5, 'prod ' + prod4);
      ok('det: 4×4 by elimination', Math.abs(mtxDet(MTX(4, 4, A4)) - 5) < 1e-9,
        String(mtxDet(MTX(4, 4, A4))));
      var I2 = mtxInv(MTX(2, 2, [1, 2, 3, 4]));
      ok('inv: [1 2;3 4]⁻¹ is right', I2 && Math.abs(I2.a[0] + 2) < 1e-9 &&
        Math.abs(I2.a[1] - 1) < 1e-9 && Math.abs(I2.a[3] + 0.5) < 1e-9,
        JSON.stringify(I2 && I2.a));
      ok('inv: a singular matrix says no', mtxInv(MTX(2, 2, [1, 2, 2, 4])) === null);
      ok('mul: sizes must meet', mtxMul(MTX(2, 3, [1, 2, 3, 4, 5, 6]), MTX(2, 2, [1, 0, 0, 1])) === null);

      /* labels walk with the numbers */
      ok('labels: M → M⁻¹ → M', labInv('M') === 'M⁻¹' && labInv('M⁻¹') === 'M',
        labInv('M') + ' / ' + labInv('M⁻¹'));
      ok('labels: Mᵀ undoes itself', labT('M') === 'Mᵀ' && labT('Mᵀ') === 'M');
      ok('labels: squaring M³ says M⁶', labPow('M', 2) === 'M²' && labPow('M³', 2) === 'M⁶',
        labPow('M', 2) + ' / ' + labPow('M³', 2));
      ok('labels: the inverse of M² is M⁻²', labInv('M²') === 'M⁻²', labInv('M²'));

      /* a card grows through the ✎ panel */
      addItem('matrix', { x: 10, y: 10 }, page); await sleep(120);
      var mit = page.items[page.items.length - 1];
      ok('matrix: starts 2×2',
        QA('#pageHost .item[data-id="' + mit.id + '"] input.mcell').length === 4);
      var pen = byTxt(mit.id, '✎');
      ok('matrix: wears a ✎', !!pen);
      pen.click(); await sleep(140);
      ok('matrix: the panel opens with steppers and a power button',
        Q('#props').classList.contains('open') && QA('#props .prsteps').length === 3 &&
        !!Q('#props .prbtn .prgo'), QA('#props .prsteps').length + ' steppers');
      QA('#props .prsteps')[0].querySelector('.princ').click(); await sleep(60);
      QA('#props .prsteps')[1].querySelector('.princ').click(); await sleep(60);
      var mel = Q('#pageHost .item[data-id="' + mit.id + '"]');
      ok('matrix: stepped up to 3×3', matDims(mit).r === 3 && matDims(mit).c === 3 &&
        mel.querySelectorAll('input.mcell').length === 9,
        matDims(mit).r + '×' + matDims(mit).c + ', ' + mel.querySelectorAll('input.mcell').length + ' cells');
      ok('matrix: grew as an identity', matNums(mit).join(',') === '1,0,0,0,1,0,0,0,1',
        matNums(mit).join(','));
      closeProps(); await sleep(80);

      /* determinant between bars, eigen rows under the card */
      mit.m = [2, 0, 0, 0, 3, 0, 0, 0, 4]; mit.src = mit.m.map(String);
      repaintCard(mel, mit, page);
      byTitle(mit.id, /Determinant/).click(); await sleep(60);
      ok('det: written between bars', !!mel.querySelector('.mtxres .mtxgrid.det'),
        mel.querySelector('.mtxres').innerHTML.slice(0, 90));
      ok('det: comes to 24', mel.querySelector('.mtxres .rrow > b') &&
        mel.querySelector('.mtxres .rrow > b').textContent === '24',
        mel.querySelector('.mtxres').textContent);
      byTitle(mit.id, /Eigenvalues/).click(); await sleep(60);
      ok('eig: three rows, each with its vector',
        mel.querySelectorAll('.mtxres .rrow').length === 3 &&
        mel.querySelectorAll('.mtxres .mtxgrid').length === 3,
        mel.querySelectorAll('.mtxres .rrow').length + ' rows');
      ok('eig: λ₁ = 4 leads', mel.querySelector('.mtxres').textContent.indexOf('λ₁ = 4') >= 0,
        mel.querySelector('.mtxres').textContent.slice(0, 60));

      /* the inverse and back — the label does not stutter */
      byTitle(mit.id, /inverse/).click(); await sleep(250);
      var inv1 = page.items[page.items.length - 1];
      ok('inv: the new card is M⁻¹', inv1.type === 'matrix' && inv1.lab === 'M⁻¹' &&
        inv1.r === 3 && inv1.c === 3, inv1.lab);
      byTitle(inv1.id, /inverse/).click(); await sleep(250);
      var inv2 = page.items[page.items.length - 1];
      ok('inv: inverting it again is just M', inv2.lab === 'M', inv2.lab);
      ok('inv: and the numbers came home', matNums(inv2).join(',') === '2,0,0,0,3,0,0,0,4',
        matNums(inv2).join(','));

      /* transpose swaps the shape; a strip refuses square-only questions */
      page.items = []; await render();
      var a23 = mkIt({ type: 'matrix', lab: 'A', r: 2, c: 3,
        m: [1, 2, 3, 4, 5, 6], src: ['1', '2', '3', '4', '5', '6'] });
      page.items.push(a23); await render();
      byTitle(a23.id, /transpose/).click(); await sleep(250);
      var at = page.items[page.items.length - 1];
      ok('tr: 2×3 → 3×2 called Aᵀ', at.r === 3 && at.c === 2 && at.lab === 'Aᵀ',
        at.lab + ' ' + at.r + '×' + at.c);
      ok('tr: columns became rows', at.m.join(',') === '1,4,2,5,3,6', at.m.join(','));
      byTitle(a23.id, /Determinant/).click(); await sleep(60);
      ok('det: a 2×3 politely refuses',
        Q('#pageHost .item[data-id="' + a23.id + '"] .mtxres').textContent.indexOf('square') >= 0,
        Q('#pageHost .item[data-id="' + a23.id + '"] .mtxres').textContent);

      /* powers from the panel */
      page.items = []; await render();
      var sh = mkIt({ type: 'matrix', lab: 'M', r: 2, c: 2, m: [1, 1, 0, 1], src: ['1', '1', '0', '1'] });
      page.items.push(sh); await render();
      byTxt(sh.id, '✎').click(); await sleep(140);
      QA('#props .prsteps')[2].querySelector('.princ').click(); await sleep(60);
      Q('#props .prbtn .prgo').click(); await sleep(250);
      var cube = page.items[page.items.length - 1];
      ok('pow: the shear cubed is M³ = [1 3;0 1]', cube.lab === 'M³' &&
        cube.m.join(',') === '1,3,0,1', cube.lab + ' ' + cube.m.join(','));
      closeProps(); await sleep(80);

      /* products: rectangular sizes meet, wrong ones refuse and say so */
      page.items = []; await render();
      var A = mkIt({ type: 'matrix', lab: 'A', r: 2, c: 3,
        m: [1, 2, 3, 4, 5, 6], src: ['1', '2', '3', '4', '5', '6'] });
      var B = mkIt({ type: 'matrix', lab: 'B', r: 3, c: 2, x: 30,
        m: [7, 8, 9, 10, 11, 12], src: ['7', '8', '9', '10', '11', '12'] });
      page.items.push(A, B); await render();
      ok('product: 2×3 · 3×2 merges', makeProduct(page, A, B) === true);
      await sleep(300);
      var cit = page.items.filter(function (x) { return x.type === 'calc'; })[0];
      ok('product: a calc of the right shape', !!cit && cit.op === 'mm' &&
        cit.ar === 2 && cit.ac === 3 && cit.bc === 2,
        cit && (cit.ar + '×' + cit.ac + '·' + cit.bc));
      ok('product: the numbers are right', calcResult(cit).join(',') === '58,64,139,154',
        calcResult(cit).join(','));
      ok('product: the two cards were taken in', page.items.length === 1, page.items.length + ' items');
      var P = mkIt({ type: 'matrix', lab: 'P', r: 2, c: 3, m: [1, 0, 0, 0, 1, 0], src: ['1', '0', '0', '0', '1', '0'] });
      var Q23 = mkIt({ type: 'matrix', lab: 'Q', r: 2, c: 3, m: [1, 0, 0, 0, 1, 0], src: ['1', '0', '0', '0', '1', '0'] });
      page.items.push(P, Q23); await render();
      var n0 = page.items.length;
      ok('product: 2×3 · 2×3 has none', productOf(P, Q23) === null && makeProduct(page, P, Q23) === false &&
        page.items.length === n0, page.items.length + ' of ' + n0);

      /* fold to just the answer — and keep multiplying with it */
      var cel = Q('#pageHost .item[data-id="' + cit.id + '"]');
      byTxt(cit.id, '⊟').click(); await sleep(100);
      cel = Q('#pageHost .item[data-id="' + cit.id + '"]');
      ok('fold: only the answer shows', cit.fold === 1 &&
        cel.querySelectorAll('.mtxgrid').length === 1 &&
        cel.querySelector('.clab').textContent === 'AB',
        cel.querySelectorAll('.mtxgrid').length + ' grids, "' +
        (cel.querySelector('.clab') || {}).textContent + '"');
      var id2 = mkIt({ type: 'matrix', lab: 'C', r: 2, c: 2, m: [1, 0, 0, 1], src: ['1', '0', '0', '1'], x: 50 });
      page.items.push(id2); await render();
      ok('fold: the folded answer multiplies on', makeProduct(page, cit, id2) === true);
      await sleep(300);
      var c2 = page.items.filter(function (x) { return x.type === 'calc'; })[0];
      ok('chain: the labels follow the answer', !!c2 && c2.al === 'AB' && c2.bl === 'C',
        c2 && (c2.al + ' · ' + c2.bl));
      ok('chain: the result rides along', calcResult(c2).join(',') === '58,64,139,154',
        calcResult(c2).join(','));

      /* ✂ takes a product apart again */
      byTxt(c2.id, '✂').click(); await sleep(300);
      ok('detach: the calc is gone', page.items.filter(function (x) { return x.type === 'calc'; }).length === 0);
      var back = page.items.filter(function (x) { return x.type === 'matrix' && (x.lab === 'AB' || x.lab === 'C'); });
      var ab = back.filter(function (x) { return x.lab === 'AB'; })[0];
      ok('detach: both cards are back', back.length === 2, back.map(function (x) { return x.lab; }).join(','));
      ok('detach: AB kept its numbers and shape', !!ab && ab.r === 2 && ab.c === 2 &&
        ab.m.join(',') === '58,64,139,154', ab && (ab.r + '×' + ab.c + ' ' + ab.m.join(',')));

      /* a vector grows too, and knows what fits a plane */
      page.items = []; await render();
      addItem('vecbox', { x: 12, y: 12 }, page); await sleep(120);
      var vit = page.items[page.items.length - 1];
      byTxt(vit.id, '✎').click(); await sleep(140);
      ok('vector: one stepper', QA('#props .prsteps').length === 1 && !Q('#props .prbtn'),
        QA('#props .prsteps').length + ' steppers');
      QA('#props .prsteps')[0].querySelector('.princ').click(); await sleep(60);
      var vel = Q('#pageHost .item[data-id="' + vit.id + '"]');
      ok('vector: three deep now', vecDim(vit) === 3 && vel.querySelectorAll('input.mcell').length === 3,
        vecDim(vit) + ', ' + vel.querySelectorAll('input.mcell').length + ' cells');
      closeProps(); await sleep(80);
      vit.v = [1, 2, 2]; vit.src = ['1', '2', '2'];
      repaintCard(vel, vit, page);
      byTxt(vit.id, '|v|').click(); await sleep(60);
      ok('vector: |v| over three parts', vel.querySelector('.mtxres').textContent.indexOf('= 3') >= 0,
        vel.querySelector('.mtxres').textContent);
      byTxt(vit.id, '⊕').click(); await sleep(60);
      ok('vector: a 3-vector will not draw in a plane',
        vel.querySelector('.mtxres').textContent.indexOf('plane') >= 0,
        vel.querySelector('.mtxres').textContent);

      /* quiet cards: no paper until the card is picked */
      select(null); await sleep(250);
      var cs = getComputedStyle(vel.querySelector('.mtx'));
      ok('quiet: no paper till chosen', cs.backgroundColor === 'rgba(0, 0, 0, 0)' &&
        cs.boxShadow === 'none', cs.backgroundColor + ' | ' + cs.boxShadow);
      select(vit.id); await sleep(300);
      cs = getComputedStyle(vel.querySelector('.mtx'));
      ok('quiet: choosing it brings the paper', cs.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        cs.boxShadow !== 'none', cs.backgroundColor + ' | ' + cs.boxShadow);
      select(null);

      /* books from before sizes existed still read as they were */
      page.items = [
        mkIt({ type: 'matrix', lab: 'M', m: [1, 2, 3, 4], src: ['1', '2', '3', '4'] }),
        mkIt({ type: 'calc', op: 'mv', al: 'M', am: [1, 0, 0, 2], asrc: ['1', '0', '0', '2'],
               bl: 'v', bm: [4, 5], bsrc: ['4', '5'], c: '#2b7d8c', s: 'solid', x: 40 })
      ];
      await render();
      ok('old books: a bare 2×2 still reads',
        QA('#pageHost .item[data-type="matrix"] input.mcell').length === 4);
      var oc = page.items[1];
      ok('old books: a bare calc still multiplies', calcResult(oc).join(',') === '4,10',
        calcResult(oc).join(','));
      ok('old books: and still draws whole',
        QA('#pageHost .item[data-type="calc"] .mtxgrid').length === 3);
      setMath(false);
      page.items = []; await render();
    });

    /* ---- charts: the pie and its family ---- */
    await stage('charts', async function () {
      var page = sheet();
      page.items = [];
      var it = {
        id: uid(), x: 10, y: 10, w: 34, rot: 0, z: 1, lay: curLayerId(),
        type: 'chart', kind: 'pie', look: 'flat', pal: 'crisp', lbl: 'pct',
        a0: -90, cap: '',
        rows: [{ lab: 'Code', v: 12 }, { lab: 'Art', v: 8 }, { lab: 'Music', v: 5 }]
      };
      page.items = [it];
      await render();
      var el = byType('chart');
      ok('chart: builds', !!el && !!el.querySelector('svg.chsvg'));

      /* the slices wear the validated palette, in slot order, on the light set */
      var sl = QA('#pageHost .item[data-type="chart"] path.chslice');
      ok('chart: one slice per positive row', sl.length === 3, sl.length + ' slices');
      ok('chart: slot 1 is crisp light blue', sl.length &&
        sl[0].getAttribute('fill') === '#2a78d6', sl.length && sl[0].getAttribute('fill'));
      ok('chart: the seam between slices is the paper',
        sl.length && getComputedStyle(sl[0]).stroke !== 'none');
      ok('chart: every slice explains itself', sl.every(function (p) {
        return p.querySelector('title') && /%/.test(p.querySelector('title').textContent); }));

      /* labels sit inside while the slices are wide enough… */
      ok('chart: three labels inside', QA('#pageHost .chsvg text.chpl').length === 3,
        QA('#pageHost .chsvg text.chpl').length);
      ok('chart: no leaders yet', QA('#pageHost .chsvg path.chlead').length === 0);
      ok('chart: label ink is not the series colour',
        QA('#pageHost .chsvg text.chpl').every(function (t) {
          var f = getComputedStyle(t).fill;
          return f === 'rgb(255, 255, 255)' || f === 'rgb(32, 33, 28)';
        }));

      /* …and a slice too small for its number gets the elbow line out */
      it.rows = [{ lab: 'Engine', v: 60 }, { lab: 'Art', v: 37 },
                 { lab: 'A very long story', v: 1.6 }, { lab: 'Web', v: 1.4 }];
      await render();
      el = byType('chart');
      var leads = QA('#pageHost .chsvg path.chlead');
      ok('chart: small slices lead out', leads.length === 2, leads.length + ' leaders');
      ok('chart: a leader has its corner', leads.length &&
        (leads[0].getAttribute('d').match(/L/g) || []).length >= 1, leads.length && leads[0].getAttribute('d'));
      ok('chart: leader labels name the slice',
        QA('#pageHost .chsvg text.chml').some(function (t) { return /Engine|story|Web/.test(t.textContent); }));
      var ys = QA('#pageHost .chsvg text.chml').map(function (t) { return +t.getAttribute('y'); }).sort(function (a, b) { return a - b; });
      ok('chart: leader labels keep apart', ys.every(function (y, i) { return !i || y - ys[i - 1] >= 40; }),
        ys.join(','));

      /* ⌖ beside: the wide slices wear their names just off the rim, the
         slivers still go out on stalks */
      it.lmode = 'beside';
      await render();
      ok('chart(beside): names sit beside the slices',
        QA('#pageHost .chsvg text.chml').filter(function (t) { return /Engine|Art/.test(t.textContent); }).length === 2,
        QA('#pageHost .chsvg text.chml').map(function (t) { return t.textContent; }).join('|'));
      ok('chart(beside): the slivers still lead out', QA('#pageHost .chsvg path.chlead').length === 2);
      ok('chart(beside): shares still inside the wide slices',
        QA('#pageHost .chsvg text.chpl').length === 2, QA('#pageHost .chsvg text.chpl').length);
      it.lmode = 'stalk';
      await render();
      ok('chart(stalk): everything leads out', QA('#pageHost .chsvg path.chlead').length === 4);
      it.lmode = 'auto';

      /* a dragged label remembers its offset, grows a leader out of its
         slice, and a double-click sends it home */
      it.rows = [{ lab: 'Code', v: 12 }, { lab: 'Art', v: 8 }, { lab: 'Music', v: 5 }];
      it.lp = { '0': [300, -260] };
      await render();
      var moved = Q('#pageHost .chsvg text[data-lk="0"]');
      ok('chart(drag): the label keeps its offset', moved &&
        Math.abs(+moved.getAttribute('x') - (+moved.dataset.ax + 300)) < 0.6 &&
        Math.abs(+moved.getAttribute('y') - (+moved.dataset.ay - 260)) < 0.6,
        moved && (moved.dataset.ax + '+300 vs ' + moved.getAttribute('x')));
      ok('chart(drag): out of its slice it grows a leader',
        !!Q('#pageHost .chsvg path.chlead[data-lk="0"]'));
      ok('chart(drag): and turns to ink', moved && moved.getAttribute('class') === 'chml',
        moved && moved.getAttribute('class'));
      it.lp = { '0': [40, 20] };               /* still inside its own wide slice */
      await render();
      moved = Q('#pageHost .chsvg text[data-lk="0"]');
      ok('chart(drag): back inside it sheds the leader',
        !Q('#pageHost .chsvg path.chlead[data-lk="0"]') && /chpl/.test(moved.getAttribute('class')),
        moved && moved.getAttribute('class'));
      moved.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await sleep(60);
      ok('chart(drag): a double-click sends it home', !it.lp['0'],
        JSON.stringify(it.lp));

      /* the ✎ label knobs: size rides the elements, the face rides the svg */
      it.lfs = 1.5;
      await render();
      var t0 = Q('#pageHost .chsvg text.chpl');
      ok('chart(labels): the slider scales them', t0 && t0.getAttribute('font-size') === '84',
        t0 && t0.getAttribute('font-size'));
      it.lfont = 'hand';
      await render();
      ok('chart(labels): the face rides the svg',
        Q('#pageHost svg.chsvg').classList.contains('chf-hand'));
      it.lfs = 1; it.lfont = 'mono'; it.lp = {};
      it.rows = [{ lab: 'Engine', v: 60 }, { lab: 'Art', v: 37 },
                 { lab: 'A very long story', v: 1.6 }, { lab: 'Web', v: 1.4 }];

      /* every look draws, and none of them writes NaN into a path */
      var looks = ['flat', 'donut', 'tilt', 'sketch'];
      for (var li = 0; li < looks.length; li++) {
        it.look = looks[li];
        await render();
        var paths = QA('#pageHost .item[data-type="chart"] svg.chsvg path');
        ok('chart(' + looks[li] + '): draws', paths.length > 0, 'paths=' + paths.length);
        ok('chart(' + looks[li] + '): no NaN in any path', !paths.some(function (p) {
          return /NaN/.test(p.getAttribute('d') || ''); }));
      }
      it.look = 'donut';
      await render();
      ok('chart(donut): total in the hole',
        Q('#pageHost .chsvg text.chtot') && Q('#pageHost .chsvg text.chtot').textContent === '100',
        Q('#pageHost .chsvg text.chtot') && Q('#pageHost .chsvg text.chtot').textContent);
      it.look = 'tilt'; await render();
      ok('chart(tilt): the rim has walls', QA('#pageHost .chsvg path.chwall').length > 0);
      it.look = 'sketch'; await render();
      ok('chart(sketch): hatch patterns exist', QA('#pageHost .chsvg pattern').length > 0);
      ok('chart(sketch): wobbled slices', QA('#pageHost .chsvg path.chsk').length === 4);
      it.look = 'flat';

      /* every fixed palette holds its slots; the ramps step with the rows */
      ok('chart: warm keeps six slots', chartPalMax('warm') === 6, chartPalMax('warm'));
      ok('chart: crisp holds ten', chartPalMax('crisp') === 10, chartPalMax('crisp'));
      it.rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (v, i) { return { lab: 'r' + i, v: v }; });
      it.pal = 'crisp';
      await render();
      var f10 = QA('#pageHost .chsvg path.chslice').map(function (p) { return p.getAttribute('fill'); });
      ok('chart: ten slices, ten colours', f10.length === 10 && new Set(f10).size === 10, f10.join(','));
      ok('chart: ten is the lot', !byType('chart').querySelector('.chadd'));
      it.rows = [1, 2, 3, 4, 5, 6].map(function (v, i) { return { lab: 'r' + i, v: v }; });
      var pals = ['crisp', 'vivid', 'soft', 'warm', 'tonal', 'ink'];
      for (var pi = 0; pi < pals.length; pi++) {
        it.pal = pals[pi];
        await render();
        var fills = QA('#pageHost .chsvg path.chslice').map(function (p) { return p.getAttribute('fill'); });
        ok('chart(' + pals[pi] + '): six distinct colours',
          fills.length === 6 && new Set(fills).size === 6, fills.join(','));
      }
      it.pal = 'crisp';

      /* the legend is the editor: rows match, typing moves the picture */
      it.rows = [{ lab: 'Code', v: 12 }, { lab: 'Art', v: 8 }, { lab: 'Music', v: 0 }];
      await render();
      el = byType('chart');
      ok('chart: a legend row per row of data', el.querySelectorAll('.chrow').length === 3);
      ok('chart: a zero row is dimmed and unsliced',
        el.querySelectorAll('.chrow.nil').length === 1 &&
        el.querySelectorAll('path.chslice').length === 2);
      var inp = el.querySelectorAll('.chrow')[2].querySelector('.chval');
      inp.value = '10';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(60);
      ok('chart: typing a value grows a slice',
        el.querySelectorAll('path.chslice').length === 3 && it.rows[2].v === 10,
        'slices=' + el.querySelectorAll('path.chslice').length + ' v=' + it.rows[2].v);
      ok('chart: the shares follow the keys',
        el.querySelectorAll('.chrow')[2].querySelector('.chpct').textContent === '33%',
        el.querySelectorAll('.chrow')[2].querySelector('.chpct').textContent);
      ok('chart: the + row is there under the cap', !!el.querySelector('.chadd'));
      it.pal = 'warm';
      it.rows = [1, 2, 3, 4, 5, 6].map(function (v, i) { return { lab: 'r' + i, v: v }; });
      await render();
      el = byType('chart');
      ok('chart: a full palette closes the + row', !el.querySelector('.chadd'));
      it.pal = 'crisp';

      /* the palette hears the theme change — dark paper takes the dark set */
      it.rows = [{ lab: 'Code', v: 12 }, { lab: 'Art', v: 8 }];
      await render();
      index.theme = 'dark';
      applyTheme();
      await sleep(140);
      var f0 = Q('#pageHost .item[data-type="chart"] path.chslice');
      ok('chart: dark paper takes the dark set', f0 && f0.getAttribute('fill') === '#3987e5',
        f0 && f0.getAttribute('fill'));
      index.theme = 'graph';
      applyTheme();
      await sleep(140);
      f0 = Q('#pageHost .item[data-type="chart"] path.chslice');
      ok('chart: and light paper takes it back', f0 && f0.getAttribute('fill') === '#2a78d6',
        f0 && f0.getAttribute('fill'));

      /* the plain family: bars are one series in one colour, a stack shares a bar */
      it.kind = 'bars'; it.lbl = 'val';
      it.rows = [{ lab: 'Mon', v: 6 }, { lab: 'Tue', v: 9 }, { lab: 'Wed', v: 4 }];
      await render();
      el = byType('chart');
      var bf = QA('#pageHost .item[data-type="chart"] path.chslice').map(function (p) { return p.getAttribute('fill'); });
      ok('bars: three bars', bf.length === 3, bf.length);
      ok('bars: one series, one colour', new Set(bf).size === 1, bf.join(','));
      ok('bars: values at the tips', QA('#pageHost .chsvg text.chbv').length === 3);
      ok('bars: names in the gutter', QA('#pageHost .chsvg text.chbl').length === 3);
      it.kind = 'stack'; it.lbl = 'pct';
      await render();
      var seg = QA('#pageHost .item[data-type="chart"] path.chslice');
      ok('stack: a segment per row', seg.length === 3, seg.length);
      ok('stack: distinct colours again', new Set(seg.map(function (p) { return p.getAttribute('fill'); })).size === 3);
      page.items = []; await render();
    });

    /* ---- nothing tilts on its way onto the sheet ---- */
    await stage('straight', async function () {
      var cpage = sheet();
      var keep = cpage.items.slice();
      cpage.items = [];
      var kinds = ['note', 'washi', 'sticker', 'deck', 'body', 'table'], tilted = '';
      for (var i = 0; i < kinds.length; i++) {
        addItem(kinds[i], { x: 30, y: 30 }, cpage); await sleep(70);
        var added = cpage.items[cpage.items.length - 1];
        if (added.rot !== 0) tilted += kinds[i] + '@' + added.rot + ' ';
      }
      ok('straight: nothing tilts on its way in', tilted === '', tilted);
      setMath(false);
      cpage.items = keep;
      await render();
    });

    /* ---- each type renders a live DOM node with its own body ---- */
    await stage('render live', async function () {
      var page = sheet();
      page.items = [];
      var base = function (extra) {
        var b = { id: uid(), x: 8, y: 8, w: 30, rot: 0, z: 1, lay: curLayerId() };
        for (var k in extra) b[k] = extra[k];
        return b;
      };
      page.items = [
        base({ type: 'text', st: 'body', html: 'hello', fs: 19 }),
        base({ type: 'check', html: '- [ ] a\n- [x] b', fs: 18 }),
        base({ type: 'note', html: 'note', color: '', fs: 20 }),
        base({
          type: 'table', fs: 15, head: 1, ts: 'lines', fmt: {},
          rows: [['a', 'b', 'c'], ['1', '2', '=A2+B2']],
          cw: [1 / 3, 1 / 3, 1 / 3], al: ['l', 'l', 'l'], cap: ''
        }),
        base({ type: 'image', src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', cap: 'cap', frame: 'tape' }),
        base({ type: 'video', vkind: 'yt', vid: 'abc123', cap: '' }),
        base({ type: 'model', name: 'x.obj', tris: 12, frame: 'win', cap: '' }),
        base({ type: 'file', name: 'a.pdf', cap: 'a.pdf' }),
        base({ type: 'folder', cap: 'Folder', kids: [] }),
        base({ type: 'deck', cards: [newCard()], i: 0, side: 0, cap: '' }),
        base({
          type: 'plot', xmin: -5, xmax: 5, ymin: -3.4, ymax: 3.4, grid: 'solid',
          axes: 1, bshow: 0, basis: [1, 0, 0, 1], cap: '',
          fns: [{ expr: 'x^2', c: '#c33', s: 'solid' }],
          vecs: [{ x: 2, y: 1, ox: 0, oy: 0, c: '#3c3', s: 'solid', lab: 'v' }]
        }),
        base({ type: 'matrix', lab: 'M', m: [1, 2, 3, 4], src: ['1', '2', '3', '4'], fs: 22 }),
        base({ type: 'vecbox', lab: 'v', v: [2, 1], src: ['2', '1'], c: '#3c3', s: 'solid', fs: 22 }),
        base({ type: 'solid', kind: 'cube', yaw: 0.6, pitch: 0.4, scale: 1, look: 0, fade: 0, c: '#333' }),
        base({
          type: 'chart', kind: 'pie', look: 'flat', pal: 'crisp', lbl: 'pct', a0: -90, cap: '',
          rows: [{ lab: 'Code', v: 12 }, { lab: 'Art', v: 8 }, { lab: 'Music', v: 5 }]
        }),
        base({ type: 'washi', pat: 0 }),
        base({ type: 'sticker', kind: 'star', ci: 0 })
      ];
      await render();
      var types = ['text', 'check', 'table', 'note', 'image', 'video', 'model', 'file', 'folder',
        'deck', 'plot', 'matrix', 'vecbox', 'solid', 'chart', 'washi', 'sticker'];
      types.forEach(function (t) {
        var n = byType(t);
        ok('live: ' + t + ' node exists', !!n);
        if (n) ok('live: ' + t + ' has a body', !!n.querySelector('.body,.deck'),
          n.innerHTML.slice(0, 60));
        if (n) ok('live: ' + t + ' has a toolbar', !!n.querySelector('.tools button'));
      });
      /* the details that regressed before */
      var pl = byType('plot');
      if (pl) {
        ok('plot: curve drawn', !!pl.querySelector('path.mfn'), 'no path.mfn');
        var vec = pl.querySelector('.mvec');
        ok('plot: vector drawn', !!vec);
        var head = pl.querySelector('polygon.mvec, .mvec polygon, polygon');
        if (head) ok('plot: arrowhead is filled',
          getComputedStyle(head).fill !== 'none', getComputedStyle(head).fill);
      }
      var so = byType('solid');
      if (so) {
        ok('solid: has svg', !!so.querySelector('svg.msolid'));
        ok('solid: no figure box around it', !so.querySelector('figure'));
        var d = so.querySelectorAll('path');
        ok('solid: drew some lines', d.length > 0, 'paths=' + d.length);
        var nan = [].slice.call(d).some(function (p) {
          return /NaN/.test(p.getAttribute('d') || '');
        });
        ok('solid: no NaN in any path', !nan);
      }
      var ck = byType('check');
      if (ck) ok('check: two tasks', ck.querySelectorAll('.ckrow').length === 2,
        'rows=' + ck.querySelectorAll('.ckrow').length);
    });

    /* ---- what everything actually LOOKS like ----
       Moving a rule to another file changes where it sits in the cascade, so
       this records the computed style of every painted thing and the run is
       diffed against the one before it. */
    await stage('css fingerprint', async function () {
      var PROPS = ['display', 'position', 'background-color', 'color', 'font-family',
        'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
        'text-align', 'text-transform', 'text-decoration-line', 'padding', 'margin',
        'border-width', 'border-style', 'border-color', 'border-radius', 'box-shadow',
        'opacity', 'z-index', 'overflow', 'aspect-ratio', 'transform', 'fill', 'stroke',
        'stroke-width', 'white-space', 'flex', 'gap', 'align-items', 'justify-content',
        'min-height', 'max-width', 'inset', 'visibility', 'background-image'];
      var SEL = [
        '.item', '.item .tools', '.item .rs', '.item .rot', '.body',
        '.txt', '.st-title', '.st-body', '.st-hand', '.st-mono', '.st-marker',
        '.note', '.ck', '.ckrow', '.ckrow .box', '.ck .plainln',
        '.tbl', '.tbox', '.tgrid', '.tc', '.tc.hd', '.th', '.rh', '.tcorner', '.tadd',
        'figure', 'figure img', 'figure figcaption', '.tape',
        '.vid', '.vwrap', '.shield', '.shield b',
        '.mdl', '.mwrap', '.wbar', '.wpane', '.mph',
        '.shortcut', '.ficon', '.fbadge', '.fold',
        '.deck', '.plot', '.mplotbox', '.mleg',
        '.chfig', '.chbox', 'svg.chsvg', '.chleg', '.chrow', '.chsw', '.chpct',
        '.solid', '.sowrap', '.washi', '.stk', '.stk svg',
        '.lgw', '.lgsvg', '.lgw .lgb', '.lgw .lgs', '.lgw .lgdot', '.lgw .lghit',
        'svg.lgwires', 'svg.lgwires .lgl',
        '.mcard', '.mgrid', '.mcell', '.mlab',
        '#stage', '#book', '.page', '.surface', '.grain', '.prail'
      ];
      var lines = [];
      SEL.forEach(function (s) {
        var n;
        try { n = document.querySelector(s); } catch (e) { n = null; }
        if (!n) { lines.push('CSSFP ' + s + ' = ABSENT'); return; }
        var cs = getComputedStyle(n);
        var v = PROPS.map(function (p) { return p + ':' + cs.getPropertyValue(p); }).join(';');
        lines.push('CSSFP ' + s + ' = ' + v);
      });
      /* the sheet itself, so a rule that vanished entirely is caught */
      var css = document.getElementById('appcss').textContent;
      lines.push('CSSFP __rulecount = ' + (css.match(/\{/g) || []).length);
      out.push(lines.join('\n'));
      ok('css fingerprint taken', lines.length > 40, lines.length + ' lines');
    });

    /* ---- maths / LaTeX ---- */
    await stage('latex', async function () {
      var d = document.createElement('div');
      d.textContent = '$$\\frac{1}{2}$$';
      mathify(d);
      ok('latex: compiles to MathML', !!d.querySelector('math'), d.innerHTML.slice(0, 80));
      ok('latex: keeps its source', !!d.querySelector('[data-tex]'));
      var bad = document.createElement('div');
      bad.textContent = '$$\\wat$$';
      mathify(bad);
      ok('latex: a bad formula stays visible', bad.textContent.length > 0);
      ok('mxCompile: x^2 at 3 is 9', Math.abs(mxCompile('x^2').fn(3) - 9) < 1e-9);
      ok('mxCompile: rejects nonsense', !!mxCompile('wat(').err);
    });

    /* ---- the static path: print, thumbnails and export all use this ---- */
    await stage('static buildPage', async function () {
      var page = sheet();
      var st = buildPage(page, false, {});
      ok('static: builds a page', !!st && st.className.indexOf('page') >= 0);
      var n = st.querySelectorAll('.item').length;
      ok('static: every item is in it', n === page.items.length, n + ' of ' + page.items.length);
      ok('static: no rotate handles', !st.querySelector('.rot'));
      ok('static: no resize handles', !st.querySelector('.rs'));
      ok('static: plot survives', !!st.querySelector('.item[data-type=plot] svg'));
      ok('static: solid survives', !!st.querySelector('.item[data-type=solid] svg'));
      ok('static: chart survives', !!st.querySelector('.item[data-type=chart] svg.chsvg'));
      ok('static: chart legend is words, not inputs',
        !!st.querySelector('.item[data-type=chart] .chrow') &&
        !st.querySelector('.item[data-type=chart] .chleg input'));
      ok('static: deck survives', !!st.querySelector('.item[data-type=deck]'));
    });

    /* ---- the table: cells, formulas, and rows and columns coming and going ---- */
    await stage('table', async function () {
      var page = sheet();
      var keep = page.items.slice();          // handed back at the end, with a table on it
      page.items = [{
        id: uid(), x: 6, y: 6, w: 52, rot: 0, z: 1, lay: curLayerId(),
        type: 'table', fs: 15, head: 1, ts: 'lines', fmt: {}, cap: '',
        rows: [['head', 'b', 'c'], ['1', '2', '=A2+B2'], ['4', '5', '=SUM(A2:B3)'], ['', '', '=NOPE(1)']],
        cw: [1 / 3, 1 / 3, 1 / 3], al: ['l', 'l', 'l']
      }];
      var t = page.items[0];
      await render();
      var el = byType('table');
      ok('table: it is on the page', !!el);
      var cell = function (r, c) {
        return el.querySelector('.tc[data-r="' + r + '"][data-c="' + c + '"]');
      };
      ok('table: every cell is drawn', el.querySelectorAll('.tc').length === 12,
        el.querySelectorAll('.tc').length + ' cells');
      ok('table: what was typed is what is shown', cell(0, 0).textContent === 'head', cell(0, 0).textContent);
      ok('table: =A2+B2 is worked out', cell(1, 2).textContent === '3', cell(1, 2).textContent);
      ok('table: =SUM over a range', cell(2, 2).textContent === '12', cell(2, 2).textContent);
      ok('table: nonsense says so', cell(3, 2).textContent === '#NAME', cell(3, 2).textContent);
      ok('table: the header row is marked', cell(0, 0).classList.contains('hd'));
      ok('table: row numbers and column letters exist',
        el.querySelectorAll('.th').length === 3 && el.querySelectorAll('.rh').length === 4);
      ok('table: they are out of the way until it is selected',
        getComputedStyle(el.querySelector('.th')).visibility === 'hidden');

      /* the two rails append; the header buttons insert and remove */
      el.querySelector('.tadd.r').click();
      ok('table: the rail adds a row', t.rows.length === 5, 'rows=' + t.rows.length);
      el.querySelector('.tadd.c').click();
      ok('table: the rail adds a column', t.rows[0].length === 4, 'cols=' + t.rows[0].length);
      ok('table: a new column takes its share of the width',
        Math.abs(t.cw.reduce(function (a, b) { return a + b; }, 0) - 1) < 1e-6, t.cw.join(','));
      var nel = byType('table');
      ok('table: and the grid is redrawn around it',
        nel.querySelectorAll('.tc').length === 20, nel.querySelectorAll('.tc').length + ' cells');

      /* a formula has to follow the cells it points at */
      tbInsRow(t, 1);
      ok('table: inserting a row moves the references', t.rows[2][2] === '=A3+B3', t.rows[2][2]);
      ok('table: …ranges as well', t.rows[3][2] === '=SUM(A3:B4)', t.rows[3][2]);
      ok('table: and the answers are unchanged',
        tbView(t)[2][2].t === '3' && tbView(t)[3][2].t === '12',
        tbView(t)[2][2].t + ' / ' + tbView(t)[3][2].t);
      tbDelCol(t, 0);
      ok('table: a reference to a deleted column says #REF', tbView(t)[2][1].t === '#REF',
        tbView(t)[2][1].t);
      ok('table: the last row cannot be removed', tbDelRow({ rows: [['x']] }, 0) === false);
      ok('table: the last column cannot be removed', tbDelCol({ rows: [['x']] }, 0) === false);

      /* a formula that eats its own tail */
      ok('table: a circular formula says so', tbView({ rows: [['=B1', '=A1']] })[0][0].t === '#CYCLE',
        tbView({ rows: [['=B1', '=A1']] })[0][0].t);
      /* a block off a spreadsheet's clipboard grows the table to fit */
      var sp = { rows: [['', ''], ['', '']] };
      tbSpill(sp, 0, 0, 'x\ty\tz\np\tq\tr\ns\tt\tu');
      ok('table: pasted text spills across the cells and grows it',
        sp.rows.length === 3 && sp.rows[0].length === 3 && sp.rows[2][2] === 'u',
        JSON.stringify(sp.rows));

      /* the keyboard: the cell cursor walks, and typing goes into the cell */
      page.items = [{
        id: uid(), x: 6, y: 6, w: 52, rot: 0, z: 1, lay: curLayerId(),
        type: 'table', fs: 15, head: 1, ts: 'lines', fmt: {}, cap: '',
        rows: [['a', 'b'], ['c', 'd'], ['e', 'f']], cw: [.5, .5], al: ['l', 'l']
      }];
      t = page.items[0];
      await render();
      el = byType('table');
      select(t.id);
      var g = el.querySelector('.tgrid');
      var key = function (k, extra) {
        var o = { key: k, bubbles: true, cancelable: true };
        for (var p in (extra || {})) o[p] = extra[p];
        g.dispatchEvent(new KeyboardEvent('keydown', o));
      };
      ok('table: it starts on the first cell', el.__tb.r === 0 && el.__tb.c === 0);
      key('ArrowDown'); key('ArrowRight');
      ok('table: the arrows walk the cells', el.__tb.r === 1 && el.__tb.c === 1,
        el.__tb.r + ',' + el.__tb.c);
      ok('table: and the cursor is painted there',
        !!el.querySelector('.tc[data-r="1"][data-c="1"].cur'));
      key('ArrowDown', { shiftKey: true });
      ok('table: shift takes a range', el.__tb.r === 1 && el.__tb.r1 === 2,
        el.__tb.r + '..' + el.__tb.r1);
      ok('table: the whole range is lit',
        el.querySelectorAll('.tc.on').length === 2, el.querySelectorAll('.tc.on').length);
      key('ArrowUp');
      ok('table: an arrow on its own drops the range',
        el.__tb.r === 0 && el.__tb.r1 === 0 && el.__tb.c === 1,
        el.__tb.r + '..' + el.__tb.r1 + ' @' + el.__tb.c);
      key('Z');
      ok('table: typing opens the cell on what was typed', !!el.__tb.ed &&
        el.querySelector('.tc.ed').textContent === 'Z',
        el.__tb.ed ? el.querySelector('.tc.ed').textContent : 'not editing');
      ok('table: while a cell is open the item does not drag', el.classList.contains('editing'));
      key('Enter');
      ok('table: Enter keeps it and moves down', t.rows[0][1] === 'Z' && el.__tb.r === 1,
        t.rows[0][1] + ' @' + el.__tb.r);
      ok('table: and the cell closed behind it', !el.__tb.ed && !el.classList.contains('editing'));
      el.__tb.r = el.__tb.r1 = 2; el.__tb.c = el.__tb.c1 = 1;
      key('Delete');
      ok('table: Delete clears the cell rather than the table',
        page.items.length === 1 && t.rows[2][1] === '',
        'items=' + page.items.length + ' cell=' + JSON.stringify(t.rows[2][1]));
      /* Tab off the end of the last row is another row, as a spreadsheet does */
      key('Tab');
      ok('table: Tab past the last cell adds a row', t.rows.length === 4, 'rows=' + t.rows.length);

      /* print, the overview and an export all take this path — and they get the
         answers, not the formulas */
      t.rows[0][0] = '=1+1';
      var st = buildPage(page, false, {});
      var sc = st.querySelector('.item[data-type="table"] .tc');
      ok('table: it survives the static path', !!sc);
      ok('table: and is worked out there too', sc && sc.textContent === '2', sc && sc.textContent);
      ok('table: with no handles on it', !st.querySelector('.item[data-type="table"] .tadd'));
      /* leave the page as it was found, plus a table — the export downstream
         wants a full page, and now it carries one of these too */
      page.items = keep.concat([t]);
      await render();
    });

    /* ---- a long table: the band it shows, and folding it away ---- */
    await stage('table: big', async function () {
      var page = sheet();
      var keep = page.items.slice();
      var rows = [['n', 'x', 'note']];
      for (var i = 1; i <= 60; i++) rows.push([String(i), String(i * 1.5), 'row ' + i]);
      var t = {
        id: uid(), x: 6, y: 6, w: 52, rot: 0, z: 1, lay: curLayerId(),
        type: 'table', fs: 15, head: 1, ts: 'lines', fmt: {}, cap: '',
        rows: rows, cw: [1 / 3, 1 / 3, 1 / 3], al: ['l', 'l', 'l']
      };
      page.items = [t];
      ok('big table: it is not windowed until it is asked to be', !tbWin(t).on);
      tbFit(t);
      ok('big table: a long one arrives windowed', t.vh === TB_VIEW, 'vh=' + t.vh);
      var w = tbWin(t);
      ok('big table: the window is the header plus a band', w.on && w.list.length === TB_VIEW + 1,
        w.list.length + ' rows listed');
      ok('big table: the header is pinned above the band', w.list[0] === 0 && w.list[1] === 1,
        w.list.slice(0, 3).join(','));
      await render();
      var el = byType('table');
      ok('big table: only the band is drawn', el.querySelectorAll('.tc').length === (TB_VIEW + 1) * 3,
        el.querySelectorAll('.tc').length + ' cells of ' + (61 * 3));
      ok('big table: and it says which rows they are',
        /rows 2–16 of 61/.test(el.querySelector('.tcount').textContent),
        el.querySelector('.tcount').textContent);
      ok('big table: there is a scrollbar', !!el.querySelector('.tsb .tsbt'));
      ok('big table: the box makes room for it', el.querySelector('.tbox').classList.contains('win'));

      /* only the rows on screen are worked out */
      var seen = 0;
      var probe = tbView(t, tbWin(t).list);
      for (var k = 0; k < probe.length; k++) if (probe[k]) seen++;
      ok('big table: only the band is worked out', seen === TB_VIEW + 1, seen + ' rows evaluated');
      ok('big table: asked for the lot, it works out the lot', tbView(t).filter(Boolean).length === 61);

      /* scrolling moves the band and nothing else */
      t.vr = 20;
      await render();
      el = byType('table');
      ok('big table: scrolled, the band starts where it was put',
        !!el.querySelector('.tc[data-r="21"]') && !el.querySelector('.tc[data-r="20"]'));
      ok('big table: the header is still there', el.querySelector('.tc[data-r="0"]').textContent === 'n');
      ok('big table: the row numbers are the real ones',
        el.querySelector('.rh[data-r="21"] .tlab').textContent === '22',
        el.querySelector('.rh[data-r="21"] .tlab').textContent);
      ok('big table: the top row drawn closes the box', !!el.querySelector('.tc.ftop'));

      /* the wheel walks the band, and stops the desk zooming under it */
      t.vr = 0;
      await render();
      el = byType('table');
      var target = el.querySelector('.tc[data-r="3"]');
      var ev = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
      target.dispatchEvent(ev);
      ok('big table: the wheel scrolls it', t.vr > 0, 'vr=' + t.vr);
      ok('big table: and the desk does not get the wheel too', ev.defaultPrevented);
      var was = t.vr;
      target = byType('table').querySelector('.tc[data-r="' + (t.vr + 3) + '"]');
      target.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
      ok('big table: and back up again', t.vr < was, 'vr=' + t.vr);
      var zev = new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true });
      was = t.vr;
      byType('table').querySelector('.tc[data-r="' + (t.vr + 2) + '"]').dispatchEvent(zev);
      ok('big table: ctrl+wheel is left to the desk', t.vr === was, 'vr=' + t.vr);

      /* the cell cursor drags the band along with it */
      t.vr = 0;
      ok('big table: a cell already on screen does not move it', !tbSeeRow(t, 5));
      ok('big table: one below it does', tbSeeRow(t, 40) && t.vr === 40 - TB_VIEW,
        'vr=' + t.vr);
      ok('big table: and one above', tbSeeRow(t, 2) && t.vr === 1, 'vr=' + t.vr);
      t.vr = 0;

      /* opened right out, and folded back */
      tbVH(t);
      ok('big table: the count button steps the window on', t.vh === 25, 'vh=' + t.vh);
      t.vh = TB_VIEW;

      /* stats over a range */
      var st = tbStatText(t, { r0: 1, r1: 5, c0: 1, c1: 1 });
      ok('big table: a picked range says what it comes to', /n 5 · Σ 22.5 · x̄ 4.5/.test(st), st);
      ok('big table: one cell says where it is',
        tbStatText(t, { r0: 3, r1: 3, c0: 2, c1: 2 }) === 'C4',
        tbStatText(t, { r0: 3, r1: 3, c0: 2, c1: 2 }));

      /* folded down to an icon */
      tbFold(t, page, true);
      await sleep(60);
      el = byType('table');
      ok('folded: it wears an icon', !!el.querySelector('.ficon svg'));
      ok('folded: and no grid', !el.querySelector('.tgrid'));
      ok('folded: it shrank to icon size', t.w < 20 && t.w0 === 52, 'w=' + t.w + ' w0=' + t.w0);
      ok('folded: the icon says what it is', /61 rows · 3 columns/.test(tbMeta(t)), tbMeta(t));

      /* …and the window it opens into */
      openTable(t, page);
      await sleep(60);
      var win = Q('#fview .fbody.tsheet');
      ok('window: it opens', !!win && Q('#fview').classList.contains('on'));
      ok('window: the sheet is in it', !!win && win.querySelectorAll('.tc').length > 30,
        win && win.querySelectorAll('.tc').length + ' cells');
      ok('window: the letters are out in here',
        !!win && getComputedStyle(win.querySelector('.th')).visibility === 'visible');
      var wasVr = tableWin.vr;
      tableScroll(30);
      ok('window: it scrolls on its own', tableWin.vr !== wasVr && tableWin.vr > 0, 'vr=' + tableWin.vr);
      ok('window: without moving the table on the page', t.vr === 0, 'item vr=' + t.vr);
      closeViewer();
      ok('window: closing it lets go', tableWin === null);
      tbFold(t, page, false);
      await sleep(60);
      ok('unfolded: the grid is back', !!byType('table').querySelector('.tgrid'));
      ok('unfolded: at the width it had', t.w === 52, 'w=' + t.w);

      /* sorting */
      t.rows[1][1] = '30'; t.rows[2][1] = '4'; t.rows[3][1] = '';
      ok('sort: it sorts', tbSort(t, 1, 1));
      ok('sort: smallest first', +t.rows[1][1] === 4, t.rows[1][1]);
      ok('sort: blanks last', t.rows[60][1] === '', '"' + t.rows[60][1] + '"');
      ok('sort: the header stays put', t.rows[0][1] === 'x', t.rows[0][1]);
      ok('sort: the whole row travelled', t.rows[1][0] === '2' && t.rows[1][2] === 'row 2',
        t.rows[1].join('|'));
      tbSort(t, 1, -1);
      ok('sort: and the other way', t.rows[1][1] === '90', t.rows[1][1]);
      ok('sort: blanks stay at the bottom either way', t.rows[60][1] === '', '"' + t.rows[60][1] + '"');
      ok('sort: the rows array is the same one', tbRows(t) === t.rows);

      /* bulk growth costs one pass, and never rewrites a formula */
      var t2 = { type: 'table', head: 1, rows: [['a', 'b'], ['1', '=A2*2']], cw: [.5, .5], al: ['l', 'l'] };
      var t0 = Date.now();
      tbGrow(t2, 4000, 4);
      ok('grow: it grew', tbRows(t2).length === 4000 && tbNC(t2) === 4,
        tbRows(t2).length + '×' + tbNC(t2));
      ok('grow: nothing already there moved', t2.rows[1][1] === '=A2*2', t2.rows[1][1]);
      ok('grow: the widths still add to one',
        Math.abs(tbCW(t2).reduce(function (a, b) { return a + b; }, 0) - 1) < 1e-9, tbCW(t2).join(','));
      ok('grow: four thousand rows in well under a second', Date.now() - t0 < 900, (Date.now() - t0) + 'ms');
      var t3 = { type: 'table', head: 0, rows: [['']], cw: [1], al: ['l'] };
      tbPour(t3, 0, 0, [['x', 'y'], ['1', '2'], ['3', '4']]);
      ok('pour: a block lands whole', tbRows(t3).length === 3 && tbNC(t3) === 2 && t3.rows[2][1] === '4',
        JSON.stringify(t3.rows));

      /* print, the overview and an exported book all take this path */
      t.vh = TB_VIEW; t.vr = 12;
      var stat = buildPage(page, false, {});
      var sel = '.item[data-type="table"] ';
      ok('static: a windowed table prints the band it is showing',
        stat.querySelectorAll(sel + '.tc').length === (TB_VIEW + 1) * 3,
        stat.querySelectorAll(sel + '.tc').length + ' cells');
      ok('static: and says so, so an extract never reads as the whole thing',
        /rows 14–28 of 61/.test((stat.querySelector(sel + '.tcount') || {}).textContent || ''),
        (stat.querySelector(sel + '.tcount') || {}).textContent);
      ok('static: with no handles and no readout',
        !stat.querySelector(sel + '.tadd') && !stat.querySelector(sel + '.tstat'));
      t.col = 1;
      stat = buildPage(page, false, {});
      ok('static: a folded one prints as its icon',
        !!stat.querySelector(sel + '.ficon svg') && !stat.querySelector(sel + '.tgrid'));
      delete t.col;

      page.items = keep;
      await render();
    });

    /* ---- reading a spreadsheet off the disk ---- */
    await stage('table: import', async function () {
      /* a zip written here, so the harness needs no fixture on disk. Stored, not
         deflated — sheet.js reads method 0 the same way, and the reader ignores
         the checksum, so there is no need to work one out. */
      function zipStore(files) {
        var enc = new TextEncoder(), parts = [], cd = [], off = 0;
        files.forEach(function (f) {
          var nm = enc.encode(f.name), data = enc.encode(f.text);
          var lh = new Uint8Array(30 + nm.length), v = new DataView(lh.buffer);
          v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(8, 0, true);
          v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
          v.setUint16(26, nm.length, true);
          lh.set(nm, 30);
          parts.push(lh, data);
          var ch = new Uint8Array(46 + nm.length), w = new DataView(ch.buffer);
          w.setUint32(0, 0x02014b50, true); w.setUint16(10, 0, true);
          w.setUint32(20, data.length, true); w.setUint32(24, data.length, true);
          w.setUint16(28, nm.length, true); w.setUint32(42, off, true);
          ch.set(nm, 46);
          cd.push(ch);
          off += lh.length + data.length;
        });
        var len = cd.reduce(function (s, c) { return s + c.length; }, 0);
        var end = new Uint8Array(22), e = new DataView(end.buffer);
        e.setUint32(0, 0x06054b50, true);
        e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
        e.setUint32(12, len, true); e.setUint32(16, off, true);
        return new Blob(parts.concat(cd, [end]));
      }
      var NS = ' xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
               ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
      var book = zipStore([
        { name: 'xl/workbook.xml', text: '<workbook' + NS + '><sheets>' +
          '<sheet name="Runs" sheetId="1" r:id="rId1"/></sheets></workbook>' },
        { name: 'xl/_rels/workbook.xml.rels', text:
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
        { name: 'xl/sharedStrings.xml', text: '<sst' + NS + '><si><t>day</t></si>' +
          '<si><t>mass (g)</t></si></sst>' },
        { name: 'xl/styles.xml', text: '<styleSheet' + NS + '><cellXfs>' +
          '<xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>' },
        { name: 'xl/worksheets/sheet1.xml', text: '<worksheet' + NS + '><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" s="1"><v>45352</v></c><c r="B2"><v>2.7000000000000002</v></c></row>' +
          '<row r="3"><c r="A3" s="1"><v>45353</v></c><c r="B3"><v>3.1</v></c></row>' +
          '</sheetData></worksheet>' }
      ]);
      var got = await sheetRead(new File([book], 'runs.xlsx'));
      ok('import: it is read as a workbook', got.kind === 'xlsx', got.kind);
      var sh = got.sheets[0];
      ok('import: the sheet is named', sh.name === 'Runs', sh.name);
      ok('import: shared strings come through', sh.rows[0].join('|') === 'day|mass (g)', sh.rows[0]);
      ok('import: a date is written down, not left a serial', sh.rows[1][0] === '2024-03-01', sh.rows[1][0]);
      ok('import: float noise is trimmed', sh.rows[1][1] === '2.7', sh.rows[1][1]);

      /* …and poured into a table */
      var page = sheet(), keep = page.items.slice();
      var t = { id: uid(), x: 5, y: 5, w: 50, rot: 0, z: 1, lay: curLayerId(),
        type: 'table', fs: 15, ts: 'lines', cap: '', rows: [['']], cw: [1], al: ['l'] };
      page.items = [t];
      tbFill(t, sh, 'runs.xlsx');
      ok('import: the table took the rows', tbRows(t).length === 3 && tbNC(t) === 2,
        tbRows(t).length + '×' + tbNC(t));
      ok('import: the first row was seen to be a header', t.head === 1);
      ok('import: the numbers column is set to the right', tbAl(t)[1] === 'r', tbAl(t).join(','));
      ok('import: the columns share the width by what is in them',
        tbCW(t)[1] > tbCW(t)[0] === false || Math.abs(tbCW(t).reduce(function (a, b) { return a + b; }, 0) - 1) < 1e-9,
        tbCW(t).join(','));
      ok('import: it is named after the file', t.name === 'runs.xlsx' && t.cap === 'runs.xlsx');
      await render();
      ok('import: and it draws', byType('table').querySelectorAll('.tc').length === 6,
        byType('table').querySelectorAll('.tc').length + ' cells');

      /* truncation is said out loud, never quietly done */
      var big = { rows: [['a'], ['1']], rowsTotal: 900000, wide: true };
      tbFill(t, big, 'huge.csv');
      ok('import: an extract says so', /first 2 of 900,000 rows/.test(t.note) && /columns/.test(t.note), t.note);

      /* the delimited path */
      var csv = sheetCSV('a,b\n1,2\n3,4\n')[0];
      ok('import: csv rows', csv.rows.length === 3 && csv.rows[2][1] === '4', JSON.stringify(csv.rows));
      var tsv = sheetCSV('a\tb\n1\t2\n')[0];
      ok('import: a tab file sniffs itself', tsv.delim === '\t' && tsv.rows[1][0] === '1', tsv.delim);

      /* ---- the drop chain: who claims a file dropped on the page ---- */
      ok('drop: the model is asked before the picture feature sees its textures',
        fileTakers().indexOf('model') < fileTakers().indexOf('image'), fileTakers().join(','));
      var png = new File([new Blob([new Uint8Array([137, 80, 78, 71])])], 'x.png', { type: 'image/png' });
      ok('drop: a picture is not a spreadsheet', !ITEMS.table.takes([png], { x: 1, y: 1 }, page));
      ok('drop: nor is a pdf', !ITEMS.table.takes([new File([new Blob([''])], 'p.pdf')], { x: 1, y: 1 }, page));
      page.items = [];
      await render();
      var drop = new File([new Blob(['a,b\n1,2\n3,4\n'])], 'dropped.csv');
      var took = null;
      var takers = fileTakers();
      for (var z = 0; z < takers.length; z++)
        if (ITEMS[takers[z]].takes([drop], { x: 10, y: 10 }, page)) { took = takers[z]; break; }
      ok('drop: a .csv is claimed by the table', took === 'table', took);
      await waitFor(function () { return page.items.length === 1; }, 6000);
      var dropped = page.items[0];
      ok('drop: and lands on the page as one', dropped.type === 'table', dropped.type);
      ok('drop: with the file read into it',
        tbRows(dropped)[0].join(',') === 'a,b' && tbRows(dropped)[2][1] === '4',
        JSON.stringify(tbRows(dropped)));
      ok('drop: named after the file it came from',
        dropped.name === 'dropped.csv' && dropped.cap === 'dropped.csv');
      ok('drop: and it is on the paper, not off the edge',
        dropped.x >= 2 && dropped.x + dropped.w <= 100, dropped.x + ' + ' + dropped.w);

      /* out again */
      t.rows = [['a', 'b'], ['1', '=A2+1'], ['x,y', '"q"']];
      t.cw = [.5, .5]; t.al = ['l', 'l'];
      var out = tbToCSV(t).split('\r\n');
      ok('csv out: the answers, not the formulas', out[1] === '1,2', out[1]);
      ok('csv out: commas and quotes are wrapped', out[2] === '"x,y","""q"""', out[2]);

      page.items = keep;
      await render();
    });

    /* ---- a FITS file: its HDUs, its headers, and the data it never reads ---- */
    await stage('fits', async function () {
      /* a real FITS written here, so the harness needs no fixture on disk: 80-column
         cards padded out to whole 2880-byte blocks, exactly as the format says */
      function card(s) { return (String(s) + '                                                                                ').slice(0, 80); }
      function pad20(s) { return ('                    ' + String(s)).slice(-20); }
      function kv(k, v, c) { return (String(k) + '        ').slice(0, 8) + '= ' + pad20(v) + (c ? ' / ' + c : ''); }
      function kvs(k, v, c) { var s = "'" + v + "'"; return (String(k) + '        ').slice(0, 8) + '= ' + (s + '                    ').slice(0, Math.max(20, s.length)) + (c ? ' / ' + c : ''); }
      function fitsBuild(hdus) {
        var enc = new TextEncoder(), parts = [];
        hdus.forEach(function (h) {
          var txt = h.cards.map(card).join('') + card('END');
          while (txt.length % 2880) txt += ' ';
          parts.push(enc.encode(txt));
          if (h.data && h.data.length) {
            var m = Math.ceil(h.data.length / 2880) * 2880, out = new Uint8Array(m);
            out.set(h.data);
            parts.push(out);
          }
        });
        return new Blob(parts);
      }
      /* real readings in the table, big-endian, so what comes out can be checked
         against what went in: TIME 1D, FLUX 4E, PHA 1I scaled and with a TNULL
         in the middle of it, NAME 8A — 34 bytes to a row */
      var rb = 34, nr = 3, rows = new Uint8Array(rb * nr), rv = new DataView(rows.buffer);
      for (var r = 0; r < nr; r++) {
        var o = r * rb;
        rv.setFloat64(o, 100.5 + r, false);
        for (var k = 0; k < 4; k++) rv.setFloat32(o + 8 + k * 4, r + k * 0.5, false);
        rv.setInt16(o + 24, r === 1 ? -1 : 4 + r * 4, false);
        var nm = 'evt' + r;
        for (var j = 0; j < 8; j++) rows[o + 26 + j] = j < nm.length ? nm.charCodeAt(j) : 32;
      }
      var comment = [], history = [];
      for (var q = 0; q < 6; q++) comment.push('COMMENT   pipeline note ' + q);
      for (var q2 = 0; q2 < 5; q2++) history.push('HISTORY   ran step ' + q2);
      var blob = fitsBuild([
        { cards: [kv('SIMPLE', 'T', 'conforms to FITS standard'),
                  kv('BITPIX', -32), kv('NAXIS', 2), kv('NAXIS1', 4), kv('NAXIS2', 3),
                  kv('EXTEND', 'T'),
                  kvs('OBJECT', 'NGC 6357', 'what was pointed at'),
                  kv('EXPTIME', '1.2D3', 'seconds'),
                  kvs('LONGSTR', 'the first half of a very long value &'),
                  "CONTINUE  'and the second half' / carried on",
                  'HIERARCH ESO DET CHIP1 NAME = ' + "'CCD-44'" + ' / the detector',
                  kv('CRPIX1', 512.5)].concat(comment, history),
          data: new Uint8Array(48) },
        { cards: [kvs('XTENSION', 'IMAGE'), kv('BITPIX', 16), kv('NAXIS', 2),
                  kv('NAXIS1', 2), kv('NAXIS2', 2), kv('PCOUNT', 0), kv('GCOUNT', 1),
                  kv('BZERO', 32768), kv('BSCALE', 1),
                  kvs('EXTNAME', 'SCI'), kv('EXTVER', 2)],
          data: new Uint8Array(8) },
        { cards: [kvs('XTENSION', 'BINTABLE'), kv('BITPIX', 8), kv('NAXIS', 2),
                  kv('NAXIS1', 34), kv('NAXIS2', 3), kv('PCOUNT', 0), kv('GCOUNT', 1),
                  kv('TFIELDS', 4), kvs('EXTNAME', 'EVENTS'),
                  kvs('TTYPE1', 'TIME'), kvs('TFORM1', '1D'), kvs('TUNIT1', 's'),
                  kvs('TTYPE2', 'FLUX'), kvs('TFORM2', '4E'), kvs('TUNIT2', 'e-/s'),
                  kvs('TTYPE3', 'PHA'), kvs('TFORM3', '1I'), kvs('TUNIT3', 'chan'),
                  kv('TSCAL3', 0.5), kv('TZERO3', 10), kv('TNULL3', -1),
                  kvs('TTYPE4', 'NAME'), kvs('TFORM4', '8A')],
          data: rows }
      ]);
      var file = new File([blob], 'obs.fits');

      /* ---- the walk ---- */
      var f = await fitsOpen(file);
      ok('fits: three HDUs came back', f.hdus.length === 3, f.hdus.length);
      var inf = fitsInfo(f);
      ok('fits: info() names them the way astropy does',
        inf.map(function (r) { return r.klass; }).join(',') === 'PrimaryHDU,ImageHDU,BinTableHDU',
        inf.map(function (r) { return r.klass; }).join(','));
      ok('fits: an extension carries its EXTNAME and EXTVER',
        inf[1].name === 'SCI' && inf[1].ver === 2, inf[1].name + '/' + inf[1].ver);
      ok('fits: a shape is written the way numpy writes it — NAXIS backwards',
        inf[0].dim === '(3, 4)', inf[0].dim);
      ok('fits: a table is R x C', inf[2].dim === '3R x 4C', inf[2].dim);
      ok('fits: and its format is the TFORMs', inf[2].format === '[1D, 4E, 1I, 8A]', inf[2].format);
      ok('fits: the card count leaves out END, and the CONTINUE it folded in',
        inf[0].cards === 22, inf[0].cards);

      /* ---- the data is stepped over, never read ---- */
      ok('fits: the primary data unit is 4x3 float32', f.hdus[0].dataLen === 48, f.hdus[0].dataLen);
      ok('fits: every header begins on a block boundary',
        f.hdus.every(function (h) { return h.dataOff % 2880 === 0; }),
        f.hdus.map(function (h) { return h.dataOff; }).join(','));
      ok('fits: one HDU\'s header starts where the last one\'s data ended',
        f.hdus[0].hdrOff === 0 && f.hdus[1].hdrOff === f.hdus[0].dataEnd &&
        f.hdus[2].hdrOff === f.hdus[1].dataEnd,
        f.hdus.map(function (h) { return h.hdrOff + '/' + h.dataOff + '-' + h.dataEnd; }).join(' '));
      ok('fits: the chain adds up to the whole file', f.hdus[2].dataEnd === file.size,
        f.hdus[2].dataEnd + ' vs ' + file.size);
      ok('fits: a table row is NAXIS1 bytes and there are NAXIS2 of them',
        f.hdus[2].rows === 3 && f.hdus[2].rowBytes === 34, f.hdus[2].rows + 'x' + f.hdus[2].rowBytes);

      /* ---- what the values came out as ---- */
      var h0 = f.hdus[0].keys;
      ok('fits: a string is unquoted and trimmed', h0.OBJECT === 'NGC 6357', JSON.stringify(h0.OBJECT));
      ok('fits: T is true, not the letter T', h0.SIMPLE === true, JSON.stringify(h0.SIMPLE));
      ok('fits: a Fortran D exponent is still a number', h0.EXPTIME === 1200, JSON.stringify(h0.EXPTIME));
      ok('fits: a float is a float', h0.CRPIX1 === 512.5, JSON.stringify(h0.CRPIX1));
      ok('fits: CONTINUE joins a long string back together',
        h0.LONGSTR === 'the first half of a very long value and the second half', JSON.stringify(h0.LONGSTR));
      ok('fits: a HIERARCH keyword keeps its real name',
        h0['ESO DET CHIP1 NAME'] === 'CCD-44', JSON.stringify(h0['ESO DET CHIP1 NAME']));
      ok('fits: BZERO 32768 on BITPIX 16 means unsigned',
        f.hdus[1].dtype === 'uint16' && f.hdus[1].stored === 'int16', f.hdus[1].dtype + '/' + f.hdus[1].stored);

      /* ---- the columns, described and not read ---- */
      var cols = f.hdus[2].cols;
      ok('fits: the columns come out named and measured',
        cols.map(function (c) { return c.name + ':' + c.type + ':' + c.bytes; }).join(',') ===
        'TIME:float64:8,FLUX:float32:16,PHA:int16:2,NAME:char:8',
        cols.map(function (c) { return c.name + ':' + c.type + ':' + c.bytes; }).join(','));
      ok('fits: their offsets down a row are cumulative',
        cols.map(function (c) { return c.off; }).join(',') === '0,8,24,26',
        cols.map(function (c) { return c.off; }).join(','));
      ok('fits: a repeat count is the shape of one cell, not a row count',
        fitsCellShape(cols[1]) === '(4,)' && fitsCellShape(cols[0]) === 'scalar',
        fitsCellShape(cols[1]) + ' / ' + fitsCellShape(cols[0]));
      ok('fits: a character column counts characters', fitsCellShape(cols[3]) === '8 chars', fitsCellShape(cols[3]));
      ok('fits: a unit is carried', cols[1].unit === 'e-/s', cols[1].unit);

      /* ---- searching ---- */
      ok('fits: the search looks in the value field, not just the keyword',
        (fitsFind(f.hdus, 'ngc 6357') || []).length === 1, (fitsFind(f.hdus, 'ngc 6357') || []).length);
      ok('fits: …and in the comment', (fitsFind(f.hdus, 'detector') || []).length === 1);
      ok('fits: …and across every HDU', (fitsFind(f.hdus, 'naxis') || []).length >= 9,
        (fitsFind(f.hdus, 'naxis') || []).length);
      ok('fits: the header comes back in the 80 columns it arrived in',
        fitsHeaderText(f.hdus[1]).split('\n').every(function (l, i, a) { return i === a.length - 1 || l.length === 80; }));


      /* ---- planning a read before reading it ---- */
      ok('fits: a column that fits comes out whole',
        fitsPlan({ rows: 3, rowBytes: 34 }).step === 1 && fitsPlan({ rows: 3, rowBytes: 34 }).why === '',
        JSON.stringify(fitsPlan({ rows: 3, rowBytes: 34 })));
      var spread = fitsPlan({ rows: 200000, rowBytes: 16 });
      ok('fits: a long one worth walking is spread across the whole of it',
        spread.step === 4 && spread.take === 50000 && /every 4th/.test(spread.why), JSON.stringify(spread));
      var head = fitsPlan({ rows: 4204881, rowBytes: 48 });
      ok('fits: one too big to walk comes out as its first rows, and says so',
        head.step === 1 && head.take === 50000 && /first 50,000 of 4,204,881/.test(head.why), JSON.stringify(head));

      /* ---- and reading it ---- */
      var got = await fitsColumns(f, f.hdus[2], [0, 1, 2, 3]);
      ok('fits: a vector column becomes one column per element',
        got.rows[0].join('|') === 'TIME (s)|FLUX[0] (e-/s)|FLUX[1] (e-/s)|FLUX[2] (e-/s)|FLUX[3] (e-/s)|PHA (chan)|NAME',
        got.rows[0].join('|'));
      ok('fits: the readings are the readings that went in',
        got.rows[1][0] === '100.5' && got.rows[3][0] === '102.5', got.rows[1][0] + ' / ' + got.rows[3][0]);
      ok('fits: a float32 is written to the seven figures it actually carries',
        got.rows[1].slice(1, 5).join(',') === '0,0.5,1,1.5' && got.rows[3][2] === '2.5',
        got.rows[1].slice(1, 5).join(',') + ' | ' + got.rows[3][2]);
      ok('fits: TSCAL and TZERO are applied on the way out',
        got.rows[1][5] === '12' && got.rows[3][5] === '16', got.rows[1][5] + ' / ' + got.rows[3][5]);
      ok('fits: a TNULL is a gap, not a number', got.rows[2][5] === '', JSON.stringify(got.rows[2][5]));
      ok('fits: a character column comes out trimmed',
        got.rows[1][6] === 'evt0' && got.rows[3][6] === 'evt2', got.rows[1][6] + '/' + got.rows[3][6]);
      ok('fits: and the whole column came, so there is nothing to confess',
        got.rowsTotal === 3 && got.rows.length === 4 && !got.note, got.note);

      /* what it will not pretend to read */
      ok('fits: a variable-length array says why it cannot come',
        /variable-length/.test(fitsColWhy({ name: 'PH', code: 'P', form: '1PE(5)' }, false)));
      ok('fits: …so does a bit column and a complex one',
        /bit column/.test(fitsColWhy({ name: 'B', code: 'X', form: '8X' }, false)) &&
        /complex/.test(fitsColWhy({ name: 'Z', code: 'C', form: '1C' }, false)));
      ok('fits: an ASCII table prints its own values, so nothing is refused there',
        fitsColWhy({ name: 'A', code: 'F', form: 'F10.4' }, true) === '');

      /* ---- gzipped, which has to come out whole before any of it can be read ---- */
      if (typeof CompressionStream === 'function') {
        var gz = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
        var gf = await fitsOpen(new File([gz], 'obs.fits.gz'));
        ok('fits: a .fits.gz is unpacked on the way in',
          gf.hdus.length === 3 && gf.hdus[2].rows === 3, gf.hdus.length);
        ok('fits: …and the name it is opened under loses the .gz',
          gf.blob.name === 'obs.fits', gf.blob.name);
      }

      /* ---- a file that is not one ---- */
      var bad = false;
      try { await fitsOpen(new File([new Blob(['not a fits file at all'])], 'x.fits')); }
      catch (e) { bad = true; }
      ok('fits: something that is not a FITS file says so', bad);

      /* ---- onto the page ----
         From here on the sheet is ours, so put it back whatever happens: a stage
         that throws half way through used to leave the next one holding it. */
      var page = sheet(), keep = page.items.slice();
      page.items = [];
      await render();
      try {
      ok('fits: a .fits is claimed before anything else could take it',
        fileTakers().indexOf('fits') < fileTakers().indexOf('model'), fileTakers().join(','));
      var took = ITEMS.fits.takes([file], { x: 10, y: 10 }, page);
      ok('fits: the feature takes it', took === true, took);
      await waitFor(function () { return page.items.length === 1; }, 8000);
      var it = page.items[0];
      ok('fits: and it lands as a fits item', it.type === 'fits' && it.name === 'obs.fits', it.type);
      ok('fits: the item keeps a digest, not the headers — a note is rewritten on every keystroke',
        Array.isArray(it.hdus) && it.hdus.length === 3 && it.hdus[0].cards === 22 &&
        !/OBJECT|NGC 6357|pipeline note/.test(JSON.stringify(it)) && JSON.stringify(it).length < 2500,
        JSON.stringify(it).length + ' bytes');
      ok('fits: the card says what is in it', /3 HDUs/.test(ftMeta(it)) && /3 rows/.test(ftMeta(it)), ftMeta(it));
      await render();
      ok('fits: it draws as a shortcut', !!byType('fits') && !!byType('fits').querySelector('.ficon'));

      /* ---- the reader ---- */
      await ftOpen(it);
      await waitFor(function () { return Q('#fview .ftrow'); }, 8000);
      ok('fits: the reader opens', Q('#fview').classList.contains('on'));
      ok('fits: on hdu.info()', QA('#fview .ftrow').length === 3, QA('#fview .ftrow').length);
      ok('fits: with the first HDU picked', Q('#fview .ftrow.on').dataset.i === '0');
      ok('fits: a run of COMMENT folds itself away',
        QA('#fview .ftfold').length === 2, QA('#fview .ftfold').length);
      ok('fits: a folded run is out of the way but still there',
        QA('#fview .ftfold .ftc').length === 11 && QA('#fview .ftcards > .ftc').length === 11,
        QA('#fview .ftfold .ftc').length + ' folded, ' + QA('#fview .ftcards > .ftc').length + ' loose');
      var chips = QA('#fview .ftchip').map(function (c) { return c.textContent; }).join(' | ');
      ok('fits: the data unit is a shape and a size, not numbers',
        /\(3, 4\)/.test(chips) && /float32/.test(chips) && /12/.test(chips), chips);

      QA('#fview .ftrow')[2].click();
      ok('fits: picking a table row shows its columns',
        QA('#fview .ftcols tbody tr').length === 4, QA('#fview .ftcols tbody tr').length);
      ok('fits: …with the cell shape of each',
        /\(4,\)/.test(Q('#fview .ftcols').textContent), Q('#fview .ftcols').textContent.slice(0, 120));

      var seek = Q('#fview .ftq');
      seek.value = 'tform2';
      seek.dispatchEvent(new Event('input', { bubbles: true }));
      ok('fits: the search narrows the header to what matched',
        QA('#fview .ftcards .ftc').length === 1, QA('#fview .ftcards .ftc').length);
      ok('fits: and lights the match up', !!Q('#fview .ftcards mark'),
        Q('#fview .ftcards').innerHTML.slice(0, 160));
      Q('#fview .ftall').checked = true;
      Q('#fview .ftall').dispatchEvent(new Event('change', { bubbles: true }));
      seek.value = 'ngc';
      seek.dispatchEvent(new Event('input', { bubbles: true }));
      ok('fits: searching every HDU crosses into the primary from a table',
        QA('#fview .ftcards .ftc').length === 1 && !!Q('#fview .fthit'),
        QA('#fview .ftcards .ftc').length);


      /* ---- picking columns and hauling them out ---- */
      var tap = function (el) {
        var r = el.getBoundingClientRect(), o = { pointerId: 7, bubbles: true,
          clientX: r.left + 4, clientY: r.top + 4 };
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        window.dispatchEvent(new PointerEvent('pointerup', o));
      };
      Q('#fview .ftall').checked = false;
      Q('#fview .ftall').dispatchEvent(new Event('change', { bubbles: true }));
      seek.value = '';
      seek.dispatchEvent(new Event('input', { bubbles: true }));
      QA('#fview .ftrow')[2].click();
      var picks = QA('#fview .ftcols.live tr[data-c]');
      ok('fits: every column of a table is pickable', picks.length === 4, picks.length);
      ok('fits: nothing is picked to begin with, and it says what to do',
        !Q('#fview .ftpick.on') && /Click a column/.test(Q('#fview .ftpick').textContent),
        Q('#fview .ftpick').textContent);
      tap(picks[0]);
      ok('fits: a tap picks one', ftWin.pick.size === 1 && !!Q('#fview .ftcols tr.pick'),
        ftWin.pick.size);
      tap(QA('#fview .ftcols.live tr[data-c]')[1]);
      ok('fits: and another adds to it, with a way out offered',
        ftWin.pick.size === 2 && !!Q('#fview .ftout') && /2 columns picked/.test(Q('#fview .ftpick').textContent),
        Q('#fview .ftpick').textContent);
      tap(QA('#fview .ftcols.live tr[data-c]')[1]);
      ok('fits: tapping a picked one puts it back', ftWin.pick.size === 1, ftWin.pick.size);
      tap(QA('#fview .ftcols.live tr[data-c]')[1]);

      Q('#fview .ftout').click();
      await waitFor(function () { return byType('table'); }, 10000);
      var t = page.items.filter(function (x) { return x.type === 'table'; })[0];
      ok('fits: what lands on the sheet is an ordinary table', !!t && t.type === 'table');
      ok('fits: named after the HDU it came out of', /EVENTS/.test(t.name) && /obs.fits/.test(t.name), t.name);
      ok('fits: with the column names as its header row',
        t.head === 1 && tbRows(t)[0].join('|') === 'TIME (s)|FLUX[0] (e-/s)|FLUX[1] (e-/s)|FLUX[2] (e-/s)|FLUX[3] (e-/s)',
        tbRows(t)[0].join('|'));
      ok('fits: and the readings under them', tbRows(t).length === 4 && tbRows(t)[3][0] === '102.5',
        tbRows(t).length + ' rows, ' + tbRows(t)[3][0]);
      ok('fits: the reader closed behind it', !Q('#fview').classList.contains('on') && ftWin === null);

      /* ---- dropped onto a table that is already there ---- */
      await ftOpen(it);
      await waitFor(function () { return Q('#fview .ftrow'); }, 8000);
      QA('#fview .ftrow')[2].click();
      var nc0 = tbNC(t);
      await ftPour([2, 3], { it: t, el: byType('table'), page: page }, null);
      ok('fits: a drop on a table joins its columns to it', tbNC(t) === nc0 + 2, nc0 + ' → ' + tbNC(t));
      ok('fits: the names land on the header row, not in a reading',
        tbRows(t)[0][nc0] === 'PHA (chan)' && tbRows(t)[0][nc0 + 1] === 'NAME',
        tbRows(t)[0].join('|'));
      ok('fits: with the values under them, gaps and all',
        tbRows(t)[1][nc0] === '12' && tbRows(t)[2][nc0] === '' && tbRows(t)[3][nc0 + 1] === 'evt2',
        tbRows(t)[1][nc0] + '/' + JSON.stringify(tbRows(t)[2][nc0]) + '/' + tbRows(t)[3][nc0 + 1]);

      /* ---- and a truncation is confessed on the table itself ---- */
      var fake = { rows: [['a'], ['1'], ['2']], rowsTotal: 900000,
        note: 'first 50,000 of 900,000 rows', plan: { why: 'first 50,000 of 900,000 rows' } };
      var t2 = ftNewTable(fake, 'BIG · x.fits', { x: 4, y: 4 }, page);
      ok('fits: a table that only got part of a column says so in its foot',
        /first 50,000 of 900,000 rows/.test(t2.note) && /first 50,000 of 900,000 rows/.test(tbCountText(t2)),
        t2.note + ' | ' + tbCountText(t2));
      page.items = page.items.filter(function (x) { return x !== t2; });

      closeViewer();
      ok('fits: and it closes', !Q('#fview').classList.contains('on') && ftWin === null);
      } finally {
        closeViewer();
        page.items = keep;
        await render();
      }
    });

    /* ---- reading a slide deck off the disk, and walking it ---- */
    await stage('slides', async function () {
      /* Same trick as the workbook above: a real .pptx written here, byte by
         byte, stored rather than deflated. It carries a master, a layout, a
         theme, two slides, a picture, a table, a group, freehand geometry, a
         Symbol run, a slide-number field and a page of notes — which between
         them is most of what a deck is made of. */
      function zipStore(files) {
        var enc = new TextEncoder(), parts = [], cd = [], off = 0;
        files.forEach(function (f) {
          var nm = enc.encode(f.name), data = f.bytes || enc.encode(f.text);
          var lh = new Uint8Array(30 + nm.length), v = new DataView(lh.buffer);
          v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(8, 0, true);
          v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
          v.setUint16(26, nm.length, true);
          lh.set(nm, 30);
          parts.push(lh, data);
          var ch = new Uint8Array(46 + nm.length), w = new DataView(ch.buffer);
          w.setUint32(0, 0x02014b50, true); w.setUint16(10, 0, true);
          w.setUint32(20, data.length, true); w.setUint32(24, data.length, true);
          w.setUint16(28, nm.length, true); w.setUint32(42, off, true);
          ch.set(nm, 46);
          cd.push(ch);
          off += lh.length + data.length;
        });
        var len = cd.reduce(function (s, c) { return s + c.length; }, 0);
        var end = new Uint8Array(22), e = new DataView(end.buffer);
        e.setUint32(0, 0x06054b50, true);
        e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
        e.setUint32(12, len, true); e.setUint32(16, off, true);
        return new Blob(parts.concat(cd, [end]));
      }
      /* a real picture, drawn here so it is one the browser can certainly decode */
      var cv = document.createElement('canvas');
      cv.width = cv.height = 8;
      var g2 = cv.getContext('2d');
      g2.fillStyle = '#c0392b'; g2.fillRect(0, 0, 8, 8);
      var b64 = cv.toDataURL('image/png').split(',')[1], bin = atob(b64);
      var pngBytes = new Uint8Array(bin.length);
      for (var bi = 0; bi < bin.length; bi++) pngBytes[bi] = bin.charCodeAt(bi);

      var P = ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
              ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"' +
              ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
      var RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
      var rels = function (list) {
        return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          list.map(function (r) {
            return '<Relationship Id="' + r[0] + '" Type="' + RT + r[1] + '" Target="' + r[2] + '"/>';
          }).join('') + '</Relationships>';
      };
      var nvsp = function (id, name, ph) {
        return '<p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr/>' +
          '<p:nvPr>' + (ph || '') + '</p:nvPr></p:nvSpPr>';
      };
      var xfrm = function (x, y, cx, cy) {
        return '<a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>';
      };
      var deck = zipStore([
        { name: '[Content_Types].xml', text: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
        { name: '_rels/.rels', text: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
        { name: 'ppt/presentation.xml', text: '<p:presentation' + P + '>' +
          '<p:sldMasterIdLst><p:sldMasterId id="21" r:id="rId1"/></p:sldMasterIdLst>' +
          '<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst>' +
          '<p:sldSz cx="12192000" cy="6858000"/>' +
          '<p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:defaultTextStyle>' +
          '</p:presentation>' },
        { name: 'ppt/_rels/presentation.xml.rels', text: rels([
          ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
          ['rId2', 'slide', 'slides/slide1.xml'],
          ['rId3', 'slide', 'slides/slide2.xml']]) },
        { name: 'ppt/theme/theme1.xml', text: '<a:theme' + P + ' name="T"><a:themeElements>' +
          '<a:clrScheme name="c">' +
          '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
          '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
          '<a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
          '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
          '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
          '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
          '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
          '</a:clrScheme>' +
          '<a:fontScheme name="f"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont>' +
          '<a:minorFont><a:latin typeface="Verdana"/></a:minorFont></a:fontScheme>' +
          '<a:fmtScheme name="s"><a:fillStyleLst>' +
          '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
          '<a:solidFill><a:schemeClr val="phClr"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr></a:solidFill>' +
          '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
          '<a:lnStyleLst><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
          '<a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
          '<a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
          '<a:effectStyleLst/><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
          '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>' },
        { name: 'ppt/slideMasters/slideMaster1.xml', text: '<p:sldMaster' + P + '><p:cSld>' +
          '<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg>' +
          '<p:spTree>' +
          '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
          /* furniture the designer drew: a band across the top */
          '<p:sp>' + nvsp(2, 'band') + '<p:spPr>' + xfrm(0, 0, 12192000, 127000) +
          '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
          '<a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>' +
          /* the title placeholder: position and type live here, words never do */
          '<p:sp>' + nvsp(3, 'Title', '<p:ph type="title"/>') + '<p:spPr>' +
          xfrm(838200, 365125, 10515600, 1325563) + '</p:spPr>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>' +
          '<p:sp>' + nvsp(4, 'Body', '<p:ph type="body" idx="1"/>') + '<p:spPr>' +
          xfrm(838200, 1825625, 10515600, 4351338) + '</p:spPr>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>' +
          /* a footer with real words in it, which PowerPoint still does not put
             on a slide that has no footer of its own */
          '<p:sp>' + nvsp(5, 'Footer', '<p:ph type="ftr" idx="10"/>') + '<p:spPr>' +
          xfrm(838200, 6356350, 3000000, 365125) + '</p:spPr>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en"/>' +
          '<a:t>MASTERFOOTER</a:t></a:r></a:p></p:txBody></p:sp>' +
          '</p:spTree></p:cSld>' +
          '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"' +
          ' accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"' +
          ' hlink="hlink" folHlink="folHlink"/>' +
          '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400" b="1">' +
          '<a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:latin typeface="+mj-lt"/>' +
          '</a:defRPr></a:lvl1pPr></p:titleStyle>' +
          '<p:bodyStyle>' +
          '<a:lvl1pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/>' +
          '<a:defRPr sz="2000"/></a:lvl1pPr>' +
          '<a:lvl2pPr marL="742950" indent="-285750"><a:buFont typeface="Wingdings"/><a:buChar char="n"/>' +
          '<a:defRPr sz="1600"/></a:lvl2pPr></p:bodyStyle>' +
          '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>' +
          '</p:txStyles></p:sldMaster>' },
        { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', text: rels([
          ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
          ['rId2', 'theme', '../theme/theme1.xml']]) },
        { name: 'ppt/slideLayouts/slideLayout1.xml', text: '<p:sldLayout' + P + '><p:cSld><p:spTree>' +
          '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
          '<p:sp>' + nvsp(2, 'Title', '<p:ph type="title"/>') + '<p:spPr/>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>' +
          '<p:sp>' + nvsp(3, 'Body', '<p:ph type="body" idx="1"/>') + '<p:spPr/>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>' +
          '</p:spTree></p:cSld></p:sldLayout>' },
        { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', text: rels([
          ['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
        { name: 'ppt/slides/slide1.xml', text: '<p:sld' + P + '><p:cSld><p:spTree>' +
          '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
          /* a title with no position and no size of its own: both are inherited */
          '<p:sp>' + nvsp(2, 'Title 1', '<p:ph type="title"/>') + '<p:spPr/>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en"/>' +
          '<a:t>Hello slides</a:t></a:r></a:p></p:txBody></p:sp>' +
          /* two bullet levels, and a run set in Symbol */
          '<p:sp>' + nvsp(3, 'Body 2', '<p:ph type="body" idx="1"/>') + '<p:spPr/>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/>' +
          '<a:p><a:r><a:rPr lang="en"/><a:t>First point</a:t></a:r></a:p>' +
          '<a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en"/><a:t>Second point</a:t></a:r></a:p>' +
          '<a:p><a:r><a:rPr lang="en"><a:latin typeface="Symbol"/></a:rPr><a:t>b</a:t></a:r>' +
          '<a:r><a:rPr lang="en" b="1" sz="1200"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>' +
          '</a:rPr><a:t> is beta</a:t></a:r></a:p>' +
          '</p:txBody></p:sp>' +
          /* a picture */
          '<p:pic><p:nvPicPr><p:cNvPr id="4" name="pic"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>' +
          '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
          '<p:spPr>' + xfrm(6096000, 2286000, 2286000, 1524000) +
          '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
          /* a group whose children are drawn in half-size coordinates */
          '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="grp"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
          '<p:grpSpPr><a:xfrm><a:off x="1270000" y="4572000"/><a:ext cx="1270000" cy="1270000"/>' +
          '<a:chOff x="0" y="0"/><a:chExt cx="635000" cy="635000"/></a:xfrm></p:grpSpPr>' +
          '<p:sp>' + nvsp(6, 'inner') + '<p:spPr>' + xfrm(0, 0, 635000, 635000) +
          '<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>' +
          '<a:solidFill><a:srgbClr val="00A08A"/></a:solidFill></p:spPr></p:sp></p:grpSp>' +
          /* freehand geometry, and a dashed line with an arrow on the end */
          '<p:sp>' + nvsp(7, 'free') + '<p:spPr>' + xfrm(3810000, 4572000, 1270000, 635000) +
          '<a:custGeom><a:pathLst><a:path w="100" h="100">' +
          '<a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="50"/></a:lnTo>' +
          '<a:lnTo><a:pt x="0" y="100"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>' +
          '<a:solidFill><a:schemeClr val="accent2"/></a:solidFill>' +
          '<a:ln w="19050"><a:solidFill><a:srgbClr val="333333"/></a:solidFill>' +
          '<a:prstDash val="dash"/><a:tailEnd type="triangle"/></a:ln></p:spPr></p:sp>' +
          '</p:spTree></p:cSld></p:sld>' },
        { name: 'ppt/slides/_rels/slide1.xml.rels', text: rels([
          ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
          ['rId2', 'image', '../media/pic1.png'],
          ['rId3', 'notesSlide', '../notesSlides/notesSlide1.xml']]) },
        { name: 'ppt/slides/slide2.xml', text: '<p:sld' + P + '><p:cSld><p:spTree>' +
          '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
          '<p:sp>' + nvsp(2, 'Title 1', '<p:ph type="title"/>') + '<p:spPr/>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en"/>' +
          '<a:t>The table</a:t></a:r></a:p></p:txBody></p:sp>' +
          /* the page number, which is a field rather than a number */
          '<p:sp>' + nvsp(3, 'Num', '<p:ph type="sldNum" idx="12"/>') + '<p:spPr>' +
          xfrm(10000000, 6356350, 1000000, 365125) + '</p:spPr>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="{1}" type="slidenum">' +
          '<a:t>#</a:t></a:fld></a:p></p:txBody></p:sp>' +
          '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="tbl"/>' +
          '<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
          '<p:xfrm><a:off x="1270000" y="2540000"/><a:ext cx="5080000" cy="1270000"/></p:xfrm>' +
          '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
          '<a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="2540000"/><a:gridCol w="2540000"/></a:tblGrid>' +
          '<a:tr h="635000"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en"/><a:t>Run</a:t></a:r></a:p>' +
          '</a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en"/>' +
          '<a:t>Mass</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>' +
          '<a:tr h="635000"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en"/><a:t>one</a:t></a:r></a:p>' +
          '</a:txBody><a:tcPr><a:solidFill><a:srgbClr val="EEEEEE"/></a:solidFill></a:tcPr></a:tc>' +
          '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en"/><a:t>2.7</a:t></a:r></a:p></a:txBody>' +
          '<a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>' +
          '</p:spTree></p:cSld></p:sld>' },
        { name: 'ppt/slides/_rels/slide2.xml.rels', text: rels([
          ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
        { name: 'ppt/notesSlides/notesSlide1.xml', text: '<p:notes' + P + '><p:cSld><p:spTree>' +
          '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
          '<p:sp>' + nvsp(2, 'Notes', '<p:ph type="body" idx="1"/>') + '<p:spPr/>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en"/>' +
          '<a:t>Say hello and smile</a:t></a:r></a:p></p:txBody></p:sp>' +
          '</p:spTree></p:cSld></p:notes>' },
        { name: 'ppt/notesSlides/_rels/notesSlide1.xml.rels', text: rels([
          ['rId1', 'slide', '../slides/slide1.xml']]) },
        { name: 'ppt/media/pic1.png', bytes: pngBytes }
      ]);
      var file = new File([deck], 'talk.pptx');

      /* ---- what it is, without opening it ---- */
      ok('pptx: a .pptx is a deck', pptxKind(file) === 'pptx', pptxKind(file));
      ok('pptx: the old binary .ppt is recognised, not read',
        pptxKind({ name: 'old.ppt' }) === 'ppt', pptxKind({ name: 'old.ppt' }));
      ok('pptx: a picture is not a deck', pptxKind({ name: 'x.png' }) === null);

      /* ---- the deck ---- */
      var D = await pptxRead(file);
      ok('pptx: two slides', D.count === 2, D.count);
      ok('pptx: 16:9 measured in points', D.w === 960 && D.h === 540, D.w + '×' + D.h);
      var S1 = await D.slide(0);
      var svg = S1.svg;
      ok('pptx: the slide draws as one svg in slide points',
        /^<svg [^>]*viewBox="0 0 960 540"/.test(svg), svg.slice(0, 90));
      ok('pptx: nothing came out NaN', !/NaN|undefined/.test(svg),
        (svg.match(/[^"]{0,40}(NaN|undefined)[^"]{0,40}/) || [''])[0]);

      /* the title: its words are on the slide, everything else is inherited —
         the size and weight from the master's title style, the colour from the
         theme through the master's colour map, the face from the font scheme */
      ok('pptx: the title is drawn', svg.indexOf('>Hello slides</tspan>') > 0);
      var title = (svg.match(/<text[^>]*>[^<]*<tspan[^>]*>Hello slides/) || [''])[0] ||
                  (svg.match(/<text[^>]*font-size="44"[^>]*>/) || [''])[0];
      ok('pptx: at the master\'s 44pt', /font-size="44"/.test(svg), title);
      ok('pptx: in the theme\'s accent1, mapped through the master',
        /fill="#4472c4"/.test(svg), (svg.match(/fill="#[0-9a-f]{6}"/g) || []).join(' '));
      ok('pptx: set in the theme\'s major font', /font-family="Georgia[^"]*"/.test(svg),
        (svg.match(/font-family="[^"]*"/g) || []).slice(0, 3).join(' '));
      ok('pptx: bold, because the master says titles are',
        /font-weight="700"/.test(svg));

      /* the master's own drawing comes through; its empty placeholders do not */
      ok('pptx: the master\'s band is drawn', /M0 0 L960 0 L960 10 L0 10Z/.test(svg),
        (svg.match(/<path d="M0 0[^"]{0,40}/) || [''])[0]);
      ok('pptx: but the master\'s footer is not — a slide without one shows none',
        svg.indexOf('MASTERFOOTER') < 0);

      /* bullets, including the one written in a font nobody has */
      ok('pptx: the first level wears the master\'s bullet', svg.indexOf('•') > 0);
      ok('pptx: a Wingdings bullet is said in letters this machine has',
        svg.indexOf('■') > 0, 'no ■');
      ok('pptx: a Symbol run comes out Greek', svg.indexOf('β') > 0, 'no β');
      ok('pptx: a run keeps its own colour and size',
        /fill="#ff0000"/.test(svg) && /font-size="12"/.test(svg));

      /* pictures, groups, freehand geometry and lines */
      ok('pptx: the picture is drawn from the deck\'s own media',
        /<image href="blob:/.test(svg), (svg.match(/<image[^>]{0,60}/) || [''])[0]);
      ok('pptx: a group maps its children into its own space',
        /transform="translate\(100 360\) scale\(2 2\)/.test(svg),
        (svg.match(/transform="translate\([^"]*scale[^"]*"/g) || []).join(' '));
      ok('pptx: freehand geometry draws its path',
        /d="M0 0L100 25L0 50Z"/.test(svg), (svg.match(/d="M0 0[^"]*"/g) || []).join(' '));
      ok('pptx: a dashed line keeps its dashes and its arrow',
        /stroke-dasharray="6 4.5"/.test(svg) && /marker-end="url\(#/.test(svg),
        (svg.match(/stroke-dasharray="[^"]*"/) || [''])[0]);
      ok('pptx: a rounded rectangle really is rounded', /A[\d.]+ [\d.]+ 0 0 1/.test(svg));

      /* what the slide is called, and what was said over it */
      ok('pptx: the slide is named after its title', S1.title === 'Hello slides', S1.title);
      ok('pptx: the notes come through', S1.notes === 'Say hello and smile', JSON.stringify(S1.notes));

      /* the second slide: a field that is a number, and a table */
      var S2 = await D.slide(1);
      ok('pptx: a slide-number field says which slide it is on',
        />2<\/tspan>/.test(S2.svg), (S2.svg.match(/<tspan[^>]*>[^<]*<\/tspan>/g) || []).join(' ').slice(0, 160));
      ok('pptx: a table draws its cells', S2.svg.indexOf('>Run</tspan>') > 0 &&
        S2.svg.indexOf('>2.7</tspan>') > 0);
      ok('pptx: and a cell keeps its own fill', /fill="#eeeeee"/.test(S2.svg));
      ok('pptx: the second slide is named too', S2.title === 'The table', S2.title);

      /* a picture of a slide: every image inlined, so an <img> can read it */
      var inl = await D.slide(0, { inline: true });
      ok('pptx: for a picture of it, the pictures inside go inline',
        /<image href="data:image\/png;base64,/.test(inl.svg));
      var png = await pptxRaster(inl.svg, D.w, D.h, 320, 'image/png');
      ok('pptx: and it rasters', /^data:image\/png;base64,/.test(png) && png.length > 500,
        png.slice(0, 24) + ' ' + png.length);

      /* ---- the card on the page ---- */
      var page = sheet(), keep = page.items.slice();
      page.items = [];
      await render();
      ok('drop: a deck is claimed by the slides feature',
        ITEMS.slides.takes([file], { x: 6, y: 8 }, page) === true);
      await waitFor(function () { return page.items.length === 1; }, 15000);
      var it = page.items[0];
      ok('slides: it lands as a slides item', it.type === 'slides', it.type);
      ok('slides: knowing how long it is and what shape',
        it.n === 2 && Math.abs(it.ar - 16 / 9) < 1e-6, it.n + ' @ ' + it.ar);
      var el = await waitFor(function () { return byType('slides'); }, 8000);
      await waitFor(function () { return el.querySelector('.slreel svg'); }, 15000);
      ok('slides: the card draws the slide itself', !!el.querySelector('.slreel svg text'));
      ok('slides: with the position under it', el.querySelector('.slpos').textContent === '1 / 2',
        el.querySelector('.slpos').textContent);
      ok('slides: and a rail as long as one slide of the deck',
        el.querySelector('.slrail i').style.width === '50%', el.querySelector('.slrail i').style.width);

      /* stepping */
      el.querySelector('.slnav[data-a="next"]').click();
      await waitFor(function () { return it.i === 1; }, 8000);
      ok('slides: the arrow walks the deck', it.i === 1 &&
        el.querySelector('.slpos').textContent === '2 / 2', el.querySelector('.slpos').textContent);
      ok('slides: and the far end is the end', (slStep(el, it, page, 1), it.i === 1), it.i);
      ok('slides: the second slide is on the card',
        el.querySelector('.slreel svg').innerHTML.indexOf('The table') > 0);

      /* the still print, the overview and an export take */
      await waitFor(function () { return it.poster; }, 15000);
      ok('slides: it keeps a still of the slide it is showing',
        /^data:image\/(png|jpeg)/.test(it.poster) && it.pi === 1, (it.poster || '').slice(0, 20));
      var stat = buildPage(page, false, {});
      ok('static: a deck prints as its still',
        !!stat.querySelector('.item[data-type="slides"] img.slstill'));
      ok('static: with no controls on it',
        !stat.querySelector('.item[data-type="slides"] .slnav'));
      ok('slides: a deck stays out of an exported book, like a model',
        ITEMS.slides.stream === false);

      /* ---- the reader ---- */
      openSlides(it, page, 700, 400);
      await waitFor(function () { return SV && SV.D; }, 15000);
      ok('reader: it opens on the slide the card was showing', SV.i === 1, SV.i);
      ok('reader: the deck is named in its bar',
        Q('#sview .svnm').textContent === 'talk.pptx', Q('#sview .svnm').textContent);
      ok('reader: with a thumbnail per slide', QA('#sview .svth').length === 2,
        QA('#sview .svth').length);
      await waitFor(function () { return Q('#sview .svfr.c svg'); }, 8000);
      ok('reader: and the slide itself on the stage', !!Q('#sview .svfr.c svg text'));
      svGo(-1);
      await waitFor(function () { return SV.i === 0; }, 8000);
      ok('reader: ← walks back a slide', SV.i === 0 && Q('#sview .svpos').textContent === '1 / 2',
        Q('#sview .svpos').textContent);
      ok('reader: and the card follows it home', it.i === 0, it.i);
      svGo(-1);
      await sleep(120);
      ok('reader: there is nothing before the first slide', SV.i === 0, SV.i);
      /* all of them at once */
      svMode('grid');
      await sleep(200);
      ok('reader: the grid shows every slide', QA('#sview .svtile').length === 2 &&
        Q('#sview').classList.contains('showall'), QA('#sview .svtile').length);
      await waitFor(function () { return QA('#sview .svtile svg').length === 2; }, 8000);
      ok('reader: and draws them', QA('#sview .svtile svg').length === 2);
      svJump(1);
      await sleep(150);
      ok('reader: clicking one goes to it and leaves the grid',
        SV.i === 1 && !Q('#sview').classList.contains('showall'), SV.i);
      /* the notes, and the zoom */
      svNotes(true);
      await sleep(60);
      svJump(0);
      await sleep(120);
      ok('reader: the notes are the ones written under that slide',
        Q('#sview .svnotes p').textContent === 'Say hello and smile',
        Q('#sview .svnotes p').textContent);
      svZoomTo(2.5, 700, 400);
      await waitFor(function () { return !SV.z.active; }, 5000);
      ok('reader: it zooms into the slide', Q('#sview .svzoom').textContent === '250%',
        Q('#sview .svzoom').textContent);
      ok('reader: a zoomed slide is scaled, not redrawn bigger',
        /scale\(2\.5/.test(Q('#sview .svfr.c').style.transform), Q('#sview .svfr.c').style.transform);
      svFit();
      await waitFor(function () { return !SV.z.active; }, 5000);
      ok('reader: and fits it back', Math.round(SV.z.value * 100) === 100, SV.z.value);
      /* a slide, taken out as a picture */
      var pic = await svPicture(400);
      ok('reader: a slide comes out as a picture', /^data:image\/(png|jpeg);base64,/.test(pic),
        (pic || '').slice(0, 24));
      var before = page.items.length;
      await svToPage();
      await waitFor(function () { return page.items.length === before + 1; }, 15000);
      var shot = page.items[page.items.length - 1];
      ok('reader: and lands on the page as a picture', shot.type === 'image' &&
        /^data:image/.test(shot.src), shot.type);
      ok('reader: named after the slide it came from',
        /slide 1/.test(shot.name) && shot.cap === 'Hello slides', shot.name + ' / ' + shot.cap);
      ok('reader: taking one out closes the reader', !SV);
      /* and Escape puts it away */
      openSlides(it, page);
      await waitFor(function () { return SV && SV.D; }, 15000);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(function () { return !SV; }, 4000);
      ok('reader: Escape closes it', !SV && !Q('#sview').classList.contains('on'));

      page.items = keep;
      await render();
    });

    /* ---- a table plotted in a coordinate system ---- */
    await stage('table → plot', async function () {
      var page = sheet();
      var keep = page.items.slice();
      var tab = {
        id: uid(), x: 4, y: 4, w: 40, rot: 0, z: 1, lay: curLayerId(),
        type: 'table', fs: 15, head: 1, ts: 'lines', fmt: {}, cap: '',
        rows: [['Time', 'Height', 'err'],
               ['1', '10', '0.5'],
               ['2', '18', '1'],
               ['3', '31', '1.5'],
               ['mean', '=AVG(B2:B4)', '']],
        cw: [1 / 3, 1 / 3, 1 / 3], al: ['l', 'r', 'r']
      };
      var plt = {
        id: uid(), x: 50, y: 4, w: 44, rot: 0, z: 2, lay: curLayerId(),
        type: 'plot', xmin: -5, xmax: 5, ymin: -3.4, ymax: 3.4, grid: 'solid',
        axes: 1, bshow: 0, basis: [1, 0, 0, 1], cap: '', fns: [], vecs: []
      };
      page.items = [tab, plt];
      await render();

      /* the columns it offers, and which ones it starts on */
      ok('plot⊂table: the headings name the columns',
        tbColNames(tab).join('|') === 'Time|Height|err', tbColNames(tab).join('|'));
      ok('plot⊂table: it spots the number columns',
        tbNumericCols(tab).join(',') === '0,1,2', tbNumericCols(tab).join(','));

      var d = plotAddTable({ it: plt, page: page }, tab);
      ok('plot⊂table: the plot has a series', datOf(plt).length === 1);
      ok('plot⊂table: x and y start on the first two number columns',
        d.xc === 0 && d.yc === 1, d.xc + ',' + d.yc);
      ok('plot⊂table: the header row is not a point and nor is a word',
        d.pts.length === 3, JSON.stringify(d.pts));
      ok('plot⊂table: the points are the cells', d.pts[0][0] === 1 && d.pts[0][1] === 10 &&
        d.pts[2][0] === 3 && d.pts[2][1] === 31, JSON.stringify(d.pts));
      ok('plot⊂table: the headings become the axis labels', d.xl === 'Time' && d.yl === 'Height',
        d.xl + ' / ' + d.yl);
      ok('plot⊂table: and the series is named after y', d.lab === 'Height', d.lab);

      /* error bars off a third column */
      d.ey = 2; tbSeriesSync(d);
      ok('plot⊂table: an error column comes through', d.pts[0][3] === 0.5 && d.pts[2][3] === 1.5,
        JSON.stringify(d.pts));
      /* the row number is always available as x */
      d.xc = -1; tbSeriesSync(d);
      ok('plot⊂table: row # works as x', d.pts[0][0] === 1 && d.pts[2][0] === 3 && d.xl === 'row',
        JSON.stringify(d.pts) + ' ' + d.xl);
      d.xc = 0; tbSeriesSync(d);

      /* a plot handed a table becomes a chart: its picture keeps a shape of its
         own instead of taking one from what the columns are measured in */
      ok('plot⊂table: it turns into a chart', plt.ar > 0, plt.ar);
      ok('plot⊂table: the picture keeps that shape',
        Math.abs(plotGeom(plt).H / plotGeom(plt).W - plt.ar) < 1e-9,
        plotGeom(plt).H + ' / ' + plotGeom(plt).W);
      var plane = { xmin: -5, xmax: 5, ymin: -3.4, ymax: 3.4, basis: [1, 0, 0, 1] };
      ok('plot⊂table: a plane still takes its shape from its window',
        Math.abs(plotGeom(plane).H - 680) < 1, plotGeom(plane).H);
      ok('plot⊂table: and a square of it is still square',
        Math.abs(plotGeom(plane).kx - plotGeom(plane).ky) < 1e-9,
        plotGeom(plane).kx + ' vs ' + plotGeom(plane).ky);
      /* seconds and metres want a tick step each */
      ok('plot⊂table: the axes are stepped apart', axisStep(2.4, 1000, 130) !== axisStep(31, 680, 72),
        axisStep(2.4, 1000, 130) + ' / ' + axisStep(31, 680, 72));
      ok('plot⊂table: and the numbers are given room',
        31 / axisStep(31, 680, 72) * 72 <= 680, axisStep(31, 680, 72));

      /* the window walks over to the numbers — nothing here is inside ±5 */
      plotFitData(plt);
      ok('plot⊂table: the view fits the points',
        plt.xmin < 1 && plt.xmax > 3 && plt.ymin < 9.5 && plt.ymax > 32.5,
        [plt.xmin, plt.xmax, plt.ymin, plt.ymax].join(', '));

      mrepaint(plt);
      var pel = byType('plot');
      /* ---- a chart is drawn inside a margin, and everything written on it
              goes out there: numbers under the frame and beside it, never over
              the readings ---- */
      var gg = plotGeom(plt);
      ok('chart: it carries a margin', gg.mL > 60 && gg.mB > 60 && gg.VW > gg.W && gg.VH > gg.H,
        [gg.mL, gg.mR, gg.mT, gg.mB].join(','));
      ok('chart: a plane carries none', plotGeom(plane).mL === 0 && plotGeom(plane).VW === 1000,
        plotGeom(plane).mL + ' ' + plotGeom(plane).VW);
      ok('chart: the viewBox opens out around the picture',
        pel.querySelector('svg.mplot').getAttribute('viewBox') ===
          (-gg.mL) + ' ' + (-gg.mT) + ' ' + gg.VW + ' ' + gg.VH,
        pel.querySelector('svg.mplot').getAttribute('viewBox'));
      ok('chart: it is marked as one', pel.querySelector('svg.mplot').classList.contains('chart'));
      var nums = [].slice.call(pel.querySelectorAll('.mnum'));
      ok('chart: there are numbers on both axes', nums.length > 3, nums.length + ' numbers');
      ok('chart: none of them is written over the plotting area',
        nums.every(function (n) {
          var x = +n.getAttribute('x'), y = +n.getAttribute('y');
          return y > gg.H || x < 0;
        }), nums.map(function (n) { return n.getAttribute('x') + ',' + n.getAttribute('y'); }).join(' '));
      ok('chart: and none of them falls outside the picture',
        nums.every(function (n) {
          var x = +n.getAttribute('x'), y = +n.getAttribute('y');
          return x > -gg.mL && x < gg.W + gg.mR && y > -gg.mT && y < gg.H + gg.mB;
        }));
      ok('plot⊂table: and no 0 is claimed where there is none',
        [].slice.call(pel.querySelectorAll('.mnum')).every(function (n) {
          return n.textContent !== '0';
        }));
      ok('plot⊂table: the points are drawn', pel.querySelectorAll('circle.mdot').length === 3,
        pel.querySelectorAll('circle.mdot').length + ' marks');
      ok('plot⊂table: the error bars are drawn', !!pel.querySelector('path.mdeb'));
      ok('plot⊂table: no line until it is asked for', !pel.querySelector('path.mdline'));
      d.m = 'both'; mrepaint(plt);
      pel = byType('plot');
      ok('plot⊂table: joining them up draws the line', !!pel.querySelector('path.mdline'));
      ok('plot⊂table: and keeps the marks', pel.querySelectorAll('circle.mdot').length === 3);
      ok('plot⊂table: the axis labels are on the picture',
        (pel.querySelector('.mxlab') || {}).textContent === 'Time' &&
        (pel.querySelector('.mylab') || {}).textContent === 'Height');
      /* ---- and they are set the way plt.xlabel sets them ---- */
      var xl = pel.querySelector('.mxlab'), yl = pel.querySelector('.mylab');
      ok('label: the x one is centred on the axis',
        Math.abs(+xl.getAttribute('x') - gg.W / 2) < 1, xl.getAttribute('x'));
      ok('label: …below the frame, clear of the readings',
        +xl.getAttribute('y') > gg.H && +xl.getAttribute('y') < gg.H + gg.mB,
        xl.getAttribute('y') + ' of ' + (gg.H + gg.mB));
      ok('label: …and really centred, not just placed there',
        getComputedStyle(xl).textAnchor === 'middle', getComputedStyle(xl).textAnchor);
      var tf = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(-90\)/.exec(yl.getAttribute('transform') || '');
      ok('label: the y one reads up the side of it', !!tf, yl.getAttribute('transform'));
      ok('label: centred on that axis, and outside the frame',
        tf && Math.abs(+tf[2] - gg.H / 2) < 1 && +tf[1] < 0 && +tf[1] > -gg.mL,
        tf && tf[1] + ',' + tf[2]);
      ok('label: every series names the axis, not just the first',
        datLabels({ dat: [{ xl: 't', yl: 'a' }, { xl: 't', yl: 'b' }] }).y === 'a, b' &&
        datLabels({ dat: [{ xl: 't', yl: 'a' }, { xl: 't', yl: 'b' }] }).x === 't',
        datLabels({ dat: [{ xl: 't', yl: 'a' }, { xl: 't', yl: 'b' }] }).y);

      /* a spreadsheet's worth of points is one element, not a hundred thousand */
      var many = { ar: 0.68, xmin: 0, xmax: 100, ymin: 0, ymax: 100, axes: 1,
                   dat: [{ id: 'z', c: '#123456', m: 'dots', pts: [] }] };
      for (var q = 0; q < 1500; q++) many.dat[0].pts.push([q / 15, q % 97, 0, 0]);
      var svg = plotInner(many, true);
      ok('chart: a spreadsheet of points goes down as one path',
        svg.indexOf('class="mdots"') > 0 && !/circle class="mdot"/.test(svg));
      ok('chart: …and without a grab handle each', !/mgrab/.test(svg));
      many.dat[0].pts.length = 40;
      ok('chart: a readable number of them stays one mark each',
        /circle class="mdot"/.test(plotInner(many, true)));
      ok('plot⊂table: the key knows about it', /Height/.test(pel.querySelector('.mleg').textContent),
        pel.querySelector('.mleg').textContent);

      /* the two are connected: change the table, the plot follows */
      tab.rows[1][1] = '99';
      tbSync(tab);
      ok('plot⊂table: editing a cell moves the point', datOf(plt)[0].pts[0][1] === 99,
        JSON.stringify(datOf(plt)[0].pts[0]));
      /* …including through a formula, and through a row being inserted */
      tbInsRow(tab, 1);
      tbSync(tab);
      ok('plot⊂table: an inserted blank row is not a point', datOf(plt)[0].pts.length === 3,
        JSON.stringify(datOf(plt)[0].pts));
      tbDelRow(tab, 1);
      tbSync(tab);

      /* clicking a point picks the series it belongs to. Both of these repaint
         the plot, so the mark is looked up after them or it is a detached node */
      setMath(true);
      selectMath(null, null);
      var mark = byType('plot').querySelector('.mgrab[data-h^="dat:"]');
      ok('plot⊂table: the points are something to click', !!mark);
      if (mark) {
        mark.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
        ok('plot⊂table: clicking one picks the series',
          !!mathSel && mathSel.kind === 'dat' && mathSel.id === d.id, JSON.stringify(mathSel));
      }
      setMath(false);

      /* the options chip, and picking a column in it */
      selectMath(plt.id, 'dat', d.id);
      pel = byType('plot');
      var chip = pel.querySelector('.mchip.mdat');
      ok('plot⊂table: the options come up on it', !!chip);
      if (chip) {
        var xs = chip.querySelector('select[data-k="xc"]');
        ok('plot⊂table: the x picker lists row # and every column',
          xs && xs.options.length === 4, xs ? xs.options.length : 'none');
        ok('plot⊂table: and is on the column in use', xs && xs.value === '0', xs && xs.value);
        ok('plot⊂table: the error picker offers none',
          chip.querySelector('select[data-k="ey"]').options[0].value === '-2');
        /* picking another column really moves the points */
        xs.value = '1';
        xs.dispatchEvent(new Event('change', { bubbles: true }));
        ok('plot⊂table: choosing a column re-reads the table',
          d.xc === 1 && d.pts[0][0] === 99, d.xc + ' ' + JSON.stringify(d.pts[0]));
        /* both columns numeric now, so the =AVG summary row is a point like any
           other — put x back on the one with a word in it and it drops out */
        ok('plot⊂table: a summary row counts when both its cells are numbers',
          d.pts.length === 4, d.pts.length + ' points');
        d.xc = 0;
        xs.value = '0';
        tbSeriesSync(d);
        mrepaint(plt);
      }

      /* it survives the path print and an export take */
      var st = buildPage(page, false, {});
      ok('plot⊂table: the series survives the static path',
        st.querySelectorAll('.item[data-type="plot"] circle.mdot').length === 3,
        st.querySelectorAll('.item[data-type="plot"] circle.mdot').length + ' marks');
      ok('plot⊂table: with its axis labels', !!st.querySelector('.item[data-type="plot"] .mxlab'));

      /* the drop itself: this is the call core/drag.js makes when a table is
         let go over a plot, and MATH_CARD is what lets it be dragged there */
      ok('plot⊂table: a table may be dropped on a plot', !!MATH_CARD.table);
      var home = { x: tab.x, y: tab.y };
      tab.x = 30; tab.y = 30;
      doMathDrop(page, tab, { el: null, it: plt, page: page, math: {} }, home);
      ok('plot⊂table: dropping one adds a second series', datOf(plt).length === 2,
        datOf(plt).length);
      ok('plot⊂table: and the table goes back where it came from',
        tab.x === home.x && tab.y === home.y, tab.x + ',' + tab.y);
      datOf(plt).pop();

      /* Delete takes the series off the plot, not the plot off the page */
      selectMath(plt.id, 'dat', d.id);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      ok('plot⊂table: Delete takes the series off', datOf(plt).length === 0 &&
        page.items.length === 2, datOf(plt).length + ' left, ' + page.items.length + ' items');

      selectMath(null, null);

      /* the wheel zooms the plane it is over, maths bar or no maths bar */
      setMath(false);
      var svg = byType('plot').querySelector('svg.mplot');
      var rect = svg.getBoundingClientRect();
      var turn = function (dy, extra) {
        var o = { deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true,
                  clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
        for (var k in (extra || {})) o[k] = extra[k];
        svg.dispatchEvent(new WheelEvent('wheel', o));
      };
      var span = function () { return plt.xmax - plt.xmin; };
      var was = span();
      turn(-120);
      ok('plot wheel: it zooms in with the maths bar away', span() < was * 0.95,
        was + ' → ' + span());
      var inAt = span();
      turn(120); turn(120);
      ok('plot wheel: and back out again', span() > inAt * 1.05, inAt + ' → ' + span());
      /* a notch is about the 12% it always was */
      var one = span();
      turn(-120);
      ok('plot wheel: a notch is a notch', Math.abs(one / span() - 1.128) < 0.02, one / span());
      /* …and the two ways past it still work */
      var held = span();
      turn(-120, { ctrlKey: true });
      ok('plot wheel: ctrl+wheel is left to the desk', span() === held, held + ' → ' + span());
      PLOT_MOVE.add(plt.id);
      turn(-120);
      ok('plot wheel: a plot being moved lets it through', span() === held, held + ' → ' + span());
      PLOT_MOVE.delete(plt.id);

      page.items = keep;
      await render();
    });

    /* ---- nodes: the little dataflow graph wired up on the page ---- */
    await stage('nodes', async function () {
      var page = sheet();
      var keep = page.items.slice();
      var lay = curLayerId();
      var mkNode = function (nk, extra) {
        var n = { id: uid(), type: 'node', nk: nk, x: 4, y: 4, w: 23, rot: 0, z: 1, lay: lay,
                  cap: '', in: [], op: '×', k: 2, expr: '', v: 1, lo: 0, hi: 10, rgb: [207, 58, 36] };
        for (var q in (extra || {})) n[q] = extra[q];
        return n;
      };
      var tab = {
        id: uid(), type: 'table', x: 4, y: 4, w: 40, rot: 0, z: 1, lay: lay,
        fs: 15, head: 1, ts: 'lines', fmt: {}, cap: '',
        rows: [['t', 'h', 'note'],
               ['1', '10', 'a'],
               ['2', '20', 'b'],
               ['4', '', 'c']],
        cw: [1 / 3, 1 / 3, 1 / 3], al: ['l', 'r', 'l']
      };
      var pick = mkNode('pick', { in: [tab.id] });
      var math = mkNode('math', { in: [pick.id], op: '×', k: 3 });
      var plt = { id: uid(), type: 'plot', x: 50, y: 40, w: 44, rot: 0, z: 2, lay: lay,
        xmin: -5, xmax: 5, ymin: -3.4, ymax: 3.4, grid: 'solid', axes: 1, bshow: 0,
        basis: [1, 0, 0, 1], cap: '', fns: [], vecs: [], dat: [] };
      page.items = [tab, pick, math, plt];
      await render();

      /* ---- a table, read as something a wire can carry ---- */
      var tv = nodeVal(tab.id);
      ok('node: a table comes out as columns', tv.t === 'tbl' && tv.cols.length === 3, JSON.stringify(tv.t));
      ok('node: the heading row is not data', tv.n === 3, tv.n);
      ok('node: the columns keep their names',
        tv.cols.map(function (c) { return c.name; }).join('|') === 't|h|note',
        tv.cols.map(function (c) { return c.name; }).join('|'));
      ok('node: numbers come through as numbers', tv.cols[0].v.join(',') === '1,2,4', tv.cols[0].v.join(','));
      ok('node: an empty cell is a gap, not a nought', tv.cols[1].v[2] === null, tv.cols[1].v[2]);
      ok('node: and so is a word', tv.cols[2].v.every(function (x) { return x === null; }),
        JSON.stringify(tv.cols[2].v));

      /* ---- the same question twice is worked out once ---- */
      ok('node: the answer is remembered', nodeVal(tab.id) === tv);
      nodeBust();
      ok('node: …until something changes', nodeVal(tab.id) !== tv);

      /* ---- Columns: what is let through, and why it is kept by name ---- */
      ok('node: with nothing ticked everything comes through', nodeVal(pick.id).cols.length === 3);
      pick.keep = ['t', 'h']; nodeBust();
      ok('node: ticking two lets two through',
        nodeVal(pick.id).cols.map(function (c) { return c.name; }).join('|') === 't|h',
        nodeVal(pick.id).cols.map(function (c) { return c.name; }).join('|'));
      /* a column appears on the front of the sheet: the ticks still mean what they meant */
      tbInsCol(tab, 0); tab.rows[0][0] = 'id'; nodeBust();
      ok('node: a column inserted in front does not shift the ticks',
        nodeVal(pick.id).cols.map(function (c) { return c.name; }).join('|') === 't|h',
        nodeVal(pick.id).cols.map(function (c) { return c.name; }).join('|'));
      tbDelCol(tab, 0); nodeBust();
      pick.keep = null; nodeBust();

      /* ---- Arithmetic ---- */
      math.in = [pick.id]; math.op = '×'; math.k = 3; nodeBust();
      var mv = nodeVal(math.id);
      ok('node: × a constant works down the column', mv.cols[0].v.join(',') === '3,6,12',
        mv.cols[0].v.join(','));
      ok('node: and says so in the column name', mv.cols[0].name === 't × 3', mv.cols[0].name);
      ok('node: a gap stays a gap', mv.cols[1].v[2] === null, mv.cols[1].v[2]);
      ok('node: a word column is all gaps, still', mv.cols[2].v[0] === null, mv.cols[2].v[0]);
      math.op = '÷'; math.k = 0; nodeBust();
      ok('node: ÷ 0 leaves a hole rather than an infinity',
        nodeVal(math.id).cols[0].v.every(function (x) { return x === null; }),
        JSON.stringify(nodeVal(math.id).cols[0].v));
      /* a number node in the b socket beats the typed box */
      var num = mkNode('num', { v: 5 });
      page.items.push(num);
      math.op = '×'; math.k = 2; math.in = [pick.id, num.id]; nodeBust();
      ok('node: a wire into b beats what was typed there',
        nodeVal(math.id).cols[0].v.join(',') === '5,10,20', nodeVal(math.id).cols[0].v.join(','));
      num.v = 0.5; nodeBust();
      ok('node: moving the number moves the answer',
        nodeVal(math.id).cols[0].v.join(',') === '0.5,1,2', nodeVal(math.id).cols[0].v.join(','));

      /* two tables: column against column, and a single column spread over the lot */
      var one = mkNode('pick', { in: [tab.id], keep: ['t'] });
      page.items.push(one);
      math.in = [pick.id, one.id]; math.op = '÷'; nodeBust();
      var dv = nodeVal(math.id);
      ok('node: one column divides all of them', dv.cols.length === 3 &&
        dv.cols[1].v.join(',') === '10,10,', dv.cols[1].v.join(','));
      ok('node: and the name says what happened', dv.cols[1].name === 'h ÷ t', dv.cols[1].name);
      var two = mkNode('pick', { in: [tab.id], keep: ['t', 'h'] });
      page.items.push(two);
      math.in = [pick.id, two.id]; nodeBust();
      ok('node: three columns against two is a complaint',
        nodeVal(math.id).t === 'err', JSON.stringify(nodeVal(math.id)));
      ok('node: …and it says which is which',
        /3 columns and b has 2/.test(nodeVal(math.id).msg), nodeVal(math.id).msg);
      math.in = [pick.id]; math.op = '×'; math.k = 3; nodeBust();

      /* ---- Formula ---- */
      var fnn = mkNode('fn', { in: [one.id], expr: 'x^2' });
      page.items.push(fnn);
      nodeBust();
      ok('node: a formula runs down the column',
        nodeVal(fnn.id).cols[0].v.join(',') === '1,4,16', nodeVal(fnn.id).cols[0].v.join(','));
      ok('node: the column is renamed the way you would write it',
        nodeVal(fnn.id).cols[0].name === 't^2', nodeVal(fnn.id).cols[0].name);
      fnn.expr = 'log(x-1)'; nodeBust();
      ok('node: one that comes out infinite leaves a hole rather than a spike',
        nodeVal(fnn.id).cols[0].v[0] === null && nodeVal(fnn.id).cols[0].v[1] === 0,
        JSON.stringify(nodeVal(fnn.id).cols[0].v));
      fnn.expr = 'sin('; nodeBust();
      ok('node: a typo comes back as a sentence',
        nodeVal(fnn.id).t === 'err' && /stops in the middle/.test(nodeVal(fnn.id).msg),
        nodeVal(fnn.id).msg);
      fnn.expr = 'wobble(x)'; nodeBust();
      ok('node: …and an unknown function names itself',
        /wobble is not a function I know/.test(nodeVal(fnn.id).msg), nodeVal(fnn.id).msg);
      fnn.expr = 'x^2'; nodeBust();

      /* ---- a colour, and the wheel it is picked on ---- */
      var col = mkNode('rgb', { rgb: [0, 128, 255] });
      page.items.push(col);
      nodeBust();
      ok('node: a colour comes out as a colour', nodeVal(col.id).t === 'rgb' &&
        nodeVal(col.id).v === '#0080ff', nodeVal(col.id).v);
      /* the wheel keeps its own reading beside the colour, because going round
         through red-green-blue loses the hue at black and at grey */
      ok('wheel: a colour with no reading of its own is worked back out',
        Math.abs(ndHSV(col)[0] - 210) < 0.5 && Math.abs(ndHSV(col)[2] - 1) < 0.01,
        JSON.stringify(ndHSV(col)));
      ndSetHSV(col, 120, 1, 1);
      ok('wheel: turning it sets the colour', ndHex(col) === '#00ff00', ndHex(col));
      ndSetHSV(col, 120, 1, 0);
      ok('wheel: taken right down it is black', ndHex(col) === '#000000', ndHex(col));
      ok('wheel: …and the hue is still remembered there', ndHSV(col)[0] === 120,
        JSON.stringify(ndHSV(col)));
      ndSetHSV(col, 120, 1, 1);
      ok('wheel: so coming back up returns the same colour', ndHex(col) === '#00ff00', ndHex(col));
      ndSetRGB(col, [0, 128, 255]);
      ok('wheel: a hex typed in sets the reading too',
        Math.abs(ndHSV(col)[0] - 210) < 0.5, JSON.stringify(ndHSV(col)));
      /* where the dot sits: straight up is hue 0, and the middle is no colour */
      ok('wheel: the dot goes round from straight up',
        Math.abs(ndWheelAt(0, 1).x - 50) < 1e-9 && ndWheelAt(0, 1).y === 0 &&
        Math.abs(ndWheelAt(90, 1).x - 100) < 1e-9,
        JSON.stringify(ndWheelAt(0, 1)) + ' ' + JSON.stringify(ndWheelAt(90, 1)));
      ok('wheel: and sits in the middle when there is no colour in it',
        ndWheelAt(200, 0).x === 50 && ndWheelAt(200, 0).y === 50);
      ok('wheel: a point on it reads back as the hue that drew it',
        Math.abs(ndWheelHS(0, -1).h) < 1e-9 && Math.abs(ndWheelHS(1, 0).h - 90) < 1e-9 &&
        Math.abs(ndWheelHS(0, 1).h - 180) < 1e-9,
        [ndWheelHS(0, -1).h, ndWheelHS(1, 0).h, ndWheelHS(0, 1).h].join(','));
      ok('wheel: outside the disc is still the edge of it', ndWheelHS(3, 4).s === 1,
        ndWheelHS(3, 4).s);
      /* the reading is a note of where the dot was, not a second truth: set the
         colour some other way and it is worked out again rather than believed */
      col.rgb = [255, 0, 0];
      ok('wheel: a colour set behind its back is not taken on trust',
        ndHSV(col)[0] === 0 && ndHSV(col)[1] === 1, JSON.stringify(ndHSV(col)));
      ndSetRGB(col, [0, 128, 255]);

      /* ---- nothing wired in says so rather than throwing ---- */
      var loose = mkNode('math');
      page.items.push(loose);
      nodeBust();
      ok('node: an empty socket is a sentence, not a crash',
        nodeVal(loose.id).t === 'err' && /nothing is wired/.test(nodeVal(loose.id).msg),
        nodeVal(loose.id).msg);

      /* ---- a circle is refused rather than run ---- */
      ok('node: a circle is spotted before it is drawn', ndReaches(math.id, tab.id));
      ok('node: …and only where there is one', !ndReaches(col.id, tab.id));
      var before = JSON.stringify(pick.in);
      ndPlug(pick, 0, math.id);                       // math already reads pick
      ok('node: wiring one into its own supply is refused',
        JSON.stringify(pick.in) === before, JSON.stringify(pick.in));
      /* and if one were made anyway, it says so instead of hanging */
      var a = mkNode('fn', { expr: 'x' }), b = mkNode('fn', { expr: 'x' });
      a.in = [b.id]; b.in = [a.id];
      page.items.push(a, b); nodeBust();
      ok('node: a circle on the page is a complaint',
        nodeVal(a.id).t === 'err' && /circle/.test(nodeVal(a.id).msg), JSON.stringify(nodeVal(a.id)));
      page.items = page.items.filter(function (x) { return x !== a && x !== b; });

      /* ---- the whole point: a table, through the nodes, onto a plot ---- */
      await render();
      var d = plotAddNode({ it: plt, page: page }, math);
      ok('node→plot: the plot has a series', datOf(plt).length === 1);
      ok('node→plot: it reads the node, not the table', d.src === math.id, d.src);
      ok('node→plot: the columns offered are the node\'s',
        d.cols.join('|') === 't × 3|h × 3|note × 3', d.cols.join('|'));
      ok('node→plot: the points came down the wires',
        d.pts.length === 2 && d.pts[0][0] === 3 && d.pts[0][1] === 30,
        JSON.stringify(d.pts));
      ok('node→plot: a row with a gap in it is not a point', d.pts.length === 2, d.pts.length);
      ok('node→plot: and the axis names are the node\'s column names',
        d.xl === 't × 3' && d.yl === 'h × 3', d.xl + ' / ' + d.yl);
      ok('node→plot: it became a chart', plt.ar > 0, plt.ar);

      /* edit a cell at the top of the chain and watch the far end move */
      tbRows(tab)[1][1] = '100';
      tbSync(tab);
      ok('node→plot: a cell edited two nodes upstream moves the point',
        datOf(plt)[0].pts[0][1] === 300, JSON.stringify(datOf(plt)[0].pts));
      tbRows(tab)[1][1] = '10'; tbSync(tab);

      /* the constant in the middle moves it too */
      math.k = 10; graphSync(math.id);
      ok('node→plot: so does the number in the middle',
        datOf(plt)[0].pts[0][1] === 100, JSON.stringify(datOf(plt)[0].pts));
      math.k = 3; graphSync(math.id);

      /* only what actually reads the change is redrawn */
      var other = { id: uid(), type: 'table', x: 60, y: 4, w: 20, rot: 0, z: 1, lay: lay,
        fs: 15, head: 1, ts: 'lines', fmt: {}, cap: '', rows: [['q'], ['9']], cw: [1], al: ['l'] };
      page.items.push(other);
      var was = JSON.stringify(datOf(plt)[0].pts);
      graphSync(other.id);
      ok('node→plot: a table nothing reads leaves the series alone',
        JSON.stringify(datOf(plt)[0].pts) === was, JSON.stringify(datOf(plt)[0].pts));

      /* ---- a colour on a wire ---- */
      await render();
      ndColourTo({ it: plt, page: page }, col, nodeVal(col.id));
      ok('node→plot: a colour node paints the series', datOf(plt)[0].c === '#0080ff',
        datOf(plt)[0].c);
      ok('node→plot: and the series remembers where it came from', datOf(plt)[0].cs === col.id);
      col.rgb = [255, 0, 0]; graphSync(col.id);
      ok('node→plot: moving the sliders repaints it', datOf(plt)[0].c === '#ff0000',
        datOf(plt)[0].c);

      /* ---- the wires on the page ---- */
      await render();
      ndLay();
      var svg = Q('#pageHost svg.nwires');
      ok('wires: an overlay went up', !!svg);
      /* pick←table, math←pick, one←table, two←table, fn←one, plot←math, plot←colour */
      var n = svg ? svg.querySelectorAll('g[data-w]').length : 0;
      ok('wires: one per plug', n === 7, 'drew ' + n);
      ok('wires: they are drawn as flat runs, not yarn',
        !!svg && /^M[\d.\- ]+C/.test(svg.querySelector('.nw').getAttribute('d')),
        svg && svg.querySelector('.nw').getAttribute('d').slice(0, 24));
      ok('wires: a colour wire is the colour it carries',
        !!svg && !!svg.querySelector('g.col .nw[stroke="#ff0000"]'),
        svg && svg.querySelector('g.col .nw') && svg.querySelector('g.col .nw').getAttribute('stroke'));
      /* a table wired into a node has no socket of its own, so the wire leaves
         its edge — it still has to land somewhere on the page */
      var w0 = svg && svg.querySelector('g[data-w="' + pick.id + '/0"] .nw');
      ok('wires: one out of a table finds the table', !!w0 && w0.getAttribute('d').length > 10,
        w0 && w0.getAttribute('d'));

      ndUnplug(pick, 0);
      ok('wires: unplugging takes the socket out', !pick.in[0], JSON.stringify(pick.in));
      ndLay();
      ok('wires: …and the wire with it',
        Q('#pageHost svg.nwires').querySelectorAll('g[data-w]').length === n - 1,
        Q('#pageHost svg.nwires').querySelectorAll('g[data-w]').length);
      ok('wires: what is downstream now says what is missing',
        nodeVal(math.id).t === 'err', JSON.stringify(nodeVal(math.id)));
      ndPlug(pick, 0, tab.id);
      ok('wires: and plugging it back puts the numbers back',
        nodeVal(math.id).cols[0].v.join(',') === '3,6,12',
        JSON.stringify(nodeVal(math.id).cols && nodeVal(math.id).cols[0].v));

      /* ---- the card itself ---- */
      await render();
      var nel = Q('#pageHost .item[data-id="' + math.id + '"]');
      ok('card: it is on the page', !!nel && !!nel.querySelector('.nd'));
      ok('card: it says what it is',
        !!nel && nel.querySelector('.nkind').value === 'math', nel && nel.querySelector('.nkind').value);
      ok('card: it has a socket for each input and one out',
        !!nel && nel.querySelectorAll('.nprt.in').length === 2 &&
        nel.querySelectorAll('.nprt.out').length === 1,
        nel && nel.querySelectorAll('.nprt').length);
      ok('card: a plugged socket looks plugged',
        !!nel && nel.querySelector('.nin').classList.contains('on'));
      ok('card: the foot says what comes out of it',
        !!nel && /3 columns · 3 rows/.test(nel.querySelector('.ndf').textContent),
        nel && nel.querySelector('.ndf').textContent);
      var pel2 = Q('#pageHost .item[data-id="' + pick.id + '"]');
      ok('card: Columns offers one tick per column',
        !!pel2 && pel2.querySelectorAll('.ntick input').length === 3,
        pel2 && pel2.querySelectorAll('.ntick input').length);
      /* a complaint is shown as one, not swallowed */
      var lel = Q('#pageHost .item[data-id="' + loose.id + '"]');
      ok('card: an unwired node says so on its face',
        !!lel && lel.querySelector('.ndf').classList.contains('bad'),
        lel && lel.querySelector('.ndf').textContent);

      /* the slider is the reason to build a graph at all */
      var sel = Q('#pageHost .item[data-id="' + num.id + '"] .nsl');
      ok('card: a Number node carries a slider', !!sel);
      math.in = [pick.id, num.id]; graphSync();
      await render();
      sel = Q('#pageHost .item[data-id="' + num.id + '"] .nsl');
      sel.value = '4';
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      ok('card: dragging it runs down the wires', num.v === 4 &&
        datOf(plt)[0].pts[0][1] === 40, num.v + ' ' + JSON.stringify(datOf(plt)[0].pts));
      math.in = [pick.id]; graphSync();

      /* the colour wheel, dragged. It is a plain div, so unlike a slider it does
         not take the focus on the way down and a redraw would sweep it out from
         under the finger — hence the hold. */
      var wel = Q('#pageHost .item[data-id="' + col.id + '"] .nwheel');
      ok('wheel: the card carries one, over a lightness slider and a hex box', !!wel &&
        !!Q('#pageHost .item[data-id="' + col.id + '"] .nsl.nlum') &&
        !!Q('#pageHost .item[data-id="' + col.id + '"] [data-k="hex"]'));
      var wr = wel.getBoundingClientRect();
      var atWheel = function (dx, dy) {
        return { bubbles: true, clientX: wr.left + wr.width / 2 + dx * wr.width / 2,
                 clientY: wr.top + wr.height / 2 + dy * wr.height / 2 };
      };
      wel.dispatchEvent(new PointerEvent('pointerdown', atWheel(0, -0.9)));
      ok('wheel: pressing at the top of it picks red',
        Math.round(ndHSV(col)[0]) === 0 && ndHex(col).slice(1, 3) === 'ff',
        ndHex(col) + ' h=' + ndHSV(col)[0]);
      ok('wheel: the card is held while it is', ndHeld === col.id, ndHeld);
      /* a redraw arriving mid-drag must leave the thing under the finger alone */
      ndPaintCards();
      ok('wheel: …so a redraw cannot take it away',
        Q('#pageHost .item[data-id="' + col.id + '"] .nwheel') === wel);
      wel.dispatchEvent(new PointerEvent('pointermove', atWheel(0.9, 0)));
      ok('wheel: dragging round it turns the hue',
        Math.abs(ndHSV(col)[0] - 90) < 1, ndHSV(col)[0]);
      var dot = wel.querySelector('.nwdot');
      ok('wheel: and the dot follows without the card being rebuilt',
        parseFloat(dot.style.left) > 85 && Math.abs(parseFloat(dot.style.top) - 50) < 1,
        dot.style.left + ' / ' + dot.style.top);
      wel.dispatchEvent(new PointerEvent('pointerup', atWheel(0.9, 0)));
      ok('wheel: letting go lets go', ndHeld === null, ndHeld);
      ndSetRGB(col, [255, 0, 0]);
      graphSync(col.id);
      ok('wheel: what it lands on is what the plot is painted',
        datOf(plt)[0].c === '#ff0000', datOf(plt)[0].c);

      /* changing what a card is empties its sockets — they are not the same ones */
      var kel = Q('#pageHost .item[data-id="' + fnn.id + '"] .nkind');
      kel.value = 'num';
      kel.dispatchEvent(new Event('change', { bubbles: true }));
      ok('card: turning it into something else unplugs it',
        fnn.nk === 'num' && !(fnn.in || []).length, fnn.nk + ' ' + JSON.stringify(fnn.in));

      /* ---- the gesture itself: pull a lead out of a socket and plug it in ----
         Synthetic pointer events do no hit testing, so the press goes straight
         at the socket; where it is let go of is worked out from the coordinates,
         which is a layout question and answers properly even headless. Which
         means the cards have to be somewhere — everything above was built on
         top of everything else, because none of it cared. */
      var stacked = page.items.slice();
      var into = mkNode('fn', { expr: 'x', in: [] });
      tab.x = 2;  tab.y = 2;  tab.w = 26;
      pick.x = 38; pick.y = 3;  pick.w = 22;
      math.x = 38; math.y = 30; math.w = 22;
      into.x = 70; into.y = 12; into.w = 22;
      plt.x = 26; plt.y = 60; plt.w = 60;
      page.items = [tab, pick, math, into, plt];
      pick.in = [null];
      math.in = [pick.id];
      await render();
      /* The middle of a big item on a sheet three pages across can be off the
         bottom of the window, and elementsFromPoint answers nothing there — so
         aim at the middle of the part of it that is actually on screen. */
      var atCentre = function (el) {
        var r = el.getBoundingClientRect();
        var l = Math.max(r.left, 1), t = Math.max(r.top, 1);
        var rr = Math.min(r.right, innerWidth - 1), bb = Math.min(r.bottom, innerHeight - 1);
        return { clientX: (l + rr) / 2, clientY: (t + bb) / 2, bubbles: true };
      };
      var pull = function (portEl, targetEl) {
        portEl.dispatchEvent(new PointerEvent('pointerdown', atCentre(portEl)));
        window.dispatchEvent(new PointerEvent('pointermove', atCentre(targetEl)));
        window.dispatchEvent(new PointerEvent('pointerup', atCentre(targetEl)));
      };
      pull(Q('#pageHost .item[data-id="' + pick.id + '"] .nprt.in[data-p="0"]'),
           Q('#pageHost .item[data-id="' + tab.id + '"]'));
      ok('wire drag: pulled out of a socket and dropped on a table, it plugs in',
        pick.in[0] === tab.id, JSON.stringify(pick.in));
      /* the ghost is not left hanging about afterwards */
      ok('wire drag: the lead being dragged is cleared up',
        !Q('#pageHost svg.nwires .nghost') && !document.body.classList.contains('nwiring'));

      /* out of a card and onto a socket on another one */
      await render();
      pull(Q('#pageHost .item[data-id="' + math.id + '"] .nprt.out'),
           Q('#pageHost .item[data-id="' + into.id + '"] .nprt.in[data-p="0"]'));
      ok('wire drag: and out of a card into a socket', into.in[0] === math.id,
        JSON.stringify(into.in));

      /* out of a card and onto a coordinate system: that is a second series */
      var hadSeries = datOf(plt).length;
      await render();
      pull(Q('#pageHost .item[data-id="' + into.id + '"] .nprt.out'),
           Q('#pageHost .item[data-id="' + plt.id + '"]'));
      ok('wire drag: dropped on a plot it becomes a series',
        datOf(plt).length === hadSeries + 1 &&
        datOf(plt)[hadSeries].src === into.id, datOf(plt).length + ' ' +
        JSON.stringify(datOf(plt).map(function (x) { return x.src; })));
      datOf(plt).length = hadSeries;
      page.items = stacked;
      await render();

      /* ---- carrying a card onto another one ---- */
      ok('drop: a table carried onto a node is claimed', !!ndDropOn(tab, pick));
      ok('drop: a node onto a node too', !!ndDropOn(math, pick));
      ok('drop: a sticky note is not', !ndDropOn({ type: 'note' }, pick));
      ok('drop: and a node onto a note is nobody\'s business',
        !ndDropOn(math, { type: 'note' }));
      var empty = mkNode('math');
      page.items.push(empty);
      ndDoDrop(page, tab, { it: empty, page: page }, { x: 1, y: 2 });
      ok('drop: it lands in the first empty socket', empty.in[0] === tab.id, JSON.stringify(empty.in));
      ok('drop: and the card goes back where it came from', tab.x === 1 && tab.y === 2,
        tab.x + ',' + tab.y);
      ndDoDrop(page, other, { it: empty, page: page }, { x: 1, y: 2 });
      ok('drop: a second one fills the next socket', empty.in[1] === other.id, JSON.stringify(empty.in));

      /* ---- a node that goes takes its wires with it ---- */
      var doomed = mkNode('num', { v: 7 });
      page.items.push(doomed);
      empty.in = [tab.id, doomed.id];
      datOf(plt)[0].cs = doomed.id;
      ITEMS.node.forget(doomed);
      ok('gone: the socket that read it is empty', !empty.in[1], JSON.stringify(empty.in));
      ok('gone: and the plot is not still asking it for a colour', !datOf(plt)[0].cs);

      /* ---- print, export and a thumbnail draw the wires too ---- */
      page.items = page.items.filter(function (x) { return x !== doomed && x !== empty; });
      await render();
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:660px';
      document.body.appendChild(host);
      var pg = buildPage(page, false);
      host.appendChild(pg); fit(pg);
      drawStaticStrings(pg, page);
      var sw = pg.querySelector('svg.nwires');
      ok('static: the wires are drawn for a print too', !!sw &&
        sw.querySelectorAll('path.nw').length >= 4,
        sw ? sw.querySelectorAll('path.nw').length : 'no overlay');
      ok('static: a card with no live graph still says what it was worth',
        /columns/.test(pg.querySelector('.item[data-id="' + math.id + '"] .ndf').textContent),
        pg.querySelector('.item[data-id="' + math.id + '"] .ndf').textContent);
      host.remove();

      page.items = keep;
      await render();
    });

    /* ---- logic gates: the truth tables, the leads, and the circuit ----
       The tables below are written out again here on purpose. Reading them back
       out of LG_GATES would only prove the file agrees with itself; these are
       what a textbook prints, and both the definitions and the evaluated
       circuit are held against them. */
    await stage('logic', async function () {
      var page = sheet();
      var keepItems = page.items.slice(), keepWires = (page.wires || []).slice();
      var lay = curLayerId();
      var TRUTH = {
        and: [0, 0, 0, 1], nand: [1, 1, 1, 0], or: [0, 1, 1, 1], nor: [1, 0, 0, 0],
        xor: [0, 1, 1, 0], xnor: [1, 0, 0, 1], buf: [0, 1], not: [1, 0]
      };
      var TWO = ['and', 'nand', 'or', 'nor', 'xor', 'xnor'], ONE = ['buf', 'not'];
      var mk = function (gate, extra) {
        var g = { id: uid(), type: 'logic', gate: gate, x: 5, y: 5, w: 11, rot: 0,
                  z: 1, lay: lay, cap: '' };
        if (gate === 'sw' || gate === 'btn') g.on = 0;
        if (gate === 'clk') { g.on = 0; g.hz = 1; g.paused = false; }
        if (LG_GATES[gate] && LG_GATES[gate].seq) { g.q = 0; g.clk = 0; }
        if (gate === 'cust') g.def = { name: 'Custom', n: 2, table: [0, 0, 0, 1] };
        for (var k in (extra || {})) g[k] = extra[k];
        return g;
      };
      var join = function (p, a, ap, b, bp) {
        p.wires = p.wires || [];
        var w = { id: uid(), from: { item: a.id, port: ap }, to: { item: b.id, port: bp } };
        p.wires.push(w);
        return w;
      };
      var V = function (p, it) { return lgEval(p).get(it.id); };

      /* ---- the definitions say what the textbook says ---- */
      var defBad = [];
      Object.keys(TRUTH).forEach(function (k) {
        if (LG_GATES[k].table.join('') !== TRUTH[k].join('')) defBad.push(k);
      });
      ok('logic: every built-in definition carries the table it should',
        defBad.length === 0, defBad.join(','));
      ok('logic: the inverting gates are the plain ones turned over',
        LG_GATES.nand.table.join('') === LG_GATES.and.table.map(function (v) { return 1 - v; }).join('') &&
        LG_GATES.nor.table.join('') === LG_GATES.or.table.map(function (v) { return 1 - v; }).join('') &&
        LG_GATES.xnor.table.join('') === LG_GATES.xor.table.map(function (v) { return 1 - v; }).join('') &&
        LG_GATES.not.table.join('') === LG_GATES.buf.table.map(function (v) { return 1 - v; }).join(''));
      ok('logic: and the inverting symbols are the plain ones plus one bubble',
        LG_GATES.nand.shape.body === LG_GATES.and.shape.body && LG_GATES.nand.shape.bubble === true &&
        LG_GATES.nor.shape.body === LG_GATES.or.shape.body && LG_GATES.nor.shape.bubble === true &&
        LG_GATES.xnor.shape.body === LG_GATES.or.shape.body && LG_GATES.xnor.shape.back === true &&
        LG_GATES.not.shape.body === LG_GATES.buf.shape.body && LG_GATES.not.shape.bubble === true);

      /* ---- every table, driven for real, all four rows of it ---- */
      var sa = mk('sw'), sb = mk('sw');
      page.items = [sa, sb]; page.wires = [];
      var G = {};
      Object.keys(TRUTH).forEach(function (k) {
        var g = mk(k); G[k] = g; page.items.push(g);
        join(page, sa, 'q', g, 'a');
        if (TWO.indexOf(k) >= 0) join(page, sb, 'q', g, 'b');
      });
      var wrong = [];
      for (var i = 0; i < 4; i++) {
        sa.on = (i >> 1) & 1; sb.on = i & 1;
        var vals = lgEval(page);
        TWO.forEach(function (k) {
          if (vals.get(G[k].id) !== TRUTH[k][i]) wrong.push(k + '(' + sa.on + sb.on + ')=' + vals.get(G[k].id));
        });
        ONE.forEach(function (k) {
          if (vals.get(G[k].id) !== TRUTH[k][sa.on]) wrong.push(k + '(' + sa.on + ')=' + vals.get(G[k].id));
        });
      }
      ok('logic: all eight gates give the right answer on every row', wrong.length === 0,
        wrong.join(' '));

      /* the first input is the high bit — only a lopsided table can prove it */
      var cu = mk('cust', { def: { name: 'A-not-B', n: 2, table: [0, 0, 1, 0] } });
      page.items.push(cu);
      join(page, sa, 'q', cu, 'a'); join(page, sb, 'q', cu, 'b');
      sa.on = 1; sb.on = 0;
      ok('logic: the first input is the high bit of the row number', V(page, cu) === 1, V(page, cu));
      sa.on = 0; sb.on = 1;
      ok('logic: and the other way round is a different row', V(page, cu) === 0, V(page, cu));
      ok('logic: a custom gate is named by what is written on it', lgDef(cu).name === 'A-not-B');
      /* the palette tile is the same drawing as the thing it puts on the paper */
      var noIcon = LG_ORDER.filter(function (k) {
        return !ICONS['lg-' + k] || ICONS['lg-' + k].length < 40; });
      ok('logic: every gate ships the tile that draws it', noIcon.length === 0 &&
        LG_ORDER.length === Object.keys(LG_GATES).length, noIcon.join(','));
      ok('logic: and no tile carries writing too small to read',
        LG_ORDER.every(function (k) { return (ICONS['lg-' + k].match(/<text/g) || []).length <= 1; }),
        LG_ORDER.filter(function (k) {
          return (ICONS['lg-' + k].match(/<text/g) || []).length > 1; }).join(','));
      var oldCat = curCat;
      curCat = 'logic'; Q('#palSeek').value = ''; renderGrid();
      var logicHeads = [].slice.call(Q('#palGrid').querySelectorAll('.pgroup'))
        .map(function (x) { return x.textContent; });
      ok('palette: logic is divided into the four named families',
        logicHeads.join('|') === 'Input controls|Output controls|Logic gates|Flip-flops',
        logicHeads.join('|'));
      ok('palette: every logic device appears once under those families',
        Q('#palGrid').querySelectorAll('.ptile').length === LG_ORDER.length &&
        new Set(LG_ORDER).size === LG_ORDER.length,
        Q('#palGrid').querySelectorAll('.ptile').length + ' tiles for ' + LG_ORDER.length);
      curCat = oldCat; renderGrid();
      ok('logic: and eight inputs is as far as it goes',
        lgDef(mk('cust', { def: { n: 40, table: [] } })).ins.length === 8);

      /* ---- constants and the lamp ---- */
      var z = mk('zero'), o = mk('one'), lp = mk('lamp');
      page.items = [z, o, lp]; page.wires = [];
      ok('logic: a constant 0 is a nought', V(page, z) === 0, V(page, z));
      ok('logic: a constant 1 is a one', V(page, o) === 1, V(page, o));
      ok('logic: a lamp with nothing in it says it does not know', V(page, lp) === 'x', V(page, lp));
      join(page, o, 'q', lp, 'a');
      ok('logic: a lamp shows what is wired into it', V(page, lp) === 1, V(page, lp));
      ok('logic: and nothing can be wired out of a lamp', lgDef(lp).outs.length === 0);

      /* ---- tri-state isolation and the four-bit display ---- */
      var ta = mk('sw', { on: 1 }), ten = mk('sw', { on: 0 }), tri = mk('tri'), tb = mk('buf');
      page.items = [ta, ten, tri, tb]; page.wires = [];
      join(page, ta, 'q', tri, 'a'); join(page, ten, 'q', tri, 'en');
      var tw = join(page, tri, 'q', tb, 'a'), tv = lgEval(page);
      ok('tri-state: disabled means a real high-impedance output',
        tv.get(tri.id) === 'z' && lgWireVal(tv, tw) === 'z' &&
        LG_GATES.tri.eval({ a:'e', en:0 }) === 'z',
        tv.get(tri.id) + ' on the gate, ' + lgWireVal(tv, tw) + ' on the lead');
      ok('tri-state: high impedance is unknown to an ordinary logic input',
        tv.get(tb.id) === 'x', tv.get(tb.id));
      ten.on = 1; tv = lgEval(page);
      ok('tri-state: enabled passes a one without changing it',
        tv.get(tri.id) === 1 && tv.get(tb.id) === 1,
        tv.get(tri.id) + ',' + tv.get(tb.id));
      ta.on = 0; tv = lgEval(page);
      ok('tri-state: and enabled passes a nought without changing it',
        tv.get(tri.id) === 0 && tv.get(tb.id) === 0,
        tv.get(tri.id) + ',' + tv.get(tb.id));

      var bits = [mk('sw', { on: 1 }), mk('sw', { on: 0 }),
                  mk('sw', { on: 1 }), mk('sw', { on: 0 })];
      var digit = mk('digit'); page.items = bits.concat([digit]); page.wires = [];
      ['8', '4', '2', '1'].forEach(function (p, i) { join(page, bits[i], 'q', digit, p); });
      ok('four-bit digit: 1010 is read as hexadecimal A',
        V(page, digit) === 10 && lgNumeral(digit, V(page, digit)) === 'A', V(page, digit));
      bits[3].on = 1;
      ok('four-bit digit: the least-significant input changes A to B',
        V(page, digit) === 11 && lgNumeral(digit, V(page, digit)) === 'B', V(page, digit));
      ok('four-bit digit: it is an output control, never a signal source',
        lgDef(digit).outs.length === 0 && lgDef(digit).ins.join('') === '8421');

      /* ---- stored state: all four characteristic tables, then a real edge ---- */
      ok('flip-flops: SR holds, sets, resets and rejects S=R=1',
        lgSeqNext('sr', { s:0, r:0 }, 1) === 1 && lgSeqNext('sr', { s:1, r:0 }, 0) === 1 &&
        lgSeqNext('sr', { s:0, r:1 }, 1) === 0 && lgSeqNext('sr', { s:1, r:1 }, 0) === 'x');
      ok('flip-flops: D copies D and T toggles only when asked',
        lgSeqNext('d', { d:1 }, 0) === 1 && lgSeqNext('d', { d:0 }, 1) === 0 &&
        lgSeqNext('t', { t:0 }, 1) === 1 && lgSeqNext('t', { t:1 }, 1) === 0);
      ok('flip-flops: JK holds, sets, resets and toggles',
        lgSeqNext('jk', { j:0, k:0 }, 1) === 1 && lgSeqNext('jk', { j:1, k:0 }, 0) === 1 &&
        lgSeqNext('jk', { j:0, k:1 }, 1) === 0 && lgSeqNext('jk', { j:1, k:1 }, 1) === 0);
      ok('flip-flops: every device exposes Q and inverted Q',
        ['srff','dff','jkff','tff'].every(function (k) {
          return LG_GATES[k].seq && LG_GATES[k].outs.join(',') === 'q,nq'; }));

      var dat = mk('sw', { on: 1 }), edge = mk('sw', { on: 0 }), dff = mk('dff');
      page.items = [dat, edge, dff]; page.wires = [];
      join(page, dat, 'q', dff, 'd'); join(page, edge, 'q', dff, 'clk');
      lgAdvance(page);
      ok('D flip-flop: changing D without an edge leaves Q alone', dff.q === 0, dff.q);
      edge.on = 1; lgAdvance(page); var dv = lgEval(page);
      ok('D flip-flop: a rising edge copies D to Q and Q-bar is its inverse',
        dff.q === 1 && lgOutput(dv, dff.id, 'nq') === 0,
        dff.q + ',' + lgOutput(dv, dff.id, 'nq'));
      dat.on = 0; lgAdvance(page);
      ok('D flip-flop: changing D while the clock stays high is not another edge', dff.q === 1, dff.q);
      edge.on = 0; lgAdvance(page); edge.on = 1; lgAdvance(page);
      ok('D flip-flop: the next rising edge samples the new D', dff.q === 0, dff.q);
      histCommit();
      HIST.shadow.set(page.id, histSnap(page));
      var stepsBeforeClock = HIST.past.length;
      dff.q = 1; queueSave(page.id, false);
      ok('clock: silently persisted state rebases history without making an undo step',
        HIST.past.length === stepsBeforeClock && HIST.shadow.get(page.id) === histSnap(page),
        HIST.past.length + ' steps, shadow current=' + (HIST.shadow.get(page.id) === histSnap(page)));

      /* ---- one output feeding three inputs, and three levels of it ---- */
      var s1 = mk('sw', { on: 1 }), inv = mk('not');
      var a1 = mk('and'), o1 = mk('or'), x1 = mk('xor');
      page.items = [s1, inv, a1, o1, x1]; page.wires = [];
      join(page, s1, 'q', inv, 'a');
      ['a', 'b'].forEach(function (p) {
        join(page, inv, 'q', a1, p); join(page, inv, 'q', o1, p); join(page, inv, 'q', x1, p);
      });
      var fv = lgEval(page);
      ok('logic: one output feeds three gates at once',
        fv.get(a1.id) === 0 && fv.get(o1.id) === 0 && fv.get(x1.id) === 0,
        [fv.get(a1.id), fv.get(o1.id), fv.get(x1.id)].join(','));
      s1.on = 0; fv = lgEval(page);
      ok('logic: and all three follow the one switch',
        fv.get(a1.id) === 1 && fv.get(o1.id) === 1 && fv.get(x1.id) === 0,
        [fv.get(a1.id), fv.get(o1.id), fv.get(x1.id)].join(','));

      var n1 = mk('not'), n2 = mk('not'), n3 = mk('not'), sc = mk('sw', { on: 1 });
      page.items = [sc, n1, n2, n3]; page.wires = [];
      join(page, sc, 'q', n1, 'a'); join(page, n1, 'q', n2, 'a'); join(page, n2, 'q', n3, 'a');
      ok('logic: three inverters in a row invert', V(page, n3) === 0, V(page, n3));
      sc.on = 0;
      ok('logic: and follow the switch down the whole chain', V(page, n3) === 1, V(page, n3));

      /* ---- an input nothing drives is not a nought ---- */
      var half = mk('and'), zz = mk('zero');
      page.items = [half, zz]; page.wires = [];
      ok('logic: a gate with nothing wired in says it does not know', V(page, half) === 'x', V(page, half));
      join(page, zz, 'q', half, 'a');
      ok('logic: half-wired is still not known — b is not a nought',
        V(page, half) === 'x', V(page, half));
      var dn = mk('not');
      page.items.push(dn); join(page, half, 'q', dn, 'a');
      ok('logic: and not knowing carries downstream', V(page, dn) === 'x', V(page, dn));

      /* ---- one driver per input ---- */
      var t1 = mk('sw', { on: 1 }), t0 = mk('sw', { on: 0 }), tg = mk('buf');
      page.items = [t1, t0, tg]; page.wires = [];
      ok('logic: connecting works', lgConnect(page, { item: t1.id, port: 'q' }, { item: tg.id, port: 'a' }));
      ok('logic: and it carries the value', V(page, tg) === 1, V(page, tg));
      lgConnect(page, { item: t0.id, port: 'q' }, { item: tg.id, port: 'a' });
      ok('logic: a second lead into one input replaces the first, it does not join it',
        page.wires.filter(function (w) { return w.to.item === tg.id && w.to.port === 'a'; }).length === 1,
        page.wires.length + ' leads');
      ok('logic: and the newest one is the one that drives it', V(page, tg) === 0, V(page, tg));
      ok('logic: the same lead made twice is not a second lead',
        !lgConnect(page, { item: t0.id, port: 'q' }, { item: tg.id, port: 'a' }) &&
        page.wires.length === 1, page.wires.length + ' leads');
      ok('logic: a gate refuses to be wired into itself',
        !lgConnect(page, { item: tg.id, port: 'q' }, { item: tg.id, port: 'a' }));
      ok('logic: an output cannot be wired to an output',
        !lgConnect(page, { item: t0.id, port: 'q' }, { item: t1.id, port: 'q' }));
      ok('logic: nor an input that does not exist',
        !lgConnect(page, { item: t0.id, port: 'q' }, { item: tg.id, port: 'zz' }));

      /* ---- a ring: it says so rather than running for ever ---- */
      var r1 = mk('not'), r2 = mk('not'), after = mk('buf'), ind = mk('sw', { on: 1 });
      page.items = [r1, r2, after, ind]; page.wires = [];
      join(page, r1, 'q', r2, 'a'); join(page, r2, 'q', r1, 'a');
      join(page, r2, 'q', after, 'a');
      var t0ms = Date.now(), rv = lgEval(page), took = Date.now() - t0ms;
      ok('logic: a circuit wired in a ring is worked out, not run for ever', took < 400, took + ' ms');
      ok('logic: both gates in the ring are marked',
        rv.get(r1.id) === 'e' && rv.get(r2.id) === 'e',
        rv.get(r1.id) + ',' + rv.get(r2.id));
      ok('logic: so is what hangs off it', rv.get(after.id) === 'e', rv.get(after.id));
      ok('logic: but a gate nowhere near it is untouched', rv.get(ind.id) === 1, rv.get(ind.id));
      ok('logic: and the leads in the ring are marked too',
        lgWireVal(rv, page.wires[0]) === 'e' && lgWireVal(rv, page.wires[2]) === 'e');
      /* breaking the ring lets it settle again */
      lgDisconnect(page, page.wires[1], true);
      var bv = lgEval(page);
      ok('logic: cutting one lead lets the whole thing settle',
        bv.get(r1.id) === 'x' && bv.get(after.id) === 'x',
        bv.get(r1.id) + ',' + bv.get(after.id));

      /* ================= on the paper ================= */
      var sw = mk('sw', { on: 0, x: 8, y: 10, w: 12 });
      var gate = mk('and', { x: 34, y: 10, w: 12 });
      var lamp = mk('lamp', { x: 60, y: 10, w: 12 });
      page.items = [sw, gate, lamp]; page.wires = [];
      join(page, sw, 'q', gate, 'a'); join(page, sw, 'q', gate, 'b');
      join(page, gate, 'q', lamp, 'a');
      await render();
      await sleep(60);

      var el = function (it) { return Q('#pageHost .item[data-id="' + it.id + '"]'); };
      ok('live: a gate is on the sheet', !!el(gate) && !!el(gate).querySelector('svg.lgsvg'));
      ok('live: it has a toolbar', !!el(gate).querySelector('.tools button'));
      ok('live: its symbol keeps its own proportions',
        el(gate).querySelector('.lgsvg').getAttribute('viewBox') === '0 0 100 64',
        el(gate).querySelector('.lgsvg').getAttribute('viewBox'));
      ok('live: no NaN anywhere in a symbol',
        !/NaN/.test(el(gate).querySelector('.lgsvg').innerHTML) &&
        !/NaN/.test(el(lamp).querySelector('.lgsvg').innerHTML) &&
        !/NaN/.test(el(sw).querySelector('.lgsvg').innerHTML));
      ok('live: three ports on a two-input gate',
        el(gate).querySelectorAll('.lgp').length === 3,
        el(gate).querySelectorAll('.lgp').length + ' ports');
      ok('live: the hit area is much bigger than the dot you can see',
        +el(gate).querySelector('.lghit').getAttribute('r') >=
        3 * +el(gate).querySelector('.lgdot').getAttribute('r'),
        el(gate).querySelector('.lghit').getAttribute('r') + ' vs ' +
        el(gate).querySelector('.lgdot').getAttribute('r'));
      ok('live: every port says what it is', [].slice.call(el(gate).querySelectorAll('.lgp'))
        .every(function (p) { return p.querySelector('title') && p.getAttribute('aria-label'); }));
      ok('live: the leads are drawn', !!Q('#pageHost svg.lgwires') &&
        Q('#pageHost svg.lgwires').querySelectorAll('g[data-w]').length === 3,
        Q('#pageHost svg.lgwires') ?
          Q('#pageHost svg.lgwires').querySelectorAll('g[data-w]').length : 'no overlay');
      ok('live: a lead that is fanned out wears a junction blob',
        Q('#pageHost svg.lgwires circle.lgjn'));
      ok('live: nothing is bright while the switch is off',
        el(gate).querySelector('.lgw').dataset.v === '0' &&
        el(lamp).querySelector('.lgw').dataset.v === '0',
        el(gate).querySelector('.lgw').dataset.v + ',' + el(lamp).querySelector('.lgw').dataset.v);
      /* Nothing has repainted anything yet: what a symbol says has to be right
         the moment it is built, because print, a thumbnail and an export never
         get a second pass at it. */
      ok('live: a symbol knows its value the moment it is built, with no repaint',
        el(sw).querySelector('.lgval').textContent === '0' &&
        el(lamp).querySelector('.lgval').textContent === '0',
        el(sw).querySelector('.lgval').textContent + ',' +
        el(lamp).querySelector('.lgval').textContent);
      /* a circuit of a dozen gates should not be a circuit of a dozen ghost
         captions — the offer is there when you pick one up, and not before */
      var capOf = function (it) {
        return getComputedStyle(el(it).querySelector('figcaption'), '::before').content;
      };
      ok('caption: a gate nobody has picked up carries no ghost word under it',
        capOf(gate) === 'none', capOf(gate));
      select(gate.id);
      ok('caption: and picking it up offers one', /caption/.test(capOf(gate)), capOf(gate));
      select(null);

      /* a click on the switch turns the whole circuit on */
      var swEl = el(sw);
      var mid = function (n) {
        var r = n.getBoundingClientRect();
        return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                 bubbles: true, pointerId: 7, isPrimary: true };
      };
      var at = mid(swEl.querySelector('.lgsw'));
      swEl.dispatchEvent(new PointerEvent('pointerdown', at));
      swEl.dispatchEvent(new PointerEvent('pointerup', at));
      ok('switch: a click flicks it', sw.on === 1, sw.on);
      ok('switch: and the gate follows at once',
        el(gate).querySelector('.lgw').dataset.v === '1', el(gate).querySelector('.lgw').dataset.v);
      ok('switch: and so does the lamp',
        el(lamp).querySelector('.lgw').dataset.v === '1');
      ok('switch: the lamp lights with rays as well as colour, so a print still reads',
        getComputedStyle(el(lamp).querySelector('.lgray')).display !== 'none',
        getComputedStyle(el(lamp).querySelector('.lgray')).display);
      /* a glyph written in the paper's own colour is a glyph that is not there */
      var swNum = el(sw).querySelector('.lgval');
      var inkIs = getComputedStyle(el(sw).querySelector('.lgs')).stroke;
      ok('switch: the one it is sending is written in ink, not in paper',
        !!swNum && swNum.textContent === '1' && getComputedStyle(swNum).fill === inkIs,
        (swNum && swNum.textContent) + ' ' + (swNum && getComputedStyle(swNum).fill) +
        ' vs ink ' + inkIs);
      ok('lamp: a lit bulb writes its one in paper, so it reads against the fill',
        getComputedStyle(el(lamp).querySelector('.lgval')).fill !== inkIs,
        getComputedStyle(el(lamp).querySelector('.lgval')).fill);
      ok('switch: and the leads out of it say one',
        [].slice.call(Q('#pageHost svg.lgwires').querySelectorAll('g[data-w]'))
          .every(function (g) { return g.getAttribute('data-v') === '1'; }));
      /* a drag across it is not a click */
      var r0 = swEl.getBoundingClientRect();
      swEl.dispatchEvent(new PointerEvent('pointerdown', mid(swEl.querySelector('.lgsw'))));
      swEl.dispatchEvent(new PointerEvent('pointerup',
        { clientX: r0.left + r0.width / 2 + 40, clientY: r0.top + r0.height / 2,
          bubbles: true, pointerId: 7, isPrimary: true }));
      ok('switch: a hand that moved was dragging it, not flicking it', sw.on === 1, sw.on);

      /* ---- all five states are told apart with the colour taken away ---- */
      var lines = [].slice.call(Q('#pageHost svg.lgwires').querySelectorAll('g[data-w] .lgl'));
      var styleOf = function (v) {
        var g = Q('#pageHost svg.lgwires g[data-w]');
        var was = g.getAttribute('data-v');
        g.setAttribute('data-v', v);
        var cs = getComputedStyle(g.querySelector('.lgl'));
        var out = cs.strokeDasharray + '|' + cs.strokeWidth;
        g.setAttribute('data-v', was);
        return out;
      };
      var looks = ['0', '1', 'x', 'z', 'e'].map(styleOf);
      ok('logic: all five signal states differ by more than colour',
        new Set(looks).size === 5, looks.join('  '));

      /* ---- the new controls are controls, not static drawings ---- */
      var styled = mk('sw', { on: 0, x: 5, y: 35, w: 12 });
      var push = mk('btn', { x: 22, y: 35, w: 12 }), pushLamp = mk('lamp', { x: 39, y: 35, w: 12 });
      var clock = mk('clk', { x: 56, y: 35, w: 12, paused: true, hz: 4 });
      var dbits = [mk('sw', { on: 1, x: 5, y: 55, w: 10 }),
                   mk('sw', { on: 0, x: 18, y: 55, w: 10 }),
                   mk('sw', { on: 1, x: 31, y: 55, w: 10 }),
                   mk('sw', { on: 0, x: 44, y: 55, w: 10 })];
      var liveDigit = mk('digit', { x: 62, y: 55, w: 14 });
      page.items = [styled, push, pushLamp, clock].concat(dbits, [liveDigit]); page.wires = [];
      join(page, push, 'q', pushLamp, 'a');
      ['8','4','2','1'].forEach(function (p, i) { join(page, dbits[i], 'q', liveDigit, p); });
      await render(); await sleep(50);
      select(styled.id);
      var lookBtn = [].slice.call(el(styled).querySelectorAll('.tools button'))
        .filter(function (b) { return b.textContent === '▣'; })[0];
      lookBtn.click();
      ok('switch style: the toolbar can replace the lever with a rocker',
        styled.look === 'rocker' && !!el(styled).querySelector('.lgrock'), styled.look);
      lookBtn.click();
      ok('switch style: and replace the rocker with a plain 0/1 control',
        styled.look === 'plain' && !el(styled).querySelector('.lgrock') &&
        el(styled).querySelector('.lgval').textContent === '0', styled.look);

      var press = el(push).querySelector('.lgpress'), pushCtl = el(push).querySelector('.lgbtn');
      press.dispatchEvent(new PointerEvent('pointerdown', mid(press)));
      ok('push button: it sends one only while the pointer is held',
        push.on === 1 && V(page, pushLamp) === 1 && pushCtl.getAttribute('aria-pressed') === 'true',
        push.on + ',' + V(page, pushLamp));
      pushCtl.dispatchEvent(new PointerEvent('pointerup', mid(pushCtl)));
      ok('push button: releasing it returns the signal to nought',
        push.on === 0 && V(page, pushLamp) === 0 && pushCtl.getAttribute('aria-pressed') === 'false',
        push.on + ',' + V(page, pushLamp));

      ok('four-bit digit: the live seven-segment face draws A, not just a label',
        V(page, liveDigit) === 10 && el(liveDigit).querySelectorAll('.lgseg.on').length === 6 &&
        el(liveDigit).querySelector('.lgdigbad').hidden,
        V(page, liveDigit) + ',' + el(liveDigit).querySelectorAll('.lgseg.on').length + ' segments');

      select(clock.id);
      var runBtn = [].slice.call(el(clock).querySelectorAll('.tools button'))
        .filter(function (b) { return b.textContent === '▶'; })[0];
      ok('clock: a paused clock offers Run and says its speed', !!runBtn &&
        [].slice.call(el(clock).querySelectorAll('.tools button')).some(function (b) { return b.textContent === '4Hz'; }));
      runBtn.click();
      ok('clock: Run starts it and the same control becomes Pause',
        clock.paused === false && runBtn.textContent === 'Ⅱ', clock.paused + ',' + runBtn.textContent);
      runBtn.click();
      var stoppedClock = V(page, clock);
      var speedBtn = [].slice.call(el(clock).querySelectorAll('.tools button'))
        .filter(function (b) { return b.textContent === '4Hz'; })[0];
      speedBtn.click();
      ok('clock: Pause freezes the current level',
        clock.paused === true && runBtn.textContent === '▶' && V(page, clock) === stoppedClock &&
        clock.hz === .5 && speedBtn.textContent === '0.5Hz',
        clock.paused + ',' + V(page, clock) + ',' + speedBtn.textContent);
      clock.paused = false;
      LG_CLOCK.set(clock.id, { v: 0, next: performance.now() - 1 });
      lgClockTick();
      ok('clock: its scheduler advances the signal without a Run button or simulation step',
        lgClockValue(clock) === 1, lgClockValue(clock));
      lgPauseClock(clock, page);

      /* Put the original live circuit back for the lead-dragging checks below. */
      page.items = [sw, gate, lamp]; page.wires = [];
      join(page, sw, 'q', gate, 'a'); join(page, sw, 'q', gate, 'b');
      join(page, gate, 'q', lamp, 'a');
      await render(); await sleep(50);

      /* ---- pulling a lead by hand ---- */
      var pull = function (from, to) {
        var a = mid(from), b = mid(to);
        from.dispatchEvent(new PointerEvent('pointerdown', a));
        window.dispatchEvent(new PointerEvent('pointermove', b));
        window.dispatchEvent(new PointerEvent('pointerup', b));
      };
      var extra = mk('or', { x: 34, y: 40, w: 12 });
      page.items.push(extra);
      await render(); await sleep(40);
      pull(el(sw).querySelector('.lgp-out .lghit'),
           el(extra).querySelector('.lgp-in[data-p="a"] .lghit'));
      ok('wire drag: dragged from an output onto an input, it connects',
        !!lgFindWire(page, extra.id, 'a') &&
        lgFindWire(page, extra.id, 'a').from.item === sw.id,
        JSON.stringify(page.wires.map(function (w) { return w.to.item + '.' + w.to.port; })));
      ok('wire drag: the ghost is cleared up after it',
        !Q('#pageHost svg.lgwires .lghost') && !document.body.classList.contains('lgwiring'));
      /* and backwards: from a bare input onto an output */
      pull(el(extra).querySelector('.lgp-in[data-p="b"] .lghit'),
           el(gate).querySelector('.lgp-out .lghit'));
      ok('wire drag: and the same gesture backwards, from an input to an output',
        !!lgFindWire(page, extra.id, 'b') &&
        lgFindWire(page, extra.id, 'b').from.item === gate.id,
        JSON.stringify(page.wires.map(function (w) { return w.from.item + '>' + w.to.port; })));
      /* pulling on an input that is already driven picks the lead up and moves it */
      var moveTo = mk('not', { x: 60, y: 40, w: 12 });
      page.items.push(moveTo);
      await render(); await sleep(40);
      var before = page.wires.length;
      pull(el(extra).querySelector('.lgp-in[data-p="b"] .lghit'),
           el(moveTo).querySelector('.lgp-in[data-p="a"] .lghit'));
      ok('wire drag: pulling a driven input picks the lead up rather than starting a second',
        page.wires.length === before && !lgFindWire(page, extra.id, 'b') &&
        !!lgFindWire(page, moveTo.id, 'a') &&
        lgFindWire(page, moveTo.id, 'a').from.item === gate.id,
        page.wires.length + ' of ' + before);
      /* let go over bare paper and the lead is simply gone */
      before = page.wires.length;
      pull(el(extra).querySelector('.lgp-in[data-p="a"] .lghit'), Q('#pageHost .surface'));
      ok('wire drag: let go over the paper, the lead comes out',
        page.wires.length === before - 1, page.wires.length + ' of ' + before);

      /* ---- picking a lead out, and taking it away ---- */
      await render(); await sleep(40);
      var g0 = Q('#pageHost svg.lgwires g[data-w]');
      var wid = g0.dataset.w;
      g0.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      ok('lead: clicking one picks it out',
        !!Q('#pageHost svg.lgwires g[data-w].sel') && !!Q('.lgchip'));
      var n = page.wires.length;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      ok('lead: Delete takes the one that is picked out away',
        page.wires.length === n - 1 && !page.wires.some(function (w) { return w.id === wid; }),
        page.wires.length + ' of ' + n);
      ok('lead: and the chip goes with it', !Q('.lgchip'));

      /* ---- a gate that goes takes its leads with it ---- */
      page.items = [sw, gate, lamp]; page.wires = [];
      join(page, sw, 'q', gate, 'a'); join(page, sw, 'q', gate, 'b');
      join(page, gate, 'q', lamp, 'a');
      await render(); await sleep(40);
      removeItem(page, gate);
      await sleep(60);
      ok('gone: deleting a gate takes every lead on it', (page.wires || []).length === 0,
        JSON.stringify(page.wires));
      ok('gone: and the lamp is back to not knowing', V(page, lamp) === 'x', V(page, lamp));

      /* ---- ports are measured, not assumed: a turned gate proves it ----
         Rotation about an element's own middle leaves that middle where it was,
         so the middle of a rotated dot's box IS the dot. Turn a gate a quarter
         turn and its output port must swing a quarter turn about the gate's
         middle — which it cannot do if the anchor came off an unrotated box. */
      var rg = mk('and', { x: 30, y: 30, w: 14, rot: 0 });
      page.items = [rg]; page.wires = [];
      await render(); await sleep(40);
      var vecOf = function () {
        var e = el(rg), d = e.querySelector('.lgp-out .lgdot');
        var er = e.getBoundingClientRect(), dr = d.getBoundingClientRect();
        return { x: (dr.left + dr.right) / 2 - (er.left + er.right) / 2,
                 y: (dr.top + dr.bottom) / 2 - (er.top + er.bottom) / 2 };
      };
      var v0 = vecOf();
      /* measured from the middle of the ITEM, which is what rotate() turns
         about — not from the middle of the symbol, which sits a caption's
         height above it */
      ok('rotation: the output port starts out to the right of the middle', v0.x > 4,
        v0.x.toFixed(1) + ',' + v0.y.toFixed(1));
      rg.rot = 90;
      el(rg).style.transform = 'rotate(90deg)';
      var v9 = vecOf();
      ok('rotation: a quarter turn swings the port a quarter turn',
        Math.abs(v9.x - (-v0.y)) < 2.5 && Math.abs(v9.y - v0.x) < 2.5,
        'was ' + v0.x.toFixed(1) + ',' + v0.y.toFixed(1) +
        ' now ' + v9.x.toFixed(1) + ',' + v9.y.toFixed(1));
      ok('rotation: which is nowhere near the edge of its box',
        Math.abs(v9.x) < Math.abs(v0.x) * 0.6,
        v9.x.toFixed(1) + ' vs ' + v0.x.toFixed(1));
      rg.rot = 37;
      el(rg).style.transform = 'rotate(37deg)';
      var v37 = vecOf(), L0 = Math.hypot(v0.x, v0.y), L37 = Math.hypot(v37.x, v37.y);
      ok('rotation: turning it does not stretch the reach of its ports',
        Math.abs(L0 - L37) < 2.5, L0.toFixed(1) + ' vs ' + L37.toFixed(1));
      ok('rotation: and a lead leaves along the way the gate is facing',
        Math.abs(lgDir(37).x - Math.cos(37 * Math.PI / 180)) < 1e-9 &&
        Math.abs(lgDir(37).y - Math.sin(37 * Math.PI / 180)) < 1e-9);
      rg.rot = 0;

      /* ---- moving and resizing: the leads follow ---- */
      var ma = mk('sw', { on: 1, x: 8, y: 60, w: 12 }), mb = mk('not', { x: 40, y: 60, w: 12 });
      page.items = [ma, mb]; page.wires = [];
      join(page, ma, 'q', mb, 'a');
      await render(); await sleep(40);
      lgLay();
      var dOf = function () {
        var g = Q('#pageHost svg.lgwires g[data-w]');
        return g ? g.querySelector('.lgl').getAttribute('d') : '';
      };
      var d0 = dOf();
      ok('follow: a lead is drawn between them', !!d0 && d0.indexOf('NaN') < 0, d0);
      mb.x = 62; el(mb).style.left = '62%';
      lgLay();
      ok('follow: moving a gate moves the lead with it', dOf() !== d0 && dOf().indexOf('NaN') < 0,
        dOf());
      var d1 = dOf();
      mb.w = 20; el(mb).style.width = '20%';
      lgLay();
      ok('follow: and so does resizing it', dOf() !== d1 && dOf().indexOf('NaN') < 0, dOf());

      /* ---- marquee selection, rigid group movement, and circuit cleanup ---- */
      var lonely = mk('or', { x: 76, y: 15, w: 12 });
      page.items.push(lonely);
      await render(); await sleep(40);
      Q('#selectBtn').click();
      ok('selection: the toolbar enters a one-shot rectangle mode',
        selectMode && document.body.classList.contains('selecting') && /Drag to select/.test(Q('#selectBtn').textContent));
      var ar = el(ma).getBoundingClientRect(), br = el(mb).getBoundingClientRect();
      var surf = Q('#pageHost .surface');
      var boxA = { clientX: Math.min(ar.left, br.left) - 3, clientY: Math.min(ar.top, br.top) - 3,
                   bubbles: true, pointerId: 61, isPrimary: true, button: 0 };
      var boxB = { clientX: Math.max(ar.right, br.right) + 3, clientY: Math.max(ar.bottom, br.bottom) + 3,
                   bubbles: true, pointerId: 61, isPrimary: true, button: 0 };
      surf.dispatchEvent(new PointerEvent('pointerdown', boxA));
      surf.dispatchEvent(new PointerEvent('pointermove', boxB));
      ok('selection: items light while the rectangle crosses them',
        surf.querySelectorAll('.item.multipreview').length === 2,
        surf.querySelectorAll('.item.multipreview').length);
      surf.dispatchEvent(new PointerEvent('pointerup', boxB));
      ok('selection: release commits exactly those two items and leaves the mode',
        SELECTED.size === 2 && SELECTED.has(ma.id) && SELECTED.has(mb.id) &&
        !SELECTED.has(lonely.id) && !selectMode,
        [].slice.call(SELECTED).join(','));
      ok('selection: group actions live in the main toolbar for touch as well as desktop',
        !Q('#selectDelete').hidden && !!Q('#selectActions button'));

      var ax = ma.x, ay = ma.y, bx = mb.x, by = mb.y, lx = lonely.x, ly = lonely.y;
      var hand = mid(el(ma));
      el(ma).dispatchEvent(new PointerEvent('pointerdown', hand));
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: hand.clientX + 24, clientY: hand.clientY + 16,
        bubbles: true, pointerId: hand.pointerId, isPrimary: true }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        clientX: hand.clientX + 24, clientY: hand.clientY + 16,
        bubbles: true, pointerId: hand.pointerId, isPrimary: true }));
      ok('selection: dragging either member moves the set as one rigid arrangement',
        Math.abs((ma.x - ax) - (mb.x - bx)) < .01 &&
        Math.abs((ma.y - ay) - (mb.y - by)) < .01 && ma.x !== ax,
        [ma.x - ax, ma.y - ay, mb.x - bx, mb.y - by].map(function (x) { return x.toFixed(2); }).join(','));
      ok('selection: an item outside the rectangle does not move with the set',
        lonely.x === lx && lonely.y === ly, lonely.x + ',' + lonely.y);

      ma.x = 62; ma.y = 68; ma.rot = 19;
      mb.x = 8; mb.y = 48; mb.rot = -27;
      el(ma).style.left = ma.x + '%'; el(ma).style.top = ma.y + '%'; el(ma).style.transform = 'rotate(19deg)';
      el(mb).style.left = mb.x + '%'; el(mb).style.top = mb.y + '%'; el(mb).style.transform = 'rotate(-27deg)';
      syncSelectionBar();
      var tidyBtn = [].slice.call(Q('#selectActions').querySelectorAll('button'))
        .filter(function (b) { return /Tidy logic/.test(b.textContent); })[0];
      ok('tidy: a connected logic selection offers the operation', !!tidyBtn);
      tidyBtn.click();
      await sleep(SPRING_STILL.matches ? 40 : 1100);
      lgLay();
      ok('tidy: signal sources are placed before the gates they feed',
        ma.x < mb.x && ma.rot === 0 && mb.rot === 0,
        ma.x.toFixed(1) + ' → ' + mb.x.toFixed(1) + ', rotations ' + ma.rot + ',' + mb.rot);
      ok('tidy: internal leads become saved orthogonal routes without changing endpoints',
        page.wires[0].clean === 1 && !/C/.test(dOf()) && /[HV]/.test(dOf()) &&
        page.wires[0].from.item === ma.id && page.wires[0].to.item === mb.id,
        dOf());
      ok('tidy: the group remains selected so it can be moved or deleted next',
        SELECTED.size === 2 && el(ma).classList.contains('multi') && el(mb).classList.contains('multi'));

      Q('#selectDelete').click();
      await sleep(100);
      ok('selection: the main-toolbar Delete removes the whole set and its internal lead',
        page.items.length === 1 && page.items[0] === lonely && page.wires.length === 0 && SELECTED.size === 0,
        page.items.length + ' items, ' + page.wires.length + ' leads');

      /* ---- what it says for itself: the truth table ---- */
      var tt = mk('nand', { x: 20, y: 20, w: 12 }), ts = mk('sw', { on: 1, x: 5, y: 20, w: 12 });
      page.items = [ts, tt]; page.wires = [];
      join(page, ts, 'q', tt, 'a');
      await render(); await sleep(40);
      select(tt.id);
      var ttBtn = [].slice.call(el(tt).querySelectorAll('.tools button'))
        .filter(function (b) { return b.textContent === '⊞'; })[0];
      ok('table: a gate offers its truth table', !!ttBtn);
      ttBtn.click();
      await sleep(60);
      ok('table: the panel opens', !!Q('#lgtt.open'));
      var pr = Q('#lgtt').getBoundingClientRect(), gr = el(tt).getBoundingClientRect();
      ok('table: and not on top of the gate it is explaining',
        pr.right <= gr.left + 1 || pr.left >= gr.right - 1 ||
        pr.bottom <= gr.top + 1 || pr.top >= gr.bottom - 1,
        'panel ' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round).join(',') +
        ' gate ' + [gr.left, gr.top, gr.right, gr.bottom].map(Math.round).join(','));
      ok('table: with four rows and three columns',
        Q('#lgtt .lgttt tbody').children.length === 4 &&
        Q('#lgtt .lgttt thead tr').children.length === 3,
        Q('#lgtt .lgttt tbody').children.length + ' rows');
      ok('table: the columns are named after the ports',
        [].slice.call(Q('#lgtt .lgttt thead tr').children)
          .map(function (c) { return c.textContent; }).join('') === 'abq',
        [].slice.call(Q('#lgtt .lgttt thead tr').children)
          .map(function (c) { return c.textContent; }).join(''));
      ok('table: it holds the gate\'s real answers',
        [].slice.call(Q('#lgtt .lgttt tbody').children)
          .map(function (r) { return r.lastElementChild.textContent; }).join('') === '1110',
        [].slice.call(Q('#lgtt .lgttt tbody').children)
          .map(function (r) { return r.lastElementChild.textContent; }).join(''));
      ok('table: with b unwired, no row claims to be the one it is on',
        !Q('#lgtt .lgttt tr.on') && /not driven/.test(Q('#lgtt .lgttnow').textContent),
        Q('#lgtt .lgttnow').textContent);
      join(page, ts, 'q', tt, 'b');
      lgSync();
      ok('table: wire the last input and the right row lights up',
        !!Q('#lgtt .lgttt tr.on') &&
        [].slice.call(Q('#lgtt .lgttt tbody').children).indexOf(Q('#lgtt .lgttt tr.on')) === 3,
        [].slice.call(Q('#lgtt .lgttt tbody').children).indexOf(Q('#lgtt .lgttt tr.on')));
      ok('table: and it says what it is doing in words',
        /a=1\s+b=1\s+→\s+q=0/.test(Q('#lgtt .lgttnow').textContent),
        Q('#lgtt .lgttnow').textContent);
      ts.on = 0; lgSync();
      ok('table: flicking the switch walks the lit row',
        [].slice.call(Q('#lgtt .lgttt tbody').children).indexOf(Q('#lgtt .lgttt tr.on')) === 0,
        [].slice.call(Q('#lgtt .lgttt tbody').children).indexOf(Q('#lgtt .lgttt tr.on')));
      ok('table: a built-in gate\'s answers cannot be typed over',
        !Q('#lgtt .lgttt td[data-r]'));
      /* the same table, as a real table on the paper */
      var was = page.items.length;
      Q('#lgtt .lgttout').click();
      await sleep(160);
      var made = page.items[page.items.length - 1];
      ok('table: it can be put on the sheet as an ordinary table',
        page.items.length === was + 1 && made.type === 'table', made && made.type);
      ok('table: with a header row and one row per combination',
        made.rows.length === 5 && made.rows[0].join('') === 'abq' &&
        made.rows.map(function (r) { return r[r.length - 1]; }).join('') === 'q1110',
        JSON.stringify(made.rows));
      page.items = page.items.filter(function (x) { return x !== made; });
      lgTTClose();
      await sleep(60);

      /* ---- a custom gate is the one you may type over ---- */
      var cg = mk('cust', { x: 20, y: 20, w: 14 });
      page.items = [cg]; page.wires = [];
      await render(); await sleep(40);
      select(cg.id);
      var cBtn = [].slice.call(el(cg).querySelectorAll('.tools button'))
        .filter(function (b) { return b.textContent === '⊞✎'; })[0];
      ok('custom: it offers an editor rather than a reading', !!cBtn);
      cBtn.click();
      await sleep(60);
      ok('custom: the answers are clickable', !!Q('#lgtt .lgttt td[data-r]'));
      ok('custom: it starts as an AND', lgDef(cg).table.join('') === '0001',
        lgDef(cg).table.join(''));
      lgSync();
      ok('custom: repainting the circuit does not rub the gate\'s name out',
        el(cg).querySelector('.lgnum').textContent === 'Custom',
        el(cg).querySelector('.lgnum').textContent);
      ok('custom: and its ports are lettered on its own face',
        el(cg).querySelectorAll('.lgtiny').length === lgDef(cg).ins.length &&
        [].slice.call(el(cg).querySelectorAll('.lgtiny'))
          .map(function (t) { return t.textContent; }).join('') === 'ab',
        el(cg).querySelectorAll('.lgtiny').length + ' letters');
      Q('#lgtt .lgttt td[data-r="0"]').click();
      await sleep(40);
      ok('custom: clicking an answer turns it over', lgDef(cg).table.join('') === '1001',
        lgDef(cg).table.join(''));
      ok('custom: which is a gate of its own now — XNOR, as it happens',
        lgDef(cg).table.join('') === LG_GATES.xnor.table.join(''));
      Q('#lgtt .lgttedit [data-s="1"]').click();
      await sleep(60);
      ok('custom: a third input doubles the table', lgDef(cg).ins.length === 3 &&
        lgDef(cg).table.length === 8, lgDef(cg).ins.length + ' in, ' +
        lgDef(cg).table.length + ' rows');
      ok('custom: and the answers already written are kept',
        lgDef(cg).table.slice(0, 4).join('') === '1001', lgDef(cg).table.join(''));
      ok('custom: the symbol grew a port to match',
        el(cg).querySelectorAll('.lgp-in').length === 3,
        el(cg).querySelectorAll('.lgp-in').length + ' inputs');
      ok('custom: and it is taller than a two-input gate', lgH(cg) > 64, lgH(cg));
      Q('#lgtt .lgttedit [data-s="-1"]').click();
      await sleep(60);
      ok('custom: taking an input away takes its port with it',
        lgDef(cg).ins.length === 2 && el(cg).querySelectorAll('.lgp-in').length === 2,
        lgDef(cg).ins.length + ',' + el(cg).querySelectorAll('.lgp-in').length);
      lgTTClose();
      await sleep(60);

      /* ---- undo ---- */
      var act = function () {
        document.body.dispatchEvent(new PointerEvent('pointerdown',
          { bubbles: true, pointerId: 3, isPrimary: true }));
      };
      page.items = []; page.wires = [];
      queueSave(page.id); histCommit();
      await render();
      act();
      addItem('lg-and', { x: 20, y: 20 }, page);
      await sleep(140);
      act(); histCommit();
      ok('undo: a gate placed from the palette is one step', page.items.length === 1 &&
        page.items[0].type === 'logic', page.items.length + ' items');
      await undo();
      ok('undo: and it comes off the sheet again', sheet().items.length === 0,
        sheet().items.length + ' items');
      await redo();
      ok('redo: and back on it', sheet().items.length === 1);

      page = sheet();
      var ua = mk('sw', { on: 0, x: 8, y: 8, w: 12 }), ub = mk('not', { x: 40, y: 8, w: 12 });
      page.items = [ua, ub]; page.wires = [];
      queueSave(page.id); histCommit();
      await render();
      act();
      lgConnect(page, { item: ua.id, port: 'q' }, { item: ub.id, port: 'a' });
      histCommit();
      ok('undo: making a connection is a step of its own',
        (sheet().wires || []).length === 1, (sheet().wires || []).length);
      await undo();
      ok('undo: and it takes the lead out again', (sheet().wires || []).length === 0,
        (sheet().wires || []).length);
      await redo();
      ok('redo: and puts it back', (sheet().wires || []).length === 1);

      page = sheet();
      var swu = page.items.find(function (x) { return x.gate === 'sw'; });
      act();
      lgToggle(swu, page);
      histCommit();
      ok('undo: flicking a switch is a step', swu.on === 1, swu.on);
      await undo();
      ok('undo: and it flicks back',
        sheet().items.find(function (x) { return x.gate === 'sw'; }).on === 0);
      await redo();
      ok('redo: and on again',
        sheet().items.find(function (x) { return x.gate === 'sw'; }).on === 1);

      /* ---- saved, and read back ---- */
      page = sheet();
      var fa = mk('sw', { on: 1, x: 8, y: 8, w: 12 }), fb = mk('xor', { x: 40, y: 8, w: 12 });
      page.items = [fa, fb]; page.wires = [];
      join(page, fa, 'q', fb, 'a'); join(page, fa, 'q', fb, 'b');
      queueSave(page.id);
      await flush();
      var read = await kvGet(kPage(page.id));
      ok('save: the leads are written to the store with the sheet',
        !!read && (read.wires || []).length === 2, read ? (read.wires || []).length : 'no page');
      ok('save: and the circuit read back says the same thing',
        lgEval(read).get(fb.id) === lgEval(page).get(fb.id) &&
        lgEval(read).get(fb.id) === 0, lgEval(read).get(fb.id));
      ok('save: a gate is stored as what it means, not as its picture',
        !/svg|path d=/.test(JSON.stringify(read.items.filter(function (x) {
          return x.type === 'logic'; }))),
        JSON.stringify(read.items[1]).slice(0, 120));

      /* ---- backed up, and restored ---- */
      var snap = JSON.parse(JSON.stringify(await backupNote()));
      var back = snap.pages[0];
      ok('backup: the circuit is in the backup file', (back.wires || []).length === 2,
        (back.wires || []).length);
      ok('backup: a restore does not renumber items — which is why the leads still land',
        back.items.map(function (x) { return x.id; }).join(',') ===
        page.items.map(function (x) { return x.id; }).join(','));
      ok('backup: and it works out the same after the round trip',
        lgEval(back).get(fb.id) === 0, lgEval(back).get(fb.id));
      fa.on = 0;
      ok('backup: the copy is a copy — the live sheet moved and it did not',
        lgEval(back).get(fb.id) === 0 && lgEval(page).get(fb.id) === 0);

      /* ---- print, a thumbnail and an export all draw it ---- */
      fa.on = 1;
      page.items.push(mk('lamp', { x: 70, y: 8, w: 12 }));
      join(page, fb, 'q', page.items[2], 'a');
      await render(); await sleep(40);
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:660px';
      document.body.appendChild(host);
      var pg = buildPage(page, false);
      host.appendChild(pg); fit(pg);
      drawStaticStrings(pg, page);
      var ssvg = pg.querySelector('svg.lgwires');
      ok('static: the leads are drawn for a print too', !!ssvg &&
        ssvg.querySelectorAll('path.lgl').length === 3,
        ssvg ? ssvg.querySelectorAll('path.lgl').length : 'no overlay');
      ok('static: with no NaN in any of them', !!ssvg &&
        ![].slice.call(ssvg.querySelectorAll('path.lgl')).some(function (p) {
          return /NaN/.test(p.getAttribute('d') || ''); }));
      ok('static: they carry the value they are carrying',
        !!ssvg && [].slice.call(ssvg.querySelectorAll('path.lgl'))
          .every(function (p) { return p.getAttribute('data-v') === '0' ||
                                       p.getAttribute('data-v') === '1'; }),
        ssvg ? [].slice.call(ssvg.querySelectorAll('path.lgl'))
          .map(function (p) { return p.getAttribute('data-v'); }).join(',') : '');
      ok('static: a junction blob comes through as well',
        !!ssvg && !!ssvg.querySelector('circle.lgjn'));
      ok('static: a lamp built for a print reads its value, not a placeholder',
        pg.querySelector('.item[data-id="' + page.items[2].id + '"] .lgval').textContent === '0',
        pg.querySelector('.item[data-id="' + page.items[2].id + '"] .lgval').textContent);
      ok('static: the symbols come through, still knowing their values',
        pg.querySelectorAll('.lgw').length === 3 &&
        pg.querySelector('.item[data-id="' + fb.id + '"] .lgw').dataset.v === '0',
        pg.querySelectorAll('.lgw').length + ' symbols');
      ok('static: and with no handles on them',
        !pg.querySelector('.lgw ~ .rot') && !pg.querySelector('.rs'));
      host.remove();

      /* ---- every theme draws it in that theme's ink ---- */
      var themeWas = index.theme;
      var inks = [];
      ['graph', 'dark', 'blue', 'kraft'].forEach(function (t) {
        index.theme = t; applyTheme();
        var cs = getComputedStyle(el(fb).querySelector('.lgb'));
        inks.push(cs.stroke);
      });
      index.theme = themeWas; applyTheme();
      ok('themes: the symbol takes each theme\'s ink rather than a baked-in black',
        new Set(inks).size === 4 && inks.every(function (c) { return /rgb/.test(c); }),
        inks.join(' '));

      page.items = keepItems; page.wires = keepWires;
      lgDeselect();
      queueSave(page.id); histCommit();
      await render();
    });

    /* ---- the stylesheet the export inlines ---- */
    await stage('appcss', async function () {
      var s = document.getElementById('appcss');
      ok('appcss: element exists', !!s);
      ok('appcss: has rules in it', !!s && s.textContent.length > 2000,
        'length ' + (s ? s.textContent.length : 0));
      ok('appcss: knows .item', !!s && s.textContent.indexOf('.item') >= 0);
      ok('appcss: knows the note', !!s && s.textContent.indexOf('.note') >= 0);
      ok('appcss: knows the plot', !!s && s.textContent.indexOf('.mplot') >= 0);
      ok('appcss: knows the deck', !!s && s.textContent.indexOf('.deck') >= 0);
      ok('appcss: knows the table', !!s && s.textContent.indexOf('.tgrid') >= 0);
      ok('appcss: knows the nodes', !!s && s.textContent.indexOf('svg.nwires') >= 0);
      ok('appcss: knows the logic gates', !!s && s.textContent.indexOf('svg.lgwires') >= 0);
      ok('appcss: knows the molecule', !!s && s.textContent.indexOf('.molsvg') >= 0);
      ok('appcss: knows the chart of the nuclides', !!s && s.textContent.indexOf('.nusvg') >= 0);
    });

    /* ---- ink, layers, pages ---- */
    await stage('ink & layers', async function () {
      ok('layers: at least one', layers(index).length >= 1);
      var page = sheet();
      page.ink = [{ lay: curLayerId(), m: 'pen', c: '#000', w: 4,
                    pts: [[100, 100, .5], [200, 200, .5], [300, 150, .5]] }];
      await render();
      ok('ink: a stroke is drawn', !!Q('#pageHost svg.ink path'));
      page.ink = [];
      ok('pages: exactly one, always', index.pages.length === 1, index.pages.length);
    });

    /* ---- taking it back ----
       The stack never hears about a note, a stroke or a page: it watches the
       two doors every change in the app already goes through. So what is
       checked here is that a step is the thing you did — no more of it and no
       less — and that putting it back puts back all of it. */
    await stage('undo', async function () {
      var page = sheet(), homeId = page.id;
      var items0 = page.items.slice(), ink0 = (page.ink || []).slice();
      page.items = []; page.ink = [];
      queueSave(page.id); histCommit();
      await render();
      /* a press is what closes one step and opens the next — the same event the
         hand would send */
      var act = function () {
        document.body.dispatchEvent(new PointerEvent('pointerdown',
          { bubbles: true, pointerId: 3, isPrimary: true }));
      };
      var stack = function () { return HIST.past.length; };
      var home = function () { return pages.get(homeId); };

      ok('undo: it has a sound of its own', typeof SND.undo === 'function' &&
        typeof SND.redo === 'function' && typeof SND.nope === 'function');

      /* --- a thing placed comes off the page again, and goes back on --- */
      act();
      addItem('note', { x: 12, y: 14 }, page);
      await sleep(140);
      var noteId = page.items[0] && page.items[0].id;
      act(); histCommit();
      ok('undo: placing a note is a step', stack() > 0, stack() + ' steps');
      await undo();
      ok('undo: the note is off the page', home().items.length === 0, home().items.length + ' items');
      ok('undo: and off the paper', !Q('#pageHost .item[data-type="note"]'));
      await redo();
      ok('redo: the same note is back', home().items.length === 1 &&
        home().items[0].id === noteId, home().items.length + ' items');
      ok('redo: and back on the paper', !!Q('#pageHost .item[data-type="note"]'));

      /* --- and a thing deleted comes back whole --- */
      act();
      removeItem(home(), home().items[0]);
      await sleep(140);
      act(); histCommit();
      ok('undo: the delete emptied the page', home().items.length === 0);
      await undo();
      ok('undo: the note is back from the delete', home().items.length === 1 &&
        home().items[0].id === noteId);

      /* --- a move goes back where it came from, throw and all ---
         A released item is still landing long after the hand let go of it: the
         second write has no press behind it, so it belongs to the same step. */
      var x0 = home().items[0].x, n0 = stack();
      act();
      home().items[0].x = x0 + 21; queueSave(homeId); histCommit();
      ok('undo: the drag is one step', stack() === n0 + 1, n0 + ' -> ' + stack());
      home().items[0].x = x0 + 30; queueSave(homeId); histCommit();
      ok('undo: the throw after it is not a second one', stack() === n0 + 1,
        n0 + ' -> ' + stack());
      await undo();
      ok('undo: it lands where it started', home().items[0].x === x0,
        home().items[0].x + ' vs ' + x0);

      /* --- ink is the page's, so it steps back with it --- */
      act();
      home().ink = [{ lay: curLayerId(), m: 'pen', c: '#000', w: 4,
                      pts: [[100, 100], [300, 240]] }];
      queueSave(homeId); histCommit();
      await undo();
      ok('undo: the stroke is gone', (home().ink || []).length === 0);
      await redo();
      ok('redo: and drawn again', (home().ink || []).length === 1 &&
        !!Q('#pageHost svg.ink path'));
      act(); home().ink = []; queueSave(homeId); histCommit();

      /* --- a blob is kept for as long as the delete can still be taken back ---
         any item may own one; a note carrying a media id exercises the same
         path a video or an attachment takes */
      var mid = 'probe-blob-' + uid();
      await mediaSet(mid, new Blob(['probe'], { type: 'text/plain' }));
      act();
      home().items.push({ id: uid(), type: 'note', x: 40, y: 40, w: 30, rot: 0, z: 9,
                          lay: curLayerId(), media: mid, html: 'has a file' });
      queueSave(homeId); histCommit();
      await render();
      act();
      removeItem(home(), home().items[home().items.length - 1]);
      await sleep(140);
      act(); histCommit();
      ok('undo: a deleted item keeps its file while it can still come back',
        !!(await mediaGet(mid)));
      await undo();
      ok('undo: the item is back', home().items.some(function (x) { return x.media === mid; }));
      ok('undo: and its file with it', !!(await mediaGet(mid)));
      act();
      removeItem(home(), home().items.filter(function (x) { return x.media === mid; })[0]);
      await sleep(140); act(); histCommit();

      /* --- the sheet's own shape is a step, and what is on it moves with it --- */
      var w0 = pgW();
      home().items.push({ id: uid(), type: 'note', x: 40, y: 40, w: 10, rot: 0, z: 30,
                          lay: curLayerId(), html: 'on the sheet' });
      queueSave(homeId); histCommit(); await render();
      var x0 = home().items[home().items.length - 1].x;
      act();
      growSheet('r');
      await sleep(300); act(); histCommit();
      ok('undo: growing the sheet really grew it', pgW() === w0 + SHEET_STEP, pgW());
      ok('undo: and remapped what was on it', home().items[home().items.length - 1].x < x0,
        x0 + ' -> ' + home().items[home().items.length - 1].x);
      await undo();
      ok('undo: the sheet is its old size again', pgW() === w0, pgW());
      ok('undo: and everything on it is back where it was',
        Math.abs(home().items[home().items.length - 1].x - x0) < 1e-6,
        home().items[home().items.length - 1].x + ' wanted ' + x0);
      await redo();
      ok('redo: bigger again', pgW() === w0 + SHEET_STEP, pgW());
      await undo(); await sleep(120);
      home().items.pop(); queueSave(homeId); histCommit();
      await render();

      /* --- doing something new drops what was waiting to be put back --- */
      act();
      addItem('note', { x: 30, y: 60 }, page);
      await sleep(140); act(); histCommit();
      await undo();
      ok('undo: there is something to put back', HIST.future.length > 0,
        HIST.future.length + ' waiting');
      act();
      addItem('note', { x: 50, y: 70 }, page);
      await sleep(140); act(); histCommit();
      ok('undo: a new thing done drops the redo', HIST.future.length === 0);

      /* --- the keys, which is how any of this is actually reached ----
         A new note lands with the caret in it, and the keys inside a box belong
         to the box — so step out of it first, the way a hand would. */
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      await sleep(120); act(); histCommit();
      var nk = home().items.length;
      act();
      home().items.push({ id: uid(), type: 'note', x: 60, y: 20, w: 30, rot: 0, z: 12,
                          lay: curLayerId(), html: 'by the keyboard' });
      queueSave(homeId); histCommit(); await render();
      ok('undo: ctrl+Z has something to take back', home().items.length === nk + 1);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await sleep(220);
      ok('undo: ctrl+Z takes back the last thing done', home().items.length === nk,
        (nk + 1) + ' -> ' + home().items.length);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
      await sleep(220);
      ok('redo: ctrl+Y undoes the undo', home().items.length === nk + 1,
        nk + ' -> ' + home().items.length);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await sleep(220);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
      await sleep(220);
      ok('redo: ctrl+shift+Z is the other way round to it', home().items.length === nk + 1,
        nk + ' -> ' + home().items.length);
      nk = home().items.length;

      /* --- a real drag, and the throw that carries on after it ----
         The hand lets go at one place and the item lands at another, writing
         itself down twice; one press of ctrl+Z has to put it back where it was
         picked up from. (Headless never gives the caret focus, so a new item is
         left wearing `editing` and would refuse the drag — see the traps in
         tools/verify/README.md.) */
      QA('#pageHost .item.editing').forEach(function (n) { n.classList.remove('editing'); });
      act(); histCommit();
      var dg = home().items[home().items.length - 1], dx0 = dg.x, dy0 = dg.y;
      var dEl = Q('#pageHost .item[data-id="' + dg.id + '"]');
      var dR = dEl.getBoundingClientRect(), nd = stack();
      var pev = function (el, t, x, y) {
        el.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, button: 0,
          buttons: t === 'pointerup' ? 0 : 1, pointerId: 5, isPrimary: true,
          bubbles: true, cancelable: true }));
      };
      pev(dEl, 'pointerdown', dR.left + 20, dR.top + 20);
      for (var d = 1; d <= 10; d++) pev(window, 'pointermove', dR.left + 20 + d * 12, dR.top + 20 + d * 6);
      pev(window, 'pointerup', dR.left + 140, dR.top + 80);
      await sleep(1300);                                 // the throw lands, then the stack settles
      histCommit();
      ok('undo: the drag really moved it', Math.abs(home().items[home().items.length - 1].x - dx0) > 2,
        dx0 + ' -> ' + home().items[home().items.length - 1].x);
      ok('undo: a drag and its throw are one step', stack() === nd + 1, nd + ' -> ' + stack());
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await sleep(250);
      var dgb = home().items[home().items.length - 1];
      ok('undo: one ctrl+Z puts a thrown item back where it was picked up',
        Math.abs(dgb.x - dx0) < 0.01 && Math.abs(dgb.y - dy0) < 0.01,
        dgb.x + ',' + dgb.y + ' vs ' + dx0 + ',' + dy0);

      /* --- two strokes of real ink, taken back one at a time --- */
      setDraw(true); await sleep(140);
      var cap = Q('#pageHost .inkcap'), cr = cap.getBoundingClientRect();
      var stroke = function (off) {
        pev(cap, 'pointerdown', cr.left + 100 + off, cr.top + 100);
        pev(cap, 'pointermove', cr.left + 160 + off, cr.top + 160);
        pev(cap, 'pointermove', cr.left + 220 + off, cr.top + 120);
        pev(cap, 'pointerup', cr.left + 220 + off, cr.top + 120);
      };
      stroke(0); await sleep(120); stroke(200); await sleep(900); histCommit();
      ok('undo: two strokes went down', (home().ink || []).length === 2,
        (home().ink || []).length + ' strokes');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await sleep(250);
      ok('undo: ctrl+Z takes back one stroke, not the pair', (home().ink || []).length === 1,
        (home().ink || []).length + ' strokes');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
      await sleep(250);
      ok('redo: and draws it again', (home().ink || []).length === 2 &&
        !!Q('#pageHost svg.ink path'), (home().ink || []).length + ' strokes');
      setDraw(false);
      act(); home().ink = []; queueSave(homeId); histCommit();

      /* --- typing is one step a burst, not one a letter --- */
      act();
      addItem('body', { x: 62, y: 62 }, home());
      await sleep(200);
      QA('#pageHost .item.editing').forEach(function (n) { n.classList.remove('editing'); });
      act(); histCommit();
      var tx = Q('#pageHost .item[data-type="text"] .txt'), nt = stack();
      tx.focus();
      'hello'.split('').forEach(function (ch) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        tx.textContent += ch;
        tx.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      await sleep(900); histCommit();                    // a pause is what closes a burst
      ok('undo: five letters are one step, not five', stack() === nt + 1, nt + ' -> ' + stack());
      var typed = home().items.filter(function (x) { return x.type === 'text'; }).pop();
      ok('undo: the letters went in', (typed.html || '').indexOf('hello') >= 0, typed.html);
      tx.blur(); await sleep(150); histCommit();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await sleep(250);
      var typed2 = home().items.filter(function (x) { return x.type === 'text'; }).pop();
      ok('undo: ctrl+Z takes the whole burst back', !!typed2 &&
        (typed2.html || '').indexOf('hello') < 0, typed2 && typed2.html);

      /* --- and when there is nothing left it says so rather than throwing --- */
      HIST.past = []; HIST.future = []; histSync();
      var ne = home().items.length;
      ok('undo: the button knows there is nothing', Q('#undoBtn').classList.contains('off') &&
        Q('#redoBtn').classList.contains('off'));
      await undo();
      ok('undo: an empty stack leaves the page alone', home().items.length === ne,
        home().items.length + ' items');

      /* put the page back the way the rest of the harness expects it */
      var p = home();
      p.items = items0; p.ink = ink0;
      queueSave(homeId); histCommit();
      await render();
      ok('undo: the button lights up again once there is something', stack() > 0 &&
        !Q('#undoBtn').classList.contains('off'), stack() + ' steps');
    });

    /* ---- Export, for real ----
       The exported file carries ONE inlined stylesheet, so this is where a
       feature whose styles went missing would actually show up. */
    await stage('export', async function () {
      /* Self-contained: put a known handful of things on the sheet rather than
         relying on whatever the stage before happened to leave there. */
      var page = sheet(), keep = page.items.slice();
      var mk = function (extra) {
        var b = { id: uid(), x: 8, y: 8, w: 24, rot: 0, z: page.items.length + 1, lay: curLayerId() };
        for (var k in extra) b[k] = extra[k];
        page.items.push(b);
      };
      mk({ type: 'text', st: 'title', html: 'Export' });
      mk({ type: 'note', html: 'a sticky' });
      mk({ type: 'check', rows: [{ t: 'one', d: false }] });
      mk({ type: 'table', cols: ['a', 'b'], rows: [['1', '2']] });
      mk({ type: 'washi', pat: 0 });
      mk({ type: 'sticker', k: 0 });
      /* a whole little circuit, so the export has leads to draw as well as symbols */
      var esw = { id: uid(), type: 'logic', gate: 'sw', on: 1, x: 8, y: 40, w: 11, rot: 0,
                  z: 90, lay: curLayerId(), cap: '' };
      var enot = { id: uid(), type: 'logic', gate: 'nand', x: 34, y: 40, w: 11, rot: 0,
                   z: 91, lay: curLayerId(), cap: '' };
      page.items.push(esw, enot);
      var keepWires = (page.wires || []).slice();
      page.wires = [{ id: uid(), from: { item: esw.id, port: 'q' }, to: { item: enot.id, port: 'a' } },
                    { id: uid(), from: { item: esw.id, port: 'q' }, to: { item: enot.id, port: 'b' } }];
      await render();

      /* export revokes the object URL the instant it has clicked the link, so
         hold on to the Blob itself rather than to the href */
      var blob = null;
      var realCreate = URL.createObjectURL;
      var realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = function (b) {
        if (b && b.type === 'text/html') blob = b;
        return realCreate.apply(URL, arguments);
      };
      HTMLAnchorElement.prototype.click = function () {
        if (this.download && /\.html$/.test(this.download)) return;
        return realClick.apply(this, arguments);
      };
      Q('#exportHtmlBtn').click();
      try {
        await waitFor(function () { return blob; }, 20000);
        var html = await blob.text();
        ok('export: produced a file', html.length > 5000, html.length + ' bytes');
        ok('export: is a whole document', /^<!DOCTYPE html>/i.test(html));
        /* the styles every feature contributed have to be in there */
        ['.item', '.st-title', '.note', '.ck', '.tgrid', '.mplot', '.deck', '.msolid', '.molsvg', '.shortcut',
         '.washi', '.stk', '.math', '.lgw', 'svg.lgwires'].forEach(function (k) {
          ok('export: carries ' + k + ' styles', html.indexOf(k) > 0);
        });
        ok('export: the sheet is in it', (html.match(/class="page"/g) || []).length === 1);
        ok('export: has items in it', (html.match(/class="item"/g) || []).length >= 5);
        ok('export: no live handles', html.indexOf('class="rot"') < 0);
        ok('export: it is the sheet, not a flipbook', html.indexOf('class="viewnav"') < 0);
        /* the circuit is a picture over there, but it is the RIGHT picture:
           the symbols, the leads between them, and the values they settled on */
        ok('export: the gate symbols came out',
          html.indexOf('data-id="' + esw.id + '"') > 0 && html.indexOf('data-id="' + enot.id + '"') > 0,
          'gates in the file: ' + (html.match(/data-gate="[a-z]+"/g) || []).join(',') +
          ' · on the sheet: ' + page.items.filter(function (x) { return x.type === 'logic'; })
            .map(function (x) { return x.gate; }).join(','));
        ok('export: with the leads drawn between them',
          (html.match(/class="lgl"/g) || []).length === 2,
          (html.match(/class="lgl"/g) || []).length + ' leads');
        ok('export: carrying the values the circuit settled on',
          html.indexOf('data-v="1"') > 0);
        ok('export: and no svg was stored to get them there — the record is the gate',
          html.indexOf('"gate"') < 0);
      } finally {
        HTMLAnchorElement.prototype.click = realClick;
        URL.createObjectURL = realCreate;
        page.items = keep;
        page.wires = keepWires;
        await render();
      }
    });

    /* ---- growing the sheet ----
       Late, because it opens a note of its own and never gives it back. */
    await stage('sheet', async function () {
      await openNote(await createNote('Probe note'));
      await waitFor(function () { return Q('#pageHost .page'); }, 20000);
      ok('sheet: one sheet, no cover', index.pages.length === 1, index.pages.length + ' pages');
      ok('sheet: starts three pages across', pgW() === SHEET_W && pgH() === SHEET_H,
        pgW() + ' x ' + pgH());
      ok('sheet: four rails to pull', QA('#pageHost .prail').length === 4,
        QA('#pageHost .prail').length + ' rails');
      ok('sheet: no page-shape row in the drawer', !Q('#aspectSel'));
      ok('sheet: the paper row stays', getComputedStyle(Q('#paperSel').closest('.row')).display !== 'none');
      ok('sheet: it says how big it is', !!Q('#szTag') && /1980/.test(Q('#szTag').textContent),
        Q('#szTag') && Q('#szTag').textContent);
      ok('sheet: a fresh one still stops at 0.4 zoom', zMin() === 0.4, zMin());
      ok('sheet: it starts without the grain', document.body.classList.contains('nograin'));
      ok('sheet: nothing eases or flips on it',
        getComputedStyle(Q('#book')).perspective === 'none',
        getComputedStyle(Q('#book')).perspective);

      /* what growing has to leave alone: everything already on the sheet */
      var page = sheet();
      page.items = []; page.ink = [];
      addItem('note', { x: 50, y: 40 }, page);
      await sleep(140);
      page = sheet();
      var it = page.items[0];
      ok('sheet: a note lands on it', !!it && it.type === 'note', it && it.type);
      ok('sheet: the note is page-sized, not sheet-sized', it && it.w < 15,
        'w=' + (it && it.w) + '%');
      page.ink = [{ lay: curLayerId(), m: 'pen', c: '#000', w: 4, pts: [[100, 100], [200, 200]] }];
      var w0 = pgW(), h0 = pgH(), s0 = page.ink[0];
      var was = { x: it.x / 100 * w0, y: it.y / 100 * h0, w: it.w / 100 * w0,
                  ix: s0.pts[0][0] * w0 / 1000, iy: s0.pts[0][1] * w0 / 1000, iw: s0.w * w0 / 1000 };
      var near = function (a, b) { return Math.abs(a - b) < 0.6; };

      Q('#pageHost .prail.r').click();              // the rail itself, not the function behind it
      await sleep(200);
      ok('sheet: a rail adds a page of paper', pgW() === w0 + SHEET_STEP, 'now ' + pgW());
      it = sheet().items[0];
      var s = sheet().ink[0];
      ok('sheet: the note stayed where it was',
        near(it.x / 100 * pgW(), was.x) && near(it.y / 100 * pgH(), was.y),
        it.x / 100 * pgW() + ',' + it.y / 100 * pgH() + ' was ' + was.x + ',' + was.y);
      ok('sheet: the note kept its size', near(it.w / 100 * pgW(), was.w),
        it.w / 100 * pgW() + ' was ' + was.w);
      ok('sheet: the ink stayed where it was',
        near(s.pts[0][0] * pgW() / 1000, was.ix) && near(s.pts[0][1] * pgW() / 1000, was.iy));
      ok('sheet: the ink kept its weight', near(s.w * pgW() / 1000, was.iw));

      /* growing from the left moves the whole sheet out from under it instead */
      var w1 = pgW(), x1 = it.x / 100 * w1;
      growSheet('l');
      await sleep(200);
      it = sheet().items[0];
      ok('sheet: growing leftwards keeps it still too',
        near(it.x / 100 * pgW(), x1 + SHEET_STEP),
        it.x / 100 * pgW() + ' wanted ' + (x1 + SHEET_STEP));
      ok('sheet: it grew on the left', pgW() === w1 + SHEET_STEP, 'now ' + pgW());

      /* zooming a sheet BIGGER than the desk — where the desk holds it changes
         with its size, so this is where a commit used to jump */
      var f2 = function () {
        return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      };
      panX = 120; panY = -60; setZoom(1); applyView(); await f2();
      var aimc = { x: 600, y: 400 };
      var underc = function () {
        var r = Q('#pageHost .surface').getBoundingClientRect();
        return { x: (aimc.x - r.left) / r.width, y: (aimc.y - r.top) / r.height };
      };
      var wasc = underc();
      zoomBy(1.5, aimc.x, aimc.y); await f2();
      ok('sheet zoom: the point under the pointer stays under it',
        Math.abs(underc().x - wasc.x) < 0.004 && Math.abs(underc().y - wasc.y) < 0.004,
        JSON.stringify(wasc) + ' -> ' + JSON.stringify(underc()));
      commitZoom(); await f2();
      ok('sheet zoom: and does not jump when the gesture is committed',
        Math.abs(underc().x - wasc.x) < 0.004 && Math.abs(underc().y - wasc.y) < 0.004,
        JSON.stringify(wasc) + ' -> ' + JSON.stringify(underc()));
      /* growing the paper must not shove what is on it either */
      var beforeGrow = Q('#pageHost .item') && Q('#pageHost .item').getBoundingClientRect();
      growSheet('l'); await f2();
      var afterGrow = Q('#pageHost .item') && Q('#pageHost .item').getBoundingClientRect();
      ok('sheet: growing from the left leaves the paper where the eye had it',
        beforeGrow && afterGrow && Math.abs(beforeGrow.left - afterGrow.left) < 1.5 &&
        Math.abs(beforeGrow.top - afterGrow.top) < 1.5,
        beforeGrow && (beforeGrow.left.toFixed(1) + ' -> ' + afterGrow.left.toFixed(1)));
      panX = panY = 0; setZoom(1); await f2();

      /* the map: the whole sheet, and where you are standing on it */
      ok('map: a canvas has one', !!Q('.cmap canvas') && document.body.classList.contains('map'));
      var mb = Q('.cmap canvas').getBoundingClientRect();
      ok('map: it has the sheet\'s shape',
        Math.abs(mb.width / mb.height - pgW() / pgH()) < 0.06,
        mb.width + 'x' + mb.height + ' for ' + pgW() + 'x' + pgH());
      var vp = Q('.cmap .cvp'), vw = parseFloat(vp.style.width);
      ok('map: the viewport box is on it', vw > 0 && vw <= 100, vp.style.width);
      var pxm = panX;
      var mapEv = function (t, x, y) {
        Q('.cmap').dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, button: 0,
          pointerId: 9, isPrimary: true, bubbles: true }));
      };
      mapEv('pointerdown', mb.left + 3, mb.top + 3);
      ok('map: clicking a corner walks the desk to it', panX !== pxm, 'panX ' + pxm + ' -> ' + panX);
      /* dragging it: where you land must depend on where you are pointing and
         nothing else, however many moves land inside one frame */
      var mid = { x: mb.left + mb.width / 2, y: mb.top + mb.height / 2 };
      mapEv('pointermove', mid.x, mid.y);
      var once = { x: panX, y: panY };
      mapEv('pointermove', mid.x, mid.y);
      mapEv('pointermove', mid.x, mid.y);
      ok('map: dragging does not compound — the same spot is the same place',
        panX === once.x && panY === once.y,
        once.x + ',' + once.y + ' -> ' + panX + ',' + panY);
      /* and the spot it lands on is the one that was pointed at */
      writeView();
      var rr = Q('#pageHost .surface').getBoundingClientRect(), ss = Q('#stage').getBoundingClientRect();
      ok('map: the middle of the map really is the middle of the desk',
        Math.abs((rr.left + rr.right) / 2 - (ss.left + ss.right) / 2) < 1.5 &&
        Math.abs((rr.top + rr.bottom) / 2 - (ss.top + ss.bottom) / 2) < 1.5,
        ((rr.left + rr.right) / 2).toFixed(1) + ' vs ' + ((ss.left + ss.right) / 2).toFixed(1));
      mapEv('pointermove', mb.left + mb.width - 3, mid.y);
      ok('map: dragging to the far side walks the other way', panX < once.x - 10,
        once.x + ' -> ' + panX);
      mapEv('pointerup', mb.left + mb.width - 3, mid.y);
      Q('#mapBtn').click();
      ok('map: the button puts it away', !document.body.classList.contains('map') &&
        index.settings.map === false);
      Q('#mapBtn').click();
      ok('map: and brings it back', document.body.classList.contains('map'));

      /* dragging the bare paper walks the desk about */
      var surf = Q('#pageHost .surface'), px = panX;
      var pev = function (t, x, y) {
        surf.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, button: 0,
          pointerId: 7, isPrimary: true, bubbles: true }));
      };
      pev('pointerdown', 500, 400); pev('pointermove', 560, 430); pev('pointerup', 560, 430);
      ok('sheet: the bare paper pans it', near(panX, px + 60), 'panX ' + px + ' -> ' + panX);

      /* and it does stop somewhere */
      growSheet('b', SHEET_MAX * 2);
      await sleep(200);
      ok('sheet: there is a ceiling', pgH() === SHEET_MAX, 'height ' + pgH());
      /* a sheet far taller than the desk must not push the desk — and the
         toolbar under it — off the bottom of the screen */
      var tb = Q('.tools-bar').getBoundingClientRect();
      ok('sheet: the toolbar stays on screen under a huge sheet',
        tb.top > 0 && tb.bottom <= innerHeight + 1,
        tb.top.toFixed(0) + '-' + tb.bottom.toFixed(0) + ' of ' + innerHeight);
      ok('sheet: the desk does not grow to fit the sheet',
        Q('#stage').offsetHeight < innerHeight,
        Q('#stage').offsetHeight + ' vs ' + innerHeight);
      ok('sheet: a nib is still a nib on a huge sheet', pgK() < 0.3 && pgK() > 0, pgK());
      ok('sheet: and you can pull back far enough to see it all', zMin() < 0.05, zMin());
    });

    /* ---- chemistry: the library, the molecule and the periodic table ---- */
    await stage('chemistry', async function () {
      var page = sheet();
      page.items = []; await render();
      /* the keys find the molecule under the pointer, so the whole sheet must be on screen */
      fitToDesk(true); await sleep(150);
      ok('chem: a science shelf, with the molecule on it', !!TOOL_CATS.science &&
        palTools('science').length === 4 && palTools('science').some(function (t) { return t.kind === 'molecule'; }),
        palTools('science').map(function (t) { return t.kind; }).join(','));
      /* the library, in brief — its own battery is longer */
      ok('chem: 118 elements', CHEM_EL.length === 119);
      ok('chem: iron is [Ar] 3d⁶ 4s²', chemConf(26).text === '[Ar] 3d⁶ 4s²', chemConf(26).text);
      var caf = chemParse('Cn1cnc2c1c(=O)n(C)c(=O)n2C');
      ok('chem: caffeine reads as C8H10N4O2 at 194.19',
        chemFormula(caf).plain === 'C8H10N4O2' && Math.abs(chemMass(caf) - 194.19) < .02, chemFormula(caf).plain + ' ' + chemMass(caf));
      ok('chem: benzene kekulised with three double bonds',
        chemParse('c1ccccc1').bonds.filter(function (b) { return b.o === 2; }).length === 3);
      ok('chem: the two Kekulé benzenes hash alike', chemHash(chemParse('C1=CC=CC=C1')) === chemHash(chemParse('c1ccccc1')));
      ok('chem: ethanol round-trips through SMILES', chemHash(chemParse(chemWrite(chemParse('OCC')))) === chemHash(chemParse('CCO')));
      ok('chem: aspirin is recognised', chemName(chemParse('CC(=O)Oc1ccccc1C(=O)O')) === 'aspirin');
      var lay = chemLayout(chemParse('c1ccc2ccccc2c1'));
      ok('chem: naphthalene lays out with every bond one long', lay.bonds.every(function (b) {
        return Math.abs(Math.hypot(lay.atoms[b.b].x - lay.atoms[b.a].x, lay.atoms[b.b].y - lay.atoms[b.a].y) - 1) < .02; }));
      var w = chemEmbed(chemLayout(chemParse('O')));
      var hoh = chemAngle(w.atoms[1], w.atoms[0], w.atoms[2]);
      ok('chem: water embeds bent at 104.5 ± 3', Math.abs(hoh - 104.5) < 3, hoh);
      var v = chemVSEPR(chemParse('F[Xe](F)(F)F'), 1);
      ok('chem: XeF4 is square planar AX4E2', v.shape === 'square planar' && v.ax === 'AX₄E₂', JSON.stringify(v));
      ok('chem: the whole library parses and lays out', CHEM_LIB.every(function (e) {
        var m = chemLayout(chemParse(e.smiles));
        return !m.err.length && m.atoms.every(function (a) { return isFinite(a.x) && isFinite(a.y); }); }));

      /* ---- the molecule, built the way a hand builds it ---- */
      addItem('molecule', { x: 10, y: 10 }, page);
      await sleep(120);
      var it = page.items[page.items.length - 1];
      ok('mol: lands empty, 2D, skeletal, straight',
        it && it.type === 'molecule' && it.atoms.length === 0 && it.view === '2d' && it.sty === 'skel' && it.rot === 0, JSON.stringify(it));
      var el = byType('molecule');
      ok('mol: figure, svg, info strip and rail', !!el && !!el.querySelector('figure.mol') && !!el.querySelector('svg.molsvg') &&
        !!el.querySelector('.molinfo') && !!el.querySelector('.molrail'));
      select(it.id);
      ok('mol: selected shows the rail', getComputedStyle(el.querySelector('.molrail')).display === 'flex');
      ok('mol: the rail shows the pen', el.querySelector('.molrail .mrel b').textContent === MOL_EL);
      var svg = function () { return el.querySelector('svg.molsvg'); };
      var at = function (x, y) { var p = new DOMPoint(x * MOL_U, y * MOL_U).matrixTransform(svg().getScreenCTM()); return { clientX: p.x, clientY: p.y }; };
      var ev = function (type, pt, id, extra) {
        svg().dispatchEvent(new PointerEvent(type, Object.assign({ button: 0, pointerId: id, bubbles: true }, pt, extra || {}))); };
      var hover = function (pt) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: pt.clientX, clientY: pt.clientY, bubbles: true })); };
      var key = function (k) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); };
      MOL_EL = 'C'; MOL_TOOL = 'draw'; MOL_BOND = 0;
      ev('pointerdown', at(0, 0), 11); ev('pointerup', at(0, 0), 11);
      await sleep(30);
      ok('mol: a click places a carbon', it.atoms.length === 1 && it.atoms[0].e === 'C', JSON.stringify(it.atoms));
      var a0 = it.atoms[0];
      ev('pointerdown', at(a0.x, a0.y), 12); ev('pointermove', at(a0.x + .5, a0.y - .3), 12);
      ev('pointermove', at(a0.x + .9, a0.y - .5), 12); ev('pointerup', at(a0.x + .9, a0.y - .5), 12);
      await sleep(30);
      ok('mol: a drag from an atom sprouts a bond to a new one', it.atoms.length === 2 && it.bonds.length === 1,
        it.atoms.length + ' atoms ' + it.bonds.length + ' bonds');
      var d01 = Math.hypot(it.atoms[1].x - it.atoms[0].x, it.atoms[1].y - it.atoms[0].y);
      var ang = Math.atan2(it.atoms[1].y - it.atoms[0].y, it.atoms[1].x - it.atoms[0].x) / (Math.PI / 6);
      ok('mol: the new bond is one long, on a 30° step', Math.abs(d01 - 1) < .02 && Math.abs(ang - Math.round(ang)) < .02, d01 + ' ' + ang);
      var a1 = it.atoms[1];
      ev('pointerdown', at(a1.x, a1.y), 13); ev('pointerup', at(a1.x, a1.y), 13);
      await sleep(30);
      ok('mol: a click on an atom with the same pen sprouts a chain', it.atoms.length === 3 && it.bonds.length === 2);
      /* keys with the pointer over the atom */
      var a2 = it.atoms[2];
      hover(at(a2.x, a2.y)); key('o');
      await sleep(30);
      ok('mol: typing o over an atom makes it oxygen', it.atoms[2].e === 'O' && MOL_EL === 'O', it.atoms[2].e);
      ok('mol: ethanol — C2H6O · 46.07', chemFormula(it).plain === 'C2H6O' && Math.abs(chemMass(it) - 46.07) < .01, chemFormula(it).plain);
      var info = el.querySelector('.molinfo').textContent;
      ok('mol: the strip says C2H6O · 46.07 g/mol · ethanol',
        info.indexOf('C2H6O') >= 0 && info.indexOf('46.07') >= 0 && info.indexOf('ethanol') >= 0, info);
      var otext = el.querySelector('.molsvg .ag[data-i="2"] text');
      ok('mol: skeletal — the carbons are bare, the oxygen says OH',
        el.querySelectorAll('.molsvg .ag.bare').length === 2 && !!otext && otext.textContent === 'OH', otext && otext.textContent);
      key('c'); key('l');
      await sleep(30);
      ok('mol: c then l is chlorine — and the layer panel stayed shut', it.atoms[2].e === 'Cl' && !Q('#lpanel').classList.contains('open'), it.atoms[2].e);
      await sleep(600); key('o'); await sleep(30);
      ok('mol: back to oxygen', it.atoms[2].e === 'O');
      var mid = at((it.atoms[1].x + it.atoms[2].x) / 2, (it.atoms[1].y + it.atoms[2].y) / 2);
      hover(mid); key('2');
      await sleep(30);
      ok('mol: 2 over a bond makes it double — acetaldehyde, C2H4O', it.bonds[1].o === 2 && chemFormula(it).plain === 'C2H4O', chemFormula(it).plain);
      key('1'); await sleep(30);
      MOL_BOND = 0;
      ev('pointerdown', mid, 14); ev('pointerup', mid, 14); await sleep(30);
      ok('mol: a click on a single bond with the single pen makes it double', it.bonds[1].o === 2, it.bonds[1].o);
      ev('pointerdown', mid, 15); ev('pointerup', mid, 15); ev('pointerdown', mid, 16); ev('pointerup', mid, 16); await sleep(30);
      ok('mol: …then triple, then single again', it.bonds[1].o === 1, it.bonds[1].o);
      hover(at(it.atoms[2].x, it.atoms[2].y)); key('-'); await sleep(30);
      ok('mol: − over an atom charges it, and the formula carries the charge', it.atoms[2].q === -1 && chemFormula(it).plain === 'C2H5O-', chemFormula(it).plain);
      key('+'); await sleep(30);
      for (var q = 0; q < 4; q++) molSprout(it, 0, 'C', 1, 0);
      molEdit(it, el, page);
      ok('mol: a five-bonded carbon wears the red halo', chemOver(it, 0) && !!el.querySelector('.molsvg .mbad title'));
      ok('mol: the window grew and the item slid with it', it.box.w > 5 && Math.abs(parseFloat(el.style.left) - it.x) < 1e-3, it.box.w + ' ' + el.style.left + ' ' + it.x);
      var nBefore = it.atoms.length;
      hover(at(it.atoms[3].x, it.atoms[3].y)); key('Delete'); await sleep(30);
      ok('mol: Delete over an atom takes that atom, not the item', it.atoms.length === nBefore - 1 && page.items.length === 1, it.atoms.length + ' of ' + nBefore);
      /* rings */
      page.items = []; await render();
      addItem('molecule', { x: 10, y: 10 }, page); await sleep(120);
      it = page.items[page.items.length - 1]; el = byType('molecule'); select(it.id);
      molRingAt(it, MOL_RINGS[0], 0, 0); molEdit(it, el, page);
      ok('mol: a benzene ring — 6 atoms, 6 bonds, 3 double, C6H6',
        it.atoms.length === 6 && it.bonds.length === 6 && it.bonds.filter(function (b) { return b.o === 2; }).length === 3 &&
        chemFormula(it).plain === 'C6H6', chemFormula(it).plain);
      molRingOnBond(it, MOL_RINGS[0], 0); molEdit(it, el, page);
      ok('mol: benzene fused on a bond is naphthalene — 10 atoms, 11 bonds, C10H8',
        it.atoms.length === 10 && it.bonds.length === 11 && chemFormula(it).plain === 'C10H8' && chemName(it) === 'naphthalene',
        it.atoms.length + '/' + it.bonds.length + ' ' + chemFormula(it).plain + ' ' + chemName(it));
      ok('mol: nobody over-valent after the fuse', it.atoms.every(function (a, i) { return !chemOver(it, i); }));
      MOL_TOOL = 'ring'; MOL_RING = 1;
      var a5 = it.atoms[5];
      ev('pointerdown', at(a5.x, a5.y), 17); ev('pointerup', at(a5.x, a5.y), 17); await sleep(30);
      ok('mol: the ring tool on an atom hangs a cyclohexane off it', it.atoms.length === 15 && it.bonds.length === 17, it.atoms.length + '/' + it.bonds.length);
      MOL_TOOL = 'draw';
      /* the ⌕ box */
      var askBtn = QA('#pageHost .item[data-type=molecule] .tools button').filter(function (b) { return b.textContent === '⌕'; })[0];
      ok('mol: has the ⌕ button', !!askBtn);
      askBtn.click(); await sleep(60);
      ok('mol: the ask box opens', Q('#molask').classList.contains('open'));
      Q('#molask input').value = 'caf'; Q('#molask input').dispatchEvent(new Event('input'));
      ok('mol: it suggests caffeine', !!Q('#molask .molsug button') && Q('#molask .molsug button').dataset.n === 'caffeine');
      molAskTake('caffeine'); await sleep(60);
      ok('mol: taking caffeine draws it', it.atoms.length === 14 && chemName(it) === 'caffeine' && !MOL_ASK, it.atoms.length + ' ' + chemName(it));
      ok('mol: the strip names it', el.querySelector('.molinfo').textContent.indexOf('caffeine') >= 0);
      it.sty = 'cond'; molRepaint(el, it);
      var c0 = el.querySelector('.molsvg .ag[data-i="0"] text');
      ok('mol: condensed labels every carbon', el.querySelectorAll('.molsvg .ag.bare').length === 0 && !!c0 && c0.textContent.indexOf('CH') === 0, c0 && c0.textContent);
      it.sty = 'lewis'; molRepaint(el, it);
      ok('mol: Lewis draws the hydrogens and the lone pairs',
        el.querySelectorAll('.molsvg text.lh').length === 10 && el.querySelectorAll('.molsvg circle.lpd').length >= 8,
        el.querySelectorAll('.molsvg text.lh').length + ' H, ' + el.querySelectorAll('.molsvg circle.lpd').length + ' dots');
      it.sty = 'skel'; molRepaint(el, it);
      /* ---- 3D ---- */
      molView(el, it, page, '3d'); await sleep(30);
      ok('mol: 3D draws a ball for every atom, hydrogens included', el.querySelectorAll('.molsvg.m3d circle.ball').length === 24,
        el.querySelectorAll('.molsvg.m3d circle.ball').length);
      ok('mol: 3D bonds as half-sticks', el.querySelectorAll('.molsvg.m3d line.stick').length >= 50);
      ok('mol: no NaN in 3D', svg().innerHTML.indexOf('NaN') < 0);
      /* space-filling: every gradient and mask an svg refers to has to live inside that
         same svg. The ids carry a counter that climbs with every repaint, so two
         molecules on one sheet will collide the moment one is dragged unless the
         counter is kept apart from the atom index — and a ball then wears its
         neighbour's mask for a frame, which reads as the model wobbling. */
      /* two molecules on one sheet is where the counter bites: drag one and its ids
         climb past the other's */
      addItem('molecule', { x: 60, y: 60 }, page); await sleep(140);
      var it2 = page.items[page.items.length - 1];
      var mels = QA('#pageHost .item[data-type=molecule]');
      el = mels[0];                                   /* render() swapped the nodes */
      var m2 = chemLayout(chemParse('C1CCCCC1'));
      it2.atoms = m2.atoms; it2.bonds = m2.bonds; it2.box = molBox(it2);
      it2.view = '3d'; it2.s3 = 'fill'; it2.pitch = 1; molRepaint(mels[1], it2);
      it.s3 = 'fill'; molRepaint(el, it); await sleep(20);
      var stray = 0, twice = 0, ids = {};
      for (var sp = 0; sp < 40; sp++) {
        it.yaw = sp * 0.31; molRepaint(el, it);
        ids = {};
        QA('#pageHost [id]').forEach(function (n) { if (ids[n.id]) twice++; else ids[n.id] = 1; });
        QA('#pageHost svg.molsvg').forEach(function (sv) {
          [].slice.call(sv.querySelectorAll('[mask],[fill^="url"]')).forEach(function (n) {
            var m = /url\(#([^)]+)\)/.exec(n.getAttribute('mask') || n.getAttribute('fill') || '');
            if (!m) return;
            var t = document.getElementById(m[1]);
            if (!t || !sv.contains(t)) stray++;
          });
        });
      }
      ok('mol: space-filling refers to no gradient or mask outside its own svg', stray === 0 && twice === 0,
        stray + ' stray, ' + twice + ' claimed twice');
      ok('mol: space-filling masks every ball that a neighbour cuts into',
        el.querySelectorAll('.molsvg.m3d circle.rim').length === el.querySelectorAll('.molsvg.m3d circle.ball').length &&
        el.querySelectorAll('.molsvg.m3d mask').length > 0,
        el.querySelectorAll('.molsvg.m3d circle.rim').length + ' rims, ' +
        el.querySelectorAll('.molsvg.m3d circle.ball').length + ' balls, ' +
        el.querySelectorAll('.molsvg.m3d mask').length + ' masks');
      ok('mol: nothing is outlined ball by ball in space-filling',
        el.querySelectorAll('.molsvg.m3d circle.ball[stroke="none"]').length ===
        el.querySelectorAll('.molsvg.m3d circle.ball').length);
      it.s3 = 'ball'; it.yaw = 0; molRepaint(el, it); await sleep(20);
      ok('mol: ball-and-stick keeps its outlines and grows no rim',
        el.querySelectorAll('.molsvg.m3d circle.rim').length === 0 &&
        el.querySelectorAll('.molsvg.m3d circle.ball[stroke="none"]').length === 0);
      /* put the sheet back the way the rest of the stage expects it */
      page.items = page.items.filter(function (x) { return x !== it2; });
      await render(); el = byType('molecule'); select(it.id); await sleep(30);
      ok('mol: the rail steps aside in 3D', getComputedStyle(el.querySelector('.molrail')).display === 'none');
      var emb = molEmb(it), worst = 0;
      emb.bonds.forEach(function (b, k) {
        var A = emb.atoms[b.a], B = emb.atoms[b.b];
        var d0 = (CHEM_SYM[A.e].rcov + CHEM_SYM[B.e].rcov) * (emb.arom.has(k) ? .93 : b.o === 2 ? .87 : b.o === 3 ? .78 : 1);
        worst = Math.max(worst, Math.abs(chemDist(A, B) - d0) / d0); });
      ok('mol: caffeine bonds within 12% of the book', worst < .12, worst);
      var drift = 0;
      emb.atoms.forEach(function (a) { if (a.src < 0) return; var d = it.atoms[a.src]; drift = Math.max(drift, Math.hypot(a.x / 1.45 - d.x, a.y / 1.45 - d.y)); });
      ok('mol: the 3D keeps the face of the drawing', drift < .6, drift);
      var r = svg().getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, y0 = it.yaw || 0;
      ev('pointerdown', { clientX: cx, clientY: cy }, 21); ev('pointermove', { clientX: cx + 40, clientY: cy + 5 }, 21);
      ev('pointermove', { clientX: cx + 80, clientY: cy + 10 }, 21); ev('pointerup', { clientX: cx + 80, clientY: cy + 10 }, 21);
      /* read at once: synthetic moves have no time between them, so the flick that follows is absurd — and clamped */
      ok('mol: dragging turns it', Math.abs((it.yaw || 0) - y0 - .88) < .01, it.yaw);
      molStopSpin(it); await sleep(30);
      var near = el._molPts[0], pp = new DOMPoint(near.x, near.y).matrixTransform(svg().getScreenCTM());
      ev('pointerdown', { clientX: pp.x, clientY: pp.y }, 22); ev('pointerup', { clientX: pp.x, clientY: pp.y }, 22); await sleep(30);
      var pkm = el.querySelector('.molinfo .pkm');
      ok('mol: a click picks an atom and names its shape',
        MOL_PICK && MOL_PICK.id === it.id && MOL_PICK.atoms.length === 1 && !!pkm && /tetrahedral|trigonal/.test(pkm.textContent), pkm && pkm.textContent);
      var z0 = it.zoom || 1;
      svg().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      ok('mol: the wheel scales it', (it.zoom || 1) > z0);
      var z1 = it.zoom;
      svg().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }));
      ok('mol: ctrl+wheel is the desk’s', it.zoom === z1);
      it.lp = 1; it.lab = 1; molRepaint(el, it);
      ok('mol: lone pairs and labels draw', el.querySelectorAll('.molsvg circle.lp3').length >= 8 && el.querySelectorAll('.molsvg text.lb3').length >= 14,
        el.querySelectorAll('.molsvg circle.lp3').length + ' ' + el.querySelectorAll('.molsvg text.lb3').length);
      it.s3 = 'fill'; molRepaint(el, it);
      ok('mol: space-filling has no sticks', el.querySelectorAll('.molsvg line.stick').length === 0 && el.querySelectorAll('.molsvg circle.ball').length === 24);
      it.s3 = 'ball'; it.lp = 0; it.lab = 0;
      addItem('molecule', { x: 50, y: 50 }, page); await sleep(120);
      var it2 = page.items[page.items.length - 1], m2 = chemFrom('O');
      it2.atoms = m2.atoms; it2.bonds = m2.bonds; it2.view = '3d'; it2.box = molBox(it2);
      await render(); await sleep(60);
      var ids = QA('#pageHost radialGradient').map(function (g) { return g.id; });
      ok('mol: gradient ids are unique across the page', ids.length > 0 && new Set(ids).size === ids.length, ids.join(','));
      var st = buildPage(page, false, {});
      var sm = st.querySelectorAll('.item[data-type=molecule]');
      ok('static: both molecules build', sm.length === 2);
      ok('static: a picture, no rail, no buttons', !!sm[0].querySelector('svg.molsvg') && !sm[0].querySelector('.molrail') && !sm[0].querySelector('button'));
      ok('static: the 3D picture is there too', sm[0].querySelectorAll('circle.ball').length === 24, sm[0].querySelectorAll('circle.ball').length);
      /* ---- the periodic table ---- */
      page.items = []; await render();
      addItem('ptable', { x: 10, y: 10 }, page); await sleep(120);
      var pt = page.items[page.items.length - 1], pel = byType('ptable');
      ok('ptable: lands straight with carbon chosen', pt && pt.type === 'ptable' && pt.el === 6 && pt.rot === 0);
      ok('ptable: 118 cells', pel.querySelectorAll('.ptc').length === 118);
      ok('ptable: the facts say Carbon', pel.querySelector('.ptfacts').textContent.indexOf('Carbon') >= 0);
      /* the grid once wore the class `page` and inherited the paper's height — every row stretched */
      var ptRow = parseFloat(getComputedStyle(pel.querySelector('.ptgrid')).gridTemplateRows), ptCell = pel.querySelector('.ptc[data-z="3"]').getBoundingClientRect().height;
      ok('ptable: the rows are as tall as the cells', ptCell > 0 && ptRow < ptCell * 1.8, ptRow + ' vs ' + ptCell);   // stretched, they were 2.7×
      var ne = pel.querySelector('.ptc[data-z="10"]'), nr = ne.getBoundingClientRect();
      ne.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 31, clientX: nr.left + 3, clientY: nr.top + 3, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 31, clientX: nr.left + 3, clientY: nr.top + 3, bubbles: true }));
      await sleep(30);
      ok('ptable: a tap on neon chooses it', pt.el === 10 && pel.querySelector('.ptfacts').textContent.indexOf('Neon') >= 0, pt.el);
      ok('ptable: cerium sits on the row under the gap', pel.querySelector('.ptc[data-z="58"]').style.gridArea.indexOf('9') === 0,
        pel.querySelector('.ptc[data-z="58"]').style.gridArea);
      var sp = buildPage(page, false, {});
      ok('static: the table prints with its facts and no buttons',
        sp.querySelectorAll('.ptc').length === 118 && sp.querySelector('.ptfacts').textContent.indexOf('Neon') >= 0 && !sp.querySelector('button'));
      /* the picker */
      var got = null, anchor = Q('#qaddBtn');
      openElementPicker(anchor, function (sym) { got = sym; }, 'C'); await sleep(60);
      ok('picker: opens with carbon marked', Q('#ptpick').classList.contains('open') && !!Q('#ptpick .ptc.cur[data-z="6"]'));
      Q('#ptpick .ptc[data-z="17"]').click(); await sleep(60);
      ok('picker: one click takes chlorine and closes', got === 'Cl' && PT_ANCHOR === null, got + ' ' + PT_ANCHOR);
      openElementPicker(anchor, function (sym) { got = sym; }, 'C'); await sleep(30);
      key('b'); key('r');
      ok('picker: typing b r walks to bromine', !!Q('#ptpick .ptc.hot[data-z="35"]'));
      key('Enter'); await sleep(30);
      ok('picker: Enter takes it', got === 'Br', got);

      /* ---- the chart of the nuclides ---- */
      /* the table first. A chart of nuclides is arithmetic on 5646 mass
         excesses, so a wrong line in the data is a wrong picture with nothing
         obviously wrong about it — these check the numbers rather than the
         drawing, and the four natural decay series are the strongest check
         there is: they have to end where the ore does. */
      ok('nuc: NUBASE parses whole', NUC.length === 5646 && NUC_GS.length === 3558 && NUC_MAP.size === 3558,
        NUC.length + ' entries, ' + NUC_GS.length + ' ground states');
      var nbad = [];
      NUC.forEach(function (e) {
        if (!isFinite(e.z) || !isFinite(e.n) || !isFinite(e.a) || e.n < 0 || e.z + e.n !== e.a) nbad.push(nucPlain(e) + ' bad numbers');
        if (e.me != null && !isFinite(e.me)) nbad.push(nucPlain(e) + ' bad mass');
        if (e.t != null && e.t !== Infinity && !(e.t >= 0)) nbad.push(nucPlain(e) + ' bad half-life "' + e.hl + '"');
        if (!e.gs && !e.parent) nbad.push(nucPlain(e) + ' is a state of nothing');
      });
      ok('nuc: every nuclide has numbers that are numbers', nbad.length === 0, nbad.slice(0, 4).join(' | '));
      var abad = [];
      for (var az = 1; az <= 118; az++) {
        var ael = NUC_GS.filter(function (e) { return e.z === az && e.ab != null; });
        if (!ael.length) continue;
        var asum = ael.reduce(function (s, e) { return s + e.ab; }, 0);
        if (Math.abs(asum - 100) > .02) abad.push(CHEM_EL[az].sym + '=' + asum.toFixed(3));
      }
      ok('nuc: every element in nature adds up to 100 %', abad.length === 0, abad.join(' '));
      ok('nuc: half-lives read back as seconds', Math.abs(nucTime('12.32y').t - 388789632) < 1 &&
        nucTime('stbl').t === Infinity && nucTime('-').t === null && nucTime('>300ns').lim === '>' &&
        Math.abs(nucTime('>300ns').t - 3e-7) < 1e-12, nucTime('12.32y').t);
      ok('nuc: 253 stable nuclides, and uranium is not one of them',
        NUC_GS.filter(function (e) { return e.t === Infinity; }).length === 253 && nucAt(92, 146).cls === 'a');
      /* the Q values are not in the file: they are these masses, subtracted */
      var qU = nucQ(nucAt(92, 146)), qC = nucQ(nucAt(6, 8)), qR = nucQ(nucAt(88, 138));
      ok('nuc: Q values come out of the mass excesses',
        Math.abs(qU.a - 4270) < 2 && Math.abs(qC.bm - 156.5) < 1.5 && Math.abs(qR.a - 4871) < 2 &&
        Math.abs(qU.sn - 6153) < 2, [qU.a, qC.bm, qR.a, qU.sn].join(' '));
      /* the binding energy curve has to peak on nickel-62, not on iron */
      var bmax = null;
      NUC_GS.forEach(function (e) { var v = nucBA(e); if (v != null && (!bmax || v > bmax.v)) bmax = { e: e, v: v }; });
      ok('nuc: the binding energy peak is ⁶²Ni at 8.7945 MeV/A',
        nucName(bmax.e) === '⁶²Ni' && Math.abs(bmax.v / 1000 - 8.7945) < .001, nucName(bmax.e) + ' ' + bmax.v);
      /* every mode has to be a step across the chart, or say plainly that it is
         not one — a mode nobody taught nucStep about would draw no arrow and
         nothing would complain */
      var modes = {}, nostep = [];
      NUC.forEach(function (e) { e.dec.forEach(function (d) { modes[d.m] = 1; }); });
      Object.keys(modes).forEach(function (m) { if (nucStep(m) === null) nostep.push(m); });
      ok('nuc: every decay mode is a step, bar the ones that fission',
        nostep.sort().join(' ') === 'B B+SF B-SF SF', nostep.join(' '));
      var missd = NUC_GS.filter(function (e) {
        return e.dec[0] && e.dec[0].m === 'B-' && !nucDaughter(e, 'B-').e; }).length;
      ok('nuc: every beta minus lands on a nuclide that is in the table', missd === 0, missd + ' missing');
      /* the four series, each ending where the ore does */
      var ser = [['U238', 14, '²⁰⁶Pb'], ['U235', 11, '²⁰⁷Pb'], ['Th232', 10, '²⁰⁸Pb'], ['Np237', 12, '²⁰⁵Tl']];
      var sbad = ser.filter(function (s) {
        var c = nucChain(nucFind(s[0]));
        return c.length !== s[1] || nucName(c[c.length - 1].to) !== s[2];
      }).map(function (s) { var c = nucChain(nucFind(s[0])); return s[0] + '→' + (c.length ? nucName(c[c.length - 1].to) : '?') + ' in ' + c.length; });
      ok('nuc: the four decay series end on lead, lead, lead and thallium', sbad.length === 0, sbad.join(' | '));
      ok('nuc: a nuclide is found however it is typed',
        ['U238', 'u-238', '238U', 'uranium-238'].every(function (s) { return nucFind(s) === nucAt(92, 146); }) &&
        nucFind('Tc-99m') === nucFind('99mTc') && nucName(nucFind('Tc-99m')) === '⁹⁹ᵐTc' &&
        nucFind('n') === nucAt(0, 1) && nucFind('nonsense-9') === null);

      /* ---- the card ---- */
      page.items = []; await render();
      addItem('nuchart', { x: 4, y: 4 }, page); await sleep(160);
      var np = page.items[page.items.length - 1], nel = byType('nuchart');
      ok('nuchart: lands straight, whole chart, uranium-238 chosen',
        np && np.type === 'nuchart' && np.rot === 0 && np.view === 'decay' && np.sel === '92:146' &&
        np.zw === NU_NW && !np.chain);
      var cellPaths = nel.querySelectorAll('.nucells path');
      var squares = 0;
      [].slice.call(cellPaths).forEach(function (p) { squares += (p.getAttribute('d').match(/M/g) || []).length; });
      ok('nuchart: 3558 ground states and 756 metastable slices, in ten paths not four thousand rects',
        squares === 4314 && cellPaths.length <= 10, squares + ' squares in ' + cellPaths.length + ' paths');
      /* six across the protons (126 is past the last element) and seven up the
         neutrons, each a pair of rules either side of the closed shell */
      ok('nuchart: the magic numbers are ruled across it',
        nel.querySelectorAll('.nusvg .numag').length === 13 && !!nel.querySelector('.nusvg .nudiag'),
        nel.querySelectorAll('.nusvg .numag').length);
      /* no NaN in any of the four views — the wireframe lesson, on a bigger picture */
      var vbad = [];
      ['decay', 'half', 'ba', 'sn'].forEach(function (v) {
        np.view = v; nuRecolour(nel, np);
        var m = nel.querySelector('.nusvg').outerHTML;
        if (/NaN|undefined|Infinity/.test(m)) vbad.push(v);
        if (nel.querySelectorAll('.nukey span').length !== NU_VIEWS[v].keys.length) vbad.push(v + ' key');
      });
      np.view = 'decay'; nuRecolour(nel, np);
      ok('nuchart: all four colourings draw with no NaN and a key that matches', vbad.length === 0, vbad.join(' '));
      var foot = function () { return nel.querySelector('.nufacts').textContent; };
      ok('nuchart: the foot writes uranium-238 out in full',
        foot().indexOf('Uranium-238') >= 0 && foot().indexOf('4.463 × 10⁹ y') >= 0 &&
        foot().indexOf('99.2742 % of natural uranium') >= 0 && foot().indexOf('α 100 %') >= 0 &&
        foot().indexOf('→ ²³⁴Th') >= 0 && foot().indexOf('4.270 MeV') >= 0, foot().slice(0, 120));
      ok('nuchart: an arrow is drawn to every daughter it has',
        nel.querySelectorAll('.nusvg .nuhead').length === 2 && !!nel.querySelector('.nusvg .nuring'),
        nel.querySelectorAll('.nusvg .nuhead').length + ' arrows');

      /* Everything with a pointer in it is measured at the width the card has
         on paper. At the harness's zoom the whole chart is a few dozen pixels
         across and a nuclide is a fifth of one, where a click lands three
         elements away from where it was aimed. */
      var nfig = nel.querySelector('.nuc');
      nfig.style.width = '820px'; await sleep(40);
      /* where a nuclide is on the screen — the inverse of what nuHit does */
      function nuSpot(z, n, fy) {
        var svg = nel.querySelector('.nusvg'), r = svg.getBoundingClientRect(), w = nuWin(np);
        var sc = Math.min(r.width / w.w, r.height / w.h);
        var ox = r.left + (r.width - w.w * sc) / 2, oy = r.top + (r.height - w.h * sc) / 2;
        return { x: ox + (n + .5 - (w.n0 - w.mx)) * sc, y: oy + ((w.z0 + w.zh) - (z + (fy == null ? .5 : fy))) * sc, sc: sc };
      }
      function nuTap(spot, id) {
        var svg = nel.querySelector('.nusvg');
        svg.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: id, clientX: spot.x, clientY: spot.y, bubbles: true }));
        svg.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: id, clientX: spot.x, clientY: spot.y, bubbles: true }));
      }
      nuTap(nuSpot(26, 30), 71); await sleep(40);
      ok('nuchart: a press picks the square under it', np.sel === '26:30' && foot().indexOf('Iron-56') >= 0,
        np.sel + ' / ' + foot().slice(0, 40));
      /* a square with a long-lived metastable state is split, and the top slice
         is that state — pressing it has to choose the state and not the ground */
      nuTap(nuSpot(43, 56, .8), 72); await sleep(40);
      ok('nuchart: the top slice of a split square is the metastable state',
        np.sel === '43:56:m' && foot().indexOf('⁹⁹ᵐTc') >= 0 && foot().indexOf('6.0066 h') >= 0, np.sel);
      nuTap(nuSpot(43, 56, .2), 73); await sleep(40);
      ok('nuchart: and the bottom slice is the ground state',
        np.sel === '43:56' && foot().indexOf('2.111 × 10⁵ y') >= 0, np.sel + ' / ' + foot().slice(0, 60));
      /* the wheel zooms about the pointer: the nuclide under it stays under it */
      var spot = nuSpot(50, 70), before = nuHit(nel, np, { clientX: spot.x, clientY: spot.y });
      nel.querySelector('.nusvg').dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: spot.x, clientY: spot.y, bubbles: true, cancelable: true }));
      await sleep(40);
      var after = nuHit(nel, np, { clientX: spot.x, clientY: spot.y });
      ok('nuchart: the wheel zooms about the pointer and leaves the spot under it',
        np.zw < NU_NW && Math.abs(after.ux - before.ux) < .12 && Math.abs(after.uy - before.uy) < .12,
        np.zw.toFixed(1) + ' wide, moved ' + (after.ux - before.ux).toFixed(3) + ',' + (after.uy - before.uy).toFixed(3));
      /* in far enough that the squares are written in */
      np.zw = 18; np.cn = 56.5; np.cz = 43.5; nuPaint(nel, np); await sleep(40);
      var labs = [].slice.call(nel.querySelectorAll('.nusvg .nun')).map(function (t) { return t.textContent; });
      ok('nuchart: zoomed in, the squares carry their symbol, mass number and half-life',
        labs.indexOf('Tc 99') >= 0 && labs.indexOf('Mo 98') >= 0 && labs.indexOf('6.0066 h') < 0 &&
        labs.filter(function (s) { return s === '211.1 ky'; }).length === 1,
        labs.slice(0, 6).join(' | '));
      ok('nuchart: and the side counts name the elements',
        [].slice.call(nel.querySelectorAll('.nusvg .nut.r')).some(function (t) { return t.textContent === 'Tc 43'; }));
      /* dragging moves the window by whole nuclides, not by pixels */
      var svg2 = nel.querySelector('.nusvg'), sc2 = nuSpot(43, 56).sc, cn0 = np.cn;
      svg2.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 74, clientX: 400, clientY: 300, bubbles: true }));
      svg2.dispatchEvent(new PointerEvent('pointermove', { pointerId: 74, clientX: 400 - 3 * sc2, clientY: 300, bubbles: true }));
      svg2.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 74, clientX: 400 - 3 * sc2, clientY: 300, bubbles: true }));
      await sleep(60);
      ok('nuchart: a drag moves the chart three nuclides, not three pixels',
        Math.abs(np.cn - (cn0 + 3)) < .15 && np.sel === '43:56', (np.cn - cn0).toFixed(3));
      /* the chain */
      np.sel = '92:146'; np.cn = NU_NW / 2; np.cz = NU_ZH / 2; np.zw = NU_NW;
      var cbtn = QA('#pageHost .item[data-type=nuchart] .tools button').filter(function (b) { return b.textContent === '⇢'; })[0];
      ok('nuchart: the toolbar offers the chain', !!cbtn);
      cbtn.click(); await sleep(60);
      ok('nuchart: it follows uranium-238 the fourteen steps down to lead',
        np.chain === 1 && nel.querySelectorAll('.nusvg .nuhead').length === 14 &&
        nel.querySelectorAll('.nusvg .nuchain').length === 14 && foot().indexOf('²⁰⁶Pb') >= 0 &&
        foot().indexOf('14 steps, stable') >= 0,
        nel.querySelectorAll('.nusvg .nuhead').length + ' arrows');
      cbtn.click(); await sleep(40);
      /* the ⌕ box */
      var fbtn = QA('#pageHost .item[data-type=nuchart] .tools button').filter(function (b) { return b.textContent === '⌕'; })[0];
      fbtn.click(); await sleep(60);
      var finp = Q('#nuask input');
      finp.value = 'Tc-99m'; finp.dispatchEvent(new Event('input', { bubbles: true }));
      ok('nuchart: the ⌕ box reads a nuclide as it is typed',
        Q('#nuask .nufound').textContent.indexOf('⁹⁹ᵐTc') >= 0 && Q('#nuask .nufound').textContent.indexOf('6.0066 h') >= 0,
        Q('#nuask .nufound').textContent);
      finp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(60);
      ok('nuchart: Enter goes there and zooms in on it',
        np.sel === '43:56:m' && Math.abs(np.cn - 56.5) < .01 && np.zw <= 26 && NU_ASK === null,
        np.sel + ' @ ' + np.cn + ' w' + np.zw);
      nfig.style.width = '';
      np.zw = NU_NW; np.cn = NU_NW / 2; np.cz = NU_ZH / 2; np.sel = '92:146'; nuPaint(nel, np);
      var nps = buildPage(page, false, {});
      var pSquares = 0;
      [].slice.call(nps.querySelectorAll('.nucells path')).forEach(function (p) { pSquares += (p.getAttribute('d').match(/M/g) || []).length; });
      ok('nuchart: it prints whole — every square, its key and its foot, and no buttons',
        pSquares === 4314 && nps.querySelector('.nufacts').textContent.indexOf('Uranium-238') >= 0 &&
        nps.querySelectorAll('.nukey span').length === NU_CLS.length && !nps.querySelector('button'),
        pSquares + ' squares');
      page.items = []; await render();
    });

    ok('probe finished', true);
    send();
    await sleep(400);
    send();
  })();
})();
