/* Open Note — items/logic/circuit.js
   a contained circuit editor: components and their wires inside one page item */

/* ================= the nested model =================
   gate.js evaluates anything page-shaped. A circuit environment exposes its
   nested arrays through that same tiny interface, while `id` remains the real
   parent page id so every edit saves and undoes through the ordinary doors. */
const LC_W = 1000, LC_H = 620, LC_BASE_W = 48, LC_MIN_Z = .4, LC_MAX_Z = 3;
const LC_PICK = new Map();                    // circuit id → {kind:'node'|'wire', id}
const LC_MODE = new Map();                    // circuit id → move | inspect (move is the default)
const LC_RESIZE = new Map();                  // circuit id → its local ResizeObserver
let LC_DRAG = null;                           // the one contained lead currently being pulled

const lcNodes = it => Array.isArray(it.nodes) ? it.nodes : (it.nodes = []);
const lcWires = it => Array.isArray(it.wires) ? it.wires : (it.wires = []);
function lcModel(it, page){
  const m = { id: page.id, env: it, parent: page };
  Object.defineProperty(m, 'items', { get: () => lcNodes(it) });
  Object.defineProperty(m, 'wires', { get: () => lcWires(it), set: v => { it.wires = v; } });
  return m;
}
function lcModels(){
  const out = [];
  for(const page of openPages()) for(const it of page.items || [])
    if(it.type === 'circuit') out.push(lcModel(it, page));
  return out;
}
defineLogicModels(lcModels);
const lcMode = it => LC_MODE.get(it.id) || 'move';
const lcNodeWidth = node => +node.w || 16;
/* The circuit owns a view onto its world, like the molecule and nuclide views.
   Zoom changes only that view: it never resizes the page item. World positions
   stay stable, so wires, dragging, presets and static output share one model. */
function lcView(it){
  return { z:clamp(+it.zoom || 1, LC_MIN_Z, LC_MAX_Z),
    x:Number.isFinite(+it.viewX) ? +it.viewX : 50,
    y:Number.isFinite(+it.viewY) ? +it.viewY : 50 };
}
/* A wider frame reveals more world instead of magnifying it. Below the default
   width density stops at one, so resizing can never enlarge components on its
   own; only the explicit circuit zoom controls may do that. */
