/* Open Note — items/logic/gate.js
   logic gates: Boolean circuits, wired up on the sheet itself */

/* ================= what this is =================
   Digital Lego. Put conventional gate symbols on the paper, pull leads between
   their ports, flick a switch, and watch the ones and noughts arrive at the
   other end. Every gate is an ordinary item — it drags, turns, resizes, sits on
   a layer, prints, exports, backs up and undoes like anything else, because it
   *is* like anything else.

   Three things are worth knowing before reading on.

   **The definition is the device.** It says what the component is called, what
   its ports are and which shared symbol primitives make its face. Ordinary
   combinational gates carry truth tables — NAND is not `!(a&&b)` written out
   again — while controls declare a source, Tri-State declares its extra `z`
   rule, and flip-flops declare which stored-state rule they use. Adding a
   component is still one entry in LG_GATES, not a branch through the app.

   **The symbols are derived, not drawn twenty-one times.** One viewBox, one stroke
   weight, one bubble, one stub length, one set of port positions. NAND is AND +
   bubble; NOR is OR + bubble; XOR is OR + the rear curve; XNOR is all three;
   NOT is the buffer triangle + bubble. Change the bubble once and every
   inverting gate changes with it. The palette icons come out of the same
   builder, so a tile can never drift from the thing it adds.

   **A wire is not a string.** The strings in js/paper/strings.js tie two ITEMS
   together and mean whatever you want them to; a wire joins one named PORT to
   another named PORT, has a direction, and carries a value. Those are different
   enough that they are different records — `page.wires`, beside `page.links` —
   though the geometry, the overlay and the static-render hook are all shared.

   The graph here is deliberately a little more general than Boolean logic
   needs: ports are named rather than numbered, values are an open set rather
   than a bit, and lgEval() knows nothing about AND or OR. That is the seam a
   later scientific dataflow would grow from. It is not built yet, and nothing
   here pretends it is. */

/* ================= what a wire carries =================
   Two levels and three other states. `x` is "this value is not known" — an
   input with no lead in it, or anything downstream of one. `z` is the distinct
   high-impedance state a disabled tri-state gate drives. `e` is "this circuit
   cannot settle" — a loop, or anything fed by one. Keeping them apart matters:
   an unfinished circuit, an intentionally disconnected bus and a wrong loop
   must not quietly look like the same nought. They are deliberately not
   booleans, and every evaluator and renderer carries the value as-is. */
const LG_0 = 0, LG_1 = 1, LG_X = 'x', LG_Z = 'z', LG_E = 'e';
const lgIsBit = v => v === LG_0 || v === LG_1;
const lgOrX = v => (v === undefined || v === null) ? LG_X : v;
const LG_WORD = { 0: 'nought', 1: 'one', x: 'not driven', z: 'high impedance', e: 'in a loop' };
const lgWord = v => LG_WORD[v] || String(v);
const LG_MAX_IN = 8;                       /* a truth table is 2^n rows: eight is 256 of them */

/* ================= the gates =================
   `table` is indexed by the inputs read as one binary number, first input
   highest — so for a two-input gate the rows are ab = 00, 01, 10, 11, which is
   the order every textbook prints them in.

   `shape` says which primitives the symbol is built from, and nothing else in
   the file mentions a gate by name. `src` marks the things that make a value
   rather than working one out. A lamp has a table and no output: what it is
   worth is what it is being shown, which is what makes it a probe. */
const LG_GATES = {
  buf:  { name: 'Buffer', ins: ['a'], outs: ['q'], table: [0, 1],
          shape: { body: 'tri' },
          tip: 'Passes its input straight through' },
  not:  { name: 'NOT', ins: ['a'], outs: ['q'], table: [1, 0],
          shape: { body: 'tri', bubble: true },
          tip: 'Turns a nought into a one and a one into a nought' },
  and:  { name: 'AND', ins: ['a', 'b'], outs: ['q'], table: [0, 0, 0, 1],
          shape: { body: 'and' },
          tip: 'One only when both inputs are one' },
  nand: { name: 'NAND', ins: ['a', 'b'], outs: ['q'], table: [1, 1, 1, 0],
          shape: { body: 'and', bubble: true },
          tip: 'AND with the answer turned over — nought only when both are one' },
  or:   { name: 'OR', ins: ['a', 'b'], outs: ['q'], table: [0, 1, 1, 1],
          shape: { body: 'or' },
          tip: 'One when either input is one' },
  nor:  { name: 'NOR', ins: ['a', 'b'], outs: ['q'], table: [1, 0, 0, 0],
          shape: { body: 'or', bubble: true },
          tip: 'OR with the answer turned over — one only when both are nought' },
  xor:  { name: 'XOR', ins: ['a', 'b'], outs: ['q'], table: [0, 1, 1, 0],
          shape: { body: 'or', back: true },
          tip: 'One when the two inputs disagree' },
  xnor: { name: 'XNOR', ins: ['a', 'b'], outs: ['q'], table: [1, 0, 0, 1],
          shape: { body: 'or', back: true, bubble: true },
          tip: 'One when the two inputs agree' },
  tri:  { name: 'Tri-State', ins: ['a', 'en'], outs: ['q'],
          eval: v => v.en === LG_E ? LG_E : v.en === LG_0 ? LG_Z :
            v.en === LG_1 ? (v.a === LG_E ? LG_E : lgIsBit(v.a) ? v.a : LG_X) : LG_X,
          shape: { body: 'tri', enable: true },
          tip: 'Passes a while enable is one; otherwise its output is high impedance' },
  /* ---- input and output controls ---- */
  sw:   { name: 'Switch', ins: [], outs: ['q'], src: it => (it.on ? LG_1 : LG_0),
          shape: { body: 'switch' },
          tip: 'Click it to send a nought or a one' },
  btn:  { name: 'Push Button', ins: [], outs: ['q'], src: it => (it.on ? LG_1 : LG_0),
          shape: { body: 'button' },
          tip: 'Sends one only while it is held down' },
  clk:  { name: 'Clock', ins: [], outs: ['q'], src: it => lgClockValue(it),
          shape: { body: 'clock' },
          tip: 'A repeating nought–one signal; pause it or change its speed from the toolbar' },
  zero: { name: 'Constant 0', ins: [], outs: ['q'], src: () => LG_0,
          shape: { body: 'const', k: 0 },
          tip: 'A nought, for ever' },
  one:  { name: 'Constant 1', ins: [], outs: ['q'], src: () => LG_1,
          shape: { body: 'const', k: 1 },
          tip: 'A one, for ever' },
  lamp: { name: 'Lamp', ins: ['a'], outs: [], table: [0, 1],
          shape: { body: 'lamp' },
          tip: 'Lights up when what is wired into it is a one' },
  digit:{ name: '4-Bit Digit', ins: ['8', '4', '2', '1'], outs: [], read: 'digit',
          shape: { body: 'digit' },
          tip: 'Reads four bits as one hexadecimal digit, from 0 to F' },
  /* A flip-flop's output is stored state, so it breaks a combinational loop.
     Inputs are sampled together on a rising clock edge; nq is always q turned over. */
  srff: { name: 'SR Flip-Flop', ins: ['s', 'r', 'clk'], outs: ['q', 'nq'], seq: 'sr',
          shape: { body: 'ff', mark: 'SR' }, tip: 'Set, reset or hold on a rising clock edge' },
  dff:  { name: 'D Flip-Flop', ins: ['d', 'clk'], outs: ['q', 'nq'], seq: 'd',
          shape: { body: 'ff', mark: 'D' }, tip: 'Copies D to Q on a rising clock edge' },
  jkff: { name: 'JK Flip-Flop', ins: ['j', 'k', 'clk'], outs: ['q', 'nq'], seq: 'jk',
          shape: { body: 'ff', mark: 'JK' }, tip: 'Sets, resets, holds or toggles on a rising edge' },
  tff:  { name: 'T Flip-Flop', ins: ['t', 'clk'], outs: ['q', 'nq'], seq: 't',
          shape: { body: 'ff', mark: 'T' }, tip: 'Toggles Q on a rising edge while T is one' },
  /* the one gate whose table is written by hand — see lgDef() */
  cust: { name: 'Custom', ins: null, outs: ['q'],
          shape: { body: 'box' },
          tip: 'A gate whose truth table you fill in yourself' }
};
/* every port a custom gate can have, in order. Named rather than numbered, so
   a later dataflow can carry typed values on ports called something useful. */
const LG_PORTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const lgKind = it => (it && LG_GATES[it.gate]) ? it.gate : 'and';
/* What a gate is, resolved. Everything downstream reads this rather than
   LG_GATES, which is why a custom gate needs no special case anywhere else. */
function lgDef(it){
  const g = LG_GATES[lgKind(it)];
  if(g.ins) return g;
  const d = (it && it.def) || {};
  const n = clamp(Math.round(+d.n || (Array.isArray(d.table) ? Math.log2(d.table.length) : 2)), 1, LG_MAX_IN);
  const ins = LG_PORTS.slice(0, n);
  const rows = 1 << n;
  const table = new Array(rows);
  for(let i = 0; i < rows; i++) table[i] = (Array.isArray(d.table) && d.table[i]) ? 1 : 0;
  return { name: String(d.name || 'Custom'), ins, outs: ['q'], table, shape: g.shape,
           tip: g.tip, custom: true };
}
/* a custom gate's own record, made if it isn't there yet */
function lgOwnDef(it){
  const g = lgDef(it);
  it.def = { name: g.name, n: g.ins.length, table: g.table.slice() };
  return it.def;
}

/* ================= working the circuit out =================
   One pass, in dependency order, over everything on one sheet.

   The order comes from Kahn's algorithm: start with the gates nothing feeds,
   and let a gate join the queue once every input it has is settled. What the
   walk never reaches is exactly what is in a loop — or downstream of one — and
   that is the whole of the cycle detection. There is no recursion and no visit
   flag, so a circuit wired in a ring cannot hang, blow the stack, or take a
   different amount of time than one that is fine.

   Nothing is cached. Working a sheet out is one Map and one sweep, and a stale
   answer after an undo would be a wrong picture on the paper — which is a far
   worse trade than the microseconds it saves. */
const lgWires = page => (page && Array.isArray(page.wires)) ? page.wires : [];
const lgIsGate = it => !!(it && it.type === 'logic');

/* which item drives each input of `id` — the map every reader wants */
function lgDrivers(page, id){
  const m = new Map();
  for(const w of lgWires(page)) if(w && w.from && w.to && w.to.item === id)
    m.set(w.to.port, { item: w.from.item, port: w.from.port });
  return m;
}
function lgFindWire(page, id, port){
  return lgWires(page).find(w => w && w.to && w.to.item === id && w.to.port === port) || null;
}

function lgEval(page){
  const out = new Map();
  const items = ((page && page.items) || []).filter(lgIsGate);
  if(!items.length) return out;
  const by = new Map(items.map(it => [it.id, it]));

  /* one driver per input is enforced when a lead is made; a file edited by hand
     could still carry two, and then the last one written is the one that counts */
  const drv = new Map();                       // item id → Map(port → source item id)
  for(const w of lgWires(page)){
    if(!w || !w.from || !w.to) continue;
    if(!by.has(w.from.item) || !by.has(w.to.item)) continue;
    let m = drv.get(w.to.item);
    if(!m) drv.set(w.to.item, m = new Map());
    m.set(w.to.port, { item: w.from.item, port: w.from.port });
  }

  const need = new Map(), feeds = new Map();
  for(const it of items){ need.set(it.id, 0); feeds.set(it.id, []); }
  for(const [dst, m] of drv) for(const src of m.values()){
    /* a port a gate does not actually have is not a dependency */
    if(lgDef(by.get(dst)).seq || !feeds.has(src.item)) continue;
    need.set(dst, need.get(dst) + 1);
    feeds.get(src.item).push(dst);
  }
  const queue = [];
  for(const it of items) if(!need.get(it.id)) queue.push(it.id);
  for(let i = 0; i < queue.length; i++){
    const id = queue[i];
    const it = by.get(id), g = lgDef(it);
    out.set(id, lgOne(it, g, drv.get(id), out));
    for(const nx of feeds.get(id)){
      need.set(nx, need.get(nx) - 1);
      if(need.get(nx) === 0) queue.push(nx);
    }
  }
  /* whatever the walk never reached is in a loop, or fed by one */
  for(const it of items) if(!out.has(it.id)) out.set(it.id, LG_E);
  return out;
}
/* one gate, given what is already settled. The only place a truth table is read */
function lgOutput(vals, id, port){
  const v = lgOrX(vals.get(id));
  if(port === 'nq') return lgIsBit(v) ? 1 - v : v;
  return v;
}
const lgSignal = (vals, src) => src ? lgOutput(vals, src.item, src.port) : LG_X;

