/* Open Note — lib/chem.js
   chemistry with no DOM in it: the elements, a molecule as a small graph, what
   it weighs and what it is called, SMILES in and out, where its atoms go on a
   page and where they sit in space. Owes nothing to the app — js/items/
   molecule.js and ptable.js draw with it, nothing here draws.

   A molecule is  { atoms:[{e,x,y,q,h,iso}], bonds:[{a,b,o,s}] }
     e   element symbol          x,y  position, in bond lengths (y down, like a screen)
     q   formal charge           h    hydrogens written by hand (null = work them out)
     iso isotope mass number     a,b  atom indices   o  order 1|2|3   s  0 plain|1 wedge|2 hash
   Everything else — hydrogens, lone pairs, the formula, the rings, the
   3D coordinates — is worked out from those two lists and never stored.

   The element table and the molecule library are js/data/elements.js, which
   must load first. */

const CHEM_CATS = { a:'alkali metal', e:'alkaline earth metal', t:'transition metal',
  p:'post-transition metal', m:'metalloid', n:'nonmetal', h:'halogen', g:'noble gas',
  l:'lanthanide', c:'actinide', u:'unknown' };
const CHEM_EL = [null];                  // by atomic number
const CHEM_SYM = {};                     // by symbol
CHEM_EL_SRC.trim().split('\n').forEach((ln, i) => {
  const f = ln.trim().split(/\s+/);
  const e = { z: i + 1, sym: f[0], name: f[1], mass: +f[2], en: f[3] === '-' ? null : +f[3],
    group: +f[4], period: +f[5], block: f[6], cat: f[7], rcov: +f[8], rvdw: +f[9], color: f[10],
    val: f[11].split(',').map(Number) };
  CHEM_EL.push(e); CHEM_SYM[e.sym] = e;
});
/* by symbol or by number; a symbol typed in any case is looked up properly */
const chemEl = k => typeof k === 'number' ? CHEM_EL[k]
  : CHEM_SYM[k] || CHEM_SYM[String(k || '').charAt(0).toUpperCase() + String(k || '').slice(1).toLowerCase()];
const CHEM_SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹', CHEM_SUBD = '₀₁₂₃₄₅₆₇₈₉';
const chemSup = n => String(n).replace(/-/g, '⁻').replace(/\d/g, d => CHEM_SUPD[+d]);
const chemSub = n => String(n).replace(/\d/g, d => CHEM_SUBD[+d]);

/* ---- electron configuration ----
   Filled in Madelung order, then written out in shell order the way a
   textbook does — "[Ar] 3d⁵ 4s¹". The noble gases are exact prefixes of that
   order, so the core is simply the electrons skipped. The exceptions are the
   real ones (half and full d and f shells pulled forward). */
const CHEM_SHELLS = ['1s','2s','2p','3s','3p','4s','3d','4p','5s','4d','5p','6s','4f','5d','6p','7s','5f','6d','7p'];
const CHEM_CAP = { s:2, p:6, d:10, f:14 };
const CHEM_NOBLE = [2, 10, 18, 36, 54, 86, 118];
const CHEM_CONF_X = { 24:'3d5 4s1', 29:'3d10 4s1', 41:'4d4 5s1', 42:'4d5 5s1', 44:'4d7 5s1',
  45:'4d8 5s1', 46:'4d10', 47:'4d10 5s1', 57:'5d1 6s2', 58:'4f1 5d1 6s2', 64:'4f7 5d1 6s2',
  78:'4f14 5d9 6s1', 79:'4f14 5d10 6s1', 89:'6d1 7s2', 90:'6d2 7s2', 91:'5f2 6d1 7s2',
  92:'5f3 6d1 7s2', 93:'5f4 6d1 7s2', 96:'5f7 6d1 7s2', 103:'5f14 7s2 7p1' };
function chemConf(z){
  const core = CHEM_NOBLE.filter(n => n < z).pop() || 0;
  let s = CHEM_CONF_X[z];
  if(!s){
    let left = z - core, skip = core; const parts = [];
    for(const sh of CHEM_SHELLS){
      const cap = CHEM_CAP[sh[1]];
      if(skip >= cap){ skip -= cap; continue; }
      const n = Math.min(cap, left); parts.push(sh + n); left -= n;
      if(!left) break;
    }
    s = parts.join(' ');
  }
  const ord = 'spdf';
  s = s.split(' ').sort((a, b) => (+a[0] - +b[0]) || (ord.indexOf(a[1]) - ord.indexOf(b[1]))).join(' ');
  const coreSym = core ? CHEM_EL[core].sym : '';
  return { core: coreSym, tail: s,
    text: (coreSym ? '[' + coreSym + '] ' : '') + s.replace(/(\d)([spdf])(\d+)/g, (m, n, l, k) => n + l + chemSup(k)) };
}

/* ================= the graph ================= */
const chemNew = () => ({ atoms: [], bonds: [] });
/* who is bonded to whom: nb[i] = [{j: the other atom, k: the bond}] */
function chemNbrs(m){
  const nb = m.atoms.map(() => []);
  m.bonds.forEach((b, k) => { nb[b.a].push({ j: b.b, k }); nb[b.b].push({ j: b.a, k }); });
  return nb;
}
const chemBondSum = (m, i, nb) => (nb || chemNbrs(m))[i].reduce((s, x) => s + (m.bonds[x.k].o || 1), 0);
/* the bond between two atoms, if there is one */
const chemBondAt = (m, a, b) => m.bonds.findIndex(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));

/* ---- valence, and the hydrogens nobody draws ----
   The organic subset gets its hydrogens worked out — the lowest usual valence
   that holds what is already bonded, allowing for charge (N⁺ takes four, O⁻
   one, a carbocation three). Metals and the rest get none: a drawn ion is
   what it is. */
const CHEM_ORGANIC = { B:1, C:1, N:1, O:1, F:1, P:1, S:1, Cl:1, Br:1, I:1, Si:1, Se:1, As:1, Te:1 };
function chemVals(e, q){
  const el = CHEM_SYM[e]; if(!el) return [];
  q = q || 0;
  if(!q) return el.val;
  const g = el.group;
  const f = g === 13 ? v => v - q : g === 14 ? v => v - Math.abs(q) : v => v + q;
  return el.val.map(f).filter(v => v >= 0);
}
function chemH(m, i, nb){
  const a = m.atoms[i];
  if(a.h != null) return a.h;                  // written by hand, or read from a bracket atom
  if(!CHEM_ORGANIC[a.e]) return 0;
  const s = chemBondSum(m, i, nb);
  const v = chemVals(a.e, a.q).find(x => x >= s);
  return v == null ? 0 : v - s;
}
/* more bonds than the atom can carry — what the red halo in the editor means */
function chemOver(m, i, nb){
  const a = m.atoms[i];
  if(a.e === 'H' || a.e === 'He') return chemBondSum(m, i, nb) + (a.h || 0) > (a.e === 'H' ? 1 : 0);
  if(!CHEM_ORGANIC[a.e]) return false;
  const mx = Math.max(0, ...chemVals(a.e, a.q));
  return chemBondSum(m, i, nb) + (a.h || 0) > mx;
}
/* valence electrons of a main-group atom; d and f block hand back null */
const chemVE = el => el.block === 'd' || el.block === 'f' ? null : el.group <= 2 ? el.group : el.group - 10;
/* lone pairs, the Lewis way: what is left after the bonds and the charge, in twos */
function chemFree(m, i, nb){
  const a = m.atoms[i], el = CHEM_SYM[a.e]; if(!el) return 0;
  const ve = chemVE(el); if(ve == null) return 0;
  return Math.max(0, ve - (a.q || 0) - chemBondSum(m, i, nb) - chemH(m, i, nb));
}
const chemLP = (m, i, nb) => Math.floor(chemFree(m, i, nb) / 2);
const chemRad = (m, i, nb) => chemFree(m, i, nb) % 2;     // an unpaired electron

