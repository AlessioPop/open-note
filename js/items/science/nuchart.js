/* Open Note — items/nuchart.js
   the chart of the nuclides: every nuclide there is, on the plane physicists
   put them on — neutrons across, protons up — coloured by how it comes apart.
   The numbers are js/lib/nuclide.js's (NUBASE2020); the elements are chem.js's.

   This is the wall chart, not the periodic table. An element is a column of
   this chart, so ptable.js is the projection of it onto one axis; what that
   projection throws away is everything nuclear, which is what a chart of
   nuclides is for. Read it as: black is stable and the black squares trace the
   valley of stability; above the valley is neutron-poor and goes back down by
   beta plus, below it is neutron-rich and comes up by beta minus, the top right
   goes by alpha, and the straight lines are the magic numbers — the closed
   shells, where the valley bends.

   Press a nuclide and the foot writes it out: half-life, spin and parity, the
   branches with their percentages, the Q values and separation energies worked
   out from the masses, and an arrow drawn to each daughter. Press again with
   the chain button down and it follows the strongest branch all the way to
   whatever it ends on — which for uranium-238 is the fourteen steps to lead. */

/* ---- the colours ----
   Kept close to the wall charts everyone has seen — blue below the valley,
   red above it, yellow for alpha, black for stable — but pulled towards the
   paper so a chart printed out of a notebook does not glow. */
const NU_C = { st:'#23272f', bm:'#5183d8', bp:'#e06450', a:'#f0c04a', sf:'#57a05e',
  p:'#e08a3c', n:'#8f74cf', it:'#6fb0c2', cd:'#c98fbf', u:'#b6bac1' };
const NU_CLS = ['st', 'bm', 'bp', 'a', 'sf', 'p', 'n', 'it', 'cd', 'u'];
const NU_CLS_TXT = { st:'stable', bm:'β−', bp:'β+ / EC', a:'α', sf:'fission',
  p:'p', n:'n', it:'IT', cd:'cluster', u:'unknown' };

/* the classic half-life scale: one bin a decade or so, short and hot to long
   and cool, with stable its own black and unknown left grey */
const NU_HLB = [
  { t: 1e-6,  c:'#6d1f3f', l:'< 1 µs' },   { t: 1e-3,  c:'#9c2a4c', l:'1 µs' },
  { t: 1,     c:'#c8443f', l:'1 ms' },     { t: 60,    c:'#e0713c', l:'1 s' },
  { t: 3600,  c:'#eda23f', l:'1 min' },    { t: 86400, c:'#e8c64d', l:'1 h' },
  { t: 3.15e7,c:'#a8bf55', l:'1 d' },      { t: 3.15e10,c:'#54a06f', l:'1 y' },
  { t: 3.15e13,c:'#3d8fa0', l:'1 ky' },    { t: 3.15e16,c:'#4269a8', l:'1 My' },
  { t: Infinity, c:'#5f52a0', l:'1 Gy' }
];
/* a ramp, quantised — a continuous quantity on a chart of squares is read off
   a key, so it may as well be binned and the key made of the bins */