const lcDensity = it => Math.min(1, LC_BASE_W / Math.max(LC_BASE_W, +it.w || LC_BASE_W));
const lcViewScale = it => lcView(it).z * lcDensity(it);
function lcWorldStyle(it){
  const v = lcView(it);
  return 'transform:translate(50%,50%) scale(' + lcViewScale(it) + ') translate(' + (-v.x) + '%,' + (-v.y) + '%)';
}
function lcScreenPoint(it, x, y){
  const v = lcView(it), z = lcViewScale(it);
  return { x:50 + (x - v.x) * z, y:50 + (y - v.y) * z };
}
function lcWorldPoint(stage, it, clientX, clientY){
  const r = stage.getBoundingClientRect(), v = lcView(it), z = lcViewScale(it);
  const x = r.width ? (clientX - r.left) / r.width * 100 : 50;
  const y = r.height ? (clientY - r.top) / r.height * 100 : 50;
  return { x:v.x + (x - 50) / z, y:v.y + (y - 50) / z };
}
function lcVisibleBounds(it){
  const v = lcView(it), z = lcViewScale(it);
  return { x0:v.x - 50 / z, x1:v.x + 50 / z,
    y0:v.y - 50 / z, y1:v.y + 50 / z };
}
function lcClampNode(it, node){
  const b = lcVisibleBounds(it);
  node.x = clamp(node.x, b.x0, Math.max(b.x0, b.x1 - lcNodeWidth(node)));
  node.y = clamp(node.y, b.y0, Math.max(b.y0, b.y1 - lcNodeHeight(node)));
  return node;
}
function lcApplyView(outer, it){
  const world = outer && outer.querySelector('.lcworld');
  if(world) world.style.cssText = lcWorldStyle(it);
  const readout = outer && outer.querySelector('[data-lc-act="zoom-reset"]');
  if(readout) readout.textContent = Math.round(lcView(it).z * 100) + '%';
}
function lcSetZoom(outer, it, page, z, clientX, clientY){
  const stage = outer.querySelector('.lcstage'), before = lcView(it);
  const anchor = clientX == null ? { x:before.x, y:before.y }
    : lcWorldPoint(stage, it, clientX, clientY);
  const r = stage.getBoundingClientRect();
  const px = clientX == null || !r.width ? 50 : (clientX - r.left) / r.width * 100;
  const py = clientY == null || !r.height ? 50 : (clientY - r.top) / r.height * 100;
  it.zoom = clamp(z, LC_MIN_Z, LC_MAX_Z);
  const scale = lcViewScale(it);
  it.viewX = anchor.x - (px - 50) / scale;
  it.viewY = anchor.y - (py - 50) / scale;
  lcApplyView(outer,it); lcInspector(outer,it); queueSave(page.id);
}
function lcHomeView(outer, it, page){
  it.zoom = 1; it.viewX = 50; it.viewY = 50;
  lcApplyView(outer,it); lcInspector(outer,it);
  if(page) queueSave(page.id);
}
function lcApplyMode(outer, it){
  const mode = lcMode(it);
  outer.dataset.lcMode = mode;
  outer.querySelectorAll(':scope > .tools [data-lc-mode]').forEach(b => {
    const on = b.dataset.lcMode === mode;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const tidy = outer.querySelector(':scope > .tools [data-lc-act="tidy"]');
  if(tidy) tidy.disabled = lcNodes(it).length < 2;
  const frame = outer.querySelector(':scope > .tools [data-lc-act="frame"]');
  if(frame){
    frame.setAttribute('aria-pressed', it.frame === 0 ? 'false' : 'true');
    frame.classList.toggle('lcframeoff', it.frame === 0);
  }
  const fig = outer.querySelector('.lcenv'); if(fig) fig.classList.toggle('noframe', it.frame === 0);
  lcApplyView(outer,it);
}
function lcSetMode(outer, it, page, mode){
  if(mode !== 'move' && mode !== 'inspect') return;
  LC_MODE.set(it.id, mode);
  if(mode === 'move') lcPick(outer, it, page);
  lcApplyMode(outer, it); lcInspector(outer, it); SND.tick();
}

/* Internal coordinates are percentages, exactly like page items. The wire SVG
   is normalized, so ports can be located from the same symbol geometry without
   measuring the DOM — live, print and export therefore draw identical leads. */
function lcPortPoint(it, port){
  const p = lgPorts(it).find(x => x.port === port);
  if(!p) return null;
  const x = (+it.x || 0) / 100 * LC_W, y = (+it.y || 0) / 100 * LC_H;
  const w = lcNodeWidth(it) / 100 * LC_W;
  return { x: x + p.x / 100 * w, y: y + p.y / 100 * w };
}
function lcNodeHeight(it){ return lcNodeWidth(it) * (LC_W / LC_H) * lgH(it) / 100; }
const lcJointId = w => String(w.from.item) + '-' + String(w.from.port);
function lcWirePath(it, wire, by){
  if(!wire || !wire.from || !wire.to) return '';
  by = by || new Map(lcNodes(it).map(x => [x.id, x]));
  const a = by.get(wire.from.item), b = by.get(wire.to.item);
  const pa = a && lcPortPoint(a, wire.from.port), pb = b && lcPortPoint(b, wire.to.port);
  return pa && pb ? lgPath(pa, pb, a.rot, b.rot, wire.clean, wire.route) : '';
}
function lcWiresHTML(it, model, vals){
  vals = vals || lgEval(model);
  const by = new Map(lcNodes(it).map(x => [x.id, x])), fan = {}, joints = [], joined = new Set();
  lcWires(it).forEach(w => {
    if(!w || !w.from || !w.to) return;
    const k = lcJointId(w); fan[k] = (fan[k] || 0) + 1;
  });
  const paths = lcWires(it).map(w => {
    if(!w || !w.from || !w.to) return '';
    const a = by.get(w.from.item), b = by.get(w.to.item), d = lcWirePath(it, w, by);
    if(!a || !b || !d) return '';
    if(fan[lcJointId(w)] > 1 && !joined.has(lcJointId(w))){
      const p = lcPortPoint(a, w.from.port);
      joined.add(lcJointId(w));
      joints.push({ k: lcJointId(w), p, v: lgWireVal(vals, w) });
    }
    const v = lgWireVal(vals, w);
    return '<g data-w="' + esc(w.id) + '" data-v="' + v + '">' +
      '<path class="lchit" d="' + d + '"/><path class="lcline" d="' + d + '"/>' +
      '<title>' + esc(lgDef(a).name + ' ' + w.from.port + ' → ' + lgDef(b).name + ' ' +
        w.to.port + ' · carrying ' + lgWord(v)) + '</title></g>';
  }).join('');
  return paths + joints.map(x => '<circle class="lcjoint" data-j="' + esc(x.k) +
    '" data-v="' + x.v + '" cx="' + rd1(x.p.x) + '" cy="' + rd1(x.p.y) + '" r="4"/>').join('');
}

function lcNodeHTML(it, model, live, vals, drivers){
  return '<div class="lcnode" data-id="' + esc(it.id) + '" style="left:' + it.x + '%;top:' +
    it.y + '%;width:' + lcNodeWidth(it) + '%;z-index:' + (it.z || 1) + '">' +
    lgHTML(it, { live: !!live, page: model, idx: index, vals, drivers }) + '</div>';
}
function lcRailHTML(){
  return '<aside class="lcrail glass-lite" aria-label="Logic components">' +
    '<header><b>Components</b><small>Drag onto the canvas</small></header>' +
    '<div class="lccatalog">' + LG_PALETTE.map(g =>
    '<section><b>' + esc(g.label) + '</b><div>' + g.kinds.map(k =>
      '<button data-gate="' + k + '" draggable="false" title="Add ' + esc(LG_GATES[k].name) + ' — ' +
        esc(LG_GATES[k].tip) + '" aria-label="Add ' + esc(LG_GATES[k].name) + '">' +
        '<i>' + icn('lg-' + k) + '</i><span>' + esc(LG_GATES[k].name) + '</span></button>').join('') +
      '</div></section>').join('') + '</div></aside>';
}

/* ================= common circuits =================
   Presets are plain component-and-wire data. Loading one goes through the same
   record builder as a palette drop, so examples never become a second logic
   engine or a special rendering path. */
const LC_PRESETS = [
  { id:'half-adder', name:'Half adder', desc:'Two inputs with Sum and Carry outputs', tags:'adder xor and',
    nodes:[['a','sw',4,18,{on:1}],['b','sw',4,62,{on:0}],['sum','xor',42,18],['carry','and',42,62],
      ['sl','lamp',82,18],['cl','lamp',82,62]],
    wires:[['a','q','sum','a'],['b','q','sum','b'],['a','q','carry','a'],['b','q','carry','b'],
      ['sum','q','sl','a'],['carry','q','cl','a']] },
  { id:'full-adder', name:'Full adder', desc:'A, B and carry-in to Sum and carry-out', tags:'adder arithmetic carry',
    nodes:[['a','sw',3,8,{on:1}],['b','sw',3,39,{on:0}],['ci','sw',3,70,{on:1}],
      ['x1','xor',25,15],['x2','xor',50,20],['a1','and',25,55],['a2','and',50,62],['o','or',71,58],
      ['sl','lamp',84,20],['cl','lamp',88,60]],
    wires:[['a','q','x1','a'],['b','q','x1','b'],['x1','q','x2','a'],['ci','q','x2','b'],
      ['a','q','a1','a'],['b','q','a1','b'],['x1','q','a2','a'],['ci','q','a2','b'],
      ['a1','q','o','a'],['a2','q','o','b'],['x2','q','sl','a'],['o','q','cl','a']] },
  { id:'mux-2', name:'2-to-1 multiplexer', desc:'Select one of two data inputs', tags:'mux selector multiplexer',
    nodes:[['a','sw',3,12,{on:1}],['b','sw',3,44,{on:0}],['s','sw',3,76,{on:0}],['ns','not',25,70],
      ['ga','and',48,20],['gb','and',48,60],['out','or',70,40],['lamp','lamp',87,40]],
    wires:[['s','q','ns','a'],['a','q','ga','a'],['ns','q','ga','b'],['b','q','gb','a'],
      ['s','q','gb','b'],['ga','q','out','a'],['gb','q','out','b'],['out','q','lamp','a']] },
  { id:'comparator', name:'1-bit equality', desc:'Lights when A and B match', tags:'comparator equality xnor',
    nodes:[['a','sw',6,22,{on:1}],['b','sw',6,66,{on:1}],['eq','xnor',45,42],['lamp','lamp',82,42]],
    wires:[['a','q','eq','a'],['b','q','eq','b'],['eq','q','lamp','a']] },
  { id:'parity', name:'3-bit parity', desc:'Odd-parity checker for three inputs', tags:'parity xor checker',
    nodes:[['a','sw',4,12,{on:1}],['b','sw',4,44,{on:0}],['c','sw',4,76,{on:1}],
      ['x1','xor',35,26],['x2','xor',62,42],['lamp','lamp',85,42]],
    wires:[['a','q','x1','a'],['b','q','x1','b'],['x1','q','x2','a'],['c','q','x2','b'],['x2','q','lamp','a']] },
  { id:'d-register', name:'D register', desc:'Clocked one-bit storage with Q and Q-bar', tags:'register flip flop memory d',
    nodes:[['d','sw',5,22,{on:1}],['clk','clk',5,68,{paused:true}],['ff','dff',43,40],
      ['q','lamp',82,28],['nq','lamp',82,64]],
    wires:[['d','q','ff','d'],['clk','q','ff','clk'],['ff','q','q','a'],['ff','nq','nq','a']] },
  { id:'t-counter', name:'Toggle counter', desc:'A one-bit counter driven by a clock', tags:'counter toggle t clock',
    nodes:[['one','one',5,20],['clk','clk',5,68,{paused:true}],['ff','tff',43,42],['lamp','lamp',82,42]],
    wires:[['one','q','ff','t'],['clk','q','ff','clk'],['ff','q','lamp','a']] },
  { id:'tri-line', name:'Tri-state line', desc:'Data and enable controls for a high-impedance output', tags:'tri state bus enable',
    nodes:[['a','sw',5,24,{on:1}],['en','sw',5,68,{on:0}],['tri','tri',43,43],['lamp','lamp',82,43]],
    wires:[['a','q','tri','a'],['en','q','tri','en'],['tri','q','lamp','a']] },
  { id:'jk-demo', name:'JK flip-flop', desc:'J, K and clock controls with Q output', tags:'jk flip flop sequential',
    nodes:[['j','sw',4,10,{on:1}],['k','sw',4,42,{on:0}],['clk','clk',4,74,{paused:true}],
      ['ff','jkff',43,40],['q','lamp',82,40]],
    wires:[['j','q','ff','j'],['k','q','ff','k'],['clk','q','ff','clk'],['ff','q','q','a']] }
];
function lcPresetListHTML(q){
  q = String(q || '').trim().toLowerCase();
  const hits = LC_PRESETS.filter(p => !q || (p.name + ' ' + p.desc + ' ' + p.tags).toLowerCase().includes(q));
  if(!hits.length) return '<p class="lcpnone">No matching circuits</p>';
  return hits.map(p => '<button data-preset="' + p.id + '"><b>' + esc(p.name) + '</b><small>' +
    esc(p.desc) + '</small></button>').join('');
}
function lcPresetPanelHTML(){
  return '<div class="lcpresets glass-lite" hidden><header><label>Common circuits' +
    '<input type="search" placeholder="Search half adder, counter…" spellcheck="false"></label>' +
    '<button data-lc-act="close-presets" aria-label="Close circuit search">✕</button></header>' +
    '<div class="lcplist">' + lcPresetListHTML('') + '</div></div>';
}
function lcHTML(it, c){
  const model = lcModel(it, c.page), drivers = lgDriverMap(model), vals = lgEval(model, drivers);
  return '<figure class="body lcenv' + (it.frame === 0 ? ' noframe' : '') +
    '" aria-label="Logic circuit">' +
    (c.live ? lcRailHTML() : '') +
    '<div class="lcstage"><div class="lcworld" style="' + lcWorldStyle(it) + '">' +
      '<svg class="lcwires" viewBox="0 0 ' + LC_W + ' ' + LC_H +
        '" preserveAspectRatio="none">' + lcWiresHTML(it, model, vals) + '</svg>' +
      '<div class="lcnodes">' + lcNodes(it).map(n => lcNodeHTML(n, model, c.live, vals, drivers)).join('') + '</div></div>' +
      (c.live ? '<div class="lcinspect glass-lite" hidden></div>' : '') +
    '</div>' + (c.live ? lcPresetPanelHTML() : '') + '</figure>';
}

/* ================= drawing and local selection ================= */
function lcFindOuter(id){ return document.querySelector('#pageHost .item[data-id="' + id + '"]'); }
function lcDrawWires(outer, it, page, vals){
  const svg = outer && outer.querySelector('.lcwires');
  if(!svg) return;
  const model = lcModel(it, page), by = new Map(lcNodes(it).map(x => [x.id, x]));
  vals = vals || lgEval(model);
  const fan = {}, keep = new Set(), joints = new Map();
  for(const w of lcWires(it)) if(w && w.from && w.to){
    const k = lcJointId(w); fan[k] = (fan[k] || 0) + 1;
  }
  const old = new Map([...svg.querySelectorAll('g[data-w]')].map(g => [g.dataset.w, g]));
  const pick = LC_PICK.get(it.id);
  for(const w of lcWires(it)){
    if(!w || !w.from || !w.to) continue;
    const a = by.get(w.from.item), b = by.get(w.to.item), d = lcWirePath(it, w, by);
    if(!a || !b || !d) continue;
    const id = String(w.id), v = lgWireVal(vals, w); keep.add(id);
    let g = old.get(id);
    if(!g){
      g = document.createElementNS(SVGNS, 'g'); g.setAttribute('data-w', id);
      g.innerHTML = '<path class="lchit"/><path class="lcline"/><title></title>';
      svg.insertBefore(g, svg.querySelector('.lcjoint,.lcghost'));
    }
    g.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    g.setAttribute('data-v', v);
    g.classList.toggle('sel', !!pick && pick.kind === 'wire' && pick.id === w.id);
    g.querySelector('title').textContent = lgDef(a).name + ' ' + w.from.port + ' → ' +
      lgDef(b).name + ' ' + w.to.port + ' · carrying ' + lgWord(v);
    const key = lcJointId(w);
    if(fan[key] > 1 && !joints.has(key))
      joints.set(key, { p:lcPortPoint(a, w.from.port), v });
  }
  old.forEach((g, id) => { if(!keep.has(id)) g.remove(); });

  const oldJoints = new Map([...svg.querySelectorAll('.lcjoint[data-j]')].map(c => [c.dataset.j, c]));
  joints.forEach((rec, key) => {
    let c = oldJoints.get(key);
    if(!c){
      c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('class', 'lcjoint');
      c.setAttribute('data-j', key); c.setAttribute('r', '4');
      svg.insertBefore(c, svg.querySelector('.lcghost'));
    }
    c.setAttribute('data-v', rec.v); c.setAttribute('cx', rd1(rec.p.x)); c.setAttribute('cy', rd1(rec.p.y));
  });
  oldJoints.forEach((c, key) => { if(!joints.has(key)) c.remove(); });
}
function lcPaint(outer, it, page, vals, drivers){
  if(!outer) return;
  const model = lcModel(it, page);
  drivers = drivers || lgDriverMap(model); vals = vals || lgEval(model, drivers);
  outer.querySelectorAll('.lcnode').forEach(el => {
    const node = lcNodes(it).find(x => x.id === el.dataset.id);
    if(node) lgPaint(el, node, model, vals, drivers);
  });
  lcDrawWires(outer, it, page, vals);
  lcApplyMode(outer, it);
  lcInspector(outer, it);
}
function lcSync(){
  document.querySelectorAll('#pageHost .item[data-type="circuit"]').forEach(outer => {
    const page = pageOfEl(outer), it = page && page.items.find(x => x.id === outer.dataset.id);
    if(it) lcPaint(outer, it, page);
  });
}
defineLogicSync(lcSync);

function lcPick(outer, it, page, kind, id){
  if(kind && id) LC_PICK.set(it.id, { kind, id }); else LC_PICK.delete(it.id);
  outer.querySelectorAll('.lcnode').forEach(n => n.classList.toggle('sel',
    kind === 'node' && n.dataset.id === id));
  lcDrawWires(outer, it, page);
  lcInspector(outer, it);
}
function lcInspector(outer, it){
  const box = outer.querySelector('.lcinspect'); if(!box) return;
  const pick = LC_PICK.get(it.id);
  const visible = lcMode(it) === 'inspect' && outer.classList.contains('sel') && !!pick;
  box.hidden = !visible;
  if(!visible) return;
  if(pick.kind === 'wire'){
    const wire = lcWires(it).find(w => w && w.id === pick.id);
    if(!wire){ LC_PICK.delete(it.id); box.hidden = true; return; }
    const html = '<span>Lead</span><button data-act="delete-wire" title="Remove this lead">✕</button>';
    if(box.innerHTML !== html) box.innerHTML = html;
    const path = outer.querySelector('.lcwires g[data-w="' + pick.id + '"] .lcline');
    if(path){ const p = path.getPointAtLength(path.getTotalLength() / 2);
      const q = lcScreenPoint(it, p.x / LC_W * 100, p.y / LC_H * 100);
      box.style.left = clamp(q.x,4,96) + '%'; box.style.top = clamp(q.y,4,96) + '%'; }
    return;
  }
  const node = lcNodes(it).find(n => n.id === pick.id);
  if(!node){ LC_PICK.delete(it.id); box.hidden = true; return; }
  const g = lgDef(node), parts = ['<span>' + esc(g.name) + '</span>'];
  if(lgKind(node) === 'sw') parts.push('<button data-act="look" title="Lever, rocker or plain 0/1">Style</button>');
  if(lgKind(node) === 'clk'){
    parts.push('<button data-act="clock" title="' + (node.paused ? 'Run' : 'Pause') + ' the clock">' +
      (node.paused ? 'Run' : 'Pause') + '</button>');
    parts.push('<button data-act="speed" title="Clock speed">' + lgClockHz(node) + 'Hz</button>');
  }
  if(g.seq) parts.push('<button data-act="state" title="Set stored Q manually">Q=' + lgNumeral(node, node.q) + '</button>');
  if(g.ins.length && g.table) parts.push('<button data-act="table" title="Open this component’s truth table">Truth table</button>');
  parts.push('<button data-act="unplug" title="Unplug this component">Unplug</button>',
    '<button data-act="copy" title="Duplicate this component">Copy</button>',
    '<button data-act="delete-node" title="Delete this component">Delete</button>');
  const html = parts.join('');
  if(box.innerHTML !== html) box.innerHTML = html;
  const mid = lcScreenPoint(it, node.x + lcNodeWidth(node) / 2, node.y + lcNodeHeight(node) / 2);
  const top = lcScreenPoint(it, node.x, node.y), bottom = lcScreenPoint(it,node.x,node.y + lcNodeHeight(node));
  box.style.left = clamp(mid.x, 9, 91) + '%';
  box.style.top = clamp(top.y < 14 ? bottom.y + 3 : top.y - 3, 4, 94) + '%';
}

/* Rebuild component markup only when its shape or membership changed. Values
   repaint in place through lcPaint(), preserving focused ports and gestures. */
function lcRefresh(outer, it, page){
  const model = lcModel(it, page), box = outer.querySelector('.lcnodes'), drivers = lgDriverMap(model);
  const vals = lgEval(model, drivers);
  if(!box) return;
  box.innerHTML = lcNodes(it).map(n => lcNodeHTML(n, model, true, vals, drivers)).join('');
  lcBindNodes(outer, it, page);
  lcPaint(outer, it, page, vals, drivers);
}
function lcCloseTruthFor(nodes){
  if(LG_TT && nodes.some(node => node === LG_TT.it)) lgTTClose();
}
defineLogicRedraw((node, model) => {
  const env = model && model.env, page = model && model.parent;
  if(!env || !page || !lcNodes(env).some(n => n.id === node.id)) return false;
  const outer = lcFindOuter(env.id);
  if(outer) lcRefresh(outer, env, page);
  return true;
});

/* ================= adding, moving and operating components ================= */
function lcOpenSlot(it){
  const b = lcVisibleBounds(it), stepX = 19, stepY = 23;
  const pad = 3 / lcViewScale(it), cols = Math.max(1, Math.floor((b.x1 - b.x0 - pad * 2) / stepX));
  const rows = Math.max(1, Math.floor((b.y1 - b.y0 - pad * 2) / stepY));
  for(let i = 0; i < cols * rows; i++){
    const x = b.x0 + pad + (i % cols) * stepX, y = b.y0 + pad + (Math.floor(i / cols) % rows) * stepY;
    if(!lcNodes(it).some(n => Math.abs(n.x - x) < 8 && Math.abs(n.y - y) < 8)) return { x, y };
  }
  return { x:b.x0 + pad + Math.random() * Math.max(1,b.x1-b.x0-20),
    y:b.y0 + pad + Math.random() * Math.max(1,b.y1-b.y0-20) };
}
function lcAdd(outer, it, page, kind, drop){
  if(!LG_GATES[kind]) return;
  const at = drop || lcOpenSlot(it), node = lgMake(kind,
    { id: uid(), x: at.x, y: at.y, z: lcNodes(it).length + 1 });
  node.w = LG_GATES[kind].seq || kind === 'digit' ? 18 : 16;
  lcClampNode(it,node);
  it.nodes.push(node);
  if(lcMode(it) === 'inspect') LC_PICK.set(it.id, { kind: 'node', id: node.id });
  else LC_PICK.delete(it.id);
  queueSave(page.id); lcRefresh(outer, it, page); lgClockArm(); SND.pop();
}
function lcPaletteDrag(e, outer, env, page, button){
  const kind = button.dataset.gate; if(!kind || e.button > 0) return;
  e.stopPropagation();
  const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
  let dragging = false, ghost = null;
  try{ button.setPointerCapture(pid); }catch(err){}
  const place = ev => {
    if(!ghost) return;
    ghost.style.transform = 'translate(' + (ev.clientX + 12) + 'px,' + (ev.clientY + 12) + 'px)';
  };
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    if(!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
    if(!dragging){
      dragging = true; button.classList.add('dragging');
      ghost = document.createElement('div'); ghost.className = 'lcdnd glass-lite';
      ghost.innerHTML = icn('lg-' + kind) + '<span>' + esc(LG_GATES[kind].name) + '</span>';
      document.body.appendChild(ghost); outer.querySelector('.lcstage').classList.add('lcdropping');
    }
    ev.preventDefault();
    place(ev);
  };
  const end = ev => {
    if(ev.pointerId !== pid) return;
    button.removeEventListener('pointermove', mv); button.removeEventListener('pointerup', end);
    button.removeEventListener('pointercancel', cancel); button.classList.remove('dragging');
    const stage = outer.querySelector('.lcstage'); stage.classList.remove('lcdropping');
    if(ghost) ghost.remove();
    if(!dragging) return;
    button._lcDragged = true;
    const r = stage.getBoundingClientRect();
    if(ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom){
      const probe = { w:LG_GATES[kind].seq || kind === 'digit' ? 18 : 16 };
      const w = lcNodeWidth(probe), h = lcNodeHeight({ ...probe, gate:kind, type:'logic' });
      const at = lcWorldPoint(stage,env,ev.clientX,ev.clientY);
      lcAdd(outer,env,page,kind,{ x:at.x-w/2, y:at.y-h/2 });
    }
    setTimeout(() => { button._lcDragged = false; }, 0);
  };
  const cancel = ev => {
    if(ev.pointerId !== pid) return;
    button.removeEventListener('pointermove', mv); button.removeEventListener('pointerup', end);
    button.removeEventListener('pointercancel', cancel); button.classList.remove('dragging');
    outer.querySelector('.lcstage').classList.remove('lcdropping'); if(ghost) ghost.remove();
  };
  button.addEventListener('pointermove', mv); button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', cancel);
}
/* The body is the handle. In Move mode it follows the pointer 1:1; a gesture
   that never crosses the drag threshold remains a switch/clock tap or a held
   push button. Inspector mode uses the same body tap to reveal local actions. */
function lcNodePointer(e, outer, env, page, node, body){
  if(e.target.closest('.lgp')) return;
  e.preventDefault(); e.stopPropagation();
  if(lcMode(env) === 'inspect'){
    if(!outer.classList.contains('sel')) select(env.id);
    lcPick(outer, env, page, 'node', node.id);
    return;
  }
  if(outer._lcTidy) outer._lcTidy();
  if(LC_PICK.has(env.id)) lcPick(outer, env, page);
  const model = lcModel(env, page), stage = outer.querySelector('.lcstage');
  const r = stage.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
  const ox = node.x, oy = node.y, pid = e.pointerId, kind = lgKind(node);
  const control = kind === 'sw' && e.target.closest('.lgsw') ? 'switch' :
    kind === 'clk' && e.target.closest('.lgclock') ? 'clock' :
    kind === 'btn' && e.target.closest('.lgpress') ? 'button' : '';
  let moved = false, pressed = false;
  if(control === 'button'){ lgPress(node, model, true); pressed = true; }
  try{ body.setPointerCapture(pid); }catch(err){}
  const releaseButton = () => {
    if(pressed){ pressed = false; lgPress(node, model, false); }
  };
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    if(!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
    if(!moved){ moved = true; releaseButton(); body.classList.add('lcdragging'); }
    const z = lcViewScale(env);
    node.x = ox + (ev.clientX - sx) / r.width * 100 / z;
    node.y = oy + (ev.clientY - sy) / r.height * 100 / z;
    lcClampNode(env,node);
    const el = outer.querySelector('.lcnode[data-id="' + node.id + '"]');
    if(el){ el.style.left = node.x + '%'; el.style.top = node.y + '%'; }
    lcDrawWires(outer, env, page);
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    body.removeEventListener('pointermove', mv); body.removeEventListener('pointerup', up);
    body.removeEventListener('pointercancel', cancel); body.classList.remove('lcdragging');
    if(moved){ queueSave(page.id); SND.plop(); }
    else if(control === 'switch') lgToggle(node, model);
    else if(control === 'clock') lgPauseClock(node, model);
    releaseButton();
  };
  const cancel = ev => {
    if(ev.pointerId !== pid) return;
    body.removeEventListener('pointermove', mv); body.removeEventListener('pointerup', up);
    body.removeEventListener('pointercancel', cancel); body.classList.remove('lcdragging');
    releaseButton(); if(moved) queueSave(page.id);
  };
  body.addEventListener('pointermove', mv); body.addEventListener('pointerup', up);
  body.addEventListener('pointercancel', cancel);
}
/* Empty canvas is the circuit's hand tool. It pans the local world without
   moving or resizing the page item; a click still clears the local selection. */
function lcStagePointer(e, outer, env, page, stage){
  if(e.button || e.target !== stage || !outer.classList.contains('sel')) return;
  e.preventDefault(); e.stopPropagation(); lcPresetClose(outer);
  if(outer._lcTidy) outer._lcTidy();
  const sx = e.clientX, sy = e.clientY, start = lcView(env), scale = lcViewScale(env);
  const r = stage.getBoundingClientRect();
  const pid = e.pointerId; let moved = false;
  try{ stage.setPointerCapture(pid); }catch(err){}
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if(!moved && Math.hypot(dx,dy) < 7) return;
    if(!moved){ moved = true; stage.classList.add('lcpanning'); }
    env.viewX = start.x - dx / r.width * 100 / scale;
    env.viewY = start.y - dy / r.height * 100 / scale;
    lcApplyView(outer,env); lcInspector(outer,env);
  };
  const end = ev => {
    if(ev.pointerId !== pid) return;
    stage.removeEventListener('pointermove',mv); stage.removeEventListener('pointerup',end);
    stage.removeEventListener('pointercancel',end); stage.classList.remove('lcpanning');
    if(moved) queueSave(page.id); else lcPick(outer,env,page);
  };
  stage.addEventListener('pointermove',mv); stage.addEventListener('pointerup',end);
  stage.addEventListener('pointercancel',end);
}
function lcBindControlKeys(env, page, node, el){
  const model = lcModel(env, page), tap = el.querySelector('.lgsw,.lgclock');
  if(tap) tap.addEventListener('keydown', e => {
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation();
      lgKind(node) === 'sw' ? lgToggle(node, model) : lgPauseClock(node, model); }
  });
  const btn = el.querySelector('.lgbtn');
  if(btn){
    btn.addEventListener('keydown', e => {
      if((e.key === 'Enter' || e.key === ' ') && !e.repeat){
        e.preventDefault(); e.stopPropagation(); lgPress(node, model, true); }
    });
    btn.addEventListener('keyup', e => {
      if((e.key === 'Enter' || e.key === ' ') && node.on){
        e.preventDefault(); e.stopPropagation(); lgPress(node, model, false); }
    });
    btn.addEventListener('blur', () => { if(node.on) lgPress(node, model, false); });
  }
}

