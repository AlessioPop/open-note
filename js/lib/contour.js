/* Open Note — lib/contour.js
   where a field crosses zero, and where it is positive — marching squares
   over a picture-sized grid

   The plot hands over a function F(px, py) of *picture* coordinates and gets
   back path data in the same coordinates: the zero line of F as polylines, or
   the region F > 0 as rectangles and cell polygons. Sampling in picture space
   means the resolution is uniform as seen, clipping to the window is free, and
   a sheared basis cannot make the grid explode. No DOM in here. */

/* the field, sampled once at the corners of an nx × ny grid of cells */
function ctField(F, W, H, nx){
  nx = Math.max(8, Math.round(nx || 96));
  const ny = Math.max(8, Math.round(nx * H / W));
  const cw = W / nx, ch = H / ny;
  const v = new Float64Array((nx + 1) * (ny + 1));
  for(let j = 0; j <= ny; j++)
    for(let i = 0; i <= nx; i++){
      let f; try{ f = F(i * cw, j * ch); }catch(e){ f = NaN; }
      v[j * (nx + 1) + i] = Number.isFinite(f) ? f : NaN;
    }
  return { F, W, H, nx, ny, cw, ch, v };
}
const ctR1 = v => Math.round(v * 10) / 10;

/* Where an edge crosses zero, if it really does. Two ends of different sign
   can also mean the field went through infinity — 1/x, tan x — so the crossing
   is bisected a few times and then asked: is the field actually small here? A
   root says yes; a pole says no, and the edge is left alone. */