function nuRamp(stops, t){
  const x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const a = stops[i], b = stops[i + 1];
  const mix = k => Math.round(a[k] + (b[k] - a[k]) * f);
  return '#' + [mix(0), mix(1), mix(2)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const NU_SEQ = [[38, 42, 74], [40, 96, 130], [46, 148, 140], [138, 186, 106], [240, 214, 110]];
const NU_DIV = [[176, 58, 46], [216, 132, 96], [238, 232, 214], [110, 160, 200], [40, 74, 132]];

/* ---- what the chart is showing ----
   Four ways to colour the same squares. Each says which bin a nuclide is in,
   what colour that bin is, and what the key should say about it — so the key,
   the squares and the labels can never drift apart. */
const NU_VIEWS = {
  decay: {
    label: 'Decay', title: 'how it comes apart',
    bin: e => e.cls,
    keys: NU_CLS, col: k => NU_C[k], txt: k => NU_CLS_TXT[k], wide: true
  },
  half: {
    label: 'T½', title: 'how long it lasts',
    bin: e => {
      if(e.t === Infinity) return 'st';
      if(e.t == null) return 'u';
      for(let i = 0; i < NU_HLB.length; i++) if(e.t < NU_HLB[i].t) return 'h' + i;
      return 'h' + (NU_HLB.length - 1);
    },
    keys: ['st'].concat(NU_HLB.map((b, i) => 'h' + i)).concat(['u']),
    col: k => k === 'st' ? NU_C.st : k === 'u' ? NU_C.u : NU_HLB[+k.slice(1)].c,
    txt: k => k === 'st' ? 'stable' : k === 'u' ? 'unknown' : NU_HLB[+k.slice(1)].l
  },
  ba: {
    label: 'B/A', title: 'binding energy per nucleon — the iron peak',
    bin: e => { const b = nucBA(e); return b == null ? 'u' : 'b' + Math.min(17, Math.max(0, Math.floor(b / 500))); },
    keys: Array.from({ length: 18 }, (v, i) => 'b' + i).concat(['u']),
    col: k => k === 'u' ? NU_C.u : nuRamp(NU_SEQ, (+k.slice(1)) / 17),
    txt: k => k === 'u' ? 'unknown' : (+k.slice(1)) % 4 === 0 ? ((+k.slice(1)) / 2) + ' MeV' : ''
  },
  sn: {
    label: 'Sn', title: 'what it costs to pull one neutron off — where this goes to nothing is the drip line',
    bin: e => { const q = nucQ(e); if(q.sn == null) return 'u';
      return 's' + clamp(Math.round(q.sn / 2000) + 1, 0, 10); },
    keys: Array.from({ length: 11 }, (v, i) => 's' + i).concat(['u']),
    col: k => k === 'u' ? NU_C.u : nuRamp(NU_DIV, (+k.slice(1)) / 10),
    txt: k => k === 'u' ? 'unknown' : (+k.slice(1)) % 2 === 0 ? (((+k.slice(1)) - 1) * 2) + ' MeV' : ''
  }
};
const NU_VKEYS = ['decay', 'half', 'ba', 'sn'];
const nuView = it => NU_VIEWS[it.view] || NU_VIEWS.decay;

/* ---- the window on the chart ----
   The item keeps a centre and a width in nuclides; the height follows from the
   shape of the whole chart, so zooming never changes how tall the card is and
   the page does not jump about under the pointer. */
/* the whole plane, with a little air round the data: the shape of it is where
   the card's shape comes from, so zooming never changes how tall the card is */
const NU_NW = NUC_NMAX + 5, NU_ZH = NUC_ZMAX + 3, NU_ASPECT = NU_NW / NU_ZH;
function nuWin(it){
  const nw = clamp(it.zw || NU_NW, 5, NU_NW * 1.2), zh = nw / NU_ASPECT;
  const n0 = clamp((it.cn == null ? NU_NW / 2 : it.cn) - nw / 2, -nw * .35, NU_NW - nw * .65);
  const z0 = clamp((it.cz == null ? NU_ZH / 2 : it.cz) - zh / 2, -zh * .35, NU_ZH - zh * .65);
  const mx = nw * (nw <= 34 ? .078 : .05), mb = nw * .034;   /* room down the side and along the foot for the counts — wider once the side carries the elements' symbols as well as their number */
  return { n0, z0, nw, zh, mx, mb, vb: (n0 - mx) + ' ' + (-(z0 + zh)) + ' ' + (nw + mx) + ' ' + (zh + mb),
    w: nw + mx, h: zh + mb };
}
/* the middle of a square, and the square a point is in */
const nuCX = n => n + .5, nuCY = z => -(z + .5);

/* ---- the squares ----
   One path per colour rather than one rect per nuclide: 3558 squares as ten
   paths draw and pan as fast as ten of anything, and a page exported with a
   chart on it stays a page rather than becoming a megabyte of rectangles.
   Nothing is hit-tested against the DOM either — which square the pointer is
   in is arithmetic, so the paths can be as coarse as they like. */
const NU_G = .05;                          /* the hairline of paper between squares */
const nuR = v => Math.round(v * 1000) / 1000;
const nuBox = (x, y, w, h) => 'M' + nuR(x) + ' ' + nuR(y) + 'h' + nuR(w) + 'v' + nuR(h) + 'h' + nuR(-w) + 'z';
/* which metastable states get a slice of the square: the ones that last long
   enough to be a thing you could hold, two at most, oldest first. A chart that
   drew every 200 ns isomer would be a chart of hairlines. */
const NU_ISO_T = .1;
const nuIso = g => (g.iso || []).filter(i => i.t != null && i.t >= NU_ISO_T).slice(0, 2);
/* the bands of one square, ground state at the bottom the way Karlsruhe does it */
function nuBands(g){
  const iso = nuIso(g), k = iso.length, s = 1 - 2 * NU_G, bh = s / (k + 1);
  const x = g.n + NU_G, y0 = -(g.z + 1) + NU_G;
  return [g].concat(iso).map((e, i) => ({ e,
    box: nuBox(x, y0 + s - (i + 1) * bh + (k ? .012 : 0), s, bh - (k ? .024 : 0)) }));
}
function nuCells(it){
  const v = nuView(it), bag = {};
  for(const g of NUC_GS) for(const b of nuBands(g)){
    const k = v.bin(b.e) || 'u';
    (bag[k] || (bag[k] = [])).push(b.box);
  }
  return '<g class="nucells">' + v.keys.filter(k => bag[k])
    .map(k => '<path fill="' + v.col(k) + '" d="' + bag[k].join('') + '"/>').join('') + '</g>';
}

/* ---- the lines that matter ----
   The magic numbers are drawn as a pair of rules either side of the closed
   shell, because the shell is the row itself and not the line between rows;
   N = Z is dashed behind everything, so how far the valley leans away from it
   can be read off directly. */
const NU_MAGIC = [2, 8, 20, 28, 50, 82, 126, 184];
function nuGrid(it, w){
  /* the weight is in user units and follows the window, so a rule is the same
     hairline on the screen whether the whole chart is in view or twelve
     nuclides are */
  const sw = nuR(w.nw * .0022), dash = nuR(w.nw * .012) + ' ' + nuR(w.nw * .009);
  let s = '<g class="nugrid" stroke-width="' + sw + '">';
  const d = Math.min(NU_NW, NU_ZH);
  s += '<path class="nudiag" stroke-dasharray="' + dash + '" d="M0 0L' + d + ' ' + (-d) + '"/>';
  for(const m of NU_MAGIC){
    if(m <= NU_ZH) s += '<path class="numag" d="M0 ' + (-m) + 'H' + NU_NW + 'M0 ' + (-m - 1) + 'H' + NU_NW + '"/>';
    if(m <= NU_NW) s += '<path class="numag" d="M' + m + ' 0V' + (-NU_ZH) + 'M' + (m + 1) + ' 0V' + (-NU_ZH) + '"/>';
  }
  return s + '</g>';
}

/* ---- the counts down the side and along the foot ----
   In user units, so they are the same size on the screen however far in the
   chart is zoomed; the step thins out as the window widens. Close in, the
   proton axis carries the element's symbol as well as its number — which is
   the moment the chart stops being a picture and becomes a table. */
const nuStep = w => w > 120 ? 20 : w > 60 ? 10 : w > 26 ? 5 : w > 12 ? 2 : 1;
function nuAxes(it, w){
  const fs = w.nw * .0165, st = nuStep(w.nw), sz = nuStep(w.zh);
  const y = -w.z0 + w.mb * .74, x = w.n0 - w.mx * .2;
  let s = '<g class="nuax" font-size="' + nuR(fs) + '">';
  s += '<path class="nurule" d="M' + nuR(w.n0) + ' ' + nuR(-w.z0) + 'H' + nuR(w.n0 + w.nw) +
    'M' + nuR(w.n0) + ' ' + nuR(-w.z0) + 'V' + nuR(-(w.z0 + w.zh)) + '"/>';
  for(let n = Math.ceil(w.n0 / st) * st; n <= w.n0 + w.nw; n += st){
    if(n < 0 || n > NU_NW || n + .5 + fs * 1.6 > w.n0 + w.nw) continue;   /* not one that would hang off the edge */
    const mg = NU_MAGIC.indexOf(n) >= 0;
    s += '<text class="nut' + (mg ? ' mg' : '') + '" x="' + nuR(nuCX(n)) + '" y="' + nuR(y) + '">' + n + '</text>';
  }
  for(let z = Math.ceil(w.z0 / sz) * sz; z <= w.z0 + w.zh; z += sz){
    if(z < 0 || z > NU_ZH || z + .5 + fs * .8 > w.z0 + w.zh) continue;
    const mg = NU_MAGIC.indexOf(z) >= 0, el = CHEM_EL[z];
    s += '<text class="nut r' + (mg ? ' mg' : '') + '" x="' + nuR(x) + '" y="' + nuR(nuCY(z)) + '">' +
      (w.nw <= 34 && el ? el.sym + ' ' : '') + z + '</text>';
  }
  /* the axes name themselves in the two corners the nuclides never reach —
     bottom right is far too many neutrons, top left far too few — and only
     while the whole chart is in view, where those corners are really empty */
  if(w.nw > 60){
    const halo = ' stroke-width="' + nuR(fs * .5) + '" font-size="' + nuR(fs * 1.35) + '"';
    s += '<text class="nuaxn" x="' + nuR(w.n0 + w.nw - 1.5) + '" y="' + nuR(-(w.z0 + w.zh * .13)) +
      '"' + halo + '>neutrons N →</text>';
    s += '<text class="nuaxz" x="' + nuR(w.n0 + w.nw * .06) + '" y="' + nuR(-(w.z0 + w.zh * .9)) +
      '"' + halo + '>↑ protons Z</text>';
  }
  return s + '</g>';
}

/* ---- the writing in the squares ----
   Only once there is room: below about thirty-four nuclides across, the symbol
   and mass number fit; below twenty-two, the half-life under it; below
   thirteen, the strongest branch under that. The sizes are in user units, so
   this is a question about the window and not about the screen. */
function nuInk(hex){
  const v = parseInt(hex.slice(1), 16), r = v >> 16 & 255, g = v >> 8 & 255, b = v & 255;
  return (r * .299 + g * .587 + b * .114) > 150 ? '#181b21' : '#f4f5f7';
}
function nuLabels(it, w){
  if(w.nw > 34) return '';
  const v = nuView(it), hl = w.nw <= 22, br = w.nw <= 13, deep = w.nw <= 16;
  const n1 = w.n0 + w.nw, z1 = w.z0 + w.zh;
  let s = '<g class="nulab">';
  for(const g of NUC_GS){
    if(g.n < w.n0 - 1 || g.n > n1 || g.z < w.z0 - 1 || g.z > z1) continue;
    const bands = nuBands(g), ink = nuInk(v.col(v.bin(g) || 'u'));
    const cx = nuCX(g.n), k = bands.length - 1;
    const gy = k ? nuCY(g.z) + (1 - 2 * NU_G) * (k / (2 * (k + 1))) : nuCY(g.z);
    /* one line, two or three, depending on how much square there is: the name
       always, the half-life from twenty-two across, the strongest branch from
       thirteen. A split square keeps the half-life too — it is the nuclides
       with metastable states that anyone came here to read. */
    const y1 = gy - (br && !k ? .2 : hl ? (k ? .1 : .11) : 0);
    s += '<text class="nun" x="' + nuR(cx) + '" y="' + nuR(y1) + '" fill="' + ink +
      '" font-size="' + nuR(k ? .2 : .28) + '">' + g.sym + ' ' + g.a + '</text>';
    if(hl) s += '<text class="nun t" x="' + nuR(cx) + '" y="' + nuR(y1 + (k ? .21 : br ? .21 : .24)) +
      '" fill="' + ink + '" font-size="' + nuR(k ? .155 : .2) + '">' + esc(nucHl(g)) + '</text>';
    if(br && !k) s += '<text class="nun t" x="' + nuR(cx) + '" y="' + nuR(y1 + .42) +
      '" fill="' + ink + '" font-size=".17">' + esc(g.dec[0] ? nucBranchTxt(g.dec[0]) : (g.ab != null ? (+g.ab) + ' %' : '')) + '</text>';
    if(deep) for(let i = 1; i <= k; i++){
      const e = bands[i].e, ci = nuInk(v.col(it.view === 'decay' ? e.cls : (v.bin(e) || 'u')));
      const by = nuCY(g.z) - (1 - 2 * NU_G) * ((i * 2 - k) / (2 * (k + 1)));
      s += '<text class="nun t" x="' + nuR(cx) + '" y="' + nuR(by + .06) + '" fill="' + ci +
        '" font-size=".155">' + (e.tag || 'm') + ' ' + esc(nucHl(e)) + '</text>';
    }
  }
  return s + '</g>';
}

/* ---- what is chosen, and where its decay goes ----
   The arrow is the point of the chart: a decay is a step in two numbers, so
   every mode is a direction. Beta minus goes up and left, beta plus down and
   right, alpha down-left two by two, a neutron straight left. Drawn from the
   middle of one square to the middle of the next, over a halo of paper so it
   stays readable across a hundred coloured squares. */
const nuSelKey = e => e ? e.z + ':' + e.n + (e.tag ? ':' + e.tag : '') : '';
function nuSel(it){
  if(!it.sel) return null;
  const p = String(it.sel).split(':'), g = nucAt(+p[0], +p[1]);
  if(!g) return null;
  return p[2] ? (g.iso.find(i => i.tag === p[2]) || g) : g;
}
function nuArrow(from, to, cls, sw, lab){
  const x1 = nuCX(from.n), y1 = nuCY(from.z), x2 = nuCX(to.n), y2 = nuCY(to.z);
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const hl = sw * 3.4, hw = sw * 1.7;
  const ax = x1 + ux * Math.min(.32, L * .3), ay = y1 + uy * Math.min(.32, L * .3);
  const bx = x2 - ux * Math.min(.36, L * .34), by = y2 - uy * Math.min(.36, L * .34);
  const px = -uy, py = ux;
  const line = 'M' + nuR(ax) + ' ' + nuR(ay) + 'L' + nuR(bx - ux * hl * .7) + ' ' + nuR(by - uy * hl * .7);
  const head = 'M' + nuR(bx) + ' ' + nuR(by) + 'L' + nuR(bx - ux * hl + px * hw) + ' ' + nuR(by - uy * hl + py * hw) +
    'L' + nuR(bx - ux * hl - px * hw) + ' ' + nuR(by - uy * hl - py * hw) + 'z';
  let s = '<path class="nuhalo" d="' + line + '" stroke-width="' + nuR(sw * 3) + '"/>' +
    '<path class="nuarr ' + cls + '" d="' + line + '" stroke-width="' + nuR(sw) + '"/>' +
    '<path class="nuhead ' + cls + '" d="' + head + '"/>';
  if(lab) s += '<text class="nualab" x="' + nuR((ax + bx) / 2 + px * sw * 3.4) + '" y="' +
    nuR((ay + by) / 2 + py * sw * 3.4) + '" font-size="' + nuR(sw * 4.6) + '">' + esc(lab) + '</text>';
  return s;
}
/* the square the pointer chose, ringed; every branch it has, drawn; and with
   the chain button down, the whole way down to whatever it ends on */
function nuMarks(it, w){
  const e = nuSel(it);
  if(!e) return '';
  const g = e.gs ? e : e.parent, sw = clamp(w.nw * .0034, .05, .45);
  let s = '<g class="numark">';
  s += '<rect class="nuring" x="' + nuR(g.n - .06) + '" y="' + nuR(-(g.z + 1) - .06) +
    '" width="1.12" height="1.12" stroke-width="' + nuR(sw * .9) + '"/>';
  const steps = it.chain ? nucChain(e) : (e.dec.map(d => {
    const t = nucDaughter(e, d.m);
    return t && t.e && !(t.z === e.z && t.n === e.n) ? { from: g, mode: d.m, br: d.br, to: t.e } : null;
  }).filter(Boolean).slice(0, 4));
  const named = w.nw <= 46;
  for(const st of steps){
    s += nuArrow(st.from, st.to, nucClass({ t: null, dec: [{ m: st.mode }] }), sw, named ? nucModeTxt(st.mode) : '');
    if(it.chain) s += '<rect class="nuchain" x="' + nuR(st.to.n + .02) + '" y="' + nuR(-(st.to.z + 1) + .02) +
      '" width=".96" height=".96" stroke-width="' + nuR(sw * .7) + '"/>';
  }
  return s + '</g>';
}

/* ---- the key ----
   Built from the view itself, so a colour on the chart and a colour in the key
   are the same call. A binned scale is drawn as chips with the bin edges under
   them; a class scale as chips with names. */
function nuKey(it){
  const v = nuView(it);
  return '<div class="nukey' + (v.wide ? '' : ' ramp') + '">' + v.keys.map(k =>
    '<span style="--kc:' + v.col(k) + '"><i></i>' + esc(v.txt(k) || '') + '</span>').join('') +
    '<em>' + esc(v.title) + '</em></div>';
}

/* ---- the foot ----
   Everything the table knows about one nuclide, in the order a physicist asks
   for it: how long it lasts, what it is, what it turns into, and what that is
   worth in energy. The Q values are not stored anywhere — they are the mass
   excesses of this nuclide and its neighbours, subtracted here. */
function nuFacts(it){
  const e = nuSel(it);
  if(!e) return '<div class="nunone">Press a square. Wheel to zoom, drag to move about.</div>';
  const g = e.gs ? e : e.parent, el = CHEM_EL[e.z], q = nucQ(e), ba = nucBA(e);
  const row = (l, v) => '<span class="nurow"><i>' + l + '</i>' + v + '</span>';
  const bit = (l, v) => v == null ? '' : '<b>' + l + '</b> ' + v;
  let s = '<div class="nutop"><b class="nubig" data-c="' + e.cls + '">' + nucName(e) + '</b>' +
    '<span class="nutit">' + esc(el ? el.name + '-' + e.a + (e.tag || '') : 'neutron') +
    '<small>Z ' + e.z + ' · N ' + e.n + ' · A ' + e.a + ' · ' + esc(e.gs ? NUC_CLASS_NAME[e.cls] : 'metastable, ' + NUC_CLASS_NAME[e.cls]) + '</small></span></div>';
  s += row('half-life', '<u>' + esc(nucHlLong(e)) + '</u>' +
    (e.jp ? ' · <i>Jπ</i> ' + esc(e.jp) : '') +
    (e.exc ? ' · <i>at</i> ' + nucEn(e.exc) + ' <i>above the ground state</i>' : '') +
    (e.ab != null ? ' · <i>' + (+e.ab) + ' % of natural ' + esc(el ? el.name.toLowerCase() : '') + '</i>' : '') +
    (e.yr ? ' · <i>found</i> ' + e.yr : ''));
  if(e.dec.length) s += row('decays by', e.dec.map(d => {
    const t = nucDaughter(e, d.m);
    return '<span class="nubr" data-c="' + nucClass({ t: null, dec: [d] }) + '">' + esc(nucBranchTxt(d)) +
      (t && t.e ? '<em>→ ' + nucName(t.e) + '</em>' : '') + '</span>';
  }).join(''));
  const en = [bit('Qβ−', nucEn(q.bm)), bit('QEC', nucEn(q.ec)), bit('Qα', nucEn(q.a)),
    bit('Sn', nucEn(q.sn)), bit('Sp', nucEn(q.sp)),
    bit('B/A', ba == null ? null : (ba / 1000).toFixed(3) + ' MeV'),
    bit('Δ', e.me == null ? null : nucEn(e.me) + (e.est ? '#' : ''))].filter(Boolean);
  s += row('energies', en.join(' · '));
  const iso = (g.iso || []).filter(i => i !== e);
  if(iso.length) s += row('also', iso.map(i => '<span class="nuiso" data-k="' + nuSelKey(i) + '">' +
    nucName(i) + '<em>' + esc(nucHl(i)) + '</em></span>').join('') +
    (e.tag ? '<span class="nuiso" data-k="' + nuSelKey(g) + '">' + nucName(g) + '<em>' + esc(nucHl(g)) + '</em></span>' : ''));
  if(it.chain){
    const ch = nucChain(e);
    s += row('chain', ch.length
      ? nucName(ch[0].from) + ch.map(st => ' <em>' + esc(nucModeTxt(st.mode)) + '</em> ' + nucName(st.to)).join('') +
        ' · <i>' + ch.length + (ch.length === 1 ? ' step' : ' steps') +
        (ch[ch.length - 1].to.t === Infinity ? ', stable' : '') + '</i>'
      : '<i>it ends here</i>');
  }
  return s;
}

/* ---- the picture ----
   The squares and the magic-number rules are drawn once and never touched
   again; only the layer over them — the writing, the arrows, the counts — is
   rebuilt as the window moves, and moving the window is one attribute. */
const nuDyn = (it, w, cid) => '<g clip-path="url(#' + cid + ')">' + nuGrid(it, w) + nuLabels(it, w) +
  nuMarks(it, w) + '</g>' + nuAxes(it, w);
/* The margins are paper, and the squares must not run over them — the picture
   is 5646 squares wide whatever the window is, so it is clipped to the plotting
   area rather than to the card. The id carries a number of its own because two
   charts on one page would otherwise clip through each other's rectangle: the
   same trap the molecule's gradients fell into, and the reason for the seam. */
let NU_UID = 0;
const nuClipR = w => '<rect x="' + nuR(w.n0) + '" y="' + nuR(-(w.z0 + w.zh)) +
  '" width="' + nuR(w.nw) + '" height="' + nuR(w.zh) + '"/>';
function nuSVG(it){
  const w = nuWin(it), cid = 'nuclip' + (++NU_UID) + '_';
  return '<svg class="nusvg" viewBox="' + w.vb + '" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:' +
    nuR(w.w) + '/' + nuR(w.h) + '"><defs><clipPath id="' + cid + '">' + nuClipR(w) + '</clipPath></defs>' +
    '<g class="nuplot" clip-path="url(#' + cid + ')">' + nuCells(it) + '</g>' +
    '<g class="nudyn" data-clip="' + cid + '">' + nuDyn(it, w, cid) + '</g></svg>';
}
function nuPaint(el, it){
  const w = nuWin(it), svg = el.querySelector('.nusvg');
  if(!svg) return;
  svg.setAttribute('viewBox', w.vb);
  svg.style.aspectRatio = nuR(w.w) + '/' + nuR(w.h);
  const clip = svg.querySelector('clipPath');
  if(clip) clip.innerHTML = nuClipR(w);
  const dyn = svg.querySelector('.nudyn');
  if(dyn) dyn.innerHTML = nuDyn(it, w, dyn.dataset.clip);
  const f = el.querySelector('.nufacts');
  if(f) f.innerHTML = nuFacts(it);
}
function nuRecolour(el, it){
  const svg = el.querySelector('.nusvg'), old = svg && svg.querySelector('.nucells');
  if(old) old.outerHTML = nuCells(it);          /* inside .nuplot, so it keeps the clip */
  const k = el.querySelector('.nukey');
  if(k) k.outerHTML = nuKey(it);
  nuPaint(el, it);
}

/* ---- the pointer ----
   Which square it is over is arithmetic on the viewBox, not a hit test: the
   scale is whatever fits the box, the origin follows from it, and the rest is
   two divisions. The fraction up the square picks the band, so pressing the
   top slice of technetium-99 chooses the metastable state and not the ground
   state under it. */
function nuHit(el, it, ev){
  const svg = el.querySelector('.nusvg');
  if(!svg) return null;
  const r = svg.getBoundingClientRect(), w = nuWin(it);
  if(!r.width || !r.height) return null;
  const sc = Math.min(r.width / w.w, r.height / w.h);
  const ox = r.left + (r.width - w.w * sc) / 2, oy = r.top + (r.height - w.h * sc) / 2;
  const ux = (w.n0 - w.mx) + (ev.clientX - ox) / sc, uy = -(w.z0 + w.zh) + (ev.clientY - oy) / sc;
  return { ux, uy, sc, n: Math.floor(ux), z: Math.floor(-uy), fy: -uy - Math.floor(-uy) };
}
function nuPickAt(hit){
  if(!hit) return null;
  const g = nucAt(hit.z, hit.n);
  if(!g) return null;
  const iso = nuIso(g);
  if(!iso.length) return g;
  const band = clamp(Math.floor(hit.fy * (iso.length + 1)), 0, iso.length);
  return band === 0 ? g : iso[band - 1];
}
function nuZoom(el, it, page, f, hit){
  const w0 = clamp(it.zw || NU_NW, 5, NU_NW * 1.2), w1 = clamp(w0 * f, 6, NU_NW * 1.1);
  if(hit && w1 !== w0){
    const cn = it.cn == null ? NU_NW / 2 : it.cn, cz = it.cz == null ? NU_ZH / 2 : it.cz;
    it.cn = hit.ux - (hit.ux - cn) * (w1 / w0);
    it.cz = (-hit.uy) - ((-hit.uy) - cz) * (w1 / w0);
  }
  it.zw = w1;
  nuPaint(el, it);
  if(page) queueSave(page.id);
}
function nuGoto(el, it, page, e, zoom){
  if(!e) return;
  it.sel = nuSelKey(e);
  it.cn = e.n + .5; it.cz = e.z + .5;
  if(zoom && (it.zw || NU_NW) > 40) it.zw = 26;
  nuPaint(el, it);
  if(page) queueSave(page.id);
}
const nuHome = (el, it, page) => { it.cn = NU_NW / 2; it.cz = NU_ZH / 2; it.zw = NU_NW; nuPaint(el, it); if(page) queueSave(page.id); };

/* the line above the foot that follows the pointer, so a chart can be read
   without pressing anything */
function nuHover(el, it, e){
  const h = el.querySelector('.nuhov');
  if(!h) return;
  if(!e){ h.textContent = ''; return; }
  h.innerHTML = '<b>' + nucName(e) + '</b> ' + esc(nucHl(e)) +
    (e.dec[0] ? ' · ' + esc(nucBranchTxt(e.dec[0])) : '') +
    (e.ab != null ? ' · ' + (+e.ab) + ' %' : '');
}

/* ---- looking one up ----
   U238, 238U, Tc-99m, uranium-238 — a physicist has a nuclide in mind and
   wants the chart to go there, rather than to hunt for it in five thousand
   squares. */
let NU_ASK = null;
function nuAskEl(){
  let d = $('#nuask');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'nuask glass'; d.id = 'nuask';
  d.innerHTML = '<input placeholder="a nuclide — U238, Tc-99m, 14C…" spellcheck="false"><div class="nufound"></div>';
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => e.stopPropagation());
  const inp = d.querySelector('input'), out = d.querySelector('.nufound');
  const look = () => {
    const e = nucFind(inp.value);
    out.innerHTML = !inp.value.trim() ? '' : e
      ? '<b>' + nucName(e) + '</b> ' + esc(nucHlLong(e)) + (e.dec[0] ? ' · ' + esc(nucBranchTxt(e.dec[0])) : '')
      : '<s>no such nuclide</s>';
    return e;
  };
  inp.addEventListener('input', look);
  inp.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if(ev.key === 'Escape'){ ev.preventDefault(); nuAskClose(); }
    if(ev.key === 'Enter'){
      ev.preventDefault();
      const e = look();
      if(e && NU_ASK){ nuGoto(NU_ASK.el, NU_ASK.it, NU_ASK.page, e, true); SND.tick(); nuAskClose(); }
    }
  });
  return d;
}
function nuAsk(anchor, it, el, page){
  const d = nuAskEl();
  if(d.classList.contains('open') && NU_ASK && NU_ASK.anchor === anchor) return nuAskClose();
  NU_ASK = { it, el, page, anchor };
  d.classList.add('open');
  const inp = d.querySelector('input');
  inp.value = ''; d.querySelector('.nufound').innerHTML = '';
  const r = anchor.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
  d.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
  if(r.top - h - 10 >= 8){ d.style.top = 'auto'; d.style.bottom = (innerHeight - r.top + 10) + 'px'; }
  else { d.style.bottom = 'auto'; d.style.top = clamp(r.bottom + 10, 8, innerHeight - h - 8) + 'px'; }
  warpIn(d, r.left + r.width / 2, r.top + r.height / 2);
  inp.focus({ preventScroll: true });
}
function nuAskClose(){
  const d = $('#nuask');
  if(!d || !d.classList.contains('open') || !NU_ASK) return false;
  NU_ASK = null;
  warpOut(d, () => { if(!NU_ASK) d.classList.remove('open'); });
  return true;
}
window.addEventListener('pointerdown', e => {
  if(NU_ASK && !e.target.closest('#nuask') && !NU_ASK.anchor.contains(e.target)) nuAskClose();
});

