/* Open Note — items/science/feynman.js
   Feynman diagrams drawn directly on the sheet. Particles come from the
   Standard Model picker, propagators are native SVG paths, and every proposed
   stroke is checked against the interaction vertices before it is committed.

   The saved graph is deliberately small:
     vertices [{x,y}]
     edges    [{a,b,p,anti,rev,bend,mom,momSide}]

   `anti` chooses the conjugate label at an external end. `rev` is the arrow
   direction and is kept separately: an internal fermion line can circulate
   without pretending that each of its segments is a different particle. */

let FEY_PART = 'e', FEY_ANTI = 0, FEY_REVERSE = 0, FEY_TOOL = 'draw';
const FEY_U = 100, FEY_FS = 15, FEY_BL = 2.35, FEY_LEN = 1.75;
const FEY_PAD = .8, FEY_MINW = 6.4, FEY_MINH = 4.2;
const FEY_SEL = new Map();

const FEY_PARTICLES = {
  u:   { sym:'u', tex:'u', name:'up quark', group:'quark', gen:1, q:'⅔', spin:'½', mass:'2.16 MeV', kind:'fermion', family:'up', color:'#b58ee7' },
  c:   { sym:'c', tex:'c', name:'charm quark', group:'quark', gen:2, q:'⅔', spin:'½', mass:'1.2729 GeV', kind:'fermion', family:'up', color:'#b58ee7' },
  t:   { sym:'t', tex:'t', name:'top quark', group:'quark', gen:3, q:'⅔', spin:'½', mass:'172.60 GeV', kind:'fermion', family:'up', color:'#b58ee7' },
  d:   { sym:'d', tex:'d', name:'down quark', group:'quark', gen:1, q:'−⅓', spin:'½', mass:'4.70 MeV', kind:'fermion', family:'down', color:'#9e7cdb' },
  s:   { sym:'s', tex:'s', name:'strange quark', group:'quark', gen:2, q:'−⅓', spin:'½', mass:'92.9 MeV', kind:'fermion', family:'down', color:'#9e7cdb' },
  b:   { sym:'b', tex:'b', name:'bottom quark', group:'quark', gen:3, q:'−⅓', spin:'½', mass:'4.186 GeV', kind:'fermion', family:'down', color:'#9e7cdb' },
  ve:  { sym:'νₑ', tex:'\\nu_e', name:'electron neutrino', group:'lepton', gen:1, q:'0', spin:'½', mass:'sub-eV · mixed', kind:'fermion', family:'nu', pair:'e', color:'#74c7aa' },
  vmu: { sym:'νμ', tex:'\\nu_\\mu', name:'muon neutrino', group:'lepton', gen:2, q:'0', spin:'½', mass:'sub-eV · mixed', kind:'fermion', family:'nu', pair:'mu', color:'#74c7aa' },
  vtau:{ sym:'ντ', tex:'\\nu_\\tau', name:'tau neutrino', group:'lepton', gen:3, q:'0', spin:'½', mass:'sub-eV · mixed', kind:'fermion', family:'nu', pair:'tau', color:'#74c7aa' },
  e:   { sym:'e⁻', antiSym:'e⁺', tex:'e^-', antiTex:'e^+', name:'electron', antiName:'positron', group:'lepton', gen:1, q:'−1', spin:'½', mass:'0.510999 MeV', kind:'fermion', family:'charged-lepton', pair:'ve', color:'#58b895' },
  mu:  { sym:'μ⁻', antiSym:'μ⁺', tex:'\\mu^-', antiTex:'\\mu^+', name:'muon', antiName:'antimuon', group:'lepton', gen:2, q:'−1', spin:'½', mass:'105.658 MeV', kind:'fermion', family:'charged-lepton', pair:'vmu', color:'#58b895' },
  tau: { sym:'τ⁻', antiSym:'τ⁺', tex:'\\tau^-', antiTex:'\\tau^+', name:'tau', antiName:'antitau', group:'lepton', gen:3, q:'−1', spin:'½', mass:'1776.93 MeV', kind:'fermion', family:'charged-lepton', pair:'vtau', color:'#58b895' },
  gamma:{ sym:'γ', tex:'\\gamma', name:'photon', group:'boson', q:'0', spin:'1', mass:'0', kind:'photon', color:'#efb45e' },
  g:   { sym:'g', tex:'g', name:'gluon', group:'boson', q:'0', spin:'1', mass:'0', kind:'gluon', color:'#e69a56' },
  Z:   { sym:'Z⁰', tex:'Z^0', name:'Z boson', group:'boson', q:'0', spin:'1', mass:'91.1879 GeV', kind:'boson', color:'#e18667' },
  W:   { sym:'W⁺', antiSym:'W⁻', tex:'W^+', antiTex:'W^-', name:'W boson', group:'boson', q:'±1', spin:'1', mass:'80.3625 GeV', kind:'boson', color:'#df746c' },
  H:   { sym:'H', tex:'H', name:'Higgs boson', group:'scalar', q:'0', spin:'0', mass:'125.13 GeV', kind:'scalar', color:'#d985ae' }
};
const FEY_KEYS = ['u','c','t','d','s','b','ve','vmu','vtau','e','mu','tau','gamma','g','Z','W','H'];
const feyP = key => FEY_PARTICLES[key] || FEY_PARTICLES.e;
const feyConjugable = key => feyP(key).kind === 'fermion' || key === 'W';
function feySym(key, anti){ const p = feyP(key); return anti && p.antiSym ? p.antiSym : anti && p.kind === 'fermion' ? p.sym.replace(/^([^⁻⁺]+)([⁻⁺])?$/, '$1̄') : p.sym; }
function feyTex(key, anti){ const p = feyP(key); return anti && p.antiTex ? p.antiTex : anti && p.kind === 'fermion' ? '\\overline{' + p.tex + '}' : p.tex; }
const feyRd = v => Math.round(v * 100) / 100;
const feyU = v => Math.round(v * FEY_U * 10) / 10;

/* ================= the Standard Model picker ================= */
let SM_ON = null, SM_ANCHOR = null, SM_KEY = 'e';
function smCell(key){
  const p = feyP(key);
  return '<button class="smc" data-p="' + key + '" data-g="' + p.group + '" style="--pc:' + p.color + '">' +
    '<i>' + (p.gen || '') + '</i><b>' + p.sym + '</b><span>' + esc(p.name.replace(' quark','').replace(' boson','')) + '</span></button>';
}
function smGrid(){
  return '<div class="smhead"><span></span><b>I</b><b>II</b><b>III</b><b>fields</b></div>' +
    '<div class="smgrid"><em>quarks</em>' + ['u','c','t'].map(smCell).join('') + '<div class="smbosons">' + ['gamma','g'].map(smCell).join('') + '</div>' +
    '<em></em>' + ['d','s','b'].map(smCell).join('') + '<div class="smbosons">' + ['Z','W'].map(smCell).join('') + '</div>' +
    '<em>leptons</em>' + ['ve','vmu','vtau'].map(smCell).join('') + '<div class="smbosons last">' + smCell('H') + '</div>' +
    '<em></em>' + ['e','mu','tau'].map(smCell).join('') + '<div></div></div><div class="smfacts"></div>';
}
function smFacts(root, key){
  const p = feyP(key), anti = key === FEY_PART && FEY_ANTI && feyConjugable(key);
  const f = root.querySelector('.smfacts'); if(!f) return;
  f.innerHTML = '<b style="--pc:' + p.color + '">' + feySym(key, anti) + '</b><span><strong>' + esc(anti && p.antiName ? p.antiName : p.name) +
    '</strong><small>charge ' + p.q + ' · spin ' + p.spin + ' · ' + p.mass + '</small></span>';
  root.querySelectorAll('.smc.hot').forEach(c => c.classList.remove('hot'));
  const c = root.querySelector('.smc[data-p="' + key + '"]'); if(c) c.classList.add('hot');
}
function smPickEl(){
  let d = $('#smpick'); if(d) return d;
  d = document.createElement('div'); d.id = 'smpick'; d.className = 'smpick glass';
  d.setAttribute('role','dialog'); d.setAttribute('aria-label','Standard Model particle picker'); d.innerHTML = smGrid();
  document.body.appendChild(d);
  d.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  d.addEventListener('pointerover', e => { const c = e.target.closest('.smc'); if(c){ SM_KEY = c.dataset.p; smFacts(d, SM_KEY); } });
  d.addEventListener('click', e => { const c = e.target.closest('.smc'); if(c) smTake(c.dataset.p); });
  return d;
}
function smTake(key){ const fn = SM_ON; closeStandardModel(); if(fn && FEY_PARTICLES[key]) fn(key); }
function openStandardModel(anchor, onPick, cur){
  const d = smPickEl();
  if(d.classList.contains('open') && SM_ANCHOR === anchor) return closeStandardModel();
  SM_ON = onPick; SM_ANCHOR = anchor; SM_KEY = cur || FEY_PART; smFacts(d, SM_KEY); d.classList.add('open');
  const r = anchor.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
  let x = r.right + 12, y = r.top - 12;
  if(x + w > innerWidth - 8) x = r.left - w - 12;
  if(x < 8){ x = r.left + r.width / 2 - w / 2; y = r.bottom + 10; }
  d.style.left = clamp(x, 8, innerWidth - w - 8) + 'px'; d.style.top = clamp(y, 8, innerHeight - h - 8) + 'px';
  warpIn(d, r.left + r.width / 2, r.top + r.height / 2);
}
function closeStandardModel(){
  const d = $('#smpick'); if(!d || !d.classList.contains('open') || !SM_ANCHOR) return false;
  SM_ON = null; SM_ANCHOR = null; warpOut(d, () => { if(!SM_ANCHOR) d.classList.remove('open'); }); return true;
}
window.addEventListener('pointerdown', e => {
  if(SM_ANCHOR && !e.target.closest('#smpick') && !(SM_ANCHOR === e.target || SM_ANCHOR.contains(e.target))) closeStandardModel();
});
window.addEventListener('keydown', e => {
  if(!SM_ANCHOR) return;
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeStandardModel(); }
  else if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); smTake(SM_KEY); }
}, true);

