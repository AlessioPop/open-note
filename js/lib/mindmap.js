/* Open Note — lib/mindmap.js
   the shape of a thinking map: its tree, and where every box on it goes.

   A map is stored as what it means — a list of nodes, each naming its parent
   and, where the kind cares, which side of the middle it belongs on. Nothing
   here knows what a map is *for*: the nine kinds live in the feature file and
   are written out of the primitives below, so adding a tenth is one block in
   one file rather than an edit spread across a layout engine.

   Two things this file owes the rest of the app:

   - **Text is measured, then wrapped, then boxed.** Every kind needs to know
     how big a node is before it can place one, and a box that disagrees with
     the glyphs inside it is the one flaw a reader always notices. A canvas
     measurer is handed in from outside (mmSetMeasurer) because the layout is
     drawn as SVG text and has to agree with it exactly; the table below stands
     in when there is no measurer, so this file keeps working with no DOM at
     all.
   - **Every layout works in its own comfortable coordinates** and is fitted
     into the frame afterwards by mmFrame(). A brace map three thousand units
     wide and a bubble map six hundred across are then the same size on the
     paper, and no kind has to think about the frame it will be read in. The
     frame is a fixed width and whatever height the map turns out to need, so a
     wide flow map is a wide short card and a deep tree is a tall one — the
     content is centred on the origin and the view does the framing, which is
     what lets that height change without moving the map inside it. */

const MM_W = 1000;                             /* the frame every map is fitted into… */
const MM_H = 620, MM_HMIN = 300, MM_HMAX = 860;/* …as wide as this, and as tall as it needs */
const mmClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mmRd = v => Math.round(v * 10) / 10;

/* ================= measuring type =================
   The fallback is a width table in ems, gathered per character class. It is
   never exact, but it is never wildly wrong either, and it is only ever asked
   when nothing has offered something better. */
const MM_NARROW = "ijltIfr.,;:'!|()[]{}/\\ ";
const MM_WIDE = 'mwMW@%—';
function mmGuessW(s, fs, bold){
  let w = 0;
  for(const ch of String(s)){
    w += MM_NARROW.includes(ch) ? .31 : MM_WIDE.includes(ch) ? .92
       : ch >= 'A' && ch <= 'Z' ? .66 : .535;
  }
  return w * fs * (bold ? 1.045 : 1);
}
let MM_MEASURE = null;
/* fn(text, fontSize, bold) → width in the same units the layout works in */
function mmSetMeasurer(fn){ MM_MEASURE = typeof fn === 'function' ? fn : null; }
function mmTextW(s, fs, bold){
  if(!s) return 0;
  if(MM_MEASURE){
    const w = MM_MEASURE(String(s), fs, !!bold);
    if(w > 0 || s === '') return w;
  }
  return mmGuessW(s, fs, bold);
}

/* Greedy wrapping, and a long word broken rather than allowed to burst the
   box — a pasted URL should make an ugly node, never a broken map. */
function mmWrap(text, fs, maxW, bold, maxLines){
  const src = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if(!src) return [''];
  const out = [];
  for(const word of src.split(' ')){
    if(!out.length){ out.push(word); continue; }
    const join = out[out.length - 1] + ' ' + word;
    if(mmTextW(join, fs, bold) <= maxW) out[out.length - 1] = join;
    else out.push(word);
  }
  /* A word wider than the box widens the box; only one that would be absurd
     — a pasted URL, a chemical name — is broken across lines. Breaking a word
     because it was a few pixels too wide is how "Standard" becomes "Standar d",
     and that is worse than a box a little wider than asked for. */
  const hard = maxW * 1.55;
  const broken = [];
  for(const line of out){
    if(mmTextW(line, fs, bold) <= hard || line.length < 2){ broken.push(line); continue; }
    let cur = '';
    for(const ch of line){
      if(cur && mmTextW(cur + ch, fs, bold) > maxW){ broken.push(cur); cur = ch; }
      else cur += ch;
    }
    if(cur) broken.push(cur);
  }
  if(maxLines && broken.length > maxLines){
    const cut = broken.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S{0,2}$/, '') + '…';
    return cut;
  }
  return broken;
}

