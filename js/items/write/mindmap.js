/* Open Note — items/write/mindmap.js
   thinking maps: one tile on the shelf, nine kinds of map behind it.

   ================= why it is built this way =================

   **One tile, nine maps.** A flow map and a bubble map are not two features:
   they are two readings of the same handful of thoughts. So there is one item
   type, one palette tile, and a `kind` on the record. Changing it re-reads the
   same nodes — nothing is rewritten, nothing is lost, and the map springs from
   one arrangement to the other in front of you.

   **A map is stored as what it means.** A node names its parent and, where the
   kind cares, which side of the middle it is on. Positions are *derived* every
   time the map is drawn (js/lib/mindmap.js), never stored — so a print, a
   thumbnail and an export come out right without anything repainting first,
   and undo restores a map rather than a picture of one. A node moved by hand
   keeps `ox`/`oy`: an offset from where the layout would have put it, which
   survives a change of kind and is what ⇥ Tidy throws away.

   **A kind is one block.** `defineMindMapKind()` takes a seed, a `place()`
   that puts the boxes somewhere and a `draw()` that joins them up, plus the
   add-buttons that kind wants on the bar. The nine below are written entirely
   out of the primitives in lib/mindmap.js and know nothing about the editor,
   the bars, the animation or the store. A tenth is one more block in this file
   and one line in the gallery — nothing else in the app changes.

   **Every option comes off a bar.** Clicking a node raises the node bar;
   clicking the paper under it raises the map bar. Both are built from one
   registry of actions (`defineMindMapAction()`), each with a `when()` that
   decides whether this map, this kind and this node should see it. That is the
   seam the next twenty features go through, and why neither bar has a switch
   statement in it.

   **The whole map is one SVG.** Text is measured, wrapped and boxed before a
   single glyph is drawn, so the box always fits its writing exactly; the
   measuring is a canvas handed to lib/mindmap.js, and the wrapping is the same
   in the live editor, in a print and in an exported file. */

/* ================= the look =================
   Five palettes plus the note's own colours. A tone is an index, never a
   colour, so restyling a whole map is one word on the record. */
const MP_PALETTES = {
  ink:      { label:'Ink',      colors:['var(--accent)','var(--accent2)','var(--ink)','var(--soft)','var(--accent)'] },
  graphite: { label:'Graphite', colors:['#4a5364','#626d80','#7d8899','#98a2b3','#5a647a'] },
  sunset:   { label:'Sunset',   colors:['#ef7d57','#f0a15c','#e8c25e','#e5738b','#c77dd8'] },
  ocean:    { label:'Ocean',    colors:['#3d7bd9','#3aa0c4','#45bda9','#6f8fe0','#8a7fd6'] },
  meadow:   { label:'Meadow',   colors:['#4a9d6a','#74b558','#a3c352','#3f9a8c','#5fb39c'] },
  berry:    { label:'Berry',    colors:['#d4587d','#b45bc4','#8b6ae0','#e0798e','#9c5aa8'] }
};
const MP_FILLS = [
  { v:'soft',  label:'Soft',  hint:'A tint of the colour, with the note’s own ink on top' },
  { v:'solid', label:'Solid', hint:'The colour itself, with white type' },
  { v:'line',  label:'Outline', hint:'The paper showing through, ruled in the colour' },
  { v:'glass', label:'Glass', hint:'Frosted paper with a coloured hairline' }
];
const MP_LINKS = [
  { v:'curve',  label:'Curved',   hint:'Branches that grow out of their parent' },
  { v:'line',   label:'Straight', hint:'The shortest way between two boxes' },
  { v:'elbow',  label:'Squared',  hint:'Right angles, rounded at the corners' }
];
const MP_LOOK = { pal:'ocean', fill:'soft', link:'curve', gap:1, fs:1, frame:1, shade:1 };

const MP_MIN_Z = .35, MP_MAX_Z = 3.2, MP_BASE_W = 88;

/* ================= the kind registry =================
     defineMindMapKind('flow', {
       label, hint, blurb,          // the gallery tile
       glyph,                       // a small drawing of the map, 60 × 40
       defaults: { link, fill },    // what this kind looks best as
       seed: () => [[key, parentKey, text, side, tone], …],
       place: c => [box, …],        // where the boxes go, in the kind’s own units
       draw:  (c, at) => ({links, deco}),   // and what joins them up
       adds:  [{ id, label, hint, when(c, node), run(c, node) }, …]
     })                                                                       */
const MP_KINDS = {};
const MP_KIND_ORDER = [];
function defineMindMapKind(id, def){
  if(MP_KINDS[id]) console.warn('two thinking maps both call themselves "' + id + '"');
  MP_KINDS[id] = { id, defaults:{}, adds:[], ...def };
  MP_KIND_ORDER.push(id);
  return MP_KINDS[id];
}
const mpKind = it => MP_KINDS[it && it.kind] || MP_KINDS.mind;
const mpKinds = () => MP_KIND_ORDER.map(id => MP_KINDS[id]);

/* ---- what the bars are made of ----
   Core of the modularity promise: a button is a record with a `when`, and the
   bar is every record whose `when` says yes, in order. Nothing that draws a
   bar knows what any of the buttons do. */
const MP_ACTS = [];
function defineMindMapAction(spec){
  if(!spec || !spec.id || typeof spec.run !== 'function') return;
  const at = MP_ACTS.findIndex(x => x.id === spec.id);
  if(at >= 0) MP_ACTS.splice(at, 1);
  MP_ACTS.push({ order:50, group:'node', ...spec });
}
const mpActs = group => MP_ACTS.filter(a => (a.group || 'node') === group)
  .sort((a, b) => a.order - b.order);

/* ================= the record ================= */
const mpLook = it => ({ ...MP_LOOK, ...(mpKind(it).defaults || {}), ...(it.look || {}) });
function mpSetLook(it, key, val, page){
  it.look = { ...(it.look || {}) };
  it.look[key] = val;
  if(page) queueSave(page.id);
}
const mpView = it => ({ z: clamp(+it.zoom || 1, MP_MIN_Z, MP_MAX_Z),
  x: Number.isFinite(+it.viewX) ? +it.viewX : 0,
  y: Number.isFinite(+it.viewY) ? +it.viewY : 0 });
const mpNode = (it, id) => mmNodes(it).find(n => n.id === id) || null;

/* the tones: a branch takes its own colour and its children inherit it, so a
   whole limb of a mind map reads as one thought without anyone colouring it */
function mpTones(it){
  const tone = new Map(), roots = mmRoots(it);
  roots.forEach((r, i) => tone.set(r.id, i));
  const walk = (node, depth) => {
    mmKids(it, node.id).forEach((k, i) => {
      tone.set(k.id, depth === 0 && roots.length < 2 ? i : tone.get(node.id));
      walk(k, depth + 1);
    });
  };
  roots.forEach(r => walk(r, 0));
  for(const n of mmNodes(it)) if(Number.isFinite(+n.tone)) tone.set(n.id, +n.tone);
  return tone;
}
/* everything a fold is hiding */
function mpHidden(it){
  const out = new Set();
  const walk = (node, under) => {
    if(under) out.add(node.id);
    for(const k of mmKids(it, node.id)) walk(k, under || !!node.fold);
  };
  for(const r of mmRoots(it)) walk(r, false);
  return out;
}

/* ---- the context every kind is handed ----
   It answers questions about the map and hands back boxes; a kind never
   touches the record, the look or the store directly. */
function mpCtx(it){
  const look = mpLook(it), hidden = mpHidden(it), tones = mpTones(it);
  const all = mmNodes(it), by = mmById(it);
  const depth = new Map();
  const walk = (n, d) => { depth.set(n.id, d); for(const k of mmKids(it, n.id)) walk(k, d + 1); };
  for(const r of mmRoots(it)) walk(r, 0);
  const nodes = all.filter(n => !hidden.has(n.id));
  const kids = id => mmKids(it, id).filter(n => !hidden.has(n.id));
  const leaves = id => {
    const k = kids(id);
    if(!k.length) return 1;
    let n = 0;
    for(const x of k) n += leaves(x.id);
    return n;
  };
  const c = {
    it, look, nodes, by, hidden,
    roots: mmRoots(it).filter(n => !hidden.has(n.id)),
    kids, leaves,
    depth: n => depth.get(n && n.id) || 0,
    tone: n => tones.get(n && n.id) || 0,
    side: (n, d) => n && n.side ? n.side : (d || ''),
    gap: Math.round(26 * look.gap),
    fs: Math.round(17 * look.fs),
    /* one box, its writing already wrapped to fit it */
    box(node, o){
      o = o || {};
      const shape = node.shape || o.shape || 'round';
      const b = mmBox(node.text == null ? '' : node.text,
        { fs:o.fs || c.fs, bold:!!o.bold, shape, maxW:o.maxW || 190,
          padX:o.padX, padY:o.padY, minW:o.minW, minH:o.minH, maxLines:o.maxLines });
      b.id = node.id; b.node = node; b.x = 0; b.y = 0;
      b.tone = c.tone(node); b.role = o.role || '';
      b.fold = !!node.fold && mmKids(it, node.id).length;
      b.kids = mmKids(it, node.id).length;
      return b;
    }
  };
  return c;
}

/* ---- laying a map out, offsets and all ----
   place() then the hand-placed offsets then draw(), in that order, because a
   connector has to be drawn to where a box actually ended up. */
function mpLayout(it){
  const c = mpCtx(it), kind = mpKind(it);
  let boxes = [];
  try{ boxes = (kind.place(c) || []).filter(Boolean); }
  catch(e){ console.warn('mindmap: ' + kind.id + ' could not be laid out', e); }
  const at = new Map(boxes.map(b => [b.id, b]));
  /* Nothing is lost when the kind changes. A thought deeper than this kind
     draws is fanned out beside its parent on a hairline — visibly an aside
     rather than part of the pattern, and one drag from somewhere the kind does
     understand. It is the reason switching a map’s kind is never destructive. */
  const strays = [];
  /* A kind that reads one root — every one but the double bubble — would
     otherwise lose the second and everything under it the moment the map
     changed kind. An undrawn root is stood below what was drawn; its children
     then find it on the next pass. */
  const orphans = c.roots.filter(r => !at.has(r.id));
  if(orphans.length){
    const b0 = mmBounds(boxes, []);
    let y = (Number.isFinite(b0.y1) && boxes.length ? b0.y1 : 0) + c.gap * 2.4;
    for(const r of orphans){
      const b = c.box(r, { maxW:190, bold:1 });
      b.stray = 1;
      b.x = boxes.length ? (b0.x0 + b0.x1) / 2 : 0;
      b.y = y + b.h / 2;
      y += b.h + c.gap;
      boxes.push(b); at.set(b.id, b); strays.push(b);
    }
  }
  for(let pass = 0; pass < 8; pass++){
    const left = c.nodes.filter(n => !at.has(n.id) && at.has(n.pid));
    if(!left.length) break;
    const byParent = new Map();
    for(const n of left){
      if(!byParent.has(n.pid)) byParent.set(n.pid, []);
      byParent.get(n.pid).push(n);
    }
    for(const [pid, list] of byParent){
      const pb = at.get(pid);
      list.forEach((n, i) => {
        const b = c.box(n, { shape:'pill', maxW:150, fs: Math.round(c.fs * .85) });
        b.stray = 1;
        b.x = pb.x + pb.w / 2 + b.w / 2 + c.gap * 1.3;
        b.y = pb.y + (i - (list.length - 1) / 2) * (b.h + c.gap * .5);
        boxes.push(b); at.set(b.id, b); strays.push(b);
      });
    }
  }
  /* The frame is fitted to where the kind put things, *before* the hand-placed
     offsets go on. Fitting to the moved boxes felt broken: drop a box a little
     to the right and the whole map slid left and shrank to make room for it,
     so nothing ended up where it was let go. A box dragged past the edge is
     one pan away, and the map under everything else has not moved. */
  const home = kind.draw && boxes.some(b => b.node && (b.node.ox || b.node.oy))
    ? mmBounds(boxes, mpDeco(kind, c, at)) : null;
  for(const b of boxes){
    const n = b.node;
    if(n && (n.ox || n.oy)){ b.x += +n.ox || 0; b.y += +n.oy || 0; }
  }
  let drawn = { links:[], deco:[] };
  try{ drawn = kind.draw(c, id => at.get(id) || null) || drawn; }
  catch(e){ console.warn('mindmap: ' + kind.id + ' could not be joined up', e); }
  const links = (drawn.links || []).slice(), deco = drawn.deco || [];
  for(const b of strays){
    const pb = b.node.pid ? at.get(b.node.pid) : null;
    if(pb) links.push({ d: mmLine(pb, b), tone:b.tone, w:1.3, dash:'3 5', op:.45 });
  }
  return { boxes, links, deco, at, ctx:c, fit: mmFrame(home || mmBounds(boxes, deco), 32, 1.3) };
}
/* the decoration a kind would draw round boxes as they stand now — asked for
   once more, before the offsets, so the fit can ignore a hand-moved box */
function mpDeco(kind, c, at){
  try{ return (kind.draw(c, id => at.get(id) || null) || {}).deco || []; }
  catch(e){ return []; }
}

/* ---- the two things every kind draws with ----
   `place()` and `draw()` are handed the same context object, so a kind that
   works something out while placing may stash it there for the joining-up
   pass. Offsets are applied in between, which is why anything stashed should
   be a list of ids rather than a position. */
function mpJoin(c, a, b, axis){
  const l = c.look.link;
  return l === 'elbow' ? mmElbow(a, b, axis || (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'h' : 'v'))
    : l === 'line' ? mmLine(a, b) : mmCurve(a, b, .5);
}
/* a colour the kind chose, unless the reader has chosen one for that node */
const mpTint = (b, t) => { if(b && !Number.isFinite(+(b.node || {}).tone)) b.tone = t; };
const mpWide = bs => bs.reduce((m, b) => Math.max(m, b.w), 0);