function ctCross(fld, x0, y0, a, x1, y1, b, strict){
  if(!(a > 0) === !(b > 0)) return null;              /* same side, or a NaN among them */
  if(Number.isNaN(a) || Number.isNaN(b)) return null;
  if(a === 0) return [x0, y0];                          /* the line runs through a corner */
  if(b === 0) return [x1, y1];
  let t = a / (a - b), lo = 0, hi = 1, fl = a, fh = b;
  for(let k = 0; k < 4; k++){
    let f; try{ f = fld.F(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); }catch(e){ f = NaN; }
    if(!Number.isFinite(f)) return strict ? null : [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    if((f > 0) === (fl > 0)){ lo = t; fl = f; } else { hi = t; fh = f; }
    t = fl === fh ? (lo + hi) / 2 : lo + (hi - lo) * fl / (fl - fh);
    if(!(t > lo && t < hi)) t = (lo + hi) / 2;
  }
  if(strict){
    let f; try{ f = fld.F(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); }catch(e){ f = NaN; }
    /* a root is smaller than both ends; a pole, bisected towards, has grown past them */
    if(!Number.isFinite(f) || Math.abs(f) > Math.max(Math.abs(a), Math.abs(b))) return null;
  }
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}
/* every edge's crossing, worked out once and shared by the two cells on it.
   hz[j*nx + i] is the edge from (i,j) to (i+1,j); vt[j*(nx+1) + i] the one
   from (i,j) to (i,j+1). undefined = not yet asked, null = no crossing. */
function ctEdges(fld, strict){
  const { nx, ny, cw, ch, v } = fld, S = nx + 1;
  const hz = new Array(nx * (ny + 1)), vt = new Array(S * ny);
  for(let j = 0; j <= ny; j++)
    for(let i = 0; i < nx; i++)
      hz[j * nx + i] = ctCross(fld, i * cw, j * ch, v[j * S + i], (i + 1) * cw, j * ch, v[j * S + i + 1], strict);
  for(let j = 0; j < ny; j++)
    for(let i = 0; i <= nx; i++)
      vt[j * S + i] = ctCross(fld, i * cw, j * ch, v[j * S + i], i * cw, (j + 1) * ch, v[(j + 1) * S + i], strict);
  return { hz, vt };
}

/* ---- the zero line ----
   Segments across each cell, then chained end to end into polylines so a
   dashed boundary dashes along the curve rather than restarting at every cell. */
function ctCurve(fld){
  const { nx, ny, v } = fld, S = nx + 1;
  const E = ctEdges(fld, true);
  const segs = [];
  for(let j = 0; j < ny; j++)
    for(let i = 0; i < nx; i++){
      const a = v[j * S + i], b = v[j * S + i + 1], c = v[(j + 1) * S + i + 1], d = v[(j + 1) * S + i];
      if(Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue;
      /* the crossings on the four sides: top, right, bottom, left */
      const pts = [E.hz[j * nx + i], E.vt[j * S + i + 1], E.hz[(j + 1) * nx + i], E.vt[j * S + i]].filter(Boolean);
      if(pts.length === 2) segs.push([pts[0], pts[1]]);
      else if(pts.length === 4){
        /* the saddle: pair them by the sign at the centre */
        const mid = (a + b + c + d) / 4;
        if((mid > 0) === (a > 0)) segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
        else segs.push([pts[0], pts[3]], [pts[1], pts[2]]);
      }
    }
  return ctChain(segs);
}
function ctChain(segs){
  const key = p => ctR1(p[0]) + ',' + ctR1(p[1]);
  const at = new Map();
  const link = (k, i) => { const l = at.get(k); if(l) l.push(i); else at.set(k, [i]); };
  segs.forEach((s, i) => { link(key(s[0]), i); link(key(s[1]), i); });
  const used = new Uint8Array(segs.length);
  const next = (k, not) => {
    const l = at.get(k);
    if(!l) return -1;
    for(const i of l) if(i !== not && !used[i]) return i;
    return -1;
  };
  let d = '';
  const walk = (i, end) => {
    /* from one end of a segment, follow whatever joins it */
    let s = '', cur = end, k = key(cur), n = next(k, i);
    while(n >= 0){
      used[n] = 1;
      const sg = segs[n];
      cur = key(sg[0]) === k ? sg[1] : sg[0];
      s += 'L' + ctR1(cur[0]) + ' ' + ctR1(cur[1]);
      k = key(cur); n = next(k, n);
    }
    return s;
  };
  for(let i = 0; i < segs.length; i++){
    if(used[i]) continue;
    used[i] = 1;
    const s = segs[i];
    /* walk back from the first end to find where this line really starts */
    const back = [];
    let cur = s[0], k = key(cur), n = next(k, i), prev = i;
    while(n >= 0){
      used[n] = 1;
      const sg = segs[n];
      cur = key(sg[0]) === k ? sg[1] : sg[0];
      back.push(cur);
      k = key(cur); prev = n; n = next(k, n);
    }
    back.reverse();
    d += 'M' + ctR1((back[0] || s[0])[0]) + ' ' + ctR1((back[0] || s[0])[1]);
    for(let q = 1; q < back.length; q++) d += 'L' + ctR1(back[q][0]) + ' ' + ctR1(back[q][1]);
    if(back.length) d += 'L' + ctR1(s[0][0]) + ' ' + ctR1(s[0][1]);
    d += 'L' + ctR1(s[1][0]) + ' ' + ctR1(s[1][1]);
    d += walk(i, s[1]);
  }
  return d;
}

/* ---- the region F > 0 ----
   Cells wholly inside are merged along each row into one rectangle; a cell
   the line passes through gives the polygon of its inside part, walked round
   its corners with the crossing points let in between them. */
function ctFill(fld){
  const { nx, ny, cw, ch, v } = fld, S = nx + 1;
  const E = ctEdges(fld, false);
  let d = '';
  for(let j = 0; j < ny; j++){
    let run = -1;
    const flush = i => {
      if(run < 0) return;
      d += 'M' + ctR1(run * cw) + ' ' + ctR1(j * ch) + 'h' + ctR1((i - run) * cw) + 'v' + ctR1(ch) + 'h' + ctR1(-(i - run) * cw) + 'z';
      run = -1;
    };
    for(let i = 0; i < nx; i++){
      const a = v[j * S + i], b = v[j * S + i + 1], c = v[(j + 1) * S + i + 1], dd = v[(j + 1) * S + i];
      const ia = a > 0, ib = b > 0, ic = c > 0, id = dd > 0;
      if(ia && ib && ic && id){ if(run < 0) run = i; continue; }
      flush(i);
      if(!ia && !ib && !ic && !id) continue;
      /* round the cell: corner, then the crossing on the edge to the next */
      const x0 = i * cw, y0 = j * ch, x1 = x0 + cw, y1 = y0 + ch;
      const corners = [[x0, y0, ia], [x1, y0, ib], [x1, y1, ic], [x0, y1, id]];
      const edges = [E.hz[j * nx + i], E.vt[j * S + i + 1], E.hz[(j + 1) * nx + i], E.vt[j * S + i]];
      const poly = [];
      for(let k = 0; k < 4; k++){
        if(corners[k][2]) poly.push(corners[k]);
        const x = edges[k];
        if(x) poly.push(x);
        else if(corners[k][2] !== corners[(k + 1) % 4][2]){
          /* a side that changes sign with no crossing found: a NaN corner, say —
             split it in the middle rather than lose the cell */
          const n = corners[(k + 1) % 4];
          poly.push([(corners[k][0] + n[0]) / 2, (corners[k][1] + n[1]) / 2]);
        }
      }
      if(poly.length < 3) continue;
      d += 'M' + poly.map(p => ctR1(p[0]) + ' ' + ctR1(p[1])).join('L') + 'z';
    }
    flush(nx);
  }
  return d;
}
