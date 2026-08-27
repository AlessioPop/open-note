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
let mathTool = 'pan';                              // 'vec' while a vector is being pulled out
let mathToolPlot = null;                           // the plot whose local vector button armed it
let mathSel = null;                                // {pid, kind:'fn'|'vec', id} — what the chip is on
let mathAim = null;                                // a matrix looking for something to act on
let hintT = 0;
const nz = (v, d) => Number.isFinite(+v) ? +v : d;
const near0 = v => Math.abs(v) < 1e-9 ? 0 : v;

/* Plot tools are local to the selected coordinate system. The only page-wide
   state left here is transient: one vector drag, or a card waiting for a plot
   or another card. */
function syncMathState(){
  document.body.classList.toggle('mathaim', !!mathAim);
  document.querySelectorAll('#pageHost .item[data-type="plot"]').forEach(el =>
    el.classList.toggle('vectool', mathTool === 'vec' && mathToolPlot === el.dataset.id));
}
function mathHint(t){
  const h = $('#saveTag');
  if(!h) return;
  h.textContent = t;
  h.classList.add('show');
  clearTimeout(hintT);
  hintT = setTimeout(() => h.classList.remove('show'), 2600);
}
function aimHint(aim){
  if(!aim) return '';
  return aim.kind === 'basis' ? 'click a coordinate system to make ' + aim.lab + ' its basis'
    : aim.kind === 'draw' ? 'click the coordinate system to draw ' + aim.lab + ' in'
    : aim.kind === 'data' ? 'click the coordinate system to plot ' + aim.lab + ' in'
    : aim.kind === 'mul' ? 'click the card to multiply ' + aim.lab + ' by'
    : 'click the vector ' + aim.lab + ' should transform';
}