/* ================= pulling a lead inside the environment ================= */
function lcStartWire(e, outer, env, page, node, port, dir){
  if(e.button || !outer.classList.contains('sel')) return;
  e.preventDefault(); e.stopPropagation();
  if(LC_DRAG) lcCancelWire();
  const model = lcModel(env, page), svg = outer.querySelector('.lcwires');
  let anchor = { item:node.id, port }, want = dir === 'out' ? 'in' : 'out', detached = null;
  if(dir === 'in'){
    const had = lgFindWire(model, node.id, port);
    if(had){ anchor = { ...had.from }; want = 'in'; detached = had; lgDisconnect(model, had, true); }
  }
  const ghost = document.createElementNS(SVGNS, 'path'); ghost.setAttribute('class', 'lcghost'); svg.appendChild(ghost);
  outer.querySelectorAll('.lcnode .lgp').forEach(p => {
    if(p.dataset.dir === want && p.closest('.lcnode').dataset.id !== anchor.item) p.classList.add('lgok');
  });
  const pid = e.pointerId;
  const clear = () => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    ghost.remove(); outer.querySelectorAll('.lcnode .lgp').forEach(p => p.classList.remove('lgok','lgaim'));
    if(LC_DRAG && LC_DRAG.pid === pid) LC_DRAG = null;
  };
  const mv = ev => {
    if(ev.pointerId !== pid) return;
    const r = svg.getBoundingClientRect();
    const cur = { x:(ev.clientX - r.left) / r.width * LC_W, y:(ev.clientY - r.top) / r.height * LC_H };
    const src = lcNodes(env).find(n => n.id === anchor.item), a = src && lcPortPoint(src, anchor.port);
    if(a) ghost.setAttribute('d', want === 'in' ? lgPath(a, cur, src.rot, 0) : lgPath(cur, a, 0, src.rot));
    outer.querySelectorAll('.lcnode .lgp.lgaim').forEach(p => p.classList.remove('lgaim'));
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const aim = hit && hit.closest && hit.closest('.lcnode .lgp[data-dir="' + want + '"]');
    if(aim && aim.closest('.lcstage') === outer.querySelector('.lcstage') &&
       aim.closest('.lcnode').dataset.id !== anchor.item) aim.classList.add('lgaim');
  };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    clear();
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const aim = hit && hit.closest && hit.closest('.lcnode .lgp[data-dir="' + want + '"]');
    if(!aim || aim.closest('.lcstage') !== outer.querySelector('.lcstage')) return void lcPaint(outer, env, page);
    const target = { item:aim.closest('.lcnode').dataset.id, port:aim.dataset.p };
    const from = want === 'in' ? anchor : target, to = want === 'in' ? target : anchor;
    if(lgConnect(model, from, to)){
      const w = lgFindWire(model, to.item, to.port);
      if(w) LC_PICK.set(env.id, { kind:'wire', id:w.id });
    }
    lcPaint(outer, env, page);
  };
  const cancel = ev => { if(ev.pointerId === pid) lcCancelWire(); };
  LC_DRAG = { outer, env, page, model, detached, ghost, pid, mv, up, cancel, clear };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}

