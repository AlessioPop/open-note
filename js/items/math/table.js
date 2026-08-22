/* Open Note — items/table.js
   a table you work in like a spreadsheet: cells, formulas, rows and columns */

/* ================= the table =================
   One item, one grid. Everything is stored as it was typed — a cell is a plain
   string — and a cell that begins with "=" is worked out when the table is
   drawn, so print, the overview and an exported book all show the answers
   without any of them knowing a formula exists.

   A cell compiles $$…$$ like every other writing surface, so an open cell
   gets the maths editor too.

   The layout is a CSS grid rather than a <table> because the row numbers and
   column letters have to line up with rows whose height comes from their own
   wrapped text: in a grid they simply share a track. The first track of each
   axis IS that gutter — always present, so nothing moves when it appears, and
   only painted while the item is selected. */

const TB_STYLES = ['lines', 'grid', 'zebra', 'plain'];
const TB_MINC = 0.04;                    // a column may never be squeezed below this share
const TB_MAXC = SHEET_MAXC, TB_MAXR = SHEET_MAXR;   // as far as an import or a paste may grow one
const TB_VIEW = 15;                      // rows a windowed table shows at once
const TB_VMAX = 400;                     // …and as many as it may be opened out to
const TB_BIG = 25;                       // longer than this and a table arrives windowed

/* ---- the shape of one, normalised ----
   Each of these hands back the array on the item so a caller can splice a row
   or a column straight into it. They must therefore hand back *the same array*
   when it is already in good order — one of these calls the next, and a repair
   that replaced a healthy array would leave whoever asked first holding a copy
   nothing else can see.

   Vetting every cell costs nothing on a table of twelve rows and is the whole
   frame budget on one of fifty thousand — and this is called several times per
   render. So an array that has passed once is remembered by identity: everything
   below edits the rows in place and keeps them strings and all the same length,
   and anything that hands over a *new* array is checked afresh. */
const TB_OK = new WeakSet();
function tbRows(it){
  const rs = it.rows;
  if(TB_OK.has(rs)) return rs;
  if(Array.isArray(rs) && rs.length && Array.isArray(rs[0]) && rs[0].length &&
     rs.every(r => Array.isArray(r) && r.length === rs[0].length &&
                   r.every(v => typeof v === 'string'))){ TB_OK.add(rs); return rs; }
  const src = Array.isArray(rs) && rs.length ? rs : [['']];
  const n = Math.max(1, src.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0));
  it.rows = src.map(r => {
    const a = Array.isArray(r) ? r.slice(0, n) : [];
    while(a.length < n) a.push('');
    return a.map(v => v == null ? '' : String(v));
  });
  TB_OK.add(it.rows);
  return it.rows;
}
const tbNC = it => tbRows(it)[0].length;
function tbCW(it){
  const n = tbNC(it), w = it.cw;
  if(Array.isArray(w) && w.length === n && w.every(v => typeof v === 'number' && v > 0) &&
     Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9) return w;
  const v = Array.isArray(w) && w.length === n ? w.map(x => +x || 0) : [];
  const s = v.reduce((a, b) => a + b, 0);
  it.cw = (!s || v.some(x => x <= 0)) ? Array(n).fill(1 / n) : v.map(x => x / s);
  return it.cw;
}
function tbAl(it){
  const n = tbNC(it), a = it.al;
  if(Array.isArray(a) && a.length === n) return a;
  const v = Array.isArray(a) ? a.slice(0, n) : [];
  while(v.length < n) v.push('l');
  it.al = v;
  return v;
}
const tbHead = it => it.head !== false && it.head !== 0;
/* 0 → A, 25 → Z, 26 → AA */
function tbColName(i){
  let s = '';
  for(i++; i > 0;){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
  return s;
}
/* "B3" → the cell two across and three down */
function tbRef(w){
  const m = /^([A-Za-z]{1,3})([0-9]{1,5})$/.exec(w);
  if(!m || m[2] === '0') return null;
  let c = 0;
  for(const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: +m[2] - 1, c: c - 1 };
}
const tbIsNum = s => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(String(s).trim());

/* ---- what a formula may say ----
   A range hands its cells over as they are, so SUM can add the numbers and
   leave the words alone — the same way a spreadsheet does. */
function tbNum(v){
  if(v && v.err) throw new Error(v.err);           // an error travels up through whatever used it
  if(typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim();
  return tbIsNum(s) ? +s : 0;
}
function tbNums(a){
  const out = [];
  for(const v of a){
    if(v && v.err) throw new Error(v.err);
    if(typeof v === 'number'){ out.push(v); continue; }
    const s = String(v == null ? '' : v).trim();
    if(s !== '' && tbIsNum(s)) out.push(+s);
  }
  return out;
}
const TB_FN = {
  sum:   a => tbNums(a).reduce((s, v) => s + v, 0),
  count: a => tbNums(a).length,
  avg:   a => { const n = tbNums(a); return n.length ? n.reduce((s, v) => s + v, 0) / n.length : 0; },
  min:   a => { const n = tbNums(a); return n.length ? Math.min.apply(null, n) : 0; },
  max:   a => { const n = tbNums(a); return n.length ? Math.max.apply(null, n) : 0; },
  abs:   a => Math.abs(tbNum(a[0])),
  sqrt:  a => Math.sqrt(tbNum(a[0])),
  round: a => { const p = Math.pow(10, a.length > 1 ? tbNum(a[1]) : 0); return Math.round(tbNum(a[0]) * p) / p; },
  /* the four a set of readings is usually asked for. STDEV divides by n−1 —
     a sample of a thing, not the whole of it — which is what a spreadsheet
     means by the name, and STDEVP is there for when it really is the whole. */
  median: a => { const n = tbNums(a).sort((x, y) => x - y), m = n.length >> 1;
                 return !n.length ? 0 : (n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2); },
  stdev:  a => Math.sqrt(tbVar(tbNums(a), 1)),
  stdevp: a => Math.sqrt(tbVar(tbNums(a), 0)),
  var:    a => tbVar(tbNums(a), 1),
  varp:   a => tbVar(tbNums(a), 0)
};
TB_FN.average = TB_FN.avg;
function tbVar(n, ddof){
  if(n.length <= ddof) return 0;
  const m = n.reduce((s, v) => s + v, 0) / n.length;
  return n.reduce((s, v) => s + (v - m) * (v - m), 0) / (n.length - ddof);
}

function tbLex(src){
  const T = [];
  let i = 0;
  while(i < src.length){
    const c = src[i];
    if(/\s/.test(c)){ i++; continue; }
    if(c === '#') throw new Error('#REF');          // what a deleted row left behind
    if(/[0-9.]/.test(c)){
      const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i));
      if(!m) throw new Error('number');
      T.push({ k:'n', v:+m[0] }); i += m[0].length; continue;
    }
    if(/[A-Za-z_]/.test(c)){
      const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i));
      T.push({ k:'w', v:m[0] }); i += m[0].length; continue;
    }
    if('+-*/^(),:'.indexOf(c) >= 0){ T.push({ k:c }); i++; continue; }
    throw new Error('char ' + c);
  }
  return T;
}
/* the expression itself. `val(r,c)` is how it reaches another cell — which is
   also where a circular reference is caught, one level up. */
function tbEval(src, val){
  const T = tbLex(src);
  let p = 0;
  const at = k => !!T[p] && T[p].k === k;
  const eat = k => at(k) ? (p++, true) : false;
  const need = k => { if(!eat(k)) throw new Error('expected ' + k); };
  /* an argument is either one value or a whole block: SUM(A1:B4) */
  function arg(){
    const a = T[p], b = T[p + 1], c = T[p + 2];
    if(a && a.k === 'w' && b && b.k === ':' && c && c.k === 'w'){
      const s = tbRef(a.v), e = tbRef(c.v);
      if(s && e){
        p += 3;
        const out = [];
        for(let r = Math.min(s.r, e.r); r <= Math.max(s.r, e.r); r++)
          for(let n = Math.min(s.c, e.c); n <= Math.max(s.c, e.c); n++) out.push(val(r, n));
        return out;
      }
    }
    return [expr()];
  }
  function prim(){
    if(eat('-')) return -prim();
    if(eat('+')) return prim();
    if(eat('(')){ const v = expr(); need(')'); return v; }
    const t = T[p];
    if(!t) throw new Error('unfinished');
    if(t.k === 'n'){ p++; return t.v; }
    if(t.k === 'w'){
      p++;
      if(at('(')){                                   // a function
        const f = TB_FN[t.v.toLowerCase()];
        if(!f) throw new Error('#NAME');
        p++;
        const args = [];
        if(!eat(')')){ do { args.push.apply(args, arg()); } while(eat(',')); need(')'); }
        return f(args);
      }
      const r = tbRef(t.v);                          // …or another cell
      if(!r) throw new Error('#NAME');
      return tbNum(val(r.r, r.c));
    }
    throw new Error('unexpected');
  }
  const pow  = () => { const a = prim(); return eat('^') ? Math.pow(a, pow()) : a; };
  const term = () => { let a = pow(); for(;;){ if(eat('*')) a *= pow(); else if(eat('/')) a /= pow(); else return a; } };
  function expr(){ let a = term(); for(;;){ if(eat('+')) a += term(); else if(eat('-')) a -= term(); else return a; } }
  const v = expr();
  if(p < T.length) throw new Error('trailing');
  return v;
}
function tbFmtNum(v){
  if(typeof v !== 'number') return String(v == null ? '' : v);
  if(!isFinite(v)) return '#NUM';
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) ? '0' : String(r);
}
/* Every cell as it should be shown: what was typed, unless it is a formula.
   Worked out lazily and remembered, so a column of running totals costs one
   pass however deep it is stacked.

   `which` is the rows actually wanted — the ones on screen, when a big table is
   showing a window of itself. What comes back is then indexed by the real row
   number with gaps where nothing was asked for, and a formula reaching out of
   the window still pulls in whatever it needs, one cell at a time. Leave it out
   and the whole table comes back, which is what a plot reading a column wants. */