/* ================= 1 · the mind map ================= */
defineMindMapKind('mind', {
  label:'Mind map', hint:'A central idea with branches growing out of it',
  blurb:'Branches in every direction, each limb keeping its own colour.',
  glyph:'<circle cx="30" cy="20" r="7"/><path d="M37 18l11-6M37 22l11 6M23 20H12"/>' +
        '<circle cx="51" cy="11" r="3.4"/><circle cx="51" cy="29" r="3.4"/><circle cx="9" cy="20" r="3.4"/>',
  defaults:{ link:'curve', fill:'soft' },
  nest: Infinity,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'Central idea'], ['a', 'r', 'First branch'],
    ['b', 'r', 'Second branch'], ['c', 'r', 'Third branch']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    /* A mind map reads left and right off the middle rather than round it: the
       branches alternate sides, each one carrying its own limb outwards, and
       every parent sits at the middle of the band its children take up. That
       is the shape people mean when they say mind map, and it is also the one
       that stays legible when a limb grows six deep. */
    const boxes = [];
    const rb = c.box(root, { fs: Math.round(c.fs * 1.32), bold:1, maxW:240, role:'root' });
    rb.x = 0; rb.y = 0;
    boxes.push(rb);
    const stepX = 92 * c.look.gap, gapY = c.gap * .8;
    const build = (node, depth) => {
      const b = c.box(node, { fs: Math.round(c.fs * (depth === 1 ? 1 : .92)),
        shape: depth === 1 ? 'round' : 'pill', maxW: depth === 1 ? 195 : 168 });
      const kid = c.kids(node.id).map(k => build(k, depth + 1));
      const kh = kid.length ? kid.reduce((a, x) => a + x.h, 0) + gapY * (kid.length - 1) : 0;
      return { b, kid, h: Math.max(b.h + gapY * .35, kh) };
    };
    const lay = (t, dir, x, top) => {
      t.b.x = x;
      boxes.push(t.b);
      if(!t.kid.length){ t.b.y = top + t.h / 2; return; }
      const kh = t.kid.reduce((a, k) => a + k.h, 0) + gapY * (t.kid.length - 1);
      let y = top + (t.h - kh) / 2;
      for(const k of t.kid){
        lay(k, dir, x + dir * (t.b.w / 2 + stepX + k.b.w / 2), y);
        y += k.h + gapY;
      }
      t.b.y = (t.kid[0].b.y + t.kid[t.kid.length - 1].b.y) / 2;
    };
    /* the right half fills first and keeps the order it was written in; the
       rest go left, also in order — alternating sides scatters a list */
    const kids = c.kids(root.id), half = Math.ceil(kids.length / 2);
    const sides = [kids.slice(0, half), kids.slice(half)];
    sides.forEach((list, side) => {
      const dir = side ? -1 : 1, trees = list.map(k => build(k, 1));
      const H = trees.reduce((a, t) => a + t.h, 0) + gapY * Math.max(0, trees.length - 1);
      let y = -H / 2;
      for(const t of trees){
        lay(t, dir, dir * (rb.w / 2 + stepX + t.b.w / 2), y);
        y += t.h + gapY;
      }
    });
    return boxes;
  },
  draw(c, at){
    const links = [];
    for(const n of c.nodes){
      const a = at(n.pid), b = at(n.id);
      if(!a || !b) continue;
      links.push({ d: c.look.link === 'curve' ? mmSCurve(a, b) : mpJoin(c, a, b, 'h'),
        tone: c.tone(n), w: Math.max(1.6, 3.4 - c.depth(n) * .75) });
    }
    return { links };
  },
  adds:[{ id:'branch', label:'Branch', hint:'A new branch off the middle',
    when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id) }]
});

/* ================= 2 · the circle map ================= */
defineMindMapKind('circle', {
  label:'Circle map', hint:'A thing in the middle, everything you know round it',
  blurb:'Defining in context — and the frame of reference round the outside.',
  glyph:'<circle cx="30" cy="20" r="16"/><circle cx="30" cy="20" r="6"/>' +
        '<rect x="4" y="2" width="52" height="36" rx="4" stroke-dasharray="3 3"/>',
  defaults:{ link:'line', fill:'soft', frame:1 },
  nest: 1,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'The topic'], ['a', 'r', 'What I know'], ['b', 'r', 'A detail'],
    ['c', 'r', 'An example'], ['d', 'r', 'A question']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    const rb = c.box(root, { fs: Math.round(c.fs * 1.1), bold:1, shape:'circle', maxW:140, role:'root' });
    const kids = c.kids(root.id);
    const bs = kids.map(k => c.box(k, { shape:'pill', maxW:170, fs: Math.round(c.fs * .95) }));
    bs.forEach(b => mpTint(b, 1));
    let per = 0;
    for(const b of bs) per += Math.max(b.w, b.h) + c.gap * 1.7;
    const rr = Math.max(rb.w / 2 + 120 * c.look.gap, per / (2 * Math.PI) + 42);
    mmRing(bs.length, rr, -Math.PI / 2).forEach((p, i) => { bs[i].x = p.x; bs[i].y = p.y; });
    return [rb, ...bs];
  },
  draw(c, at){
    const root = c.roots[0];
    if(!root) return { links:[], deco:[] };
    const rb = at(root.id), kids = c.kids(root.id).map(k => at(k.id)).filter(Boolean);
    let R = (rb ? Math.max(rb.w, rb.h) / 2 : 50) + 110;
    /* the far corner of a box, not its width: a wide pill lying across the top
       of the ring is nowhere near as far out as its own width suggests */
    for(const b of kids)
      R = Math.max(R, Math.hypot(Math.abs(b.x) + b.w / 2, Math.abs(b.y) + b.h / 2) + 20);
    const deco = [{ t:'circle', x:0, y:0, r:R, cls:'mmring' },
      { t:'circle', x:0, y:0, r:(rb ? Math.max(rb.w, rb.h) / 2 : 46) + 22, cls:'mmring mmring2' }];
    if(c.look.frame){
      const p = 28;
      deco.push({ t:'rect', x:-R - p, y:-R - p, w:(R + p) * 2, h:(R + p) * 2, r:20, cls:'mmframe' });
      deco.push({ t:'text', x:-R - p + 20, y:-R - p + 27, anchor:'start', cls:'mmnote',
        edit:'frame', s: c.it.frame || 'Frame of reference — double-click to say how you know' });
    }
    return { links:[], deco };
  },
  opts: x => [{ t:'btn', label:'Frame', hint:'The dashed frame of reference round the outside',
    text:() => mpLook(x.it).frame ? 'On' : 'Off',
    act:() => { mpSetLook(x.it, 'frame', mpLook(x.it).frame ? 0 : 1, x.page);
      mpCommit(x.outer, x.it, x.page); } }],
  adds:[{ id:'context', label:'Context', hint:'Another thing you know about it',
    when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id) }]
});

/* ================= 3 · the bubble map ================= */
defineMindMapKind('bubble', {
  label:'Bubble map', hint:'One thing, and the words that describe it',
  blurb:'Describing — adjectives in bubbles round the thing itself.',
  glyph:'<ellipse cx="30" cy="20" rx="10" ry="7"/><circle cx="9" cy="10" r="5"/>' +
        '<circle cx="51" cy="10" r="5"/><circle cx="9" cy="30" r="5"/><circle cx="51" cy="30" r="5"/>' +
        '<path d="M21 16l-7-3M39 16l7-3M21 24l-7 3M39 24l7 3"/>',
  defaults:{ link:'line', fill:'soft' },
  nest: 2,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'The thing'], ['a', 'r', 'How it looks'], ['b', 'r', 'How it feels'],
    ['c', 'r', 'How it behaves'], ['d', 'r', 'Why it matters']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    const rb = c.box(root, { fs: Math.round(c.fs * 1.15), bold:1, shape:'ellipse', maxW:165, role:'root' });
    const boxes = [rb], at = new Map([[root.id, rb]]);
    const kids = c.kids(root.id);
    const bs = kids.map(k => c.box(k, { shape:'ellipse', maxW:175, fs: Math.round(c.fs * .95) }));
    let per = 0;
    for(const b of bs) per += b.w + c.gap * 1.6;
    const rr = Math.max(rb.w / 2 + 145 * c.look.gap, per / (2 * Math.PI) + 62);
    const ring = mmRing(bs.length, rr, -Math.PI / 2);
    bs.forEach((b, i) => {
      b.x = ring[i].x; b.y = ring[i].y;
      boxes.push(b); at.set(b.id, b);
      /* a bubble of a bubble is rare, but it should not land on top of one:
         it goes on out along the same spoke */
      const sub = c.kids(kids[i].id);
      const spread = sub.length > 1 ? .5 : 0;
      sub.forEach((s, j) => {
        const a = ring[i].a - spread / 2 + (sub.length > 1 ? spread * j / (sub.length - 1) : 0);
        const sb = c.box(s, { shape:'ellipse', maxW:160, fs: Math.round(c.fs * .88) });
        sb.x = Math.cos(a) * (rr + 130 * c.look.gap);
        sb.y = Math.sin(a) * (rr + 130 * c.look.gap);
        boxes.push(sb); at.set(sb.id, sb);
      });
    });
    return boxes;
  },
  draw(c, at){
    const links = [];
    for(const n of c.nodes){
      const a = at(n.pid), b = at(n.id);
      if(a && b) links.push({ d: mmLine(a, b), tone: b.tone, w:1.7 });
    }
    return { links };
  },
  adds:[{ id:'bubble', label:'Bubble', hint:'Another word for it',
    when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id) }]
});

/* ================= 4 · the double bubble map =================
   Two roots, which is why mmRoots() hands back a list. Everything hangs off
   the first of them: `side:'c'` is shared between the two, anything else is
   the property of the root it is under. */
defineMindMapKind('double', {
  label:'Double bubble', hint:'Two things compared: what they share, and what they don’t',
  blurb:'Comparing and contrasting — shared bubbles down the middle.',
  glyph:'<ellipse cx="17" cy="20" rx="8" ry="6"/><ellipse cx="43" cy="20" rx="8" ry="6"/>' +
        '<circle cx="30" cy="10" r="4"/><circle cx="30" cy="30" r="4"/>' +
        '<circle cx="4.5" cy="20" r="3.5"/><circle cx="55.5" cy="20" r="3.5"/>' +
        '<path d="M24 16l3-3M36 16l-3-3M24 24l3 3M36 24l-3 3M9 20h0"/>',
  defaults:{ link:'line', fill:'soft' },
  nest: 1,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['l', null, 'First thing'], ['r', null, 'Second thing'],
    ['s1', 'l', 'Both are…', 'c'], ['s2', 'l', 'Both have…', 'c'],
    ['l1', 'l', 'Only the first', 'l'], ['r1', 'r', 'Only the second', 'r']],
  place(c){
    const roots = c.roots;
    if(!roots.length) return [];
    const L = roots[0], R = roots[1] || null;
    const lb = c.box(L, { fs: Math.round(c.fs * 1.12), bold:1, shape:'ellipse', maxW:160, role:'root' });
    const rb = R ? c.box(R, { fs: Math.round(c.fs * 1.12), bold:1, shape:'ellipse', maxW:160, role:'root' }) : null;
    mpTint(lb, 0); if(rb) mpTint(rb, 1);
    const shared = c.kids(L.id).filter(n => n.side === 'c');
    const lonly = c.kids(L.id).filter(n => n.side !== 'c');
    const ronly = R ? c.kids(R.id) : [];
    const mk = (list, t) => list.map(n => { const b = c.box(n, { shape:'ellipse', maxW:180, fs: Math.round(c.fs * .92) }); mpTint(b, t); return b; });
    const sh = mk(shared, 2), lo = mk(lonly, 0), ro = mk(ronly, 1);
    const sep = mpWide(sh) / 2 + Math.max(lb.w, rb ? rb.w : 0) / 2 + c.gap * 3.4;
    lb.x = -sep; lb.y = 0;
    if(rb){ rb.x = sep; rb.y = 0; }
    mmColumn(sh, 0, 0, c.gap * .8);
    mmColumn(lo, -sep - lb.w / 2 - mpWide(lo) / 2 - c.gap * 2.6, 0, c.gap * .8);
    if(rb) mmColumn(ro, sep + rb.w / 2 + mpWide(ro) / 2 + c.gap * 2.6, 0, c.gap * .8);
    return [lb, rb, ...sh, ...lo, ...ro].filter(Boolean);
  },
  draw(c, at){
    const roots = c.roots, L = roots[0], R = roots[1];
    if(!L) return { links:[], deco:[] };
    const links = [], lb = at(L.id), rb = R ? at(R.id) : null;
    for(const n of c.kids(L.id)){
      const b = at(n.id);
      if(!b) continue;
      if(lb) links.push({ d: mmLine(lb, b), tone:b.tone, w:1.7 });
      if(n.side === 'c' && rb) links.push({ d: mmLine(rb, b), tone:b.tone, w:1.7 });
    }
    if(rb) for(const n of c.kids(R.id)){
      const b = at(n.id);
      if(b) links.push({ d: mmLine(rb, b), tone:b.tone, w:1.7 });
    }
    return { links };
  },
  /* becoming a double bubble when there is only one root grows the second */
  adopt(it, page){
    if(mmRoots(it).length > 1) return;
    mmNodes(it).push({ id: uid(), pid:null, text:'Second thing', tone:1 });
    if(page) queueSave(page.id);
  },
  adds:[
    { id:'shared', label:'Shared', hint:'Something both of them have',
      when: x => x.c.roots.length > 1,
      run: x => mpNewNode(x.it, x.page, x.c.roots[0].id, { side:'c', tone:2 }) },
    { id:'only-l', label:'Only ①', hint:'True of the first thing alone',
      when: x => !!x.c.roots[0],
      run: x => mpNewNode(x.it, x.page, x.c.roots[0].id, { side:'l' }) },
    { id:'only-r', label:'Only ②', hint:'True of the second thing alone',
      when: x => x.c.roots.length > 1,
      run: x => mpNewNode(x.it, x.page, x.c.roots[1].id, { side:'r' }) }
  ]
});

