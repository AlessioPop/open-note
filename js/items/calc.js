/* Open Note — items/calc.js
   the product card — two cards written out as one multiplication */

/* ================= what a card is worth =================
   Anything that can stand in a product answers with its numbers: a matrix is
   r×c, a vector is a column, and a calc answers with its RESULT — which is
   what lets you keep multiplying with an answer without ever unfolding it. */
function cardFace(it){
  if(it.type === 'matrix'){
    const d = matDims(it);
    return { r: d.r, c: d.c, a: matNums(it), lab: it.lab || 'M' };
  }
  if(it.type === 'vecbox'){
    const v = vecNums(it);
    return { vec: 1, r: v.length, c: 1, a: v, lab: it.lab || 'v', col: it.c, sty: it.s };
  }
  if(it.type === 'calc'){
    const d = calcDims(it), res = calcResult(it);
    if(it.op === 'mv') return { vec: 1, r: d.ar, c: 1, a: res, lab: calcLab(it), col: it.c, sty: it.s };
    return { r: d.ar, c: d.bc, a: res, lab: calcLab(it) };
  }
  return null;
}
const faceSrc = it => it.type === 'calc' ? calcResult(it).map(v => mfmt(v, 4)) : cardSrc(it).slice();
const calcLab = it => (it.al || 'A') + (it.bl || 'B');
const calcDims = it => ({ ar: dimz(it.ar), ac: dimz(it.ac), bc: it.op === 'mm' ? dimz(it.bc) : 1 });
function calcResult(it){
  const d = calcDims(it);
  const fix = (a, len) => {
    a = Array.isArray(a) ? a.map(Number) : [];
    return a.length === len && a.every(Number.isFinite) ? a : new Array(len).fill(0);
  };
  const P = mtxMul(MTX(d.ar, d.ac, fix(it.am, d.ar * d.ac)),
                   MTX(d.ac, d.bc, fix(it.bm, d.ac * d.bc)));
  return P ? P.a : [];
}
function calcSrcOf(it, side){
  const d = calcDims(it), k = side === 'a' ? 'asrc' : 'bsrc';
  const len = side === 'a' ? d.ar * d.ac : d.ac * d.bc;
  if(!Array.isArray(it[k]) || it[k].length !== len){
    const fix = Array.isArray(it[side === 'a' ? 'am' : 'bm']) ? it[side === 'a' ? 'am' : 'bm'] : [];
    it[k] = new Array(len).fill('0').map((_, i) => Number.isFinite(+fix[i]) ? mfmt(+fix[i], 4) : '0');
  }
  return it[k];
}
/* M · v = […] · […] = […] — or, folded, just  Mv = […] */
function calcHTML(it, live){
  const d = calcDims(it);
  const rgrid = gridHTML(calcResult(it).map(v => mfmt(v, 3)), d.ar, d.bc, live, { ro: 1, cls: 'res' });
  const note = '<div class="mtxres">' + esc(it.note || '') + '</div>';
  if(it.fold)
    return '<figure class="body calc fold"><div class="crow">' +
      '<span class="clab">' + esc(calcLab(it)) + '</span><span class="ceq">=</span>' + rgrid +
      '</div>' + note + '</figure>';
  return '<figure class="body calc"><div class="crow">' +
    '<span class="clab">' + esc(it.al || 'M') + ' · ' + esc(it.bl || 'v') + '</span><span class="ceq">=</span>' +
    gridHTML(calcSrcOf(it, 'a'), d.ar, d.ac, live, { side: 'a' }) + '<span class="cdot">·</span>' +
    gridHTML(calcSrcOf(it, 'b'), d.ac, d.bc, live, { side: 'b' }) + '<span class="ceq">=</span>' +
    rgrid + '</div>' + note + '</figure>';
}
/* the working, one cell at a time: the row it comes from and the column it
   meets light up, then the answer drops in */
