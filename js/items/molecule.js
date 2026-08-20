/* Open Note — items/molecule.js
   molecules: drawn on the page the way a chemist draws them, weighed and
   named as they grow, and turned over in three dimensions. The chemistry is
   js/lib/chem.js; this file is the hand and the eye.

   An item is a molecule as far as chem.js is concerned — it.atoms and it.bonds
   are the graph, in bond lengths, y down — plus how it is shown:
     view  '2d' | '3d'        sty  skel | cond | lewis      s3  ball | stick | fill
     box   the window onto the drawing, in bonds (refitted when the hand lets go)
     yaw pitch zoom  the 3D pose     info  the strip under it     mono lab lp auto */

/* ================= the hand (none of this is saved) ================= */
let MOL_EL = 'C', MOL_TOOL = 'draw', MOL_BOND = 0, MOL_RING = 0, MOL_Q = 1;
const MOL_BONDS = [
  { o:1, s:0, t:'single' }, { o:2, s:0, t:'double' }, { o:3, s:0, t:'triple' },
  { o:1, s:1, t:'wedge — coming towards you' }, { o:1, s:2, t:'hash — going away from you' }];
const MOL_RINGS = [
  { n:6, a:1, l:'benzene' }, { n:6, a:0, l:'six-ring' }, { n:5, a:0, l:'five-ring' },
  { n:3, a:0, l:'three-ring' }, { n:4, a:0, l:'four-ring' }, { n:7, a:0, l:'seven-ring' }, { n:8, a:0, l:'eight-ring' }];
const MOL_STY = ['skel', 'cond', 'lewis'], MOL_STY_NAMES = { skel:'skeletal', cond:'condensed', lewis:'Lewis' };
const MOL_S3 = ['ball', 'stick', 'fill'], MOL_S3_NAMES = { ball:'ball and stick', stick:'sticks', fill:'space-filling' };
const MOL_BL = 2.4;                         /* a bond, in em — A− / A+ scale it through --fs */
const MOL_FS = 15;
const MOL_U = 100;                          /* viewBox units per bond */
const MOL_PAD = 1.7, MOL_MINW = 5, MOL_MINH = 3.4;   /* room round the drawing, in bonds */
const MOL_FONT = Math.round(MOL_U / MOL_BL * .95);
const MOL_CACHE = new Map(), MOL_SPIN = new Map(), MOL_SEL = new Map();
let MOL_SEQ = 0, MOL_PICK = null, MOL_KEYBUF = '', MOL_KEYT = 0, MOL_KEYAT = null;
const MOL_TWO = new Set(Object.keys(CHEM_SYM).filter(s => s.length === 2).map(s => s[0].toLowerCase()));
onBookOpen(() => {
  MOL_CACHE.clear(); MOL_SPIN.forEach(f => f()); MOL_SPIN.clear(); MOL_SEL.clear();
  MOL_PICK = null; MOL_KEYAT = null;
});
const molRd = v => Math.round(v * 100) / 100;

/* ---- editing the graph ---- */
function molAddAtom(it, e, x, y){
  it.atoms.push({ e, x: molRd(x), y: molRd(y), q: 0, h: null, iso: null });
  return it.atoms.length - 1;
}
function molAddBond(it, a, b, o, s){
  if(a === b) return -1;
  const k = chemBondAt(it, a, b);
  if(k >= 0){ it.bonds[k].o = o || 1; it.bonds[k].s = s || 0; return k; }
  it.bonds.push({ a, b, o: o || 1, s: s || 0 });
  return it.bonds.length - 1;
}
function molDelAtom(it, i){
  it.bonds = it.bonds.filter(b => b.a !== i && b.b !== i)
    .map(b => ({ ...b, a: b.a > i ? b.a - 1 : b.a, b: b.b > i ? b.b - 1 : b.b }));
  it.atoms.splice(i, 1);
  MOL_SEL.delete(it.id);
}
const molDelBond = (it, k) => it.bonds.splice(k, 1);
/* an atom at this spot already? */
function molAtomNear(it, x, y, r, not){
  let best = -1, bd = r == null ? .3 : r;
  it.atoms.forEach((a, i) => { if(i === not) return; const d = Math.hypot(a.x - x, a.y - y); if(d < bd){ bd = d; best = i; } });
  return best;
}
const molAng = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const molDiff = (u, v) => Math.atan2(Math.sin(u - v), Math.cos(u - v));
const molSnap = a => Math.round(a / (Math.PI / 6)) * (Math.PI / 6);
/* the most open direction at an atom — straight on for a triple bond, 120°
   round a chain the way it was zigzagging, the widest gap otherwise */
