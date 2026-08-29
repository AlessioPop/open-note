/* Open Note — items/molecule.js
   molecules: drawn on the page the way a chemist draws them, weighed and
   named as they grow, and turned over in three dimensions. The chemistry is
   js/lib/chem.js; this file is the hand and the eye.

   An item is a molecule as far as chem.js is concerned — it.atoms and it.bonds
   are the graph, in bond lengths, y down — plus how it is shown:
     peek  0..100 (the 3D companion revealed beside 2D)      sty  skel | cond | lewis
     s3    ball | stick | fill
     box   the window onto the drawing, in bonds (refitted when the hand lets go)
     yaw pitch zoom  the 3D pose     info  the strip under it     mono lab lp auto */

/* ================= the hand (none of this is saved) ================= */
let MOL_EL = 'C', MOL_TOOL = 'draw', MOL_BOND = 0, MOL_RING = 0, MOL_Q = 1;
const MOL_BONDS = [
  { o:1, s:0, t:'single' }, { o:2, s:0, t:'double' }, { o:3, s:0, t:'triple' },
  { o:1, s:1, t:'wedge — coming towards you' }, { o:1, s:2, t:'hash — going away from you' },
  { o:1, s:0, hb:1, t:'hydrogen bond — the dotted one; drag from one atom to another' }];
const MOL_RINGS = [
  { n:6, a:1, l:'benzene' }, { n:6, a:0, l:'six-ring' }, { n:5, a:0, l:'five-ring' },
  { n:3, a:0, l:'three-ring' }, { n:4, a:0, l:'four-ring' }, { n:7, a:0, l:'seven-ring' }, { n:8, a:0, l:'eight-ring' }];
const MOL_STY = ['skel', 'cond', 'lewis'], MOL_STY_NAMES = { skel:'skeletal', cond:'condensed', lewis:'Lewis' };
const MOL_S3 = ['ball', 'stick', 'fill'], MOL_S3_NAMES = { ball:'ball and stick', stick:'sticks', fill:'space-filling' };
const MOL_BL = 2.4;                         /* a bond, in em — A− / A+ scale it through --fs */
const MOL_FS = 15;
const MOL_U = 100;                          /* viewBox units per bond */
const MOL_PAD = 1.7, MOL_MINW = 5, MOL_MINH = 3.4;   /* room round the drawing, in bonds */
const MOL_REACH = 1.35;                     /* how far off an atom the pen still bonds to it */
const MOL_HB_LEN = 1.65;                    /* a readable D–H···A gap after tidy */
const MOL_FONT = Math.round(MOL_U / MOL_BL * .95);
const MOL_CACHE = new Map(), MOL_SPIN = new Map(), MOL_SEL = new Map();
let MOL_SEQ = 0, MOL_PICK = null, MOL_KEYBUF = '', MOL_KEYT = 0, MOL_KEYAT = null;
const MOL_TWO = new Set(Object.keys(CHEM_SYM).filter(s => s.length === 2).map(s => s[0].toLowerCase()));
onNoteOpen(() => {
  MOL_CACHE.clear(); MOL_SPIN.forEach(f => f()); MOL_SPIN.clear(); MOL_SEL.clear();
  MOL_PICK = null; MOL_KEYAT = null;
  if(typeof molMenuClose === 'function') molMenuClose();
});
const molRd = v => Math.round(v * 100) / 100;

/* ---- the dotted ones ----
   A hydrogen bond is not a bond. It holds no electron pair, it fills no
   valence, it closes no ring, and there is no way to write one in SMILES —
   so it is kept in a list of its own, `it.hb`, and js/lib/chem.js is never
   shown it. That is not tidiness: it is the only way to be sure that drawing
   one can never change a formula, a mass, a name, a hydrogen count or a shape
   in space. Two waters joined by one are still two molecules, and the strip
   under the drawing still reads H₂O + H₂O, because that is the truth. */
const molHbs = it => it.hb || (it.hb = []);
const molHbAt = (it, a, b) => molHbs(it).findIndex(h => (h.a === a && h.b === b) || (h.a === b && h.b === a));
const molHiSame = (a, b) => !!a && !!b && a.t === b.t && a.i === b.i && a.a === b.a && a.b === b.b;
/* Older notes saved one correspondence object. Turn it into the additive list
   lazily, so they gain multi-highlighting without a migration pass. */
function molHis(it){
  if(!it.hi) return [];
  if(!Array.isArray(it.hi)) it.hi = [it.hi];
  return it.hi;
}
function molHiValid(it, h){
  if(!h) return false;
  if(h.t === 'a') return !!it.atoms[h.i];
  if(h.t === 'b') return !!it.atoms[h.a] && !!it.atoms[h.b] && chemBondAt(it, h.a, h.b) >= 0;
  if(h.t === 'h') return !!it.atoms[h.a] && !!it.atoms[h.b] && molHbAt(it, h.a, h.b) >= 0;
  /* ea / eb are generated hydrogens and their bonds. They stay stable while
     the graph stays still; molEdit drops them as soon as the graph changes. */
  return h.t === 'ea' || h.t === 'eb';
}
function molHiAfterAtomDelete(it, i){
  const keep = [];
  for(const h of molHis(it)){
    if(h.t === 'ea' || h.t === 'eb') continue;
    if(h.t === 'a'){
      if(h.i === i) continue;
      if(h.i > i) h.i--;
      keep.push(h); continue;
    }
    if(h.a === i || h.b === i) continue;
    if(h.a > i) h.a--;
    if(h.b > i) h.b--;
    keep.push(h);
  }
  if(keep.length) it.hi = keep; else delete it.hi;
}
/* what stops one being drawn: a hydrogen bond wants a hydrogen at one end and
   somewhere for it to go at the other, and the two must not already be bonded */
function molWhyNoHB(m, i, j){
  if(i === j || !m.atoms[i] || !m.atoms[j]) return 'that is one atom';
  if(chemBondAt(m, i, j) >= 0) return 'those two are bonded already';
  const nb = chemNbrs(m);
  if(!(chemLP(m, i, nb) > 0 || chemLP(m, j, nb) > 0))
    return 'a hydrogen bond needs a lone pair to accept it — N, O, F or the like';
  const carries = k => m.atoms[k].e === 'H' || chemH(m, k, nb) > 0;
  if(!carries(i) && !carries(j)) return 'neither of those carries a hydrogen to give';
  return '';
}

/* ---- editing the graph ---- */
function molAddAtom(it, e, x, y){
  it.atoms.push({ e, x: molRd(x), y: molRd(y), q: 0, h: null, iso: null, f: 0 });
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
  molHiAfterAtomDelete(it, i);
  it.bonds = it.bonds.filter(b => b.a !== i && b.b !== i)
    .map(b => ({ ...b, a: b.a > i ? b.a - 1 : b.a, b: b.b > i ? b.b - 1 : b.b }));
  it.hb = molHbs(it).filter(h => h.a !== i && h.b !== i)
    .map(h => ({ a: h.a > i ? h.a - 1 : h.a, b: h.b > i ? h.b - 1 : h.b }));
  it.atoms.splice(i, 1);
  if(it.id) MOL_SEL.delete(it.id);        /* a copy being tried out has none */
}
function molDelBond(it, k){
  const b = it.bonds[k];
  if(b && it.hi){
    const keep = molHis(it).filter(h => h.t !== 'b' || !((h.a === b.a && h.b === b.b) || (h.a === b.b && h.b === b.a)));
    if(keep.length) it.hi = keep; else delete it.hi;
  }
  it.bonds.splice(k, 1);
}
/* an atom at this spot already? */
function molAtomNear(it, x, y, r, not){
  let best = -1, bd = r == null ? .3 : r;
  it.atoms.forEach((a, i) => { if(i === not || a.f) return; const d = Math.hypot(a.x - x, a.y - y); if(d < bd){ bd = d; best = i; } });
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
  return idx;
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
  return idx;
}
/* `lean` is a point the ring should grow towards — the pointer, while a row of
   fused rings is being dragged out. Without one it goes wherever there is room. */
function molRingOnBond(it, R, kb, lean){
  const b = it.bonds[kb], A = it.atoms[b.a], B = it.atoms[b.b], k = R.n, nb = chemNbrs(it);
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, Rr = L / (2 * Math.sin(Math.PI / k)), ap = L / (2 * Math.tan(Math.PI / k));
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  let nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L;
  if(lean){
    if((lean.x - mx) * nx + (lean.y - my) * ny < 0){ nx = -nx; ny = -ny; }
  } else {
  /* away from whatever else hangs off the two ends */
  const others = nb[b.a].concat(nb[b.b]).map(x => x.j).filter(j => j !== b.a && j !== b.b);
  if(others.length){
    const ox = others.reduce((s, j) => s + it.atoms[j].x, 0) / others.length, oy = others.reduce((s, j) => s + it.atoms[j].y, 0) / others.length;
    if((ox - mx) * nx + (oy - my) * ny > 0){ nx = -nx; ny = -ny; }
  }
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
  const ring = [b.b].concat(idx.slice(2)).concat([b.a]);
  molRingBonds(it, ring, R.a);
  return ring;
}
/* the middle of a ring, where its number goes while it is being dragged out */
function molRingMid(it, idx){
  return { x: idx.reduce((s, j) => s + it.atoms[j].x, 0) / idx.length,
           y: idx.reduce((s, j) => s + it.atoms[j].y, 0) / idx.length };
}
/* the bond of a ring that points most towards p — the one the next ring fuses to */
function molRingFace(it, idx, p, notk){
  let best = -1, bd = Infinity;
  for(let t = 0; t < idx.length; t++){
    const k = chemBondAt(it, idx[t], idx[(t + 1) % idx.length]);
    if(k < 0 || k === notk) continue;
    const A = it.atoms[it.bonds[k].a], B = it.atoms[it.bonds[k].b];
    const d = Math.hypot((A.x + B.x) / 2 - p.x, (A.y + B.y) / 2 - p.y);
    if(d < bd){ bd = d; best = k; }
  }
  return best;
}

/* ---- a chain, the way a hand draws one ----
   A zigzag on the same 30° lattice as everything else: each bond turns the
   other way, so the carbons advance cos 30° along the axis and swing half a
   bond either side of it. The first step leans away from whatever is already
   on the atom, or a chain grown off a chain would double back over it. */
const MOL_ZIG = Math.PI / 6, MOL_AX = Math.cos(Math.PI / 6);
const MOL_CHAIN_MAX = 60, MOL_RINGS_MAX = 12;
function molChainDir(it, i, ax, nb, skip){
  nb = nb || chemNbrs(it);
  const A = it.atoms[i], angs = (nb[i] || []).filter(x => !skip || !skip.has(x.j)).map(x => molAng(A, it.atoms[x.j]));
  if(!angs.length) return 1;
  const near = a => Math.min(...angs.map(b => Math.abs(molDiff(a, b))));
  return near(ax + MOL_ZIG) >= near(ax - MOL_ZIG) ? 1 : -1;
}
/* where the carbons of a chain of n out of `from` would land */
function molChainPts(it, from, ax, n, sgn){
  const A = it.atoms[from], out = [];
  let x = A.x, y = A.y;
  for(let t = 0; t < n; t++){
    const d = ax + sgn * (t % 2 ? -MOL_ZIG : MOL_ZIG);
    x += Math.cos(d); y += Math.sin(d);
    out.push({ x: molRd(x), y: molRd(y) });
  }
  return out;
}
/* how many carbons a drag this long is asking for */
const molChainN = L => clamp(Math.round(L / MOL_AX), 1, MOL_CHAIN_MAX);
/* lay a chain of n carbons out of `from`, bonding onto whatever is already there */
function molChain(it, from, ax, n, sgn){
  let prev = from;
  const made = [];
  molChainPts(it, from, ax, n, sgn).forEach(q => {
    let j = molAtomNear(it, q.x, q.y, .3, prev);
    if(j < 0) j = molAddAtom(it, 'C', q.x, q.y);
    molAddBond(it, prev, j, 1, 0);
    made.push(j); prev = j;
  });
  return made;
}

/* ================= folding a long chain into ⟮CH₂⟯ₙ =================
   The repeat bracket is what a chemist writes: the run is drawn once, between
   square brackets, with the count as a subscript. Only a run of plain CH₂
   carbons outside any ring can be folded — which is exactly the run the
   notation stands for, and exactly the run whose removal cannot cut a ring in
   half. A fused ring run gets no fold: there is no convention for “this ring
   repeats”, and inventing one would be a lie in a chemist's hand.

   Nothing leaves the graph. The atoms stay where they always were in every
   sense that matters — formula, mass, name, SMILES and the 3D view never know
   anything happened — and only their coordinates and one flag change, so
   unfolding lays them back out as a proper zigzag. */
const MOL_FOLD_MIN = 3, MOL_FOLD_LEN = 2.1;
const molRingAtoms = it => { const s = new Set(); chemRings(it).forEach(r => r.atoms.forEach(i => s.add(i))); return s; };
function molFoldable(it, i, nb, ring){
  const a = it.atoms[i];
  if(!a || a.e !== 'C' || a.q || a.iso || a.h != null || ring.has(i)) return false;
  if(molHbs(it).some(h => h.a === i || h.b === i)) return false;   /* it would dangle */
  const n = nb[i];
  return !!n && n.length === 2 && n.every(x => it.bonds[x.k].o === 1 && !it.bonds[x.k].s);
}
/* the whole run of foldable carbons through atom i, and the two atoms it hangs
   between — those are not folded, or the fold would have nothing to hang on */
function molRun(it, i, nb, ring){
  if(!molFoldable(it, i, nb, ring)) return null;
  const back = [], fwd = [];
  const walk = (prev, at, into) => {
    while(molFoldable(it, at, nb, ring)){
      if(at === i || back.indexOf(at) >= 0 || fwd.indexOf(at) >= 0) return at;   /* a ring of CH₂: never */
      into.push(at);
      const nx = nb[at].find(x => x.j !== prev);
      if(!nx) return at;
      prev = at; at = nx.j;
    }
    return at;
  };
  const a = walk(i, nb[i][0].j, back), b = walk(i, nb[i][1].j, fwd);
  if(a === b) return null;
  return { run: back.slice().reverse().concat([i], fwd), a, b };
}
/* everything on `from`'s side of the run, moved. The run is a bridge — no atom
   in it is in a ring — so that side is simply what you reach without stepping
   through it. */
function molShift(it, from, block, dx, dy){
  const stop = new Set(block), nb = chemNbrs(it), seen = new Set([from]), st = [from];
  while(st.length){
    const a = st.pop(), A = it.atoms[a];
    A.x = molRd(A.x + dx); A.y = molRd(A.y + dy);
    for(const x of nb[a]) if(!seen.has(x.j) && !stop.has(x.j)){ seen.add(x.j); st.push(x.j); }
  }
}
function molFold(it, r){
  const A = it.atoms[r.a], B = it.atoms[r.b], n = r.run.length;
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
  const tx = A.x + ux * MOL_FOLD_LEN, ty = A.y + uy * MOL_FOLD_LEN;
  molShift(it, r.b, r.run, tx - B.x, ty - B.y);
  /* the run goes to sleep along the bracket, evenly, so that unfolding from a
     drawing that was never a tidy zigzag still starts from something sane */
  r.run.forEach((j, t) => {
    const f = (t + 1) / (n + 1), a = it.atoms[j];
    a.x = molRd(A.x + (tx - A.x) * f); a.y = molRd(A.y + (ty - A.y) * f); a.f = 1;
  });
}
function molUnfold(it, r){
  const A = it.atoms[r.a], B = it.atoms[r.b], n = r.run.length, nb = chemNbrs(it);
  const ax = molSnap(Math.atan2(B.y - A.y, B.x - A.x));
  const sgn = molChainDir(it, r.a, ax, nb, new Set(r.run));
  const pts = molChainPts(it, r.a, ax, n + 1, sgn);
  molShift(it, r.b, r.run, pts[n].x - B.x, pts[n].y - B.y);
  r.run.forEach((j, t) => { const a = it.atoms[j]; a.x = pts[t].x; a.y = pts[t].y; a.f = 0; });
}
/* the folds on the drawing now, read back off the flags. A flag whose run has
   been broken since — an atom deleted out of the middle of it — simply stops
   counting, and those carbons come back into view rather than vanishing. */
function molFolds(it){
  if(!it.atoms.some(a => a.f)) return [];
  const nb = chemNbrs(it), out = [], seen = new Set();
  const ok = i => it.atoms[i].f && nb[i] && nb[i].length === 2;
  it.atoms.forEach((a, i) => {
    if(!ok(i) || seen.has(i)) return;
    seen.add(i);
    const arm = (prev, at, into) => {
      while(ok(at) && !seen.has(at)){
        seen.add(at); into.push(at);
        const nx = nb[at].find(x => x.j !== prev);
        if(!nx) return at;
        prev = at; at = nx.j;
      }
      return at;
    };
    const back = [], fwd = [];
    const A = arm(i, nb[i][0].j, back), B = arm(i, nb[i][1].j, fwd);
    if(A === B || it.atoms[A].f || it.atoms[B].f) return;    /* not a run that hangs between two anchors */
    out.push({ run: back.slice().reverse().concat([i], fwd), a: A, b: B });
  });
  return out;
}
/* every fold opened out — what the 3D view and ⟲ work from */
function molUnfoldAll(it){
  molFolds(it).forEach(f => molUnfold(it, f));
  return it;
}

/* ================= tidying the dotted ones =================
   chemLayout quite deliberately knows only the covalent graph. Once it has
   made each real component tidy, this pass treats every component as one rigid
   piece and arranges those pieces around the hydrogen bonds. No atom inside a
   molecule moves relative to another, so the chemistry still never sees or
   pays for a dotted line. */
function molTidyLayout(it){
  chemLayout(it);
  const hbs = molHbs(it).filter(h => it.atoms[h.a] && it.atoms[h.b]);
  if(!hbs.length) return it;
  const C = chemComps(it), comps = C.comps, nb = chemNbrs(it);
  const adj = comps.map(() => []);
  hbs.forEach((h, k) => {
    const a = C.id[h.a], b = C.id[h.b];
    if(a == null || b == null || a === b) return;
    adj[a].push({ k, to:b, at:h.a, other:h.b });
    adj[b].push({ k, to:a, at:h.b, other:h.a });
  });
  const networks = [], seen = new Set();
  for(let s = 0; s < comps.length; s++){
    if(seen.has(s)) continue;
    const net = [], q = [s]; seen.add(s);
    while(q.length){
      const c = q.shift(); net.push(c);
      adj[c].forEach(e => { if(!seen.has(e.to)){ seen.add(e.to); q.push(e.to); } });
    }
    networks.push(net);
  }
  const used = new Map();
  const remember = (i, j) => {
    if(!used.has(i)) used.set(i, []);
    used.get(i).push(j);
  };
  const openDir = (i, extra) => {
    const A = it.atoms[i], dirs = nb[i].map(x => molAng(A, it.atoms[x.j]));
    (used.get(i) || []).forEach(j => dirs.push(molAng(A, it.atoms[j])));
    if(extra != null) dirs.push(molAng(A, it.atoms[extra]));
    const g = chemGap(dirs);
    return g[0] + g[1] / 2;
  };
  const turnComp = (ci, pivot, ang) => {
    const P = it.atoms[pivot], c = Math.cos(ang), s = Math.sin(ang);
    comps[ci].forEach(i => {
      const a = it.atoms[i], dx = a.x - P.x, dy = a.y - P.y;
      a.x = P.x + dx * c - dy * s; a.y = P.y + dx * s + dy * c;
    });
  };
  const shiftComp = (ci, dx, dy) => comps[ci].forEach(i => { it.atoms[i].x += dx; it.atoms[i].y += dy; });
  for(const net of networks){
    /* Start from the largest covalent piece: satellites arrange themselves
       around the thing the eye is most likely to read as the subject. */
    const root = net.slice().sort((a, b) => comps[b].length - comps[a].length)[0];
    const placed = new Set([root]), q = [root];
    while(q.length){
      const ci = q.shift();
      for(const e of adj[ci]){
        if(placed.has(e.to)) continue;
        const A = it.atoms[e.at], B = it.atoms[e.other];
        const dir = openDir(e.at), childOpen = openDir(e.other);
        turnComp(e.to, e.other, dir + Math.PI - childOpen);
        shiftComp(e.to, A.x + Math.cos(dir) * MOL_HB_LEN - B.x, A.y + Math.sin(dir) * MOL_HB_LEN - B.y);
        placed.add(e.to); q.push(e.to);
        remember(e.at, e.other); remember(e.other, e.at);
      }
    }
  }
  /* A cycle or a second dotted link between the same two pieces cannot be
     satisfied by the tree walk alone. Small rigid translations share the
     remaining error without stretching any covalent bond. */
  for(let pass = 0; pass < 28; pass++) for(const h of hbs){
    const ca = C.id[h.a], cb = C.id[h.b]; if(ca === cb) continue;
    const A = it.atoms[h.a], B = it.atoms[h.b];
    let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if(d < 1e-6){ dx = .01; dy = .013; d = Math.hypot(dx, dy); }
    const f = .12 * (d - MOL_HB_LEN) / (2 * d);
    shiftComp(ca, dx * f, dy * f); shiftComp(cb, -dx * f, -dy * f);
  }
  /* Pack hydrogen-bonded networks, not individual covalent components, then
     put the whole diagram back about the origin like chemLayout does. */
  let right = 0;
  for(const net of networks){
    const atoms = net.flatMap(ci => comps[ci]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    atoms.forEach(i => { const a = it.atoms[i]; x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); });
    const dx = right - x0, dy = -(y0 + y1) / 2;
    atoms.forEach(i => { it.atoms[i].x += dx; it.atoms[i].y += dy; });
    right += x1 - x0 + 1.6;
  }
  const cx = it.atoms.reduce((s, a) => s + a.x, 0) / it.atoms.length;
  const cy = it.atoms.reduce((s, a) => s + a.y, 0) / it.atoms.length;
  it.atoms.forEach(a => { a.x = molRd(a.x - cx); a.y = molRd(a.y - cy); });
  return it;
}

/* ================= the drawing ================= */
function molBox(it){
  const A = it.atoms;
  if(!A.length) return { x: -MOL_MINW / 2, y: -MOL_MINH / 2, w: MOL_MINW, h: MOL_MINH };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  A.forEach(a => { if(a.f) return; x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); });
  if(x0 === Infinity) A.forEach(a => { x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); });
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
/* a hydrogen bond, drawn: dots, which is what D–H···A means on paper */
function molHbSVG(it, h, k, lab){
  const A = it.atoms[h.a], B = it.atoms[h.b];
  if(!A || !B) return '';
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1e-6, ux = dx / L, uy = dy / L;
  const ta = lab[h.a].show ? .3 : .1, tb = lab[h.b].show ? .3 : .1;
  return '<line class="hb" data-h="' + k + '" x1="' + molU(A.x + ux * ta) + '" y1="' + molU(A.y + uy * ta) +
    '" x2="' + molU(B.x - ux * tb) + '" y2="' + molU(B.y - uy * tb) + '"/>';
}
/* The highlighter is a correspondence mark, not part of the molecule. It is
   painted last in either view so the same atom or link remains unmistakable
   even when the 3D depth sort would otherwise put it behind something. */