/* ================= 5 · the tree map ================= */
defineMindMapKind('tree', {
  label:'Tree map', hint:'A category, its groups, and what is in each',
  blurb:'Classifying — one heading, its groups, and their members.',
  glyph:'<rect x="21" y="3" width="18" height="8" rx="2"/><path d="M30 11v5M12 16h36M12 16v4M30 16v4M48 16v4"/>' +
        '<rect x="5" y="20" width="14" height="6" rx="1.5"/><rect x="23" y="20" width="14" height="6" rx="1.5"/>' +
        '<rect x="41" y="20" width="14" height="6" rx="1.5"/><rect x="5" y="30" width="14" height="6" rx="1.5"/>',
  defaults:{ link:'elbow', fill:'soft' },
  nest: 2,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'The category'], ['a', 'r', 'Group one'], ['b', 'r', 'Group two'],
    ['c', 'r', 'Group three'], ['a1', 'a', 'A member'], ['a2', 'a', 'Another'],
    ['b1', 'b', 'A member'], ['c1', 'c', 'A member']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    const rb = c.box(root, { fs: Math.round(c.fs * 1.15), bold:1, maxW:240, role:'root' });
    const boxes = [rb];
    const cols = c.kids(root.id).map(bn => {
      const bb = c.box(bn, { bold:1, maxW:185 });
      const leaves = c.kids(bn.id).map(l => {
        const lb = c.box(l, { shape:'pill', maxW:175, fs: Math.round(c.fs * .92) });
        mpTint(lb, bb.tone);
        return lb;
      });
      return { bb, leaves, w: Math.max(bb.w, mpWide(leaves), 64) };
    });
    const gapX = c.gap * 1.4;
    const total = cols.reduce((a, x) => a + x.w, 0) + gapX * Math.max(0, cols.length - 1);
    const branchY = 128 * c.look.gap;
    let x = -total / 2;
    for(const col of cols){
      const cx = x + col.w / 2;
      col.bb.x = cx; col.bb.y = branchY;
      let y = branchY + col.bb.h / 2 + c.gap * 1.5;
      for(const l of col.leaves){ l.x = cx; l.y = y + l.h / 2; y += l.h + c.gap * .7; }
      boxes.push(col.bb, ...col.leaves);
      x += col.w + gapX;
    }
    rb.x = 0; rb.y = 0;
    return boxes;
  },
  draw(c, at){
    const links = [];
    for(const n of c.nodes){
      const a = at(n.pid), b = at(n.id);
      if(a && b) links.push({ d: mpJoin(c, a, b, 'v'), tone:b.tone,
        w: c.depth(n) > 1 ? 1.5 : 2.2 });
    }
    return { links };
  },
  adds:[
    { id:'group', label:'Group', hint:'Another group under the heading',
      when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id) },
    { id:'member', label:'Member', hint:'Something inside the group you picked',
      when: x => x.node && x.c.depth(x.node) === 1,
      run: x => mpNewNode(x.it, x.page, x.node.id) }
  ]
});

/* ================= 6 · the brace map ================= */
defineMindMapKind('brace', {
  label:'Brace map', hint:'A whole thing, and the parts it is made of',
  blurb:'Taking apart — a physical whole, its parts, and their parts.',
  glyph:'<rect x="3" y="16" width="14" height="8" rx="2"/>' +
        '<path d="M21 8c3 0 3 10 4 12-1 2-1 12-4 12"/>' +
        '<rect x="29" y="5" width="12" height="6" rx="1.5"/><rect x="29" y="17" width="12" height="6" rx="1.5"/>' +
        '<rect x="29" y="29" width="12" height="6" rx="1.5"/>' +
        '<path d="M45 15c2 0 2 4 3 5-1 1-1 5-3 5"/><rect x="52" y="17" width="6" height="6" rx="1.5"/>',
  defaults:{ link:'line', fill:'line' },
  nest: 2,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'The whole thing'], ['a', 'r', 'Part one'], ['b', 'r', 'Part two'],
    ['c', 'r', 'Part three'], ['a1', 'a', 'A smaller part'], ['a2', 'a', 'And another']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    const wb = c.box(root, { fs: Math.round(c.fs * 1.15), bold:1, maxW:190, role:'root' });
    const boxes = [wb];
    const groups = c.kids(root.id).map(p => {
      const pb = c.box(p, { maxW:185, bold:1 });
      const subs = c.kids(p.id).map(s => {
        const sb = c.box(s, { shape:'pill', maxW:175, fs: Math.round(c.fs * .92) });
        mpTint(sb, pb.tone);
        return sb;
      });
      return { pb, subs };
    });
    const braceW = 44 * c.look.gap;
    const px = wb.w / 2 + braceW + mpWide(groups.map(g => g.pb)) / 2 + c.gap * 1.4;
    const subW = mpWide(groups.reduce((a, g) => a.concat(g.subs), []));
    const sx = px + mpWide(groups.map(g => g.pb)) / 2 + braceW + subW / 2 + c.gap * 1.4;
    const gapY = c.gap * 1.5;
    let y = 0;
    for(const g of groups){
      const subH = g.subs.reduce((a, s) => a + s.h, 0) + Math.max(0, g.subs.length - 1) * c.gap * .7;
      const blockH = Math.max(g.pb.h, subH);
      const cy = y + blockH / 2;
      g.pb.x = px; g.pb.y = cy;
      if(g.subs.length) mmColumn(g.subs, sx, cy, c.gap * .7);
      boxes.push(g.pb, ...g.subs);
      y += blockH + gapY;
    }
    const shift = -(y - gapY) / 2;
    for(const b of boxes) if(b !== wb) b.y += shift;
    wb.x = 0; wb.y = 0;
    return boxes;
  },
  draw(c, at){
    const root = c.roots[0];
    if(!root) return { links:[], deco:[] };
    const deco = [], wb = at(root.id);
    const span = bs => ({ y0: Math.min(...bs.map(b => b.y - b.h / 2)),
      y1: Math.max(...bs.map(b => b.y + b.h / 2)),
      x: Math.min(...bs.map(b => b.x - b.w / 2)) });
    const parts = c.kids(root.id).map(p => at(p.id)).filter(Boolean);
    if(wb && parts.length){
      const s = span(parts);
      deco.push({ t:'path', cls:'mmbrace', tone:0,
        d: mmBrace(s.x - 15, wb.x + wb.w / 2 + 13, s.y0 - 9, s.y1 + 9) });
    }
    for(const p of c.kids(root.id)){
      const pb = at(p.id), subs = c.kids(p.id).map(s => at(s.id)).filter(Boolean);
      if(!pb || !subs.length) continue;
      const s = span(subs);
      deco.push({ t:'path', cls:'mmbrace mmbrace2', tone: pb.tone,
        d: mmBrace(s.x - 13, pb.x + pb.w / 2 + 11, s.y0 - 7, s.y1 + 7) });
    }
    return { links:[], deco };
  },
  adds:[
    { id:'part', label:'Part', hint:'Another part of the whole',
      when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id) },
    { id:'subpart', label:'Sub-part', hint:'A part of the part you picked',
      when: x => x.node && x.c.depth(x.node) === 1,
      run: x => mpNewNode(x.it, x.page, x.node.id) }
  ]
});

/* ================= 7 · the flow map ================= */
defineMindMapKind('flow', {
  label:'Flow map', hint:'One thing after another, in order',
  blurb:'Sequencing — stages left to right, with sub-stages under them.',
  glyph:'<rect x="3" y="9" width="14" height="9" rx="2"/><rect x="23" y="9" width="14" height="9" rx="2"/>' +
        '<rect x="43" y="9" width="14" height="9" rx="2"/><path d="M17 13.5h5M37 13.5h5"/>' +
        '<path d="M30 18v5"/><rect x="23" y="24" width="14" height="7" rx="2" stroke-dasharray="3 2.5"/>',
  defaults:{ link:'line', fill:'soft' },
  nest: 2,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'The process'], ['a', 'r', 'First'], ['b', 'r', 'Then'],
    ['c', 'r', 'After that'], ['d', 'r', 'Finally'], ['b1', 'b', 'a detail']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    const stages = c.kids(root.id);
    const cells = stages.map(s => ({ id:s.id,
      b: c.box(s, { maxW:185, bold:1 }),
      subs: c.kids(s.id).map(x => {
        const sb = c.box(x, { shape:'pill', maxW:165, fs: Math.round(c.fs * .88) });
        mpTint(sb, c.tone(s));
        return sb;
      }) }));
    const per = cells.length <= 6 ? Math.max(1, cells.length)
      : Math.ceil(cells.length / Math.ceil(cells.length / 5));
    const gapX = c.gap * 2.1, gapY = c.gap * 2.4;
    const rows = [];
    for(let i = 0; i < cells.length; i += per) rows.push(cells.slice(i, i + per));
    let y = 0;
    const boxes = [];
    for(const row of rows){
      let w = row.reduce((a, r) => a + r.b.w, 0) + gapX * (row.length - 1);
      let x = -w / 2, tall = 0;
      for(const r of row){
        r.b.x = x + r.b.w / 2; r.b.y = y;
        let sy = y + r.b.h / 2 + c.gap * .9;
        for(const s of r.subs){ s.x = r.b.x; s.y = sy + s.h / 2; sy += s.h + c.gap * .5; }
        tall = Math.max(tall, sy - y + r.b.h / 2);
        boxes.push(r.b, ...r.subs);
        x += r.b.w + gapX;
      }
      y += tall + gapY;
    }
    c.flowRows = rows.map(r => r.map(x => x.id));
    const top = boxes.length ? Math.min(...boxes.map(b => b.y - b.h / 2)) : 0;
    const bottom = boxes.length ? Math.max(...boxes.map(b => b.y + b.h / 2)) : 0;
    const shift = -(top + bottom) / 2;
    for(const b of boxes) b.y += shift;
    const rb = c.box(root, { fs: Math.round(c.fs * 1.18), bold:1, shape:'pill', maxW:300, role:'root' });
    rb.x = 0; rb.y = top + shift - c.gap * 1.9 - rb.h / 2;
    return [rb, ...boxes];
  },
  draw(c, at){
    const root = c.roots[0];
    if(!root) return { links:[], deco:[] };
    const links = [], stages = c.kids(root.id);
    const rowOf = new Map();
    (c.flowRows || []).forEach((ids, i) => ids.forEach(id => rowOf.set(id, i)));
    const bottomOf = i => {
      let m = -Infinity;
      for(const id of (c.flowRows || [])[i] || []){
        const b = at(id);
        if(b) m = Math.max(m, b.y + b.h / 2);
        for(const s of c.kids(id)){ const sb = at(s.id); if(sb) m = Math.max(m, sb.y + sb.h / 2); }
      }
      return Number.isFinite(m) ? m : 0;
    };
    for(let i = 0; i < stages.length - 1; i++){
      const a = at(stages[i].id), b = at(stages[i + 1].id);
      if(!a || !b) continue;
      if(rowOf.get(stages[i].id) === rowOf.get(stages[i + 1].id)){
        const ar = mmArrow(a, b, 'line');
        links.push({ d:ar.d, head:ar.head, tone:a.tone, w:2.4 });
      } else {
        /* the turn at the end of a row goes round underneath it, never through
           the sub-stages hanging off the boxes it has just left */
        const ext = c.gap * 1.2, midY = bottomOf(rowOf.get(stages[i].id)) + c.gap * 1.1;
        const p = { x:a.x + a.w / 2, y:a.y }, q = { x:b.x - b.w / 2, y:b.y };
        links.push({ tone:a.tone, w:2.4, head: mmHead(q.x, q.y, 0),
          d: mmPoly([p, { x:p.x + ext, y:p.y }, { x:p.x + ext, y:midY },
            { x:q.x - ext, y:midY }, { x:q.x - ext, y:q.y }, q], 14) });
      }
    }
    for(const s of stages) for(const sub of c.kids(s.id)){
      const a = at(s.id), b = at(sub.id);
      if(a && b) links.push({ d: mmLine(a, b), tone:b.tone, w:1.5, dash:'5 5' });
    }
    return { links };
  },
  adds:[
    { id:'stage', label:'Stage', hint:'One more step in the sequence',
      when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id) },
    { id:'substage', label:'Sub-step', hint:'A detail under the stage you picked',
      when: x => x.node && x.c.depth(x.node) === 1,
      run: x => mpNewNode(x.it, x.page, x.node.id) }
  ]
});

/* ================= 8 · the multi-flow map ================= */
defineMindMapKind('multi', {
  label:'Multi-flow map', hint:'What caused an event, and what it caused',
  blurb:'Cause and effect — causes in on the left, effects out on the right.',
  glyph:'<rect x="22" y="15" width="16" height="10" rx="2"/>' +
        '<rect x="2" y="4" width="13" height="8" rx="1.5"/><rect x="2" y="28" width="13" height="8" rx="1.5"/>' +
        '<rect x="45" y="4" width="13" height="8" rx="1.5"/><rect x="45" y="28" width="13" height="8" rx="1.5"/>' +
        '<path d="M15 8l7 8M15 32l7-8M38 16l7-8M38 24l7 8"/>',
  defaults:{ link:'line', fill:'soft' },
  nest: 1,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'The event'], ['c1', 'r', 'A cause', 'l'], ['c2', 'r', 'Another cause', 'l'],
    ['e1', 'r', 'An effect', 'r'], ['e2', 'r', 'Another effect', 'r']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    const eb = c.box(root, { fs: Math.round(c.fs * 1.2), bold:1, maxW:210, role:'root' });
    const kids = c.kids(root.id);
    const cb = kids.filter(n => n.side !== 'r').map(n => { const b = c.box(n, { maxW:185 }); mpTint(b, 0); return b; });
    const fb = kids.filter(n => n.side === 'r').map(n => { const b = c.box(n, { maxW:185 }); mpTint(b, 1); return b; });
    const sep = eb.w / 2 + c.gap * 4.4;
    eb.x = 0; eb.y = 0;
    mmColumn(cb, -(sep + mpWide(cb) / 2), 0, c.gap * .9);
    mmColumn(fb, sep + mpWide(fb) / 2, 0, c.gap * .9);
    return [eb, ...cb, ...fb];
  },
  draw(c, at){
    const root = c.roots[0];
    if(!root) return { links:[], deco:[] };
    const eb = at(root.id), links = [];
    if(!eb) return { links, deco:[] };
    for(const n of c.kids(root.id)){
      const b = at(n.id);
      if(!b) continue;
      const ar = n.side === 'r' ? mmArrow(eb, b, c.look.link === 'curve' ? 'curve' : 'line', .5)
        : mmArrow(b, eb, c.look.link === 'curve' ? 'curve' : 'line', .5);
      links.push({ d:ar.d, head:ar.head, tone:b.tone, w:2.2 });
    }
    return { links };
  },
  adds:[
    { id:'cause', label:'Cause', hint:'Something that led to the event',
      when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id, { side:'l', tone:0 }) },
    { id:'effect', label:'Effect', hint:'Something the event led to',
      when: x => !!x.c.roots[0], run: x => mpNewNode(x.it, x.page, x.c.roots[0].id, { side:'r', tone:1 }) }
  ]
});

