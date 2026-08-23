/* Open Note — items/node.js
   nodes: a small dataflow graph, wired up on the page itself */

/* ================= what this is =================
   A table dropped on a coordinate system already plots itself, and that stays
   the quick way to do it. This is the other way: put a few small cards on the
   paper, wire them together, and the numbers run down the wires — pick two
   columns out of forty, multiply one by a constant you can drag on a slider,
   take the log of it, hand the colour in from somewhere else.

   Every node is an ordinary item on the page. It saves, prints, exports and
   folds into a backup like anything else, because it *is* like anything else:
   the graph is nothing but each card remembering the id of whatever is plugged
   into it. There is no separate canvas and no second document.

   What travels down a wire is one of three things and no more — a table of
   numbers, a single number, or a colour — plus a complaint when something
   doesn't add up. See "Nodes" in README.md for how it is used. */

/* ================= the three things a wire carries ================= */
const ND_TBL = 'tbl', ND_NUM = 'num', ND_RGB = 'rgb', ND_ERR = 'err';
const ndErr  = msg => ({ t:ND_ERR, msg:String(msg) });
const ndNum  = v => ({ t:ND_NUM, v:+v });
const ndRgb  = v => ({ t:ND_RGB, v:String(v) });
const ndTbl  = (cols, n) => ({ t:ND_TBL, cols, n });
/* a cell that came out as ±∞ or NaN is not a number, and a gap is better than a
   lie: dividing by zero leaves a hole in the column rather than a spike */
const ndFin  = x => Number.isFinite(x) ? x : null;
const ndIsT  = v => !!v && v.t === ND_TBL;
const ndCols = v => ndIsT(v) ? v.cols.map(c => c.name) : [];
/* how big a table is, in words — what the foot of a card says */
function ndSum(v){
  if(!v) return 'nothing is wired in';
  if(v.t === ND_ERR) return v.msg;
  if(v.t === ND_NUM) return '= ' + mfmt(v.v, 4);
  if(v.t === ND_RGB) return v.v;
  const c = v.cols.length;
  return c + (c === 1 ? ' column · ' : ' columns · ') + v.n + (v.n === 1 ? ' row' : ' rows');
}

/* ---- a table on the page, read as a value ----
   Column-oriented on purpose. Picking columns is then free, arithmetic is one
   pass down an array rather than a walk over cells, and a 50,000-row sheet is a
   handful of plain arrays instead of 50,000 little ones. Words come out as
   gaps: this half of the app is about numbers. */
function ndTableVal(tit){
  const rows = tbRows(tit), view = tbView(tit), head = tbHead(tit) ? 1 : 0;
  const names = tbColNames(tit), nc = names.length, n = Math.max(0, rows.length - head);
  const cols = names.map(nm => ({ name:nm, v:new Array(n) }));
  for(let r = head; r < rows.length; r++){
    const row = view[r] || [];
    for(let c = 0; c < nc; c++) cols[c].v[r - head] = tbCellNum(row[c]);
  }
  return ndTbl(cols, n);
}

/* ================= the kinds of node =================
   Each one says what it is called, what may be plugged into it, what comes out,
   how to work that out, and what its middle looks like. Adding a kind is adding
   an entry here — nothing else in the file mentions any of them by name. */
const ND_OPS = [['+', (a, b) => a + b], ['−', (a, b) => a - b], ['×', (a, b) => a * b],
                ['÷', (a, b) => a / b], ['^', (a, b) => Math.pow(a, b)]];
const ndOpFn = k => (ND_OPS.find(o => o[0] === k) || ND_OPS[2])[1];
const ndOpKey = it => ND_OPS.some(o => o[0] === it.op) ? it.op : '×';
/* a bar with a number on it, and a slider under it — the reason to build a
   graph at all is to be able to drag this and watch the far end move */
function ndSlider(it, key, lo, hi, step){
  const v = nz(it[key], 0);
  return '<input class="nsl" type="range" data-k="' + key + '" min="' + lo + '" max="' + hi +
    '" step="' + step + '" value="' + rd1(clamp(v, lo, hi)) + '">';
}
const ndRgbArr = it => Array.isArray(it.rgb) && it.rgb.length === 3 ? it.rgb : [207, 58, 36];
const ndHexOf = c => '#' +
  c.map(x => clamp(Math.round(+x || 0), 0, 255).toString(16).padStart(2, '0')).join('');
const ndHex = it => ndHexOf(ndRgbArr(it));

/* ---- the colour wheel ----
   `it.rgb` stays what the node is worth — everything downstream reads that and
   nothing else has to know any of this. But a wheel is turned in hue, strength
   and lightness, and going round through red-green-blue loses two of the three
   at the edges: black is every hue at once, and grey is every hue at none. So
   the wheel's own reading is kept beside the colour in `it.hsv`, written every
   time the colour is, and worked back out from the colour when there isn't one
   (an older node, or a hex typed straight in). */
