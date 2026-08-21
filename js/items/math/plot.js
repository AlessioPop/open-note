/* Open Note — items/plot.js
   the coordinate system — axes, functions, vectors */

/* ================= maths =================
   A coordinate system is an item like any other: it carries its own window on
   the plane, the functions and vectors drawn in it, and the basis it draws them
   in. Matrices are items too — point one at a vector to transform it, or hand
   it to a plot to become its basis. It is all numbers and SVG, so a plot
   travels in a backup and comes out in print, the overview and an exported
   book with no library to load and nothing to carry. */
const MATH_COLORS = ['#cf3a24', '#2b7d8c', '#e0a02c', '#4f7a34', '#8c4bb0', '#20242a'];
const MATH_STYLES = ['solid', 'dashed', 'dotted'];
const MDASH = { solid: '', dashed: '15 11', dotted: '0.1 13' };
const VEC_NAMES = ['v', 'w', 'u', 'a', 'b', 'c'];
const PLOT_W = 1000;                               // the picture is 1000 wide, like the ink
let MSEQ = 0;                                      // unique clip ids across every render
let mathMode = false;                              // the math bar is out and plots take the mouse
let mathTool = 'pan';                              // 'vec' while a vector is being pulled out
let mathSel = null;                                // {pid, kind:'fn'|'vec', id} — what the chip is on
let mathAim = null;                                // a matrix looking for something to act on
let hintT = 0;
const nz = (v, d) => Number.isFinite(+v) ? +v : d;
const near0 = v => Math.abs(v) < 1e-9 ? 0 : v;