function lcCancelWire(){
  const drag = LC_DRAG; if(!drag) return false;
  drag.clear();
  if(drag.detached && !lgWires(drag.model).some(w => w && w.id === drag.detached.id)){
    drag.model.wires = lgWires(drag.model).concat([drag.detached]);
    lgAdvance(drag.model); queueSave(drag.page.id); lgSync(); lgWake();
  } else lcPaint(drag.outer, drag.env, drag.page);
  return true;
}

function lcBindNodes(outer, env, page){
  outer.querySelectorAll('.lcnode').forEach(el => {
    const node = lcNodes(env).find(n => n.id === el.dataset.id); if(!node) return;
    el.querySelectorAll('.lgp').forEach(p => p.addEventListener('pointerdown', e =>
      lcStartWire(e, outer, env, page, node, p.dataset.p, p.dataset.dir)));
    lcBindControlKeys(env, page, node, el);
    const body = el.querySelector('.lgw');
    body.addEventListener('pointerdown', e => lcNodePointer(e, outer, env, page, node, body));
  });
}

function lcInspectAct(outer, env, page, act, anchor){
  const pick = LC_PICK.get(env.id), model = lcModel(env, page);
  if(!pick) return;
  if(act === 'delete-wire'){
    const wire = lcWires(env).find(w => w && w.id === pick.id); if(wire) lgDisconnect(model, wire);
    LC_PICK.delete(env.id); return void lcPaint(outer, env, page);
  }
  const node = lcNodes(env).find(n => n.id === pick.id); if(!node) return;
  if(act === 'look') node.look = LG_LOOKS[(LG_LOOKS.indexOf(node.look || 'lever') + 1) % LG_LOOKS.length];
  else if(act === 'table') return void lgTTOpen(node, model, anchor);
  else if(act === 'clock') return void lgPauseClock(node, model);
  else if(act === 'speed'){
    const hz = [.5,1,2,4], at = hz.indexOf(lgClockHz(node));
    node.on = lgClockValue(node); node.hz = hz[(at + 1) % hz.length]; LG_CLOCK.delete(node.id); lgAdvance(model); lgClockArm();
  } else if(act === 'state'){ node.q = node.q === LG_1 ? LG_0 : LG_1; lgAdvance(model); }
  else if(act === 'unplug') return void lgUnplugAll(model, node);
  else if(act === 'copy'){
    const copy = { ...node, id:uid(), x:node.x + 4, y:node.y + 5, z:lcNodes(env).length + 1,
      def:node.def ? { ...node.def, table:(node.def.table || []).slice() } : undefined };
    lcClampNode(env,copy);
    if(!copy.def) delete copy.def;
    env.nodes.push(copy); LC_PICK.set(env.id, { kind:'node', id:copy.id });
  } else if(act === 'delete-node'){
    lcCloseTruthFor([node]);
    env.nodes = lcNodes(env).filter(n => n.id !== node.id);
    env.wires = lcWires(env).filter(w => !w || !w.from || !w.to ||
      (w.from.item !== node.id && w.to.item !== node.id));
    LG_CLOCK.delete(node.id); LC_PICK.delete(env.id);
  }
  queueSave(page.id); lcRefresh(outer, env, page); lgSync(); lgClockArm(); SND.tick();
}