function lgOne(it, g, drv, out){
  if(g.src) return g.src(it);
  if(g.seq) return lgOrX(it.q == null ? LG_0 : it.q);
  if(!g.ins.length) return LG_X;
  let idx = 0, unknown = false, bad = false;
  const input = {};
  for(const p of g.ins){
    const v = lgSignal(out, drv && drv.get(p));
    input[p] = v;
    if(v === LG_E) bad = true;
    else if(!lgIsBit(v)) unknown = true;
    idx = idx * 2 + (v === LG_1 ? 1 : 0);
  }
  /* An unwired input is not a nought. Everything that touches one comes out
     saying so rather than quietly answering as if the wire were there. */
  if(g.eval) return lgOrX(g.eval(input, it));       /* it may intentionally isolate a bad input */
  if(bad) return LG_E;
  if(unknown) return LG_X;
  if(g.read === 'digit') return idx;
  return (g.table && g.table[idx]) ? LG_1 : LG_0;
}
const lgVal = (page, id) => lgOrX(lgEval(page).get(id));
/* what a lead is carrying: its source's value, unless either end is in a loop */
function lgWireVal(vals, w){
  const a = lgOutput(vals, w.from.item, w.from.port), b = lgOrX(vals.get(w.to.item));
  return (a === LG_E || b === LG_E) ? LG_E : a;
}

/* ================= state and time =================
   Combinational gates are pure. A flip-flop is the deliberate exception: its
   stored q is a source for this evaluation, so feedback through it is not a
   combinational loop. All flip-flops sample the old circuit together, then take
   their next states together, which is the distinction synchronous logic needs. */
function lgInputs(page, vals, it){
  const drv = lgDrivers(page, it.id), out = {};
  for(const p of lgDef(it).ins) out[p] = lgSignal(vals, drv.get(p));
  return out;
}
function lgSeqNext(kind, v, q){
  q = lgIsBit(q) ? q : LG_X;
  if(kind === 'd') return lgIsBit(v.d) ? v.d : LG_X;
  if(kind === 't') return !lgIsBit(v.t) ? LG_X : v.t ? (lgIsBit(q) ? 1 - q : LG_X) : q;
  if(kind === 'sr'){
    if(!lgIsBit(v.s) || !lgIsBit(v.r)) return LG_X;
    if(v.s && v.r) return LG_X;
    if(v.s) return LG_1;
    if(v.r) return LG_0;
    return q;
  }
  if(kind === 'jk'){
    if(!lgIsBit(v.j) || !lgIsBit(v.k)) return LG_X;
    if(v.j && v.k) return lgIsBit(q) ? 1 - q : LG_X;
    if(v.j) return LG_1;
    if(v.k) return LG_0;
    return q;
  }
  return q;
}
function lgAdvance(page){
  const vals = lgEval(page), pending = [], clocks = [];
  for(const it of (page.items || []).filter(lgIsGate)){
    const g = lgDef(it); if(!g.seq) continue;
    const v = lgInputs(page, vals, it);
    const clk = lgIsBit(v.clk) ? v.clk : LG_0;
    const before = lgIsBit(it.clk) ? it.clk : LG_0;
    clocks.push({ it, clk });
    if(before === LG_0 && clk === LG_1)
      pending.push({ it, q: lgSeqNext(g.seq, v, it.q == null ? LG_0 : it.q) });
  }
  let changed = false;
  for(const x of clocks) if(x.it.clk !== x.clk){ x.it.clk = x.clk; changed = true; }
  for(const x of pending) if(x.it.q !== x.q){ x.it.q = x.q; changed = true; }
  return changed;
}

/* One small scheduler serves every clock on the open sheet. Clock phase is live
   state, not document history; flip-flop state reached from it is persisted with
   history disabled so an unattended clock cannot eat the undo stack. */
const LG_CLOCK = new Map();                       // item id → {v,next}
let lgClockTimer = 0;
const lgClockHz = it => clamp(+it.hz || 1, .5, 4);
function lgClockState(it){
  let s = LG_CLOCK.get(it.id);
  if(!s){ s = { v: it.on ? LG_1 : LG_0, next: performance.now() + 500 / lgClockHz(it) }; LG_CLOCK.set(it.id, s); }
  return s;
}
function lgClockValue(it){ return it.paused ? (it.on ? LG_1 : LG_0) : lgClockState(it).v; }
function lgClockArm(){
  clearTimeout(lgClockTimer); lgClockTimer = 0;
  const running = openPages().flatMap(p => (p.items || []).filter(it =>
    lgIsGate(it) && lgKind(it) === 'clk' && !it.paused));
  if(!running.length) return;
  const now = performance.now();
  const due = Math.min(...running.map(it => lgClockState(it).next));
  lgClockTimer = setTimeout(lgClockTick, Math.max(16, due - now));
}
function lgClockTick(){
  lgClockTimer = 0;
  const now = performance.now(); let any = false;
  for(const page of openPages()){
    let moved = false;
    for(const it of (page.items || []).filter(it => lgIsGate(it) && lgKind(it) === 'clk' && !it.paused)){
      const s = lgClockState(it), half = 500 / lgClockHz(it);
      if(now + 1 < s.next) continue;
      do { s.v = s.v ? LG_0 : LG_1; s.next += half; } while(s.next <= now);
      moved = any = true;
    }
    if(moved && lgAdvance(page)) queueSave(page.id, false);
  }
  if(any){ lgSync(); lgWake(); }
  lgClockArm();
}

/* ================= the symbol =================
   One viewBox for every gate: 100 units across, and as tall as it needs to be
   for the ports down its left-hand side. Ports sit at x=6 and x=94 whatever the
   body is, so a lead lands in the same place on every symbol and a gate swapped
   for another does not move its wires.

   Everything is drawn in the order stubs → rear curve → body → bubble, and the
   body is filled with the paper colour: an input stub that pokes into a curved
   OR back is covered by the body that goes on top of it, which is exactly how
   the symbol is drawn by hand. */
const LG_VBW = 100, LG_VBH = 64;
const lgH = it => Math.max(LG_VBH, 20 + Math.max(lgDef(it).ins.length, lgDef(it).outs.length) * 15);
/* where the inputs sit down the left edge, evenly, never tighter than the body */
function lgSpread(n, h){
  if(!n) return [];
  if(n === 1) return [h / 2];
  const gap = Math.min(22, (h - 30) / (n - 1));
  const out = [];
  for(let i = 0; i < n; i++) out.push(rd1(h / 2 + (i - (n - 1) / 2) * gap));
  return out;
}
/* every port of a gate, with the coordinates its dot is drawn at */
function lgPorts(it){
  const g = lgDef(it), h = lgH(it);
  const ys = lgSpread(g.ins.length, h);
  const out = g.ins.map((p, i) => ({ port: p, dir: 'in', x: 6, y: ys[i] }));
  const oys = lgSpread(g.outs.length, h);
  g.outs.forEach((p, i) => out.push({ port: p, dir: 'out', x: 94, y: oys[i] }));
  return out;
}
/* where the lever of a switch stands */
const lgLever = (it, h) => it && it.on
  ? 'M30 ' + h / 2 + 'L68 ' + h / 2
  : 'M30 ' + h / 2 + 'L66 ' + rd1(h / 2 - 20);
/* the one character a switch, a constant or a lamp writes on itself */
function lgNumeral(it, v){
  const g = lgDef(it);
  if(g.shape.body === 'const') return String(g.shape.k);
  if(g.shape.body === 'switch') return it && it.on ? '1' : '0';
  if(g.shape.body === 'button') return it && it.on ? '1' : '0';
  if(g.shape.body === 'clock') return lgClockValue(it) ? '1' : '0';
  if(g.shape.body === 'digit') return typeof v === 'number' && v >= 0 && v < 16
    ? '0123456789ABCDEF'[v] : v === LG_E ? '!' : '?';
  return v === LG_1 ? '1' : v === LG_0 ? '0' : v === LG_E ? '!' : '?';
}
/* what a screen reader is told, and what the pointer's tooltip says */
function lgLabel(it, v){
  const g = lgDef(it);
  if(g.shape.body === 'switch') return 'Switch, sending ' + (it && it.on ? 'one' : 'nought');
  if(g.shape.body === 'button') return 'Push button, sending ' + (it && it.on ? 'one' : 'nought');
  if(g.shape.body === 'clock') return 'Clock, ' + (it && it.paused ? 'paused at ' : 'sending ') + lgWord(v);
  if(g.shape.body === 'const') return 'Constant ' + g.shape.k;
  if(g.shape.body === 'lamp') return 'Lamp, showing ' + lgWord(v);
  if(g.shape.body === 'digit') return '4-bit digit, showing ' + lgNumeral(it, v);
  if(g.seq) return g.name + ', Q is ' + lgWord(v);
  return g.name + ' gate, output ' + lgWord(v);
}

const LG_SEGS = {
  0:'abcdef', 1:'bc', 2:'abdeg', 3:'abcdg', 4:'bcfg', 5:'acdfg', 6:'acdefg', 7:'abc',
  8:'abcdefg', 9:'abcdfg', 10:'abcefg', 11:'cdefg', 12:'adef', 13:'bcdeg', 14:'adefg', 15:'aefg'
};
const lgSegOn = (v, s) => typeof v === 'number' && (LG_SEGS[v] || '').indexOf(s) >= 0;

/* The symbol itself. `plain` swaps the stylesheet's classes for presentation
   attributes so the very same builder draws the palette tile, where there is no
   .lgw around it to hang a rule on and everything must be currentColor. */