/* ================= 9 · the bridge map ================= */
defineMindMapKind('bridge', {
  label:'Bridge map', hint:'The same relationship, over and over',
  blurb:'Analogies — one relating factor carried across every pair.',
  glyph:'<path d="M4 20h52"/><path d="M22 20l4-5 4 5M40 20l4-5 4 5"/>' +
        '<path d="M8 12h8M8 28h8M30 12h8M30 28h8M48 12h6M48 28h6"/>',
  defaults:{ link:'line', fill:'line' },
  nest: 2,   /* the deepest this kind draws; below it, a thought hangs off as an aside */
  seed: () => [['r', null, 'is to'], ['a', 'r', 'First thing'], ['a1', 'a', 'its pair'],
    ['b', 'r', 'Second thing'], ['b1', 'b', 'its pair'],
    ['c', 'r', 'Third thing'], ['c1', 'c', 'its pair']],
  place(c){
    const root = c.roots[0];
    if(!root) return [];
    const rf = c.box(root, { fs: Math.round(c.fs * .95), maxW:170, shape:'pill', role:'root' });
    const pairs = c.kids(root.id).map(p => ({
      top: c.box(p, { maxW:160, shape:'plain' }),
      bot: c.kids(p.id)[0] ? c.box(c.kids(p.id)[0], { maxW:160, shape:'plain' }) : null }));
    const pitch = Math.max(86, ...pairs.map(x => Math.max(x.top.w, x.bot ? x.bot.w : 0))) + c.gap * 2.1;
    const off = c.gap * 1.4;
    const boxes = [rf];
    pairs.forEach((x, i) => {
      const cx = (i - (pairs.length - 1) / 2) * pitch;
      x.top.x = cx; x.top.y = -off - x.top.h / 2;
      boxes.push(x.top);
      if(x.bot){ x.bot.x = cx; x.bot.y = off + x.bot.h / 2; boxes.push(x.bot); }
    });
    rf.x = -(pairs.length - 1) * pitch / 2 - 46 - c.gap * .7 - rf.w / 2;
    rf.y = 0;
    return boxes;
  },
  draw(c, at){
    const root = c.roots[0];
    if(!root) return { links:[], deco:[] };
    const tops = c.kids(root.id).map(p => at(p.id)).filter(Boolean);
    if(!tops.length) return { links:[], deco:[] };
    const x0 = Math.min(...tops.map(b => b.x)) - 46, x1 = Math.max(...tops.map(b => b.x)) + 46;
    const deco = [{ t:'seg', x1:x0, y1:0, x2:x1, y2:0, cls:'mmbridge' }];
    for(let i = 0; i < tops.length - 1; i++){
      const mid = (tops[i].x + tops[i + 1].x) / 2;
      deco.push({ t:'path', cls:'mmbridge mmcaret',
        d:'M' + (mid - 11) + ' 7L' + mid + ' -4L' + (mid + 11) + ' 7' });
    }
    return { links:[], deco };
  },
  /* every rung of a bridge is a pair: anything arriving without one is given it */
  adopt(it, page){
    const root = mmRoots(it)[0];
    if(!root) return;
    for(const top of mmKids(it, root.id))
      if(!mmKids(it, top.id).length)
        mmNodes(it).push({ id: uid(), pid: top.id, text:'its pair' });
    if(page) queueSave(page.id);
  },
  adds:[{ id:'pair', label:'Pair', hint:'Another pair sharing the relationship',
    when: x => !!x.c.roots[0],
    run: x => {
      const top = mpNewNode(x.it, x.page, x.c.roots[0].id, { text:'Thing' });
      mpNewNode(x.it, x.page, top.id, { text:'its pair' });
      return top;
    } }]
});

/* ================= the record, changed =================
   Every one of these ends at queueSave(), which is the only reason undo knows
   a thinking map exists at all. */
function mpNewNode(it, page, pid, o){
  o = o || {};
  const n = { id: uid(), pid: pid || null, text: o.text == null ? '' : o.text };
  if(o.side) n.side = o.side;
  if(Number.isFinite(+o.tone)) n.tone = +o.tone;
  const parent = mpNode(it, pid);
  if(parent && parent.fold) delete parent.fold;     /* it opens to show what you just put in it */
  /* the order of the list is the order of the siblings, so a thought asked for
     beside another goes in straight after it rather than at the far end */
  const at = o.after ? mpAfter(it, o.after) : -1;
  if(at >= 0) mmNodes(it).splice(at, 0, n); else mmNodes(it).push(n);
  if(page) queueSave(page.id);
  return n;
}
/* the index just past a node in the flat list — its children may sit anywhere
   after it, so this is the one place that is certainly among its siblings */
function mpAfter(it, id){
  const at = mmNodes(it).findIndex(n => n.id === id);
  return at < 0 ? -1 : at + 1;
}
function mpDropSubtree(it, page, id){
  const gone = new Set(mmSubtree(it, id));
  it.nodes = mmNodes(it).filter(n => !gone.has(n.id));
  if(page) queueSave(page.id);
  return gone;
}
/* a copy of a thought and everything under it, parked beside the original */
function mpCopySubtree(it, page, id){
  const ids = mmSubtree(it, id), fresh = new Map(ids.map(x => [x, uid()]));
  const made = [];
  for(const old of ids){
    const src = mpNode(it, old);
    if(!src) continue;
    const n = { ...src, id: fresh.get(old), pid: old === id ? src.pid : fresh.get(src.pid) };
    delete n.ox; delete n.oy;
    made.push(n);
  }
  /* the copy lands beside the original, not at the far end of the map */
  const at = mpAfter(it, id);
  if(at >= 0) mmNodes(it).splice(at, 0, ...made); else mmNodes(it).push(...made);
  if(page) queueSave(page.id);
  return made[0];
}
function mpBuildSeed(kindId){
  const kind = MP_KINDS[kindId] || MP_KINDS.mind;
  const rows = (typeof kind.seed === 'function' ? kind.seed() : []) || [];
  const ids = new Map(rows.map(r => [r[0], uid()]));
  return rows.map(r => {
    const n = { id: ids.get(r[0]), pid: r[1] ? ids.get(r[1]) || null : null, text: r[2] || '' };
    if(r[3]) n.side = r[3];
    if(Number.isFinite(+r[4])) n.tone = +r[4];
    return n;
  });
}

/* ================= measuring type =================
   The layout wraps the writing itself, so the box always fits the glyphs. It
   can only do that if it measures them the way the browser will set them —
   one canvas, the same font string the stylesheet names. */
const MP_FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Inter,system-ui,"Helvetica Neue",Arial,sans-serif';
let MP_PEN = null;
mmSetMeasurer((s, fs, bold) => {
  try{
    if(!MP_PEN){
      const cv = document.createElement('canvas');
      MP_PEN = cv.getContext ? cv.getContext('2d') : null;
    }
    if(!MP_PEN) return 0;
    MP_PEN.font = (bold ? '600 ' : '400 ') + fs + 'px ' + MP_FONT;
    return MP_PEN.measureText(s).width;
  }catch(e){ return 0; }
});

/* ================= drawing one =================
   The whole map is one <svg>, which is what lets a print, a thumbnail and an
   exported file come out identical to the screen with nothing repainting
   first. Only the bars, the popovers and the caret live in HTML on top. */