function molHi2DSVG(it){
  let out = '';
  for(const h of molHis(it)){
    if(!molHiValid(it, h)) continue;
    if(h.t === 'a'){
      const a = it.atoms[h.i];
      out += '<circle class="mha" cx="' + molU(a.x) + '" cy="' + molU(a.y) + '" r="' + Math.round(MOL_U * .38) + '"/>';
    } else if(h.t === 'b' || h.t === 'h'){
      const A = it.atoms[h.a], B = it.atoms[h.b];
      out += '<line class="mhl' + (h.t === 'h' ? ' dotted' : '') + '" x1="' + molU(A.x) + '" y1="' + molU(A.y) +
        '" x2="' + molU(B.x) + '" y2="' + molU(B.y) + '"/>';
    }
  }
  return out ? '<g class="mhi2" aria-hidden="true">' + out + '</g>' : '';
}
/* a folded run, drawn: one bond between square brackets with the count as a
   subscript — the repeat notation, which says n of these and means it */
function molFoldSVG(it, f, lab, sty){
  const A = it.atoms[f.a], B = it.atoms[f.b], n = f.run.length;
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const ta = lab[f.a].show ? .27 : 0, tb = lab[f.b].show ? .27 : 0;
  const x1 = A.x + ux * ta, y1 = A.y + uy * ta, x2 = B.x - ux * tb, y2 = B.y - uy * tb;
  const mid = sty !== 'skel';                      /* every carbon written: say which one repeats */
  let out = '<g class="fd" data-f="' + f.i + '">';
  if(mid){
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    out += molLine(x1, y1, cx - ux * .42, cy - uy * .42) + molLine(cx + ux * .42, cy + uy * .42, x2, y2) +
      '<text class="at" x="' + molU(cx) + '" y="' + molU(cy) + '" text-anchor="middle">CH' + chemSub(2) + '</text>';
  } else out += molLine(x1, y1, x2, y2);
  const h = .32, ser = .15;
  [[.2, 1], [.8, -1]].forEach(v => {
    const px = x1 + (x2 - x1) * v[0], py = y1 + (y2 - y1) * v[0];
    out += molLine(px + nx * h, py + ny * h, px - nx * h, py - ny * h, 'bk') +
      molLine(px + nx * h, py + ny * h, px + nx * h + ux * ser * v[1], py + ny * h + uy * ser * v[1], 'bk') +
      molLine(px - nx * h, py - ny * h, px - nx * h + ux * ser * v[1], py - ny * h + uy * ser * v[1], 'bk');
  });
  /* the count sits under the closing bracket, wherever “under” is on the page */
  const px = x1 + (x2 - x1) * .8, py = y1 + (y2 - y1) * .8, sy = ny >= 0 ? 1 : -1;
  out += '<text class="fn" x="' + molU(px + nx * h * sy + .17) + '" y="' + molU(py + ny * h * sy + .29) +
    '">' + n + '</text>';
  return out + '</g>';
}
/* the 2D picture: { vb, width, cls, inner } */
function molDraw2D(it, live, ghost){
  const nb = chemNbrs(it), box = it.box || molBox(it), sty = it.sty || 'skel', sel = MOL_SEL.get(it.id);
  const lab = it.atoms.map((a, i) => molLabel(it, i, nb, sty));
  const folds = molFolds(it), hid = new Set();
  folds.forEach((f, i) => { f.i = i; f.run.forEach(j => hid.add(j)); });
  let inner = '';
  it.bonds.forEach((b, k) => { if(!hid.has(b.a) && !hid.has(b.b)) inner += molBondSVG(it, b, k, nb, lab); });
  molHbs(it).forEach((h, k) => { if(!hid.has(h.a) && !hid.has(h.b)) inner += molHbSVG(it, h, k, lab); });
  folds.forEach(f => { inner += molFoldSVG(it, f, lab, sty); });
  if(sty === 'lewis') it.atoms.forEach((a, i) => { if(!hid.has(i)) inner += molLewisSVG(it, i, nb); });
  it.atoms.forEach((a, i) => { if(!hid.has(i)) inner += molAtomSVG(it, i, nb, lab[i], live && sel); });
  inner += molHi2DSVG(it);
  inner += '<g class="mghost">' + (ghost || '') + '</g>';
  return { vb: [box.x, box.y, box.w, box.h].map(molU).join(' '), width: (box.w * MOL_BL).toFixed(2),
    cls: 'molsvg mol2svg' + (sty === 'lewis' ? ' lewis' : ''), inner };
}

/* ---- in three dimensions ---- */
/* A stable handedness basis for one source atom: neighbour source indices are
   the labels, so turning the drawing or the model cannot change its sign. */
function molEmbHand(emb, src){
  const c = emb.atoms.findIndex(a => a.src === src);
  if(c < 0 || !emb.nb[c] || emb.nb[c].length < 3) return 0;
  const ns = emb.nb[c].map(x => x.j).sort((i, j) => {
    const a = emb.atoms[i].src, b = emb.atoms[j].src;
    return (a < 0 ? 100000 + i : a) - (b < 0 ? 100000 + j : b);
  });
  const C = emb.atoms[c], v = ns.slice(0, 3).map(i => {
    const a = emb.atoms[i]; return [a.x - C.x, a.y - C.y, a.z - C.z];
  });
  const d = v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1]) -
    v[0][1] * (v[1][0] * v[2][2] - v[1][2] * v[2][0]) +
    v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0]);
  return Math.abs(d) < .08 ? 0 : Math.sign(d);
}
/* Reflect the two substituent branches opposite a plane through the other two.
   For tetrahedral geometry those branches exchange spatial directions. Every
   branch moves rigidly, so its bonds and angles stay intact while parity at the
   centre reverses. Ring paths are deliberately refused rather than distorted. */
function molEmbInvertAt(emb, src, want){
  const c = emb.atoms.findIndex(a => a.src === src);
  if(c < 0 || !emb.nb[c]) return false;
  const ns = emb.nb[c].map(x => x.j).sort((i, j) => {
    const a = emb.atoms[i].src, b = emb.atoms[j].src;
    return (a < 0 ? 100000 + i : a) - (b < 0 ? 100000 + j : b);
  }).slice(0, 4);
  if(ns.length < 3) return false;
  const around = new Set(ns);
  const branch = root => {
    const seen = new Set([root]), q = [root];
    while(q.length){
      const i = q.shift();
      for(const x of emb.nb[i]) if(x.j !== c && !seen.has(x.j)){ seen.add(x.j); q.push(x.j); }
    }
    for(const n of around) if(n !== root && seen.has(n)) return null;
    return seen;
  };
  const base = emb.atoms.map(a => [a.x, a.y, a.z]), cand = [];
  for(let a = 0; a < ns.length; a++) for(let b = a + 1; b < ns.length; b++){
    const outside = ns.filter((n, i) => i !== a && i !== b), sets = outside.map(branch);
    if(sets.some(s => !s)) continue;
    const C = emb.atoms[c], A = emb.atoms[ns[a]], B = emb.atoms[ns[b]];
    const u = [A.x - C.x, A.y - C.y, A.z - C.z], v = [B.x - C.x, B.y - C.y, B.z - C.z];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const L = Math.hypot(n[0], n[1], n[2]); if(L < .08) continue;
    cand.push({ sets, n:n.map(x => x / L), size:sets.reduce((s, q) => s + q.size, 0), area:L });
  }
  cand.sort((a, b) => a.size - b.size || b.area - a.area);
  for(const x of cand){
    emb.atoms.forEach((a, i) => { a.x = base[i][0]; a.y = base[i][1]; a.z = base[i][2]; });
    const C = emb.atoms[c];
    x.sets.forEach(set => set.forEach(i => {
      const a = emb.atoms[i], d = (a.x - C.x) * x.n[0] + (a.y - C.y) * x.n[1] + (a.z - C.z) * x.n[2];
      a.x -= 2 * d * x.n[0]; a.y -= 2 * d * x.n[1]; a.z -= 2 * d * x.n[2];
    }));
    if(molEmbHand(emb, src) === want) return true;
  }
  emb.atoms.forEach((a, i) => { a.x = base[i][0]; a.y = base[i][1]; a.z = base[i][2]; });
  return false;
}
function molEmbChirality(it, emb){
  const centers = new Set(it.bonds.filter(b => b.s && it.atoms[b.a] && it.atoms[b.a].chi).map(b => b.a));
  for(let pass = 0; pass < 3; pass++){
    let done = true;
    centers.forEach(i => {
      const want = Math.sign(it.atoms[i].chi);
      if(want && molEmbHand(emb, i) !== want){ done = false; molEmbInvertAt(emb, i, want); }
    });
    if(done) break;
  }
  return emb;
}
function molEmb(it){
  const key = it.atoms.map(a => a.e + (a.q || 0) + (a.f ? 'f' : '') + (a.h == null ? '' : 'h' + a.h) + (a.chi ? 'c' + a.chi : '') + molRd(a.x) + ',' + molRd(a.y)).join(';') +
    '|' + it.bonds.map(b => b.a + '-' + b.b + ':' + b.o + (b.s || 0)).join(';');
  const c = MOL_CACHE.get(it.id);
  if(c && c.key === key) return c.emb;
  /* a fold is a way of drawing, not a way of being: in space the chain is
     laid back out. Indices are untouched by that, so `a.src` still points home. */
  const src = it.atoms.some(a => a.f) ? molUnfoldAll(molClone(it)) : it;
  const emb = it.atoms.length ? molEmbChirality(src, chemEmbed(src)) : { atoms: [], bonds: [], arom: new Set(), nb: [] };
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
const molLen3 = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) || 1;
const molLum = hex => { const n = parseInt(hex.slice(1), 16); return (.299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) / 255; };
function molHi3DSVG(it, A, emb, pts, rm, s, srcOf, bw){
  let out = '';
  for(const h of molHis(it)){
    if(!molHiValid(it, h)) continue;
    let atom = -1, bond = null;
    if(h.t === 'a') atom = srcOf[h.i] == null ? -1 : srcOf[h.i];
    else if(h.t === 'ea') atom = h.i;
    else if(h.t === 'b'){
      const a = srcOf[h.a], b = srcOf[h.b]; if(a != null && b != null) bond = [a, b];
    } else if(h.t === 'h'){
      const a = srcOf[h.a], b = srcOf[h.b]; if(a != null && b != null) bond = [a, b];
    } else if(h.t === 'eb'){
      const b = emb.bonds[h.i]; if(b) bond = [b.a, b.b];
    }
    if(atom >= 0 && A[atom] && pts[atom]){
      const P = pts[atom], r = Math.max(18, rm[atom] * s * P.k + .18 * s);
      out += '<circle class="mha3" cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>' +
        '<circle class="mhr3" cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) + '" r="' + (r + 3).toFixed(1) + '"/>';
    } else if(bond){
      const P = pts[bond[0]], Q = pts[bond[1]];
      if(P && Q) out += '<line class="mhl3' + (h.t === 'h' ? ' dotted' : '') + '" x1="' + P.x.toFixed(1) + '" y1="' + P.y.toFixed(1) +
        '" x2="' + Q.x.toFixed(1) + '" y2="' + Q.y.toFixed(1) + '" stroke-width="' + Math.max(16, bw + .2 * s).toFixed(1) + '"/>';
    }
  }
  return out ? '<g class="mhi3" aria-hidden="true">' + out + '</g>' : '';
}
/* ---- balls that cut into one another ----
   Space-filling balls overlap deeply, and painting whole discs back to front makes
   the nearer one read as a coin stuck on the front: the real edge between two
   spheres is not an outline but the circle where their surfaces cut, which on
   screen is an ellipse. Every ball is masked back to the cap that truly stands
   proud of its neighbours, and one swallowed whole is dropped. */