function lgSym(it, plain, v){
  const g = lgDef(it), sh = g.shape, h = lgH(it), cy = rd1(h / 2);
  const ys = lgSpread(g.ins.length, h);
  const oys = lgSpread(g.outs.length, h);
  const body = plain ? 'fill="none"' : 'class="lgb"';
  const wire = plain ? 'fill="none"' : 'class="lgs"';
  const solid = plain ? 'fill="currentColor" stroke="none"' : 'class="lgd"';
  const num = plain ? 'fill="currentColor" stroke="none" text-anchor="middle" font-size="34"'
                    : 'class="lgnum"';
  const top = rd1(cy - 22), bot = rd1(cy + 22);
  let s = '';

  /* ---- the stubs: every symbol's ports reach the same distance ---- */
  if(g.outs.length && sh.body !== 'switch' && sh.body !== 'const' && sh.body !== 'button' && sh.body !== 'clock')
    for(const y of oys) s += '<path ' + wire + ' d="M74 ' + y + 'H94"/>';
  for(const y of ys) s += '<path ' + wire + ' d="M6 ' + y + 'H38"/>';

  /* ---- the bodies ---- */
  if(sh.body === 'and')
    s += '<path ' + body + ' d="M30 ' + top + 'H54A22 22 0 0 1 54 ' + bot + 'H30Z"/>';
  else if(sh.body === 'or'){
    if(sh.back)                                  /* XOR's rear curve, struck behind the back */
      s += '<path ' + wire + ' d="M20 ' + top + 'C32 ' + rd1(cy - 12) + ' 32 ' + rd1(cy + 12) +
           ' 20 ' + bot + '"/>';
    s += '<path ' + body + ' d="M28 ' + top + 'C50 ' + top + ' 68 ' + rd1(cy - 12) + ' 76 ' + cy +
         'C68 ' + rd1(cy + 12) + ' 50 ' + bot + ' 28 ' + bot +
         'C40 ' + rd1(cy + 12) + ' 40 ' + rd1(cy - 12) + ' 28 ' + top + 'Z"/>';
  }
  else if(sh.body === 'tri'){
    s += '<path ' + body + ' d="M32 ' + top + 'L76 ' + cy + 'L32 ' + bot + 'Z"/>';
    if(sh.enable && !plain) g.ins.forEach((p, i) => {
      s += '<text class="lgnum lgtiny lgpinlab" x="36" y="' + rd1(ys[i] + 3.5) + '">' +
        (p === 'en' ? 'EN' : p.toUpperCase()) + '</text>';
    });
  }
  else if(sh.body === 'box'){
    const nm = g.name.slice(0, 9);
    s += '<rect ' + body + ' x="26" y="8" width="50" height="' + (h - 16) + '" rx="4"/>';
    /* the size is written inline rather than as a presentation attribute: the
       stylesheet's own font-size would win over one of those and a long name
       would run off both sides of the box */
    if(!plain){
      s += '<text class="lgnum" x="53" y="' + rd1(cy + 5) + '" style="font-size:' +
           (nm.length > 7 ? 9 : nm.length > 4 ? 12 : 15) + 'px">' + esc(nm) + '</text>';
      /* a custom gate is the one symbol whose ports are not conventional, so it
         says which is which on its own face */
      g.ins.forEach((p, i) => {
        s += '<text class="lgnum lgtiny" x="32" y="' + rd1(ys[i] + 3.5) + '">' + esc(p) + '</text>';
      });
    }
  }
  else if(sh.body === 'switch'){
    const look = plain ? 'lever' : (it.look || 'lever');
    if(look === 'rocker'){
      s += '<path ' + wire + ' d="M70 ' + cy + 'H94"/>' +
           '<rect ' + body + ' x="28" y="' + rd1(cy - 17) + '" width="42" height="34" rx="17"/>' +
           '<circle class="lgrock" cx="' + (it.on ? 57 : 41) + '" cy="' + cy + '" r="11"/>';
    } else if(look === 'plain'){
      s += '<path ' + wire + ' d="M72 ' + cy + 'H94"/>' +
           '<rect ' + body + ' x="28" y="' + rd1(cy - 18) + '" width="44" height="36" rx="4"/>' +
           '<text class="lgnum lgval" x="50" y="' + rd1(cy + 7) + '">' + lgNumeral(it, v) + '</text>';
    } else {
      s += '<path ' + wire + ' d="M12 ' + cy + 'H30"/>' +
           '<path ' + wire + ' d="M68 ' + cy + 'H94"/>' +
           '<circle ' + solid + ' cx="30" cy="' + cy + '" r="3.6"/>' +
           '<circle ' + solid + ' cx="68" cy="' + cy + '" r="3.6"/>' +
           '<path ' + (plain ? 'fill="none"' : 'class="lgs lglev"') + ' d="' +
           lgLever(plain ? { on: 0 } : it, h) + '"/>';
      if(!plain) s += '<text class="lgnum lgval" x="49" y="' + rd1(cy + 26) + '">' +
           lgNumeral(it, v) + '</text>';
    }
  }
  else if(sh.body === 'button'){
    s += '<path ' + wire + ' d="M70 ' + cy + 'H94"/>' +
         '<rect ' + body + ' x="27" y="' + rd1(cy - 19) + '" width="43" height="38" rx="6"/>' +
         '<circle class="lgpress" cx="48.5" cy="' + cy + '" r="12"/>';
  }
  else if(sh.body === 'clock'){
    s += '<path ' + wire + ' d="M72 ' + cy + 'H94"/>' +
         '<rect ' + body + ' x="25" y="' + rd1(cy - 20) + '" width="47" height="40" rx="5"/>' +
         '<path ' + wire + ' d="M31 ' + rd1(cy + 7) + 'H39V' + rd1(cy - 8) + 'H51V' +
         rd1(cy + 7) + 'H64"/>' +
         (!plain ? '<circle class="lgclkdot" cx="65" cy="' + rd1(cy - 12) + '" r="3"/>' : '');
  }
  else if(sh.body === 'const'){
    s += '<path ' + wire + ' d="M72 ' + cy + 'H94"/>';
    s += '<rect ' + body + ' x="26" y="' + rd1(cy - 18) + '" width="46" height="36" rx="4"/>';
    s += '<text ' + num + ' x="49" y="' + rd1(cy + (plain ? 12 : 7)) + '">' + sh.k + '</text>';
  }
  else if(sh.body === 'lamp'){
    /* the rays are the reason this reads as lit in a black-and-white print:
       they are only there when it is showing a one, colour or no colour */
    for(let i = 0; i < 4; i++){
      const a = (Math.PI / 4) + i * Math.PI / 2;
      const cx = 52, ux = Math.cos(a), uy = Math.sin(a);
      s += '<path ' + (plain ? 'fill="none"' : 'class="lgs lgray"') +
           ' d="M' + rd1(cx + ux * 23) + ' ' + rd1(cy + uy * 23) +
           'L' + rd1(cx + ux * 29) + ' ' + rd1(cy + uy * 29) + '"/>';
    }
    s += '<circle ' + (plain ? 'fill="none"' : 'class="lgb lglamp"') +
         ' cx="52" cy="' + cy + '" r="19"/>';
    if(!plain) s += '<text class="lgnum lgval" x="52" y="' + rd1(cy + 7) + '">' +
         lgNumeral(it, v) + '</text>';
  }
  else if(sh.body === 'digit'){
    const seg = (k, d) => '<path class="lgseg' + (plain || lgSegOn(v, k) ? ' on' : '') +
      '" data-s="' + k + '" d="' + d + '"/>';
    s += '<rect ' + body + ' x="28" y="6" width="48" height="' + (h - 12) + '" rx="5"/>' +
      seg('a', 'M41 ' + (cy - 24) + 'H63') + seg('g', 'M41 ' + cy + 'H63') +
      seg('d', 'M41 ' + (cy + 24) + 'H63') + seg('f', 'M38 ' + (cy - 21) + 'V' + (cy - 4)) +
      seg('b', 'M66 ' + (cy - 21) + 'V' + (cy - 4)) + seg('e', 'M38 ' + (cy + 4) + 'V' + (cy + 21)) +
      seg('c', 'M66 ' + (cy + 4) + 'V' + (cy + 21)) +
      (!plain ? '<text class="lgnum lgdigbad" x="52" y="' + rd1(cy + 7) + '">' + lgNumeral(it, v) + '</text>' : '');
    if(!plain) g.ins.forEach((p, i) => {
      s += '<text class="lgnum lgtiny lgpinlab" x="31" y="' + rd1(ys[i] + 3.5) + '">' + p + '</text>';
    });
  }
  else if(sh.body === 'ff'){
    s += '<rect ' + body + ' x="26" y="5" width="50" height="' + (h - 10) + '" rx="3"/>' +
      '<text ' + (plain ? 'fill="currentColor" stroke="none" text-anchor="middle" font-size="16"'
        : 'class="lgnum lgffmark"') + ' x="51" y="' + rd1(cy + 5) + '">' + esc(sh.mark) + '</text>';
    if(!plain){
      g.ins.forEach((p, i) => { s += '<text class="lgnum lgtiny lgpinlab" x="31" y="' +
        rd1(ys[i] + 3.5) + '">' + esc(p === 'clk' ? '▸' : p.toUpperCase()) + '</text>'; });
      g.outs.forEach((p, i) => { s += '<text class="lgnum lgtiny lgpoutlab" x="70" y="' +
        rd1(oys[i] + 3.5) + '">' + (p === 'nq' ? 'Q̅' : 'Q') + '</text>'; });
    }
    const ni = g.outs.indexOf('nq');
    if(ni >= 0) s += '<circle ' + body + ' cx="81" cy="' + oys[ni] + '" r="4"/>';
  }
  if(sh.bubble) s += '<circle ' + body + ' cx="81" cy="' + cy + '" r="5"/>';
  return s;
}
/* the ports, on top of everything, each with a hit area far bigger than its dot */
function lgPortSVG(it, page, vals){
  const g = lgDef(it), drv = page ? lgDrivers(page, it.id) : new Map();
  const mine = lgOrX(vals && vals.get(it.id));
  return lgPorts(it).map(p => {
    const v = p.dir === 'out' ? lgOutput(vals || new Map(), it.id, p.port)
      : lgSignal(vals || new Map(), drv.get(p.port));
    const tip = (p.dir === 'out' ? 'Output ' : 'Input ') + p.port + ' — ' + lgWord(v) +
      '. Drag from here to another port.';
    return '<g class="lgp lgp-' + p.dir + '" data-p="' + esc(p.port) + '" data-dir="' + p.dir +
      '" data-v="' + v + '" tabindex="-1" aria-label="' + esc(tip) + '">' +
      '<circle class="lghit" cx="' + p.x + '" cy="' + p.y + '" r="12"/>' +
      '<circle class="lgdot" cx="' + p.x + '" cy="' + p.y + '" r="3.6"/>' +
      '<title>' + esc(tip) + '</title></g>';
  }).join('');
}

/* the whole item. Runs for print, thumbnails and exports too — which is why
   the value comes out of the page record rather than off the screen */
function lgHTML(it, c){
  const g = lgDef(it), h = lgH(it);
  const vals = lgEval(c.page);
  const v = lgOrX(vals.get(it.id));
  const body = g.shape.body;
  let symbol = lgSym(it, false, v);
  if(body === 'switch') symbol = '<g class="lgsw lgctl" role="switch" tabindex="0" aria-checked="' +
    (it.on ? 'true' : 'false') + '" aria-label="Switch — click to send a nought or a one">' + symbol + '</g>';
  else if(body === 'button') symbol = '<g class="lgbtn lgctl" role="button" tabindex="0" aria-pressed="' +
    (it.on ? 'true' : 'false') + '" aria-label="Push button — hold to send one">' + symbol + '</g>';
  else if(body === 'clock') symbol = '<g class="lgclock lgctl" role="switch" tabindex="0" aria-checked="' +
    (!it.paused ? 'true' : 'false') + '" aria-label="Clock — click to pause or run">' + symbol + '</g>';
  return '<div class="body lgw" data-gate="' + esc(lgKind(it)) + '" data-v="' + v + '">' +
    '<svg class="lgsvg" viewBox="0 0 ' + LG_VBW + ' ' + h + '" role="img" aria-label="' +
      esc(lgLabel(it, v)) + '">' +
      symbol +
      lgPortSVG(it, c.page, vals) +
    '</svg><figcaption></figcaption></div>';
}

/* ---- bringing one gate up to date without rebuilding it ----
   Only three things on a symbol depend on a value: the classes the stylesheet
   reads, the lever of a switch, and the one character written on it. Writing
   those in place is what lets a lead be dragged, a port be focused and a
   tooltip stay open while the circuit changes underneath. */