function mpColors(look, tone, root){
  const pal = MP_PALETTES[look.pal] || MP_PALETTES.ocean;
  const n = pal.colors.length;
  const c = pal.colors[(((tone | 0) % n) + n) % n];
  /* the middle of a map is always the solid one — whatever the boxes round it
     are doing, the eye has to be told where to start */
  const mode = root ? 'solid' : look.fill;
  if(mode === 'solid') return { fill:c, fillOp:1, stroke:c, strokeOp:1, sw:0, text:'#fff' };
  if(mode === 'line') return { fill:c, fillOp:0, stroke:c, strokeOp:.9, sw:1.7, text:'var(--ink)' };
  if(mode === 'glass') return { fill:'var(--paper)', fillOp:.92, stroke:c, strokeOp:.45, sw:1.4, text:'var(--ink)' };
  return { fill:c, fillOp:.16, stroke:c, strokeOp:.5, sw:1.3, text:'var(--ink)' };
}
function mpNodeSVG(b, look){
  const col = mpColors(look, b.tone, b.role === 'root');
  const lh = b.fs * b.lead;
  const y0 = -(b.lines.length - 1) * lh / 2 + b.fs * .34;
  const blank = !String((b.node && b.node.text) || '').trim();
  const shape = b.shape === 'plain' ? '' :
    '<path class="mmshape" d="' + mmShapePath({ ...b, x:0, y:0 }) + '" fill="' + col.fill +
    '" fill-opacity="' + col.fillOp + '" stroke="' + col.stroke + '" stroke-opacity="' + col.strokeOp +
    '" stroke-width="' + col.sw + '"/>';
  const lines = b.lines.map((l, i) => '<tspan x="0" y="' + mmRd(y0 + i * lh) + '">' +
    (blank ? '' : esc(l)) + '</tspan>').join('');
  const ghost = blank ? '<text class="mmghost" text-anchor="middle" font-size="' + b.fs +
    '" y="' + mmRd(b.fs * .34) + '">…</text>' : '';
  const chip = b.fold ? '<g class="mmchip" transform="translate(0 ' + mmRd(b.h / 2 + 10) + ')">' +
    '<rect x="-15" y="-9" width="30" height="18" rx="9" fill="' + col.stroke + '" fill-opacity=".9"/>' +
    '<text text-anchor="middle" y="4.5" font-size="11" fill="#fff">' + b.kids + '</text></g>' : '';
  return '<g class="mmnode' + (b.role === 'root' ? ' mmis-root' : '') + '" data-n="' + esc(b.id) +
    '" transform="translate(' + mmRd(b.x) + ' ' + mmRd(b.y) + ')">' +
    '<rect class="mmhit" x="' + mmRd(-b.w / 2 - 7) + '" y="' + mmRd(-b.h / 2 - 7) + '" width="' +
      mmRd(b.w + 14) + '" height="' + mmRd(b.h + 14) + '" rx="12" fill="none" pointer-events="all"/>' +
    shape + ghost +
    '<text class="mmtext" text-anchor="middle" font-size="' + b.fs + '" fill="' + col.text +
      '"' + (b.bold ? ' font-weight="600"' : '') + '>' + lines + '</text>' + chip + '</g>';
}
function mpLinkSVG(l, look){
  const col = mpColors(look, l.tone, false);
  const c = look.fill === 'solid' ? col.fill : col.stroke;
  return '<g class="mmlink">' +
    '<path d="' + l.d + '" fill="none" stroke="' + c + '" stroke-opacity="' + (l.op || .55) +
      '" stroke-width="' + (l.w || 2) + '" stroke-linecap="round" stroke-linejoin="round"' +
      (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + '/>' +
    (l.head ? '<path d="' + l.head + '" fill="' + c + '" fill-opacity=".7"/>' : '') + '</g>';
}
function mpDecoSVG(d, look){
  const cls = 'mmdec ' + (d.cls || '');
  if(d.t === 'circle') return '<circle class="' + cls + '" cx="' + mmRd(d.x) + '" cy="' + mmRd(d.y) +
    '" r="' + mmRd(d.r) + '"/>';
  if(d.t === 'rect') return '<rect class="' + cls + '" x="' + mmRd(d.x) + '" y="' + mmRd(d.y) +
    '" width="' + mmRd(d.w) + '" height="' + mmRd(d.h) + '" rx="' + (d.r || 0) + '"/>';
  if(d.t === 'seg') return '<line class="' + cls + '" x1="' + mmRd(d.x1) + '" y1="' + mmRd(d.y1) +
    '" x2="' + mmRd(d.x2) + '" y2="' + mmRd(d.y2) + '"/>';
  if(d.t === 'path') return '<path class="' + cls + '" d="' + d.d + '"' +
    (Number.isFinite(+d.tone) ? ' stroke="' + mpColors(look, d.tone, false).stroke + '"' : '') + '/>';
  if(d.t === 'text') return '<text class="' + cls + '" x="' + mmRd(d.x) + '" y="' + mmRd(d.y) +
    '" text-anchor="' + (d.anchor || 'middle') + '"' + (d.edit ? ' data-edit="' + d.edit + '"' : '') +
    '>' + esc(d.s) + '</text>';
  return '';
}
const mpViewT = (it, h) => { const v = mpView(it);
  return 'translate(' + MM_W / 2 + ' ' + mmRd((h || MM_H) / 2) + ') scale(' +
    mmRd(v.z * 1000) / 1000 + ') translate(' + mmRd(-v.x) + ' ' + mmRd(-v.y) + ')'; };
const mpFitT = f => 'translate(' + mmRd(f.tx) + ' ' + mmRd(f.ty) + ') scale(' + mmRd(f.s * 1000) / 1000 + ')';

function mpBodySVG(it, L, look){
  return '<g class="mmdeco">' + L.deco.map(d => mpDecoSVG(d, look)).join('') + '</g>' +
    '<g class="mmlinks">' + L.links.map(l => mpLinkSVG(l, look)).join('') + '</g>' +
    '<g class="mmnodes"' + (look.shade ? ' filter="url(#mmsh-' + esc(it.id) + ')"' : '') + '>' +
    L.boxes.map(b => mpNodeSVG(b, look)).join('') + '</g>';
}
function mpHTML(it, c){
  const look = mpLook(it), L = mpLayout(it), h = L.fit.h;
  return '<figure class="body mmenv' + (it.paper === 0 ? ' noframe' : '') +
    '" aria-label="' + esc(mpKind(it).label) + '">' +
    '<div class="mmstage" style="padding-bottom:' + mmRd(h / 10) + '%">' +
    '<svg class="mmsvg" viewBox="0 0 ' + MM_W + ' ' + mmRd(h) +
      '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><filter id="mmsh-' + esc(it.id) + '" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feDropShadow dx="0" dy="2.4" stdDeviation="3.4" flood-color="#0d1220" flood-opacity=".17"/>' +
      '</filter></defs>' +
      '<g class="mmview" transform="' + mpViewT(it, h) + '">' +
      '<g class="mmfit" transform="' + mpFitT(L.fit) + '">' + mpBodySVG(it, L, look) + '</g></g></svg>' +
      '</div>' +
    (c && c.live ? '<div class="mmedit" hidden></div>' : '') +
    '<figcaption></figcaption></figure>';
}

/* ================= motion =================
   One integrator, one frame loop, and every change of shape goes through it:
   adding a thought, folding one away, dragging a box, and switching the whole
   map from a flow to a tree are all the same event — the boxes have new places
   to be, and they spring there. A newborn box starts at its parent and grows
   out of it, which is the whole of what makes a map feel alive. */
const MP_STILL = matchMedia('(prefers-reduced-motion: reduce)');
const MP_SEL = new Map();                 /* map id → the node picked inside it */
const MP_RESIZE = new Map();              /* map id → its local ResizeObserver */
let MP_POP = null;                        /* the one popover a bar may have open */

const mpFind = id => document.querySelector('#pageHost .item[data-id="' + id + '"]');
const mpState = outer => outer._mm || (outer._mm = { cur:new Map(), target:new Map(), fit:null, stop:null });

function mpStep(o, k, target, resp, z, eps, veps){
  const w = 2 * Math.PI / resp, vk = 'v' + k, dt = o._dt;
  const v = o[vk] || 0, d = o[k] - target;
  o[vk] = v + (-2 * z * w * v - w * w * d) * dt;
  o[k] += o[vk] * dt;
  if(Math.abs(o[k] - target) > eps || Math.abs(o[vk]) > veps) return true;
  o[k] = target; o[vk] = 0;
  return false;
}
function mpSettle(st){
  for(const [id, o] of st.cur){
    const t = st.target.get(id);
    if(t){ o.x = t.x; o.y = t.y; o.vx = o.vy = o.vs = 0; o.s = 1; }
  }
  if(st.fit && st.fitT) Object.assign(st.fit, st.fitT, { vs:0, vtx:0, vty:0, vh:0 });
}
function mpRun(outer, it){
  const st = mpState(outer);
  if(MP_STILL.matches){ mpSettle(st); mpPaint(outer, it); return; }
  if(st.stop) return;
  st.stop = motionTick(dt => {
    if(!outer.isConnected){ st.stop = null; return false; }
    const step = Math.min(dt, .033);
    let moving = false;
    for(const [id, o] of st.cur){
      const t = st.target.get(id);
      if(!t) continue;
      o._dt = step;
      if(mpStep(o, 'x', t.x, .40, 1, .3, 2.5)) moving = true;
      if(mpStep(o, 'y', t.y, .40, 1, .3, 2.5)) moving = true;
      if(mpStep(o, 's', 1, .36, .74, .003, .03)) moving = true;
    }
    /* the frame does not chase the caret: a word typed into a box would
       otherwise zoom the whole map in and out a little on every keystroke */
    if(st.fit && st.fitT && !st.holdFit && !st.editing){
      st.fit._dt = step;
      if(mpStep(st.fit, 's', st.fitT.s, .46, 1, .0012, .012)) moving = true;
      if(mpStep(st.fit, 'tx', st.fitT.tx, .46, 1, .3, 2.5)) moving = true;
      if(mpStep(st.fit, 'ty', st.fitT.ty, .46, 1, .3, 2.5)) moving = true;
      if(mpStep(st.fit, 'h', st.fitT.h, .46, 1, .4, 3)) moving = true;
    }
    mpPaint(outer, it);
    if(moving) return true;
    st.stop = null;
    return false;
  });
}
/* one frame: the boxes where they have got to, and everything joining them up
   drawn to match — which is why a connector bends while its box is still on
   its way rather than snapping into place when it arrives */
function mpPaint(outer, it){
  const st = outer._mm;
  if(!st || !st.L) return;
  const L = st.L, look = mpLook(it);
  const fit = st.fit || L.fit;
  const fitEl = outer.querySelector('.mmfit');
  if(fitEl) fitEl.setAttribute('transform', mpFitT(fit));
  const svg = outer.querySelector('.mmsvg'), stage = outer.querySelector('.mmstage');
  if(svg && stage && Math.abs((st.drawnH || 0) - fit.h) > .3){
    st.drawnH = fit.h;
    svg.setAttribute('viewBox', '0 0 ' + MM_W + ' ' + mmRd(fit.h));
    stage.style.paddingBottom = mmRd(fit.h / 10) + '%';
    const view = outer.querySelector('.mmview');
    if(view) view.setAttribute('transform', mpViewT(it, fit.h));
  }
  outer.querySelectorAll('.mmnode').forEach(g => {
    const p = st.cur.get(g.dataset.n);
    if(!p || g.classList.contains('mmgone')) return;
    g.setAttribute('transform', 'translate(' + mmRd(p.x) + ' ' + mmRd(p.y) + ')' +
      (p.s < .999 ? ' scale(' + Math.round(Math.max(0, p.s) * 1000) / 1000 + ')' : ''));
    if(p.s < .999) g.style.opacity = clamp(p.s * 1.7, 0, 1);
    else if(g.style.opacity) g.style.opacity = '';
  });
  const at = id => {
    const b = L.at.get(id);
    if(!b) return null;
    const p = st.cur.get(id);
    return p ? { ...b, x:p.x, y:p.y } : b;
  };
  let drawn = { links:[], deco:[] };
  try{ drawn = mpKind(it).draw(L.ctx, at) || drawn; }catch(e){}
  const links = (drawn.links || []).slice();
  for(const b of L.boxes) if(b.stray && b.node.pid){
    const pb = at(b.node.pid), q = at(b.id);
    if(pb && q) links.push({ d: mmLine(pb, q), tone:q.tone, w:1.3, dash:'3 5', op:.45 });
  }
  const lg = outer.querySelector('.mmlinks'), dg = outer.querySelector('.mmdeco');
  if(lg) lg.innerHTML = links.map(l => mpLinkSVG(l, look)).join('');
  if(dg) dg.innerHTML = (drawn.deco || []).map(d => mpDecoSVG(d, look)).join('');
  if(st.editing) mpPlaceEdit(outer, it);
  mpPlaceBar(outer, it);
}
/* the map has changed shape: redraw the boxes, then let them travel there */
function mpCommit(outer, it, page, o){
  o = o || {};
  const st = mpState(outer), look = mpLook(it), L = mpLayout(it);
  const nodes = outer.querySelector('.mmnodes');
  if(nodes) nodes.innerHTML = L.boxes.map(b => mpNodeSVG(b, look)).join('');
  const prev = st.L;
  st.L = L;
  st.target = new Map(L.boxes.map(b => [b.id, { x:b.x, y:b.y }]));
  for(const [id, t] of st.target) if(!st.cur.has(id)){
    const n = mpNode(it, id), from = n && n.pid && st.cur.get(n.pid);
    st.cur.set(id, { x: from ? from.x : t.x, y: from ? from.y : t.y,
      s: prev && !o.instant ? 0 : 1, vx:0, vy:0, vs:0 });
  }
  for(const id of [...st.cur.keys()]) if(!st.target.has(id)) st.cur.delete(id);
  st.fitT = { ...L.fit };
  if(!st.fit || o.instant) st.fit = { ...L.fit, vs:0, vtx:0, vty:0, vh:0 };
  if(o.instant) mpSettle(st);
  mpBindNodes(outer, it, page);
  const pick = MP_SEL.get(it.id);
  if(pick && !mpNode(it, pick)) MP_SEL.delete(it.id);
  mpMarkPick(outer, it);
  mpPaint(outer, it);
  if(!o.instant) mpRun(outer, it);
  mpSyncTools(outer, it);
}

/* ================= the view onto the map ================= */
function mpApplyView(outer, it){
  const st = outer._mm;
  const g = outer.querySelector('.mmview');
  if(g) g.setAttribute('transform', mpViewT(it, st && st.fit ? st.fit.h : MM_H));
  const tag = outer.querySelector(':scope > .tools [data-mp="zoom"]');
  if(tag) tag.textContent = Math.round(mpView(it).z * 100) + '%';
}
/* where a point on the screen is in the map's own coordinates — measured from
   the middle of the frame, so nothing here has to know how tall the frame is */
function mpViewPoint(outer, it, cx, cy){
  const svg = outer.querySelector('.mmsvg'), r = svg.getBoundingClientRect(), v = mpView(it);
  const k = (r.width || MM_W) / MM_W;
  const dx = (cx - (r.left + r.width / 2)) / k, dy = (cy - (r.top + r.height / 2)) / k;
  return { x: v.x + dx / v.z, y: v.y + dy / v.z, dx, dy };
}
function mpSetZoom(outer, it, page, z, cx, cy){
  const anchor = cx == null ? null : mpViewPoint(outer, it, cx, cy);
  it.zoom = clamp(z, MP_MIN_Z, MP_MAX_Z);
  if(anchor){
    it.viewX = anchor.x - anchor.dx / it.zoom;
    it.viewY = anchor.y - anchor.dy / it.zoom;
  }
  mpApplyView(outer, it);
  mpPlaceBar(outer, it);
  queueSave(page.id);
}
function mpHome(outer, it, page){
  it.zoom = 1; it.viewX = 0; it.viewY = 0;
  mpApplyView(outer, it); mpPlaceBar(outer, it);
  if(page) queueSave(page.id);
}
/* screen pixels per unit of the laid-out map — what a drag has to be divided
   by before it means anything to a stored offset */
function mpScale(outer, it){
  const svg = outer.querySelector('.mmsvg');
  const st = outer._mm, fit = (st && (st.fit || (st.L && st.L.fit))) || { s:1 };
  const r = svg ? svg.getBoundingClientRect() : { width: 0 };
  return Math.max(1e-4, (r.width || MM_W) / MM_W * mpView(it).z * fit.s);
}

/* ================= the bars =================
   One component, two contexts. Everything on either of them is a record in
   MP_ACTS (or an `adds` entry the kind owns), so this file never asks what a
   button means — and the next twenty options arrive without it changing. */
const mpIcn = d => '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const MP_ICN = {
  plus:   mpIcn('<path d="M10 5.2v9.6M5.2 10h9.6"/>'),
  child:  mpIcn('<path d="M6 4v6.5a3 3 0 0 0 3 3h5"/><path d="M11.8 11.2L14.3 13.7 11.8 16.2"/>'),
  pen:    mpIcn('<path d="M4.2 15.8l.9-3.2 7.7-7.7a1.7 1.7 0 0 1 2.4 2.4l-7.7 7.7-3.3.8z"/>'),
  shape:  mpIcn('<rect x="2.4" y="6.2" width="7.6" height="7.6" rx="2.2"/>' +
                  '<path d="M14.6 5.4l4 4.6-4 4.6-4-4.6z"/>'),
  fold:   mpIcn('<path d="M5.5 8.2L10 12.6l4.5-4.4"/>'),
  unfold: mpIcn('<path d="M5.5 11.8L10 7.4l4.5 4.4"/>'),
  copy:   mpIcn('<rect x="3" y="3" width="9.5" height="9.5" rx="2.4"/><path d="M7.6 16.8h6.6a2.6 2.6 0 0 0 2.6-2.6V7.6"/>'),
  home:   mpIcn('<circle cx="10" cy="10" r="4.6"/><path d="M10 1.6v2.6M10 15.8v2.6M1.6 10h2.6M15.8 10h2.6"/>'),
  del:    mpIcn('<path d="M5.6 5.6l8.8 8.8M14.4 5.6l-8.8 8.8"/>'),
  kinds:  mpIcn('<rect x="2.6" y="2.6" width="6.2" height="6.2" rx="1.6"/><rect x="11.2" y="2.6" width="6.2" height="6.2" rx="1.6"/><rect x="2.6" y="11.2" width="6.2" height="6.2" rx="1.6"/><rect x="11.2" y="11.2" width="6.2" height="6.2" rx="1.6"/>'),
  tidy:   mpIcn('<path d="M3.2 5h13.6M3.2 10h9M3.2 15h11.6"/>'),
  paper:  mpIcn('<rect x="3" y="4.4" width="14" height="11.2" rx="2.2"/>')
};
/* whatever an action just made is picked; the caret only opens on a box that
   has nothing in it yet, so duplicating something does not ask you to retype it */