/* ---- formula and mass ---- */
function chemCounts(m, idx){
  const nb = chemNbrs(m), c = {}; let q = 0;
  (idx || m.atoms.map((_, i) => i)).forEach(i => {
    const a = m.atoms[i];
    c[a.e] = (c[a.e] || 0) + 1;
    const h = chemH(m, i, nb); if(h) c.H = (c.H || 0) + h;
    q += a.q || 0;
  });
  return { c, q };
}
const chemChargeText = q => !q ? '' : (Math.abs(q) > 1 ? chemSup(Math.abs(q)) : '') + (q > 0 ? '⁺' : '⁻');
/* Hill order: C, then H, then the rest alphabetically — or all alphabetical with no carbon */
function chemFormula(m, idx){
  const { c, q } = chemCounts(m, idx);
  const keys = Object.keys(c);
  const hill = c.C ? ['C'].concat(c.H ? ['H'] : [], keys.filter(k => k !== 'C' && k !== 'H').sort())
                   : keys.sort();
  const parts = hill.map(k => ({ e: k, n: c[k] }));
  return { parts, q,
    plain: parts.map(p => p.e + (p.n > 1 ? p.n : '')).join('') +
           (q ? (Math.abs(q) > 1 ? Math.abs(q) : '') + (q > 0 ? '+' : '-') : ''),
    text:  parts.map(p => p.e + (p.n > 1 ? chemSub(p.n) : '')).join('') + chemChargeText(q),
    html:  parts.map(p => p.e + (p.n > 1 ? '<sub>' + p.n + '</sub>' : '')).join('') +
           (q ? '<sup>' + (Math.abs(q) > 1 ? Math.abs(q) : '') + (q > 0 ? '+' : '−') + '</sup>' : '') };
}
function chemMass(m, idx){
  const { c } = chemCounts(m, idx);
  let s = 0; for(const k in c) s += c[k] * (CHEM_SYM[k] ? CHEM_SYM[k].mass : 0);
  return s;
}
/* ---- pieces ---- which piece each atom is in, and the pieces themselves */
function chemComps(m){
  const nb = chemNbrs(m), id = new Array(m.atoms.length).fill(-1), comps = [];
  for(let i = 0; i < id.length; i++){
    if(id[i] >= 0) continue;
    const k = comps.length, st = [i], list = []; id[i] = k;
    while(st.length){
      const a = st.pop(); list.push(a);
      for(const x of nb[a]) if(id[x.j] < 0){ id[x.j] = k; st.push(x.j); }
    }
    comps.push(list.sort((a, b) => a - b));
  }
  return { id, comps };
}

/* ---- rings ----
   Every simple cycle of up to eight atoms, found by walking, then the smallest
   independent set of them — the textbook's rings: naphthalene is two
   hexagons, not two hexagons and a ten-ring. Independence is over the bonds
   mod 2, which is what tells a real third ring from the sum of the first two. */
function chemRings(m, maxLen){
  maxLen = maxLen || 8;
  const nb = chemNbrs(m), n = m.atoms.length, found = [], seen = new Set();
  const path = [], bpath = [];
  function dfs(start, at, depth){
    for(const x of nb[at]){
      if(x.j === start && depth >= 3){
        const key = bpath.concat(x.k).sort((a, b) => a - b).join(',');
        if(!seen.has(key)){ seen.add(key); found.push({ atoms: path.slice(), bonds: bpath.concat(x.k) }); }
        continue;
      }
      if(x.j < start || depth >= maxLen || path.indexOf(x.j) >= 0) continue;
      path.push(x.j); bpath.push(x.k); dfs(start, x.j, depth + 1); path.pop(); bpath.pop();
    }
  }
  for(let s = 0; s < n; s++){ path.length = 0; bpath.length = 0; path.push(s); dfs(s, s, 1); }
  found.sort((a, b) => a.atoms.length - b.atoms.length);
  const want = m.bonds.length - n + chemComps(m).comps.length;
  const words = (m.bonds.length >> 5) + 1, basis = [], out = [];
  for(const r of found){
    if(out.length >= want) break;
    const v = new Array(words).fill(0);
    r.bonds.forEach(k => { v[k >> 5] ^= 1 << (k & 31); });
    /* reduce against what is kept; anything left over is new */
    for(const b of basis){
      if(v[b.lead >> 5] & (1 << (b.lead & 31))) for(let w = 0; w < words; w++) v[w] ^= b.v[w];
    }
    let lead = -1;
    for(let w = 0; w < words && lead < 0; w++) if(v[w]) lead = (w << 5) + (31 - Math.clz32(v[w] & -v[w]));
    if(lead < 0) continue;
    basis.push({ v, lead }); out.push(r);
  }
  return out;
}
/* the 5- and 6-rings that are aromatic, Hückel's way: every atom in the ring
   with a p orbital to give — a double bond that stays inside the ring system,
   a lone pair on a heteroatom, an empty orbital on a cation — and 4n+2
   electrons between them. Either Kekulé drawing of benzene passes, which is
   what lets two drawings of one molecule hash the same. */
function chemArom(m, rings, nb){
  rings = rings || chemRings(m); nb = nb || chemNbrs(m);
  const ab = new Set(), aa = new Set(), ringAtom = new Set();
  rings.forEach(r => r.atoms.forEach(i => ringAtom.add(i)));
  for(const r of rings){
    if(r.atoms.length !== 5 && r.atoms.length !== 6) continue;
    let pi = 0, ok = true;
    for(const i of r.atoms){
      const a = m.atoms[i];
      const dbl = nb[i].find(x => m.bonds[x.k].o === 2);
      if(nb[i].some(x => m.bonds[x.k].o === 3)){ ok = false; break; }
      if(dbl){ if(ringAtom.has(dbl.j)) pi += 1; else { ok = false; break; } }
      else if(chemLP(m, i, nb) > 0 && /^(N|O|S|P|Se)$/.test(a.e) || (a.e === 'C' && (a.q || 0) < 0)) pi += 2;
      else if(a.e === 'B' || (a.e === 'C' && (a.q || 0) > 0)) pi += 0;
      else { ok = false; break; }
    }
    if(ok && pi % 4 === 2){ r.atoms.forEach(i => aa.add(i)); r.bonds.forEach(k => ab.add(k)); }
  }
  return { ab, aa };
}

/* ---- a name for the shape ----
   Morgan's trick: every atom starts as what it is, then takes in what its
   neighbours are, round after round, until the numbers say the whole graph.
   Sorted, they are the same however the atoms were numbered or drawn — so a
   drawn ethanol matches the ethanol in the library, and a molecule keeps its
   3D coordinates across a redraw. Hydrogens fold into the atom they hang on. */
