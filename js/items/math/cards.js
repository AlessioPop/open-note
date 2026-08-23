/* Open Note — items/cards.js
   the matrix and vector cards — any size, quiet until touched */

/* ================= the cards =================
   Numbers between brackets, kept twice over: what was typed (so 1/2 stays 1/2)
   and what it came to. A card can be any size — it.r × it.c for a matrix, it.n
   deep for a vector — and older books that never heard of sizes read as 2×2,
   which is what they are. (A matrix spends .r/.c on its shape; a vector's .c is
   its COLOUR and its depth is .n — that clash is old and it stays.) */
const MAT_MAX = 8;
const dimz = v => clamp(Math.round(nz(v, 2)), 1, MAT_MAX);
function matDims(it){ return { r: dimz(it.r), c: dimz(it.c) }; }
function matNums(it){
  const d = matDims(it), m = Array.isArray(it.m) ? it.m.map(Number) : [];
  return m.length === d.r * d.c && m.every(Number.isFinite) ? m : mtxIdent(d.r, d.c);
}
function vecDim(it){
  return clamp(Math.round(nz(it.n, Array.isArray(it.v) ? it.v.length : 2)), 2, MAT_MAX);
}
function vecNums(it){
  const n = vecDim(it), v = Array.isArray(it.v) ? it.v.map(Number) : [];
  return v.length === n && v.every(Number.isFinite) ? v : new Array(n).fill(1);
}
const cardNums = it => it.type === 'vecbox' ? vecNums(it) : matNums(it);
function cardSrc(it){
  const nums = cardNums(it);
  if(!Array.isArray(it.src) || it.src.length !== nums.length) it.src = nums.map(v => mfmt(v, 4));
  return it.src;
}

/* ---- the little language of labels ----
   M⁻¹ undone is M again, Mᵀᵀ is nobody's notation, and squaring M³ had better
   say M⁶. The label walks with the numbers. */