/* ---- on the page ----
   The first press selects the card, the way every item works; after that the
   chart takes the pointer — drag to move about it, wheel to go in and out,
   press a square to choose it. ✥ hands the pointer back to the page. */
function nuMove(el, it, on){
  if(on) PLOT_MOVE.add(it.id); else PLOT_MOVE.delete(it.id);
  el.classList.toggle('mmove', !!on);
}
function nuDown(ev, el, it, page){
  if(ev.button || !el.classList.contains('sel') || PLOT_MOVE.has(it.id)) return;
  const svg = el.querySelector('.nusvg');
  if(!svg || !svg.contains(ev.target)) return;
  const start = nuHit(el, it, ev);
  if(!start) return;
  ev.stopPropagation(); ev.preventDefault();
  const cn0 = it.cn == null ? NU_NW / 2 : it.cn, cz0 = it.cz == null ? NU_ZH / 2 : it.cz;
  const sx = ev.clientX, sy = ev.clientY, pid = ev.pointerId;
  let moved = false, raf = 0;
  try{ svg.setPointerCapture(pid); }catch(err){}
  const mv = e2 => {
    if(e2.pointerId !== pid) return;
    const dx = e2.clientX - sx, dy = e2.clientY - sy;
    if(!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    it.cn = cn0 - dx / start.sc; it.cz = cz0 + dy / start.sc;
    if(!raf) raf = requestAnimationFrame(() => { raf = 0; nuPaint(el, it); });
  };
  const up = e2 => {
    if(e2.pointerId !== pid) return;
    svg.removeEventListener('pointermove', mv);
    svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up);
    try{ svg.releasePointerCapture(pid); }catch(err){}
    if(!moved && e2.type === 'pointerup'){
      const e = nuPickAt(nuHit(el, it, e2));
      if(e){ it.sel = nuSelKey(e); nuPaint(el, it); SND.tick(); }
    }
    queueSave(page.id);
  };
  svg.addEventListener('pointermove', mv);
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
}