function lgPaint(el, it, page, vals){
  const w = el.querySelector('.lgw');
  if(!w) return;
  const v = lgOrX(vals.get(it.id));
  w.setAttribute('data-v', v);
  const drv = lgDrivers(page, it.id);
  w.querySelectorAll('.lgp').forEach(p => {
    const pv = p.dataset.dir === 'out' ? lgOutput(vals, it.id, p.dataset.p)
      : lgSignal(vals, drv.get(p.dataset.p));
    p.setAttribute('data-v', pv);
    const t = p.querySelector('title');
    if(t) t.textContent = (p.dataset.dir === 'out' ? 'Output ' : 'Input ') + p.dataset.p +
      ' — ' + lgWord(pv) + '. Drag from here to another port.';
  });
  const lev = w.querySelector('.lglev');
  if(lev) lev.setAttribute('d', lgLever(it, lgH(it)));
  const rock = w.querySelector('.lgrock');
  if(rock) rock.setAttribute('cx', it.on ? 57 : 41);
  /* .lgval, not .lgnum: the only glyphs that say a value are a switch's and a
     lamp's. A constant's numeral is fixed and a custom gate's writing is its
     NAME, and overwriting that would rub the gate's own label out. */
  const num = w.querySelector('.lgval');
  if(num) num.textContent = lgNumeral(it, v);
  w.querySelectorAll('.lgseg').forEach(s => s.classList.toggle('on', lgSegOn(v, s.dataset.s)));
  const bad = w.querySelector('.lgdigbad');
  if(bad){ bad.textContent = lgNumeral(it, v); bad.hidden = typeof v === 'number'; }
  const sw = w.querySelector('.lgsw');
  if(sw) sw.setAttribute('aria-checked', it.on ? 'true' : 'false');
  const btn = w.querySelector('.lgbtn');
  if(btn) btn.setAttribute('aria-pressed', it.on ? 'true' : 'false');
  const clk = w.querySelector('.lgclock');
  if(clk) clk.setAttribute('aria-checked', it.paused ? 'false' : 'true');
  const svg = w.querySelector('svg');
  if(svg) svg.setAttribute('aria-label', lgLabel(it, v));
}
/* every gate on screen, then every lead, then the panel that is watching one */
function lgSync(){
  const cache = new Map();
  const valsOf = p => {
    let v = cache.get(p);
    if(!v) cache.set(p, v = lgEval(p));
    return v;
  };
  document.querySelectorAll('#pageHost .item[data-type="logic"]').forEach(el => {
    const pg = pageOfEl(el);
    const it = pg && pg.items.find(x => x.id === el.dataset.id);
    if(it) lgPaint(el, it, pg, valsOf(pg));
  });
  lgLay();
  lgTTSync();
}

/* ================= the leads =================
   Their own overlay over the whole view, in the same coordinate space as the
   string board and the node wires, so the geometry those already work out is
   reused whole rather than measured twice.

   **Where a lead ends is measured, never assumed.** A gate can be turned to any
   angle, and a turned gate's ports are nowhere near the edges of its bounding
   box — so the anchor is the middle of the port's own dot, read off the DOM.
   Rotation about an element's centre maps that centre to itself, so the middle
   of a rotated circle's box really is the middle of the circle: exact at any
   angle, and true for a rotation the app has not invented yet. The tangent the
   lead leaves along is turned by the same angle, so a lead comes out of the
   nose of a gate rather than off to the side of it. */
const LG_SVG = 'lgwires';
function lgBoard(){
  const host = $('#pageHost');
  if(!host || !BOARD) return null;
  let svg = host.querySelector('svg.' + LG_SVG);
  if(!svg){
    svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', LG_SVG);
    svg.setAttribute('preserveAspectRatio', 'none');
    host.appendChild(svg);
  }
  svg.setAttribute('viewBox', '0 0 ' + rd1(BOARD.vw) + ' ' + rd1(BOARD.vh));
  return svg;
}
/* the middle of one port's dot, in the overlay's own space */
function lgAnchor(wrap, svg, vw, vh, id, port){
  const el = wrap && wrap.querySelector('.item[data-id="' + id + '"] .lgp[data-p="' + port + '"] .lgdot');
  return el ? pinPoint(svg, vw, vh, el) : null;
}
/* the way a port faces, once its gate has been turned */
function lgDir(rot){
  const t = (+rot || 0) * Math.PI / 180;
  return { x: Math.cos(t), y: Math.sin(t) };
}
function lgCleanPath(a, b, lane){
  lane = +lane || 0;
  if(Math.abs(a.y - b.y) < 1) return 'M' + rd1(a.x) + ' ' + rd1(a.y) + 'H' + rd1(b.x);
  const forward = b.x > a.x + 18;
  const mx = forward ? (a.x + b.x) / 2 + lane : Math.max(a.x, b.x) + 28 + Math.abs(lane);
  const sy = b.y > a.y ? 1 : -1, r = Math.min(7, Math.abs(b.y - a.y) / 2,
    Math.abs(mx - a.x) / 2, Math.abs(b.x - mx) / 2);
  return 'M' + rd1(a.x) + ' ' + rd1(a.y) + 'H' + rd1(mx - r) +
    'Q' + rd1(mx) + ' ' + rd1(a.y) + ' ' + rd1(mx) + ' ' + rd1(a.y + sy * r) +
    'V' + rd1(b.y - sy * r) + 'Q' + rd1(mx) + ' ' + rd1(b.y) + ' ' +
    rd1(mx + (b.x >= mx ? r : -r)) + ' ' + rd1(b.y) + 'H' + rd1(b.x);
}
function lgPath(a, b, rotA, rotB, clean, lane){
  if(clean && !(+rotA || 0) && !(+rotB || 0)) return lgCleanPath(a, b, lane);
  const k = clamp(Math.hypot(b.x - a.x, b.y - a.y) * 0.42 + 14, 20, 130);
  const da = lgDir(rotA), db = lgDir(rotB);
  return 'M' + rd1(a.x) + ' ' + rd1(a.y) +
    'C' + rd1(a.x + da.x * k) + ' ' + rd1(a.y + da.y * k) +
    ' ' + rd1(b.x - db.x * k) + ' ' + rd1(b.y - db.y * k) +
    ' ' + rd1(b.x) + ' ' + rd1(b.y);
}
/* every lead on screen, gathered from the sheets themselves */
function lgWireList(){
  const out = [];
  for(const p of openPages()){
    if(!p) continue;
    const by = new Map(p.items.filter(lgIsGate).map(x => [x.id, x]));
    const vals = lgEval(p);
    for(const w of lgWires(p)){
      if(!w || !w.from || !w.to) continue;
      const src = by.get(w.from.item), dst = by.get(w.to.item);
      if(!src || !dst) continue;
      out.push({ pid: p.id, page: p, w, src, dst, v: lgWireVal(vals, w) });
    }
  }
  return out;
}
const lgJoint = w => w.from.item + '\0' + w.from.port;

function lgLay(){
  const svg = lgBoard();
  if(!svg) return;
  const list = lgWireList(), keep = {}, jkeep = {}, fan = {};
  for(const r of list) fan[lgJoint(r.w)] = (fan[lgJoint(r.w)] || 0) + 1;
  for(const r of list){
    const wrap = BOARD.wraps[r.pid];
    const a = lgAnchor(wrap, svg, BOARD.vw, BOARD.vh, r.w.from.item, r.w.from.port);
    const b = lgAnchor(wrap, svg, BOARD.vw, BOARD.vh, r.w.to.item, r.w.to.port);
    if(!a || !b) continue;
    keep[r.w.id] = 1;
    let g = svg.querySelector('g[data-w="' + r.w.id + '"]');
    if(!g){
      g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-w', r.w.id);
      g.innerHTML = '<path class="lghit"/><path class="lgl"/><title></title>';
      g.addEventListener('pointerdown', e => e.stopPropagation());
      g.addEventListener('click', e => { e.stopPropagation(); lgSelect(r); });
      svg.appendChild(g);
    }
    const d = lgPath(a, b, r.src.rot, r.dst.rot, r.w.clean, r.w.route);
    g.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    g.setAttribute('class', 'lgwire' + (LG_SEL && LG_SEL.w.id === r.w.id ? ' sel' : ''));
    g.setAttribute('data-v', r.v);
    g.querySelector('title').textContent =
      lgDef(r.src).name + ' ' + r.w.from.port + ' → ' + lgDef(r.dst).name + ' ' + r.w.to.port +
      ' · carrying ' + lgWord(r.v) + ' · click to pick it out, Delete removes it';
    /* An output may feed several inputs. A blob where they part is what tells a
       junction from two leads that merely cross over one another. */
    if(fan[lgJoint(r.w)] > 1){
      const jk = r.w.from.item + '-' + r.w.from.port;
      jkeep[jk] = 1;
      let c = svg.querySelector('circle[data-j="' + jk + '"]');
      if(!c){
        c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('data-j', jk);
        c.setAttribute('class', 'lgjn');
        svg.appendChild(c);
      }
      c.setAttribute('cx', rd1(a.x)); c.setAttribute('cy', rd1(a.y));
      c.setAttribute('data-v', r.v);
    }
  }
  svg.querySelectorAll('g[data-w]').forEach(g => { if(!keep[g.dataset.w]) g.remove(); });
  svg.querySelectorAll('circle[data-j]').forEach(c => { if(!jkeep[c.dataset.j]) c.remove(); });
  lgChipMove();
}
/* Items move under the pointer and the leads have to follow, but nothing tells
   this file when. So it watches the pointer and keeps laying them for a moment
   after everything has gone quiet — the same shape as the ropes settling. */
let lgRafW = 0, lgCalm = 0;
function lgWake(){
  lgCalm = 0;
  if(!lgRafW) lgRafW = requestAnimationFrame(lgStep);
}
function lgStep(){
  lgRafW = 0;
  if(!document.querySelector('#pageHost .item[data-type="logic"]')) return;
  lgLay();
  if(++lgCalm < 40) lgRafW = requestAnimationFrame(lgStep);
}
const lgOnBoard = () => !!document.querySelector('#pageHost .item[data-type="logic"]');
window.addEventListener('pointermove', () => { if(lgOnBoard()) lgWake(); }, true);
window.addEventListener('wheel', () => { if(lgOnBoard()) lgWake(); }, true);
window.addEventListener('resize', () => { if(lgOnBoard()) lgWake(); });

/* ---- the same leads, settled, for a print / an export / a thumbnail ----
   Built beside a sheet that has just been laid out, in the space the static
   strings use. Only leads with both ends on that sheet. */
function lgStaticWires(wrap, page, bIdx){
  const idx = bIdx || index;
  const by = new Map(page.items.filter(lgIsGate).map(x => [x.id, x]));
  const list = lgWires(page).filter(w => w && w.from && w.to &&
    by.has(w.from.item) && by.has(w.to.item));
  if(!list.length) return;
  const vals = lgEval(page);
  const SVH = svhOf(idx);
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', LG_SVG);
  svg.setAttribute('viewBox', '0 0 ' + SVW + ' ' + SVH);
  svg.setAttribute('preserveAspectRatio', 'none');
  wrap.appendChild(svg);
  const fan = {};
  for(const w of list) fan[lgJoint(w)] = (fan[lgJoint(w)] || 0) + 1;
  const drawn = {};
  for(const w of list){
    const a = lgAnchor(wrap, svg, SVW, SVH, w.from.item, w.from.port);
    const b = lgAnchor(wrap, svg, SVW, SVH, w.to.item, w.to.port);
    if(!a || !b) continue;
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('class', 'lgl');
    p.setAttribute('data-v', lgWireVal(vals, w));
    p.setAttribute('d', lgPath(a, b, by.get(w.from.item).rot, by.get(w.to.item).rot,
      w.clean, w.route));
    svg.appendChild(p);
    if(fan[lgJoint(w)] > 1 && !drawn[lgJoint(w)]){
      drawn[lgJoint(w)] = 1;
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'lgjn');
      c.setAttribute('data-v', lgWireVal(vals, w));
      c.setAttribute('cx', rd1(a.x)); c.setAttribute('cy', rd1(a.y));
      svg.appendChild(c);
    }
  }
}
onPageOverlay(lgStaticWires);