function chemMix(h, v){
  h = Math.imul(h ^ v, 0xcc9e2d51); h = (h << 15) | (h >>> 17); h = Math.imul(h, 0x1b873593);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return h | 0;
}
function chemHash(m, idx){
  const nb = chemNbrs(m);
  idx = idx || m.atoms.map((_, i) => i);
  const ar = chemArom(m, chemRings(m), nb).ab;
  const heavy = idx.filter(i => m.atoms[i].e !== 'H');
  const use = heavy.length ? heavy : idx;
  const pos = new Map(use.map((i, k) => [i, k]));
  let inv = use.map(i => {
    const a = m.atoms[i], el = CHEM_SYM[a.e] || { z: 0 };
    const hx = nb[i].filter(x => m.atoms[x.j].e === 'H' && !pos.has(x.j)).length;
    let h = chemMix(el.z, 0x9e3779b9);
    h = chemMix(h, chemH(m, i, nb) + hx + 1);
    h = chemMix(h, (a.q || 0) + 64);
    return chemMix(h, nb[i].filter(x => pos.has(x.j)).length + 1);
  });
  const rounds = Math.min(use.length, 24);
  for(let r = 0; r < rounds; r++){
    inv = use.map((i, k) => {
      const env = nb[i].filter(x => pos.has(x.j))
        .map(x => chemMix(ar.has(x.k) ? 4 : (m.bonds[x.k].o || 1), inv[pos.get(x.j)]))
        .sort((a, b) => a - b);
      let h = chemMix(inv[k], 0x51ed27d5);
      for(const v of env) h = chemMix(h, v);
      return h;
    });
  }
  const atoms = inv.slice().sort((a, b) => a - b);
  const bonds = [];
  m.bonds.forEach((b, k) => {
    if(!pos.has(b.a) || !pos.has(b.b)) return;
    const u = inv[pos.get(b.a)], v = inv[pos.get(b.b)];
    bonds.push(chemMix(chemMix(Math.min(u, v), Math.max(u, v)), ar.has(k) ? 4 : (b.o || 1)));
  });
  bonds.sort((a, b) => a - b);
  let h1 = 0x811c9dc5 | 0, h2 = 0x1b873593 | 0;
  for(const v of atoms){ h1 = chemMix(h1, v); h2 = chemMix(h2, v ^ 0x5bd1e995); }
  for(const v of bonds){ h1 = chemMix(h1, v + 1); h2 = chemMix(h2, v ^ 0x27d4eb2f); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/* ================= SMILES =================
   The line notation every database speaks: atoms as symbols, bonds as - = #,
   branches in brackets, rings by matching digits. Read: the organic subset
   and bracket atoms with isotope, hydrogens and charge; aromatic lowercase is
   taken in and then given back its double bonds, since the editor only knows
   1, 2 and 3. Stereo marks (@, / \) are accepted and ignored. Write: Kekulé,
   with brackets only where they are needed. */
function chemParse(s){
  const m = chemNew(), err = [], arom = new Set(), aromBond = new Set();
  const stack = [], rings = {};
  let i = 0, prev = -1, pend = null;
  s = String(s || '').trim();
  const addAtom = (e, q, h, iso, ar) => {
    m.atoms.push({ e, x: 0, y: 0, q: q || 0, h: h == null ? null : h, iso: iso || null });
    if(ar) arom.add(m.atoms.length - 1);
    return m.atoms.length - 1;
  };
  const addBond = (a, b, o) => {
    if(a === b || chemBondAt(m, a, b) >= 0){ err.push('a bond written twice'); return; }
    const ar = o === 'a' || (o == null && arom.has(a) && arom.has(b));
    m.bonds.push({ a, b, o: typeof o === 'number' ? Math.min(3, o) : 1, s: 0 });
    if(ar) aromBond.add(m.bonds.length - 1);
  };
  while(i < s.length){
    const c = s[i];
    if(c === '('){ stack.push(prev); i++; continue; }
    if(c === ')'){ if(!stack.length){ err.push('a ) with no ('); } else prev = stack.pop(); i++; continue; }
    if(c === '-' || c === '/' || c === '\\'){ pend = 1; i++; continue; }
    if(c === '='){ pend = 2; i++; continue; }
    if(c === '#' || c === '$'){ pend = 3; i++; continue; }
    if(c === ':'){ pend = 'a'; i++; continue; }
    if(c === '.'){ pend = '.'; i++; continue; }
    if(/\s/.test(c)) break;
    if(/\d/.test(c) || c === '%'){
      let num;
      if(c === '%'){ num = s.substr(i + 1, 2); i += 3; } else { num = c; i += 1; }
      if(prev < 0){ err.push('a ring number before any atom'); continue; }
      if(rings[num]){
        const r = rings[num]; delete rings[num];
        const o = pend != null && pend !== '.' ? pend : r.o;
        addBond(r.atom, prev, o);
      } else rings[num] = { atom: prev, o: pend != null && pend !== '.' ? pend : null };
      pend = null; continue;
    }
    let at = -1;
    if(c === '['){
      const j = s.indexOf(']', i);
      if(j < 0){ err.push('a [ never closed'); break; }
      const t = s.slice(i + 1, j); i = j + 1;
      const mm = /^(\d+)?([A-Za-z][a-z]?)(@@|@)?(H\d*)?([+-]\d+|\++|-+)?(:\d+)?$/.exec(t);
      let sym = mm && mm[2], ar = false;
      if(sym && /^[a-z]/.test(sym)){ ar = true; sym = sym[0].toUpperCase() + sym.slice(1); }
      if(!mm || !CHEM_SYM[sym]){ err.push('no such atom [' + t + ']'); continue; }
      const h = mm[4] == null ? 0 : mm[4].length === 1 ? 1 : +mm[4].slice(1);
      let q = 0;
      if(mm[5]){ const z = mm[5]; q = /\d/.test(z) ? +z : (z[0] === '+' ? 1 : -1) * z.length; }
      at = addAtom(sym, q, h, mm[1] ? +mm[1] : null, ar);
    } else {
      const two = s.substr(i, 2);
      if(two === 'Cl' || two === 'Br'){ at = addAtom(two, 0, null, null, false); i += 2; }
      else if(/[BCNOPSFI]/.test(c)){ at = addAtom(c, 0, null, null, false); i += 1; }
      else if(/[bcnops]/.test(c)){ at = addAtom(c.toUpperCase(), 0, null, null, true); i += 1; }
      else if(c === '*'){ at = addAtom('C', 0, null, null, false); i += 1; }
      else { err.push('cannot read "' + c + '"'); i += 1; continue; }
    }
    if(prev >= 0 && pend !== '.') addBond(prev, at, pend);
    prev = at; pend = null;
  }
  if(Object.keys(rings).length) err.push('a ring never closed');
  if(arom.size) chemKekulize(m, arom, aromBond, err);
  m.err = err;
  return m;
}
/* Aromatic atoms written in lowercase each owe one double bond — unless the
   valence is already spoken for (an [nH], a furan oxygen, a carbonyl carbon).
   Pairing them up along the aromatic bonds is a matching, found by trying. */
function chemKekulize(m, arom, aromBond, err){
  const nb = chemNbrs(m);
  const need = new Set();
  for(const i of arom){
    const a = m.atoms[i];
    if(nb[i].some(x => m.bonds[x.k].o > 1)) continue;
    const v = chemVals(a.e, a.q)[0];
    if(v == null) continue;
    if(v - chemBondSum(m, i, nb) - (a.h == null ? 0 : a.h) >= 1) need.add(i);
  }
  const mate = new Map();
  const cands = i => nb[i].filter(x => aromBond.has(x.k) && need.has(x.j) && !mate.has(x.j));
  function go(){
    let pick = -1, best = 1e9;
    for(const i of need) if(!mate.has(i)){ const c = cands(i).length; if(c < best){ best = c; pick = i; } }
    if(pick < 0) return true;
    if(best === 0) return false;
    for(const x of cands(pick)){
      mate.set(pick, x.k); mate.set(x.j, x.k);
      if(go()) return true;
      mate.delete(pick); mate.delete(x.j);
    }
    return false;
  }
  if(!go()) err.push('could not place the double bonds of an aromatic ring');
  for(const k of new Set(mate.values())) m.bonds[k].o = 2;
}
function chemWrite(m){
  const nb = chemNbrs(m), n = m.atoms.length;
  const seen = new Array(n).fill(false), kids = m.atoms.map(() => []), ringAt = m.atoms.map(() => []);
  const classed = new Set();
  const sym = o => o === 2 ? '=' : o === 3 ? '#' : '';
  function classify(i, fromK){
    seen[i] = true;
    for(const x of nb[i]){
      if(x.k === fromK || classed.has(x.k)) continue;
      classed.add(x.k);
      if(seen[x.j]){ ringAt[i].push(x.k); ringAt[x.j].push(x.k); }
      else { kids[i].push(x); classify(x.j, x.k); }
    }
  }
  const atomStr = i => {
    const a = m.atoms[i];
    const plain = /^(B|C|N|O|P|S|F|Cl|Br|I)$/.test(a.e) && !a.q && a.h == null && !a.iso;
    if(plain) return a.e;
    const h = a.h != null ? a.h : chemH(m, i, nb);
    return '[' + (a.iso || '') + a.e + (h ? 'H' + (h > 1 ? h : '') : '') +
      (a.q ? (a.q > 0 ? '+' : '-') + (Math.abs(a.q) > 1 ? Math.abs(a.q) : '') : '') + ']';
  };
  const open = new Map(), free = [];
  let next = 1;
  const digitStr = d => d < 10 ? String(d) : '%' + String(d).padStart(2, '0');
  function walk(i){
    let out = atomStr(i);
    for(const k of ringAt[i]){
      if(open.has(k)){ out += digitStr(open.get(k)); free.push(open.get(k)); open.delete(k); }
      else { const d = free.length ? free.shift() : next++; open.set(k, d); out += sym(m.bonds[k].o) + digitStr(d); }
    }
    kids[i].forEach((x, q) => {
      const s = sym(m.bonds[x.k].o) + walk(x.j);
      out += q < kids[i].length - 1 ? '(' + s + ')' : s;
    });
    return out;
  }
  const parts = [];
  for(const comp of chemComps(m).comps){
    const root = comp.find(i => nb[i].length === 1);
    const r = root == null ? comp[0] : root;
    classify(r, -1);
    parts.push(walk(r));
  }
  return parts.join('.');
}

/* ================= where the atoms go on the page =================
   The way a hand draws it: rings as regular polygons, one glued to the next
   along the bond they share, chains as 120° zigzags, and whatever hangs off an
   atom pointed into the widest gap around it. Coordinates come out in bond
   lengths, y down; the caller decides how long a bond is on paper. */
const CHEM_TAU = Math.PI * 2;
const chemAngOf = (m, i, j) => Math.atan2(m.atoms[j].y - m.atoms[i].y, m.atoms[j].x - m.atoms[i].x);
/* the widest gap between a set of directions: [start, width] */
function chemGap(angs){
  if(!angs.length) return [-Math.PI / 2 - Math.PI, CHEM_TAU];
  const a = angs.map(v => ((v % CHEM_TAU) + CHEM_TAU) % CHEM_TAU).sort((p, q) => p - q);
  let best = [a[a.length - 1], a[0] + CHEM_TAU - a[a.length - 1]];
  for(let i = 1; i < a.length; i++) if(a[i] - a[i - 1] > best[1]) best = [a[i - 1], a[i] - a[i - 1]];
  return best;
}
function chemLayout(m){
  const n = m.atoms.length; if(!n) return m;
  const nb = chemNbrs(m), placed = new Array(n).fill(false);
  const rings = chemRings(m), ringOf = m.atoms.map(() => []);
  rings.forEach((r, ri) => r.atoms.forEach(i => ringOf[i].push(ri)));
  const sysOf = new Array(rings.length).fill(-1), systems = [];
  rings.forEach((r, ri) => {
    if(sysOf[ri] >= 0) return;
    const sid = systems.length, st = [ri], list = []; sysOf[ri] = sid;
    while(st.length){
      const a = st.pop(); list.push(a);
      rings[a].atoms.forEach(i => ringOf[i].forEach(b => { if(sysOf[b] < 0){ sysOf[b] = sid; st.push(b); } }));
    }
    systems.push(list);
  });
  const put = (i, x, y) => { m.atoms[i].x = x; m.atoms[i].y = y; placed[i] = true; };
  const placedNbrs = i => nb[i].filter(x => placed[x.j]);
  /* a regular polygon through two placed atoms, on the side away from `away` */
  function polygonFrom(r, A, B, away){
    let at = r.atoms.slice();
    const ia = at.indexOf(A);
    at = at.slice(ia).concat(at.slice(0, ia));
    if(at[1] !== B) at = [at[0]].concat(at.slice(1).reverse());
    const k = at.length, ax = m.atoms[A].x, ay = m.atoms[A].y, bx = m.atoms[B].x, by = m.atoms[B].y;
    const L = Math.hypot(bx - ax, by - ay) || 1, R = L / (2 * Math.sin(Math.PI / k)), ap = L / (2 * Math.tan(Math.PI / k));
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    let nx = -(by - ay) / L, ny = (bx - ax) / L;
    if(away && (away.x - mx) * nx + (away.y - my) * ny > 0){ nx = -nx; ny = -ny; }
    const cx = mx + nx * ap, cy = my + ny * ap;
    const a0 = Math.atan2(ay - cy, ax - cx);
    const sgn = Math.sign((ax - cx) * (by - cy) - (ay - cy) * (bx - cx)) || 1;
    at.forEach((i, t) => { if(!placed[i]) put(i, cx + R * Math.cos(a0 + sgn * t * CHEM_TAU / k), cy + R * Math.sin(a0 + sgn * t * CHEM_TAU / k)); });
  }
  /* a regular polygon standing on one placed atom, pointing away from what is already there */
  function polygonAt(r, A, dir){
    const k = r.atoms.length, R = 1 / (2 * Math.sin(Math.PI / k));
    const ia = r.atoms.indexOf(A), at = r.atoms.slice(ia).concat(r.atoms.slice(0, ia));
    const cx = m.atoms[A].x + R * Math.cos(dir), cy = m.atoms[A].y + R * Math.sin(dir);
    const a0 = dir + Math.PI;
    at.forEach((i, t) => { if(!placed[i]) put(i, cx + R * Math.cos(a0 + t * CHEM_TAU / k), cy + R * Math.sin(a0 + t * CHEM_TAU / k)); });
  }
  /* the rest of a ring whose ends are already down — a bridge, drawn as an arc */
  function arcFill(r){
    const at = r.atoms, k = at.length;
    let s = at.findIndex((i, t) => placed[i] && !placed[at[(t + 1) % k]]);
    if(s < 0) return;
    const run = [];
    for(let t = 1; t < k; t++){ const i = at[(s + t) % k]; if(placed[i]) break; run.push(i); }
    const A = at[s], B = at[(s + run.length + 1) % k];
    const ax = m.atoms[A].x, ay = m.atoms[A].y, bx = m.atoms[B].x, by = m.atoms[B].y;
    const cx = at.filter(i => placed[i]).reduce((q, i) => q + m.atoms[i].x, 0) / (k - run.length);
    const cy = at.filter(i => placed[i]).reduce((q, i) => q + m.atoms[i].y, 0) / (k - run.length);
    const L = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / L, ny = (bx - ax) / L;
    if((cx - (ax + bx) / 2) * nx + (cy - (ay + by) / 2) * ny > 0){ nx = -nx; ny = -ny; }
    const bulge = 0.45 * (run.length + 1);
    run.forEach((i, t) => {
      const u = (t + 1) / (run.length + 1), h = bulge * Math.sin(Math.PI * u);
      put(i, ax + (bx - ax) * u + nx * h, ay + (by - ay) * u + ny * h);
    });
  }
  function placeSystem(sid, anchor, from){
    const list = systems[sid].slice();
    let first = anchor == null ? list[0] : list.find(ri => rings[ri].atoms.indexOf(anchor) >= 0);
    const r0 = rings[first];
    if(anchor == null){
      const k = r0.atoms.length, R = 1 / (2 * Math.sin(Math.PI / k));
      r0.atoms.forEach((i, t) => put(i, R * Math.cos(-Math.PI / 2 + t * CHEM_TAU / k), R * Math.sin(-Math.PI / 2 + t * CHEM_TAU / k)));
    } else {
      const g = chemGap(placedNbrs(from).map(x => chemAngOf(m, from, x.j))), dir = g[0] + g[1] / 2;
      put(anchor, m.atoms[from].x + Math.cos(dir), m.atoms[from].y + Math.sin(dir));
      polygonAt(r0, anchor, dir);
    }
    const done = new Set([first]);
    let guard = 0;
    while(done.size < list.length && ++guard < 200){
      let pick = -1, most = -1;
      for(const ri of list){
        if(done.has(ri)) continue;
        const c = rings[ri].atoms.filter(i => placed[i]).length;
        if(c > most){ most = c; pick = ri; }
      }
      if(pick < 0) break;
      done.add(pick);
      const r = rings[pick], pl = r.atoms.filter(i => placed[i]);
      if(pl.length === r.atoms.length) continue;
      if(pl.length >= 2){
        /* a shared bond to glue along, if the two are neighbours in this ring */
        const k = r.atoms.length;
        let glued = false;
        for(let t = 0; t < k && !glued; t++){
          const A = r.atoms[t], B = r.atoms[(t + 1) % k];
          if(placed[A] && placed[B] && pl.length === 2){
            const others = placedNbrs(A).concat(placedNbrs(B)).map(x => x.j).filter(j => j !== A && j !== B);
            const away = others.length ? { x: others.reduce((q, j) => q + m.atoms[j].x, 0) / others.length,
                                           y: others.reduce((q, j) => q + m.atoms[j].y, 0) / others.length } : null;
            polygonFrom(r, A, B, away); glued = true;
          }
        }
        if(!glued) arcFill(r);
      } else if(pl.length === 1){
        const A = pl[0], gap = chemGap(placedNbrs(A).map(x => chemAngOf(m, A, x.j)));
        polygonAt(r, A, gap[0] + gap[1] / 2);
      } else {
        arcFill(r);
      }
    }
  }
  /* a chain or a substituent: into the widest gap, zigzagging down a chain */
  function growFrom(i){
    const open = nb[i].filter(x => !placed[x.j]);
    if(!open.length) return;
    const ring = open.find(x => ringOf[x.j].length);
    if(ring){ placeSystem(sysOf[ringOf[ring.j][0]], ring.j, i); return; }
    const have = placedNbrs(i), angs = have.map(x => chemAngOf(m, i, x.j));
    const linear = nb[i].length === 2 && (nb[i].some(x => m.bonds[x.k].o === 3) || nb[i].filter(x => m.bonds[x.k].o === 2).length >= 2);
    let dirs = [];
    if(have.length === 0){
      const a0 = -Math.PI / 6;
      dirs = open.map((x, t) => a0 + t * CHEM_TAU / open.length);
    } else if(have.length === 1 && linear){
      dirs = [angs[0] + Math.PI];
    } else if(have.length === 1){
      const a = angs[0], p = have[0].j;
      /* keep the zigzag going: parallel to the bond before the last one */
      const pp = placedNbrs(p).find(x => x.j !== i && !ringOf[x.j].length);
      const diff = (u, v) => Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v)));
      let d;
      if(pp){ const prev = chemAngOf(m, pp.j, p); d = [a + 2 * Math.PI / 3, a - 2 * Math.PI / 3].sort((u, v) => diff(u, prev) - diff(v, prev))[0]; }
      else d = Math.cos(a + 2 * Math.PI / 3) >= Math.cos(a - 2 * Math.PI / 3) ? a + 2 * Math.PI / 3 : a - 2 * Math.PI / 3;
      if(open.length === 1) dirs = [d];
      else {
        /* the chain goes to whichever branch carries the most, the others fan round */
        const step = CHEM_TAU / (open.length + 1);
        const slots = open.map((x, t) => a + step * (t + 1)).sort((u, v) => diff(u, d) - diff(v, d));
        const order = open.map((x, t) => t).sort((u, v) => nb[open[v].j].length - nb[open[u].j].length);
        dirs = []; order.forEach((t, q) => { dirs[t] = slots[q]; });
      }
    } else {
      const g = chemGap(angs), step = g[1] / (open.length + 1);
      dirs = open.map((x, t) => g[0] + step * (t + 1));
    }
    open.forEach((x, t) => put(x.j, m.atoms[i].x + Math.cos(dirs[t]), m.atoms[i].y + Math.sin(dirs[t])));
  }
  const comps = chemComps(m).comps;
  let right = 0;
  for(const comp of comps){
    const cset = new Set(comp);
    const firstRing = rings.findIndex(r => cset.has(r.atoms[0]));
    if(firstRing >= 0) placeSystem(sysOf[firstRing], null);
    else { const root = comp.find(i => nb[i].length <= 1); put(root == null ? comp[0] : root, 0, 0); }
    let guard = 0;
    for(;;){
      if(++guard > n + 5) break;
      const i = comp.find(a => placed[a] && nb[a].some(x => !placed[x.j]));
      if(i == null) break;
      growFrom(i);
    }
    comp.forEach(i => { if(!placed[i]) put(i, 0, 0); });
    /* ease apart anything that landed on top of something else — chain atoms
       only, and bonds pulled back to one as they go; the rings stay as drawn */
    const fixed = i => ringOf[i].length > 0;
    const d13 = [];
    comp.forEach(j => nb[j].forEach(x => nb[j].forEach(y => { if(x.j < y.j) d13.push([x.j, y.j, Math.hypot(m.atoms[y.j].x - m.atoms[x.j].x, m.atoms[y.j].y - m.atoms[x.j].y)]); })));
    const nudge = (i, j, d0, w, repel) => {
      if(fixed(i) && fixed(j)) return false;
      let dx = m.atoms[j].x - m.atoms[i].x, dy = m.atoms[j].y - m.atoms[i].y, d = Math.hypot(dx, dy);
      if(d < 1e-6){ dx = .01; dy = .007; d = Math.hypot(dx, dy); }
      if(repel && d >= d0) return false;
      const f = w * (d - d0) / 2, sh = (fixed(i) || fixed(j)) ? 2 : 1;
      dx *= f / d; dy *= f / d;
      if(!fixed(i)){ m.atoms[i].x += dx * sh; m.atoms[i].y += dy * sh; }
      if(!fixed(j)){ m.atoms[j].x -= dx * sh; m.atoms[j].y -= dy * sh; }
      return Math.abs(f) > 1e-3;
    };
    for(let it = 0; it < 60; it++){
      let moved = false;
      for(let u = 0; u < comp.length; u++) for(let v = u + 1; v < comp.length; v++){
        const i = comp[u], j = comp[v];
        if(chemBondAt(m, i, j) >= 0 || nb[i].some(x => nb[j].some(y => y.j === x.j))) continue;
        if(nudge(i, j, .9, .5, true)) moved = true;
      }
      if(!moved && it > 0) break;
      m.bonds.forEach(b => { if(cset.has(b.a)) nudge(b.a, b.b, 1, .5, false); });
      d13.forEach(p => nudge(p[0], p[1], p[2], .25, false));
    }
    /* stand the pieces side by side */
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    comp.forEach(i => { const a = m.atoms[i]; x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); });
    const dx = right - x0, dy = -(y0 + y1) / 2;
    comp.forEach(i => { m.atoms[i].x += dx; m.atoms[i].y += dy; });
    right += (x1 - x0) + 1.6;
  }
  /* and the whole thing about the origin */
  const cx = m.atoms.reduce((q, a) => q + a.x, 0) / n, cy = m.atoms.reduce((q, a) => q + a.y, 0) / n;
  m.atoms.forEach(a => { a.x = Math.round((a.x - cx) * 1000) / 1000; a.y = Math.round((a.y - cy) * 1000) / 1000; });
  return m;
}

