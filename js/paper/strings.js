/* Open Note — ui/strings.js
   pins, strings and arrows between items */

/* ================= pins & strings (detective board) ================= */
/* a string or an arrow is page.links = [{id, a, b, c, t, st}] — the two items it
   ties together, its colour, and for an arrow its shape. One svg board covers
   the whole sheet, above everything on it. */
const STRING_COLORS = ['#cf3a24', '#2b7d8c', '#e0a02c', '#20242a'];
const ARROW_STYLES = ['straight', 'curve', 'bezier'];
const SVW = 660;                                // logical space for static (thumb/print/export) strings
const svhOf = idx => Math.round(SVW * arOf(idx));  // …as tall as that book's page really is
let BOARD = null, ROPES = [], ropeRaf = 0, ropeCalm = 0;
let linking = null, selString = null, ghost = null;

/* pins mark items that hold a STRING; arrows attach to item edges instead */
function itemLinked(page, id){
  return (page.links || []).some(l => l.t !== 'arr' && (l.a === id || l.b === id));
}
function ensurePin(itEl){
  if(!itEl.querySelector('.pin')){
    const d = document.createElement('div'); d.className = 'pin'; itEl.appendChild(d);
  }
}
function pinPoint(svg, vw, vh, pinEl){
  const pr = pinEl.getBoundingClientRect(), sr = svg.getBoundingClientRect();
  if(!sr.width || !sr.height) return null;
  return { x: (pr.left + pr.width / 2 - sr.left) / sr.width * vw,
           y: (pr.top + pr.height / 2 - sr.top) / sr.height * vh };
}
function boardAnchor(pageId, itemId){
  if(!BOARD) return null;
  const wrap = BOARD.wraps[pageId];
  const pin = wrap && wrap.querySelector('.item[data-id="' + itemId + '"] .pin');
  return pin ? pinPoint(BOARD.svg, BOARD.vw, BOARD.vh, pin) : null;
}
function sagPath(a, b){
  const sag = Math.hypot(b.x - a.x, b.y - a.y) * 0.14 + 10;
  return 'M' + rd1(a.x) + ' ' + rd1(a.y) +
         'Q' + rd1((a.x + b.x) / 2) + ' ' + rd1((a.y + b.y) / 2 + sag * 2) +
         ' ' + rd1(b.x) + ' ' + rd1(b.y);
}