function lcPresetBuild(preset){
  const by = new Map(), nodes = preset.nodes.map(row => {
    const [key, kind, x, y, extra] = row;
    const node = lgMake(kind, { id:uid(), x, y, z:by.size + 1 });
    node.w = LG_GATES[kind].seq || kind === 'digit' ? 18 : 16;
    Object.assign(node, extra || {});
    node.x = clamp(node.x, 0, 100 - lcNodeWidth(node));
    node.y = clamp(node.y, 0, 100 - lcNodeHeight(node));
    by.set(key,node); return node;
  });
  const wires = preset.wires.map(row => ({ id:uid(),
    from:{ item:by.get(row[0]).id, port:row[1] }, to:{ item:by.get(row[2]).id, port:row[3] } }));
  return { nodes, wires };
}
function lcPresetClose(outer){
  const panel = outer.querySelector('.lcpresets'); if(!panel) return;
  panel.hidden = true;
  if(panel.contains(document.activeElement)) document.activeElement.blur();
}
function lcPresetOpen(outer){
  const panel = outer.querySelector('.lcpresets'); if(!panel) return;
  panel.hidden = !panel.hidden;
  if(!panel.hidden){
    const input = panel.querySelector('input'); input.value = '';
    panel.querySelector('.lcplist').innerHTML = lcPresetListHTML('');
    input.focus({ preventScroll:true });
  }
}
function lcPresetLoad(outer, env, page, id){
  const preset = LC_PRESETS.find(p => p.id === id); if(!preset) return;
  if(lcNodes(env).length && !confirm('Replace this circuit with “' + preset.name + '”?')) return;
  lcCloseTruthFor(lcNodes(env));
  lcNodes(env).forEach(n => LG_CLOCK.delete(n.id));
  const built = lcPresetBuild(preset); env.nodes = built.nodes; env.wires = built.wires;
  env.zoom = 1; env.viewX = 50; env.viewY = 50;
  LC_PICK.delete(env.id); LC_MODE.set(env.id,'move'); lcPresetClose(outer);
  queueSave(page.id); lcRefresh(outer,env,page); lgClockArm();
  lgSay(preset.name + ' loaded'); SND.pop();
}
function lcBindPresets(outer, env, page){
  const panel = outer.querySelector('.lcpresets'); if(!panel) return;
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  panel.addEventListener('wheel', e => e.stopPropagation(), { passive:true });
  const input = panel.querySelector('input'), list = panel.querySelector('.lcplist');
  input.addEventListener('input', () => { list.innerHTML = lcPresetListHTML(input.value); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); lcPresetClose(outer); }
    if(e.key === 'Enter'){
      const first = list.querySelector('[data-preset]');
      if(first){ e.preventDefault(); lcPresetLoad(outer,env,page,first.dataset.preset); }
    }
  });
  panel.addEventListener('click', e => {
    const close = e.target.closest('[data-lc-act="close-presets"]');
    const pick = e.target.closest('[data-preset]');
    if(close) lcPresetClose(outer); else if(pick) lcPresetLoad(outer,env,page,pick.dataset.preset);
  });
}