/* ================= putting a small circuit in order =================
   Marquee selection belongs to core; circuit layout belongs here. The action
   is offered only when the picked logic items form one connected component.
   Ranks follow signal flow, with flip-flops treated as new sources so their
   feedback leads do not turn an ordinary sequential circuit into a layout
   cycle. Items in one rank keep their current vertical order. */
function lgSelectedCircuit(items, page){
  if(!page || items.length < 2 || items.some(it => !lgIsGate(it))) return null;
  const ids = new Set(items.map(it => it.id));
  const wires = lgWires(page).filter(w => w && w.from && w.to &&
    ids.has(w.from.item) && ids.has(w.to.item));
  if(!wires.length) return null;
  const near = new Map(items.map(it => [it.id, []]));
  wires.forEach(w => { near.get(w.from.item).push(w.to.item); near.get(w.to.item).push(w.from.item); });
  const seen = new Set(), todo = [items[0].id];
  while(todo.length){
    const id = todo.pop();
    if(seen.has(id)) continue;
    seen.add(id); near.get(id).forEach(x => { if(!seen.has(x)) todo.push(x); });
  }
  return seen.size === items.length ? { items, wires, ids } : null;
}
function lgCircuitRanks(c){
  const by = new Map(c.items.map(it => [it.id, it]));
  const rank = new Map(c.items.map(it => [it.id, 0]));
  const indeg = new Map(c.items.map(it => [it.id, 0]));
  const next = new Map(c.items.map(it => [it.id, []]));
  /* A flip-flop samples its inputs and starts a new combinational run at Q. */
  for(const w of c.wires){
    if(lgDef(by.get(w.to.item)).seq) continue;
    next.get(w.from.item).push(w.to.item);
    indeg.set(w.to.item, indeg.get(w.to.item) + 1);
  }
  const todo = c.items.filter(it => indeg.get(it.id) === 0)
    .sort((a, b) => a.x - b.x).map(it => it.id);
  const done = new Set();
  while(todo.length){
    const id = todo.shift(); done.add(id);
    for(const dst of next.get(id)){
      rank.set(dst, Math.max(rank.get(dst), rank.get(id) + 1));
      indeg.set(dst, indeg.get(dst) - 1);
      if(indeg.get(dst) === 0) todo.push(dst);
    }
  }
  /* A pure combinational loop cannot be ordered causally. Keep its members
     together after the settled part instead of inventing a misleading order. */
  const last = Math.max(0, ...rank.values());
  c.items.filter(it => !done.has(it.id)).forEach(it => rank.set(it.id, last + 1));
  return rank;
}
function lgTidySelection(items, page){
  const c = lgSelectedCircuit(items, page);
  if(!c) return;
  const surf = document.querySelector('#pageHost .item[data-id="' + items[0].id + '"]')?.parentElement;
  if(!surf) return;
  const sr = surf.getBoundingClientRect(), rank = lgCircuitRanks(c);
  const rows = new Map();
  for(const it of items){
    const r = rank.get(it.id);
    if(!rows.has(r)) rows.set(r, []);
    rows.get(r).push(it);
  }
  const cols = [...rows].sort((a, b) => a[0] - b[0]).map(x => x[1].sort((a, b) => a.y - b.y));
  const width = cols.map(col => Math.max(...col.map(it => it.w || 22)));
  const sumW = width.reduce((n, x) => n + x, 0);
  const gapX = cols.length < 2 ? 0 : clamp((96 - sumW) / (cols.length - 1), 1.8, pctW(44));
  const totalW = sumW + gapX * (cols.length - 1);
  const heights = new Map(items.map(it => {
    const el = surf.querySelector('.item[data-id="' + it.id + '"]');
    return [it.id, el && sr.height ? el.getBoundingClientRect().height / sr.height * 100 : pctH(90)];
  }));
  const left = Math.min(...items.map(it => it.x));
  const right = Math.max(...items.map(it => it.x + (it.w || 22)));
  const top = Math.min(...items.map(it => it.y));
  const bottom = Math.max(...items.map(it => it.y + heights.get(it.id)));
  const centreX = (left + right) / 2, centreY = (top + bottom) / 2;
  let x = clamp(centreX - totalW / 2, 2, Math.max(2, 98 - totalW));
  const targets = [];
  for(let ci = 0; ci < cols.length; ci++){
    const col = cols[ci], gapY = pctH(24);
    const totalH = col.reduce((n, it) => n + heights.get(it.id), 0) + gapY * (col.length - 1);
    let y = clamp(centreY - totalH / 2, 2, Math.max(2, 98 - totalH));
    for(const it of col){
      targets.push({ it, x: x + (width[ci] - (it.w || 22)) / 2, y });
      y += heights.get(it.id) + gapY;
    }
    x += width[ci] + gapX;
  }

  /* Orthogonal routes are a property of these leads, so they survive saving,
     printing and exporting. Moving a gate by hand later leaves the tidy route
     intact until rotation makes a curve the honest representation again. */
  c.wires.forEach(w => { w.clean = 1; w.route = 0; });
  let pending = targets.length * 2, finished = false;
  const moving = [];
  const finish = () => {
    if(finished) return;
    finished = true;
    moving.forEach(m => { if(m.el) m.el._fling = null; });
    queueSave(page.id); syncSelectionDOM(); lgSync(); lgWake();
    lgSay('circuit tidied — its logic and connections are unchanged'); SND.plop();
  };
  const rested = () => { if(--pending === 0) finish(); };
  for(const t of targets){
    const el = surf.querySelector('.item[data-id="' + t.it.id + '"]');
    if(el && el._fling) el._fling();
    t.it.rot = 0;
    if(el) el.style.transform = 'rotate(0deg)';
    const sx = spring({ from: t.it.x, response: .42, damping: 1, rest: .025,
      onUpdate: v => { t.it.x = v; if(el) el.style.left = v + '%'; lgWake(); }, onRest: rested });
    const sy = spring({ from: t.it.y, response: .42, damping: 1, rest: .025,
      onUpdate: v => { t.it.y = v; if(el) el.style.top = v + '%'; lgWake(); }, onRest: rested });
    moving.push({ el, sx, sy, target: t });
  }
  const cancel = () => {
    if(finished) return;
    moving.forEach(m => { m.sx.stopAt(); m.sy.stopAt(); });
    finish();
  };
  moving.forEach(m => { if(m.el) m.el._fling = cancel; });
  moving.forEach(m => { m.sx.to(m.target.x); m.sy.to(m.target.y); });
}
defineSelectionAction({
  id: 'tidy-logic', order: 10, label: '⇥ Tidy logic',
  title: 'Arrange this connected circuit by signal flow and clean up its leads',
  when: (items, page) => !!lgSelectedCircuit(items, page),
  run: lgTidySelection
});

/* ================= making and breaking a connection ================= */
/* the strip along the bottom, borrowed for a sentence about what just happened */
function lgSay(msg){
  const t = $('#saveTag');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(lgSay._t);
  lgSay._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function lgConnect(page, from, to){
  const items = new Map(page.items.filter(lgIsGate).map(x => [x.id, x]));
  const src = items.get(from.item), dst = items.get(to.item);
  if(!src || !dst) return false;
  if(lgDef(src).outs.indexOf(from.port) < 0 || lgDef(dst).ins.indexOf(to.port) < 0) return false;
  if(from.item === to.item){ lgSay('a gate cannot be wired into itself'); SND.nope(); return false; }
  const same = lgWires(page).find(w => w.from.item === from.item && w.from.port === from.port &&
    w.to.item === to.item && w.to.port === to.port);
  if(same) return false;                                  /* the same lead twice is nothing new */
  page.wires = lgWires(page).slice();
  /* One driver per input, always. A lead dropped on an input that already has
     one takes the socket — the same rule as plugging a cable into a jack — and
     the app says so rather than silently dropping one of the two. */
  const had = lgFindWire(page, to.item, to.port);
  if(had) page.wires = page.wires.filter(w => w.id !== had.id);
  page.wires.push({ id: uid(), from: { item: from.item, port: from.port },
                    to: { item: to.item, port: to.port } });
  lgAdvance(page);
  queueSave(page.id);
  lgSync(); lgWake(); SND.pop();
  if(lgVal(page, to.item) === LG_E)
    lgSay('that closes a loop — the gates in it cannot settle, and say so');
  else if(had) lgSay('that input already had a lead — the new one has taken it');
  return true;
}
function lgDisconnect(page, w, quiet){
  page.wires = lgWires(page).filter(x => x.id !== w.id);
  lgAdvance(page);
  queueSave(page.id);
  if(LG_SEL && LG_SEL.w.id === w.id) lgDeselect();
  lgSync(); lgWake();
  if(!quiet) SND.pluck();
}
function lgUnplugAll(page, it){
  const before = lgWires(page).length;
  page.wires = lgWires(page).filter(w => w.from.item !== it.id && w.to.item !== it.id);
  if(page.wires.length === before) return;
  lgAdvance(page);
  queueSave(page.id); lgDeselect(); lgSync(); lgWake(); SND.pluck();
}
function lgToggle(it, page){
  if(lgKind(it) !== 'sw') return;
  it.on = it.on ? 0 : 1;
  lgAdvance(page);
  queueSave(page.id);
  lgSync(); lgWake();
  SND.tick();
}
function lgPress(it, page, on){
  if(lgKind(it) !== 'btn' || !!it.on === !!on) return;
  it.on = on ? 1 : 0;
  lgAdvance(page); queueSave(page.id);
  lgSync(); lgWake(); SND.tick();
}
function lgPauseClock(it, page){
  if(lgKind(it) !== 'clk') return;
  const s = lgClockState(it);
  it.on = s.v; it.paused = !it.paused;
  LG_CLOCK.delete(it.id);
  lgAdvance(page); queueSave(page.id);
  lgSync(); lgWake(); lgClockArm(); SND.tick();
}
const LG_LOOKS = ['lever', 'rocker', 'plain'];
function lgCycleSwitchLook(it, page){
  const at = LG_LOOKS.indexOf(it.look || 'lever');
  it.look = LG_LOOKS[(at + 1) % LG_LOOKS.length];
  queueSave(page.id); lgRedrawItem(it, page); lgSync(); lgWake(); SND.tick();
}

/* ---- pulling a lead ----
   From either end. Dragging off an output looks for an input to land on;
   dragging off an input that already has a lead picks that lead up, which is
   how a wire is moved; dragging off a bare input runs the same gesture
   backwards and looks for an output. */
let LG_DRAG = null;
function lgStartWire(e, it, port, dir, page){
  e.preventDefault(); e.stopPropagation();
  const svg = lgBoard();
  if(!svg) return;
  lgDeselect();
  let anchor = null, want = '';
  if(dir === 'out'){ anchor = { item: it.id, port }; want = 'in'; }
  else {
    const had = lgFindWire(page, it.id, port);
    if(had){ anchor = { item: had.from.item, port: had.from.port }; want = 'in';
             lgDisconnect(page, had, true); }
    else { anchor = { item: it.id, port }; want = 'out'; }
  }
  const ghost = document.createElementNS(SVGNS, 'path');
  ghost.setAttribute('class', 'lghost');
  svg.appendChild(ghost);
  document.body.classList.add('lgwiring');
  /* every port that could take this lead lights up — you are never guessing
     which end of which gate is a legal target */
  document.querySelectorAll('#pageHost .item[data-type="logic"] .lgp').forEach(p => {
    if(p.dataset.dir === want && !p.closest('.item[data-id="' + anchor.item + '"]'))
      p.classList.add('lgok');
  });
  LG_DRAG = { page, anchor, want, ghost, aim: null };

  const mv = ev => {
    const sr = svg.getBoundingClientRect();
    if(!sr.width) return;
    const cur = { x: (ev.clientX - sr.left) / sr.width * BOARD.vw,
                  y: (ev.clientY - sr.top) / sr.height * BOARD.vh };
    const wrap = BOARD.wraps[page.id];
    const a = lgAnchor(wrap, svg, BOARD.vw, BOARD.vh, anchor.item, anchor.port) || cur;
    const hit = lgPortUnder(ev, want, anchor.item);
    if((hit && hit.el) !== (LG_DRAG.aim && LG_DRAG.aim.el)){
      if(LG_DRAG.aim) LG_DRAG.aim.el.classList.remove('lgaim');
      LG_DRAG.aim = hit;
      if(hit) hit.el.classList.add('lgaim');
    }
    /* the ghost snaps onto a target it is over, so the lead is seen to land */
    let end = cur;
    if(hit){
      const p = lgAnchor(wrap, svg, BOARD.vw, BOARD.vh, hit.it.id, hit.port);
      if(p) end = p;
    }
    const rotA = (it.rot || 0), rotB = hit ? (hit.it.rot || 0) : rotA;
    ghost.setAttribute('d', want === 'in' ? lgPath(a, end, lgRotOf(page, anchor.item), rotB)
                                          : lgPath(end, a, rotB, lgRotOf(page, anchor.item)));
  };
  const up = ev => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    const aim = LG_DRAG && LG_DRAG.aim;
    lgEndWire();
    if(!aim) return;                                   /* let go over bare paper: nothing joined */
    if(want === 'in') lgConnect(page, anchor, { item: aim.it.id, port: aim.port });
    else lgConnect(page, { item: aim.it.id, port: aim.port }, anchor);
  };
  LG_DRAG.up = up; LG_DRAG.mv = mv;
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  mv(e);
}
const lgRotOf = (page, id) => {
  const it = page.items.find(x => x.id === id);
  return it ? (it.rot || 0) : 0;
};
/* what is under the pointer that this lead could land on */
function lgPortUnder(ev, want, notItem){
  for(const n of document.elementsFromPoint(ev.clientX, ev.clientY)){
    if(!n.closest) continue;
    const p = n.closest('.lgp');
    if(!p || p.dataset.dir !== want) continue;
    const el = p.closest('#pageHost .item');
    if(!el || el.dataset.id === notItem) continue;
    const pg = pageOfEl(el);
    const it = pg && pg.items.find(x => x.id === el.dataset.id);
    if(it) return { el: p, it, port: p.dataset.p, page: pg };
  }
  return null;
}
function lgEndWire(){
  if(!LG_DRAG) return;
  if(LG_DRAG.ghost) LG_DRAG.ghost.remove();
  if(LG_DRAG.aim) LG_DRAG.aim.el.classList.remove('lgaim');
  document.querySelectorAll('.lgp.lgok').forEach(p => p.classList.remove('lgok'));
  document.body.classList.remove('lgwiring');
  LG_DRAG = null;
}
function lgCancelWire(){
  if(!LG_DRAG) return false;
  window.removeEventListener('pointermove', LG_DRAG.mv);
  window.removeEventListener('pointerup', LG_DRAG.up);
  window.removeEventListener('pointercancel', LG_DRAG.up);
  lgEndWire();
  return true;
}

