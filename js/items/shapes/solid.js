/* Open Note — items/solid.js
   reference solids — wireframes to draw over */

/* ================= reference solids =================
   A cube, a sphere and a torus — with a square and a circle to go beside them.
   These are not pictures of solids, they are something to draw over: a shape
   you turn and size until it sits the way you want it, and then ink on top of
   with the pen. So they are drawn as construction lines and nothing else —
   the contour heavy, the surface's own grid light, the far side of it dashed
   and faint — on no background at all, so the paper (and the grid on it) runs
   straight through and only the lines are added to the page.

   Every shape carries its own measurements (✎ on its toolbar, ui/props.js):
   a torus its outer and inner radius, a cube its three sides, and the round
   shapes a sweep — wind a torus back to a three-quarter ring or a sphere to a
   slice and the cut faces are drawn where it stops. The square and the circle
   are flat on the page: no pose, just corners you drag (x and y only) into
   any rectangle or ellipse, and an arc for the circle.
   It is arithmetic and SVG like the rest of the maths items, so a guide prints,
   travels in a backup and comes out in an exported book with nothing to load. */
const SOLID_KINDS = ['cube', 'sphere', 'torus', 'square', 'circle'];
const SOLID_NAMES = { cube:'Cube', sphere:'Sphere', torus:'Torus', square:'Square', circle:'Circle' };
const SOLID_LOOKS = ['guide', 'wire', 'shade'];
const SOLID_LOOK_NAMES = { guide:'Contour and guides', wire:'Every line', shade:'Softly shaded' };
const SOLID_FADES = [1, 0.55, 0.28];               // how far back it sits while you draw over it
const SOLID_HOME = { yaw:-0.62, pitch:-0.38, scale:1 };
/* a sphere is the one solid usually drawn straight on — equator level, poles
   upright — so that is where it starts and where ⌂ takes it back to */
const solidHomeFor = k => k === 'sphere' ? { yaw:0, pitch:0 } : SOLID_HOME;
const SOLID_W = 1000, SOLID_H = 1000;              // the picture, 1000 across like the ink and the plots
/* The eye stands well back and looks through a long lens: near and far edges
   are then within about three quarters of each other, which reads as a cube
   rather than as something tapering away — close up the perspective is so
   strong it comes out a frustum. Together they frame a shape at about seven
   tenths of the picture, leaving a cube room to swing its corners round.
   Nothing is clipped at the edge, so winding one up bigger spills over the
   page rather than being cut off. */
const SOLID_EYE = 8, SOLID_FOC = 2950;
const SOLID_MIN = 0.3, SOLID_MAX = 3;
const SOLID_LIGHT = (() => {                       // fixed in the picture, so turning a shape moves the light over it
  const l = [-0.34, 0.74, 0.58], k = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / k, l[1] / k, l[2] / k];
})();

/* ---- what a shape measures ----
   Stored on the item as `it.p`, stamped with the kind it belongs to — step to
   the next shape and the numbers start over, since a torus's hole means
   nothing to a sphere. Sweep is degrees of the way round; the rest are the
   shape's own units, 1 the size it was born at. */
const SOLID_DEFP = {
  cube:   { w:1, h:1, d:1 },
  sphere: { sweep:360 },
  torus:  { out:1, in:0.4, sweep:360 },
  square: { sx:0.72, sy:0.72 },
  circle: { sx:0.95, sy:0.95, sweep:360 }
};
const SOLID_FLAT = { square:1, circle:1 };
function solidP(it){
  if(!it.p || it.p.k !== it.kind) it.p = { k: it.kind, ...SOLID_DEFP[it.kind] };
  return it.p;
}

/* ---- the shapes ----
   A patch is (u, v) ∈ [0,1]² sampled onto a grid, wound so that u × v points
   out of the solid. The grid is what gets drawn: `lvl` 0 lines are the few a
   person would put down first — a sphere's equator and its poles, a torus's
   outer and inner circles — and `lvl` 1 is the rest of the mesh.
   A cut shape adds `xfaces` (the flat faces where it stops, shaded but never
   contour-cut) and `xcurves` (their outlines, drawn with the normals of both
   sides so they show whenever either faces you). */
const flatPatch = (o, U, V) => (u, v) =>
  [o[0] + U[0] * u + V[0] * v, o[1] + U[1] * u + V[1] * v, o[2] + U[2] * u + V[2] * v];