const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUBD = '₀₁₂₃₄₅₆₇₈₉';
const supN = n => (n < 0 ? '⁻' : '') + String(Math.abs(n)).replace(/\d/g, d => SUPD[+d]);
const subN = n => String(n).replace(/\d/g, d => SUBD[+d]);
const labPowOf = lab => {                 /* a trailing power, if the label wears one */
  const m = /(⁻?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/.exec(lab);
  if(!m) return null;
  let k = 0;
  for(const ch of m[2]) k = k * 10 + SUPD.indexOf(ch);
  return { base: lab.slice(0, lab.length - m[0].length), k: m[1] ? -k : k };
};
const labWear = (base, k) => k === 1 ? base : base + supN(k);
function labInv(lab){
  const p = labPowOf(lab);
  return p ? labWear(p.base, -p.k) : lab + '⁻¹';
}
const labT = lab => /ᵀ$/.test(lab) ? lab.slice(0, -1) : lab + 'ᵀ';
function labPow(lab, n){
  const p = labPowOf(lab);
  return p ? labWear(p.base, p.k * n) : lab + supN(n);
}

/* one bracketed block — R rows of C columns, the brackets spanning the rows */
function gridHTML(src, R, C, live, o){
  o = o || {};
  const side = o.side ? ' data-s="' + o.side + '"' : '';
  let out = '<span class="mtxgrid' + (o.cls ? ' ' + o.cls : '') + (o.bars ? ' det' : '') + '">' +
    '<b class="mbr l" style="grid-row:1/' + (R + 1) + ';grid-column:1"></b>';
  for(let i = 0; i < R * C; i++){
    const r = Math.floor(i / C), c = i % C;
    const rc = ' data-i="' + i + '" data-r="' + r + '" data-c="' + c + '"' + side +
      ' style="grid-row:' + (r + 1) + ';grid-column:' + (c + 2) + '"';
    const v = src[i] == null ? '' : src[i];
    out += live && !o.ro
      ? '<input class="mcell"' + rc + ' value="' + esc(v) + '" spellcheck="false">'
      : '<span class="mcell"' + rc + '>' + esc(v) + '</span>';
  }
  return out + '<b class="mbr r" style="grid-row:1/' + (R + 1) + ';grid-column:' + (C + 2) + '"></b></span>';
}
function cardLab(it, live){
  const dot = it.type === 'vecbox'
    ? '<i class="vdot" style="background:' + esc(it.c || MATH_COLORS[1]) + '"></i>' : '';
  return '<span class="mtxlab"' + (live ? ' contenteditable="true" spellcheck="false"' : '') + '>' +
    dot + esc(it.lab == null ? 'M' : it.lab) + '</span>';
}
/* what the card found out, written under it. A determinant comes back between
   tall bars the way it is written; eigenvalues each bring their eigenvector;
   older books saved plain sentences and those still read. */
function resHTML(it){
  const R = it.res;
  if(!R) return '';
  if(typeof R === 'string') return '<span class="rrow">' + esc(R) + '</span>';
  if(R.k === 'det')
    return '<span class="rrow">' + gridHTML(R.src, R.r, R.c, false, { bars: 1 }) +
      '<i>=</i><b>' + esc(R.v) + '</b></span>';
  if(R.k === 'eig')
    return R.ps.map(p => '<span class="rrow">' + esc(p.lt) +
      (p.v ? '<i class="rgap"></i>' + esc(p.vt) + '<i>=</i>' + gridHTML(p.v, p.v.length, 1, false, {}) : '') +
      '</span>').join('');
  return '';
}
function matrixHTML(it, live){
  const d = it.type === 'vecbox' ? { r: vecDim(it), c: 1 } : matDims(it);
  return '<figure class="body mtx"><div class="mtxrow">' + cardLab(it, live) +
    '<span class="mtxeq">=</span>' + gridHTML(cardSrc(it), d.r, d.c, live) +
    '</div><div class="mtxres">' + resHTML(it) + '</div></figure>';
}
function cardRead(el, it, page){
  const src = cardSrc(it), nums = cardNums(it).slice();
  el.querySelectorAll('input.mcell').forEach(c => {
    const i = +c.dataset.i, r = mxNum(c.value);
    src[i] = c.value;
    c.classList.toggle('bad', !!r.err);
    c.title = r.err || '';
    if(!r.err) nums[i] = r.v;
  });
  if(it.type === 'vecbox') it.v = nums; else it.m = nums;
  if(it.res){ it.res = null; el.querySelector('.mtxres').innerHTML = ''; }
  queueSave(page.id);
}
/* the wiring that has to be redone whenever the figure is redrawn */
function wireCells(el, it, page){
  const cells = [...el.querySelectorAll('input.mcell')];
  cells.forEach((c, i) => {
    c.addEventListener('pointerdown', e => e.stopPropagation());
    c.addEventListener('dblclick', e => e.stopPropagation());
    c.addEventListener('focus', () => c.select());
    c.addEventListener('input', () => cardRead(el, it, page));
    c.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); (cells[i + 1] || c).focus(); }
      if(e.key === 'Escape'){ e.preventDefault(); c.blur(); }
    });
  });
  const lab = el.querySelector('.mtxlab');
  if(lab && lab.isContentEditable){
    lab.addEventListener('pointerdown', e => e.stopPropagation());
    lab.addEventListener('dblclick', e => e.stopPropagation());
    lab.addEventListener('input', () => { it.lab = lab.textContent.trim().slice(0, 6); queueSave(page.id); });
  }
}
function wireCard(el, it, page){
  wireCells(el, it, page);
  /* a card can be pointed at by another one that is looking for a partner */
  el.addEventListener('pointerdown', e => {
    if(!mathAim || mathAim.kind !== 'mul' || mathAim.from === it.id) return;
    e.stopPropagation(); e.preventDefault();
    const src = findItem(mathAim.from);
    mathAim = null; syncMathState();
    if(src) makeProduct(page, src.it, it);
  }, true);
}
/* size or result changed shape: redraw the figure, keep the item, its toolbar
   and whatever panel is anchored to it exactly where they are */
function repaintCard(el, it, page){
  el.querySelector('figure').outerHTML = matrixHTML(it, true);
  wireCells(el, it, page);
}
/* growing keeps every number it can; fresh ground is 0 with 1s down the new
   diagonal, so an identity grows into a bigger identity */