/* ================= where the atoms sit in space =================
   Not a force field — distance geometry with the textbook's numbers. Every
   bond wants the sum of the two covalent radii (shorter for a double or
   triple); every pair of neighbours round an atom wants the VSEPR angle
   (109.5°, 107° with a lone pair, 104.5° with two, 120°, 180°, and the
   bipyramid and octahedron by their slots); the atoms across a double or an
   aromatic bond want to lie flat; and anything closer than its van der Waals
   skin is pushed off. It starts from the drawing, so a flipped molecule keeps
   its face and a wedge really does come forward. Hydrogens nobody drew are
   put in — the 3D picture shows them. Returns { atoms:[{e,x,y,z,src,q}],
   bonds:[{a,b,o}], arom:Set } in ångströms, centred. */
const CHEM_ORDER_K = { 1: 1, 2: .87, 3: .78 };
function chemIdeal(sn, lp){
  if(sn <= 2) return 180;
  if(sn === 3) return lp ? 118 : 120;
  if(sn === 4) return lp >= 2 ? 104.5 : lp === 1 ? 107 : 109.47;
  return 90;
}
/* the slots round an atom with five or six things about it, the lone pairs
   already seated where they go (equatorial on a bipyramid, opposite each
   other on an octahedron) — what is left is where the bonds point */
