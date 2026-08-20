/* Open Note — lib/pptx.js
   reading a slide deck off the disk: .pptx, drawn as SVG */

/* ================= slide decks =================
   Owes nothing to the rest of the app: hand it a File and it hands back a deck
   whose slides draw themselves.

     const D = await pptxRead(file);
     D.w, D.h            // the slide, in points (a 16:9 one is 960 × 540)
     await D.slide(3)    // → { svg, title, notes } — the fourth slide, drawn
     D.free()            // let go of the pictures

   No library is vendored in for this either. A .pptx is a zip of XML — the same
   zip lib/sheet.js already opens — and the drawing inside it is DrawingML: a
   tree of shapes with a geometry, a fill, a line and a body of text, all of it
   measured in EMUs (914400 to the inch, 12700 to the point). So the slides are
   drawn as **SVG in points**, which means one drawing serves every size at
   once: the card on the page, the thumbnail in the grid, the slide filling the
   screen, and the PNG you pull out of it. Nothing is ever a blurred bitmap.

   Three things are worth knowing about what comes out:

   - **A slide inherits most of what it looks like.** A title's font, size and
     colour are usually written down nowhere near the slide: the shape points at
     a placeholder in its layout, which points at one in the master, which points
     at the master's own text styles, which point at the theme. Every property
     here is resolved down that chain, which is why text lands where PowerPoint
     puts it rather than in a pile at the top left.
   - **The text is laid out here, not by the browser.** Lines are measured with
     a canvas and broken by hand, so the SVG holds real `<text>` at real
     positions — it scales, prints, and rasterises without a foreignObject and
     without a layout engine in the loop.
   - **What it cannot draw it leaves out rather than faking.** A chart is drawn
     from the numbers cached inside it; an .emf pasted out of Word is a vector
     format no browser reads, and gets a quiet frame instead of a broken icon. */

const PPTX_EMU = 12700;                    // EMUs to the point
const PPTX_RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PPTX_MAXMB = 260;                    // bigger than this and it is not a slide deck any more

const pptxExt = f => ((String((f && f.name) || '').match(/\.([a-z0-9]{1,5})$/i) || ['', ''])[1] || '').toLowerCase();
/* what we would do with a dropped file, without opening it */
function pptxKind(f){
  const e = pptxExt(f);
  if(e === 'pptx' || e === 'pptm') return 'pptx';
  if(e === 'ppt') return 'ppt';            // the old binary one — recognised only to say so
  if(e === 'odp') return 'odp';            // …and so is Impress's
  return null;
}

/* ---------- XML, by local name ----------
   Every part of a deck is namespaced six ways (a:, p:, c:, dsp:…) and the same
   element means the same thing whichever prefix it wears — a SmartArt drawing is
   literally a slide's shape tree under a different namespace. So nothing here
   ever asks for a prefix. */
function pxK(n, name){
  if(n) for(const c of n.children) if(c.localName === name) return c;
  return null;
}
function pxKs(n, name){
  const out = [];
  if(n) for(const c of n.children) if(c.localName === name) out.push(c);
  return out;
}
function pxIn(n, path){                    // 'spPr/xfrm/off', by local name
  let cur = n;
  for(const p of path.split('/')){ cur = pxK(cur, p); if(!cur) return null; }
  return cur;
}
/* the first descendant with that name, however deep */
function pxDeep(n, name){
  if(!n) return null;
  for(const c of n.getElementsByTagName('*')) if(c.localName === name) return c;
  return null;
}
const pxA = (n, a) => (n && n.getAttribute(a)) || null;
function pxN(n, a, d){
  const v = n && n.getAttribute(a);
  if(v == null || v === '') return d;
  const x = parseFloat(v);
  return isFinite(x) ? x : d;
}
const pxBool = (n, a, d) => {
  const v = n && n.getAttribute(a);
  return v == null || v === '' ? d : (v === '1' || v === 'true');
};
const pxRel = (n, a) => n ? (n.getAttributeNS(PPTX_RNS, a || 'embed') || n.getAttribute('r:' + (a || 'embed'))) : null;
const pxEmu = v => v / PPTX_EMU;           // EMUs → points
const pxDeg = v => v / 60000;              // 60000ths of a degree → degrees
const rd = v => Math.round(v * 100) / 100; // two places is plenty at slide sizes

/* ---------- colour ----------
   A colour in DrawingML is a base and a pile of modifiers: "accent1, lightened
   to 40%, at 60% opacity". The base may be a hex, a name, a system colour, or —
   most often — a slot in the theme, reached through the master's colour map. */