function matResize(it, R2, C2){
  const d = matDims(it), src = cardSrc(it), nums = matNums(it);
  const s2 = [], n2 = [];
  for(let i = 0; i < R2; i++) for(let j = 0; j < C2; j++){
    if(i < d.r && j < d.c){ s2.push(src[i * d.c + j]); n2.push(nums[i * d.c + j]); }
    else { s2.push(i === j ? '1' : '0'); n2.push(i === j ? 1 : 0); }
  }
  it.r = R2; it.c = C2; it.m = n2; it.src = s2; it.res = null;
}
function vecResize(it, n){
  const src = cardSrc(it), v = vecNums(it);
  it.n = n;
  it.v = new Array(n).fill(0).map((_, i) => i < v.length ? v[i] : 0);
  it.src = new Array(n).fill('0').map((_, i) => i < src.length ? src[i] : '0');
  it.res = null;
}
/* the ✎ panel — the same glass the shapes measure themselves in */
function openCardProps(btn, it, el, page){
  const vec = it.type === 'vecbox';
  let pw = 2;
  const rows = vec ? [
    { t: 'steps', label: 'Rows', min: 2, max: MAT_MAX,
      get: () => vecDim(it), set: v => vecResize(it, v) }
  ] : [
    { t: 'steps', label: 'Rows', min: 1, max: MAT_MAX,
      get: () => matDims(it).r, set: v => matResize(it, v, matDims(it).c) },
    { t: 'steps', label: 'Columns', min: 1, max: MAT_MAX,
      get: () => matDims(it).c, set: v => matResize(it, matDims(it).r, v) },
    { t: 'steps', label: 'Power', min: 2, max: 9, get: () => pw, set: v => { pw = v; } },
    { t: 'btn', label: '', text: () => labPow(it.lab || 'M', pw) + ' on the page',
      hint: 'A new card: this one multiplied into itself',
      act(){ matAct('pow', it, page, el, pw); } }
  ];
  openProps(btn, {
    title: vec ? 'Vector' : 'Matrix',
    rows,
    onchange(){ repaintCard(el, it, page); },
    onsave(){ queueSave(page.id); },
    onreset(){
      if(vec) vecResize(it, 2); else matResize(it, 2, 2);
      repaintCard(el, it, page); queueSave(page.id);
    }
  });
}
function cardNew(page, from, kind, nums, lab, extra){
  const it = Object.assign({ id: uid(), type: kind,
    x: clamp(nz(from.x, 20) + 17, 2, 80), y: clamp(nz(from.y, 20) + 2, 2, 88),
    rot: 0, z: maxZ(page) + 1, lay: from.lay || curLayerId(), fs: from.fs || 22,
    lab: lab, src: nums.map(v => mfmt(v, 4)), res: null }, extra || {});
  if(kind === 'vecbox'){ it.v = nums.slice(); it.n = nums.length; }
  else it.m = nums.slice();
  page.items.push(it); queueSave(page.id); SND.plop();
  render().then(() => select(it.id));
  return it;
}
const matNew = (page, from, m, lab, d) => cardNew(page, from, 'matrix', m, lab, { r: d.r, c: d.c });

/* the eigen rows, formatted once and kept: each real λ with its vector, a
   conjugate pair folded into one a ± bi line */
function eigRes(M){
  const E = mtxEig(M), ps = [], used = new Array(E.vals.length).fill(0);
  let k = 1;
  for(let i = 0; i < E.vals.length; i++){
    if(used[i]) continue;
    const v = E.vals[i], tol = 1e-6 * (1 + Math.abs(v.re) + Math.abs(v.im));
    if(Math.abs(v.im) < 1e-9){
      ps.push({ lt: 'λ' + subN(k) + ' = ' + mfmt(v.re, 3), vt: 'v' + subN(k),
                v: v.vec ? v.vec.map(x => mfmt(x, 3)) : null });
      k++;
    } else {
      const j = E.vals.findIndex((w, wi) => wi > i && !used[wi] &&
        Math.abs(w.re - v.re) < tol && Math.abs(w.im + v.im) < tol);
      if(j >= 0) used[j] = 1;
      ps.push({ lt: 'λ' + subN(k) + (j >= 0 ? ',' + subN(k + 1) : '') + ' = ' +
        mfmt(v.re, 3) + ' ± ' + mfmt(Math.abs(v.im), 3) + 'i', v: null });
      k += j >= 0 ? 2 : 1;
    }
  }
  return { k: 'eig', ps };
}
function matAct(a, it, page, el, x){
  const d = matDims(it), M = MTX(d.r, d.c, matNums(it)), sq = d.r === d.c;
  const say = res => {
    it.res = res;
    el.querySelector('.mtxres').innerHTML = resHTML(it);
    queueSave(page.id);
  };
  if(a === 'det'){
    if(!sq) return say('only a square matrix has a determinant');
    return say({ k: 'det', v: mfmt(mtxDet(M), 4), src: cardSrc(it).slice(), r: d.r, c: d.c });
  }
  if(a === 'eig'){
    if(!sq) return say('only a square matrix has eigenvalues');
    return say(eigRes(M));
  }
  if(a === 'inv'){
    if(!sq) return say('only a square matrix can have an inverse');
    const I = mtxInv(M);
    if(!I) return say('det = 0 — no inverse');
    return matNew(page, it, I.a, labInv(it.lab || 'M'), d);
  }
  if(a === 'tr'){
    const T = mtxT(M);
    return matNew(page, it, T.a, labT(it.lab || 'M'), T);
  }
  if(a === 'pow'){
    if(!sq) return say('only a square matrix can be raised to a power');
    return matNew(page, it, mtxPow(M, x).a, labPow(it.lab || 'M', x), d);
  }
  if(a === 'id'){
    it.m = mtxIdent(d.r, d.c); it.src = it.m.map(String); it.res = null;
    repaintCard(el, it, page);
    return queueSave(page.id);
  }
  if(a === 'apply'){
    if(!sq || d.r !== 2) return say('only a 2×2 can act on a plane');
    return startAim(it, page, 'vec');
  }
  if(a === 'basis'){
    if(!sq || d.r !== 2) return say('only a 2×2 can be a basis of a plane');
    return startAim(it, page, 'basis');
  }
  if(a === 'mul'){
    mathAim = { kind: 'mul', from: it.id, lab: it.lab || 'M' };
    syncMathState();
    mathHint('click the matrix or vector to multiply — or just drag one onto the other');
  }
}