function chemSlots(sn, lp){
  const s3 = Math.sqrt(3) / 2;
  if(sn === 5){
    const eq = [[1, 0, 0], [-.5, s3, 0], [-.5, -s3, 0]], ax = [[0, 0, 1], [0, 0, -1]];
    return ax.concat(eq.slice(Math.min(3, lp)));
  }
  const all = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  return lp >= 2 ? all.slice(0, 4) : lp === 1 ? all.slice(0, 5) : all;
}
/* which slot each neighbour takes: every way of seating them is tried and
   the one whose angles between pairs best match the angles there already
   are wins — no need to turn the template, angles do not care */
function chemMatchSlots(slots, dirs){
  if(dirs.length > slots.length) return null;
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  const have = [], want = [];
  for(let u = 0; u < dirs.length; u++){ have[u] = []; for(let v = 0; v < dirs.length; v++) have[u][v] = ang(dirs[u], dirs[v]); }
  for(let u = 0; u < slots.length; u++){ want[u] = []; for(let v = 0; v < slots.length; v++) want[u][v] = ang(slots[u], slots[v]); }
  let best = null, bestErr = Infinity;
  const used = new Array(slots.length).fill(false), cur = [];
  (function go(t, err){
    if(err >= bestErr) return;
    if(t === dirs.length){ bestErr = err; best = cur.slice(); return; }
    for(let sidx = 0; sidx < slots.length; sidx++){
      if(used[sidx]) continue;
      let e = err;
      for(let u = 0; u < t; u++) e += Math.abs(have[u][t] - want[cur[u]][sidx]);
      used[sidx] = true; cur[t] = sidx; go(t + 1, e); used[sidx] = false;
    }
  })(0, 0);
  return best;
}
/* the distance between the two ends of i–j–k–l laid out with these bond
   lengths and angles and a dihedral of phi */