/* A node's box: its wrapped lines and the room they need. `shape` decides how
   much air goes round them — a circle has to hold a rectangle of text inside a
   round outline, which costs about forty per cent more of both. */
function mmBox(text, o){
  o = o || {};
  const fs = o.fs || 17, bold = !!o.bold;
  const maxW = o.maxW || 190, padX = o.padX == null ? 15 : o.padX;
  const padY = o.padY == null ? 11 : o.padY, lead = o.lead || 1.3;
  const shape = o.shape || 'round';
  /* `maxW` is the widest the finished box may be, so the writing wraps inside
     the padding rather than up to the outside edge — and a round outline holds
     less of a rectangle than a square one does, which is the 1.42 */
  const round = shape === 'circle' || shape === 'ellipse';
  const inner = Math.max(fs * 2.2, (maxW - padX * 2) / (round ? 1.42 : 1));
  const lines = mmWrap(text, fs, inner, bold, o.maxLines);
  let tw = 0;
  for(const l of lines) tw = Math.max(tw, mmTextW(l, fs, bold));
  const th = lines.length * fs * lead;
  let w = tw + padX * 2, h = Math.max(th + padY * 2, fs * lead + padY * 2);
  if(round){
    w = tw * 1.42 + padX * 2; h = th * 1.5 + padY * 1.4;
    if(shape === 'circle'){ const d = Math.max(w, h); w = d; h = d; }
  }
  if(shape === 'pill') w += fs * .5;
  /* `inner` is the width the writing was wrapped to and `tw` the widest line
     it came out at — what a caret placed over the box has to be told, so that
     typing wraps exactly where the drawing will */
  return { lines, fs, bold, shape, lead, tw: Math.round(tw), inner: Math.round(inner),
    w: Math.max(o.minW || 54, Math.round(w)),
    h: Math.max(o.minH || 34, Math.round(h)) };
}

/* ================= the tree =================
   Nodes are flat and name their parent, which is the only shape that survives
   a change of kind: the same five thoughts are a flow when the map is a flow
   and causes when it is a multi-flow, without a record being rewritten. */
const mmNodes = map => Array.isArray(map.nodes) ? map.nodes : (map.nodes = []);
const mmById = map => new Map(mmNodes(map).map(n => [n.id, n]));
const mmRoots = map => mmNodes(map).filter(n => !n.pid || !mmNodes(map).some(p => p.id === n.pid));
const mmKids = (map, id) => mmNodes(map).filter(n => n.pid === id);
/* every id at or under one node, the node itself first */
function mmSubtree(map, id){
  const out = [], seen = new Set();
  (function walk(x){
    if(seen.has(x)) return;
    seen.add(x); out.push(x);
    for(const k of mmKids(map, x)) walk(k.id);
  })(id);
  return out;
}
/* how many leaves hang off a node — what a radial layout shares its angle by */
function mmLeaves(map, id, folded){
  const kids = folded && folded(id) ? [] : mmKids(map, id);
  if(!kids.length) return 1;
  let n = 0;
  for(const k of kids) n += mmLeaves(map, k.id, folded);
  return n;
}

/* ================= geometry =================
   Boxes are stored by their centre. Every path below therefore starts by
   asking where a line leaves one, which is the only place the shape of a node
   matters to a connector. */
