/* Open Note — lib/nuclide.js
   the physics of the chart of the nuclides: reading NUBASE2020 in, and the
   arithmetic a chart of it wants — decay steps across the (Z, N) plane, Q
   values and separation energies out of the mass excesses, binding energy per
   nucleon, and the chain down to whatever a nuclide ends on.

   The table itself is js/data/nuclides.js, which must load first. Touches no
   DOM; js/items/science/nuchart.js is what draws with all of this. */
/* ---- reading it ----
   Once, at load. A metastable state hangs off its ground state rather than
   standing on its own, because that is how a chart shows it: the square is the
   nuclide, and the states share it. */
const NUC = [];                          // every entry, ground states and isomers
const NUC_GS = [];                       // the ground states, in Z then N order
const NUC_MAP = new Map();               // 'z:n' → the ground state at that place
const NUC_ZMAX = 118, NUC_NMAX = 177;
const nucKey = (z, n) => z + ':' + n;
const nucAt = (z, n) => NUC_MAP.get(nucKey(z, n));

/* ---- half-lives ----
   Written as NUBASE writes them, value and unit run together, so the unit is
   the letters on the end. The year is the Julian year the table reckons in. */
const NUC_Y = 31557600;
const NUC_UNIT = { ys:1e-24, zs:1e-21, as:1e-18, fs:1e-15, ps:1e-12, ns:1e-9, us:1e-6, ms:1e-3,
  s:1, m:60, h:3600, d:86400, y:NUC_Y, ky:1e3 * NUC_Y, My:1e6 * NUC_Y, Gy:1e9 * NUC_Y,
  Ty:1e12 * NUC_Y, Py:1e15 * NUC_Y, Ey:1e18 * NUC_Y, Zy:1e21 * NUC_Y, Yy:1e24 * NUC_Y };
/* stable comes back as Infinity and unknown as null, so a comparison against a
   number is never accidentally true for either */
function nucTime(hl){
  if(hl === 'stbl') return { t: Infinity, stable: true, lim: '', val: 0, unit: '' };
  if(hl === '-' || !hl) return { t: null, lim: '', val: 0, unit: '' };
  if(hl === 'punst') return { t: 0, punst: true, lim: '', val: 0, unit: '' };
  const m = /^([<>~]?)([0-9.]+)#?([a-zA-Z]*)$/.exec(hl);
  if(!m) return { t: null, lim: '', val: 0, unit: '' };
  const val = parseFloat(m[2]), unit = m[3], k = NUC_UNIT[unit];
  return { t: k === undefined ? null : val * k, lim: m[1], val, unit, est: hl.indexOf('#') >= 0 };
}

/* ---- the branches ----
   B-=100;B-n=0.50 becomes [{m:'B-', op:'=', br:100}, …], strongest first. A
   branch that is known to happen but not how often keeps br null rather than
   0 — "it does this, we cannot say how much" is not "never". */
function nucModes(s){
  if(!s || s === '-') return [];
  const out = s.split(';').map(p => {
    const m = /^([^=<>~]+)([=<>~])(.*)$/.exec(p.trim());
    if(!m) return { m: p.trim(), op: '=', br: null };
    return { m: m[1], op: m[2], br: m[3] === '?' ? null : parseFloat(m[3]) };
  });
  return out.sort((a, b) => (b.br == null ? -1 : b.br) - (a.br == null ? -1 : a.br));
}

/* ---- what a decay does to the chart ----
   Every mode is a step in (protons, neutrons). Compounds are the sum of their
   parts — B-n is a beta minus and then a neutron out of the daughter, B+A a
   positron and then an alpha — and the cluster decays are read off their own
   name, so 14C, 24Ne and 34Si need no entry here. Fission has no single
   daughter, so it steps nowhere and says so with null. */