/* ---- arrows: powerpoint-style connectors between items ---- */
function itemBox(pageId, itemId){
  if(!BOARD) return null;
  const wrap = BOARD.wraps[pageId];
  const el = wrap && wrap.querySelector('.item[data-id="' + itemId + '"]');
  if(!el) return null;
  const er = el.getBoundingClientRect(), sr = BOARD.svg.getBoundingClientRect();
  if(!sr.width || !sr.height) return null;
  const fx = BOARD.vw / sr.width, fy = BOARD.vh / sr.height;
  return { cx: (er.left + er.width / 2 - sr.left) * fx, cy: (er.top + er.height / 2 - sr.top) * fy,
           hw: er.width / 2 * fx, hh: er.height / 2 * fy };
}
/* where the connector leaves an item: on its box edge, facing the far end */
function edgePoint(box, toward){
  const dx = toward.x - box.cx, dy = toward.y - box.cy;
  const s = Math.max(Math.abs(dx) / (box.hw || 1), Math.abs(dy) / (box.hh || 1));
  if(!s) return { x: box.cx, y: box.cy };
  const t = 1 / s, len = Math.hypot(dx, dy) || 1, pad = 4;
  return { x: box.cx + dx * t + dx / len * pad, y: box.cy + dy * t + dy / len * pad };
}
function arrowGeom(a, b, st){
  const H = 11;                                   // arrowhead length
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 0.001;
  let d, tx, ty, mid;
  if(st === 'curve'){
    const k = Math.min(len * 0.22, 90);
    const cx = (a.x + b.x) / 2 - dy / len * k, cy = (a.y + b.y) / 2 + dx / len * k;
    let ux = b.x - cx, uy = b.y - cy;
    const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    d = 'M' + rd1(a.x) + ' ' + rd1(a.y) + 'Q' + rd1(cx) + ' ' + rd1(cy) +
        ' ' + rd1(b.x - ux * H * 0.7) + ' ' + rd1(b.y - uy * H * 0.7);
    tx = ux; ty = uy;
    mid = { x: (a.x + 2 * cx + b.x) / 4, y: (a.y + 2 * cy + b.y) / 4 };
  } else if(st === 'bezier'){
    let c1, c2;
    if(Math.abs(dx) >= Math.abs(dy)){ c1 = { x: a.x + dx * 0.5, y: a.y }; c2 = { x: b.x - dx * 0.5, y: b.y }; }
    else { c1 = { x: a.x, y: a.y + dy * 0.5 }; c2 = { x: b.x, y: b.y - dy * 0.5 }; }
    let ux = b.x - c2.x, uy = b.y - c2.y, ul = Math.hypot(ux, uy);
    if(ul < 0.01){ ux = dx / len; uy = dy / len; } else { ux /= ul; uy /= ul; }
    d = 'M' + rd1(a.x) + ' ' + rd1(a.y) + 'C' + rd1(c1.x) + ' ' + rd1(c1.y) +
        ' ' + rd1(c2.x) + ' ' + rd1(c2.y) +
        ' ' + rd1(b.x - ux * H * 0.7) + ' ' + rd1(b.y - uy * H * 0.7);
    tx = ux; ty = uy;
    mid = { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 };
  } else {
    tx = dx / len; ty = dy / len;
    d = 'M' + rd1(a.x) + ' ' + rd1(a.y) + 'L' + rd1(b.x - tx * H * 0.7) + ' ' + rd1(b.y - ty * H * 0.7);
    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const px = -ty, py = tx;
  const hd = 'M' + rd1(b.x) + ' ' + rd1(b.y) +
    'L' + rd1(b.x - tx * H + px * H * 0.45) + ' ' + rd1(b.y - ty * H + py * H * 0.45) +
    'L' + rd1(b.x - tx * H - px * H * 0.45) + ' ' + rd1(b.y - ty * H - py * H * 0.45) + 'Z';
  return { d, hd, mid };
}
function updateArrow(r){
  const A = itemBox(r.ap, r.a), B = itemBox(r.bp, r.b);
  if(!A || !B) return;
  const pa = edgePoint(A, { x: B.cx, y: B.cy }), pb = edgePoint(B, { x: A.cx, y: A.cy });
  const g = arrowGeom(pa, pb, r.link.st || 'straight');
  r.path.setAttribute('d', g.d);
  r.head.setAttribute('d', g.hd);
  r.mid = g.mid;
}
function addArrow(r){
  const group = document.createElementNS(SVGNS, 'g');
  group.setAttribute('class', 'arrow');
  const path = document.createElementNS(SVGNS, 'path');
  const head = document.createElementNS(SVGNS, 'path');
  const col = STRING_COLORS[r.link.c || 0];
  path.setAttribute('stroke', col); path.setAttribute('class', 'al');
  head.style.fill = col; head.setAttribute('class', 'ah');
  group.appendChild(path); group.appendChild(head);
  const rope = { ...r, arrow: true, path, head, group };
  group.addEventListener('pointerdown', e => e.stopPropagation());
  group.addEventListener('click', e => { e.stopPropagation(); selectString(rope); });
  BOARD.svg.appendChild(group);
  ROPES.push(rope);
  updateArrow(rope);
  return rope;
}
/* settled strings + arrows for thumbnails / print / export — same-page links only */
function drawStaticStrings(wrap, page, bIdx){
  const idx = bIdx || index;
  /* whatever else is drawn between items rather than inside one goes on at the
     same moment, and for the same reason — see onPageOverlay in core/registry.js */
  drawPageOverlays(wrap, page, idx);
  const SVH = svhOf(idx);
  const strLinks = (page.links || []).filter(l => l.t !== 'arr');
  const arrLinks = (page.links || []).filter(l => l.t === 'arr');
  const pinIds = new Set();
  strLinks.forEach(l => { pinIds.add(l.a); pinIds.add(l.b); });
  pinIds.forEach(id => {
    const el = wrap.querySelector('.item[data-id="' + id + '"]');
    if(el) ensurePin(el);
  });
  if(!strLinks.length && !arrLinks.length) return;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'strings');
  svg.setAttribute('viewBox', '0 0 ' + SVW + ' ' + SVH);
  svg.setAttribute('preserveAspectRatio', 'none');
  wrap.appendChild(svg);
  strLinks.forEach(l => {
    const pa = wrap.querySelector('.item[data-id="' + l.a + '"] .pin');
    const pb = wrap.querySelector('.item[data-id="' + l.b + '"] .pin');
    if(!pa || !pb) return;
    const a = pinPoint(svg, SVW, SVH, pa), b = pinPoint(svg, SVW, SVH, pb);
    if(!a || !b) return;
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', sagPath(a, b));
    p.setAttribute('stroke', STRING_COLORS[l.c || 0]);
    svg.appendChild(p);
  });
  const box = id => {
    const el = wrap.querySelector('.item[data-id="' + id + '"]');
    if(!el) return null;
    const er = el.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    if(!sr.width || !sr.height) return null;
    const fx = SVW / sr.width, fy = SVH / sr.height;
    return { cx: (er.left + er.width / 2 - sr.left) * fx, cy: (er.top + er.height / 2 - sr.top) * fy,
             hw: er.width / 2 * fx, hh: er.height / 2 * fy };
  };
  arrLinks.forEach(l => {
    const A = box(l.a), B = box(l.b);
    if(!A || !B) return;
    const g = arrowGeom(edgePoint(A, { x: B.cx, y: B.cy }), edgePoint(B, { x: A.cx, y: A.cy }), l.st || 'straight');
    const col = STRING_COLORS[l.c || 0];
    const sh = document.createElementNS(SVGNS, 'path');
    sh.setAttribute('d', g.d); sh.setAttribute('stroke', col); sh.setAttribute('class', 'al');
    const hd = document.createElementNS(SVGNS, 'path');
    hd.setAttribute('d', g.hd); hd.style.fill = col; hd.setAttribute('class', 'ah');
    svg.appendChild(sh); svg.appendChild(hd);
  });
}
/* the live board: one overlay over the whole sheet */
function buildBoard(entries){
  const host = $('#pageHost');
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'strings');
  const vw = Math.max(1, host.offsetWidth / zoom), vh = Math.max(1, host.offsetHeight / zoom);
  svg.setAttribute('viewBox', '0 0 ' + rd1(vw) + ' ' + rd1(vh));
  svg.setAttribute('preserveAspectRatio', 'none');
  host.appendChild(svg);
  const wraps = {};
  entries.forEach(en => { wraps[en.page.id] = en.wrap; });
  BOARD = { host, svg, vw, vh, wraps, entries, pages: entries.map(en => en.page) };
  for(const en of entries){
    en.page.items.forEach(it => {
      if(itemLinked(en.page, it.id)){
        const el = en.wrap.querySelector('.item[data-id="' + it.id + '"]');
        if(el) ensurePin(el);
      }
    });
    (en.page.links || []).forEach(l =>
      addRope({ page: en.page, link: l, ap: en.page.id, a: l.a, bp: en.page.id, b: l.b }));
  }
  wakeRopes();
}
function addRope(r){
  if(r.link && r.link.t === 'arr') return addArrow(r);
  const a = boardAnchor(r.ap, r.a), b = boardAnchor(r.bp, r.b);
  if(!a || !b) return;
  const dist = Math.max(20, Math.hypot(b.x - a.x, b.y - a.y));
  const n = clamp(Math.round(dist / 16), 14, 48);
  const rest = dist * 1.15 / (n - 1);           // 15% slack = the drape
  const pts = [];
  for(let i = 0; i < n; i++){
    const t = i / (n - 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * dist * 0.08;
    pts.push({ x, y, px: x, py: y });
  }
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('stroke', STRING_COLORS[r.link.c || 0]);
  const rope = { ...r, pts, rest, path };
  path.addEventListener('pointerdown', e => e.stopPropagation());
  path.addEventListener('click', e => { e.stopPropagation(); selectString(rope); });
  BOARD.svg.appendChild(path);
  ROPES.push(rope);
  return rope;
}
function ropePathD(pts){
  let d = 'M' + rd1(pts[0].x) + ' ' + rd1(pts[0].y);
  for(let i = 1; i < pts.length - 1; i++)       // midpoint smoothing — yarn, not a polyline
    d += 'Q' + rd1(pts[i].x) + ' ' + rd1(pts[i].y) + ' ' +
         rd1((pts[i].x + pts[i + 1].x) / 2) + ' ' + rd1((pts[i].y + pts[i + 1].y) / 2);
  const l = pts[pts.length - 1];
  return d + 'L' + rd1(l.x) + ' ' + rd1(l.y);
}
function wakeRopes(){
  ropeCalm = 0;
  if(!ropeRaf && ROPES.length) ropeRaf = requestAnimationFrame(stepRopes);
}
function stepRopes(){
  ropeRaf = 0;
  let moved = 0;
  for(const r of ROPES){
    if(r.arrow){ updateArrow(r); continue; }      // arrows track their items, no physics
    const a = boardAnchor(r.ap, r.a), b = boardAnchor(r.bp, r.b);
    if(!a || !b) continue;
    const pts = r.pts, n = pts.length;
    pts[0].x = a.x; pts[0].y = a.y; pts[n - 1].x = b.x; pts[n - 1].y = b.y;
    for(let i = 1; i < n - 1; i++){             // verlet integration with gravity
      const p = pts[i];
      const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985 + 0.5;
      p.px = p.x; p.py = p.y; p.x += vx; p.y += vy;
      moved = Math.max(moved, Math.abs(vx), Math.abs(vy));
    }
    for(let k = 0; k < 4; k++){                 // keep segment lengths
      for(let i = 0; i < n - 1; i++){
        const p = pts[i], q = pts[i + 1];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - r.rest) / d / 2;
        const ox = dx * diff, oy = dy * diff;
        if(i > 0){ p.x += ox; p.y += oy; }
        if(i < n - 2){ q.x -= ox; q.y -= oy; }
      }
      pts[0].x = a.x; pts[0].y = a.y; pts[n - 1].x = b.x; pts[n - 1].y = b.y;
    }
    r.path.setAttribute('d', ropePathD(pts));
  }
  ropeCalm = moved < 0.05 ? ropeCalm + 1 : 0;   // sleep once everything settles
  if(ROPES.length && ropeCalm < 60) ropeRaf = requestAnimationFrame(stepRopes);
}