/* ================= graph and Standard Model rules ================= */
function feyClone(it){ return { vertices:(it.vertices || []).map(v => ({ ...v })), edges:(it.edges || []).map(e => ({ ...e })) }; }
function feyAddV(it, x, y){ it.vertices.push({ x:feyRd(x), y:feyRd(y) }); return it.vertices.length - 1; }
function feyAddE(it, a, b, p, anti, rev, bend){
  it.edges.push({ a, b, p:p || FEY_PART, anti:anti ? 1 : 0, rev:rev ? 1 : 0, bend:feyRd(bend || 0), mom:'', momSide:1 });
  return it.edges.length - 1;
}
function feySplitEdge(it, k, p){
  const old=it.edges[k];if(!old)return-1;
  const v=feyAddV(it,p.x,p.y),first={...old,b:v,bend:0},second={...old,a:v,bend:0,mom:'',momSide:old.momSide===-1?-1:1};
  it.edges.splice(k,1,first,second);return v;
}
function feyDelV(it, i){
  it.edges = it.edges.filter(e => e.a !== i && e.b !== i).map(e => ({ ...e, a:e.a > i ? e.a - 1 : e.a, b:e.b > i ? e.b - 1 : e.b }));
  it.vertices.splice(i, 1);
}
function feyInc(it, i){
  const out = [];
  (it.edges || []).forEach((e, k) => {
    if(e.a === i) out.push({ edge:e, k, at:'a', inward:!!e.rev });
    if(e.b === i) out.push({ edge:e, k, at:'b', inward:!e.rev });
  });
  return out;
}
const feyKind = key => feyP(key).kind;
const feyIsFermion = key => feyKind(key) === 'fermion';
const FEY_ALLOWED = (() => {
  const out = [], fermions = ['u','c','t','d','s','b','ve','vmu','vtau','e','mu','tau'];
  fermions.forEach(f => {
    if(feyP(f).q !== '0') out.push([f,f,'gamma']);
    out.push([f,f,'Z']);
    if(feyP(f).family !== 'nu') out.push([f,f,'H']);
    if(feyP(f).group === 'quark') out.push([f,f,'g']);
  });
  ['u','c','t'].forEach(u => ['d','s','b'].forEach(d => out.push([u,d,'W'])));
  [['ve','e'],['vmu','mu'],['vtau','tau']].forEach(x => out.push([x[0],x[1],'W']));
  out.push(['W','W','gamma'],['W','W','Z'],['W','W','H'],['Z','Z','H'],['H','H','H'],['g','g','g']);
  out.push(['g','g','g','g'],['W','W','W','W'],['W','W','gamma','gamma'],['W','W','Z','Z'],
    ['W','W','gamma','Z'],['W','W','H','H'],['Z','Z','H','H'],['H','H','H','H']);
  return out.map(a => a.slice().sort());
})();

/* Curated processes are graphs, not stamps made from disconnected strokes.
   Their lower external legs are initial states and time runs upward. */
const feyPresetEdge=(a,b,p,anti,rev,bend,mom)=>({a,b,p,anti:anti?1:0,rev:rev?1:0,bend:bend||0,mom:mom||'',momSide:1});
const FEY_PROCESSES = [
  {id:'beta-minus',name:'Beta minus decay',reaction:'d → u + W⁻ → u + e⁻ + ν̄ₑ',about:'charged-current beta decay at quark level',tags:'beta neutron weak radioactive decay',graph(){return{vertices:[{x:0,y:2.7},{x:0,y:1.2},{x:-1.45,y:-.45},{x:1.05,y:.15},{x:.35,y:-1.55},{x:2,y:-1.15}],edges:[feyPresetEdge(0,1,'d'),feyPresetEdge(1,2,'u'),feyPresetEdge(1,3,'W',1),feyPresetEdge(3,4,'e'),feyPresetEdge(3,5,'ve',1,1)]};}},
  {id:'beta-plus',name:'Beta plus decay',reaction:'u → d + W⁺ → d + e⁺ + νₑ',about:'charged-current positron emission at quark level',tags:'beta positron proton weak radioactive decay',graph(){return{vertices:[{x:0,y:2.7},{x:0,y:1.2},{x:-1.45,y:-.45},{x:1.05,y:.15},{x:.35,y:-1.55},{x:2,y:-1.15}],edges:[feyPresetEdge(0,1,'u'),feyPresetEdge(1,2,'d'),feyPresetEdge(1,3,'W'),feyPresetEdge(3,4,'e',1,1),feyPresetEdge(3,5,'ve')]};}},
  {id:'muon-decay',name:'Muon decay',reaction:'μ⁻ → νμ + W⁻ → νμ + e⁻ + ν̄ₑ',about:'leptonic charged-current decay',tags:'muon weak lifetime',graph(){return{vertices:[{x:0,y:2.7},{x:0,y:1.2},{x:-1.4,y:-.45},{x:1.05,y:.1},{x:.35,y:-1.55},{x:2,y:-1.15}],edges:[feyPresetEdge(0,1,'mu'),feyPresetEdge(1,2,'vmu'),feyPresetEdge(1,3,'W',1),feyPresetEdge(3,4,'e'),feyPresetEdge(3,5,'ve',1,1)]};}},
  {id:'annihilation',name:'Electron–positron annihilation',reaction:'e⁻ + e⁺ → γ → μ⁻ + μ⁺',about:'s-channel QED annihilation',tags:'qed pair muon collider photon',graph(){return{vertices:[{x:-1.45,y:2.2},{x:1.45,y:2.2},{x:0,y:.85},{x:0,y:-.75},{x:-1.45,y:-2.05},{x:1.45,y:-2.05}],edges:[feyPresetEdge(0,2,'e'),feyPresetEdge(1,2,'e',1,1),feyPresetEdge(2,3,'gamma'),feyPresetEdge(3,4,'mu'),feyPresetEdge(3,5,'mu',1,1)]};}},
  {id:'compton',name:'Compton scattering',reaction:'e⁻ + γ → e⁻ + γ',about:'two-vertex electron–photon scattering',tags:'qed photon electron scattering',graph(){return{vertices:[{x:-1.45,y:2.15},{x:1.45,y:2.15},{x:-.35,y:.65},{x:.35,y:-.65},{x:-1.45,y:-2.15},{x:1.45,y:-2.15}],edges:[feyPresetEdge(0,2,'e'),feyPresetEdge(1,2,'gamma'),feyPresetEdge(2,3,'e'),feyPresetEdge(3,4,'e'),feyPresetEdge(3,5,'gamma')]};}},
  {id:'pair-production',name:'Pair production',reaction:'γ + γ → e⁻ + e⁺',about:'two-photon electron–positron production',tags:'qed photon electron positron',graph(){return{vertices:[{x:-1.45,y:2.15},{x:1.45,y:2.15},{x:-.35,y:.65},{x:.35,y:-.65},{x:-1.45,y:-2.15},{x:1.45,y:-2.15}],edges:[feyPresetEdge(0,2,'gamma'),feyPresetEdge(1,3,'gamma'),feyPresetEdge(2,4,'e'),feyPresetEdge(2,3,'e',0,1),feyPresetEdge(3,5,'e',1,1)]};}},
  {id:'quark-gluon',name:'Quark gluon emission',reaction:'u → u + g',about:'the elementary QCD quark–gluon vertex',tags:'qcd bremsstrahlung strong jet',graph(){return{vertices:[{x:0,y:2},{x:0,y:.35},{x:-1.25,y:-1.55},{x:1.35,y:-1.2}],edges:[feyPresetEdge(0,1,'u'),feyPresetEdge(1,2,'u'),feyPresetEdge(1,3,'g')]};}},
  {id:'gluon-splitting',name:'Gluon splitting',reaction:'g → u + ū',about:'QCD quark–antiquark production',tags:'qcd strong jet pair production',graph(){return{vertices:[{x:0,y:2},{x:0,y:.35},{x:-1.3,y:-1.5},{x:1.3,y:-1.5}],edges:[feyPresetEdge(0,1,'g'),feyPresetEdge(1,2,'u'),feyPresetEdge(1,3,'u',1,1)]};}},
  {id:'higgs-ww',name:'Higgs to W bosons',reaction:'H → W⁺ + W⁻',about:'the HWW electroweak vertex',tags:'higgs decay weak boson',graph(){return{vertices:[{x:0,y:2},{x:0,y:.35},{x:-1.3,y:-1.5},{x:1.3,y:-1.5}],edges:[feyPresetEdge(0,1,'H'),feyPresetEdge(1,2,'W'),feyPresetEdge(1,3,'W',1,1)]};}},
  {id:'three-gluon',name:'Three-gluon vertex',reaction:'g → g + g',about:'non-Abelian QCD gauge self-interaction',tags:'qcd strong gluon jet',graph(){return{vertices:[{x:0,y:2},{x:0,y:.35},{x:-1.3,y:-1.5},{x:1.3,y:-1.5}],edges:[feyPresetEdge(0,1,'g'),feyPresetEdge(1,2,'g'),feyPresetEdge(1,3,'g')]};}}
];
function feyProcess(id){return FEY_PROCESSES.find(p=>p.id===id);}
function feySubset(have, want){
  const left = want.slice();
  for(const x of have){ const i = left.indexOf(x); if(i < 0) return false; left.splice(i, 1); }
  return true;
}
function feyVertexState(it, i){
  const inc = feyInc(it, i), n = inc.length;
  if(n <= 1) return { ok:true, complete:true, external:n === 1 };
  if(n > 4) return { ok:false, complete:false, why:'a Standard Model vertex has at most four legs' };
  const ferm = inc.filter(x => feyIsFermion(x.edge.p));
  if(ferm.length > 2) return { ok:false, complete:false, why:'a Standard Model interaction cannot join three fermion lines' };
  if(ferm.length === 2 && ferm[0].inward === ferm[1].inward)
    return { ok:false, complete:false, why:'fermion arrows must flow through the interaction' };
  const have = inc.map(x => x.edge.p).sort();
  if(n === 2 && have[0] === have[1]) return { ok:true, complete:true, route:true };
  const exact = FEY_ALLOWED.some(p => p.length === n && feySubset(have, p));
  const charged = inc.filter(x => x.edge.p === 'W');
  if(exact){
    if(charged.length === 2 && charged[0].inward === charged[1].inward)
      return { ok:false, complete:false, why:'charged W flow must pass through the interaction' };
    if(charged.length === 4 && charged.filter(x => x.inward).length !== 2)
      return { ok:false, complete:false, why:'a four-W vertex needs two W⁺ and two W⁻ legs' };
    return { ok:true, complete:true };
  }
  const possible = FEY_ALLOWED.some(p => p.length > n && feySubset(have, p));
  if(possible){
    if(charged.length === 3 && charged.every(x => x.inward === charged[0].inward))
      return { ok:false, complete:false, why:'one more W leg cannot balance that charge flow' };
    return { ok:true, complete:false, why:'complete this interaction' };
  }
  return { ok:false, complete:false, why:'those particles have no Standard Model interaction vertex' };
}
function feyWhyBad(it){
  for(let i = 0; i < (it.vertices || []).length; i++){
    const s = feyVertexState(it, i); if(!s.ok) return 'vertex ' + (i + 1) + ' · ' + s.why;
  }
  return '';
}
function feyValidation(it){
  let bad = '', incomplete = 0, interactions = 0;
  for(let i = 0; i < (it.vertices || []).length; i++){
    const s = feyVertexState(it, i);
    if(!s.ok && !bad) bad = 'vertex ' + (i + 1) + ' · ' + s.why;
    else if(!s.complete) incomplete++;
    else if(!s.external && !s.route) interactions++;
  }
  return { ok:!bad && !incomplete, bad, incomplete, interactions };
}