/* ---- the vector card ---- */
function vecAct(a, it, page, el){
  const v = vecNums(it);
  const say = t => {
    it.res = t;
    el.querySelector('.mtxres').innerHTML = resHTML(it);
    queueSave(page.id);
  };
  if(a === 'color'){
    it.c = MATH_COLORS[(MATH_COLORS.indexOf(it.c) + 1) % MATH_COLORS.length];
    el.querySelector('.vdot').style.background = it.c;
    return queueSave(page.id);
  }
  if(a === 'len') return say('|' + (it.lab || 'v') + '| = ' + mfmt(Math.hypot.apply(null, v), 4));
  if(a === 'plot'){
    if(v.length !== 2) return say('only a 2-vector fits a plane');
    return startAim(it, page, 'draw');
  }
  if(a === 'mul'){
    mathAim = { kind: 'mul', from: it.id, lab: it.lab || 'v' };
    syncMathState();
    mathHint('click the matrix to multiply it by — or drag one onto the other');
  }
}
/* the card's vector, drawn in a coordinate system */
function plotAddVec(f, box){
  const bv = Array.isArray(box.v) ? box.v : [1, 1];
  if(bv.length !== 2){ mathHint('only a 2-vector can be drawn in a plane'); return null; }
  const v = { id: uid(), ox: 0, oy: 0, x: bv[0], y: bv[1],
    c: box.c || MATH_COLORS[1], s: box.s || 'solid', lab: box.lab || nextName(f.it) };
  vecsOf(f.it).push(v);
  queueSave(f.page.id); SND.plop();
  select(f.it.id); selectMath(f.it.id, 'vec', v.id);
  return v;
}

/* The cards share their markup and their wiring; each is as wide as the
   numbers in it, which is why none of them uses it.w. */
defineItem('matrix', {
  add: { matrix: base => ({ ...base, type: 'matrix', w: 16, rot: 0, fs: 22, r: 2, c: 2,
                            lab: 'M', m: [1, 0, 0, 1], src: ['1', '0', '0', '1'], res: null }) },
  autoWidth: true, sizeable: true,
  html: (it, c) => matrixHTML(it, c.live),
  after: (it, el) => { const c = el && el.querySelector('input.mcell'); if(c) c.focus(); },
  tools(mk, it, el, page){
    mk('✎', 'Its size — rows, columns — and its powers', b => openCardProps(b, it, el, page));
    mk('⊙', 'Apply this to a vector', () => matAct('apply', it, page, el));
    mk('⊞', 'Make this the basis of a coordinate system', () => matAct('basis', it, page, el));
    mk('×', 'Multiply it by another matrix or vector', () => matAct('mul', it, page, el));
    mk('det', 'Determinant, written between bars', () => matAct('det', it, page, el));
    mk('M⁻¹', 'Its inverse, as a new matrix', () => matAct('inv', it, page, el));
    mk('Mᵀ', 'Its transpose, as a new matrix', () => matAct('tr', it, page, el));
    mk('λ', 'Eigenvalues, with their eigenvectors', () => matAct('eig', it, page, el));
    mk('I', 'Back to the identity', () => matAct('id', it, page, el));
  },
  wire(el, it, page){ wireCard(el, it, page); }
});