/* a number the way a person would write it */
function mfmt(v, dp){
  if(!Number.isFinite(v)) return '—';
  let s = (+v).toFixed(dp == null ? 3 : dp);
  if(s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

/* the expression compiler lives in js/lib/mathexpr.js: mxCompile, mxNum */

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
/* ---- numbers on an axis ----
   How a tick is written: fixed decimals from the step, or, once the numbers
   are huge or tiny, a mantissa and a power of ten — 1.5×10⁴ — with the power
   lifted as a <tspan>. The plain text and the width come back with it, for
   measuring: 19 picture units per glyph of the 34px face, 13 per lifted one. */
/* the decimals a step needs: its power of ten, and one more for each place
   its own mantissa carries — 0.25 wants two, 0.2 one, 2 none */
function axDp(step){
  const e = Math.floor(Math.log10(Math.abs(step)) + 1e-9), m = Math.abs(step) / Math.pow(10, e);
  let dp = Math.max(0, -e);
  for(let k = 0; k < 3 && Math.abs(m * Math.pow(10, k) - Math.round(m * Math.pow(10, k))) > 1e-6; k++) dp++;
  return Math.min(dp, 12);
}
function axLab(v, step, sci){
  if(Math.abs(v) < 1e-12 * Math.abs(step)) return { t:'0', svg:'0', w:19 };
  const e = Math.floor(Math.log10(Math.abs(v)) + 1e-9);
  if(sci == null) sci = axSci(step, v);
  if(sci){
    /* as many decimals of the mantissa as the step asks for */
    const m = mfmt(v / Math.pow(10, e), Math.min(6, axDp(Math.abs(step) / Math.pow(10, e))));
    const mant = m === '1' ? '' : m === '-1' ? '-' : m + '×';
    return { t: mant + '10^' + e, w: (mant.length + 2) * 19 + String(e).length * 13,
             svg: esc(mant) + '10<tspan class="msup" dy="-12" font-size="24">' + e + '</tspan>' };
  }
  const t = mfmt(v, axDp(step));
  return { t, svg: esc(t), w: t.length * 19 };
}
/* one way of writing for the whole axis: powers of ten once its step is
   under a ten-thousandth or its reach is in the millions, else plain */
const axSci = (step, reach) => Math.abs(step) < 1e-4 || Math.abs(reach) >= 1e6;
/* the ticks along one axis, {v, lab, minor}. A linear axis steps by a nice
   number. A log one marks the decades, with 2…9 between them as quiet lines —
   2 and 5 named too when fewer than two decades are in view. With less than
   one decade showing it is a linear axis in all but its spacing. */
function axTicks(a0, a1, step, log){
  const out = [], reach = Math.max(Math.abs(a0), Math.abs(a1));
  if(log){
    const n0 = Math.ceil(Math.log10(a0) - 1e-9), n1 = Math.floor(Math.log10(a1) + 1e-9);
    if(n1 >= n0 && n1 - n0 <= 40){
      const few = n1 - n0 < 2, sci = axSci(Math.pow(10, n0), reach);
      for(let n = n0 - 1; n <= n1; n++){
        const d = Math.pow(10, n);
        if(n >= n0) out.push({ v:d, i:n, lab:axLab(d, d, sci), minor:false });
        for(let m = 2; m <= 9; m++){
          const v = m * d;
          if(v > a0 && v < a1) out.push({ v, i:n, lab: few && (m === 2 || m === 5) ? axLab(v, d, sci) : null, minor:true });
        }
      }
      return out;
    }
    step = niceStep(a1 - a0);
  }
  const i0 = Math.ceil(a0 / step - 1e-9), i1 = Math.floor(a1 / step + 1e-9);
  if(i1 - i0 > 260) return out;                    /* a window a million steps wide asks for nothing */
  const sci = axSci(step, reach);
  for(let i = i0; i <= i1; i++) out.push({ v:near0(i * step), i, lab:axLab(i * step, step, sci), minor:false });
  return out;
}
/* every k-th number, counted from zero so they do not shuffle while panning */
function axThin(ticks, k){
  if(k <= 1) return ticks;
  for(const t of ticks) if(t.lab && (t.minor || t.i % k !== 0)) t.lab = null;
  return ticks;
}
const axWide = t => t.reduce((m, k) => k.lab ? Math.max(m, k.lab.w) : m, 0);

function plotGeom(it){
  const lx = it.lx === 1, ly = it.ly === 1;
  let x0 = nz(it.xmin, -5), x1 = nz(it.xmax, 5), y0 = nz(it.ymin, -3.4), y1 = nz(it.ymax, 3.4);
  /* a log axis has no zero and no negative side: a window written before the
     axis was turned on is pulled over to where it can be drawn */
  if(lx){ if(!(x1 > 0)){ x0 = 0.1; x1 = 100; } else if(!(x0 > 0)) x0 = x1 / 1000; }
  if(ly){ if(!(y1 > 0)){ y0 = 0.1; y1 = 100; } else if(!(y0 > 0)) y0 = y1 / 1000; }
  const tx = lx ? Math.log10 : v => v, ty = ly ? Math.log10 : v => v;
  const itx = lx ? v => Math.pow(10, v) : v => v, ity = ly ? v => Math.pow(10, v) : v => v;
  const X0 = tx(x0), X1 = tx(x1), Y0 = ty(y0), Y1 = ty(y1);
  const sx = Math.max(1e-6, x1 - x0), sy = Math.max(1e-6, y1 - y0);      /* the window, in its own units */
  const SX = Math.max(1e-6, X1 - X0), SY = Math.max(1e-6, Y1 - Y0);      /* …and as the picture measures it */
  /* The picture is as tall as the window it shows, so a square of coordinates
     comes out square — which is the whole point when there are vectors in it.
     Data is the exception: seconds against metres have no shared scale, and
     insisting on one gives a picture 2.6 times taller than it is wide. So a
     plot that has been handed a table keeps a shape of its own in `ar`, and
     the two axes are then scaled apart, the way any chart is. */
  /* A logarithmic view keeps the shape the plot had when log mode began.
     Decades and linear units do not have a meaningful shared aspect ratio, so
     deriving the element's height from SY/SX makes a harmless pan or scale
     toggle stretch the item. Charts already carry their own fixed ratio. */
  const logAr = clamp(nz(it.logAspect, 0.68), 0.2, 2.6);
  const W = PLOT_W, H = clamp(nz(it.ar, 0) > 0 ? W * it.ar : (lx || ly) ? W * logAr : W * SY / SX, W * 0.2, W * 2.6);
  /* A log axis and a basis do not mix: with the picture no longer a linear
     image of the plane, î and ĵ, the unit square and a sheared lattice would
     mean nothing. Turning a log axis on puts the standard basis back. */
  const B = lx || ly ? [1, 0, 0, 1] : mbasis(it), det = mdet(B);
  const kx = W / SX, ky = H / SY;
  const S = (wx, wy) => [(tx(wx) - X0) * kx, H - (ty(wy) - Y0) * ky];     /* world  → picture */
  const P = (x, y) => S(B[0] * x + B[1] * y, B[2] * x + B[3] * y);         /* coords → picture */
  const wAt = (px, py) => [itx(px / kx + X0), ity((H - py) / ky + Y0)];    /* picture → world */
  const U = Math.abs(det) > 1e-9                                           /* world  → coords */
    ? (wx, wy) => [(B[3] * wx - B[1] * wy) / det, (B[0] * wy - B[2] * wx) / det]
    : (wx, wy) => [wx, wy];
  /* One step across both axes is what keeps a square square, and a plane wants
     that. A chart's axes are measured in different things — seconds against
     metres — so each gets a step of its own, or one of them ends up with its
     numbers written on top of each other. A plane with a log axis on one side
     has nothing to share either. */
  const chart = nz(it.ar, 0) > 0, shared = !chart && !lx && !ly;
  let stepX = shared ? niceStep(Math.max(sx, sy)) : chart ? axisStep(sx, W, 130) : niceStep(sx);
  let stepY = shared ? stepX : chart ? axisStep(sy, H, 72) : niceStep(sy);
  let tX = axTicks(x0, x1, stepX, lx), tY = axTicks(y0, y1, stepY, ly);
  /* ---- room for the numbers ----
     A chart may coarsen its step until its numbers fit side by side. A plane
     keeps its step — the lattice is the point — and names every k-th line
     instead, so no two numbers are ever written over each other. */
  if(chart && !lx) for(let k = 0; k < 6 && tX.length > 1 && axWide(tX) + 18 > stepX * kx; k++){ stepX = nextNice(stepX); tX = axTicks(x0, x1, stepX, false); }
  const gapX = lx ? kx : stepX * kx, gapY = ly ? ky : stepY * ky;
  tX = axThin(tX, Math.ceil((axWide(tX) + 18) / gapX));
  tY = axThin(tY, Math.ceil(46 / gapY));
  /* ---- the margin round a chart ----
     A plane writes its numbers along its own axes, through the middle of the
     picture, and needs no room outside it — that is the sketchbook look and it
     is left exactly as it was. A chart of readings has nothing near the origin,
     so its numbers and the names of its axes go *outside* the frame, the way
     every chart ever drawn has them. That room has to come from somewhere: the
     picture keeps its 1000 units of plotting area and the viewBox grows around
     it, so nothing inside has to know that the margin is there at all. */
  const dl = chart ? datLabels(it) : { x:'', y:'' };
  const lab = { x: String(it.xl || dl.x || ''), y: String(it.yl || dl.y || '') };
  const axes = chart && it.axes !== 0, nums = axes && it.axes !== 2;
  const wide = nums ? Math.max(19, axWide(tY)) : 19;
  const mL = !axes ? 0 : (nums ? clamp(wide + 26, 60, 320) : 10) + (lab.y ? 52 : 0);
  const mB = !axes ? 0 : (nums ? 62 : 10) + (lab.x ? 52 : 0);
  const mT = axes ? 26 : 0;
  const mR = !axes ? 0 : (nums ? 54 : 10);
  return { x0, x1, y0, y1, sx, sy, W, H, B, det, kx, ky, S, P, U, wAt,
           lx, ly, tx, ty, itx, ity, X0, X1, Y0, Y1, SX, SY, tX, tY,
           chart, stepX, stepY, lab, axes, nums,
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
/* the lattice: a line at each x across the box, a line at each y along it */
function gridLines(xs, ys, box, map){
  let v = '', h = '';
  for(const x of xs){
    const a = map(x, box[2]), b = map(x, box[3]);
    v += 'M' + rd1(a[0]) + ' ' + rd1(a[1]) + 'L' + rd1(b[0]) + ' ' + rd1(b[1]);
  }
  for(const y of ys){
    const a = map(box[0], y), b = map(box[1], y);
    h += 'M' + rd1(a[0]) + ' ' + rd1(a[1]) + 'L' + rd1(b[0]) + ' ' + rd1(b[1]);
  }
  return v + h;
}
/* the multiples of a step inside a stretch — the lines of a linear lattice */
function stepsIn(st, a0, a1){
  const i0 = Math.floor(a0 / st), i1 = Math.ceil(a1 / st), out = [];
  if(i1 - i0 > 260) return out;                    /* a near-singular basis asks for millions */
  for(let i = i0; i <= i1; i++) out.push(i * st);
  return out;
}
/* rings and spokes — the polar lattice, drawn through the basis like the other
   one, so it shears with it. On the standard basis a ring is two arcs rather
   than seventy-two points. */
function polarGrid(g, box){
  const R = Math.max.apply(null, [[box[0], box[2]], [box[1], box[2]], [box[0], box[3]], [box[1], box[3]]].map(q => Math.hypot(q[0], q[1])));
  const st = g.chart ? Math.min(g.stepX, g.stepY) : g.stepX;
  const n = Math.floor(R / st);
  if(n > 60 || n < 1) return '';
  const plain = mIdent(g.B), o = g.P(0, 0);
  let d = '';
  for(let k = 1; k <= n; k++){
    const r = k * st;
    if(plain){
      const rx = rd1(r * g.kx), ry = rd1(r * g.ky);
      d += 'M' + rd1(o[0] - r * g.kx) + ' ' + rd1(o[1]) + 'a' + rx + ' ' + ry + ' 0 1 0 ' + rd1(2 * r * g.kx) + ' 0a' + rx + ' ' + ry + ' 0 1 0 ' + rd1(-2 * r * g.kx) + ' 0';
    } else {
      const q = [];
      for(let i = 0; i <= 72; i++){ const a = i / 72 * Math.PI * 2; q.push(g.P(r * Math.cos(a), r * Math.sin(a))); }
      d += polyD(q);
    }
  }
  const every = n <= 3 ? 15 : 30;
  for(let a = 0; a < 360; a += every){
    const t = a * Math.PI / 180, e = g.P(R * Math.cos(t), R * Math.sin(t));
    d += mline(o, e);
  }
  return d;
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
const mathArr = (it, kind) => kind === 'fn' ? fnsOf(it) : kind === 'dat' ? datOf(it) : kind === 'vec' ? vecsOf(it) : [];
/* `on` is absent on everything ever saved, and absent means shown: only an
   explicit 0 takes a thing off the picture */
const hidden = o => o.on === 0;
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

/* what a function is called in the key and the panel: a bare expression is
   y = …, a bare one in θ is r = …, and anything with its own = or < is itself */
function fnLabel(f){
  const src = String(f.expr || ''), c = mxCompile(src);
  if(!c.ast || c.err || c.rel || c.kind === 'points' || c.kind === 'param') return src || '…';
  return (c.kind === 'polar' ? 'r = ' : 'y = ') + src;
}

/* ---- drawing one ---- */
/* ---- the sampler ----
   One walk serves every kind of curve: `at(u)` says where the point for a
   parameter u is, in coordinates, and the walk takes it through P. A point that
   is not a number lifts the pen, and so does a jump of more than a picture and
   a half — that is an asymptote, and the line is not drawn across it. Points far
   off the picture are pulled in to "far enough", so a path never carries
   numbers in the millions. Back comes a list of runs of picture points. */
function plotSample(g, N, u0, u1, at){
  const runs = [];
  let run = null, prev = null;
  for(let i = 0; i <= N; i++){
    const u = u0 + (u1 - u0) * i / N;
    let q; try{ q = at(u); }catch(e){ q = null; }
    if(!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])){ run = null; prev = null; continue; }
    const p = g.P(q[0], q[1]);
    /* A logarithmic axis rejects zero and the negative side. Lift the pen at
       that boundary instead of writing NaN into the SVG path and losing the
       otherwise valid positive run with it. */
    if(!Number.isFinite(p[0]) || !Number.isFinite(p[1])){ run = null; prev = null; continue; }
    p[0] = clamp(p[0], -2 * g.W, 3 * g.W); p[1] = clamp(p[1], -2 * g.H, 3 * g.H);
    if(prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > g.H * 1.6) run = null;
    if(!run) runs.push(run = []);
    run.push(p); prev = p;
  }
  return runs.filter(r => r.length > 1);
}
const runsD = runs => runs.map(r => 'M' + r.map(p => rd1(p[0]) + ' ' + rd1(p[1])).join('L')).join('');
/* the whole run, closed against the far edge of the picture on the side the
   inequality says — below the curve, above it, left of it, right of it */
function runsRegion(g, runs, side){
  return runs.map(r => {
    const a = r[0], b = r[r.length - 1];
    const e = side === 'below' ? [[b[0], 3 * g.H], [a[0], 3 * g.H]] : side === 'above' ? [[b[0], -2 * g.H], [a[0], -2 * g.H]]
            : side === 'left' ? [[-2 * g.W, b[1]], [-2 * g.W, a[1]]] : [[3 * g.W, b[1]], [3 * g.W, a[1]]];
    return 'M' + r.concat(e).map(p => rd1(p[0]) + ' ' + rd1(p[1])).join('L') + 'z';
  }).join('');
}
const PLOT_BUSY = new Set();                       // plots with a pointer on them: coarser, quicker
const IMPL_MEMO = new Map();                        // the last few implicit fields, by what made them
/* the field of an equation or a region, sampled over the picture. Bound to the
   window, the basis and the text, so a vector dragged across a plot with a
   circle on it does not cost the circle again. */
function implField(g, it, c, key){
  const k = key + '|' + [g.x0, g.x1, g.y0, g.y1, g.W, g.H].map(v => rd1(v)).join(',') + '|' + g.B.join(',') +
            '|' + (PLOT_BUSY.has(it.id) ? 48 : 96);
  let fld = IMPL_MEMO.get(k);
  if(fld) return fld;
  const ev = c.ev;
  const F = (px, py) => { const w = g.wAt(px, py), q = g.U(w[0], w[1]); return ev(q[0], q[1], 0); };
  fld = ctField(F, g.W, g.H, PLOT_BUSY.has(it.id) ? 48 : 96);
  if(IMPL_MEMO.size > 40) IMPL_MEMO.clear();
  IMPL_MEMO.set(k, fld);
  return fld;
}
/* one expression, drawn: the region it shades (under the axes), the curve or
   points it draws (over them), and what the mouse may find */
function fnDraw(g, it, f, box, live){
  const out = { reg:'', cur:'', hit:'' };
  const c = mxCompile(f.expr);
  if(!c.ast || c.err) return out;
  const col = esc(f.c || MATH_COLORS[0]), hit = d => live ? '<path class="mhit" data-h="fn:' + esc(f.id) + '" d="' + d + '"/>' : '';
  const curve = (d, dash) => d ? '<path class="mfn" d="' + d + '" stroke="' + col + '"' + dashAttr(dash || f.s) + '/>' + hit(d) : '';
  const dom = Array.isArray(f.dom) && f.dom.length === 2 && f.dom.every(Number.isFinite) && f.dom[1] > f.dom[0] ? f.dom : [0, Math.PI * 2];
  const K = c.kind;
  if(K === 'expy' || K === 'expx'){
    const ev = c.ev;
    if(K === 'expy' && c.complex && c.evc){
      /* a complex answer over a real x: its real part solid, its imaginary part
         dashed in the same colour — unless every answer turned out real */
      const evc = c.evc;
      let any = false;
      const re = plotSample(g, 700, box[0], box[1], x => { const z = evc(x, 0, 0); if(Math.abs(z[1]) > 1e-9) any = true; return [x, z[0]]; });
      out.cur += curve(runsD(re));
      if(any) out.cur += curve(runsD(plotSample(g, 700, box[0], box[1], x => [x, evc(x, 0, 0)[1]])), 'dashed');
      return out;
    }
    const runs = K === 'expy' ? plotSample(g, 700, box[0], box[1], x => [x, ev(x, 0, 0)])
                              : plotSample(g, 700, box[2], box[3], y => [ev(0, y, 0), y]);
    out.cur += curve(runsD(runs));
    return out;
  }
  if(K === 'polar'){
    const ev = c.ev;
    out.cur += curve(runsD(plotSample(g, 1440, dom[0], dom[1], th => { const r = ev(0, 0, th); return [r * Math.cos(th), r * Math.sin(th)]; })));
    return out;
  }
  if(K === 'param'){
    const at = c.evc ? t => c.evc(0, 0, t) : t => [c.evx(0, 0, t), c.evy(0, 0, t)];
    out.cur += curve(runsD(plotSample(g, 1000, dom[0], dom[1], at)));
    return out;
  }
  if(K === 'points'){
    for(const q of c.pts){
      const p = g.P(q[0], q[1]);
      if(!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      out.cur += '<circle class="mdot" cx="' + rd1(p[0]) + '" cy="' + rd1(p[1]) + '" r="10" fill="' + col + '"/>';
      if(live) out.hit += '<circle class="mgrab" data-h="fn:' + esc(f.id) + '" cx="' + rd1(p[0]) + '" cy="' + rd1(p[1]) + '" r="17"/>';
    }
    return out;
  }
  if(K === 'ineq' && (c.sub === 'expy' || c.sub === 'expx')){
    /* the region leans on a curve: each run of it, closed against the edge */
    const evb = c.evb;
    const runs = c.sub === 'expy' ? plotSample(g, 700, box[0], box[1], x => [x, evb(x, 0, 0)])
                                  : plotSample(g, 700, box[2], box[3], y => [evb(0, y, 0), y]);
    const side = c.sub === 'expy' ? (c.below ? 'below' : 'above') : (c.below ? 'left' : 'right');
    out.reg += '<path class="mreg" d="' + runsRegion(g, runs, side) + '" fill="' + col + '"/>';
    out.cur += curve(runsD(runs), c.strict ? 'dashed' : f.s);
    return out;
  }
  if(K === 'implicit' || K === 'ineq'){
    if(Math.abs(g.det) <= 1e-9) return out;         /* no way back from the picture to coordinates */
    const fld = implField(g, it, c, f.expr);
    if(K === 'ineq') out.reg += '<path class="mreg" d="' + ctFill(fld) + '" fill="' + col + '"/>';
    out.cur += curve(ctCurve(fld), K === 'ineq' && c.strict ? 'dashed' : f.s);
    return out;
  }
  return out;
}
function plotInner(it, live){
  const g = plotGeom(it), B = g.B, plain = mIdent(B);
  /* the clip is named after the item, so it is unique across every plot on a
     page — and in an export, which builds them all into one file — and stays
     the same from one repaint to the next */
  const id = 'mp-' + esc(it.id);
  const chart = g.chart, stepX = g.stepX, stepY = g.stepY;
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
    /* a log axis rules its lines where its ticks are, the quiet 2…9 fainter */
    const major = t => t.filter(k => !k.minor).map(k => k.v), minor = t => t.filter(k => k.minor).map(k => k.v);
    if(it.pol === 1 && !g.lx && !g.ly){
      /* Polar is a coordinate system, not a decoration on the square one. */
      s += '<path class="mpolar g-' + esc(it.grid || 'solid') + '" d="' + polarGrid(g, box) + '"/>';
    } else {
      const xs = g.lx ? major(g.tX) : stepsIn(stepX, box[0], box[1]);
      const ys = g.ly ? major(g.tY) : stepsIn(stepY, box[2], box[3]);
      if(!plain)
        s += '<path class="mgrid mghost" d="' + gridLines(stepsIn(stepX, g.x0, g.x1), stepsIn(stepY, g.y0, g.y1), [g.x0, g.x1, g.y0, g.y1], g.S) + '"/>';
      if(g.lx || g.ly)
        s += '<path class="mgrid minor g-' + esc(it.grid || 'solid') + '" d="' + gridLines(g.lx ? minor(g.tX) : [], g.ly ? minor(g.tY) : [], box, g.P) + '"/>';
      s += '<path class="mgrid g-' + esc(it.grid || 'solid') + '" d="' + gridLines(xs, ys, box, g.P) + '"/>';
    }
  }
  /* the unit square goes with the basis vectors: its area is the determinant */
  if(it.bshow && !g.lx && !g.ly){
    const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(p => g.P(p[0], p[1]));
    s += '<polygon class="munit" points="' + q.map(p => rd1(p[0]) + ',' + rd1(p[1])).join(' ') + '"/>';
  }
  /* every expression, worked out once; a region is shaded under the axes or a
     half-plane would hide the very axis it is drawn against, and a switched-off
     one stays on the list and off the picture */
  const drawn = fnsOf(it).filter(f => !hidden(f)).map(f => fnDraw(g, it, f, box, live));
  for(const d of drawn) s += d.reg;
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
    const numC = (chart || !lowY) ? 'mnum end' : 'mnum start';
    for(const t of g.tX){
      if(t.minor && !t.lab) continue;
      const px = g.S(t.v, 0)[0];
      if(t.v === 0 && !chart) continue;
      /* on a chart the ticks are on the frame, pointing out, where the numbers
         are — on a plane they cross the axis they belong to */
      tk += chart ? 'M' + rd1(px) + ' ' + rd1(g.H) + 'v13'
                  : 'M' + rd1(px) + ' ' + rd1(ay - 7) + 'v14';
      /* a number sitting on the frame would be sliced in half by it, and one in
         the corner where the two axes meet would land on the other axis's */
      if(t.lab && (chart || (px > 30 && px < g.W - 30 && (!lowY || Math.abs(px - ax) > 34))))
        nums += '<text class="mnum" x="' + rd1(px) + '" y="' + rd1(numY) + '">' + t.lab.svg + '</text>';
    }
    for(const t of g.tY){
      if(t.minor && !t.lab) continue;
      const py = g.S(0, t.v)[1];
      if(t.v === 0 && !chart) continue;
      tk += chart ? 'M0 ' + rd1(py) + 'h-13'
                  : 'M' + rd1(ax - 7) + ' ' + rd1(py) + 'h14';
      if(t.lab && (chart || (py > 22 && py < g.H - 14 && (!lowX || Math.abs(py - ay) > 28))))
        nums += '<text class="' + numC + '" x="' + rd1(numX) + '" y="' + rd1(py + 11) + '">' + t.lab.svg + '</text>';
    }
    let furn = '<path class="mtick" d="' + tk + '"/>';
    /* …and on a plane the 0 is only written where the origin actually is —
       a log axis has no origin to write it at */
    const origin = !g.lx && !g.ly && o[0] > 30 && o[0] < g.W - 8 && o[1] > 12 && o[1] < g.H - 12;
    if(it.axes !== 2) furn += nums + (!chart && origin
      ? '<text class="mnum end" x="' + rd1(ax - 13) + '" y="' + rd1(ay + 36) + '">0</text>' : '');
    /* ---- and what they are called ----
       On a chart: the headings the columns were under, or what was typed over
       them, centred on the axis each belongs to and set outside it —
       plt.xlabel and plt.ylabel, down to the y one reading up the side of the
       picture. On a plane: at the arrowhead of each axis, inside, and while
       selected a faint x and y stand there to be clicked and named. */
    if(chart){
      if(g.lab.x) furn += '<text class="mxlab" x="' + rd1(g.W / 2) + '" y="' + rd1(g.H + g.mB - 14) +
        '"' + (live ? ' data-h="lab:x"' : '') + '>' + esc(g.lab.x) + '</text>';
      /* Turned a quarter turn anticlockwise, the letters stand *left* of the line
         they are written along — so the baseline goes at the inner edge of the
         band kept for it, not the outer, or the tops of them are cut off by the
         edge of the picture. */
      if(g.lab.y) furn += '<text class="mylab" transform="translate(' + rd1(38 - g.mL) + ' ' +
        rd1(g.H / 2) + ') rotate(-90)"' + (live ? ' data-h="lab:y"' : '') + '>' + esc(g.lab.y) + '</text>';
    } else {
      const ghost = live && selected === it.id;
      /* above the numbers when the axis is pinned to the bottom and they sit on top of it */
      if(g.lab.x || ghost) furn += '<text class="mxlab plane' + (g.lab.x ? '' : ' ghost') + '" x="' + rd1(g.W - 48) +
        '" y="' + rd1(ay - (lowX ? 52 : 16)) + '"' + (live ? ' data-h="lab:x"' : '') + '>' + esc(g.lab.x || 'x') + '</text>';
      if(g.lab.y || ghost) furn += '<text class="mylab plane' + (g.lab.y ? '' : ' ghost') + '" x="' + rd1(ax + 18) +
        '" y="' + rd1(40) + '"' + (live ? ' data-h="lab:y"' : '') + '>' + esc(g.lab.y || 'y') + '</text>';
    }
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
  if(it.bshow && !g.lx && !g.ly) [['i', [1, 0], 'î', -7, -21], ['j', [0, 1], 'ĵ', 21, 13]].forEach(k => {
    const o = g.P(0, 0), b = g.P(k[1][0], k[1][1]), hd = headSize(o, b, 29);
    s += '<path class="mb mb' + k[0] + '" d="' + mline(o, shorten(o, b, hd * 0.7)) + '"/>' +
         '<polygon class="mb mb' + k[0] + ' fill" points="' + arrowPts(o, b, hd) + '"/>' +
         '<text class="mblab mb' + k[0] + '" x="' + rd1(b[0] + k[3]) + '" y="' + rd1(b[1] + k[4]) + '">' + k[2] + '</text>';
  });
  /* functions: the curves, over the axes — their regions went down before them */
  for(const d of drawn) s += d.cur + d.hit;
  /* a table's points: the error bars go down first, then the line through them,
     then the marks on top, so nothing a point says is hidden by its own whisker */
  for(const d of datOf(it)){
    if(hidden(d)) continue;
    const c = d.c || MATH_COLORS[2], pts = datPts(d), mode = d.m || 'dots';
    const P = [], runs = [];
    let run = null;
    for(const p of pts){
      const q = g.P(nz(p[0], 0), nz(p[1], 0));
      if(!Number.isFinite(q[0]) || !Number.isFinite(q[1])){ run = null; continue; }
      P.push(q);
      if(!run) runs.push(run = []);
      run.push(q);
    }
    const lineD = runsD(runs.filter(r => r.length > 1));
    let eb = '';
    for(const p of pts){
      const x = nz(p[0], 0), y = nz(p[1], 0);
      const ex = Math.abs(nz(p[2], 0)), ey = Math.abs(nz(p[3], 0));
      if(ey > 0){ const a = g.P(x, y - ey), b = g.P(x, y + ey); if(a.concat(b).every(Number.isFinite)) eb += ebar(a, b, 12); }
      if(ex > 0){ const a = g.P(x - ex, y), b = g.P(x + ex, y); if(a.concat(b).every(Number.isFinite)) eb += ebar(a, b, 12); }
    }
    if(eb) s += '<path class="mdeb" d="' + eb + '" stroke="' + esc(c) + '"/>';
    if(mode !== 'dots' && lineD)
      s += '<path class="mdline" d="' + lineD + '" stroke="' + esc(c) + '"' + dashAttr(d.s) + '/>';
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
      if(mode !== 'dots' && lineD)
        s += '<path class="mhit" data-h="dat:' + esc(d.id) + '" d="' + lineD + '"/>';
      if(!many) for(const q of P)
        s += '<circle class="mgrab" data-h="dat:' + esc(d.id) + '" cx="' + rd1(q[0]) + '" cy="' +
             rd1(q[1]) + '" r="17"/>';
    }
  }
  /* vectors, and where a transformed one came from */
  for(const v of vecsOf(it)){
    if(hidden(v)) continue;
    const c = v.c || MATH_COLORS[1];
    const a = g.P(nz(v.ox, 0), nz(v.oy, 0)), b = g.P(nz(v.x, 1), nz(v.y, 1));
    if(!a.concat(b).every(Number.isFinite)) continue;
    if(v.was){
      const wb = g.P(v.was[0], v.was[1]), wh = headSize(a, wb, 21);
      if(wb.every(Number.isFinite)) s += '<path class="mwas" d="' + mline(a, shorten(a, wb, wh * 0.72)) + '" stroke="' + esc(c) + '"/>' +
        '<polygon class="mwas" points="' + arrowPts(a, wb, wh) + '" fill="' + esc(c) + '"/>' +
        '<path class="mwarc" d="' + mline(wb, b) + '" stroke="' + esc(c) + '"/>';
    }
    if(v.comp || (sel && sel.kind === 'vec' && sel.id === v.id)){
      const cx = g.P(nz(v.x, 1), 0), cy = g.P(0, nz(v.y, 1));
      const o = g.P(0, 0);
      if(o.concat(cx, cy).every(Number.isFinite)) s += '<path class="mcomp" stroke="' + esc(c) + '" d="' +
        mline(o, cx) + mline(cx, b) + mline(o, cy) + mline(cy, b) + '"/>';
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
  if(it.bshow && !g.lx && !g.ly && live) [['i', [1, 0]], ['j', [0, 1]]].forEach(k => {
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
    '<button class="mpill' + (sel && sel.kind === k && sel.id === o.id ? ' on' : '') + (hidden(o) ? ' off' : '') +
    '" data-o="' + k + ':' + esc(o.id) + '"><i style="' + (hidden(o) ? 'box-shadow:inset 0 0 0 2px ' : 'background:') +
    esc(o.c || '#888') + '"></i>' + esc(txt) + '</button>';
  const out = fnsOf(it).filter(f => f.expr).map(f => pill('fn', f, fnLabel(f)))
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
     rather than a third of the way in, where it would hang off the picture;
     an axis name's box sits by the name */
  const p = kind === 'vec' ? g.P(nz(o.x, 1), nz(o.y, 1))
          : kind === 'lab' ? (g.chart ? (o.id === 'x' ? [g.W * 0.5, g.H + g.mB - 40] : [-g.mL + 20, g.H * 0.5])
                                      : (o.id === 'x' ? [g.W - 200, clamp(g.S(0, 0)[1], 1, g.H - 1) - 50] : [clamp(g.S(0, 0)[0], 1, g.W - 1) + 24, 10]))
          : [g.W * (kind === 'dat' ? 0.02 : 0.32), 0];
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
  if(kind === 'lab')
    return '<div class="mchip' + (at.flip ? ' flip' : '') + '" data-for="lab:' + esc(o.id) + '" style="' + at.css + '">' +
      '<span class="mpar">' + o.id + ' axis</span><input class="mlab maxl" data-k="axl" value="' + esc(o.it[o.id + 'l'] || '') +
      '" title="What the ' + o.id + ' axis is called" spellcheck="false" placeholder="name">' + del + '</div>';
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
  if(typeof xpSync === 'function') xpSync(el, it);
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
  repaintPlots(); syncMathState();
}
function syncChip(el, it){
  const box = el.querySelector('.mchips');
  if(!box) return;
  const sel = mathSel && mathSel.pid === it.id ? mathSel : null;
  const o = sel ? (sel.kind === 'lab' ? { id:sel.id, it } : mathObj(it, sel.kind, sel.id)) : null;
  if(!o || sel.kind === 'fn'){ box.innerHTML = ''; return; }   /* a function is edited in the panel */
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
  const X0 = g.X0, X1 = g.X1, Y0 = g.Y0, Y1 = g.Y1, u0 = g.tx(w0[0]), v0 = g.ty(w0[1]);
  PLOT_BUSY.add(it.id);                            /* coarser equations while the hand is on it */
  mgrab(svg, e, ev => {
    /* in the picture's own measure — so a log axis pans by decades, not by units */
    const q = svgAt(svg, ev), w = g.wAt(q[0], q[1]);
    const dx = (axis === 'y' || axis === 'both') ? g.tx(w[0]) - u0 : 0;
    const dy = (axis === 'x' || axis === 'both') ? g.ty(w[1]) - v0 : 0;
    it.xmin = g.itx(X0 - dx); it.xmax = g.itx(X1 - dx);
    it.ymin = g.ity(Y0 - dy); it.ymax = g.ity(Y1 - dy);
    paintPlot(el, it); syncMathState();
  }, () => { PLOT_BUSY.delete(it.id); paintPlot(el, it); queueSave(page.id); });
}
let busyT = 0;
function plotBusy(el, it){
  PLOT_BUSY.add(it.id);
  clearTimeout(busyT);
  busyT = setTimeout(() => { PLOT_BUSY.delete(it.id); paintPlot(el, it); }, 180);
}
function zoomPlot(el, it, page, svg, ev, k){
  const g = plotGeom(it), q = svgAt(svg, ev), w = g.wAt(q[0], q[1]);
  if(g.SX * k < 1e-4 || g.SX * k > 1e7) return;
  /* about the point under the pointer, in the picture's own measure */
  const u = g.tx(w[0]), v = g.ty(w[1]);
  it.xmin = g.itx(u + (g.X0 - u) * k); it.xmax = g.itx(u + (g.X1 - u) * k);
  it.ymin = g.ity(v + (g.Y0 - v) * k); it.ymax = g.ity(v + (g.Y1 - v) * k);
  plotBusy(el, it);
  paintPlot(el, it); syncMathState(); queueSave(page.id);
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
      if(home){ vecsOf(it).pop(); selectMath(it.id, null); mathTool = 'pan'; mathToolPlot = null; mrepaint(it); syncMathState(); return; }
      v.ox = 0; v.oy = 0;                            /* a tap: from the origin to where you tapped */
    }
    /* one vector per press of the button: the tool puts itself away so the next
       drag moves the plane instead of littering it with arrows */
    mathTool = 'pan';
    mathToolPlot = null;
    queueSave(page.id); mrepaint(it); syncMathState();
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
const plotLog = it => it.lx === 1 || it.ly === 1;
/* The linear view kept while logarithmic axes are in use. On a coordinate
   plane, returning from log mode means returning to an origin-centred window;
   a data chart instead returns to the exact fitted window it had before. */
function plotLogHome(it){
  const d = Array.isArray(it.logHome) && it.logHome.length === 4 && it.logHome.every(Number.isFinite)
    ? it.logHome : [-5, 5, -3.4, 3.4];
  if(nz(it.ar, 0) > 0) return d.slice();
  const sx = Math.max(1e-6, d[1] - d[0]), sy = Math.max(1e-6, d[3] - d[2]);
  return [-sx / 2, sx / 2, -sy / 2, sy / 2];
}
function leaveLog(it, axis){
  const h = plotLogHome(it);
  if(axis === 'x'){ it.xmin = h[0]; it.xmax = h[1]; }
  else { it.ymin = h[2]; it.ymax = h[3]; }
  if(!plotLog(it)){
    it.xmin = h[0]; it.xmax = h[1]; it.ymin = h[2]; it.ymax = h[3];
    delete it.logHome; delete it.logAspect;
  }
}
function dragBasis(svg, el, it, page, e, which){
  if(plotLog(it)) return mathHint('a log axis and a basis do not mix');
  const b = mbasis(it).slice();
  it.basis = b;
  const st = snapStep(plotGeom(it));
  mgrab(svg, e, ev => {
    const c = coordAt(svg, it, ev);
    const x = msnap(c.wx, st, ev.shiftKey), y = msnap(c.wy, st, ev.shiftKey);
    if(which === 'i'){ b[0] = x; b[2] = y; } else { b[1] = x; b[3] = y; }
    paintPlot(el, it); syncMathState();
  }, () => { queueSave(page.id); mrepaint(it); });
}

/* ---- the plot, wired up ---- */
function wirePlot(el, it, page){
  const svg = el.querySelector('svg.mplot');
  if(!svg) return;
  /* a function written by an older build has no id; the panel needs one.
     Done here, on the live page only, so print and export leave records alone */
  for(const f of fnsOf(it)) if(!f.id) f.id = uid();
  if(typeof xpWire === 'function') xpWire(el, it, page);
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
    /* Once selected, a plot owns gestures inside its grid. The local vector
       button and cross-item targeting can also arm one gesture directly. */
    const vectorArmed = mathTool === 'vec' && mathToolPlot === it.id;
    if(!el.classList.contains('sel') && !mathAim && !vectorArmed) return;
    if(PLOT_MOVE.has(it.id)) return;                 /* …and in move mode it is one again */
    e.stopPropagation(); e.preventDefault();
    if(mathAim) return aimHit({ it, page }, e);
    select(it.id);
    const h = e.target.closest ? e.target.closest('[data-h]') : null;
    const parts = h ? String(h.dataset.h).split(':') : [''];
    const kind = parts[0], oid = parts[1];
    if(kind === 'lab'){ selectMath(it.id, 'lab', oid); const i = chips.querySelector('.mlab'); if(i){ i.focus(); i.select(); } return; }
    if(kind === 'bas') return dragBasis(svg, el, it, page, e, oid);
    if(kind === 'vec' || kind === 'vect' || kind === 'veco') return dragVec(svg, el, it, page, e, oid, kind);
    if(vectorArmed) return dragNewVec(svg, el, it, page, e);
    if(kind === 'fn' || kind === 'dat') return selectMath(it.id, kind, oid);
    selectMath(it.id, null);
    dragView(svg, el, it, page, e, kind === 'ax' ? oid : 'both');
  });
  /* The wheel zooms the plane about the pointer. Ctrl+wheel is still the desk's
     own zoom, and a plot picked up to be moved is an item again. */
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
    if(e.target.closest('.mchip, .mleg, .xpanel')) return;
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
    const k = e.target.dataset.k;
    if(k === 'axl' && mathSel && mathSel.kind === 'lab'){ /* an axis's name */
      it[mathSel.id + 'l'] = e.target.value.slice(0, 40);
      queueSave(page.id); paintPlot(el, it); return;
    }
    const o = mathSel && mathObj(it, mathSel.kind, mathSel.id);
    if(!o) return;
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
    if(mathSel.kind === 'lab'){                       /* ✕ takes the name off the axis */
      if(b.dataset.a === 'del'){ delete it[mathSel.id + 'l']; queueSave(page.id); selectMath(it.id, null); }
      return;
    }
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
    else if(a === 'fit'){ plotFitData(it); syncMathState(); }
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
      syncMathState(); return;
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
  /* a log axis cannot show the zero a margin would reach down to. Treat the
     two axes independently so a log-log fit repairs both sides in one pass. */
  const xmin = it.lx === 1 && x0 - px <= 0 ? (x0 > 0 ? x0 / 1.3 : x1 / 1000) : x0 - px;
  const ymin = it.ly === 1 && y0 - py <= 0 ? (y0 > 0 ? y0 / 1.3 : y1 / 1000) : y0 - py;
  /* …the same on every side. A chart's numbers are written outside its frame
     now, so the window no longer has to be lopsided to keep the points clear of
     them, and the readings sit in the middle of the picture where they belong. */
  it.xmin = xmin; it.xmax = x1 + px;
  it.ymin = ymin; it.ymax = y1 + py;
  return true;
}

/* ---- what the buttons on a plot do ---- */
function plotAct(a, it, page){
  const g = plotGeom(it);
  /* a new function is an empty row in the panel, with the caret in it */
  if(a === 'fn'){
    const el = plotEl(it);
    if(el && typeof xpAdd === 'function'){ select(it.id); xpAdd(el, it, page); }
    return;
  }
  if(a === 'vec'){
    const armed = mathTool === 'vec' && mathToolPlot === it.id;
    mathTool = armed ? 'pan' : 'vec';
    mathToolPlot = armed ? null : it.id;
    if(mathTool === 'vec'){ const e = plotEl(it); if(e) plotMove(e, it, false); }
    syncMathState(); return;
  }
  if(a === 'grid') it.grid = ['solid', 'dashed', 'dotted', 'blank'][(['solid', 'dashed', 'dotted', 'blank'].indexOf(it.grid || 'solid') + 1) % 4];
  else if(a === 'axes') it.axes = it.axes === 0 ? 1 : it.axes === 2 ? 0 : 2;
  else if(a === 'basis') it.bshow = it.bshow ? 0 : 1;
  else if(a === 'home'){
    /* the origin to the middle — a log axis, having none, is centred on 1 */
    if(g.lx){ const r = Math.sqrt(g.x1 / g.x0); it.xmin = 1 / r; it.xmax = r; } else { it.xmin = -g.sx / 2; it.xmax = g.sx / 2; }
    if(g.ly){ const r = Math.sqrt(g.y1 / g.y0); it.ymin = 1 / r; it.ymax = r; } else { it.ymin = -g.sy / 2; it.ymax = g.sy / 2; }
  }
  else if(a === 'logx' || a === 'logy'){
    const k = a === 'logx' ? 'lx' : 'ly';
    const axis = k === 'lx' ? 'x' : 'y', turningOn = it[k] !== 1;
    if(turningOn){
      if(!plotLog(it)){
        it.logHome = [g.x0, g.x1, g.y0, g.y1];
        it.logAspect = g.H / g.W;
      }
      it[k] = 1;
      /* the basis goes back to standard, and the window onto the positive side */
      if(!mIdent(mbasis(it))){ it.basis = [1, 0, 0, 1]; mathHint('the basis is back to standard — a log axis and a basis do not mix'); }
      it.bshow = 0;
      it.pol = 0;                                  /* polar and log are different coordinate systems */
      const n = plotGeom(it);
      it.xmin = n.x0; it.xmax = n.x1; it.ymin = n.y0; it.ymax = n.y1;
    } else { it[k] = 0; leaveLog(it, axis); }
  }
  else if(a === 'polar'){
    const on = it.pol !== 1;
    if(on && plotLog(it)){
      const h = plotLogHome(it);
      it.lx = 0; it.ly = 0;
      it.xmin = h[0]; it.xmax = h[1]; it.ymin = h[2]; it.ymax = h[3];
      delete it.logHome; delete it.logAspect;
    }
    it.pol = on ? 1 : 0;
  }
  else if(a === 'reset'){ setBasisTo({ it, page }, [1, 0, 0, 1]); return; }
  queueSave(page.id); mrepaint(it); syncMathState();
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
    syncMathState();
  });
}
function setBasisTo(f, M){
  if(plotLog(f.it) && !mIdent(m2(M))){ mathHint('a log axis and a basis do not mix'); return; }
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
    syncMathState();
  });
}
/* pointing a card at something */
function startAim(mit, page, kind){
  const plots = pagePlots();
  if(!plots.length){ mathHint('put a coordinate system on the page first'); return; }
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
    if(!all.length){ mathHint('draw a vector first — ⇗ Vector, then drag'); return; }
    if(all.length === 1) return applyMatrix(m2(mit.m), all[0].f, all[0].v);
    mathAim = { kind, m:m2(mit.m), lab:mit.lab || 'M' };
  }
  syncMathState(); mathHint(aimHint(mathAim));
}
function aimHit(f, e){
  const aim = mathAim;
  if(aim.kind === 'mul'){ mathHint('click the other card — a matrix or a vector'); return; }
  if(aim.kind === 'draw'){ mathAim = null; plotAddVec(f, aim.box); mrepaint(f.it); syncMathState(); return; }
  if(aim.kind === 'data'){ mathAim = null; plotAddTable(f, aim.box); syncMathState(); return; }
  if(aim.kind === 'basis'){ mathAim = null; setBasisTo(f, aim.m); syncMathState(); return; }
  const h = e.target.closest ? e.target.closest('[data-h]') : null;
  const p = h ? String(h.dataset.h).split(':') : [''];
  const v = /^vec/.test(p[0]) ? mathObj(f.it, 'vec', p[1]) : null;
  if(!v){ mathHint('that is not a vector — click one, or Esc'); return; }
  mathAim = null;
  applyMatrix(aim.m, f, v);
  syncMathState();
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
      if(F && !F.vec && F.r === 2 && F.c === 2) setBasisTo(f, F.a);       /* refused, with a word, on a log axis */
      else { mathHint('only a 2×2 fits a plane — this is ' + F.r + '×' + F.c); }
    }
    else { mathHint('only a 2×2 fits a plane — this is ' + matDims(it).r + '×' + matDims(it).c); }
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
                          grid:'solid', axes:1, bshow:0, basis:[1, 0, 0, 1], fns:[], vecs:[], xp:1 }) },
  key: e => typeof xpKey === 'function' && xpKey(e),
  /* the panel is live-only: print, export and the overview never see it */
  html: (it, c) => '<figure class="body plot">' + (c.live && typeof xpHTML === 'function' ? xpHTML(it) : '') +
    '<div class="mplotbox">' + plotSVG(it, c.live) +
    (c.live ? '<div class="mchips"></div>' : '') + '</div>' +
    '<div class="mleg">' + plotLegend(it) + '</div><figcaption></figcaption></figure>',
  forget(it){
    if(mathSel && mathSel.pid === it.id) mathSel = null;
    PLOT_MOVE.delete(it.id);
  },
  tools(mk, it, el, page){
    mk('ƒ(x)', 'The expressions drawn in here — show or hide the list', () => { if(typeof xpToggle === 'function') xpToggle(el, it, page); });
    mk('⇗', 'Vector — drag one out inside the plot', () => plotAct('vec', it, page));
    mk('▦', 'Grid — solid, dashed, dotted or blank', b => { plotAct('grid', it, page); b.title = 'Grid: ' + it.grid; });
    mk('î ĵ', 'Show the basis vectors — drag their tips to change the basis', () => plotAct('basis', it, page));
    mk('✥', 'Move it about the page — or double-click it', () => plotMove(el, it, !PLOT_MOVE.has(it.id)));
    mk('⌂', 'Put the origin back in the middle', () => plotAct('home', it, page));
    mk('⟲', 'Back to the standard basis', () => plotAct('reset', it, page));
  },
  wire(el, it, page){ wirePlot(el, it, page); }
});
onNoteOpen(() => {
  mathSel = null; mathAim = null; mathTool = 'pan'; mathToolPlot = null;
  PLOT_MOVE.clear(); syncMathState();
});