/* ================= geometry and drawing ================= */
function feyEdgePts(it, e, count){
  const A = it.vertices[e.a], B = it.vertices[e.b]; if(!A || !B) return [];
  count = count || 64; const out = [];
  if(e.a === e.b){
    const r = .85 + Math.abs(e.bend || 0) * .4, side = (e.bend || 1) < 0 ? -1 : 1;
    const C1 = { x:A.x + side * r, y:A.y - r * 1.35 }, C2 = { x:A.x - side * r, y:A.y - r * 1.35 };
    for(let i = 0; i <= count; i++){
      const t = i / count, u = 1 - t;
      out.push({ x:u*u*u*A.x + 3*u*u*t*C1.x + 3*u*t*t*C2.x + t*t*t*A.x,
                 y:u*u*u*A.y + 3*u*u*t*C1.y + 3*u*t*t*C2.y + t*t*t*A.y });
    }
    return out;
  }
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const C = { x:(A.x + B.x) / 2 - dy / L * (e.bend || 0) * L,
              y:(A.y + B.y) / 2 + dx / L * (e.bend || 0) * L };
  for(let i = 0; i <= count; i++){
    const t = i / count, u = 1 - t;
    out.push({ x:u*u*A.x + 2*u*t*C.x + t*t*B.x, y:u*u*A.y + 2*u*t*C.y + t*t*B.y });
  }
  return out;
}
const feyPath = pts => pts.length ? 'M' + pts.map(p => feyU(p.x) + ' ' + feyU(p.y)).join('L') : '';
function feyStyledPts(base, kind){
  if(kind === 'fermion' || kind === 'scalar') return base;
  const out = [], cycles = Math.max(4, Math.round(base.length / (kind === 'gluon' ? 3.4 : 6.2)));
  for(let i = 0; i < base.length; i++){
    const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, tx = (b.x - a.x) / L, ty = (b.y - a.y) / L;
    const nx = -ty, ny = tx, ph = i / Math.max(1, base.length - 1) * Math.PI * 2 * cycles;
    const amp = kind === 'gluon' ? .082 : kind === 'boson' ? .062 : .052;
    const along = kind === 'gluon' ? Math.cos(ph) * amp * .62 : 0, off = Math.sin(ph) * amp;
    out.push({ x:base[i].x + nx * off + tx * along, y:base[i].y + ny * off + ty * along });
  }
  return out;
}
function feyArrow(base, rev, cls){
  if(base.length < 4) return '';
  const k = Math.floor(base.length / 2), A = base[k + (rev ? 1 : -1)], B = base[k + (rev ? -1 : 1)];
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L, nx = -ty, ny = tx;
  const p = base[k], back = .16, wide = .09;
  return '<path class="fa ' + (cls || '') + '" d="M' + feyU(p.x) + ' ' + feyU(p.y) + 'L' + feyU(p.x - tx * back + nx * wide) + ' ' + feyU(p.y - ty * back + ny * wide) + 'L' + feyU(p.x - tx * back - nx * wide) + ' ' + feyU(p.y - ty * back - ny * wide) + 'Z"/>';
}
function feyEdgeSVG(it, e, k, cls){
  const p = feyP(e.p), base = feyEdgePts(it, e), pts = feyStyledPts(base, p.kind), c = 'fe ' + p.kind + (cls ? ' ' + cls : '');
  let out = '<path class="' + c + '" data-e="' + k + '" d="' + feyPath(pts) + '"/>';
  if(p.kind === 'fermion' || e.p === 'W') out += feyArrow(base, !!e.rev, cls);
  const da = feyInc(it, e.a).length, db = feyInc(it, e.b).length;
  const labels = it.labels == null ? 'external' : it.labels;
  if(labels === 'all' || (labels !== 'hidden' && da > 1 && db > 1 && p.kind !== 'fermion')){
    const m = base[Math.floor(base.length / 2)], a = base[Math.max(0, Math.floor(base.length / 2) - 2)], b = base[Math.min(base.length - 1, Math.floor(base.length / 2) + 2)];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    out += '<text class="fl ' + (cls || '') + '" x="' + feyU(m.x + nx * .18) + '" y="' + feyU(m.y + ny * .18) + '">' + feySym(e.p, !!e.anti) + '</text>';
  }
  if(e.mom){
    const m = base[Math.floor(base.length / 2)], a = base[Math.max(0, Math.floor(base.length / 2) - 2)], b = base[Math.min(base.length - 1, Math.floor(base.length / 2) + 2)];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, side = e.momSide === -1 ? -1 : 1;
    out += '<text class="fm ' + (cls || '') + '" x="' + feyU(m.x - (b.y - a.y) / L * .38 * side) + '" y="' + feyU(m.y + (b.x - a.x) / L * .38 * side) + '">' + esc(e.mom) + '</text>';
  }
  return out;
}
function feyTerminalLabel(it, i){
  const inc = feyInc(it, i); if(inc.length !== 1 || (it.labels || 'external') === 'hidden') return '';
  const q = inc[0], e = q.edge, A = it.vertices[i], j = e.a === i ? e.b : e.a, B = it.vertices[j] || A;
  let dx = A.x - B.x, dy = A.y - B.y, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  return '<text class="fp" x="' + feyU(A.x + dx * .28) + '" y="' + feyU(A.y + dy * .28) + '">' + feySym(e.p, !!e.anti) + '</text>';
}
function feyVertexSVG(it, v, i){
  const s = feyVertexState(it, i), n = feyInc(it, i).length, sel = FEY_SEL.get(it.id);
  let out = '';
  if(sel && sel.has(i)) out += '<circle class="fsel" cx="' + feyU(v.x) + '" cy="' + feyU(v.y) + '" r="25"/>';
  if(n > 1 && !s.route && it.dots !== 0) out += '<circle class="fv' + (!s.ok ? ' bad' : !s.complete ? ' pending' : '') + '" data-v="' + i + '" cx="' + feyU(v.x) + '" cy="' + feyU(v.y) + '" r="7"/>';
  else out += '<circle class="fhit" data-v="' + i + '" cx="' + feyU(v.x) + '" cy="' + feyU(v.y) + '" r="18"/>';
  out += feyTerminalLabel(it, i); return out;
}
function feyBox(it){
  const pts = [];
  (it.vertices || []).forEach(v => pts.push(v));
  (it.edges || []).forEach(e => feyEdgePts(it, e, 20).forEach(p => pts.push(p)));
  if(!pts.length) return { x:-FEY_MINW/2, y:-FEY_MINH/2, w:FEY_MINW, h:FEY_MINH };
  let x0 = Math.min(...pts.map(p => p.x)) - FEY_PAD, x1 = Math.max(...pts.map(p => p.x)) + FEY_PAD;
  let y0 = Math.min(...pts.map(p => p.y)) - FEY_PAD, y1 = Math.max(...pts.map(p => p.y)) + FEY_PAD;
  if(x1 - x0 < FEY_MINW){ const d = (FEY_MINW - (x1 - x0)) / 2; x0 -= d; x1 += d; }
  if(y1 - y0 < FEY_MINH){ const d = (FEY_MINH - (y1 - y0)) / 2; y0 -= d; y1 += d; }
  return { x:feyRd(x0), y:feyRd(y0), w:feyRd(x1 - x0), h:feyRd(y1 - y0) };
}
function feyAxesSVG(it,box){
  if(it.axes===0)return'';
  const x=box.x+.22,y=box.y+box.h-.22,L=.72,ah=.1;
  return '<g class="faxes" aria-label="space axis x to the right; time axis t upward">'+
    '<path d="M'+feyU(x)+' '+feyU(y)+'H'+feyU(x+L)+'M'+feyU(x+L)+' '+feyU(y)+'l-'+feyU(ah)+' -'+feyU(ah*.58)+'M'+feyU(x+L)+' '+feyU(y)+'l-'+feyU(ah)+' '+feyU(ah*.58)+'"/>'+
    '<path d="M'+feyU(x)+' '+feyU(y)+'V'+feyU(y-L)+'M'+feyU(x)+' '+feyU(y-L)+'l-'+feyU(ah*.58)+' '+feyU(ah)+'M'+feyU(x)+' '+feyU(y-L)+'l'+feyU(ah*.58)+' '+feyU(ah)+'"/>'+
    '<text x="'+feyU(x+L+.14)+'" y="'+feyU(y)+'">x</text><text x="'+feyU(x)+'" y="'+feyU(y-L-.15)+'">t</text></g>';
}
function feyDraw(it, live, ghost){
  const box = feyBox(it); let inner = feyAxesSVG(it,box);
  (it.edges || []).forEach((e, k) => { inner += feyEdgeSVG(it, e, k, ''); });
  (it.vertices || []).forEach((v, i) => { inner += feyVertexSVG(it, v, i); });
  inner += '<g class="fghost">' + (ghost || '') + '</g>';
  return { vb:[feyU(box.x),feyU(box.y),feyU(box.w),feyU(box.h)].join(' '), width:(box.w * FEY_BL).toFixed(2), inner };
}
function feyInfoHTML(it){
  const v = feyValidation(it), E = (it.edges || []).length;
  if(!E) return '<span class="dim">time ↑ · space → · search a process or draw upward</span>';
  if(v.bad) return '<span class="fno">' + esc(v.bad) + '</span>';
  if(v.incomplete) return '<span class="fwait">' + v.incomplete + (v.incomplete === 1 ? ' interaction needs' : ' interactions need') + ' another leg</span>';
  const process=feyProcess(it.process);
  return '<span>'+(process?esc(process.name)+' · ':'') + v.interactions + (v.interactions === 1 ? ' interaction' : ' interactions') + ' · ' + E + (E === 1 ? ' propagator' : ' propagators') + ' · Standard Model valid</span>';
}
function feyRepaint(el, it, ghost){
  const svg = el && el.querySelector('.feysvg'); if(!svg) return;
  const d = feyDraw(it, true, ghost && ghost.svg); svg.setAttribute('viewBox', d.vb); svg.style.width = d.width + 'em'; svg.innerHTML = d.inner;
  svg.classList.toggle('nogo', !!(ghost && ghost.why));
  const info = el.querySelector('.feyinfo'); if(info) info.innerHTML = ghost && ghost.why ? '<span class="fno">' + esc(ghost.why) + '</span>' : feyInfoHTML(it);
  feyRailSync(el);
}
function feyPt(svg, e){
  const m = svg.getScreenCTM(); if(!m) return { x:0, y:0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x:p.x / FEY_U, y:p.y / FEY_U };
}
function feySegDist(p, a, b){ const dx=b.x-a.x,dy=b.y-a.y,L=dx*dx+dy*dy;if(!L)return Math.hypot(p.x-a.x,p.y-a.y);const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/L,0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy); }
function feyHit(it, p){
  let vertex = -1, bd = .28;
  (it.vertices || []).forEach((v, i) => { const d = Math.hypot(v.x-p.x,v.y-p.y); if(d<bd){bd=d;vertex=i;} });
  if(vertex >= 0) return { vertex };
  let edge = -1; bd = .2;
  (it.edges || []).forEach((e, k) => { const pts=feyEdgePts(it,e,36);for(let i=1;i<pts.length;i++){const d=feySegDist(p,pts[i-1],pts[i]);if(d<bd){bd=d;edge=k;}} });
  return edge >= 0 ? { edge } : {};
}
function feyNearV(it, p, not){ let out=-1,bd=.44;(it.vertices||[]).forEach((v,i)=>{if(i===not)return;const d=Math.hypot(v.x-p.x,v.y-p.y);if(d<bd){bd=d;out=i;}});return out; }
function feyOpenDir(it, i){
  const A=it.vertices[i],ang=[];(it.edges||[]).forEach(e=>{if(e.a===i&&e.b!==i)ang.push(Math.atan2(it.vertices[e.b].y-A.y,it.vertices[e.b].x-A.x));else if(e.b===i&&e.a!==i)ang.push(Math.atan2(it.vertices[e.a].y-A.y,it.vertices[e.a].x-A.x));});
  if(!ang.length)return-Math.PI/2;
  let best=-Math.PI/2,score=-Infinity;
  for(let k=0;k<24;k++){
    const a=-Math.PI+k*Math.PI/12,separation=Math.min(...ang.map(b=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b))))),upward=-Math.sin(a);
    const s=separation+upward*.28;if(s>score){score=s;best=a;}
  }
  return best;
}
function feyParallelBend(it,a,b){
  const n=(it.edges||[]).filter(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)).length;
  if(!n)return 0; const step=Math.ceil(n/2)*.28; return n%2?step:-step;
}