function tbView(it, which){
  const rows = tbRows(it), nc = tbNC(it), memo = {}, busy = {};
  const raw = (r, c) => (rows[r] && rows[r][c] != null) ? String(rows[r][c]) : '';
  function val(r, c){
    const k = r + ',' + c;
    if(k in memo) return memo[k];
    const s = raw(r, c).trim();
    if(s.charAt(0) !== '=') return memo[k] = (tbIsNum(s) ? +s : s);
    if(busy[k]) throw new Error('#CYCLE');           // caught by whoever asked for this cell
    busy[k] = 1;
    let v;
    try{ v = tbEval(s.slice(1), val); }
    catch(e){ const m = (e && e.message) || ''; v = { err: m.charAt(0) === '#' ? m : '#ERR' }; }
    delete busy[k];
    return memo[k] = v;
  }
  const out = [];
  const line = r => {
    if(!rows[r] || out[r]) return;
    const o = out[r] = [];
    for(let c = 0; c < nc; c++){
      const s = raw(r, c);
      if(s.trim().charAt(0) !== '='){ o.push({ t:s }); continue; }
      let v;
      try{ v = val(r, c); }catch(e){ v = { err:'#ERR' }; }
      o.push(v && v.err ? { t:v.err, err:1 } : { t:tbFmtNum(v) });
    }
  };
  if(which) which.forEach(line);
  else for(let r = 0; r < rows.length; r++) line(r);
  return out;
}
/* ---- the window a big table shows of itself ----
   Fifty thousand rows is a fine thing to keep and an impossible thing to draw,
   so a table past a certain length shows a band of itself and scrolls by whole
   rows the way a spreadsheet does — not by pixels, because a row is as tall as
   the words wrapped inside it and a pixel scroll would judder. The header row
   is pinned above the band, so what you are reading always has its names on it. */
function tbWin(it){
  const n = tbRows(it).length, h = tbHead(it) ? 1 : 0;
  const body = Math.max(0, n - h);
  const cap = clamp(Math.round(+it.vh || 0), 0, TB_VMAX);
  const on = cap > 0 && body > cap;
  const show = on ? cap : body;
  const top = on ? clamp(Math.round(+it.vr || 0), 0, body - show) : 0;
  const r0 = h + top;
  const list = h ? [0] : [];
  for(let r = r0; r < r0 + show; r++) list.push(r);
  return { on, h, n, body, show, top, r0, r1: r0 + show, list };
}
/* scrolled so the cell the cursor is on is one you can see */
function tbSeeRow(it, r){
  const w = tbWin(it);
  if(!w.on || r < w.h) return false;
  const at = r - w.h;
  const top = at < w.top ? at : at >= w.top + w.show ? at - w.show + 1 : w.top;
  if(top === w.top) return false;
  it.vr = top;
  return true;
}

/* ---- rows and columns come and go ----
   Everything that points at a cell by number has to move with it: the marks in
   it.fmt, and the references inside every formula. A formula that pointed at
   the row just deleted says so rather than quietly meaning something else. */
function tbReref(src, axis, at, delta){
  return src.replace(/\b([A-Za-z]{1,3})(\d{1,5})\b/g, (m, L, N) => {
    const p = tbRef(L + N);
    if(!p) return m;
    const v = axis === 'r' ? p.r : p.c;
    if(delta < 0 && v === at) return '#REF';
    const nv = v >= at ? v + delta : v;
    return axis === 'r' ? tbColName(p.c) + (nv + 1) : tbColName(nv) + (p.r + 1);
  });
}
function tbShift(it, axis, at, delta){
  const f = it.fmt || {}, out = {};
  for(const k in f){
    const p = k.split(','), r = +p[0], c = +p[1];
    const v = axis === 'r' ? r : c;
    if(delta < 0 && v === at) continue;              // that cell went with its row
    const nv = v >= at ? v + delta : v;
    out[(axis === 'r' ? nv : r) + ',' + (axis === 'r' ? c : nv)] = f[k];
  }
  it.fmt = out;
  const rows = tbRows(it);
  for(let r = 0; r < rows.length; r++)
    for(let c = 0; c < rows[r].length; c++)
      if(rows[r][c].charAt(0) === '=') rows[r][c] = tbReref(rows[r][c], axis, at, delta);
}
function tbInsRow(it, at){
  const rows = tbRows(it);
  at = clamp(at, 0, rows.length);
  rows.splice(at, 0, Array(tbNC(it)).fill(''));
  tbShift(it, 'r', at, 1);
  return true;
}
function tbDelRow(it, at){
  const rows = tbRows(it);
  if(rows.length < 2 || at < 0 || at >= rows.length) return false;
  rows.splice(at, 1);
  tbShift(it, 'r', at, -1);
  return true;
}
/* a new column takes its share out of the others, so the table stays the width
   it was — the item's own corner grip is what makes the whole thing wider */
function tbInsCol(it, at){
  const rows = tbRows(it), cw = tbCW(it), al = tbAl(it);
  at = clamp(at, 0, cw.length);
  rows.forEach(r => r.splice(at, 0, ''));
  const share = 1 / (cw.length + 1);
  for(let i = 0; i < cw.length; i++) cw[i] *= 1 - share;
  cw.splice(at, 0, share);
  al.splice(at, 0, al[Math.min(at, al.length - 1)] || 'l');
  tbShift(it, 'c', at, 1);
  return true;
}
function tbDelCol(it, at){
  const rows = tbRows(it), cw = tbCW(it), al = tbAl(it);
  if(cw.length < 2 || at < 0 || at >= cw.length) return false;
  rows.forEach(r => r.splice(at, 1));
  cw.splice(at, 1); al.splice(at, 1);
  const s = cw.reduce((a, b) => a + b, 0);
  for(let i = 0; i < cw.length; i++) cw[i] /= s;
  tbShift(it, 'c', at, -1);
  return true;
}
/* ---- room made on the end ----
   Nothing already in the table moves, so no formula has to be rewritten and no
   mark in it.fmt has to be found again. That is what makes pouring fifty
   thousand rows in one pass rather than fifty thousand of them — inserting a
   row walks every cell in the table, which is fine once and ruinous in a loop. */
function tbGrow(it, nr, nc){
  const rows = tbRows(it), cw = tbCW(it), al = tbAl(it);
  const c0 = cw.length, c1 = clamp(nc, c0, TB_MAXC);
  if(c1 > c0){
    for(const r of rows) for(let c = c0; c < c1; c++) r.push('');
    const share = c0 / c1;                     // the new columns take their room out of the old
    for(let i = 0; i < c0; i++) cw[i] *= share;
    for(let c = c0; c < c1; c++){ cw.push((1 - share) / (c1 - c0)); al.push(al[al.length - 1] || 'l'); }
  }
  const r1 = clamp(nr, rows.length, TB_MAXR);
  for(let r = rows.length; r < r1; r++) rows.push(Array(c1).fill(''));
  return { nr: rows.length, nc: c1 };
}
/* a block of cells laid into the grid from one corner, growing it if it runs out
   of room — which is what a paste is, and an import too */