function solidDef(kind, P){
  const T = Math.PI * 2;
  if(kind === 'sphere'){
    const r = 0.95;
    const swp = clamp(nz(P.sweep, 360), 15, 360) / 360, full = swp > 0.9995;
    const S = (u, v) => {
      const a = T * swp * u, b = Math.PI * v, s = Math.sin(b);
      return [r * s * Math.cos(a), r * Math.cos(b), r * s * Math.sin(a)];
    };
    const def = { patches:[{ nu:Math.max(4, Math.round(20 * swp)), nv:12, wrapU:full ? 1 : 0,
      skipUEnds:full ? 0 : 1, poles:1, du:4, dv:3, S }] };
    if(!full){
      /* the two half-disc faces the cut leaves, meeting at the polar axis */
      def.xfaces = []; def.xcurves = [];
      const a1 = T * swp;
      const ends = [{ u:0, n:[0, 0, -1] }, { u:1, n:[-Math.sin(a1), 0, Math.cos(a1)] }];
      for(const e of ends){
        const pts = [], sn = [];
        for(let s = 0; s <= 24; s++){
          const q = S(e.u, s / 24);
          pts.push(q); sn.push([q[0] / r, q[1] / r, q[2] / r]);
        }
        def.xfaces.push({ pts:[...pts, [0, 0, 0]], vns:[...sn, e.n] });
        def.xcurves.push({ P:pts, N:sn, N2:pts.map(() => e.n), lvl:0, con:1 });
      }
      def.xcurves.push({ P:[[0, r, 0], [0, -r, 0]], N:[ends[0].n, ends[0].n],
        N2:[ends[1].n, ends[1].n], lvl:0, con:1 });
    }
    return def;
  }
  if(kind === 'torus'){
    const out = clamp(nz(P.out, 1), 0.3, 1.15);
    const inn = clamp(nz(P.in, 0.4), 0.04, out - 0.06);
    const R = (out + inn) / 2, r = (out - inn) / 2;     // ring centre and tube, from the two radii you see
    const swp = clamp(nz(P.sweep, 360), 15, 360) / 360, full = swp > 0.9995;
    /* u runs round the tube and v round the ring, so the first lines drawn are
       four circles round the ring — outside, top, inside, bottom */
    const S = (u, v) => {
      const a = T * u, b = T * swp * v, k = R + r * Math.cos(a);
      return [k * Math.cos(b), r * Math.sin(a), k * Math.sin(b)];
    };
    const def = { patches:[{ nu:12, nv:Math.max(4, Math.round(24 * swp)), wrapU:1,
      wrapV:full ? 1 : 0, skipVEnds:full ? 0 : 1, du:3, dv:4, S }] };
    if(!full){
      /* the tube's own cross-section, shown where the ring stops */
      def.xfaces = []; def.xcurves = [];
      const b1 = T * swp;
      const ends = [{ b:0, n:[0, 0, -1] }, { b:b1, n:[-Math.sin(b1), 0, Math.cos(b1)] }];
      for(const e of ends){
        const pts = [], tn = [];
        for(let s = 0; s <= 24; s++){
          const a = T * s / 24, k = R + r * Math.cos(a);
          pts.push([k * Math.cos(e.b), r * Math.sin(a), k * Math.sin(e.b)]);
          tn.push([Math.cos(a) * Math.cos(e.b), Math.sin(a), Math.cos(a) * Math.sin(e.b)]);
        }
        def.xfaces.push({ pts:pts.slice(0, 24), vns:tn.slice(0, 24) });
        def.xcurves.push({ P:pts, N:tn, N2:pts.map(() => e.n), lvl:0, con:1 });
      }
    }
    return def;
  }
  if(kind === 'cube'){
    const ax = 0.6 * clamp(nz(P.w, 1), 0.4, 1.6);
    const ay = 0.6 * clamp(nz(P.h, 1), 0.4, 1.6);
    const az = 0.6 * clamp(nz(P.d, 1), 0.4, 1.6);
    const f = (o, U, V) => ({ nu:2, nv:2, S:flatPatch(o, U, V) });
    return { hard:1, patches:[
      f([-ax, -ay,  az], [ 2 * ax, 0, 0], [0,  2 * ay,  0]),      /* front  */
      f([ ax, -ay, -az], [-2 * ax, 0, 0], [0,  2 * ay,  0]),      /* back   */
      f([ ax, -ay,  az], [0, 0, -2 * az], [0,  2 * ay,  0]),      /* right  */
      f([-ax, -ay, -az], [0, 0,  2 * az], [0,  2 * ay,  0]),      /* left   */
      f([-ax,  ay,  az], [ 2 * ax, 0, 0], [0,  0, -2 * az]),      /* top    */
      f([-ax, -ay, -az], [ 2 * ax, 0, 0], [0,  0,  2 * az])       /* bottom */
    ] };
  }
  if(kind === 'square'){
    const ax = clamp(nz(P.sx, 0.72), 0.08, 1.45), ay = clamp(nz(P.sy, 0.72), 0.08, 1.45);
    return { hard:1, flat:1, poly:[[-ax, -ay], [ax, -ay], [ax, ay], [-ax, ay]],
      /* the middle lines and the diagonals — where a drawing of it would start */
      guides:[[[-ax, 0], [ax, 0]], [[0, -ay], [0, ay]]],
      extra:[[[-ax, -ay], [ax, ay]], [[-ax, ay], [ax, -ay]]] };
  }
  /* circle — an ellipse when its corners have been pulled, an arc when swept.
     Its outline is drawn by hand (noSil) because a pie has square corners at
     the centre, and the smoothing that keeps a ring round would round them. */
  const rx = clamp(nz(P.sx, 0.95), 0.08, 1.45), ry = clamp(nz(P.sy, 0.95), 0.08, 1.45);
  const swp = clamp(nz(P.sweep, 360), 15, 360), full = swp > 359.8;
  const N = 96, n = Math.max(8, Math.round(N * swp / 360)), poly = [], arc = [];
  for(let i = 0; i <= n; i++){
    const a = T * (full ? i / n : (swp / 360) * i / n);
    arc.push([rx * Math.cos(a), ry * Math.sin(a), 0]);
  }
  if(full) for(let i = 0; i < n; i++) poly.push([arc[i][0], arc[i][1]]);
  else { for(const q of arc) poly.push([q[0], q[1]]); poly.push([0, 0]); }
  /* the centre lines only reach into the part that is kept — half an arc
     should not trail the other half's axis out of its open side */
  const gd = [];
  const half = (ang, seg) => { if(full || ang <= swp + 0.1) gd.push(seg); };
  half(0, [[0, 0], [rx, 0]]);
  half(90, [[0, 0], [0, ry]]);
  half(180, [[-rx, 0], [0, 0]]);
  half(270, [[0, -ry], [0, 0]]);
  const def = { flat:1, noSil:1, poly,
    guides:gd,
    /* the box it sits in: the way an ellipse gets built inside a rectangle */
    extra:[[[-rx, -ry], [rx, -ry]], [[rx, -ry], [rx, ry]], [[rx, ry], [-rx, ry]], [[-rx, ry], [-rx, -ry]]],
    xcurves:[{ P:arc, N:null, always:1, lvl:0, con:1 }] };
  if(!full) def.xcurves.push(
    { P:[[0, 0, 0], arc[0]], N:null, always:1, lvl:0, con:1 },
    { P:[[0, 0, 0], arc[arc.length - 1]], N:null, always:1, lvl:0, con:1 });
  return def;
}
/* the way the surface faces at (u, v), by walking a little way along it */
function patchNorm(S, u, v){
  const h = 1e-3;
  const uu = clamp(u, h, 1 - h), vv = clamp(v, h, 1 - h);
  const a = S(uu + h, vv), b = S(uu - h, vv), c = S(uu, vv + h), d = S(uu, vv - h);
  const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2];
  const vx = c[0] - d[0], vy = c[1] - d[1], vz = c[2] - d[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const L = Math.hypot(x, y, z) || 1;
  return [x / L, y / L, z / L];
}
/* Newell's normal — right for a triangle, a quad, or a forty-eight-gon, and it
   does not fall over when a corner of a cell has collapsed onto a pole */