const NUC_STEP = {
  'B-':[1, -1], 'B-n':[1, -2], 'B-2n':[1, -3], 'B-3n':[1, -4], 'B-4n':[1, -5],
  'B-p':[0, -1], 'B-d':[0, -2], 'B-t':[0, -3], 'B-A':[-1, -3], '2B-':[2, -2],
  'B+':[-1, 1], 'e+':[-1, 1], 'EC':[-1, 1], 'EC+B+':[-1, 1], '2B+':[-2, 2], '2EC':[-2, 2],
  'B+p':[-2, 1], 'ECP':[-2, 1], 'B+2p':[-3, 1], 'B+3p':[-4, 1], 'B+A':[-3, -1], 'B+pA':[-4, -1],
  'A':[-2, -2], 'p':[-1, 0], '2p':[-2, 0], '3p':[-3, 0], 'n':[0, -1], '2n':[0, -2], '3n':[0, -3],
  'd':[-1, -1], 't':[-1, -2], 'IT':[0, 0],
  'SF':null, 'B-SF':null, 'B+SF':null, 'ECSF':null, 'B':null, 'IS':null
};
function nucStep(mode){
  const m = String(mode || '').split('+').filter(p => /^\d+[A-Z]/.test(p))[0] || mode;
  if(Object.prototype.hasOwnProperty.call(NUC_STEP, mode)) return NUC_STEP[mode];
  const c = /^(\d+)([A-Z][a-z]?)$/.exec(m);           /* a cluster decay names itself */
  if(c){ const el = chemEl(c[2]); if(el) return [-el.z, -(+c[1] - el.z)]; }
  return null;
}
/* the eight sorts of square on the chart, from the mode that dominates */
function nucClass(e){
  if(!e) return 'u';
  if(e.t === Infinity) return 'st';
  const d = e.dec[0];
  if(!d) return 'u';
  const m = d.m;
  if(m === 'IT') return 'it';
  if(/^\d*B-/.test(m)) return 'bm';
  if(/^\d*(B\+|EC|e\+)/.test(m)) return 'bp';
  if(m === 'A') return 'a';
  if(/SF/.test(m)) return 'sf';
  if(/^\d*p$/.test(m)) return 'p';
  if(/^\d*n$/.test(m)) return 'n';
  if(/^\d+[A-Z]/.test(m)) return 'cd';
  return 'u';
}
const NUC_CLASS_NAME = { st:'stable', bm:'β− decay', bp:'β+ decay or electron capture',
  a:'α decay', sf:'spontaneous fission', p:'proton emission', n:'neutron emission',
  it:'isomeric transition', cd:'cluster decay', u:'not known' };

NUC_SRC.trim().split('\n').forEach(ln => {
  if(ln.charAt(0) === '@'){ const f = ln.slice(1).split(' '); NUC._z = +f[0]; NUC._sym = f[1]; return; }
  const f = ln.split(' ');
  const z = NUC._z, a = parseInt(f[0], 10), tag = (/[a-z]+$/.exec(f[0]) || [''])[0];
  const hl = nucTime(f[2]);
  const e = { z, n: a - z, a, sym: NUC._sym, tag, gs: !tag,
    me: f[1] === '-' ? null : parseFloat(f[1]), est: f[1].indexOf('#') >= 0,
    hl: f[2], t: hl.t, lim: hl.lim, hlv: hl.val, hlu: hl.unit, hlest: !!hl.est,
    jp: f[3] === '-' ? '' : f[3], dec: nucModes(f[4]),
    ab: tag ? null : (f[5] === '-' || f[5] === undefined ? null : parseFloat(f[5])),
    yr: tag ? null : (f[6] === '-' || f[6] === undefined ? null : +f[6]),
    exc: tag ? (f[5] === '-' || f[5] === undefined ? null : parseFloat(f[5])) : 0,
    iso: [] };
  e.cls = nucClass(e);
  NUC.push(e);
  if(e.gs){ NUC_GS.push(e); NUC_MAP.set(nucKey(e.z, e.n), e); }
  else { const g = nucAt(e.z, e.n); if(g){ e.parent = g; g.iso.push(e); } }
});
delete NUC._z; delete NUC._sym;

/* ---- arithmetic on the mass excesses ----
   A chart of nuclides is really a table of masses: every Q value and every
   separation energy below is one subtraction of two of them, which is why the
   file stores the masses and not the answers. The two constants are the
   hydrogen atom and the neutron, in keV, and they are this table's own — the
   first two lines of it. */