/* ================= ghost planning ================= */
function feySelectedEdge(p, anti, rev){ return { p:p || FEY_PART, anti:anti == null ? FEY_ANTI : anti, rev:rev == null ? (FEY_REVERSE ^ FEY_ANTI) : rev }; }
function feyPlan(it, tool, hit, p0, p1, moved){
  const sim=feyClone(it), P={sim,kind:'',did:false,why:'',gone:null}, pick=feySelectedEdge();
  if(tool==='erase' && !moved){
    if(hit.vertex!=null){P.gone={vertex:hit.vertex};feyDelV(sim,hit.vertex);P.did=true;P.kind='erase';}
    else if(hit.edge!=null){P.gone={edge:hit.edge};sim.edges.splice(hit.edge,1);P.did=true;P.kind='erase';}
  } else if(tool==='draw'){
    if(!moved && hit.edge!=null){ const e=sim.edges[hit.edge];e.p=pick.p;e.anti=pick.anti;e.rev=pick.rev;P.did=true;P.kind='retype';P.changed=hit.edge; }
    else {
      let a,b;
      if(moved){
        if(hit.vertex!=null)a=hit.vertex;
        else if(hit.edge!=null)a=feySplitEdge(sim,hit.edge,p0);
        else a=feyAddV(sim,p0.x,p0.y);
        const end=feyHit(sim,p1);
        if(end.vertex!=null&&end.vertex!==a)b=end.vertex;
        else if(end.edge!=null)b=feySplitEdge(sim,end.edge,p1);
        else {b=feyNearV(sim,p1,a);if(b<0)b=feyAddV(sim,p1.x,p1.y);}
      } else if(hit.vertex!=null){
        a=hit.vertex;const d=feyOpenDir(sim,a),A=sim.vertices[a];b=feyAddV(sim,A.x+Math.cos(d)*FEY_LEN,A.y+Math.sin(d)*FEY_LEN);
      } else { a=feyAddV(sim,p0.x,p0.y+FEY_LEN/2);b=feyAddV(sim,p0.x,p0.y-FEY_LEN/2); }
      if(a!==b){P.changed=feyAddE(sim,a,b,pick.p,pick.anti,pick.rev,feyParallelBend(sim,a,b));P.did=true;P.kind='edge';}
    }
  } else if(tool==='loop'){
    let a,b;
    if(moved){ a=hit.vertex!=null?hit.vertex:feyAddV(sim,p0.x,p0.y);b=feyNearV(sim,p1,-1);if(b<0)b=feyAddV(sim,p1.x,p1.y); }
    else if(hit.vertex!=null){a=b=hit.vertex;}
    else {a=feyAddV(sim,p0.x,p0.y+FEY_LEN*.75);b=feyAddV(sim,p0.x,p0.y-FEY_LEN*.75);}
    P.changed=[];
    if(a===b) P.changed.push(feyAddE(sim,a,b,pick.p,pick.anti,pick.rev,.6));
    else {
      P.changed.push(feyAddE(sim,a,b,pick.p,pick.anti,pick.rev,.3));
      P.changed.push(feyAddE(sim,a,b,pick.p,feyConjugable(pick.p)?!pick.anti:pick.anti,!pick.rev,-.3));
    }
    P.did=true;P.kind='loop';
  }
  if(P.did && P.kind!=='erase') P.why=feyWhyBad(sim);
  return P;
}
function feyGhost(it,P){
  if(!P||!P.did)return '';
  if(P.kind==='erase'){
    if(P.gone.edge!=null){const e=it.edges[P.gone.edge];return '<path class="fgone" d="'+feyPath(feyEdgePts(it,e))+'"/>';}
    const v=it.vertices[P.gone.vertex];let out='<circle class="fgonev" cx="'+feyU(v.x)+'" cy="'+feyU(v.y)+'" r="24"/>';
    it.edges.forEach(e=>{if(e.a===P.gone.vertex||e.b===P.gone.vertex)out+='<path class="fgone" d="'+feyPath(feyEdgePts(it,e))+'"/>';});return out;
  }
  const changed=Array.isArray(P.changed)?P.changed:[P.changed], oldV=(it.vertices||[]).length;let out='<g class="fplan'+(P.why?' bad':'')+'">';
  changed.forEach(k=>{if(k!=null&&P.sim.edges[k])out+=feyEdgeSVG(P.sim,P.sim.edges[k],k,'preview');});
  P.sim.vertices.forEach((v,i)=>{if(i>=oldV)out+='<circle class="fpreviewv" cx="'+feyU(v.x)+'" cy="'+feyU(v.y)+'" r="7"/>';});
  return out+'</g>';
}
function feyHoverSync(el,it){
  if(!el._feyHov||el._feyDrag||!el.classList.contains('sel')||PLOT_MOVE.has(it.id)||FEY_TOOL==='lasso'||FEY_TOOL==='momentum'){return feyRepaint(el,it,null);}
  const P=feyPlan(it,FEY_TOOL,feyHit(it,el._feyHov),el._feyHov,el._feyHov,false);feyRepaint(el,it,P.did?{svg:feyGhost(it,P),why:P.why}:null);
}
function feyNo(el,why){
  SND.nope();const info=el.querySelector('.feyinfo');if(info)info.innerHTML='<span class="fno">'+esc(why)+'</span>';
  const fig=el.querySelector('.fey');if(fig){fig.classList.remove('nono');void fig.offsetWidth;fig.classList.add('nono');}
  clearTimeout(el._feyNo);el._feyNo=setTimeout(()=>{if(fig)fig.classList.remove('nono');},420);
}
function feyCommit(it,el,page,P){
  if(!P||!P.did)return;
  if(P.why)return feyNo(el,P.why);
  it.vertices=P.sim.vertices;it.edges=P.sim.edges;delete it.process;FEY_SEL.delete(it.id);feyMenuClose();feyRepaint(el,it);queueSave(page.id);SND.tick();
}