/* ---- picking a lead out, and taking it away ----
   A lead has a hit area far wider than the line you can see, and clicking it
   picks it out. Delete removes it — and so does the ✕ on the chip, because a
   finger has no Delete key. */
let LG_SEL = null, LG_CHIP = null;
function lgSelect(rec){
  lgDeselect();
  select(null);
  if(typeof deselectString === 'function') deselectString();
  LG_SEL = rec;
  const g = lgBoard() && lgBoard().querySelector('g[data-w="' + rec.w.id + '"]');
  if(g) g.classList.add('sel');
  const chip = document.createElement('div');
  chip.className = 'lgchip';
  chip.innerHTML = '<span class="lgv"></span><button title="Remove this lead">✕</button>';
  chip.addEventListener('pointerdown', e => e.stopPropagation());
  chip.querySelector('button').addEventListener('click', e => {
    e.stopPropagation();
    lgDisconnect(rec.page, rec.w);
  });
  BOARD.host.appendChild(chip);
  LG_CHIP = chip;
  lgChipMove();
}
/* the chip rides the middle of the lead it belongs to, wherever that has got to */
function lgChipMove(){
  if(!LG_CHIP || !LG_SEL || !BOARD) return;
  const svg = lgBoard();
  const g = svg && svg.querySelector('g[data-w="' + LG_SEL.w.id + '"]');
  const path = g && g.querySelector('.lgl');
  if(!path){ lgDeselect(); return; }
  let mid;
  try{ mid = path.getPointAtLength(path.getTotalLength() / 2); }
  catch(e){ mid = { x: BOARD.vw / 2, y: BOARD.vh / 2 }; }
  LG_CHIP.style.left = (mid.x / BOARD.vw * 100) + '%';
  LG_CHIP.style.top = (mid.y / BOARD.vh * 100) + '%';
  const wrap = BOARD.wraps[LG_SEL.pid];
  LG_CHIP.style.setProperty('--scale', (wrap && wrap.style.getPropertyValue('--scale')) || 1);
  const v = g.getAttribute('data-v');
  LG_CHIP.querySelector('.lgv').textContent = v === LG_E ? 'loop' : v === LG_X ? '?' : v;
}
function lgDeselect(){
  if(LG_CHIP){ LG_CHIP.remove(); LG_CHIP = null; }
  if(LG_SEL){
    const svg = $('#pageHost') && $('#pageHost').querySelector('svg.' + LG_SVG);
    const g = svg && svg.querySelector('g[data-w="' + LG_SEL.w.id + '"]');
    if(g) g.classList.remove('sel');
    LG_SEL = null;
  }
}

/* ---- the keyboard ----
   Ahead of core/keys.js, and only when this file has something on: Escape ends
   a lead being dragged or puts a picked one back, Delete takes a picked lead
   away. Everything else falls straight through. */
window.addEventListener('keydown', e => {
  const t = document.activeElement;
  if(t && (t.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(t.tagName))) return;
  if(e.key === 'Escape'){
    if(lgCancelWire()){ e.stopPropagation(); e.preventDefault(); return; }
    if(LG_SEL){ e.stopPropagation(); e.preventDefault(); lgDeselect(); return; }
    if(lgTTClose()){ e.stopPropagation(); e.preventDefault(); return; }
  }
  if((e.key === 'Delete' || e.key === 'Backspace') && LG_SEL){
    e.stopPropagation(); e.preventDefault();
    lgDisconnect(LG_SEL.page, LG_SEL.w);
  }
}, true);
window.addEventListener('pointerdown', e => {
  if(LG_SEL && !e.target.closest('.lgchip') && !e.target.closest('svg.' + LG_SVG)) lgDeselect();
});

/* ================= the truth table =================
   Every gate can show the table that IS its behaviour, with the row it is
   standing on lit. An input nothing is wired into means no row is standing —
   the panel says which input, rather than lighting a row that is not true.

   For a custom gate the same panel is the editor: the name, how many inputs,
   and a column of answers you click. For a built-in it is read-only, because a
   built-in AND that did not mean AND would be a trap. */
let LG_TT = null;                                     // {it, page, anchor}
function lgTTEl(){
  let d = $('#lgtt');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'lgtt glass';
  d.id = 'lgtt';
  d.innerHTML = '<div class="lgtth"><b class="lgttn"></b>' +
    '<button class="lgttx" title="Close (Esc)">✕</button></div>' +
    '<div class="lgttedit"></div><div class="lgttbody"></div>' +
    '<div class="lgttnow"></div>' +
    '<div class="lgttfoot"><button class="lgttout" ' +
    'title="Write this table out as an ordinary table on the sheet">Put it on the sheet</button></div>';
  document.body.appendChild(d);
  d.querySelector('.lgttx').addEventListener('click', () => lgTTClose());
  d.querySelector('.lgttout').addEventListener('click', () => {
    if(LG_TT) lgTableOut(LG_TT.it, LG_TT.page);
  });
  d.addEventListener('pointerdown', e => e.stopPropagation());
  return d;
}
function lgTTOpen(it, page, anchor){
  const el = lgTTEl();
  if(el.classList.contains('open') && LG_TT && LG_TT.it === it) return lgTTClose();
  LG_TT = { it, page, anchor };
  lgTTDraw();
  el.classList.add('open');
  /* the same rule the properties popover follows: above the button, else to the
     side, and never over the gate whose behaviour it is explaining */
  placePanel(el, anchor);
}
function lgTTClose(){
  const el = $('#lgtt');
  if(!el || !el.classList.contains('open')) return false;
  LG_TT = null;
  warpOut(el, () => { if(!LG_TT) el.classList.remove('open'); });
  return true;
}
/* redraw the whole panel — the table, the state line and, for a custom gate,
   its controls. Cheap: the biggest table this can hold is 256 rows. */