function selectString(rope){
  select(null); deselectString();
  selString = rope;
  (rope.group || rope.path).classList.add('sel');
  const chip = document.createElement('div');
  chip.className = 'strchip';
  const mid = rope.arrow ? (rope.mid || { x: BOARD.vw / 2, y: BOARD.vh / 2 })
                         : rope.pts[Math.floor(rope.pts.length / 2)];
  chip.style.left = (mid.x / BOARD.vw * 100) + '%';
  chip.style.top = (mid.y / BOARD.vh * 100) + '%';
  const srcWrap = BOARD.wraps[rope.ap];
  chip.style.setProperty('--scale', (srcWrap && srcWrap.style.getPropertyValue('--scale')) || 1);
  chip.addEventListener('pointerdown', e => e.stopPropagation());
  const btn = (label, title, fn) => {
    const b = document.createElement('button');
    b.textContent = label; b.title = title;
    b.addEventListener('click', e => { e.stopPropagation(); fn(); });
    chip.appendChild(b);
  };
  const saveLink = () => queueSave(rope.page.id);
  if(rope.arrow){
    btn('↝', 'Arrow shape — straight / curved / bézier', () => {
      const i = ARROW_STYLES.indexOf(rope.link.st || 'straight');
      rope.link.st = ARROW_STYLES[(i + 1) % ARROW_STYLES.length];
      index.settings.arrowStyle = rope.link.st;   // last used shape becomes the default
      updateArrow(rope); saveLink(); queueIndex();
    });
    btn('⇄', 'Flip direction', () => {
      const l = rope.link;
      [l.a, l.b] = [l.b, l.a];
      [rope.a, rope.b] = [rope.b, rope.a];
      [rope.ap, rope.bp] = [rope.bp, rope.ap];
      updateArrow(rope); saveLink();
    });
  }
  btn('◑', rope.arrow ? 'Arrow colour' : 'String colour', () => {
    rope.link.c = ((rope.link.c || 0) + 1) % STRING_COLORS.length;
    const col = STRING_COLORS[rope.link.c];
    rope.path.setAttribute('stroke', col);
    if(rope.head) rope.head.style.fill = col;
    saveLink();
  });
  btn('✕', rope.arrow ? 'Remove arrow' : 'Remove string', () => deleteString(rope));
  BOARD.host.appendChild(chip);
  rope.chip = chip;
}
function deselectString(){
  if(!selString) return;
  (selString.group || selString.path).classList.remove('sel');
  if(selString.chip){ selString.chip.remove(); selString.chip = null; }
  selString = null;
}
function deleteString(rope){
  rope.page.links = (rope.page.links || []).filter(l => l.id !== rope.link.id);
  queueSave(rope.page.id);
  (rope.group || rope.path).remove();
  if(rope.chip) rope.chip.remove();
  ROPES = ROPES.filter(r => r !== rope);
  if(selString === rope) selString = null;
  [[rope.ap, rope.a], [rope.bp, rope.b]].forEach(([pid, id]) => {   // orphaned pins go too
    const pg = BOARD && BOARD.pages.find(p => p.id === pid);
    if(pg && !itemLinked(pg, id)){
      const pin = BOARD.wraps[pid] && BOARD.wraps[pid].querySelector('.item[data-id="' + id + '"] .pin');
      if(pin) pin.remove();
    }
  });
  SND.pluck();
}