function newell(ring, X, Y, Z){
  let x = 0, y = 0, z = 0;
  for(let i = 0; i < ring.length; i++){
    const a = ring[i], b = ring[(i + 1) % ring.length];
    x += (Y[a] - Y[b]) * (Z[a] + Z[b]);
    y += (Z[a] - Z[b]) * (X[a] + X[b]);
    z += (X[a] - X[b]) * (Y[a] + Y[b]);
  }
  const L = Math.hypot(x, y, z) || 1;
  return [x / L, y / L, z / L];
}
/* kind + measurements → geometry, kept for as long as those numbers hold —
   turning and sizing reuse it, only a slider being dragged builds anew */
const SMESH = new Map();
function solidMesh(it){
  const kind = SOLID_KINDS.indexOf(it.kind) < 0 ? 'cube' : it.kind;
  const P = solidP(it);
  const key = kind + '|' + ['w', 'h', 'd', 'out', 'in', 'sx', 'sy', 'sweep']
    .map(k => P[k] == null ? '' : Math.round(P[k] * 1000)).join(',');
  if(!SMESH.has(key)){
    if(SMESH.size > 60) SMESH.clear();
    SMESH.set(key, buildSolid(kind, P));
  }
  return SMESH.get(key);
}
/* Corners are welded, so an edge knows both faces it divides — which is how
   the contour is found, whichever way the shape is turned. The faces carry the
   shading; the curves are what actually gets drawn. */
function buildSolid(kind, P){
  const def = solidDef(kind, P);
  const V = [], VN = [], F = [], C = [], key = new Map();
  const put = (p, n) => {
    const k = Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4);
    let i = key.get(k);
    if(i === undefined){ i = V.length / 3; V.push(p[0], p[1], p[2]); key.set(k, i); }
    if(n){ VN[i * 3] = n[0]; VN[i * 3 + 1] = n[1]; VN[i * 3 + 2] = n[2]; }
    return i;
  };
  for(const pt of def.patches || []){
    const nu = pt.nu, nv = pt.nv, G = [], GN = [];
    for(let i = 0; i <= nu; i++){
      const row = [], nrow = [];
      for(let j = 0; j <= nv; j++){
        row.push(pt.S(i / nu, j / nv));
        /* the way the smooth surface faces here, which is what the contour is
           cut against — a corner of the mesh would only step round it */
        nrow.push(def.hard ? null : patchNorm(pt.S, i / nu, j / nv));
      }
      G.push(row); GN.push(nrow);
    }
    for(let i = 0; i < nu; i++) for(let j = 0; j < nv; j++){
      const q = [put(G[i][j], GN[i][j]), put(G[i + 1][j], GN[i + 1][j]),
                 put(G[i + 1][j + 1], GN[i + 1][j + 1]), put(G[i][j + 1], GN[i][j + 1])];
      const ring = q.filter((v, k) => v !== q[(k + 1) % 4]);   /* a pole collapses a corner */
      if(ring.length > 2) F.push({ c:ring });
    }
    if(def.hard) continue;                          /* a cube is drawn by its edges, below */
    /* the surface's own grid, walked finely enough to come out as curves */
    const su = Math.max(20, nv * 2), sv = Math.max(20, nu * 2);
    for(let i = 0; i <= nu; i++){
      if(pt.wrapU && i === nu) break;               /* the seam is the line at i = 0 again */
      if(pt.skipUEnds && (i === 0 || i === nu)) continue;   /* the cut edge is drawn with its face */
      const P2 = [], N = [];
      for(let s = 0; s <= su; s++){
        const v = s / su;
        P2.push(pt.S(i / nu, v)); N.push(patchNorm(pt.S, i / nu, v));
      }
      C.push({ P:P2, N, lvl: i % (pt.du || 1) ? 1 : 0 });
    }
    for(let j = 0; j <= nv; j++){
      if(pt.wrapV && j === nv) break;
      if(pt.skipVEnds && (j === 0 || j === nv)) continue;
      if(pt.poles && (j === 0 || j === nv)) continue;   /* a circle of no size */
      const P2 = [], N = [];
      for(let s = 0; s <= sv; s++){
        const u = s / sv;
        P2.push(pt.S(u, j / nv)); N.push(patchNorm(pt.S, u, j / nv));
      }
      C.push({ P:P2, N, lvl: j % (pt.dv || 1) ? 1 : 0 });
    }
  }
  /* the flat faces a cut leaves behind: shaded like any face, outlined by
     their own curves, and never contour-cut — their normals are the plane's,
     not the surface's, and the crossing test would draw phantoms from them */
  for(const xf of def.xfaces || [])
    F.push({ c: xf.pts.map((p, i) => put(p, xf.vns ? xf.vns[i] : null)), nc:1 });
  for(const xc of def.xcurves || []) C.push(xc);
  if(def.poly){                                     /* one flat face, two-sided */
    F.push({ c:def.poly.map(p => put([p[0], p[1], 0])) });
    const lift = seg => ({ P:seg.map(p => [p[0], p[1], 0]), N:null, always:1 });
    for(const s of def.guides || []) C.push({ ...lift(s), lvl:0 });
    for(const s of def.extra || []) C.push({ ...lift(s), lvl:1 });
  }
  const VX = [], VY = [], VZ = [];
  for(let i = 0; i < V.length; i += 3){ VX.push(V[i]); VY.push(V[i + 1]); VZ.push(V[i + 2]); }
  F.forEach(f => { f.n = newell(f.c, VX, VY, VZ); });
  const em = new Map();
  F.forEach((f, fi) => {
    for(let i = 0; i < f.c.length; i++){
      const a = f.c[i], b = f.c[(i + 1) % f.c.length];
      const k = a < b ? a + ':' + b : b + ':' + a;
      const e = em.get(k);
      if(e) e.g = fi; else em.set(k, { a, b, f:fi, g:-1 });
    }
  });
  const E = [...em.values()];
  /* a real edge of the shape, as against a line of the grid ruled over a flat
     face: the two sides face different ways. A sphere has none of these. */
  for(const e of E){
    const p = F[e.f].n, q = e.g >= 0 ? F[e.g].n : null;
    e.hard = !q || (!!def.hard && p[0] * q[0] + p[1] * q[1] + p[2] * q[2] < 0.99);
  }
  if(def.hard && !def.flat){
    /* a cube is drawn by its edges: the twelve real ones first and the lines
       that cross its faces after, each one shown if either face it divides is
       turned towards you and dashed if neither is */
    for(const e of E){
      if(e.g < 0) continue;
      const a = [V[e.a*3], V[e.a*3+1], V[e.a*3+2]], b = [V[e.b*3], V[e.b*3+1], V[e.b*3+2]];
      C.push({ P:[a, b], N:[F[e.f].n, F[e.f].n], N2:[F[e.g].n, F[e.g].n], lvl:e.hard ? 0 : 1 });
    }
  }
  return { V:Float64Array.from(V), VN:VN.length === V.length ? Float64Array.from(VN) : null,
    F, E, C, hard:!!def.hard, flat:!!def.flat, noSil:!!def.noSil, smooth:!def.hard };
}