function lgTTDraw(){
  const el = $('#lgtt');
  if(!el || !LG_TT) return;
  const it = LG_TT.it, page = LG_TT.page, g = lgDef(it);
  const n = g.ins.length, rows = 1 << n;
  el.querySelector('.lgttn').textContent = g.name + (g.custom ? '' : ' — truth table');

  /* the custom gate's own controls; nothing at all for a built-in */
  const ed = el.querySelector('.lgttedit');
  if(g.custom){
    ed.innerHTML = '<label class="lgttrow"><span>Name</span>' +
      '<input class="lgttname" value="' + esc(g.name) + '" maxlength="20" spellcheck="false"></label>' +
      '<div class="lgttrow"><span>Inputs</span><span class="lgttstep">' +
      '<button data-s="-1" title="One fewer">−</button><b>' + n + '</b>' +
      '<button data-s="1" title="One more">+</button></span></div>';
    const nm = ed.querySelector('.lgttname');
    nm.addEventListener('pointerdown', e => e.stopPropagation());
    nm.addEventListener('keydown', e => { e.stopPropagation(); if(e.key === 'Enter') nm.blur(); });
    nm.addEventListener('input', () => {
      lgOwnDef(it).name = nm.value.slice(0, 20);
      queueSave(page.id);
      lgRedrawItem(it, page);
      el.querySelector('.lgttn').textContent = lgDef(it).name;
    });
    ed.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
      const d = lgOwnDef(it);
      const want = clamp(d.n + (+b.dataset.s), 1, LG_MAX_IN);
      if(want === d.n) return;
      /* the answers already written are kept as far as they go */
      const old = d.table.slice();
      d.n = want;
      d.table = new Array(1 << want);
      for(let i = 0; i < d.table.length; i++) d.table[i] = old[i] ? 1 : 0;
      /* a port that has gone takes its lead with it */
      const keep = LG_PORTS.slice(0, want);
      page.wires = lgWires(page).filter(w =>
        !(w.to.item === it.id && keep.indexOf(w.to.port) < 0));
      queueSave(page.id);
      lgRedrawItem(it, page);
      lgTTDraw(); lgSync(); lgWake(); SND.tick();
    }));
  } else ed.innerHTML = '';

  /* which row the gate is actually standing on */
  const vals = lgEval(page), drv = lgDrivers(page, it.id);
  const cur = g.ins.map(p => {
    return lgSignal(vals, drv.get(p));
  });
  const mine = lgOrX(vals.get(it.id));
  const live = mine !== LG_E && cur.every(lgIsBit);
  const at = live ? cur.reduce((a, b) => a * 2 + b, 0) : -1;

  let s = '<table class="lgttt"><thead><tr>' +
    g.ins.map(p => '<th>' + esc(p) + '</th>').join('') +
    '<th class="out">' + esc(g.outs[0] || 'out') + '</th></tr></thead><tbody>';
  for(let i = 0; i < rows; i++){
    s += '<tr' + (i === at ? ' class="on"' : '') + '>';
    for(let k = 0; k < n; k++) s += '<td>' + ((i >> (n - 1 - k)) & 1) + '</td>';
    s += '<td class="out"' + (g.custom
      ? ' data-r="' + i + '" tabindex="0" role="button" title="Click to turn this answer over"' : '') +
      '>' + (g.table[i] ? 1 : 0) + '</td></tr>';
  }
  el.querySelector('.lgttbody').innerHTML = s + '</tbody></table>';
  if(g.custom) el.querySelectorAll('.lgttt td[data-r]').forEach(td => {
    const flip = () => {
      const d = lgOwnDef(it), i = +td.dataset.r;
      d.table[i] = d.table[i] ? 0 : 1;
      queueSave(page.id);
      lgTTDraw(); lgSync(); lgWake(); SND.tick();
    };
    td.addEventListener('click', flip);
    td.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); flip(); }
    });
  });

  /* the sentence under it: what it is doing, or why no row is lit */
  const now = el.querySelector('.lgttnow');
  if(mine === LG_E) now.textContent = 'this gate is in a loop — nothing settles, so no row is true';
  else if(!live){
    const bare = g.ins.filter((p, i) => !lgIsBit(cur[i]));
    now.textContent = (bare.length === 1 ? 'input ' + bare[0] + ' is not driven' :
      'inputs ' + bare.join(', ') + ' are not driven') + ' — no row is true yet';
  } else now.textContent = 'now: ' + g.ins.map((p, i) => p + '=' + cur[i]).join('  ') +
    '  →  ' + (g.outs[0] || 'out') + '=' + mine;
}
/* the panel follows the circuit while it is open */
function lgTTSync(){
  const el = $('#lgtt');
  if(!el || !el.classList.contains('open') || !LG_TT) return;
  /* the gate it is describing may have been deleted underneath it */
  if(!LG_TT.page.items.some(x => x.id === LG_TT.it.id)) return void lgTTClose();
  if(el.contains(document.activeElement) &&
     /INPUT/.test(document.activeElement.tagName)) return;   /* mid-type: leave the box alone */
  lgTTDraw();
}
/* a gate whose shape has changed — a custom one gaining a port — is rebuilt */
function lgRedrawItem(it, page){
  const el = document.querySelector('#pageHost .item[data-id="' + it.id + '"]');
  if(!el) return;
  const old = el.querySelector('.lgw');
  if(!old) return;
  const holder = document.createElement('div');
  holder.innerHTML = lgHTML(it, { live: true, page, idx: index });
  const fresh = holder.firstElementChild;
  const cap = old.querySelector('figcaption');
  const nc = fresh.querySelector('figcaption');
  if(cap && nc) nc.replaceWith(cap);              /* the caption is core's — keep the live one */
  old.replaceWith(fresh);
  lgBind(el, it, page);
  lgWake();
}

/* ---- the same table, as an ordinary table on the paper ----
   Not a picture of one: a real table item, which then sorts, exports, feeds a
   node graph and drops onto a coordinate system like any other. */
function lgTableOut(it, page){
  const g = lgDef(it), n = g.ins.length, cols = n + 1;
  const rows = [g.ins.concat([g.outs[0] || 'out'])];
  for(let i = 0; i < (1 << n); i++){
    const r = [];
    for(let k = 0; k < n; k++) r.push(String((i >> (n - 1 - k)) & 1));
    r.push(String(g.table[i] ? 1 : 0));
    rows.push(r);
  }
  const t = { id: uid(), type: 'table',
    x: clamp(it.x + pctW(180), 0, 100 - pctW(200)), y: clamp(it.y, 0, 100 - pctH(200)),
    w: clamp(9 * cols * pgK(), minItemW(), 100),
    fs: 15, rot: 0, z: maxZ(page) + 1, lay: curLayerId(),
    rows, cw: rows[0].map(() => 1 / cols), al: rows[0].map(() => 'c'),
    head: 1, ts: 'lines', fmt: {}, cap: g.name + ' — truth table' };
  page.items.push(t);
  queueSave(page.id); SND.plop();
  lgSay('the table is on the sheet beside it');
  render().then(() => { select(t.id); lgWake(); });
}

/* ================= the item ================= */
/* Ports have to take the pointer without the gate being dragged out from under
   it, which is one stopPropagation. A switch is the other way round: swallowing
   its pointerdown would make it the one gate that could not be picked up, so it
   toggles on a pointerup the hand did not move — a click, told from a drag by
   how far it went. */
function lgBind(el, it, page){
  const w = el.querySelector('.lgw');
  if(!w) return;
  w.querySelectorAll('.lgp').forEach(p => {
    p.addEventListener('pointerdown', e =>
      lgStartWire(e, it, p.dataset.p, p.dataset.dir, page));
  });
  const tap = w.querySelector('.lgsw,.lgclock');
  if(tap){
    let dn = null;
    el.addEventListener('pointerdown', e => {
      dn = e.target.closest('.lgp') ? null : { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', e => {
      const d = dn; dn = null;
      if(!d || e.target.closest('.lgp')) return;
      if(Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;   /* that was a drag */
      lgKind(it) === 'sw' ? lgToggle(it, page) : lgPauseClock(it, page);
    });
    tap.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault(); e.stopPropagation();
        lgKind(it) === 'sw' ? lgToggle(it, page) : lgPauseClock(it, page);
      }
    });
  }
  const btn = w.querySelector('.lgbtn');
  if(btn){
    const down = e => {
      if(!e.target.closest('.lgpress')) return;
      e.preventDefault(); e.stopPropagation();
      try{ btn.setPointerCapture(e.pointerId); }catch(err){}
      lgPress(it, page, true);
    };
    const up = e => { if(it.on){ e.preventDefault(); e.stopPropagation(); lgPress(it, page, false); } };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('keydown', e => {
      if((e.key === 'Enter' || e.key === ' ') && !e.repeat){
        e.preventDefault(); e.stopPropagation(); lgPress(it, page, true);
      }
    });
    btn.addEventListener('keyup', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); lgPress(it, page, false); }
    });
    btn.addEventListener('blur', () => { if(it.on) lgPress(it, page, false); });
  }
  if(lgKind(it) === 'clk') lgClockArm();
}

defineItem('logic', {
  add: (() => {
    const a = {};
    for(const k in LG_GATES) a['lg-' + k] = base => {
      const it = { ...base, type: 'logic', gate: k, w: 22, rot: 0, cap: '' };
      if(k === 'sw' || k === 'btn') it.on = 0;
      if(k === 'clk'){ it.on = 0; it.hz = 1; it.paused = false; }
      if(LG_GATES[k].seq){ it.q = 0; it.clk = 0; it.w = 24; }
      if(k === 'digit') it.w = 24;
      if(k === 'cust') it.def = { name: 'Custom', n: 2, table: [0, 0, 0, 1] };
      return it;
    };
    return a;
  })(),
  sound: 'pop',
  html: (it, c) => lgHTML(it, c),
  wire(el, it, page){ lgBind(el, it, page); lgWake(); },
  after(it, el, page){ lgSync(); lgWake(); },
  tools(mk, it, el, page){
    const g = lgDef(it);
    if(lgKind(it) === 'sw'){
      mk('⇄', 'Flick it — send a nought or a one', () => lgToggle(it, page));
      mk('▣', 'Switch appearance — lever, rocker or plain 0/1', () => lgCycleSwitchLook(it, page));
    }
    if(lgKind(it) === 'clk'){
      mk(it.paused ? '▶' : 'Ⅱ', it.paused ? 'Run the clock' : 'Pause the clock', b => {
        lgPauseClock(it, page);
        b.textContent = it.paused ? '▶' : 'Ⅱ';
        b.title = it.paused ? 'Run the clock' : 'Pause the clock';
      });
      mk(lgClockHz(it) + 'Hz', 'Clock speed — 0.5, 1, 2 or 4 Hz', b => {
        const hz = [.5, 1, 2, 4], at = hz.indexOf(lgClockHz(it));
        it.on = lgClockValue(it); it.hz = hz[(at + 1) % hz.length]; LG_CLOCK.delete(it.id);
        b.textContent = it.hz + 'Hz'; lgAdvance(page); queueSave(page.id);
        lgSync(); lgWake(); lgClockArm(); SND.tick();
      });
    }
    if(g.seq) mk('Q=' + lgNumeral(it, it.q), 'Set the stored state manually', b => {
      it.q = it.q === LG_1 ? LG_0 : LG_1; b.textContent = 'Q=' + it.q;
      lgAdvance(page); queueSave(page.id); lgSync(); lgWake(); SND.tick();
    });
    if(g.ins.length && g.table)
      mk(g.custom ? '⊞✎' : '⊞',
         g.custom ? 'The truth table — fill it in yourself' : 'The truth table behind this gate',
         b => lgTTOpen(it, page, b));
    mk('⌦', 'Unplug every lead on this gate', () => lgUnplugAll(page, it));
    mk('⧉', 'Another one just like it, beside it', () => {
      const copy = { ...it, id: uid(),
        def: it.def ? { ...it.def, table: (it.def.table || []).slice() } : undefined,
        x: clamp(it.x + pctW(40), 0, 96), y: clamp(it.y + pctH(30), 0, 96), z: maxZ(page) + 1 };
      if(!copy.def) delete copy.def;
      page.items.push(copy);
      queueSave(page.id); SND.plop();
      render().then(() => { select(copy.id); lgSync(); lgWake(); });
    });
  },
  /* a gate that goes takes its leads with it — nothing is left pointing at a
     gate that is not there any more */
  forget(it){
    if(!lgIsGate(it)) return;
    LG_CLOCK.delete(it.id);
    for(const p of openPages()){
      if(!p || !lgWires(p).length) continue;
      const n = p.wires.length;
      p.wires = p.wires.filter(w => w.from.item !== it.id && w.to.item !== it.id);
      if(p.wires.length !== n) queueSave(p.id);
    }
    lgDeselect();
    if(LG_TT && LG_TT.it === it) lgTTClose();
    requestAnimationFrame(() => { lgSync(); lgWake(); });
  },
  /* what it looks like filed away in a folder, and what it is called there */
  fileable: true,
  icon: it => '<svg class="lgicn" viewBox="0 0 100 ' + lgH(it) + '" fill="none" ' +
    'stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' + lgSym(it, true) + '</svg>',
  label: it => lgDef(it).name,
  meta: it => {
    const g = lgDef(it);
    if(!g.ins.length) return g.tip;
    return g.ins.length + (g.ins.length === 1 ? ' input' : ' inputs') +
      (g.outs.length ? ' · ' + g.outs.length + ' output' : ' · a probe');
  }
});
/* a different note is a different circuit: nothing may be left holding a gate
   that is not on the paper any more */
onNoteOpen(() => {
  lgCancelWire(); lgDeselect(); lgTTClose();
  clearTimeout(lgClockTimer); lgClockTimer = 0; LG_CLOCK.clear();
});

/* ================= the palette ================= */
/* The tiles are drawn by the very same builder as the symbols, at icon size, so
   a tile cannot drift from the thing it puts on the paper. */