function mpLandOn(outer, it, page, node){
  mpPick(outer, it, page, node.id);
  if(!String(node.text || '').trim()) mpEdit(outer, it, page, node);
}
function mpX(outer, it, page, node){
  return { outer, it, page, node: node || null, kind: mpKind(it), c: mpCtx(it), btn:null };
}
function mpBarEl(outer){
  let bar = outer.querySelector('.mmbar');
  if(bar) return bar;
  bar = document.createElement('div');
  bar.className = 'mmbar glass-lite';
  bar.hidden = true;
  (outer.querySelector('.mmenv') || outer).appendChild(bar);
  bar.addEventListener('pointerdown', e => e.stopPropagation());
  bar.addEventListener('wheel', e => e.stopPropagation(), { passive:true });
  bar.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if(!btn) return;
    e.stopPropagation();
    const pg = pageOfEl(outer), item = pg && pg.items.find(z => z.id === outer.dataset.id);
    if(!item) return;
    const st = mpState(outer);
    const node = st.bar && st.bar.node ? mpNode(item, st.bar.node) : null;
    const x = mpX(outer, item, pg, node);
    x.btn = btn;
    if(MP_POP && MP_POP._for !== btn) mpClosePop();   /* one popover at a time */
    if(btn.dataset.add){
      const add = (mpKind(item).adds || []).find(z => z.id === btn.dataset.add);
      if(!add) return;
      const made = add.run(x);
      mpCommit(outer, item, pg); SND.pop();
      if(made && made.id) mpLandOn(outer, item, pg, made);
      return;
    }
    const act = MP_ACTS.find(z => z.id === btn.dataset.a);
    if(!act) return;
    const made = act.run(x);
    if(act.commit !== false){
      mpCommit(outer, item, pg);
      if(made && made.id) mpLandOn(outer, item, pg, made);
      else if(st.bar) mpShowBar(outer, item, pg, st.bar.group, node, st.bar.at);
    }
  });
  return bar;
}
function mpBarHTML(x, group){
  const adds = (x.kind.adds || []).filter(a => !a.when || a.when(x));
  const acts = mpActs(group).filter(a => !a.when || a.when(x));
  const face = a => {
    const ico = typeof a.icon === 'function' ? a.icon(x) : a.icon;
    const lab = typeof a.label === 'function' ? a.label(x) : a.label;
    return ico ? (MP_ICN[ico] || ico) : '<b>' + esc(lab || '') + '</b>';
  };
  return adds.map(a => '<button class="mmadd" data-add="' + esc(a.id) + '" title="' +
      esc(a.hint || a.label) + '">' + MP_ICN.plus + '<span>' + esc(a.label) + '</span></button>').join('') +
    (adds.length && acts.length ? '<i class="mmsep"></i>' : '') +
    acts.map(a => '<button data-a="' + esc(a.id) + '" title="' + esc(a.hint || a.id) +
      '" aria-label="' + esc(a.hint || a.id) + '">' + face(a) + '</button>').join('');
}
function mpShowBar(outer, it, page, group, node, at){
  const bar = mpBarEl(outer), st = mpState(outer);
  const x = mpX(outer, it, page, node);
  /* fresh if it was away — or still on its way out, which looks the same */
  const fresh = bar.hidden || bar.getAnimations().length > 0;
  const env = outer.querySelector('.mmenv'), er = env ? env.getBoundingClientRect() : { left:0, top:0 };
  st.bar = { group, node: node ? node.id : null, at: at ? { x: at.x - er.left, y: at.y - er.top } : null };
  bar.innerHTML = mpBarHTML(x, group);
  bar.hidden = false;
  mpPlaceBar(outer, it);
  if(fresh){
    const r = bar.getBoundingClientRect();
    warpIn(bar, at ? at.x : r.left + r.width / 2, at ? at.y : r.bottom + 8);
  }
}
function mpHideBar(outer){
  const bar = outer.querySelector('.mmbar');
  const st = outer._mm;
  if(st) st.bar = null;
  if(!bar || bar.hidden) return;
  warpOut(bar, () => { const s = outer._mm; if(!s || !s.bar) bar.hidden = true; });
}
function mpPlaceBar(outer, it){
  const st = outer._mm, bar = outer.querySelector('.mmbar');
  if(!st || !st.bar || !bar || bar.hidden) return;
  const env = outer.querySelector('.mmenv');
  if(!env) return;
  const er = env.getBoundingClientRect();
  let cx, top, bottom;
  if(st.bar.node){
    const g = outer.querySelector('.mmnode[data-n="' + st.bar.node + '"] .mmhit');
    if(!g) return;
    const r = g.getBoundingClientRect();
    cx = r.left + r.width / 2; top = r.top; bottom = r.bottom;
  } else if(st.bar.at){
    /* remembered relative to the card, so it stays over the same spot of paper
       when the desk scrolls under it */
    cx = er.left + st.bar.at.x; top = er.top + st.bar.at.y - 4; bottom = top + 8;
  } else return;
  const w = bar.offsetWidth, h = bar.offsetHeight;
  const left = clamp(cx - w / 2, 8, Math.max(8, innerWidth - w - 8));
  let y = top - h - 12;
  if(y < 8) y = bottom + 12;
  bar.style.left = (left - er.left) + 'px';
  bar.style.top = (y - er.top) + 'px';
}

/* ---- the one popover a bar may open ---- */
function mpClosePop(){
  const el = MP_POP;
  if(!el) return false;
  MP_POP = null;
  warpOut(el, () => el.remove());
  return true;
}
function mpPop(btn, title, html, wire){
  const same = MP_POP && MP_POP._for === btn;
  mpClosePop();
  if(same) return null;                     /* the button that opened it closes it */
  const el = document.createElement('div');
  el._for = btn;
  el.className = 'mmpop glass';
  el.innerHTML = (title ? '<header>' + esc(title) + '</header>' : '') + html;
  document.body.appendChild(el);
  MP_POP = el;
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('wheel', e => e.stopPropagation(), { passive:true });
  if(wire) wire(el);
  placePanel(el, btn);
  return el;
}
window.addEventListener('pointerdown', e => {
  if(MP_POP && !e.target.closest('.mmpop') && !(MP_POP._for && MP_POP._for.contains(e.target))) mpClosePop();
});
window.addEventListener('wheel', e => { if(MP_POP && !e.target.closest('.mmpop')) mpClosePop(); }, { capture:true, passive:true });
window.addEventListener('keydown', e => { if(e.key === 'Escape' && MP_POP){ e.stopPropagation(); mpClosePop(); } }, true);

/* ---- what the popovers hold ---- */
function mpTonePop(x){
  const pal = MP_PALETTES[mpLook(x.it).pal] || MP_PALETTES.ocean;
  const cur = x.node && Number.isFinite(+x.node.tone) ? +x.node.tone : -1;
  const html = '<div class="mmswatch">' + pal.colors.map((c, i) =>
    '<button data-tone="' + i + '" class="' + (i === cur ? 'on' : '') +
    '" style="background:' + c + '" title="Colour ' + (i + 1) + '"></button>').join('') +
    '<button data-tone="auto" class="mmauto' + (cur < 0 ? ' on' : '') +
    '" title="Let the map choose — a branch keeps its parent’s colour">auto</button></div>';
  mpPop(x.btn, 'Colour', html, el => el.addEventListener('click', e => {
    const b = e.target.closest('[data-tone]');
    if(!b || !x.node) return;
    if(b.dataset.tone === 'auto') delete x.node.tone; else x.node.tone = +b.dataset.tone;
    queueSave(x.page.id); mpCommit(x.outer, x.it, x.page); SND.tick(); mpClosePop();
    mpShowBar(x.outer, x.it, x.page, 'node', x.node);   /* the dot on the bar follows */
  }));
}
const MP_SHAPES = [
  { v:'', label:'Auto', hint:'Whatever this kind of map wants' },
  { v:'round', label:'Rounded', hint:'A card with soft corners' },
  { v:'pill', label:'Pill', hint:'Fully rounded ends' },
  { v:'rect', label:'Square', hint:'Sharp corners' },
  { v:'ellipse', label:'Bubble', hint:'An ellipse round the writing' },
  { v:'circle', label:'Circle', hint:'A true circle' },
  { v:'plain', label:'Bare', hint:'The writing with nothing round it' }
];
function mpShapePop(x){
  const cur = (x.node && x.node.shape) || '';
  const html = '<div class="mmchips">' + MP_SHAPES.map(s =>
    '<button data-shape="' + esc(s.v) + '" class="' + (s.v === cur ? 'on' : '') +
    '" title="' + esc(s.hint) + '">' + esc(s.label) + '</button>').join('') + '</div>';
  mpPop(x.btn, 'Shape', html, el => el.addEventListener('click', e => {
    const b = e.target.closest('[data-shape]');
    if(!b || !x.node) return;
    if(b.dataset.shape) x.node.shape = b.dataset.shape; else delete x.node.shape;
    queueSave(x.page.id); mpCommit(x.outer, x.it, x.page); SND.tick(); mpClosePop();
  }));
}
/* the gallery — the one place all nine kinds are shown together, and the only
   thing in the app that knows how many there are, because it counts them */
function mpKindPop(x){
  const html = '<div class="mmgal">' + mpKinds().map(k =>
    '<button data-kind="' + esc(k.id) + '" class="' + (k.id === x.it.kind ? 'on' : '') +
    '" title="' + esc(k.hint) + '"><svg viewBox="0 0 60 40" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + k.glyph + '</svg>' +
    '<b>' + esc(k.label) + '</b><small>' + esc(k.blurb) + '</small></button>').join('') + '</div>';
  mpPop(x.btn, 'Kind of map', html, el => el.addEventListener('click', e => {
    const b = e.target.closest('[data-kind]');
    if(!b) return;
    mpSetKind(x.outer, x.it, x.page, b.dataset.kind);
    mpClosePop();
  }));
}
function mpTextPop(btn, title, value, done){
  mpPop(btn, title, '<div class="mmfield"><input type="text" spellcheck="false" value="' +
    esc(value || '') + '"><button>Set</button></div>', el => {
    const inp = el.querySelector('input'), go = () => { done(inp.value); mpClosePop(); };
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if(e.key === 'Enter'){ e.preventDefault(); go(); }
      if(e.key === 'Escape'){ e.preventDefault(); mpClosePop(); }
    });
    el.querySelector('button').addEventListener('click', go);
    setTimeout(() => inp.focus({ preventScroll:true }), 0);
  });
}
/* ---- the design panel: the shared props popover, nothing of its own ---- */
function mpDesign(x){
  mpClosePop();
  const it = x.it, page = x.page, outer = x.outer;
  const redraw = () => mpCommit(outer, it, page);
  const set = (k, v) => { mpSetLook(it, k, v, page); redraw(); };
  const rows = [
    { t:'pick', label:'Palette', get:() => mpLook(it).pal, pick:v => set('pal', v),
      opts: Object.keys(MP_PALETTES).map(k => ({ v:k, label:MP_PALETTES[k].label,
        hint:'Every box on the map, recoloured', bg:MP_PALETTES[k].colors[0], fg:'#fff' })) },
    { t:'pick', label:'Boxes', get:() => mpLook(it).fill, pick:v => set('fill', v),
      opts: MP_FILLS.map(f => ({ v:f.v, label:f.label, hint:f.hint })) },
    { t:'pick', label:'Lines', get:() => mpLook(it).link, pick:v => set('link', v),
      opts: MP_LINKS.map(f => ({ v:f.v, label:f.label, hint:f.hint })) },
    { t:'range', label:'Spacing', min:70, max:160, step:5, fmt:v => v + '%',
      get:() => Math.round(mpLook(it).gap * 100), set:v => set('gap', v / 100) },
    { t:'range', label:'Type', min:75, max:150, step:5, fmt:v => v + '%',
      get:() => Math.round(mpLook(it).fs * 100), set:v => set('fs', v / 100) },
    { t:'btn', label:'Shadow', hint:'A soft drop shadow under every box',
      text:() => mpLook(it).shade ? 'On' : 'Off', act:() => set('shade', mpLook(it).shade ? 0 : 1) },
    { t:'btn', label:'Paper', hint:'The card the map is drawn on',
      text:() => it.paper === 0 ? 'Off' : 'On',
      act:() => { it.paper = it.paper === 0 ? 1 : 0;
        outer.querySelector('.mmenv').classList.toggle('noframe', it.paper === 0);
        queueSave(page.id); mpSyncTools(outer, it); } }
  ];
  const extra = mpKind(it).opts ? mpKind(it).opts(x) : null;
  if(extra && extra.length) rows.push(...extra);
  rows.push({ t:'btn', label:'By hand', hint:'Put every box back where the map wants it',
    text:() => mmNodes(it).some(n => n.ox || n.oy) ? 'Reset' : 'None',
    act:() => mpTidy(outer, it, page) });
  openProps(x.btn, { title: mpKind(it).label, rows, onsave(){ queueSave(page.id); } });
}

/* ================= changing the kind =================
   The nodes are not touched. A kind may ask for the minimum structure it needs
   through `adopt` — a second root for a double bubble, a partner for every
   pair on a bridge — and that is the only thing switching ever adds. */
function mpSetKind(outer, it, page, id){
  if(!MP_KINDS[id] || it.kind === id) return;
  it.kind = id;
  if(!mmNodes(it).length) it.nodes = mpBuildSeed(id);
  else if(MP_KINDS[id].adopt) MP_KINDS[id].adopt(it, page);
  /* a new arrangement is a new picture: whatever the old one was zoomed into
     is not somewhere on this one */
  it.zoom = 1; it.viewX = 0; it.viewY = 0;
  mpApplyView(outer, it);
  queueSave(page.id);
  mpCommit(outer, it, page);
  SND.pop();
}
function mpTidy(outer, it, page){
  let n = 0;
  for(const node of mmNodes(it)) if(node.ox || node.oy){ delete node.ox; delete node.oy; n++; }
  it.zoom = 1; it.viewX = 0; it.viewY = 0;
  mpApplyView(outer, it);
  queueSave(page.id);
  mpCommit(outer, it, page);
  SND.plop();
  return n;
}

/* ================= writing in a box =================
   The one piece of HTML that sits over the drawing. It is placed on the box it
   is editing every frame, so the box may grow under the caret as the words go
   in — which is the difference between typing into a map and filling a form. */
function mpEditEl(outer){ return outer.querySelector('.mmedit'); }
function mpPlaceEdit(outer, it){
  const st = outer._mm, box = mpEditEl(outer);
  if(!st || !st.editing || !box || !st.L) return;
  const g = outer.querySelector('.mmnode[data-n="' + st.editing + '"] .mmhit');
  const env = outer.querySelector('.mmenv');
  if(!g || !env) return;
  const r = g.getBoundingClientRect(), er = env.getBoundingClientRect();
  const b = st.L.at.get(st.editing), k = mpScale(outer, it);
  /* as wide as the writing was wrapped to, so a line breaks under the caret
     exactly where the drawing will break it once the caret has gone */
  const w = Math.max(46, (b ? Math.max(b.inner || 0, b.tw || 0) : 90) * k + 2);
  box.style.left = (r.left + r.width / 2 - er.left - w / 2) + 'px';
  box.style.top = (r.top + r.height / 2 - er.top) + 'px';
  box.style.width = w + 'px';
  box.style.fontSize = ((b ? b.fs : 17) * k) + 'px';
  box.style.lineHeight = String(b ? b.lead : 1.3);
  box.style.fontWeight = b && b.bold ? '600' : '400';
  if(b) box.style.color = mpColors(mpLook(it), b.tone, b.role === 'root').text;
}
function mpEdit(outer, it, page, node, typed){
  const box = mpEditEl(outer);
  if(!box || !node) return;
  const st = mpState(outer);
  if(st.editing && st.editing !== node.id) mpEndEdit(outer);
  mpClosePop();
  st.editing = node.id;
  outer.classList.add('mmediting');
  box.hidden = false;
  box.contentEditable = 'true';
  if(typed != null){
    /* a key pressed with the box merely picked: it is the first letter of
       what replaces the old writing */
    node.text = typed;
    queueSave(page.id);
    mpCommit(outer, it, page);
  }
  box.textContent = node.text || '';
  mpMarkPick(outer, it);
  mpPlaceEdit(outer, it);
  box.focus({ preventScroll:true });
  const sel = getSelection(), r = document.createRange();
  r.selectNodeContents(box);
  if(typed != null) r.collapse(false);
  sel.removeAllRanges(); sel.addRange(r);
}
function mpEndEdit(outer){
  const st = outer._mm;
  if(!st || !st.editing) return;
  st.editing = null;
  st.holdFit = false;
  const box = mpEditEl(outer);
  if(box){ box.hidden = true; box.contentEditable = 'false'; box.textContent = ''; }
  outer.classList.remove('mmediting');
  const page = pageOfEl(outer), it = page && page.items.find(z => z.id === outer.dataset.id);
  if(it) mpCommit(outer, it, page);
}
function mpWireEdit(outer){
  const box = mpEditEl(outer);
  if(!box) return;
  box.addEventListener('pointerdown', e => e.stopPropagation());
  box.addEventListener('dblclick', e => e.stopPropagation());
  box.addEventListener('input', () => {
    const st = outer._mm;
    if(!st || !st.editing) return;
    const page = pageOfEl(outer), it = page && page.items.find(z => z.id === outer.dataset.id);
    const n = it && mpNode(it, st.editing);
    if(!n) return;
    n.text = box.textContent;
    queueSave(page.id);
    mpCommit(outer, it, page);
  });
  box.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)){ e.preventDefault(); box.blur(); }
  });
  box.addEventListener('blur', () => mpEndEdit(outer));
}