/* ---- a line, drawn ---- */
const spt = p => rd1(p[0]) + ' ' + rd1(p[1]);
const smid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/* a run of points as one path: curves go through the midpoints so a coarse
   ring of samples still comes out round, straight lines stay straight */
function sPath(Q, smooth, close){
  const n = Q.length;
  if(n < 2) return '';
  if(smooth && n > 2){
    if(close){
      let d = 'M' + spt(smid(Q[n - 1], Q[0]));
      for(let i = 0; i < n; i++) d += 'Q' + spt(Q[i]) + ' ' + spt(smid(Q[i], Q[(i + 1) % n]));
      return d + 'Z';
    }
    let d = 'M' + spt(Q[0]);
    for(let i = 1; i < n - 1; i++)
      d += 'Q' + spt(Q[i]) + ' ' + spt(i === n - 2 ? Q[n - 1] : smid(Q[i], Q[i + 1]));
    return d;
  }
  return 'M' + Q.map(spt).join('L') + (close ? 'Z' : '');
}
/* loose edges strung end to end, so the contour comes out as whole lines */
function chainEdges(segs){
  const adj = new Map();
  const add = (k, i) => { const l = adj.get(k); if(l) l.push(i); else adj.set(k, [i]); };
  segs.forEach((e, i) => { add(e[0], i); add(e[1], i); });
  const used = new Array(segs.length).fill(false), out = [];
  const step = (from, take) => {
    const l = adj.get(from) || [];
    for(const j of l) if(!used[j]){ used[j] = true; take(segs[j][0] === from ? segs[j][1] : segs[j][0]); return true; }
    return false;
  };
  for(let i = 0; i < segs.length; i++){
    if(used[i]) continue;
    used[i] = true;
    const v = [segs[i][0], segs[i][1]];
    while(v[v.length - 1] !== v[0] && step(v[v.length - 1], p => v.push(p)));
    while(v[0] !== v[v.length - 1] && step(v[0], p => v.unshift(p)));
    const closed = v.length > 3 && v[0] === v[v.length - 1];
    if(closed) v.pop();
    out.push({ v, closed });
  }
  return out;
}

/* ---- drawing one ---- */
const solidPose = it => SOLID_FLAT[it.kind]
  /* the flat pair lie on the page: no pose, only size — turning them in the
     page is the item's own rotate handle, like anything else on the paper */
  ? { yaw:0, pitch:0, sc: clamp(nz(it.scale, 1), SOLID_MIN, SOLID_MAX) }
  : {
      yaw: nz(it.yaw, SOLID_HOME.yaw),
      pitch: clamp(nz(it.pitch, SOLID_HOME.pitch), -1.5, 1.5),
      sc: clamp(nz(it.scale, 1), SOLID_MIN, SOLID_MAX)
    };