const PX_LIN = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const PX_SRGB = v => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const pxHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function pxRGB(hex){
  const s = String(hex || '').replace('#', '');
  if(s.length !== 6) return [0, 0, 0];
  return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
}
function pxToHSL(c){
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if(!d) return [0, 0, l];
  const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function pxToRGB(h, s, l){
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return t.map(v => (v + m) * 255);
}
/* the named colours are the browser's own list, so it is asked rather than
   carried — `dkBlue` and friends are the handful it does not know */
const PX_NAMED = { dkblue:'#00008b', dkcyan:'#008b8b', dkgray:'#a9a9a9', dkgreen:'#006400',
  dkgrey:'#a9a9a9', dkmagenta:'#8b008b', dkred:'#8b0000', dkyellow:'#808000',
  ltblue:'#add8e6', ltcyan:'#e0ffff', ltgray:'#d3d3d3', ltgreen:'#90ee90', ltgrey:'#d3d3d3',
  ltmagenta:'#ff00ff', ltred:'#ff0000', ltyellow:'#ffffe0', medgray:'#808080' };
const PX_NAMECACHE = {};
function pxNamed(name){
  const k = String(name || '').toLowerCase();
  if(PX_NAMED[k]) return PX_NAMED[k];
  if(PX_NAMECACHE[k]) return PX_NAMECACHE[k];
  const c = pxCanvas();
  c.fillStyle = '#000';
  c.fillStyle = k;                          // the browser knows every X11 name there is
  const got = c.fillStyle;
  return (PX_NAMECACHE[k] = /^#|^rgb/.test(got) ? got : '#000000');
}
const PX_SYS = { windowText:'#000000', window:'#ffffff', highlight:'#0078d7',
  highlightText:'#ffffff', btnFace:'#f0f0f0', btnText:'#000000', grayText:'#6d6d6d' };

/* one colour element — <a:srgbClr>, <a:schemeClr>, … — with its modifiers */
function pxColor(el, ctx, ph){
  if(!el) return null;
  let rgb = [0, 0, 0], a = 1;
  const val = pxA(el, 'val');
  switch(el.localName){
    case 'srgbClr':   rgb = pxRGB(val); break;
    case 'sysClr':    rgb = pxRGB(pxA(el, 'lastClr') || PX_SYS[val] || '#000000'); break;
    case 'prstClr':   rgb = pxRGB(pxNamed(val)); break;
    case 'hslClr':
      rgb = pxToRGB(pxDeg(pxN(el, 'hue', 0)), pxN(el, 'sat', 0) / 100000, pxN(el, 'lum', 0) / 100000);
      break;
    case 'scrgbClr':
      rgb = ['r', 'g', 'b'].map(k => PX_SRGB(pxN(el, k, 0) / 100000));
      break;
    case 'schemeClr':
      rgb = val === 'phClr' ? pxRGB(ph || '#000000') : pxRGB(pxScheme(ctx, val));
      break;
    default: return null;
  }
  for(const m of el.children){
    const v = pxN(m, 'val', 0) / 100000;
    let hsl;
    switch(m.localName){
      case 'alpha':    a = v; break;
      case 'alphaMod': a *= v; break;
      case 'alphaOff': a = clamp(a + v, 0, 1); break;
      case 'tint':     rgb = rgb.map(c => PX_SRGB(PX_LIN(c) * v + (1 - v))); break;
      case 'shade':    rgb = rgb.map(c => PX_SRGB(PX_LIN(c) * v)); break;
      case 'lumMod':   hsl = pxToHSL(rgb); rgb = pxToRGB(hsl[0], hsl[1], clamp(hsl[2] * v, 0, 1)); break;
      case 'lumOff':   hsl = pxToHSL(rgb); rgb = pxToRGB(hsl[0], hsl[1], clamp(hsl[2] + v, 0, 1)); break;
      case 'satMod':   hsl = pxToHSL(rgb); rgb = pxToRGB(hsl[0], clamp(hsl[1] * v, 0, 1), hsl[2]); break;
      case 'satOff':   hsl = pxToHSL(rgb); rgb = pxToRGB(hsl[0], clamp(hsl[1] + v, 0, 1), hsl[2]); break;
      case 'hueMod':   hsl = pxToHSL(rgb); rgb = pxToRGB(hsl[0] * v, hsl[1], hsl[2]); break;
      case 'hueOff':   hsl = pxToHSL(rgb); rgb = pxToRGB(hsl[0] + pxDeg(pxN(m, 'val', 0)), hsl[1], hsl[2]); break;
      case 'gray':     hsl = pxToHSL(rgb); rgb = pxToRGB(0, 0, hsl[2]); break;
      case 'inv':      rgb = rgb.map(c => 255 - c); break;
      case 'comp':     hsl = pxToHSL(rgb); rgb = pxToRGB(hsl[0] + 180, hsl[1], hsl[2]); break;
      case 'gamma':    rgb = rgb.map(c => PX_SRGB(Math.pow(PX_LIN(c), 1 / 2.2))); break;
      case 'invGamma': rgb = rgb.map(c => PX_SRGB(Math.pow(PX_LIN(c), 2.2))); break;
    }
  }
  return { hex: pxHex(rgb), a: clamp(a, 0, 1) };
}
/* a theme slot, through the master's map: `bg1` on this slide may be `lt1` or
   `dk1` depending on which way round the master runs it */
function pxScheme(ctx, name){
  const th = (ctx.th && ctx.th.clrs) || {};
  const mapped = (ctx.map && ctx.map[name]) || name;
  return th[mapped] || th[name] || '#000000';
}
/* the first colour inside a wrapper — <a:solidFill>, <a:buClr>, <a:fillRef>… */
const pxColorIn = (n, ctx, ph) => {
  if(!n) return null;
  for(const c of n.children){
    const got = pxColor(c, ctx, ph);
    if(got) return got;
  }
  return null;
};

/* ---------- type, and measuring it ----------
   The deck names fonts it may well not have — Calibri and Cambria ship with
   Office, not with Linux — so each one is handed a stack ending in a metric
   twin (Carlito, Caladea, Liberation) and then a generic. The same stack is
   used to measure and to draw, so a line that fits when measured fits when
   drawn. */
const PX_FONTS = {
  'calibri':          'Calibri,Carlito,"Segoe UI",sans-serif',
  'calibri light':    '"Calibri Light",Carlito,"Segoe UI",sans-serif',
  'cambria':          'Cambria,Caladea,Georgia,serif',
  'arial':            'Arial,"Liberation Sans",Helvetica,sans-serif',
  'arial narrow':     '"Arial Narrow","Liberation Sans Narrow",Arial,sans-serif',
  'helvetica':        'Helvetica,Arial,"Liberation Sans",sans-serif',
  'times new roman':  '"Times New Roman","Liberation Serif",Times,serif',
  'georgia':          'Georgia,"Liberation Serif",serif',
  'garamond':         'Garamond,"EB Garamond",Georgia,serif',
  'book antiqua':     '"Book Antiqua","Palatino Linotype",Palatino,serif',
  'courier new':      '"Courier New","Liberation Mono",monospace',
  'consolas':         'Consolas,"DejaVu Sans Mono",monospace',
  'verdana':          'Verdana,"DejaVu Sans",sans-serif',
  'tahoma':           'Tahoma,"DejaVu Sans",sans-serif',
  'trebuchet ms':     '"Trebuchet MS","DejaVu Sans",sans-serif',
  'segoe ui':         '"Segoe UI",Carlito,"DejaVu Sans",sans-serif',
  'century gothic':   '"Century Gothic",Questrial,"URW Gothic",sans-serif',
  'franklin gothic book': '"Franklin Gothic Book","Libre Franklin",sans-serif',
  'comic sans ms':    '"Comic Sans MS","Comic Neue",cursive',
  'impact':           'Impact,"Anton",Haettenschweiler,sans-serif',
  'wingdings':        'Wingdings,"OpenSymbol",sans-serif',
  'symbol':           'Symbol,"OpenSymbol",serif'
};
function pxFontStack(name){
  const n = String(name || '').trim();
  if(!n) return PX_FONTS['calibri'];
  const hit = PX_FONTS[n.toLowerCase()];
  if(hit) return hit;
  return (/[\s]/.test(n) ? '"' + n.replace(/"/g, '') + '"' : n) + ',Carlito,"DejaVu Sans",sans-serif';
}
/* one canvas for the whole app to measure against */
let PX_CV = null;
function pxCanvas(){
  if(!PX_CV){
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    PX_CV = c.getContext('2d');
  }
  return PX_CV;
}
const PX_WIDTHS = new Map();
/* the width of a run of text, in the same points the slide is drawn in */
function pxWidth(text, f){
  if(!text) return 0;
  const key = f.key + ' ' + text;
  let w = PX_WIDTHS.get(key);
  if(w === undefined){
    const c = pxCanvas();
    c.font = f.css;
    w = c.measureText(text).width;
    if(PX_WIDTHS.size > 60000) PX_WIDTHS.clear();
    PX_WIDTHS.set(key, w);
  }
  return w + (f.spc || 0) * text.length;
}
/* how far above the baseline the tallest letter reaches — asked of the font
   where the browser will say, guessed at four fifths where it will not */
const PX_ASC = new Map();
function pxAscent(f){
  let a = PX_ASC.get(f.css);
  if(a === undefined){
    const c = pxCanvas();
    c.font = f.css;
    const m = c.measureText('Hg');
    a = (m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || f.size * 0.8) / f.size;
    if(PX_ASC.size > 400) PX_ASC.clear();
    PX_ASC.set(f.css, a);
  }
  return a * f.size;
}

/* ---------- geometry ----------
   Every preset shape draws itself into a w×h box from its own adjustments. The
   adjustments arrive as 1/100000ths of a reference length — usually the shorter
   side — which is why `ss` turns up in nearly all of them. */
const pxPt = (x, y) => rd(x) + ' ' + rd(y);
function pxPoly(pts, close){
  return 'M' + pts.map((p, i) => (i ? 'L' : '') + pxPt(p[0], p[1])).join(' ') + (close === false ? '' : 'Z');
}
/* an ellipse arc, the way the format thinks of one: start angle and sweep */
function pxArc(cx, cy, rx, ry, a0, sw){
  const p0 = [cx + rx * Math.cos(a0), cy + ry * Math.sin(a0)];
  const a1 = a0 + sw;
  const p1 = [cx + rx * Math.cos(a1), cy + ry * Math.sin(a1)];
  const big = Math.abs(sw) > Math.PI ? 1 : 0;
  return { start: p0, end: p1,
    d: 'A' + rd(rx) + ' ' + rd(ry) + ' 0 ' + big + ' ' + (sw >= 0 ? 1 : 0) + ' ' + pxPt(p1[0], p1[1]) };
}
const pxRound = (w, h, r) => {
  r = clamp(r, 0, Math.min(w, h) / 2);
  return 'M' + pxPt(r, 0) + 'H' + rd(w - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w, r) +
    'V' + rd(h - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w - r, h) +
    'H' + rd(r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(0, h - r) +
    'V' + rd(r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(r, 0) + 'Z';
};
function pxStar(w, h, n, ratio, rot){
  const cx = w / 2, cy = h / 2, pts = [];
  for(let i = 0; i < n * 2; i++){
    const a = -Math.PI / 2 + (rot || 0) + i * Math.PI / n;
    const k = i % 2 ? ratio : 1;
    pts.push([cx + cx * k * Math.cos(a), cy + cy * k * Math.sin(a)]);
  }
  return pxPoly(pts);
}
function pxNgon(w, h, n, rot){
  const cx = w / 2, cy = h / 2, pts = [];
  for(let i = 0; i < n; i++){
    const a = -Math.PI / 2 + (rot || 0) + i * 2 * Math.PI / n;
    pts.push([cx + cx * Math.cos(a), cy + cy * Math.sin(a)]);
  }
  return pxPoly(pts);
}
const pxEll = (w, h) => 'M' + pxPt(0, h / 2) + 'A' + rd(w / 2) + ' ' + rd(h / 2) + ' 0 0 1 ' + pxPt(w, h / 2) +
  'A' + rd(w / 2) + ' ' + rd(h / 2) + ' 0 0 1 ' + pxPt(0, h / 2) + 'Z';

/* Each entry is (w, h, g) where g(name, default) reads an adjustment as a
   fraction. Anything not in here comes out a plain rectangle rather than a
   wrong shape — a box that is the right size says less that is untrue. */
const PX_SHAPE = {
  rect:      (w, h) => pxPoly([[0, 0], [w, 0], [w, h], [0, h]]),
  roundRect: (w, h, g) => pxRound(w, h, Math.min(w, h) * g('adj', .16667)),
  ellipse:   (w, h) => pxEll(w, h),
  triangle:  (w, h, g) => pxPoly([[w * g('adj', .5), 0], [w, h], [0, h]]),
  rtTriangle:(w, h) => pxPoly([[0, 0], [w, h], [0, h]]),
  diamond:   (w, h) => pxPoly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]),
  parallelogram: (w, h, g) => { const x = Math.min(w, h) * g('adj', .25);
    return pxPoly([[x, 0], [w, 0], [w - x, h], [0, h]]); },
  trapezoid: (w, h, g) => { const x = Math.min(Math.min(w, h) * g('adj', .25), w / 2);
    return pxPoly([[x, 0], [w - x, 0], [w, h], [0, h]]); },
  pentagon:  (w, h) => pxNgon(w, h, 5),
  hexagon:   (w, h, g) => { const x = Math.min(Math.min(w, h) * g('adj', .25), w / 2);
    return pxPoly([[x, 0], [w - x, 0], [w, h / 2], [w - x, h], [x, h], [0, h / 2]]); },
  heptagon:  (w, h) => pxNgon(w, h, 7),
  octagon:   (w, h, g) => { const x = Math.min(Math.min(w, h) * g('adj', .29289), Math.min(w, h) / 2);
    return pxPoly([[x, 0], [w - x, 0], [w, x], [w, h - x], [w - x, h], [x, h], [0, h - x], [0, x]]); },
  decagon:   (w, h) => pxNgon(w, h, 10),
  dodecagon: (w, h) => pxNgon(w, h, 12),
  star4:  (w, h, g) => pxStar(w, h, 4, g('adj', .125) * 2),
  star5:  (w, h, g) => pxStar(w, h, 5, g('adj', .19098) * 2),
  star6:  (w, h, g) => pxStar(w, h, 6, g('adj', .28868) * 2),
  star7:  (w, h, g) => pxStar(w, h, 7, g('adj', .34601) * 2),
  star8:  (w, h, g) => pxStar(w, h, 8, g('adj', .375) * 2),
  star10: (w, h, g) => pxStar(w, h, 10, g('adj', .3129) * 2),
  star12: (w, h, g) => pxStar(w, h, 12, g('adj', .375) * 2),
  star16: (w, h, g) => pxStar(w, h, 16, g('adj', .375) * 2),
  star24: (w, h, g) => pxStar(w, h, 24, g('adj', .375) * 2),
  star32: (w, h, g) => pxStar(w, h, 32, g('adj', .375) * 2),
  rightArrow: (w, h, g) => { const t = h * clamp(g('adj1', .5), 0, 1), head = Math.min(w, Math.min(w, h) * g('adj2', .5));
    const y0 = (h - t) / 2;
    return pxPoly([[0, y0], [w - head, y0], [w - head, 0], [w, h / 2], [w - head, h], [w - head, y0 + t], [0, y0 + t]]); },
  leftArrow: (w, h, g) => { const t = h * clamp(g('adj1', .5), 0, 1), head = Math.min(w, Math.min(w, h) * g('adj2', .5));
    const y0 = (h - t) / 2;
    return pxPoly([[w, y0], [head, y0], [head, 0], [0, h / 2], [head, h], [head, y0 + t], [w, y0 + t]]); },
  upArrow: (w, h, g) => { const t = w * clamp(g('adj1', .5), 0, 1), head = Math.min(h, Math.min(w, h) * g('adj2', .5));
    const x0 = (w - t) / 2;
    return pxPoly([[x0, h], [x0, head], [0, head], [w / 2, 0], [w, head], [x0 + t, head], [x0 + t, h]]); },
  downArrow: (w, h, g) => { const t = w * clamp(g('adj1', .5), 0, 1), head = Math.min(h, Math.min(w, h) * g('adj2', .5));
    const x0 = (w - t) / 2;
    return pxPoly([[x0, 0], [x0, h - head], [0, h - head], [w / 2, h], [w, h - head], [x0 + t, h - head], [x0 + t, 0]]); },
  leftRightArrow: (w, h, g) => { const t = h * clamp(g('adj1', .5), 0, 1), head = Math.min(w / 2, Math.min(w, h) * g('adj2', .5));
    const y0 = (h - t) / 2;
    return pxPoly([[0, h / 2], [head, 0], [head, y0], [w - head, y0], [w - head, 0], [w, h / 2],
      [w - head, h], [w - head, y0 + t], [head, y0 + t], [head, h]]); },
  upDownArrow: (w, h, g) => { const t = w * clamp(g('adj1', .5), 0, 1), head = Math.min(h / 2, Math.min(w, h) * g('adj2', .5));
    const x0 = (w - t) / 2;
    return pxPoly([[w / 2, 0], [w, head], [x0 + t, head], [x0 + t, h - head], [w, h - head], [w / 2, h],
      [0, h - head], [x0, h - head], [x0, head], [0, head]]); },
  chevron:   (w, h, g) => { const x = Math.min(w, Math.min(w, h) * g('adj', .5));
    return pxPoly([[0, 0], [w - x, 0], [w, h / 2], [w - x, h], [0, h], [x, h / 2]]); },
  homePlate: (w, h, g) => { const x = Math.min(w, Math.min(w, h) * g('adj', .5));
    return pxPoly([[0, 0], [w - x, 0], [w, h / 2], [w - x, h], [0, h]]); },
  plus:  (w, h, g) => { const t = Math.min(w, h) * g('adj', .25);
    return pxPoly([[t, 0], [w - t, 0], [w - t, t], [w, t], [w, h - t], [w - t, h - t],
      [w - t, h], [t, h], [t, h - t], [0, h - t], [0, t], [t, t]]); },
  mathPlus: (w, h, g) => { const t = h * g('adj', .2352);
    return pxPoly([[(w - t) / 2, 0], [(w + t) / 2, 0], [(w + t) / 2, (h - t) / 2], [w, (h - t) / 2],
      [w, (h + t) / 2], [(w + t) / 2, (h + t) / 2], [(w + t) / 2, h], [(w - t) / 2, h],
      [(w - t) / 2, (h + t) / 2], [0, (h + t) / 2], [0, (h - t) / 2], [(w - t) / 2, (h - t) / 2]]); },
  mathMinus: (w, h, g) => { const t = h * g('adj', .23520);
    return pxPoly([[0, (h - t) / 2], [w, (h - t) / 2], [w, (h + t) / 2], [0, (h + t) / 2]]); },
  can: (w, h, g) => { const ry = Math.min(h / 2, Math.min(w, h) * g('adj', .25) / 2);
    return 'M0 ' + rd(ry) + 'A' + rd(w / 2) + ' ' + rd(ry) + ' 0 0 1 ' + pxPt(w, ry) +
      'V' + rd(h - ry) + 'A' + rd(w / 2) + ' ' + rd(ry) + ' 0 0 1 ' + pxPt(0, h - ry) + 'Z' +
      'M0 ' + rd(ry) + 'A' + rd(w / 2) + ' ' + rd(ry) + ' 0 0 0 ' + pxPt(w, ry); },
  cube: (w, h, g) => { const d = Math.min(w, h) * g('adj', .25);
    return pxPoly([[0, d], [d, 0], [w, 0], [w, h - d], [w - d, h], [0, h]]) +
      'M0 ' + rd(d) + 'H' + rd(w - d) + 'V' + rd(h) + 'M' + pxPt(w - d, d) + 'L' + pxPt(w, 0); },
  donut: (w, h, g) => { const t = Math.min(w, h) * g('adj', .25);
    return pxEll(w, h) + 'M' + pxPt(t, h / 2) +
      'A' + rd(w / 2 - t) + ' ' + rd(h / 2 - t) + ' 0 0 0 ' + pxPt(w - t, h / 2) +
      'A' + rd(w / 2 - t) + ' ' + rd(h / 2 - t) + ' 0 0 0 ' + pxPt(t, h / 2) + 'Z'; },
  pie: (w, h, g) => { const a0 = g('adj1', 0, 60000) * Math.PI / 180, a1 = g('adj2', 270, 60000) * Math.PI / 180;
    const sw = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    const a = pxArc(w / 2, h / 2, w / 2, h / 2, a0, sw);
    return 'M' + pxPt(w / 2, h / 2) + 'L' + pxPt(a.start[0], a.start[1]) + a.d + 'Z'; },
  chord: (w, h, g) => { const a0 = g('adj1', 45, 60000) * Math.PI / 180, a1 = g('adj2', 270, 60000) * Math.PI / 180;
    const sw = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    const a = pxArc(w / 2, h / 2, w / 2, h / 2, a0, sw);
    return 'M' + pxPt(a.start[0], a.start[1]) + a.d + 'Z'; },
  arc: (w, h, g) => { const a0 = g('adj1', 270, 60000) * Math.PI / 180, a1 = g('adj2', 0, 60000) * Math.PI / 180;
    const sw = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    const a = pxArc(w / 2, h / 2, w / 2, h / 2, a0, sw);
    return 'M' + pxPt(a.start[0], a.start[1]) + a.d; },
  blockArc: (w, h, g) => { const a0 = g('adj1', 180, 60000) * Math.PI / 180, a1 = g('adj2', 0, 60000) * Math.PI / 180;
    const t = Math.min(w, h) * g('adj3', .25);
    const sw = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    const o = pxArc(w / 2, h / 2, w / 2, h / 2, a0, sw);
    const i = pxArc(w / 2, h / 2, w / 2 - t, h / 2 - t, a0 + sw, -sw);
    return 'M' + pxPt(o.start[0], o.start[1]) + o.d + 'L' + pxPt(i.start[0], i.start[1]) + i.d + 'Z'; },
  teardrop: (w, h, g) => { const k = g('adj', 1);
    return 'M' + pxPt(0, h / 2) + 'A' + rd(w / 2) + ' ' + rd(h / 2) + ' 0 0 1 ' + pxPt(w / 2, 0) +
      'L' + pxPt(w / 2 + w / 2 * k * .7071, h / 2 - h / 2 * k * .7071) +
      'L' + pxPt(w, h / 2) + 'A' + rd(w / 2) + ' ' + rd(h / 2) + ' 0 0 1 ' + pxPt(0, h / 2) + 'Z'; },
  frame: (w, h, g) => { const t = Math.min(w, h) * g('adj', .125);
    return pxPoly([[0, 0], [w, 0], [w, h], [0, h]]) +
      pxPoly([[t, t], [t, h - t], [w - t, h - t], [w - t, t]]); },
  halfFrame: (w, h, g) => { const t = Math.min(w, h) * g('adj2', .33333);
    return pxPoly([[0, 0], [w, 0], [w - t, t], [t, h - t], [0, h]]); },
  corner: (w, h, g) => { const t = Math.min(w, h) * g('adj2', .5);
    return pxPoly([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]]); },
  diagStripe: (w, h, g) => { const k = clamp(g('adj', .5), 0, 1);
    return pxPoly([[0, h], [0, h * (1 - k)], [w * k, 0], [w, 0]]); },
  plaque: (w, h, g) => { const t = Math.min(w, h) * g('adj', .16667);
    return 'M' + pxPt(t, 0) + 'H' + rd(w - t) + 'A' + rd(t) + ' ' + rd(t) + ' 0 0 0 ' + pxPt(w, t) +
      'V' + rd(h - t) + 'A' + rd(t) + ' ' + rd(t) + ' 0 0 0 ' + pxPt(w - t, h) +
      'H' + rd(t) + 'A' + rd(t) + ' ' + rd(t) + ' 0 0 0 ' + pxPt(0, h - t) +
      'V' + rd(t) + 'A' + rd(t) + ' ' + rd(t) + ' 0 0 0 ' + pxPt(t, 0) + 'Z'; },
  bevel: (w, h, g) => { const t = Math.min(w, h) * g('adj', .125);
    return pxPoly([[0, 0], [w, 0], [w, h], [0, h]]) + pxPoly([[t, t], [w - t, t], [w - t, h - t], [t, h - t]]); },
  round1Rect: (w, h, g) => { const r = clamp(Math.min(w, h) * g('adj', .16667), 0, Math.min(w, h));
    return 'M0 0H' + rd(w - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w, r) +
      'V' + rd(h) + 'H0Z'; },
  round2SameRect: (w, h, g) => { const r = clamp(Math.min(w, h) * g('adj1', .16667), 0, Math.min(w, h));
    return 'M' + pxPt(r, 0) + 'H' + rd(w - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w, r) +
      'V' + rd(h) + 'H0V' + rd(r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(r, 0) + 'Z'; },
  round2DiagRect: (w, h, g) => { const r = clamp(Math.min(w, h) * g('adj1', .16667), 0, Math.min(w, h));
    return 'M' + pxPt(r, 0) + 'H' + rd(w) + 'V' + rd(h - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w - r, h) +
      'H0V' + rd(r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(r, 0) + 'Z'; },
  snip1Rect: (w, h, g) => { const t = Math.min(w, h) * g('adj', .16667);
    return pxPoly([[0, 0], [w - t, 0], [w, t], [w, h], [0, h]]); },
  snip2SameRect: (w, h, g) => { const t = Math.min(w, h) * g('adj1', .16667);
    return pxPoly([[t, 0], [w - t, 0], [w, t], [w, h], [0, h], [0, t]]); },
  snip2DiagRect: (w, h, g) => { const t = Math.min(w, h) * g('adj2', .16667);
    return pxPoly([[t, 0], [w, 0], [w, h - t], [w - t, h], [0, h], [0, t]]); },
  snipRoundRect: (w, h, g) => { const t = Math.min(w, h) * g('adj1', .16667), r = Math.min(w, h) * g('adj2', .16667);
    return 'M' + pxPt(t, 0) + 'H' + rd(w - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w, r) +
      'V' + rd(h) + 'H0V' + rd(t) + 'Z'; },
  leftBracket:  (w, h, g) => { const r = Math.min(h / 2, Math.min(w, h) * g('adj', .16667));
    return 'M' + pxPt(w, 0) + 'H' + rd(r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 0 0 ' + rd(r) +
      'V' + rd(h - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 0 ' + pxPt(r, h) + 'H' + rd(w); },
  rightBracket: (w, h, g) => { const r = Math.min(h / 2, Math.min(w, h) * g('adj', .16667));
    return 'M0 0H' + rd(w - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w, r) +
      'V' + rd(h - r) + 'A' + rd(r) + ' ' + rd(r) + ' 0 0 1 ' + pxPt(w - r, h) + 'H0'; },
  bracketPair:  (w, h, g) => PX_SHAPE.leftBracket(w / 2, h, g) + ' ' +
    PX_SHAPE.rightBracket(w / 2, h, g).replace(/M0 0/, 'M' + rd(w / 2) + ' 0'),
  leftBrace: (w, h, g) => { const r = Math.min(h / 4, w);
    return 'M' + pxPt(w, 0) + 'Q' + pxPt(w / 2, 0) + ' ' + pxPt(w / 2, r) + 'V' + rd(h / 2 - r) +
      'Q' + pxPt(w / 2, h / 2) + ' 0 ' + rd(h / 2) + 'Q' + pxPt(w / 2, h / 2) + ' ' + pxPt(w / 2, h / 2 + r) +
      'V' + rd(h - r) + 'Q' + pxPt(w / 2, h) + ' ' + pxPt(w, h); },
  rightBrace: (w, h, g) => { const r = Math.min(h / 4, w);
    return 'M0 0Q' + pxPt(w / 2, 0) + ' ' + pxPt(w / 2, r) + 'V' + rd(h / 2 - r) +
      'Q' + pxPt(w / 2, h / 2) + ' ' + pxPt(w, h / 2) + 'Q' + pxPt(w / 2, h / 2) + ' ' + pxPt(w / 2, h / 2 + r) +
      'V' + rd(h - r) + 'Q' + pxPt(w / 2, h) + ' 0 ' + rd(h); },
  wedgeRectCallout: (w, h, g) => { const x = w / 2 + w * g('adj1', -.2), y = h / 2 + h * g('adj2', .74);
    return pxPoly([[0, 0], [w, 0], [w, h], [w * .55, h], [x, y], [w * .45, h], [0, h]]); },
  wedgeRoundRectCallout: (w, h, g) => { const x = w / 2 + w * g('adj1', -.2), y = h / 2 + h * g('adj2', .74);
    return pxRound(w, h, Math.min(w, h) * .16667) + pxPoly([[w * .45, h * .95], [x, y], [w * .55, h * .95]]); },
  wedgeEllipseCallout: (w, h, g) => { const x = w / 2 + w * g('adj1', -.2), y = h / 2 + h * g('adj2', .74);
    return pxEll(w, h) + pxPoly([[w * .38, h * .9], [x, y], [w * .55, h * .95]]); },
  line: (w, h) => 'M0 0L' + pxPt(w, h),
  straightConnector1: (w, h) => 'M0 0L' + pxPt(w, h),
  bentConnector2: (w, h) => 'M0 0H' + rd(w) + 'V' + rd(h),
  bentConnector3: (w, h, g) => { const x = w * g('adj1', .5);
    return 'M0 0H' + rd(x) + 'V' + rd(h) + 'H' + rd(w); },
  bentConnector4: (w, h, g) => { const x = w * g('adj1', .5), y = h * g('adj2', .5);
    return 'M0 0H' + rd(x) + 'V' + rd(y) + 'H' + rd(w) + 'V' + rd(h); },
  curvedConnector2: (w, h) => 'M0 0Q' + pxPt(w, 0) + ' ' + pxPt(w, h),
  curvedConnector3: (w, h, g) => { const x = w * g('adj1', .5);
    return 'M0 0C' + pxPt(x, 0) + ' ' + pxPt(x, h) + ' ' + pxPt(w, h); },
  noSmoking: (w, h, g) => { const t = Math.min(w, h) * g('adj', .18375);
    return PX_SHAPE.donut(w, h, () => g('adj', .18375)) +
      pxPoly([[w * .18, h * .1], [w * .9, h * .82], [w * .82, h * .9], [w * .1, h * .18]]); },
  flowChartProcess:     (w, h) => PX_SHAPE.rect(w, h),
  flowChartDecision:    (w, h) => PX_SHAPE.diamond(w, h),
  flowChartTerminator:  (w, h) => pxRound(w, h, h / 2),
  flowChartAlternateProcess: (w, h) => pxRound(w, h, Math.min(w, h) * .16667),
  flowChartInputOutput: (w, h) => pxPoly([[w * .2, 0], [w, 0], [w * .8, h], [0, h]]),
  flowChartPreparation: (w, h) => PX_SHAPE.hexagon(w, h, () => .2),
  flowChartConnector:   (w, h) => pxEll(w, h),
  flowChartDocument:    (w, h) => 'M0 0H' + rd(w) + 'V' + rd(h * .85) +
    'Q' + pxPt(w * .75, h * .7) + ' ' + pxPt(w / 2, h * .85) +
    'Q' + pxPt(w * .25, h) + ' 0 ' + rd(h * .85) + 'Z',
  flowChartPredefinedProcess: (w, h) => PX_SHAPE.rect(w, h) +
    'M' + pxPt(w * .12, 0) + 'V' + rd(h) + 'M' + pxPt(w * .88, 0) + 'V' + rd(h),
  flowChartInternalStorage: (w, h) => PX_SHAPE.rect(w, h) +
    'M' + pxPt(w * .12, 0) + 'V' + rd(h) + 'M0 ' + rd(h * .12) + 'H' + rd(w),
  flowChartMagneticDisk: (w, h) => PX_SHAPE.can(w, h, () => .25),
  flowChartManualOperation: (w, h) => pxPoly([[0, 0], [w, 0], [w * .8, h], [w * .2, h]]),
  flowChartExtract:     (w, h) => pxPoly([[w / 2, 0], [w, h], [0, h]]),
  flowChartMerge:       (w, h) => pxPoly([[0, 0], [w, 0], [w / 2, h]]),
  flowChartOffpageConnector: (w, h) => pxPoly([[0, 0], [w, 0], [w, h * .8], [w / 2, h], [0, h * .8]]),
  actionButtonBlankRect: (w, h) => PX_SHAPE.rect(w, h)
};
PX_SHAPE.roundRect2SameRect = PX_SHAPE.round2SameRect;
PX_SHAPE.rtTriangle2 = PX_SHAPE.rtTriangle;

/* the shape's own path — a preset drawn from its adjustments, or the freehand
   one it carries with it */
function pxGeom(spPr, w, h){
  const cust = pxK(spPr, 'custGeom');
  if(cust) return pxCustGeom(cust, w, h);
  const prst = pxK(spPr, 'prstGeom');
  if(!prst) return null;
  const name = pxA(prst, 'prst') || 'rect';
  const adj = {};
  for(const gd of pxKs(pxK(prst, 'avLst'), 'gd')){
    const m = /val\s+(-?[\d.]+)/.exec(pxA(gd, 'fmla') || '');
    if(m) adj[pxA(gd, 'name')] = parseFloat(m[1]);
  }
  /* an adjustment is a 1/100000th unless the shape asks for its degrees */
  const g = (k, dflt, scale) => (adj[k] == null ? dflt : adj[k] / (scale || 100000));
  const fn = PX_SHAPE[name] || PX_SHAPE.rect;
  let d = null;
  try{ d = fn(w, h, g); }catch(e){ d = PX_SHAPE.rect(w, h); }
  return { d, open: /^(line|arc|.*Connector\d?)$/.test(name), known: !!PX_SHAPE[name], prst: name };
}
/* freehand geometry: the same handful of pen strokes any vector format has */
function pxCustGeom(cust, w, h){
  const list = pxK(cust, 'pathLst');
  if(!list) return null;
  let d = '', open = false;
  for(const path of pxKs(list, 'path')){
    const pw = pxN(path, 'w', 0), ph = pxN(path, 'h', 0);
    const sx = pw > 0 ? w / pw : 1 / PPTX_EMU, sy = ph > 0 ? h / ph : 1 / PPTX_EMU;
    const P = el => { const p = pxK(el, 'pt') || el;
      return [pxN(p, 'x', 0) * sx, pxN(p, 'y', 0) * sy]; };
    let cur = [0, 0], closed = false;
    for(const c of path.children){
      switch(c.localName){
        case 'moveTo': cur = P(pxK(c, 'pt')); d += 'M' + pxPt(cur[0], cur[1]); break;
        case 'lnTo':   cur = P(pxK(c, 'pt')); d += 'L' + pxPt(cur[0], cur[1]); break;
        case 'cubicBezTo': {
          const pts = pxKs(c, 'pt').map(p => [pxN(p, 'x', 0) * sx, pxN(p, 'y', 0) * sy]);
          if(pts.length === 3){ d += 'C' + pts.map(p => pxPt(p[0], p[1])).join(' '); cur = pts[2]; }
          break; }
        case 'quadBezTo': {
          const pts = pxKs(c, 'pt').map(p => [pxN(p, 'x', 0) * sx, pxN(p, 'y', 0) * sy]);
          if(pts.length === 2){ d += 'Q' + pts.map(p => pxPt(p[0], p[1])).join(' '); cur = pts[1]; }
          break; }
        case 'arcTo': {
          /* the format gives the radii and the angles; where the arc is comes
             from where the pen already is */
          const rx = pxN(c, 'wR', 0) * sx, ry = pxN(c, 'hR', 0) * sy;
          const a0 = pxDeg(pxN(c, 'stAng', 0)) * Math.PI / 180;
          const sw = pxDeg(pxN(c, 'swAng', 0)) * Math.PI / 180;
          const cx = cur[0] - rx * Math.cos(a0), cy = cur[1] - ry * Math.sin(a0);
          const a = pxArc(cx, cy, rx, ry, a0, sw);
          d += a.d; cur = a.end;
          break; }
        case 'close': d += 'Z'; closed = true; break;
      }
    }
    if(!closed) open = true;
    if(pxA(path, 'fill') === 'none') open = true;
  }
  return d ? { d, open, known: true, prst: 'custom' } : null;
}

/* ---------- fills, lines and shadows ---------- */
function pxGradDef(el, ctx, ph){
  const stops = pxKs(pxK(el, 'gsLst'), 'gs').map(gs => {
    const c = pxColorIn(gs, ctx, ph) || { hex:'#000000', a:1 };
    return { pos: clamp(pxN(gs, 'pos', 0) / 100000, 0, 1), c };
  }).sort((a, b) => a.pos - b.pos);
  if(!stops.length) return null;
  const id = 'pg' + (ctx.uid++);
  const path = pxK(el, 'path');
  let head;
  if(path){
    /* a path gradient runs from the outside in, which is the other way round
       from an SVG one — so the stops are turned over */
    const r = pxK(path, 'fillToRect');
    const cx = r ? (pxN(r, 'l', 50000) + (100000 - pxN(r, 'r', 50000))) / 200000 : .5;
    const cy = r ? (pxN(r, 't', 50000) + (100000 - pxN(r, 'b', 50000))) / 200000 : .5;
    head = '<radialGradient id="' + id + '" cx="' + rd(cx) + '" cy="' + rd(cy) + '" r="0.75">' +
      stops.slice().reverse().map(s =>
        '<stop offset="' + rd(1 - s.pos) + '" stop-color="' + s.c.hex + '" stop-opacity="' + rd(s.c.a) + '"/>').join('');
    ctx.defs.push(head + '</radialGradient>');
    return 'url(#' + id + ')';
  }
  const ang = pxDeg(pxN(pxK(el, 'lin'), 'ang', 5400000)) * Math.PI / 180;
  const co = Math.cos(ang), si = Math.sin(ang), L = Math.abs(co) + Math.abs(si);
  head = '<linearGradient id="' + id + '" x1="' + rd(.5 - co * L / 2) + '" y1="' + rd(.5 - si * L / 2) +
    '" x2="' + rd(.5 + co * L / 2) + '" y2="' + rd(.5 + si * L / 2) + '">' +
    stops.map(s => '<stop offset="' + rd(s.pos) + '" stop-color="' + s.c.hex +
      '" stop-opacity="' + rd(s.c.a) + '"/>').join('');
  ctx.defs.push(head + '</linearGradient>');
  return 'url(#' + id + ')';
}
/* a picture used as a fill: the shape is painted with a pattern one tile of
   which is the whole picture, stretched over the box */
function pxBlipDef(el, ctx, box){
  const href = pxImageHref(pxK(el, 'blip'), ctx);
  if(!href) return null;
  const id = 'pb' + (ctx.uid++);
  const tile = pxK(el, 'tile');
  const w = tile ? Math.max(4, box.w * (pxN(tile, 'sx', 100000) / 100000)) : box.w;
  const h = tile ? Math.max(4, box.h * (pxN(tile, 'sy', 100000) / 100000)) : box.h;
  ctx.defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + rd(w) +
    '" height="' + rd(h) + '"><image href="' + esc(href) + '" width="' + rd(w) + '" height="' + rd(h) +
    '" preserveAspectRatio="none"/></pattern>');
  return 'url(#' + id + ')';
}
const PX_PATT = {
  pct5:'M0 0h1v1H0z', pct10:'M0 0h1v1H0z', pct20:'M0 0h2v2H0z', pct25:'M0 0h2v2H0z',
  ltHorz:'M0 2h8', horz:'M0 2h8M0 6h8', ltVert:'M2 0v8', vert:'M2 0v8M6 0v8',
  ltUpDiag:'M0 8L8 0', ltDnDiag:'M0 0L8 8', wdUpDiag:'M0 8L8 0M-2 2L2 -2M6 10L10 6',
  wdDnDiag:'M0 0L8 8M-2 6L2 10M6 -2L10 2', cross:'M0 2h8M2 0v8',
  diagCross:'M0 0L8 8M0 8L8 0', smGrid:'M0 4h8M4 0v8', lgGrid:'M0 0h8M0 0v8',
  dotGrid:'M1 1h1v1H1zM5 5h1v1H5z', trellis:'M0 0L4 4L0 8M8 0L4 4L8 8'
};
function pxPattDef(el, ctx){
  const fg = pxColorIn(pxK(el, 'fgClr'), ctx) || { hex:'#000000', a:1 };
  const bg = pxColorIn(pxK(el, 'bgClr'), ctx) || { hex:'#ffffff', a:1 };
  const d = PX_PATT[pxA(el, 'prst') || 'pct50'] || 'M0 0L8 8M0 8L8 0';
  const id = 'pp' + (ctx.uid++);
  ctx.defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="8" height="8">' +
    '<rect width="8" height="8" fill="' + bg.hex + '" fill-opacity="' + rd(bg.a) + '"/>' +
    '<path d="' + d + '" stroke="' + fg.hex + '" stroke-opacity="' + rd(fg.a) +
    '" stroke-width="1.1" fill="' + fg.hex + '"/></pattern>');
  return 'url(#' + id + ')';
}
/* one fill element, whether it was found on a shape or handed over by a theme */
function pxFillEl(c, ctx, ph, box){
  switch(c && c.localName){
    case 'noFill':    return { fill:'none', op:1 };
    case 'solidFill': { const col = pxColorIn(c, ctx, ph) || { hex:'#000000', a:1 };
      return { fill: col.hex, op: col.a }; }
    case 'gradFill':  { const u = pxGradDef(c, ctx, ph); return u ? { fill:u, op:1 } : null; }
    case 'blipFill':  { const u = pxBlipDef(c, ctx, box || { w:100, h:100 }); return u ? { fill:u, op:1 } : null; }
    case 'pattFill':  { const u = pxPattDef(c, ctx); return u ? { fill:u, op:1 } : null; }
  }
  return null;
}
/* …and the fill written on a node — a shape, a table cell, a background */
function pxFillOf(node, ctx, ph, box){
  if(!node) return null;
  for(const c of node.children){
    if(c.localName === 'grpFill') return null;
    const got = pxFillEl(c, ctx, ph, box);
    if(got) return got;
  }
  return null;
}
const PX_DASH = { solid:null, dot:[1, 3], sysDot:[1, 1], dash:[4, 3], sysDash:[3, 1],
  lgDash:[8, 3], dashDot:[4, 3, 1, 3], sysDashDot:[3, 1, 1, 1], lgDashDot:[8, 3, 1, 3],
  sysDashDotDot:[3, 1, 1, 1, 1, 1], lgDashDotDot:[8, 3, 1, 3, 1, 3] };
/* an arrow head, as a marker the same colour as the line that wears it */
function pxMarker(ctx, kind, colour, at, size){
  const big = size === 'lg' ? 1.4 : size === 'sm' ? .7 : 1;
  const id = 'pm' + (ctx.uid++);
  const shapes = {
    triangle: '<path d="M0 0L6 3L0 6Z"/>', arrow: '<path d="M0 0L6 3L0 6L1.6 3Z"/>',
    stealth:  '<path d="M0 0L6 3L0 6L2.2 3Z"/>', diamond: '<path d="M0 3L3 0L6 3L3 6Z"/>',
    oval:     '<circle cx="3" cy="3" r="3"/>'
  };
  const body = shapes[kind] || shapes.triangle;
  ctx.defs.push('<marker id="' + id + '" viewBox="0 0 6 6" refX="' + (at === 'head' ? 0.4 : 5.6) +
    '" refY="3" markerWidth="' + rd(4 * big) + '" markerHeight="' + rd(4 * big) +
    '" orient="auto-start-reverse" markerUnits="strokeWidth" fill="' + colour + '">' + body + '</marker>');
  return 'url(#' + id + ')';
}
const pxLineOf = (spPr, ctx, ph) => pxLineFrom(pxK(spPr, 'ln'), ctx, ph);
/* a line, from whichever element carries one — a shape's <a:ln>, a table cell's
   <a:lnT>, a theme's line style. They all hold the same thing. */
function pxLineFrom(ln, ctx, ph){
  if(!ln) return null;
  const fill = pxFillOf(ln, ctx, ph);
  if(fill && fill.fill === 'none') return { none: true };
  const w = pxEmu(pxN(ln, 'w', 9525));
  const out = { stroke: fill ? fill.fill : null, op: fill ? fill.op : 1, w: Math.max(.35, w),
    cap: { rnd:'round', sq:'square', flat:'butt' }[pxA(ln, 'cap')] || 'butt',
    join: pxK(ln, 'bevel') ? 'bevel' : pxK(ln, 'miter') ? 'miter' : pxK(ln, 'round') ? 'round' : 'miter' };
  const dash = pxK(ln, 'prstDash');
  const pat = dash && PX_DASH[pxA(dash, 'val')];
  if(pat) out.dash = pat.map(v => rd(v * Math.max(.6, w))).join(' ');
  const head = pxK(ln, 'headEnd'), tail = pxK(ln, 'tailEnd');
  if(head && pxA(head, 'type') && pxA(head, 'type') !== 'none')
    out.head = { t: pxA(head, 'type'), s: pxA(head, 'len') };
  if(tail && pxA(tail, 'type') && pxA(tail, 'type') !== 'none')
    out.tail = { t: pxA(tail, 'type'), s: pxA(tail, 'len') };
  return out;
}
/* a drop shadow, if the shape asks for one — the only effect worth drawing */
function pxShadow(spPr, ctx){
  const sh = pxIn(spPr, 'effectLst/outerShdw');
  if(!sh) return '';
  const c = pxColorIn(sh, ctx) || { hex:'#000000', a:.4 };
  const dist = pxEmu(pxN(sh, 'dist', 0)), dir = pxDeg(pxN(sh, 'dir', 0)) * Math.PI / 180;
  const blur = pxEmu(pxN(sh, 'blurRad', 0));
  const id = 'ps' + (ctx.uid++);
  ctx.defs.push('<filter id="' + id + '" x="-30%" y="-30%" width="180%" height="180%">' +
    '<feDropShadow dx="' + rd(dist * Math.cos(dir)) + '" dy="' + rd(dist * Math.sin(dir)) +
    '" stdDeviation="' + rd(Math.max(0, blur / 2)) + '" flood-color="' + c.hex +
    '" flood-opacity="' + rd(c.a) + '"/></filter>');
  return ' filter="url(#' + id + ')"';
}
/* what a shape's theme style says, when the shape itself says nothing */
function pxStyleRef(style, ctx, which){
  const ref = pxK(style, which + 'Ref');
  if(!ref) return null;
  const idx = Math.round(pxN(ref, 'idx', 0));
  const col = pxColorIn(ref, ctx);
  const fmt = ctx.th && ctx.th.fmt;
  if(!fmt) return { idx, ph: col && col.hex };
  let list = null, at = idx - 1;
  if(which === 'fill'){ list = idx > 1000 ? fmt.bg : fmt.fill; if(idx > 1000) at = idx - 1001; }
  else if(which === 'ln') list = fmt.ln;
  const node = list && list[Math.max(0, at)];
  return { node, idx, ph: col && col.hex };
}

/* ---------- pictures ---------- */
const PX_MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  bmp:'image/bmp', webp:'image/webp', svg:'image/svg+xml', tiff:'image/tiff', tif:'image/tiff',
  emf:'image/emf', wmf:'image/wmf' };
const PX_DRAWABLE = /^(png|jpe?g|gif|bmp|webp|svg)$/i;
function pxImageHref(blip, ctx){
  if(!blip) return null;
  const rid = pxRel(blip, 'embed') || pxRel(blip, 'link');
  const part = rid && ctx.rel(rid);
  const rec = part && ctx.D.media[part];
  if(!rec || !rec.ok) return null;
  return ctx.inline ? pxDataURL(rec) : pxBlobURL(rec);
}
function pxBlobURL(rec){
  if(!rec.url) rec.url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime }));
  return rec.url;
}
function pxDataURL(rec){
  if(rec.data) return rec.data;
  let s = '';
  const b = rec.bytes;
  for(let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return (rec.data = 'data:' + rec.mime + ';base64,' + btoa(s));
}

/* ---------- text ----------
   A paragraph's look is written in up to five places at once, and the nearest
   one wins: the run itself, the shape's own list style, the placeholder it
   comes from in the layout, the same placeholder in the master, and finally the
   master's styles for that kind of text. `chain` is those, nearest first. */
function pxLvlProps(chain, lvl, kind){
  const out = [];
  for(const ls of chain){
    if(!ls) continue;
    const el = pxK(ls, 'lvl' + (lvl + 1) + 'pPr') || (lvl === 0 ? pxK(ls, 'defPPr') : null);
    if(el) out.push(kind === 'r' ? pxK(el, 'defRPr') : el);
  }
  return out.filter(Boolean);
}
/* the first of the stack that has anything to say about this property */
function pxPick(stack, fn){
  for(const n of stack){
    const v = fn(n);
    if(v !== null && v !== undefined) return v;
  }
  return null;
}
function pxRunFont(rPr, stack, ctx, scale){
  const all = rPr ? [rPr].concat(stack) : stack;
  let size = pxPick(all, n => { const v = pxN(n, 'sz', null); return v == null ? null : v / 100; });
  if(size == null) size = 18;
  size *= (scale == null ? 1 : scale);
  const bold = pxPick(all, n => { const v = n.getAttribute('b'); return v == null ? null : (v === '1' || v === 'true'); }) || false;
  const ital = pxPick(all, n => { const v = n.getAttribute('i'); return v == null ? null : (v === '1' || v === 'true'); }) || false;
  const un   = pxPick(all, n => { const v = n.getAttribute('u'); return v == null ? null : v; });
  const strike = pxPick(all, n => { const v = n.getAttribute('strike'); return v == null ? null : v; });
  const spc  = pxPick(all, n => { const v = pxN(n, 'spc', null); return v == null ? null : v / 100; }) || 0;
  const base = pxPick(all, n => { const v = pxN(n, 'baseline', null); return v == null ? null : v / 100000; }) || 0;
  let face = pxPick(all, n => { const l = pxK(n, 'latin') || pxK(n, 'sym'); return l ? pxA(l, 'typeface') : null; });
  if(face === '+mj-lt') face = ctx.th.major;
  else if(face === '+mn-lt') face = ctx.th.minor;
  if(!face) face = ctx.th.minor;
  /* a run set in Symbol or Wingdings is translated rather than set in a font
     nobody has, so it takes the ordinary face of the deck */
  const sym = pxIsSymFont(face) ? face : null;
  if(sym) face = ctx.th.minor;
  const col = pxPick(all, n => {
    const f = pxK(n, 'solidFill');
    if(f) return pxColorIn(f, ctx, ctx.ph);
    /* a run with a theme font reference takes that reference's colour */
    return null;
  }) || null;
  const hl = pxPick(all, n => { const f = pxK(n, 'highlight'); return f ? pxColorIn(f, ctx) : null; });
  const family = pxFontStack(face);
  const css = (ital ? 'italic ' : '') + (bold ? '700 ' : '400 ') + rd(size) + 'px ' + family;
  return { size, bold, ital, un: un && un !== 'none' ? un : null, strike: strike && strike !== 'noStrike',
    spc, base, family, css, key: css + '|' + spc, col, hl, sym };
}
/* ---- the two fonts that are not fonts ----
   Symbol and Wingdings are alphabets in disguise: a β is stored as the letter
   `b`, and an arrow as `à`, to be read through a font this machine very likely
   does not have. Left alone they come out as tofu, so they are translated into
   the Unicode that means the same thing and set in the ordinary face. */
const PX_SYMBOL = {
  0x41:'Α',0x42:'Β',0x43:'Χ',0x44:'Δ',0x45:'Ε',0x46:'Φ',0x47:'Γ',0x48:'Η',0x49:'Ι',0x4A:'ϑ',
  0x4B:'Κ',0x4C:'Λ',0x4D:'Μ',0x4E:'Ν',0x4F:'Ο',0x50:'Π',0x51:'Θ',0x52:'Ρ',0x53:'Σ',0x54:'Τ',
  0x55:'Υ',0x56:'ς',0x57:'Ω',0x58:'Ξ',0x59:'Ψ',0x5A:'Ζ',
  0x61:'α',0x62:'β',0x63:'χ',0x64:'δ',0x65:'ε',0x66:'φ',0x67:'γ',0x68:'η',0x69:'ι',0x6A:'ϕ',
  0x6B:'κ',0x6C:'λ',0x6D:'μ',0x6E:'ν',0x6F:'ο',0x70:'π',0x71:'θ',0x72:'ρ',0x73:'σ',0x74:'τ',
  0x75:'υ',0x76:'ϖ',0x77:'ω',0x78:'ξ',0x79:'ψ',0x7A:'ζ',
  0x22:'∀',0x24:'∃',0x40:'≅',0x5C:'∴',0x7E:'∼',0xA3:'≤',0xA5:'∞',0xAC:'←',0xAD:'↑',0xAE:'→',
  0xAF:'↓',0xB0:'°',0xB1:'±',0xB2:'″',0xB3:'≥',0xB4:'×',0xB6:'∂',0xB7:'•',0xB8:'÷',0xB9:'≠',
  0xBA:'≡',0xBB:'≈',0xBC:'…',0xC5:'⊕',0xC7:'∩',0xC8:'∪',0xCE:'∈',0xD6:'√',0xD7:'⋅',0xD8:'¬',
  0xD9:'∧',0xDA:'∨',0xE5:'Σ',0xF2:'∫',0xF0:'◊'
};
const PX_WING = {
  0x28:'☎',0x2B:'✉',0x4A:'☺',0x4C:'☹',0x6C:'●',0x6D:'❍',0x6E:'■',0x6F:'❑',0x70:'❒',0x71:'❏',
  0x72:'❏',0x73:'◆',0x74:'◗',0x75:'❑',0x76:'❖',0x77:'◆',0x78:'✗',0x9F:'•',0xA7:'▪',0xA8:'◘',
  0xD8:'➢',0xD9:'➣',0xE0:'➔',0xE8:'➨',0xF0:'⇦',0xF2:'⇧',0xF3:'⇩',0xFC:'✔',0xFD:'✘',0xFE:'☒'
};
const pxIsSymFont = f => /wingdings|webdings|symbol|monotype sorts/i.test(f || '');
function pxSymChar(ch, font){
  const code = ch.codePointAt(0), low = code & 0xFF;
  if(/wingdings|webdings|sorts/i.test(font)) return PX_WING[low] || (code >= 0xE000 ? '▪' : ch);
  return PX_SYMBOL[low] || ch;
}
const pxSymText = (t, font) => !t || !pxIsSymFont(font) ? t
  : [...t].map(c => pxSymChar(c, font)).join('');
/* a bullet from one of them, said in letters this machine actually has */
function pxBullet(ch, font){
  if(!ch) return '';
  if(!pxIsSymFont(font)) return ch;
  return pxSymChar(ch, font) === ch && ch.codePointAt(0) >= 0xE000 ? '•' : pxSymChar(ch, font);
}
const PX_ROMAN = ['','i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv'];
function pxAutoNum(type, n){
  const t = type || 'arabicPeriod';
  const al = String.fromCharCode(96 + ((n - 1) % 26) + 1);
  const body = /roman/i.test(t) ? (PX_ROMAN[n] || String(n)) : /alpha/i.test(t) ? al : String(n);
  const cased = /Uc/.test(t) ? body.toUpperCase() : body;
  if(/ParenBoth/.test(t)) return '(' + cased + ')';
  if(/ParenR/.test(t)) return cased + ')';
  if(/Period/.test(t)) return cased + '.';
  return cased;
}

/* Lay a body of text out inside its box and hand back the SVG for it. This is
   the one place in the app that breaks its own lines: the browser cannot be
   asked, because the answer has to be the same in an <img> as it is on screen. */
function pxTextSVG(txBody, box, ctx, chain, phKind){
  const bodyPr = pxK(txBody, 'bodyPr');
  const ins = {
    l: pxEmu(pxN(bodyPr, 'lIns', 91440)), r: pxEmu(pxN(bodyPr, 'rIns', 91440)),
    t: pxEmu(pxN(bodyPr, 'tIns', 45720)), b: pxEmu(pxN(bodyPr, 'bIns', 45720))
  };
  const anchor = pxA(bodyPr, 'anchor') || 't';
  const wrap = (pxA(bodyPr, 'wrap') || 'square') !== 'none';
  const vert = pxA(bodyPr, 'vert') || 'horz';
  const fit = pxK(bodyPr, 'normAutofit');
  const fs = fit ? pxN(fit, 'fontScale', 100000) / 100000 : 1;
  const lnRed = fit ? pxN(fit, 'lnSpcReduction', 0) / 100000 : 0;
  const turned = vert === 'vert' || vert === 'vert270' || vert === 'eaVert';
  const W = (turned ? box.h : box.w) - ins.l - ins.r;
  const H = (turned ? box.w : box.h) - ins.t - ins.b;
  const defTab = pxEmu(pxN(bodyPr, 'defTabSz', 914400));
  const own = pxK(txBody, 'lstStyle');
  const full = own ? [own].concat(chain) : chain;

  const lines = [];                       // {segs, w, h, asc, pPr, first}
  let numbering = {};
  for(const p of pxKs(txBody, 'p')){
    const pPr = pxK(p, 'pPr');
    const lvl = clamp(Math.round(pxN(pPr, 'lvl', 0)), 0, 8);
    const pStack = (pPr ? [pPr] : []).concat(pxLvlProps(full, lvl, 'p'));
    const rStack = pxLvlProps(full, lvl, 'r');
    const algn = pxPick(pStack, n => pxA(n, 'algn')) || 'l';
    const marL = pxEmu(pxPick(pStack, n => pxN(n, 'marL', null)) != null ? pxPick(pStack, n => pxN(n, 'marL', null)) : 0);
    const indRaw = pxPick(pStack, n => pxN(n, 'indent', null));
    const ind = pxEmu(indRaw == null ? 0 : indRaw);
    const runs = [];
    for(const r of p.children){
      if(r.localName === 'r'){
        const t = pxK(r, 't');
        const f = pxRunFont(pxK(r, 'rPr'), rStack, ctx, fs);
        runs.push({ t: pxSymText(t ? t.textContent : '', f.sym), f });
      }else if(r.localName === 'br'){
        runs.push({ br: true, f: pxRunFont(pxK(r, 'rPr'), rStack, ctx, fs) });
      }else if(r.localName === 'fld'){
        const type = pxA(r, 'type') || '';
        const t = pxK(r, 't');
        let text = t ? t.textContent : '';
        if(/slidenum/i.test(type)) text = String(ctx.num);
        runs.push({ t: text, f: pxRunFont(pxK(r, 'rPr'), rStack, ctx, fs) });
      }
    }
    const endPr = pxK(p, 'endParaRPr');
    const empty = !runs.some(r => r.t);
    const baseF = runs.length ? runs.find(r => r.t) : null;
    const pf = (baseF && baseF.f) || pxRunFont(endPr, rStack, ctx, fs);

    /* the bullet, if this level wears one */
    let bullet = null;
    const buNone = pxPick(pStack, n => pxK(n, 'buNone') ? true : (pxK(n, 'buChar') || pxK(n, 'buAutoNum') ? false : null));
    if(!empty && buNone === false){
      const ch = pxPick(pStack, n => pxK(n, 'buChar'));
      const au = pxPick(pStack, n => pxK(n, 'buAutoNum'));
      const font = pxPick(pStack, n => { const f = pxK(n, 'buFont'); return f ? pxA(f, 'typeface') : null; });
      const sz = pxPick(pStack, n => { const s = pxK(n, 'buSzPct'); return s ? pxN(s, 'val', 100000) / 100000 : null; }) || 1;
      const clr = pxPick(pStack, n => { const c = pxK(n, 'buClr'); return c ? pxColorIn(c, ctx, ctx.ph) : null; });
      let text = '';
      if(au){
        const key = 'l' + lvl;
        numbering[key] = (numbering[key] || (pxN(au, 'startAt', 1) - 1)) + 1;
        text = pxAutoNum(pxA(au, 'type'), numbering[key]);
      }else if(ch) text = pxBullet(pxA(ch, 'char'), font);
      if(text){
        const bf = { ...pf, size: pf.size * sz, css: pf.css.replace(/[\d.]+px/, rd(pf.size * sz) + 'px'), col: clr || pf.col };
        if(font && !/^\+/.test(font)){ bf.family = pxFontStack(font); bf.css = (pf.bold ? '700 ' : '400 ') + rd(bf.size) + 'px ' + bf.family; }
        bf.key = bf.css + '|0';
        bullet = { t: text + ' ', f: bf };
      }
    }

    /* break the runs into lines that fit */
    const avail = Math.max(8, W - marL - Math.max(0, -ind) * 0);
    const first = { segs: [], w: 0, h: 0, asc: 0 };
    let line = first;
    const push = (t, f) => {
      if(!t) return;
      const w = pxWidth(t, f);
      line.segs.push({ t, f, w });
      line.w += w;
      line.h = Math.max(line.h, f.size);
      line.asc = Math.max(line.asc, pxAscent(f));
    };
    const newline = () => {
      lines.push(line);
      line = { segs: [], w: 0, h: 0, asc: 0, cont: true };
    };
    if(bullet){ line.bullet = bullet; }
    for(const r of runs){
      if(r.br){ line.h = line.h || r.f.size; line.asc = line.asc || pxAscent(r.f); newline(); continue; }
      const toks = String(r.t).match(/[^\S\n]+|\n|[^\s]+/g) || [];
      for(let tk of toks){
        if(tk === '\n'){ line.h = line.h || r.f.size; line.asc = line.asc || pxAscent(r.f); newline(); continue; }
        if(tk.indexOf('\t') >= 0) tk = tk.replace(/\t/g, '    ');
        const w = pxWidth(tk, r.f);
        const room = line === first ? avail - Math.max(0, ind) - (bullet ? 0 : 0) : avail;
        if(wrap && line.segs.length && line.w + w > room + .5 && !/^\s+$/.test(tk)){
          newline();
          /* a word longer than the line is cut where it must be, not left to
             run off the slide */
          if(w > room){
            let acc = '';
            for(const chx of tk){
              if(pxWidth(acc + chx, r.f) > room && acc){ push(acc, r.f); newline(); acc = chx; }
              else acc += chx;
            }
            push(acc, r.f);
            continue;
          }
        }
        push(tk, r.f);
      }
    }
    if(!line.segs.length && !line.h){ line.h = pf.size; line.asc = pxAscent(pf); }
    lines.push(line);
    /* every line of this paragraph carries the paragraph's own settings */
    const lnSpcEl = pxPick(pStack, n => pxK(n, 'lnSpc'));
    const spcPct = lnSpcEl && pxK(lnSpcEl, 'spcPct') ? pxN(pxK(lnSpcEl, 'spcPct'), 'val', 100000) / 100000 : null;
    const spcPts = lnSpcEl && pxK(lnSpcEl, 'spcPts') ? pxN(pxK(lnSpcEl, 'spcPts'), 'val', 0) / 100 : null;
    const befEl = pxPick(pStack, n => pxK(n, 'spcBef')), aftEl = pxPick(pStack, n => pxK(n, 'spcAft'));
    const spOf = el => {
      if(!el) return 0;
      const pts = pxK(el, 'spcPts'), pct = pxK(el, 'spcPct');
      if(pts) return pxN(pts, 'val', 0) / 100;
      if(pct) return pxN(pct, 'val', 0) / 100000 * pf.size;
      return 0;
    };
    const para = { algn, marL, ind, spcPct, spcPts, bef: spOf(befEl), aft: spOf(aftEl), defTab };
    for(let i = lines.length - 1; i >= 0; i--){
      if(lines[i].para) break;
      lines[i].para = para;
      lines[i].first = !lines[i].cont;
    }
  }

  /* how tall it all is, so it can be anchored in the box */
  let total = 0;
  for(let i = 0; i < lines.length; i++){
    const L = lines[i], p = L.para;
    const base = (L.h || 12) * 1.2;
    L.lh = Math.max(1, (p.spcPts != null ? p.spcPts : base * (p.spcPct == null ? 1 : p.spcPct)) * (1 - lnRed));
    L.gap = (L.first ? p.bef : 0);
    total += L.lh + L.gap;
  }
  let y = ins.t + (anchor === 'ctr' ? Math.max(0, (H - total) / 2) : anchor === 'b' ? Math.max(0, H - total) : 0);

  let out = '';
  for(const L of lines){
    const p = L.para;
    y += L.gap;
    const bw = L.bullet ? pxWidth(L.bullet.t, L.bullet.f) : 0;
    const textLeft = ins.l + p.marL;
    const x0 = p.algn === 'ctr' ? textLeft + (W - p.marL) / 2
             : p.algn === 'r' ? ins.l + W
             : textLeft;
    const anchorAttr = p.algn === 'ctr' ? ' text-anchor="middle"' : p.algn === 'r' ? ' text-anchor="end"' : '';
    const baseY = y + L.asc;
    if(L.bullet && L.first && L.segs.length){
      const bx = p.algn === 'ctr' ? x0 - L.w / 2 - bw : p.algn === 'r' ? x0 - L.w - bw : textLeft + p.ind;
      out += pxRunSVG([{ t: L.bullet.t.trimEnd(), f: L.bullet.f }], bx, baseY, '', ctx);
    }
    if(L.segs.length) out += pxRunSVG(L.segs, x0, baseY, anchorAttr, ctx);
    y += L.lh;
  }
  if(!out) return '';
  /* sideways text is the same layout, turned about the middle of its box */
  if(turned){
    const a = vert === 'vert270' ? -90 : 90;
    const cx = box.w / 2, cy = box.h / 2;
    return '<g transform="rotate(' + a + ' ' + rd(cx) + ' ' + rd(cy) + ') translate(' +
      rd(cx - box.h / 2) + ' ' + rd(cy - box.w / 2) + ')">' + out + '</g>';
  }
  return out;
}
/* one line: a <text> with a tspan per change of face, and a rectangle behind
   whatever was highlighted */
function pxRunSVG(pieces, x, y, anchorAttr, ctx){
  /* the line arrived broken into words, because that is how it was measured —
     but a word is not a change of face, and letters shape better across a whole
     run than across a dozen abutting ones */
  const segs = [];
  for(const p of pieces){
    const last = segs[segs.length - 1];
    if(last && last.f === p.f){ last.t += p.t; last.w += p.w; }
    else segs.push({ t: p.t, f: p.f, w: p.w });
  }
  const f0 = segs[0].f;
  let marks = '';
  let cx = x;
  if(anchorAttr){
    const tot = segs.reduce((s, g) => s + g.w, 0);
    cx = anchorAttr.indexOf('middle') > 0 ? x - tot / 2 : x - tot;
  }
  for(const s of segs){
    if(s.f.hl) marks += '<rect x="' + rd(cx) + '" y="' + rd(y - s.f.size * .82) + '" width="' + rd(s.w) +
      '" height="' + rd(s.f.size * 1.05) + '" fill="' + s.f.hl.hex + '" fill-opacity="' + rd(s.f.hl.a) + '"/>';
    cx += s.w;
  }
  const deco = (f) => (f.un ? 'underline' : '') + (f.strike ? (f.un ? ' ' : '') + 'line-through' : '');
  const spans = segs.map(s => {
    const f = s.f;
    const same = f === f0;
    const attrs =
      (same ? '' : ' font-family="' + esc(f.family) + '" font-size="' + rd(f.size) + '"' +
        (f.bold ? ' font-weight="700"' : '') + (f.ital ? ' font-style="italic"' : '')) +
      (f.col ? ' fill="' + f.col.hex + '"' + (f.col.a < 1 ? ' fill-opacity="' + rd(f.col.a) + '"' : '') : '') +
      (f.spc ? ' letter-spacing="' + rd(f.spc) + '"' : '') +
      (deco(f) ? ' text-decoration="' + deco(f) + '"' : '') +
      (f.base ? ' dy="' + rd(-f.base * f.size) + '"' : '');
    return '<tspan' + attrs + '>' + esc(s.t) + '</tspan>' +
      (f.base ? '<tspan dy="' + rd(f.base * f.size) + '"></tspan>' : '');
  }).join('');
  return marks + '<text x="' + rd(x) + '" y="' + rd(y) + '"' + anchorAttr +
    ' font-family="' + esc(f0.family) + '" font-size="' + rd(f0.size) + '"' +
    (f0.bold ? ' font-weight="700"' : '') + (f0.ital ? ' font-style="italic"' : '') +
    ' fill="' + (f0.col ? f0.col.hex : '#000000') + '" xml:space="preserve">' + spans + '</text>';
}
/* the words of a shape, for titles, notes and searching */
function pxPlainText(txBody){
  if(!txBody) return '';
  return pxKs(txBody, 'p').map(p => {
    let s = '';
    for(const r of p.children){
      if(r.localName === 'r'){ const t = pxK(r, 't'); s += t ? t.textContent : ''; }
      else if(r.localName === 'fld'){ const t = pxK(r, 't'); s += t ? t.textContent : ''; }
      else if(r.localName === 'br') s += ' ';
    }
    return s;
  }).filter(s => s.trim()).join('\n');
}

/* ---------- one shape ---------- */
function pxXfrm(node){
  const x = pxK(node, 'xfrm');
  if(!x) return null;
  const off = pxK(x, 'off'), ext = pxK(x, 'ext');
  const chOff = pxK(x, 'chOff'), chExt = pxK(x, 'chExt');
  return {
    x: pxEmu(pxN(off, 'x', 0)), y: pxEmu(pxN(off, 'y', 0)),
    w: pxEmu(pxN(ext, 'cx', 0)), h: pxEmu(pxN(ext, 'cy', 0)),
    rot: pxDeg(pxN(x, 'rot', 0)), fh: pxBool(x, 'flipH', false), fv: pxBool(x, 'flipV', false),
    ch: chOff && chExt ? { x: pxEmu(pxN(chOff, 'x', 0)), y: pxEmu(pxN(chOff, 'y', 0)),
      w: pxEmu(pxN(chExt, 'cx', 0)), h: pxEmu(pxN(chExt, 'cy', 0)) } : null
  };
}
/* the transform that puts a shape where it goes, flips and turns included */
function pxPlace(t){
  let s = 'translate(' + rd(t.x) + ' ' + rd(t.y) + ')';
  if(t.rot) s += ' rotate(' + rd(t.rot) + ' ' + rd(t.w / 2) + ' ' + rd(t.h / 2) + ')';
  if(t.fh) s += ' translate(' + rd(t.w) + ' 0) scale(-1 1)';
  if(t.fv) s += ' translate(0 ' + rd(t.h) + ') scale(1 -1)';
  return s;
}
/* which placeholder a shape is, and the ones it inherits from */
function pxPh(sp){
  const ph = pxDeep(pxK(sp, 'nvSpPr') || pxK(sp, 'nvPicPr') || pxK(sp, 'nvGraphicFramePr'), 'ph');
  if(!ph) return null;
  return { type: pxA(ph, 'type') || 'body', idx: pxA(ph, 'idx') };
}
const PX_TITLE = { title:1, ctrTitle:1 };
function pxPhMatch(list, want){
  if(!want) return null;
  let byIdx = null, byType = null;
  for(const s of list){
    const p = s.ph;
    if(!p) continue;
    if(want.idx != null && p.idx != null && p.idx === want.idx) byIdx = byIdx || s;
    if(p.type === want.type) byType = byType || s;
    else if(PX_TITLE[p.type] && PX_TITLE[want.type]) byType = byType || s;
    else if(/^(body|subTitle|obj)$/.test(p.type) && /^(body|subTitle|obj)$/.test(want.type)) byType = byType || s;
  }
  return byIdx || byType;
}
/* which of the master's three text styles a placeholder reads from */
function pxTxStyle(master, ph){
  const st = pxK(master.doc, 'txStyles');
  if(!st || !ph) return st ? pxK(st, 'otherStyle') : null;
  if(PX_TITLE[ph.type]) return pxK(st, 'titleStyle');
  if(/^(body|subTitle|obj|tbl|chart|dgm|pic|media|clipArt)$/.test(ph.type)) return pxK(st, 'bodyStyle');
  return pxK(st, 'otherStyle');
}

function pxShapeSVG(sp, ctx, from){
  const ph = pxPh(sp);
  const lay = ph && ctx.layout ? pxPhMatch(ctx.layout.phs, ph) : null;
  const mst = ph && ctx.master ? pxPhMatch(ctx.master.phs, ph) : null;
  const spPr = pxK(sp, 'spPr');
  const style = pxK(sp, 'style');
  const t = pxXfrm(spPr) ||
    (lay && pxXfrm(pxK(lay.sp, 'spPr'))) || (mst && pxXfrm(pxK(mst.sp, 'spPr')));
  /* one side of it may be nothing — a rule across a slide is a shape with no
     height at all — but a shape with neither is not on the slide */
  if(!t || (!(t.w > 0) && !(t.h > 0))) return '';
  ctx.ph = null;

  /* geometry: the shape's own, else the one it inherits from its placeholder */
  const geom = pxGeom(spPr, t.w, t.h) ||
    (lay && pxGeom(pxK(lay.sp, 'spPr'), t.w, t.h)) ||
    (mst && pxGeom(pxK(mst.sp, 'spPr'), t.w, t.h)) ||
    (sp.localName === 'cxnSp' ? { d: 'M0 0L' + pxPt(t.w, t.h), open: true } : null);

  /* fill: written on the shape, else its style's reference, else its
     placeholder's — and a plain text box has none at all */
  const txBox = pxBool(pxIn(sp, 'nvSpPr/cNvSpPr'), 'txBox', false);
  const ref = pxStyleRef(style, ctx, 'fill');
  let fill = pxFillOf(spPr, ctx, ref && ref.ph, t);
  if(!fill && ref && ref.node) fill = pxFillEl(ref.node, ctx, ref.ph, t);
  if(!fill && lay) fill = pxFillOf(pxK(lay.sp, 'spPr'), ctx, null, t);
  if(!fill && mst && ph && !PX_TITLE[ph.type]) fill = pxFillOf(pxK(mst.sp, 'spPr'), ctx, null, t);
  if(!fill) fill = { fill: 'none', op: 1 };

  const lref = pxStyleRef(style, ctx, 'ln');
  let ln = pxLineOf(spPr, ctx, lref && lref.ph);
  if(!ln && lref && lref.node) ln = pxLineFrom(lref.node, ctx, lref.ph);
  if(!ln && lay) ln = pxLineOf(pxK(lay.sp, 'spPr'), ctx, null);
  if(ln && ln.none) ln = null;

  let body = '';
  if(geom){
    const stroke = ln && ln.stroke
      ? ' stroke="' + ln.stroke + '" stroke-width="' + rd(ln.w) + '"' +
        (ln.op < 1 ? ' stroke-opacity="' + rd(ln.op) + '"' : '') +
        (ln.dash ? ' stroke-dasharray="' + ln.dash + '"' : '') +
        ' stroke-linecap="' + ln.cap + '" stroke-linejoin="' + ln.join + '"' +
        (ln.head ? ' marker-start="' + pxMarker(ctx, ln.head.t, ln.stroke, 'head', ln.head.s) + '"' : '') +
        (ln.tail ? ' marker-end="' + pxMarker(ctx, ln.tail.t, ln.stroke, 'tail', ln.tail.s) + '"' : '')
      : '';
    body += '<path d="' + geom.d + '" fill="' + (geom.open ? 'none' : fill.fill) + '"' +
      (!geom.open && fill.op < 1 ? ' fill-opacity="' + rd(fill.op) + '"' : '') +
      (geom.open ? '' : ' fill-rule="evenodd"') + stroke + pxShadow(spPr, ctx) + '/>';
  }
  /* the words on it */
  const txBody = pxK(sp, 'txBody');
  if(txBody && pxKs(txBody, 'p').length){
    const chain = [];
    if(lay) chain.push(pxIn(lay.sp, 'txBody/lstStyle'));
    if(mst) chain.push(pxIn(mst.sp, 'txBody/lstStyle'));
    if(ctx.master) chain.push(pxTxStyle(ctx.master, ph));
    chain.push(ctx.D.defaultText);
    /* a shape drawn from a theme style takes that style's text colour */
    const fref = pxK(style, 'fontRef');
    ctx.ph = fref ? (pxColorIn(fref, ctx) || {}).hex : null;
    body += pxTextSVG(txBody, { w: t.w, h: t.h }, ctx, chain.filter(Boolean), ph && ph.type);
  }
  if(!body) return '';
  return '<g transform="' + pxPlace(t) + '">' + body + '</g>';
}

function pxPicSVG(pic, ctx){
  const spPr = pxK(pic, 'spPr');
  const t = pxXfrm(spPr);
  if(!t || !(t.w > 0) || !(t.h > 0)) return '';
  const bf = pxK(pic, 'blipFill');
  const blip = pxK(bf, 'blip');
  const rid = blip && (pxRel(blip, 'embed') || pxRel(blip, 'link'));
  const part = rid && ctx.rel(rid);
  const rec = part && ctx.D.media[part];
  const geom = pxGeom(spPr, t.w, t.h);
  let inner = '';
  if(rec && rec.ok){
    const href = ctx.inline ? pxDataURL(rec) : pxBlobURL(rec);
    /* a cropped picture is drawn bigger than its box and clipped back to it */
    const sr = pxK(bf, 'srcRect');
    let x = 0, y = 0, w = t.w, h = t.h;
    if(sr){
      const l = pxN(sr, 'l', 0) / 100000, r = pxN(sr, 'r', 0) / 100000;
      const tp = pxN(sr, 't', 0) / 100000, b = pxN(sr, 'b', 0) / 100000;
      const kx = 1 - l - r, ky = 1 - tp - b;
      if(kx > .01 && ky > .01){
        w = t.w / kx; h = t.h / ky; x = -l * w; y = -tp * h;
      }
    }
    const alpha = pxDeep(blip, 'alphaModFix');
    const op = alpha ? pxN(alpha, 'amt', 100000) / 100000 : 1;
    const clip = 'pc' + (ctx.uid++);
    ctx.defs.push('<clipPath id="' + clip + '"><path d="' + (geom ? geom.d : PX_SHAPE.rect(t.w, t.h)) + '"/></clipPath>');
    inner = '<g clip-path="url(#' + clip + ')"><image href="' + esc(href) + '" x="' + rd(x) + '" y="' + rd(y) +
      '" width="' + rd(w) + '" height="' + rd(h) + '" preserveAspectRatio="none"' +
      (op < 1 ? ' opacity="' + rd(op) + '"' : '') + '/></g>';
  }else{
    /* a picture in a format no browser draws — an .emf pasted out of Word, a
       .tiff off a scanner. A quiet frame says where it was without pretending. */
    const name = rec ? rec.ext.toUpperCase() : 'picture';
    inner = '<rect width="' + rd(t.w) + '" height="' + rd(t.h) + '" fill="#f2f2f2" stroke="#c9c9c9" ' +
      'stroke-dasharray="4 3"/><text x="' + rd(t.w / 2) + '" y="' + rd(t.h / 2) +
      '" text-anchor="middle" font-family="system-ui,sans-serif" font-size="' +
      rd(clamp(Math.min(t.w, t.h) / 8, 6, 13)) + '" fill="#8a8a8a">' + esc(name) + '</text>';
  }
  const ln = pxLineOf(spPr, ctx, null);
  const stroke = ln && ln.stroke && !ln.none
    ? '<path d="' + (geom ? geom.d : PX_SHAPE.rect(t.w, t.h)) + '" fill="none" stroke="' + ln.stroke +
      '" stroke-width="' + rd(ln.w) + '"' + (ln.dash ? ' stroke-dasharray="' + ln.dash + '"' : '') + '/>'
    : '';
  return '<g transform="' + pxPlace(t) + '"' + pxShadow(spPr, ctx) + '>' + inner + stroke + '</g>';
}

/* ---------- tables ---------- */
function pxTableSVG(tbl, ctx, t){
  const cols = pxKs(pxIn(tbl, 'tblGrid'), 'gridCol').map(c => pxEmu(pxN(c, 'w', 0)));
  const rows = pxKs(tbl, 'tr');
  if(!cols.length || !rows.length) return '';
  const tblPr = pxK(tbl, 'tblPr');
  const idEl = pxDeep(tblPr, 'tableStyleId');
  const st = ctx.D.tableStyle(idEl ? idEl.textContent : null);
  const firstRow = pxBool(tblPr, 'firstRow', false), bandRow = pxBool(tblPr, 'bandRow', false);
  /* the columns are what the deck says they are, scaled to the frame it drew */
  const sumW = cols.reduce((a, b) => a + b, 0) || t.w;
  const kx = t.w / sumW;
  const xs = [0];
  cols.forEach(c => xs.push(xs[xs.length - 1] + c * kx));
  const hs = rows.map(r => pxEmu(pxN(r, 'h', 0)));
  const sumH = hs.reduce((a, b) => a + b, 0) || t.h;
  const ky = sumH > 0 ? t.h / sumH : 1;
  const ys = [0];
  hs.forEach(h => ys.push(ys[ys.length - 1] + h * ky));

  let cells = '', text = '';
  rows.forEach((tr, ri) => {
    let ci = 0;
    for(const tc of pxKs(tr, 'tc')){
      const span = Math.max(1, Math.round(pxN(tc, 'gridSpan', 1)));
      const rspan = Math.max(1, Math.round(pxN(tc, 'rowSpan', 1)));
      const merged = pxBool(tc, 'hMerge', false) || pxBool(tc, 'vMerge', false);
      const x = xs[Math.min(ci, xs.length - 1)], y = ys[Math.min(ri, ys.length - 1)];
      const w = (xs[Math.min(ci + span, xs.length - 1)] || t.w) - x;
      const h = (ys[Math.min(ri + rspan, ys.length - 1)] || t.h) - y;
      ci += span;
      if(merged) continue;
      const tcPr = pxK(tc, 'tcPr');
      let fill = pxFillOf(tcPr, ctx, null, { w, h });
      if(!fill && st){
        const band = firstRow && ri === 0 ? st.firstRow : (bandRow && ri % 2 === (firstRow ? 0 : 1) ? st.band : null);
        fill = pxFillOf(band || st.whole, ctx, null, { w, h }) ||
          (band !== st.whole ? pxFillOf(st.whole, ctx, null, { w, h }) : null);
      }
      if(fill && fill.fill !== 'none')
        cells += '<rect x="' + rd(x) + '" y="' + rd(y) + '" width="' + rd(w) + '" height="' + rd(h) +
          '" fill="' + fill.fill + '"' + (fill.op < 1 ? ' fill-opacity="' + rd(fill.op) + '"' : '') + '/>';
      /* the four edges, each of which the cell may draw differently */
      for(const [k, x1, y1, x2, y2] of [['lnT', x, y, x + w, y], ['lnB', x, y + h, x + w, y + h],
        ['lnL', x, y, x, y + h], ['lnR', x + w, y, x + w, y + h]]){
        const l = pxLineFrom(pxK(tcPr, k), ctx, null);
        if(l && l.stroke && !l.none)
          cells += '<path d="M' + pxPt(x1, y1) + 'L' + pxPt(x2, y2) + '" stroke="' + l.stroke +
            '" stroke-width="' + rd(l.w) + '"' + (l.op < 1 ? ' stroke-opacity="' + rd(l.op) + '"' : '') +
            (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + ' fill="none"/>';
      }
      const tx = pxK(tc, 'txBody');
      if(tx){
        const bold = firstRow && ri === 0 && st && st.firstBold;
        ctx.ph = null;
        const chain = [ctx.D.defaultText].filter(Boolean);
        const inner = pxTextSVG(tx, { w, h }, ctx, chain, null);
        if(inner) text += '<g transform="translate(' + rd(x) + ' ' + rd(y) + ')"' +
          (bold ? ' font-weight="700"' : '') + '>' + inner + '</g>';
      }
    }
  });
  return '<g transform="' + pxPlace(t) + '">' + cells + text + '</g>';
}

/* ---------- charts ----------
   A chart part carries the last numbers PowerPoint drew it from, cached right
   there in the XML — so the picture can be drawn again here without the
   workbook it came from. Bars, columns, lines, areas, pies and scatters cover
   nearly every chart anybody puts on a slide. */
function pxChartSVG(ch, ctx, t){
  const plot = pxIn(ch, 'chart/plotArea');
  if(!plot) return '';
  const series = [];
  let kind = null, barDir = 'col', stacked = false, holeSize = 0;
  for(const p of plot.children){
    const n = p.localName;
    if(!/Chart$/.test(n)) continue;
    const k = n.replace(/Chart$/, '');
    if(!kind) kind = k;
    if(k === 'bar'){ barDir = pxA(pxK(p, 'barDir'), 'val') || 'col'; }
    if(pxA(pxK(p, 'grouping'), 'val') === 'stacked' || pxA(pxK(p, 'grouping'), 'val') === 'percentStacked') stacked = true;
    if(k === 'doughnut') holeSize = pxN(pxK(p, 'holeSize'), 'val', 50) / 100;
    for(const s of pxKs(p, 'ser')){
      const cat = pxDeep(pxK(s, 'cat'), 'ptCount') ? pxK(s, 'cat') : pxK(s, 'cat');
      const valNode = pxK(s, 'val') || pxK(s, 'yVal');
      const xNode = pxK(s, 'xVal');
      const pts = [];
      const numCache = valNode && pxDeep(valNode, 'numCache');
      if(numCache) for(const pt of pxKs(numCache, 'pt')){
        const v = pxK(pt, 'v');
        pts[Math.round(pxN(pt, 'idx', 0))] = v ? parseFloat(v.textContent) : null;
      }
      const labs = [];
      const strCache = cat && (pxDeep(cat, 'strCache') || pxDeep(cat, 'numCache'));
      if(strCache) for(const pt of pxKs(strCache, 'pt')){
        const v = pxK(pt, 'v');
        labs[Math.round(pxN(pt, 'idx', 0))] = v ? v.textContent : '';
      }
      const xs = [];
      const xCache = xNode && (pxDeep(xNode, 'numCache') || pxDeep(xNode, 'strCache'));
      if(xCache) for(const pt of pxKs(xCache, 'pt')){
        const v = pxK(pt, 'v');
        xs[Math.round(pxN(pt, 'idx', 0))] = v ? parseFloat(v.textContent) : null;
      }
      const nameCache = pxDeep(pxK(s, 'tx'), 'v');
      const col = pxColorIn(pxIn(s, 'spPr/solidFill'), ctx) ||
        pxColorIn(pxIn(s, 'spPr/ln/solidFill'), ctx);
      const dpts = pxKs(s, 'dPt').map(d => pxColorIn(pxIn(d, 'spPr/solidFill'), ctx));
      series.push({ k, pts, labs, xs, name: nameCache ? nameCache.textContent : '', col, dpts });
    }
  }
  if(!series.length) return '';
  const acc = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7'];
  const themed = i => (ctx.th && ctx.th.clrs && ctx.th.clrs['accent' + (i % 6 + 1)]) || acc[i % acc.length];
  const W = t.w, H = t.h;
  const pad = { l: Math.min(46, W * .12), r: Math.min(16, W * .05), t: Math.min(20, H * .1), b: Math.min(30, H * .16) };
  const font = 'font-family="system-ui,sans-serif" font-size="' + rd(clamp(Math.min(W, H) / 26, 5, 11)) + '"';
  let body = '<rect width="' + rd(W) + '" height="' + rd(H) + '" fill="#ffffff" fill-opacity="0.01"/>';

  if(kind === 'pie' || kind === 'doughnut'){
    const pts = series[0].pts.filter(v => isFinite(v) && v > 0);
    const total = pts.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 * .82;
    let a0 = -Math.PI / 2;
    pts.forEach((v, i) => {
      const sw = v / total * Math.PI * 2;
      const col = (series[0].dpts[i] && series[0].dpts[i].hex) || themed(i);
      const a = pxArc(cx, cy, R, R, a0, sw);
      if(holeSize){
        const r2 = R * holeSize;
        const b = pxArc(cx, cy, r2, r2, a0 + sw, -sw);
        body += '<path d="M' + pxPt(a.start[0], a.start[1]) + a.d + 'L' + pxPt(b.start[0], b.start[1]) + b.d +
          'Z" fill="' + col + '" stroke="#fff" stroke-width="1"/>';
      }else{
        body += '<path d="M' + pxPt(cx, cy) + 'L' + pxPt(a.start[0], a.start[1]) + a.d +
          'Z" fill="' + col + '" stroke="#fff" stroke-width="1"/>';
      }
      a0 += sw;
    });
    return '<g transform="' + pxPlace(t) + '">' + body + '</g>';
  }

  const cats = Math.max.apply(null, series.map(s => s.pts.length).concat([1]));
  let lo = 0, hi = 0;
  for(const s of series) for(const v of s.pts) if(isFinite(v)){ lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if(stacked){
    hi = 0;
    for(let i = 0; i < cats; i++){
      let sum = 0;
      for(const s of series) if(isFinite(s.pts[i])) sum += s.pts[i];
      hi = Math.max(hi, sum);
    }
  }
  if(hi === lo){ hi = lo + 1; }
  const px = W - pad.l - pad.r, py = H - pad.t - pad.b;
  const Y = v => pad.t + py - (v - lo) / (hi - lo) * py;
  const step = px / Math.max(1, cats);
  /* the frame, and four gridlines through it */
  for(let g = 0; g <= 4; g++){
    const v = lo + (hi - lo) * g / 4, y = Y(v);
    body += '<path d="M' + pxPt(pad.l, y) + 'H' + rd(W - pad.r) + '" stroke="#d8d8d8" stroke-width="0.6"/>' +
      '<text x="' + rd(pad.l - 4) + '" y="' + rd(y + 3) + '" text-anchor="end" ' + font +
      ' fill="#666">' + esc(pxNumLabel(v)) + '</text>';
  }
  if(kind === 'scatter'){
    series.forEach((s, si) => {
      const col = (s.col && s.col.hex) || themed(si);
      let xl = Infinity, xh = -Infinity;
      for(const v of s.xs) if(isFinite(v)){ xl = Math.min(xl, v); xh = Math.max(xh, v); }
      if(!isFinite(xl)){ xl = 0; xh = Math.max(1, s.pts.length); }
      const X = v => pad.l + (v - xl) / ((xh - xl) || 1) * px;
      s.pts.forEach((v, i) => {
        if(!isFinite(v)) return;
        const x = X(isFinite(s.xs[i]) ? s.xs[i] : i);
        body += '<circle cx="' + rd(x) + '" cy="' + rd(Y(v)) + '" r="2" fill="' + col + '"/>';
      });
    });
  }else if(kind === 'line' || kind === 'area'){
    series.forEach((s, si) => {
      const col = (s.col && s.col.hex) || themed(si);
      const d = s.pts.map((v, i) => isFinite(v)
        ? (i ? 'L' : 'M') + pxPt(pad.l + step * (i + .5), Y(v)) : '').join('');
      if(!d) return;
      if(kind === 'area')
        body += '<path d="' + d + 'L' + pxPt(pad.l + step * (s.pts.length - .5), Y(lo)) +
          'L' + pxPt(pad.l + step * .5, Y(lo)) + 'Z" fill="' + col + '" fill-opacity="0.55"/>';
      body += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round"/>';
    });
  }else{
    const n = stacked ? 1 : series.length;
    const bw = step / (n + .6) * .9;
    series.forEach((s, si) => {
      const col = (s.col && s.col.hex) || themed(si);
      let stack = [];
      s.pts.forEach((v, i) => {
        if(!isFinite(v)) return;
        const base = stacked ? (stack[i] || 0) : 0;
        const y0 = Y(base), y1 = Y(base + v);
        const x = pad.l + step * i + (stacked ? (step - bw) / 2 : (step - bw * n) / 2 + si * bw);
        body += '<rect x="' + rd(x) + '" y="' + rd(Math.min(y0, y1)) + '" width="' + rd(bw) +
          '" height="' + rd(Math.abs(y1 - y0)) + '" fill="' + col + '"/>';
      });
      if(stacked) s.pts.forEach((v, i) => { if(isFinite(v)) stack[i] = (stack[i] || 0) + v; });
    });
  }
  /* the names along the bottom, thinned until they fit */
  const labs = series[0].labs;
  const every = Math.ceil((labs.length * 30) / Math.max(60, px));
  labs.forEach((L, i) => {
    if(!L || i % every) return;
    body += '<text x="' + rd(pad.l + step * (i + .5)) + '" y="' + rd(H - pad.b + 10) +
      '" text-anchor="middle" ' + font + ' fill="#666">' + esc(String(L).slice(0, 14)) + '</text>';
  });
  return '<g transform="' + pxPlace(t) + '">' + body + '</g>';
}
const pxNumLabel = v => Math.abs(v) >= 10000 ? (v / 1000).toFixed(0) + 'k'
  : Math.abs(v) >= 100 || v === Math.round(v) ? String(Math.round(v)) : v.toFixed(1);

/* ---------- the shape tree ---------- */
function pxTree(tree, ctx, from){
  let out = '';
  for(const node of tree.children){
    out += pxNodeSVG(node, ctx, from);
  }
  return out;
}
function pxNodeSVG(node, ctx, from){
  switch(node.localName){
    case 'sp': case 'cxnSp': return pxShapeSVG(node, ctx, from);
    case 'pic': return pxPicSVG(node, ctx);
    case 'grpSp': return pxGroupSVG(node, ctx, from);
    case 'graphicFrame': return pxFrameSVG(node, ctx);
    case 'AlternateContent': {
      /* the fallback is the one drawn with shapes anybody can read; the choice
         is usually an extension this cannot (ink, a newer effect) */
      const fb = pxK(node, 'Fallback') || pxK(node, 'Choice');
      return fb ? pxTree(fb, ctx, from) : '';
    }
    default: return '';
  }
}
function pxGroupSVG(g, ctx, from){
  const t = pxXfrm(pxK(g, 'grpSpPr'));
  if(!t) return pxTree(g, ctx, from);
  const inner = pxTree(g, ctx, from);
  if(!inner) return '';
  const ch = t.ch || { x: 0, y: 0, w: t.w, h: t.h };
  const sx = ch.w ? t.w / ch.w : 1, sy = ch.h ? t.h / ch.h : 1;
  let tr = 'translate(' + rd(t.x) + ' ' + rd(t.y) + ')';
  if(t.rot) tr += ' rotate(' + rd(t.rot) + ' ' + rd(t.w / 2) + ' ' + rd(t.h / 2) + ')';
  if(t.fh) tr += ' translate(' + rd(t.w) + ' 0) scale(-1 1)';
  if(t.fv) tr += ' translate(0 ' + rd(t.h) + ') scale(1 -1)';
  tr += ' scale(' + rd(sx) + ' ' + rd(sy) + ') translate(' + rd(-ch.x) + ' ' + rd(-ch.y) + ')';
  return '<g transform="' + tr + '">' + inner + '</g>';
}
/* a table, a chart or a diagram — whatever was framed on the slide */
function pxFrameSVG(fr, ctx){
  const t = pxXfrm(fr);
  if(!t) return '';
  const data = pxIn(fr, 'graphic/graphicData');
  if(!data) return '';
  const uri = pxA(data, 'uri') || '';
  const tbl = pxK(data, 'tbl');
  if(tbl) return pxTableSVG(tbl, ctx, t);
  if(/chart/.test(uri)){
    const rid = pxRel(pxK(data, 'chart'), 'id');
    const part = rid && ctx.rel(rid);
    const doc = part && ctx.D.part(part);
    if(doc){
      const was = ctx.rel;
      ctx.rel = ctx.D.relOf(part);           // the chart's own pictures are its own
      const out = pxChartSVG(doc.documentElement, ctx, t);
      ctx.rel = was;
      return out;
    }
  }
  if(/diagram/.test(uri)){
    /* SmartArt keeps a drawn copy of itself — the same shapes under another
       namespace, which is exactly what the tree walker already reads */
    const ext = pxDeep(fr, 'dataModelExt');
    const rid = ext ? (pxA(ext, 'relId') || pxRel(ext, 'id')) : null;
    let part = rid && ctx.rel(rid);
    if(!part) part = ctx.rel(null, 'diagramDrawing');
    const doc = part && ctx.D.part(part);
    const tree = doc && (pxDeep(doc.documentElement, 'spTree') || doc.documentElement);
    if(tree){
      const was = ctx.rel;
      ctx.rel = ctx.D.relOf(part);
      const inner = pxTree(tree, ctx, 'diagram');
      ctx.rel = was;
      if(inner) return '<g transform="translate(' + rd(t.x) + ' ' + rd(t.y) + ')">' + inner + '</g>';
    }
  }
  return '';
}

/* ---------- one slide, drawn ---------- */
function pxBackground(node, ctx, W, H){
  const bg = pxK(node, 'bg');
  if(!bg) return '';
  const pr = pxK(bg, 'bgPr');
  if(pr){
    const f = pxFillOf(pr, ctx, null, { w: W, h: H });
    if(f && f.fill !== 'none')
      return '<rect width="' + rd(W) + '" height="' + rd(H) + '" fill="' + f.fill + '"' +
        (f.op < 1 ? ' fill-opacity="' + rd(f.op) + '"' : '') + '/>';
    return '';
  }
  const ref = pxK(bg, 'bgRef');
  if(ref){
    const col = pxColorIn(ref, ctx);
    const idx = Math.round(pxN(ref, 'idx', 1));
    const node2 = ctx.th && ctx.th.fmt && (idx > 1000 ? ctx.th.fmt.bg[idx - 1001] : ctx.th.fmt.fill[idx - 1]);
    const f = node2 ? pxFillEl(node2, ctx, col && col.hex, { w: W, h: H }) : null;
    if(f && f.fill !== 'none')
      return '<rect width="' + rd(W) + '" height="' + rd(H) + '" fill="' + f.fill + '"' +
        (f.op < 1 ? ' fill-opacity="' + rd(f.op) + '"' : '') + '/>';
  }
  return '';
}

/* ---------- the deck ---------- */
const pxAbs = (base, target) => {
  let t = String(target || '');
  if(!t) return '';
  if(t.charAt(0) === '/') return t.replace(/^\/+/, '');
  if(/^https?:/i.test(t)) return '';
  const dir = base.replace(/\/[^/]*$/, '');
  const parts = (dir + '/' + t).split('/');
  const out = [];
  for(const p of parts){
    if(p === '.' || p === '') continue;
    if(p === '..') out.pop(); else out.push(p);
  }
  return out.join('/');
};
const pxRelsPath = p => p.replace(/([^/]+)$/, '_rels/$1.rels');

async function pptxRead(file){
  const kind = pptxKind(file);
  if(kind === 'ppt')
    throw new Error('that is the old binary .ppt format — open it and save it again as .pptx');
  if(kind === 'odp')
    throw new Error('that is an OpenDocument presentation — save it as .pptx and it will open');
  if(file.size > PPTX_MAXMB * 1048576)
    throw new Error('that deck is ' + Math.round(file.size / 1048576) + ' MB, which is more than this can hold open');
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if(!(head[0] === 0x50 && head[1] === 0x4b))
    throw new Error('that file is not a slide deck — a .pptx is a zip, and this one is not');
  const z = zipOpen(buf);

  const parts = {}, rels = {}, media = {};
  const part = name => parts[name] || null;
  const readXml = async name => {
    if(parts[name] !== undefined) return parts[name];
    let doc = null;
    try{
      const txt = await zipText(z, name, 'deck');
      doc = txt ? xmlDoc(txt) : null;
    }catch(e){ doc = null; }
    return (parts[name] = doc);
  };
  const readRels = async name => {
    if(rels[name]) return rels[name];
    const map = {};
    const doc = await readXml(pxRelsPath(name));
    if(doc) for(const r of doc.querySelectorAll('Relationship'))
      map[r.getAttribute('Id')] = { t: pxAbs(name, r.getAttribute('Target')),
        type: String(r.getAttribute('Type') || '').split('/').pop() };
    return (rels[name] = map);
  };
  /* a lookup by id, or — when a part points at something without naming the
     relationship — by what kind of thing it is */
  const relOf = name => (id, byType) => {
    const map = rels[name] || {};
    if(id && map[id]) return map[id].t;
    if(byType) for(const k in map) if(map[k].type === byType) return map[k].t;
    return null;
  };

  const pres = await readXml('ppt/presentation.xml');
  if(!pres || !pres.documentElement) throw new Error('there is no presentation inside that file');
  await readRels('ppt/presentation.xml');
  const sz = pxK(pres.documentElement, 'sldSz');
  const W = pxEmu(pxN(sz, 'cx', 9144000)), H = pxEmu(pxN(sz, 'cy', 6858000));

  /* every picture in the deck, unpacked once — most are stored rather than
     deflated (a .png is already squeezed), so this costs almost nothing */
  for(const name in z.at){
    if(!/^ppt\/media\//i.test(name)) continue;
    const ext = (name.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
    if(!PX_MIME[ext]) continue;
    let bytes = null;
    try{ bytes = await zipBytes(z, name, 'deck'); }catch(e){ bytes = null; }
    media[name] = { bytes, ext, mime: PX_MIME[ext], ok: !!bytes && PX_DRAWABLE.test(ext), url: null, data: null };
  }

  /* the theme, and the masters and layouts that stand behind every slide */
  const themeOf = async path => {
    const doc = await readXml(path);
    const root = doc && doc.documentElement;
    const el = root && pxK(root, 'themeElements');
    const clrs = {};
    const scheme = pxK(el, 'clrScheme');
    if(scheme) for(const c of scheme.children){
      const got = pxColor(c.children[0], { th: { clrs: {} }, map: {} });
      clrs[c.localName] = got ? got.hex : '#000000';
    }
    const fonts = pxK(el, 'fontScheme');
    const fmt = pxK(el, 'fmtScheme');
    return {
      clrs,
      major: pxA(pxIn(fonts, 'majorFont/latin'), 'typeface') || 'Calibri',
      minor: pxA(pxIn(fonts, 'minorFont/latin'), 'typeface') || 'Calibri',
      fmt: fmt ? {
        fill: pxK(fmt, 'fillStyleLst') ? [...pxK(fmt, 'fillStyleLst').children] : [],
        ln: pxK(fmt, 'lnStyleLst') ? [...pxK(fmt, 'lnStyleLst').children] : [],
        bg: pxK(fmt, 'bgFillStyleLst') ? [...pxK(fmt, 'bgFillStyleLst').children] : []
      } : null
    };
  };
  const shapesOf = tree => {
    const out = [];
    if(tree) for(const s of tree.children){
      if(s.localName !== 'sp') continue;
      out.push({ sp: s, ph: pxPh(s) });
    }
    return out;
  };
  const masters = {}, layouts = {}, themes = {};
  const masterOf = async path => {
    if(masters[path]) return masters[path];
    const doc = await readXml(path);
    const root = doc && doc.documentElement;
    if(!root) return (masters[path] = null);
    const map = await readRels(path);
    let themePath = null;
    for(const k in map) if(map[k].type === 'theme') themePath = map[k].t;
    if(themePath && !themes[themePath]) themes[themePath] = await themeOf(themePath);
    const cm = pxK(root, 'clrMap');
    const clrMap = {};
    if(cm) for(const a of cm.attributes) clrMap[a.name] = a.value;
    const tree = pxIn(root, 'cSld/spTree');
    return (masters[path] = { doc: root, path, tree, phs: shapesOf(tree), clrMap,
      th: themes[themePath] || null, showMaster: pxBool(root, 'showMasterSp', true) });
  };
  const layoutOf = async path => {
    if(layouts[path]) return layouts[path];
    const doc = await readXml(path);
    const root = doc && doc.documentElement;
    if(!root) return (layouts[path] = null);
    const map = await readRels(path);
    let mpath = null;
    for(const k in map) if(map[k].type === 'slideMaster') mpath = map[k].t;
    const master = mpath ? await masterOf(mpath) : null;
    const tree = pxIn(root, 'cSld/spTree');
    return (layouts[path] = { doc: root, path, tree, phs: shapesOf(tree), master,
      showMaster: pxBool(root, 'showMasterSp', true) });
  };

  /* the slides, in the order the deck lists them */
  const prMap = rels['ppt/presentation.xml'];
  const order = [];
  for(const s of pxKs(pxK(pres.documentElement, 'sldIdLst'), 'sldId')){
    const rid = pxRel(s, 'id');
    const p = rid && prMap[rid] && prMap[rid].t;
    if(p) order.push(p);
  }
  if(!order.length) throw new Error('there are no slides in that deck');

  /* the table styles the deck ships with, for the tables that name one */
  let tblStyles = null;
  const tableStyle = id => {
    if(!tblStyles) return null;
    return tblStyles[String(id || '').toUpperCase()] || tblStyles.def || null;
  };

  const D = {
    name: file.name || 'deck.pptx', size: file.size,
    w: rd(W), h: rd(H), count: order.length, ratio: W / H,
    media, part, relOf, tableStyle,
    defaultText: pxK(pres.documentElement, 'defaultTextStyle'),
    slides: order.map(p => ({ path: p, svg: null, title: null, notes: null })),
    free(){
      for(const k in media) if(media[k].url){ URL.revokeObjectURL(media[k].url); media[k].url = null; media[k].data = null; }
    }
  };

  /* one slide: read, drawn, and remembered */
  D.slide = async function(i, opts){
    i = clamp(Math.round(i), 0, order.length - 1);
    const inline = !!(opts && opts.inline);
    const S = D.slides[i];
    if(!inline && S.svg) return S;
    const path = S.path;
    const doc = await readXml(path);
    const map = await readRels(path);
    const root = doc && doc.documentElement;
    if(!root){ S.svg = pxBlankSVG(W, H, 'slide ' + (i + 1) + ' could not be read'); return S; }
    let lpath = null, npath = null;
    for(const k in map){
      if(map[k].type === 'slideLayout') lpath = map[k].t;
      if(map[k].type === 'notesSlide') npath = map[k].t;
    }
    const layout = lpath ? await layoutOf(lpath) : null;
    const master = (layout && layout.master) || null;
    /* every part the slide leans on has to be in hand before it is drawn */
    if(master) await readRels(master.path);
    if(layout) await readRels(layout.path);
    for(const k in map){
      if(/^(chart|diagram)/.test(map[k].type)){
        await readXml(map[k].t);
        await readRels(map[k].t);
      }
    }
    if(tblStyles === null) tblStyles = await pxTableStyles(readXml);

    const ctx = {
      D, th: (master && master.th) || themes[Object.keys(themes)[0]] || { clrs:{}, major:'Calibri', minor:'Calibri', fmt:null },
      map: (master && master.clrMap) || {}, defs: [], uid: 1, inline,
      num: i + 1, layout: null, master: null, rel: relOf(path), ph: null
    };
    /* a slide may turn the master's colours round for itself */
    const ovr = pxIn(root, 'clrMapOvr/overrideClrMapping');
    if(ovr){ const m = {}; for(const a of ovr.attributes) m[a.name] = a.value; ctx.map = m; }

    const showMaster = pxBool(root, 'showMasterSp', true);
    let body = '';
    /* the background is the slide's own, or the layout's, or the master's —
       whichever declares one first, and read against that part's own pictures */
    const bg = pxK(pxIn(root, 'cSld'), 'bg') ? { doc: root, path }
      : (layout && pxK(pxIn(layout.doc, 'cSld'), 'bg') ? { doc: layout.doc, path: layout.path }
      : (master && pxK(pxIn(master.doc, 'cSld'), 'bg') ? { doc: master.doc, path: master.path } : null));
    if(bg){
      ctx.layout = layout; ctx.master = master; ctx.rel = relOf(bg.path);
      body += pxBackground(pxIn(bg.doc, 'cSld'), ctx, W, H);
    }
    /* the master's furniture, then the layout's, then the slide itself */
    const slidePhs = shapesOf(pxIn(root, 'cSld/spTree'));
    const furniture = (holder, src) => {
      if(!holder || !holder.tree) return '';
      ctx.layout = layout; ctx.master = master;
      /* a logo on the master is the master's own picture: while its shapes are
         drawn, relationships are looked up in the master's part, not the
         slide's, or every one of them comes back empty */
      ctx.rel = relOf(holder.path);
      let out = '';
      for(const node of holder.tree.children){
        /* Only what the designer drew on the master — the band across the top,
           the logo, the rule above the footer. A placeholder here is a prompt
           and a set of defaults, never something to draw: PowerPoint shows a
           footer or a page number on a slide only where the slide itself
           carries one, which is why a deck with the footer switched off has an
           empty strip rather than the master's words in it. */
        if(node.localName === 'sp' && pxPh(node)) continue;
        out += pxNodeSVG(node, ctx, src);
      }
      return out;
    };
    if(showMaster && master && (!layout || layout.showMaster)) body += furniture(master, 'master');
    if(showMaster && layout) body += furniture(layout, 'layout');
    ctx.layout = layout; ctx.master = master; ctx.rel = relOf(path);
    body += pxTree(pxIn(root, 'cSld/spTree'), ctx, 'slide');

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" class="slsvg" viewBox="0 0 ' + rd(W) + ' ' + rd(H) +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Slide ' + (i + 1) + '">' +
      (ctx.defs.length ? '<defs>' + ctx.defs.join('') + '</defs>' : '') +
      '<rect width="' + rd(W) + '" height="' + rd(H) + '" fill="#ffffff"/>' + body + '</svg>';
    if(!inline) S.svg = svg;
    /* what it is called: its title, or failing that the first words on it */
    if(S.title == null){
      let title = '';
      for(const s of slidePhs)
        if(s.ph && PX_TITLE[s.ph.type]){ title = pxPlainText(pxK(s.sp, 'txBody')); break; }
      if(!title) for(const s of slidePhs){
        title = pxPlainText(pxK(s.sp, 'txBody'));
        if(title) break;
      }
      S.title = (title || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    }
    if(S.notes == null && npath){
      const nd = await readXml(npath);
      const body2 = nd && nd.documentElement;
      let txt = '';
      if(body2) for(const s of pxKs(pxIn(body2, 'cSld/spTree'), 'sp')){
        const ph = pxPh(s);
        if(ph && ph.type === 'sldNum') continue;
        const t2 = pxPlainText(pxK(s, 'txBody'));
        if(t2) txt += (txt ? '\n' : '') + t2;
      }
      S.notes = txt;
    }else if(S.notes == null) S.notes = '';
    return inline ? { ...S, svg } : S;
  };
  return D;
}
const pxBlankSVG = (w, h, msg) =>
  '<svg xmlns="http://www.w3.org/2000/svg" class="slsvg" viewBox="0 0 ' + rd(w) + ' ' + rd(h) +
  '" preserveAspectRatio="xMidYMid meet"><rect width="' + rd(w) + '" height="' + rd(h) +
  '" fill="#ffffff"/><text x="' + rd(w / 2) + '" y="' + rd(h / 2) + '" text-anchor="middle" ' +
  'font-family="system-ui,sans-serif" font-size="' + rd(h / 26) + '" fill="#9aa0a6">' + esc(msg) + '</text></svg>';

/* the deck's own table styles, kept in a part of their own */
async function pxTableStyles(readXml){
  const doc = await readXml('ppt/tableStyles.xml');
  const root = doc && doc.documentElement;
  const out = {};
  if(!root) return out;
  const def = String(root.getAttribute('def') || '').toUpperCase();
  for(const st of pxKs(root, 'tblStyle')){
    const id = String(pxA(st, 'styleId') || '').toUpperCase();
    const rec = {
      whole: pxIn(st, 'wholeTbl/tcStyle/fill'),
      firstRow: pxIn(st, 'firstRow/tcStyle/fill'),
      band: pxIn(st, 'band1H/tcStyle/fill'),
      firstBold: /^(on|1|true)$/i.test(pxA(pxIn(st, 'firstRow/tcTxStyle'), 'b') || '')
    };
    out[id] = rec;
    if(id === def) out.def = rec;
  }
  return out;
}

/* ---------- a slide as a picture ----------
   The SVG is handed to the browser as an image and drawn onto a canvas, which
   is how a slide becomes a .png you can tape onto the page. Every picture in it
   has to be inline for that: an <img> is a sealed room, and a blob url is
   outside it. */
function pptxRaster(svg, w, h, px, type, q){
  return new Promise((res, rej) => {
    const scale = Math.max(1, (px || 1600) / Math.max(1, w));
    const cw = Math.max(1, Math.round(w * scale)), chh = Math.max(1, Math.round(h * scale));
    const im = new Image();
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    im.onload = () => {
      try{
        const c = document.createElement('canvas');
        c.width = cw; c.height = chh;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cw, chh);
        g.drawImage(im, 0, 0, cw, chh);
        res(c.toDataURL(type || 'image/png', q == null ? .92 : q));
      }catch(e){ rej(e); }
    };
    im.onerror = () => rej(new Error('the slide could not be turned into a picture'));
    im.src = url;
  });
}
