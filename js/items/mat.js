/* Open Note — items/mat.js
   arithmetic for matrices of any size */

/* ================= the n×m engine =================
   plot.js keeps its own little 2×2 kit — a plane's basis can never be anything
   else — but the cards outgrew it. Everything here works on {r, c, a}: rows,
   columns, and the numbers flat, row-major. cards.js and calc.js lean on this
   file and never do their own sums; nothing in here touches the page. */
const MTX = (r, c, a) => ({ r, c, a });
function mtxIdent(r, c){
  const a = [];
  for(let i = 0; i < r; i++) for(let j = 0; j < c; j++) a.push(i === j ? 1 : 0);
  return a;
}
/* long sums drift — 23.999999999997 is 24 to anyone reading a sketchbook */
function snapN(v){
  const r = Math.round(v);
  if(Math.abs(v - r) < 1e-9 * Math.max(1, Math.abs(v))) return r;
  return Math.abs(v) < 1e-12 ? 0 : v;
}
const mtxScale = M => M.a.reduce((s, x) => Math.max(s, Math.abs(x)), 0);
/* the 2D copy elimination wants — rows it can swap whole */
function mtxRows(M){
  const A = [];
  for(let i = 0; i < M.r; i++) A.push(M.a.slice(i * M.c, i * M.c + M.c).map(Number));
  return A;
}

function mtxMul(A, B){
  if(A.c !== B.r) return null;
  const out = new Array(A.r * B.c).fill(0);
  for(let i = 0; i < A.r; i++)
    for(let k = 0; k < A.c; k++){
      const v = A.a[i * A.c + k];
      if(!v) continue;
      for(let j = 0; j < B.c; j++) out[i * B.c + j] += v * B.a[k * B.c + j];
    }
  return MTX(A.r, B.c, out.map(snapN));
}
function mtxT(M){
  const a = [];
  for(let j = 0; j < M.c; j++) for(let i = 0; i < M.r; i++) a.push(M.a[i * M.c + j]);
  return MTX(M.c, M.r, a);
}
function mtxPow(M, n){
  let out = M;
  for(let k = 1; k < n; k++) out = mtxMul(out, M);
  return out;
}

function mtxDet(M){
  const n = M.r, a = M.a;
  if(M.c !== n) return null;
  if(n === 1) return a[0];
  if(n === 2) return snapN(a[0] * a[3] - a[1] * a[2]);
  if(n === 3) return snapN(                      /* closed forms keep whole numbers whole */
    a[0] * (a[4] * a[8] - a[5] * a[7]) -
    a[1] * (a[3] * a[8] - a[5] * a[6]) +
    a[2] * (a[3] * a[7] - a[4] * a[6]));
  const A = mtxRows(M), tol = 1e-12 * (mtxScale(M) + 1);
  let det = 1;
  for(let k = 0; k < n; k++){
    let best = k;
    for(let i = k + 1; i < n; i++) if(Math.abs(A[i][k]) > Math.abs(A[best][k])) best = i;
    if(Math.abs(A[best][k]) < tol) return 0;
    if(best !== k){ const t = A[k]; A[k] = A[best]; A[best] = t; det = -det; }
    det *= A[k][k];
    for(let i = k + 1; i < n; i++){
      const f = A[i][k] / A[k][k];
      if(!f) continue;
      for(let j = k; j < n; j++) A[i][j] -= f * A[k][j];
    }
  }
  return snapN(det);
}

/* Gauss–Jordan on [A | I]; null when it is singular */
function mtxInv(M){
  const n = M.r;
  if(M.c !== n) return null;
  const A = mtxRows(M), B = [], tol = 1e-11 * (mtxScale(M) + 1);
  for(let i = 0; i < n; i++){ B.push(new Array(n).fill(0)); B[i][i] = 1; }
  for(let k = 0; k < n; k++){
    let best = k;
    for(let i = k + 1; i < n; i++) if(Math.abs(A[i][k]) > Math.abs(A[best][k])) best = i;
    if(Math.abs(A[best][k]) < tol) return null;
    if(best !== k){
      let t = A[k]; A[k] = A[best]; A[best] = t;
      t = B[k]; B[k] = B[best]; B[best] = t;
    }
    const p = A[k][k];
    for(let j = 0; j < n; j++){ A[k][j] /= p; B[k][j] /= p; }
    for(let i = 0; i < n; i++){
      if(i === k || !A[i][k]) continue;
      const f = A[i][k];
      for(let j = 0; j < n; j++){ A[i][j] -= f * A[k][j]; B[i][j] -= f * B[k][j]; }
    }
  }
  const out = [];
  for(let i = 0; i < n; i++) for(let j = 0; j < n; j++) out.push(snapN(B[i][j]));
  return MTX(n, n, out);
}