function solidInner(it){
  const m = solidMesh(it);
  const look = SOLID_LOOKS[(it.look || 0) % SOLID_LOOKS.length];
  const col = esc(it.c || MATH_COLORS[1]);
  const p = solidPose(it);
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  const cx = Math.cos(p.pitch), sx = Math.sin(p.pitch), S = p.sc;
  /* rotX(pitch) · rotY(yaw), then an eye up the z axis — the same turn the .obj
     viewer makes, so dragging one and dragging the other feel like one hand */
  const turn = (x, y, z) => [cy * x + sy * z,
                             sx * sy * x + cx * y - sx * cy * z,
                             -cx * sy * x + sx * y + cx * cy * z];
  const cast = (x, y, z) => {
    const v = turn(x * S, y * S, z * S);
    const k = SOLID_FOC / Math.max(0.35, SOLID_EYE - v[2]);
    return [SOLID_W / 2 + v[0] * k, SOLID_H / 2 - v[1] * k];
  };
  const n = m.V.length / 3;
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
  const PX = new Float64Array(n), PY = new Float64Array(n);
  for(let i = 0; i < n; i++){
    const v = turn(m.V[i*3] * S, m.V[i*3+1] * S, m.V[i*3+2] * S);
    const k = SOLID_FOC / Math.max(0.35, SOLID_EYE - v[2]);
    X[i] = v[0]; Y[i] = v[1]; Z[i] = v[2];
    PX[i] = SOLID_W / 2 + v[0] * k; PY[i] = SOLID_H / 2 - v[1] * k;
  }
  const nf = m.F.length;
  const FR = new Uint8Array(nf), LAM = new Float64Array(nf), DEP = new Float64Array(nf);
  for(let fi = 0; fi < nf; fi++){
    const c = m.F[fi].c;
    let ax = 0, ay = 0, az = 0;
    for(const v of c){ ax += X[v]; ay += Y[v]; az += Z[v]; }
    ax /= c.length; ay /= c.length; az /= c.length;
    const q = newell(c, X, Y, Z);
    /* facing the eye — which for a solid means you can see it, and for a flat
       shape only means which of its two sides is turned towards you */
    const front = -q[0] * ax - q[1] * ay + q[2] * (SOLID_EYE - az) > 0;
    const s = front ? 1 : -1;
    FR[fi] = front ? 1 : 0;
    LAM[fi] = Math.max(0, s * (q[0] * SOLID_LIGHT[0] + q[1] * SOLID_LIGHT[1] + q[2] * SOLID_LIGHT[2]));
    DEP[fi] = SOLID_EYE - az;
  }
  let s = '';
  /* the form, softly — kept see-through, since the point of it is to be drawn on */
  if(look === 'shade'){
    const order = [];
    for(let fi = 0; fi < nf; fi++) if(FR[fi] || m.flat) order.push(fi);
    order.sort((a, b) => DEP[b] - DEP[a]);
    for(const fi of order){
      const k = 0.04 + 0.24 * (1 - LAM[fi]);
      s += '<path class="sfa" d="' + 'M' + m.F[fi].c.map(v => rd1(PX[v]) + ' ' + rd1(PY[v])).join('L') + 'Z' +
           '" fill="' + col + '" fill-opacity="' + Math.round(k * 100) / 100 + '"/>';
    }
  }
  /* the surface's grid: solid where it faces you, dashed where it runs behind.
     Curves marked `con` are real edges of the shape — a cut face's rim, an
     arc's own line — and their visible runs join the contour instead. */
  const wantLvl = look === 'wire' ? 1 : 0;
  let vis = '', hid = '', conx = '';
  for(const c of m.C){
    if(c.lvl > wantLvl) continue;
    const Q = [], on = [];
    for(let i = 0; i < c.P.length; i++){
      const q = c.P[i], v = turn(q[0] * S, q[1] * S, q[2] * S);
      Q.push(cast(q[0], q[1], q[2]));
      /* the surface faces the eye here, or the far side of it does */
      const sees = N => {
        const a = turn(N[0], N[1], N[2]);
        return -a[0] * v[0] - a[1] * v[1] + a[2] * (SOLID_EYE - v[2]) > 0;
      };
      on.push(c.always || !c.N ? 1 : (sees(c.N[i]) || (c.N2 && sees(c.N2[i])) ? 1 : 0));
    }
    let i0 = 0;
    for(let i = 1; i <= Q.length; i++){
      const end = i === Q.length;
      if(!end && on[i] === on[i0]) continue;
      const run = Q.slice(i0, end ? Q.length : i + 1);   /* the two runs share a point, so they meet */
      if(run.length > 1){
        const shut = i0 === 0 && end && Math.hypot(Q[0][0] - Q[Q.length-1][0], Q[0][1] - Q[Q.length-1][1]) < 0.6;
        const d = shut ? sPath(run.slice(0, -1), m.smooth, true) : sPath(run, m.smooth, false);
        if(on[i0]){ if(c.con) conx += d; else vis += d; } else hid += d;
      }
      i0 = i;
    }
  }
  /* The contour — the line you would put down first. On a curved surface it is
     where n·(eye − p) changes sign, and cutting each face at that crossing puts
     it on the smooth surface itself: stepping round the mesh instead leaves the
     contour zigzagging wherever the surface runs nearly edge on, which on a
     torus is exactly where its hole is. Flat faces have no such crossing, so a
     cube and the flat pair keep to their edges. */
  let con = '';
  if(m.VN){
    const fv = new Float64Array(n);
    for(let i = 0; i < n; i++){
      const a = turn(m.VN[i*3], m.VN[i*3+1], m.VN[i*3+2]);
      fv[i] = -a[0] * X[i] - a[1] * Y[i] + a[2] * (SOLID_EYE - Z[i]);
    }
    const at = new Map(), segs = [];
    for(const f of m.F){
      if(f.nc) continue;                            /* a cut face is a plane, not the surface */
      const c = f.c, hit = [];
      for(let i = 0; i < c.length; i++){
        const a = c[i], b = c[(i + 1) % c.length];
        if((fv[a] > 0) === (fv[b] > 0)) continue;
        const k = a < b ? a + ':' + b : b + ':' + a;
        if(!at.has(k)){
          const t = fv[a] / (fv[a] - fv[b]);
          at.set(k, [PX[a] + (PX[b] - PX[a]) * t, PY[a] + (PY[b] - PY[a]) * t]);
        }
        hit.push(k);
      }
      for(let i = 0; i + 1 < hit.length; i += 2) segs.push([hit[i], hit[i + 1]]);
    }
    for(const ch of chainEdges(segs))
      con += sPath(ch.v.map(k => at.get(k)), true, ch.closed);
  } else if(!m.noSil){
    const sil = [];
    for(const e of m.E)
      if(e.g < 0 ? (m.flat || FR[e.f]) : FR[e.f] !== FR[e.g]) sil.push([e.a, e.b]);
    for(const ch of chainEdges(sil))
      con += sPath(ch.v.map(v => [PX[v], PY[v]]), m.smooth, ch.closed);
  }
  /* faint and dashed underneath, the surface's grid over that, the contour on top */
  if(look !== 'shade' && hid) s += '<path class="shd" d="' + hid + '" stroke="' + col + '"/>';
  if(vis) s += '<path class="sgr" d="' + vis + '" stroke="' + col + '"/>';
  if(con + conx) s += '<path class="sct" d="' + con + conx + '" stroke="' + col + '"/>';
  const fade = SOLID_FADES[(it.fade || 0) % SOLID_FADES.length];
  return fade < 1 ? '<g opacity="' + fade + '">' + s + '</g>' : s;
}
function solidSVG(it){
  return '<svg class="msolid" viewBox="0 0 ' + SOLID_W + ' ' + SOLID_H +
    '" style="aspect-ratio:' + SOLID_W + '/' + SOLID_H + '">' + solidInner(it) + '</svg>';
}
function paintSolid(el, it){
  const svg = el && el.querySelector('svg.msolid');
  if(svg) svg.innerHTML = solidInner(it);
  syncSolidChrome(el, it);
}
/* what hangs around the picture: the flat pair's corner handles, the hint —
   kept in step here so stepping to the next shape moves them too */