/* what the corner of the screen says while the gesture is in the air */
function linkSay(msg){
  const t = $('#saveTag');
  t.textContent = msg;
  t.classList.add('show');
}
/* ---- arming the gesture from the Decor shelf ----
   A tile has no item to start from, so the first click picks one — unless
   something is already selected, in which case that is obviously the one. */
function armLinking(page, kind){
  const one = selectionItems(page);
  if(one.length === 1) return startLinking(page, one[0], kind);
  cancelLinking(); deselectString();
  linking = { page, pageId: page.id, fromId: null, kind: kind === 'arr' ? 'arr' : 'str' };
  document.body.classList.add('linking');
  linkSay(kind === 'arr' ? 'click the item the arrow starts from — esc cancels'
                         : 'click the item to pin — esc cancels');
}
/* A click on the page while the gesture is armed. The first one settles what it
   starts from and hands over to startLinking, so the ghost follows the hand from
   there; the second ties the knot. */
function linkClick(page, itEl){
  if(!linking) return;
  if(!linking.fromId){
    const it = itEl && page.items.find(x => x.id === itEl.dataset.id);
    if(it) startLinking(page, it, linking.kind);
    else cancelLinking();                       // the paper, not an item: give up
    return;
  }
  if(itEl && itEl.dataset.id !== linking.fromId)
    createLink(page, linking.fromId, itEl.dataset.id, linking.kind);
  cancelLinking();
}