/* ================= lasso, loops and direct manipulation ================= */
const feyInside=(p,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-9)+a.x))c=!c;}return c;};
function feyComponent(it,start){const seen=new Set([start]),q=[start];while(q.length){const i=q.shift();it.edges.forEach(e=>{let j=-1;if(e.a===i)j=e.b;else if(e.b===i)j=e.a;if(j>=0&&!seen.has(j)){seen.add(j);q.push(j);}});}return seen;}
let FEY_ARM=null,FEY_MENU=null;
function feyMenuEl(){
  let d=$('#feymenu');if(d)return d;d=document.createElement('div');d.id='feymenu';d.className='feymenu glass-lite';
  d.innerHTML='<button data-a="rot">⟳<span>turn</span></button><button data-a="move">✥<span>move</span></button><button data-a="copy">⧉<span>copy</span></button><button data-a="delete">⌫<span>delete</span></button>';
  document.body.appendChild(d);d.addEventListener('pointerdown',e=>e.stopPropagation());d.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!FEY_MENU)return;const a=b.dataset.a,m=FEY_MENU;
    if(a==='copy')return feyCopySel(m.it,m.el,m.page);if(a==='delete')return feyDeleteSel(m.it,m.el,m.page);FEY_ARM=FEY_ARM===a?null:a;feyMenuSync();});return d;
}
function feyMenuSync(){const d=$('#feymenu');if(d)d.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.a===FEY_ARM));}
function feyMenuOpen(it,el,page){
  const sel=FEY_SEL.get(it.id),svg=el.querySelector('.feysvg'),m=svg&&svg.getScreenCTM();if(!sel||!sel.size||!m)return feyMenuClose();
  const d=feyMenuEl();FEY_MENU={it,el,page};d.classList.add('open');let x0=Infinity,x1=-Infinity,y0=Infinity;sel.forEach(i=>{const v=it.vertices[i];if(v){x0=Math.min(x0,v.x);x1=Math.max(x1,v.x);y0=Math.min(y0,v.y);}});
  const p=new DOMPoint((x0+x1)/2*FEY_U,y0*FEY_U).matrixTransform(m),w=d.offsetWidth,h=d.offsetHeight;d.style.left=clamp(p.x-w/2,8,innerWidth-w-8)+'px';d.style.top=clamp(p.y-h-14,8,innerHeight-h-8)+'px';feyMenuSync();warpIn(d,p.x,p.y);
}
function feyMenuClose(){FEY_ARM=null;const d=$('#feymenu');if(!d||!d.classList.contains('open')){FEY_MENU=null;return;}FEY_MENU=null;warpOut(d,()=>{if(!FEY_MENU)d.classList.remove('open');});}
function feyDeleteSel(it,el,page){const sel=FEY_SEL.get(it.id);if(!sel||!sel.size)return;[...sel].sort((a,b)=>b-a).forEach(i=>feyDelV(it,i));FEY_SEL.delete(it.id);feyMenuClose();feyRepaint(el,it);queueSave(page.id);SND.tick();}
function feyCopySel(it,el,page){
  const sel=FEY_SEL.get(it.id);if(!sel||!sel.size)return;const idx=[...sel].sort((a,b)=>a-b),map=new Map();idx.forEach(i=>{const v=it.vertices[i],j=feyAddV(it,v.x+.7,v.y+.7);map.set(i,j);});
  it.edges.slice().forEach(e=>{if(map.has(e.a)&&map.has(e.b)){const n={...e,a:map.get(e.a),b:map.get(e.b)};it.edges.push(n);}});FEY_SEL.set(it.id,new Set(map.values()));feyRepaint(el,it);queueSave(page.id);SND.pop();feyMenuOpen(it,el,page);
}
window.addEventListener('pointerdown',e=>{if(FEY_MENU&&!e.target.closest('#feymenu')&&!e.target.closest('.item[data-type="feynman"]'))feyMenuClose();});

function feyGesture(e,svg,el,it,page){
  const pid=e.pointerId,p0=feyPt(svg,e),hit=feyHit(it,p0),tool=FEY_TOOL;let moved=false,last=p0,path=tool==='lasso'?[p0]:null;
  const sel=FEY_SEL.get(it.id),has=sel&&sel.size;let mode=tool;
  if(tool==='lasso'&&has){if(FEY_ARM==='rot')mode='rot';else if(FEY_ARM==='move'||(hit.vertex!=null&&sel.has(hit.vertex)))mode='move';}
  const start=has?[...sel].map(i=>({i,x:it.vertices[i].x,y:it.vertices[i].y})):[],center=has?{x:start.reduce((s,v)=>s+v.x,0)/start.length,y:start.reduce((s,v)=>s+v.y,0)/start.length}:null;
  el._feyDrag=true;try{svg.setPointerCapture(pid);}catch(err){}
  const mv=ev=>{if(ev.pointerId!==pid)return;const p=feyPt(svg,ev);if(!moved&&Math.hypot(p.x-p0.x,p.y-p0.y)<.1)return;moved=true;
    if(mode==='draw'||mode==='loop'){const P=feyPlan(it,mode,hit,p0,p,true);feyRepaint(el,it,{svg:feyGhost(it,P),why:P.why});}
    else if(mode==='lasso'){path.push(p);feyRepaint(el,it,{svg:'<path class="flasso" d="'+feyPath(path)+'"/>',why:''});}
    else if(mode==='move'){start.forEach(v=>{it.vertices[v.i].x=feyRd(v.x+p.x-p0.x);it.vertices[v.i].y=feyRd(v.y+p.y-p0.y);});feyRepaint(el,it);}
    else if(mode==='rot'){const a0=Math.atan2(p0.y-center.y,p0.x-center.x),a1=Math.atan2(p.y-center.y,p.x-center.x),a=Math.round((a1-a0)/(Math.PI/12))*(Math.PI/12),c=Math.cos(a),s=Math.sin(a);start.forEach(v=>{const x=v.x-center.x,y=v.y-center.y;it.vertices[v.i].x=feyRd(center.x+x*c-y*s);it.vertices[v.i].y=feyRd(center.y+x*s+y*c);});feyRepaint(el,it);}
    last=p;};
  const up=ev=>{if(ev.pointerId!==pid)return;svg.removeEventListener('pointermove',mv);svg.removeEventListener('pointerup',up);svg.removeEventListener('pointercancel',up);el._feyDrag=false;
    if(ev.type!=='pointerup')return feyRepaint(el,it);
    const p=feyPt(svg,ev);
    if(mode==='momentum'&&!moved){if(hit.edge!=null)feyMomentumOpen(ev.clientX,ev.clientY,it.edges[hit.edge],it,el,page);return;}
    if(mode==='lasso'){
      let take;if(!moved&&hit.vertex!=null)take=feyComponent(it,hit.vertex);else{take=new Set();(it.vertices||[]).forEach((v,i)=>{if(path&&path.length>2&&feyInside(v,path))take.add(i);});}
      if(take&&take.size)FEY_SEL.set(it.id,take);else FEY_SEL.delete(it.id);feyRepaint(el,it);if(take&&take.size)feyMenuOpen(it,el,page);else feyMenuClose();return;
    }
    if(mode==='move'||mode==='rot'){queueSave(page.id);feyMenuOpen(it,el,page);SND.tick();return;}
    feyCommit(it,el,page,feyPlan(it,mode,hit,p0,p,moved));
  };
  svg.addEventListener('pointermove',mv);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);
}

/* ================= momentum labels ================= */
let FEY_MOM=null;
function feyMomentumEl(){
  let d=$('#feymomentum');if(d)return d;d=document.createElement('div');d.id='feymomentum';d.className='feymomentum glass';
  d.innerHTML='<label>Momentum<input spellcheck="false" placeholder="k or p_1"></label><div><button data-a="side">flip side</button><button data-a="clear">clear</button><button data-a="done">done</button></div>';
  document.body.appendChild(d);d.addEventListener('pointerdown',e=>e.stopPropagation());d.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();feyMomentumClose();}if(e.key==='Enter'){e.preventDefault();feyMomentumTake();}});
  d.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!FEY_MOM)return;if(b.dataset.a==='side'){FEY_MOM.edge.momSide=FEY_MOM.edge.momSide===-1?1:-1;feyRepaint(FEY_MOM.el,FEY_MOM.it);queueSave(FEY_MOM.page.id);SND.tick();}else if(b.dataset.a==='clear'){d.querySelector('input').value='';feyMomentumTake();}else feyMomentumTake();});return d;
}
function feyMomentumOpen(x,y,edge,it,el,page){const d=feyMomentumEl();FEY_MOM={edge,it,el,page};d.querySelector('input').value=edge.mom||'';d.classList.add('open');d.style.left=clamp(x-d.offsetWidth/2,8,innerWidth-d.offsetWidth-8)+'px';d.style.top=clamp(y-d.offsetHeight-12,8,innerHeight-d.offsetHeight-8)+'px';warpIn(d,x,y);d.querySelector('input').focus({preventScroll:true});d.querySelector('input').select();}
function feyMomentumTake(){if(!FEY_MOM)return;const d=feyMomentumEl(),m=FEY_MOM;m.edge.mom=d.querySelector('input').value.trim();feyRepaint(m.el,m.it);queueSave(m.page.id);SND.tick();feyMomentumClose();}
function feyMomentumClose(){const d=$('#feymomentum');if(!d||!FEY_MOM)return;FEY_MOM=null;if(d.contains(document.activeElement))document.activeElement.blur();warpOut(d,()=>{if(!FEY_MOM)d.classList.remove('open');});}
window.addEventListener('pointerdown',e=>{if(FEY_MOM&&!e.target.closest('#feymomentum'))feyMomentumTake();});