function lgIcon(kind){
  const it = { gate: kind, on: 0, def: { name: 'Custom', n: 2, table: [0, 0, 0, 1] } };
  const h = lgH(it), k = 22 / LG_VBW;
  return '<g transform="translate(1 ' + rd1((24 - h * k) / 2) + ') scale(' + rd1(k * 100) / 100 +
    ')" stroke-width="' + rd1(1.6 / k) + '">' + lgSym(it, true) + '</g>';
}
const LG_PALETTE = [
  { label: 'Input controls', order: 10, kinds: ['sw', 'btn', 'clk', 'zero', 'one'] },
  { label: 'Output controls', order: 20, kinds: ['lamp', 'digit'] },
  { label: 'Logic gates', order: 30,
    kinds: ['and', 'or', 'not', 'buf', 'nand', 'nor', 'xor', 'xnor', 'tri', 'cust'] },
  { label: 'Flip-flops', order: 40, kinds: ['srff', 'dff', 'jkff', 'tff'] }
];
const LG_ORDER = LG_PALETTE.flatMap(g => g.kinds);
LG_PALETTE.forEach(group => group.kinds.forEach((k, i) => {
  defineIcon('lg-' + k, lgIcon(k));
  defineTool({ kind: 'lg-' + k, cat: 'logic', group: group.label, groupOrder: group.order,
               label: LG_GATES[k].name, icon: 'lg-' + k,
               hint: LG_GATES[k].name + ' — ' + LG_GATES[k].tip, order: 10 + i });
}));

/* ================= how it looks ================= */
addCSS('logic', `
/* ---------- logic gates ---------- */
/* The symbol takes the whole item and keeps its own proportions: an SVG with a
   viewBox and height:auto is as tall as its drawing says, whatever width the
   resize grip gives it. Nothing here is a fixed colour — a gate on kraft paper
   is drawn in kraft ink. */
.lgw{position:relative}
.lgsvg{display:block;width:100%;height:auto;overflow:visible}
.lgw .lgb{fill:var(--paper);stroke:var(--ink);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
.lgw .lgs{fill:none;stroke:var(--ink);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.lgw .lgd{fill:var(--ink);stroke:none}
.lgw .lgnum{fill:var(--ink);stroke:none;font-family:var(--mono);font-size:19px;
  text-anchor:middle;letter-spacing:0}
.lgw .lgnum.lgtiny{font-size:10px;opacity:.75}
.lgw .lgffmark{font-size:16px}
.lgw .lgpinlab{text-anchor:start}.lgw .lgpoutlab{text-anchor:end}
.lgw .lgrock{fill:var(--ink);stroke:var(--ink);stroke-width:2;transition:cx .16s ease,fill .12s}
.lgw[data-gate="sw"][data-v="1"] .lgrock{fill:var(--accent);stroke:var(--accent)}
.lgw .lgpress{fill:var(--paper);stroke:var(--ink);stroke-width:3;transform-origin:center;
  transition:transform .08s ease,fill .08s}
.lgw[data-gate="btn"][data-v="1"] .lgpress{fill:var(--accent);stroke:var(--accent);transform:scale(.86)}
.lgw .lgclkdot{fill:var(--soft);stroke:none}
.lgw[data-gate="clk"][data-v="1"] .lgclkdot{fill:var(--accent)}
.lgw .lgseg{fill:none;stroke:var(--line);stroke-width:5;stroke-linecap:round;opacity:.22}
.lgw .lgseg.on{stroke:var(--accent);opacity:1}
.lgw .lgdigbad{font-size:22px}
/* the lamp: lit is a filled bulb AND four rays, so it still reads as lit in a
   black-and-white print, and "?" when nothing is driving it */
.lgw .lgray{display:none}
.lgw[data-v="1"] .lgray{display:inline}
.lgw[data-v="1"] .lglamp{fill:var(--accent)}
/* only the lit bulb is dark enough to want the numeral in paper — the same rule
   left loose would write a switch's 1, and a custom gate's name, in paper on
   paper and rub them out */
.lgw[data-gate="lamp"][data-v="1"] .lgval{fill:var(--paper)}
.lgw[data-v="x"] .lglamp{stroke-dasharray:5 4;opacity:.75}
.lgw[data-v="x"] .lgval{fill:var(--soft)}
.lgw[data-v="z"] .lgb,.lgw[data-v="z"] .lgs{stroke-dasharray:9 4 2 4;opacity:.72}
.lgw[data-v="e"] .lgb,.lgw[data-v="e"] .lgs{stroke:var(--accent);stroke-dasharray:3 4}
.lgw[data-v="e"] .lgnum{fill:var(--accent)}
/* the ports: a dot you can see, and a hit area three times its size */
.lgw .lghit{fill:transparent;stroke:none;cursor:crosshair;pointer-events:all}
.lgw .lgdot{fill:var(--paper);stroke:var(--soft);stroke-width:2;pointer-events:none}
.lgw .lgp[data-v="1"] .lgdot{fill:var(--accent);stroke:var(--accent)}
.lgw .lgp[data-v="e"] .lgdot{stroke:var(--accent);stroke-dasharray:2 2}
.lgw .lgp[data-v="z"] .lgdot{fill:transparent;stroke-dasharray:4 2}
.lgw .lgp:hover .lgdot{stroke:var(--accent2);stroke-width:3}
.lgw .lgp.lgok .lgdot{stroke:var(--accent2);stroke-width:3}
.lgw .lgp.lgaim .lgdot{fill:var(--accent2);stroke:var(--accent2);stroke-width:4}
.lgw .lgctl{cursor:pointer}
.lgw .lgctl:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* The line is always there, so picking a gate up does not resize it — but the
   word only appears on the gate you have picked. A page of ghost "caption"s
   under a circuit is visual noise that says nothing. */
.lgw figcaption{display:block;font-family:var(--mono);font-size:calc(var(--scale)*10px);
  color:var(--soft);padding-top:calc(var(--scale)*3px);outline:none;letter-spacing:.04em;
  text-align:center;min-height:calc(var(--scale)*13px)}
.item.sel .lgw figcaption:empty::before{content:"caption";opacity:.35}
/* ---- the leads ----
   Never colour alone: a one is bright AND thick, a nought is muted AND thin,
   unknown, high-impedance and loop-error leads each wear a different dash.
   Every state is told from the others with the colour taken away. */
svg.lgwires{position:absolute;inset:0;width:100%;height:100%;z-index:192;pointer-events:none;
  overflow:visible}
svg.lgwires path{fill:none}
svg.lgwires .lgl{stroke:var(--soft);stroke-width:2.2;stroke-linecap:round;opacity:.7}
svg.lgwires [data-v="1"] .lgl,svg.lgwires .lgl[data-v="1"]{stroke:var(--accent);stroke-width:3.4;opacity:1}
svg.lgwires [data-v="x"] .lgl,svg.lgwires .lgl[data-v="x"]{stroke:var(--soft);stroke-dasharray:6 5;opacity:.6}
svg.lgwires [data-v="z"] .lgl,svg.lgwires .lgl[data-v="z"]{stroke:var(--soft);stroke-width:2.2;
  stroke-dasharray:10 4 2 4;opacity:.75}
svg.lgwires [data-v="e"] .lgl,svg.lgwires .lgl[data-v="e"]{stroke:var(--accent);stroke-width:3.4;
  stroke-dasharray:1 5;opacity:1}
svg.lgwires .lghit{stroke:transparent;stroke-width:15;pointer-events:stroke;cursor:pointer}
svg.lgwires g:hover .lgl{stroke-width:4}
svg.lgwires g.sel .lgl{stroke-width:4.4;filter:drop-shadow(0 0 2px rgba(255,255,255,.75))}
/* a junction is a blob; two leads that merely cross have none */
svg.lgwires .lgjn{r:4;fill:var(--soft);stroke:none;opacity:.75}
svg.lgwires .lgjn[data-v="1"]{fill:var(--accent);opacity:1}
svg.lgwires .lgjn[data-v="e"]{fill:var(--accent)}
svg.lgwires .lghost{stroke:var(--accent2);stroke-width:2.4;stroke-dasharray:6 5;opacity:.85}
body.lgwiring .item,body.lgwiring .surface{cursor:crosshair}
.lgchip{position:absolute;z-index:212;display:flex;align-items:center;gap:2px;background:var(--ink);
  border-radius:3px;padding:2px 2px 2px 6px;transform:translate(-50%,-50%)}
.lgchip .lgv{font-family:var(--mono);font-size:calc(var(--scale)*11px);color:var(--paper);opacity:.7}
.lgchip button{font-family:var(--mono);font-size:calc(var(--scale)*11px);line-height:1;
  color:var(--paper);padding:calc(var(--scale)*4px) calc(var(--scale)*5px);border-radius:2px}
.lgchip button:hover{background:var(--accent);color:#fff}
/* ---- the truth-table panel ---- */
.lgtt{position:fixed;z-index:82;display:none;width:250px;max-height:76vh;overflow:auto;
  border-radius:15px;padding:12px 13px 13px;font-family:var(--mono);
  will-change:transform,filter,opacity}
.lgtt.open{display:block}
.lgtth{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.lgtth .lgttn{font-size:10px;font-weight:400;letter-spacing:.18em;text-transform:uppercase;opacity:.85}
.lgttx{padding:3px 8px;border-radius:7px;font-size:12px;color:rgba(233,234,239,.7);
  background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.lgttx:hover{color:#fff;background:rgba(255,255,255,.1)}
.lgttrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0}
.lgttrow span{font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(233,234,239,.62)}
.lgttname{flex:1;min-width:0;background:rgba(255,255,255,.07);border:0;outline:0;border-radius:6px;
  color:inherit;font-family:var(--mono);font-size:11px;padding:4px 6px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.lgttname:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}
.lgttstep{display:flex;align-items:center;gap:7px}
.lgttstep button{width:22px;height:22px;border-radius:7px;font-size:13px;line-height:1;
  color:rgba(233,234,239,.85);background:rgba(255,255,255,.06);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.lgttstep button:hover{background:rgba(255,255,255,.13);color:#fff}
.lgttstep b{min-width:1.6ch;text-align:center;font-size:11px;font-weight:400}
.lgttt{width:100%;border-collapse:collapse;margin:7px 0 4px;font-size:11px;
  font-variant-numeric:tabular-nums}
.lgttt th{font-size:8.5px;font-weight:400;letter-spacing:.13em;text-transform:uppercase;
  color:rgba(233,234,239,.55);padding:3px 0;border-bottom:1px solid rgba(255,255,255,.14)}
.lgttt td{text-align:center;padding:3px 0;color:rgba(233,234,239,.82)}
.lgttt th.out,.lgttt td.out{border-left:1px solid rgba(255,255,255,.14);color:#fff}
.lgttt tr.on td{background:rgba(255,255,255,.11);color:#fff}
.lgttt tr.on td:first-child{border-radius:5px 0 0 5px}
.lgttt tr.on td:last-child{border-radius:0 5px 5px 0}
.lgttt td[data-r]{cursor:pointer;border-radius:5px}
.lgttt td[data-r]:hover{background:var(--accent);color:#fff}
.lgttt td[data-r]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.lgttnow{font-size:9px;line-height:1.5;letter-spacing:.04em;color:rgba(233,234,239,.6);
  padding-top:6px;border-top:1px solid rgba(255,255,255,.09);overflow-wrap:anywhere}
.lgttfoot{margin-top:8px}
.lgttout{width:100%;padding:6px 10px;border-radius:8px;font-size:10px;letter-spacing:.06em;
  color:rgba(233,234,239,.9);background:rgba(255,255,255,.07);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.lgttout:hover{background:var(--accent);color:#fff}
/* a thumb is not a pointer: the port targets grow, and nothing here has ever
   needed hover to be reachable */
@media (pointer:coarse){
  .lgw .lghit{r:17}
  .lgchip button{padding:calc(var(--scale)*7px) calc(var(--scale)*9px)}
  .lgttstep button{width:28px;height:28px}
}
@media (prefers-reduced-motion:reduce){
  .lgw *,svg.lgwires *{transition:none!important;animation:none!important}
}
`);