function ndRGB2HSV(c){
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if(d){
    if(mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if(mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, mx ? d / mx : 0, mx];
}
function ndHSV2RGB(h, s, v){
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const p = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return p.map(q => Math.round((q + m) * 255));
}
/* The kept reading is only believed while it still describes the colour, which
   makes it a note of where the dot was rather than a second version of the
   truth. Anything that sets `it.rgb` some other way — an older book, a colour
   out of a backup — simply falls back to working it out. */
function ndHSV(it){
  const c = it.hsv, rgb = ndRgbArr(it);
  if(Array.isArray(c) && c.length === 3 && c.every(Number.isFinite)){
    const q = ndHSV2RGB(c[0], c[1], c[2]);
    if(q[0] === rgb[0] && q[1] === rgb[1] && q[2] === rgb[2]) return c;
  }
  return ndRGB2HSV(rgb);
}
function ndSetHSV(it, h, s, v){
  it.hsv = [h, clamp(s, 0, 1), clamp(v, 0, 1)];
  it.rgb = ndHSV2RGB(it.hsv[0], it.hsv[1], it.hsv[2]);
}
function ndSetRGB(it, c){
  it.rgb = c.map(x => clamp(Math.round(x), 0, 255));
  it.hsv = ndRGB2HSV(it.rgb);
}
/* hue is the angle round from straight up, strength the way out from the middle
   — which is exactly how the conic gradient under it is laid */
const ndWheelAt = (h, s) => ({ x: 50 + s * 50 * Math.sin(h * Math.PI / 180),
                               y: 50 - s * 50 * Math.cos(h * Math.PI / 180) });
const ndWheelHS = (dx, dy) => ({ h: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360,
                                 s: Math.min(1, Math.hypot(dx, dy)) });
/* the lightness slider runs from black to this colour at its brightest */
const ndLumBG = c => 'linear-gradient(90deg,#111,' + ndHexOf(ndHSV2RGB(c[0], c[1], 1)) + ')';
/* how much black is laid over the wheel. Two places want it and both want more
   than rd1's one decimal — eleven steps of it is a stagger you can see while
   the lightness slider is being dragged. */
const ndDim = v => (1 - clamp(v, 0, 1)).toFixed(2);

const NODE_KINDS = {
  pick: {
    name: 'Columns', tip: 'Let some of the columns through and stop the rest',
    ins: [{ lab:'table' }], out: ND_TBL,
    calc(it, ins){
      const a = ins[0];
      if(!a) return ndErr('nothing is wired in');
      if(a.t === ND_ERR) return a;
      if(a.t !== ND_TBL) return ndErr('this wants a table, not a ' + ndWord(a.t));
      /* kept by NAME rather than by position: re-import the sheet with a column
         inserted at the front and the ticks still mean what they meant */
      const keep = Array.isArray(it.keep) ? it.keep : null;
      const cols = keep ? keep.map(nm => a.cols.find(c => c.name === nm)).filter(Boolean) : a.cols;
      if(!cols.length) return ndErr('nothing is ticked');
      return ndTbl(cols, a.n);
    },
    body(it, ins){
      const all = ndCols(ins[0]);
      if(!all.length) return '<div class="nhint">wire a table in and its columns appear here</div>';
      const keep = Array.isArray(it.keep) ? it.keep : null;
      return '<div class="ntick">' + all.map((nm, i) =>
        '<label><input type="checkbox" data-k="keep" data-c="' + esc(nm) + '"' +
        (!keep || keep.indexOf(nm) >= 0 ? ' checked' : '') + '><span>' + esc(nm) + '</span></label>').join('') +
        '</div><div class="nrow"><button data-a="all">all</button><button data-a="none">none</button></div>';
    }
  },
  math: {
    name: 'Arithmetic', tip: 'Add, take away, multiply or divide a whole column at a time',
    ins: [{ lab:'a' }, { lab:'b' }], out: ND_TBL,
    calc(it, ins){
      const a = ins[0];
      if(!a) return ndErr('nothing is wired into a');
      if(a.t === ND_ERR) return a;
      if(a.t !== ND_TBL) return ndErr('a wants a table, not a ' + ndWord(a.t));
      const key = ndOpKey(it), op = ndOpFn(key);
      /* b is either wired in or typed into the box — the box is what you get
         until something is plugged over the top of it */
      const b = ins[1] || ndNum(nz(it.k, 2));
      if(b.t === ND_ERR) return b;
      if(b.t === ND_RGB) return ndErr('a colour is not something to do arithmetic with');
      if(b.t === ND_NUM){
        const k = b.v, lab = ' ' + key + ' ' + mfmt(k, 4);
        return ndTbl(a.cols.map(c => ({ name:c.name + lab,
          v: c.v.map(x => x === null ? null : ndFin(op(x, k))) })), a.n);
      }
      /* two tables: column by column, or one column spread over all of them */
      if(b.cols.length !== 1 && b.cols.length !== a.cols.length)
        return ndErr('a has ' + a.cols.length + ' columns and b has ' + b.cols.length +
                     ' — b wants one, or the same number');
      const n = Math.min(a.n, b.n);
      return ndTbl(a.cols.map((c, i) => {
        const q = b.cols[b.cols.length === 1 ? 0 : i], v = new Array(n);
        for(let r = 0; r < n; r++){
          const x = c.v[r], y = q.v[r];
          v[r] = x === null || y === null ? null : ndFin(op(x, y));
        }
        return { name:c.name + ' ' + key + ' ' + q.name, v };
      }), n);
    },
    body(it, ins){
      const sel = '<select class="nsel" data-k="op" title="What to do to every number">' +
        ND_OPS.map(o => '<option' + (o[0] === ndOpKey(it) ? ' selected' : '') + '>' + o[0] + '</option>').join('') +
        '</select>';
      /* the box goes quiet once something is wired into b — it is still there,
         and still remembers what was typed, but the wire is what counts */
      const wired = !!ins[1];
      return '<div class="nrow">' + sel +
        '<input class="nval" data-k="k" value="' + esc(mfmt(nz(it.k, 2), 6)) + '"' +
        (wired ? ' disabled title="b is wired in — unplug it to type a number here"' :
                 ' title="what to do it by, when nothing is wired into b"') +
        ' spellcheck="false"></div>';
    }
  },
  fn: {
    name: 'Formula', tip: 'Put every number through an expression — sin(x), log(x), x^2',
    ins: [{ lab:'table' }], out: ND_TBL,
    calc(it, ins){
      const a = ins[0];
      if(!a) return ndErr('nothing is wired in');
      if(a.t === ND_ERR) return a;
      if(a.t !== ND_TBL) return ndErr('this wants a table, not a ' + ndWord(a.t));
      const c = mxFn(it.expr);
      if(c.err) return ndErr(c.err);
      if(!c.fn) return ndErr('nothing typed yet — x is each number in turn');
      const f = c.fn, src = String(it.expr || '');
      return ndTbl(a.cols.map(col => {
        const v = new Array(a.n);
        for(let r = 0; r < a.n; r++){
          const x = col.v[r];
          if(x === null){ v[r] = null; continue; }
          let y; try{ y = f(x); }catch(e){ y = NaN; }
          v[r] = ndFin(y);
        }
        /* sin(x) over a column called "temp" is a column called "sin(temp)" —
           what you would have written on the paper yourself */
        return { name: c.usesX ? src.replace(/\bx\b/g, col.name) : col.name, v };
      }), a.n);
    },
    body(it){
      const err = mxFn(it.expr).err || '';
      return '<div class="nrow"><span class="npar">f(x) =</span>' +
        '<input class="nexp" data-k="expr" value="' + esc(it.expr || '') +
        '" spellcheck="false" title="x is each number in turn — sin(x), log(x), x^2, 1/x"></div>' +
        (err ? '<div class="nhint bad">' + esc(err) + '</div>' : '');
    }
  },
  num: {
    name: 'Number', tip: 'A number on a slider — drag it and everything downstream follows',
    ins: [], out: ND_NUM,
    calc: it => ndNum(nz(it.v, 1)),
    body(it){
      const lo = nz(it.lo, 0), hi = nz(it.hi, 10);
      return '<div class="nrow big"><input class="nval wide" data-k="v" value="' +
          esc(mfmt(nz(it.v, 1), 6)) + '" spellcheck="false" title="The number itself"></div>' +
        ndSlider(it, 'v', lo, hi, (hi - lo) / 200 || 0.01) +
        '<div class="nrow ends"><input class="nval sm" data-k="lo" value="' + esc(mfmt(lo, 4)) +
          '" title="Where the slider starts">' +
        '<input class="nval sm" data-k="hi" value="' + esc(mfmt(hi, 4)) + '" title="Where it ends"></div>';
    }
  },
  rgb: {
    name: 'Colour', tip: 'A colour — wire it into a plot to paint what it is drawing',
    ins: [], out: ND_RGB,
    calc: it => ndRgb(ndHex(it)),
    body(it){
      const c = ndHSV(it), at = ndWheelAt(c[0], c[1]), hex = ndHex(it);
      return '<div class="nwheel" title="Drag it: round for the colour, out from the middle ' +
          'for how strong">' +
        '<span class="nwd"></span>' +
        '<span class="nwv" style="opacity:' + ndDim(c[2]) + '"></span>' +
        '<b class="nwdot" style="left:' + rd1(at.x) + '%;top:' + rd1(at.y) +
          '%;background:' + esc(hex) + '"></b></div>' +
        '<input class="nsl nlum" type="range" data-k="val" min="0" max="100" step="1" value="' +
          Math.round(c[2] * 100) + '" title="How light or dark" style="background:' +
          esc(ndLumBG(c)) + '">' +
        '<div class="nrow"><span class="nswatch" style="background:' + esc(hex) + '"></span>' +
        '<input class="nval hex" data-k="hex" value="' + esc(hex) +
          '" spellcheck="false" title="Or type it as #rrggbb"></div>';
    }
  }
};
const ND_ORDER = ['pick', 'math', 'fn', 'num', 'rgb'];
const ndKind = it => NODE_KINDS[it && it.nk] || NODE_KINDS.pick;
const ndWord = t => t === ND_NUM ? 'number' : t === ND_RGB ? 'colour' : t === ND_TBL ? 'table' : 'complaint';

/* ================= working out what a node is worth =================
   Straight recursion up the wires, with two guards. The cache is emptied
   whenever anything changes and refilled on the way down, so a card feeding
   three others is worked out once rather than three times — which is the whole
   difference between a slider that drags and a slider that judders on a sheet
   with 50,000 rows in it. The path is the other guard: a graph wired into a
   circle says so instead of running until the tab gives up. */
let NODE_CACHE = new Map();
const NODE_PATH = new Set();
const nodeBust = () => { NODE_CACHE = new Map(); };

function nodeVal(id){
  if(!id) return null;
  if(NODE_CACHE.has(id)) return NODE_CACHE.get(id);
  if(NODE_PATH.has(id)) return ndErr('these are wired into a circle');
  const f = findItem(id);
  if(!f) return ndErr('what this was reading is not on the page any more');
  NODE_PATH.add(id);
  let v;
  try{
    if(f.it.type === 'table') v = ndTableVal(f.it);
    else if(f.it.type === 'node'){
      const k = ndKind(f.it);
      const ins = (k.ins || []).map((p, i) => nodeVal((f.it.in || [])[i]));
      v = k.calc(f.it, ins) || ndErr('that came back with nothing');
    } else v = ndErr('a ' + f.it.type + ' is not something a node can read');
  }catch(e){ v = ndErr(String((e && e.message) || e)); }
  NODE_PATH.delete(id);
  NODE_CACHE.set(id, v);
  return v;
}
const ndIsNode = id => { const f = findItem(id); return !!(f && f.it.type === 'node'); };
/* does anything upstream of `id` turn out to be `target`? — asked before a wire
   is made, so a circle is refused rather than drawn */
function ndReaches(id, target, seen){
  if(!id) return false;
  if(id === target) return true;
  seen = seen || new Set();
  if(seen.has(id)) return false;
  seen.add(id);
  const f = findItem(id);
  if(!f || f.it.type !== 'node') return false;
  return (f.it.in || []).some(s => ndReaches(s, target, seen));
}

/* ================= pushing the numbers along =================
   The one place anything downstream is brought up to date. `from` is what
   changed — a cell, a slider, a wire — and only the plots that actually read
   through it are redrawn. Pass nothing and everything is done. */
function graphSync(from){
  nodeBust();
  for(const f of pagePlots()){
    let hit = false;
    for(const d of datOf(f.it)){
      if(!d.src) continue;
      if(from && !ndReaches(d.src, from) && !(d.cs && ndReaches(d.cs, from))) continue;
      if(ndPullSeries(d)) hit = true;
    }
    if(hit){ queueSave(f.page.id); mrepaint(f.it); }
  }
  ndPaintCards();
}
/* the same, but at most once a frame: a slider being dragged asks sixty times a
   second and the answer only has to be right when the screen is next painted */
let ndRaf = 0, ndFrom;
function ndTouch(from){
  ndFrom = ndRaf && ndFrom !== from ? null : from;      // two different sources: do the lot
  if(ndRaf) return;
  ndRaf = requestAnimationFrame(() => { ndRaf = 0; const f = ndFrom; ndFrom = undefined; graphSync(f); });
}
/* a series, read from whatever it is plugged into — a table straight off the
   page, or the far end of a chain of nodes */
function ndPullSeries(d){
  const f = d.src ? findItem(d.src) : null;
  if(!f) return false;
  if(f.it.type === 'table') tbSeriesRead(f.it, d);
  else if(f.it.type === 'node') ndReadInto(nodeVal(d.src), d);
  else return false;
  if(d.cs){                                            // a colour node paints it
    const cv = nodeVal(d.cs);
    if(cv && cv.t === ND_RGB) d.c = cv.v;
  }
  return true;
}
/* the node half of tbSeriesRead — same series, same fields, other source */
function ndReadInto(v, d){
  if(!ndIsT(v)){
    d.cols = []; d.pts = [];
    d.lab = v && v.t === ND_ERR ? v.msg : 'nothing wired in';
    d.xl = d.yl = '';
    return d;
  }
  const cols = ndCols(v), n = cols.length;
  const at = (r, c) => c === -1 ? r + 1 : (c < 0 || c >= n ? null : v.cols[c].v[r]);
  const pts = [];
  for(let r = 0; r < v.n; r++){
    const x = at(r, nz(d.xc, 0)), y = at(r, nz(d.yc, 1));
    if(x === null || y === null) continue;
    const ex = nz(d.ex, -2) >= 0 ? at(r, d.ex) : null;
    const ey = nz(d.ey, -2) >= 0 ? at(r, d.ey) : null;
    pts.push([x, y, Math.abs(ex || 0), Math.abs(ey || 0)]);
  }
  d.cols = cols;
  d.xl = nz(d.xc, 0) === -1 ? 'row' : (cols[d.xc] || '');
  d.yl = cols[nz(d.yc, 1)] || '';
  d.lab = d.yl || 'data';
  d.pts = pts;
  return d;
}

/* ================= dropping things on other things =================
   The drag already in the app — pick a card up, carry it onto something else —
   is how a wire gets made without going anywhere near a port. plot.js asks
   here about anything it does not recognise; see `mathDrop` there. */
function ndDropOn(drag, target){
  if(target.type !== 'node') return null;
  if(drag.type === 'node' || drag.type === 'table') return { nd:1 };
  return null;
}
function ndDoDrop(page, it, drop, home){
  ndPlug(drop.it, ndFreePort(drop.it, it.id), it.id);
  it.x = home.x; it.y = home.y;                         // the card goes back where it came from
  queueSave(page.id);
  const el = document.querySelector('#pageHost .item[data-id="' + it.id + '"]');
  if(el){ el.style.left = it.x + '%'; el.style.top = it.y + '%'; }
}
/* which socket a carried card should land in: the first empty one, else the
   last, which is the one a second thing dropped on a node is usually meant for */
function ndFreePort(dst, srcId){
  const ins = ndKind(dst).ins || [];
  const has = dst.in || [];
  for(let i = 0; i < ins.length; i++) if(!has[i]) return i;
  return Math.max(0, ins.length - 1);
}
/* wire `src` into socket `port` of node `dst` — the one way a wire is ever made */
function ndPlug(dst, port, srcId){
  if(!dst || dst.type !== 'node') return false;
  if(srcId === dst.id || ndReaches(srcId, dst.id)){
    ndSay('that would wire it into itself, round in a circle');
    return false;
  }
  dst.in = (dst.in || []).slice();
  dst.in[port] = srcId || null;
  const f = findItem(dst.id);
  if(f) queueSave(f.page.id);
  graphSync();
  ndRedrawAll(); ndWake();
  SND.pop();
  return true;
}
function ndUnplug(dst, port){
  if(!dst || !(dst.in || [])[port]) return;
  dst.in = dst.in.slice();
  dst.in[port] = null;
  const f = findItem(dst.id);
  if(f) queueSave(f.page.id);
  graphSync(); ndRedrawAll(); ndWake(); SND.pluck();
}
/* a node carried onto a coordinate system: a table becomes points, a colour
   paints whichever series is being worked on */
function plotAddNode(f, nit){
  const v = nodeVal(nit.id);
  if(v && v.t === ND_RGB) return ndColourTo(f, nit, v);
  if(!ndIsT(v)){ ndSay(ndSum(v)); return null; }
  const it = f.it, cols = v.cols.length;
  const d = { id:uid(), src:nit.id, c:nextColor(it), s:'solid', m:'dots',
    xc: cols > 1 ? 0 : -1, yc: cols > 1 ? 1 : 0,
    ex:-2, ey:-2, cols:[], lab:'', xl:'', yl:'', pts:[] };
  ndReadInto(v, d);
  datOf(it).push(d);
  if(!(nz(it.ar, 0) > 0)) it.ar = 0.68;                 // it is a chart from here on
  plotFitData(it);
  queueSave(f.page.id); SND.plop();
  select(it.id); selectMath(it.id, 'dat', d.id); syncMathState();
  ndRedrawAll(); ndWake();
  return d;
}
/* A colour has to land on something in particular, and a plot may be drawing
   several things. Whatever is being worked on gets it; failing that, the last
   thing added, which is the one that was just dropped there. */
function ndColourTo(f, nit, v){
  const list = datOf(f.it);
  if(!list.length){ ndSay('there is nothing on that plot to paint yet'); return null; }
  const sel = mathSel && mathSel.pid === f.it.id && mathSel.kind === 'dat'
    ? list.find(d => d.id === mathSel.id) : null;
  const d = sel || list[list.length - 1];
  d.cs = nit.id;
  d.c = v.v;
  queueSave(f.page.id); mrepaint(f.it); SND.pop();
  ndRedrawAll(); ndWake();
  return d;
}
/* the strip along the bottom, borrowed for a sentence about what just failed */
function ndSay(msg){
  const t = $('#saveTag');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(ndSay._t);
  ndSay._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= the wires =================
   Their own overlay, over the whole view like the string board and with the
   same coordinate space, so the geometry the detective board already works out
   — where an item's box is, where a line should leave it — is reused whole.
   They are drawn as flat béziers rather than yarn: this is a circuit, and it
   should not look like it is hanging off a nail. */
const ND_SVG = 'nwires';
function ndBoard(){
  const host = $('#pageHost');
  if(!host || !BOARD) return null;
  let svg = host.querySelector('svg.' + ND_SVG);
  if(!svg){
    svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', ND_SVG);
    svg.setAttribute('preserveAspectRatio', 'none');
    host.appendChild(svg);
  }
  svg.setAttribute('viewBox', '0 0 ' + rd1(BOARD.vw) + ' ' + rd1(BOARD.vh));
  return svg;
}
/* every wire on show, gathered from the cards themselves — there is no separate
   list of them to keep in step, and nothing to go stale */
function ndWireList(){
  const out = [];
  for(const p of openPages()){
    if(!p) continue;
    for(const it of p.items){
      if(it.type === 'node')
        (it.in || []).forEach((s, k) => { if(s) out.push({ pid:p.id, dst:it.id, port:k, src:s }); });
      /* a plot only draws a wire when a node is on the other end: a table
         carried straight onto a plot says so by being on the plot */
      if(it.type === 'plot') for(const d of datOf(it)){
        if(d.src && ndIsNode(d.src)) out.push({ pid:p.id, dst:it.id, port:null, src:d.src, dat:d.id });
        if(d.cs) out.push({ pid:p.id, dst:it.id, port:null, src:d.cs, dat:d.id, col:1 });
      }
    }
  }
  return out;
}
/* where a wire ends: on the socket if there is one to be seen, else on the edge
   of the card facing the other end */
function ndDot(pid, id, port){
  const wrap = BOARD && BOARD.wraps[pid];
  if(!wrap) return null;
  const sel = port == null ? '.nprt.out' : '.nprt.in[data-p="' + port + '"]';
  return wrap.querySelector('.item[data-id="' + id + '"] ' + sel);
}
function ndPageOf(id){
  for(const p of openPages()){
    if(p && p.items.some(x => x.id === id)) return p.id;
  }
  return null;
}
function ndEnds(svg, w){
  const spid = ndPageOf(w.src);
  if(!spid) return null;
  const ad = ndDot(spid, w.src, null), bd = ndDot(w.pid, w.dst, w.port);
  const abox = ad ? null : itemBox(spid, w.src), bbox = bd ? null : itemBox(w.pid, w.dst);
  let a = ad ? pinPoint(svg, BOARD.vw, BOARD.vh, ad) : (abox ? { x:abox.cx, y:abox.cy } : null);
  let b = bd ? pinPoint(svg, BOARD.vw, BOARD.vh, bd) : (bbox ? { x:bbox.cx, y:bbox.cy } : null);
  if(!a || !b) return null;
  if(abox) a = edgePoint(abox, b);
  if(bbox) b = edgePoint(bbox, a);
  return { a, b };
}
/* left to right with a flat shoulder at each end, and the shoulder grows with
   the gap so a long wire bows rather than cutting the corner */
function ndPath(a, b){
  const k = clamp(Math.abs(b.x - a.x) * 0.5 + 18, 24, 130);
  return 'M' + rd1(a.x) + ' ' + rd1(a.y) +
         'C' + rd1(a.x + k) + ' ' + rd1(a.y) + ' ' + rd1(b.x - k) + ' ' + rd1(b.y) +
         ' ' + rd1(b.x) + ' ' + rd1(b.y);
}
const ndKey = w => w.dst + '/' + (w.port == null ? 'p' + (w.dat || '') + (w.col ? 'c' : '') : w.port);
function ndLay(){
  const svg = ndBoard();
  if(!svg) return;
  const want = ndWireList(), keep = {};
  for(const w of want){
    const k = ndKey(w), ends = ndEnds(svg, w);
    if(!ends) continue;
    keep[k] = 1;
    let g = svg.querySelector('g[data-w="' + k + '"]');
    if(!g){
      g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-w', k);
      g.innerHTML = '<path class="nhit"/><path class="nw"/>';
      g.addEventListener('pointerdown', e => e.stopPropagation());
      g.addEventListener('click', e => { e.stopPropagation(); ndCut(w); });
      svg.appendChild(g);
    }
    const d = ndPath(ends.a, ends.b);
    g.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    g.setAttribute('class', 'nwire' + (w.col ? ' col' : ''));
    const line = g.querySelector('.nw');
    if(w.col){                                   // a colour wire is the colour it carries
      const v = nodeVal(w.src);
      line.setAttribute('stroke', v && v.t === ND_RGB ? v.v : '#888');
    } else line.removeAttribute('stroke');
    const t = g.querySelector('title') || g.appendChild(document.createElementNS(SVGNS, 'title'));
    t.textContent = 'Click to unplug';
  }
  svg.querySelectorAll('g[data-w]').forEach(g => { if(!keep[g.dataset.w]) g.remove(); });
}
/* unplug: a wire into a socket comes out of the socket, a wire into a plot
   takes the series (or the paint) off it */
function ndCut(w){
  const f = findItem(w.dst);
  if(!f) return;
  if(w.port != null) return ndUnplug(f.it, w.port);
  const d = datOf(f.it).find(x => x.id === w.dat);
  if(!d) return;
  if(w.col){ delete d.cs; }
  else datOf(f.it).splice(datOf(f.it).indexOf(d), 1);
  queueSave(f.page.id); mrepaint(f.it); SND.pluck();
  ndLay();
}
/* Items move under the pointer and wires have to follow, but nothing tells this
   file when. So it watches the pointer, and keeps laying wires for a moment
   after everything has gone quiet — the same shape as the ropes settling. */
let ndRafW = 0, ndCalm = 0;
function ndWake(){
  ndCalm = 0;
  if(!ndRafW) ndRafW = requestAnimationFrame(ndStep);
}
function ndStep(){
  ndRafW = 0;
  const svg = $('#pageHost') && $('#pageHost').querySelector('svg.' + ND_SVG);
  if(!svg && !document.querySelector('#pageHost .item[data-type="node"]')) return;
  ndLay();
  ndCalm++;
  if(ndCalm < 40) ndRafW = requestAnimationFrame(ndStep);
}
window.addEventListener('pointermove', () => { if($('#pageHost .item[data-type="node"]')) ndWake(); }, true);
window.addEventListener('wheel', () => { if($('#pageHost .item[data-type="node"]')) ndWake(); }, true);
window.addEventListener('resize', () => { if($('#pageHost .item[data-type="node"]')) ndWake(); });

/* ---- the same wires, settled, for a print / an export / a thumbnail ----
   Built from scratch beside a sheet that has just been laid out, in the space
   the static strings use. Only wires with both ends on the sheet. */
function ndStaticWires(wrap, page, idx){
  const here = id => page.items.some(x => x.id === id);
  const list = [];
  for(const it of page.items){
    if(it.type === 'node')
      (it.in || []).forEach((s, k) => { if(s && here(s)) list.push({ dst:it.id, port:k, src:s }); });
    if(it.type === 'plot') for(const d of datOf(it)){
      if(d.src && here(d.src) && page.items.some(x => x.id === d.src && x.type === 'node'))
        list.push({ dst:it.id, port:null, src:d.src });
      if(d.cs && here(d.cs)) list.push({ dst:it.id, port:null, src:d.cs, col:1, c:d.c });
    }
  }
  if(!list.length) return;
  const SVH = svhOf(idx);
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', ND_SVG);
  svg.setAttribute('viewBox', '0 0 ' + SVW + ' ' + SVH);
  svg.setAttribute('preserveAspectRatio', 'none');
  wrap.appendChild(svg);
  const dot = (id, port) => wrap.querySelector('.item[data-id="' + id + '"] ' +
    (port == null ? '.nprt.out' : '.nprt.in[data-p="' + port + '"]'));
  const box = id => {
    const el = wrap.querySelector('.item[data-id="' + id + '"]');
    if(!el) return null;
    const er = el.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    if(!sr.width || !sr.height) return null;
    const fx = SVW / sr.width, fy = SVH / sr.height;
    return { cx:(er.left + er.width / 2 - sr.left) * fx, cy:(er.top + er.height / 2 - sr.top) * fy,
             hw:er.width / 2 * fx, hh:er.height / 2 * fy };
  };
  for(const w of list){
    const ad = dot(w.src, null), bd = dot(w.dst, w.port);
    const ab = ad ? null : box(w.src), bb = bd ? null : box(w.dst);
    let a = ad ? pinPoint(svg, SVW, SVH, ad) : (ab ? { x:ab.cx, y:ab.cy } : null);
    let b = bd ? pinPoint(svg, SVW, SVH, bd) : (bb ? { x:bb.cx, y:bb.cy } : null);
    if(!a || !b) continue;
    if(ab) a = edgePoint(ab, b);
    if(bb) b = edgePoint(bb, a);
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('class', 'nw');
    p.setAttribute('d', ndPath(a, b));
    if(w.col && w.c) p.setAttribute('stroke', w.c);
    svg.appendChild(p);
  }
}
onPageOverlay(ndStaticWires);

/* ---- dragging a wire out of a socket ---- */
function ndStartWire(e, it, port, out){
  e.preventDefault(); e.stopPropagation();
  const svg = ndBoard();
  if(!svg) return;
  /* pulling on a socket that is already plugged picks that wire up rather than
     starting a second one — the usual way to move a lead */
  let from = { id:it.id, out:!!out };
  if(!out && (it.in || [])[port]){
    from = { id:it.in[port], out:true };
    ndUnplug(it, port);
  }
  const ghost = document.createElementNS(SVGNS, 'path');
  ghost.setAttribute('class', 'nghost');
  svg.appendChild(ghost);
  document.body.classList.add('nwiring');
  const mv = ev => {
    const sr = svg.getBoundingClientRect();
    if(!sr.width) return;
    const cur = { x:(ev.clientX - sr.left) / sr.width * BOARD.vw,
                  y:(ev.clientY - sr.top) / sr.height * BOARD.vh };
    const pid = ndPageOf(from.id);
    const d = ndDot(pid, from.id, from.out ? null : port);
    const a = d ? pinPoint(svg, BOARD.vw, BOARD.vh, d)
                : (itemBox(pid, from.id) ? edgePoint(itemBox(pid, from.id), cur) : cur);
    ghost.setAttribute('d', from.out ? ndPath(a, cur) : ndPath(cur, a));
  };
  const up = ev => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    ghost.remove();
    document.body.classList.remove('nwiring');
    ndDropWire(ev, from, it, port, out);
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  mv(e);
}
function ndDropWire(ev, from, it, port, out){
  let hitPort = null, hitItem = null, hitPage = null;
  for(const n of document.elementsFromPoint(ev.clientX, ev.clientY)){
    if(!n.closest) continue;
    const p = n.closest('.nprt');
    const el = n.closest('#pageHost .item');
    if(p && !hitPort) hitPort = p;
    if(el && !hitItem){
      const pg = pageOfEl(el);
      const target = pg && pg.items.find(x => x.id === el.dataset.id);
      if(target){ hitItem = target; hitPage = pg; }
    }
    if(hitItem) break;
  }
  if(!hitItem) return;                                   // dropped on the paper: that unplugs it
  if(out){
    /* out of a card and into something: a socket if one was aimed at, else
       whatever the card was dropped on works it out for itself */
    if(hitItem.type === 'node'){
      const p = hitPort && hitPort.classList.contains('in') ? +hitPort.dataset.p
                                                           : ndFreePort(hitItem, from.id);
      ndPlug(hitItem, p, from.id);
    } else if(hitItem.type === 'plot') plotAddNode({ it:hitItem, page:hitPage }, it);
    return;
  }
  /* pulled out of a socket and dropped on something: that is now what feeds it */
  if(hitItem.type === 'table' || hitItem.type === 'node') ndPlug(it, port, hitItem.id);
}

/* ================= the card =================
   Everything but the caption lives inside one .ndc, which is thrown away and
   written again whenever anything changes. The caption is core's — it binds its
   own editing when the item is built — so it stays outside and is never
   touched. Rebuilding the whole inside is also what keeps the handlers honest:
   there is exactly one pass that attaches them, and nothing to leave behind. */
function ndCoreHTML(it, ins, val){
  const k = ndKind(it), bad = val && val.t === ND_ERR;
  const st = val ? ndSum(val) : (it.st || '');
  let s = '<div class="ndh"><select class="nkind" title="What this node does">' +
    ND_ORDER.map(n => '<option value="' + n + '"' + (n === (it.nk || 'pick') ? ' selected' : '') + '>' +
      esc(NODE_KINDS[n].name) + '</option>').join('') + '</select></div>';
  /* one row per socket, each carrying its own dot — so the dot is wherever the
     row ended up rather than at a distance measured from the top of the card */
  if((k.ins || []).length)
    s += '<div class="nins">' + k.ins.map((p, i) =>
      '<div class="nin' + ((it.in || [])[i] ? ' on' : '') + '">' +
      '<b class="nprt in" data-p="' + i + '" title="' +
        esc(p.lab + ' — drag from here to whatever should feed it') + '"></b>' +
      '<span>' + esc(p.lab) + '</span></div>').join('') + '</div>';
  s += '<div class="ndb">' + (k.body ? k.body(it, ins) : '') + '</div>';
  return s + '<div class="ndf' + (bad ? ' bad' : '') + '">' + esc(st) +
    '<b class="nprt out" title="What comes out — drag it onto a node, or onto a coordinate system"></b>' +
    '</div>';
}
/* A card that cannot work anything out — a print, an export, a thumbnail of
   another book — shows the last thing it was worth. That is kept on the item,
   exactly as a plotted series keeps the points it was given. */
function ndHTML(it, c){
  const k = ndKind(it);
  const ins = c.live ? (k.ins || []).map((p, i) => nodeVal((it.in || [])[i])) : [];
  const val = c.live ? nodeVal(it.id) : null;
  if(c.live){ it.cols = ndCols(ins[0]); it.st = ndSum(val); }
  return '<figure class="body nd nd-' + esc(it.nk || 'pick') + '"><div class="ndc">' +
    ndCoreHTML(it, ins, val) + '</div><figcaption></figcaption></figure>';
}
/* Redraw one card in place. Skipped while it holds the caret, or typing into a
   box would rebuild the box out from under it — and skipped while something on
   it is being held, because a slider focuses itself on the way down but the
   colour wheel is a plain div and would be swept away mid-drag. */
let ndHeld = null;
function ndRedraw(el, it, page){
  if(!el || ndHeld === it.id || el.contains(document.activeElement)) return;
  const fig = el.querySelector('.nd'), core = fig && fig.querySelector('.ndc');
  if(!core) return;
  const k = ndKind(it);
  const ins = (k.ins || []).map((p, i) => nodeVal((it.in || [])[i]));
  const val = nodeVal(it.id);
  it.cols = ndCols(ins[0]); it.st = ndSum(val);
  fig.className = 'body nd nd-' + (it.nk || 'pick');
  core.innerHTML = ndCoreHTML(it, ins, val);
  ndBind(el, it, page);
}
function ndPaintCards(){
  document.querySelectorAll('#pageHost .item[data-type="node"]').forEach(el => {
    const pg = pageOfEl(el);
    const it = pg && pg.items.find(x => x.id === el.dataset.id);
    if(it) ndRedraw(el, it, pg);
  });
}
const ndRedrawAll = () => { ndPaintCards(); ndLay(); };
/* the wheel, the lightness slider, the swatch and the hex box, brought into
   step without rebuilding any of them — which is what lets the wheel be dragged
   at all, since the thing under the finger has to survive the frame */
function ndPaintColour(fig, it){
  const c = ndHSV(it), hex = ndHex(it), at = ndWheelAt(c[0], c[1]);
  const dot = fig.querySelector('.nwdot');
  if(dot){ dot.style.left = rd1(at.x) + '%'; dot.style.top = rd1(at.y) + '%'; dot.style.background = hex; }
  const dim = fig.querySelector('.nwv');
  if(dim) dim.style.opacity = ndDim(c[2]);
  const sw = fig.querySelector('.nswatch');
  if(sw) sw.style.background = hex;
  const hx = fig.querySelector('[data-k="hex"]');
  if(hx && hx !== document.activeElement){ hx.value = hex; hx.classList.remove('bad'); }
  const lum = fig.querySelector('.nsl.nlum');
  if(lum){
    lum.style.background = ndLumBG(c);
    if(lum !== document.activeElement) lum.value = Math.round(c[2] * 100);
  }
}

/* ---- what the controls do ---- */
function ndBind(el, it, page){
  const fig = el.querySelector('.ndc');
  if(!fig) return;
  const save = () => { queueSave(page.id); graphSync(it.id); };
  /* the whole card is a live surface, so nothing in it may start a drag of the
     item itself — the item's own pointerdown is on the outside of this */
  fig.querySelectorAll('input,select,button,.nprt,.nwheel').forEach(n =>
    n.addEventListener('pointerdown', e => e.stopPropagation()));

  fig.querySelectorAll('.nprt').forEach(p => p.addEventListener('pointerdown', e =>
    ndStartWire(e, it, +p.dataset.p, p.classList.contains('out'))));

  const wheel = fig.querySelector('.nwheel');
  if(wheel) wheel.addEventListener('pointerdown', e => {
    e.preventDefault();
    const set = ev => {
      const r = wheel.getBoundingClientRect();
      const hs = ndWheelHS((ev.clientX - (r.left + r.width / 2)) / (r.width / 2),
                           (ev.clientY - (r.top + r.height / 2)) / (r.height / 2));
      ndSetHSV(it, hs.h, hs.s, ndHSV(it)[2]);
      ndPaintColour(fig, it);
      ndTouch(it.id);
    };
    ndHeld = it.id;
    try{ wheel.setPointerCapture(e.pointerId); }catch(err){}
    const up = () => {
      wheel.removeEventListener('pointermove', set);
      wheel.removeEventListener('pointerup', up);
      wheel.removeEventListener('pointercancel', up);
      ndHeld = null;
      queueSave(page.id); graphSync(it.id);
    };
    wheel.addEventListener('pointermove', set);
    wheel.addEventListener('pointerup', up);
    wheel.addEventListener('pointercancel', up);
    set(e);
  });

  const kind = fig.querySelector('.nkind');
  if(kind) kind.addEventListener('change', () => {
    it.nk = kind.value;
    it.in = [];                                    // the sockets are not the same ones any more
    queueSave(page.id); graphSync(); SND.pop();
    ndRedraw(el, it, page); ndWake();
  });

  fig.querySelectorAll('.ndb [data-k]').forEach(n => {
    const key = n.dataset.k;
    if(n.type === 'checkbox'){
      n.addEventListener('change', () => {
        const on = [...fig.querySelectorAll('input[data-k="keep"]')].filter(b => b.checked)
          .map(b => b.dataset.c);
        it.keep = on;
        save(); ndRedraw(el, it, page); ndWake();
      });
      return;
    }
    if(n.type === 'range'){
      /* a slider is the one control that has to keep up with the hand: the
         numbers go down the wires every frame, and only the card's own reading
         is written straight in */
      const run = () => {
        if(key === 'val'){
          const c = ndHSV(it);
          ndSetHSV(it, c[0], c[1], +n.value / 100);
          ndPaintColour(fig, it);
        } else {
          it[key] = +n.value;
          const box = fig.querySelector('.nval[data-k="' + key + '"]');
          if(box) box.value = mfmt(+n.value, 6);
        }
        const ft = fig.querySelector('.ndf');
        if(ft){ ft.textContent = ndSum(ndKind(it).calc(it, [])); ft.classList.remove('bad'); }
        ndTouch(it.id);
      };
      n.addEventListener('input', run);
      n.addEventListener('change', () => { queueSave(page.id); });
      return;
    }
    n.addEventListener('change', () => {
      if(key === 'hex'){
        const m = /^#?([0-9a-f]{6})$/i.exec(String(n.value).trim());
        if(!m){ n.classList.add('bad'); return; }
        ndSetRGB(it, [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)));
      } else if(key === 'expr' || key === 'op'){
        it[key] = n.value;
      } else {
        const q = mxNum(n.value);                  // 1/2 and sqrt(2) are numbers too
        if(q.err){ n.classList.add('bad'); return; }
        it[key] = q.v;
      }
      n.classList.remove('bad');
      save(); ndRedraw(el, it, page); ndWake();
    });
    if(key === 'expr') n.addEventListener('input', () => {
      it.expr = n.value;
      const err = mxFn(n.value).err;
      n.classList.toggle('bad', !!err);
      if(!err){ queueSave(page.id); ndTouch(it.id); }
    });
  });

  fig.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const a = b.dataset.a;
    if(a === 'all') it.keep = null;
    if(a === 'none') it.keep = [];
    save(); ndRedraw(el, it, page); SND.tick(); ndWake();
  }));
}