function tbPour(it, r0, c0, block){
  const wide = block.reduce((m, l) => Math.max(m, l.length), 1);
  tbGrow(it, r0 + block.length, c0 + wide);
  const rows = tbRows(it), nc = tbNC(it);
  let put = 0;
  block.forEach((line, i) => {
    const row = rows[r0 + i];
    if(!row) return;                           // past the end of what a table may hold
    put++;
    line.forEach((v, j) => { if(c0 + j < nc) row[c0 + j] = v == null ? '' : String(v); });
  });
  return { rows: put, cols: Math.min(wide, nc - c0) };
}
/* a block of tab-separated text — what a spreadsheet puts on the clipboard */
function tbSpill(it, r0, c0, text){
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  while(lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return tbPour(it, r0, c0, lines.map(l => l.split('\t')));
}
/* the clipboard without asking for permission to use it: a textarea off the
   side of the world, selected, copied, gone */
function tbClip(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  ta.remove();
}

/* ================= a table, plotted =================
   Drop a table on a coordinate system and two of its columns become the points
   in it. What the plot keeps is a *series* — the numbers, plus the id of the
   table they were read from — and everything below is the half of that the
   table owns: which columns there are, what they are called, and pushing new
   numbers over whenever a cell changes. The drawing is the plot's own, in
   js/items/plot.js. Columns are numbered from 0; -1 on x means the row number
   and -2 on an error column means there isn't one. */
function tbColNames(it){
  const rows = tbRows(it), n = tbNC(it), head = tbHead(it), out = [];
  for(let c = 0; c < n; c++){
    const h = head ? String(rows[0][c] || '').trim() : '';
    out.push(h || ('Column ' + tbColName(c)));
  }
  return out;
}
/* what a cell is worth as a number — its answer if it holds a formula, and
   nothing at all if it holds a word */
function tbCellNum(v){
  if(!v || v.err) return null;
  const s = String(v.t).trim();
  return s !== '' && tbIsNum(s) ? +s : null;
}
/* the columns worth offering as x and y: the ones that are mostly numbers */
function tbNumericCols(it){
  const rows = tbRows(it), view = tbView(it), head = tbHead(it) ? 1 : 0, out = [];
  const body = Math.max(1, rows.length - head);
  for(let c = 0; c < tbNC(it); c++){
    let k = 0;
    for(let r = head; r < rows.length; r++) if(tbCellNum(view[r][c]) !== null) k++;
    if(k * 2 >= body) out.push(c);
  }
  return out;
}
/* fill a series in from the table it was read off: the points, the column names
   the chip offers, and the two headings the axes get called */
function tbSeriesRead(tit, d){
  const rows = tbRows(tit), view = tbView(tit), head = tbHead(tit) ? 1 : 0;
  const cols = tbColNames(tit), n = cols.length;
  const at = (r, c) => c === -1 ? (r - head + 1)
    : (c < 0 || c >= n ? null : tbCellNum(view[r][c]));
  const pts = [];
  for(let r = head; r < rows.length; r++){
    const x = at(r, nz(d.xc, 0)), y = at(r, nz(d.yc, 1));
    if(x === null || y === null) continue;           // a row that is not a point is not one
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
/* a series, asked to look at its source again — a table straight off the page,
   or the far end of a chain of nodes */
function tbSeriesSync(d){
  if(typeof ndPullSeries === 'function') return ndPullSeries(d), d;
  const f = d && d.src ? findItem(d.src) : null;
  if(f && f.it && f.it.type === 'table') tbSeriesRead(f.it, d);
  return d;
}
/* …and the other way round: this table has changed, so anything drawing it is
   out of date. This is what "connected" means — edit a cell, watch the point
   move — and since a plot may be reading the table through a node or three,
   working out who cares is the graph's job. See js/items/node.js. */
function tbSync(tit){
  graphSync(tit.id);
}
/* the table lands on a coordinate system: x and y start on the first two
   columns that hold numbers, and the window walks over to where they are */
function plotAddTable(f, tit){
  const it = f.it, num = tbNumericCols(tit), nc = tbNC(tit);
  const d = { id:uid(), src:tit.id, c:nextColor(it), s:'solid', m:'dots',
    xc: num.length > 1 ? num[0] : -1,
    yc: num.length > 1 ? num[1] : (num.length ? num[0] : Math.min(1, nc - 1)),
    ex: -2, ey: -2, cols:[], lab:'', xl:'', yl:'', pts:[] };
  tbSeriesRead(tit, d);
  datOf(it).push(d);
  /* from here on it is a chart: the picture keeps a shape of its own instead of
     taking one from whatever the two columns happen to be measured in */
  if(!(nz(it.ar, 0) > 0)) it.ar = 0.68;
  plotFitData(it);
  queueSave(f.page.id); SND.plop();
  select(it.id);
  selectMath(it.id, 'dat', d.id);                    // the options come up on the point straight away
  syncMathBar();
  return d;
}

/* ---- what it looks like ---- */
function tbGridHTML(it, live){
  const nc = tbNC(it), cw = tbCW(it), al = tbAl(it), w = tbWin(it);
  const vals = tbView(it, w.list), fmt = it.fmt || {}, head = tbHead(it);
  const cols = cw.map(v => (Math.round(v * 1e4) / 1e4) + 'fr').join(' ');
  let h = '<div class="tgrid"' + (live ? ' tabindex="0"' : '') +
    ' style="grid-template-columns:var(--gut) ' + cols + '">' +
    '<div class="tcorner"' +
      (live ? ' title="Drag the table about — drop it on a coordinate system to plot it"' : '') + '></div>';
  for(let c = 0; c < nc; c++)
    h += '<div class="th" data-c="' + c + '">' +
      (live ? '<i class="tx" data-act="delc" title="Remove this column">✕</i>' : '') +
      '<span class="tlab">' + tbColName(c) + '</span>' +
      (live ? '<i class="tp" data-act="insc" title="Insert a column after this one">+</i>' +
              (c < nc - 1 ? '<i class="tgrip" data-c="' + c + '" title="Drag to set the column width"></i>' : '')
            : '') + '</div>';
  w.list.forEach((r, i) => {
    /* the top row drawn closes the box, whichever row of the table it is */
    const top = i === 0 ? ' ftop' : '';
    h += '<div class="rh' + top + '" data-r="' + r + '"><span class="tlab">' + (r + 1) + '</span>' +
      (live ? '<i class="tx" data-act="delr" title="Remove this row">✕</i>' +
              '<i class="tp" data-act="insr" title="Insert a row below this one">+</i>' : '') + '</div>';
    for(let c = 0; c < nc; c++){
      const f = fmt[r + ',' + c] || '', v = (vals[r] || [])[c] || { t:'' };
      h += '<div class="tc' + (head && r === 0 ? ' hd' : '') + top +
        ((r - (head ? 1 : 0)) % 2 ? ' alt' : '') +
        (f.indexOf('b') >= 0 ? ' b' : '') + (f.indexOf('i') >= 0 ? ' i' : '') +
        (f.indexOf('h') >= 0 ? ' h' : '') + (v.err ? ' err' : '') +
        '" data-r="' + r + '" data-c="' + c + '" data-a="' + esc(al[c]) + '">' + esc(v.t) + '</div>';
    }
  });
  return h + '</div>' + (w.on ? tbBarHTML(w) : '');
}
/* the scrollbar — a band of rows out of the whole length of the table */
function tbBarHTML(w){
  const span = Math.max(1, w.body - w.show);
  const th = Math.max(9, w.show / w.body * 100);
  return '<div class="tsb"><div class="tsbt" style="height:' + rd1(th) +
    '%;top:' + rd1(w.top / span * (100 - th)) + '%"></div></div>';
}
/* ---- the strip under it ----
   What you are looking at, and what the cells you have picked come to. A table
   showing a window of itself has to say so wherever it is read — on the page, in
   print, in an exported book — or an extract reads as the whole thing. */
function tbCountText(it){
  const w = tbWin(it), nc = tbNC(it), bits = [];
  if(w.on) bits.push('rows ' + (w.r0 + 1).toLocaleString() + '–' + w.r1.toLocaleString() +
    ' of ' + w.n.toLocaleString());
  else if(w.n > TB_BIG) bits.push(w.n.toLocaleString() + ' rows');
  if(bits.length) bits.push(nc + (nc === 1 ? ' column' : ' columns'));
  if(it.note) bits.push(it.note);
  return bits.join(' · ');
}
function tbFootHTML(it, live){
  const cnt = tbCountText(it);
  if(!cnt && !live) return '';
  return '<div class="tfoot">' +
    (live ? '<button class="tcount" data-act="vh" title="' + esc(cnt) +
              ' — click to change how many rows show at once">' + esc(cnt) + '</button><span class="tstat"></span>'
          : '<span class="tcount">' + esc(cnt) + '</span>') + '</div>';
}
const tbAddHTML = '<button class="tadd c" data-act="addc" title="Add a column">+</button>' +
                  '<button class="tadd r" data-act="addr" title="Add a row">+</button>';
const tbBoxHTML = (it, live) => tbGridHTML(it, live) + (live ? tbAddHTML : '');
function tbHTML(it, c){
  /* folded down, a table is a shortcut to itself — the same icon, badge and
     label an attachment wears, and a click opens the whole sheet in a window */
  if(it.col) return shortcutHTML(it, c, false);
  const live = c.live;
  return '<figure class="body tbl" data-ts="' + esc(TB_STYLES.indexOf(it.ts) < 0 ? 'lines' : it.ts) + '">' +
    '<div class="tbox' + (tbWin(it).on ? ' win' : '') + '">' + tbBoxHTML(it, live) +
    '</div>' + tbFootHTML(it, live) + '<figcaption></figcaption></figure>';
}
/* ---- what the cells you have picked come to ----
   The line a spreadsheet keeps along the bottom of its window, because it is the
   quickest question anyone asks of a column of readings. */
const tbSig = v => !isFinite(v) ? '—' : String(+v.toPrecision(6));
function tbStatText(it, b){
  const nr = b.r1 - b.r0 + 1, ncol = b.c1 - b.c0 + 1;
  const at = tbColName(b.c0) + (b.r0 + 1);
  if(nr === 1 && ncol === 1) return at;
  const span = at + ':' + tbColName(b.c1) + (b.r1 + 1);
  /* picking the whole of a big table is asking how big it is, not for its mean */
  if(nr * ncol > 20000) return span + ' · ' + nr.toLocaleString() + ' × ' + ncol;
  const list = [];
  for(let r = b.r0; r <= b.r1; r++) list.push(r);
  const view = tbView(it, list), n = [];
  for(let r = b.r0; r <= b.r1; r++){
    const line = view[r];
    if(!line) continue;
    for(let c = b.c0; c <= b.c1; c++){
      const v = tbCellNum(line[c]);
      if(v !== null) n.push(v);
    }
  }
  if(n.length < 2) return span;
  let sum = 0, lo = Infinity, hi = -Infinity;
  for(const v of n){ sum += v; if(v < lo) lo = v; if(v > hi) hi = v; }
  return 'n ' + n.length.toLocaleString() + ' · Σ ' + tbSig(sum) + ' · x̄ ' + tbSig(sum / n.length) +
         ' · s ' + tbSig(Math.sqrt(tbVar(n, 1))) + ' · ' + tbSig(lo) + '…' + tbSig(hi);
}
/* cells compile $$…$$ like every other writing surface in the book */
defineMathBox('.tc');
const tbMath = el => el.querySelectorAll('.tc').forEach(mathify);

/* ---- working in it ---- */
function tbWire(el, it, page){
  const fig = el.querySelector('.tbl');
  const grid = () => el.querySelector('.tgrid');
  const cellAt = (r, c) => el.querySelector('.tc[data-r="' + r + '"][data-c="' + c + '"]');
  /* the cell cursor lives on the element: the toolbar buttons are built before
     this runs and read it back through el.__tb when they are pressed */
  const S = el.__tb = { r:0, c:0, r1:0, c1:0, ed:null };

  const box = () => ({ r0:Math.min(S.r, S.r1), r1:Math.max(S.r, S.r1),
                       c0:Math.min(S.c, S.c1), c1:Math.max(S.c, S.c1) });
  function clampSel(){
    const nr = tbRows(it).length, nc = tbNC(it);
    S.r = clamp(S.r, 0, nr - 1); S.r1 = clamp(S.r1, 0, nr - 1);
    S.c = clamp(S.c, 0, nc - 1); S.c1 = clamp(S.c1, 0, nc - 1);
  }
  /* the range is always in the markup; the stylesheet only shows it while the
     item itself is selected, so an unselected table is just a table */
  function paint(){
    const b = box();
    el.querySelectorAll('.tc').forEach(n => {
      const r = +n.dataset.r, c = +n.dataset.c;
      n.classList.toggle('on', r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1);
      n.classList.toggle('cur', r === S.r && c === S.c);
    });
    el.querySelectorAll('.th').forEach(n =>
      n.classList.toggle('on', +n.dataset.c >= b.c0 && +n.dataset.c <= b.c1));
    el.querySelectorAll('.rh').forEach(n =>
      n.classList.toggle('on', +n.dataset.r >= b.r0 && +n.dataset.r <= b.r1));
    const st = el.querySelector('.tstat');
    if(st) st.textContent = tbStatText(it, b);
  }
  function focusGrid(){ const g = grid(); if(g) g.focus({ preventScroll:true }); }
  const foot = () => {
    const c = el.querySelector('.tcount');
    if(!c) return;
    c.textContent = tbCountText(it);
    c.title = c.textContent + ' — click to change how many rows show at once';
  };
  /* values only — a formula anywhere may have been listening to what changed */
  function refresh(){
    const vals = tbView(it, tbWin(it).list);
    el.querySelectorAll('.tc').forEach(n => {
      const row = vals[+n.dataset.r], v = row && row[+n.dataset.c];
      if(!v) return;
      n.textContent = v.t;
      n.classList.toggle('err', !!v.err);
      mathify(n);
    });
    foot();
  }
  /* the grid itself changed shape — or the window over it moved, which comes to
     the same thing: the rows on screen are not the rows that were there */
  function redraw(quiet){
    const bx = el.querySelector('.tbox');
    if(!bx) return;
    bx.classList.toggle('win', tbWin(it).on);
    bx.innerHTML = tbBoxHTML(it, true);
    tbMath(el);
    clampSel(); foot(); paint();
    if(!quiet) focusGrid();
  }
  S.redraw = redraw;
  /* the window over a long table, moved by whole rows */
  function scrollTo(top){
    const w = tbWin(it);
    if(!w.on) return false;
    const v = clamp(Math.round(top), 0, w.body - w.show);
    if(v === w.top) return false;
    it.vr = v;
    queueSave(page.id);
    redraw(true);
    return true;
  }
  /* the cell cursor has walked off the band — bring the band to it */
  const follow = r => { if(tbSeeRow(it, r == null ? S.r : r)){ queueSave(page.id); redraw(true); } };

  function commit(){
    const e = S.ed;
    if(!e) return;
    S.ed = null;
    el.classList.remove('editing');
    e.n.contentEditable = 'false';
    e.n.classList.remove('ed');
    const v = e.n.textContent.replace(/\s+$/, '');
    const rows = tbRows(it);
    if(rows[e.r] && rows[e.r][e.c] !== v){
      rows[e.r][e.c] = v;
      queueSave(page.id); SND.scratch(); tbSync(it);
    }
    refresh();
  }
  function cancel(){
    const e = S.ed;
    if(!e) return;
    S.ed = null;
    el.classList.remove('editing');
    e.n.contentEditable = 'false';
    e.n.classList.remove('ed');
    refresh();
    focusGrid();
  }
  /* editing shows what was typed — the formula, not its answer */
  function edit(r, c, seed){
    commit();
    if(tbSeeRow(it, r)){ queueSave(page.id); redraw(true); }
    const n = cellAt(r, c);
    if(!n) return;
    S.r = S.r1 = r; S.c = S.c1 = c; paint();
    S.ed = { r, c, n };
    el.classList.add('editing');                     // core lets go of the pointer while this is on
    n.classList.add('ed');
    n.contentEditable = 'true';
    n.textContent = seed != null ? seed : (tbRows(it)[r][c] || '');
    n.focus();
    const sel = getSelection(), rg = document.createRange();
    rg.selectNodeContents(n);
    if(seed != null) rg.collapse(false);             // typing over a cell: caret after the first letter
    sel.removeAllRanges(); sel.addRange(rg);
  }
  function move(dr, dc, ext){
    commit();
    const nr = tbRows(it).length, nc = tbNC(it);
    if(ext){ S.r1 = clamp(S.r1 + dr, 0, nr - 1); S.c1 = clamp(S.c1 + dc, 0, nc - 1); }
    else {
      S.r = S.r1 = clamp(S.r + dr, 0, nr - 1);
      S.c = S.c1 = clamp(S.c + dc, 0, nc - 1);
    }
    follow(ext ? S.r1 : S.r);
    paint(); focusGrid();
  }
  /* Tab walks the table the way a spreadsheet does, and falling off the last
     cell adds another row rather than stopping */
  function step(dir){
    commit();
    const nc = tbNC(it);
    let r = S.r, c = S.c + dir;
    if(c >= nc){ c = 0; r++; }
    if(c < 0){ c = nc - 1; r--; }
    if(r < 0){ r = 0; c = 0; }
    if(r >= tbRows(it).length){
      if(dir < 0){ r = tbRows(it).length - 1; }
      else { tbInsRow(it, r); queueSave(page.id); S.r = S.r1 = r; S.c = S.c1 = c; tbSeeRow(it, r); redraw(); return; }
    }
    S.r = S.r1 = r; S.c = S.c1 = c;
    follow();
    paint(); focusGrid();
  }
  function clearRange(){
    const b = box(), rows = tbRows(it);
    let hit = false;
    for(let r = b.r0; r <= b.r1; r++){
      if(!rows[r]) continue;
      for(let c = b.c0; c <= b.c1; c++)
        if(rows[r][c] !== ''){ rows[r][c] = ''; hit = true; }
    }
    if(!hit) return;
    queueSave(page.id); SND.pluck(); tbSync(it); refresh();
  }
  const asText = () => {
    const b = box(), rows = tbRows(it), out = [];
    for(let r = b.r0; r <= b.r1; r++)
      if(rows[r]) out.push(rows[r].slice(b.c0, b.c1 + 1).join('\t'));
    return out.join('\n');
  };
  function structural(fn){
    if(!fn()) return;
    queueSave(page.id); SND.plop(); tbSync(it); redraw();
  }

  /* ---- the pointer ----
     The first click picks the table up like any other item; once it is
     selected the cells have the mouse, and the corner box is what drags it. */
  el.addEventListener('pointerdown', e => {
    if(!el.classList.contains('sel')) return;
    if(e.target.closest('.tadd')){ e.stopPropagation(); e.preventDefault(); return; }
    const grip = e.target.closest('.tgrip');
    if(grip){ e.stopPropagation(); e.preventDefault(); dragCol(e, +grip.dataset.c); return; }
    const th = e.target.closest('.th'), rh = e.target.closest('.rh');
    if(th || rh){
      e.stopPropagation(); e.preventDefault();
      commit();
      const nr = tbRows(it).length, nc = tbNC(it);
      if(th){ const c = +th.dataset.c; S.c = S.c1 = c; S.r = 0; S.r1 = nr - 1; }
      else   { const r = +rh.dataset.r; S.r = S.r1 = r; S.c = 0; S.c1 = nc - 1; }
      paint(); focusGrid();
      return;
    }
    const tc = e.target.closest('.tc');
    if(!tc) return;                                  // the frame and the corner still drag the item
    const r = +tc.dataset.r, c = +tc.dataset.c;
    if(S.ed && S.ed.r === r && S.ed.c === c){ e.stopPropagation(); return; }  // placing the caret
    e.stopPropagation(); e.preventDefault();
    commit();
    if(e.shiftKey){ S.r1 = r; S.c1 = c; }
    else { S.r = S.r1 = r; S.c = S.c1 = c; }
    paint(); focusGrid();
    dragRange(e);
  }, true);

  /* drag across cells for a range */
  function dragRange(e){
    const pid = e.pointerId;
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      for(const n of document.elementsFromPoint(ev.clientX, ev.clientY)){
        if(!n.classList || !n.classList.contains('tc') || !el.contains(n)) continue;
        const r = +n.dataset.r, c = +n.dataset.c;
        if(r === S.r1 && c === S.c1) return;
        S.r1 = r; S.c1 = c; paint();
        return;
      }
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  /* a column is widened out of its neighbour, so the table keeps its own width */
  function dragCol(e, i){
    const cw = tbCW(it), g = grid();
    if(!g || i >= cw.length - 1) return;
    const w = g.getBoundingClientRect().width;
    if(!w) return;
    const gut = parseFloat(getComputedStyle(g).gridTemplateColumns) || 0;
    const span = Math.max(1, w - gut);               // the gutter is not shared out
    const sx = e.clientX, a0 = cw[i], b0 = cw[i + 1], pid = e.pointerId;
    const pair = a0 + b0;
    const mv = ev => {
      if(ev.pointerId !== pid) return;
      const d = (ev.clientX - sx) / span;
      cw[i] = clamp(a0 + d, TB_MINC, pair - TB_MINC);
      cw[i + 1] = pair - cw[i];
      g.style.gridTemplateColumns = 'var(--gut) ' +
        cw.map(v => (Math.round(v * 1e4) / 1e4) + 'fr').join(' ');
    };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      queueSave(page.id);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ---- reading a long one ----
     The wheel and the scrollbar work whether or not the table is the thing you
     are working in: reading it should not mean picking it up first. Ctrl+wheel
     is left alone, because everywhere else in the app that is the desk's zoom. */
  el.addEventListener('wheel', e => {
    if(e.ctrlKey || e.metaKey) return;
    const w = tbWin(it);
    if(!w.on || !e.target.closest || !e.target.closest('.tbox')) return;
    e.preventDefault(); e.stopPropagation();
    const d = wheelPx(e);
    if(d) scrollTo(w.top + (d > 0 ? 1 : -1) * Math.max(1, Math.round(Math.abs(d) / 42)));
  }, { passive:false });
  el.addEventListener('pointerdown', e => {
    const bar = e.target.closest && e.target.closest('.tsb');
    if(!bar) return;
    e.stopPropagation(); e.preventDefault();
    dragBar(e, bar);
  }, true);
  /* The thumb is measured once, on the way down: every step of the drag rebuilds
     the grid under it, and the node being dragged is gone by the time the next
     event arrives. The track it slides in does not move, so the sums still hold. */
  function dragBar(e, bar){
    const w = tbWin(it), th = bar.querySelector('.tsbt');
    const r = bar.getBoundingClientRect(), tr = th && th.getBoundingClientRect();
    const span = Math.max(1, w.body - w.show);
    const H = tr ? tr.height : 0, track = Math.max(1, r.height - H);
    const inside = tr && e.clientY >= tr.top && e.clientY <= tr.bottom;
    const grab = inside ? e.clientY - tr.top : H / 2;
    const to = y => scrollTo((y - r.top - grab) / track * span);
    to(e.clientY);
    const pid = e.pointerId;
    const mv = ev => { if(ev.pointerId === pid) to(ev.clientY); };
    const up = ev => {
      if(ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ---- the little buttons on the headers, and the two rails ---- */
  fig.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if(!a) return;
    e.stopPropagation(); e.preventDefault();
    const act = a.dataset.act;
    const th = a.closest('.th'), rh = a.closest('.rh');
    if(act === 'insc') structural(() => tbInsCol(it, +th.dataset.c + 1));
    if(act === 'delc') structural(() => tbDelCol(it, +th.dataset.c));
    if(act === 'insr') structural(() => tbInsRow(it, +rh.dataset.r + 1));
    if(act === 'delr') structural(() => tbDelRow(it, +rh.dataset.r));
    if(act === 'addc') structural(() => tbInsCol(it, tbNC(it)));
    if(act === 'addr') structural(() => tbInsRow(it, tbRows(it).length));
    if(act === 'vh'){ tbVH(it); queueSave(page.id); SND.tick(); redraw(true); }
  });
  fig.addEventListener('dblclick', e => {
    const tc = e.target.closest('.tc');
    if(!tc) return;
    e.stopPropagation();
    if(S.ed && S.ed.n === tc) return;
    edit(+tc.dataset.r, +tc.dataset.c);
  });

  /* ---- the keyboard ----
     Everything handled here is stopped from bubbling: the window listener
     would otherwise flip the page on ◀ ▶, open the add menu on Space and
     delete the whole table on Delete. */
  el.addEventListener('keydown', e => {
    if(!e.target.closest || !e.target.closest('.tgrid')) return;   // the caption is not ours
    const k = e.key;
    if(S.ed){
      if(k === 'Escape'){ e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if(k === 'Enter'){ e.preventDefault(); e.stopPropagation(); commit(); move(e.shiftKey ? -1 : 1, 0); return; }
      if(k === 'Tab'){ e.preventDefault(); e.stopPropagation(); step(e.shiftKey ? -1 : 1); return; }
      return;                                        // the rest belongs to the editor
    }
    if(k === 'ArrowUp'   ){ e.preventDefault(); e.stopPropagation(); move(-1, 0, e.shiftKey); return; }
    if(k === 'ArrowDown' ){ e.preventDefault(); e.stopPropagation(); move( 1, 0, e.shiftKey); return; }
    if(k === 'ArrowLeft' ){ e.preventDefault(); e.stopPropagation(); move(0, -1, e.shiftKey); return; }
    if(k === 'ArrowRight'){ e.preventDefault(); e.stopPropagation(); move(0,  1, e.shiftKey); return; }
    /* a page is the band you are looking at, less a row to keep your place */
    if(k === 'PageUp' || k === 'PageDown'){
      e.preventDefault(); e.stopPropagation();
      const w = tbWin(it);
      move(Math.max(1, w.show - 1) * (k === 'PageUp' ? -1 : 1), 0, e.shiftKey);
      return;
    }
    if(k === 'Home' || k === 'End'){
      e.preventDefault(); e.stopPropagation();
      const nr = tbRows(it).length, nc = tbNC(it), far = e.ctrlKey || e.metaKey;
      const r = far ? (k === 'Home' ? 0 : nr - 1) : S.r, c = k === 'Home' ? 0 : nc - 1;
      if(e.shiftKey){ S.r1 = r; S.c1 = c; } else { S.r = S.r1 = r; S.c = S.c1 = c; }
      follow(e.shiftKey ? S.r1 : S.r); paint(); focusGrid();
      return;
    }
    if(k === 'Tab'){ e.preventDefault(); e.stopPropagation(); step(e.shiftKey ? -1 : 1); return; }
    if(k === 'Enter' || k === 'F2'){ e.preventDefault(); e.stopPropagation(); edit(S.r, S.c); return; }
    if(k === 'Delete' || k === 'Backspace'){ e.preventDefault(); e.stopPropagation(); clearRange(); return; }
    if((e.ctrlKey || e.metaKey) && (k === 'a' || k === 'A')){
      e.preventDefault(); e.stopPropagation();
      S.r = 0; S.c = 0; S.r1 = tbRows(it).length - 1; S.c1 = tbNC(it) - 1; paint();
      return;
    }
    if((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'C' || k === 'x' || k === 'X')){
      e.preventDefault(); e.stopPropagation();
      tbClip(asText());
      if(k === 'x' || k === 'X') clearRange();
      focusGrid();
      return;
    }
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(k.length === 1){ e.preventDefault(); e.stopPropagation(); edit(S.r, S.c, k); return; }
  });
  /* A block copied out of a spreadsheet lands as a block. Anything pasted into
     the grid stops here whatever it is: a spreadsheet puts a picture of the
     cells on the clipboard alongside the text, and the window's own paste
     handler would tape that onto the page. */
  el.addEventListener('paste', e => {
    if(!e.target.closest || !e.target.closest('.tgrid')) return;
    e.stopPropagation();
    const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    e.preventDefault();
    if(!/[\t\n]/.test(txt)){                         // one value: straight into the open cell
      if(S.ed) return document.execCommand('insertText', false, txt);
      tbRows(it)[S.r][S.c] = txt;
      queueSave(page.id); tbSync(it); refresh();
      return;
    }
    const r = S.ed ? S.ed.r : S.r, c = S.ed ? S.ed.c : S.c;
    if(S.ed) cancel();
    tbSpill(it, r, c, txt);
    tbFit(it);                                       // a block that made it long shows a band of itself
    queueSave(page.id); SND.plop(); tbSync(it); redraw();
  });
  /* clicking away is a commit — the same as leaving any other box in the book */
  el.addEventListener('focusout', e => {
    if(S.ed && S.ed.n === e.target) setTimeout(() => { if(S.ed && S.ed.n === e.target) commit(); }, 0);
  });

  paint();
}

/* ================= a table that came out of a file =================
   A workbook is read by js/lib/workbook.js, which knows nothing about this app and
   hands back plain rows of plain strings. Everything here is what a table then
   makes of them: how wide the columns want to be, which of them hold numbers,
   whether the first row is names rather than readings, and how much of it to
   show at once. */
const tbName = it => it.name || String(it.cap || '').trim() || 'Table';
function tbMeta(it){
  const n = tbRows(it).length, c = tbNC(it);
  return n.toLocaleString() + (n === 1 ? ' row' : ' rows') + ' · ' +
         c + (c === 1 ? ' column' : ' columns') + (it.note ? ' · ' + it.note : '');
}
/* a long table arrives showing a window of itself rather than sprawling down
   the page — the whole of it is still there, and ⊞ opens it right out */
function tbFit(it){
  const body = tbRows(it).length - (tbHead(it) ? 1 : 0);
  if(!(+it.vh > 0) && body > TB_BIG) it.vh = TB_VIEW;
}
const TB_VHS = [10, 15, 25, 40, 0];      // …and the sizes the count button offers, 0 being all
function tbVH(it){
  const body = tbRows(it).length - (tbHead(it) ? 1 : 0);
  const opts = TB_VHS.filter(v => v > 0 && v < body).concat([0]);
  const cur = clamp(Math.round(+it.vh || 0), 0, TB_VMAX);
  const i = opts.indexOf(cur);
  /* a size that is not one of the ones offered — dragged in from somewhere, or
     the height of a window — steps up to the next one that is */
  if(i < 0){
    const up = opts.findIndex(v => v === 0 || v > cur);
    it.vh = opts[up < 0 ? 0 : up];
  }else it.vh = opts[(i + 1) % opts.length];
  it.vr = 0;
}
/* the first row is names rather than readings if it is words, and there are
   numbers under them */
function tbLooksHead(rows){
  if(rows.length < 2) return false;
  const h = rows[0], nc = h.length;
  let words = 0, nums = 0;
  for(let c = 0; c < nc; c++){
    const s = String(h[c] == null ? '' : h[c]).trim();
    if(s !== '' && !tbIsNum(s)) words++;
    for(let r = 1; r < Math.min(rows.length, 12); r++)
      if(tbIsNum(String(rows[r][c] == null ? '' : rows[r][c]).trim())){ nums++; break; }
  }
  return words >= Math.max(1, nc / 2) && nums > 0;
}
/* A column of numbers reads down its last digit, which is why every spreadsheet
   sets one to the right. Two hundred rows is plenty to tell which is which. */
function tbAutoAlign(it){
  const rows = tbRows(it), h = tbHead(it) ? 1 : 0, nc = tbNC(it), al = tbAl(it);
  const n = Math.min(rows.length, h + 200);
  for(let c = 0; c < nc; c++){
    let num = 0, seen = 0;
    for(let r = h; r < n; r++){
      const s = String(rows[r][c]).trim();
      if(s === '') continue;
      seen++;
      if(tbIsNum(s)) num++;
    }
    al[c] = seen && num * 2 >= seen ? 'r' : 'l';
  }
}
/* …and the columns share the width out by how much is written in them, so a
   column of dates is not the same width as one holding a single digit.

   The heading is measured too, but only so far: "temperature (°C)" over a column
   of four-character readings would take a quarter of the table and leave the
   readings themselves in a ribbon. It may pull a column four characters wider
   than its contents and then it wraps, which is what a heading is for. */
function tbAutoWidth(it){
  const rows = tbRows(it), nc = tbNC(it), h = tbHead(it) ? 1 : 0;
  const n = Math.min(rows.length, 200), w = [];
  for(let c = 0; c < nc; c++){
    let body = 3, head = 0;
    for(let r = 0; r < n; r++){
      const L = Math.min(26, String(rows[r][c]).length);
      if(r === 0 && h) head = L; else body = Math.max(body, L);
    }
    w.push(Math.max(body, Math.min(head, body + 4)) + 3);   // …plus the padding either side
  }
  const s = w.reduce((a, b) => a + b, 0) || 1;
  const v = w.map(x => Math.max(TB_MINC, x / s));
  const t = v.reduce((a, b) => a + b, 0);
  it.cw = v.map(x => x / t);
  return s;                                        // how wide the whole thing wants to be
}
/* one sheet, poured into a table that forgets whatever it held before */
function tbFill(it, sh, name){
  const rows = (sh.rows && sh.rows.length ? sh.rows : [['']]).map(r =>
    (r && r.length ? r : ['']).map(v => v == null ? '' : String(v)));
  it.rows = rows;
  it.fmt = {};
  it.vr = 0;
  it.head = tbLooksHead(rows) ? 1 : 0;
  delete it.sort;                                      // whatever it was sorted by is gone
  if(name){ it.name = name; if(!String(it.cap || '').trim()) it.cap = name; }
  const cut = sh.rowsTotal > rows.length;
  it.note = (cut ? 'first ' + rows.length.toLocaleString() + ' of ' + sh.rowsTotal.toLocaleString() + ' rows' : '') +
            (sh.wide ? (cut ? ' · ' : '') + 'first ' + TB_MAXC + ' columns' : '');
  if(!it.note) delete it.note;
  tbCW(it); tbAl(it);                                  // sized to the new shape first
  const units = tbAutoWidth(it);
  tbAutoAlign(it); tbFit(it);
  return { rows: rows.length, cols: tbNC(it), cut, units };
}
/* ---- picking the file, and the sheet inside it ---- */
async function tbAskSheet(bk, sheets){
  return new Promise(res => {
    const v = $('#fview');
    const body = winShell(v, bk.name || 'workbook', sheets.length + ' sheets', [CLOSE_BTN], 'tpick');
    body.innerHTML = '<p class="tpq">Which sheet?</p><div class="tplist">' + sheets.map((s, i) =>
      '<button class="tpick1" data-i="' + i + '"><b>' + esc(s.name || ('Sheet ' + (i + 1))) + '</b>' +
      '<i>' + s.rowsTotal.toLocaleString() + (s.rowsTotal === 1 ? ' row · ' : ' rows · ') +
      ((s.rows[0] || []).length) + ' columns</i></button>').join('') + '</div>';
    let done = false;
    const finish = pick => { if(done) return; done = true; viewStop = null; closeViewer(); res(pick); };
    viewStop = () => finish(null);                     // closing the window is a no
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if(b) finish(sheets[+b.dataset.i]);
    });
    winActs(v, a => { if(a === 'close') finish(null); });
  });
}
async function tbOpenFile(file){
  let bk;
  try{ bk = await sheetRead(file); }
  catch(err){ alert('That file could not be read.\n\n' + ((err && err.message) || err)); return null; }
  const sheets = bk.sheets.filter(s => s.rows.length);
  if(!sheets.length){ alert('There is nothing in ' + file.name + '.'); return null; }
  const sh = sheets.length === 1 ? sheets[0] : await tbAskSheet(bk, sheets);
  return sh ? { bk, sh } : null;
}
/* a spreadsheet dropped on the page, or picked from the add menu */
async function tbFromFile(file, at, page){
  const got = await tbOpenFile(file);
  if(!got) return;
  page = page || sheet();
  /* readings are set a little smaller than writing is — a data table is read by
     the column rather than the sentence, and the denser it is the better */
  const it = { id: uid(), type:'table', fs:13, rot: 0,
    z: maxZ(page) + 1, lay: curLayerId(), ts:'lines', cap:'', rows:[['']], cw:[1], al:['l'] };
  const put = tbFill(it, got.sh, file.name);
  const pos = at || { x: 8, y: 12 };
  /* as wide as what is written in it wants to be, within reason */
  it.w = clamp((8 + put.units * 1.25) * pgK(), 26, 94);
  it.x = clamp(pos.x, 2, Math.max(2, 100 - it.w));
  it.y = clamp(pos.y, 4, 88);
  page.items.push(it);
  queueSave(page.id); SND.plop();
  await render();
  select(it.id);
}
/* …or the same file poured into a table that is already on the page */
async function tbLoadInto(it, page){
  const file = await tbPickFile();
  if(!file) return;
  const got = await tbOpenFile(file);
  if(!got) return;
  tbFill(it, got.sh, file.name);
  queueSave(page.id); SND.plop(); tbSync(it);
  render();
}
/* the file dialog, as a promise */
function tbPickFile(){
  return new Promise(res => {
    const inp = $('#sheetInput');
    if(!inp) return res(null);
    let done = false;
    const finish = f => { if(done) return; done = true; inp.onchange = null; res(f); };
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.value = ''; finish(f || null); };
    /* a cancelled dialog fires nothing at all, so the promise is let go the next
       time the window is touched rather than being held forever */
    window.addEventListener('focus', () => setTimeout(() => finish(null), 700), { once:true });
    inp.click();
  });
}

/* ---- sorting ----
   Whole rows move, marks and all, so a row stays the reading it was. Formulas
   are what stop it: a reference here is an address, and a "=B4" carried three
   rows down still asks about row 4 — which after a sort is somebody else's
   reading. Better to say so than to be quietly wrong. */
function tbHasFormula(it){
  for(const r of tbRows(it)) for(const v of r) if(v.charAt(0) === '=') return true;
  return false;
}
function tbSort(it, col, dir){
  const rows = tbRows(it), h = tbHead(it) ? 1 : 0;
  if(rows.length - h < 2) return false;
  if(tbHasFormula(it)){
    alert('This table has formulas in it. Sorting moves the rows but not what the ' +
          'formulas point at, so they would end up describing the wrong readings.');
    return false;
  }
  const key = [];
  for(let i = h; i < rows.length; i++){
    const s = String(rows[i][col] == null ? '' : rows[i][col]).trim();
    key.push({ i: i - h, r: rows[i], n: tbIsNum(s) ? +s : null, s });
  }
  /* numbers before words and blanks last, the way a spreadsheet sorts; ties keep
     the order they were already in */
  key.sort((a, b) => {
    if((a.s === '') !== (b.s === '')) return a.s === '' ? 1 : -1;
    if(a.n !== null && b.n !== null) return (a.n - b.n) * dir || a.i - b.i;
    if(a.n !== null) return -dir;
    if(b.n !== null) return dir;
    return String(a.s).localeCompare(b.s, undefined, { numeric:true, sensitivity:'base' }) * dir || a.i - b.i;
  });
  const where = [];
  key.forEach((k, at) => { where[k.i] = at; });
  const fmt = it.fmt || {}, out = {};
  for(const k in fmt){
    const p = k.split(','), r = +p[0];
    if(r < h){ out[k] = fmt[k]; continue; }
    const at = where[r - h];
    if(at != null) out[(h + at) + ',' + p[1]] = fmt[k];
  }
  it.fmt = out;
  for(let i = 0; i < key.length; i++) rows[h + i] = key[i].r;   // the same outer array, reordered
  it.sort = { c: col, d: dir };
  it.vr = 0;
  return true;
}

/* ---- folded down to an icon ----
   A table of forty thousand readings belongs in the note, not spread over the
   paper. Folded, it is a shortcut to itself — the icon an attachment wears — and
   a click opens the whole sheet in a window. */
function tblGlyph(it){
  let g = '<rect class="ftbh" x="15" y="40" width="64" height="12"/>';
  for(let y = 40; y <= 88; y += 12) g += '<path class="ftbl" d="M15 ' + y + ' H79"/>';
  for(let x = 15; x <= 79; x += 21.3) g += '<path class="ftbl" d="M' + rd1(x) + ' 40 V88"/>';
  return svgIcon('<path class="fsheet" d="M6 3 H64 L90 29 V125 H6 Z"/>' +
    '<path class="ffold" d="M64 3 L90 29 H64 Z"/>' + g +
    extBand(fileExt(it) || 'DATA'));
}
function tbFold(it, page, on){
  if(on){
    it.w0 = it.w;
    it.col = 1;
    it.w = clamp(13 * pgK(), minItemW(), 100);
    /* the label under an icon is the caption, and an icon with nothing written
       under it is one you have to open to know what it is */
    if(!String(it.cap || '').trim()) it.cap = tbName(it);
  }else{
    delete it.col;
    it.w = +it.w0 > 0 ? it.w0 : clamp(60 * pgK(), minItemW(), 100);
    delete it.w0;
  }
  queueSave(page.id); SND.plop(); render();
}
/* what ctrl+hover shows of one: the corner of the sheet */
function tbPeekHTML(it){
  const rows = tbRows(it), nc = Math.min(tbNC(it), 5);
  const lines = [];
  for(let r = 0; r < Math.min(rows.length, 9); r++) lines.push(r);
  const vals = tbView(it, lines);
  let h = '<div class="sheetbox ppeek"><table>';
  for(const r of lines){
    h += '<tr>';
    for(let c = 0; c < nc; c++) h += '<td>' + esc(((vals[r] || [])[c] || { t:'' }).t) + '</td>';
    h += (tbNC(it) > nc ? '<td class="more">…</td>' : '') + '</tr>';
  }
  return h + '</table>' + (rows.length > 9 ? '<div class="more">+' +
    (rows.length - 9).toLocaleString() + ' more rows</div>' : '') + '</div>';
}

/* ---- the whole sheet, in a window of its own ----
   The page shows a band of a long table; this is where you read a lot of it at
   once. The item itself is left alone — the window keeps its own place in the
   table, so scrolling here does not move what is on the paper. */
let tableWin = null;                                 // {it, page, vr, vh}
function openTable(it, page){
  tableWin = { it, page: page || sheet(), vr: 0, vh: 24 };
  const v = $('#fview');
  const body = winShell(v, tbName(it), tbMeta(it), [
    { a:'page', g:'⊞', t:'Put it back on the page' },
    { a:'csv',  g:'⤓', t:'Save it as a .csv' }, CLOSE_BTN], 'tsheet');
  winActs(v, a => {
    if(a === 'close') return void closeViewer();
    if(a === 'csv') return tbSaveCSV(it);
    const w = tableWin;
    closeViewer();
    if(w) tbFold(w.it, w.page, false);
  });
  viewStop = () => { tableWin = null; };
  body.addEventListener('wheel', e => {
    e.preventDefault();
    const d = wheelPx(e);
    if(d) tableScroll(tableWin.vr + (d > 0 ? 1 : -1) * Math.max(1, Math.round(Math.abs(d) / 42)));
  }, { passive:false });
  body.addEventListener('pointerdown', e => {
    const bar = e.target.closest('.tsb');
    if(bar) return tableBarDrag(e, bar);
    const th = e.target.closest('.th');
    if(!th) return;
    const c = +th.dataset.c;
    const cur = it.sort && it.sort.c === c ? it.sort.d : 0;
    if(tbSort(it, c, cur === 1 ? -1 : 1)){
      queueSave(tableWin.page.id); SND.tick(); tbSync(it);
      tableWin.vr = 0; renderTable(); render();
    }
  });
  renderTable();
}
/* as many rows as the window is tall — measured once it is on the screen */
function tableRows(body){
  const one = body.querySelector('.tc');
  const h = one ? one.getBoundingClientRect().height : 0;
  const box = body.getBoundingClientRect().height - 46;
  return clamp(h > 4 ? Math.floor(box / h) : 24, 6, TB_VMAX);
}
function renderTable(again){
  const W = tableWin;
  if(!W) return;
  const body = $('#fview .fbody.tsheet');
  if(!body) return;
  const shadow = { ...W.it, vr: W.vr, vh: W.vh };    // the same rows, a window of our own
  const w = tbWin(shadow);
  body.innerHTML = '<div class="tbl" data-ts="' + esc(TB_STYLES.indexOf(W.it.ts) < 0 ? 'grid' : W.it.ts) +
    '"><div class="tbox' + (w.on ? ' win' : '') + '">' + tbGridHTML(shadow, false) + '</div>' +
    '<div class="tfoot"><span class="tcount">' + esc(tbCountText(shadow)) + '</span>' +
    '<span class="tstat">click a column letter to sort · wheel to scroll</span></div></div>';
  if(W.it.sort){
    const th = body.querySelector('.th[data-c="' + W.it.sort.c + '"] .tlab');
    if(th) th.textContent += W.it.sort.d < 0 ? ' ▾' : ' ▴';
  }
  /* the first pass is what tells us how tall a row is, so the window is filled
     on the second — and only ever twice */
  if(!again){
    const fit = tableRows(body);
    if(fit !== W.vh){ W.vh = fit; renderTable(true); }
  }
}
function tableScroll(to){
  const W = tableWin;
  if(!W) return;
  const w = tbWin({ ...W.it, vr: W.vr, vh: W.vh });
  if(!w.on) return;
  const v = clamp(Math.round(to), 0, w.body - w.show);
  if(v === W.vr) return;
  W.vr = v;
  renderTable(true);
}
function tableBarDrag(e, bar){
  const W = tableWin;
  if(!W) return;
  const w = tbWin({ ...W.it, vr: W.vr, vh: W.vh });
  const th = bar.querySelector('.tsbt');
  const r = bar.getBoundingClientRect(), tr = th && th.getBoundingClientRect();
  const span = Math.max(1, w.body - w.show), H = tr ? tr.height : 0;
  const track = Math.max(1, r.height - H);
  const inside = tr && e.clientY >= tr.top && e.clientY <= tr.bottom;
  const grab = inside ? e.clientY - tr.top : H / 2;
  const to = y => tableScroll((y - r.top - grab) / track * span);
  to(e.clientY);
  const pid = e.pointerId;
  const mv = ev => { if(ev.pointerId === pid) to(ev.clientY); };
  const up = ev => {
    if(ev.pointerId !== pid) return;
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
window.addEventListener('keydown', e => {
  if(!tableWin || !$('#fview').classList.contains('on')) return;
  const W = tableWin, w = tbWin({ ...W.it, vr: W.vr, vh: W.vh });
  const k = e.key;
  const go = { ArrowDown:1, ArrowUp:-1, PageDown: w.show - 1, PageUp:-(w.show - 1),
               Home:-1e9, End:1e9 }[k];
  if(go === undefined) return;
  e.preventDefault();
  tableScroll(W.vr + go);
});
/* the answers, not the formulas — the same thing print and an export show */
function tbToCSV(it){
  const rows = tbRows(it), view = tbView(it), out = [];
  for(let r = 0; r < rows.length; r++){
    const line = [];
    for(let c = 0; c < rows[r].length; c++){
      const v = view[r] && view[r][c] ? view[r][c].t : rows[r][c];
      line.push(/[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v);
    }
    out.push(line.join(','));
  }
  return out.join('\r\n');
}
function tbSaveCSV(it){
  const url = URL.createObjectURL(new Blob([tbToCSV(it)], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = tbName(it).replace(/\.[a-z0-9]{1,5}$/i, '') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/* ---- the toolbar ---- */
function tbAct(a, it, el, page){
  const S = el.__tb || { r:0, c:0, r1:0, c1:0 };
  const b = { r0:Math.min(S.r, S.r1), r1:Math.max(S.r, S.r1),
              c0:Math.min(S.c, S.c1), c1:Math.max(S.c, S.c1) };
  const done = (redraw) => {
    queueSave(page.id); SND.tick();
    if(redraw && S.redraw) S.redraw();
  };
  if(a === 'style'){
    const cur = TB_STYLES.indexOf(it.ts);
    it.ts = TB_STYLES[(cur + 1) % TB_STYLES.length];
    el.querySelector('.tbl').dataset.ts = it.ts;
    return done(false);
  }
  /* the header row is not a point, and it is where the axes get their names —
     so any plot reading this table has to hear about it */
  if(a === 'head'){ it.head = !tbHead(it); tbSync(it); return done(true); }
  if(a === 'align'){
    const al = tbAl(it);
    const next = { l:'c', c:'r', r:'l' }[al[b.c0]] || 'c';
    for(let c = b.c0; c <= b.c1; c++) al[c] = next;
    return done(true);
  }
  /* the column the cursor is in, up then down — and every plot reading the table
     hears about it, since the points are in a different order now */
  if(a === 'sort'){
    const was = it.sort && it.sort.c === b.c0 ? it.sort.d : 0;
    if(!tbSort(it, b.c0, was === 1 ? -1 : 1)) return;
    tbSync(it);
    return done(true);
  }
  /* B / I / highlight: if the whole range already has it, take it away */
  const fmt = it.fmt = it.fmt || {};
  let all = true;
  for(let r = b.r0; r <= b.r1; r++) for(let c = b.c0; c <= b.c1; c++)
    if((fmt[r + ',' + c] || '').indexOf(a) < 0) all = false;
  for(let r = b.r0; r <= b.r1; r++) for(let c = b.c0; c <= b.c1; c++){
    const k = r + ',' + c, had = (fmt[k] || '').replace(a, '');
    const now = all ? had : had + a;
    if(now) fmt[k] = now; else delete fmt[k];
  }
  done(true);
}

defineItem('table', {
  add: {
    table: base => ({ ...base, type:'table', w:60, fs:15, rot:0,
      rows: [['', '', ''], ['', '', ''], ['', '', ''], ['', '', '']],
      cw: [1 / 3, 1 / 3, 1 / 3], al: ['l', 'l', 'l'],
      head: 1, ts: 'lines', fmt: {}, cap: '' }),
    /* the same thing, filled in from a file rather than typed */
    sheet: { pick: async (at, page) => {
      const f = await tbPickFile();
      if(f) tbFromFile(f, at, page);
    } }
  },
  sound: 'plop',
  sizeable: true,
  html: (it, c) => tbHTML(it, c),
  mount: el => tbMath(el),
  /* a new table is ready to be typed into, like a spreadsheet: the first cell
     is the cursor and whatever you type goes straight into it */
  after: (it, el) => { const g = el && el.querySelector('.tgrid'); if(g) g.focus({ preventScroll:true }); },
  /* what it looks like folded down, and what it is called then */
  icon:  it => tblGlyph(it),
  label: it => tbName(it),
  meta:  it => tbMeta(it),
  open:  (it, page) => openTable(it, page),
  peek:  it => tbPeekHTML(it),
  /* a workbook dropped on the page arrives as a table rather than as an
     attachment nobody can read */
  /* An old binary .xls is recognised but not read, so it is left to ride along
     as an attachment — better to keep the file than to refuse it at the door.
     Load on a table says what to do with it. */
  takes(fs, at, page){
    const k = fs && fs[0] && sheetKind(fs[0]);
    if(k !== 'xlsx' && k !== 'ods' && k !== 'csv') return false;
    tbFromFile(fs[0], at, page);
    return true;
  },
  forget(it){ if(tableWin && tableWin.it === it){ tableWin = null; closeViewer(); } },
  tools(mk, it, el, page){
    if(it.col){
      mk('↗', 'Open the whole sheet in a window', () => openTable(it, page));
      mk('⊞', 'Unfold it back onto the page', () => tbFold(it, page, false));
      mk('⤓', 'Save it as a .csv', () => tbSaveCSV(it));
      return;
    }
    mk('⇗', 'Plot two of these columns in a coordinate system — or just drag the table onto one',
       () => startAim(it, page, 'data'));
    mk('▦', 'Table style — lines, grid, zebra or plain', () => tbAct('style', it, el, page));
    mk('Hdr', 'First row is a header', () => tbAct('head', it, el, page));
    mk('≡', 'Align this column — left, centre, right', () => tbAct('align', it, el, page));
    mk('⇅', 'Sort the rows by the column the cursor is in — up, then down',
       () => tbAct('sort', it, el, page));
    mk('B', 'Bold the selected cells', () => tbAct('b', it, el, page));
    mk('I', 'Italic the selected cells', () => tbAct('i', it, el, page));
    mk('◑', 'Highlight the selected cells', () => tbAct('h', it, el, page));
    mk('Load', 'Read a spreadsheet into this table — .xlsx, .ods, .csv or .tsv',
       () => tbLoadInto(it, page));
    mk('⊟', 'Fold it down to an icon — clicking that opens the whole sheet in a window',
       () => tbFold(it, page, true));
  },
  wire(el, it, page){ if(it.col) wireIcon(el, it, page); else tbWire(el, it, page); }
});
onNoteOpen(() => { tableWin = null; });

/* ---- how it looks ----
   Nothing here names a colour: paper, ink, lines and both accents come from
   whichever theme the book is wearing. */
addCSS('table', `
.tbl{--gut:1.9em;--hh:1.3em;--sb:.6em;
  font-family:var(--mono);font-size:calc(var(--fs,15)*var(--scale)*1px);line-height:1.35;
  color:var(--ink);background:var(--paper);padding:.5em;
  box-shadow:0 calc(var(--scale)*4px) calc(var(--scale)*11px) rgba(0,0,0,.16)}
/* the gutters are reserved on all four sides, so the headers and the two rails
   appear into space that was already there and nothing on the page shifts */
.tbox{position:relative;padding-right:var(--gut);padding-bottom:var(--hh)}
/* …and a table showing a band of itself reserves one more, for the scrollbar */
.tbox.win{padding-right:calc(var(--gut) + var(--sb))}
.tbox.win .tadd.c{right:var(--sb)}
.tgrid{display:grid;grid-template-rows:var(--hh);grid-auto-rows:minmax(1.5em,auto);outline:none}
.tgrid:focus,.tgrid:focus-visible{outline:none}
/* ---- cells ---- */
.tc{position:relative;padding:.26em .45em;overflow-wrap:break-word;white-space:pre-wrap;min-width:0}
.tc[data-a="c"]{text-align:center}
.tc[data-a="r"]{text-align:right}
.tc.hd{font-weight:500;letter-spacing:.03em}
.tc.b{font-weight:700}
.tc.i{font-style:italic}
.tc.err{color:var(--accent)}
.tc.h::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:color-mix(in srgb,var(--accent2) 20%,transparent)}
.item.sel .tc.on::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:color-mix(in srgb,var(--accent2) 13%,transparent)}
/* the cell the cursor is on stays clear inside the range it anchors */
.item.sel .tc.on.cur::after{display:none}
.item.sel .tc.cur{outline:1.5px solid var(--accent2);outline-offset:-1px;z-index:1}
.tc.ed{outline:2px solid var(--accent2);outline-offset:-1px;background:var(--paper);
  user-select:text;cursor:text;z-index:3;white-space:pre-wrap}
.tc.ed::after,.tc.ed::before{display:none}
/* ---- the four styles ---- */
.tbl[data-ts="lines"] .tc{box-shadow:inset 0 -1px 0 color-mix(in srgb,var(--line) 75%,transparent)}
.tbl[data-ts="lines"] .tc.hd{box-shadow:inset 0 -1.5px 0 color-mix(in srgb,var(--ink) 45%,transparent)}
/* .ftop is whichever row is drawn first — row 1 of the table, or the top of the
   band a long one is showing. Either way it is the edge that closes the box. */
.tbl[data-ts="grid"] .tc{box-shadow:inset -1px -1px 0 color-mix(in srgb,var(--line) 88%,transparent)}
.tbl[data-ts="grid"] .tc[data-c="0"]{box-shadow:inset -1px -1px 0 color-mix(in srgb,var(--line) 88%,transparent),inset 1px 0 0 color-mix(in srgb,var(--line) 88%,transparent)}
.tbl[data-ts="grid"] .tc.ftop{box-shadow:inset -1px -1px 0 color-mix(in srgb,var(--line) 88%,transparent),inset 0 1px 0 color-mix(in srgb,var(--line) 88%,transparent)}
.tbl[data-ts="grid"] .tc.ftop[data-c="0"]{box-shadow:inset -1px -1px 0 color-mix(in srgb,var(--line) 88%,transparent),inset 1px 1px 0 color-mix(in srgb,var(--line) 88%,transparent)}
.tbl[data-ts="zebra"] .tc.alt{background:color-mix(in srgb,var(--ink) 6%,transparent)}
.tbl[data-ts="zebra"] .tc.hd{background:color-mix(in srgb,var(--ink) 13%,transparent)}
.tbl[data-ts="zebra"] .tc.hd,.tbl[data-ts="plain"] .tc.hd{box-shadow:inset 0 -1px 0 color-mix(in srgb,var(--ink) 30%,transparent)}
/* ---- the row numbers and column letters: there all along, painted only when
       the table is the thing you are working on ---- */
.th,.rh{position:relative;font-size:.72em;letter-spacing:.05em;overflow:hidden;
  color:var(--soft);cursor:pointer;user-select:none;visibility:hidden}
.th{display:flex;align-items:center;justify-content:center;gap:.1em}
.rh{display:grid;place-items:center}
.item.sel .th,.item.sel .rh{visibility:visible}
.th.on,.rh.on{color:var(--paper);background:var(--accent2)}
.tcorner{position:relative;cursor:grab}
.item.sel .tcorner::after{content:"";position:absolute;right:.2em;bottom:.2em;width:.44em;height:.44em;
  background:linear-gradient(-45deg,var(--soft) 0 55%,transparent 55%);opacity:.6}
.th .tlab,.rh .tlab{transition:opacity .12s}
/* Remove and insert. A column keeps its letter between the pair, so it is
   never in doubt which column they belong to; a row has only the gutter to
   work in, so its pair stacks over the number rather than reaching across the
   first cell and covering what is written there. */
.th .tx,.th .tp,.rh .tx,.rh .tp{display:grid;place-items:center;color:var(--soft);
  font-style:normal;font-size:.95em;line-height:1;opacity:0;cursor:pointer;transition:opacity .12s}
.th .tx,.th .tp{flex:none;width:1em}
.rh .tx,.rh .tp{position:absolute;left:0;right:0;height:50%;z-index:4}
.rh .tx{top:0}
.rh .tp{bottom:0}
.item.sel .rh:hover .tlab{opacity:0}
.item.sel .th:hover .tx,.item.sel .th:hover .tp,
.item.sel .rh:hover .tx,.item.sel .rh:hover .tp{opacity:1}
.th .tx:hover,.rh .tx:hover{color:var(--accent)}
.th .tp:hover,.rh .tp:hover{color:var(--accent2)}
.th.on .tx,.th.on .tp,.rh.on .tx,.rh.on .tp{color:var(--paper)}
.th.on .tx:hover,.rh.on .tx:hover{color:var(--accent)}
.tgrip{position:absolute;top:0;bottom:0;right:-3px;width:7px;cursor:col-resize;z-index:5;background:none}
.tgrip::after{content:"";position:absolute;left:3px;top:.1em;bottom:.1em;width:1px;
  background:var(--accent2);opacity:0;transition:opacity .12s}
.item.sel .tgrip:hover::after{opacity:.85}
/* ---- add a row, add a column ---- */
.tadd{position:absolute;display:none;place-items:center;font-family:var(--mono);font-size:.85em;
  line-height:1;color:var(--soft);border-radius:2px;opacity:.45;transition:opacity .14s,background .14s}
.item.sel .tadd{display:grid}
.tadd:hover{opacity:1;color:var(--ink);background:color-mix(in srgb,var(--accent2) 20%,transparent)}
.tadd.c{top:0;bottom:var(--hh);right:0;width:var(--gut)}
.tadd.r{left:var(--gut);right:var(--gut);bottom:0;height:var(--hh)}
.tbl figcaption{padding-top:calc(var(--scale)*4px)}
/* ---- the band a long table shows, and the bar that moves it ---- */
.tsb{position:absolute;right:0;top:var(--hh);bottom:var(--hh);width:var(--sb);
  background:color-mix(in srgb,var(--ink) 8%,transparent);cursor:pointer}
.tsbt{position:absolute;left:1px;right:1px;min-height:6%;
  background:color-mix(in srgb,var(--ink) 30%,transparent)}
.tsb:hover .tsbt,.item.sel .tsbt{background:var(--accent2)}
/* ---- the strip under it: what you are looking at, and what it comes to ---- */
/* Both halves would rather have the whole line, so neither is allowed to push
   the other off it: each keeps to one line and trails off, and the readout drops
   below the count when there is no room for the two of them side by side. */
.tfoot{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2em 1em;padding-top:.4em;
  font-family:var(--mono);font-size:.62em;letter-spacing:.05em;color:var(--soft)}
.tcount{font:inherit;letter-spacing:inherit;color:inherit;background:none;border:0;padding:0;
  cursor:pointer;text-align:left;min-width:0;max-width:100%;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tcount:empty{display:none}
.tcount:hover{color:var(--accent2)}
/* the readout is for whoever is working in the table, so it keeps out of the way
   of everyone else — the same as the row numbers and the column letters */
.tstat{margin-left:auto;min-width:0;text-align:right;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;visibility:hidden}
.item.sel .tstat{visibility:visible}
/* ---- folded down: the icon, and what ctrl+hover shows of the sheet ---- */
.ficon .ftbh{fill:color-mix(in srgb,var(--accent2) 72%,var(--paper))}
.ficon .ftbl{fill:none;stroke:color-mix(in srgb,var(--ink) 42%,var(--paper));stroke-width:2.4}
.peek .sheetbox.ppeek{height:auto;max-height:290px;padding:7px;overflow:hidden;
  background:color-mix(in srgb,var(--paper) 92%,#fff)}
.peek .ppeek table{width:100%;table-layout:fixed;border-collapse:collapse;
  font-family:var(--mono);font-size:9px;color:var(--ink)}
.peek .ppeek td{padding:2px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  border-bottom:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}
.peek .ppeek tr:first-child td{border-bottom:1px solid color-mix(in srgb,var(--ink) 42%,transparent)}
.peek .ppeek .more{padding-top:4px;font-family:var(--mono);font-size:9px;opacity:.55}
/* ---- the whole sheet, read in a window ----
   The letters and the numbers are always out in here, and a cell keeps to one
   line: a table of forty thousand readings is something you scan, and a row that
   wraps to three lines because one cell holds a sentence stops you scanning it. */
.fview .fbody.tsheet{padding:9px;overflow:hidden;background:var(--paper)}
.tsheet .tbl{--gut:2.5em;--hh:1.5em;--sb:.7em;font-size:13px;height:100%;padding:0;
  display:flex;flex-direction:column;box-shadow:none}
.tsheet .tbox{flex:1;min-height:0;padding-bottom:0;padding-right:var(--gut)}
.tsheet .tbox.win{padding-right:calc(var(--gut) + var(--sb))}
.tsheet .tsb{bottom:0}
.tsheet .th,.tsheet .rh{visibility:visible}
.tsheet .th{cursor:pointer}
.tsheet .th:hover{color:var(--accent2)}
.tsheet .tc{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tsheet .tstat{visibility:visible;font-style:italic;opacity:.7}
/* ---- which sheet of the workbook? ---- */
.fview .fwin.w-tpick{width:min(520px,92vw);height:auto;max-height:80vh}
.fview .fbody.tpick{padding:14px;overflow:auto;background:var(--paper)}
.tpq{margin:0 0 10px;font-family:var(--mono);font-size:12px;letter-spacing:.08em;color:var(--soft)}
.tplist{display:flex;flex-direction:column;gap:6px}
.tpick1{display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 10px;text-align:left;
  font-family:var(--mono);color:var(--ink);cursor:pointer;
  background:color-mix(in srgb,var(--paper) 82%,var(--ink));
  box-shadow:inset 1.4px 1.4px 0 color-mix(in srgb,var(--paper) 60%,#fff),
             inset -1.4px -1.4px 0 color-mix(in srgb,var(--ink) 40%,var(--paper))}
.tpick1:hover{background:var(--accent2);color:#fff}
.tpick1 b{font-weight:400;font-size:13px}
.tpick1 i{font-style:normal;font-size:10px;opacity:.7}
`);
/* its tiles in the palette */
defineTool({ kind:'table', cat:'math', label:'Table', icon:'table', order:20,
  hint:'A spreadsheet on the page — cells, formulas, sorting, and it plots' });
defineTool({ kind:'sheet', cat:'math', label:'Spreadsheet', icon:'sheet', order:22,
  hint:'A table read straight out of a file — .xlsx, .ods, .csv or .tsv' });