function startLinking(page, it, kind){
  cancelLinking(); deselectString();
  linking = { page, pageId: page.id, fromId: it.id, kind: kind === 'arr' ? 'arr' : 'str' };
  document.body.classList.add('linking');
  linkSay(kind === 'arr'
    ? 'click the item the arrow should point at — esc cancels'
    : 'click another item to tie the string — esc cancels');
  if(BOARD && BOARD.wraps[page.id]){
    if(kind !== 'arr'){
      const itEl = BOARD.wraps[page.id].querySelector('.item[data-id="' + it.id + '"]');
      if(itEl) ensurePin(itEl);
    }
    ghost = document.createElementNS(SVGNS, 'path');
    ghost.setAttribute('class', 'ghost');
    ghost.setAttribute('stroke', STRING_COLORS[0]);
    BOARD.svg.appendChild(ghost);
    linking.mv = e => {
      const sr = BOARD.svg.getBoundingClientRect();
      if(!sr.width) return;
      const cur = { x: (e.clientX - sr.left) / sr.width * BOARD.vw,
                    y: (e.clientY - sr.top) / sr.height * BOARD.vh };
      if(linking.kind === 'arr'){
        const bx = itemBox(page.id, it.id);
        if(!bx) return;
        const a = edgePoint(bx, cur);
        ghost.setAttribute('d', 'M' + rd1(a.x) + ' ' + rd1(a.y) + 'L' + rd1(cur.x) + ' ' + rd1(cur.y));
      } else {
        const a = boardAnchor(page.id, it.id);
        if(a) ghost.setAttribute('d', sagPath(a, cur));
      }
    };
    window.addEventListener('pointermove', linking.mv);
  }
}
function cancelLinking(){
  if(!linking) return;
  if(linking.mv) window.removeEventListener('pointermove', linking.mv);
  if(ghost){ ghost.remove(); ghost = null; }
  document.body.classList.remove('linking');
  $('#saveTag').classList.remove('show');
  linking = null;
}
const linkKindOf = l => l.t === 'arr' ? 'arr' : 'str';
function createLink(page, aId, bId, kind){
  page.links = page.links || [];
  const t = kind === 'arr' ? 'arr' : 'str';
  if(aId === bId || page.links.some(l => linkKindOf(l) === t &&
     ((l.a === aId && l.b === bId) || (l.a === bId && l.b === aId)))) return;
  const link = { id: uid(), a: aId, b: bId, c: 0 };
  if(t === 'arr'){ link.t = 'arr'; link.st = index.settings.arrowStyle || 'straight'; }
  page.links.push(link);
  queueSave(page.id);
  if(BOARD && BOARD.wraps[page.id]){
    if(t !== 'arr') [aId, bId].forEach(id => {
      const el = BOARD.wraps[page.id].querySelector('.item[data-id="' + id + '"]');
      if(el) ensurePin(el);
    });
    addRope({ page, link, ap: page.id, a: aId, bp: page.id, b: bId });
    wakeRopes();
  }
  SND.pop();
}
/* rebuild every live rope from the current link records */
function rebuildRopes(){
  if(!BOARD) return;
  deselectString();
  ROPES.forEach(r => { r.path.remove(); if(r.chip) r.chip.remove(); });
  ROPES = [];
  for(const en of BOARD.entries)
    (en.page.links || []).forEach(l =>
      addRope({ page: en.page, link: l, ap: en.page.id, a: l.a, bp: en.page.id, b: l.b }));
  wakeRopes();
}
/* ---- the two tiles on the Decor shelf ----
   Neither makes an item: a string and an arrow are a record in page.links drawn
   between two items, so both entries are `pick` — they arm the gesture and let
   the clicks that follow decide what gets tied to what. `link` is therefore a
   type that never has an item of it, which is why there is no html() here. */