/* ================= tidy the whole contained circuit ================= */
function lcTidy(outer, env, page){
  const nodes = lcNodes(env); if(nodes.length < 2) return;
  env.zoom = 1; env.viewX = 50; env.viewY = 50; lcApplyView(outer,env);
  const c = { items:nodes, wires:lcWires(env), ids:new Set(nodes.map(n => n.id)) }, rank = lgCircuitRanks(c);
  const groups = new Map();
  nodes.forEach(n => { const r = rank.get(n.id); if(!groups.has(r)) groups.set(r, []); groups.get(r).push(n); });
  const cols = [...groups].sort((a,b) => a[0]-b[0]).map(x => x[1].sort((a,b) => a.y-b.y));
  const widths = cols.map(col => Math.max(...col.map(lcNodeWidth)));
  const sum = widths.reduce((a,b) => a+b,0);
  const gapX = cols.length < 2 ? 0 : clamp((96 - sum) / (cols.length - 1), 2, 7);
  const total = sum + gapX * (cols.length - 1), targets = [];
  let x = clamp(50 - total / 2, 2, Math.max(2, 98 - total));
  cols.forEach((col, ci) => {
    const heights = col.map(lcNodeHeight);
    const h = heights.reduce((a,b) => a+b,0) + (col.length - 1) * 3;
    let y = clamp(50 - h / 2, 2, Math.max(2, 98 - h));
    col.forEach((n,i) => { targets.push({ n, x:x + (widths[ci]-lcNodeWidth(n))/2, y }); y += heights[i] + 3; });
    x += widths[ci] + gapX;
  });
  lcWires(env).forEach(w => { if(w){ w.clean = 1; w.route = 0; } });
  let left = targets.length * 2, done = false; const moves = [];
  const finish = () => { if(done) return; done = true; outer._lcTidy = null;
    queueSave(page.id); lcPaint(outer, env, page); lgSay('circuit tidied'); SND.plop(); };
  const rest = () => { if(--left === 0) finish(); };
  targets.forEach(t => {
    t.n.rot = 0;
    const el = outer.querySelector('.lcnode[data-id="' + t.n.id + '"]');
    const sx = spring({ from:t.n.x, damping:1, response:.4, rest:.025,
      onUpdate:v => { t.n.x=v; if(el) el.style.left=v+'%'; lcDrawWires(outer,env,page); }, onRest:rest });
    const sy = spring({ from:t.n.y, damping:1, response:.4, rest:.025,
      onUpdate:v => { t.n.y=v; if(el) el.style.top=v+'%'; lcDrawWires(outer,env,page); }, onRest:rest });
    moves.push({ sx, sy, t });
  });
  outer._lcTidy = () => { if(done) return; moves.forEach(m => { m.sx.stopAt(); m.sy.stopAt(); }); finish(); };
  moves.forEach(m => { m.sx.to(m.t.x); m.sy.to(m.t.y); });
}

function lcKey(e){
  if(e.key !== 'Delete' && e.key !== 'Backspace' && e.key !== 'Escape') return false;
  if(e.key === 'Escape' && lcCancelWire()){
    e.preventDefault(); e.stopPropagation(); return true;
  }
  const outer = document.querySelector('#pageHost .item[data-type="circuit"].sel');
  if(!outer) return false;
  const page = pageOfEl(outer), env = page && page.items.find(x => x.id === outer.dataset.id);
  const pick = env && LC_PICK.get(env.id); if(!pick) return false;
  e.preventDefault(); e.stopPropagation();
  if(e.key === 'Escape') lcPick(outer, env, page);
  else lcInspectAct(outer, env, page, pick.kind === 'wire' ? 'delete-wire' : 'delete-node');
  return true;
}