function molOpenDir(it, i, nb){
  nb = nb || chemNbrs(it);
  const A = it.atoms[i], angs = nb[i].map(x => molAng(A, it.atoms[x.j]));
  if(!angs.length) return -Math.PI / 6;
  if(angs.length === 1){
    const a = angs[0];
    const lin = nb[i].some(x => it.bonds[x.k].o === 3) || nb[i].filter(x => it.bonds[x.k].o === 2).length >= 2;
    if(lin) return a + Math.PI;
    const j = nb[i][0].j, pp = nb[j].find(x => x.j !== i);
    const c1 = a + 2 * Math.PI / 3, c2 = a - 2 * Math.PI / 3;
    if(pp){ const prev = molAng(it.atoms[pp.j], it.atoms[j]); return Math.abs(molDiff(c1, prev)) < Math.abs(molDiff(c2, prev)) ? c1 : c2; }
    return Math.sin(c1) <= Math.sin(c2) ? c1 : c2;      /* up rather than down */
  }
  const g = chemGap(angs);
  return g[0] + g[1] / 2;
}
/* a new bond from an atom: into the open, or onto an atom already there */
function molSprout(it, i, e, o, s){
  const A = it.atoms[i], d = molOpenDir(it, i);
  let j = molAtomNear(it, A.x + Math.cos(d), A.y + Math.sin(d), .3, i);
  if(j < 0) j = molAddAtom(it, e, A.x + Math.cos(d), A.y + Math.sin(d));
  molAddBond(it, i, j, o, s);
  return j;
}
/* rings: on the page, glued to a bond, or standing on an atom */
function molRingBonds(it, idx, arom){
  const nb = chemNbrs(it), k = idx.length;
  const hasDbl = i => nb[i] && nb[i].some(x => it.bonds[x.k].o === 2);
  const dbl = new Set(idx.filter(hasDbl));
  for(let t = 0; t < k; t++){
    const a = idx[t], b = idx[(t + 1) % k];
    if(chemBondAt(it, a, b) >= 0) continue;
    let o = 1;
    if(arom && !dbl.has(a) && !dbl.has(b)){ o = 2; dbl.add(a); dbl.add(b); }
    molAddBond(it, a, b, o, 0);
  }
}
function molRingAt(it, R, cx, cy){
  const k = R.n, r = 1 / (2 * Math.sin(Math.PI / k)), idx = [];
  for(let t = 0; t < k; t++){
    const a = -Math.PI / 2 + t * 2 * Math.PI / k;
    idx.push(molAddAtom(it, 'C', cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  molRingBonds(it, idx, R.a);
}
function molRingOnAtom(it, R, i){
  const A = it.atoms[i], k = R.n, r = 1 / (2 * Math.sin(Math.PI / k)), dir = molOpenDir(it, i);
  const cx = A.x + r * Math.cos(dir), cy = A.y + r * Math.sin(dir), a0 = dir + Math.PI, idx = [i];
  for(let t = 1; t < k; t++){
    const x = cx + r * Math.cos(a0 + t * 2 * Math.PI / k), y = cy + r * Math.sin(a0 + t * 2 * Math.PI / k);
    let j = molAtomNear(it, x, y, .25);
    if(j < 0) j = molAddAtom(it, 'C', x, y);
    idx.push(j);
  }
  molRingBonds(it, idx, R.a);
}
function molRingOnBond(it, R, kb){
  const b = it.bonds[kb], A = it.atoms[b.a], B = it.atoms[b.b], k = R.n, nb = chemNbrs(it);
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, Rr = L / (2 * Math.sin(Math.PI / k)), ap = L / (2 * Math.tan(Math.PI / k));
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  let nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L;
  /* away from whatever else hangs off the two ends */
  const others = nb[b.a].concat(nb[b.b]).map(x => x.j).filter(j => j !== b.a && j !== b.b);
  if(others.length){
    const ox = others.reduce((s, j) => s + it.atoms[j].x, 0) / others.length, oy = others.reduce((s, j) => s + it.atoms[j].y, 0) / others.length;
    if((ox - mx) * nx + (oy - my) * ny > 0){ nx = -nx; ny = -ny; }
  }
  const cx = mx + nx * ap, cy = my + ny * ap, a0 = Math.atan2(A.y - cy, A.x - cx);
  const sgn = Math.sign((A.x - cx) * (B.y - cy) - (A.y - cy) * (B.x - cx)) || 1;
  const idx = [b.a, b.b];
  for(let t = 2; t < k; t++){
    const x = cx + Rr * Math.cos(a0 + sgn * t * 2 * Math.PI / k), y = cy + Rr * Math.sin(a0 + sgn * t * 2 * Math.PI / k);
    let j = molAtomNear(it, x, y, .25);
    if(j < 0) j = molAddAtom(it, 'C', x, y);
    idx.push(j);
  }
  /* the ring runs a → b → new atoms → back to a: so the new ones go on after b */
  molRingBonds(it, [b.b].concat(idx.slice(2)).concat([b.a]), R.a);
}

/* ================= the drawing ================= */
function molBox(it){
  const A = it.atoms;
  if(!A.length) return { x: -MOL_MINW / 2, y: -MOL_MINH / 2, w: MOL_MINW, h: MOL_MINH };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  A.forEach(a => { x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); });
  let w = x1 - x0 + 2 * MOL_PAD, h = y1 - y0 + 2 * MOL_PAD, x = x0 - MOL_PAD, y = y0 - MOL_PAD;
  if(w < MOL_MINW){ x -= (MOL_MINW - w) / 2; w = MOL_MINW; }
  if(h < MOL_MINH){ y -= (MOL_MINH - h) / 2; h = MOL_MINH; }
  return { x: molRd(x), y: molRd(y), w: molRd(w), h: molRd(h) };
}
/* what an atom says about itself on the page */
function molLabel(it, i, nb, sty){
  const a = it.atoms[i], h = chemH(it, i, nb), deg = nb[i].length, rad = chemRad(it, i, nb);
  let show = true;
  if(sty === 'skel' && a.e === 'C' && deg > 0 && !a.q && !a.iso && a.h == null && !rad) show = false;
  let left = false;
  if(deg){ const mx = nb[i].reduce((s, x) => s + (it.atoms[x.j].x - a.x), 0) / deg; left = mx > .25; }
  const hs = sty === 'lewis' ? 0 : h;
  let text = a.e;
  if(hs){ const hh = 'H' + (hs > 1 ? chemSub(hs) : ''); text = left ? hh + a.e : a.e + hh; }
  if(a.iso) text = chemSup(a.iso) + text;
  return { show, text, left, h: hs, rad };
}
function molDblSide(it, b, nb){
  const A = it.atoms[b.a], B = it.atoms[b.b], dx = B.x - A.x, dy = B.y - A.y;
  let s = 0;
  const side = (P) => Math.sign(dx * (P.y - A.y) - dy * (P.x - A.x));
  nb[b.a].forEach(x => { if(x.j !== b.b) s += side(it.atoms[x.j]); });
  nb[b.b].forEach(x => { if(x.j !== b.a) s += side(it.atoms[x.j]); });
  return s >= 0 ? 1 : -1;
}
const molU = v => Math.round(v * MOL_U);
const molLine = (ax, ay, bx, by, cls) => '<line class="' + (cls || 'bd') + '" x1="' + molU(ax) + '" y1="' + molU(ay) +
  '" x2="' + molU(bx) + '" y2="' + molU(by) + '"/>';
function molBondSVG(it, b, k, nb, lab){
  const A = it.atoms[b.a], B = it.atoms[b.b];
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1e-6, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const ta = lab[b.a].show ? .27 : 0, tb = lab[b.b].show ? .27 : 0;
  const x1 = A.x + ux * ta, y1 = A.y + uy * ta, x2 = B.x - ux * tb, y2 = B.y - uy * tb;
  let out = '<g class="bg" data-k="' + k + '">';
  if(b.s === 1){
    const w = .09;
    out += '<polygon class="wg" points="' + molU(x1) + ',' + molU(y1) + ' ' + molU(x2 + nx * w) + ',' + molU(y2 + ny * w) +
      ' ' + molU(x2 - nx * w) + ',' + molU(y2 - ny * w) + '"/>';
  } else if(b.s === 2){
    for(let t = 1; t <= 6; t++){
      const f = t / 6, px = x1 + (x2 - x1) * f, py = y1 + (y2 - y1) * f, w = .1 * f;
      out += molLine(px + nx * w, py + ny * w, px - nx * w, py - ny * w, 'hs');
    }
  } else if(b.o === 2){
    if(nb[b.a].length === 1 || nb[b.b].length === 1){
      const o = .075;
      out += molLine(x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o) + molLine(x1 - nx * o, y1 - ny * o, x2 - nx * o, y2 - ny * o);
    } else {
      const o = .15 * molDblSide(it, b, nb), s = .14;
      out += molLine(x1, y1, x2, y2) + molLine(x1 + nx * o + ux * s, y1 + ny * o + uy * s, x2 + nx * o - ux * s, y2 + ny * o - uy * s);
    }
  } else if(b.o === 3){
    const o = .14;
    out += molLine(x1, y1, x2, y2) + molLine(x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o) +
      molLine(x1 - nx * o, y1 - ny * o, x2 - nx * o, y2 - ny * o);
  } else out += molLine(x1, y1, x2, y2);
  return out + '</g>';
}
/* Lewis: the hydrogens nobody drew, as atoms, and the lone pairs as dots */
function molLewisSVG(it, i, nb){
  const a = it.atoms[i], h = chemH(it, i, nb), lp = chemLP(it, i, nb);
  if(!h && !lp) return '';
  const angs = nb[i].map(x => molAng(a, it.atoms[x.j]));
  const n = h + lp, dirs = [];
  if(!angs.length) for(let t = 0; t < n; t++) dirs.push(-Math.PI / 2 + t * 2 * Math.PI / n);
  else if(angs.length === 1){ const s = 2 * Math.PI / (n + 1); for(let t = 0; t < n; t++) dirs.push(angs[0] + s * (t + 1)); }
  else { const g = chemGap(angs), s = g[1] / (n + 1); for(let t = 0; t < n; t++) dirs.push(g[0] + s * (t + 1)); }
  let out = '';
  dirs.forEach((d, t) => {
    if(t < h){
      const hx = a.x + Math.cos(d) * .72, hy = a.y + Math.sin(d) * .72;
      out += molLine(a.x + Math.cos(d) * .27, a.y + Math.sin(d) * .27, hx - Math.cos(d) * .2, hy - Math.sin(d) * .2) +
        '<text class="at lh" x="' + molU(hx) + '" y="' + molU(hy) + '" text-anchor="middle">H</text>';
    } else {
      const px = a.x + Math.cos(d) * .42, py = a.y + Math.sin(d) * .42, nx = -Math.sin(d) * .09, ny = Math.cos(d) * .09;
      out += '<circle class="lpd" cx="' + molU(px + nx) + '" cy="' + molU(py + ny) + '" r="4"/><circle class="lpd" cx="' +
        molU(px - nx) + '" cy="' + molU(py - ny) + '" r="4"/>';
    }
  });
  return out;
}
function molAtomSVG(it, i, nb, lb, sel){
  const a = it.atoms[i], x = molU(a.x), y = molU(a.y), el = CHEM_SYM[a.e];
  let out = '<g class="ag' + (lb.show ? '' : ' bare') + '" data-i="' + i + '"' +
    (a.e !== 'C' && el ? ' style="--c:' + el.color + '"' : '') + '>';
  if(chemOver(it, i, nb))
    out += '<circle class="mbad" cx="' + x + '" cy="' + y + '" r="' + Math.round(MOL_U * .3) + '"><title>' +
      esc(a.e + ' cannot hold ' + chemBondSum(it, i, nb) + ' bonds') + '</title></circle>';
  if(sel && sel.has(i)) out += '<circle class="msel" cx="' + x + '" cy="' + y + '" r="' + Math.round(MOL_U * .34) + '"/>';
  if(lb.show){
    const txt = lb.text + chemChargeText(a.q || 0) + (lb.rad ? '•' : '');
    let anchor = 'middle', dx = 0;
    if(lb.h){ const w = a.e.length * .31; if(lb.left){ anchor = 'end'; dx = w / 2; } else { anchor = 'start'; dx = -w / 2; } }
    out += '<text class="at" x="' + molU(a.x + dx) + '" y="' + y + '" text-anchor="' + anchor + '">' + esc(txt) + '</text>';
  } else if(!nb[i].length){
    out += '<circle class="dot" cx="' + x + '" cy="' + y + '" r="5"/>';
  }
  return out + '</g>';
}
/* the 2D picture: { vb, width, cls, inner } */
function molDraw2D(it, live, ghost){
  const nb = chemNbrs(it), box = it.box || molBox(it), sty = it.sty || 'skel', sel = MOL_SEL.get(it.id);
  const lab = it.atoms.map((a, i) => molLabel(it, i, nb, sty));
  let inner = '';
  it.bonds.forEach((b, k) => { inner += molBondSVG(it, b, k, nb, lab); });
  if(sty === 'lewis') it.atoms.forEach((a, i) => { inner += molLewisSVG(it, i, nb); });
  it.atoms.forEach((a, i) => { inner += molAtomSVG(it, i, nb, lab[i], live && sel); });
  inner += '<g class="mghost">' + (ghost || '') + '</g>';
  return { vb: [box.x, box.y, box.w, box.h].map(molU).join(' '), width: (box.w * MOL_BL).toFixed(2),
    cls: 'molsvg' + (sty === 'lewis' ? ' lewis' : ''), inner };
}

/* ---- in three dimensions ---- */
function molEmb(it){
  const key = it.atoms.map(a => a.e + (a.q || 0) + (a.h == null ? '' : 'h' + a.h) + molRd(a.x) + ',' + molRd(a.y)).join(';') +
    '|' + it.bonds.map(b => b.a + '-' + b.b + ':' + b.o + (b.s || 0)).join(';');
  const c = MOL_CACHE.get(it.id);
  if(c && c.key === key) return c.emb;
  const emb = it.atoms.length ? chemEmbed(it) : { atoms: [], bonds: [], arom: new Set(), nb: [] };
  MOL_CACHE.set(it.id, { key, emb });
  if(MOL_CACHE.size > 40) MOL_CACHE.delete(MOL_CACHE.keys().next().value);
  return emb;
}
/* a colour lightened or darkened: k > 0 towards white, k < 0 towards black */
function molShade(hex, k){
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = c => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
  return '#' + [f(r), f(g), f(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}
const molLum = hex => { const n = parseInt(hex.slice(1), 16); return (.299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) / 255; };
function molDraw3D(it, live, el){
  const box = it.box || molBox(it), W = molU(box.w), H = molU(box.h);
  const base = { vb: '0 0 ' + W + ' ' + H, width: (box.w * MOL_BL).toFixed(2), cls: 'molsvg m3d', inner: '' };
  const emb = molEmb(it), A = emb.atoms, s3 = it.s3 || 'ball';
  if(!A.length) return base;
  const yaw = it.yaw || 0, pitch = it.pitch || 0, zoom = it.zoom || 1;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  /* rotY(yaw) then rotX(pitch), y down and z towards the eye: dragging down
     tips the top towards you, dragging right turns the front to the right */
  const turn = (x, y, z) => [cy * x + sy * z, -sx * sy * x + cx * y + sx * cy * z, -cx * sy * x - sx * y + cx * cy * z];
  let R = 0;
  A.forEach(a => { R = Math.max(R, Math.hypot(a.x, a.y, a.z) + 1.3); });
  const s = Math.min(W, H) / (2 * R) * .94 * zoom, EYE = 3200;
  const pts = A.map(a => {
    const v = turn(a.x, a.y, a.z), k = EYE / (EYE - v[2] * s);
    return { x: W / 2 + v[0] * s * k, y: H / 2 + v[1] * s * k, z: v[2], k };
  });
  if(el) el._molPts = pts;
  const col = a => { const e = CHEM_SYM[a.e] || CHEM_SYM.C; return a.e === 'H' ? '#e9e9e9' : e.color; };
  const rad = a => { const e = CHEM_SYM[a.e] || CHEM_SYM.C; return s3 === 'fill' ? e.rvdw * .96 : s3 === 'stick' ? .17 : Math.max(.17, e.rcov * .42); };
  const bw = (s3 === 'stick' ? .32 : .16) * s;
  const seq = ++MOL_SEQ, defs = {}, pick = MOL_PICK && MOL_PICK.id === it.id ? MOL_PICK.atoms : [];
  const grad = a => {
    const c = col(a), id = 'mg' + seq + (CHEM_SYM[a.e] ? CHEM_SYM[a.e].z : 0);
    if(!defs[id]) defs[id] = '<radialGradient id="' + id + '" cx="36%" cy="34%" r="66%"><stop offset="0" stop-color="' +
      molShade(c, .55) + '"/><stop offset=".55" stop-color="' + c + '"/><stop offset="1" stop-color="' + molShade(c, -.38) + '"/></radialGradient>';
    return id;
  };
  const prim = [];
  A.forEach((a, i) => prim.push({ z: pts[i].z, t: 'a', i }));
  if(s3 !== 'fill') emb.bonds.forEach((b, k) => {
    prim.push({ z: (pts[b.a].z * 3 + pts[b.b].z) / 4 - .001, t: 'b', k, from: b.a, to: b.b });
    prim.push({ z: (pts[b.a].z + pts[b.b].z * 3) / 4 - .001, t: 'b', k, from: b.b, to: b.a });
  });
  prim.sort((p, q) => p.z - q.z);
  let out = '';
  for(const p of prim){
    if(p.t === 'a'){
      const a = A[p.i], P = pts[p.i], r = rad(a) * s * P.k, c = col(a);
      out += '<circle class="ball" cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) + '" r="' + r.toFixed(1) +
        '" fill="url(#' + grad(a) + ')" stroke="' + molShade(c, -.45) + '"/>';
      if(it.lab && (s3 !== 'ball' || a.e !== 'H'))
        out += '<text class="lb3" x="' + P.x.toFixed(1) + '" y="' + P.y.toFixed(1) + '" font-size="' + Math.max(14, r * 1.1).toFixed(0) +
          '" fill="' + (molLum(c) > .6 ? '#222' : '#fff') + '">' + a.e + '</text>';
    } else {
      const b = emb.bonds[p.k], P = pts[p.from], Q = pts[p.to], a = A[p.from];
      const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2, c = molShade(col(a), -.12);
      const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const n = s3 === 'ball' ? b.o : 1, gap = .2 * s;
      for(let t = 0; t < n; t++){
        const off = (t - (n - 1) / 2) * gap;
        out += '<line class="stick" x1="' + (P.x + nx * off).toFixed(1) + '" y1="' + (P.y + ny * off).toFixed(1) + '" x2="' + (mx + nx * off).toFixed(1) +
          '" y2="' + (my + ny * off).toFixed(1) + '" stroke="' + c + '" stroke-width="' + (n > 1 ? bw * .62 : bw).toFixed(1) + '"/>';
      }
    }
  }
  /* lone pairs as a pair of dots, where the missing bonds would point */
  if(it.lp && emb.nb){
    A.forEach((a, i) => {
      if(a.src < 0) return;
      const lp = chemLP(it, a.src); if(!lp) return;
      const us = emb.nb[i].map(x => { const v = [A[x.j].x - a.x, A[x.j].y - a.y, A[x.j].z - a.z], L = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(c => c / L); });
      const sn = us.length + lp, dirs = chemPlaceH(us, lp, chemIdeal(sn, lp) * Math.PI / 180, null);
      dirs.forEach(d => {
        const v = turn(a.x + d[0] * .75, a.y + d[1] * .75, a.z + d[2] * .75), k = EYE / (EYE - v[2] * s);
        const X = W / 2 + v[0] * s * k, Y = H / 2 + v[1] * s * k;
        const side = turn(d[1], -d[0], 0);
        out += '<circle class="lp3" cx="' + (X + side[0] * .16 * s).toFixed(1) + '" cy="' + (Y + side[1] * .16 * s).toFixed(1) + '" r="' + (.09 * s).toFixed(1) + '"/>' +
          '<circle class="lp3" cx="' + (X - side[0] * .16 * s).toFixed(1) + '" cy="' + (Y - side[1] * .16 * s).toFixed(1) + '" r="' + (.09 * s).toFixed(1) + '"/>';
      });
    });
  }
  /* what was picked: rings, and the measure between them */
  pick.forEach(i => { const P = pts[i]; if(P) out += '<circle class="pk" cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) + '" r="' + (rad(A[i]) * s * P.k + .12 * s).toFixed(1) + '"/>'; });
  if(pick.length >= 2){
    for(let t = 1; t < pick.length; t++){ const P = pts[pick[t - 1]], Q = pts[pick[t]]; out += '<line class="pkl" x1="' + P.x.toFixed(1) + '" y1="' + P.y.toFixed(1) + '" x2="' + Q.x.toFixed(1) + '" y2="' + Q.y.toFixed(1) + '"/>'; }
    const mid = pick.length === 2 ? pts[pick[0]] : pts[pick[pick.length === 3 ? 1 : 2]], other = pick.length === 2 ? pts[pick[1]] : null;
    const X = other ? (mid.x + other.x) / 2 : mid.x, Y = (other ? (mid.y + other.y) / 2 : mid.y) - .45 * s;
    out += '<text class="pkt" x="' + X.toFixed(1) + '" y="' + Y.toFixed(1) + '">' + esc(molMeasure(it, emb)) + '</text>';
  }
  base.inner = '<defs>' + Object.values(defs).join('') + '</defs>' + out;
  return base;
}
const molDraw = (it, live, el, ghost) => it.view === '3d' ? molDraw3D(it, live, el) : molDraw2D(it, live, ghost);
const molSVG = (it, live) => { const d = molDraw(it, live); return '<svg class="' + d.cls + '" viewBox="' + d.vb + '" style="width:' + d.width + 'em">' + d.inner + '</svg>'; };
/* the chosen atoms, read: one is a shape, two a distance, three an angle, four a twist */
function molMeasure(it, emb){
  const p = MOL_PICK && MOL_PICK.id === it.id ? MOL_PICK.atoms.map(i => emb.atoms[i]).filter(Boolean) : [];
  const nm = a => a.e;
  if(p.length === 1){
    if(p[0].src < 0) return 'H';
    const v = chemVSEPR(it, p[0].src);
    return nm(p[0]) + (v.shape ? ' · ' + v.shape + ' · ' + v.hyb + ' · ' + v.ax + ' · ' + v.angle : '');
  }
  if(p.length === 2) return nm(p[0]) + '–' + nm(p[1]) + ' ' + chemDist(p[0], p[1]).toFixed(2) + ' Å';
  if(p.length === 3) return nm(p[0]) + '–' + nm(p[1]) + '–' + nm(p[2]) + ' ' + chemAngle(p[0], p[1], p[2]).toFixed(1) + '°';
  if(p.length === 4) return 'dihedral ' + chemDihedral(p[0], p[1], p[2], p[3]).toFixed(1) + '°';
  return '';
}
function molInfoHTML(it, live){
  if(!it.atoms.length) return live ? '<span class="dim">click to place an atom · drag from one to bond it · type a symbol</span>' : '';
  const f = chemFormula(it), name = chemName(it);
  let s = f.html + ' · ' + chemMass(it).toFixed(2) + ' g/mol' + (name ? ' · ' + esc(name) : '');
  if(it.view === '3d' && live && MOL_PICK && MOL_PICK.id === it.id && MOL_PICK.atoms.length){
    const m = molMeasure(it, molEmb(it));
    if(m) s += '<br><span class="pkm">' + esc(m) + '</span>';
  }
  return s;
}

/* ================= on the page ================= */
/* redraw in place — the <svg> node itself is kept, so a pointer it has
   captured mid-gesture stays captured */
function molRepaint(el, it, ghost){
  const svg = el.querySelector('.molsvg');
  const d = molDraw(it, true, el, ghost);
  if(svg){
    svg.setAttribute('viewBox', d.vb); svg.style.width = d.width + 'em';
    svg.setAttribute('class', d.cls); svg.innerHTML = d.inner;
  }
  const fig = el.querySelector('.mol');
  if(fig){ fig.classList.toggle('v3d', it.view === '3d'); fig.classList.toggle('mono', !!it.mono); }
  const info = el.querySelector('.molinfo');
  if(info) info.innerHTML = molInfoHTML(it, true);
  molRailSync(el);
}
/* the window onto the drawing grows and shrinks when the hand lets go — and
   the item slides by the same amount, so nothing on the paper appears to move */
function molFit(el, it){
  const old = it.box || molBox(it), nb = molBox(it);
  if(old.x === nb.x && old.y === nb.y && old.w === nb.w && old.h === nb.h) return;
  const fs = it.fs || MOL_FS;
  it.x += (nb.x - old.x) * MOL_BL * fs / pgW() * 100;
  it.y += (nb.y - old.y) * MOL_BL * fs / pgH() * 100;
  it.box = nb;
  el.style.left = it.x + '%'; el.style.top = it.y + '%';
}
function molEdit(it, el, page, fit){
  MOL_CACHE.delete(it.id);
  if(fit !== false) molFit(el, it);
  molRepaint(el, it);
  queueSave(page.id);
}
function molPt(svg, e){
  const m = svg.getScreenCTM();
  if(!m) return { x: 0, y: 0 };
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: pt.x / MOL_U, y: pt.y / MOL_U };
}
function molSegDist(p, a, b){
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/* what is under the pointer: an atom first, then a bond */
function molHit(it, p){
  let best = null, bd = .3;
  it.atoms.forEach((a, i) => { const d = Math.hypot(a.x - p.x, a.y - p.y); if(d < bd){ bd = d; best = { atom: i }; } });
  if(best) return best;
  bd = .18;
  it.bonds.forEach((b, k) => { const d = molSegDist(p, it.atoms[b.a], it.atoms[b.b]); if(d < bd){ bd = d; best = { bond: k }; } });
  return best;
}
/* where a bond pulled from `from` towards p would land: onto an atom already
   there, else one bond out along the nearest 30° */
function molAim(it, from, p, not){
  const j = molAtomNear(it, p.x, p.y, .35, not);
  if(j >= 0) return { atom: j };
  const d = molSnap(Math.atan2(p.y - from.y, p.x - from.x));
  const x = from.x + Math.cos(d), y = from.y + Math.sin(d);
  const k = molAtomNear(it, x, y, .3, not);
  return k >= 0 ? { atom: k } : { x, y };
}
function molGhost(svg, from, tgt, e){
  const g = svg.querySelector('.mghost');
  if(!g) return;
  if(!from){ g.innerHTML = ''; return; }
  const tx = tgt.atom != null ? tgt.atom.x : tgt.x, ty = tgt.atom != null ? tgt.atom.y : tgt.y;
  g.innerHTML = molLine(from.x, from.y, tx, ty, 'gl') +
    (tgt.atom != null ? '<circle class="gt" cx="' + molU(tx) + '" cy="' + molU(ty) + '" r="' + Math.round(MOL_U * .3) + '"/>'
      : '<text class="at gt" x="' + molU(tx) + '" y="' + molU(ty) + '" text-anchor="middle">' + esc(e || MOL_EL) + '</text>');
}

/* ---- the pointer, in 2D ----
   What a press means is decided when it lifts; what a drag means is shown
   as it goes. The first press on a molecule selects it (core's job); from
   then on, until ✥ hands it back, presses inside the drawing are drawing. */
function molDown(e, el, it, page){
  const svg = e.target.closest('.molsvg');
  if(!svg || e.button !== 0) return;
  if(!el.classList.contains('sel') || PLOT_MOVE.has(it.id)) return;
  e.stopPropagation(); e.preventDefault();
  if(el._fling) el._fling();
  if(el._tiltStop) el._tiltStop();
  closeQuickMenu(); closeElementPicker(); molAskClose();
  if(it.view === '3d') return molOrbit(e, svg, el, it, page);
  molGesture(e, svg, el, it, page);
}
function molGesture(e, svg, el, it, page){
  const pid = e.pointerId, p0 = molPt(svg, e), hit = molHit(it, p0), tool = MOL_TOOL;
  let moved = false, last = p0, grabbed = null;
  const sel = MOL_SEL.get(it.id);
  if(tool === 'select' && hit && hit.atom != null) grabbed = sel && sel.has(hit.atom) ? [...sel] : [hit.atom];
  try{ svg.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const p = molPt(svg, ev);
    if(!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < .12) return;
    moved = true;
    if(tool === 'draw'){
      const from = hit && hit.atom != null ? it.atoms[hit.atom] : p0;
      const tgt = molAim(it, from, p, hit && hit.atom != null ? hit.atom : -1);
      molGhost(svg, from, { atom: tgt.atom != null ? it.atoms[tgt.atom] : null, x: tgt.x, y: tgt.y });
    } else if(tool === 'select'){
      if(grabbed){
        grabbed.forEach(i => { it.atoms[i].x = molRd(it.atoms[i].x + p.x - last.x); it.atoms[i].y = molRd(it.atoms[i].y + p.y - last.y); });
        molRepaint(el, it);
      } else {
        const g = svg.querySelector('.mghost');
        if(g) g.innerHTML = '<rect class="mq" x="' + molU(Math.min(p0.x, p.x)) + '" y="' + molU(Math.min(p0.y, p.y)) +
          '" width="' + molU(Math.abs(p.x - p0.x)) + '" height="' + molU(Math.abs(p.y - p0.y)) + '"/>';
      }
    }
    last = p;
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up);
    molGhost(svg, null);
    if(ev.type === 'pointercancel') return;
    molApply(tool, it, el, page, hit, p0, last, moved, grabbed);
  };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
}
function molApply(tool, it, el, page, hit, p0, p1, moved, grabbed){
  const B = MOL_BONDS[MOL_BOND], R = MOL_RINGS[MOL_RING];
  let did = true;
  if(tool === 'draw'){
    if(!moved){
      if(hit && hit.atom != null){
        const a = it.atoms[hit.atom];
        if(a.e !== MOL_EL){ a.e = MOL_EL; a.h = null; a.iso = null; }
        else molSprout(it, hit.atom, MOL_EL, B.o, B.s);
      } else if(hit && hit.bond != null){
        const b = it.bonds[hit.bond];
        if(B.s){ if(b.s === B.s){ const t = b.a; b.a = b.b; b.b = t; } else { b.s = B.s; b.o = 1; } }
        else if(B.o === 1 || (b.o === B.o && !b.s)){ b.o = b.o % 3 + 1; b.s = 0; }
        else { b.o = B.o; b.s = 0; }
      } else molAddAtom(it, MOL_EL, p0.x, p0.y);
    } else {
      const start = hit && hit.atom != null ? hit.atom : molAddAtom(it, MOL_EL, p0.x, p0.y);
      const tgt = molAim(it, it.atoms[start], p1, start);
      const end = tgt.atom != null ? tgt.atom : molAddAtom(it, MOL_EL, tgt.x, tgt.y);
      if(end !== start) molAddBond(it, start, end, B.o, B.s);
    }
  } else if(tool === 'ring'){
    if(moved) did = false;
    else if(hit && hit.bond != null) molRingOnBond(it, R, hit.bond);
    else if(hit && hit.atom != null) molRingOnAtom(it, R, hit.atom);
    else molRingAt(it, R, p0.x, p0.y);
  } else if(tool === 'charge'){
    if(!moved && hit && hit.atom != null) it.atoms[hit.atom].q = clamp((it.atoms[hit.atom].q || 0) + MOL_Q, -4, 4);
    else did = false;
  } else if(tool === 'erase'){
    if(!moved && hit && hit.atom != null) molDelAtom(it, hit.atom);
    else if(!moved && hit && hit.bond != null) molDelBond(it, hit.bond);
    else did = false;
  } else if(tool === 'select'){
    if(!MOL_SEL.has(it.id)) MOL_SEL.set(it.id, new Set());
    const sel = MOL_SEL.get(it.id);
    if(!moved){
      if(hit && hit.atom != null){ if(sel.has(hit.atom)) sel.delete(hit.atom); else sel.add(hit.atom); }
      else sel.clear();
      did = false; molRepaint(el, it);
    } else if(!grabbed){
      const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
      sel.clear();
      it.atoms.forEach((a, i) => { if(a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) sel.add(i); });
      did = false; molRepaint(el, it);
    }
  }
  if(did){ molEdit(it, el, page); SND.tick(); }
}

/* ---- the pointer, in 3D: turning it, and picking atoms to measure ---- */
function molStopSpin(it){ const s = MOL_SPIN.get(it.id); if(s) s(); }
function molOrbit(e, svg, el, it, page){
  molStopSpin(it);
  const pid = e.pointerId, fl = flickTrack(); fl.track(e);
  const sx = e.clientX, sy = e.clientY;
  let lx = sx, ly = sy, moved = false;
  try{ svg.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const dx = ev.clientX - lx, dy = ev.clientY - ly; lx = ev.clientX; ly = ev.clientY;
    if(!moved && Math.hypot(lx - sx, ly - sy) < 4) return;
    moved = true;
    it.yaw = (it.yaw || 0) + dx * .011; it.pitch = clamp((it.pitch || 0) + dy * .011, -1.5, 1.5);
    fl.track(ev);
    molRepaint(el, it);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up);
    if(!moved){ if(ev.type === 'pointerup') molPick3D(el, it, svg, ev); return; }
    queueSave(page.id);
    if(SPRING_STILL.matches) return;
    const v = fl.vel();
    let wy = clamp(v.vx * .011, -9, 9), wp = clamp(v.vy * .011, -9, 9);
    if(Math.abs(wy) + Math.abs(wp) < .15) return;
    const end = () => { MOL_SPIN.delete(it.id); queueSave(page.id); };
    const cancel = motionTick(dt => {
      if(!el.isConnected || it.view !== '3d'){ end(); return false; }
      const k = Math.exp(-2.1 * dt);
      wy *= k; wp *= k;
      it.yaw += wy * dt;
      const np = clamp(it.pitch + wp * dt, -1.5, 1.5);
      if(np !== it.pitch + wp * dt) wp = 0;
      it.pitch = np;
      molRepaint(el, it);
      if(Math.abs(wy) + Math.abs(wp) < .02){ end(); return false; }
      return true;
    });
    MOL_SPIN.set(it.id, () => { cancel(); end(); });
  };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
}
function molPick3D(el, it, svg, e){
  const pts = el._molPts; if(!pts) return;
  const m = svg.getScreenCTM(); if(!m) return;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  let best = -1, bd = MOL_U * .45;
  pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if(d < bd){ bd = d; best = i; } });
  if(!MOL_PICK || MOL_PICK.id !== it.id) MOL_PICK = { id: it.id, atoms: [] };
  if(best < 0) MOL_PICK.atoms = [];
  else {
    const k = MOL_PICK.atoms.indexOf(best);
    if(k >= 0) MOL_PICK.atoms.splice(k, 1); else { MOL_PICK.atoms.push(best); if(MOL_PICK.atoms.length > 4) MOL_PICK.atoms.shift(); }
  }
  molRepaint(el, it); SND.tick();
}
function molAutoSpin(el, it, page){
  molStopSpin(it);
  if(SPRING_STILL.matches || it.view !== '3d' || !it.auto) return;
  const cancel = motionTick(dt => {
    if(!el.isConnected || it.view !== '3d' || !it.auto){ MOL_SPIN.delete(it.id); return false; }
    it.yaw = (it.yaw || 0) + dt * .45;
    molRepaint(el, it);
    return true;
  });
  MOL_SPIN.set(it.id, () => { cancel(); MOL_SPIN.delete(it.id); queueSave(page.id); });
}
function molView(el, it, page, v){
  molStopSpin(it);
  it.view = v;
  if(v === '3d'){ if(it.yaw == null){ it.yaw = 0; it.pitch = 0; } }
  if(MOL_PICK && MOL_PICK.id === it.id) MOL_PICK = null;
  molRepaint(el, it); queueSave(page.id); SND.pop();
  if(v === '3d' && it.auto) molAutoSpin(el, it, page);
}
function molHome(el, it, page){ molStopSpin(it); it.yaw = 0; it.pitch = 0; it.zoom = 1; molRepaint(el, it); queueSave(page.id); }
function molMove(el, it, on){
  if(on) PLOT_MOVE.add(it.id); else PLOT_MOVE.delete(it.id);
  el.classList.toggle('mmove', !!on);
  select(it.id); SND.pop();
}

/* ---- the keys ----
   While a selected molecule is under the pointer its keys are the molecule's:
   a symbol sets the pen and relabels the atom under it (c then l is chlorine),
   1 2 3 set a bond's order, + and − charge an atom, Delete takes one out.
   Everything else stays the app's — this runs ahead of core/nav.js and only
   swallows what it used. */
window.addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const t = document.activeElement;
  if(t && (t.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(t.tagName))) return;
  const hot = document.elementFromPoint(lastMouse.x, lastMouse.y);
  const el = hot && hot.closest ? hot.closest('.item[data-type="molecule"].sel') : null;
  if(!el) return;
  const f = findItem(el.dataset.id);
  if(!f) return;
  if(molKey(e, el, f.it, f.page, hot)){ e.preventDefault(); e.stopPropagation(); }
}, true);
function molKey(e, el, it, page, hot){
  const svg = el.querySelector('.molsvg'), over = svg && hot.closest('.molsvg');
  const p = over && it.view !== '3d' ? molPt(svg, { clientX: lastMouse.x, clientY: lastMouse.y }) : null;
  const hit = p ? molHit(it, p) : null, k = e.key;
  if(k === 'Escape'){
    const sel = MOL_SEL.get(it.id);
    if((sel && sel.size) || (MOL_PICK && MOL_PICK.id === it.id && MOL_PICK.atoms.length)){
      if(sel) sel.clear(); if(MOL_PICK && MOL_PICK.id === it.id) MOL_PICK = null;
      molRepaint(el, it); return true;
    }
    return false;
  }
  if(/^[a-zA-Z]$/.test(k)){
    const now = performance.now();
    const buf = (now - MOL_KEYT < 550 ? MOL_KEYBUF : '') + k.toLowerCase();
    MOL_KEYT = now; MOL_KEYBUF = buf;
    const sameAtom = hit && hit.atom != null && MOL_KEYAT && MOL_KEYAT.id === it.id && MOL_KEYAT.i === hit.atom;
    const two = buf.length >= 2 && sameAtom !== false ? chemEl(buf.slice(-2)) : null;
    const one = chemEl(k);
    const pick = (two && (sameAtom || !hit || hit.atom == null)) ? two : one;
    if(!pick) return MOL_TWO.has(k.toLowerCase());
    MOL_EL = pick.sym; MOL_TOOL = 'draw'; molRailSyncAll();
    const target = two && pick === two && MOL_KEYAT && MOL_KEYAT.id === it.id && (!hit || hit.atom == null || sameAtom)
      ? MOL_KEYAT.i : (hit && hit.atom != null ? hit.atom : null);
    if(target != null && it.atoms[target]){
      it.atoms[target].e = pick.sym; it.atoms[target].h = null; it.atoms[target].iso = null;
      molEdit(it, el, page, false); MOL_KEYAT = { id: it.id, i: target };
    } else MOL_KEYAT = null;
    return true;
  }
  if(k === '1' || k === '2' || k === '3'){
    if(hit && hit.bond != null){ it.bonds[hit.bond].o = +k; it.bonds[hit.bond].s = 0; molEdit(it, el, page, false); }
    else { MOL_BOND = +k - 1; MOL_TOOL = 'draw'; molRailSyncAll(); }
    return true;
  }
  if((k === '+' || k === '=' || k === '-') && hit && hit.atom != null){
    it.atoms[hit.atom].q = clamp((it.atoms[hit.atom].q || 0) + (k === '-' ? -1 : 1), -4, 4);
    molEdit(it, el, page, false); return true;
  }
  if(k === 'Delete' || k === 'Backspace'){
    const sel = MOL_SEL.get(it.id);
    if(sel && sel.size){ [...sel].sort((a, b) => b - a).forEach(i => molDelAtom(it, i)); molEdit(it, el, page); return true; }
    if(hit && hit.atom != null){ molDelAtom(it, hit.atom); molEdit(it, el, page); return true; }
    if(hit && hit.bond != null){ molDelBond(it, hit.bond); molEdit(it, el, page); return true; }
    return false;
  }
  return false;
}