function mmEdge(b, tx, ty){
  const dx = tx - b.x, dy = ty - b.y;
  if(!dx && !dy) return { x: b.x, y: b.y };
  if(b.shape === 'circle' || b.shape === 'ellipse'){
    const rx = b.w / 2, ry = b.h / 2;
    const t = 1 / Math.hypot(dx / rx, dy / ry);
    return { x: b.x + dx * t, y: b.y + dy * t };
  }
  const rx = b.w / 2, ry = b.h / 2;
  const t = Math.min(Math.abs(rx / dx) || Infinity, Math.abs(ry / dy) || Infinity);
  return { x: b.x + dx * t, y: b.y + dy * t };
}
function mmRoundRect(x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  return 'M' + mmRd(x + r) + ' ' + mmRd(y) + 'h' + mmRd(w - r * 2) +
    'a' + mmRd(r) + ' ' + mmRd(r) + ' 0 0 1 ' + mmRd(r) + ' ' + mmRd(r) +
    'v' + mmRd(h - r * 2) + 'a' + mmRd(r) + ' ' + mmRd(r) + ' 0 0 1 ' + mmRd(-r) + ' ' + mmRd(r) +
    'h' + mmRd(-(w - r * 2)) + 'a' + mmRd(r) + ' ' + mmRd(r) + ' 0 0 1 ' + mmRd(-r) + ' ' + mmRd(-r) +
    'v' + mmRd(-(h - r * 2)) + 'a' + mmRd(r) + ' ' + mmRd(r) + ' 0 0 1 ' + mmRd(r) + ' ' + mmRd(-r) + 'z';
}
const mmShapePath = b => b.shape === 'circle' || b.shape === 'ellipse'
  ? 'M' + mmRd(b.x - b.w / 2) + ' ' + mmRd(b.y) +
    'a' + mmRd(b.w / 2) + ' ' + mmRd(b.h / 2) + ' 0 1 0 ' + mmRd(b.w) + ' 0' +
    'a' + mmRd(b.w / 2) + ' ' + mmRd(b.h / 2) + ' 0 1 0 ' + mmRd(-b.w) + ' 0z'
  : mmRoundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h,
      b.shape === 'pill' ? b.h / 2 : b.shape === 'rect' ? 3 : Math.min(14, b.h * .32));

/* A straight lead, edge to edge */
function mmLine(a, b){
  const p = mmEdge(a, b.x, b.y), q = mmEdge(b, a.x, a.y);
  return 'M' + mmRd(p.x) + ' ' + mmRd(p.y) + 'L' + mmRd(q.x) + ' ' + mmRd(q.y);
}
/* The organic one: a cubic whose handles leave along the line between the two
   centres, so a branch grows out of its parent rather than being tied to it. */
function mmCurve(a, b, k){
  const p = mmEdge(a, b.x, b.y), q = mmEdge(b, a.x, a.y);
  const dx = q.x - p.x, dy = q.y - p.y, t = k == null ? .46 : k;
  return 'M' + mmRd(p.x) + ' ' + mmRd(p.y) +
    'C' + mmRd(p.x + dx * t) + ' ' + mmRd(p.y + dy * t * .18) + ' ' +
    mmRd(q.x - dx * t) + ' ' + mmRd(q.y - dy * t * .18) + ' ' +
    mmRd(q.x) + ' ' + mmRd(q.y);
}
/* The join a left-and-right tree wants: it leaves the parent horizontally and
   arrives at the child horizontally, whatever the drop between them. */