/* ================= the page item ================= */
defineItem('circuit', {
  add: { circuit: base => ({ ...base, type:'circuit', w:LC_BASE_W, frame:1,
    zoom:1, viewX:50, viewY:50, nodes:[], wires:[], cap:'' }) },
  sound: 'pop',
  key: lcKey,
  html: lcHTML,
  wire(outer, it, page){
    const rail = outer.querySelector('.lcrail'), stage = outer.querySelector('.lcstage');
    if(rail){
      rail.addEventListener('pointerdown', e => {
        e.stopPropagation(); const gate = e.target.closest('[data-gate]');
        if(gate) lcPaletteDrag(e,outer,it,page,gate);
      });
      rail.addEventListener('wheel', e => e.stopPropagation(), { passive:true });
      rail.addEventListener('click', e => {
        const gate = e.target.closest('[data-gate]');
        if(gate && !gate._lcDragged) lcAdd(outer,it,page,gate.dataset.gate);
      });
    }
    lcBindPresets(outer,it,page);
    if(stage){
      stage.addEventListener('pointerdown', e => lcStagePointer(e,outer,it,page,stage));
      stage.addEventListener('wheel', e => {
        if(e.ctrlKey || e.metaKey || !outer.classList.contains('sel')) return;
        e.preventDefault(); e.stopPropagation();
        lcSetZoom(outer,it,page,lcView(it).z * Math.exp(-clamp(wheelPx(e),-120,120) * .0015),
          e.clientX,e.clientY);
      }, { passive:false });
      stage.addEventListener('dblclick', e => {
        if(e.target.closest('.lcnode,.lcinspect')) return;
        e.preventDefault(); e.stopPropagation(); lcHomeView(outer,it,page); SND.pop();
      });
      const ins = stage.querySelector('.lcinspect');
      if(ins){ ins.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
        ins.addEventListener('click', e => { const b=e.target.closest('[data-act]');
          if(b) lcInspectAct(outer,it,page,b.dataset.act,b); }); }
      const wires = stage.querySelector('.lcwires');
      wires.addEventListener('pointerdown', e => {
        if(outer.classList.contains('sel') && lcMode(it) === 'inspect' && e.target.closest('g[data-w]'))
          e.stopPropagation();
      });
      wires.addEventListener('click', e => { const g=e.target.closest('g[data-w]');
        if(outer.classList.contains('sel') && lcMode(it) === 'inspect' && g){
          e.stopPropagation(); lcPick(outer,it,page,'wire',g.dataset.w);
        }
      });
    }
    const prior = LC_RESIZE.get(it.id); if(prior) prior.disconnect();
    if(typeof ResizeObserver !== 'undefined'){
      const observer = new ResizeObserver(() => {
        if(!outer.isConnected) return;
        lcApplyView(outer,it); lcInspector(outer,it);
      });
      observer.observe(outer); LC_RESIZE.set(it.id,observer);
    }
    lcBindNodes(outer,it,page); lcApplyMode(outer,it); lcPaint(outer,it,page); lgClockArm();
  },
  after(it){ LC_PICK.delete(it.id); LC_MODE.delete(it.id); },
  tools(mk, it, outer, page){
    const mode = (label, title, id) => {
      const b = mk(label,title,() => lcSetMode(outer,it,page,id));
      b.dataset.lcMode = id; b.setAttribute('aria-pressed', lcMode(it) === id ? 'true' : 'false');
      return b;
    };
    const act = (label, title, id, fn) => {
      const b = mk(label,title,fn); b.dataset.lcAct = id; return b;
    };
    const canvasMove = act('✥','Drag to move the whole circuit canvas','move-canvas',() => {});
    canvasMove.addEventListener('pointerdown', e => startDrag(e,it,outer,page));
    mode('↔','Move components directly','move');
    mode('⌕','Inspect a component, its style or truth table','inspect');
    act('⇥','Tidy the circuit and its leads','tidy',() => lcTidy(outer,it,page));
    act('−','Zoom circuit out','zoom-out',() => lcSetZoom(outer,it,page,lcView(it).z / 1.25));
    act(Math.round(lcView(it).z * 100) + '%','Reset circuit view to 100%','zoom-reset',() => {
      lcHomeView(outer,it,page); SND.tick();
    });
    act('+','Zoom circuit in','zoom-in',() => lcSetZoom(outer,it,page,lcView(it).z * 1.25));
    const frame = act('▣','Show or hide the canvas surface','frame',() => {
      it.frame = it.frame === 0 ? 1 : 0; lcApplyMode(outer,it); queueSave(page.id); SND.tick();
    });
    frame.setAttribute('aria-pressed', it.frame === 0 ? 'false' : 'true');
    act('▦','Search and load a common circuit','presets',() => lcPresetOpen(outer));
    act('⌫','Remove every component and lead from this circuit','clear',() => {
      if(!lcNodes(it).length || confirm('Clear this circuit?')){
        lcCloseTruthFor(lcNodes(it));
        lcNodes(it).forEach(n => LG_CLOCK.delete(n.id)); it.nodes=[]; it.wires=[]; LC_PICK.delete(it.id);
        queueSave(page.id); lcRefresh(outer,it,page); SND.pluck();
      }
    });
  },
  forget(it){
    if(it.type !== 'circuit') return;
    if(LC_DRAG && LC_DRAG.env === it) lcCancelWire();
    const observer = LC_RESIZE.get(it.id); if(observer) observer.disconnect(); LC_RESIZE.delete(it.id);
    lcCloseTruthFor(lcNodes(it));
    lcNodes(it).forEach(n => LG_CLOCK.delete(n.id)); LC_PICK.delete(it.id); LC_MODE.delete(it.id);
  },
  icon: it => '<svg viewBox="0 0 100 64" fill="none" stroke="currentColor" stroke-width="3" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="8" width="86" height="48" rx="5"/>' +
    '<path d="M18 24h14M46 24h14M74 24h9M18 42h20M54 42h29"/><path d="M32 16h14v16H32zM38 42l16-9v18z"/></svg>',
  label: () => 'Logic circuit',
  meta: it => lcNodes(it).length + (lcNodes(it).length === 1 ? ' component' : ' components') +
    ' · ' + lcWires(it).length + (lcWires(it).length === 1 ? ' lead' : ' leads'),
  css: `
/* ---------- contained logic circuit ---------- */
.lcenv{position:relative;padding:calc(var(--scale)*8px);border-radius:calc(var(--scale)*5px);
  transition:background .16s,box-shadow .16s}
.item[data-type="circuit"] > .rot{display:none}
.item[data-type="circuit"] > .tools{max-width:min(760px,92vw);flex-wrap:wrap}
.item[data-type="circuit"] > .tools [data-lc-act="zoom-reset"]{min-width:calc(var(--scale)*44px);
  font-variant-numeric:tabular-nums}
.item[data-type="circuit"] > .tools button.on{background:var(--accent);color:#fff}
.item[data-type="circuit"] > .tools button:disabled{opacity:.32;cursor:not-allowed}
.item[data-type="circuit"] > .tools button.lcframeoff{color:var(--accent2);outline:1px dashed currentColor}
.lcstage{position:relative;aspect-ratio:${LC_W}/${LC_H};overflow:hidden;border-radius:calc(var(--scale)*4px);
  background:color-mix(in srgb,var(--paper) 89%,var(--line));box-shadow:inset 0 0 0 1px var(--line);
  transition:background .16s,box-shadow .16s;cursor:default}
.item.sel[data-type="circuit"] .lcstage{cursor:grab}
.item.sel[data-type="circuit"] .lcstage.lcpanning{cursor:grabbing}
.lcenv.noframe{background:transparent!important;box-shadow:none!important}
.lcenv.noframe .lcstage{background:transparent;box-shadow:none}
.lcstage.lcdropping{background:color-mix(in srgb,var(--paper) 82%,var(--accent2));
  box-shadow:inset 0 0 0 2px var(--accent2)}
.lcworld{position:absolute;inset:0;transform-origin:0 0;pointer-events:none;will-change:transform}
.lcnodes{position:absolute;inset:0;z-index:2;pointer-events:none}
.lcnode{position:absolute;pointer-events:auto;touch-action:none}
.lcnode .lgw figcaption{display:none}
.lcnode .lgsvg{filter:drop-shadow(0 calc(var(--scale)*1px) calc(var(--scale)*1px) rgba(0,0,0,.08))}
.lcnode.sel .lgsvg{filter:drop-shadow(0 0 calc(var(--scale)*3px) var(--accent2))}
.item[data-lc-mode="move"] .lcnode .lgw{cursor:grab}
.item[data-lc-mode="move"] .lcnode .lgw.lcdragging{cursor:grabbing;opacity:.88}
.item[data-lc-mode="inspect"] .lcnode .lgw{cursor:pointer}
.item[data-type="circuit"] .lcnode .lgp{cursor:crosshair}
.lcwires{position:absolute;inset:0;width:100%;height:100%;z-index:1;overflow:visible;pointer-events:none}
.lcwires path{fill:none}.lcwires .lcline{stroke:var(--soft);stroke-width:2.2;stroke-linecap:round;opacity:.7}
.lcwires [data-v="1"] .lcline{stroke:var(--accent);stroke-width:3.4;opacity:1}
.lcwires [data-v="x"] .lcline{stroke-dasharray:6 5;opacity:.58}
.lcwires [data-v="z"] .lcline{stroke-dasharray:10 4 2 4;opacity:.72}
.lcwires [data-v="e"] .lcline{stroke:var(--accent);stroke-width:3.4;stroke-dasharray:1 5;opacity:1}
.lcwires .lchit{stroke:transparent;stroke-width:16;pointer-events:stroke;cursor:pointer}
.lcwires g.sel .lcline{stroke-width:4.5;filter:drop-shadow(0 0 2px rgba(255,255,255,.75))}
.lcwires .lcjoint{fill:var(--soft);opacity:.75}.lcwires .lcjoint[data-v="1"]{fill:var(--accent);opacity:1}
.lcghost{fill:none;stroke:var(--accent2);stroke-width:2.5;stroke-dasharray:7 5;pointer-events:none}
.lcinspect{position:absolute;z-index:6;display:flex;align-items:center;gap:3px;transform:translate(-50%,-110%);
  padding:5px;border-radius:10px;white-space:nowrap;color:#e9eaef;max-width:94%;overflow-x:auto}
.lcinspect[hidden]{display:none}.lcinspect span{font-family:var(--mono);font-size:max(9px,calc(var(--scale)*8px));
  letter-spacing:.07em;padding:0 5px;opacity:.62}
.lcinspect button{font-family:var(--mono);font-size:max(10px,calc(var(--scale)*9px));padding:6px 7px;
  border-radius:7px;color:inherit;background:rgba(255,255,255,.05)}
.lcinspect button:hover{background:var(--accent);color:#fff}
.lcrail{position:absolute;right:100%;top:0;margin-right:10px;z-index:22;width:min(232px,calc(100vw - 24px));
  max-height:min(540px,76vh);overflow-y:auto;overscroll-behavior:contain;display:none;padding:10px;border-radius:14px;
  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
.item.sel .lcrail{display:block}
.lcrail>header{position:sticky;top:-10px;z-index:2;display:flex;justify-content:space-between;align-items:baseline;
  gap:8px;margin:-10px -10px 8px;padding:11px 12px 8px;background:rgba(28,32,37,.88);backdrop-filter:blur(18px)}
.lcrail>header>b{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.lcrail>header>small{font-family:var(--mono);font-size:9px;opacity:.48;white-space:nowrap}
.lccatalog section+section{margin-top:12px}
.lccatalog section>b{display:block;margin:0 2px 5px;font-family:var(--mono);font-size:9px;
  letter-spacing:.12em;text-transform:uppercase;color:rgba(233,234,239,.52)}
.lccatalog section>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.lcrail button{border-radius:9px;color:rgba(233,234,239,.84);background:rgba(255,255,255,.045);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);transition:background .12s,color .12s,transform .1s}
.lccatalog button{min-height:46px;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;
  gap:5px;padding:5px 7px;text-align:left}
.lccatalog button i{display:grid;place-items:center;width:32px;height:32px;font-style:normal}
.lccatalog button span{font-family:var(--mono);font-size:9px;line-height:1.18;overflow-wrap:anywhere}
.lcrail button:hover{background:rgba(255,255,255,.12);color:#fff}.lcrail button:active{transform:scale(.96)}
.lccatalog button.dragging{color:#fff;background:var(--accent);transform:scale(.97)}
.lccatalog .ic{width:30px;height:30px}
.lcdnd{position:fixed;left:0;top:0;z-index:1000;pointer-events:none;display:flex;align-items:center;gap:8px;
  padding:7px 10px;border-radius:11px;color:#fff;font:10px/1 var(--mono);opacity:.92;
  will-change:transform;box-shadow:0 8px 28px rgba(0,0,0,.24)}
.lcdnd .ic{width:32px;height:32px}
.lcpresets{position:absolute;z-index:24;right:8px;top:8px;width:min(350px,calc(100% - 16px));
  max-height:min(430px,70vh);display:grid;grid-template-rows:auto minmax(0,1fr);padding:9px;border-radius:14px;
  color:#e9eaef;box-shadow:0 16px 48px rgba(0,0,0,.28)}
.lcpresets[hidden]{display:none}
.lcpresets>header{display:flex;align-items:flex-start;gap:7px;margin-bottom:8px}
.lcpresets label{display:grid;gap:6px;min-width:0;flex:1;font:600 10px/1.2 var(--mono);letter-spacing:.08em;
  text-transform:uppercase}
.lcpresets input{width:100%;min-height:34px;padding:7px 9px;border:0;border-radius:8px;color:#fff;
  font:11px/1.2 var(--mono);background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);outline:none}
.lcpresets input:focus{box-shadow:inset 0 0 0 2px var(--accent2)}
.lcpresets>header>button{width:30px;height:30px;border-radius:8px;color:inherit;background:rgba(255,255,255,.06)}
.lcplist{min-height:0;overflow-y:auto;overscroll-behavior:contain;display:grid;gap:5px;padding-right:2px;scrollbar-width:thin}
.lcplist button{display:grid;gap:3px;padding:9px 10px;border-radius:9px;text-align:left;color:inherit;
  background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.lcplist button:hover,.lcplist button:focus-visible{background:var(--accent);outline:none}
.lcplist b{font:600 11px/1.2 var(--mono)}.lcplist small{font:9px/1.35 var(--mono);opacity:.58}
.lcpnone{margin:20px 8px;text-align:center;font:10px/1.4 var(--mono);opacity:.55}
@media (prefers-reduced-motion:reduce){.lcrail button,.lcenv,.lcstage{transition:none}}
@media (prefers-reduced-transparency:reduce){.lcrail,.lcinspect,.lcrail>header,.lcpresets,.lcdnd{backdrop-filter:none;background:#20242a}}
`
});

defineIcon('circuit', '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M6 9h3M13 9h2.5M18 9h1M6 15h4M14 15h4"/><path d="M9 6.5h4v5H9zM10 15l4-2.5v5z"/>');
defineTool({ kind:'circuit', cat:'science', label:'Logic circuit', icon:'circuit', order:5,
  hint:'A contained circuit with its components in a categorized side rail' });

onNoteOpen(() => {
  lcCancelWire();
  LC_RESIZE.forEach(observer => observer.disconnect()); LC_RESIZE.clear();
  LC_PICK.clear(); LC_MODE.clear();
});