const NUC_DH = 7288.971, NUC_DN = 8071.318, NUC_DA = 2424.916;
const nucME = (z, n) => { const e = nucAt(z, n); return e && e.me != null ? e.me : null; };
const nucSub = (me, x) => (me == null || x == null) ? null : me - x;
/* the energy released — positive means it can happen */
function nucQ(e){
  if(!e || e.me == null) return {};
  const me = e.me, q = {};
  q.bm = nucSub(me, nucME(e.z + 1, e.n - 1));
  q.ec = nucSub(me, nucME(e.z - 1, e.n + 1));
  q.bp = q.ec == null ? null : q.ec - 2 * 510.999;
  const da = nucME(e.z - 2, e.n - 2);
  q.a = da == null ? null : me - da - NUC_DA;
  /* separation energies: what it costs to pull one nucleon off */
  const sn = nucME(e.z, e.n - 1), sp = nucME(e.z - 1, e.n);
  q.sn = sn == null ? null : sn + NUC_DN - me;
  q.sp = sp == null ? null : sp + NUC_DH - me;
  const s2n = nucME(e.z, e.n - 2), s2p = nucME(e.z - 2, e.n);
  q.s2n = s2n == null ? null : s2n + 2 * NUC_DN - me;
  q.s2p = s2p == null ? null : s2p + 2 * NUC_DH - me;
  return q;
}
/* binding energy per nucleon, in keV — the iron peak, drawn */
function nucBA(e){
  if(!e || e.me == null || !e.a) return null;
  return (e.z * NUC_DH + e.n * NUC_DN - e.me) / e.a;
}

/* ---- where a decay lands ---- */
function nucDaughter(e, mode){
  const s = nucStep(mode);
  if(!s) return null;
  const z = e.z + s[0], n = e.n + s[1];
  if(z < 0 || n < 0) return null;
  return { z, n, e: nucAt(z, n) };
}
/* the chain: follow the strongest branch that goes somewhere, until it reaches
   something stable, something unknown, or something not in the table. Fission
   ends a chain here — it has no one daughter to point at. */
function nucChain(e, max){
  const out = [], seen = new Set();
  let cur = e && e.gs ? e : (e && e.parent) || e;
  for(let i = 0; cur && i < (max || 40); i++){
    if(cur.t === Infinity || !cur.dec.length) break;
    if(seen.has(nucKey(cur.z, cur.n))) break;
    seen.add(nucKey(cur.z, cur.n));
    let step = null;
    for(const d of cur.dec){ const t = nucDaughter(cur, d.m); if(t && t.e && !(t.z === cur.z && t.n === cur.n)){ step = { d, t }; break; } }
    if(!step) break;
    out.push({ from: cur, mode: step.d.m, br: step.d.br, to: step.t.e });
    cur = step.t.e;
  }
  return out;
}

/* ---- printing ----
   The cell wants it short, the panel wants it the way a physicist would say it.
   Anything past a thousand years goes to powers of ten in years, because ky,
   My and Gy are the table's shorthand and not what anyone writes down. */
const NUC_SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const nucSup = s => String(s).replace(/-/g, '⁻').replace(/\d/g, d => NUC_SUP[+d]);
const NUC_TAGS = { m:'ᵐ', n:'ⁿ', p:'ᵖ', x:'ˣ' };
/* ²³⁸U, ⁹⁹ᵐTc — the mass number and the state set over the symbol */
const nucName = e => e ? nucSup(e.a) + (e.tag ? (NUC_TAGS[e.tag] || e.tag) : '') + e.sym : '';
function nucSci(x, sig){
  if(!Number.isFinite(x)) return '—';
  const ex = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, ex);
  return (+m.toFixed(sig == null ? 3 : sig)) + ' × 10' + nucSup(ex);
}
const nucUnitTxt = u => u === 'us' ? 'µs' : u;
/* short: the value and unit the table gives, which is what fits in a square */
function nucHl(e){
  if(!e) return '';
  if(e.t === Infinity) return 'stable';
  if(!e.hl || e.hl === '-') return '—';
  if(e.hl === 'punst') return 'unbound';
  return e.lim + (+e.hlv) + ' ' + nucUnitTxt(e.hlu);
}
/* long: the same, but the big years spelled in powers of ten */
function nucHlLong(e){
  if(!e) return '';
  if(e.t === Infinity) return 'stable';
  if(!e.hl || e.hl === '-') return 'not known';
  if(e.hl === 'punst') return 'particle-unstable';
  if(e.t >= 1000 * NUC_Y) return e.lim + nucSci(e.t / NUC_Y, 4) + ' y';
  return nucHl(e) + (e.hlest ? ' (estimated)' : '');
}
/* ---- how a mode is written ----
   NUBASE spells them in ASCII; a chart spells them the way they are said. The
   compounds are listed rather than pieced together, because a rule that turns
   B-A into a beta and an alpha also turns 24Ne into something silly. */