/* ================= searchable common processes ================= */
let FEY_LIBRARY=null;
function feyLibraryRows(d){
  const q=(d.querySelector('input').value||'').trim().toLowerCase(),list=d.querySelector('.feyliblist');
  const found=FEY_PROCESSES.filter(p=>!q||(p.name+' '+p.reaction+' '+p.about+' '+p.tags).toLowerCase().includes(q));
  list.innerHTML=found.map(p=>{
    const g={...p.graph(),labels:'hidden',dots:1,axes:0},v=feyValidation(g),pic=feyDraw(g,false);
    return '<button data-process="'+p.id+'"'+(!v.ok?' disabled':'')+'><svg viewBox="'+pic.vb+'">'+pic.inner+'</svg><span><b>'+esc(p.name)+'</b><strong>'+esc(p.reaction)+'</strong><small>'+esc(p.about)+'</small></span></button>';
  }).join('')||'<div class="feylibempty">No matching Standard Model process</div>';
  d.querySelector('.feylibcount').textContent=found.length+' '+(found.length===1?'process':'processes');
}
function feyLibraryEl(){
  let d=$('#feylibrary');if(d)return d;d=document.createElement('div');d.id='feylibrary';d.className='feylibrary glass';d.setAttribute('role','dialog');d.setAttribute('aria-label','Common particle interactions');
  d.innerHTML='<div class="feylibhead"><label><span>⌕</span><input type="search" placeholder="Search beta decay, QED, Higgs…" spellcheck="false"></label><i class="feylibcount"></i></div><div class="feyliblist"></div><div class="feylibfoot">Time runs upward · choosing a process replaces this diagram</div>';
  document.body.appendChild(d);d.addEventListener('pointerdown',e=>e.stopPropagation());d.querySelector('input').addEventListener('input',()=>feyLibraryRows(d));
  d.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();feyLibraryClose();}else if(e.key==='Enter'){const b=d.querySelector('.feyliblist button:not([disabled])');if(b){e.preventDefault();feyLibraryTake(b.dataset.process);}}});
  d.addEventListener('click',e=>{const b=e.target.closest('[data-process]');if(b&&!b.disabled)feyLibraryTake(b.dataset.process);});return d;
}
function feyLibraryOpen(anchor,it,el,page){
  const d=feyLibraryEl();if(d.classList.contains('open')&&FEY_LIBRARY&&FEY_LIBRARY.anchor===anchor)return feyLibraryClose();
  FEY_LIBRARY={anchor,it,el,page};const input=d.querySelector('input');input.value='';feyLibraryRows(d);d.classList.add('open');
  const r=anchor.getBoundingClientRect(),w=d.offsetWidth,h=d.offsetHeight;d.style.left=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8)+'px';d.style.top=clamp(r.top-h-10,8,innerHeight-h-8)+'px';warpIn(d,r.left+r.width/2,r.top+r.height/2);input.focus({preventScroll:true});
}
function feyLibraryTake(id){
  const p=feyProcess(id),m=FEY_LIBRARY;if(!p||!m)return;const g=p.graph();m.it.vertices=g.vertices.map(v=>({...v}));m.it.edges=g.edges.map(e=>({...e}));m.it.process=p.id;m.it.axes=1;FEY_SEL.delete(m.it.id);feyMenuClose();feyRepaint(m.el,m.it);queueSave(m.page.id);SND.pop();feyLibraryClose();
}
function feyLibraryClose(){const d=$('#feylibrary');if(!d||!FEY_LIBRARY)return;FEY_LIBRARY=null;if(d.contains(document.activeElement))document.activeElement.blur();warpOut(d,()=>{if(!FEY_LIBRARY)d.classList.remove('open');});}
window.addEventListener('pointerdown',e=>{if(FEY_LIBRARY&&!e.target.closest('#feylibrary')&&!(FEY_LIBRARY.anchor===e.target||FEY_LIBRARY.anchor.contains(e.target)))feyLibraryClose();});

/* ================= rail ================= */
const FEY_GLYPH={
  draw:'<svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M13 8l5 4-5 4"/></svg>',
  loop:'<svg viewBox="0 0 24 24"><path d="M5 12c0-7 14-7 14 0S5 19 5 12Z"/><path d="M12 5l3 2-3 2"/></svg>',
  lasso:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="8" ry="5"/><path d="M8 14.6c-.8 1.7-.7 3.4.5 4.9"/></svg>'};
function feyRailHTML(){return '<div class="feyrail glass-lite"><button class="feypart" data-a="particle" title="Particle — open the Standard Model"><b></b></button><button data-a="anti" title="Particle or antiparticle / reverse the selected charged field">±</button><button data-a="draw" title="Propagator — drag between vertices">'+FEY_GLYPH.draw+'</button><button data-a="loop" title="Loop — click a vertex for a self-loop, or drag a circulating pair between two vertices">'+FEY_GLYPH.loop+'</button><button data-a="momentum" title="Momentum — click a propagator to add k, p₁, or LaTeX">k</button><button data-a="erase" title="Erase a vertex or propagator">'+icn('eraser')+'</button><button data-a="lasso" title="Lasso — click a connected diagram or draw around part; then turn, move, copy or delete">'+FEY_GLYPH.lasso+'</button></div>';}
function feyRailSync(el){
  const r=el&&el.querySelector('.feyrail');if(!r)return;const p=feyP(FEY_PART),chip=r.querySelector('.feypart b');chip.textContent=feySym(FEY_PART,FEY_ANTI);chip.style.color=p.color;
  r.querySelector('[data-a=anti]').disabled=!feyConjugable(FEY_PART);r.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.a===FEY_TOOL));
}
function feyRailSyncAll(){document.querySelectorAll('#pageHost .item[data-type="feynman"]').forEach(feyRailSync);}
function feyRailWire(el,it,page){const r=el.querySelector('.feyrail');if(!r)return;r.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();});r.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset.a;
  if(a==='particle')openStandardModel(b,key=>{FEY_PART=key;FEY_ANTI=0;FEY_REVERSE=0;FEY_TOOL='draw';feyRailSyncAll();},FEY_PART);
  else if(a==='anti'){if(feyConjugable(FEY_PART)){FEY_ANTI=FEY_ANTI?0:1;FEY_REVERSE=FEY_ANTI;FEY_TOOL='draw';}}
  else FEY_TOOL=a;if(FEY_TOOL!=='lasso')feyMenuClose();feyRailSyncAll();});}

/* ================= tidy ================= */
function feyTidy(it){
  const n=it.vertices.length;if(!n)return;const seen=new Set();let ox=0;
  for(let seed=0;seed<n;seed++){
    if(seen.has(seed))continue;const comp=[],q=[seed],dist=new Map([[seed,0]]);seen.add(seed);
    while(q.length){const i=q.shift();comp.push(i);it.edges.forEach(e=>{let j=-1;if(e.a===i&&e.b!==i)j=e.b;else if(e.b===i&&e.a!==i)j=e.a;if(j>=0&&!seen.has(j)){seen.add(j);dist.set(j,dist.get(i)+1);q.push(j);}});}
    const ext=comp.filter(i=>feyInc(it,i).length===1);if(ext.length){
      const ys=ext.map(i=>it.vertices[i].y),vertical=Math.max(...ys)-Math.min(...ys)>.3;
      const root=ext.reduce((a,b)=>vertical?(it.vertices[a].y>it.vertices[b].y?a:b):(it.vertices[a].x<it.vertices[b].x?a:b));
      dist.clear();dist.set(root,0);const qq=[root];while(qq.length){const i=qq.shift();it.edges.forEach(e=>{let j=-1;if(e.a===i&&e.b!==i)j=e.b;else if(e.b===i&&e.a!==i)j=e.a;if(j>=0&&comp.includes(j)&&!dist.has(j)){dist.set(j,dist.get(i)+1);qq.push(j);}});}
    }
    const levels={};comp.forEach(i=>{const d=dist.get(i)||0;(levels[d]||(levels[d]=[])).push(i);});
    const widest=Math.max(...Object.values(levels).map(a=>a.length));Object.keys(levels).forEach(ds=>{const arr=levels[ds].sort((a,b)=>it.vertices[a].x-it.vertices[b].x),d=+ds;arr.forEach((i,k)=>{it.vertices[i].x=feyRd(ox+(k-(arr.length-1)/2)*1.4);it.vertices[i].y=feyRd(-d*1.55);});});ox+=Math.max(2.4,widest*1.4+1.2);
  }
}