/* ================= picking, dragging, panning ================= */
function mpMarkPick(outer, it){
  const id = MP_SEL.get(it.id) || '';
  outer.querySelectorAll('.mmnode').forEach(g => g.classList.toggle('sel', g.dataset.n === id));
}
function mpPick(outer, it, page, id){
  if(id) MP_SEL.set(it.id, id); else MP_SEL.delete(it.id);
  mpMarkPick(outer, it);
  const node = id ? mpNode(it, id) : null;
  if(node) mpShowBar(outer, it, page, 'node', node);
  else mpHideBar(outer);
}
function mpBindNodes(outer, it, page){
  outer.querySelectorAll('.mmnode').forEach(g => {
    g.addEventListener('pointerdown', e => mpNodePointer(e, outer, it, page, g.dataset.n, g));
    g.addEventListener('dblclick', e => {
      e.preventDefault(); e.stopPropagation();
      const n = mpNode(it, g.dataset.n);
      if(n){ mpPick(outer, it, page, n.id); mpEdit(outer, it, page, n); }
    });
  });
}
/* A box follows the pointer one for one, and what it remembers afterwards is
   an offset from where its kind would have put it — so the map can change
   shape underneath a box that was moved by hand without losing the move. */
function mpNodePointer(e, outer, it, page, id, g){
  if(e.button) return;
  e.preventDefault(); e.stopPropagation();
  if(!outer.classList.contains('sel')) select(it.id);
  const node = mpNode(it, id), st = mpState(outer);
  if(!node || !st.L) return;
  if(st.editing && st.editing !== id) mpEndEdit(outer);
  mpPick(outer, it, page, id);
  const base = st.L.at.get(id);
  if(!base) return;
  const k = mpScale(outer, it), pid = e.pointerId;
  const sx = e.clientX, sy = e.clientY;
  const ox0 = +node.ox || 0, oy0 = +node.oy || 0;
  let moved = false;
  try{ g.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if(!moved && Math.hypot(dx, dy) < 7) return;
    if(!moved){ moved = true; st.holdFit = true; g.classList.add('mmdrag'); mpHideBar(outer); }
    node.ox = ox0 + dx / k; node.oy = oy0 + dy / k;
    const nx = base.x - ox0 + node.ox, ny = base.y - oy0 + node.oy;
    const t = st.target.get(id), cur = st.cur.get(id);
    if(t){ t.x = nx; t.y = ny; }
    if(cur){ cur.x = nx; cur.y = ny; cur.vx = 0; cur.vy = 0; }
    mpPaint(outer, it);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up);
    g.removeEventListener('pointercancel', up);
    g.classList.remove('mmdrag'); st.holdFit = false;
    if(!moved) return;
    queueSave(page.id); mpCommit(outer, it, page); SND.plop();
    mpShowBar(outer, it, page, 'node', node);
  };
  g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
  g.addEventListener('pointercancel', up);
}
/* Empty paper is the map's hand tool. A press that never moves is a click, and
   a click on nothing is where the map's own bar comes up. */
function mpStagePointer(e, outer, it, page){
  if(e.button || e.target.closest('.mmnode')) return;
  if(!outer.classList.contains('sel')) return;      /* unselected: core drags the whole map */
  e.preventDefault(); e.stopPropagation();
  const st = mpState(outer);
  if(st.editing) mpEndEdit(outer);
  const svg = outer.querySelector('.mmsvg'), r = svg.getBoundingClientRect();
  const v = mpView(it), sx = e.clientX, sy = e.clientY, pid = e.pointerId;
  let moved = false;
  try{ svg.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if(!moved && Math.hypot(dx, dy) < 7) return;
    if(!moved){ moved = true; svg.classList.add('mmpan'); mpHideBar(outer); mpClosePop(); }
    const k = (r.width || MM_W) / MM_W;
    it.viewX = v.x - dx / k / v.z;
    it.viewY = v.y - dy / k / v.z;
    mpApplyView(outer, it);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up);
    svg.removeEventListener('pointercancel', up);
    svg.classList.remove('mmpan');
    if(moved){ queueSave(page.id); return; }
    mpPick(outer, it, page, null);
    mpShowBar(outer, it, page, 'map', null, { x:ev.clientX, y:ev.clientY });
  };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
}
/* deleting: it shrinks away first, and the record changes when it has gone */
function mpDelete(outer, it, page, node){
  const ids = mmSubtree(it, node.id), st = outer._mm, up = node.pid;
  if(st && st.editing) mpEndEdit(outer);
  mpClosePop();
  mpHideBar(outer);
  const gone = () => {
    mpDropSubtree(it, page, node.id);
    MP_SEL.delete(it.id);
    mpCommit(outer, it, page);
    /* the thought it hung off is picked next, so Backspace can climb a limb
       and Tab can put something new where the old one was */
    if(up && mpNode(it, up)) mpPick(outer, it, page, up);
    SND.pluck();
  };
  if(MP_STILL.matches) return gone();
  let left = 0;
  for(const id of ids){
    const g = outer.querySelector('.mmnode[data-n="' + id + '"]');
    if(!g) continue;
    const p = (st && st.cur.get(id)) || { x:0, y:0 };
    const at = 'translate(' + mmRd(p.x) + 'px,' + mmRd(p.y) + 'px)';
    g.classList.add('mmgone');
    left++;
    const a = g.animate([{ transform: at + ' scale(1)', opacity:1 },
      { transform: at + ' scale(.34)', opacity:0 }],
      { duration:195, easing:'cubic-bezier(.4,0,.85,.5)' });
    a.onfinish = a.oncancel = () => { if(--left <= 0) gone(); };
  }
  if(!left) gone();
}
function mpSyncTools(outer, it){
  const tools = outer.querySelector(':scope > .tools');
  if(!tools) return;
  const z = tools.querySelector('[data-mp="zoom"]');
  if(z) z.textContent = Math.round(mpView(it).z * 100) + '%';
  const p = tools.querySelector('[data-mp="paper"]');
  if(p){
    p.setAttribute('aria-pressed', it.paper === 0 ? 'false' : 'true');
    p.classList.toggle('mmoff', it.paper === 0);
  }
}
/* the widget itself arriving — out of the point it was asked for, blurred to
   sharp with a touch of overshoot, and then it is simply there */
function mpPopIn(el, it){
  if(!el || MP_STILL.matches) return;
  const rot = 'rotate(' + (it.rot || 0) + 'deg)';
  try{ warpOrigin(el, lastMouse.x, lastMouse.y); }catch(e){}
  el.animate([
    { transform: rot + ' scale(.7)', opacity:0, filter:'blur(10px)' },
    { transform: rot + ' scale(1.028)', opacity:1, filter:'blur(0px)', offset:.6 },
    { transform: rot + ' scale(1)', opacity:1, filter:'blur(0px)' }
  ], { duration:470, easing:'cubic-bezier(.2,.88,.28,1)' })
    .onfinish = () => { el.style.transformOrigin = ''; };
}

/* ================= what the bars offer =================
   Node first, then the map. Every one of these is replaceable and none of them
   is reached by name from anywhere else. */
defineMindMapAction({ id:'rename', group:'node', order:10, icon:'pen', commit:false,
  hint:'Rename this box — or just double-click it',
  run: x => mpEdit(x.outer, x.it, x.page, x.node) });
defineMindMapAction({ id:'child', group:'node', order:14, icon:'child',
  hint:'A thought underneath this one',
  when: x => x.node && x.c.depth(x.node) + 1 <= (x.kind.nest == null ? Infinity : x.kind.nest),
  run: x => mpNewNode(x.it, x.page, x.node.id) });
defineMindMapAction({ id:'tone', group:'node', order:20, commit:false, hint:'Colour of this box',
  icon: x => '<i class="mmdot" style="background:' +
    mpColors(mpLook(x.it), x.c.tone(x.node), false).stroke + '"></i>',
  run: x => mpTonePop(x) });
defineMindMapAction({ id:'shape', group:'node', order:22, icon:'shape', commit:false,
  hint:'Shape of this box', run: x => mpShapePop(x) });
defineMindMapAction({ id:'fold', group:'node', order:30,
  hint:'Fold away everything hanging off this',
  icon: x => x.node && x.node.fold ? 'unfold' : 'fold',
  when: x => x.node && mmKids(x.it, x.node.id).length > 0,
  run: x => { if(x.node.fold) delete x.node.fold; else x.node.fold = 1;
    queueSave(x.page.id); SND.tick(); } });
defineMindMapAction({ id:'dup', group:'node', order:40, icon:'copy',
  hint:'Duplicate this and everything under it',
  when: x => x.node && !!x.node.pid,
  run: x => mpCopySubtree(x.it, x.page, x.node.id) });
defineMindMapAction({ id:'free', group:'node', order:44, icon:'home',
  hint:'Put this box back where the map wants it',
  when: x => x.node && !!(x.node.ox || x.node.oy),
  run: x => { delete x.node.ox; delete x.node.oy; queueSave(x.page.id); SND.plop(); } });
defineMindMapAction({ id:'del', group:'node', order:60, icon:'del', commit:false,
  hint:'Delete this and everything under it',
  when: x => x.node && mmNodes(x.it).length > 1,
  run: x => mpDelete(x.outer, x.it, x.page, x.node) });

defineMindMapAction({ id:'idea', group:'map', order:10, icon:'plus', hint:'A new thought on the map',
  run: x => { const r = x.c.roots[0]; return mpNewNode(x.it, x.page, r ? r.id : null); } });
defineMindMapAction({ id:'kind', group:'map', order:20, icon:'kinds', commit:false,
  hint:'Which kind of map this is — nine of them', run: x => mpKindPop(x) });
defineMindMapAction({ id:'design', group:'map', order:24, icon:'pen', commit:false,
  hint:'Palette, boxes, lines, spacing and type', run: x => mpDesign(x) });
defineMindMapAction({ id:'tidy', group:'map', order:30, icon:'tidy', commit:false,
  hint:'Put every hand-placed box back where the map wants it',
  when: x => mmNodes(x.it).some(n => n.ox || n.oy),
  run: x => mpTidy(x.outer, x.it, x.page) });
defineMindMapAction({ id:'fitview', group:'map', order:34, icon:'home', commit:false,
  hint:'Centre the map in its frame again',
  run: x => { mpHome(x.outer, x.it, x.page); SND.tick(); } });
defineMindMapAction({ id:'paper', group:'map', order:40, icon:'paper', commit:false,
  hint:'Show or hide the card the map is drawn on',
  run: x => { x.it.paper = x.it.paper === 0 ? 1 : 0;
    x.outer.querySelector('.mmenv').classList.toggle('noframe', x.it.paper === 0);
    queueSave(x.page.id); mpSyncTools(x.outer, x.it); SND.tick(); } });

/* ================= the keyboard, while a box is picked ================= */
function mpKey(e){
  if(e.key === 'Escape' && mpClosePop()){ e.preventDefault(); return true; }
  const outer = document.querySelector('#pageHost .item[data-type="mindmap"].sel');
  if(!outer) return false;
  const page = pageOfEl(outer), it = page && page.items.find(z => z.id === outer.dataset.id);
  if(!it) return false;
  const st = outer._mm;
  if(st && st.editing){
    /* still in a box: the box's own handler has the keys. Unless the caret has
       gone without the box hearing about it — then the edit is over and the
       key is ours, because handing Backspace back to core deletes the map. */
    const box = mpEditEl(outer);
    if(box && document.activeElement === box) return false;
    mpEndEdit(outer);
  }
  const node = mpNode(it, MP_SEL.get(it.id));
  if(e.key === 'Escape'){
    if(!node) return false;
    e.preventDefault(); e.stopPropagation();
    mpPick(outer, it, page, null);
    return true;
  }
  if(!node) return false;
  const born = made => {
    mpCommit(outer, it, page); SND.pop();
    mpPick(outer, it, page, made.id); mpEdit(outer, it, page, made);
    return true;
  };
  if(e.key === 'Delete' || e.key === 'Backspace'){
    if(mmNodes(it).length < 2) return false;
    e.preventDefault(); e.stopPropagation();
    mpDelete(outer, it, page, node);
    return true;
  }
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault(); e.stopPropagation();
    /* beside this one — or, for the middle of the map, into it */
    if(!node.pid){ mpEdit(outer, it, page, node); return true; }
    return born(mpNewNode(it, page, node.pid, { side:node.side, after:node.id }));
  }
  if(e.key === 'Tab'){
    const nest = mpKind(it).nest == null ? Infinity : mpKind(it).nest;
    if(mpCtx(it).depth(node) + 1 > nest) return false;
    e.preventDefault(); e.stopPropagation();
    return born(mpNewNode(it, page, node.id));
  }
  if(e.key === 'F2'){
    e.preventDefault(); e.stopPropagation();
    mpEdit(outer, it, page, node);
    return true;
  }
  /* just start typing: the key goes into the box, replacing what was there */
  if(e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey){
    e.preventDefault(); e.stopPropagation();
    mpEdit(outer, it, page, node, e.key);
    return true;
  }
  return false;
}