function mmSCurve(a, b){
  const dir = b.x >= a.x ? 1 : -1;
  const p = { x: a.x + dir * a.w / 2, y: a.y }, q = { x: b.x - dir * b.w / 2, y: b.y };
  const k = Math.max(18, Math.abs(q.x - p.x) * .5);
  return 'M' + mmRd(p.x) + ' ' + mmRd(p.y) +
    'C' + mmRd(p.x + dir * k) + ' ' + mmRd(p.y) + ' ' +
    mmRd(q.x - dir * k) + ' ' + mmRd(q.y) + ' ' + mmRd(q.x) + ' ' + mmRd(q.y);
}
/* Orthogonal, with the corner rounded off. `axis` says which way it sets out. */
function mmElbow(a, b, axis, r){
  const vertical = axis !== 'h';
  const p = vertical ? mmEdge(a, a.x, b.y) : mmEdge(a, b.x, a.y);
  const q = vertical ? mmEdge(b, b.x, a.y) : mmEdge(b, a.x, b.y);
  r = r == null ? 12 : r;
  const mid = vertical ? (p.y + q.y) / 2 : (p.x + q.x) / 2;
  const d1 = vertical ? Math.sign(q.y - p.y) : Math.sign(q.x - p.x);
  const d2 = vertical ? Math.sign(q.x - p.x) : Math.sign(q.y - p.y);
  const rr = Math.min(r, Math.abs(vertical ? q.x - p.x : q.y - p.y) / 2,
    Math.abs(mid - (vertical ? p.y : p.x)) || r);
  if(!d2 || !rr) return 'M' + mmRd(p.x) + ' ' + mmRd(p.y) + 'L' + mmRd(q.x) + ' ' + mmRd(q.y);
  if(vertical)
    return 'M' + mmRd(p.x) + ' ' + mmRd(p.y) + 'V' + mmRd(mid - rr * d1) +
      'q0 ' + mmRd(rr * d1) + ' ' + mmRd(rr * d2) + ' ' + mmRd(rr * d1) +
      'H' + mmRd(q.x - rr * d2) + 'q' + mmRd(rr * d2) + ' 0 ' + mmRd(rr * d2) + ' ' + mmRd(rr * d1) +
      'V' + mmRd(q.y);
  return 'M' + mmRd(p.x) + ' ' + mmRd(p.y) + 'H' + mmRd(mid - rr * d1) +
    'q' + mmRd(rr * d1) + ' 0 ' + mmRd(rr * d1) + ' ' + mmRd(rr * d2) +
    'V' + mmRd(q.y - rr * d2) + 'q0 ' + mmRd(rr * d2) + ' ' + mmRd(rr * d1) + ' ' + mmRd(rr * d2) +
    'H' + mmRd(q.x);
}
/* A curly brace whose tip points at `tipX` and whose arms wrap y0…y1 */
function mmBrace(armX, tipX, y0, y1, curl){
  const ym = (y0 + y1) / 2, spine = armX + (tipX - armX) * .45;
  const t = mmClamp((y1 - y0) * .12, 6, curl == null ? 20 : curl);
  return 'M' + mmRd(armX) + ' ' + mmRd(y0) +
    'Q' + mmRd(spine) + ' ' + mmRd(y0) + ' ' + mmRd(spine) + ' ' + mmRd(y0 + t) +
    'L' + mmRd(spine) + ' ' + mmRd(ym - t) +
    'Q' + mmRd(spine) + ' ' + mmRd(ym) + ' ' + mmRd(tipX) + ' ' + mmRd(ym) +
    'Q' + mmRd(spine) + ' ' + mmRd(ym) + ' ' + mmRd(spine) + ' ' + mmRd(ym + t) +
    'L' + mmRd(spine) + ' ' + mmRd(y1 - t) +
    'Q' + mmRd(spine) + ' ' + mmRd(y1) + ' ' + mmRd(armX) + ' ' + mmRd(y1);
}
/* the head on an arrow, pointing along `ang` */
function mmHead(x, y, ang, s){
  s = s || 11;
  const a = ang + Math.PI, w = .42;
  return 'M' + mmRd(x) + ' ' + mmRd(y) +
    'L' + mmRd(x + Math.cos(a - w) * s) + ' ' + mmRd(y + Math.sin(a - w) * s) +
    'L' + mmRd(x + Math.cos(a) * s * .62) + ' ' + mmRd(y + Math.sin(a) * s * .62) +
    'L' + mmRd(x + Math.cos(a + w) * s) + ' ' + mmRd(y + Math.sin(a + w) * s) + 'z';
}
/* a lead with a head on it, given as the pair the renderer draws */
function mmArrow(a, b, style, k){
  const q = mmEdge(b, a.x, a.y), p = mmEdge(a, b.x, b.y);
  const d = style === 'elbow' ? mmElbow(a, b, Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'h' : 'v')
    : style === 'curve' ? mmCurve(a, b, k) : mmLine(a, b);
  const ang = style === 'elbow'
    ? (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 0 : Math.PI)
       : (b.y > a.y ? Math.PI / 2 : -Math.PI / 2))
    : Math.atan2(q.y - p.y, q.x - p.x);
  return { d, head: mmHead(q.x, q.y, ang) };
}