function syncSolidChrome(el, it){
  const body = el && el.querySelector('.solid');
  if(!body) return;
  const flat = !!SOLID_FLAT[it.kind];
  body.classList.toggle('flat', flat);
  const hint = el.querySelector('.shield b');
  if(hint) hint.textContent = flat ? '⟳ then pull its corners' : '⟳ to turn it';
  const hs = el.querySelectorAll('.shnd');
  if(!hs.length) return;
  const P = solidP(it), K = solidPose(it).sc * SOLID_FOC / SOLID_EYE / 10;   /* % of the picture per unit */
  const px = (P.sx || 0) * K, py = (P.sy || 0) * K;
  hs.forEach(h => {
    h.style.left = 50 + (+h.dataset.cx) * px + '%';
    h.style.top = 50 + (+h.dataset.cy) * py + '%';
  });
}

/* ---- turning one about ----
   The local ⟳ button lends the guide the mouse. A double-click hands it back to
   the page, and the pen goes over the top whatever it is doing — ink is caught
   by a sheet above the whole page, not by what is under it. */
const solidLive = el => el.classList.contains('play') && !PLOT_MOVE.has(el.dataset.id);
function solidMove(el, it, on){
  if(on) PLOT_MOVE.add(it.id); else PLOT_MOVE.delete(it.id);
  el.classList.toggle('mmove', !!on);
  select(it.id); SND.pop();
}
/* a guide let go mid-turn keeps the hand's spin, decaying like a real thing —
   one entry per item, so a fresh grab (or putting the tool away) stops it */