/* ---- the rail: the tools of the hand, at the drawing's left edge ---- */
const MOL_BOND_GLYPH = [
  '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M5 9.5h14M5 14.5h14"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M5 7.5h14M5 12h14M5 16.5h14"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M5 12l14-4.5v9z" fill="currentColor" stroke="none"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M6 12v1M9 11v2.5M12 10v4M15 9v6M18 8v8"/></svg>'];
function molRailHTML(){
  return '<div class="molrail glass-lite">' +
    '<button data-act="el" class="mrel" title="The element the pen draws — click for the periodic table, or type its symbol"><b></b></button>' +
    '<button data-act="bond" title="Bond — again for double, triple, wedge and hash; 1 2 3 on the keys"></button>' +
    '<button data-act="ring" title="Ring — click the page, a bond to fuse it on, or an atom to hang it from; again for the next size"><span class="mrng">⬡</span><i></i></button>' +
    '<button data-act="charge" title="Charge — click an atom; again to flip plus and minus"></button>' +
    '<button data-act="erase" title="Eraser — click an atom or a bond">' + icn('eraser') + '</button>' +
    '<button data-act="select" title="Select — click atoms or drag a box round them, then drag them about">↖</button></div>';
}
function molRailSync(el){
  const rail = el.querySelector('.molrail'); if(!rail) return;
  const chip = rail.querySelector('.mrel b'), e = CHEM_SYM[MOL_EL];
  chip.textContent = MOL_EL;
  chip.style.color = e && MOL_EL !== 'C' && MOL_EL !== 'H' ? e.color : '';
  rail.querySelector('[data-act=bond]').innerHTML = MOL_BOND_GLYPH[MOL_BOND];
  rail.querySelector('[data-act=ring] i').textContent = MOL_RINGS[MOL_RING].a ? 'ar' : MOL_RINGS[MOL_RING].n;
  rail.querySelector('[data-act=charge]').textContent = MOL_Q > 0 ? '+' : '−';
  rail.querySelectorAll('button').forEach(b => {
    const a = b.dataset.act;
    /* one lit button: the tool in hand — drawing lights the bond, the chip just says the element */
    b.classList.toggle('on', a === MOL_TOOL || (a === 'bond' && MOL_TOOL === 'draw'));
  });
}
const molRailSyncAll = () => document.querySelectorAll('#pageHost .item[data-type="molecule"]').forEach(molRailSync);
function molRailWire(el, it, page){
  const rail = el.querySelector('.molrail'); if(!rail) return;
  rail.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  rail.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    e.stopPropagation();
    const a = b.dataset.act;
    if(a === 'el') openElementPicker(b, sym => { MOL_EL = sym; MOL_TOOL = 'draw'; molRailSyncAll(); }, MOL_EL);
    else if(a === 'bond'){ if(MOL_TOOL === 'draw') MOL_BOND = (MOL_BOND + 1) % MOL_BONDS.length; MOL_TOOL = 'draw'; b.title = 'Bond — now: ' + MOL_BONDS[MOL_BOND].t; }
    else if(a === 'ring'){ if(MOL_TOOL === 'ring') MOL_RING = (MOL_RING + 1) % MOL_RINGS.length; MOL_TOOL = 'ring'; b.title = 'Ring — now: ' + MOL_RINGS[MOL_RING].l; }
    else if(a === 'charge'){ if(MOL_TOOL === 'charge') MOL_Q = -MOL_Q; MOL_TOOL = 'charge'; }
    else MOL_TOOL = a;
    molRailSyncAll();
  });
}