/* ================= SVG, PNG and TikZ-Feynman export ================= */
const FEY_PAINT=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','font-family','font-size','font-weight','text-anchor','dominant-baseline','paint-order'];
function feyExportArt(it){
  const d=feyDraw(it,false),vb=d.vb.split(/\s+/).map(Number),ratio=(vb[2]||1)/(vb[3]||1),width=Math.round(clamp((parseFloat(d.width)||15)*(it.fs||FEY_FS)*2,640,1800)),height=Math.max(1,Math.round(width/ratio));
  const host=document.createElement('figure');host.className='fey';host.style.cssText='position:fixed;left:-20000px;top:0;margin:0;pointer-events:none';host.style.setProperty('--fs',it.fs||FEY_FS);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('class','feysvg');svg.setAttribute('viewBox',d.vb);svg.setAttribute('width',width);svg.setAttribute('height',height);svg.innerHTML=d.inner;host.appendChild(svg);document.body.appendChild(host);
  svg.querySelectorAll('.fghost,.fsel,.fhit').forEach(n=>n.remove());[svg].concat(Array.from(svg.querySelectorAll('*'))).forEach(n=>{const cs=getComputedStyle(n);FEY_PAINT.forEach(p=>{const v=cs.getPropertyValue(p);if(v)n.style.setProperty(p,v);});});
  svg.querySelectorAll('.fe').forEach(n=>n.style.setProperty('stroke','#000'));svg.querySelectorAll('.fa,.fv').forEach(n=>n.style.setProperty('fill','#000'));svg.querySelectorAll('text').forEach(n=>{n.style.setProperty('fill','#000');n.style.setProperty('stroke','none');});host.remove();
  return {svg,width,height,text:'<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(svg)};
}
function feyExportName(ext){return 'Feynman diagram.'+ext;}
async function feyExportFile(it,el,format){
  const valid=feyValidation(it);if(!valid.ok)return feyNo(el,valid.bad||valid.incomplete+' incomplete interaction'+(valid.incomplete===1?'':'s')+' · finish before export');
  try{const art=feyExportArt(it);if(format==='svg')await plSaveFile(feyExportName('svg'),new Blob([art.text],{type:'image/svg+xml;charset=utf-8'}));else{const url=URL.createObjectURL(new Blob([art.text],{type:'image/svg+xml;charset=utf-8'}));try{const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('The SVG could not be rasterised'));img.src=url;});const c=document.createElement('canvas'),scale=2;c.width=art.width*scale;c.height=art.height*scale;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('The PNG could not be encoded')),'image/png'));await plSaveFile(feyExportName('png'),blob);}finally{URL.revokeObjectURL(url);}}SND.tick();const info=el.querySelector('.feyinfo');if(info)info.innerHTML='<span class="fok">'+format.toUpperCase()+' exported</span>';}
  catch(err){feyNo(el,'export failed · '+((err&&err.message)||err));}
}
const feyTexNum=n=>{const v=Math.round(n*100)/100;return(Object.is(v,-0)?0:v).toString();};
function feyTikzStyle(e){const p=feyP(e.p);if(p.kind==='fermion')return e.rev?'anti fermion':'fermion';if(e.p==='W')return e.rev?'anti charged boson':'charged boson';if(p.kind==='photon')return'photon';if(p.kind==='gluon')return'gluon';if(p.kind==='scalar')return'scalar';return'boson';}
function feyTikzLatex(it){
  const valid=feyValidation(it);if(!valid.ok)throw new Error(valid.bad||valid.incomplete+' incomplete interaction'+(valid.incomplete===1?'':'s'));
  const box=feyBox(it),degree=it.vertices.map((v,i)=>feyInc(it,i).length),lines=['\\begin{tikzpicture}','  \\begin{feynman}'];
  if(it.axes!==0)lines.push('    \\draw[->, thin] (0.18,0.18) -- (1.08,0.18) node[right] {$x$};','    \\draw[->, thin] (0.18,0.18) -- (0.18,1.08) node[above] {$t$};');
  it.vertices.forEach((v,i)=>{let lab='';if(degree[i]===1&&(it.labels||'external')!=='hidden'){const e=feyInc(it,i)[0].edge;lab=' {\\('+feyTex(e.p,!!e.anti)+'\\)}';}lines.push('    \\vertex (v'+i+') at ('+feyTexNum(v.x-box.x)+'cm,'+feyTexNum(box.y+box.h-v.y)+'cm)'+lab+';');});
  lines.push('    \\diagram* {');it.edges.forEach(e=>{const opts=[feyTikzStyle(e)],p=feyP(e.p);if(e.a===e.b)opts.push('out=40','in=140','looseness=5');else if(e.bend>0)opts.push('bend left='+Math.round(Math.abs(e.bend)*100));else if(e.bend<0)opts.push('bend right='+Math.round(Math.abs(e.bend)*100));
    const da=degree[e.a],db=degree[e.b],labels=it.labels||'external';if(labels==='all'||(labels!=='hidden'&&da>1&&db>1&&p.kind!=='fermion'))opts.push('edge label=\\('+feyTex(e.p,!!e.anti)+'\\)');if(e.mom)opts.push((e.momSide===-1?"momentum'":"momentum")+'=\\('+e.mom+'\\)');lines.push('      (v'+e.a+') -- ['+opts.join(', ')+'] (v'+e.b+'),');});
  lines.push('    };','  \\end{feynman}','\\end{tikzpicture}');return lines.join('\n');
}
async function feyCopyLatex(it,el){try{const s=feyTikzLatex(it);if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(s);SND.tick();const info=el.querySelector('.feyinfo');if(info)info.innerHTML='<span class="fok">TikZ-Feynman copied</span>';}catch(err){feyNo(el,'copy refused · '+((err&&err.message)||err));}}
let FEY_EXPORT=null;
function feyExportEl(){let d=$('#feyexport');if(d)return d;d=document.createElement('div');d.id='feyexport';d.className='feyexport glass';d.setAttribute('role','menu');d.innerHTML='<button data-f="svg"><b>SVG</b><span>VECTOR</span></button><button data-f="png"><b>PNG</b><span>2×</span></button><button class="feytex" data-f="latex"><b>Copy LaTeX</b><span>TIKZ-FEYNMAN</span></button>';document.body.appendChild(d);d.addEventListener('pointerdown',e=>e.stopPropagation());d.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();feyExportClose();}});d.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!FEY_EXPORT)return;const x=FEY_EXPORT,f=b.dataset.f;feyExportClose();if(f==='latex')feyCopyLatex(x.it,x.el);else feyExportFile(x.it,x.el,f);});return d;}
function feyExportMenu(anchor,it,el){const d=feyExportEl();if(d.classList.contains('open')&&FEY_EXPORT&&FEY_EXPORT.anchor===anchor)return feyExportClose();FEY_EXPORT={anchor,it,el};d.classList.add('open');const r=anchor.getBoundingClientRect(),w=d.offsetWidth,h=d.offsetHeight;d.style.left=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8)+'px';d.style.top=clamp(r.top-h-10,8,innerHeight-h-8)+'px';warpIn(d,r.left+r.width/2,r.top+r.height/2);d.querySelector('button').focus({preventScroll:true});}
function feyExportClose(){const d=$('#feyexport');if(!d||!FEY_EXPORT)return;FEY_EXPORT=null;if(d.contains(document.activeElement))document.activeElement.blur();warpOut(d,()=>{if(!FEY_EXPORT)d.classList.remove('open');});}
window.addEventListener('pointerdown',e=>{if(FEY_EXPORT&&!e.target.closest('#feyexport')&&!(FEY_EXPORT.anchor===e.target||FEY_EXPORT.anchor.contains(e.target)))feyExportClose();});

function feyProps(b,it,el,page){openProps(b,{title:'Feynman diagram',rows:[{t:'btn',label:'',text:()=> 'Axes: '+(it.axes===0?'hidden':'time ↑ · space →'),act(){it.axes=it.axes===0?1:0;}},{t:'btn',label:'',text:()=>{const v=it.labels==null?'external':it.labels;return'Particle labels: '+v;},act(){const a=['external','all','hidden'],v=it.labels==null?'external':it.labels;it.labels=a[(a.indexOf(v)+1)%a.length];}},{t:'btn',label:'',text:()=> 'Interaction dots: '+(it.dots===0?'hidden':'shown'),act(){it.dots=it.dots===0?1:0;}}],onchange(){feyRepaint(el,it);},onsave(){queueSave(page.id);},onreset(){it.axes=1;it.labels='external';it.dots=1;feyRepaint(el,it);}});}
function feyMove(el,it,on){if(on)PLOT_MOVE.add(it.id);else PLOT_MOVE.delete(it.id);el.classList.toggle('mmove',!!on);select(it.id);SND.pop();}