/* ---- how it looks ---- */
addCSS('plot', `
/* ---------- maths ---------- */
.plot{display:block}
.mplotbox{position:relative}
svg.mplot{display:block;width:100%;height:auto;background:none}
.mplot .mbg{fill:var(--paper);opacity:.78}
.mplot .mframe{fill:none;stroke:var(--line);stroke-width:3;pointer-events:none}
.mplot path.mgrid{fill:none;stroke:var(--line);stroke-width:2.6}
.mplot .mgrid.g-dashed{stroke-dasharray:13 11}
.mplot .mgrid.g-dotted{stroke-dasharray:0.1 13;stroke-linecap:round;stroke-width:3.4}
.mplot .mgrid.mghost{opacity:.34;stroke-dasharray:none}
.mplot .mgrid.minor{opacity:.38;stroke-width:1.8}
.mplot path.mpolar{fill:none;stroke:var(--line);stroke-width:2.2;opacity:.9}
.mplot path.mpolar.g-dashed{stroke-dasharray:13 11}
.mplot path.mpolar.g-dotted{stroke-dasharray:.1 13;stroke-linecap:round;stroke-width:3}
.mplot .munit{fill:var(--accent2);opacity:.15;stroke:none}
.mplot path.max{fill:none;stroke:var(--ink);stroke-width:4;opacity:.85}
.mplot .maxh{fill:var(--ink);opacity:.85}
.mplot path.mtick{fill:none;stroke:var(--ink);stroke-width:3;opacity:.6}
.mplot .mnum{fill:var(--soft);font-family:var(--mono);font-size:34px;text-anchor:middle}
.mplot .mnum.end{text-anchor:end}
.mplot .mnum.start{text-anchor:start}
/* Every "fill:none" here is pinned to path: an arrowhead is a <polygon> of the
   same class, and a stylesheet beats the fill= it is drawn with — which is
   exactly how the heads went missing once already. Same for stroke-linecap: a
   dotted line needs the round caps dashAttr asks for. */
.mplot path.mfn{fill:none;stroke-width:6.5;stroke-linecap:round;stroke-linejoin:round}
/* a shaded region: the fill comes from the attribute, so nothing here may set it */
.mplot path.mreg{fill-opacity:.16;fill-rule:evenodd;stroke:none}
/* a table's points, its error bars, and what its columns were called */
.mplot path.mdline{fill:none;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.mplot circle.mdot{stroke:var(--paper);stroke-width:2.5}
.mplot path.mdeb{fill:none;stroke-width:3.6;opacity:.9}
/* the names of the axes: centred on the one they belong to and set outside the
   frame, the y one reading up the side — plt.xlabel and plt.ylabel */
.mplot .mxlab,.mplot .mylab{fill:var(--ink);opacity:.78;font-family:var(--mono);font-size:32px;
  letter-spacing:1.5px;text-anchor:middle}
/* on a plane the names stand at the arrowheads, inside; a faint x and y wait
   there while the plot is selected to be clicked and named */
.mplot .mxlab.plane{text-anchor:end}
.mplot .mylab.plane{text-anchor:start}
.mplot .ghost{opacity:.28}
.item.sel[data-type="plot"] .mplot [data-h^="lab"]{cursor:text;pointer-events:all}
.mplot .mdots{stroke:none}
/* the key under the picture, and the little editing box that comes up on
   the thing you are working on — shared by everything the plot holds */
.mleg{display:flex;flex-wrap:wrap;gap:calc(var(--scale)*4px);margin-top:calc(var(--scale)*5px)}
.mleg:empty{display:none}
.mpill{display:inline-flex;align-items:center;gap:calc(var(--scale)*4px);font-family:var(--mono);
  font-size:calc(var(--scale)*12px);letter-spacing:.03em;color:var(--soft);background:none;
  border:1px solid var(--line);border-radius:2px;padding:calc(var(--scale)*3px) calc(var(--scale)*7px)}
.mpill i{display:block;width:calc(var(--scale)*9px);height:calc(var(--scale)*9px);border-radius:50%}
.mpill:hover{color:var(--ink);border-color:var(--accent2)}
.mpill.on{color:var(--ink);border-color:var(--accent2);background:color-mix(in srgb,var(--accent2) 15%,transparent)}
.mpill.det{color:var(--accent2);border-style:dashed}
.mpill.off{opacity:.55}
.mchip{position:absolute;z-index:24;display:flex;align-items:center;gap:1px;white-space:nowrap;
  transform:translate(calc(var(--scale)*11px),calc(var(--scale)*-15px));
  background:var(--ink);color:var(--paper);border-radius:3px;padding:calc(var(--scale)*3px);
  font-family:var(--mono);font-size:calc(var(--scale)*13px);
  box-shadow:0 calc(var(--scale)*5px) calc(var(--scale)*14px) rgba(0,0,0,.4)}
.mchip.flip{transform:translate(calc(var(--scale)*-11px),calc(var(--scale)*-15px))}
.mchip.flip .merr{left:auto;right:0}
.mchip input{font:inherit;color:#fff;background:rgba(255,255,255,.1);border:0;border-radius:2px;
  padding:calc(var(--scale)*2px) calc(var(--scale)*3px);outline:none;user-select:text}
.mchip input:focus{background:rgba(255,255,255,.22)}
.mchip input.bad{color:#ff9d8a}
.mchip .mval{width:calc(var(--scale)*50px);text-align:center}
.mchip .mlab{width:calc(var(--scale)*30px);text-align:center}
.mchip .mexp{width:calc(var(--scale)*124px)}
.mchip .mpar{opacity:.6;padding:0 1px}
.mchip button{color:var(--paper);line-height:1;border-radius:2px;padding:calc(var(--scale)*4px) calc(var(--scale)*6px)}
.mchip button:hover{background:var(--accent);color:#fff}
.mchip button.on{background:rgba(255,255,255,.24)}
.mchip .mdot{width:calc(var(--scale)*15px);height:calc(var(--scale)*15px);border-radius:50%;padding:0;
  border:1px solid rgba(255,255,255,.5)}
.mchip .msty{padding:calc(var(--scale)*4px)}
.mchip .msty b{display:block;width:calc(var(--scale)*19px);height:0;border-top:calc(var(--scale)*2px) solid var(--paper)}
.mchip .msty b.s-dashed{border-top-style:dashed}
.mchip .msty b.s-dotted{border-top-style:dotted}
.mchip .merr{position:absolute;left:0;top:100%;margin-top:calc(var(--scale)*4px);white-space:normal;
  max-width:calc(var(--scale)*230px);background:var(--accent);color:#fff;border-radius:2px;
  padding:calc(var(--scale)*3px) calc(var(--scale)*7px);font-size:calc(var(--scale)*11px)}
.mchip .merr:empty{display:none}
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
.item.sel[data-type="plot"] .mplot .mhit,.item.sel[data-type="plot"] .mplot .mgrab{pointer-events:stroke}
.item.sel[data-type="plot"] .mplot .mgrab{pointer-events:all}
.item.sel[data-type="plot"] svg.mplot{cursor:grab}
.item.sel[data-type="plot"] svg.mplot:active{cursor:grabbing}
.item.vectool[data-type="plot"] svg.mplot{cursor:crosshair}
.item.sel[data-type="plot"] .mplot [data-h="ax:x"]{cursor:ns-resize}
.item.sel[data-type="plot"] .mplot [data-h="ax:y"]{cursor:ew-resize}
.item.sel[data-type="plot"] .mplot [data-h^="vec"],.item.sel[data-type="plot"] .mplot [data-h^="bas"]{cursor:move}
body.mathaim .mplot .mhit,body.mathaim .mplot .mgrab{pointer-events:stroke;cursor:crosshair}
body.mathaim .item[data-type="plot"]{cursor:crosshair}
body.mathaim .item[data-type="plot"] .mbg{opacity:.95}
/* double-click takes a plot out of the grid and back into the notebook */
.item.sel[data-type="plot"].mmove svg.mplot{cursor:grab}
.item.sel[data-type="plot"].mmove .mhit,
.item.sel[data-type="plot"].mmove .mgrab{pointer-events:none}
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