function calcRun(el, it){
  const rc = [...el.querySelectorAll('.mtxgrid.res .mcell')];
  if(!rc.length) return;
  const cols = calcDims(it).bc;
  const res = calcResult(it);
  const tick = rc.length > 16 ? 110 : 250;
  const cool = () => el.querySelectorAll('.mcell.hot').forEach(n => n.classList.remove('hot'));
  rc.forEach(c => { c.textContent = ''; c.classList.remove('pop'); });
  let k = 0;
  const step = () => {
    if(!el.isConnected) return cool();
    cool();
    if(k >= rc.length) return;
    const i = Math.floor(k / cols), j = k % cols;
    el.querySelectorAll('.mcell[data-s="a"][data-r="' + i + '"]').forEach(n => n.classList.add('hot'));
    el.querySelectorAll('.mcell[data-s="b"][data-c="' + j + '"]').forEach(n => n.classList.add('hot'));
    rc[k].textContent = mfmt(res[k], 3);
    rc[k].classList.add('pop');
    SND.tick();
    k++;
    setTimeout(step, tick);
  };
  step();
}
function calcRead(el, it, page){
  ['a', 'b'].forEach(side => {
    const src = calcSrcOf(it, side);
    const nums = src.map((s, i) => {
      const arr = side === 'a' ? it.am : it.bm;
      return Array.isArray(arr) && Number.isFinite(+arr[i]) ? +arr[i] : 0;
    });
    el.querySelectorAll('.mcell[data-s="' + side + '"]').forEach(c => {
      const i = +c.dataset.i, r = mxNum(c.value);
      src[i] = c.value;
      c.classList.toggle('bad', !!r.err);
      c.title = r.err || '';
      if(!r.err) nums[i] = r.v;
    });
    if(side === 'a') it.am = nums; else it.bm = nums;
  });
  const res = calcResult(it);
  el.querySelectorAll('.mtxgrid.res .mcell').forEach((c, i) => { c.textContent = mfmt(res[i], 3); });
  queueSave(page.id);
}
function wireCalcCells(el, it, page){
  const cells = [...el.querySelectorAll('input.mcell')];
  cells.forEach((c, i) => {
    c.addEventListener('pointerdown', e => e.stopPropagation());
    c.addEventListener('dblclick', e => e.stopPropagation());
    c.addEventListener('focus', () => c.select());
    c.addEventListener('input', () => calcRead(el, it, page));
    c.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); (cells[i + 1] || c).focus(); }
      if(e.key === 'Escape'){ e.preventDefault(); c.blur(); }
    });
  });
}
function wireCalc(el, it, page){
  wireCalcCells(el, it, page);
  /* a calc — folded or not — can be the other card in a product */
  el.addEventListener('pointerdown', e => {
    if(!mathAim || mathAim.kind !== 'mul' || mathAim.from === it.id) return;
    e.stopPropagation(); e.preventDefault();
    const src = findItem(mathAim.from);
    mathAim = null; syncMathBar();
    if(src) makeProduct(page, src.it, it);
  }, true);
}
function calcAct(a, it, page, el){
  const d = calcDims(it);
  if(a === 'run') return calcRun(el, it);
  if(a === 'fold'){
    it.fold = it.fold ? 0 : 1;
    el.querySelector('figure').outerHTML = calcHTML(it, true);
    wireCalcCells(el, it, page);
    queueSave(page.id); SND.tick();
    return;
  }
  if(a === 'out'){
    const r = calcResult(it);
    if(it.op === 'mm') return matNew(page, it, r, calcLab(it), { r: d.ar, c: d.bc });
    return cardNew(page, it, 'vecbox', r, calcLab(it), { c: it.c || MATH_COLORS[1], s: it.s || 'solid' });
  }
  if(a === 'plot' && it.op === 'mv'){
    const r = calcResult(it);
    if(r.length !== 2) return;
    return startAim({ v: r, lab: calcLab(it), c: it.c, s: it.s }, page, 'draw');
  }
  if(a === 'mul'){
    mathAim = { kind: 'mul', from: it.id, lab: calcLab(it) };
    setMath(true);
    mathHint('click the card to multiply ' + calcLab(it) + ' by — or drag this onto it');
  }
  if(a === 'split') return calcSplit(page, it);
}
/* ✂ — undo the merge: the two cards come back, side by side, exactly as they
   were written into the product */