defineItem('nuchart', {
  add: { nuchart: base => ({ ...base, type:'nuchart', w:96, view:'decay', sel:'92:146',
    chain:0, cn:NU_NW / 2, cz:NU_ZH / 2, zw:NU_NW, cap:'' }) },
  sound: 'tape',
  html: (it, c) => '<figure class="body nuc">' + nuSVG(it) + nuKey(it) +
    '<div class="nuhov"></div><div class="nufacts">' + nuFacts(it) + '</div><figcaption></figcaption></figure>',
  after(it, el, page){ select(it.id); },
  tools(mk, it, el, page){
    const vb = mk(nuView(it).label, 'Colour the squares by decay mode, half-life, binding energy per nucleon or neutron separation energy', b => {
      it.view = NU_VKEYS[(NU_VKEYS.indexOf(it.view || 'decay') + 1) % NU_VKEYS.length];
      b.textContent = nuView(it).label;
      b.title = 'Now: ' + nuView(it).title;
      nuRecolour(el, it); queueSave(page.id); SND.tick();
    });
    const cb = mk('⇢', 'Follow the strongest branch all the way down — the decay chain, drawn', b => {
      it.chain = it.chain ? 0 : 1;
      b.classList.toggle('on', !!it.chain);
      nuPaint(el, it); queueSave(page.id); SND.tick();
    });
    if(it.chain) cb.classList.add('on');
    mk('⌕', 'Go to a nuclide by name — U238, Tc-99m, 14C', b => nuAsk(b, it, el, page));
    mk('⟲', 'The whole chart again', () => { nuHome(el, it, page); SND.pop(); });
    mk('✥', 'Move it about the page rather than about the chart', () => nuMove(el, it, !PLOT_MOVE.has(it.id)));
  },
  wire(el, it, page){
    const fig = el.querySelector('.nuc'), svg = el.querySelector('.nusvg');
    if(PLOT_MOVE.has(it.id)) el.classList.add('mmove');
    fig.addEventListener('pointerdown', e => nuDown(e, el, it, page));
    svg.addEventListener('pointermove', e => {
      if(e.buttons || !el.classList.contains('sel') || PLOT_MOVE.has(it.id)) return;
      nuHover(el, it, nuPickAt(nuHit(el, it, e)));
    });
    svg.addEventListener('pointerleave', () => nuHover(el, it, null));
    fig.addEventListener('wheel', e => {
      if(e.ctrlKey || e.metaKey || PLOT_MOVE.has(it.id) || !el.classList.contains('sel')) return;
      e.preventDefault(); e.stopPropagation();
      nuZoom(el, it, page, e.deltaY > 0 ? 1.13 : 1 / 1.13, nuHit(el, it, e));
    }, { passive:false });
    el.addEventListener('dblclick', e => {
      if(!svg.contains(e.target)) return;
      e.stopPropagation(); e.preventDefault(); nuHome(el, it, page); SND.pop();
    });
    /* the states listed in the foot are buttons back onto the chart */
    el.querySelector('.nufacts').addEventListener('click', e => {
      const c = e.target.closest('.nuiso');
      if(!c) return;
      e.stopPropagation();
      it.sel = c.dataset.k; nuPaint(el, it); queueSave(page.id); SND.tick();
    });
  },
  forget(it){ PLOT_MOVE.delete(it.id); },
  css: `
/* ---------- the chart of the nuclides ---------- */
.nuc{container-type:inline-size;color:var(--ink)}
.nusvg{display:block;width:100%;height:auto;overflow:hidden;touch-action:none;font-family:var(--mono);
  background:color-mix(in srgb,var(--ink) 4%,transparent);border-radius:.4cqw}
.item.sel[data-type="nuchart"] .nusvg{cursor:crosshair}
.item.mmove[data-type="nuchart"] .nusvg{cursor:move}
.item[data-type="nuchart"] .rs{display:none}
/* the rules: the magic numbers over the squares, N = Z behind them */
.nusvg .numag{stroke:color-mix(in srgb,var(--ink) 42%,transparent);fill:none}
.nusvg .nudiag{stroke:color-mix(in srgb,var(--ink) 24%,transparent);fill:none}
.nusvg .nurule{stroke:color-mix(in srgb,var(--ink) 40%,transparent);stroke-width:.05;fill:none}
/* the counts, in user units so they keep their size as the chart is zoomed */
.nusvg .nut{fill:var(--soft);text-anchor:middle;dominant-baseline:central}
.nusvg .nut.r{text-anchor:end}
.nusvg .nut.mg{fill:var(--ink);font-weight:700}
.nusvg .nuaxn,.nusvg .nuaxz{fill:var(--soft);opacity:.8;letter-spacing:.14em;dominant-baseline:central;
  stroke:var(--paper);paint-order:stroke;stroke-linejoin:round}
.nusvg .nuaxn{text-anchor:end}
.nusvg .nuaxz{text-anchor:start}
/* the writing in the squares */
.nusvg .nun{text-anchor:middle;dominant-baseline:central;font-weight:600;pointer-events:none}
.nusvg .nun.t{font-weight:400;opacity:.9}
/* what is chosen, and where it goes */
.nusvg .nuring{fill:none;stroke:var(--accent);rx:.1}
.nusvg .nuchain{fill:none;stroke:color-mix(in srgb,var(--accent) 70%,transparent)}
.nusvg .nuhalo{fill:none;stroke:var(--paper);stroke-linecap:round;opacity:.85}
.nusvg .nuarr{fill:none;stroke:var(--ac,#23272f);stroke-linecap:round}
.nusvg .nuhead{fill:var(--ac,#23272f);stroke:none}
.nusvg .nualab{fill:var(--ink);text-anchor:middle;dominant-baseline:central;font-weight:600;
  stroke:var(--paper);stroke-width:.09;paint-order:stroke}
/* the key */
.nukey{display:flex;flex-wrap:wrap;align-items:center;gap:.25em 1.1cqw;margin-top:.75cqw;
  font-family:var(--mono);font-size:1.15cqw;opacity:.85}
.nukey span{display:inline-flex;align-items:center;gap:.4em;white-space:nowrap}
.nukey i{width:.85em;height:.85em;border-radius:.18em;background:var(--kc);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 18%,transparent)}
.nukey em{font-style:normal;opacity:.55;letter-spacing:.06em}
.nukey.ramp{gap:.25em 0}
.nukey.ramp span{gap:.25em;margin-right:.55em}
.nukey.ramp i{border-radius:0;margin-right:-.1em}
.nukey.ramp em{margin-left:.9em}
/* the line the pointer writes, and the foot */
.nuhov{font-family:var(--mono);font-size:1.25cqw;letter-spacing:.05em;color:var(--soft);min-height:1.5em;
  padding-top:.7cqw}
.nuhov b{color:var(--ink);font-weight:600;margin-right:.5em}
.nufacts{font-family:var(--mono);font-size:1.45cqw;line-height:1.5}
.nufacts .nunone{opacity:.5;letter-spacing:.06em}
.nutop{display:flex;align-items:baseline;gap:.7em;margin-bottom:.3em}
.nufacts .nubig{font-size:2.1em;font-weight:700;line-height:1;
  color:color-mix(in srgb,var(--nc,var(--ink)) 72%,var(--ink))}
.nufacts .nutit{font-size:1.05em;font-weight:600;letter-spacing:.03em}
.nufacts .nutit small{display:block;font-weight:400;font-size:.72em;opacity:.6;letter-spacing:.09em;
  text-transform:uppercase;margin-top:.15em}
.nurow{display:block;margin-top:.2em}
.nurow>i:first-child{font-style:normal;opacity:.45;text-transform:uppercase;letter-spacing:.11em;font-size:.8em;
  display:inline-block;min-width:7em}
.nurow i{font-style:normal;opacity:.55}
.nurow u{text-decoration:none;font-weight:600}
.nurow b{font-weight:400;opacity:.55}
.nubr{display:inline-flex;align-items:baseline;gap:.35em;margin-right:1em;white-space:nowrap}
.nubr::before{content:"";align-self:center;width:.6em;height:.6em;border-radius:.15em;background:var(--nc,var(--ink))}
.nubr em{font-style:normal;opacity:.7}
.nuiso{display:inline-flex;align-items:baseline;gap:.4em;margin-right:1em;cursor:pointer;white-space:nowrap;
  border-bottom:1px dotted color-mix(in srgb,var(--ink) 35%,transparent)}
.nuiso:hover{border-bottom-color:var(--accent);color:var(--accent)}
.nuiso em{font-style:normal;opacity:.6;font-size:.9em}
/* the ⌕ box */
.nuask{position:fixed;z-index:83;display:none;width:262px;padding:10px;border-radius:13px;font-family:var(--mono);
  will-change:transform,filter,opacity}
.nuask.open{display:block}
.nuask input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.07);border:0;outline:0;border-radius:8px;
  color:inherit;font-family:var(--mono);font-size:12px;padding:7px 9px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.nuask input::placeholder{color:rgba(233,234,239,.35)}
.nuask input:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}
.nufound{font-size:10.5px;letter-spacing:.04em;color:rgba(233,234,239,.8)}
.nufound:not(:empty){padding:7px 3px 1px}
.nufound b{font-weight:600;margin-right:.5em}
.nufound s{text-decoration:none;color:#f08a7a}
` + NU_CLS.map(k => '.nusvg .nuarr.' + k + ',.nusvg .nuhead.' + k + '{--ac:' + NU_C[k] + '}' +
    '.nufacts .nubig[data-c="' + k + '"],.nufacts .nubr[data-c="' + k + '"]{--nc:' + NU_C[k] + '}').join('\n')
});
defineIcon('nuchart', '<rect x="3.2" y="14.6" width="5" height="5" rx=".8"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/>' +
  '<rect x="15.8" y="4.4" width="5" height="5" rx=".8"/><path d="M15.4 15.6 10.6 20.4M10.6 20.4h2.6M10.6 20.4v-2.6"/>');
defineTool({ kind:'nuchart', cat:'science', label:'Chart of nuclides', icon:'nuchart', order:30,
  hint:'The whole nuclear chart — every nuclide, what it decays into and how fast; press one for its half-life, branches and Q values' });