const NUC_MODE_TXT = {
  'B-':'β−', 'B-n':'β−n', 'B-2n':'β−2n', 'B-3n':'β−3n', 'B-4n':'β−4n', 'B-p':'β−p',
  'B-d':'β−d', 'B-t':'β−t', 'B-A':'β−α', 'B-SF':'β−SF', '2B-':'2β−',
  'B+':'β+', 'e+':'β+', 'EC':'EC', 'EC+B+':'EC + β+', '2B+':'2β+', '2EC':'2EC',
  'B+p':'β+p', 'ECP':'EC p', 'B+2p':'β+2p', 'B+3p':'β+3p', 'B+A':'β+α', 'B+pA':'β+pα',
  'B+SF':'β+SF', 'ECSF':'EC SF', 'B':'β',
  'A':'α', 'SF':'SF', 'IT':'IT', 'p':'p', '2p':'2p', '3p':'3p', 'n':'n', '2n':'2n', '3n':'3n',
  'd':'d', 't':'t'
};
/* a cluster decay is named after what flies out, so it writes itself */
function nucModeTxt(m){
  if(NUC_MODE_TXT[m]) return NUC_MODE_TXT[m];
  return String(m).split('+').map(p => {
    const c = /^(\d+)([A-Z][a-z]?)$/.exec(p);
    return c ? nucSup(c[1]) + c[2] : (NUC_MODE_TXT[p] || p);
  }).join(' or ');
}
/* a branch as it is read out: "α 100 %", "β− 0.0037 %", "IT ~100 %" */
function nucBranchTxt(d){
  /* a branch of 2.2e-10 % is a real one — double beta decay — and reads as a
     power of ten rather than as a computer's idea of a small number */
  const n = d.br == null ? '?' : (d.br && Math.abs(d.br) < .001 ? nucSci(d.br, 2) : String(+d.br)) + ' %';
  return nucModeTxt(d.m) + ' ' + (d.br == null ? '?' : (d.op === '=' ? '' : d.op) + n);
}
/* keV where it is small, MeV where it is not — the way the number is spoken */
function nucEn(k){
  if(k == null || !Number.isFinite(k)) return '—';
  const t = Math.abs(k) >= 1000 ? (Math.abs(k) / 1000).toFixed(3) + ' MeV' : Math.round(Math.abs(k)) + ' keV';
  return (k < 0 ? '−' : '') + t;                 /* a real minus sign: these are read, not parsed */
}

/* ---- finding one by name ----
   U238, U-238, 238U, uranium-238, Tc-99m, 99mTc, n — whichever way it was
   typed. Two spellings, the mass number before the symbol or after it. */
function nucFind(q){
  const s = String(q || '').trim().replace(/[\s\u2010\u2011\u2013\u2014_]+/g, '-');
  if(!s) return null;
  if(/^(n|neutron)$/i.test(s)) return nucAt(0, 1);
  let m = /^([A-Za-z]+)-?(\d+)([a-z]?)$/.exec(s);
  let name = m ? m[1] : '', a = m ? +m[2] : 0, tag = m ? m[3] : '';
  if(!m){
    const x = /^(\d+)([a-z]?)-?([A-Za-z][a-z]?)$/.exec(s);
    if(!x) return null;
    name = x[3]; a = +x[1]; tag = x[2];
  }
  let el = chemEl(name);
  if(!el){ const nm = name.toLowerCase(); el = CHEM_EL.find(x => x && x.name.toLowerCase() === nm); }
  if(!el) return null;
  const g = nucAt(el.z, a - el.z);
  if(!g) return null;
  return tag ? (g.iso.find(i => i.tag === tag) || g) : g;
}
