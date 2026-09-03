/* Photograph the live globe at a fixed set of views and post the pixels back.

   The point is a BEFORE and an AFTER: run it against a copy of the app from
   before a change and against the tree, and compare the two sets. Anything
   that moves by more than the rasteriser's own rounding is a change to the
   picture, and this feature's whole promise is that it is the same picture
   however it is drawn. */
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
  const VIEWS = [
    ['home',      8,   16,  0, { land:1, bord:1, coast:1 }],
    ['atlantic', -30,  20,  0, { land:1, bord:1, coast:1 }],
    ['pacific',  -170, 0,   0, { land:1, bord:1, coast:1 }],
    ['pole',      20,  82,  0, { land:1, bord:1, coast:1 }],
    ['south',     140,-60,  0, { land:1, bord:1, coast:1 }],
    ['dateline',  180, 5,   0, { land:1, bord:1, coast:1 }],
    ['layers',    8,   16,  0, { land:1, relief:1, lakes:1, rivers:1, bord:1, coast:1 }],
    ['zoom2',     10,  45,  2, { land:1, relief:1, lakes:1, rivers:1, bord:1, coast:1 }],
    ['zoom4',    -60, -20,  4, { land:1, bord:1, coast:1, rivers:1 }],
    ['picked',    8,   16,  0, { land:1, bord:1, coast:1, pick:1 }]
  ];
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
      const canvas = el.querySelector('canvas.atglobeview');
      const L = ATL_LIVE.get(it.id);
      if(!canvas || !L) throw new Error('no live globe');
      for(const [name, lon, lat, z, on] of VIEWS){
        it.on = Object.assign({}, on);
        it.sel = name === 'picked' ? 'Brazil' : '';
        L.cx = lon; L.cy = lat; L.z = z;
        /* `false` for moving: every shot is a standing-still frame, which is
           the one the picture is promised at */
        atlGlobePaint(canvas, it, atlView(it, L), false);
        out.push('SHOT ' + name + ' ' + canvas.width + ' ' + canvas.height + ' ' +
                 canvas.toDataURL('image/png'));
      }
    }catch(e){ out.push('SHOT ERROR ' + (e && e.message || e)); }
    for(const line of out) post(line);
    post('SHOT done');
  })();
})();