defineItem('link', {
  add: {
    string: { pick: (at, page) => armLinking(page, 'str') },
    arrow:  { pick: (at, page) => armLinking(page, 'arr') }
  }
});
defineTool({ kind:'string', cat:'decor', label:'Pin & string', icon:'pin', order:30,
  hint:'Pin an item and tie a string to another — click one, then the other' });
defineTool({ kind:'arrow', cat:'decor', label:'Arrow', icon:'arrow', order:32,
  hint:'Draw an arrow between two items — click the one it starts from, then the one it points at' });

/* ---- how it looks ---- */
addCSS('strings', `
/* pins & strings (detective board) */
.pin{position:absolute;left:50%;top:calc(var(--scale)*3px);width:calc(var(--scale)*15px);height:calc(var(--scale)*15px);transform:translate(-50%,-50%);border-radius:50%;z-index:30;pointer-events:none;background:radial-gradient(circle at 32% 30%,#ff9c8a,#d84a2f 52%,#801a09 95%);box-shadow:0 calc(var(--scale)*3px) calc(var(--scale)*5px) rgba(0,0,0,.45),inset 0 0 0 1px rgba(0,0,0,.18)}
svg.strings{position:absolute;inset:0;width:100%;height:100%;z-index:200;pointer-events:none;overflow:visible}
svg.strings path{fill:none;stroke-width:2.4;stroke-linecap:round;pointer-events:stroke;cursor:pointer}
svg.strings path.ghost{pointer-events:none;stroke-dasharray:6 5;opacity:.75}
svg.strings path.sel{stroke-width:4;filter:drop-shadow(0 0 2px rgba(255,255,255,.8))}
svg.strings .al{stroke-width:2.6}
svg.strings .ah{pointer-events:auto}
svg.strings g.sel .al{stroke-width:4}
svg.strings g.sel{filter:drop-shadow(0 0 2px rgba(255,255,255,.8))}
.strchip{position:absolute;z-index:210;display:flex;gap:2px;background:var(--ink);border-radius:3px;padding:2px;transform:translate(-50%,-50%)}
.strchip button{font-family:var(--mono);font-size:calc(var(--scale)*11px);line-height:1;color:var(--paper);padding:calc(var(--scale)*4px) calc(var(--scale)*5px);border-radius:2px}
.strchip button:hover{background:var(--accent);color:#fff}
body.linking .surface,body.linking .item{cursor:crosshair}
`);