/* a number the way a person would write it */
function mfmt(v, dp){
  if(!Number.isFinite(v)) return '—';
  let s = (+v).toFixed(dp == null ? 3 : dp);
  if(s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

/* ---- a hand-written expression compiler ----
   "3sin(2x)/x" becomes a function of x. Nothing is ever eval'd, and a typo
   comes back as a sentence rather than an exception. */
const MX_FN = {
  sin:Math.sin, cos:Math.cos, tan:Math.tan, asin:Math.asin, acos:Math.acos, atan:Math.atan,
  sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh, sqrt:Math.sqrt, cbrt:Math.cbrt,
  abs:Math.abs, exp:Math.exp, ln:Math.log, log:Math.log10, log2:Math.log2, log10:Math.log10,
  floor:Math.floor, ceil:Math.ceil, round:Math.round, sign:Math.sign, sgn:Math.sign,
  min:Math.min, max:Math.max, hypot:Math.hypot, atan2:Math.atan2, pow:Math.pow,
  mod:(a, b) => ((a % b) + b) % b
};
const MX_CONST = { pi:Math.PI, tau:Math.PI * 2, e:Math.E, phi:(1 + Math.sqrt(5)) / 2 };
const MX_SIGNS = { '−':'-', '–':'-', '—':'-', '·':'*', '×':'*', '∗':'*', '÷':'/', '⁄':'/' };

function mxCompile(src){
  const S = String(src == null ? '' : src);
  const ts = [];
  try{
    for(let i = 0; i < S.length;){
      const c = S[i];
      if(c === ' ' || c === '\t'){ i++; continue; }
      if((c >= '0' && c <= '9') || c === '.'){
        const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(S.slice(i));
        if(!m) throw '"' + S.slice(i, i + 4) + '" is not a number I can read';
        ts.push({ t:'num', v:parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if(/[a-zA-Z]/.test(c)){
        const m = /^[a-zA-Z][a-zA-Z0-9]*/.exec(S.slice(i));
        ts.push({ t:'name', v:m[0] }); i += m[0].length; continue;
      }
      const k = MX_SIGNS[c] || c;
      if('+-*/^%(),|'.indexOf(k) >= 0){ ts.push({ t:k }); i++; continue; }
      throw '"' + c + '" is not something I can read';
    }
  }catch(err){ return { fn:null, err:String(err), usesX:false }; }
  ts.push({ t:'end' });

  let p = 0, usesX = false, bars = 0;
  const at = () => ts[p].t;
  const eat = t => at() === t ? (p++, true) : false;
  /* what can start an atom — a "|" only when there isn't one open already,
     so the closing bar of |x| isn't read as the start of another one */
  const opens = () => at() === 'num' || at() === 'name' || at() === '(' || (at() === '|' && !bars);

  function expr(){
    let v = term();
    for(;;){
      if(eat('+')){ const a = v, b = term(); v = x => a(x) + b(x); }
      else if(eat('-')){ const a = v, b = term(); v = x => a(x) - b(x); }
      else return v;
    }
  }
  function term(){
    let v = unary();
    for(;;){
      if(eat('*')){ const a = v, b = unary(); v = x => a(x) * b(x); }
      else if(eat('/')){ const a = v, b = unary(); v = x => a(x) / b(x); }
      else if(eat('%')){ const a = v, b = unary(); v = x => a(x) % b(x); }
      else if(opens()){ const a = v, b = unary(); v = x => a(x) * b(x); }   /* 2x, 3sin(x), (x+1)(x-1) */
      else return v;
    }
  }
  function unary(){
    if(eat('-')){ const a = unary(); return x => -a(x); }
    if(eat('+')) return unary();
    return power();
  }
  function power(){
    const b = atom();
    if(eat('^')){ const e = unary(); return x => Math.pow(b(x), e(x)); }   /* right to left */
    return b;
  }
  function atom(){
    const t = ts[p++];
    if(t.t === 'num'){ const v = t.v; return () => v; }
    if(t.t === '('){ const v = expr(); if(!eat(')')) throw 'a "(" is missing its ")"'; return v; }
    if(t.t === '|'){
      bars++;
      const v = expr();
      bars--;
      if(!eat('|')) throw 'a "|" is missing its partner';
      return x => Math.abs(v(x));
    }
    if(t.t === 'name'){
      const n = t.v, l = n.toLowerCase();
      if(eat('(')){
        const args = [];
        if(!eat(')')){
          for(;;){ args.push(expr()); if(!eat(',')) break; }
          if(!eat(')')) throw n + '( is missing its ")"';
        }
        const f = MX_FN[l];
        if(!f) throw n + ' is not a function I know';
        return x => f.apply(null, args.map(a => a(x)));
      }
      if(l === 'x'){ usesX = true; return x => x; }
      if(MX_CONST[l] != null){ const v = MX_CONST[l]; return () => v; }
      if(MX_FN[l]) throw n + ' wants its argument in brackets — ' + l + '(x)';
      throw n + ' is not something I know';
    }
    throw 'that expression stops in the middle';
  }
  try{
    if(at() === 'end') return { fn:null, err:null, usesX:false };          /* nothing typed yet */
    const f = expr();
    if(at() !== 'end') throw 'there is something left over at the end';
    f(1);                                                                  /* a dry run catches the rest */
    return { fn:f, err:null, usesX };
  }catch(err){ return { fn:null, err:String(err), usesX:false }; }
}
/* a cell of a matrix: a constant expression like -1, 1/2 or sqrt(2)/2 */
function mxNum(src){
  const c = mxCompile(src);
  if(c.err) return { v:null, err:c.err };
  if(!c.fn) return { v:null, err:'that box is empty' };
  if(c.usesX) return { v:null, err:'x has no value in a matrix' };
  let v; try{ v = c.fn(0); }catch(e){ v = NaN; }
  return Number.isFinite(v) ? { v, err:null } : { v:null, err:'that does not come out as a number' };
}

/* ---- 2×2 matrices ---- */
const m2 = m => Array.isArray(m) && m.length === 4 && m.every(Number.isFinite) ? m : [1, 0, 0, 1];
const mbasis = it => m2(it && it.basis);
const mdet = m => m[0] * m[3] - m[1] * m[2];
const mapply = (m, x, y) => [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
const mIdent = m => Math.abs(m[0] - 1) + Math.abs(m[1]) + Math.abs(m[2]) + Math.abs(m[3] - 1) < 1e-9;

/* ---- the plot's geometry ----
   Coordinates go through the basis to land in the world, and the world is
   mapped onto a 1000-wide picture. The picture is as tall as the window is
   deep, so one unit across is one unit up and a rotation looks like one. */
function niceStep(span, want){
  const raw = Math.max(1e-9, span) / (want || 9);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
}
/* the next step up: …1, 2, 5, 10, 20… */
function nextNice(st){
  const p = Math.pow(10, Math.floor(Math.log10(st) + 1e-9));
  const n = st / p;
  return (n < 1.5 ? 2 : n < 3.5 ? 5 : 10) * p;
}
/* A step for an axis whose numbers have to fit beside each other. niceStep aims
   for nine of them and rounds to 1, 2 or 5 — which, rounding down, can land on
   fifteen. So take its answer and coarsen it until the labels have the room
   they need: `room` is how much of the picture one of them takes. */
function axisStep(span, px, room){
  let st = niceStep(span, 9);
  for(let k = 0; k < 14 && span / st * room > px; k++) st = nextNice(st);
  return st;
}
/* what the axes are called: the headings of every column feeding each of them.
   Two series measured in the same thing name it once. */
function datLabels(it){
  const xs = [], ys = [];
  for(const d of datOf(it)){
    if(d.xl && xs.indexOf(d.xl) < 0) xs.push(d.xl);
    if(d.yl && ys.indexOf(d.yl) < 0) ys.push(d.yl);
  }
  return { x: xs.join(', '), y: ys.join(', ') };
}
function plotGeom(it){
  const x0 = nz(it.xmin, -5), x1 = nz(it.xmax, 5), y0 = nz(it.ymin, -3.4), y1 = nz(it.ymax, 3.4);
  const sx = Math.max(1e-6, x1 - x0), sy = Math.max(1e-6, y1 - y0);
  /* The picture is as tall as the window it shows, so a square of coordinates
     comes out square — which is the whole point when there are vectors in it.
     Data is the exception: seconds against metres have no shared scale, and
     insisting on one gives a picture 2.6 times taller than it is wide. So a
     plot that has been handed a table keeps a shape of its own in `ar`, and
     the two axes are then scaled apart, the way any chart is. */
  const W = PLOT_W, H = clamp(nz(it.ar, 0) > 0 ? W * it.ar : W * sy / sx, W * 0.2, W * 2.6);
  const B = mbasis(it), det = mdet(B);
  const kx = W / sx, ky = H / sy;
  const S = (wx, wy) => [(wx - x0) * kx, H - (wy - y0) * ky];              /* world  → picture */
  const P = (x, y) => S(B[0] * x + B[1] * y, B[2] * x + B[3] * y);         /* coords → picture */
  const wAt = (px, py) => [px / kx + x0, (H - py) / ky + y0];              /* picture → world */
  const U = Math.abs(det) > 1e-9                                           /* world  → coords */
    ? (wx, wy) => [(B[3] * wx - B[1] * wy) / det, (B[0] * wy - B[2] * wx) / det]
    : (wx, wy) => [wx, wy];
  /* One step across both axes is what keeps a square square, and a plane wants
     that. A chart's axes are measured in different things — seconds against
     metres — so each gets a step of its own, or one of them ends up with its
     numbers written on top of each other. */
  const chart = nz(it.ar, 0) > 0;
  const stepX = chart ? axisStep(sx, W, 130) : niceStep(Math.max(sx, sy));
  const stepY = chart ? axisStep(sy, H, 72) : stepX;
  const dpx = clamp(-Math.floor(Math.log10(stepX) + 1e-9), 0, 4);
  const dpy = clamp(-Math.floor(Math.log10(stepY) + 1e-9), 0, 4);
  /* ---- the margin round a chart ----
     A plane writes its numbers along its own axes, through the middle of the
     picture, and needs no room outside it — that is the sketchbook look and it
     is left exactly as it was. A chart of readings has nothing near the origin,
     so its numbers and the names of its axes go *outside* the frame, the way
     every chart ever drawn has them. That room has to come from somewhere: the
     picture keeps its 1000 units of plotting area and the viewBox grows around
     it, so nothing inside has to know that the margin is there at all. */
  const lab = chart ? datLabels(it) : { x:'', y:'' };
  const axes = chart && it.axes !== 0, nums = axes && it.axes !== 2;
  let wide = 1;
  if(nums)
    for(let j = Math.ceil(y0 / stepY - 1e-9); j <= Math.floor(y1 / stepY + 1e-9); j++)
      wide = Math.max(wide, mfmt(j * stepY, dpy).length);
  const mL = !axes ? 0 : (nums ? clamp(wide * 19 + 26, 60, 320) : 10) + (lab.y ? 52 : 0);
  const mB = !axes ? 0 : (nums ? 62 : 10) + (lab.x ? 52 : 0);
  const mT = axes ? 26 : 0;
  const mR = !axes ? 0 : (nums ? 54 : 10);
  return { x0, x1, y0, y1, sx, sy, W, H, B, det, kx, ky, S, P, U, wAt,
           chart, stepX, stepY, dpx, dpy, lab, axes, nums,
           mL, mR, mT, mB, VW: mL + W + mR, VH: mT + H + mB };
}
/* the coordinates whose picture lands inside the frame — the preimage of the
   view, so a sheared grid still fills the corners */
function coordBox(g){
  const c = [[0, 0], [g.W, 0], [0, g.H], [g.W, g.H]].map(q => {
    const w = g.wAt(q[0], q[1]);
    return g.U(w[0], w[1]);
  });
  const xs = c.map(q => q[0]), ys = c.map(q => q[1]);
  return [Math.min.apply(null, xs), Math.max.apply(null, xs),
          Math.min.apply(null, ys), Math.max.apply(null, ys)];
}
function gridD(stx, sty, box, map){
  const i0 = Math.floor(box[0] / stx), i1 = Math.ceil(box[1] / stx);
  const j0 = Math.floor(box[2] / sty), j1 = Math.ceil(box[3] / sty);
  if(i1 - i0 > 260 || j1 - j0 > 260) return ['', ''];   /* a near-singular basis asks for millions */
  let v = '', h = '';
  for(let i = i0; i <= i1; i++){
    const a = map(i * stx, box[2]), b = map(i * stx, box[3]);
    v += 'M' + rd1(a[0]) + ' ' + rd1(a[1]) + 'L' + rd1(b[0]) + ' ' + rd1(b[1]);
  }
  for(let j = j0; j <= j1; j++){
    const a = map(box[0], j * sty), b = map(box[1], j * sty);
    h += 'M' + rd1(a[0]) + ' ' + rd1(a[1]) + 'L' + rd1(b[0]) + ' ' + rd1(b[1]);
  }
  return [v, h];
}
const dashAttr = s => MDASH[s] ? ' stroke-dasharray="' + MDASH[s] + '" stroke-linecap="round"' : '';
/* every vector wears its head, however short it is: a stubby one gets a smaller
   arrow rather than none at all, and one with no length at all points right */
const headSize = (a, b, size) => clamp(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.55, size * 0.42, size);
function arrowPts(a, b, size){
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const ux = L > 1e-6 ? dx / L : 1, uy = L > 1e-6 ? dy / L : 0, w = size * 0.5;
  return [b, [b[0] - ux * size - uy * w, b[1] - uy * size + ux * w],
             [b[0] - ux * size + uy * w, b[1] - uy * size - ux * w]]
    .map(p => rd1(p[0]) + ',' + rd1(p[1])).join(' ');
}
function shorten(a, b, by){                        /* stop the shaft short of the head */
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  return L < by * 1.02 ? a : [b[0] - dx / L * by, b[1] - dy / L * by];
}
/* how far a point in the picture is from a vector's shaft — for dropping a
   matrix onto the one you meant */
function segDist(p, a, b){
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 < 1e-9 ? 0 : clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1);
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}
const mline = (a, b) => 'M' + rd1(a[0]) + ' ' + rd1(a[1]) + 'L' + rd1(b[0]) + ' ' + rd1(b[1]);
/* one error bar: the whisker, and a cap square across each end of it. Square in
   the picture rather than in the coordinates, so the caps lean with everything
   else when the basis is sheared. */
function ebar(a, b, cap){
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if(!(L > 1e-6)) return '';
  const ux = -dy / L * cap, uy = dx / L * cap;
  return mline(a, b) + mline([a[0] - ux, a[1] - uy], [a[0] + ux, a[1] + uy]) +
                       mline([b[0] - ux, b[1] - uy], [b[0] + ux, b[1] + uy]);
}
const polyD = P => 'M' + P.map(q => rd1(q[0]) + ' ' + rd1(q[1])).join('L');

/* ---- the objects a plot holds ---- */
const fnsOf = it => (it.fns = it.fns || []);
const vecsOf = it => (it.vecs = it.vecs || []);
/* points read off a table — see "Plotting a table" in the README. A series
   keeps the numbers it was given as well as the id of the table they came
   from: the table pushes new ones in whenever a cell changes, and the copy is
   what print, an export and a backup draw, none of which can see the table. */
const datOf = it => (it.dat = it.dat || []);
const datPts = d => Array.isArray(d.pts) ? d.pts : [];
const DAT_MARKS = ['dots', 'line', 'both'];
const mathArr = (it, kind) => kind === 'fn' ? fnsOf(it) : kind === 'dat' ? datOf(it) : vecsOf(it);
const mathObj = (it, kind, id) => mathArr(it, kind).find(o => o.id === id) || null;
function nextColor(it){
  const n = fnsOf(it).length + vecsOf(it).length + datOf(it).length;
  return MATH_COLORS[n % MATH_COLORS.length];
}
function nextName(it){
  const used = vecsOf(it).map(v => v.lab);
  for(const n of VEC_NAMES) if(used.indexOf(n) < 0) return n;
  return 'v' + (used.length + 1);
}

/* ---- drawing one ---- */
function fnPath(g, f, box){
  const c = mxCompile(f.expr);
  if(!c.fn) return { d:'', err:c.err };
  const N = 700, lo = -2 * g.H, hi = 3 * g.H;
  let d = '', pen = false, prev = null;
  for(let i = 0; i <= N; i++){
    const x = box[0] + (box[1] - box[0]) * i / N;
    let y; try{ y = c.fn(x); }catch(e){ y = NaN; }
    if(!Number.isFinite(y)){ pen = false; prev = null; continue; }
    const p = g.P(x, y);
    p[1] = clamp(p[1], lo, hi);                    /* far off the picture is far enough */
    p[0] = clamp(p[0], lo, hi);
    if(prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > g.H * 1.6) pen = false;  /* an asymptote */
    d += (pen ? 'L' : 'M') + rd1(p[0]) + ' ' + rd1(p[1]);
    pen = true; prev = p;
  }
  return { d, err:null };
}
function plotInner(it, live){
  const g = plotGeom(it), B = g.B, plain = mIdent(B);
  const id = 'mp' + (++MSEQ);
  const chart = g.chart, stepX = g.stepX, stepY = g.stepY, dpx = g.dpx, dpy = g.dpy;
  const box = coordBox(g);
  const sel = mathSel && mathSel.pid === it.id ? mathSel : null;
  const W = rd1(g.W), H = rd1(g.H);
  let s = '<defs><clipPath id="' + id + '"><rect x="0" y="0" width="' + W + '" height="' + H + '"/></clipPath></defs>' +
    '<rect class="mbg" x="0" y="0" width="' + W + '" height="' + H + '"/>' +
    '<g clip-path="url(#' + id + ')">';
  let after = '';                                  // what belongs outside the clip: a chart's margin

  /* the paper: the lattice of the basis, with the standard one showing through
     faintly behind it once the space has been transformed */
  if((it.grid || 'solid') !== 'blank'){
    const gd = gridD(stepX, stepY, box, g.P);
    if(!plain){
      const gh = gridD(stepX, stepY, [g.x0, g.x1, g.y0, g.y1], g.S);
      s += '<path class="mgrid mghost" d="' + gh[0] + gh[1] + '"/>';
    }
    s += '<path class="mgrid g-' + esc(it.grid || 'solid') + '" d="' + gd[0] + gd[1] + '"/>';
  }
  /* the unit square goes with the basis vectors: its area is the determinant */
  if(it.bshow){
    const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(p => g.P(p[0], p[1]));
    s += '<polygon class="munit" points="' + q.map(p => rd1(p[0]) + ',' + rd1(p[1])).join(' ') + '"/>';
  }
  if(it.axes !== 0){
    const o = g.S(0, 0);
    const ay = clamp(o[1], 1, g.H - 1), ax = clamp(o[0], 1, g.W - 1);
    /* A plane's axes carry on off the edge of the paper, and an arrow is how you
       say so. A chart's are the sides of a measured box: the head would be
       pointing into the margin, at nothing, so it draws the lines without them.
       The zero lines are still worth having — they are where zero is. */
    s += '<path class="max" d="M0 ' + rd1(ay) + 'H' + W + '"/>' +
         '<path class="max" d="M' + rd1(ax) + ' ' + H + 'V0"/>' +
         (chart ? '' :
           '<polygon class="maxh" points="' + arrowPts([g.W - 40, ay], [g.W - 3, ay], 26) + '"/>' +
           '<polygon class="maxh" points="' + arrowPts([ax, 40], [ax, 3], 26) + '"/>');
    let tk = '', nums = '';
    /* ---- where the numbers go ----
       On a plane they are written along the axes themselves, in the middle of
       the picture. An axis the origin has been left off the end of is pinned to
       the frame, and its numbers would then land outside the picture — so on a
       plane they turn inwards instead.

       A chart has a margin for exactly this, so its numbers are written out
       there, off the bottom and the left of the frame, and none of it has to
       dodge anything: no turning inwards, no leaving out the one in the corner,
       no skipping the first and last. */
    const lowX = o[1] > g.H - 46, lowY = o[0] < 46;
    const numY = chart ? g.H + 46 : (lowX ? ay - 15 : ay + 36);
    const numX = chart ? -16 : (lowY ? ax + 13 : ax - 13);
    const numC = (chart || !lowY) ? 'mnum end' : 'mnum';
    for(let i = Math.ceil(g.x0 / stepX - 1e-9); i <= Math.floor(g.x1 / stepX + 1e-9); i++){
      const px = g.S(i * stepX, 0)[0];
      if(i === 0 && !chart) continue;
      /* on a chart the ticks are on the frame, pointing out, where the numbers
         are — on a plane they cross the axis they belong to */
      tk += chart ? 'M' + rd1(px) + ' ' + rd1(g.H) + 'v13'
                  : 'M' + rd1(px) + ' ' + rd1(ay - 7) + 'v14';
      /* a number sitting on the frame would be sliced in half by it, and one in
         the corner where the two axes meet would land on the other axis's */
      if(chart || (px > 30 && px < g.W - 30 && (!lowY || Math.abs(px - ax) > 34)))
        nums += '<text class="mnum" x="' + rd1(px) + '" y="' + rd1(numY) + '">' + esc(mfmt(i * stepX, dpx)) + '</text>';
    }
    for(let j = Math.ceil(g.y0 / stepY - 1e-9); j <= Math.floor(g.y1 / stepY + 1e-9); j++){
      const py = g.S(0, j * stepY)[1];
      if(j === 0 && !chart) continue;
      tk += chart ? 'M0 ' + rd1(py) + 'h-13'
                  : 'M' + rd1(ax - 7) + ' ' + rd1(py) + 'h14';
      if(chart || (py > 22 && py < g.H - 14 && (!lowX || Math.abs(py - ay) > 28)))
        nums += '<text class="' + numC + '" x="' + rd1(numX) + '" y="' + rd1(py + 11) + '">' + esc(mfmt(j * stepY, dpy)) + '</text>';
    }
    let furn = '<path class="mtick" d="' + tk + '"/>';
    /* …and on a plane the 0 is only written where the origin actually is */
    const origin = o[0] > 30 && o[0] < g.W - 8 && o[1] > 12 && o[1] < g.H - 12;
    if(it.axes !== 2) furn += nums + (!chart && origin
      ? '<text class="mnum end" x="' + rd1(ax - 13) + '" y="' + rd1(ay + 36) + '">0</text>' : '');
    /* ---- and what they are called ----
       The headings the columns were under, centred on the axis each belongs to
       and set outside it — plt.xlabel and plt.ylabel, down to the y one reading
       up the side of the picture. */
    if(g.lab.x) furn += '<text class="mxlab" x="' + rd1(g.W / 2) + '" y="' + rd1(g.H + g.mB - 14) +
      '">' + esc(g.lab.x) + '</text>';
    /* Turned a quarter turn anticlockwise, the letters stand *left* of the line
       they are written along — so the baseline goes at the inner edge of the
       band kept for it, not the outer, or the tops of them are cut off by the
       edge of the picture. */
    if(g.lab.y) furn += '<text class="mylab" transform="translate(' + rd1(38 - g.mL) + ' ' +
      rd1(g.H / 2) + ') rotate(-90)">' + esc(g.lab.y) + '</text>';
    /* A chart's numbers and names are written in the margin, and the whole
       picture is inside a clip the width of the plotting area — so on a chart
       they are held back and laid down outside it, once the clip has closed.
       A plane's are written along its own axes, well inside, and stay where
       they were: under everything drawn in it, as they have always been. */
    if(chart) after += furn; else s += furn;
    /* the axes are draggable wherever they show — under the vectors, so a vector
       lying along one can still be picked up */
    if(live) s += '<path class="mhit" data-h="ax:x" d="M0 ' + rd1(ay) + 'H' + W + '"/>' +
                  '<path class="mhit" data-h="ax:y" d="M' + rd1(ax) + ' ' + H + 'V0"/>';
  }
  /* the basis it is all drawn in — under the vectors, so a vector lying along
     one of them is still the thing you see */
  /* î is labelled above its tip and ĵ beside its own, clear of the numbers
     already written along the axes */
  if(it.bshow) [['i', [1, 0], 'î', -7, -21], ['j', [0, 1], 'ĵ', 21, 13]].forEach(k => {
    const o = g.P(0, 0), b = g.P(k[1][0], k[1][1]), hd = headSize(o, b, 29);
    s += '<path class="mb mb' + k[0] + '" d="' + mline(o, shorten(o, b, hd * 0.7)) + '"/>' +
         '<polygon class="mb mb' + k[0] + ' fill" points="' + arrowPts(o, b, hd) + '"/>' +
         '<text class="mblab mb' + k[0] + '" x="' + rd1(b[0] + k[3]) + '" y="' + rd1(b[1] + k[4]) + '">' + k[2] + '</text>';
  });
  /* functions */
  for(const f of fnsOf(it)){
    const r = fnPath(g, f, box);
    if(!r.d) continue;
    s += '<path class="mfn" d="' + r.d + '" stroke="' + esc(f.c || MATH_COLORS[0]) + '"' + dashAttr(f.s) + '/>';
    if(live) s += '<path class="mhit" data-h="fn:' + esc(f.id) + '" d="' + r.d + '"/>';
  }
  /* a table's points: the error bars go down first, then the line through them,
     then the marks on top, so nothing a point says is hidden by its own whisker */
  for(const d of datOf(it)){
    const c = d.c || MATH_COLORS[2], pts = datPts(d), mode = d.m || 'dots';
    const P = pts.map(p => g.P(nz(p[0], 0), nz(p[1], 0)));
    let eb = '';
    for(const p of pts){
      const x = nz(p[0], 0), y = nz(p[1], 0);
      const ex = Math.abs(nz(p[2], 0)), ey = Math.abs(nz(p[3], 0));
      if(ey > 0) eb += ebar(g.P(x, y - ey), g.P(x, y + ey), 12);
      if(ex > 0) eb += ebar(g.P(x - ex, y), g.P(x + ex, y), 12);
    }
    if(eb) s += '<path class="mdeb" d="' + eb + '" stroke="' + esc(c) + '"/>';
    if(mode !== 'dots' && P.length > 1)
      s += '<path class="mdline" d="' + polyD(P) + '" stroke="' + esc(c) + '"' + dashAttr(d.s) + '/>';
    /* A point at a time is an element at a time, and a spreadsheet's worth of
       them is a page that never comes back. Past a certain count the same marks
       go down as one path instead, and the invisible circles that make each
       point findable by the mouse are left off — at that density there is no
       one point under the pointer anyway. */
    const many = P.length > 1200;
    if(mode !== 'line'){
      if(many){
        let dd = '';
        for(const q of P)
          dd += 'M' + rd1(q[0] - 9) + ' ' + rd1(q[1]) + 'a9 9 0 1 0 18 0a9 9 0 1 0 -18 0';
        s += '<path class="mdots" d="' + dd + '" fill="' + esc(c) + '"/>';
      }else for(const q of P)
        s += '<circle class="mdot" cx="' + rd1(q[0]) + '" cy="' + rd1(q[1]) + '" r="10" fill="' + esc(c) + '"/>';
    }
    if(live){
      if(mode !== 'dots' && P.length > 1)
        s += '<path class="mhit" data-h="dat:' + esc(d.id) + '" d="' + polyD(P) + '"/>';
      if(!many) for(const q of P)
        s += '<circle class="mgrab" data-h="dat:' + esc(d.id) + '" cx="' + rd1(q[0]) + '" cy="' +
             rd1(q[1]) + '" r="17"/>';
    }
  }
  /* vectors, and where a transformed one came from */
  for(const v of vecsOf(it)){
    const c = v.c || MATH_COLORS[1];
    const a = g.P(nz(v.ox, 0), nz(v.oy, 0)), b = g.P(nz(v.x, 1), nz(v.y, 1));
    if(v.was){
      const wb = g.P(v.was[0], v.was[1]), wh = headSize(a, wb, 21);
      s += '<path class="mwas" d="' + mline(a, shorten(a, wb, wh * 0.72)) + '" stroke="' + esc(c) + '"/>' +
           '<polygon class="mwas" points="' + arrowPts(a, wb, wh) + '" fill="' + esc(c) + '"/>' +
           '<path class="mwarc" d="' + mline(wb, b) + '" stroke="' + esc(c) + '"/>';
    }
    if(v.comp || (sel && sel.kind === 'vec' && sel.id === v.id)){
      const cx = g.P(nz(v.x, 1), 0), cy = g.P(0, nz(v.y, 1));
      s += '<path class="mcomp" stroke="' + esc(c) + '" d="' + mline(g.P(0, 0), cx) + mline(cx, b) +
           mline(g.P(0, 0), cy) + mline(cy, b) + '"/>';
    }
    const hd = headSize(a, b, 30), tip = shorten(a, b, hd * 0.7);
    s += '<path class="mvec" d="' + mline(a, tip) + '" stroke="' + esc(c) + '"' + dashAttr(v.s) + '/>' +
         '<polygon class="mvec" points="' + arrowPts(a, b, hd) + '" fill="' + esc(c) + '"/>';
    if(v.lab)
      s += '<text class="mvlab" x="' + rd1(b[0] + 16) + '" y="' + rd1(b[1] - 14) + '" fill="' + esc(c) + '">' +
           esc(v.lab || '') + '</text>';
    if(live)
      s += '<path class="mhit" data-h="vec:' + esc(v.id) + '" d="' + mline(a, b) + '"/>' +
           '<circle class="mgrab" data-h="vect:' + esc(v.id) + '" cx="' + rd1(b[0]) + '" cy="' + rd1(b[1]) + '" r="20"/>' +
           '<circle class="mgrab" data-h="veco:' + esc(v.id) + '" cx="' + rd1(a[0]) + '" cy="' + rd1(a[1]) + '" r="15"/>';
  }
  /* …and their tips are the last thing on the picture, so they are always the
     first thing the mouse finds */
  if(it.bshow && live) [['i', [1, 0]], ['j', [0, 1]]].forEach(k => {
    const b = g.P(k[1][0], k[1][1]);
    s += '<circle class="mgrab" data-h="bas:' + k[0] + '" cx="' + rd1(b[0]) + '" cy="' + rd1(b[1]) + '" r="21"/>';
  });
  return s + '</g>' + after +
    '<rect class="mframe" x="0" y="0" width="' + W + '" height="' + H + '"/>';
}
/* the box the picture is drawn in — the plotting area, plus whatever margin a
   chart's numbers and axis names need around it */
const plotView = g => rd1(-g.mL) + ' ' + rd1(-g.mT) + ' ' + rd1(g.VW) + ' ' + rd1(g.VH);
function plotSVG(it, live){
  const g = plotGeom(it);
  return '<svg class="mplot' + (g.chart ? ' chart' : '') +
    '" viewBox="' + plotView(g) + '" ' +
    'style="aspect-ratio:' + rd1(g.VW) + '/' + rd1(g.VH) + '">' + plotInner(it, live) + '</svg>';
}
/* the key under the picture — it doubles as the list of what is on the plot */
function plotLegend(it){
  const sel = mathSel && mathSel.pid === it.id ? mathSel : null;
  const pill = (k, o, txt) =>
    '<button class="mpill' + (sel && sel.kind === k && sel.id === o.id ? ' on' : '') +
    '" data-o="' + k + ':' + esc(o.id) + '"><i style="background:' + esc(o.c || '#888') + '"></i>' + esc(txt) + '</button>';
  const out = fnsOf(it).map(f => pill('fn', f, 'y = ' + (f.expr || '?')))
    .concat(datOf(it).map(d => pill('dat', d,
      (d.lab || 'data') + ' · ' + datPts(d).length + (datPts(d).length === 1 ? ' point' : ' points'))))
    .concat(vecsOf(it).map(v => pill('vec', v,
      (v.lab ? v.lab + ' ' : '') + '(' + mfmt(nz(v.x, 0), 2) + ', ' + mfmt(nz(v.y, 0), 2) + ')')));
  if(!mIdent(mbasis(it)))
    out.push('<span class="mpill det">det ' + mfmt(mdet(mbasis(it)), 3) + '</span>');
  return out.join('');
}

/* ---- the little text box that comes up on the thing you are editing ----
   It hangs off the head of the vector, and off the other side of it once that
   would take it past the right edge of the picture. */
function chipPos(o, kind, g){
  /* a series has the widest box of the three, so it starts at the left edge
     rather than a third of the way in, where it would hang off the picture */
  const p = kind === 'vec' ? g.P(nz(o.x, 1), nz(o.y, 1)) : [g.W * (kind === 'dat' ? 0.02 : 0.32), 0];
  /* the box hangs off the picture, and the picture is the plotting area inset
     into whatever margin a chart carries */
  const L = clamp((p[0] + g.mL) / g.VW * 100, 1, 99), T = clamp((p[1] + g.mT) / g.VH * 100, -6, 86);
  return { flip: L > 52, css: (L > 52 ? 'right:' + rd1(100 - L) : 'left:' + rd1(L)) + '%;top:' + rd1(T) + '%' };
}
/* the columns a series may be read from, as one <select>'s worth of options */
function colOpts(d, sel, extra){
  let s = (extra || []).map(e =>
    '<option value="' + e[0] + '"' + (sel === e[0] ? ' selected' : '') + '>' + esc(e[1]) + '</option>').join('');
  (d.cols || []).forEach((n, i) => {
    s += '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + esc(n) + '</option>';
  });
  return s;
}
const datSel = (d, k, sel, extra, title) =>
  '<select class="msel" data-k="' + k + '" title="' + esc(title) + '">' + colOpts(d, sel, extra) + '</select>';
function chipHTML(it, o, kind, g){
  const at = chipPos(o, kind, g);
  const dot = '<button class="mdot" data-a="color" title="Colour" style="background:' + esc(o.c || '#888') + '"></button>';
  const sty = '<button class="msty" data-a="style" title="Solid / dashed / dotted"><b class="s-' +
    esc(o.s || 'solid') + '"></b></button>';
  const del = '<button data-a="del" title="Take it off the plot">✕</button>';
  /* a series: which column is x, which is y, which hold the error on each, and
     whether the points are joined up */
  if(kind === 'dat'){
    const m = DAT_MARKS.indexOf(o.m) < 0 ? 'dots' : o.m;
    return '<div class="mchip mdat' + (at.flip ? ' flip' : '') + '" data-for="dat:' + esc(o.id) +
      '" style="' + at.css + '">' + dot +
      '<span class="mpar">x</span>' + datSel(o, 'xc', nz(o.xc, 0), [[-1, 'row #']], 'Which column is x') +
      '<span class="mpar">y</span>' + datSel(o, 'yc', nz(o.yc, 1), [], 'Which column is y') +
      '<button data-a="marks" title="Scatter, a line through the points, or both">' +
        (m === 'dots' ? 'scatter' : m === 'line' ? 'line' : 'both') + '</button>' + sty +
      '<span class="mpar">±x</span>' + datSel(o, 'ex', nz(o.ex, -2), [[-2, '—']], 'Column holding the error on x') +
      '<span class="mpar">±y</span>' + datSel(o, 'ey', nz(o.ey, -2), [[-2, '—']], 'Column holding the error on y') +
      '<button data-a="fit" title="Fit the view to the points">⤢</button>' + del +
      '<div class="merr"></div></div>';
  }
  const body = kind === 'vec'
    ? '<input class="mlab" data-k="lab" value="' + esc(o.lab || '') + '" title="Name" spellcheck="false">' +
      '<span class="mpar">(</span><input class="mval" data-k="x" value="' + esc(mfmt(nz(o.x, 0), 4)) + '">' +
      '<span class="mpar">,</span><input class="mval" data-k="y" value="' + esc(mfmt(nz(o.y, 0), 4)) + '">' +
      '<span class="mpar">)</span>' + sty +
      '<button data-a="comp" class="' + (o.comp ? 'on' : '') + '" title="Show it as so many î plus so many ĵ">⊹</button>'
    : '<span class="mpar">y =</span><input class="mexp" data-k="expr" value="' + esc(o.expr || '') +
      '" spellcheck="false" title="sin(x), x^2, 1/x, sqrt(x)…">' + sty;
  /* the complaint line is always there and empty when all is well, so it can be
     filled in while you type without rebuilding the box under your fingers */
  const err = kind === 'fn' ? (mxCompile(o.expr).err || '') : '';
  return '<div class="mchip' + (at.flip ? ' flip' : '') + '" data-for="' + kind + ':' + esc(o.id) +
    '" style="' + at.css + '">' + dot + body + del + '<div class="merr">' + esc(err) + '</div></div>';
}

/* ---- what is on the page, and where ---- */
function findItem(id){
  for(const p of openPages()){
    const it = p && p.items.find(x => x.id === id);
    if(it) return { it, page:p };
  }
  return null;
}
function pagePlots(){
  const out = [];
  for(const p of openPages()){
    if(p) for(const it of p.items) if(it.type === 'plot') out.push({ it, page:p });
  }
  return out;
}
function plotEl(it){ return document.querySelector('#pageHost .item[data-id="' + it.id + '"]'); }
/* plots being pushed around the page rather than worked in — not saved with the
   book, it is a state of the hand rather than of the drawing */
const PLOT_MOVE = new Set();
function plotMove(el, it, on){
  if(on) PLOT_MOVE.add(it.id); else PLOT_MOVE.delete(it.id);
  el.classList.toggle('mmove', !!on);
  if(on) selectMath(it.id, null);
  select(it.id);
  SND.pop();
}
function paintPlot(el, it){
  const svg = el && el.querySelector('svg.mplot');
  if(!svg) return;
  const g = plotGeom(it);
  svg.setAttribute('viewBox', plotView(g));
  svg.style.aspectRatio = rd1(g.VW) + '/' + rd1(g.VH);
  svg.classList.toggle('chart', g.chart);
  svg.innerHTML = plotInner(it, true);
  const leg = el.querySelector('.mleg');
  if(leg) leg.innerHTML = plotLegend(it);
  syncChip(el, it);
  /* a series taken off the plot takes its wire with it — the wires are laid
     from what is actually there, so all this has to do is ask for a pass */
  if(typeof ndWake === 'function') ndWake();
}
function repaintPlots(){
  if(!index) return;
  document.querySelectorAll('#pageHost .item[data-type="plot"]').forEach(el => {
    const f = findItem(el.dataset.id);
    if(f) paintPlot(el, f.it);
  });
}
function mrepaint(it){ const el = plotEl(it); if(el) paintPlot(el, it); }

/* ---- selection inside a plot ---- */
function selectMath(pid, kind, id){
  mathSel = kind && id ? { pid, kind, id } : null;
  repaintPlots(); syncMathBar();
}
function syncChip(el, it){
  const box = el.querySelector('.mchips');
  if(!box) return;
  const sel = mathSel && mathSel.pid === it.id ? mathSel : null;
  const o = sel ? mathObj(it, sel.kind, sel.id) : null;
  if(!o){ box.innerHTML = ''; return; }
  const g = plotGeom(it), key = sel.kind + ':' + sel.id;
  const cur = box.firstElementChild;
  if(cur && cur.dataset.for === key && cur.contains(document.activeElement)){
    const at = chipPos(o, sel.kind, g);
    cur.style.cssText = at.css;
    cur.classList.toggle('flip', at.flip);
    const err = cur.querySelector('.merr');
    if(err && sel.kind === 'fn') err.textContent = mxCompile(o.expr).err || '';
    return;                                          /* someone is typing in it: leave the words alone */
  }
  box.innerHTML = chipHTML(it, o, sel.kind, g);
}

/* ---- pointer arithmetic ---- */
function svgAt(svg, ev){
  const m = svg.getScreenCTM && svg.getScreenCTM();
  if(!m) return [0, 0];
  let q;
  if(window.DOMPoint) q = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
  else { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; q = p.matrixTransform(m.inverse()); }
  return [q.x, q.y];
}
function coordAt(svg, it, ev){
  const g = plotGeom(it), q = svgAt(svg, ev), w = g.wAt(q[0], q[1]), c = g.U(w[0], w[1]);
  return { g, px:q[0], py:q[1], wx:w[0], wy:w[1], x:c[0], y:c[1] };
}
const snapStep = g => niceStep(Math.max(g.sx, g.sy)) / 4;
const msnap = (v, st, free) => free ? Math.round(v * 1e4) / 1e4 : near0(Math.round(v / st) * st);

/* the pointer, until it is let go */
function mgrab(el, e, mv, up){
  const pid = e.pointerId;
  try{ el.setPointerCapture(pid); }catch(err){}
  const move = ev => { if(ev.pointerId === pid) mv(ev); };
  const done = ev => {
    if(ev.pointerId !== pid) return;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', done);
    el.removeEventListener('pointercancel', done);
    if(up) up(ev);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', done);
  el.addEventListener('pointercancel', done);
}

/* ---- dragging the picture around ---- */
function dragView(svg, el, it, page, e, axis){
  const g = plotGeom(it), s = svgAt(svg, e), w0 = g.wAt(s[0], s[1]);
  const x0 = g.x0, x1 = g.x1, y0 = g.y0, y1 = g.y1;
  mgrab(svg, e, ev => {
    const q = svgAt(svg, ev), w = g.wAt(q[0], q[1]);
    const dx = (axis === 'y' || axis === 'both') ? w[0] - w0[0] : 0;
    const dy = (axis === 'x' || axis === 'both') ? w[1] - w0[1] : 0;
    it.xmin = x0 - dx; it.xmax = x1 - dx;
    it.ymin = y0 - dy; it.ymax = y1 - dy;
    paintPlot(el, it); syncMathBar();
  }, () => queueSave(page.id));
}
function zoomPlot(el, it, page, svg, ev, k){
  const g = plotGeom(it), q = svgAt(svg, ev), w = g.wAt(q[0], q[1]);
  if(g.sx * k < 1e-4 || g.sx * k > 1e7) return;
  it.xmin = w[0] + (g.x0 - w[0]) * k; it.xmax = w[0] + (g.x1 - w[0]) * k;
  it.ymin = w[1] + (g.y0 - w[1]) * k; it.ymax = w[1] + (g.y1 - w[1]) * k;
  paintPlot(el, it); syncMathBar(); queueSave(page.id);
}

/* ---- pulling a vector out of the paper ---- */
function dragNewVec(svg, el, it, page, e){
  const a = coordAt(svg, it, e), st = snapStep(a.g);
  const home = Math.hypot(a.x, a.y) < st * 3;        /* started near the origin: root it there */
  const v = { id:uid(), ox:home ? 0 : msnap(a.x, st), oy:home ? 0 : msnap(a.y, st),
              x:home ? 0 : msnap(a.x, st), y:home ? 0 : msnap(a.y, st),
              c:nextColor(it), s:'solid', lab:nextName(it) };
  vecsOf(it).push(v);
  selectMath(it.id, 'vec', v.id);
  SND.plop();
  let moved = false;
  mgrab(svg, e, ev => {
    const c = coordAt(svg, it, ev);
    v.x = msnap(c.x, st, ev.shiftKey); v.y = msnap(c.y, st, ev.shiftKey);
    moved = true;
    paintPlot(el, it);
  }, () => {
    if(!moved || (v.x === v.ox && v.y === v.oy)){     /* a click, not a drag */
      if(home){ vecsOf(it).pop(); selectMath(it.id, null); mathTool = 'pan'; mrepaint(it); syncMathBar(); return; }
      v.ox = 0; v.oy = 0;                            /* a tap: from the origin to where you tapped */
    }
    /* one vector per press of the button: the tool puts itself away so the next
       drag moves the plane instead of littering it with arrows */
    mathTool = 'pan';
    queueSave(page.id); mrepaint(it); syncMathBar();
  });
}
function dragVec(svg, el, it, page, e, id, part){
  const v = mathObj(it, 'vec', id);
  if(!v) return;
  selectMath(it.id, 'vec', id);
  const a = coordAt(svg, it, e), st = snapStep(a.g);
  const x0 = nz(v.x, 1), y0 = nz(v.y, 1), ox = nz(v.ox, 0), oy = nz(v.oy, 0);
  let moved = false;
  mgrab(svg, e, ev => {
    const c = coordAt(svg, it, ev);
    if(!moved && Math.hypot(c.px - a.px, c.py - a.py) < 3) return;
    moved = true; delete v.was;                      /* moved by hand: not a transform any more */
    const sn = q => msnap(q, st, ev.shiftKey);
    if(part === 'vect'){ v.x = sn(c.x); v.y = sn(c.y); }
    else if(part === 'veco'){ v.ox = sn(c.x); v.oy = sn(c.y); }
    else {
      const dx = c.x - a.x, dy = c.y - a.y;          /* the shaft: both ends together */
      v.x = sn(x0 + dx); v.y = sn(y0 + dy); v.ox = sn(ox + dx); v.oy = sn(oy + dy);
    }
    paintPlot(el, it);
  }, () => { if(moved){ queueSave(page.id); mrepaint(it); } });
}
function dragBasis(svg, el, it, page, e, which){
  const b = mbasis(it).slice();
  it.basis = b;
  const st = snapStep(plotGeom(it));
  mgrab(svg, e, ev => {
    const c = coordAt(svg, it, ev);
    const x = msnap(c.wx, st, ev.shiftKey), y = msnap(c.wy, st, ev.shiftKey);
    if(which === 'i'){ b[0] = x; b[2] = y; } else { b[1] = x; b[3] = y; }
    paintPlot(el, it); syncMathBar();
  }, () => { queueSave(page.id); mrepaint(it); });
}

/* ---- the plot, wired up ---- */
function wirePlot(el, it, page){
  const svg = el.querySelector('svg.mplot');
  if(!svg) return;
  const chips = el.querySelector('.mchips');
  if(PLOT_MOVE.has(it.id)) el.classList.add('mmove');

  /* the middle button always walks the plane about, whatever else is going on —
     and Firefox's autoscroll has to be told to stay out of it */
  svg.addEventListener('mousedown', e => { if(e.button === 1) e.preventDefault(); });
  svg.addEventListener('pointerdown', e => {
    if(e.button === 1){
      e.stopPropagation(); e.preventDefault();
      return dragView(svg, el, it, page, e, 'both');
    }
    if(e.button !== 0) return;
    if(!mathMode && !mathAim) return;                /* out of math mode a plot is just an item */
    if(PLOT_MOVE.has(it.id)) return;                 /* …and in move mode it is one again */
    e.stopPropagation(); e.preventDefault();
    if(mathAim) return aimHit({ it, page }, e);
    select(it.id);
    const h = e.target.closest ? e.target.closest('[data-h]') : null;
    const parts = h ? String(h.dataset.h).split(':') : [''];
    const kind = parts[0], oid = parts[1];
    if(kind === 'bas') return dragBasis(svg, el, it, page, e, oid);
    if(kind === 'vec' || kind === 'vect' || kind === 'veco') return dragVec(svg, el, it, page, e, oid, kind);
    if(mathTool === 'vec') return dragNewVec(svg, el, it, page, e);
    if(kind === 'fn' || kind === 'dat') return selectMath(it.id, kind, oid);
    selectMath(it.id, null);
    dragView(svg, el, it, page, e, kind === 'ax' ? oid : 'both');
  });
  /* The wheel zooms the plane about the pointer whether or not the maths bar is
     out — a chart you have just dropped a table into is the usual case, and
     nobody turns maths mode on to read one. Two ways past it: ctrl+wheel is the
     desk's own zoom everywhere in the app, and a plot picked up to be moved
     (double-click) is an item again, so the wheel walks the desk under it. */
  svg.addEventListener('wheel', e => {
    if(e.ctrlKey || e.metaKey || PLOT_MOVE.has(it.id)) return;
    e.preventDefault(); e.stopPropagation();
    /* by an amount rather than a step, the way the desk does it: a notch is the
       ~12% it always was, and a trackpad creeps instead of leaping */
    zoomPlot(el, it, page, svg, e, Math.exp(clamp(wheelPx(e), -120, 120) * 0.001));
  }, { passive:false });
  /* double-click steps out of the grid and back into the notebook, and again to
     step back in — so a plot never stops being a thing on a page */
  el.addEventListener('dblclick', e => {
    if(!mathMode || e.target.closest('.mchip, .mleg')) return;
    e.stopPropagation(); e.preventDefault();
    plotMove(el, it, !PLOT_MOVE.has(it.id));
  });

  /* the little text box */
  chips.addEventListener('pointerdown', e => e.stopPropagation());
  chips.addEventListener('dblclick', e => e.stopPropagation());
  chips.addEventListener('keydown', e => {
    if(e.key === 'Enter' || e.key === 'Escape'){ e.preventDefault(); e.target.blur(); }
  });
  /* which column feeds which axis — a series reads its table again and the
     picture follows, without the table having to be touched */
  chips.addEventListener('change', e => {
    if(e.target.tagName !== 'SELECT') return;
    const o = mathSel && mathSel.kind === 'dat' ? mathObj(it, 'dat', mathSel.id) : null;
    if(!o || !e.target.dataset.k) return;
    o[e.target.dataset.k] = +e.target.value;
    tbSeriesSync(o);
    queueSave(page.id); paintPlot(el, it);
  });
  chips.addEventListener('input', e => {
    if(e.target.tagName === 'SELECT') return;         // a column picker, handled on change
    const o = mathSel && mathObj(it, mathSel.kind, mathSel.id);
    if(!o) return;
    const k = e.target.dataset.k;
    if(k === 'lab') o.lab = e.target.value.slice(0, 6);
    else if(k === 'expr') o.expr = e.target.value;
    else if(k === 'x' || k === 'y'){
      const r = mxNum(e.target.value);
      e.target.classList.toggle('bad', !!r.err);
      if(r.err) return;
      o[k] = r.v; delete o.was;
    }
    queueSave(page.id); paintPlot(el, it);
  });
  chips.addEventListener('click', e => {
    const b = e.target.closest('button');
    if(!b || !mathSel) return;
    const o = mathObj(it, mathSel.kind, mathSel.id);
    if(!o) return;
    const a = b.dataset.a;
    /* picking a colour by hand takes the colour wire off, if there is one:
       whichever was touched last is the one that means it */
    if(a === 'color'){
      o.c = MATH_COLORS[(MATH_COLORS.indexOf(o.c) + 1) % MATH_COLORS.length];
      if(o.cs){ delete o.cs; if(typeof ndLay === 'function') ndLay(); }
    }
    else if(a === 'style') o.s = MATH_STYLES[(MATH_STYLES.indexOf(o.s || 'solid') + 1) % MATH_STYLES.length];
    else if(a === 'comp') o.comp = o.comp ? 0 : 1;
    else if(a === 'marks') o.m = DAT_MARKS[(DAT_MARKS.indexOf(o.m || 'dots') + 1) % DAT_MARKS.length];
    else if(a === 'fit'){ plotFitData(it); syncMathBar(); }
    else if(a === 'del'){
      const arr = mathArr(it, mathSel.kind);
      arr.splice(arr.indexOf(o), 1);
      queueSave(page.id); SND.pluck(); selectMath(it.id, null); return;
    }
    queueSave(page.id); paintPlot(el, it);
  });

  /* the key under the picture picks things too */
  const leg = el.querySelector('.mleg');
  leg.addEventListener('pointerdown', e => e.stopPropagation());
  leg.addEventListener('click', e => {
    const b = e.target.closest('[data-o]');
    if(!b) return;
    e.stopPropagation();
    const p = String(b.dataset.o).split(':');
    if(mathAim && p[0] === 'vec'){
      const aim = mathAim; mathAim = null;
      const v = mathObj(it, 'vec', p[1]);
      if(v) applyMatrix(aim.m, { it, page }, v);
      syncMathBar(); return;
    }
    select(it.id);
    selectMath(it.id, p[0], p[1]);
  });
}

/* ---- the view, around the points ----
   Data rarely lands anywhere near the ten units either side of zero a fresh
   plot shows, so dropping a table walks the window over to it. The box is
   worked out in world units — where the axes live — so it is still right when
   the basis is not the standard one. */
function plotFitData(it){
  const B = mbasis(it);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0;
  for(const d of datOf(it)) for(const p of datPts(d)){
    const x = nz(p[0], 0), y = nz(p[1], 0);
    const ex = Math.abs(nz(p[2], 0)), ey = Math.abs(nz(p[3], 0));
    for(const q of [[x - ex, y], [x + ex, y], [x, y - ey], [x, y + ey]]){
      const wx = B[0] * q[0] + B[1] * q[1], wy = B[2] * q[0] + B[3] * q[1];
      if(!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
      y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
      n++;
    }
  }
  if(!n) return false;
  /* a column of one value, or of the same value all the way down, still needs a
     window with some width to it */
  const px = (x1 - x0) * 0.11 || Math.max(Math.abs(x1) * 0.25, 1);
  const py = (y1 - y0) * 0.11 || Math.max(Math.abs(y1) * 0.25, 1);
  /* …the same on every side. A chart's numbers are written outside its frame
     now, so the window no longer has to be lopsided to keep the points clear of
     them, and the readings sit in the middle of the picture where they belong. */
  it.xmin = x0 - px; it.xmax = x1 + px;
  it.ymin = y0 - py; it.ymax = y1 + py;
  return true;
}

/* ---- what the buttons on a plot do ---- */
const FN_SEED = ['x^2', 'sin(x)', '1/x', 'sqrt(x)', 'exp(x)', 'x^3-2x'];
function plotAct(a, it, page){
  const g = plotGeom(it);
  if(a === 'fn'){
    const f = { id:uid(), expr:FN_SEED[fnsOf(it).length % FN_SEED.length], c:nextColor(it), s:'solid' };
    fnsOf(it).push(f);
    queueSave(page.id); SND.plop();
    selectMath(it.id, 'fn', f.id);
    const inp = plotEl(it) && plotEl(it).querySelector('.mchip .mexp');
    if(inp){ inp.focus(); inp.select(); }
    return;
  }
  if(a === 'vec'){
    mathTool = mathTool === 'vec' ? 'pan' : 'vec';
    if(mathTool === 'vec'){ const e = plotEl(it); if(e) plotMove(e, it, false); }
    setMath(true); syncMathBar(); return;
  }
  /* fill the page: the window keeps its width and grows to the paper's shape */
  if(a === 'fill'){
    const m = 4, top = 7;
    it.rot = 0; it.x = m; it.y = top; it.w = 100 - 2 * m;
    const ar = (pgH() * (100 - top - 6) / 100) / (pgW() * it.w / 100);
    /* a chart keeps its window and changes shape; a plane keeps its shape and
       shows more of itself */
    if(nz(it.ar, 0) > 0) it.ar = clamp(ar, 0.2, 2.6);
    else {
      const cy = (nz(it.ymax, 3.4) + nz(it.ymin, -3.4)) / 2, sy = g.sx * clamp(ar, 0.2, 2.6);
      it.ymin = cy - sy / 2; it.ymax = cy + sy / 2;
    }
    const e = plotEl(it);
    if(e){ plotMove(e, it, false); e.style.left = it.x + '%'; e.style.top = it.y + '%'; e.style.width = it.w + '%'; e.style.transform = 'rotate(0deg)'; }
    SND.plop();
  }
  else if(a === 'grid') it.grid = ['solid', 'dashed', 'dotted', 'blank'][(['solid', 'dashed', 'dotted', 'blank'].indexOf(it.grid || 'solid') + 1) % 4];
  else if(a === 'axes') it.axes = it.axes === 0 ? 1 : it.axes === 2 ? 0 : 2;
  else if(a === 'basis') it.bshow = it.bshow ? 0 : 1;
  else if(a === 'home'){
    it.xmin = -g.sx / 2; it.xmax = g.sx / 2; it.ymin = -g.sy / 2; it.ymax = g.sy / 2;
  }
  else if(a === 'reset'){ setBasisTo({ it, page }, [1, 0, 0, 1]); return; }
  queueSave(page.id); mrepaint(it); syncMathBar();
}

/* ---- transformations, shown happening ---- */
function mathAnim(ms, step, done){
  const t0 = performance.now();
  const tick = () => {
    const t = clamp((performance.now() - t0) / ms, 0, 1);
    step(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    if(t < 1) requestAnimationFrame(tick); else if(done) done();
  };
  requestAnimationFrame(tick);
}
/* the matrix is walked in from the identity, so you watch the vector turn and
   stretch instead of finding it somewhere else */
function applyMatrix(M, f, v){
  const it = f.it, x0 = nz(v.x, 0), y0 = nz(v.y, 0);
  v.was = [x0, y0];
  const el = plotEl(it);
  SND.plop();
  mathAnim(760, t => {
    const A = [1 + t * (M[0] - 1), t * M[1], t * M[2], 1 + t * (M[3] - 1)];
    v.x = A[0] * x0 + A[1] * y0; v.y = A[2] * x0 + A[3] * y0;
    if(el) paintPlot(el, it);
  }, () => {
    const p = mapply(M, x0, y0);
    v.x = Math.round(p[0] * 1e6) / 1e6; v.y = Math.round(p[1] * 1e6) / 1e6;
    queueSave(f.page.id);
    if(el) paintPlot(el, it);
    syncMathBar();
  });
}
function setBasisTo(f, M){
  const it = f.it, B = mbasis(it).slice(), el = plotEl(it);
  SND.plop();
  mathAnim(760, t => {
    it.basis = B.map((v, i) => v + (M[i] - v) * t);
    if(el) paintPlot(el, it);
  }, () => {
    it.basis = M.slice();
    if(it.bshow == null) it.bshow = 1;
    queueSave(f.page.id);
    if(el) paintPlot(el, it);
    syncMathBar();
  });
}
/* pointing a card at something */
function startAim(mit, page, kind){
  const plots = pagePlots();
  if(!plots.length){ mathHint('put a coordinate system on the page first'); setMath(true); return; }
  if(kind === 'draw'){                               /* a vector card, into a plot */
    if(plots.length === 1){ plotAddVec(plots[0], mit); mrepaint(plots[0].it); return; }
    mathAim = { kind, box:mit, lab:mit.lab || 'v' };
  } else if(kind === 'data'){                        /* a table, into a plot */
    if(plots.length === 1){ plotAddTable(plots[0], mit); return; }
    mathAim = { kind, box:mit, lab:'the table' };
  } else if(kind === 'basis'){
    if(plots.length === 1) return setBasisTo(plots[0], m2(mit.m));
    mathAim = { kind, m:m2(mit.m), lab:mit.lab || 'M' };
  } else {
    const all = [];
    plots.forEach(f => vecsOf(f.it).forEach(v => all.push({ f, v })));
    if(!all.length){ mathHint('draw a vector first — ⇗ Vector, then drag'); setMath(true); return; }
    if(all.length === 1) return applyMatrix(m2(mit.m), all[0].f, all[0].v);
    mathAim = { kind, m:m2(mit.m), lab:mit.lab || 'M' };
  }
  setMath(true); syncMathBar();
}
function aimHit(f, e){
  const aim = mathAim;
  if(aim.kind === 'mul'){ mathHint('click the other card — a matrix or a vector'); return; }
  if(aim.kind === 'draw'){ mathAim = null; plotAddVec(f, aim.box); mrepaint(f.it); syncMathBar(); return; }
  if(aim.kind === 'data'){ mathAim = null; plotAddTable(f, aim.box); syncMathBar(); return; }
  if(aim.kind === 'basis'){ mathAim = null; setBasisTo(f, aim.m); syncMathBar(); return; }
  const h = e.target.closest ? e.target.closest('[data-h]') : null;
  const p = h ? String(h.dataset.h).split(':') : [''];
  const v = /^vec/.test(p[0]) ? mathObj(f.it, 'vec', p[1]) : null;
  if(!v){ mathHint('that is not a vector — click one, or Esc'); return; }
  mathAim = null;
  applyMatrix(aim.m, f, v);
  syncMathBar();
}
/* ---- dropping a card onto something ----
   A matrix landing on a vector transforms it, and one landing on the paper
   becomes the basis; a vector card landing anywhere on a plot is drawn in it,
   and so is a table — two of its columns become the points. */
function vecUnder(el, it, ev){
  const svg = el.querySelector('svg.mplot');
  if(!svg) return null;
  const q = svgAt(svg, ev), g = plotGeom(it);
  let best = null, bd = 46;
  for(const v of vecsOf(it)){
    const d = segDist(q, g.P(nz(v.ox, 0), nz(v.oy, 0)), g.P(nz(v.x, 1), nz(v.y, 1)));
    if(d < bd){ bd = d; best = v; }
  }
  return best;
}
/* what may be picked up and dropped onto a plot (or onto another card) */
const MATH_CARD = { matrix:1, vecbox:1, calc:1, table:1, node:1 };
function mathDrop(ev, selfEl, drag){
  for(const n of document.elementsFromPoint(ev.clientX, ev.clientY)){
    const el = n.closest && n.closest('#pageHost .item');
    if(!el || el === selfEl) continue;
    const pg = pageOfEl(el);
    const it = pg && pg.items.find(x => x.id === el.dataset.id);
    if(!it) return null;
    if(it.type === 'plot')
      return { el, it, page:pg, math:{ vec:drag.type === 'matrix' ? vecUnder(el, it, ev) : null } };
    /* a card carried onto something this file has never heard of — a node —
       is that feature's business; see ndDropOn in js/items/node.js */
    const nd = typeof ndDropOn === 'function' ? ndDropOn(drag, it) : null;
    if(nd) return { el, it, page:pg, math:nd };
    if(productOf(drag, it)) return { el, it, page:pg, math:{} };
    /* two cards whose sizes don't fit: still a target, so the drop can say why */
    if(cardFace(drag) && cardFace(it)) return { el, it, page:pg, math:{ no:1 } };
    return null;
  }
  return null;
}
function doMathDrop(page, it, drop, home){
  if(drop.math && drop.math.nd) return ndDoDrop(page, it, drop, home);
  if(drop.math && drop.math.no){                     /* the sizes don't fit — say so and stay apart */
    makeProduct(page, it, drop.it);
    queueSave(page.id);
    return;
  }
  if(drop.it.type === 'plot'){
    const f = { it:drop.it, page:drop.page };
    const is2 = it.type === 'matrix' && matDims(it).r === 2 && matDims(it).c === 2;
    if(it.type === 'table') plotAddTable(f, it);
    else if(it.type === 'node') plotAddNode(f, it);
    else if(it.type === 'vecbox' || (it.type === 'calc' && it.op === 'mv')){
      const F = cardFace(it);                        /* a folded answer draws like any vector */
      plotAddVec(f, { v:F.a, lab:F.lab, c:F.col || it.c, s:F.sty || it.s });
    }
    else if(drop.math.vec && is2) applyMatrix(m2(it.m), f, drop.math.vec);
    else if(it.type === 'calc' || is2){
      const F = cardFace(it);
      if(F && !F.vec && F.r === 2 && F.c === 2) setBasisTo(f, F.a);
      else { setMath(true); mathHint('only a 2×2 fits a plane — this is ' + F.r + '×' + F.c); }
    }
    else { setMath(true); mathHint('only a 2×2 fits a plane — this is ' + matDims(it).r + '×' + matDims(it).c); }
    it.x = home.x; it.y = home.y;                    /* the card goes back where it came from */
    queueSave(page.id);
    const el = document.querySelector('#pageHost .item[data-id="' + it.id + '"]');
    if(el){ el.style.left = it.x + '%'; el.style.top = it.y + '%'; }
    return;
  }
  makeProduct(page, it, drop.it);
}

defineItem('plot', {
  add: { plot: base => ({ ...base, type:'plot', w:46, rot:0, cap:'',
                          xmin:-5, xmax:5, ymin:-3.4, ymax:3.4,
                          grid:'solid', axes:1, bshow:0, basis:[1, 0, 0, 1], fns:[], vecs:[] }) },
  html: (it, c) => '<figure class="body plot"><div class="mplotbox">' + plotSVG(it, c.live) +
    (c.live ? '<div class="mchips"></div>' : '') + '</div>' +
    '<div class="mleg">' + plotLegend(it) + '</div><figcaption></figcaption></figure>',
  after(){ setMath(true); },         // a new plot hands the mouse to the plane
  forget(it){
    if(mathSel && mathSel.pid === it.id) mathSel = null;
    PLOT_MOVE.delete(it.id);
  },
  tools(mk, it, el, page){
    mk('ƒ(x)', 'Draw a function in here', () => plotAct('fn', it, page));
    mk('⇗', 'Vector — drag one out inside the plot', () => plotAct('vec', it, page));
    mk('▦', 'Grid — solid, dashed, dotted or blank', b => { plotAct('grid', it, page); b.title = 'Grid: ' + it.grid; });
    mk('î ĵ', 'Show the basis vectors — drag their tips to change the basis', () => plotAct('basis', it, page));
    mk('FIT', 'Fill the page with it', () => plotAct('fill', it, page));
    mk('✥', 'Move it about the page — or double-click it', () => plotMove(el, it, !PLOT_MOVE.has(it.id)));
    mk('⌂', 'Put the origin back in the middle', () => plotAct('home', it, page));
    mk('⟲', 'Back to the standard basis', () => plotAct('reset', it, page));
  },
  wire(el, it, page){ wirePlot(el, it, page); }
});
onNoteOpen(() => { mathSel = null; PLOT_MOVE.clear(); });

/* ---- how it looks ---- */
addCSS('plot', `
/* ---------- maths ---------- */
.mathbar{gap:7px;padding:10px 12px}
.mathbar button{font-size:13px;padding:8px 11px;border-radius:3px}
.mathbar .lab{font-size:12px}
.mathbar .num{width:64px;font-family:var(--mono);font-size:13px;text-align:center;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.14);border-radius:3px;color:#e6e3db;padding:6px 3px;margin-left:4px}
.mathbar .num:focus{border-color:var(--accent2);outline:none}
.mathbar .num.bad{border-color:var(--accent);color:#ff9d8a}
.mathbar .num:disabled{opacity:.35}
.mathbar .hint{text-transform:none;letter-spacing:.04em;font-style:italic}
.mathbar .hint.loud{color:var(--accent);opacity:1}
.mathbar #mBasisTag{text-transform:none;letter-spacing:.04em;color:#fff;opacity:.6}
.mathbar.noplot #mFn,.mathbar.noplot #mVec,.mathbar.noplot #mGrid,.mathbar.noplot #mFill,
.mathbar.noplot #mAxis,.mathbar.noplot #mBasis,.mathbar.noplot #mHome,.mathbar.noplot #mReset{opacity:.4}
.plot{display:block}
.mplotbox{position:relative}
svg.mplot{display:block;width:100%;height:auto;background:none}
.mplot .mbg{fill:var(--paper);opacity:.78}
.mplot .mframe{fill:none;stroke:var(--line);stroke-width:3;pointer-events:none}
.mplot path.mgrid{fill:none;stroke:var(--line);stroke-width:2.6}
.mplot .mgrid.g-dashed{stroke-dasharray:13 11}
.mplot .mgrid.g-dotted{stroke-dasharray:0.1 13;stroke-linecap:round;stroke-width:3.4}
.mplot .mgrid.mghost{opacity:.34;stroke-dasharray:none}
.mplot .munit{fill:var(--accent2);opacity:.15;stroke:none}
.mplot path.max{fill:none;stroke:var(--ink);stroke-width:4;opacity:.85}
.mplot .maxh{fill:var(--ink);opacity:.85}
.mplot path.mtick{fill:none;stroke:var(--ink);stroke-width:3;opacity:.6}
.mplot .mnum{fill:var(--soft);font-family:var(--mono);font-size:34px;text-anchor:middle}
.mplot .mnum.end{text-anchor:end}
/* Every "fill:none" here is pinned to path: an arrowhead is a <polygon> of the
   same class, and a stylesheet beats the fill= it is drawn with — which is
   exactly how the heads went missing once already. Same for stroke-linecap: a
   dotted line needs the round caps dashAttr asks for. */
.mplot path.mfn{fill:none;stroke-width:6.5;stroke-linecap:round;stroke-linejoin:round}
/* a table's points, its error bars, and what its columns were called */
.mplot path.mdline{fill:none;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.mplot circle.mdot{stroke:var(--paper);stroke-width:2.5}
.mplot path.mdeb{fill:none;stroke-width:3.6;opacity:.9}
/* the names of the axes: centred on the one they belong to and set outside the
   frame, the y one reading up the side — plt.xlabel and plt.ylabel */
.mplot .mxlab,.mplot .mylab{fill:var(--ink);opacity:.78;font-family:var(--mono);font-size:32px;
  letter-spacing:1.5px;text-anchor:middle}
.mplot .mdots{stroke:none}
.mchip.mdat{flex-wrap:wrap;white-space:normal;gap:2px;max-width:calc(var(--scale)*318px)}
.mchip select{font:inherit;font-size:calc(var(--scale)*12px);color:#fff;border:0;border-radius:2px;
  background:rgba(255,255,255,.12);padding:calc(var(--scale)*2px);outline:none;
  max-width:calc(var(--scale)*84px)}
.mchip select:focus{background:rgba(255,255,255,.26)}
.mchip select option{color:#16191d;background:#fff}
.mplot path.mvec{stroke-width:8.5;fill:none}
.mplot polygon.mvec{stroke:none}
.mplot .mwas{opacity:.32}
.mplot path.mwas{stroke-width:6;fill:none}
.mplot polygon.mwas{stroke:none}
.mplot path.mwarc{fill:none;stroke-width:3.4;stroke-dasharray:9 11;opacity:.5}
.mplot path.mcomp{fill:none;stroke-width:4;stroke-dasharray:14 10;opacity:.65}
.mplot .mvlab{font-family:var(--body);font-style:italic;font-size:44px;font-weight:600}
.mplot path.mb{fill:none;stroke-width:10}
.mplot polygon.mb{stroke:none}
.mplot .mbi{stroke:var(--accent)}
.mplot polygon.mbi,.mplot text.mbi{fill:var(--accent);stroke:none}
.mplot .mbj{stroke:var(--accent2)}
.mplot polygon.mbj,.mplot text.mbj{fill:var(--accent2);stroke:none}
.mplot .mblab{font-family:var(--body);font-size:42px;font-weight:600}
.mplot path.mhit{fill:none;stroke:transparent;stroke-width:26;stroke-linecap:round;pointer-events:none}
.mplot .mgrab{fill:transparent;pointer-events:none}
body.mathing .mplot .mhit,body.mathing .mplot .mgrab{pointer-events:stroke}
body.mathing .mplot .mgrab{pointer-events:all}
body.mathing .item[data-type="plot"] svg.mplot{cursor:grab}
body.mathing .item[data-type="plot"] svg.mplot:active{cursor:grabbing}
body.vectool .item[data-type="plot"] svg.mplot{cursor:crosshair}
body.mathing .mplot [data-h="ax:x"]{cursor:ns-resize}
body.mathing .mplot [data-h="ax:y"]{cursor:ew-resize}
body.mathing .mplot [data-h^="vec"],body.mathing .mplot [data-h^="bas"]{cursor:move}
body.mathaim .mplot .mhit,body.mathaim .mplot .mgrab{pointer-events:stroke;cursor:crosshair}
body.mathaim .item[data-type="plot"]{cursor:crosshair}
body.mathaim .item[data-type="plot"] .mbg{opacity:.95}
/* double-click takes a plot out of the grid and back into the notebook */
body.mathing .item[data-type="plot"].mmove svg.mplot{cursor:grab}
body.mathing .item[data-type="plot"].mmove .mhit,
body.mathing .item[data-type="plot"].mmove .mgrab{pointer-events:none}
.item.mmove .plot{box-shadow:0 0 0 calc(var(--scale)*2px) var(--accent),
  0 calc(var(--scale)*10px) calc(var(--scale)*22px) rgba(0,0,0,.25)}
.item.mmove .plot::after{content:"✥ move — double-click to work in the grid";position:absolute;
  right:0;top:100%;margin-top:calc(var(--scale)*3px);white-space:nowrap;pointer-events:none;
  font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.08em;
  color:#fff;background:var(--accent);padding:calc(var(--scale)*2px) calc(var(--scale)*6px);border-radius:2px}
`);
/* its tile in the palette */
defineTool({ kind:'plot', cat:'math', label:'Axes', icon:'plot', order:10,
  hint:'A coordinate system — functions, vectors and a table’s points are drawn in it' });