function chemD14(d1, d2, d3, t1, t2, phi){
  const ix = d1 * Math.cos(t1), iy = d1 * Math.sin(t1);
  const lx = d2 - d3 * Math.cos(t2), ly = d3 * Math.sin(t2) * Math.cos(phi), lz = d3 * Math.sin(t2) * Math.sin(phi);
  return Math.hypot(lx - ix, ly - iy, lz);
}
function chemEmbed(m, opts){
  opts = opts || {};
  const SCALE = opts.scale || 1.45, ITER = opts.iter || 320;
  const nb0 = chemNbrs(m), n0 = m.atoms.length;
  const rings0 = chemRings(m), arom0 = chemArom(m, rings0, nb0).ab;
  const ringOf0 = m.atoms.map(() => []);
  rings0.forEach((r, ri) => r.atoms.forEach(i => ringOf0[i].push(ri)));
  /* ---- first the skeleton: every drawn atom, from the drawing ---- */
  const W = { atoms: m.atoms.map((a, i) => ({ e: a.e, q: a.q || 0, src: i, x: a.x * SCALE, y: a.y * SCALE, z: 0 })), bonds: [], arom: new Set() };
  m.bonds.forEach((b, k) => { W.bonds.push({ a: b.a, b: b.b, o: b.o || 1, s: b.s || 0 }); if(arom0.has(k)) W.arom.add(k); });
  const hN = m.atoms.map((a, i) => chemH(m, i, nb0));
  const lp0 = m.atoms.map((a, i) => chemLP(m, i, nb0));
  const P = W.atoms.map(a => [a.x, a.y, a.z]);
  const el = W.atoms.map(a => CHEM_SYM[a.e] || CHEM_SYM.C);
  /* steric numbers count the hydrogens that are not there yet */
  const sn = W.atoms.map((a, i) => nb0[i].length + hN[i] + lp0[i]);
  const lp = lp0.slice();
  const shareRing = (i, j) => i < n0 && j < n0 && ringOf0[i].some(r => ringOf0[j].indexOf(r) >= 0);
  const nb = chemNbrs(W);
  /* out of the plane: a saturated six-ring starts as a chair, a five-ring as an
     envelope, a ring fused to one already puckered keeps the pattern going;
     round a centre with three or more chains off it they go up, down, up,
     down in the order they stand; a wedge or a hash says which way for certain.
     A plain chain stays the zigzag it was drawn as — anti, as in the book. */
  const seeded = new Set();
  for(const r of rings0){
    if(r.bonds.every(k => arom0.has(k))) continue;
    if(r.atoms.filter(i => sn[i] <= 3).length >= r.atoms.length - 1) continue;
    const k = r.atoms.length;
    const side = Math.hypot(P[r.atoms[1]][0] - P[r.atoms[0]][0], P[r.atoms[1]][1] - P[r.atoms[0]][1]) || SCALE;
    const d = el[r.atoms[0]].rcov + el[r.atoms[1]].rcov;
    const amp = .5 * Math.sqrt(Math.max(.04, d * d - side * side));
    let agree = 0;
    r.atoms.forEach((i, t) => { if(seeded.has(i)) agree += Math.sign(P[i][2]) * (t % 2 ? -1 : 1); });
    const sgn = agree < 0 ? -1 : 1;
    if(k === 6 || k >= 7) r.atoms.forEach((i, t) => { if(!seeded.has(i)){ P[i][2] = sgn * (t % 2 ? -1 : 1) * amp * (k === 6 ? 1 : .8); seeded.add(i); } });
    else if(k === 5){ const i = r.atoms.find(a => !seeded.has(a)); if(i != null){ P[i][2] += sgn * amp * 1.2; seeded.add(i); } }
  }
  const ideal = new Array(n0).fill(null);
  for(let j = 0; j < n0; j++){
    let slots = null, assign = null;
    if((sn[j] === 5 || sn[j] === 6) && nb[j].length >= 2){
      slots = chemSlots(sn[j], lp[j]);
      const dirs = nb[j].map(x => { const v = [P[x.j][0] - P[j][0], P[x.j][1] - P[j][1], P[x.j][2] - P[j][2]], L = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(c => c / L); });
      assign = chemMatchSlots(slots, dirs);
      if(!assign) slots = null;
    }
    ideal[j] = { th: chemIdeal(sn[j], lp[j]) * Math.PI / 180, slots, assign };
  }
  for(let i = 0; i < n0; i++){
    if(sn[i] < 4 || nb[i].length < 2) continue;
    if(ideal[i].slots){
      nb[i].forEach((x, t) => { const sl = ideal[i].slots[ideal[i].assign[t]]; if(Math.abs(sl[2]) > .5) P[x.j][2] += Math.sign(sl[2]) * .5 * SCALE; });
      continue;
    }
    const ord = nb[i].slice().sort((u, v) => Math.atan2(P[u.j][1] - P[i][1], P[u.j][0] - P[i][0]) - Math.atan2(P[v.j][1] - P[i][1], P[v.j][0] - P[i][0]));
    const branchy = ord.filter(x => nb[x.j].length >= 2 && !shareRing(i, x.j)).length >= 3;
    let t = i % 2;
    ord.forEach(x => {
      if(shareRing(i, x.j)){ t++; return; }
      if(nb[x.j].length >= 2 && !branchy){ t++; return; }
      P[x.j][2] += (t % 2 ? -1 : 1) * .5 * SCALE; t++;
    });
  }
  W.bonds.forEach(b => { if(b.s === 1) P[b.b][2] = P[b.a][2] + .9; else if(b.s === 2) P[b.b][2] = P[b.a][2] - .9; });
  for(let i = 0; i < n0; i++) P[i][2] += .02 * Math.sin(i * 12.9898 + 78.233);
  const bl = {};
  const blen = (i, j, o, ar) => (el[i].rcov + el[j].rcov) * (ar ? .93 : CHEM_ORDER_K[o] || 1);
  W.bonds.forEach((b, k) => { bl[b.a + ',' + b.b] = bl[b.b + ',' + b.a] = blen(b.a, b.b, b.o, W.arom.has(k)); });
  /* an end lifted out of the plane stands too far off — back to its bond's length */
  const reseat = (i, nbX) => {
    if(nbX[i].length !== 1) return;
    const c = nbX[i][0].j, d0 = bl[i + ',' + c];
    const v = [P[i][0] - P[c][0], P[i][1] - P[c][1], P[i][2] - P[c][2]], L = Math.hypot(v[0], v[1], v[2]) || 1;
    for(let k = 0; k < 3; k++) P[i][k] = P[c][k] + v[k] * d0 / L;
  };
  for(let i = 0; i < n0; i++) reseat(i, nb);
  chemRelax(W, P, sn, lp, ideal, bl, shareRing, opts.skip, ITER, .12);
  /* ---- then the hydrogens, each completing the shape its atom now has ---- */
  for(let i = 0; i < n0; i++){
    if(!hN[i]) continue;
    const dH = el[i].rcov + CHEM_SYM.H.rcov;
    const us = nb[i].map(x => { const v = [P[x.j][0] - P[i][0], P[x.j][1] - P[i][1], P[x.j][2] - P[i][2]], L = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(c => c / L); });
    let ref = null;
    if(nb[i].length === 1){
      const j = nb[i][0].j, o = nb[j].find(x => x.j !== i);
      if(o){ ref = [P[o.j][0] - P[j][0], P[o.j][1] - P[j][1], P[o.j][2] - P[j][2]]; }
    }
    const dirs = chemPlaceH(us, hN[i], ideal[i].th, ref);
    dirs.forEach(d => {
      W.atoms.push({ e: 'H', q: 0, src: -1, on: i, x: 0, y: 0, z: 0 });
      P.push([P[i][0] + d[0] * dH, P[i][1] + d[1] * dH, P[i][2] + d[2] * dH]);
      el.push(CHEM_SYM.H); sn.push(1); lp.push(0); ideal.push(null);
      W.bonds.push({ a: i, b: W.atoms.length - 1, o: 1, s: 0 });
      bl[i + ',' + (W.atoms.length - 1)] = bl[(W.atoms.length - 1) + ',' + i] = dH;
    });
  }
  chemRelax(W, P, sn, lp, ideal, bl, shareRing, opts.skip, Math.round(ITER * .5), .06);
  const n = W.atoms.length;
  const c = [0, 1, 2].map(k => P.reduce((s, p) => s + p[k], 0) / n);
  W.atoms.forEach((a, i) => { a.x = P[i][0] - c[0]; a.y = P[i][1] - c[1]; a.z = P[i][2] - c[2]; });
  W.nb = chemNbrs(W);
  return W;
}
/* where the hydrogens go to finish a centre that already has `us` bonds (unit
   vectors), `h` of them, with the ideal angle `th` between bonds; `ref` is a
   bond on the neighbour, so a methyl comes out staggered and an alkene flat */