/* ---- eigenvalues ----
   The classic route, sized for a card: squeeze the matrix to Hessenberg form
   with Householder reflections, then run shifted QR steps that peel
   eigenvalues off the bottom — a lone real one at a time, or a trailing 2×2
   whose quadratic hands over a conjugate pair. Eigenvectors come afterwards,
   from the null space of A − λI taken on the matrix as it was given. */
function mtxHess(A, n){
  for(let k = 0; k + 2 < n; k++){
    let s = 0;
    for(let i = k + 1; i < n; i++) s += A[i][k] * A[i][k];
    if(s < 1e-300) continue;
    const a = -Math.sign(A[k + 1][k] || 1) * Math.sqrt(s);
    const v = [A[k + 1][k] - a];
    for(let i = k + 2; i < n; i++) v.push(A[i][k]);
    let vn = 0;
    for(const x of v) vn += x * x;
    if(vn < 1e-300) continue;
    for(let j = 0; j < n; j++){                       /* reflect the rows below k… */
      let d = 0;
      for(let i = 0; i < v.length; i++) d += v[i] * A[k + 1 + i][j];
      d = 2 * d / vn;
      for(let i = 0; i < v.length; i++) A[k + 1 + i][j] -= d * v[i];
    }
    for(let i = 0; i < n; i++){                       /* …and the matching columns */
      let d = 0;
      for(let j = 0; j < v.length; j++) d += A[i][k + 1 + j] * v[j];
      d = 2 * d / vn;
      for(let j = 0; j < v.length; j++) A[i][k + 1 + j] -= d * v[j];
    }
  }
  for(let i = 2; i < n; i++) for(let j = 0; j + 1 < i; j++) A[i][j] = 0;
}
/* one shifted QR sweep of the leading (hi+1)² block, by Givens rotations */
function mtxQRStep(A, hi, mu){
  const cs = [], sn = [];
  for(let i = 0; i <= hi; i++) A[i][i] -= mu;
  for(let k = 0; k < hi; k++){
    const x = A[k][k], z = A[k + 1][k], r = Math.hypot(x, z) || 1e-300;
    const c = x / r, s = z / r;
    cs.push(c); sn.push(s);
    for(let j = k; j <= hi; j++){
      const t1 = A[k][j], t2 = A[k + 1][j];
      A[k][j] = c * t1 + s * t2;
      A[k + 1][j] = c * t2 - s * t1;
    }
  }
  for(let k = 0; k < hi; k++){
    const c = cs[k], s = sn[k], low = Math.min(k + 2, hi);
    for(let i = 0; i <= low; i++){
      const t1 = A[i][k], t2 = A[i][k + 1];
      A[i][k] = c * t1 + s * t2;
      A[i][k + 1] = c * t2 - s * t1;
    }
  }
  for(let i = 0; i <= hi; i++) A[i][i] += mu;
}
/* a basis of null(A − λI): eliminate, then read the free columns */
function mtxNull(M, lam){
  const n = M.r;
  const solve = tol => {
    const A = mtxRows(M);
    for(let i = 0; i < n; i++) A[i][i] -= lam;
    const piv = [];
    let row = 0;
    for(let col = 0; col < n && row < n; col++){
      let best = row;
      for(let i = row + 1; i < n; i++) if(Math.abs(A[i][col]) > Math.abs(A[best][col])) best = i;
      if(Math.abs(A[best][col]) <= tol) continue;
      const t = A[row]; A[row] = A[best]; A[best] = t;
      const p = A[row][col];
      for(let j = col; j < n; j++) A[row][j] /= p;
      for(let i = 0; i < n; i++){
        if(i === row || !A[i][col]) continue;
        const f = A[i][col];
        for(let j = col; j < n; j++) A[i][j] -= f * A[row][j];
      }
      piv.push(col); row++;
    }
    const out = [];
    for(let fc = 0; fc < n; fc++){
      if(piv.indexOf(fc) >= 0) continue;
      const v = new Array(n).fill(0);
      v[fc] = 1;
      piv.forEach((pc, i) => { v[pc] = -A[i][fc]; });
      /* the biggest part becomes 1, so [0.7071, 0.7071] reads as [1, 1] */
      let bi = 0;
      for(let i = 1; i < n; i++) if(Math.abs(v[i]) > Math.abs(v[bi])) bi = i;
      const s = v[bi] || 1;
      out.push(v.map(x => snapN(x / s)));
    }
    return out;
  };
  const t0 = 1e-8 * (mtxScale(M) + Math.abs(lam) + 1);
  let vs = solve(t0);
  if(!vs.length) vs = solve(t0 * 300);    /* a λ out of the iteration is a hair off — loosen once */
  return vs;
}
function mtxEig(M){
  const n = M.r, vals = [];
  if(n === 1) vals.push({ re: M.a[0], im: 0 });
  else {
    const A = mtxRows(M);
    mtxHess(A, n);
    let hi = n - 1, iter = 0, guard = 0;
    while(hi >= 0 && guard++ < 90 * n){
      if(hi === 0){ vals.push({ re: A[0][0], im: 0 }); hi--; continue; }
      const q = Math.abs(A[hi][hi - 1]) /
        (Math.abs(A[hi][hi]) + Math.abs(A[hi - 1][hi - 1]) + 1e-30);
      if(q < 1e-10){ vals.push({ re: A[hi][hi], im: 0 }); hi--; iter = 0; continue; }
      const q2 = hi < 2 ? 0 : Math.abs(A[hi - 1][hi - 2]) /
        (Math.abs(A[hi - 1][hi - 1]) + Math.abs(A[hi - 2][hi - 2]) + 1e-30);
      const a = A[hi - 1][hi - 1], b = A[hi - 1][hi], c = A[hi][hi - 1], d = A[hi][hi];
      const h = (a + d) / 2, det = a * d - b * c, disc = h * h - det;
      if(hi === 1 || q2 < 1e-10){                     /* a 2×2 has let go: its quadratic */
        if(disc >= 0){
          const s = Math.sqrt(disc);
          vals.push({ re: h + s, im: 0 }, { re: h - s, im: 0 });
        } else {
          const s = Math.sqrt(-disc);
          vals.push({ re: h, im: s }, { re: h, im: -s });
        }
        hi -= 2; iter = 0; continue;
      }
      let mu;                                          /* Wilkinson's shift… */
      if(disc >= 0){
        const s = Math.sqrt(disc), l1 = h + s, l2 = h - s;
        mu = Math.abs(l1 - d) < Math.abs(l2 - d) ? l1 : l2;
      } else mu = h;
      if(++iter % 13 === 0)                            /* …nudged when it sulks */
        mu = Math.abs(A[hi][hi - 1]) * 0.75 + Math.abs(d) * 0.25;
      mtxQRStep(A, hi, mu);
    }
    for(let i = hi; i >= 0; i--) vals.push({ re: A[i][i], im: 0 });  /* whatever would not settle, roughly */
  }
  vals.forEach(v => { v.re = snapN(v.re); v.im = snapN(v.im); });
  vals.sort((p, q) => {                                /* real ones first, biggest first */
    const pc = Math.abs(p.im) < 1e-12 ? 0 : 1, qc = Math.abs(q.im) < 1e-12 ? 0 : 1;
    if(pc !== qc) return pc - qc;
    if(p.re !== q.re) return q.re - p.re;
    return q.im - p.im;
  });
  /* eigenvectors for the real ones, from the matrix as given; a repeated λ
     draws from one null-space basis, and a defective one honestly runs dry */
  const pools = [];
  for(const v of vals){
    if(Math.abs(v.im) > 1e-9){ v.vec = null; continue; }
    let p = pools.find(g => Math.abs(g.l - v.re) < 1e-6 * (1 + Math.abs(v.re)));
    if(!p){ p = { l: v.re, vs: mtxNull(M, v.re), used: 0 }; pools.push(p); }
    v.vec = p.vs[p.used++] || null;
  }
  return { vals };
}
