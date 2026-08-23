/* Open Note — items/chart.js
   charts of named shares — a pie you fill in by hand, and the start of a family */

/* ================= charts =================
   A pie chart (and its donut, 3D and hand-drawn faces), a bar chart and a
   stacked 100% bar, all one item type over one shape of data: rows of
   {label, value}. The legend under the picture IS the editor — click a name
   or a number and type — so the data lives where it is read, and the same
   rows feed whichever face the chart is wearing.

   Colours are not picked here by eye. The fixed palettes below were validated
   with the data-viz skill's checker (CVD ΔE, normal-vision floor, lightness
   band, chroma floor) against all four stock papers, light sets and dark sets
   separately, and their slot ORDER is part of what passed — do not reshuffle
   or extend them casually; re-run the validator if you must. (Slots 9 and 10
   were appended the same way: searched for pairs whose edges to the red, to
   each other and round the wrap to slot 1 clear the gates in both modes, so
   slots 1–8 stayed byte-identical and old charts kept their colours.) Two
   palettes are ramps worked out from the book's own colours at paint time
   (accent and ink), stepped in OKLab so the lightness gaps stay readable.
   Slices are separated by a paper-coloured seam and always carry direct
   labels or the legend, which is the required relief for the low-contrast
   slots the validator flags.

   Labels place themselves — inside a slice that can hold them, in ink picked
   by the slice's measured lightness, or led out on a line that turns a corner
   — and ⌖ cycles where they sit: automatic, beside the slices, all on
   stalks, or all inside. Any label can also simply be DRAGGED: it remembers
   its offset from where it would have sat, grows a leader the moment it
   leaves its slice, loses it when dragged back in, and a double-click sends
   it home. ✎ holds their size and face. */