/* ================= the item ================= */
defineItem('feynman',{
  add:{feynman:base=>({...base,type:'feynman',vertices:[],edges:[],axes:1,labels:'external',dots:1,fs:FEY_FS,cap:''})},sound:'pop',sizeable:true,autoWidth:true,playArea:'.feysvg',
  html:(it,c)=>{const d=feyDraw(it,c.live);return '<figure class="body fey">'+(c.live?feyRailHTML():'')+'<svg class="feysvg" viewBox="'+d.vb+'" style="width:'+d.width+'em">'+d.inner+'</svg><div class="feyinfo">'+feyInfoHTML(it)+'</div><figcaption></figcaption></figure>';},
  after(it,el){select(it.id);},
  tools(mk,it,el,page){
    mk('⌕','Search known Standard Model processes and insert a complete connected diagram',b=>feyLibraryOpen(b,it,el,page));
    mk('⟲','Tidy vertices into a readable graph while keeping loops and particle choices',()=>{feyTidy(it);FEY_SEL.delete(it.id);feyMenuClose();feyRepaint(el,it);queueSave(page.id);SND.pop();});
    mk('⇩','Export transparent SVG or PNG, or copy editable TikZ-Feynman LaTeX',b=>feyExportMenu(b,it,el));
    mk('✎','Particle labels and interaction dots',b=>feyProps(b,it,el,page));
    mk('✥','Move the widget about the page',()=>feyMove(el,it,!PLOT_MOVE.has(it.id)));
  },
  wire(el,it,page){
    if(PLOT_MOVE.has(it.id))el.classList.add('mmove');feyRailWire(el,it,page);feyRailSync(el);const fig=el.querySelector('.fey'),svg=el.querySelector('.feysvg');el._feyHov=null;el._feyDrag=false;
    fig.addEventListener('pointerdown',e=>{if(e.button!==0||!e.target.closest('.feysvg')||!el.classList.contains('sel')||PLOT_MOVE.has(it.id))return;e.stopPropagation();e.preventDefault();closeQuickMenu();closeStandardModel();feyGesture(e,svg,el,it,page);});
    fig.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||el._feyDrag||!el.classList.contains('sel')||PLOT_MOVE.has(it.id)||!e.target.closest('.feysvg'))return;el._feyHov=feyPt(svg,e);feyHoverSync(el,it);});
    fig.addEventListener('pointerleave',()=>{el._feyHov=null;if(!el._feyDrag)feyRepaint(el,it);});
  },
  forget(it){FEY_SEL.delete(it.id);PLOT_MOVE.delete(it.id);if(FEY_MENU&&FEY_MENU.it===it)feyMenuClose();if(FEY_EXPORT&&FEY_EXPORT.it===it)feyExportClose();if(FEY_LIBRARY&&FEY_LIBRARY.it===it)feyLibraryClose();},
  css:`
/* ---------- Feynman diagrams ---------- */
.fey{position:relative;display:block;background:none;padding:0;box-shadow:none;font-size:calc(var(--fs,15)*var(--scale)*1px);color:var(--ink)}
.item.sel .fey{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent2) 55%,transparent)}
.feysvg{display:block;height:auto;overflow:visible;touch-action:none;font-family:ui-sans-serif,system-ui,"Helvetica Neue",Arial,sans-serif}
.feysvg .fe{fill:none;stroke:var(--ink);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.feysvg .fe.scalar{stroke-dasharray:16 12}.feysvg .fa{fill:var(--ink)}
.feysvg .faxes path{fill:none;stroke:color-mix(in srgb,var(--ink) 48%,transparent);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.feysvg .faxes text{font-family:ui-serif,Georgia,serif;font-size:26px;font-style:italic;fill:color-mix(in srgb,var(--ink) 58%,transparent);text-anchor:middle;dominant-baseline:central}
.feysvg .fv{fill:var(--ink)}.feysvg .fv.pending{fill:var(--paper);stroke:var(--accent2);stroke-width:4}.feysvg .fv.bad{fill:#e03c28}
.feysvg .fhit{fill:transparent}.feysvg .fl,.feysvg .fm,.feysvg .fp{font-size:42px;font-weight:500;fill:var(--ink);stroke:var(--paper);stroke-width:10;paint-order:stroke;text-anchor:middle;dominant-baseline:central}
.feysvg .fm{font-family:var(--mono);font-size:34px;font-style:italic}.feysvg .fp{font-size:45px}
.feysvg .fsel{fill:color-mix(in srgb,var(--accent2) 14%,transparent);stroke:var(--accent2);stroke-width:3;stroke-dasharray:8 6}
.feysvg .fghost .fplan .fe{stroke:var(--accent2);stroke-dasharray:13 9}.feysvg .fghost .fplan .fa,.feysvg .fghost .fplan .fpreviewv{fill:var(--accent2)}.feysvg .fghost .fplan text{fill:var(--accent2)}
.feysvg .fghost .fplan.bad .fe{stroke:#e03c28}.feysvg .fghost .fplan.bad .fa,.feysvg .fghost .fplan.bad .fpreviewv{fill:#e03c28}.feysvg .fghost .fplan.bad text{fill:#e03c28}
.feysvg .fgone{fill:none;stroke:#e03c28;stroke-width:22;stroke-linecap:round;opacity:.38}.feysvg .fgonev{fill:rgba(224,60,40,.13);stroke:#e03c28;stroke-width:4;stroke-dasharray:9 7}
.feysvg .flasso{fill:color-mix(in srgb,var(--accent2) 7%,transparent);stroke:var(--accent2);stroke-width:3;stroke-dasharray:9 7}
.feyinfo{font-family:var(--mono);font-size:.62em;letter-spacing:.055em;color:var(--soft);padding:.32em 0 0 .2em;min-height:1.1em;white-space:nowrap;cursor:move}.feyinfo .dim{opacity:.58}.feyinfo .fwait{color:var(--accent2)}.feyinfo .fno{color:#e03c28}.feyinfo .fok{color:var(--accent)}
.fey.nono{animation:feyno .34s cubic-bezier(.36,.07,.19,.97)}@keyframes feyno{20%{transform:translateX(-3.5px)}55%{transform:translateX(3px)}80%{transform:translateX(-1.5px)}}
.item.sel[data-type="feynman"] .feysvg{cursor:crosshair}.item.sel[data-type="feynman"] .feysvg.nogo{cursor:not-allowed}.item.mmove[data-type="feynman"] .feysvg{cursor:move}
.feyrail{position:absolute;right:100%;top:0;margin-right:calc(var(--scale)*8px);display:none;flex-direction:column;gap:3px;padding:4px;border-radius:11px;z-index:21}.item.sel .feyrail{display:flex}
.feyrail button{width:calc(var(--scale)*28px);height:calc(var(--scale)*28px);border-radius:7px;color:rgba(233,234,239,.8);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font-family:var(--mono);font-size:calc(var(--scale)*12px);display:grid;place-items:center;transition:background .12s,color .12s,transform .12s}.feyrail button:hover{background:rgba(255,255,255,.11);color:#fff}.feyrail button:active{transform:scale(.94)}.feyrail button.on{background:var(--accent);color:#fff;box-shadow:none}.feyrail button:disabled{opacity:.28}.feyrail button svg{width:62%;height:62%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.feyrail .feypart b{font-size:calc(var(--scale)*12px)}
.smpick{position:fixed;z-index:84;display:none;width:470px;padding:11px;border-radius:16px;color:#e9eaef;font-family:var(--mono);will-change:transform,filter,opacity}.smpick.open{display:block}.smhead{display:grid;grid-template-columns:54px repeat(3,1fr) 1.25fr;gap:4px;padding:0 2px 5px;color:rgba(233,234,239,.48);font-size:8px;letter-spacing:.1em;text-transform:uppercase;text-align:center}.smgrid{display:grid;grid-template-columns:54px repeat(3,1fr) 1.25fr;gap:4px}.smgrid>em{display:flex;align-items:center;justify-content:flex-end;padding-right:7px;color:rgba(233,234,239,.42);font-size:8px;font-style:normal;letter-spacing:.08em;text-transform:uppercase}.smbosons{display:grid;grid-template-columns:1fr 1fr;gap:4px}.smbosons.last{grid-template-columns:1fr}.smc{--pc:#999;position:relative;min-height:51px;border-radius:10px;background:color-mix(in srgb,var(--pc) 17%,rgba(255,255,255,.035));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 32%,transparent);color:#f3f4f7;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:transform .12s,background .12s,box-shadow .12s}.smc:hover,.smc.hot{transform:translateY(-1px);background:color-mix(in srgb,var(--pc) 27%,rgba(255,255,255,.04));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 60%,transparent),0 5px 14px rgba(0,0,0,.2)}.smc b{font-size:16px;line-height:1;color:color-mix(in srgb,var(--pc) 76%,white)}.smc span{font-size:7.5px;margin-top:4px;opacity:.56;text-transform:capitalize}.smc i{position:absolute;left:6px;top:5px;font-size:7px;font-style:normal;opacity:.35}.smfacts{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;min-height:46px;margin-top:7px;padding:4px 8px 0}.smfacts>b{font-size:25px;color:color-mix(in srgb,var(--pc) 76%,white)}.smfacts strong{display:block;font-size:11px;letter-spacing:.04em}.smfacts small{display:block;margin-top:3px;font-size:8.5px;opacity:.52;letter-spacing:.05em}
.feymenu{position:fixed;z-index:83;display:none;gap:3px;padding:4px;border-radius:11px;will-change:transform,filter,opacity}.feymenu.open{display:flex}.feymenu button{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:42px;padding:5px 6px 4px;border-radius:8px;color:rgba(233,234,239,.82);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font-family:var(--mono);font-size:14px;transition:background .12s,color .12s,transform .12s}.feymenu button span{font-size:8.5px;letter-spacing:.07em;opacity:.75}.feymenu button:hover{background:rgba(255,255,255,.11);color:#fff}.feymenu button:active{transform:scale(.96)}.feymenu button.on{background:var(--accent);color:#fff;box-shadow:none}
.feymomentum{position:fixed;z-index:84;display:none;width:230px;padding:10px;border-radius:13px;color:#e9eaef;font-family:var(--mono);will-change:transform,filter,opacity}.feymomentum.open{display:block}.feymomentum label{display:block;font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:rgba(233,234,239,.55)}.feymomentum input{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:7px 9px;border:0;outline:0;border-radius:8px;color:#f1f2f5;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);font-family:var(--mono)}.feymomentum input:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}.feymomentum>div{display:flex;gap:4px;justify-content:flex-end;margin-top:7px}.feymomentum button{padding:5px 7px;border-radius:7px;color:rgba(233,234,239,.76);background:rgba(255,255,255,.05);font-size:8.5px}.feymomentum button:hover{background:var(--accent);color:#fff}
.feylibrary{position:fixed;z-index:84;display:none;width:min(480px,calc(100vw - 16px));padding:9px;border-radius:16px;color:#e9eaef;font-family:var(--mono);will-change:transform,filter,opacity}.feylibrary.open{display:block}.feylibhead{display:flex;align-items:center;gap:9px;padding:1px 1px 8px}.feylibhead label{height:34px;min-width:0;flex:1;display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:10px;background:rgba(255,255,255,.065);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.feylibhead label:focus-within{box-shadow:inset 0 0 0 1.5px var(--accent)}.feylibhead label span{font-size:15px;opacity:.55}.feylibhead input{min-width:0;flex:1;border:0;outline:0;background:none;color:#f4f5f7;font-family:var(--mono);font-size:11px}.feylibhead input::placeholder{color:rgba(233,234,239,.38)}.feylibhead i{font-size:8px;font-style:normal;letter-spacing:.08em;text-transform:uppercase;opacity:.42;white-space:nowrap}.feyliblist{display:grid;gap:4px;max-height:min(390px,55vh);overflow:auto;overscroll-behavior:contain}.feyliblist button{display:grid;grid-template-columns:88px 1fr;align-items:center;min-height:70px;padding:5px 9px 5px 4px;border-radius:11px;color:#eef0f3;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px rgba(255,255,255,.055);text-align:left;transition:background .12s,transform .12s,box-shadow .12s}.feyliblist button:hover,.feyliblist button:focus-visible{outline:none;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}.feyliblist button:active{transform:scale(.985)}.feyliblist svg{width:80px;height:60px;overflow:visible}.feyliblist .fe{fill:none;stroke:rgba(240,242,245,.72);stroke-width:7;stroke-linecap:round;stroke-linejoin:round}.feyliblist .scalar{stroke-dasharray:16 12}.feyliblist .fa,.feyliblist .fv{fill:rgba(240,242,245,.72)}.feyliblist .fhit,.feyliblist .fghost{display:none}.feyliblist button>span{display:block;min-width:0}.feyliblist b,.feyliblist strong,.feyliblist small{display:block}.feyliblist b{font-size:11px;line-height:1.25}.feyliblist strong{margin-top:3px;color:color-mix(in srgb,var(--accent2) 72%,white);font-size:10px;font-weight:560}.feyliblist small{margin-top:3px;font-size:8.5px;line-height:1.25;opacity:.48}.feylibempty{padding:32px 12px;text-align:center;font-size:10px;opacity:.5}.feylibfoot{padding:8px 5px 1px;color:rgba(233,234,239,.42);font-size:8px;letter-spacing:.045em;text-align:center}
.feyexport{position:fixed;z-index:83;display:none;grid-template-columns:repeat(2,minmax(70px,1fr));gap:4px;width:174px;padding:6px;border-radius:12px;font-family:var(--mono);will-change:transform,filter,opacity}.feyexport.open{display:grid}.feyexport button{display:flex;align-items:baseline;justify-content:center;gap:6px;padding:7px 8px;border-radius:8px;color:rgba(233,234,239,.84);background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.065);font-family:var(--mono);transition:background .12s,color .12s,transform .12s}.feyexport button:hover,.feyexport button:focus-visible{background:var(--accent);color:#fff;outline:none}.feyexport button:active{transform:scale(.97)}.feyexport button b{font-size:11px}.feyexport button span{font-size:8px;letter-spacing:.08em;opacity:.65}.feyexport .feytex{grid-column:1/-1}
@media (prefers-reduced-motion:reduce){.feyrail button,.smc,.feymenu button,.feylibrary button,.feyexport button{transition:none}.fey.nono{animation:none}}
@media (prefers-reduced-transparency:reduce){.feyrail,.feylibrary{backdrop-filter:none;background:#25262b}}
`});
defineIcon('feynman','<path d="M3.5 5.5h4.2M16.3 18.5h4.2M7.7 5.5c3.8 0 4.6 3.3 4.6 6.5s.8 6.5 4 6.5"/><path d="M8.2 18.5c2.5-1.2 3.1-3.7 3.1-6.5S10.6 6.8 8 5.5" stroke-dasharray="1.6 2"/>');
defineTool({kind:'feynman',cat:'science',label:'Feynman diagram',icon:'feynman',order:15,hint:'Plot upward-time Standard Model interactions from validated presets or shared vertices, with loops and SVG, PNG or TikZ-Feynman export'});