function chemPlaceH(us, h, th, ref){
  const norm = v => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const perp = u => { const p = Math.abs(u[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; return norm(cross(u, p)); };
  const k = us.length, flat = th > 2.0;                      /* 120° and 180° centres lie flat */
  const r3 = Math.sqrt(3);
  if(k === 0){
    if(h === 1) return [[1, 0, 0]];
    if(h === 2) return [[Math.cos(th / 2), Math.sin(th / 2), 0], [Math.cos(th / 2), -Math.sin(th / 2), 0]];
    const T = [[0, 0, 1], [Math.sqrt(8) / 3, 0, -1 / 3], [-Math.sqrt(2) / 3, Math.sqrt(2 / 3), -1 / 3], [-Math.sqrt(2) / 3, -Math.sqrt(2 / 3), -1 / 3]];
    if(h === 3) return flat ? [[1, 0, 0], [-.5, r3 / 2, 0], [-.5, -r3 / 2, 0]] : T.slice(1);
    return T.slice(0, Math.min(h, 4));
  }
  if(k === 1){
    const u = us[0];
    let p = ref ? add(ref, mul(u, -dot(ref, u))) : null;
    p = p && Math.hypot(p[0], p[1], p[2]) > 1e-3 ? norm(p) : perp(u);
    const q = norm(cross(u, p));
    const at = f => add(mul(u, Math.cos(th)), add(mul(p, Math.sin(th) * Math.cos(f)), mul(q, Math.sin(th) * Math.sin(f))));
    if(h === 1) return [at(Math.PI)];                                      /* anti to the reference */
    if(h === 2) return flat ? [at(0), at(Math.PI)] : [at(Math.PI / 3), at(-Math.PI / 3)];
    return [at(Math.PI / 3), at(Math.PI), at(-Math.PI / 3)].slice(0, h);   /* staggered */
  }
  if(k === 2){
    const b = norm(mul(add(us[0], us[1]), -1));
    let n = cross(us[0], us[1]);
    n = Math.hypot(n[0], n[1], n[2]) < 1e-3 ? perp(us[0]) : norm(n);
    if(h === 1) return [flat ? b : add(mul(b, Math.cos(th / 2)), mul(n, Math.sin(th / 2)))];
    return [add(mul(b, Math.cos(th / 2)), mul(n, Math.sin(th / 2))), add(mul(b, Math.cos(th / 2)), mul(n, -Math.sin(th / 2)))].slice(0, h);
  }
  if(k === 3 && h >= 1){
    const s = add(add(us[0], us[1]), us[2]);
    return [Math.hypot(s[0], s[1], s[2]) < 1e-3 ? norm(cross(us[0], us[1])) : norm(mul(s, -1))];
  }
  return [];
}
/* the settling itself: bonds, the angles round every centre as 1-3 distances,
   flatness across double and aromatic bonds, no eclipsing across single ones,
   and nothing inside another atom's skin. Terms are tagged so a debugging run
   can switch a kind off: 1 bond 2 angle 3 flat 4 stagger 5 skin. */
function chemRelax(W, P, sn, lp, ideal, bl, shareRing, skip, ITER, eta0){
  const n = W.atoms.length, nb = chemNbrs(W), el = W.atoms.map(a => CHEM_SYM[a.e] || CHEM_SYM.C);
  const pairs = [];
  W.bonds.forEach(b => pairs.push([b.a, b.b, bl[b.a + ',' + b.b], 1, 0, 1]));
  const angBetween = (j, u, v) => {
    const I = ideal[j];
    if(!I) return Math.PI * 109.47 / 180;
    if(!I.slots || I.assign.length <= Math.max(u, v)) return I.th;
    const s = I.slots[I.assign[u]], t = I.slots[I.assign[v]];
    return Math.acos(Math.max(-1, Math.min(1, s[0] * t[0] + s[1] * t[1] + s[2] * t[2])));
  };
  for(let j = 0; j < n; j++){
    const N = nb[j]; if(N.length < 2) continue;
    for(let u = 0; u < N.length; u++) for(let v = u + 1; v < N.length; v++){
      const a = N[u].j, c = N[v].j, d1 = bl[a + ',' + j], d2 = bl[c + ',' + j], th = angBetween(j, u, v);
      pairs.push([a, c, Math.sqrt(d1 * d1 + d2 * d2 - 2 * d1 * d2 * Math.cos(th)), .6, 0, 2]);
    }
  }
  const angAt = (j, a) => {
    const I = ideal[j]; if(!I) return Math.PI * 109.47 / 180;
    if(!I.slots) return I.th;
    const t = nb[j].findIndex(x => x.j === a);
    let sum = 0, k = 0;
    nb[j].forEach((x, u) => { if(u === t) return; sum += angBetween(j, t, u); k++; });
    return k ? sum / k : I.th;
  };
  const pt = i => ({ x: P[i][0], y: P[i][1], z: P[i][2] });
  const seen14 = new Set();
  W.bonds.forEach((b, k) => {
    const j = b.a, kk = b.b, flat = b.o === 2 || W.arom.has(k);
    const stag = !flat && b.o === 1 && sn[j] >= 4 && sn[kk] >= 4 && !shareRing(j, kk);
    if(!flat && !stag) return;
    for(const x of nb[j]){ if(x.j === kk) continue;
      for(const y of nb[kk]){ if(y.j === j || y.j === x.j) continue;
        const key = Math.min(x.j, y.j) + ',' + Math.max(x.j, y.j);
        if(seen14.has(key)) continue; seen14.add(key);
        const d1 = bl[x.j + ',' + j], d2 = bl[j + ',' + kk], d3 = bl[kk + ',' + y.j];
        const t1 = angAt(j, x.j), t2 = angAt(kk, y.j);
        if(flat){
          const cis = Math.abs(chemDihedral(pt(x.j), pt(j), pt(kk), pt(y.j))) < 90;
          pairs.push([x.j, y.j, chemD14(d1, d2, d3, t1, t2, cis ? 0 : Math.PI), .35, 0, 3]);
        } else pairs.push([x.j, y.j, chemD14(d1, d2, d3, t1, t2, Math.PI / 3) * .97, .3, 1, 4]);
      }
    }
  });
  const dist = Array.from({ length: n }, () => new Uint8Array(n).fill(9));
  for(let s = 0; s < n; s++){
    dist[s][s] = 0; const q = [s];
    while(q.length){ const a = q.shift(); if(dist[s][a] >= 3) continue; for(const x of nb[a]) if(dist[s][x.j] === 9){ dist[s][x.j] = dist[s][a] + 1; q.push(x.j); } }
  }
  for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++)
    if(dist[i][j] >= 3) pairs.push([i, j, .8 * (el[i].rvdw + el[j].rvdw), .4, 1, 5]);
  const live = skip ? pairs.filter(p => skip.indexOf(p[5]) < 0) : pairs;
  for(let it = 0; it < ITER; it++){
    const eta = eta0 * (1 - it / ITER) + .02, polish = it > ITER * .8;   /* bonds have the last word */
    for(const p of live){
      const A = P[p[0]], B = P[p[1]];
      let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], d = Math.hypot(dx, dy, dz);
      if(d < 1e-4){ dx = .01; dy = .013; dz = .007; d = Math.hypot(dx, dy, dz); }
      if(p[4] && d >= p[2]) continue;
      const f = Math.max(-.25, Math.min(.25, eta * p[3] * (polish && p[5] === 1 ? 2.5 : 1) * (d - p[2]) / 2));
      dx *= f / d; dy *= f / d; dz *= f / d;
      A[0] += dx; A[1] += dy; A[2] += dz; B[0] -= dx; B[1] -= dy; B[2] -= dz;
    }
  }
}
/* ---- measuring what came out ---- */
const chemDist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
function chemAngle(p, q, r){        /* at q, in degrees */
  const a = [p.x - q.x, p.y - q.y, p.z - q.z], b = [r.x - q.x, r.y - q.y, r.z - q.z];
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}
function chemDihedral(p, q, r, s){
  const v = (a, b) => [b.x - a.x, b.y - a.y, b.z - a.z];
  const x = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const b1 = v(p, q), b2 = v(q, r), b3 = v(r, s), n1 = x(b1, b2), n2 = x(b2, b3);
  const L = Math.hypot(...b2) || 1, mm = x(n1, b2).map(c => c / L);
  return Math.atan2(dot(mm, n2), dot(n1, n2)) * 180 / Math.PI;
}
/* ---- VSEPR: the shape round one atom ---- */
const CHEM_VSEPR = {
  '2,0': ['linear', 'sp', '180°'], '3,0': ['trigonal planar', 'sp²', '120°'], '2,1': ['bent', 'sp²', '< 120°'],
  '4,0': ['tetrahedral', 'sp³', '109.5°'], '3,1': ['trigonal pyramidal', 'sp³', '107°'], '2,2': ['bent', 'sp³', '104.5°'],
  '5,0': ['trigonal bipyramidal', 'sp³d', '90° · 120°'], '4,1': ['seesaw', 'sp³d', '90° · 120°'],
  '3,2': ['T-shaped', 'sp³d', '90°'], '2,3': ['linear', 'sp³d', '180°'],
  '6,0': ['octahedral', 'sp³d²', '90°'], '5,1': ['square pyramidal', 'sp³d²', '90°'], '4,2': ['square planar', 'sp³d²', '90°']
};
function chemVSEPR(m, i, nb){
  nb = nb || chemNbrs(m);
  const x = nb[i].length + chemH(m, i, nb), e = chemLP(m, i, nb);
  const k = CHEM_VSEPR[x + ',' + e];
  return { x, e, sn: x + e, shape: k ? k[0] : x <= 1 ? '' : '', hyb: k ? k[1] : '', angle: k ? k[2] : '',
    ax: 'AX' + (x > 1 ? chemSub(x) : x === 1 ? '' : '') + (e ? 'E' + (e > 1 ? chemSub(e) : '') : '') };
}