const CHART_PALS = {
  /* light: on graph/kraft-side papers · dark: restepped for dark papers */
  crisp: { name: 'Crisp',
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#727fce', '#798130'],
    dark:  ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767', '#626db7', '#6d7425'] },
  vivid: { name: 'Vivid',
    light: ['#f28b00', '#007aff', '#34c759', '#af52de', '#ff3b30', '#32ade6', '#dca100', '#ff2d55', '#5e61d2', '#b04283'],
    dark:  ['#c76c00', '#006be3', '#0ea23f', '#9945c4', '#dc2921', '#158dc0', '#b37e00', '#dc1b45', '#5759c3', '#a33c79'] },
  soft:  { name: 'Soft',
    light: ['#c39b3f', '#1f9da4', '#cd8756', '#6895d3', '#6fa263', '#ab77b5', '#97953f', '#c26b78', '#7385c9', '#389a7c'],
    dark:  ['#b28a2b', '#1f9da4', '#c37e4d', '#6692d0', '#6da062', '#ab77b5', '#97953f', '#c26b78', '#6172b2', '#20876a'] },
  warm:  { name: 'Warm',                     /* six slots — eight warm hues cannot pass the dark band */
    light: ['#b8421d', '#0090a4', '#80460e', '#d3a85e', '#98456a', '#cf9c2e'],
    dark:  ['#b74826', '#00889b', '#8f5421', '#b08840', '#9d4e70', '#b0810e'] },
  tonal: { name: 'Tonal', ramp: 'accent', max: 6 },   /* the book's accent, paper-side to ink-side */
  ink:   { name: 'Ink',   ramp: 'ink',    max: 6 }    /* quiet neutral steps of the book's own ink */
};
const CHART_PAL_SEQ = ['crisp', 'vivid', 'soft', 'warm', 'tonal', 'ink'];
const CHART_KINDS = ['pie', 'bars', 'stack'];
const CHART_KIND_NAMES = { pie: 'Pie chart', bars: 'Bar chart', stack: 'Stacked bar' };
const CHART_LOOKS = ['flat', 'donut', 'tilt', 'sketch'];
const CHART_LOOK_NAMES = { flat: 'Flat', donut: 'Donut', tilt: '3D', sketch: 'Sketchbook' };
const CHART_LBLS = ['pct', 'val', 'off'];
const CHART_LMODES = ['auto', 'beside', 'stalk', 'in'];
const CHART_LMODE_NAMES = { auto: 'automatic', beside: 'beside the slices', stalk: 'on stalks', in: 'inside' };
const CHART_MAXROWS = 10;
/* label faces: the book's own three, with how wide a character runs in each */
const CHART_FONTS = { mono: { name: 'mono', w: 0.603 }, body: { name: 'serif', w: 0.54 }, hand: { name: 'handwriting', w: 0.52 } };
/* base label sizes, in picture units — × the ✎ Labels slider */
const CH_FS = { in: 56, out: 47, barv: 44, barl: 42, stk: 50, stka: 44 };

/* ---- a little OKLab kit ----
   Enough colour arithmetic to step the ramps, darken a wall and choose label
   ink — mixing in OKLab is what keeps the steps even to the eye. */
function chOK(hex){
  const n = parseInt(hex.slice(1), 16);
  const s = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => {
    v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * s[0] + 0.5363325363 * s[1] + 0.0514459929 * s[2]);
  const m = Math.cbrt(0.2119034982 * s[0] + 0.6806995451 * s[1] + 0.1073969566 * s[2]);
  const q = Math.cbrt(0.0883024619 * s[0] + 0.2817188376 * s[1] + 0.6299787005 * s[2]);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q];
}
function chHex(lab){
  const l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
  const m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
  const q = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2], 3);
  const lin = [ 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
               -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
               -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * q];
  return '#' + lin.map(c => {
    c = clamp(c, 0, 1);
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(c * 255).toString(16).padStart(2, '0');
  }).join('');
}
const chMix = (a, b, w) => chHex(chOK(a).map((v, i) => v * w + chOK(b)[i] * (1 - w)));
/* WCAG relative luminance and contrast, for the ramp floors and label ink */
function chLum(hex){
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => {
    v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const chContrast = (a, b) => {
  const x = chLum(a), y = chLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/* the book's colours, as hex whatever form the override left them in */
function chVar(name){
  const v = getComputedStyle(document.body).getPropertyValue('--' + name).trim();
  if(/^#[0-9a-f]{6}$/i.test(v)) return v;
  const m = v.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  if(m) return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
  return '#888888';
}

/* ---- the slice colours ----
   Fixed palettes pick their light or dark set by the paper the book is
   actually using; the two ramps are stepped fresh from the live theme, the
   pale end held off the paper (2:1) and the steps kept an even OKLab
   lightness apart — the same construction that was validated for the four
   stock themes. */
function chartColors(it, n){
  const p = CHART_PALS[it.pal] || CHART_PALS.crisp;
  const paper = chVar('paper');
  if(!p.ramp){
    const set = chOK(paper)[0] < 0.72 ? p.dark : p.light;
    return set.slice(0, Math.max(1, n));
  }
  const ink = chVar('ink');
  n = Math.max(1, n);
  if(p.ramp === 'ink'){
    let lo = 0.38;
    while(lo < 0.9 && chContrast(chMix(ink, paper, lo), paper) < 2) lo += 0.02;
    return Array.from({ length: n }, (_, i) => chMix(ink, paper, lo + (0.95 - lo) * (n < 2 ? 1 : i / (n - 1))));
  }
  const acc = chVar('accent');
  let pmax = 0.5;
  while(pmax > 0.06 && chContrast(chMix(paper, acc, pmax), paper) < 2) pmax -= 0.02;
  const La = chOK(acc)[0], sp = pmax * Math.abs(La - chOK(paper)[0]),
        si = 0.8 * Math.abs(chOK(ink)[0] - La), tk = sp / (sp + si || 1);
  return Array.from({ length: n }, (_, i) => {
    const t = n < 2 ? 0.5 : i / (n - 1);
    return t < tk ? chMix(paper, acc, pmax * (1 - t / tk))
                  : chMix(ink, acc, 0.8 * (t - tk) / (1 - tk || 1));
  });
}
const chartPalMax = pal => {
  const p = CHART_PALS[pal] || CHART_PALS.crisp;
  return Math.min(CHART_MAXROWS, p.ramp ? p.max : p.light.length);
};

/* ---- the numbers ---- */
const chRows = it => it.rows || (it.rows = []);
const chVal = r => { const v = +r.v; return Number.isFinite(v) && v > 0 ? v : 0; };
const chTotal = it => chRows(it).reduce((s, r) => s + chVal(r), 0);
function chFmtV(v){
  if(!Number.isFinite(v)) return '';
  const r = Math.round(v * 100) / 100;
  return String(Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r) : r);
}
const chFmtPct = f => {
  const p = f * 100;
  return (p > 0 && p < 1 ? p.toFixed(1) : String(Math.round(p))) + '%';
};
/* what a label may say, by the ％ toggle — null when the numbers are off */
function chContent(it, r, f){
  if(it.lbl === 'off') return null;
  return it.lbl === 'val' ? chFmtV(chVal(r)) : chFmtPct(f);
}
const chTrim = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const chR1 = v => Math.round(v * 10) / 10;
const nzn = (v, d) => Number.isFinite(+v) ? +v : d;
/* the label knobs, with their defaults for old charts */
const chLfs = it => clamp(nzn(it.lfs, 1), 0.75, 2);
const chLfont = it => CHART_FONTS[it.lfont] ? it.lfont : 'mono';
const chLmode = it => CHART_LMODES.includes(it.lmode) ? it.lmode : 'auto';
/* measuring by counting characters only works because the face is known */
const chTextW = (it, s, fs) => String(s).length * fs * CHART_FONTS[chLfont(it)].w;
const chLp = (it, key) => (it.lp && it.lp[key]) || null;

/* ---- pie geometry ----
   One 1000×1000 picture like everything else on the page. The wheel keeps a
   margin all round for the outboard labels to live in. */
const CH_R = 330, CH_CX = 500;
function chSlices(it){
  const total = chTotal(it);
  if(!total) return [];
  const a0 = (nzn(it.a0, -90)) * Math.PI / 180;
  let a = a0;
  const out = [];
  chRows(it).forEach((r, i) => {
    const v = chVal(r);
    if(!v) return;
    const f = v / total, a1 = a, a2 = a + f * Math.PI * 2;
    out.push({ r, i, f, a1, a2, mid: (a1 + a2) / 2 });
    a = a2;
  });
  return out;
}
const chPt = (cx, cy, r, a, ky) => [cx + r * Math.cos(a), cy + r * Math.sin(a) * (ky || 1)];
/* is this point inside this slice's own wedge (hole and rim respected)? */
function chInWedge(geo, s, x, y){
  const dx = x - geo.cx, dy = (y - geo.cy) / (geo.ky || 1);
  const r = Math.hypot(dx, dy);
  if(r > geo.R || r < (geo.r0 || 0)) return false;
  const T = Math.PI * 2;
  const rel = ((Math.atan2(dy, dx) - s.a1) % T + T) % T;
  return rel <= (s.a2 - s.a1);
}
/* an annular (or full) sector, squashable for the 3D face */
function chSlicePath(cx, cy, R, r0, a1, a2, ky){
  if(a2 - a1 >= Math.PI * 2 - 1e-4){          /* a lone slice is the whole ring */
    const o = 'M' + chR1(cx - R) + ' ' + chR1(cy) +
      'a' + R + ' ' + chR1(R * (ky || 1)) + ' 0 1 0 ' + (2 * R) + ' 0' +
      'a' + R + ' ' + chR1(R * (ky || 1)) + ' 0 1 0 ' + (-2 * R) + ' 0z';
    if(!r0) return o;
    return o + 'M' + chR1(cx - r0) + ' ' + chR1(cy) +
      'a' + r0 + ' ' + chR1(r0 * (ky || 1)) + ' 0 1 1 ' + (2 * r0) + ' 0' +
      'a' + r0 + ' ' + chR1(r0 * (ky || 1)) + ' 0 1 1 ' + (-2 * r0) + ' 0z';
  }
  const big = a2 - a1 > Math.PI ? 1 : 0, ry = R * (ky || 1), ry0 = r0 * (ky || 1);
  const [x1, y1] = chPt(cx, cy, R, a1, ky), [x2, y2] = chPt(cx, cy, R, a2, ky);
  let d = 'M' + chR1(x1) + ' ' + chR1(y1) +
    'A' + R + ' ' + chR1(ry) + ' 0 ' + big + ' 1 ' + chR1(x2) + ' ' + chR1(y2);
  if(r0){
    const [x3, y3] = chPt(cx, cy, r0, a2, ky), [x4, y4] = chPt(cx, cy, r0, a1, ky);
    d += 'L' + chR1(x3) + ' ' + chR1(y3) +
      'A' + r0 + ' ' + chR1(ry0) + ' 0 ' + big + ' 0 ' + chR1(x4) + ' ' + chR1(y4) + 'z';
  } else d += 'L' + chR1(cx) + ' ' + chR1(cy) + 'z';
  return d;
}
/* the hand of the sketch look — the same wobble every repaint, seeded by slice */
function chWobblePath(cx, cy, R, r0, a1, a2, seed){
  const wob = a => 4.6 * (Math.sin(a * 3.7 + seed * 2.1) + 0.6 * Math.sin(a * 7.1 + seed * 5.3));
  const arc = (rr, from, to) => {
    const n = Math.max(3, Math.ceil(Math.abs(to - from) / 0.07));
    let s = '';
    for(let k = 0; k <= n; k++){
      const a = from + (to - from) * k / n;
      const [x, y] = chPt(cx, cy, rr + wob(a), a);
      s += (k ? 'L' : '') + chR1(x) + ' ' + chR1(y);
    }
    return s;
  };
  const full = a2 - a1 >= Math.PI * 2 - 1e-4;
  let d = 'M' + arc(R, a1, a2) + (full ? 'z' : '');
  if(full) return r0 ? d + 'M' + arc(r0, a2, a1) + 'z' : d;
  if(r0) d += 'L' + arc(r0, a2, a1) + 'z';
  else d += 'L' + chR1(cx + wob(a2)) + ' ' + chR1(cy + wob(a2)) + 'z';
  return d;
}

/* ---- the labels ----
   Each label is worked out as: what it says, where it would sit on its own
   (that is `ax, ay` — the home a dragged label measures its offset from and
   comes back to on a double-click), and where it actually sits once any
   manual offset is added. A label outside its own slice gets a leader; one
   inside is inked by the slice's lightness. The looks share one emitter. */
function chInkCls(it, hex){
  if((it.look === 'sketch') && it.kind === 'pie') return 'chpl onwash';
  return 'chpl ' + (chLum(hex) > 0.32 ? 'onlight' : 'ondark');
}
/* fit: does this text sit comfortably inside the slice at the label radius? */
function chFitsIn(it, s, geo, txt, fs){
  const rIn = geo.r0 ? (geo.R + geo.r0) / 2 : geo.R * 0.63;
  const chord = 2 * rIn * Math.sin(Math.min(s.a2 - s.a1, Math.PI) / 2) * 0.86;
  const radial = geo.r0 ? (geo.R - geo.r0) * 0.9 : geo.R * 0.5;
  return (s.a2 - s.a1 > 0.2) &&
    chTextW(it, txt, fs) <= Math.max(chord, s.a2 - s.a1 > 1.9 ? radial * 2 : 0);
}
function chPieLabels(it, sl, colors, geo){
  const out = [];
  if(it.lbl === 'off' && chLmode(it) !== 'beside' && chLmode(it) !== 'stalk') return out;
  const lfs = chLfs(it), fsIn = CH_FS.in * lfs, fsOut = CH_FS.out * lfs;
  const mode = chLmode(it);
  const stalks = [], besides = [];
  for(const s of sl){
    if(s.f < 0.0035) continue;                 /* a hair of a slice: the legend has it */
    const name = chTrim(s.r.lab || '—', 14);
    const num = chContent(it, s.r, s.f);
    const named = num ? name + ' ' + num : name;
    const rIn = geo.r0 ? (geo.R + geo.r0) / 2 : geo.R * 0.63;
    const [ix, iy] = chPt(geo.cx, geo.cy, rIn, s.mid, geo.ky);
    const inkIn = chInkCls(it, colors[s.i % colors.length]);
    if(mode === 'in'){
      const pick = [named, num, name].find(t => t && chFitsIn(it, s, geo, t, fsIn));
      if(pick) out.push({ key: '' + s.i, s, txt: pick, ax: ix, ay: iy + fsIn * 0.36, fs: fsIn, cls: inkIn, anc: 'm' });
      continue;
    }
    if(mode === 'stalk'){ stalks.push({ s, txt: named }); continue; }
    if(mode === 'beside'){
      /* a sliver's name floating at the rim points at nothing — line it out */
      if(s.f < 0.03){ stalks.push({ s, txt: named }); continue; }
      besides.push({ s, txt: name, named });
      if(num && chFitsIn(it, s, geo, num, fsIn))
        out.push({ key: 's' + s.i, s, txt: num, ax: ix, ay: iy + fsIn * 0.36, fs: fsIn, cls: inkIn, anc: 'm' });
      continue;
    }
    /* auto: inside when the number fits, out on a stalk when it doesn't */
    if(num && chFitsIn(it, s, geo, num, fsIn))
      out.push({ key: '' + s.i, s, txt: num, ax: ix, ay: iy + fsIn * 0.36, fs: fsIn, cls: inkIn, anc: 'm' });
    else if(num || it.lbl === 'off') stalks.push({ s, txt: named });
  }
  /* beside: names just off the rim; any that would pile up go to the stalks */
  const bSide = { l: [], r: [] };
  for(const b of besides){
    const right = Math.cos(b.s.mid) >= 0;
    const [bx, by] = chPt(geo.cx, geo.cy, geo.R + 26, b.s.mid, geo.ky);
    (right ? bSide.r : bSide.l).push({ b, bx, by, right });
  }
  const taken = { l: [], r: [] };             /* lines each side already spoken for */
  for(const side of [bSide.l, bSide.r]){
    side.sort((p, q) => p.by - q.by);
    let last = -1e9;
    for(const p of side){
      const w = chTextW(it, p.b.txt, fsOut);
      const room = p.right ? 986 - (p.bx + 8) : (p.bx - 8) - 14;
      /* piled on a neighbour, or a name too long for the margin: line it out */
      if(p.by - last < fsOut * 1.12 || w > room){ stalks.push({ s: p.b.s, txt: p.b.named }); continue; }
      last = p.by;
      (p.right ? taken.r : taken.l).push(p.by);
      out.push({ key: '' + p.b.s.i, s: p.b.s, txt: p.b.txt,
        ax: chR1(p.bx + (p.right ? 8 : -8)), ay: chR1(p.by + fsOut * 0.34),
        fs: fsOut, cls: 'chml', anc: p.right ? 's' : 'e',
        lead: null });
    }
  }
  /* stalks: out radially, a corner, and the words at the picture's edge —
     sorted per side, kept a line apart, and steered off any name already
     sitting beside a slice on that side */
  const L = stalks.filter(o => Math.cos(o.s.mid) < 0), R = stalks.filter(o => Math.cos(o.s.mid) >= 0);
  for(const side of [L, R]){
    const gap = fsOut + 12;
    const occ = (side === R ? taken.r : taken.l).slice().sort((a, b) => a - b);
    const dodge = y => {
      for(const o of occ) if(Math.abs(y - o) < gap) y = o + gap;
      return y;
    };
    side.forEach(o => { o.y = geo.cy + Math.sin(o.s.mid) * (geo.R + 52) * (geo.ky || 1); });
    side.sort((a, b) => a.y - b.y);
    for(let i = 0; i < side.length; i++)
      side[i].y = dodge(Math.max(side[i].y, i ? side[i - 1].y + gap : -1e9));
    for(let i = side.length - 1; i >= 0; i--){
      const lim = 985 - (side.length - 1 - i) * gap;
      if(side[i].y > lim) side[i].y = lim;
      if(i && side[i].y - side[i - 1].y < gap) side[i - 1].y = side[i].y - gap;
    }
    for(const o of side){
      const right = side === R;
      const xt = right ? 968 : 32;
      out.push({ key: '' + o.s.i, s: o.s, txt: o.txt, ax: xt, ay: chR1(o.y + fsOut * 0.28),
        fs: fsOut, cls: 'chml', anc: right ? 'e' : 's', stalk: right ? 'r' : 'l' });
    }
  }
  /* manual offsets last: position, ink and leader all follow the drag */
  for(const o of out){
    const off = chLp(it, o.key);
    o.x = o.ax + (off ? off[0] : 0);
    o.y = o.ay + (off ? off[1] : 0);
    if(off){
      o.anc = 'm'; o.manual = 1;
      const home = chInWedge(geo, o.s, o.x, o.y - o.fs * 0.3);
      o.cls = home ? chInkCls(it, colors[o.s.i % colors.length]) : 'chml';
      o.leadTo = !home;
      delete o.stalk;
    } else if(o.stalk) o.leadTo = 'edge';
  }
  return out;
}
/* one leader line: out of the slice, a corner, and along to the words */
function chLeadD(it, geo, o){
  const [x1, y1] = chPt(geo.cx, geo.cy, geo.R + 8, o.s.mid, geo.ky);
  const w = chTextW(it, o.txt, o.fs);
  if(o.leadTo === 'edge'){                     /* an automatic stalk, at the picture's edge */
    const right = o.stalk === 'r';
    const xt = right ? 968 : 32;
    const end = xt + (right ? -1 : 1) * (w + 14);
    const xe = right ? Math.min(geo.cx + geo.R + 74, end) : Math.max(geo.cx - geo.R - 74, end);
    return 'M' + chR1(x1) + ' ' + chR1(y1) + 'L' + chR1(xe) + ' ' + chR1(o.y - o.fs * 0.28) +
      (Math.abs(end - xe) > 2 ? 'L' + chR1(end) + ' ' + chR1(o.y - o.fs * 0.28) : '');
  }
  /* a dragged label: approach whichever side of the words faces the pie */
  const ly = o.y - o.fs * 0.3;
  const left = o.x >= x1;
  const ex = o.x + (left ? -1 : 1) * (w / 2 + 12);
  const corner = ex + (left ? -1 : 1) * 20;
  return 'M' + chR1(x1) + ' ' + chR1(y1) + 'L' + chR1(corner) + ' ' + chR1(ly) + 'L' + chR1(ex) + ' ' + chR1(ly);
}
function chEmitLabels(it, geo, labels, live){
  let s = '';
  for(const o of labels)
    if(o.leadTo) s += '<path class="chlead" data-lk="' + esc(o.key) + '" d="' + chLeadD(it, geo, o) + '"/>';
  for(const o of labels){
    const anchor = o.anc === 'm' ? 'middle' : o.anc === 'e' ? 'end' : 'start';
    s += '<text class="' + o.cls + '" font-size="' + chR1(o.fs) + '" style="text-anchor:' + anchor + '"' +
      (live ? ' data-lk="' + esc(o.key) + '" data-ax="' + chR1(o.ax) + '" data-ay="' + chR1(o.ay) + '"' : '') +
      ' x="' + chR1(o.x) + '" y="' + chR1(o.y) + '">' + esc(o.txt) + '</text>';
  }
  return s;
}

/* ---- the pie itself, in its four looks ---- */
function chartPieSVG(it, colors, live){
  const look = CHART_LOOKS.includes(it.look) ? it.look : 'flat';
  const sl = chSlices(it);
  const geo = chartGeo(it);
  const depth = clamp(nzn(it.depth, 64), 30, 110);
  let s = '', top = '', walls = '';
  if(!sl.length)                                /* nothing to share out yet */
    return '<circle class="chempty" cx="' + geo.cx + '" cy="' + geo.cy + '" r="' + (CH_R - 60) + '"/>' +
      '<text class="chnil" x="' + geo.cx + '" y="' + (geo.cy + 12) + '">no data yet</text>';
  for(const o of sl){
    const c = colors[o.i % colors.length];
    const tip = '<title>' + esc((o.r.lab || '—') + ' — ' + chFmtV(chVal(o.r)) + ' · ' + chFmtPct(o.f)) + '</title>';
    if(look === 'sketch'){
      top += '<path class="chsk" d="' + chWobblePath(geo.cx, geo.cy, geo.R, geo.r0, o.a1, o.a2, o.i + 1) +
        '" fill="url(#chp' + esc(it.id) + '-' + (o.i % colors.length) + ')">' + tip + '</path>';
      continue;
    }
    if(look === 'tilt'){
      /* the rim you can see under the front half — where sin is positive —
         dropped by the depth. Angles are brought to [0, 2π) first, so any
         start angle finds its windows: (0, π) and its next turn (2π, 3π). */
      const T = Math.PI * 2;
      const n1 = ((o.a1 % T) + T) % T, n2 = n1 + (o.a2 - o.a1);
      const spans = [];
      for(const off of [0, T]){
        const b1 = Math.max(n1, off + 0.02), b2 = Math.min(n2, off + Math.PI - 0.02);
        if(b2 > b1) spans.push([b1 - off, b2 - off]);
      }
      for(const [b1, b2] of spans){
        if(b2 <= b1) continue;
        const big = b2 - b1 > Math.PI ? 1 : 0, ry = geo.R * geo.ky;
        const [x1, y1] = chPt(geo.cx, geo.cy, geo.R, b1, geo.ky), [x2, y2] = chPt(geo.cx, geo.cy, geo.R, b2, geo.ky);
        walls += '<path class="chwall" fill="' + chMix('#000000', c, 0.22) + '" d="M' + chR1(x1) + ' ' + chR1(y1) +
          'A' + geo.R + ' ' + chR1(ry) + ' 0 ' + big + ' 1 ' + chR1(x2) + ' ' + chR1(y2) +
          'v' + depth + 'A' + geo.R + ' ' + chR1(ry) + ' 0 ' + big + ' 0 ' + chR1(x1) + ' ' + chR1(y1 + depth) + 'z"/>';
      }
    }
    top += '<path class="chslice" fill="' + c + '" d="' +
      chSlicePath(geo.cx, geo.cy, geo.R, geo.r0, o.a1, o.a2, geo.ky) + '">' + tip + '</path>';
  }
  if(look === 'sketch'){
    let defs = '<defs>';
    for(let i = 0; i < Math.min(colors.length, chRows(it).length); i++)
      defs += '<pattern id="chp' + esc(it.id) + '-' + i + '" patternUnits="userSpaceOnUse" width="26" height="26"' +
        ' patternTransform="rotate(' + (i % 2 ? 135 : 45) + ' 0 0)">' +
        '<rect width="26" height="26" fill="' + colors[i] + '" opacity=".13"/>' +
        '<path d="M0 13h26" stroke="' + colors[i] + '" stroke-width="6.5"/></pattern>';
    s += defs + '</defs>';
  }
  s += walls + top;
  /* the donut's middle says what it all comes to — the one big number */
  if(look === 'donut' && geo.r0 > CH_R * 0.38)
    s += '<text class="chtot" font-size="' + chR1(104 * chLfs(it)) + '" x="' + geo.cx + '" y="' +
      chR1(geo.cy + 36 * chLfs(it)) + '">' + esc(chFmtV(chTotal(it))) + '</text>';
  s += chEmitLabels(it, geo, chPieLabels(it, sl, colors, geo), live);
  return s;
}

/* ---- the rest of the family, plainly for now ---- */
function chartBarsSVG(it, colors, H, live){
  const rows = chRows(it);
  if(!rows.length) return '<text class="chnil" x="500" y="90">no data yet</text>';
  const max = rows.reduce((m, r) => Math.max(m, chVal(r)), 0) || 1;
  const X0 = 262, XMAX = 850, BH = 46, ROW = 100;
  const lfs = chLfs(it), fsV = CH_FS.barv * lfs, fsL = CH_FS.barl * lfs;
  const inMode = chLmode(it) === 'in';
  let s = '', labels = [];
  rows.forEach((r, i) => {
    const y = 40 + i * ROW, v = chVal(r), w = Math.max(v / max * (XMAX - X0), v ? 3 : 0);
    /* one series, one colour — a rainbow of bars would say the rows differ in
       kind when they differ only in size; the pie is where identity is colour */
    const c = colors[0];
    const cap = w > 20
      ? 'M' + X0 + ' ' + y + 'h' + chR1(w - 9) + 'a9 9 0 0 1 9 9v' + (BH - 18) + 'a9 9 0 0 1 -9 9H' + X0 + 'z'
      : 'M' + X0 + ' ' + y + 'h' + chR1(w) + 'v' + BH + 'H' + X0 + 'z';
    s += '<path class="chslice" fill="' + c + '" d="' + cap + '">' +
      '<title>' + esc((r.lab || '—') + ' — ' + chFmtV(chVal(r))) + '</title></path>' +
      '<text class="chbl" font-size="' + chR1(fsL) + '" x="' + (X0 - 22) + '" y="' +
      chR1(y + BH / 2 + fsL * 0.32) + '">' + esc(chTrim(r.lab || '—', 10)) + '</text>';
    const num = chContent(it, r, chVal(r) / (chTotal(it) || 1));
    if(num != null){
      const fits = inMode && chTextW(it, num, fsV) < w - 36;
      const o = { key: '' + i, txt: num, fs: fsV,
        ax: fits ? chR1(X0 + w - 16) : chR1(X0 + w + 20), ay: chR1(y + BH / 2 + fsV * 0.32),
        cls: fits ? chInkCls(it, c) : 'chbv', anc: fits ? 'e' : 's' };
      const off = chLp(it, o.key);
      o.x = o.ax + (off ? off[0] : 0); o.y = o.ay + (off ? off[1] : 0);
      if(off){ o.anc = 'm'; if(!(o.x > X0 && o.x < X0 + w && o.y > y && o.y < y + BH)) o.cls = 'chbv'; }
      labels.push(o);
    }
  });
  s += '<path class="chaxis" d="M' + X0 + ' 24V' + (H - 24) + '"/>';
  for(const o of labels){
    const anchor = o.anc === 'm' ? 'middle' : o.anc === 'e' ? 'end' : 'start';
    s += '<text class="' + o.cls + '" font-size="' + chR1(o.fs) + '" style="text-anchor:' + anchor + '"' +
      (live ? ' data-lk="' + esc(o.key) + '" data-ax="' + o.ax + '" data-ay="' + o.ay + '"' : '') +
      ' x="' + chR1(o.x) + '" y="' + chR1(o.y) + '">' + esc(o.txt) + '</text>';
  }
  return s;
}
function chartStackSVG(it, colors, live){
  const sl = chSlices(it);
  if(!sl.length) return '<text class="chnil" x="500" y="86">no data yet</text>';
  const lfs = chLfs(it), above = chLmode(it) === 'stalk' || chLmode(it) === 'beside';
  const X0 = 30, W = 940, Y = above ? 122 : 36, BH = 78;
  const fsIn = CH_FS.stk * lfs, fsA = CH_FS.stka * lfs;
  let s = '', x = X0;
  const labels = [];
  for(const o of sl){
    const w = o.f * W, c = colors[o.i % colors.length];
    s += '<path class="chslice" d="M' + chR1(x) + ' ' + Y + 'h' + chR1(w) + 'v' + BH + 'h' + chR1(-w) + 'z" fill="' + c + '">' +
      '<title>' + esc((o.r.lab || '—') + ' — ' + chFmtV(chVal(o.r)) + ' · ' + chFmtPct(o.f)) + '</title></path>';
    const num = chContent(it, o.r, o.f);
    if(above){
      const name = chTrim(o.r.lab || '—', 10);
      labels.push({ key: '' + o.i, txt: num ? name + ' ' + num : name, fs: fsA,
        cx: x + w / 2, cls: 'chml', seg: [x, x + w] });
    } else if(num != null && chTextW(it, num, fsIn) < w - 26){
      const lo = { key: '' + o.i, txt: num, fs: fsIn, ax: chR1(x + w / 2), ay: chR1(Y + BH / 2 + fsIn * 0.34),
        cls: chInkCls(it, c), anc: 'm', seg: [x, x + w, c] };
      labels.push(lo);
    }
    x += w;
  }
  /* labels above the bar step between two lines when they would touch,
     each with a little stem down to its own segment */
  if(above){
    let ends = [-1e9, -1e9];
    for(const o of labels){
      const w = chTextW(it, o.txt, o.fs);
      let row = o.cx - w / 2 - 14 > ends[0] ? 0 : 1;
      if(row === 1 && o.cx - w / 2 - 14 <= ends[1]) row = 0;   /* both busy: take the nearer and shove */
      o.ay = row ? 100 : 52;
      o.ax = chR1(Math.max(X0 + w / 2, Math.min(X0 + W - w / 2, o.cx)));
      o.anc = 'm';
      ends[row] = o.cx + w / 2;
    }
  }
  for(const o of labels){
    const off = chLp(it, o.key);
    o.x = (o.ax || 0) + (off ? off[0] : 0); o.y = (o.ay || 0) + (off ? off[1] : 0);
    if(off && o.seg && o.seg.length > 2)
      o.cls = (o.x > o.seg[0] && o.x < o.seg[1] && o.y > Y && o.y < Y + BH) ? chInkCls(it, o.seg[2]) : 'chml';
    if(above) s += '<path class="chlead" data-lk="' + esc(o.key) + '" d="M' + chR1(o.cx) + ' ' + Y +
      'L' + chR1(o.x) + ' ' + chR1(o.y + 10) + '"/>';
    s += '<text class="' + o.cls + '" font-size="' + chR1(o.fs) + '" style="text-anchor:middle"' +
      (live ? ' data-lk="' + esc(o.key) + '" data-ax="' + chR1(o.ax) + '" data-ay="' + chR1(o.ay) + '"' : '') +
      ' x="' + chR1(o.x) + '" y="' + chR1(o.y) + '">' + esc(o.txt) + '</text>';
  }
  return s;
}

/* ---- the picture plus the legend that edits it ---- */
function chartViewH(it){
  return it.kind === 'bars' ? 80 + chRows(it).length * 100
       : it.kind === 'stack' ? (chLmode(it) === 'stalk' || chLmode(it) === 'beside' ? 236 : 150) : 1000;
}
function chartSVG(it, live){
  const n = Math.max(1, chRows(it).length);
  const colors = chartColors(it, n);
  const H = chartViewH(it);
  const body = it.kind === 'bars' ? chartBarsSVG(it, colors, H, live)
             : it.kind === 'stack' ? chartStackSVG(it, colors, live)
             : chartPieSVG(it, colors, live);
  const font = chLfont(it);
  return '<svg class="chsvg' + (font !== 'mono' ? ' chf-' + font : '') +
    '" viewBox="0 0 1000 ' + H + '" style="aspect-ratio:1000/' + H + '">' + body + '</svg>';
}
function chartLegend(it, live){
  const colors = chartColors(it, Math.max(1, chRows(it).length));
  const total = chTotal(it);
  let s = '';
  chRows(it).forEach((r, i) => {
    const v = chVal(r), pct = total ? chFmtPct(v / total) : '—';
    s += '<div class="chrow' + (v ? '' : ' nil') + '" data-i="' + i + '">' +
      '<i class="chsw" style="background:' + colors[i % colors.length] + '"></i>' +
      (live
        ? '<input class="chlab" value="' + esc(r.lab || '') + '" placeholder="name" spellcheck="false">' +
          '<input class="chval" value="' + esc(r.src != null ? r.src : chFmtV(+r.v || 0)) + '" inputmode="decimal">'
        : '<span class="chlab">' + esc(r.lab || '—') + '</span><span class="chval">' + esc(chFmtV(v)) + '</span>') +
      '<b class="chpct">' + pct + '</b>' +
      (live ? '<button class="chdel" title="Take this row off">✕</button>' : '') + '</div>';
  });
  if(live && chRows(it).length < chartPalMax(it.pal))
    s += '<button class="chadd">+ ' + (it.kind === 'pie' ? 'slice' : it.kind === 'bars' ? 'bar' : 'part') + '</button>';
  return s;
}
const chartFigure = (it, live) =>
  '<figure class="body chfig"><div class="chbox">' + chartSVG(it, live) + '</div>' +
  '<div class="chleg">' + chartLegend(it, live) + '</div><figcaption></figcaption></figure>';

function paintChart(el, it, legendToo){
  const box = el.querySelector('.chbox');
  if(box) box.innerHTML = chartSVG(it, true);
  if(legendToo !== false){
    const leg = el.querySelector('.chleg');
    if(leg){ leg.innerHTML = chartLegend(it, true); wireChartLegend(el, it, elPage(el)); }
  }
}
function elPage(el){
  const f = typeof findItem === 'function' && findItem(el.dataset.id);
  return (f && f.page) || sheet();
}
/* keep the numbers honest while typing, without rebuilding under the caret */
function chartSyncPcts(el, it){
  const total = chTotal(it);
  el.querySelectorAll('.chrow').forEach(row => {
    const r = chRows(it)[+row.dataset.i];
    if(!r) return;
    row.classList.toggle('nil', !chVal(r));
    row.querySelector('.chpct').textContent = total && chVal(r) ? chFmtPct(chVal(r) / total) : '—';
  });
}
function wireChartLegend(el, it, page){
  const leg = el.querySelector('.chleg');
  if(!leg) return;
  leg.querySelectorAll('.chrow').forEach(row => {
    const i = +row.dataset.i, r = chRows(it)[i];
    if(!r) return;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('pointerdown', e => e.stopPropagation());
      inp.addEventListener('keydown', e => {
        e.stopPropagation();
        if(e.key === 'Enter'){
          e.preventDefault();
          /* enter on the last value asks for another row, like the checklist */
          const last = i === chRows(it).length - 1 && inp.classList.contains('chval');
          if(last && chRows(it).length < chartPalMax(it.pal)){
            chRows(it).push({ lab: '', v: 0 });
            paintChart(el, it); queueSave(page.id);
            const nx = el.querySelector('.chrow[data-i="' + (i + 1) + '"] .chlab');
            if(nx) nx.focus();
          } else inp.blur();
        }
        if(e.key === 'Escape'){ e.preventDefault(); inp.blur(); }
      });
      inp.addEventListener('input', () => {
        if(inp.classList.contains('chlab')) r.lab = inp.value;
        else {
          r.src = inp.value;
          const v = parseFloat(String(inp.value).replace(',', '.'));
          r.v = Number.isFinite(v) && v > 0 ? v : 0;
          inp.classList.toggle('bad', inp.value.trim() !== '' && !(Number.isFinite(v) && v >= 0));
        }
        paintChart(el, it, false);            /* the picture follows the keys */
        chartSyncPcts(el, it);
        queueSave(page.id);
      });
      inp.addEventListener('blur', () => {
        if(inp.classList.contains('chval') && !inp.classList.contains('bad')){
          delete r.src; inp.value = chFmtV(+r.v || 0);
        }
      });
    });
    const del = row.querySelector('.chdel');
    if(del) del.addEventListener('click', e => {
      e.stopPropagation();
      chRows(it).splice(i, 1);
      if(it.lp) it.lp = {};                    /* rows renumber — old offsets would sit on strangers */
      paintChart(el, it); queueSave(page.id); SND.pluck();
    });
    row.addEventListener('pointerdown', e => { if(e.target.closest('input,button')) e.stopPropagation(); });
  });
  const add = leg.querySelector('.chadd');
  if(add){
    add.addEventListener('pointerdown', e => e.stopPropagation());
    add.addEventListener('click', e => {
      e.stopPropagation();
      chRows(it).push({ lab: '', v: 0 });
      paintChart(el, it); queueSave(page.id); SND.plop();
      const rows = el.querySelectorAll('.chrow');
      if(rows.length) rows[rows.length - 1].querySelector('.chlab').focus();
    });
  }
}

/* ---- dragging the labels ----
   One listener on the picture's box (it survives every repaint), catching
   any text that carries a key. The drag itself only rewrites attributes —
   a full repaint would replace the node mid-capture — and the real paint
   happens on release. A label knows the spot it would occupy on its own
   (data-ax/ay), so what is stored is just its offset from home, and a
   double-click deletes it. */
function chartGeo(it){
  /* names living beside the wheel need a margin to live in */
  const R = chLmode(it) === 'beside' ? 280 : CH_R;
  const geo = { cx: CH_CX, cy: 500, R, r0: 0, ky: 1 };
  if(it.look === 'donut') geo.r0 = R * clamp(nzn(it.hole, 52), 30, 76) / 100;
  if(it.look === 'tilt'){ geo.ky = 0.62; geo.cy = 448; }
  return geo;
}
function wireChartDrag(el, it, page){
  const box = el.querySelector('.chbox');
  if(!box) return;
  const toSVG = (svg, ev) => {
    const M = svg.getScreenCTM();
    if(!M) return null;
    return new DOMPoint(ev.clientX, ev.clientY).matrixTransform(M.inverse());
  };
  box.addEventListener('pointerdown', e => {
    const t = e.target.closest('text[data-lk]');
    if(!t || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    select(it.id);
    const svg = t.ownerSVGElement, pid = e.pointerId, key = t.dataset.lk;
    const start = toSVG(svg, e);
    if(!start) return;
    try{ t.setPointerCapture(pid); }catch(err){}
    const from = (chLp(it, key) || [0, 0]).slice();
    const ax = +t.dataset.ax, ay = +t.dataset.ay;
    const sl = it.kind === 'pie' ? chSlices(it) : null;
    const slice = sl && sl.find(o => String(o.i) === key.replace(/^s/, ''));
    const geo = chartGeo(it);
    const colors = chartColors(it, Math.max(1, chRows(it).length));
    let lead = box.querySelector('path.chlead[data-lk="' + key + '"]');
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      const p = toSVG(svg, ev);
      if(!p) return;
      const dx = from[0] + p.x - start.x, dy = from[1] + p.y - start.y;
      (it.lp || (it.lp = {}))[key] = [Math.round(dx), Math.round(dy)];
      const x = ax + dx, y = ay + dy;
      t.setAttribute('x', chR1(x)); t.setAttribute('y', chR1(y));
      t.style.textAnchor = 'middle';
      if(slice){
        /* crossing the rim swaps the ink and grows (or sheds) the leader */
        const home = chInWedge(geo, slice, x, y - (+t.getAttribute('font-size') || 47) * 0.3);
        t.setAttribute('class', home ? chInkCls(it, colors[slice.i % colors.length]) : 'chml');
        if(!home){
          if(!lead){
            lead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lead.setAttribute('class', 'chlead');
            lead.dataset.lk = key;
            svg.insertBefore(lead, t);
          }
          const w = t.getComputedTextLength ? t.getComputedTextLength() : 100;
          const o = { s: slice, txt: t.textContent, fs: +t.getAttribute('font-size') || 47, x, y, leadTo: 1 };
          /* live width beats the estimate while we have the node in hand */
          const [x1, y1] = chPt(geo.cx, geo.cy, geo.R + 8, slice.mid, geo.ky);
          const left = x >= x1;
          const ex2 = x + (left ? -1 : 1) * (w / 2 + 12), corner = ex2 + (left ? -1 : 1) * 20;
          lead.setAttribute('d', 'M' + chR1(x1) + ' ' + chR1(y1) + 'L' + chR1(corner) + ' ' +
            chR1(y - o.fs * 0.3) + 'L' + chR1(ex2) + ' ' + chR1(y - o.fs * 0.3));
          lead.style.display = '';
        } else if(lead) lead.style.display = 'none';
      }
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      t.removeEventListener('pointermove', mv);
      t.removeEventListener('pointerup', up);
      t.removeEventListener('pointercancel', up);
      queueSave(page.id);
      paintChart(el, it, false);               /* settle everything consistently */
    };
    t.addEventListener('pointermove', mv);
    t.addEventListener('pointerup', up);
    t.addEventListener('pointercancel', up);
  });
  box.addEventListener('dblclick', e => {
    const t = e.target.closest('text[data-lk]');
    if(!t) return;
    e.stopPropagation(); e.preventDefault();
    if(it.lp && it.lp[t.dataset.lk]){
      delete it.lp[t.dataset.lk];
      paintChart(el, it, false); queueSave(page.id); SND.pop();
    }
  });
}

/* ---- its measurements, on the ✎ panel ---- */
function openChartProps(btn, it, el, page){
  const rows = [];
  if(it.kind === 'pie'){
    /* the dial reads 0° east and turns anticlockwise; the picture's angles
       run clockwise because y points down — so the two are negatives */
    rows.push({ t: 'angle', label: 'Start', min: 15,
      get: () => ((-nzn(it.a0, -90)) % 360 + 360) % 360 || 360,
      set: v => { it.a0 = -v; } });
    if(it.look === 'donut') rows.push({ t: 'range', label: 'Hole', min: 30, max: 76, step: 1,
      get: () => Math.round(clamp(nzn(it.hole, 52), 30, 76)),
      set: v => { it.hole = v; }, fmt: v => v + '%' });
    if(it.look === 'tilt') rows.push({ t: 'range', label: 'Depth', min: 30, max: 110, step: 1,
      get: () => Math.round(clamp(nzn(it.depth, 64), 30, 110)),
      set: v => { it.depth = v; }, fmt: v => v });
  }
  rows.push({ t: 'range', label: 'Labels', min: 75, max: 200, step: 5,
    get: () => Math.round(chLfs(it) * 100),
    set: v => { it.lfs = v / 100; }, fmt: v => v + '%' });
  rows.push({ t: 'btn', label: '',
    text: () => 'Labels in ' + CHART_FONTS[chLfont(it)].name + ' — next face',
    hint: 'Mono, serif or handwriting',
    act(){
      const seq = Object.keys(CHART_FONTS);
      it.lfont = seq[(seq.indexOf(chLfont(it)) + 1) % seq.length];
      paintChart(el, it, false); queueSave(page.id); SND.pop();
    } });
  rows.push({ t: 'btn', label: '', text: 'Labels back to automatic',
    hint: 'Forget every label you have dragged',
    act(){ it.lp = {}; paintChart(el, it, false); queueSave(page.id); SND.pop(); } });
  rows.push({ t: 'btn', label: '', text: 'Sort by size', hint: 'Biggest first, from the top',
    act(){
      chRows(it).sort((a, b) => chVal(b) - chVal(a));
      if(it.lp) it.lp = {};                    /* rows renumber under the sort */
      paintChart(el, it); queueSave(page.id); SND.pop();
    } });
  openProps(btn, {
    title: CHART_KIND_NAMES[it.kind] || 'Chart',
    rows,
    onchange(){ paintChart(el, it, false); },
    onsave(){ queueSave(page.id); },
    onreset(){
      it.a0 = -90; it.hole = 52; it.depth = 64;
      it.lfs = 1; it.lfont = 'mono'; it.lp = {}; it.lmode = 'auto';
      paintChart(el, it, false); queueSave(page.id);
    }
  });
}

/* the palette follows the theme, so the charts must hear the theme change —
   core calls no one, but every change lands as a style on <body> */
(function(){
  let raf = 0;
  const kick = () => {
    if(raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      document.querySelectorAll('#pageHost .item[data-type="chart"]').forEach(el => {
        const f = typeof findItem === 'function' && findItem(el.dataset.id);
        if(f) paintChart(el, f.it);
      });
    });
  };
  addEventListener('DOMContentLoaded', () =>
    new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ['style', 'data-theme'] }));
})();