/* ---- the ⌕ box: a name or a SMILES ---- */
let MOL_ASK = null;
function molAskEl(){
  let d = $('#molask');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'molask glass'; d.id = 'molask';
  d.innerHTML = '<input placeholder="name or SMILES — ethanol, c1ccccc1…" spellcheck="false"><div class="molsug"></div><div class="mnope"></div>';
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => e.stopPropagation());
  const inp = d.querySelector('input'), sug = d.querySelector('.molsug');
  const list = () => {
    const hits = chemFind(inp.value, 8);
    sug.innerHTML = hits.map(h => '<button data-n="' + esc(h.name) + '">' + esc(h.name) + '<small>' + esc(h.smiles) + '</small></button>').join('');
    d.querySelector('.mnope').textContent = '';
  };
  inp.addEventListener('input', list);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); molAskClose(); }
    if(e.key === 'Enter'){ e.preventDefault(); molAskTake(inp.value); }
    if(e.key === 'ArrowDown'){ e.preventDefault(); const b = sug.querySelector('button'); if(b) b.focus(); }
  });
  sug.addEventListener('keydown', e => {
    e.stopPropagation();
    const b = e.target.closest('button'); if(!b) return;
    if(e.key === 'Escape'){ e.preventDefault(); molAskClose(); }
    if(e.key === 'ArrowDown' && b.nextElementSibling){ e.preventDefault(); b.nextElementSibling.focus(); }
    if(e.key === 'ArrowUp'){ e.preventDefault(); (b.previousElementSibling || inp).focus(); }
  });
  sug.addEventListener('click', e => { const b = e.target.closest('button'); if(b) molAskTake(b.dataset.n); });
  return d;
}
function molAsk(anchor, it, el, page){
  const d = molAskEl();
  if(d.classList.contains('open') && MOL_ASK && MOL_ASK.anchor === anchor) return molAskClose();
  MOL_ASK = { it, el, page, anchor };
  d.classList.add('open');
  const inp = d.querySelector('input'); inp.value = ''; d.querySelector('.molsug').innerHTML = ''; d.querySelector('.mnope').textContent = '';
  const r = anchor.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
  /* above the button, hung from its bottom edge so the suggestions grow upward
     rather than down over the toolbar and the drawing; below only when the
     top of the screen is in the way */
  d.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
  if(r.top - h - 10 >= 8){ d.style.top = 'auto'; d.style.bottom = (innerHeight - r.top + 10) + 'px'; }
  else { d.style.bottom = 'auto'; d.style.top = clamp(r.bottom + 10, 8, innerHeight - h - 8) + 'px'; }
  warpIn(d, r.left + r.width / 2, r.top + r.height / 2);
  inp.focus({ preventScroll: true });
}
function molAskClose(){
  const d = $('#molask');
  if(!d || !d.classList.contains('open') || !MOL_ASK) return;
  MOL_ASK = null;
  if(d.contains(document.activeElement)) document.activeElement.blur();
  warpOut(d, () => { if(!MOL_ASK) d.classList.remove('open'); });
}
function molAskTake(q){
  if(!MOL_ASK) return;
  const m = chemFrom(q);
  const d = molAskEl();
  if(!m){ d.querySelector('.mnope').textContent = 'nothing called “' + q + '”, and it does not read as SMILES'; return; }
  const { it, el, page } = MOL_ASK;
  it.atoms = m.atoms.map(a => ({ e: a.e, x: a.x, y: a.y, q: a.q || 0, h: a.h == null ? null : a.h, iso: a.iso || null }));
  it.bonds = m.bonds.map(b => ({ a: b.a, b: b.b, o: b.o || 1, s: b.s || 0 }));
  MOL_SEL.delete(it.id);
  molAskClose();
  molEdit(it, el, page); SND.pop();
}
window.addEventListener('pointerdown', e => {
  if(MOL_ASK && !e.target.closest('#molask') && !(MOL_ASK.anchor === e.target || MOL_ASK.anchor.contains(e.target))) molAskClose();
});