const SOLID_SPIN = new Map();
function stopSpin(it){
  const s = SOLID_SPIN.get(it.id);
  if(s) s();
}
function wireSolid(el, it, page){
  const svg = el.querySelector('svg.msolid');
  if(!svg) return;
  if(PLOT_MOVE.has(it.id)) el.classList.add('mmove');
  syncSolidChrome(el, it);
  svg.addEventListener('pointerdown', e => {
    if(e.button !== 0 || !solidLive(el)) return;
    e.stopPropagation(); e.preventDefault();
    select(it.id);
    stopSpin(it);                              // the hand takes over from any spin in flight
    const pid = e.pointerId;
    let lx = e.clientX, ly = e.clientY;
    const fl = flickTrack();
    fl.track(e);
    try{ svg.setPointerCapture(pid); }catch(err){}
    /* one drag does both: it turns, and it sizes while shift is down — taking
       each move as it comes means shift can go down and up mid-turn. The flat
       pair have no pose to turn, so only the sizing half applies to them. */
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      const dx = ev.clientX - lx, dy = ev.clientY - ly;
      lx = ev.clientX; ly = ev.clientY;
      const p = solidPose(it);
      if(ev.shiftKey) it.scale = clamp(p.sc * Math.pow(1.007, -dy), SOLID_MIN, SOLID_MAX);
      else if(!SOLID_FLAT[it.kind]){
        it.yaw = p.yaw + dx * 0.011;
        it.pitch = clamp(p.pitch + dy * 0.011, -1.5, 1.5);
        fl.track(ev);                          // only a turn carries momentum, not a sizing
      } else return;
      paintSolid(el, it);
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      svg.removeEventListener('pointermove', mv);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
      queueSave(page.id);
      /* let go with speed and it keeps turning — the same hand as the drag,
         0.011 rad a pixel, dying away like a wheel spun and left alone */
      if(SOLID_FLAT[it.kind] || SPRING_STILL.matches) return;
      const v = fl.vel();
      let wy = v.vx * 0.011, wp = v.vy * 0.011;
      if(Math.abs(wy) + Math.abs(wp) < .15) return;
      const cancel = motionTick(dt => {
        if(!el.isConnected || !solidLive(el) || SOLID_FLAT[it.kind]){ end(); return false; }
        const k = Math.exp(-2.1 * dt);
        wy *= k; wp *= k;
        const p = solidPose(it);
        it.yaw = p.yaw + wy * dt;
        it.pitch = clamp(p.pitch + wp * dt, -1.5, 1.5);
        if(it.pitch !== p.pitch + wp * dt) wp = 0;          // the poles are a hard stop
        paintSolid(el, it);
        if(Math.abs(wy) + Math.abs(wp) < .02){ end(); return false; }
        return true;
      });
      const end = () => { SOLID_SPIN.delete(it.id); queueSave(page.id); };
      SOLID_SPIN.set(it.id, () => { cancel(); end(); });
    };
    svg.addEventListener('pointermove', mv);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  });
  /* while the local turn tool is on, the wheel sizes it mid-gesture too */
  svg.addEventListener('wheel', e => {
    if(!solidLive(el) || e.ctrlKey || e.metaKey) return;      /* ctrl+wheel still zooms the desk */
    e.preventDefault(); e.stopPropagation();
    it.scale = clamp(solidPose(it).sc * (e.deltaY > 0 ? 1 / 1.1 : 1.1), SOLID_MIN, SOLID_MAX);
    paintSolid(el, it); queueSave(page.id);
  }, { passive:false });
  el.addEventListener('dblclick', e => {
    if(!el.classList.contains('play') && !PLOT_MOVE.has(it.id)) return;
    e.stopPropagation(); e.preventDefault();
    solidMove(el, it, !PLOT_MOVE.has(it.id));
  });
  /* the flat pair's corners: drag one and the rectangle (or the ellipse's box)
     follows it, x and y only. getScreenCTM knows every transform on the way
     down — the page's zoom and the item's own rotation included — so the
     corner lands under the pointer however the item is standing. */
  el.querySelectorAll('.shnd').forEach(h => {
    h.addEventListener('pointerdown', e => {
      if(e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      select(it.id);
      const pid = e.pointerId;
      try{ h.setPointerCapture(pid); }catch(err){}
      const mv = ev => {
        if(ev.pointerId !== pid) return;
        const M = svg.getScreenCTM();
        if(!M) return;
        const q = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(M.inverse());
        const P = solidP(it), K = solidPose(it).sc * SOLID_FOC / SOLID_EYE;
        P.sx = clamp(Math.abs(q.x - SOLID_W / 2) / K, 0.08, 1.45);
        P.sy = clamp(Math.abs(q.y - SOLID_H / 2) / K, 0.08, 1.45);
        paintSolid(el, it);
        syncProps();                                /* the panel's numbers follow the drag */
      };
      const up = ev => {
        if(ev.pointerId !== pid) return;
        h.removeEventListener('pointermove', mv);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
        queueSave(page.id);
      };
      h.addEventListener('pointermove', mv);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
  });
}
function solidAct(a, it, page, el){
  stopSpin(it);                                     /* a button press is a hand on the wheel */
  if(a === 'kind'){
    it.kind = SOLID_KINDS[(SOLID_KINDS.indexOf(it.kind) + 1) % SOLID_KINDS.length];
    solidP(it);                                     /* its measurements start over */
    closeProps();
  }
  else if(a === 'color') it.c = MATH_COLORS[(MATH_COLORS.indexOf(it.c) + 1) % MATH_COLORS.length];
  else if(a === 'look') it.look = ((it.look || 0) + 1) % SOLID_LOOKS.length;
  else if(a === 'fade') it.fade = ((it.fade || 0) + 1) % SOLID_FADES.length;
  else if(a === 'in' || a === 'out')
    it.scale = clamp(solidPose(it).sc * (a === 'in' ? 1.18 : 1 / 1.18), SOLID_MIN, SOLID_MAX);
  else if(a === 'home'){
    const H = solidHomeFor(it.kind);
    it.yaw = H.yaw; it.pitch = H.pitch; it.scale = 1;
  }
  else if(a === 'move'){ solidMove(el, it, !PLOT_MOVE.has(it.id)); return; }
  paintSolid(el, it); queueSave(page.id); SND.pop();
}

/* ---- its measurements, on the ✎ panel (ui/props.js) ----
   Sliders hold the shape's own units as percentages — 100% is the size it was
   born at — and the sweep is a dial you drag round, reading in degrees. The
   getters reach through solidP every time, so ↺ starting the numbers over
   does not leave the panel holding the old ones. */
function solidRows(it){
  const rows = [];
  const rng = (label, key, min, max) => rows.push({ t:'range', label, min, max, step:1,
    get:() => Math.round(solidP(it)[key] * 100),
    set:v => { solidP(it)[key] = v / 100; },
    fmt:v => v + '%' });
  if(it.kind === 'cube'){ rng('Width', 'w', 40, 160); rng('Height', 'h', 40, 160); rng('Depth', 'd', 40, 160); }
  if(it.kind === 'torus'){
    rows.push({ t:'range', label:'Outer radius', min:30, max:115, step:1,
      get:() => Math.round(solidP(it).out * 100),
      set:v => { const P = solidP(it); P.out = v / 100; P.in = Math.min(P.in, P.out - 0.06); },
      fmt:v => v + '%' });
    rows.push({ t:'range', label:'Inner radius', min:4, max:109, step:1,
      get:() => Math.round(solidP(it).in * 100),
      set:v => { const P = solidP(it); P.in = clamp(v / 100, 0.04, P.out - 0.06); },
      fmt:v => v + '%' });
  }
  if(SOLID_FLAT[it.kind]){ rng('Width', 'sx', 8, 145); rng('Height', 'sy', 8, 145); }
  if(SOLID_DEFP[it.kind].sweep != null) rows.push({ t:'angle', label:'Sweep', min:15,
    get:() => solidP(it).sweep,
    set:v => { solidP(it).sweep = clamp(v, 15, 360); } });
  return rows;
}
function openSolidProps(btn, it, el, page){
  openProps(btn, {
    title: SOLID_NAMES[it.kind],
    rows: solidRows(it),
    onchange(){ paintSolid(el, it); },
    onsave(){ queueSave(page.id); },
    onreset(){ it.p = null; solidP(it); paintSolid(el, it); queueSave(page.id); }
  });
}

/* Five shapes, one item type: they differ only in the mesh they build, so the
   add menu offers each by name and the item remembers which it is in `kind`. */
const SOLID_HANDLES =
  '<i class="shnd" data-cx="-1" data-cy="-1"></i><i class="shnd" data-cx="1" data-cy="-1"></i>' +
  '<i class="shnd" data-cx="-1" data-cy="1"></i><i class="shnd" data-cx="1" data-cy="1"></i>';
defineItem('solid', {
  add: SOLID_KINDS.reduce((m, k) => {
    m[k] = base => ({ ...base, type:'solid', kind:k, w:30, rot:0,
      yaw:solidHomeFor(k).yaw, pitch:solidHomeFor(k).pitch, scale:1,
      look:0, fade:0, c:MATH_COLORS[1] });
    return m;
  }, {}),
  playArea: '.sowrap',
  /* no mount, no caption: a guide to draw over is lines on the page and
     nothing else, so there is no box around it to see */
  html: (it, c) => '<div class="body solid' + (SOLID_FLAT[it.kind] ? ' flat' : '') +
    '"><div class="sowrap">' + solidSVG(it) +
    (c.live ? SOLID_HANDLES + '<div class="shield"><b>⟳ to turn it</b></div>' : '') + '</div></div>',
  tools(mk, it, el, page){
    mk('⟳', 'Hands it the mouse — turn it, or pull a flat shape’s corners', b => {
      el.classList.toggle('play');
      b.style.background = el.classList.contains('play') ? 'var(--accent)' : ''; });
    mk('✎', 'Its measurements — radii, sides, and how far round it goes', b =>
      openSolidProps(b, it, el, page));
    /* every one of these says what it does first and where it stands after, so
       the tooltip reads the same before and after it has been pressed */
    mk('◇', 'The next shape — cube, sphere, torus, square, circle', b => {
      solidAct('kind', it, page, el);
      b.title = 'The next shape — now: ' + SOLID_NAMES[it.kind]; });
    mk('◑', 'Its colour', () => solidAct('color', it, page, el));
    mk('◈', 'Contour and guides / every line / softly shaded', b => {
      solidAct('look', it, page, el);
      b.title = 'Contour and guides / every line / softly shaded — now: ' +
        SOLID_LOOK_NAMES[SOLID_LOOKS[it.look || 0]]; });
    mk('◐', 'Fade it back to draw over — full, half, faint', b => {
      solidAct('fade', it, page, el);
      b.title = 'Fade it back to draw over — now: ' +
        Math.round(SOLID_FADES[it.fade || 0] * 100) + '%'; });
    mk('⊖', 'Smaller — or the wheel, or shift and drag', () => solidAct('out', it, page, el));
    mk('⊕', 'Bigger — or the wheel, or shift and drag', () => solidAct('in', it, page, el));
    mk('✥', 'Move it about the page — or double-click it', () => solidAct('move', it, page, el));
    mk('⌂', 'Back to the starting view', () => solidAct('home', it, page, el));
  },
  wire(el, it, page){ wireSolid(el, it, page); }
});

/* ---- how it looks ---- */
addCSS('solid', `
/* ---------- reference solids ----------
   Construction lines to draw over, so: no background, no box, nothing clipped
   at the edge of it, and every line in the item's own colour so it stays apart
   from the ink you put on top. Same rule as the plot above — a "fill:none" is
   pinned to path, and nothing here sets a stroke, which the drawing hands over
   as an attribute that a stylesheet would beat. */
.solid{display:block;background:none;padding:0;box-shadow:none}
.sowrap{position:relative}
svg.msolid{display:block;width:100%;height:auto;background:none;overflow:visible;touch-action:none}
.msolid path.sfa{stroke:none}
.msolid path.shd{fill:none;stroke-width:2.6;stroke-dasharray:13 11;stroke-linecap:round;opacity:.3}
.msolid path.sgr{fill:none;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;opacity:.62}
.msolid path.sct{fill:none;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.item.play .sowrap{cursor:grab}
.item.play .sowrap:active{cursor:grabbing}
/* flat shapes have no pose to grab — their corners do the work */
.item.play .solid.flat svg.msolid,.item.play .solid.flat .sowrap{cursor:default}
.shnd{position:absolute;z-index:8;width:calc(var(--scale)*13px);height:calc(var(--scale)*13px);
  margin:calc(var(--scale)*-6.5px) 0 0 calc(var(--scale)*-6.5px);border-radius:50%;
  background:var(--accent2);border:calc(var(--scale)*2px) solid var(--paper);
  box-shadow:0 1px 4px rgba(0,0,0,.35);display:none;cursor:nwse-resize;touch-action:none}
.item.play .solid.flat .shnd{display:block}
.item.mmove .solid.flat .shnd{display:none}
.item.play .shield{display:none}
.item.play.mmove svg.msolid{cursor:default}
.item.mmove .solid{box-shadow:0 0 0 calc(var(--scale)*2px) var(--accent),
  0 calc(var(--scale)*10px) calc(var(--scale)*22px) rgba(0,0,0,.25)}
.item.mmove .solid::after{content:"✥ move — double-click to turn it again";position:absolute;
  right:0;top:100%;margin-top:calc(var(--scale)*3px);white-space:nowrap;pointer-events:none;
  font-family:var(--mono);font-size:calc(var(--scale)*10px);letter-spacing:.08em;
  color:#fff;background:var(--accent);padding:calc(var(--scale)*2px) calc(var(--scale)*6px);border-radius:2px}
`);
/* its tiles in the palette — one per shape */
defineTool({ kind:'cube',   cat:'shapes', label:'Cube',   icon:'cube',   order:10, hint:'A cube to draw over — drag to turn it, ✎ for its sides' });
defineTool({ kind:'sphere', cat:'shapes', label:'Sphere', icon:'sphere', order:20, hint:'A sphere to draw over — starts face on; ✎ sweeps it down to a slice' });
defineTool({ kind:'torus',  cat:'shapes', label:'Torus',  icon:'torus',  order:30, hint:'A torus to draw over — ✎ sets its radii, or winds it back to a part ring' });
defineTool({ kind:'square', cat:'shapes', label:'Square', icon:'square', order:40, hint:'A rectangle to draw over — flat on the page; pull its corners to shape it' });
defineTool({ kind:'circle', cat:'shapes', label:'Circle', icon:'circle', order:50, hint:'A circle to draw over — flat; pull its corners for an ellipse, ✎ for an arc' });
