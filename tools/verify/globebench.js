/* A stopwatch on the live globe.

   Appended after the app's own scripts, so `atlGlobePaint` and everything it
   calls is a bare identifier here — the same trick tools/verify/probe.js uses.
   It builds one atlas item, turns it into a globe, and times the real paint
   over a sweep of orientations: the exact work a turn does, sixty times a
   second, with nothing else in the frame to hide behind.

   IT REPORTS THE MEDIAN AND THE 95th, not the mean. A mean hides the thing
   this is looking for — the frame that stops while the other fifty-nine are
   fine is what a hand feels as jitter, and it is the 95th that moves when that
   is fixed.

   AND IT TIMES WHOLE PAINTS, never the stages inside one. Canvas work is
   queued: a stage timed from the inside is charged for flushing the stage
   before it and the numbers smear until they mean nothing. What one layer
   costs is found by running the whole paint WITHOUT it, which is a difference
   between two honest numbers. */
(function(){
  const post = t => { try{ navigator.sendBeacon('/report', t); }catch(e){} };
  const frames = n => new Promise(r => {
    (function f(i){ i ? requestAnimationFrame(() => f(i - 1)) : r(); })(n);
  });
  function waitFor(fn, ms){
    const t0 = Date.now();
    return new Promise((res, rej) => (function poll(){
      let v; try{ v = fn(); }catch(e){ v = null; }
      if(v) return res(v);
      if(Date.now() - t0 > (ms || 20000)) return rej(new Error('timeout'));
      setTimeout(poll, 60);
    })());
  }
  const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1,
    Math.floor(a.length * p))];
  const f2 = v => (Math.round(v * 100) / 100).toFixed(2);
  const ALL = { land:1, relief:1, lakes:1, rivers:1, bord:1, coast:1, pick:1 };

  (async function(){
    const out = [];
    try{
      await waitFor(() => typeof index !== 'undefined' && index && sheet());
      await waitFor(() => document.querySelector('#pageHost .page'));
      const page = sheet();
      page.items = []; page.ink = [];
      const it = ADD_KINDS.atlas.make(
        { id: uid(), x: 6, y: 6, rot: 0, z: 1, lay: curLayerId() }, 'atlas');
      Object.assign(it, { w: 84, ar: 1, proj: 'globe', look: 'smooth',
                          lon: 8, lat: 16, zm: 0, on: {}, cap: '' });
      page.items.push(it);
      await render(); await frames(6);
      const el = document.querySelector('#pageHost .item[data-id="' + it.id + '"]');
      if(!el) throw new Error('no element for the map');
      const canvas = el.querySelector('canvas.atglobeview');
      if(!canvas) throw new Error('no live globe canvas');
      const L = ATL_LIVE.get(it.id);
      if(!L) throw new Error('the map never went live');

      /* one paint before anything is timed, or the canvas is still at its
         300 x 150 default and every fill is measured over a fortieth of the
         pixels it will really cover */
      it.on = { land:1 }; L.z = 0;
      atlGlobePaint(canvas, it, atlView(it, L), false);
      out.push('SIZE  ' + canvas.width + ' x ' + canvas.height + ' px, dpr ' +
               (Math.min(2, devicePixelRatio || 1)) + ' — ' +
               f2(canvas.width * canvas.height / 1e6) + ' megapixels a frame');

      /* one run of the real paint. `moving` says whether the hand is on it,
         which is what decides how fine the picture is drawn. */
      const run = (label, on, zoom, moving, n) => {
        it.on = Object.assign({}, on);
        L.z = zoom; L.cx = 8; L.cy = 16;
        canvas.__qn = 0; canvas.__ema = null; canvas.__qheld = 0;
        /* warm-up: a memo built on the first frame is not charged to the first
           measurement, and when the hand is meant to be down this is also long
           enough for the quality step to settle where it will */
        for(let i = 0; i < (moving ? 60 : 20); i++){
          L.cx = 8 + i * 3; atlGlobePaint(canvas, it, atlView(it, L), moving);
        }
        const t = [];
        for(let i = 0; i < n; i++){
          L.cx = 8 + i * 1.7; L.cy = 16 + Math.sin(i / 9) * 25;
          const v = atlView(it, L), t0 = performance.now();
          atlGlobePaint(canvas, it, v, moving);
          t.push(performance.now() - t0);
        }
        const med = pct(t, .5);
        out.push('BENCH ' + label + '  median ' + f2(med) + '  p95 ' + f2(pct(t, .95)) +
                 '  worst ' + f2(Math.max.apply(null, t)) + ' ms' +
                 /* a tree from before the quality ladder existed has no
                    ATL_GQ, and timing one against this is the whole point of
                    the script taking a project directory */
                 (moving ? '   at scale ' + (typeof ATL_GQ === 'undefined' ? 1
                             : ATL_GQ[canvas.__qn || 0]) +
                           ' (' + canvas.width + ' px)' : ''));
        return med;
      };

      const DEF = {};
      for(const Lay of ATL_LAYERS) DEF[Lay.id] = atlOn({ on:{} }, Lay) ? 1 : 0;
      run('default layers, still   z0', DEF, 0, false, 120);
      run('default layers, TURNING z0', DEF, 0, true,  120);
      run('every layer,    still   z0', ALL, 0, false, 120);
      run('every layer,    TURNING z0', ALL, 0, true,  120);
      run('every layer,    still   z2', ALL, 2, false, 120);
      run('every layer,    TURNING z2', ALL, 2, true,  120);

      /* what each layer is worth, as the difference the whole paint makes
         without it */
      const base = run('all of them, for the sums', ALL, 0, false, 90);
      for(const id of ['land', 'relief', 'lakes', 'rivers', 'bord', 'coast']){
        const less = Object.assign({}, ALL); less[id] = 0;
        const m = run('  …without ' + id, less, 0, false, 60);
        out.push('COST  ' + id + '\t' + f2(base - m) + ' ms of a still frame');
      }

      /* and how much of a frame is this canvas at all: atlPaint also asks
         atlPlan for the picture's parts and runs every pin */
      {
        it.on = Object.assign({}, ALL); L.z = 0;
        const t = [], g = [];
        for(let i = 0; i < 20; i++){ L.cx = 8 + i * 3; atlPaint(el, it, atlView(it, L), true); }
        for(let i = 0; i < 90; i++){
          L.cx = 8 + i * 1.7; L.cy = 16 + Math.sin(i / 9) * 25;
          let v = atlView(it, L), t0 = performance.now();
          atlPaint(el, it, v, true); t.push(performance.now() - t0);
          v = atlView(it, L); t0 = performance.now();
          atlGlobePaint(canvas, it, v, false); g.push(performance.now() - t0);
        }
        out.push('FRAME atlPaint ' + f2(pct(t, .5)) + ' ms, of which the canvas is ' +
                 f2(pct(g, .5)) + ' ms — everything else ' + f2(pct(t, .5) - pct(g, .5)) + ' ms');
      }
    }catch(e){
      out.push('BENCH ERROR ' + (e && e.message || e));
    }
    post(out.join('\n') + '\n');
    document.title = 'bench done';
  })();
})();