/* ---- the item ---- */
defineItem('chart', {
  add: {
    pie:   base => ({ ...base, type: 'chart', kind: 'pie', look: 'flat', w: 34, pal: 'crisp', lbl: 'pct',
                      a0: -90, cap: '', rows: [{ lab: 'Code', v: 12 }, { lab: 'Art', v: 8 }, { lab: 'Music', v: 5 }] }),
    bars:  base => ({ ...base, type: 'chart', kind: 'bars', w: 34, pal: 'crisp', lbl: 'val', cap: '',
                      rows: [{ lab: 'Mon', v: 6 }, { lab: 'Tue', v: 9 }, { lab: 'Wed', v: 4 }] }),
    stack: base => ({ ...base, type: 'chart', kind: 'stack', w: 40, pal: 'crisp', lbl: 'pct', cap: '',
                      rows: [{ lab: 'Done', v: 14 }, { lab: 'Doing', v: 5 }, { lab: 'Next', v: 8 }] })
  },
  sound: 'plop',
  html: (it, c) => chartFigure(it, c.live),
  after(it, el, page){
    const first = el && el.querySelector('.chlab');
    if(first){ first.focus(); first.select(); }
  },
  tools(mk, it, el, page){
    mk('✎', 'Its measurements — the start, the hole, the depth, the labels', b => openChartProps(b, it, el, page));
    if(it.kind === 'pie')
      mk('◈', 'Its look — flat, donut, 3D, sketchbook', b => {
        const i = (CHART_LOOKS.indexOf(it.look) + 1) % CHART_LOOKS.length;
        it.look = CHART_LOOKS[i];
        paintChart(el, it, false); queueSave(page.id); SND.pop();
        b.title = 'Its look — flat, donut, 3D, sketchbook — now: ' + CHART_LOOK_NAMES[it.look];
      });
    mk('◑', 'The next colour palette', b => {
      const seq = CHART_PAL_SEQ.filter(p => chartPalMax(p) >= chRows(it).length);
      const i = (seq.indexOf(it.pal) + 1) % seq.length;
      it.pal = seq[i] || 'crisp';
      paintChart(el, it); queueSave(page.id); SND.pop();
      b.title = 'The next colour palette — now: ' + CHART_PALS[it.pal].name;
    });
    mk('⌖', 'Where the labels sit — automatic, beside the slices, on stalks, inside', b => {
      it.lmode = CHART_LMODES[(CHART_LMODES.indexOf(chLmode(it)) + 1) % CHART_LMODES.length];
      paintChart(el, it, false); queueSave(page.id); SND.pop();
      b.title = 'Where the labels sit — now: ' + CHART_LMODE_NAMES[chLmode(it)];
    });
    mk('％', 'What the labels say — share, value, or nothing', b => {
      it.lbl = CHART_LBLS[(CHART_LBLS.indexOf(it.lbl) + 1) % CHART_LBLS.length];
      paintChart(el, it, false); queueSave(page.id); SND.pop();
      b.title = 'What the labels say — now: ' + (it.lbl === 'pct' ? 'share' : it.lbl === 'val' ? 'value' : 'nothing');
    });
    mk('◇', 'The next kind of chart — pie, bars, stacked', b => {
      it.kind = CHART_KINDS[(CHART_KINDS.indexOf(it.kind) + 1) % CHART_KINDS.length];
      if(it.lp) it.lp = {};                    /* another picture, other homes */
      closeProps();
      paintChart(el, it); queueSave(page.id); SND.pop();
      b.title = 'The next kind of chart — now: ' + CHART_KIND_NAMES[it.kind];
    });
  },
  wire(el, it, page){
    wireChartLegend(el, it, page);
    wireChartDrag(el, it, page);
  },
  css: `
/* ---------- charts ----------
   The picture is quiet: hairline chrome, the data the only loud thing on it.
   Slices are parted by a seam of the paper itself, and every text on the
   picture is ink or paper by measured luminance, never the series colour.
   Label font sizes ride the elements as attributes (the ✎ slider scales
   them), so no font-size may appear in these rules — a stylesheet would
   silently beat the attribute, the same trap the plot hit with fills. */
.chfig{display:block}
.chbox{position:relative}
svg.chsvg{display:block;width:100%;height:auto;background:none;overflow:visible}
.chsvg path.chslice{stroke:var(--paper);stroke-width:9;stroke-linejoin:round}
.chsvg path.chslice:hover{filter:brightness(1.07)}
.chsvg path.chwall{stroke:var(--paper);stroke-width:6;stroke-linejoin:round;opacity:.92}
.chsvg path.chsk{stroke:var(--ink);stroke-width:5;stroke-linejoin:round;stroke-linecap:round;opacity:.92}
.chsvg .chempty{fill:none;stroke:var(--line);stroke-width:3}
.chsvg text{font-family:var(--mono)}
svg.chsvg.chf-body text{font-family:var(--body);font-weight:600}
svg.chsvg.chf-hand text{font-family:var(--hand);font-weight:600}
.chsvg .chnil{fill:var(--soft);font-size:44px;text-anchor:middle;letter-spacing:.06em}
.chsvg .chpl{text-anchor:middle}
.chsvg .chpl.ondark{fill:#ffffff}
.chsvg .chpl.onlight{fill:#20211c}
.chsvg .chpl.onwash{fill:var(--ink);paint-order:stroke;stroke:var(--paper);stroke-width:9;stroke-linejoin:round}
.chsvg .chml{fill:var(--ink);paint-order:stroke;stroke:var(--paper);stroke-width:7;stroke-linejoin:round}
.chsvg .chtot{fill:var(--ink);text-anchor:middle;letter-spacing:-.02em}
.chsvg path.chlead{fill:none;stroke:var(--soft);stroke-width:2.6;opacity:.85}
.chsvg .chbl{fill:var(--ink);text-anchor:end;opacity:.85}
.chsvg .chbv{fill:var(--soft);font-variant-numeric:tabular-nums}
.chsvg path.chaxis{fill:none;stroke:var(--line);stroke-width:2.5}
.chsvg text[data-lk]{cursor:grab}
.chsvg text[data-lk]:active{cursor:grabbing}
/* the legend is the editor: plain text until you reach into it */
.chleg{display:flex;flex-direction:column;gap:calc(var(--scale)*2px);
  margin-top:calc(var(--scale)*6px);font-family:var(--mono)}
.chleg:empty{display:none}
.chrow{display:flex;align-items:center;gap:calc(var(--scale)*7px);border-radius:calc(var(--scale)*4px)}
.chrow .chlab{flex:1}
.chrow.nil .chsw{opacity:.35}
.chrow.nil .chlab,.chrow.nil .chval{opacity:.55}
.chsw{width:calc(var(--scale)*10px);height:calc(var(--scale)*10px);border-radius:calc(var(--scale)*3px);display:inline-block;flex:none}
.chleg .chlab,.chleg .chval{border:0;outline:0;background:none;color:var(--ink);font-family:var(--mono);
  font-size:calc(var(--scale)*11px);padding:calc(var(--scale)*2px) calc(var(--scale)*3px);
  border-radius:calc(var(--scale)*3px);min-width:0}
.chleg .chval{width:calc(var(--scale)*54px);text-align:right;font-variant-numeric:tabular-nums}
.chleg input.chlab:hover,.chleg input.chval:hover{background:color-mix(in srgb,var(--ink) 7%,transparent)}
.chleg input.chlab:focus,.chleg input.chval:focus{background:color-mix(in srgb,var(--ink) 9%,transparent);
  box-shadow:inset 0 0 0 1.5px var(--accent2)}
.chleg input.chval.bad{color:var(--accent);box-shadow:inset 0 0 0 1.5px var(--accent)}
.chleg .chpct{font-size:calc(var(--scale)*10.5px);color:var(--soft);font-weight:400;text-align:right;
  font-variant-numeric:tabular-nums;min-width:calc(var(--scale)*30px)}
.chleg .chdel{visibility:hidden;padding:0 calc(var(--scale)*3px);color:var(--soft);font-size:calc(var(--scale)*10px);border-radius:3px}
.item.sel .chrow:hover .chdel{visibility:visible}
.chleg .chdel:hover{color:var(--accent)}
.chleg .chadd{visibility:hidden;grid-column:1/-1;justify-self:start;color:var(--soft);
  font-family:var(--mono);font-size:calc(var(--scale)*9.5px);letter-spacing:.08em;
  padding:calc(var(--scale)*2px) calc(var(--scale)*4px);border-radius:calc(var(--scale)*4px);align-self:flex-start}
.item.sel .chleg .chadd{visibility:visible}
.chleg .chadd:hover{color:var(--ink);background:color-mix(in srgb,var(--ink) 7%,transparent)}
`
});

defineTool({ kind: 'pie',   cat: 'math', label: 'Pie chart', icon: 'pie', order: 60,
             hint: 'Named shares as a wheel — flat, donut, 3D or sketchbook; the legend is the editor' });
defineTool({ kind: 'bars',  cat: 'math', label: 'Bar chart', icon: 'chbars', order: 64,
             hint: 'Named values as bars — plain for now, it will grow' });
defineTool({ kind: 'stack', cat: 'math', label: 'Stacked bar', icon: 'chstack', order: 66,
             hint: 'Shares of a whole in one bar — plain for now, it will grow' });
defineIcon('pie', '<circle cx="12" cy="12" r="8.2"/><path d="M12 12V3.8M12 12l5.8 5.8"/>');
defineIcon('chbars', '<path d="M5 5.5h10M5 12h14M5 18.5h7"/>');
defineIcon('chstack', '<rect x="3.5" y="9" width="17" height="6" rx="1.6"/><path d="M11 9v6M16.2 9v6"/>');