/* ---- ✎: how it is shown ---- */
function molProps(b, it, el, page){
  const rows = [
    { t:'btn', label:'', text:() => 'Atom colours: ' + (it.mono ? 'off' : 'on'), hint:'Heteroatoms in their CPK colours, or everything in ink',
      act(){ it.mono = !it.mono; } }];
  if(it.view === '3d') rows.push(
    { t:'range', label:'Size', min:40, max:300, step:5, get:() => Math.round((it.zoom || 1) * 100), set:v => { it.zoom = v / 100; }, fmt:v => v + '%' },
    { t:'btn', label:'', text:() => 'Labels: ' + (it.lab ? 'on' : 'off'), act(){ it.lab = !it.lab; } },
    { t:'btn', label:'', text:() => 'Lone pairs: ' + (it.lp ? 'shown' : 'hidden'), act(){ it.lp = !it.lp; } },
    { t:'btn', label:'', text:() => 'Keep turning: ' + (it.auto ? 'on' : 'off'), act(){ it.auto = !it.auto; if(it.auto) molAutoSpin(el, it, page); else molStopSpin(it); } });
  rows.push({ t:'btn', label:'', text:'Copy as SMILES', hint:'The line notation, onto the clipboard — and into the ⌕ box of any other molecule',
    act(){ const s = chemWrite(it); if(navigator.clipboard) navigator.clipboard.writeText(s).catch(() => {}); SND.tick(); } });
  openProps(b, { title:'Molecule', rows,
    onchange(){ molRepaint(el, it); },
    onsave(){ queueSave(page.id); },
    onreset(){ it.zoom = 1; it.lab = 0; it.lp = 0; it.mono = 0; it.auto = 0; molStopSpin(it); molRepaint(el, it); } });
}