/* ================= stacking =================
   A column of boxes centred on a point, and points evenly round a ring — the
   two every kind leans on. The gap is a map setting, so one slider loosens
   every kind at once. */
function mmColumn(boxes, cx, cy, gap){
  let h = 0;
  for(const b of boxes) h += b.h;
  h += gap * Math.max(0, boxes.length - 1);
  let y = cy - h / 2;
  for(const b of boxes){ b.x = cx; b.y = y + b.h / 2; y += b.h + gap; }
  return { top: cy - h / 2, bottom: cy + h / 2, h };
}
/* points evenly round a ring, starting at the top and going clockwise */
function mmRing(n, r, from){
  const out = [], a0 = from == null ? -Math.PI / 2 : from;
  for(let i = 0; i < n; i++){
    const a = a0 + i * 2 * Math.PI / n;
    out.push({ a, x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return out;
}

/* ================= fitting a laid-out map into the frame =================
   Every kind lays out at whatever size suits it and stops thinking about the
   paper. This is what makes them all the same size in the end: the bounds of
   everything drawn, then the transform that centres it in MM_W × MM_H. A map
   is allowed to be magnified a little when it is small — a two-node map that
   filled the frame would look like a mistake, and one that sat in the middle
   at a tenth of the size would look like another. */
function mmBounds(boxes, deco){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const eat = (a, b, c, d) => {
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
  };
  for(const b of boxes || []) eat(b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2);
  for(const d of deco || []){
    if(d.t === 'circle') eat(d.x - d.r, d.y - d.r, d.x + d.r, d.y + d.r);
    else if(d.t === 'rect') eat(d.x, d.y, d.x + d.w, d.y + d.h);
    else if(d.t === 'seg') eat(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2),
      Math.max(d.x1, d.x2), Math.max(d.y1, d.y2));
    else if(d.t === 'text') eat(d.x - 90, d.y - 18, d.x + 90, d.y + 18);
  }
  if(!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: MM_W, y1: MM_H, w: MM_W, h: MM_H };
  return { x0, y0, x1, y1, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
function mmFrame(bounds, pad, maxScale){
  pad = pad == null ? 32 : pad;
  let s = mmClamp((MM_W - pad * 2) / bounds.w, .04, maxScale == null ? 1.75 : maxScale);
  let h = bounds.h * s + pad * 2;
  if(h > MM_HMAX){ s = Math.min(s, (MM_HMAX - pad * 2) / bounds.h); h = MM_HMAX; }
  /* rounded to a step, so a word typed into a box cannot make the card breathe
     in and out a pixel at a time */
  h = mmClamp(Math.round(h / 20) * 20, MM_HMIN, MM_HMAX);
  return { s, h, tx: -(bounds.x0 + bounds.w / 2) * s, ty: -(bounds.y0 + bounds.h / 2) * s };
}

/* A polyline with its corners rounded off — what a connector that has to get
   round something is made of. Given in world units; a corner tighter than the
   segments either side of it simply comes out less round. */
function mmPoly(pts, r){
  if(!pts || pts.length < 2) return '';
  r = r == null ? 12 : r;
  let d = 'M' + mmRd(pts[0].x) + ' ' + mmRd(pts[0].y);
  for(let i = 1; i < pts.length - 1; i++){
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    if(!(k > .5)){ d += 'L' + mmRd(c.x) + ' ' + mmRd(c.y); continue; }
    d += 'L' + mmRd(c.x + (p.x - c.x) / l1 * k) + ' ' + mmRd(c.y + (p.y - c.y) / l1 * k) +
      'Q' + mmRd(c.x) + ' ' + mmRd(c.y) + ' ' +
      mmRd(c.x + (n.x - c.x) / l2 * k) + ' ' + mmRd(c.y + (n.y - c.y) / l2 * k);
  }
  const e = pts[pts.length - 1];
  return d + 'L' + mmRd(e.x) + ' ' + mmRd(e.y);
}