function molCaps(vv, rm, s, prj){
  const n = vv.length, hide = new Set(), cut = new Array(n).fill('');
  for(let i = 0; i < n; i++){
    const ri = rm[i], ci = vv[i], Ci = prj(ci), Ri = ri * s * Ci[2];
    for(let j = 0; j < n; j++){
      if(j === i || hide.has(i)) continue;
      /* only a ball painted BEFORE this one needs cutting out of it: one painted after
         simply covers it. That halves the work, and it makes a gap impossible — the
         earliest ball over any spot is cut by nothing, so something is always painted
         there, and every cut edge fades onto solid ball rather than onto the paper. */
      if(vv[j][2] > ci[2] || (vv[j][2] === ci[2] && j > i)) continue;
      const rj = rm[j], vx = vv[j][0] - ci[0], vy = vv[j][1] - ci[1], vz = vv[j][2] - ci[2];
      const D = Math.hypot(vx, vy, vz);
      if(!D || D >= ri + rj) continue;               /* they never touch */
      const a0 = (D * D + ri * ri - rj * rj) / (2 * D);   /* the seam, along the centre line */
      if(a0 >= ri) continue;                         /* j sits inside i: nothing of i is lost */
      if(a0 <= -ri){ hide.add(i); continue; }        /* i sits inside j */
      /* A ball that breaks its neighbour's surface by a hair draws a dark thread across
         the model, because the sliver it shows is all limb. Lean the seam a couple of
         units towards whichever cap is the thinner and the hairline goes under. */
      const eps = Math.min(3 / s, .05 * Math.min(ri, rj));
      const a = a0 + (ri + a0 < D + rj - a0 ? -eps : eps);
      if(a >= ri - .5 / s) continue;                 /* what j would take is thinner than the paper shows */
      if(a <= -ri + .5 / s){ hide.add(i); continue; }/* … and what i has left is */
      const u = [vx / D, vy / D, vz / D], rho = Math.sqrt(ri * ri - a * a);
      /* a point of i is lost exactly when it lies past the seam — the plane, not the
         neighbour, since the plane is the one both balls agree on */
      const bur = q => (q[0] - ci[0]) * u[0] + (q[1] - ci[1]) * u[1] + (q[2] - ci[2]) * u[2] > a;
      /* a frame across the seam, turned until e2 lies flat in the screen plane — then
         a seam point stands in front of i's own centre exactly while cos t > c0 */
      let e1 = Math.abs(u[0]) < .9 ? [0, -u[2], u[1]] : [u[2], 0, -u[0]];
      const L1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = [e1[0] / L1, e1[1] / L1, e1[2] / L1];
      let e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
      const G = Math.hypot(e1[2], e2[2]);
      if(G > 1e-9){
        const cs = e1[2] / G, sn = e2[2] / G, q1 = e1;
        e1 = [q1[0] * cs + e2[0] * sn, q1[1] * cs + e2[1] * sn, q1[2] * cs + e2[2] * sn];
        e2 = [e2[0] * cs - q1[0] * sn, e2[1] * cs - q1[1] * sn, e2[2] * cs - q1[2] * sn];
      }
      const P = [ci[0] + a * u[0], ci[1] + a * u[1], ci[2] + a * u[2]];
      const seam = t => [P[0] + rho * (Math.cos(t) * e1[0] + Math.sin(t) * e2[0]),
        P[1] + rho * (Math.cos(t) * e1[1] + Math.sin(t) * e2[1]),
        P[2] + rho * (Math.cos(t) * e1[2] + Math.sin(t) * e2[2])];
      const B0 = rho * G, c0 = B0 > 1e-9 ? -a * u[2] / B0 : (a * u[2] > 0 ? -2 : 2);
      const pole = bur([ci[0], ci[1], ci[2] + ri]);     /* is the point nearest the eye lost? */
      if(c0 >= 1){                                     /* the seam misses the near face: all or nothing */
        if(pole) hide.add(i);
        continue;
      }
      /* a tenth of a unit is a thousandth of a bond: finer than any screen, and fine
         enough that turning the molecule slides these edges instead of snapping them
         from one whole unit to the next, which reads as a wobble */
      const xy = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
      const steps = arc => Math.max(4, Math.min(40, Math.round(rho * s * arc / 16)));
      const off = t => xy(prj(seam(t)));
      let d = '';
      if(c0 <= -1){                                    /* the whole seam faces the eye: a closed ring on i */
        const N = steps(2 * Math.PI);
        for(let q = 0; q < N; q++) d += (q ? 'L' : 'M') + off(q / N * 2 * Math.PI);
        d += 'Z';
        /* the ring cuts the near face in two — the piece the ball loses is the one the
           near pole falls in, which is the inside of the ring only when the pole is too */
        if((Math.abs(a) * G < rho * Math.abs(u[2])) !== pole)
          d = 'M' + xy([Ci[0] - Ri - 2, Ci[1]]) + 'A' + (Ri + 2).toFixed(1) + ',' + (Ri + 2).toFixed(1) + ' 0 1,0 ' +
            xy([Ci[0] + Ri + 2, Ci[1]]) + 'A' + (Ri + 2).toFixed(1) + ',' + (Ri + 2).toFixed(1) + ' 0 1,0 ' +
            xy([Ci[0] - Ri - 2, Ci[1]]) + 'Z' + d;
      } else {
        const t0 = Math.acos(c0), N = steps(2 * t0);
        const E1 = prj(seam(-t0)), E2 = prj(seam(t0));
        d = 'M' + xy(E1);
        for(let q = 1; q < N; q++) d += 'L' + off(-t0 + 2 * t0 * q / N);
        d += 'L' + xy(E2);
        /* home along i's own outline, by the way that runs behind j. Walked, not an arc
           command: the two ends can sit very nearly a diameter apart, and there SVG's
           correction for a radius too small to span them throws the centre right off
           the ball — which quietly bites a crescent out of the cut. */
        const f1 = Math.atan2(E1[1] - Ci[1], E1[0] - Ci[0]), f2 = Math.atan2(E2[1] - Ci[1], E2[0] - Ci[0]);
        let dl = ((f1 - f2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const fm = f2 + dl / 2;
        if(!bur([ci[0] + ri * Math.cos(fm), ci[1] + ri * Math.sin(fm), ci[2]])) dl -= 2 * Math.PI;
        const M = Math.max(3, Math.min(48, Math.round(Math.abs(dl) * Ri / 16))), RO = Ri + 2;
        /* a shade outside the outline, so rounding the walk to whole units cannot leave
           a thread of the ball's own darkest edge standing along the cut */
        for(let q = 0; q <= M; q++)
          d += 'L' + xy([Ci[0] + RO * Math.cos(f2 + dl * q / M), Ci[1] + RO * Math.sin(f2 + dl * q / M)]);
        d += 'L' + xy(E1) + 'Z';
      }
      cut[i] += '<path fill="#000" fill-rule="evenodd" d="' + d + '"/>';
    }
  }
  return { hide, cut };
}
function molDraw3D(it, live, el){
  const box = it.box || molBox(it), W = molU(box.w), H = molU(box.h);
  const base = { vb: '0 0 ' + W + ' ' + H, width: (box.w * MOL_BL).toFixed(2), cls: 'molsvg mol3svg m3d', inner: '' };
  const emb = molEmb(it), A = emb.atoms, s3 = it.s3 || 'ball';
  if(!A.length){ if(el){ el._molPts = []; el._molSegs = []; } return base; }
  const yaw = it.yaw || 0, pitch = it.pitch || 0, zoom = it.zoom || 1;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  /* rotY(yaw) then rotX(pitch), y down and z towards the eye: dragging down
     tips the top towards you, dragging right turns the front to the right */
  const turn = (x, y, z) => [cy * x + sy * z, -sx * sy * x + cx * y + sx * cy * z, -cx * sy * x - sx * y + cx * cy * z];
  const vv = A.map(a => turn(a.x, a.y, a.z));
  let R = 0;
  vv.forEach(v => { R = Math.max(R, Math.hypot(v[0], v[1], v[2]) + 1.3); });
  const s = Math.min(W, H) / (2 * R) * .94 * zoom, EYE = 3200;
  const prj = q => { const k = EYE / (EYE - q[2] * s); return [W / 2 + q[0] * s * k, H / 2 + q[1] * s * k, k]; };
  const pts = vv.map(v => { const p = prj(v); return { x: p[0], y: p[1], z: v[2], k: p[2] }; });
  const col = a => { const e = CHEM_SYM[a.e] || CHEM_SYM.C; return a.e === 'H' ? '#e9e9e9' : e.color; };
  const rad = a => { const e = CHEM_SYM[a.e] || CHEM_SYM.C; return s3 === 'fill' ? e.rvdw * .96 : s3 === 'stick' ? .17 : Math.max(.17, e.rcov * .42); };
  const bw = (s3 === 'stick' ? .32 : .16) * s, rm = A.map(rad);
  if(el){
    pts.forEach((P, i) => { P.r = rm[i] * s * P.k; P.src = A[i].src; });
    el._molPts = pts;
  }
  /* only space-filling balls reach into one another; the rest never do, so never pay for it */
  const caps = s3 === 'fill' ? molCaps(vv, rm, s, prj) : null;
  const seq = ++MOL_SEQ, defs = {}, pick = MOL_PICK && MOL_PICK.id === it.id ? MOL_PICK.atoms : [];
  const grad = a => {
    const c = col(a), id = 'mg' + seq + '_' + (CHEM_SYM[a.e] ? CHEM_SYM[a.e].z : 0);
    if(!defs[id]) defs[id] = '<radialGradient id="' + id + '" cx="36%" cy="34%" r="66%"><stop offset="0" stop-color="' +
      molShade(c, .55) + '"/><stop offset=".55" stop-color="' + c + '"/><stop offset="1" stop-color="' + molShade(c, -.38) + '"/></radialGradient>';
    return id;
  };
  const prim = [];
  A.forEach((a, i) => prim.push({ z: pts[i].z, t: 'a', i }));
  /* a half-stick is depth-sorted on the middle of the piece that shows — the piece
     outside its own ball — so it lands in front of that ball only when it points at
     the eye, and behind it when it runs away */
  if(s3 !== 'fill') emb.bonds.forEach((b, k) => {
    [[b.a, b.b], [b.b, b.a]].forEach(e => {
      const f = e[0], t = e[1], L3 = molLen3(vv[f], vv[t]);
      const g = Math.min(rm[f] / L3, .46);
      prim.push({ z: vv[f][2] + (vv[t][2] - vv[f][2]) * (g + .5) / 2 - .001, t: 'b', k, from: f, to: t });
    });
  });
  /* the dotted ones join the same queue, sorted on their middle: they are drawn
     between the very atoms they were drawn between, since chemEmbed seeds from
     the drawing and so keeps two molecules where the hand put them */
  const srcOf = {};
  A.forEach((a, i) => { if(a.src >= 0) srcOf[a.src] = i; });
  molHbs(it).forEach(h => {
    const i = srcOf[h.a], j = srcOf[h.b];
    if(i == null || j == null) return;
    prim.push({ z: (vv[i][2] + vv[j][2]) / 2, t: 'h', i, j });
  });
  if(el){
    const segs = [];
    emb.bonds.forEach((b, k) => {
      const orig = k < it.bonds.length ? it.bonds[k] : null;
      segs.push({ a:b.a, b:b.b, target:orig ? { t:'b', a:orig.a, b:orig.b } : { t:'eb', i:k } });
    });
    molHbs(it).forEach(h => {
      const a = srcOf[h.a], b = srcOf[h.b];
      if(a != null && b != null) segs.push({ a, b, target:{ t:'h', a:h.a, b:h.b } });
    });
    el._molSegs = segs;
  }
  prim.sort((p, q) => p.z - q.z);
  let out = '';
  /* Space-filling balls fuse into one solid, so an outline round every ball reads as a
     heap of circles rather than a shape: the only edge that belongs to the thing is the
     one around the whole of it. Painting each ball once, a hair fat, behind the lot
     leaves exactly that — the union's rim, in each atom's own colour, and no line
     anywhere across the middle. Inside, the shading does the work. */
  const rim = s3 === 'fill' ? 1.6 : 0, mkOf = {};
  if(rim) for(const p of prim){
    if(p.t !== 'a' || (caps && caps.hide.has(p.i))) continue;
    const P = pts[p.i], r = rm[p.i] * s * P.k;
    /* the rim wears the ball's own mask: a cut can end a hair outside the ball behind
       it, and an unmasked rim would show through there as a ring in mid-air */
    const mk = caps.cut[p.i] ? (mkOf[p.i] = 'mk' + seq + '_' + p.i) : '';
    if(mk) defs[mk] = '<mask id="' + mk + '"><rect x="' + (P.x - r * 1.4).toFixed(0) + '" y="' + (P.y - r * 1.4).toFixed(0) +
      '" width="' + (r * 2.8).toFixed(0) + '" height="' + (r * 2.8).toFixed(0) + '" fill="#fff"/>' + caps.cut[p.i] + '</mask>';
    out += (mk ? '<g mask="url(#' + mk + ')">' : '') + '<circle class="rim" cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) +
      '" r="' + (r + rim).toFixed(1) + '" fill="' + molShade(col(A[p.i]), -.45) + '"/>' + (mk ? '</g>' : '');
  }
  for(const p of prim){
    if(p.t === 'a'){
      if(caps && caps.hide.has(p.i)) continue;
      const a = A[p.i], P = pts[p.i], r = rm[p.i] * s * P.k, c = col(a);
      const mk = mkOf[p.i] || '';                 /* built with the rim, which shares it */
      out += mk ? '<g mask="url(#' + mk + ')">' : '';
      out += '<circle class="ball" data-e="' + a.e + '" cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) + '" r="' + r.toFixed(1) +
        '" fill="url(#' + grad(a) + ')" stroke="' + (rim ? 'none' : molShade(c, -.45)) + '"/>';
      if(it.lab && (s3 !== 'ball' || a.e !== 'H'))
        out += '<text class="lb3" x="' + P.x.toFixed(1) + '" y="' + P.y.toFixed(1) + '" font-size="' + Math.max(14, r * 1.1).toFixed(0) +
          '" fill="' + (molLum(c) > .6 ? '#222' : '#fff') + '">' + a.e + '</text>';
      out += mk ? '</g>' : '';
    } else if(p.t === 'h'){
      const Pp = pts[p.i], Q = pts[p.j];
      const dx = Q.x - Pp.x, dy = Q.y - Pp.y, L = Math.hypot(dx, dy) || 1;
      const ga = rm[p.i] * s * Pp.k, gb = rm[p.j] * s * Q.k;
      if(L > ga + gb + 2)
        out += '<line class="hb3" x1="' + (Pp.x + dx / L * ga).toFixed(1) + '" y1="' + (Pp.y + dy / L * ga).toFixed(1) +
          '" x2="' + (Q.x - dx / L * gb).toFixed(1) + '" y2="' + (Q.y - dy / L * gb).toFixed(1) +
          '" stroke-width="' + (bw * .5).toFixed(1) + '"/>';
    } else {
      const b = emb.bonds[p.k], f = p.from, t = p.to, F = vv[f], T = vv[t], a = A[f];
      const P = pts[f], Q = pts[t], c = molShade(col(a), -.12);
      const M = prj([(F[0] + T[0]) / 2, (F[1] + T[1]) / 2, (F[2] + T[2]) / 2]);
      const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const n = s3 === 'ball' ? b.o : 1, gap = .2 * s, wid = n > 1 ? bw * .62 : bw, L3 = molLen3(F, T);
      for(let q = 0; q < n; q++){
        const off = (q - (n - 1) / 2) * gap;
        /* start the stick where it leaves the ball, in space — a chord, since the
           line runs wid/2 wide and a double bond sits off to one side */
        const side = Math.hypot(off, wid / 2) / s;
        const g = Math.min(Math.sqrt(Math.max(0, rm[f] * rm[f] - side * side)) / L3, .46);
        const S = prj([F[0] + (T[0] - F[0]) * g, F[1] + (T[1] - F[1]) * g, F[2] + (T[2] - F[2]) * g]);
        out += '<line class="stick" x1="' + (S[0] + nx * off).toFixed(1) + '" y1="' + (S[1] + ny * off).toFixed(1) +
          '" x2="' + (M[0] + nx * off).toFixed(1) + '" y2="' + (M[1] + ny * off).toFixed(1) +
          '" stroke="' + c + '" stroke-width="' + wid.toFixed(1) + '"/>';
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
  /* Deliberately last: this is a screen-space correspondence aura, so depth
     must never hide it behind a nearer sphere or stick. */
  out += molHi3DSVG(it, A, emb, pts, rm, s, srcOf, bw);
  base.inner = '<defs>' + Object.values(defs).join('') + '</defs>' + out;
  return base;
}
/* `view:'3d'` belonged to the old either/or viewer. Read it once as a fully
   opened companion, then keep the paper drawing present from here on. */
const molPeek = it => clamp(it.peek == null ? (it.view === '3d' ? 100 : 0) : (+it.peek || 0), 0, 100);
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
function molHiOneText(it, h){
  if(h.t === 'a') return it.atoms[h.i].e + ' atom';
  if(h.t === 'ea') return 'H atom';
  if(h.t === 'b' || h.t === 'h'){
    const A = it.atoms[h.a], B = it.atoms[h.b];
    if(!A || !B) return '';
    return A.e + (h.t === 'h' ? '···' : '–') + B.e + (h.t === 'h' ? ' hydrogen bond' : ' bond');
  }
  return h.t === 'eb' ? 'H bond' : '';
}
function molHiText(it){
  const hi = molHis(it).filter(h => molHiValid(it, h));
  if(!hi.length) return '';
  if(hi.length > 3) return hi.length + ' objects';
  return hi.map(h => molHiOneText(it, h)).filter(Boolean).join(' + ');
}
function molInfoHTML(it, live){
  if(!it.atoms.length) return live ? '<span class="dim">click to place an atom · drag from one to bond it · type a symbol</span>' : '';
  const f = chemFormula(it), name = chemName(it);
  let s = f.html + ' · ' + chemMass(it).toFixed(2) + ' g/mol' + (name ? ' · ' + esc(name) : '');
  if(live && MOL_PICK && MOL_PICK.id === it.id && MOL_PICK.atoms.length){
    const m = molMeasure(it, molEmb(it));
    if(m) s += '<br><span class="pkm">' + esc(m) + '</span>';
  }
  if(live){ const h = molHiText(it); if(h) s += '<br><span class="mhim">highlight · ' + esc(h) + '</span>'; }
  return s;
}

/* ================= on the page ================= */
/* redraw in place — the <svg> node itself is kept, so a pointer it has
   captured mid-gesture stays captured */
function molRepaint(el, it, hov){
  if(hov === undefined) hov = molHoverGhost(el, it);      /* whatever the pointer promises */
  /* what is on the paper is what molHoverSync compares against: a repaint that
     quietly cast a ghost of its own and did not say so would be the last word,
     because the next promise would look unchanged and never be painted */
  el._molG = hov ? hov.svg : ''; el._molW = hov ? hov.why : '';
  const svg = el.querySelector('.mol2svg');
  const d = molDraw2D(it, true, hov && hov.svg);
  if(svg){
    svg.setAttribute('viewBox', d.vb); svg.style.width = d.width + 'em';
    svg.setAttribute('class', d.cls + (hov && hov.why ? ' nogo' : ''));
    svg.innerHTML = d.inner;
  }
  const peek = molPeek(it), win = el.querySelector('.mol3win'), svg3 = win && win.querySelector('.mol3svg');
  if(win){
    const full = parseFloat(d.width) || MOL_MINW * MOL_BL;
    win.hidden = peek <= 0;
    win.style.width = (full * peek / 100).toFixed(2) + 'em';
    win.setAttribute('aria-hidden', peek <= 0 ? 'true' : 'false');
    if(svg3 && peek > 0){
      const d3 = molDraw3D(it, true, el);
      svg3.setAttribute('viewBox', d3.vb); svg3.style.width = d3.width + 'em';
      svg3.setAttribute('class', d3.cls); svg3.innerHTML = d3.inner;
    } else if(peek <= 0){
      el._molPts = []; el._molSegs = [];
    }
  }
  const fig = el.querySelector('.mol');
  if(fig){ fig.classList.toggle('has3d', peek > 0); fig.classList.toggle('mono', !!it.mono); }
  const info = el.querySelector('.molinfo');
  if(info) info.innerHTML = hov && hov.why ? '<span class="mno">' + esc(hov.why) + '</span>' : molInfoHTML(it, true);
  molRailSync(el); molViewRailSync(el, it);
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
  const stereo = new Set(it.bonds.filter(b => b.s).map(b => b.a));
  it.atoms.forEach((a, i) => { if(a.chi && !stereo.has(i)) delete a.chi; });
  if(it.hi){
    const keep = molHis(it).filter(h => h.t !== 'ea' && h.t !== 'eb' && molHiValid(it, h));
    if(keep.length) it.hi = keep; else delete it.hi;
  }
  if(fit !== false) molFit(el, it);
  molRepaint(el, it);
  queueSave(page.id);
  /* the menu belongs to a set of atoms; if the edit took them, it goes with them */
  if(MOL_MENU && MOL_MENU.it === it){
    const sel = MOL_SEL.get(it.id);
    if(!sel || !sel.size) molMenuClose();
  }
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
/* what is under the pointer: an atom first, then a folded run, then a bond.
   What is asleep inside a fold is not there to be hit — the fold itself is. */
function molHit(it, p, ra, rb){
  const folds = molFolds(it), hid = new Set();
  folds.forEach(f => f.run.forEach(j => hid.add(j)));
  let best = null, bd = ra || .3;
  it.atoms.forEach((a, i) => { if(hid.has(i)) return; const d = Math.hypot(a.x - p.x, a.y - p.y); if(d < bd){ bd = d; best = { atom: i }; } });
  if(best) return best;
  bd = rb == null ? .18 : rb;
  if(bd <= 0) return null;
  folds.forEach((f, t) => { const d = molSegDist(p, it.atoms[f.a], it.atoms[f.b]); if(d < bd){ bd = d; best = { fold: t }; } });
  molHbs(it).forEach((h, t) => {
    if(hid.has(h.a) || hid.has(h.b) || !it.atoms[h.a] || !it.atoms[h.b]) return;
    const d = molSegDist(p, it.atoms[h.a], it.atoms[h.b]); if(d < bd){ bd = d; best = { hb: t }; }
  });
  it.bonds.forEach((b, k) => {
    if(hid.has(b.a) || hid.has(b.b)) return;
    const d = molSegDist(p, it.atoms[b.a], it.atoms[b.b]); if(d < bd){ bd = d; best = { bond: k }; }
  });
  return best;
}
function molHiTarget2D(it, hit){
  if(!hit) return null;
  if(hit.atom != null) return { t:'a', i:hit.atom };
  if(hit.bond != null){ const b = it.bonds[hit.bond]; return b ? { t:'b', a:b.a, b:b.b } : null; }
  if(hit.hb != null){ const h = molHbs(it)[hit.hb]; return h ? { t:'h', a:h.a, b:h.b } : null; }
  return null;
}
function molSetHi(it, el, page, target){
  if(!target) delete it.hi;
  else {
    const hi = molHis(it), at = hi.findIndex(h => molHiSame(h, target));
    if(at >= 0) hi.splice(at, 1); else hi.push(target);
    if(hi.length) it.hi = hi; else delete it.hi;
  }
  molRepaint(el, it, null); queueSave(page.id); SND.tick();
}
function molHiGesture(e, svg, el, it, page){
  const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
  let moved = false;
  try{ svg.setPointerCapture(pid); }catch(err){}
  const mv = ev => { if(ev.pointerId === pid && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true; };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up);
    if(ev.type !== 'pointerup' || moved) return;
    const p = molPt(svg, ev), hit = molHit(it, p, .42, .26);
    molSetHi(it, el, page, molHiTarget2D(it, hit));
  };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
}
function molPickHi3D(el, it, svg, e, page){
  const pts = el._molPts || [], segs = el._molSegs || [];
  const m = svg.getScreenCTM(); if(!m) return;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  let atom = -1, bd = Infinity;
  pts.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y), reach = Math.max(MOL_U * .22, (q.r || 0) + 10);
    if(d <= reach && d < bd){ bd = d; atom = i; }
  });
  if(atom >= 0){
    const src = pts[atom].src;
    return molSetHi(it, el, page, src >= 0 ? { t:'a', i:src } : { t:'ea', i:atom });
  }
  let target = null; bd = MOL_U * .24;
  segs.forEach(s => {
    const A = pts[s.a], B = pts[s.b]; if(!A || !B) return;
    const d = molSegDist(p, A, B); if(d < bd){ bd = d; target = s.target; }
  });
  molSetHi(it, el, page, target);
}
/* how near counts as on it, tool by tool: a ring is nearly always fused onto a
   bond rather than hung off an atom, so it reaches for bonds from farther out,
   and a charge only ever lands on an atom, so it never finds a bond at all */
const MOL_GRAB = { ring: { a:.3, b:.34 }, charge: { a:.42, b:0 }, fold: { a:.3, b:.3 }, lasso: { a:.3, b:0 } };
const molHitFor = (it, p, tool) => { const g = MOL_GRAB[tool]; return molHit(it, p, g && g.a, g && g.b); };
/* the nearest atom the pen can still reach from empty paper */
function molReach(it, p){
  let best = -1, bd = MOL_REACH;
  it.atoms.forEach((a, i) => { const d = Math.hypot(a.x - p.x, a.y - p.y); if(d < bd){ bd = d; best = i; } });
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
const molSetGhost = (svg, html) => { const g = svg && svg.querySelector('.mghost'); if(g) g.innerHTML = html || ''; };

/* ================= what the next click would do =================
   Every change to the drawing is worked out first on a copy of the graph. The
   ghost under the pointer is that copy, drawn by the very routines that draw
   the molecule, and the click keeps it — so what is promised is exactly what
   lands. A copy that would leave an atom holding more bonds than it can is not
   kept at all: the ghost turns red, the strip says which atom and why, and the
   click is refused. That is the whole of the rule — you can only build a
   molecule that could exist. */
const molClone = it => ({ atoms: it.atoms.map(a => ({ ...a })), bonds: it.bonds.map(b => ({ ...b })),
  hb: molHbs(it).map(h => ({ ...h })) });
/* the first atom the change would overfill, said the way the red halo says it.
   An atom that was already over stays the drawing's business, not this one's —
   a molecule read in from SMILES must not lock the pen. */
function molWhyBad(it, sim){
  if(sim.atoms.length < it.atoms.length) return '';        /* taking away never overfills */
  const nb0 = chemNbrs(it), nb1 = chemNbrs(sim);
  for(let i = 0; i < sim.atoms.length; i++){
    if(!chemOver(sim, i, nb1)) continue;
    if(i < it.atoms.length && chemOver(it, i, nb0)) continue;
    return sim.atoms[i].e + ' cannot hold ' + chemBondSum(sim, i, nb1) + ' bonds';
  }
  return '';
}
/* the plan: { sim, kind, did, why, gone } — sim is the copy after the change */
function molPlan(it, tool, hit, p0, p1, moved){
  const P = { sim: molClone(it), kind:'', did:false, why:'', gone:null };
  const sim = P.sim, B = MOL_BONDS[MOL_BOND], R = MOL_RINGS[MOL_RING];
  if(tool === 'draw' && B.hb){
    /* the dotted pen goes atom to atom and nowhere else — there is nothing a
       hydrogen bond could mean pointing at bare paper */
    if(!moved){
      if(hit && hit.hb != null){ P.gone = { hb: hit.hb }; sim.hb.splice(hit.hb, 1); P.kind = 'unhb'; P.did = true; }
    } else if(hit && hit.atom != null){
      /* Unlike a covalent pen there is no honest atom to invent at the loose
         end, but the dotted lead still follows the hand continuously. It
         becomes committable only when it snaps onto a second atom. */
      P.kind = 'hb'; P.did = true; P.previewOnly = true;
      P.preview = { a:hit.atom, x:p1.x, y:p1.y };
      const j = molAtomNear(sim, p1.x, p1.y, .45, hit.atom);
      if(j >= 0 && molHbAt(sim, hit.atom, j) < 0){
        P.why = molWhyNoHB(sim, hit.atom, j);
        sim.hb.push({ a: hit.atom, b: j });     /* pushed either way: the ghost shows what was asked for */
        P.preview.j = j; P.previewOnly = false;
      } else if(j >= 0) P.preview.j = j;
    }
  } else if(tool === 'draw'){
    const reach = !moved && !hit ? molReach(it, p0) : -1;
    if(moved || reach >= 0){
      /* a bond: dragged out of where the press landed, or — from bare paper
         still within a hand's reach of an atom — pulled out of that atom
         towards the pointer, snapped to the nearest 30° and one bond long */
      const start = moved ? (hit && hit.atom != null ? hit.atom : molAddAtom(sim, MOL_EL, p0.x, p0.y)) : reach;
      const tgt = molAim(sim, sim.atoms[start], moved ? p1 : p0, start);
      const end = tgt.atom != null ? tgt.atom : molAddAtom(sim, MOL_EL, tgt.x, tgt.y);
      if(end !== start) molAddBond(sim, start, end, B.o, B.s);
      P.kind = 'grow'; P.did = true;
    } else if(hit && hit.atom != null){
      const a = sim.atoms[hit.atom];
      if(a.e !== MOL_EL){ a.e = MOL_EL; a.h = null; a.iso = null; P.kind = 'retype'; }
      else { molSprout(sim, hit.atom, MOL_EL, B.o, B.s); P.kind = 'grow'; }
      P.did = true;
    } else if(hit && hit.bond != null){
      const b = sim.bonds[hit.bond], o0 = b.o, s0 = b.s || 0;
      if(B.s){ if(b.s === B.s){ const t = b.a; b.a = b.b; b.b = t; } else { b.s = B.s; b.o = 1; } }
      else if(B.o === 1 || (b.o === B.o && !b.s)){
        /* step to the next order the two ends can actually hold: a C–O bond
           goes single, double, single, because O has no third bond to give */
        b.s = 0;
        for(let t = 1; t <= 3; t++){ b.o = (o0 - 1 + t) % 3 + 1; if(!molWhyBad(it, sim)) break; }
      } else { b.o = B.o; b.s = 0; }
      P.kind = 'bond'; P.did = b.o !== o0 || (b.s || 0) !== s0 || sim.bonds[hit.bond].a !== it.bonds[hit.bond].a;
    } else { molAddAtom(sim, MOL_EL, p0.x, p0.y); P.kind = 'atom'; P.did = true; }
  } else if(tool === 'chain'){
    /* a zigzag out of the atom pressed, or out of a fresh one on bare paper,
       as long as the drag asks for and snapped to the lattice like every bond */
    const start = hit && hit.atom != null ? hit.atom : molAddAtom(sim, 'C', p0.x, p0.y);
    const S = sim.atoms[start], L = Math.hypot(p1.x - S.x, p1.y - S.y);
    const ax = molSnap(moved && L > .3 ? Math.atan2(p1.y - S.y, p1.x - S.x) : molOpenDir(sim, start));
    const n = moved ? molChainN(L) : 1;
    const made = molChain(sim, start, ax, n, molChainDir(sim, start, ax));
    P.kind = 'chain'; P.n = n; P.did = true;
    P.marks = made.map((j, t) => ({ x: sim.atoms[j].x, y: sim.atoms[j].y, n: t + 1, ax }));
  } else if(tool === 'ring'){
    if(!moved){
      let idx;
      if(hit && hit.bond != null) idx = molRingOnBond(sim, R, hit.bond);
      else if(hit && hit.atom != null) idx = molRingOnAtom(sim, R, hit.atom);
      else idx = molRingAt(sim, R, p0.x, p0.y);
      P.kind = 'ring'; P.did = true; P.marks = [];
    } else {
      /* dragged: a row of rings, each fused onto the face of the one before
         that points at the pointer, as many as the drag reaches for */
      let idx, from = null;
      if(hit && hit.bond != null){ idx = molRingOnBond(sim, R, hit.bond, p1); from = hit.bond; }
      else if(hit && hit.atom != null) idx = molRingOnAtom(sim, R, hit.atom);
      else idx = molRingAt(sim, R, p0.x, p0.y);
      const step = 1 / Math.tan(Math.PI / R.n);        /* middle to middle, fused */
      const mid0 = molRingMid(sim, idx);
      const want = clamp(1 + Math.round(Math.hypot(p1.x - mid0.x, p1.y - mid0.y) / step), 1, MOL_RINGS_MAX);
      P.marks = [{ x: mid0.x, y: mid0.y, n: 1, mid: 1 }];
      for(let t = 1; t < want; t++){
        const k = molRingFace(sim, idx, p1, from);
        if(k < 0) break;
        from = k; idx = molRingOnBond(sim, R, k, p1);
        const m = molRingMid(sim, idx);
        P.marks.push({ x: m.x, y: m.y, n: t + 1, mid: 1 });
      }
      P.kind = 'ring'; P.n = P.marks.length; P.did = true;
      if(P.marks.length < 2) P.marks = [];
    }
  } else if(tool === 'fold'){
    if(!moved){
      if(hit && hit.fold != null){
        const f = molFolds(sim)[hit.fold];
        if(f){
          P.swipe = [[it.atoms[f.a].x, it.atoms[f.a].y, it.atoms[f.b].x, it.atoms[f.b].y]];
          P.marks = [{ x: (it.atoms[f.a].x + it.atoms[f.b].x) / 2, y: (it.atoms[f.a].y + it.atoms[f.b].y) / 2, n: f.run.length, mid: 1 }];
          molUnfold(sim, f); P.kind = 'unfold'; P.did = true;
        }
      } else {
        const nb = chemNbrs(sim), ring = molRingAtoms(sim);
        let seed = -1;
        if(hit && hit.atom != null) seed = hit.atom;
        else if(hit && hit.bond != null){
          const b = sim.bonds[hit.bond];
          seed = molFoldable(sim, b.a, nb, ring) ? b.a : b.b;
        }
        const r = seed >= 0 ? molRun(sim, seed, nb, ring) : null;
        if(r && r.run.length >= MOL_FOLD_MIN){
          const path = [r.a].concat(r.run, [r.b]);
          P.swipe = [];
          for(let t = 1; t < path.length; t++)
            P.swipe.push([it.atoms[path[t - 1]].x, it.atoms[path[t - 1]].y, it.atoms[path[t]].x, it.atoms[path[t]].y]);
          const m = it.atoms[r.run[r.run.length >> 1]];
          P.marks = [{ x: m.x, y: m.y - .5, n: r.run.length, mid: 1 }];
          molFold(sim, r); P.kind = 'fold'; P.did = true;
        }
      }
    }
  } else if(tool === 'charge'){
    if(!moved && hit && hit.atom != null){
      const a = sim.atoms[hit.atom];
      a.q = clamp((a.q || 0) + MOL_Q, -4, 4);
      P.kind = 'charge'; P.did = a.q !== (it.atoms[hit.atom].q || 0);
    }
  } else if(tool === 'erase'){
    if(moved) return P;
    if(hit && hit.hb != null){ P.gone = { hb: hit.hb }; sim.hb.splice(hit.hb, 1); P.kind = 'erase'; P.did = true; }
    else if(hit && hit.atom != null){ P.gone = { atom: hit.atom }; molDelAtom(sim, hit.atom); P.kind = 'erase'; P.did = true; }
    else if(hit && hit.bond != null){ P.gone = { bond: hit.bond }; molDelBond(sim, hit.bond); P.kind = 'erase'; P.did = true; }
  }
  if(P.did && !P.why) P.why = molWhyBad(it, sim);
  return P;
}
/* the plan, drawn: what is new or changed painted out of the copy, what is
   about to go struck through in red */
/* the numbers that ride over a chain or a row of rings while it is dragged out,
   and the band that says which run a fold would take */
function molPlanMarks(P){
  let out = '';
  (P.swipe || []).forEach(v => { out += molLine(v[0], v[1], v[2], v[3], 'gs'); });
  const M = P.marks || [];
  /* every carbon counted while there are few enough to read; past that, every
     fifth and the last, which is the one the eye is actually looking for */
  M.forEach((m, t) => {
    if(!m.mid && M.length > 15 && (t + 1) % 5 && t !== M.length - 1) return;
    let x = m.x, y = m.y;
    if(!m.mid){
      const nx = -Math.sin(m.ax), ny = Math.cos(m.ax), sg = ny > 0 ? -1 : 1;
      x += nx * .46 * sg; y += ny * .46 * sg;
    }
    out += '<text class="gc' + (m.mid ? ' big' : '') + '" x="' + molU(x) + '" y="' + molU(y) + '">' + m.n + '</text>';
  });
  return out;
}
function molPlanGhost(it, P){
  if(!P || !P.did) return '';
  if(P.kind === 'hb' && P.previewOnly && P.preview){
    const A = it.atoms[P.preview.a], B = P.preview.j != null ? it.atoms[P.preview.j] : P.preview;
    if(!A || !B) return '';
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    return '<g class="gp"><line class="hb" x1="' + molU(A.x + dx / L * .3) + '" y1="' + molU(A.y + dy / L * .3) +
      '" x2="' + molU(B.x - dx / L * (P.preview.j != null ? .3 : 0)) + '" y2="' + molU(B.y - dy / L * (P.preview.j != null ? .3 : 0)) + '"/></g>';
  }
  if(P.kind === 'fold' || P.kind === 'unfold') return '<g class="gp">' + molPlanMarks(P) + '</g>';
  if(P.kind === 'erase' || P.kind === 'unhb'){
    let out = '';
    if(P.gone.hb != null){
      const h = molHbs(it)[P.gone.hb];
      return h ? molLine(it.atoms[h.a].x, it.atoms[h.a].y, it.atoms[h.b].x, it.atoms[h.b].y, 'gx') : '';
    }
    if(P.gone.atom != null){
      const i = P.gone.atom, a = it.atoms[i];
      it.bonds.forEach(b => { if(b.a === i || b.b === i) out += molLine(it.atoms[b.a].x, it.atoms[b.a].y, it.atoms[b.b].x, it.atoms[b.b].y, 'gx'); });
      molHbs(it).forEach(h => { if(h.a === i || h.b === i) out += molLine(it.atoms[h.a].x, it.atoms[h.a].y, it.atoms[h.b].x, it.atoms[h.b].y, 'gx'); });
      out += '<circle class="gxo" cx="' + molU(a.x) + '" cy="' + molU(a.y) + '" r="' + Math.round(MOL_U * .3) + '"/>';
    } else {
      const b = it.bonds[P.gone.bond];
      out += molLine(it.atoms[b.a].x, it.atoms[b.a].y, it.atoms[b.b].x, it.atoms[b.b].y, 'gx');
    }
    return out;
  }
  const sim = P.sim, nb = chemNbrs(sim), nb0 = chemNbrs(it), sty = it.sty || 'skel';
  const lab = sim.atoms.map((a, i) => molLabel(sim, i, nb, sty));
  let out = '';
  sim.bonds.forEach((b, k) => {
    const o = k < it.bonds.length ? it.bonds[k] : null;
    if(o && o.a === b.a && o.b === b.b && o.o === b.o && (o.s || 0) === (b.s || 0)) return;
    out += molBondSVG(sim, b, k, nb, lab);
  });
  sim.atoms.forEach((a, i) => {
    const o = i < it.atoms.length ? it.atoms[i] : null;
    if(o && o.e === a.e && (o.q || 0) === (a.q || 0) && o.iso === a.iso && o.x === a.x && o.y === a.y &&
      chemBondSum(it, i, nb0) === chemBondSum(sim, i, nb)) return;
    out += molAtomSVG(sim, i, nb, lab[i], null);
  });
  molHbs(sim).forEach((h, k) => { if(k >= molHbs(it).length) out += molHbSVG(sim, h, k, lab); });
  return '<g class="gp' + (P.why ? ' bad' : '') + '">' + out + molPlanMarks(P) + '</g>';
}
/* ---- the ghost the pointer is casting right now ---- */
function molHoverGhost(el, it){
  if(!el._molHov || el._molDrag || el._molHi) return null;
  if(!el.classList.contains('sel') || PLOT_MOVE.has(it.id)) return null;
  const p = el._molHov, P = molPlan(it, MOL_TOOL, molHitFor(it, p, MOL_TOOL), p, p, false);
  return P.did ? { svg: molPlanGhost(it, P), why: P.why } : null;
}
/* only ever repaint when the ghost has actually changed — snapping means the
   pointer travels a long way between one promise and the next */
function molHoverSync(el, it){
  const h = molHoverGhost(el, it), g = h ? h.svg : '', w = h ? h.why : '';
  if(g === el._molG && w === el._molW) return;
  el._molG = g; el._molW = w;
  molRepaint(el, it, h);
}
function molHoverOff(el, it){
  if(!el._molHov) return;
  el._molHov = null; molHoverSync(el, it);
}
const molHoverAll = () => {
  if(MOL_MENU && !MOL_MENU.el.classList.contains('sel')) molMenuClose();
  document.querySelectorAll('#pageHost .item[data-type="molecule"]').forEach(el => {
    const f = findItem(el.dataset.id); if(f) molHoverSync(el, f.it);
  });
};
/* refused: a shake, a nope, and the reason where the formula sits */
function molNo(el, why){
  SND.nope();
  const info = el.querySelector('.molinfo');
  if(info && why) info.innerHTML = '<span class="mno">' + esc(why) + '</span>';
  const fig = el.querySelector('.mol');
  if(fig){ fig.classList.remove('nono'); void fig.offsetWidth; fig.classList.add('nono'); }
  clearTimeout(el._molNoT);
  el._molNoT = setTimeout(() => { if(fig) fig.classList.remove('nono'); }, 420);
}
/* a change made by the keys: tried on a copy, kept only if it could exist */
function molTry(it, el, page, fit, fn){
  const sim = molClone(it);
  fn(sim);
  const why = molWhyBad(it, sim);
  if(why){ molNo(el, why); return false; }
  it.atoms = sim.atoms; it.bonds = sim.bonds; it.hb = sim.hb;
  molEdit(it, el, page, fit);
  return true;
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
  if(MOL_TOOL !== 'lasso') molMenuClose();
  if(svg.classList.contains('mol3svg')) return molOrbit(e, svg, el, it, page);
  if(el._molHi) return molHiGesture(e, svg, el, it, page);
  molGesture(e, svg, el, it, page);
}
function molGesture(e, svg, el, it, page){
  const pid = e.pointerId, p0 = molPt(svg, e), tool = MOL_TOOL, hit = molHitFor(it, p0, tool);
  let moved = false, last = p0, grabbed = null;
  const sel = MOL_SEL.get(it.id), has = sel && sel.size;
  /* what a lasso drag means was decided before it began: the menu arms it, and
     a press on something already picked carries it whatever the menu says */
  let mode = tool;
  if(tool === 'lasso'){
    if(has && MOL_ARM === 'rot') mode = 'rot';
    else if(has && (MOL_ARM === 'move' || (hit && hit.atom != null && sel.has(hit.atom)))) mode = 'move';
    else mode = 'lasso';
  }
  if(mode === 'move') grabbed = [...sel];
  const spin = mode === 'rot' ? molSpinStart(it, sel, p0) : null;
  const path = mode === 'lasso' ? [p0] : null;
  el._molDrag = true; el._molG = ''; el._molW = '';
  try{ svg.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const p = molPt(svg, ev);
    if(!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < .12) return;
    moved = true;
    if(mode === 'draw' || mode === 'chain' || mode === 'ring'){
      const P = molPlan(it, mode, hit, p0, p, true);
      molSetGhost(svg, molPlanGhost(it, P));
      svg.classList.toggle('nogo', !!P.why);
      /* a drag that is going to be refused says so while it is still a drag —
         the red ghost shows that something is wrong, the strip says what */
      if(P.why) molSay(el, P.why, 1);
      else if(P.n) molSay(el, P.n + (mode === 'ring' ? (P.n === 1 ? ' ring' : ' rings') : P.n === 1 ? ' carbon' : ' carbons'));
    } else if(mode === 'move'){
      grabbed.forEach(i => { it.atoms[i].x = molRd(it.atoms[i].x + p.x - last.x); it.atoms[i].y = molRd(it.atoms[i].y + p.y - last.y); });
      molRepaint(el, it, null);
    } else if(mode === 'rot'){
      molSpinTo(it, spin, p);
      molRepaint(el, it, null);
      molSay(el, Math.round(spin.deg) + '°');
    } else if(mode === 'lasso'){
      path.push(p);
      molSetGhost(svg, '<path class="mq" d="M' + path.map(q => molU(q.x) + ' ' + molU(q.y)).join('L') + 'Z"/>');
    }
    last = p;
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up);
    molSetGhost(svg, ''); svg.classList.remove('nogo');
    el._molDrag = false; el._molG = ''; el._molW = '';
    if(ev.type === 'pointercancel'){ el._molHov = null; return; }
    /* the hand has not moved away, so the next promise is cast straight away */
    if(ev.pointerType !== 'touch') el._molHov = molPt(svg, ev); else el._molHov = null;
    if(tool === 'lasso') molLassoUp(mode, it, el, page, hit, path, moved);
    else molApply(tool, it, el, page, hit, p0, last, moved, grabbed);
  };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
}
/* a word in the strip under the drawing, while a gesture is running */
function molSay(el, t, bad){
  const info = el.querySelector('.molinfo');
  if(info) info.innerHTML = '<span class="' + (bad ? 'mno' : 'msay') + '">' + esc(t) + '</span>';
}

/* ---- turning what the lasso picked, about its own middle ---- */
function molSpinStart(it, sel, p0){
  const idx = [...sel].filter(i => it.atoms[i]);
  const cx = idx.reduce((s, i) => s + it.atoms[i].x, 0) / (idx.length || 1);
  const cy = idx.reduce((s, i) => s + it.atoms[i].y, 0) / (idx.length || 1);
  return { cx, cy, deg: 0, a0: Math.atan2(p0.y - cy, p0.x - cx),
    orig: idx.map(i => ({ i, x: it.atoms[i].x, y: it.atoms[i].y })) };
}
function molSpinTo(it, sp, p){
  const step = Math.PI / 12;                       /* 15°, the step a set square gives you */
  const a = Math.round((Math.atan2(p.y - sp.cy, p.x - sp.cx) - sp.a0) / step) * step;
  sp.deg = Math.round(a * 180 / Math.PI);
  const c = Math.cos(a), s = Math.sin(a);
  sp.orig.forEach(o => {
    const dx = o.x - sp.cx, dy = o.y - sp.cy;
    it.atoms[o.i].x = molRd(sp.cx + dx * c - dy * s);
    it.atoms[o.i].y = molRd(sp.cy + dx * s + dy * c);
  });
}
/* ---- what the lasso leaves behind ---- */
function molInPoly(pts, x, y){
  let inside = false;
  for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const a = pts[i], b = pts[j];
    if((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}
function molLassoUp(mode, it, el, page, hit, path, moved){
  if(mode === 'move' || mode === 'rot'){
    MOL_ARM = null; molMenuSync();
    molEdit(it, el, page); SND.tick();
    molMenuOpen(it, el, page);
    return;
  }
  const sel = new Set();
  if(!moved){
    /* a click takes the whole molecule under it — which is the point of the
       thing when the sheet has half a reaction scheme on it */
    if(hit && hit.atom != null){
      const c = chemComps(it);
      c.comps[c.id[hit.atom]].forEach(i => sel.add(i));
    }
  } else {
    const hidden = new Set();
    molFolds(it).forEach(f => f.run.forEach(j => hidden.add(j)));
    it.atoms.forEach((a, i) => { if(!hidden.has(i) && molInPoly(path, a.x, a.y)) sel.add(i); });
    /* a fold picked by its anchors comes with the carbons asleep inside it */
    molFolds(it).forEach(f => { if(sel.has(f.a) && sel.has(f.b)) f.run.forEach(j => sel.add(j)); });
  }
  MOL_SEL.set(it.id, sel);
  molRepaint(el, it, null);
  if(sel.size){ SND.tick(); molMenuOpen(it, el, page); } else molMenuClose();
}
function molApply(tool, it, el, page, hit, p0, p1, moved, grabbed){
  const P = molPlan(it, tool, hit, p0, p1, moved);
  if(!P.did || P.previewOnly){ molHoverSync(el, it); return; }
  if(P.why){ molNo(el, P.why); molHoverSync(el, it); return; }
  it.atoms = P.sim.atoms; it.bonds = P.sim.bonds; it.hb = P.sim.hb;
  if(P.gone && P.gone.atom != null) MOL_SEL.delete(it.id);
  molEdit(it, el, page); SND.tick();
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
    if(!moved){
      if(ev.type === 'pointerup'){
        if(el._molHi) molPickHi3D(el, it, svg, ev, page); else molPick3D(el, it, svg, ev);
      }
      return;
    }
    queueSave(page.id);
    if(SPRING_STILL.matches) return;
    const v = fl.vel();
    let wy = clamp(v.vx * .011, -9, 9), wp = clamp(v.vy * .011, -9, 9);
    if(Math.abs(wy) + Math.abs(wp) < .15) return;
    const end = () => { MOL_SPIN.delete(it.id); queueSave(page.id); };
    const cancel = motionTick(dt => {
      if(!el.isConnected || molPeek(it) <= 0){ end(); return false; }
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
  if(SPRING_STILL.matches || molPeek(it) <= 0 || !it.auto) return;
  const cancel = motionTick(dt => {
    if(!el.isConnected || molPeek(it) <= 0 || !it.auto){ MOL_SPIN.delete(it.id); return false; }
    it.yaw = (it.yaw || 0) + dt * .45;
    molRepaint(el, it);
    return true;
  });
  MOL_SPIN.set(it.id, () => { cancel(); MOL_SPIN.delete(it.id); queueSave(page.id); });
}
function molSetPeek(el, it, page, value, loud){
  const peek = clamp(Math.round(+value || 0), 0, 100);
  if(peek <= 0) molStopSpin(it);
  it.peek = peek; it.view = '2d';
  if(peek > 0 && it.yaw == null){ it.yaw = 0; it.pitch = 0; }
  if(peek <= 0 && MOL_PICK && MOL_PICK.id === it.id) MOL_PICK = null;
  molRepaint(el, it); queueSave(page.id);
  if(loud) SND.pop();
  if(peek > 0 && it.auto) molAutoSpin(el, it, page);
}
function molHome(el, it, page){ molStopSpin(it); it.yaw = 0; it.pitch = 0; it.zoom = 1; molRepaint(el, it); queueSave(page.id); }
function molMove(el, it, on){
  if(on) PLOT_MOVE.add(it.id); else PLOT_MOVE.delete(it.id);
  el.classList.toggle('mmove', !!on);
  select(it.id); SND.pop();
}
/* The ordinary corner dot scales a molecule rather than pinning an empty box
   around it. Font size is the molecule's one scale, so 2D, the 3D companion,
   labels and both rails track the pointer together without changing geometry. */
function molResizeTo(el, it, fs){
  it.fs = clamp(fs, 9, 140);
  el.style.setProperty('--fs', it.fs);
  wakeRopes();
}
function molResizeWire(el, it, page){
  const h = el.querySelector('.rs'); if(!h) return;
  h.addEventListener('pointerdown', e => {
    if(e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, fs0 = it.fs || MOL_FS, r0 = el.getBoundingClientRect();
    const w0 = Math.max(1, r0.width), h0 = Math.max(1, r0.height);
    h.setPointerCapture(e.pointerId);
    const move = ev => {
      const dx = (ev.clientX - x0) / w0, dy = (ev.clientY - y0) / h0;
      const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      molResizeTo(el, it, fs0 * Math.max(.1, 1 + d));
    };
    const up = ev => {
      if(h.hasPointerCapture(ev.pointerId)) h.releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      queueSave(page.id); SND.plop();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
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
  const svg = el.querySelector('.mol2svg'), over = svg && hot.closest('.mol2svg');
  const p = over ? molPt(svg, { clientX: lastMouse.x, clientY: lastMouse.y }) : null;
  if(p) el._molHov = p;                       /* the keys move the pen: recast the ghost */
  const hit = p ? molHit(it, p) : null, k = e.key;
  if(k === 'Escape'){
    const sel = MOL_SEL.get(it.id);
    if((sel && sel.size) || (MOL_PICK && MOL_PICK.id === it.id && MOL_PICK.atoms.length) || MOL_MENU || it.hi || el._molHi){
      if(sel) sel.clear(); if(MOL_PICK && MOL_PICK.id === it.id) MOL_PICK = null;
      delete it.hi; el._molHi = false; molMenuClose(); molRepaint(el, it); queueSave(page.id); return true;
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
      /* the atom is remembered whether or not it took the element — so that a
         c refused on a six-bonded sulfur is still the c that cl is built from */
      molTry(it, el, page, false, sim => { const a = sim.atoms[target]; a.e = pick.sym; a.h = null; a.iso = null; });
      MOL_KEYAT = { id: it.id, i: target };
    } else MOL_KEYAT = null;
    return true;
  }
  if(k === '1' || k === '2' || k === '3'){
    if(hit && hit.bond != null) molTry(it, el, page, false, sim => { sim.bonds[hit.bond].o = +k; sim.bonds[hit.bond].s = 0; });
    else { MOL_BOND = +k - 1; MOL_TOOL = 'draw'; molRailSyncAll(); }
    return true;
  }
  if((k === '+' || k === '=' || k === '-') && hit && hit.atom != null){
    molTry(it, el, page, false, sim => { const a = sim.atoms[hit.atom]; a.q = clamp((a.q || 0) + (k === '-' ? -1 : 1), -4, 4); });
    return true;
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

/* ---- the menu the lasso hands you ----
   Turn and move arm the next drag rather than doing anything themselves: there
   is nowhere on a drawing to put a handle that is not also somewhere you might
   want to draw, and a mode you can see lit is easier to trust than a handle you
   have to find. Copy is the odd one out because it needs no gesture. */
let MOL_ARM = null, MOL_MENU = null;
function molMenuEl(){
  let d = $('#molmenu');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'molmenu glass-lite'; d.id = 'molmenu';
  d.innerHTML = '<button data-a="rot" title="Then drag anywhere to turn what you picked about its middle, in 15° steps">⟳<span>turn</span></button>' +
    '<button data-a="chir" title="Invert the selected stereocentres without reflecting the drawing — the result is independent of how the molecule is turned on the page">⇄<span>chirality</span></button>' +
    '<button data-a="move" title="Then drag anywhere to carry what you picked about — or just drag one of its atoms">✥<span>move</span></button>' +
    '<button data-a="copy" title="Another of what you picked, laid down beside it and picked in its place">⧉<span>copy</span></button>';
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => e.stopPropagation());
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b || !MOL_MENU) return;
    e.stopPropagation();
    const a = b.dataset.a, m = MOL_MENU;
    if(a === 'copy') return molCopySel(m.it, m.el, m.page);
    if(a === 'chir') return molInvertChirality(m.it, m.el, m.page);
    MOL_ARM = MOL_ARM === a ? null : a;
    molMenuSync();
  });
  return d;
}
function molMenuSync(){
  const d = $('#molmenu'); if(!d) return;
  d.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.a === MOL_ARM));
}
function molMenuOpen(it, el, page){
  const sel = MOL_SEL.get(it.id), svg = el.querySelector('.molsvg'), m = svg && svg.getScreenCTM();
  if(!sel || !sel.size || !m) return molMenuClose();
  const d = molMenuEl();
  MOL_MENU = { it, el, page };
  d.classList.add('open');
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  sel.forEach(i => { const a = it.atoms[i]; if(!a) return; x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); });
  if(x0 === Infinity) return molMenuClose();
  const p = new DOMPoint((x0 + x1) / 2 * MOL_U, y0 * MOL_U).matrixTransform(m);
  const w = d.offsetWidth, h = d.offsetHeight;
  d.style.left = clamp(p.x - w / 2, 8, innerWidth - w - 8) + 'px';
  d.style.top = clamp(p.y - h - 16, 8, innerHeight - h - 8) + 'px';
  molMenuSync();
  warpIn(d, p.x, p.y);
}
function molMenuClose(){
  MOL_ARM = null;
  const d = $('#molmenu');
  if(!d || !d.classList.contains('open')){ MOL_MENU = null; return; }
  MOL_MENU = null;
  warpOut(d, () => { if(!MOL_MENU) d.classList.remove('open'); });
}
/* another of what is picked, beside it — the copy is what you have hold of after */
function molCopySel(it, el, page){
  const sel = MOL_SEL.get(it.id);
  if(!sel || !sel.size) return;
  const idx = [...sel].sort((a, b) => a - b), map = new Map();
  idx.forEach(i => {
    const a = it.atoms[i], j = molAddAtom(it, a.e, a.x + .9, a.y + .9), n = it.atoms[j];
    n.q = a.q || 0; n.h = a.h; n.iso = a.iso; n.f = a.f || 0; if(a.chi) n.chi = a.chi;
    map.set(i, j);
  });
  it.bonds.slice().forEach(b => { if(map.has(b.a) && map.has(b.b)) molAddBond(it, map.get(b.a), map.get(b.b), b.o, b.s); });
  molHbs(it).slice().forEach(h => { if(map.has(h.a) && map.has(h.b)) it.hb.push({ a: map.get(h.a), b: map.get(h.b) }); });
  MOL_SEL.set(it.id, new Set(map.values()));
  molEdit(it, el, page); SND.pop();
  molMenuOpen(it, el, page);
}
/* ---- chirality, not page geometry ----
   Wedge and hash encode which end of a bond leaves the paper. Inverting one
   such relation at each selected centre reverses its parity without touching a
   coordinate, so the result cannot depend on how the drawing happens to face.
   Tidy is then free to lay the same graph out again: it preserves `b.s`, and
   therefore preserves this operation. */
function molInvertChirality(it, el, page){
  const sel = MOL_SEL.get(it.id);
  if(!sel || !sel.size) return;
  /* Several marked bonds can describe one centre. Reverse every out-of-paper
     direction there; this reflects only its depth convention, never the page. */
  const turned = new Set(it.bonds.filter(b => b.s && sel.has(b.a)).map(b => b.a));
  const emb = turned.size ? molEmb(it) : null;
  turned.forEach(i => {
    const hand = molEmbHand(emb, i);
    it.atoms[i].chi = hand ? -hand : -(it.atoms[i].chi || 1);
  });
  it.bonds.forEach(b => { if(b.s && turned.has(b.a)) b.s = b.s === 1 ? 2 : 1; });
  molEdit(it, el, page); SND.pop();
  molMenuOpen(it, el, page);
  molSay(el, turned.size
    ? 'chirality · ' + turned.size + (turned.size === 1 ? ' stereocentre' : ' stereocentres') + ' inverted — orientation independent'
    : 'chirality · no selected stereochemistry to invert');
}
window.addEventListener('pointerdown', e => {
  if(MOL_MENU && !e.target.closest('#molmenu') && !e.target.closest('.item[data-type="molecule"]')) molMenuClose();
});

/* ---- the rail: the tools of the hand, at the drawing's left edge ---- */
const MOL_BOND_GLYPH = [
  '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M5 9.5h14M5 14.5h14"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M5 7.5h14M5 12h14M5 16.5h14"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M5 12l14-4.5v9z" fill="currentColor" stroke="none"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M6 12v1M9 11v2.5M12 10v4M15 9v6M18 8v8"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4.5 12h15" stroke-dasharray=".2 3.6" stroke-linecap="round" stroke-width="2.6"/></svg>'];
const MOL_GLYPH = {
  chain: '<svg viewBox="0 0 24 24"><path d="M3 15.5l4.5-7 4.5 7 4.5-7 4.5 7"/></svg>',
  fold: '<svg viewBox="0 0 24 24"><path d="M6 12h12M9 6.5v11M9 6.5h2.4M9 17.5h2.4M17 6.5v11M17 6.5h-2.4M17 17.5h-2.4"/></svg>',
  lasso: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="8" ry="5"/><path d="M8 14.6c-.8 1.7-.7 3.4.5 4.9"/></svg>',
  highlight: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/></svg>' };
function molRailHTML(){
  return '<div class="molrail glass-lite">' +
    '<button data-act="el" class="mrel" title="The element the pen draws — click for the periodic table, or type its symbol"><b></b></button>' +
    '<button data-act="bond" title="Bond — again for double, triple, wedge and hash; 1 2 3 on the keys"></button>' +
    '<button data-act="chain" title="Chain — drag a zigzag of carbons out of an atom or off the paper; the number counts them as you go">' + MOL_GLYPH.chain + '</button>' +
    '<button data-act="ring" title="Ring — click the page, a bond to fuse it on, or an atom to hang it from; drag for a row of fused rings. Again for the next size"><span class="mrng">⬡</span><i></i></button>' +
    '<button data-act="fold" title="Shorten — click a long run of CH₂ and it folds into the repeat bracket ⟮CH₂⟯ₙ; click the bracket to open it out again">' + MOL_GLYPH.fold + '</button>' +
    '<button data-act="charge" title="Charge — click an atom; again to flip plus and minus"></button>' +
    '<button data-act="erase" title="Eraser — click an atom or a bond">' + icn('eraser') + '</button>' +
    '<button data-act="lasso" title="Lasso — click a molecule to take all of it, or draw a loop round part of one; then turn, invert chirality, move or copy it">' + MOL_GLYPH.lasso + '</button></div>';
}
function molViewRailHTML(it){
  const peek = molPeek(it);
  return '<div class="molviewrail" aria-label="3D companion and highlighting">' +
    '<span class="mvtag" aria-hidden="true">3D</span><button class="mvtoggle" type="button" aria-expanded="' + (peek > 0 ? 'true' : 'false') +
    '" aria-label="' + (peek > 0 ? 'Close' : 'Open') + ' the live 3D companion" title="' + (peek > 0 ? 'Close' : 'Open') +
    ' the live 3D companion">' + (peek > 0 ? '&lt;' : '&gt;') + '</button>' +
    '<button class="mvhi" type="button" aria-pressed="false" aria-label="Add or remove molecule highlights" title="Highlight several atoms or bonds — every aura stays visible in front of the 3D model">' +
    MOL_GLYPH.highlight + '</button></div>';
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
const molRailSyncAll = () => { document.querySelectorAll('#pageHost .item[data-type="molecule"]').forEach(molRailSync); molHoverAll(); };
function molRailWire(el, it, page){
  const rail = el.querySelector('.molrail'); if(!rail) return;
  rail.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  rail.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    e.stopPropagation();
    el._molHi = false; molViewRailSync(el, it);
    const a = b.dataset.act;
    if(a === 'el') openElementPicker(b, sym => { MOL_EL = sym; MOL_TOOL = 'draw'; molRailSyncAll(); }, MOL_EL);
    else if(a === 'bond'){ if(MOL_TOOL === 'draw') MOL_BOND = (MOL_BOND + 1) % MOL_BONDS.length; MOL_TOOL = 'draw'; b.title = 'Bond — now: ' + MOL_BONDS[MOL_BOND].t; }
    else if(a === 'ring'){ if(MOL_TOOL === 'ring') MOL_RING = (MOL_RING + 1) % MOL_RINGS.length; MOL_TOOL = 'ring'; b.title = 'Ring — now: ' + MOL_RINGS[MOL_RING].l; }
    else if(a === 'charge'){ if(MOL_TOOL === 'charge') MOL_Q = -MOL_Q; MOL_TOOL = 'charge'; }
    else MOL_TOOL = a;
    if(MOL_TOOL !== 'lasso') molMenuClose();
    molRailSyncAll();
  });
}
function molViewRailSync(el, it){
  const rail = el && el.querySelector('.molviewrail'); if(!rail) return;
  const toggle = rail.querySelector('.mvtoggle'), hi = rail.querySelector('.mvhi');
  const peek = molPeek(it);
  const open = peek > 0;
  toggle.textContent = open ? '<' : '>';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', (open ? 'Close' : 'Open') + ' the live 3D companion');
  toggle.title = (open ? 'Close' : 'Open') + ' the live 3D companion';
  hi.classList.toggle('on', !!el._molHi); hi.setAttribute('aria-pressed', el._molHi ? 'true' : 'false');
  const fig = el.querySelector('.mol'); if(fig) fig.classList.toggle('hiliting', !!el._molHi);
}
function molViewRailWire(el, it, page){
  const rail = el.querySelector('.molviewrail'); if(!rail) return;
  rail.addEventListener('pointerdown', e => e.stopPropagation());
  rail.querySelector('.mvtoggle').addEventListener('click', e => {
    e.stopPropagation();
    molSetPeek(el, it, page, molPeek(it) > 0 ? 0 : 100, true);
  });
  rail.querySelector('.mvhi').addEventListener('click', e => {
    e.stopPropagation(); el._molHi = !el._molHi;
    if(el._molHi){
      MOL_SEL.delete(it.id); molMenuClose();
      el._molHov = null; el._molG = ''; el._molW = '';
    }
    molRepaint(el, it, null); SND.tick();
  });
  molViewRailSync(el, it);
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
    sug.innerHTML = hits.map(h => '<button data-n="' + esc(h.name) + '">' + esc(h.name) + '</button>').join('');
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
  it.hb = [];                                  /* new atoms: the old links meant other ones */
  delete it.hi;
  MOL_SEL.delete(it.id);
  molAskClose();
  molEdit(it, el, page); SND.pop();
}
window.addEventListener('pointerdown', e => {
  if(MOL_ASK && !e.target.closest('#molask') && !(MOL_ASK.anchor === e.target || MOL_ASK.anchor.contains(e.target))) molAskClose();
});

/* ---- take the drawing out as a picture or ChemFig ----
   SVG and PNG are figures rather than screenshots of the note. They therefore
   get the restrained convention used on a paper: transparent ground, black
   connections, flat Jmol element colours and no light/shadow filters. The live
   companion keeps its depth shading; export deliberately does not inherit it. */
const MOL_EXPORT_PAINT = ['fill','fill-opacity','fill-rule','stroke','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin',
  'stroke-dasharray','stroke-dashoffset','opacity','paint-order','font-family','font-size','font-weight','font-style',
  'text-anchor','dominant-baseline','letter-spacing','visibility','display','vector-effect','color'];
function molPaperPaint(n, prop, value){
  n.style.setProperty(prop, value);
  if(prop === 'fill' || prop === 'stroke') n.setAttribute(prop, value);
}
function molExportPaper(svg, it, is3){
  const ink = '#000000', hi = '#d28b00', measure = '#00768a';
  svg.style.background = 'transparent'; svg.style.color = ink;
  svg.querySelectorAll('*').forEach(n => { n.style.removeProperty('filter'); n.removeAttribute('filter'); });
  svg.querySelectorAll('filter,.rim').forEach(n => n.remove());
  svg.querySelectorAll('.bd,.hs,.hb,.bk,.stick,.hb3').forEach(n => molPaperPaint(n, 'stroke', ink));
  svg.querySelectorAll('.wg,.dot,.lpd').forEach(n => molPaperPaint(n, 'fill', ink));
  svg.querySelectorAll('text.at,text.lh,text.fn').forEach(n => {
    molPaperPaint(n, 'fill', ink); molPaperPaint(n, 'stroke', 'none'); n.style.setProperty('paint-order', 'normal');
  });
  svg.querySelectorAll('.ag[data-i]').forEach(g => {
    const a = it.atoms[+g.dataset.i], e = a && CHEM_SYM[a.e];
    /* Carbon and written hydrogen stay black on a paper; the other labels keep
       the same Jmol colours as their spheres. White hydrogen is reserved for a
       sphere with a black edge, where it cannot disappear. */
    const c = !a || a.e === 'C' || a.e === 'H' || !e ? ink : e.color;
    g.querySelectorAll('text.at').forEach(n => molPaperPaint(n, 'fill', c));
  });
  svg.querySelectorAll('.mhi2,.mhi3').forEach(n => n.style.setProperty('filter', 'none'));
  svg.querySelectorAll('.mha,.mha3').forEach(n => {
    molPaperPaint(n, 'fill', 'rgba(210,139,0,.14)'); molPaperPaint(n, 'stroke', hi);
  });
  svg.querySelectorAll('.mhl,.mhl3').forEach(n => molPaperPaint(n, 'stroke', hi));
  svg.querySelectorAll('.mhr3').forEach(n => molPaperPaint(n, 'stroke', hi));
  svg.querySelectorAll('.pk,.pkl').forEach(n => molPaperPaint(n, 'stroke', measure));
  svg.querySelectorAll('.pkt').forEach(n => {
    molPaperPaint(n, 'fill', measure); molPaperPaint(n, 'stroke', 'none'); n.style.setProperty('paint-order', 'normal');
  });
  if(is3){
    svg.querySelectorAll('circle.ball').forEach(n => {
      const e = CHEM_SYM[n.dataset.e] || CHEM_SYM.C;
      molPaperPaint(n, 'fill', e.color); molPaperPaint(n, 'stroke', ink);
      n.style.setProperty('stroke-width', '1.8');
    });
    svg.querySelectorAll('radialGradient').forEach(n => n.remove());
  }
}

/* One general graph is written as a ChemFig spanning forest. Tree edges keep
   the exact drawn angle and length; every extra ring edge becomes a named hook,
   the mechanism ChemFig provides for bonds between distant atoms. Hydrogen
   bonds join the same forest as black dotted TikZ bonds. */
const molTexNum = n => {
  const v = Math.round(n * 100) / 100;
  return (Object.is(v, -0) ? 0 : v).toString();
};
function molChemfigAtom(it, i, nb){
  const a = it.atoms[i], sty = it.sty || 'skel', lb = molLabel(it, i, nb, sty);
  if(!lb.show && sty !== 'lewis') return '';
  let s = a.e;
  const h = sty === 'lewis' ? chemH(it, i, nb) : lb.h;
  if(h){
    const hs = 'H' + (h > 1 ? '_{' + h + '}' : '');
    s = lb.left ? hs + s : s + hs;
  }
  if(a.iso) s = '{}^{' + a.iso + '}' + s;
  if(a.q){ const q = Math.abs(a.q), sign = a.q > 0 ? '+' : '-'; s += '^{' + (q > 1 ? q : '') + sign + '}'; }
  if(lb.rad) s += '^{\\bullet}';
  return s;
}
function molChemfigBond(it, edge, from, to, nb){
  const A = it.atoms[from], B = it.atoms[to];
  let deg = Math.atan2(-(B.y - A.y), B.x - A.x) * 180 / Math.PI;
  if(deg <= -180) deg += 360; else if(deg > 180) deg -= 360;
  const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  if(edge.hb) return '-[:' + molTexNum(deg) + ',' + molTexNum(len) + ',,,densely dotted]';
  const b = edge.bond;
  let mark = b.o === 2 ? '=' : b.o === 3 ? '~' : '-';
  /* ChemFig's official shifted double-bond forms keep the main skeletal line
     continuous and put the parallel stroke inside a substituted/ring shape. */
  if(b.o === 2 && nb[b.a].length > 1 && nb[b.b].length > 1){
    let side = molDblSide(it, b, nb);
    if(from !== b.a) side *= -1;
    mark = side > 0 ? '=_' : '=^';
  }
  if(b.s === 1) mark = from === b.a ? '>' : '<';
  else if(b.s === 2) mark = from === b.a ? '>:' : '<:';
  return mark + '[:' + molTexNum(deg) + ',' + molTexNum(len) + ']';
}
function molChemfigHook(edge, from){
  if(edge.hb) return '1,{densely dotted}';
  const b = edge.bond;
  if(b.s === 1) return from === b.a ? '{>}' : '{<}';
  if(b.s === 2) return from === b.a ? '{>:}' : '{<:}';
  return String(clamp(b.o || 1, 1, 3));
}
function molChemfigBodies(it){
  if(!it.atoms.length) return [''];
  const edges = it.bonds.map((bond, i) => ({ id:'b' + i, a:bond.a, b:bond.b, bond }))
    .concat(molHbs(it).map((h, i) => ({ id:'h' + i, a:h.a, b:h.b, hb:true })));
  const adj = it.atoms.map(() => []);
  edges.forEach(e => { if(adj[e.a] && adj[e.b]){ adj[e.a].push(e); adj[e.b].push(e); } });
  /* Prefer double bonds in the spanning tree: a remaining ring-closing hook
     can then usually be the simpler single bond, while =^ / =_ stays visible. */
  adj.forEach(es => es.sort((a, b) => ((b.bond && b.bond.o === 2) ? 1 : 0) - ((a.bond && a.bond.o === 2) ? 1 : 0)));
  const seen = new Set(), tree = new Set(), roots = [], kids = it.atoms.map(() => []);
  const walk = i => {
    seen.add(i);
    for(const e of adj[i]){
      const j = e.a === i ? e.b : e.a;
      if(seen.has(j)) continue;
      tree.add(e.id); kids[i].push({ edge:e, to:j }); walk(j);
    }
  };
  it.atoms.forEach((a, i) => { if(!seen.has(i)){ roots.push(i); walk(i); } });
  const hooks = new Map(), hookAt = it.atoms.map(() => []);
  edges.filter(e => !tree.has(e.id)).forEach((e, i) => {
    const name = 'h' + i; hooks.set(e.id, name); hookAt[e.a].push(e); hookAt[e.b].push(e);
  });
  const nb = chemNbrs(it), hookSeen = new Set();
  const emit = i => {
    let out = molChemfigAtom(it, i, nb);
    hookAt[i].forEach(e => {
      const name = hooks.get(e.id);
      if(hookSeen.has(e.id)) out += '?[' + name + ',' + molChemfigHook(e, i) + ']';
      else { hookSeen.add(e.id); out += '?[' + name + ']'; }
    });
    const ch = kids[i];
    ch.forEach((x, k) => {
      const branch = molChemfigBond(it, x.edge, i, x.to, nb) + emit(x.to);
      out += k === ch.length - 1 ? branch : '(' + branch + ')';
    });
    return out;
  };
  return roots.map(emit);
}
function molChemfigLatex(it){
  const figures = molChemfigBodies(it).map(s => '\\chemfig{' + s + '}');
  return figures.join(' \\qquad ');
}
function molExportArt(it, view){
  const is3 = view === '3d', d = is3 ? molDraw3D(it, false) : molDraw2D(it, false);
  const vb = d.vb.trim().split(/\s+/).map(Number), ratio = (vb[2] || 1) / (vb[3] || 1);
  const natural = (parseFloat(d.width) || 20) * (it.fs || MOL_FS);
  const width = Math.round(clamp(natural * (is3 ? 3 : 2), is3 ? 720 : 480, 1800));
  const height = Math.max(1, Math.round(width / ratio));
  const host = document.createElement('figure');
  host.className = 'mol' + (it.mono ? ' mono' : '');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;margin:0;pointer-events:none';
  host.style.setProperty('--fs', it.fs || MOL_FS);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('class', d.cls);
  svg.setAttribute('viewBox', d.vb);
  svg.setAttribute('width', width); svg.setAttribute('height', height);
  svg.innerHTML = d.inner;
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = (chemName(it) || chemFormula(it).plain || 'Molecule') + ' — ' + view.toUpperCase();
  svg.insertBefore(title, svg.firstChild);
  host.appendChild(svg); document.body.appendChild(host);
  if(!is3){
    svg.querySelectorAll('.mghost,.msel').forEach(n => n.remove());
  }
  [svg].concat(Array.from(svg.querySelectorAll('*'))).forEach(n => {
    const cs = getComputedStyle(n);
    MOL_EXPORT_PAINT.forEach(p => { const v = cs.getPropertyValue(p); if(v) n.style.setProperty(p, v); });
  });
  molExportPaper(svg, it, is3);
  host.remove();
  return { svg, width, height, text:'<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg) };
}
function molExportName(it, view, ext){
  const raw = chemName(it) || chemFormula(it).plain || 'molecule';
  const safe = raw.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim() || 'molecule';
  return safe + ' — ' + view.toUpperCase() + '.' + ext;
}
async function molExportFile(it, el, view, format){
  try{
    const art = molExportArt(it, view);
    if(format === 'svg'){
      await plSaveFile(molExportName(it, view, 'svg'), new Blob([art.text], { type:'image/svg+xml;charset=utf-8' }));
    } else {
      const url = URL.createObjectURL(new Blob([art.text], { type:'image/svg+xml;charset=utf-8' }));
      try{
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The SVG could not be rasterised')); img.src = url; });
        const canvas = document.createElement('canvas'), scale = 2;
        canvas.width = art.width * scale; canvas.height = art.height * scale;
        const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('The PNG could not be encoded')), 'image/png'));
        await plSaveFile(molExportName(it, view, 'png'), blob);
      } finally { URL.revokeObjectURL(url); }
    }
    molSay(el, view.toUpperCase() + ' ' + format.toUpperCase() + ' exported'); SND.tick();
  }catch(err){
    molSay(el, 'export failed · ' + ((err && err.message) || err), 1);
  }
}
async function molCopyChemfig(it, el){
  try{
    if(!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(molChemfigLatex(it));
    molSay(el, 'ChemFig LaTeX copied'); SND.tick();
  }catch(err){
    molSay(el, 'copy failed · ' + ((err && err.message) || err), 1);
  }
}
let MOL_EXPORT = null;
function molExportEl(){
  let d = $('#molexport'); if(d) return d;
  d = document.createElement('div'); d.id = 'molexport'; d.className = 'molexport glass';
  d.setAttribute('role', 'menu'); d.setAttribute('aria-label', 'Export molecule view');
  d.innerHTML = '<button role="menuitem" data-v="2d" data-f="svg"><b>2D</b><span>SVG</span></button>' +
    '<button role="menuitem" data-v="2d" data-f="png"><b>2D</b><span>PNG</span></button>' +
    '<button role="menuitem" data-v="3d" data-f="svg"><b>3D</b><span>SVG</span></button>' +
    '<button role="menuitem" data-v="3d" data-f="png"><b>3D</b><span>PNG</span></button>' +
    '<button class="moltex" role="menuitem" data-v="2d" data-f="latex"><b>Copy LaTeX</b><span>CHEMFIG</span></button>';
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => e.stopPropagation());
  d.addEventListener('keydown', e => { e.stopPropagation(); if(e.key === 'Escape'){ e.preventDefault(); molExportClose(); } });
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b || !MOL_EXPORT) return;
    const x = MOL_EXPORT, view = b.dataset.v, format = b.dataset.f;
    molExportClose();
    if(format === 'latex') molCopyChemfig(x.it, x.el);
    else molExportFile(x.it, x.el, view, format);
  });
  return d;
}
function molExportMenu(anchor, it, el){
  const d = molExportEl();
  if(d.classList.contains('open') && MOL_EXPORT && MOL_EXPORT.anchor === anchor) return molExportClose();
  molAskClose(); MOL_EXPORT = { anchor, it, el }; d.classList.add('open');
  const r = anchor.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
  d.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
  d.style.top = clamp(r.top - h - 10, 8, innerHeight - h - 8) + 'px';
  warpIn(d, r.left + r.width / 2, r.top + r.height / 2);
  const first = d.querySelector('button'); if(first) first.focus({ preventScroll:true });
}
function molExportClose(){
  const d = $('#molexport');
  if(!d || !d.classList.contains('open') || !MOL_EXPORT) return;
  MOL_EXPORT = null;
  if(d.contains(document.activeElement)) document.activeElement.blur();
  warpOut(d, () => { if(!MOL_EXPORT) d.classList.remove('open'); });
}
window.addEventListener('pointerdown', e => {
  if(MOL_EXPORT && !e.target.closest('#molexport') && !(MOL_EXPORT.anchor === e.target || MOL_EXPORT.anchor.contains(e.target))) molExportClose();
});