/* ================= the page item ================= */
defineItem('mindmap', {
  add: { mindmap: base => ({ ...base, type:'mindmap', w:MP_BASE_W, kind:'mind', paper:1,
    zoom:1, viewX:0, viewY:0, look:{}, nodes: mpBuildSeed('mind'), frame:'', cap:'' }) },
  sound: 'pop',
  key: mpKey,
  html: mpHTML,
  wire(outer, it, page){
    const st = mpState(outer);
    st.L = mpLayout(it);
    st.target = new Map(st.L.boxes.map(b => [b.id, { x:b.x, y:b.y }]));
    st.cur = new Map(st.L.boxes.map(b => [b.id, { x:b.x, y:b.y, s:1, vx:0, vy:0, vs:0 }]));
    st.fit = { ...st.L.fit, vs:0, vtx:0, vty:0, vh:0 };
    st.fitT = { ...st.L.fit };
    mpBindNodes(outer, it, page);
    mpMarkPick(outer, it);
    mpWireEdit(outer);
    const svg = outer.querySelector('.mmsvg');
    if(svg){
      svg.addEventListener('pointerdown', e => mpStagePointer(e, outer, it, page));
      svg.addEventListener('dblclick', e => {
        const label = e.target.closest('[data-edit="frame"]');
        if(label){
          e.preventDefault(); e.stopPropagation();
          mpTextPop(label, 'Frame of reference', it.frame || '', v => {
            it.frame = v; queueSave(page.id); mpCommit(outer, it, page);
          });
          return;
        }
        if(e.target.closest('.mmnode')) return;
        e.preventDefault(); e.stopPropagation();
        mpHome(outer, it, page); SND.pop();
      });
      svg.addEventListener('wheel', e => {
        if(e.ctrlKey || e.metaKey || !outer.classList.contains('sel')) return;
        e.preventDefault(); e.stopPropagation();
        mpSetZoom(outer, it, page, mpView(it).z * Math.exp(-clamp(wheelPx(e), -120, 120) * .0016),
          e.clientX, e.clientY);
      }, { passive:false });
    }
    const prior = MP_RESIZE.get(it.id);
    if(prior) prior.disconnect();
    if(typeof ResizeObserver !== 'undefined'){
      const ro = new ResizeObserver(() => {
        if(!outer.isConnected) return;
        mpPlaceBar(outer, it); mpPlaceEdit(outer, it);
      });
      ro.observe(outer); MP_RESIZE.set(it.id, ro);
    }
    mpApplyView(outer, it);
    mpSyncTools(outer, it);
  },
  after(it, el, page){
    mpPopIn(el, it);
    /* the map's own bar, once, so the nine kinds and the design panel are not
       something you have to be told about */
    setTimeout(() => {
      const outer = mpFind(it.id);
      if(!outer || !outer.classList.contains('sel')) return;
      const r = outer.getBoundingClientRect();
      mpShowBar(outer, it, page, 'map', null, { x: r.left + r.width / 2, y: r.top + 8 });
    }, 430);
  },
  tools(mk, it, outer, page){
    const b = (label, title, fn, tag) => { const x = mk(label, title, fn); if(tag) x.dataset.mp = tag; return x; };
    const move = b('✥', 'Drag to move the whole map on the sheet', () => {});
    move.addEventListener('pointerdown', e => startDrag(e, it, outer, page));
    b('◈', 'Which kind of map this is — nine of them', btn => {
      const x = mpX(outer, it, page, null); x.btn = btn; mpKindPop(x); }, 'kind');
    b('✎', 'Palette, boxes, lines, spacing and type', btn => {
      const x = mpX(outer, it, page, null); x.btn = btn; mpDesign(x); }, 'design');
    b('＋', 'A new thought on the map', () => {
      const r = mmRoots(it)[0];
      const made = mpNewNode(it, page, r ? r.id : null);
      mpCommit(outer, it, page); SND.pop();
      mpPick(outer, it, page, made.id); mpEdit(outer, it, page, made);
    });
    b('−', 'Zoom the map out', () => mpSetZoom(outer, it, page, mpView(it).z / 1.25));
    b(Math.round(mpView(it).z * 100) + '%', 'Back to 100%, centred',
      () => { mpHome(outer, it, page); SND.tick(); }, 'zoom');
    b('+', 'Zoom the map in', () => mpSetZoom(outer, it, page, mpView(it).z * 1.25));
    b('▣', 'Show or hide the card the map is drawn on', () => {
      it.paper = it.paper === 0 ? 1 : 0;
      outer.querySelector('.mmenv').classList.toggle('noframe', it.paper === 0);
      queueSave(page.id); mpSyncTools(outer, it); SND.tick();
    }, 'paper');
  },
  forget(it){
    if(it.type !== 'mindmap') return;
    const ro = MP_RESIZE.get(it.id);
    if(ro) ro.disconnect();
    MP_RESIZE.delete(it.id);
    MP_SEL.delete(it.id);
  },
  icon: () => '<svg viewBox="0 0 100 64" fill="none" stroke="currentColor" stroke-width="3.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="38" y="24" width="24" height="16" rx="5"/>' +
    '<path d="M38 30L20 18M38 34l-18 12M62 30l18-12M62 34l18 12"/>' +
    '<rect x="4" y="10" width="18" height="12" rx="4"/><rect x="4" y="42" width="18" height="12" rx="4"/>' +
    '<rect x="78" y="10" width="18" height="12" rx="4"/><rect x="78" y="42" width="18" height="12" rx="4"/></svg>',
  label: it => mpKind(it).label,
  meta: it => {
    const n = mmNodes(it).length;
    return mpKind(it).label + ' · ' + n + (n === 1 ? ' thought' : ' thoughts');
  },
  css: `
/* ---------- thinking maps ---------- */
.mmenv{position:relative;padding:calc(var(--scale)*8px);border-radius:calc(var(--scale)*7px);
  transition:background .18s,box-shadow .18s}
.item[data-type="mindmap"] > .rot{display:none}
.item[data-type="mindmap"] > .tools{max-width:min(720px,92vw);flex-wrap:wrap}
.item[data-type="mindmap"] > .tools [data-mp="zoom"]{min-width:calc(var(--scale)*46px);
  font-variant-numeric:tabular-nums}
.item[data-type="mindmap"] > .tools button:disabled{opacity:.3;cursor:not-allowed}
.item[data-type="mindmap"] > .tools button.mmoff{color:var(--accent2);outline:1px dashed currentColor}
.mmstage{position:relative;height:0;padding-bottom:62%;overflow:hidden;
  border-radius:calc(var(--scale)*5px);
  background:color-mix(in srgb,var(--paper) 94%,var(--line));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--line) 55%,transparent);
  transition:background .18s,box-shadow .18s}
.mmenv.noframe{background:transparent!important;box-shadow:none!important;padding:0}
.mmenv.noframe .mmstage{background:transparent;box-shadow:none}
.mmsvg{position:absolute;inset:0;display:block;width:100%;height:100%;font-family:${MP_FONT};
  -webkit-font-smoothing:antialiased;cursor:default;touch-action:none}
.item.sel[data-type="mindmap"] .mmsvg{cursor:grab}
.item.sel[data-type="mindmap"] .mmsvg.mmpan{cursor:grabbing}
.mmlinks,.mmdeco{pointer-events:none}
.mmdeco [data-edit]{pointer-events:auto;cursor:text}
.item.sel[data-type="mindmap"] .mmnode{cursor:grab}
.item.sel[data-type="mindmap"] .mmnode.mmdrag{cursor:grabbing}
.mmhit{transition:fill-opacity .16s,fill .16s}
.mmnode:hover .mmhit{fill:var(--ink);fill-opacity:.05}
.mmnode.sel .mmhit{fill:var(--accent2);fill-opacity:.18}
.mmnode.sel .mmshape{stroke-width:2.4;stroke-opacity:1}
.mmnode.mmgone{transform-box:fill-box;transform-origin:50% 50%;pointer-events:none}
.mmshape{transition:fill .22s,stroke .22s,fill-opacity .22s,stroke-opacity .22s}
.mmghost{fill:var(--soft);opacity:.4}
.mmediting .mmnode.sel .mmtext,.mmediting .mmnode.sel .mmghost{opacity:0}
.mmdeco .mmdec{fill:none;stroke:var(--line);vector-effect:non-scaling-stroke}
.mmdeco text.mmdec{fill:var(--soft);stroke:none}
.mmring{stroke-width:1.7;opacity:.95}
.mmring2{opacity:.55}
.mmframe{stroke:var(--soft);stroke-width:1.4;stroke-dasharray:8 7;opacity:.45}
.mmnote{font-size:15px;opacity:.85}
.mmbrace{stroke:var(--soft);stroke-width:2.4;opacity:.8;stroke-linecap:round}
.mmbrace2{stroke-width:1.8;opacity:.72}
.mmbridge{stroke:var(--ink);stroke-width:1.8;opacity:.55;stroke-linecap:round}
.mmedit{position:absolute;z-index:8;transform:translateY(-50%);text-align:center;outline:none;
  user-select:text;-webkit-user-select:text;
  border:0;background:transparent;padding:0;margin:0;font-family:${MP_FONT};
  overflow-wrap:break-word;white-space:pre-wrap;caret-color:var(--accent);cursor:text}
.mmedit[hidden]{display:none}
.mmbar{position:absolute;z-index:30;display:flex;align-items:center;gap:3px;padding:4px;
  border-radius:13px;white-space:nowrap;color:#e9eaef;max-width:min(560px,90vw);
  overflow-x:auto;scrollbar-width:none}
.mmbar[hidden]{display:none}
.mmbar::-webkit-scrollbar{display:none}
.mmbar button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:30px;
  height:30px;padding:0 7px;border-radius:9px;color:inherit;background:transparent;
  transition:background .13s,color .13s,transform .1s}
.mmbar button:hover{background:rgba(255,255,255,.14);color:#fff}
.mmbar button:active{transform:scale(.93)}
.mmbar button svg{width:19px;height:19px;flex:none}
.mmbar .mmadd{padding:0 11px 0 7px;background:rgba(255,255,255,.07)}
.mmbar .mmadd span{font:600 10.5px/1 var(--mono);letter-spacing:.05em}
.mmbar .mmadd:hover{background:var(--accent);color:#fff}
.mmbar .mmsep{width:1px;height:18px;margin:0 3px;background:rgba(255,255,255,.16);flex:none}
.mmbar .mmdot{width:15px;height:15px;border-radius:50%;display:block;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.mmpop{position:fixed;z-index:1000;padding:11px;border-radius:15px;color:#e9eaef;
  max-width:min(470px,92vw);max-height:min(70vh,560px);overflow:auto;overscroll-behavior:contain;
  scrollbar-width:thin}
.mmpop header{font:600 9.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;
  opacity:.5;margin:1px 2px 9px}
.mmswatch{display:flex;flex-wrap:wrap;gap:6px;max-width:236px}
.mmswatch button{width:30px;height:30px;border-radius:9px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);transition:transform .12s,box-shadow .12s}
.mmswatch button:hover{transform:scale(1.09)}
.mmswatch button.on{box-shadow:inset 0 0 0 2px #fff}
.mmswatch .mmauto{width:auto;padding:0 12px;font:600 9.5px/1 var(--mono);letter-spacing:.1em;
  text-transform:uppercase;color:#e9eaef;background:rgba(255,255,255,.07)}
.mmchips{display:flex;flex-wrap:wrap;gap:5px;max-width:274px}
.mmchips button{padding:8px 12px;border-radius:9px;font:600 10.5px/1 var(--mono);
  color:rgba(233,234,239,.85);background:rgba(255,255,255,.06);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);transition:background .12s,color .12s}
.mmchips button:hover{background:rgba(255,255,255,.14);color:#fff}
.mmchips button.on{background:var(--accent);color:#fff}
.mmgal{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;width:min(432px,86vw)}
.mmgal button{display:grid;gap:4px;justify-items:start;text-align:left;padding:9px;border-radius:12px;
  color:rgba(233,234,239,.86);background:rgba(255,255,255,.05);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);
  transition:background .14s,color .14s,transform .12s}
.mmgal button:hover{background:rgba(255,255,255,.13);color:#fff;transform:translateY(-1px)}
.mmgal button.on{background:var(--accent);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.mmgal svg{width:100%;height:auto;aspect-ratio:60/40;opacity:.92}
.mmgal b{font:600 11px/1.2 var(--mono)}
.mmgal small{font:9px/1.32 var(--mono);opacity:.6}
.mmfield{display:flex;gap:6px;align-items:center}
.mmfield input{min-width:214px;height:32px;padding:0 10px;border:0;border-radius:9px;color:#fff;
  font:11px/1 var(--mono);background:rgba(255,255,255,.08);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);outline:none}
.mmfield input:focus{box-shadow:inset 0 0 0 2px var(--accent2)}
.mmfield button{height:32px;padding:0 14px;border-radius:9px;color:#fff;font:600 10px/1 var(--mono);
  letter-spacing:.08em;text-transform:uppercase;background:var(--accent)}
@media (prefers-reduced-motion:reduce){
  .mmbar button,.mmgal button,.mmswatch button,.mmshape,.mmhit,.mmenv,.mmstage{transition:none}
}
@media (prefers-reduced-transparency:reduce){ .mmbar,.mmpop{backdrop-filter:none;background:#20242a} }
`
});

defineIcon('mindmap', '<rect x="9" y="9.5" width="6" height="5" rx="1.6"/>' +
  '<path d="M9 11L5.4 8.2M9 13l-3.6 2.8M15 11l3.6-2.8M15 13l3.6 2.8"/>' +
  '<circle cx="3.6" cy="7.4" r="1.9"/><circle cx="3.6" cy="16.6" r="1.9"/>' +
  '<circle cx="20.4" cy="7.4" r="1.9"/><circle cx="20.4" cy="16.6" r="1.9"/>');
defineTool({ kind:'mindmap', cat:'write', label:'Mind map', icon:'mindmap', order:35,
  hint:'One tile, nine maps — mind, circle, bubble, double bubble, tree, brace, flow, multi-flow and bridge' });

onNoteOpen(() => {
  mpClosePop();
  MP_RESIZE.forEach(ro => ro.disconnect());
  MP_RESIZE.clear();
  MP_SEL.clear();
});