/* ================= the item ================= */
defineItem('molecule', {
  add: { molecule: base => ({ ...base, type:'molecule', atoms:[], bonds:[], view:'2d', sty:'skel', s3:'ball',
    info:1, fs:MOL_FS, box:molBox({ atoms:[] }), cap:'' }) },
  sound: 'pop',
  sizeable: true, autoWidth: true,
  playArea: '.molsvg',
  html: (it, c) => {
    const d = molDraw(it, c.live);
    return '<figure class="body mol' + (it.mono ? ' mono' : '') + (it.view === '3d' ? ' v3d' : '') + '">' +
      (c.live ? molRailHTML() : '') +
      '<svg class="' + d.cls + '" viewBox="' + d.vb + '" style="width:' + d.width + 'em">' + d.inner + '</svg>' +
      '<div class="molinfo"' + (it.info === 0 ? ' hidden' : '') + '>' + molInfoHTML(it, c.live) + '</div>' +
      '<figcaption></figcaption></figure>';
  },
  after(it, el, page){ select(it.id); },
  tools(mk, it, el, page){
    mk(it.view === '3d' ? '2D' : '3D', 'Flip between the drawing and the molecule in space — drag to turn it, click atoms to measure', b => {
      molView(el, it, page, it.view === '3d' ? '2d' : '3d'); b.textContent = it.view === '3d' ? '2D' : '3D'; });
    mk('◐', 'Skeletal, condensed or Lewis — ball-and-stick, sticks or space-filling in 3D', b => {
      if(it.view === '3d'){ it.s3 = MOL_S3[(MOL_S3.indexOf(it.s3 || 'ball') + 1) % MOL_S3.length]; b.title = 'Ball-and-stick, sticks or space-filling — now: ' + MOL_S3_NAMES[it.s3]; }
      else { it.sty = MOL_STY[(MOL_STY.indexOf(it.sty || 'skel') + 1) % MOL_STY.length]; b.title = 'Skeletal, condensed or Lewis — now: ' + MOL_STY_NAMES[it.sty]; }
      molRepaint(el, it); queueSave(page.id); });
    mk('ƒ', 'Formula, mass and name under the drawing', () => {
      it.info = it.info === 0 ? 1 : 0; el.querySelector('.molinfo').hidden = it.info === 0; queueSave(page.id); });
    mk('⟲', 'Tidy the drawing the way a chemist would lay it out — in 3D, back to the starting view', () => {
      if(it.view === '3d') return molHome(el, it, page);
      if(!it.atoms.length) return;
      chemLayout(it); MOL_SEL.delete(it.id); molEdit(it, el, page); SND.pop(); });
    mk('⌕', 'Type a name or a SMILES and have it drawn', b => molAsk(b, it, el, page));
    mk('✎', 'Colours, labels, lone pairs, turning', b => molProps(b, it, el, page));
    mk('✥', 'Move it about the page — or drag it by the line under the drawing', () => molMove(el, it, !PLOT_MOVE.has(it.id)));
  },
  wire(el, it, page){
    const fig = el.querySelector('.mol');
    if(PLOT_MOVE.has(it.id)) el.classList.add('mmove');
    molRailWire(el, it, page); molRailSync(el);
    fig.addEventListener('pointerdown', e => molDown(e, el, it, page));
    fig.addEventListener('wheel', e => {
      if(e.ctrlKey || e.metaKey || PLOT_MOVE.has(it.id) || it.view !== '3d' || !e.target.closest('.molsvg')) return;
      e.preventDefault(); e.stopPropagation();
      it.zoom = clamp((it.zoom || 1) * (e.deltaY > 0 ? 1 / 1.1 : 1.1), .4, 3);
      molRepaint(el, it); queueSave(page.id);
    }, { passive:false });
    el.addEventListener('dblclick', e => {
      if(it.view !== '3d' || !e.target.closest('.molsvg')) return;
      e.stopPropagation(); e.preventDefault(); molHome(el, it, page);
    });
    if(it.view === '3d' && it.auto) molAutoSpin(el, it, page);
  },
  forget(it){
    MOL_CACHE.delete(it.id); molStopSpin(it); MOL_SPIN.delete(it.id); MOL_SEL.delete(it.id); PLOT_MOVE.delete(it.id);
    if(MOL_PICK && MOL_PICK.id === it.id) MOL_PICK = null;
  },
  css: `
/* ---------- molecules ----------
   Drawn straight on the paper like the guides: no card, no box, the selection
   ring is the drawing area. A bond is MOL_BL em, so A−/A+ resize the whole
   drawing through --fs, and the window onto it is a viewBox in bond units. */
.mol{display:block;background:none;padding:0;box-shadow:none;font-size:calc(var(--fs,15)*var(--scale)*1px);color:var(--ink)}
.item.sel .mol{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent2) 55%,transparent)}
svg.molsvg{display:block;height:auto;overflow:visible;touch-action:none;font-family:ui-sans-serif,system-ui,"Helvetica Neue",Arial,sans-serif}
.molsvg line.bd,.molsvg line.hs{stroke:var(--ink);stroke-width:5.5;stroke-linecap:round}
.molsvg polygon.wg{fill:var(--ink)}
.molsvg circle.dot{fill:var(--ink)}
.molsvg text.at{font-size:${MOL_FONT}px;font-weight:500;fill:var(--ink);stroke:var(--paper);stroke-width:12;stroke-linejoin:round;paint-order:stroke;dominant-baseline:central}
.molsvg text.lh{font-size:${Math.round(MOL_FONT * .9)}px}
.molsvg .ag[style] text.at{fill:color-mix(in oklab,var(--c) 74%,var(--ink))}
.mol.mono .molsvg .ag[style] text.at{fill:var(--ink)}
.molsvg circle.lpd{fill:var(--ink)}
.molsvg circle.mbad{fill:rgba(230,60,40,.16);stroke:#e03c28;stroke-width:3}
.molsvg circle.msel{fill:rgba(43,125,140,.14);stroke:var(--accent2);stroke-width:3;stroke-dasharray:9 6}
.molsvg .mghost line.gl{stroke:var(--soft);stroke-width:5;stroke-dasharray:11 9;stroke-linecap:round}
.molsvg .mghost text.gt{fill:var(--soft);stroke:none;opacity:.8}
.molsvg .mghost circle.gt{fill:none;stroke:var(--accent2);stroke-width:4}
.molsvg .mghost rect.mq{fill:rgba(43,125,140,.08);stroke:var(--accent2);stroke-width:2.5;stroke-dasharray:8 6}
.molsvg.m3d circle.ball{stroke-width:1.8}
.molsvg.m3d line.stick{stroke-linecap:round}
.molsvg.m3d text.lb3{text-anchor:middle;dominant-baseline:central;font-weight:600;pointer-events:none}
.molsvg.m3d circle.lp3{fill:var(--accent2);opacity:.75}
.molsvg.m3d circle.pk{fill:none;stroke:var(--accent);stroke-width:4}
.molsvg.m3d line.pkl{stroke:var(--accent);stroke-width:3;stroke-dasharray:8 6}
.molsvg.m3d text.pkt{font-size:${Math.round(MOL_FONT * .8)}px;font-family:var(--mono);text-anchor:middle;fill:var(--accent);stroke:var(--paper);stroke-width:9;paint-order:stroke}
.molinfo{font-family:var(--mono);font-size:.62em;letter-spacing:.06em;color:var(--soft);padding:.3em 0 0 .25em;min-height:1.1em;white-space:nowrap;cursor:move}
.molinfo sub,.molinfo sup{font-size:.78em;line-height:0}
.molinfo .dim{opacity:.5}
.molinfo .pkm{color:var(--accent)}
.item.sel[data-type="molecule"] .molsvg{cursor:crosshair}
.item.sel[data-type="molecule"] .molsvg.m3d{cursor:grab}
.item.sel[data-type="molecule"] .molsvg.m3d:active{cursor:grabbing}
.item.mmove[data-type="molecule"] .molsvg{cursor:move}
.item[data-type="molecule"] .rs{display:none}
/* the rail */
.molrail{position:absolute;right:100%;top:0;margin-right:calc(var(--scale)*8px);display:none;flex-direction:column;gap:3px;padding:4px;border-radius:11px;z-index:21}
.item.sel .molrail{display:flex}
.mol.v3d .molrail{display:none}
.molrail button{position:relative;width:calc(var(--scale)*28px);height:calc(var(--scale)*28px);border-radius:7px;color:rgba(233,234,239,.8);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font-family:var(--mono);font-size:calc(var(--scale)*13px);display:grid;place-items:center;transition:background .12s,color .12s}
.molrail button:hover{background:rgba(255,255,255,.11);color:#fff}
.molrail button.on{background:var(--accent);color:#fff;box-shadow:none}
.molrail .mrel b{font-weight:700}
.molrail button svg{width:62%;height:62%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.molrail button i{position:absolute;right:2px;bottom:1px;font-style:normal;font-size:calc(var(--scale)*7.5px);opacity:.85;letter-spacing:0}
.molrail .mrng{font-size:calc(var(--scale)*15px);line-height:1}
/* the ⌕ box */
.molask{position:fixed;z-index:83;display:none;width:272px;padding:10px;border-radius:13px;font-family:var(--mono);will-change:transform,filter,opacity}
.molask.open{display:block}
.molask input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.07);border:0;outline:0;border-radius:8px;color:inherit;font-family:var(--mono);font-size:12px;padding:7px 9px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.molask input::placeholder{color:rgba(233,234,239,.35)}
.molask input:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}
.molsug{display:flex;flex-direction:column;gap:2px;margin-top:6px;max-height:188px;overflow:auto}
.molsug:empty{margin:0}
.molsug button{text-align:left;padding:5px 8px;border-radius:7px;font-size:10.5px;letter-spacing:.04em;color:rgba(233,234,239,.85);background:rgba(255,255,255,.035)}
.molsug button:hover,.molsug button:focus{background:var(--accent);color:#fff;outline:none}
.molsug button small{opacity:.55;margin-left:7px;font-size:9px}
.molask .mnope{font-size:10px;color:#f08a7a;letter-spacing:.04em}
.molask .mnope:not(:empty){padding:6px 2px 0}
@media (prefers-reduced-motion: reduce){.molrail button{transition:none}}
`
});
defineTool({ kind:'molecule', cat:'science', label:'Molecule', icon:'molecule', order:10,
  hint:'Draw a molecule — atoms, bonds, rings, charges — see its formula and mass, and turn it in 3D' });