const CHEM_LIB = CHEM_LIB_SRC.trim().split('\n').map(l => { const f = l.split('|'); return { name: f[0], smiles: f[1], tag: f[2] }; });
let CHEM_LIB_HASH = null;
function chemLibHashes(){
  if(!CHEM_LIB_HASH){
    CHEM_LIB_HASH = new Map();
    for(const e of CHEM_LIB){
      try { const m = chemParse(e.smiles); if(!m.err.length) CHEM_LIB_HASH.set(chemHash(m), e.name); } catch(err){}
    }
  }
  return CHEM_LIB_HASH;
}
/* what a drawing is called, if the library knows it — the whole thing first,
   else each piece of it */
function chemName(m){
  if(!m.atoms.length) return '';
  const H = chemLibHashes();
  const whole = H.get(chemHash(m));
  if(whole) return whole;
  const comps = chemComps(m).comps;
  if(comps.length < 2) return '';
  const names = comps.map(c => H.get(chemHash(m, c)) || '');
  return names.every(Boolean) ? names.join(' + ') : '';
}
/* the library entries a typed word could mean, best first */
function chemFind(q, max){
  q = String(q || '').trim().toLowerCase();
  if(!q) return [];
  const s = CHEM_LIB.filter(e => e.name.toLowerCase().startsWith(q));
  const c = CHEM_LIB.filter(e => !e.name.toLowerCase().startsWith(q) && e.name.toLowerCase().includes(q));
  return s.concat(c).slice(0, max || 8);
}
/* a name or a SMILES → a laid-out molecule, or null */
function chemFrom(q){
  q = String(q || '').trim();
  if(!q) return null;
  const hit = chemFind(q, 1)[0];
  if(hit && hit.name.toLowerCase() === q.toLowerCase()) return chemLayout(chemParse(hit.smiles));
  const m = chemParse(q);
  if(m.atoms.length && !m.err.length) return chemLayout(m);
  if(hit) return chemLayout(chemParse(hit.smiles));
  return null;
}
