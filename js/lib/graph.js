/* Open Note — lib/graph.js
   where the dots go: a force-directed layout for a small graph.
   Owes nothing to this app at all — no DOM, no colours, no names.

   Three forces and nothing clever: every node pushes every other one away,
   every link pulls its two ends towards a length it would like to be, and the
   whole thing drifts gently back towards the middle so a piece of the graph
   that nothing is attached to cannot wander off the paper. Integrated with a
   fixed step and a flat damping term, which is not physics but is stable at any
   frame rate and settles rather than ringing.

   It is O(n²) a step on purpose: a library of a few hundred notes is nothing to
   count pairs of, and a quadtree would be more code than the whole file. */

const GPH_REPEL = 2400;      // how hard two nodes push each other apart
const GPH_LINK  = 78;        // the length a link would like to be
const GPH_PULL  = 0.055;     // how strongly it pulls towards that length
const GPH_HOME  = 0.010;     // the drift back towards the middle
const GPH_DRAG  = 0.86;      // what is left of a node's motion after a step
const GPH_STEP  = 1.6;       // one step of the clock, in force units
const GPH_CALM  = 0.05;      // below this much motion a layout is finished

/* the golden angle — points dropped along it never fall into spokes or rings,
   so a graph starts from a spread rather than from a pattern it has to escape */
const GPH_TURN = Math.PI * (3 - Math.sqrt(5));

/* A layout is made from the same nodes and links every time and starts from the
   same places, so the same library lands the same way twice. Nothing here is
   random — a graph that rearranged itself on every visit would be unreadable
   as a picture of anything. */
function gphMake(nodes, links, aspect){
  const n = nodes.length;
  const spread = Math.max(70, 30 * Math.sqrt(Math.max(1, n)));
  /* A graph is laid out into the shape of the frame it will be read in: the
     drift home is weaker across a wide one and stronger down it, so a picture
     in a letterbox spreads out along it rather than sitting in a coin in the
     middle with nothing either side. */
  const ar = Math.max(1, Math.min(2.6, aspect || 1)), wide = Math.sqrt(ar);
  const pts = [];
  for(let i = 0; i < n; i++){
    const a = i * GPH_TURN, r = spread * Math.sqrt((i + 0.5) / Math.max(1, n));
    pts.push({ x:Math.cos(a) * r * wide, y:Math.sin(a) * r / wide, vx:0, vy:0, deg:0, pin:false });
  }
  const at = new Map();
  for(let i = 0; i < n; i++) at.set(nodes[i].key, i);
  const edges = [];
  for(const l of links || []){
    const a = at.get(l.from), b = at.get(l.to);
    if(a == null || b == null || a === b) continue;
    edges.push({ a, b });
    pts[a].deg++; pts[b].deg++;
  }
  return { pts, edges, at, n, ar, calm:false };
}

/* one step. Returns how much the graph moved, so a caller can stop when it has
   stopped mattering. A pinned node feels every force and ignores all of them —
   that is what being dragged is. */
function gphTick(g, scale){
  const pts = g.pts, n = pts.length, k = (scale == null ? 1 : scale) * GPH_STEP;
  if(!n) return 0;
  for(let i = 0; i < n; i++){
    const a = pts[i];
    const ar = g.ar || 1;
    let fx = -a.x * GPH_HOME / ar, fy = -a.y * GPH_HOME * ar;
    for(let j = 0; j < n; j++){
      if(j === i) continue;
      const b = pts[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if(d2 < 0.01){                       /* two nodes exactly on top of each
                                              other have no direction to part in
                                              — give them one, from their order */
        dx = (i - j) * 0.05; dy = (i * 7 - j * 3) % 5 * 0.05 + 0.05;
        d2 = dx * dx + dy * dy;
      }
      const f = GPH_REPEL / d2, d = Math.sqrt(d2);
      fx += dx / d * f; fy += dy / d * f;
    }
    a.fx = fx; a.fy = fy;
  }
  for(const e of g.edges){
    const a = pts[e.a], b = pts[e.b];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = (d - GPH_LINK) * GPH_PULL;
    const ux = dx / d * f, uy = dy / d * f;
    a.fx += ux; a.fy += uy; b.fx -= ux; b.fy -= uy;
  }
  let moved = 0;
  for(const p of pts){
    if(p.pin){ p.vx = p.vy = 0; continue; }
    /* a well-connected node is a heavier one: the leaves swing, the hubs hold */
    const mass = 1 + p.deg * 0.5;
    p.vx = (p.vx + p.fx / mass * k) * GPH_DRAG;
    p.vy = (p.vy + p.fy / mass * k) * GPH_DRAG;
    p.x += p.vx * k; p.y += p.vy * k;
    moved += Math.abs(p.vx) + Math.abs(p.vy);
  }
  const rate = moved / n;
  g.calm = rate < GPH_CALM;
  return rate;
}
/* run it until it stops moving, or until patience runs out */
function gphSettle(g, steps){
  const max = steps || 260;
  for(let i = 0; i < max; i++) if(gphTick(g, 1) < GPH_CALM) return i + 1;
  return max;
}
/* the box the whole graph is standing in, with room around it */
function gphBounds(g, pad){
  const p = pad == null ? 30 : pad;
  if(!g.pts.length) return { x:-100, y:-100, w:200, h:200 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for(const q of g.pts){
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
  }
  return { x:x0 - p, y:y0 - p, w:Math.max(1, x1 - x0 + p * 2), h:Math.max(1, y1 - y0 + p * 2) };
}
/* the node nearest a point, and how far away it was — for a pointer that has
   to hit a small circle with a thumb */
function gphNearest(g, x, y){
  let best = -1, near = Infinity;
  for(let i = 0; i < g.pts.length; i++){
    const p = g.pts[i], d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if(d < near){ near = d; best = i; }
  }
  return { i:best, d:Math.sqrt(near) };
}
