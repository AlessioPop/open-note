/* Open Note — tools/shots/scenes.js
   The pictures in README.md, built by the app itself.

   Appended after the app's own scripts, exactly like tools/verify/probe.js, so
   everything here is a bare identifier reachable in the shared scope. Each scene
   clears the sheet, puts a known arrangement on it, and stands back far enough
   to see it; run.sh then lets the load event fire and Firefox takes the shot.

   A screenshot retaken by hand goes stale the first time a colour changes, so
   none of these are taken by hand: `tools/shots/run.sh` rebuilds every one of
   them from the real app in about a minute. Nothing here is a mock-up either —
   every item is made through the same `add` entry the palette uses, so a shot
   that comes out wrong is the app being wrong. */
(function () {
  const SCENE = new URLSearchParams(location.search).get('scene') || 'canvas';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const frames = n => new Promise(r => {
    (function f(i){ i ? requestAnimationFrame(() => f(i - 1)) : r(); })(n);
  });
  function waitFor(fn, ms){
    const t0 = Date.now();
    return new Promise((res, rej) => (function poll(){
      let v; try { v = fn(); } catch (e) { v = null; }
      if(v) return res(v);
      if(Date.now() - t0 > (ms || 20000)) return rej(new Error('timeout'));
      setTimeout(poll, 60);
    })());
  }

  /* an item on the sheet, straight in, made the way the palette makes one */
  let Z = 0;
  const put = (page, kind, x, y, extra) => {
    const it = ADD_KINDS[kind].make({ id: uid(), x, y, rot: 0, z: ++Z, lay: curLayerId() }, kind);
    Object.assign(it, extra || {});
    page.items.push(it);
    return it;
  };
  /* a molecule, laid out from its name or its SMILES — the ⌕ box's own call */
  const molecule = (page, x, y, q, extra) => {
    const m = chemFrom(q);
    const it = put(page, 'molecule', x, y, extra);
    it.atoms = m.atoms.map(a => ({ e: a.e, x: a.x, y: a.y, q: a.q || 0,
                                   h: a.h == null ? null : a.h, iso: a.iso || null }));
    it.bonds = m.bonds.map(b => ({ a: b.a, b: b.b, o: b.o || 1, s: b.s || 0 }));
    it.box = molBox(it);
    return it;
  };
  /* a stroke of ink, in thousandths of the sheet's width on both axes */
  const ink = (page, pts, c, w) =>
    (page.ink = page.ink || []).push({ lay: curLayerId(), m: 'pen',
      c: c || '#cf3a24', w: w || 3, pts });

  /* built rather than written out, so the triple quotes inside it never have to
     survive a heredoc or an editor's idea of a string */
  const PY = [
    'def thrust(p_c, a_t, cf=1.62):',
    '    ' + '"'.repeat(3) + 'Ideal thrust from chamber pressure.' + '"'.repeat(3),
    '    return cf * p_c * a_t          # newtons',
    '',
    'for p in (2.0e6, 3.5e6, 5.0e6):',
    '    print(f"{p/1e6:>4.1f} MPa -> {thrust(p, 1.1e-3):8.0f} N")'
  ].join('\n');

  /* ================= the scenes ================= */
  const SCENES = {

    /* the hero: one sheet with a bit of everything on it */
    canvas(page){
      put(page, 'title', 3, 2.5, { w: 40, fs: 32, html: 'Rocket, first stage' });
      put(page, 'mono', 3, 8, { w: 36, fs: 11, html: 'BURN TEST · 2026-08-21' });
      put(page, 'washi', 45, 1.5, { w: 11, pat: 1 });
      put(page, 'note', 68, 2, { w: 15, fs: 14, color: 'c2',
        html: 'nozzle ran hot on B — check the throat radius' });
      put(page, 'note', 85, 2, { w: 13, fs: 14, color: 'c4',
        html: 'C aborted at T+4.4s' });

      put(page, 'plot', 3, 13, { w: 26, cap: 'thrust against chamber pressure',
        xmin: 0, xmax: 8, ymin: 0, ymax: 9,
        fns: [{ id: uid(), expr: '3.2*x^0.7', c: '#cf3a24', s: 'solid' },
              { id: uid(), expr: '0.8*x',     c: '#2b7d8c', s: 'dash' }] });

      put(page, 'bars', 37, 13, { w: 24, pal: 'crisp', lbl: 'val', cap: 'burn time, seconds',
        rows: [{ lab: 'A', v: 6.2 }, { lab: 'B', v: 9.1 },
               { lab: 'C', v: 4.4 }, { lab: 'D', v: 7.8 }] });

      put(page, 'pie', 68, 13, { w: 24, look: 'donut', pal: 'tonal', lbl: 'pct', hole: 54,
        cap: 'where the mass went',
        rows: [{ lab: 'Fuel', v: 61 }, { lab: 'Casing', v: 24 }, { lab: 'Avionics', v: 15 }] });

      put(page, 'hand', 34, 42, { w: 25, fs: 21,
        html: 'it is all one sheet —<br>pull an edge for more' });

      put(page, 'table', 3, 66, { w: 27, fs: 12, head: 1, ts: 'lines',
        cap: 'four static fires, and the peak of each column',
        cw: [0.34, 0.33, 0.33], al: ['l', 'r', 'r'],
        rows: [['test', 'kN', 'sec'], ['A', '18.4', '6.2'], ['B', '21.7', '9.1'],
               ['C', '12.9', '4.4'], ['D', '19.6', '7.8'],
               ['peak', '=MAX(B2:B5)', '=MAX(C2:C5)']] });

      put(page, 'check', 36, 66, { w: 22, fs: 15,
        html: '- [x] cast four grains\n- [x] instrument the bench\n'
            + '- [ ] re-machine the throat\n- [ ] test E' });

      put(page, 'code', 62, 66, { w: 33, fs: 11, lang: 'python', sch: 'auto', code: PY });

      ink(page, [[350, 375], [385, 361], [425, 369], [465, 393], [500, 379]], '#cf3a24', 4);
      ink(page, [[347, 405], [495, 415]], '#cf3a24', 3);
    },

    /* a real molecule, both ways */
    molecules(page){
      put(page, 'title', 4, 3, { w: 50, fs: 30, html: 'Caffeine' });
      put(page, 'mono', 4, 9, { w: 46, fs: 11,
        html: 'DRAWN WITH CLICKS AND KEYSTROKES · NO LIBRARY · NOTHING DOWNLOADED' });
      put(page, 'hand', 62, 3, { w: 30, fs: 20,
        html: 'type a name or a SMILES —<br>it arrives laid out' });
      molecule(page, 5, 13, 'caffeine', { w: 31, fs: 20, sty: 'skel',
        cap: 'skeletal — carbons implied at the corners, heteroatoms written out' });
      molecule(page, 53, 12, 'caffeine', { w: 40, fs: 20, view: '3d', s3: 'ball',
        yaw: 0.7, pitch: -0.3, cap: 'the same molecule, embedded in space and turnable' });
      molecule(page, 5, 62, 'c1ccc2ccccc2c1', { w: 20, fs: 18, sty: 'skel',
        cap: 'naphthalene — rings fuse on a bond' });
      molecule(page, 31, 60, 'CC(=O)Oc1ccccc1C(=O)O', { w: 26, fs: 18, sty: 'skel',
        cap: 'aspirin — it works the name out itself' });
      molecule(page, 70, 62, 'O', { w: 16, fs: 22, sty: 'lewis',
        cap: 'Lewis, with the lone pairs' });
    },

    /* 5646 nuclides, drawn as ten paths */
    nuclides(page){
      put(page, 'title', 4, 2, { w: 60, fs: 26, html: 'The chart of the nuclides' });
      put(page, 'nuchart', 4, 9, { w: 90, view: 'decay', sel: '92:146', chain: 1,
        cap: 'NUBASE2020 — 3558 ground states and 2088 metastable ones. '
           + 'The arrows are uranium-238 walking all the way down to lead.' });
    },

    /* a table feeding a graph feeding a plot */
    data(page){
      put(page, 'title', 3, 2.5, { w: 52, fs: 28, html: 'Numbers that stay wired up' });
      put(page, 'mono', 3, 8.5, { w: 58, fs: 11,
        html: 'EDIT A CELL AND EVERYTHING DOWNSTREAM OF IT MOVES' });
      const tab = put(page, 'table', 3, 14, { w: 26, fs: 12, head: 1, ts: 'zebra',
        cap: 'seven readings, typed in',
        cw: [0.5, 0.5], al: ['r', 'r'],
        rows: [['t', 'v'], ['0', '0'], ['1', '2.4'], ['2', '4.1'], ['3', '5.2'],
               ['4', '5.8'], ['5', '6.0'], ['6', '6.1']] });
      const pick = put(page, 'node', 33, 15, { nk: 'pick', w: 17, in: [tab.id],
        cap: 'take two columns' });
      const math = put(page, 'node', 33, 41, { nk: 'math', op: '×', k: 1.6, w: 17,
        in: [pick.id], cap: 'scale them' });
      const plt = put(page, 'plot', 55, 13, { w: 40, cap: 'and the plot follows',
        xmin: -0.5, xmax: 7, ymin: -1, ymax: 11 });
      put(page, 'stack', 3, 69, { w: 30, pal: 'vivid', lbl: 'pct',
        cap: 'the same numbers, another way',
        rows: [{ lab: 'Rise', v: 42 }, { lab: 'Plateau', v: 38 }, { lab: 'Tail', v: 20 }] });
      put(page, 'matrix', 40, 74, { lab: 'M', r: 2, c: 2, fs: 22,
        m: [2, 1, 1, 3], src: ['2', '1', '1', '3'] });
      put(page, 'vecbox', 53, 75, { lab: 'v', n: 2, fs: 22, v: [3, 1], src: ['3', '1'] });
      put(page, 'hand', 64, 70, { w: 30, fs: 21,
        html: 'drag one card onto another<br>and it does the arithmetic' });
      return { plt, math };
    },
    /* ---- logic ----
       A one-bit full adder inside the same contained environment the Logic
       shelf adds. Nothing here is posed: the values on the lamps are what
       lgEval() worked out from the switches. */
    logic(page){
      const gate = (g, x, y, w, extra) => {
        const it = lgMake(g, { id: uid(), x, y, rot: 0, z: ++Z });
        Object.assign(it, { w }, extra || {});
        env.nodes.push(it);
        return it;
      };
      const lead = (a, ap, b, bp) => env.wires.push(
        { id: uid(), from: { item: a.id, port: ap }, to: { item: b.id, port: bp } });
      put(page, 'title', 3, 2.5, { w: 44, fs: 27, html: 'A one-bit full adder' });
      put(page, 'hand', 58, 3, { w: 36, fs: 17,
        html: 'pick the circuit — every component<br>waits in its own side rail' });
      const env = put(page, 'circuit', 18, 11, { w: 74, nodes: [], wires: [] });
      const a  = gate('sw', 3, 8, 10, { on: 1 });
      const b  = gate('sw', 3, 35, 10, { on: 0 });
      const ci = gate('sw', 3, 65, 10, { on: 1 });
      const x1 = gate('xor', 23, 14, 12);
      const x2 = gate('xor', 46, 24, 12);
      const a1 = gate('and', 23, 48, 12);
      const a2 = gate('and', 46, 62, 12);
      const o1 = gate('or',  66, 55, 12);
      const ls = gate('lamp', 82, 22, 10);
      const lc = gate('lamp', 85, 58, 10);
      const mj = gate('cust', 65, 78, 13,
        { def: { name: 'MAJ', n: 3, table: [0, 0, 0, 1, 0, 1, 1, 1] } });
      lead(a, 'q', x1, 'a');  lead(b, 'q', x1, 'b');
      lead(x1, 'q', x2, 'a'); lead(ci, 'q', x2, 'b');
      lead(a, 'q', a1, 'a');  lead(b, 'q', a1, 'b');
      lead(x1, 'q', a2, 'a'); lead(ci, 'q', a2, 'b');
      lead(a1, 'q', o1, 'a'); lead(a2, 'q', o1, 'b');
      lead(x2, 'q', ls, 'a'); lead(o1, 'q', lc, 'a');
      lead(a, 'q', mj, 'a');  lead(b, 'q', mj, 'b'); lead(ci, 'q', mj, 'c');
      return env;
    },
    /* the leads are laid against the sheet once it has been rendered — they are
       measured off the ports themselves, which do not exist until then */
    logicAfter(){ lgSync(); lgWake(); },
    /* The wire from the graph into the plot is made by the app's own call, after
       the first render, so the series carries exactly what a real drop puts in
       it — the columns, the points and the axis names, worked out from the table
       two cards upstream. */
    dataAfter(page, made){
      graphSync();
      plotAddNode({ it: made.plt, page }, made.math);
      selectMath(null, null);
    }
  };

  const SIZE = { canvas:    [1980, 1240],
                 molecules: [1520, 1020],
                 nuclides:  [1760, 1700],
                 data:      [1760, 1000],
                 logic:     [1980, 1120] };

  /* ================= build it and stand back ================= */
  (async function run(){
    const say = m => fetch('/report', { method: 'POST', body: 'SHOT ' + SCENE + ' ' + m });
    try {
      await waitFor(() => typeof index !== 'undefined' && index && sheet());
      await waitFor(() => document.querySelector('#pageHost .page'));
      const page = sheet();

      index.settings.pgw = SIZE[SCENE][0];
      index.settings.pgh = SIZE[SCENE][1];
      index.settings.grain = false;
      index.settings.map = false;
      applyPageSize(); syncGrain(); syncMap(); sizeTag();

      page.items = []; page.ink = [];
      page.paper = SCENE === 'nuclides' ? 'blank' : 'grid';
      const made = SCENES[SCENE](page);
      await render();
      await frames(4);
      if(SCENES[SCENE + 'After']){
        SCENES[SCENE + 'After'](page, made);
        await render();
        await frames(4);
      }
      await sleep(500);                 // WebGL models and the 3D molecules settle
      await render();                   // …and are drawn at the size they ended up
      await frames(4);
      fitToDesk(true);
      await frames(6);
      if(SCENE === 'logic' && made) select(made.id); else select(null);
      selectMath(null, null);
      document.body.classList.remove('map');
      await frames(4);
      say('ok, ' + page.items.length + ' items');
    } catch (e) {
      say('FAILED: ' + e.message);
    }
  })();
})();