/* ---- ✎: how it is shown ---- */
function molProps(b, it, el, page){
  const rows = [
    { t:'btn', label:'', text:() => 'Atom colours: ' + (it.mono ? 'off' : 'on'), hint:'Heteroatoms in their CPK colours, or everything in ink',
      act(){ it.mono = !it.mono; } }];
  if(molPeek(it) > 0) rows.push(
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
  add: { molecule: base => ({ ...base, type:'molecule', atoms:[], bonds:[], hb:[], view:'2d', peek:0, sty:'skel', s3:'ball',
    info:1, fs:MOL_FS, box:molBox({ atoms:[] }), cap:'' }) },
  sound: 'pop',
  sizeable: true, autoWidth: true,
  playArea: '.mol2svg,.mol3svg',
  html: (it, c) => {
    const d = molDraw2D(it, c.live), peek = molPeek(it), box = it.box || molBox(it);
    const d3 = peek > 0 ? molDraw3D(it, c.live) : { vb:'0 0 ' + molU(box.w) + ' ' + molU(box.h), width:d.width, cls:'molsvg mol3svg m3d', inner:'' };
    const sideW = ((parseFloat(d.width) || MOL_MINW * MOL_BL) * peek / 100).toFixed(2);
    return '<figure class="body mol' + (it.mono ? ' mono' : '') + (peek > 0 ? ' has3d' : '') + '">' +
      (c.live ? molRailHTML() + molViewRailHTML(it) : '') +
      '<svg class="' + d.cls + '" viewBox="' + d.vb + '" style="width:' + d.width + 'em">' + d.inner + '</svg>' +
      '<div class="mol3win" style="width:' + sideW + 'em" aria-label="Live 3D companion" aria-hidden="' + (peek > 0 ? 'false' : 'true') + '"' + (peek > 0 ? '' : ' hidden') + '>' +
      '<svg class="' + d3.cls + '" viewBox="' + d3.vb + '" style="width:' + d3.width + 'em">' + d3.inner + '</svg><span class="mol3badge" aria-hidden="true">3D</span></div>' +
      '<div class="molinfo"' + (it.info === 0 ? ' hidden' : '') + '>' + molInfoHTML(it, c.live) + '</div>' +
      '<figcaption></figcaption></figure>';
  },
  after(it, el, page){ select(it.id); },
  tools(mk, it, el, page){
    mk('3D', 'Show or hide the live 3D companion beside the editable drawing', () => {
      molSetPeek(el, it, page, molPeek(it) > 0 ? 0 : 100, true); });
    mk('◐', 'Skeletal, condensed or Lewis — ball-and-stick, sticks or space-filling in 3D', b => {
      if(molPeek(it) > 0){ it.s3 = MOL_S3[(MOL_S3.indexOf(it.s3 || 'ball') + 1) % MOL_S3.length]; b.title = 'Ball-and-stick, sticks or space-filling — now: ' + MOL_S3_NAMES[it.s3]; }
      else { it.sty = MOL_STY[(MOL_STY.indexOf(it.sty || 'skel') + 1) % MOL_STY.length]; b.title = 'Skeletal, condensed or Lewis — now: ' + MOL_STY_NAMES[it.sty]; }
      molRepaint(el, it); queueSave(page.id); });
    mk('ƒ', 'Formula, mass and name under the drawing', () => {
      it.info = it.info === 0 ? 1 : 0; el.querySelector('.molinfo').hidden = it.info === 0; queueSave(page.id); });
    mk('⟲', 'Tidy the 2D drawing while preserving its stereochemistry and hydrogen-bond layout', () => {
      if(!it.atoms.length) return;
      molUnfoldAll(it); molTidyLayout(it); MOL_SEL.delete(it.id); molMenuClose(); molEdit(it, el, page); SND.pop(); });
    mk('⌕', 'Type a name or a SMILES and have it drawn', b => molAsk(b, it, el, page));
    mk('⇩', 'Export transparent SVG or PNG artwork, or copy the 2D structure as ChemFig LaTeX', b => molExportMenu(b, it, el));
    mk('✎', 'Colours, labels, lone pairs, turning', b => molProps(b, it, el, page));
    mk('✥', 'Move it about the page — or drag it by the line under the drawing', () => molMove(el, it, !PLOT_MOVE.has(it.id)));
  },
  wire(el, it, page){
    const fig = el.querySelector('.mol');
    if(PLOT_MOVE.has(it.id)) el.classList.add('mmove');
    el._molHi = false;
    molRailWire(el, it, page); molRailSync(el); molViewRailWire(el, it, page); molResizeWire(el, it, page);
    el._molHov = null; el._molG = ''; el._molW = ''; el._molDrag = false;
    fig.addEventListener('pointerdown', e => molDown(e, el, it, page));
    /* the ghost: cast wherever the pointer rests, dropped the moment it leaves */
    fig.addEventListener('pointermove', e => {
      if(e.pointerType === 'touch' || el._molDrag) return;
      if(!el.classList.contains('sel') || PLOT_MOVE.has(it.id)) return;
      if(el._molHi) return molHoverOff(el, it);
      const svg = el.querySelector('.mol2svg');
      if(!svg || !e.target.closest('.mol2svg')) return molHoverOff(el, it);
      el._molHov = molPt(svg, e);
      molHoverSync(el, it);
    });
    fig.addEventListener('pointerleave', () => molHoverOff(el, it));
    fig.addEventListener('wheel', e => {
      if(e.ctrlKey || e.metaKey || PLOT_MOVE.has(it.id) || !e.target.closest('.mol3svg')) return;
      e.preventDefault(); e.stopPropagation();
      it.zoom = clamp((it.zoom || 1) * (e.deltaY > 0 ? 1 / 1.1 : 1.1), .4, 3);
      molRepaint(el, it); queueSave(page.id);
    }, { passive:false });
    el.addEventListener('dblclick', e => {
      if(!e.target.closest('.mol3svg')) return;
      e.stopPropagation(); e.preventDefault(); molHome(el, it, page);
    });
    if(molPeek(it) > 0 && it.auto) molAutoSpin(el, it, page);
  },
  forget(it){
    MOL_CACHE.delete(it.id); molStopSpin(it); MOL_SPIN.delete(it.id); MOL_SEL.delete(it.id); PLOT_MOVE.delete(it.id);
    if(MOL_PICK && MOL_PICK.id === it.id) MOL_PICK = null;
    if(MOL_MENU && MOL_MENU.it === it) molMenuClose();
    if(MOL_EXPORT && MOL_EXPORT.it === it) molExportClose();
  },
  css: `
/* ---------- molecules ----------
   Drawn straight on the paper like the guides: no card, no box, the selection
   ring is the drawing area. A bond is MOL_BL em, so A−/A+ resize the whole
   drawing through --fs, and the window onto it is a viewBox in bond units. */
.mol{position:relative;display:block;background:none;padding:0;box-shadow:none;font-size:calc(var(--fs,15)*var(--scale)*1px);color:var(--ink)}
.item.sel .mol{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent2) 55%,transparent)}
svg.molsvg{display:block;height:auto;overflow:visible;touch-action:none;font-family:ui-sans-serif,system-ui,"Helvetica Neue",Arial,sans-serif}
.mol3win{position:absolute;left:calc(100% + var(--scale)*22px);top:0;overflow:hidden;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--ink) 15%,transparent);border-radius:calc(var(--scale)*9px);background:color-mix(in srgb,var(--paper) 91%,transparent);box-shadow:0 calc(var(--scale)*5px) calc(var(--scale)*16px) rgba(0,0,0,.16);z-index:18;contain:paint}
.mol3win[hidden]{display:none}
.mol3win .mol3svg{max-width:none;background:radial-gradient(circle at 38% 32%,color-mix(in srgb,var(--paper) 88%,white),color-mix(in srgb,var(--paper) 97%,var(--ink)))}
.mol3badge{position:absolute;right:calc(var(--scale)*6px);top:calc(var(--scale)*5px);pointer-events:none;font-family:var(--mono);font-size:calc(var(--scale)*7px);letter-spacing:.08em;color:var(--soft);opacity:.58}
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
.molsvg .mhi2{pointer-events:none;filter:drop-shadow(0 0 7px color-mix(in srgb,var(--accent) 70%,transparent))}
.molsvg .mhi2 .mha{fill:color-mix(in srgb,var(--accent) 13%,transparent);stroke:var(--accent);stroke-width:4}
.molsvg .mhi2 .mhl{stroke:var(--accent);stroke-width:18;stroke-linecap:round;opacity:.34}
.molsvg .mhi2 .mhl.dotted{stroke-dasharray:.1 20}
/* the ghost is drawn by the molecule's own routines, so it is the real thing —
   only in the accent and dashed, which is how the eye reads “not yet”. Red, and
   the click will not be let go: the strip under the drawing says which atom. */
.molsvg .mghost .gp line.bd,.molsvg .mghost .gp line.hs{stroke:var(--accent2)}
.molsvg .mghost .gp line.bd{stroke-dasharray:14 9}
.molsvg .mghost .gp polygon.wg{fill:var(--accent2)}
.molsvg .mghost .gp circle.dot{fill:var(--accent2)}
.molsvg .mghost .gp text.at,.mol.mono .molsvg .mghost .gp text.at{fill:var(--accent2)}
.molsvg .mghost .gp.bad line.bd,.molsvg .mghost .gp.bad line.hs{stroke:#e03c28}
.molsvg .mghost .gp.bad polygon.wg{fill:#e03c28}
.molsvg .mghost .gp.bad circle.dot{fill:#e03c28}
.molsvg .mghost .gp.bad text.at,.mol.mono .molsvg .mghost .gp.bad text.at{fill:#e03c28}
/* the eraser swipes rather than redraws: a line the width of the bond would only
   be mistaken for the bond, and a swipe takes both strokes of a double one */
.molsvg .mghost line.gx{stroke:#e03c28;stroke-width:23;stroke-linecap:round;opacity:.4}
.molsvg .mghost circle.gxo{fill:rgba(230,60,40,.14);stroke:#e03c28;stroke-width:3.5;stroke-dasharray:10 8}
.molsvg .mghost .mq{fill:rgba(43,125,140,.09);stroke:var(--accent2);stroke-width:2.5;stroke-dasharray:8 6}
/* the repeat bracket: the run drawn once, in the same ink as the drawing,
   with the count as a subscript where a chemist would write it */
/* a hydrogen bond is dots, and lighter than any line that holds electrons —
   D–H···A, the way the book prints it */
.molsvg line.hb{stroke:var(--soft);stroke-width:5.5;stroke-dasharray:.1 12;stroke-linecap:round}
.molsvg.m3d line.hb3{stroke:var(--soft);stroke-dasharray:.1 9;stroke-linecap:round}
.molsvg .mghost .gp line.hb{stroke:var(--accent2)}
.molsvg .mghost .gp.bad line.hb{stroke:#e03c28}
.molsvg .fd line.bk{stroke:var(--ink);stroke-width:4.5;stroke-linecap:round}
.molsvg text.fn{font-size:${Math.round(MOL_FONT * .62)}px;font-weight:600;fill:var(--ink);text-anchor:middle;dominant-baseline:central;stroke:var(--paper);stroke-width:9;paint-order:stroke}
/* the running count over a chain or a row of rings, and the band that says
   which run a fold would take */
.molsvg .mghost line.gs{stroke:var(--accent2);stroke-width:23;stroke-linecap:round;opacity:.26}
.molsvg .mghost text.gc{font-size:${Math.round(MOL_FONT * .52)}px;font-weight:700;fill:var(--accent2);text-anchor:middle;dominant-baseline:central;stroke:var(--paper);stroke-width:10;paint-order:stroke}
.molsvg .mghost text.gc.big{font-size:${Math.round(MOL_FONT * .8)}px}
.molsvg.m3d circle.ball{stroke-width:1.8}
.molsvg.m3d line.stick{stroke-linecap:round}
.molsvg.m3d text.lb3{text-anchor:middle;dominant-baseline:central;font-weight:600;pointer-events:none}
.molsvg.m3d circle.lp3{fill:var(--accent2);opacity:.75}
.molsvg.m3d .mhi3{pointer-events:none;filter:drop-shadow(0 0 11px color-mix(in srgb,var(--accent) 86%,transparent))}
.molsvg.m3d .mha3{fill:color-mix(in srgb,var(--accent) 17%,transparent);stroke:var(--accent);stroke-width:4.5}
.molsvg.m3d .mhr3{fill:none;stroke:color-mix(in srgb,var(--accent) 58%,white);stroke-width:2;stroke-dasharray:5 7}
.molsvg.m3d .mhl3{stroke:var(--accent);stroke-linecap:round;opacity:.34}
.molsvg.m3d .mhl3.dotted{stroke-dasharray:.1 22}
.molsvg.m3d circle.pk{fill:none;stroke:var(--accent2);stroke-width:4}
.molsvg.m3d line.pkl{stroke:var(--accent2);stroke-width:3;stroke-dasharray:8 6}
.molsvg.m3d text.pkt{font-size:${Math.round(MOL_FONT * .8)}px;font-family:var(--mono);text-anchor:middle;fill:var(--accent2);stroke:var(--paper);stroke-width:9;paint-order:stroke}
.molinfo{font-family:var(--mono);font-size:.62em;letter-spacing:.06em;color:var(--soft);padding:.3em 0 0 .25em;min-height:1.1em;white-space:nowrap;cursor:move}
.molinfo .msay{white-space:normal}
.molinfo sub,.molinfo sup{font-size:.78em;line-height:0}
.molinfo .dim{opacity:.5}
.molinfo .pkm{color:var(--accent2)}
.molinfo .mhim{color:var(--accent);font-weight:500}
.molinfo .mno{color:#e03c28}
.molinfo .msay{color:var(--accent2)}
.mol.nono{animation:molno .34s cubic-bezier(.36,.07,.19,.97)}
@keyframes molno{20%{transform:translateX(-3.5px)}55%{transform:translateX(3px)}80%{transform:translateX(-1.5px)}}
.item.sel[data-type="molecule"] .molsvg{cursor:crosshair}
.item.sel[data-type="molecule"] .molsvg.nogo{cursor:not-allowed}
.item.sel[data-type="molecule"] .molsvg.m3d{cursor:grab}
.item.sel[data-type="molecule"] .molsvg.m3d:active{cursor:grabbing}
.item.sel[data-type="molecule"] .mol.hiliting .molsvg,
.item.sel[data-type="molecule"] .mol.hiliting .molsvg.m3d,
.item.sel[data-type="molecule"] .mol.hiliting .molsvg.m3d:active{cursor:default}
.item.mmove[data-type="molecule"] .molsvg{cursor:move}
/* the rail */
.molrail{position:absolute;right:100%;top:0;margin-right:calc(var(--scale)*8px);display:none;flex-direction:column;gap:3px;padding:4px;border-radius:11px;z-index:21}
.item.sel .molrail{display:flex}
.molrail button{position:relative;width:calc(var(--scale)*28px);height:calc(var(--scale)*28px);border-radius:7px;color:rgba(233,234,239,.8);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font-family:var(--mono);font-size:calc(var(--scale)*13px);display:grid;place-items:center;transition:background .12s,color .12s}
.molrail button:hover{background:rgba(255,255,255,.11);color:#fff}
.molrail button.on{background:var(--accent);color:#fff;box-shadow:none}
.molrail .mrel b{font-weight:700}
.molrail button svg{width:62%;height:62%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.molrail button i{position:absolute;right:2px;bottom:1px;font-style:normal;font-size:calc(var(--scale)*7.5px);opacity:.85;letter-spacing:0}
.molrail .mrng{font-size:calc(var(--scale)*15px);line-height:1}
/* A quiet disclosure edge: > opens the companion completely and immediately
   becomes <. There is no ambiguous half-open resting state, and 2D never jumps
   or disappears underneath it. */
.molviewrail{position:absolute;left:100%;top:50%;margin-left:calc(var(--scale)*2px);transform:translateY(-50%);display:none;align-items:center;flex-direction:column;gap:2px;padding:4px 2px;border-radius:8px;z-index:21;color:var(--soft);background:color-mix(in srgb,var(--paper) 82%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 8%,transparent);backdrop-filter:blur(8px);opacity:.34;transition:opacity .16s ease,background .16s ease}
.item.sel .molviewrail{display:flex}
.molviewrail:hover,.molviewrail:focus-within{opacity:.96;background:color-mix(in srgb,var(--paper) 94%,transparent)}
.molviewrail .mvtag{font-family:var(--mono);font-size:calc(var(--scale)*6.5px);line-height:1;letter-spacing:.05em;opacity:.72}
.molviewrail .mvtoggle{width:calc(var(--scale)*22px);height:calc(var(--scale)*32px);padding:0;border-radius:6px;display:grid;place-items:center;color:inherit;background:transparent;box-shadow:none;font-family:var(--mono);font-size:calc(var(--scale)*18px);font-weight:500;line-height:1;transition:transform .12s,background .12s,color .12s}
.molviewrail .mvtoggle:hover{background:color-mix(in srgb,var(--ink) 9%,transparent);color:var(--ink)}
.molviewrail .mvtoggle:active{transform:scale(.94)}
.molviewrail .mvtoggle:focus-visible{outline:1px solid var(--accent2);outline-offset:1px}
.molviewrail .mvhi{width:calc(var(--scale)*22px);height:calc(var(--scale)*22px);padding:3px;border-radius:6px;display:grid;place-items:center;color:inherit;background:transparent;box-shadow:none;transition:transform .12s,background .12s,color .12s}
.molviewrail .mvhi:active{transform:scale(.96)}
.molviewrail .mvhi:hover{background:color-mix(in srgb,var(--ink) 9%,transparent);color:var(--ink)}
.molviewrail .mvhi.on{background:var(--accent);color:#fff;box-shadow:none}
.molviewrail .mvhi svg{width:calc(var(--scale)*15px);height:calc(var(--scale)*15px);fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}
.mol.hiliting .molrail{opacity:.45}
/* the menu the lasso hands you */
.molmenu{position:fixed;z-index:83;display:none;gap:3px;padding:4px;border-radius:11px;will-change:transform,filter,opacity}
.molmenu.open{display:flex}
.molmenu button{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:42px;padding:5px 6px 4px;border-radius:8px;color:rgba(233,234,239,.82);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font-family:var(--mono);font-size:14px;line-height:1;transition:background .12s,color .12s}
.molmenu button span{font-size:8.5px;letter-spacing:.07em;opacity:.75}
.molmenu button:hover{background:rgba(255,255,255,.11);color:#fff}
.molmenu button.on{background:var(--accent);color:#fff;box-shadow:none}
.molmenu button.on span{opacity:.95}
/* four picture exports, plus one source-code export spanning the row */
.molexport{position:fixed;z-index:83;display:none;grid-template-columns:repeat(2,minmax(70px,1fr));gap:4px;width:164px;padding:6px;border-radius:12px;font-family:var(--mono);will-change:transform,filter,opacity}
.molexport.open{display:grid}
.molexport button{display:flex;align-items:baseline;justify-content:center;gap:6px;padding:7px 8px;border-radius:8px;color:rgba(233,234,239,.84);background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.065);font-family:var(--mono);transition:background .12s,color .12s,transform .12s}
.molexport button:hover,.molexport button:focus-visible{background:var(--accent);color:#fff;outline:none}
.molexport button:active{transform:scale(.97)}
.molexport button b{font-size:11px;font-weight:650}
.molexport button span{font-size:8px;letter-spacing:.08em;opacity:.68}
.molexport button.moltex{grid-column:1/-1}
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
.molask .mnope{font-size:10px;color:#f08a7a;letter-spacing:.04em}
.molask .mnope:not(:empty){padding:6px 2px 0}
@media (prefers-reduced-motion: reduce){.molrail button,.molviewrail,.molviewrail .mvtoggle,.molviewrail .mvhi,.molexport button{transition:none}.molmenu button{transition:none}.mol.nono{animation:none}}
@media (prefers-reduced-transparency: reduce){.molrail,.molviewrail{backdrop-filter:none;background:#25262b}}
`
});
defineTool({ kind:'molecule', cat:'science', label:'Molecule', icon:'molecule', order:10,
  hint:'Draw a molecule — atoms, bonds, rings, charges — see its formula and mass, and turn it in 3D' });