defineItem('vecbox', {
  add: { vecbox: base => ({ ...base, type: 'vecbox', w: 12, rot: 0, fs: 22, n: 2,
                            lab: 'v', v: [2, 1], src: ['2', '1'], c: MATH_COLORS[1], s: 'solid', res: null }) },
  autoWidth: true, sizeable: true,
  html: (it, c) => matrixHTML(it, c.live),
  after: (it, el) => { const c = el && el.querySelector('input.mcell'); if(c) c.focus(); },
  tools(mk, it, el, page){
    mk('✎', 'How deep it is', b => openCardProps(b, it, el, page));
    mk('⊕', 'Draw it in a coordinate system', () => vecAct('plot', it, page, el));
    mk('×', 'Multiply it by a matrix', () => vecAct('mul', it, page, el));
    mk('◑', 'Its colour', () => vecAct('color', it, page, el));
    mk('|v|', 'How long it is', () => vecAct('len', it, page, el));
  },
  wire(el, it, page){ wireCard(el, it, page); }
});

/* ---- how it looks ---- */
addCSS('cards', `
/* numbers between brackets. The card itself is quiet — no paper, no shadow —
   until it is picked: clicked, mid-drag, or about to be landed on. */
.mtx{display:inline-flex;flex-direction:column;gap:.2em;padding:.4em .5em;
  font-family:var(--mono);font-size:calc(var(--fs,22)*var(--scale)*1px);line-height:1.2;color:var(--ink)}
.item[data-type="matrix"] .mtx,.item[data-type="vecbox"] .mtx,.item[data-type="calc"] .calc{
  background:transparent;box-shadow:none;transition:background-color .16s ease,box-shadow .16s ease}
.item.sel .mtx,.item.dragging .mtx,.item.dropinto .mtx,
.item.sel .calc,.item.dragging .calc,.item.dropinto .calc{
  background:color-mix(in srgb,var(--paper) 86%,transparent);
  box-shadow:0 0 0 1px var(--accent2),0 8px 18px rgba(0,0,0,.28)}
.mtxrow{display:flex;align-items:center;gap:.32em}
.mtxlab{font-weight:500;min-width:1ch;outline:none;border-bottom:1px dotted transparent}
.mtxlab:hover,.mtxlab:focus{border-bottom-color:var(--soft)}
.mtxlab .vdot{display:inline-block;width:.5em;height:.5em;border-radius:50%;margin-right:.3em;vertical-align:.05em}
.mtxeq{opacity:.55}
.mtxgrid{display:inline-grid;align-items:center;column-gap:.2em;row-gap:.05em}
.mbr{width:.28em;align-self:stretch;margin:0 .1em;border:.085em solid var(--ink)}
.mbr.l{border-right:0}
.mbr.r{border-left:0}
/* a determinant's straight bars: the same brackets with their feet cut off */
.mtxgrid.det .mbr.l,.mtxgrid.det .mbr.r{border-top:0;border-bottom:0}
.mcell{display:block;font:inherit;color:inherit;width:3em;text-align:center;padding:.06em 0;
  background:none;border:0;border-bottom:1px dotted transparent;outline:none}
input.mcell:hover,input.mcell:focus{border-bottom-color:var(--accent2)}
.mcell.bad{color:var(--accent);border-bottom-color:var(--accent)}
/* what the card found out, written under it */
.mtxres{display:flex;flex-direction:column;align-items:flex-start;gap:.14em;
  font-size:.66em;letter-spacing:.05em;color:var(--accent2)}
.mtxres:empty{display:none}
.mtxres .rrow{display:flex;align-items:center;gap:.3em;white-space:nowrap}
.mtxres i{font-style:normal;opacity:.6}
.mtxres .rgap{width:.4em}
.mtxres b{font-weight:500}
.mtxres .mcell{width:auto;min-width:1.5em;padding:.02em .22em}
.mtxres .mbr{border-color:var(--accent2)}
`);
/* their tiles in the palette */
defineTool({ kind: 'matrix', cat: 'math', label: 'Matrix', icon: 'matrix', order: 40,
  hint: 'A matrix of any size — ✎ reshapes it; drop it on another card to multiply' });
defineTool({ kind: 'vecbox', cat: 'math', label: 'Vector', icon: 'vector', order: 42,
  hint: 'A vector card — ✎ sets its depth; drag it into a coordinate system to draw it' });