defineItem('node', {
  add: { node: base => ({ ...base, type:'node', nk:'pick', w:23, rot:0, cap:'', in:[],
                          op:'×', k:2, expr:'', v:1, lo:0, hi:10, rgb:[207, 58, 36] }) },
  sound: 'pop',
  html: (it, c) => ndHTML(it, c),
  after(){ ndWake(); },                            // wire() has already bound it
  tools(mk, it, el, page){
    mk('⌦', 'Unplug everything wired into this', () => {
      it.in = [];
      queueSave(page.id); graphSync(); SND.pluck(); ndRedraw(el, it, page); ndWake();
    });
    mk('⧉', 'Another one just like it, beside it', () => {
      const copy = { ...it, id:uid(), in:(it.in || []).slice(),
        keep:Array.isArray(it.keep) ? it.keep.slice() : it.keep,
        rgb:Array.isArray(it.rgb) ? it.rgb.slice() : it.rgb,
        hsv:Array.isArray(it.hsv) ? it.hsv.slice() : it.hsv,
        x:clamp(it.x + pctW(30), 0, 96), y:clamp(it.y + pctH(24), 0, 96), z:maxZ(page) + 1 };
      page.items.push(copy); queueSave(page.id); SND.plop(); render();
    });
  },
  wire(el, it, page){ ndBind(el, it, page); ndWake(); },
  /* a node that goes takes its wires with it: whatever was reading it is left
     saying so rather than pointing at nothing */
  forget(it){
    for(const p of openPages()){
      if(!p) continue;
      let touched = false;
      for(const x of p.items){
        if(x.type === 'node' && (x.in || []).some(s => s === it.id)){
          x.in = x.in.map(s => s === it.id ? null : s); touched = true;
        }
        if(x.type === 'plot') for(const d of datOf(x)){
          if(d.cs === it.id){ delete d.cs; touched = true; }
        }
      }
      if(touched) queueSave(p.id);
    }
    nodeBust();
  }
  /* No icon/label/peek: a node is not one of the things a folder takes, and a
     graph whose middle is shut inside one would go dark — findItem only knows
     what is out on the page. Filing a whole graph away is worth having, but it
     is a change to what "on the page" means, not a hook. */
});
onNoteOpen(() => nodeBust());