function calcSplit(page, it){
  const d = calcDims(it);
  const mk = (dx, extra) => Object.assign({ id: uid(),
    x: clamp(nz(it.x, 20) + dx, 2, 84), y: nz(it.y, 20),
    rot: it.rot || 0, z: maxZ(page) + 1, lay: it.lay || curLayerId(),
    fs: it.fs || 22, res: null }, extra);
  const across = 6 + d.ac * 4;
  const A = mk(0, { type: 'matrix', lab: it.al || 'M', r: d.ar, c: d.ac,
    m: calcSrcOf(it, 'a').map((s, i) => Number.isFinite(+(it.am || [])[i]) ? +it.am[i] : 0),
    src: calcSrcOf(it, 'a').slice() });
  const B = it.op === 'mm'
    ? mk(across, { type: 'matrix', lab: it.bl || 'N', r: d.ac, c: d.bc,
        m: calcSrcOf(it, 'b').map((s, i) => Number.isFinite(+(it.bm || [])[i]) ? +it.bm[i] : 0),
        src: calcSrcOf(it, 'b').slice() })
    : mk(across, { type: 'vecbox', lab: it.bl || 'v', n: d.ac,
        v: calcSrcOf(it, 'b').map((s, i) => Number.isFinite(+(it.bm || [])[i]) ? +it.bm[i] : 0),
        src: calcSrcOf(it, 'b').slice(),
        c: it.c || MATH_COLORS[1], s: it.s || 'solid' });
  page.items = page.items.filter(x => x !== it);
  page.items.push(A, B);
  queueSave(page.id); SND.pluck();
  render().then(() => select(A.id));
}
/* which way round two cards multiply — and whether their sizes let them */
function productOf(a, b){
  const A = cardFace(a), B = cardFace(b);
  if(!A || !B || (A.vec && B.vec)) return null;
  if(A.vec || B.vec){
    const M = A.vec ? b : a, V = A.vec ? a : b;
    return cardFace(M).c === cardFace(V).r ? { op: 'mv', A: M, B: V } : null;
  }
  if(A.c === B.r) return { op: 'mm', A: a, B: b };   /* the one in your hand acts from the left… */
  if(B.c === A.r) return { op: 'mm', A: b, B: a };   /* …unless only the other order fits */
  return null;
}
/* two cards put together: the one in your hand acts on the one on the page */
function makeProduct(page, drag, target){
  const p = productOf(drag, target);
  if(!p){
    const A = cardFace(drag), B = cardFace(target);
    if(A && B){
      setMath(true);
      mathHint(A.vec && B.vec
        ? 'two vectors make no product here — drop one on a matrix instead'
        : 'those sizes do not fit — ' + A.r + '×' + A.c + ' and ' + B.r + '×' + B.c + ' have no product');
    }
    return false;
  }
  const A = cardFace(p.A), B = cardFace(p.B);
  const fs = Math.min(target.fs || p.A.fs || 22, 18);
  const wide = (p.op === 'mm' ? 62 : 46) * fs / 22;  /* roughly how much paper it wants */
  const it = { id: uid(), type: 'calc', op: p.op,
    x: clamp(nz(target.x, 20) - 6, 2, Math.max(2, 96 - wide)), y: nz(target.y, 20), rot: 0,
    z: maxZ(page) + 1, lay: target.lay || curLayerId(), fs: fs,
    ar: A.r, ac: A.c, bc: B.c,
    al: A.lab, am: A.a.slice(), asrc: faceSrc(p.A),
    bl: B.lab, bm: B.a.slice(), bsrc: faceSrc(p.B),
    c: B.col || MATH_COLORS[1], s: B.sty || 'solid', fold: 0, note: '' };
  page.items = page.items.filter(x => x !== drag && x !== target);
  page.items.push(it);
  queueSave(page.id); SND.plop();
  render().then(() => {
    select(it.id);
    const el = document.querySelector('#pageHost .item[data-id="' + it.id + '"]');
    if(el) calcRun(el, it);
  });
  return true;
}

/* A calc is never added from the menu — it appears when two cards are dropped
   on each other, which is why it registers no `add`. */
defineItem('calc', {
  autoWidth: true, sizeable: true,
  html: (it, c) => calcHTML(it, c.live),
  tools(mk, it, el, page){
    mk('↻', 'Do the working again', () => calcAct('run', it, page, el));
    mk(it.fold ? '⊞' : '⊟', it.fold ? 'Open the working back up' : 'Fold it down to just the answer', b => {
      calcAct('fold', it, page, el);
      b.textContent = it.fold ? '⊞' : '⊟';
      b.title = it.fold ? 'Open the working back up' : 'Fold it down to just the answer';
    });
    mk('×', 'Multiply the answer by another card', () => calcAct('mul', it, page, el));
    mk('⇥', 'Put the answer on the page as its own card', () => calcAct('out', it, page, el));
    if(it.op === 'mv' && calcDims(it).ar === 2)
      mk('⊕', 'Draw the answer in a coordinate system', () => calcAct('plot', it, page, el));
    mk('✂', 'Take it apart — the two cards come back', () => calcAct('split', it, page, el));
  },
  wire(el, it, page){ wireCalc(el, it, page); }
});

/* ---- how it looks ---- */
addCSS('calc', `
/* M · v = […]·[…] = […] — the working, written out (or folded to its answer) */
.calc{display:inline-flex;flex-direction:column;gap:.2em;padding:.4em .55em;
  font-family:var(--mono);font-size:calc(var(--fs,22)*var(--scale)*1px);line-height:1.2;color:var(--ink)}
.crow{display:flex;align-items:center;gap:.3em;flex-wrap:nowrap}
.clab{font-weight:500;white-space:nowrap}
.ceq,.cdot{opacity:.55;padding:0 .05em}
.calc .mcell{width:2.7em}
.calc .mtxgrid.res .mcell{color:var(--accent2);font-weight:500}
.calc .mcell.hot{background:color-mix(in srgb,var(--accent) 24%,transparent);border-radius:2px}
.calc .mtxgrid.res .mbr{border-color:var(--accent2)}
.mcell.pop{animation:mpop .34s ease-out}
@keyframes mpop{from{transform:scale(.55);opacity:.2}to{transform:scale(1);opacity:1}}
`);