/* ---- how it looks ---- */
addCSS('node', `
/* ---------- nodes ---------- */
.nd{position:relative;font-family:var(--mono);font-size:calc(var(--fs,13)*var(--scale)*1px);
  line-height:1.35;color:var(--ink);background:var(--paper);
  border:1px solid var(--line);border-radius:calc(var(--scale)*3px);
  padding:calc(var(--scale)*6px) calc(var(--scale)*8px) calc(var(--scale)*5px);
  box-shadow:0 calc(var(--scale)*4px) calc(var(--scale)*11px) rgba(0,0,0,.16)}
.nd::before{content:"";position:absolute;left:0;right:0;top:0;height:calc(var(--scale)*3px);
  border-radius:calc(var(--scale)*3px) calc(var(--scale)*3px) 0 0;background:var(--soft);opacity:.5}
.nd-pick::before{background:var(--accent2);opacity:.85}
.nd-math::before{background:var(--accent);opacity:.85}
.nd-fn::before{background:#8c4bb0;opacity:.85}
.nd-num::before{background:#e0a02c;opacity:.9}
.nd-rgb::before{background:linear-gradient(90deg,#cf3a24,#e0a02c,#4f7a34,#2b7d8c);opacity:.95}
.ndh{display:flex;align-items:center;margin-bottom:calc(var(--scale)*4px)}
.nkind{font:inherit;font-size:calc(var(--fs,13)*var(--scale)*.92px);letter-spacing:.05em;
  text-transform:uppercase;color:var(--soft);background:transparent;border:0;outline:none;
  padding:0;width:100%;cursor:pointer}
.nkind:hover{color:var(--ink)}
.nkind option{color:#16191d;background:#fff;text-transform:none;letter-spacing:0}
.ndb{display:flex;flex-direction:column;gap:calc(var(--scale)*4px)}
.nins{display:flex;flex-direction:column;gap:calc(var(--scale)*2px);
  margin-bottom:calc(var(--scale)*3px);font-size:calc(var(--fs,13)*var(--scale)*.85px)}
.nin{position:relative;color:var(--soft);opacity:.8;line-height:1.5}
.nin.on{color:var(--accent2);opacity:1}
.nrow{display:flex;align-items:center;gap:calc(var(--scale)*4px);min-width:0}
.nrow.ends{gap:calc(var(--scale)*4px);justify-content:space-between}
.npar{color:var(--soft);white-space:nowrap}
.nd input,.nd select,.nd button{font:inherit;color:var(--ink);background:transparent;
  border:1px solid var(--line);border-radius:calc(var(--scale)*2px);
  padding:calc(var(--scale)*2px) calc(var(--scale)*4px);outline:none;min-width:0}
.nd input:focus,.nd select:focus{border-color:var(--accent2)}
.nd input.bad{border-color:var(--accent);color:var(--accent)}
.nd button{cursor:pointer;color:var(--soft);padding:calc(var(--scale)*1px) calc(var(--scale)*6px)}
.nd button:hover{color:var(--ink);border-color:var(--soft)}
.nval{width:100%;text-align:right}
.nval.wide{text-align:center;font-size:calc(var(--fs,13)*var(--scale)*1.15px)}
.nval.sm{width:45%;text-align:center;color:var(--soft);font-size:calc(var(--fs,13)*var(--scale)*.85px)}
.nval:disabled{opacity:.4}
.nexp{flex:1}
.nsel{cursor:pointer}
.nsel option{color:#16191d;background:#fff}
.nhint{color:var(--soft);font-style:italic;font-size:calc(var(--fs,13)*var(--scale)*.85px);
  line-height:1.3}
.nhint.bad{color:var(--accent);font-style:normal}
/* the tick list of what may come through — it scrolls once a sheet has more
   columns in it than a card has room for */
.ntick{display:flex;flex-direction:column;gap:calc(var(--scale)*1px);
  max-height:calc(var(--scale)*118px);overflow:auto;padding-right:calc(var(--scale)*2px)}
.ntick label{display:flex;align-items:center;gap:calc(var(--scale)*5px);cursor:pointer;
  white-space:nowrap;overflow:hidden}
.ntick label span{overflow:hidden;text-overflow:ellipsis}
.ntick input{accent-color:var(--accent2);width:calc(var(--scale)*11px);height:calc(var(--scale)*11px);
  border:0;padding:0;flex:none}
.ntick label:hover{color:var(--accent2)}
/* sliders */
.nd .nsl{-webkit-appearance:none;appearance:none;width:100%;height:calc(var(--scale)*4px);
  padding:0;border:0;border-radius:calc(var(--scale)*2px);background:var(--line);cursor:pointer}
.nd .nsl::-webkit-slider-thumb{-webkit-appearance:none;width:calc(var(--scale)*13px);
  height:calc(var(--scale)*13px);border-radius:50%;background:var(--accent);border:0;cursor:grab}
.nd .nsl::-moz-range-thumb{width:calc(var(--scale)*13px);height:calc(var(--scale)*13px);
  border-radius:50%;background:var(--accent);border:0;cursor:grab}
/* ---- the colour wheel ----
   Hue round it, how strong out from the middle, and a slider under it for how
   light. All of it is gradients: nothing is drawn pixel by pixel, so it is
   sharp at any zoom, costs no canvas to keep repainting, and goes into a print
   and an exported book like any other rule. The conic gradient starts at the
   top and runs clockwise, which is exactly how ndWheelAt lays the dot. */
.nwheel{position:relative;width:100%;aspect-ratio:1;max-width:calc(var(--scale)*136px);
  margin:calc(var(--scale)*2px) auto;cursor:crosshair;touch-action:none}
.nwheel .nwd,.nwheel .nwv{position:absolute;inset:0;border-radius:50%}
.nwheel .nwd{background:
  radial-gradient(circle closest-side,#fff,rgba(255,255,255,0)),
  conic-gradient(from 0deg,#f00,#ff0 60deg,#0f0 120deg,#0ff 180deg,#00f 240deg,#f0f 300deg,#f00);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.22)}
.nwheel .nwv{background:#000;pointer-events:none}
.nwdot{position:absolute;width:calc(var(--scale)*13px);height:calc(var(--scale)*13px);
  border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;
  border:calc(var(--scale)*2px) solid #fff;
  box-shadow:0 0 0 1px rgba(0,0,0,.55),0 calc(var(--scale)*1px) calc(var(--scale)*3px) rgba(0,0,0,.45)}
.nd .nsl.nlum{height:calc(var(--scale)*9px);border-radius:calc(var(--scale)*5px);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.22)}
.nd .nsl.nlum::-webkit-slider-thumb{background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.55)}
.nd .nsl.nlum::-moz-range-thumb{background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.55)}
.nswatch{width:calc(var(--scale)*22px);height:calc(var(--scale)*22px);flex:none;
  border-radius:calc(var(--scale)*2px);border:1px solid rgba(0,0,0,.18)}
.nval.hex{flex:1;text-align:center;letter-spacing:.06em}
/* what comes out, in words */
.ndf{position:relative;margin-top:calc(var(--scale)*5px);padding-top:calc(var(--scale)*4px);
  border-top:1px dashed var(--line);color:var(--soft);
  font-size:calc(var(--fs,13)*var(--scale)*.85px);line-height:1.3;overflow-wrap:anywhere}
.ndf.bad{color:var(--accent)}
/* The sockets straddle the edge of the card, half on and half off, so a wire
   lands on the line rather than inside the writing. Each one hangs off the row
   it belongs to — the input off its own label, the output off the line that
   says what comes out — so nothing has to be measured from the top of the card
   and nothing drifts when a node grows a control. */
.nprt{position:absolute;width:calc(var(--scale)*11px);height:calc(var(--scale)*11px);
  border-radius:50%;background:var(--paper);border:calc(var(--scale)*2px) solid var(--soft);
  cursor:crosshair;z-index:4;top:50%}
.nprt.in{left:calc(var(--scale)*-14px);transform:translateY(-50%)}
.nprt.in:hover{transform:translateY(-50%) scale(1.3)}
.nin.on .nprt.in{background:var(--accent2);border-color:var(--accent2)}
.nprt.out{right:calc(var(--scale)*-14px);top:calc(50% + var(--scale)*2px);
  transform:translateY(-50%);background:var(--soft);border-color:var(--soft)}
.nprt.out:hover{transform:translateY(-50%) scale(1.3)}
.nprt:hover{border-color:var(--accent2)}
.nprt.out:hover{background:var(--accent2);border-color:var(--accent2)}
/* the wires themselves */
svg.nwires{position:absolute;inset:0;width:100%;height:100%;z-index:190;pointer-events:none;
  overflow:visible}
svg.nwires path{fill:none}
svg.nwires .nw{stroke:var(--accent2);stroke-width:2.2;stroke-linecap:round}
svg.nwires .nhit{stroke:transparent;stroke-width:13;pointer-events:stroke;cursor:pointer}
svg.nwires g:hover .nw{stroke-width:3.6}
svg.nwires .nghost{stroke:var(--accent2);stroke-width:2.2;stroke-dasharray:6 5;opacity:.8}
body.nwiring .item,body.nwiring .surface{cursor:crosshair}
`);
/* its tile in the palette */
defineTool({ kind:'node', cat:'math', label:'Node', icon:'node', order:30,
  hint:'A card you wire between a table and a plot — pick columns, do arithmetic, run a formula, hand in a slider or a colour' });
