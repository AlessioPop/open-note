/* Open Note — chrome/dashboard.js
   the dashboard — this month, what you were last in, and the year in days */

/* ================= the record of days =================
   The library already knows when each thing was last touched, but only its
   LAST touch: `updated` is a single timestamp, so it can say "yesterday" and
   never "and the fortnight before that". A heat map wants the days themselves,
   so one small map is kept beside the entries — `lib.activity`, a count per
   calendar day — and no feature has to report to it:

     save.js flushes → dashMark() → "has anything's `updated` moved past the
     high-water mark I saw last?" → if it has, that day gets one more mark.

   Reading is therefore not activity: opening a note writes `lib.lastOpen` and
   no entry's `updated`, so it colours nothing. Writing anything at all — a
   stroke, a rename, a Markdown keystroke, a new folder — moves an `updated`
   and does.

   The days are LOCAL days. A stroke drawn at half past eleven at night belongs
   to the evening it was drawn in, which is exactly what `fmtDate` (UTC, in
   core/util.js) would get wrong for half the world. */

const DASH_MS = 864e5;                   // a day, in ms — only ever used on midnight-to-midnight
const DASH_WEEKS = 53;                   // columns in the heat map: a year, plus the week we are in
const DASH_KEEP = 730;                   // how many days of the record are kept
const DASH_RECENT = 8;                   // rows in "Recently open"
const DASH_MONTH = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];
const DASH_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DASH_WDAY = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DASH_WD = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

let dashShown = null;                    // the first of the month the calendar is showing
let dashDay = null;                      // 'YYYY-MM-DD' — the day the day panel is reading

/* ---- days as keys ---- */
const dashPad = n => (n < 10 ? '0' : '') + n;
const dashKey = d => d.getFullYear() + '-' + dashPad(d.getMonth() + 1) + '-' + dashPad(d.getDate());
const dashKeyOf = ts => dashKey(new Date(ts));
const dashMid = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dashToday = () => dashMid(new Date());
function dashDate(key){
  const p = String(key || '').split('-');
  if(p.length !== 3) return null;
  const d = new Date(+p[0], +p[1] - 1, +p[2]);
  return isNaN(d) ? null : d;
}
/* whole days between two midnights — rounded, so the hour a clock change adds
   or takes away never turns one day into nought or two */
const dashSpan = (a, b) => Math.round((dashMid(b) - dashMid(a)) / DASH_MS);
const dashPlus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/* the Monday of that week — the heat map's columns are weeks, and a week here
   starts where a diary starts */
const dashMonday = d => dashPlus(d, -(((d.getDay() + 6) % 7)));

/* ---- the library, as one list ---- */
function dashLog(){
  if(!lib) return {};
  if(!lib.activity || typeof lib.activity !== 'object' || Array.isArray(lib.activity)) lib.activity = {};
  return lib.activity;
}
function dashFiles(){
  const out = [];
  for(const b of (lib && lib.books) || []) out.push({ kind:'canvas', data:b });
  for(const f of (lib && lib.files) || []) out.push({ kind:f.kind === 'markdown' ? 'markdown' : 'asset', data:f });
  return out;
}
const dashAll = () => dashFiles().concat(((lib && lib.notebooks) || []).map(f => ({ kind:'folder', data:f })));
const dashWhen = e => +e.data.updated || +e.data.created || 0;

/* ---- writing the record ---- */
function dashCount(key){ const n = dashLog()[key]; return typeof n === 'number' && n > 0 ? n : 0; }
function dashHigh(){
  let hi = 0;
  for(const e of dashAll()) hi = Math.max(hi, +e.data.updated || 0, +e.data.created || 0);
  return hi;
}
/* A library made before there was a record still has its timestamps. They are
   two days per entry rather than a year of them, but they are true, and they
   mean the map is never blank for someone who has been using the app for
   months. Once. */
function dashSeed(){
  if(!lib || lib.activitySeeded) return false;
  const log = dashLog();
  for(const e of dashAll()) for(const t of [e.data.created, e.data.updated])
    if(t){ const k = dashKeyOf(t); if(!log[k]) log[k] = 1; }
  lib.activitySeeded = true;
  lib.actSeen = dashHigh();
  return true;
}
/* the map is a year of squares plus a little slack, not a diary of everything */
function dashPrune(){
  const log = dashLog(), today = dashToday();
  let cut = false;
  for(const k of Object.keys(log)){
    const d = dashDate(k);
    if(!d || dashSpan(d, today) > DASH_KEEP){ delete log[k]; cut = true; }
  }
  return cut;
}
/* called by core/save.js on every flush — see the note at the top */
function dashMark(){
  if(!lib) return false;
  const seeded = dashSeed();
  const hi = dashHigh(), seen = +lib.actSeen || 0;
  if(hi <= seen) return seeded;
  lib.actSeen = hi;
  const key = dashKeyOf(hi), log = dashLog();
  log[key] = dashCount(key) + 1;
  dashPrune();
  if(dashIsOpen()) dashRender();
  return true;
}

/* ---- reading it back ---- */
/* five steps, scaled to the busiest day there has been, so a quiet library
   still shows shape and a loud one does not saturate at 1 */
function dashLevel(n, max){
  if(!n) return 0;
  if(max <= 1) return 1;
  return clamp(Math.ceil(4 * n / max), 1, 4);
}
function dashPeak(){
  let max = 0;
  for(const k in dashLog()) max = Math.max(max, dashCount(k));
  return max;
}
function dashStats(){
  const log = dashLog(), today = dashToday();
  let days = 0, edits = 0;
  for(const k of Object.keys(log)){
    const d = dashDate(k), n = dashCount(k);
    if(!d || !n) continue;
    const back = dashSpan(d, today);
    if(back >= 0 && back < 365){ days++; edits += n; }
  }
  /* the run you are on. A day with nothing on it yet does not end a streak —
     it is only lost once a whole day has gone by without a mark. */
  let cur = 0, at = dashCount(dashKey(today)) ? today : dashPlus(today, -1);
  while(dashCount(dashKey(at))){ cur++; at = dashPlus(at, -1); }
  /* and the longest there has ever been, over everything still kept */
  const keys = Object.keys(log).filter(k => dashCount(k) && dashDate(k)).sort();
  let best = 0, run = 0, prev = null;
  for(const k of keys){
    const d = dashDate(k);
    run = prev && dashSpan(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  }
  return { days, edits, cur, best };
}
function dashTouched(key){
  return dashAll().filter(e => e.data.updated && dashKeyOf(e.data.updated) === key)
    .sort((a, b) => dashWhen(b) - dashWhen(a));
}

/* ---- saying when ---- */
const dashLongDate = d => d.getDate() + ' ' + DASH_MONTH[d.getMonth()] + ' ' + d.getFullYear();
const dashShortDate = d => DASH_WD[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + DASH_MON[d.getMonth()] + ' ' + d.getFullYear();
function dashAgo(ts){
  if(!ts) return 'never opened';
  const now = Date.now(), diff = now - ts;
  if(diff < 0) return 'just now';
  if(diff < 6e4) return 'just now';
  if(diff < 36e5) return Math.round(diff / 6e4) + ' min ago';
  const back = dashSpan(new Date(ts), new Date());
  if(back === 0) return Math.round(diff / 36e5) + ' h ago';
  if(back === 1) return 'yesterday';
  if(back < 7) return back + ' days ago';
  return dashLongDate(new Date(ts));
}

/* ================= the panel ================= */
const dashIsOpen = () => !!$('#dash') && $('#dash').classList.contains('open');
function dashSetOpen(on){
  const el = $('#dash');
  if(!el || dashIsOpen() === !!on) return;
  el.classList.toggle('open', !!on);
  document.body.classList.toggle('dash-open', !!on);
  if(!on) dashGraphStop();
  el.setAttribute('aria-hidden', String(!on));
  $('#dashBtn').classList.toggle('on', !!on);
  $('#dashBtn').setAttribute('aria-pressed', String(!!on));
  if(!on) return;
  $('#drawer').classList.remove('open');
  $('#shelf').classList.remove('open');
  $('#lpanel').classList.remove('open');
  if(typeof closeQuickMenu === 'function') closeQuickMenu();
  const today = dashToday();
  dashShown = new Date(today.getFullYear(), today.getMonth(), 1);
  dashDay = dashKey(today);
  dashRender();
}
function dashToggle(){ dashSetOpen(!dashIsOpen()); }

/* ---- what it says ---- */
function dashTile(v, label, hint){
  return '<div class="dashTile"><b>' + esc(String(v)) + '</b><span>' + esc(label) + '</span>' +
    (hint ? '<i>' + esc(hint) + '</i>' : '') + '</div>';
}
function dashStatsHTML(){
  const s = dashStats(), books = ((lib && lib.books) || []).length,
        files = ((lib && lib.files) || []).length, folders = ((lib && lib.notebooks) || []).length;
  return dashTile(books + files, books + files === 1 ? 'file in the library' : 'files in the library',
      books + ' canvas' + (books === 1 ? '' : 'es') + ' · ' + files + ' file' + (files === 1 ? '' : 's') +
      ' · ' + folders + ' folder' + (folders === 1 ? '' : 's')) +
    dashTile(s.days, s.days === 1 ? 'day worked in the last year' : 'days worked in the last year',
      s.edits + (s.edits === 1 ? ' save' : ' saves')) +
    dashTile(s.cur, s.cur === 1 ? 'day in a row' : 'days in a row', 'current run') +
    dashTile(s.best, s.best === 1 ? 'day at your longest' : 'days at your longest', 'best run kept');
}

/* the month, with a square per day tinted the way the heat map is */
function dashCalHTML(){
  const shown = dashShown || dashToday(), today = dashToday(), max = dashPeak();
  const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;                        // Monday-first
  const len = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
  let html = '<div class="calHead">' + DASH_WD.map(d =>
    '<span><abbr title="' + DASH_WDAY[DASH_WD.indexOf(d)] + '">' + d + '</abbr></span>').join('') + '</div>';
  html += '<div class="calGrid">';
  for(let i = 0; i < lead; i++) html += '<span class="calPad"></span>';
  for(let n = 1; n <= len; n++){
    const d = new Date(shown.getFullYear(), shown.getMonth(), n), key = dashKey(d);
    const count = dashCount(key), touched = dashTouched(key).length;
    const cls = 'calDay' + (key === dashKey(today) ? ' today' : '') + (key === dashDay ? ' picked' : '') +
      (dashSpan(d, today) < 0 ? ' ahead' : '');
    html += '<button class="' + cls + '" data-lv="' + dashLevel(count, max) + '" data-dash-day="' + key + '"' +
      ' aria-pressed="' + (key === dashDay) + '" title="' + esc(dashShortDate(d) + ' · ' +
        (count ? count + (count === 1 ? ' save' : ' saves') : 'nothing saved')) + '">' +
      '<span class="calNum">' + n + '</span>' +
      (touched ? '<span class="calDot" aria-hidden="true"></span>' : '') + '</button>';
  }
  return html + '</div>';
}

/* fifty-three weeks of squares, a column to the week, Monday at the top */
function dashHeatHTML(){
  const today = dashToday(), max = dashPeak();
  const start = dashPlus(dashMonday(today), -7 * (DASH_WEEKS - 1));
  let months = '', cells = '', last = -1;
  for(let w = 0; w < DASH_WEEKS; w++){
    const head = dashPlus(start, w * 7);
    /* a month is labelled over the first column that starts inside it */
    if(head.getMonth() !== last && head.getDate() <= 7){
      last = head.getMonth();
      months += '<span style="grid-column:' + (w + 1) + '">' + DASH_MON[last] + '</span>';
    }
    for(let d = 0; d < 7; d++){
      const day = dashPlus(head, d), key = dashKey(day), ahead = dashSpan(day, today) < 0;
      if(ahead){ cells += '<span class="heatCell ahead" aria-hidden="true"></span>'; continue; }
      const count = dashCount(key);
      cells += '<button class="heatCell' + (key === dashDay ? ' picked' : '') + '" data-lv="' +
        dashLevel(count, max) + '" data-dash-day="' + key + '" title="' +
        esc((count ? count + (count === 1 ? ' save' : ' saves') : 'nothing saved') + ' · ' + dashShortDate(day)) +
        '"><span class="vh">' + esc(dashShortDate(day)) + '</span></button>';
    }
  }
  return '<div class="heatScroll"><div class="heatWrap" style="--weeks:' + DASH_WEEKS + '">' +
    '<div class="heatMonths">' + months + '</div>' +
    '<div class="heatWD">' + DASH_WD.map((d, i) =>
      '<span>' + (i % 2 ? d : '') + '</span>').join('') + '</div>' +
    '<div class="heatCells">' + cells + '</div></div></div>' +
    '<div class="heatKey"><span>Quiet</span>' +
    [0, 1, 2, 3, 4].map(l => '<i data-lv="' + l + '"></i>').join('') + '<span>Busy</span></div>';
}

/* one row per thing, the way the explorer draws it — same glyphs, same paths */
function dashRowHTML(e, when){
  const path = navPathParts(e.data.parentId);
  const glyph = e.kind === 'folder'
    ? '<span class="nav-glyph dashFolder" aria-hidden="true">▱</span>' : navGlyph(e.kind, e.data);
  return '<button class="dashRow" data-dash-open="' + e.kind + ':' + e.data.id + '">' + glyph +
    '<span class="dashRowText"><span class="dashRowName">' +
      esc(e.data.name || (e.kind === 'folder' ? 'Untitled folder' : 'Untitled')) + '</span>' +
    '<span class="dashRowPath">' + esc(path.length ? path.join(' / ') : 'Library root') + '</span></span>' +
    '<span class="dashRowWhen">' + esc(when) + '<i>' + esc(navKindLabel(e.kind, e.data)) + '</i></span></button>';
}
function dashRecentHTML(){
  const rows = dashFiles().filter(e => dashWhen(e)).sort((a, b) => dashWhen(b) - dashWhen(a)).slice(0, DASH_RECENT);
  if(!rows.length) return '<div class="dashEmpty">Nothing in the library yet. Make a canvas or a Markdown file in the explorer and it will appear here.</div>';
  return rows.map(e => dashRowHTML(e, dashAgo(dashWhen(e)))).join('');
}
function dashDayHTML(){
  const d = dashDate(dashDay) || dashToday(), key = dashKey(d);
  const rows = dashTouched(key), count = dashCount(key);
  const when = dashSpan(d, dashToday());
  const head = '<h3>' + esc(DASH_WDAY[(d.getDay() + 6) % 7] + ' ' + dashLongDate(d)) + '</h3>' +
    '<span class="dashMeta">' + esc((when === 0 ? 'Today · ' : when === 1 ? 'Yesterday · ' : '') +
      (count ? count + (count === 1 ? ' save' : ' saves') : 'nothing saved')) + '</span>';
  const body = rows.length
    ? rows.map(e => dashRowHTML(e, new Date(e.data.updated).toTimeString().slice(0, 5))).join('')
    : '<div class="dashEmpty">' + (count
        ? 'Something was saved on this day, but everything touched then has been worked on since.'
        : 'Nothing was saved on this day.') + '</div>';
  return { head, body };
}

/* ================= the graph of links =================
   The library's [[links]] as a picture: one dot per Markdown file and per
   canvas, one line per link, and a hollow dot for a name that has been linked
   to but not written yet. chrome/wiki.js reads the links out of the text and
   lib/graph.js decides where the dots go; everything here is the drawing and
   the hand on it.

   The layout is settled before the first frame rather than animated into place
   — a graph that swims about for two seconds every time the dashboard opens is
   a toy. It only moves when something is dragged, and then only until it has
   stopped moving. */
const DASHG = { sig:'', ix:null, g:null, svg:null, host:null, view:null,
                near:null, hot:-1, drag:null, stop:null };

const dashGraphDense = () => DASHG.ix && DASHG.ix.nodes.length > 34;
function dashGraphStop(){ if(DASHG.stop){ DASHG.stop(); DASHG.stop = null; } }
function dashGraphSig(ix){
  return ix.nodes.map(n => n.key).join('|') + '#' + ix.links.map(l => l.from + '>' + l.to).join('|');
}
/* how big a dot is: everything it points at and everything that points at it */
const dashGraphR = n => 4.6 + Math.min(7, Math.sqrt(n.links + n.backlinks) * 2.2);

function dashGraphBuild(){
  const host = $('#dashGraph');
  DASHG.host = host;
  const ix = typeof wkIndex === 'function' ? wkIndex() : { nodes:[], links:[] };
  DASHG.ix = ix;
  const named = ix.nodes.filter(n => n.kind !== 'ghost').length;
  $('#dashGraphMeta').textContent = named + (named === 1 ? ' file · ' : ' files · ') +
    ix.links.length + (ix.links.length === 1 ? ' link' : ' links');
  if(!ix.nodes.length){
    dashGraphStop();
    DASHG.g = null; DASHG.svg = null; DASHG.sig = '';
    host.innerHTML = '<div class="dashEmpty">Nothing in the library to link yet.</div>';
    return;
  }
  if(!ix.links.length && named <= 1){
    dashGraphStop();
    DASHG.g = null; DASHG.svg = null; DASHG.sig = '';
    host.innerHTML = '<div class="dashEmpty">No links yet. Write <b>[[the name of another file]]</b> ' +
      'in a Markdown file and the two of them join up here.</div>';
    return;
  }
  dashGraphStop();
  const frame = host.getBoundingClientRect();
  DASHG.g = gphMake(ix.nodes, ix.links, frame.width / Math.max(1, frame.height));
  /* a big graph is given fewer steps, not more: it costs a pair of every two
     dots a step, and it is readable long before it is perfectly relaxed */
  gphSettle(DASHG.g, ix.nodes.length > 120 ? 110 : 260);
  /* who is next to whom, so hovering can dim everything that is not */
  DASHG.near = ix.nodes.map(() => new Set());
  DASHG.g.edges.forEach(e => { DASHG.near[e.a].add(e.b); DASHG.near[e.b].add(e.a); });
  const edges = DASHG.g.edges.map((e, i) =>
    '<line class="gphE" data-i="' + i + '"/>').join('');
  const nodes = ix.nodes.map((n, i) =>
    '<g class="gphN ' + n.kind + '" data-i="' + i + '" tabindex="0" role="button">' +
    '<title>' + esc((n.label || n.name) + (n.path ? ' — ' + n.path : '') + ' · ' +
      n.links + ' out, ' + n.backlinks + ' in') + '</title>' +
    '<circle r="' + dashGraphR(n).toFixed(1) + '"/>' +
    '<text dy="' + (-dashGraphR(n) - 5).toFixed(1) + '">' + esc(n.label || n.name) + '</text></g>').join('');
  host.innerHTML = '<svg class="gphSvg' + (dashGraphDense() ? ' dense' : '') +
    '" role="img" aria-label="The links between the files in the library">' +
    '<g class="gphEdges">' + edges + '</g><g class="gphNodes">' + nodes + '</g></svg>';
  DASHG.svg = host.querySelector('svg');
  DASHG.hot = -1;
  dashGraphFit();
}
/* the frame around the whole graph, stretched to the shape of the card so that
   a client point maps straight onto a graph point with no letterboxing */
function dashGraphFit(){
  if(!DASHG.g || !DASHG.svg) return;
  const r = DASHG.host.getBoundingClientRect();
  const b = gphBounds(DASHG.g, 34);
  const ar = Math.max(0.2, r.width / Math.max(1, r.height));
  let w = b.w, h = b.h;
  if(w / h < ar) w = h * ar; else h = w / ar;
  DASHG.view = { x:b.x + b.w / 2 - w / 2, y:b.y + b.h / 2 - h / 2, w, h };
  dashGraphPaint();
}
function dashGraphPaint(){
  const g = DASHG.g, svg = DASHG.svg, v = DASHG.view;
  if(!g || !svg || !v) return;
  svg.setAttribute('viewBox', v.x.toFixed(2) + ' ' + v.y.toFixed(2) + ' ' +
    v.w.toFixed(2) + ' ' + v.h.toFixed(2));
  /* a line of text has to stay the size it is however far in the frame is
     zoomed, so its scale is undone here rather than in the stylesheet */
  const k = (v.w / Math.max(1, DASHG.host.clientWidth)).toFixed(4);
  svg.style.setProperty('--gphk', k);
  const lines = svg.querySelectorAll('.gphE'), dots = svg.querySelectorAll('.gphN');
  g.edges.forEach((e, i) => {
    const a = g.pts[e.a], b = g.pts[e.b], el = lines[i];
    if(!el) return;
    el.setAttribute('x1', a.x.toFixed(1)); el.setAttribute('y1', a.y.toFixed(1));
    el.setAttribute('x2', b.x.toFixed(1)); el.setAttribute('y2', b.y.toFixed(1));
    if(DASHG.hot < 0) el.classList.remove('on', 'off');
    else{
      const touches = e.a === DASHG.hot || e.b === DASHG.hot;
      el.classList.toggle('on', touches); el.classList.toggle('off', !touches);
    }
  });
  g.pts.forEach((p, i) => {
    const el = dots[i];
    if(!el) return;
    el.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
    if(DASHG.hot < 0){ el.classList.remove('on', 'lit', 'off'); return; }
    el.classList.toggle('on', i === DASHG.hot);
    el.classList.toggle('lit', DASHG.near[DASHG.hot].has(i));
    el.classList.toggle('off', i !== DASHG.hot && !DASHG.near[DASHG.hot].has(i));
  });
}
function dashGraphRun(){
  if(DASHG.stop || !DASHG.g) return;
  DASHG.stop = motionTick(() => {
    const rate = gphTick(DASHG.g, 1);
    dashGraphPaint();
    if(rate < GPH_CALM && !DASHG.drag){ DASHG.stop = null; return false; }
    return true;
  });
}
/* a point on the screen, in the graph's own units */
function dashGraphAt(e){
  const r = DASHG.host.getBoundingClientRect(), v = DASHG.view;
  return { x:v.x + (e.clientX - r.left) / Math.max(1, r.width) * v.w,
           y:v.y + (e.clientY - r.top) / Math.max(1, r.height) * v.h };
}
function dashGraphHot(i){
  if(DASHG.hot === i) return;
  DASHG.hot = i;
  if(DASHG.svg) DASHG.svg.classList.toggle('picking', i >= 0);
  dashGraphPaint();
}
async function dashGraphOpen(i){
  const n = DASHG.ix && DASHG.ix.nodes[i];
  if(!n) return;
  if(n.kind === 'ghost'){ dashSetOpen(false); return wkOpen(n.name); }
  return dashOpenEntry(n.kind, n.id);
}
function dashGraphDown(e){
  if(!DASHG.g || !DASHG.view) return;
  const hit = e.target.closest && e.target.closest('.gphN');
  const at = dashGraphAt(e);
  let i = hit ? +hit.dataset.i : -1;
  /* a finger is wider than a dot: anything within a thumb of the point counts
     as that dot, measured in the graph's units so it holds at any zoom */
  if(i < 0 && PLAT.touch){
    const seek = gphNearest(DASHG.g, at.x, at.y);
    if(seek.i >= 0 && seek.d < 18 * DASHG.view.w / Math.max(1, DASHG.host.clientWidth)) i = seek.i;
  }
  DASHG.drag = { i:i, x:e.clientX, y:e.clientY,
                 gx:at.x, gy:at.y, vx:DASHG.view.x, vy:DASHG.view.y, moved:false };
  if(DASHG.drag.i >= 0) DASHG.g.pts[DASHG.drag.i].pin = true;
  DASHG.svg.setPointerCapture(e.pointerId);
  e.preventDefault();
}
function dashGraphMove(e){
  const d = DASHG.drag;
  if(!d){
    const hit = e.target.closest && e.target.closest('.gphN');
    dashGraphHot(hit ? +hit.dataset.i : -1);
    return;
  }
  if(Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
  const at = dashGraphAt(e);
  if(d.i >= 0){
    const p = DASHG.g.pts[d.i];
    p.x = at.x; p.y = at.y; p.vx = p.vy = 0;
    dashGraphRun();
  }else{
    /* the frame moves under the hand, so the graph appears to be dragged */
    DASHG.view.x = d.vx - (at.x - d.gx); DASHG.view.y = d.vy - (at.y - d.gy);
    dashGraphPaint();
  }
}
function dashGraphUp(e){
  const d = DASHG.drag;
  if(!d) return;
  DASHG.drag = null;
  if(d.i >= 0){
    DASHG.g.pts[d.i].pin = false;
    /* let go where it was put: the layout carries on from there */
    if(!d.moved) return dashGraphOpen(d.i);
    dashGraphRun();
  }
}
function dashGraphWheel(e){
  if(!DASHG.view) return;
  e.preventDefault();
  const at = dashGraphAt(e), v = DASHG.view;
  const k = clamp(Math.exp(e.deltaY * 0.0016), 0.5, 2);
  const w = clamp(v.w * k, 60, 24000), scale = w / v.w;
  v.x = at.x - (at.x - v.x) * scale; v.y = at.y - (at.y - v.y) * scale;
  v.w = w; v.h = v.h * scale;
  dashGraphPaint();
}

function dashRender(){
  if(!lib || !$('#dash')) return;
  dashSeed();
  const shown = dashShown || dashToday();
  $('#dashStats').innerHTML = dashStatsHTML();
  $('#dashMonth').textContent = DASH_MONTH[shown.getMonth()] + ' ' + shown.getFullYear();
  $('#dashCal').innerHTML = dashCalHTML();
  $('#dashHeat').innerHTML = dashHeatHTML();
  /* the graph is left standing where it was unless the links themselves have
     changed — the dashboard redraws on every save, and a picture that jumped
     back to its starting places each time could never be read */
  const ix = typeof wkIndex === 'function' ? wkIndex() : null;
  const sig = ix ? dashGraphSig(ix) : '';
  if(!DASHG.svg || sig !== DASHG.sig){ DASHG.sig = sig; dashGraphBuild(); }
  $('#dashRecent').innerHTML = dashRecentHTML();
  const day = dashDayHTML();
  $('#dashDayHead').innerHTML = day.head;
  $('#dashDayList').innerHTML = day.body;
  const s = dashStats();
  $('#dashHeatMeta').textContent = s.days + (s.days === 1 ? ' day' : ' days') + ' in the last year';
  $('#dashSub').textContent = curNoteId && navBookById(curNoteId)
    ? 'open: ' + navPathFor('canvas', curNoteId).join(' / ')
    : 'your library at a glance';
}

/* ---- what a click on it does ---- */
function dashPick(key){
  const d = dashDate(key); if(!d) return;
  dashDay = key;
  dashShown = new Date(d.getFullYear(), d.getMonth(), 1);
  dashRender();
}
function dashStep(n){
  const shown = dashShown || dashToday();
  dashShown = new Date(shown.getFullYear(), shown.getMonth() + n, 1);
  dashRender();
}
async function dashOpenEntry(kind, id){
  if(kind === 'folder'){
    dashSetOpen(false);
    if(typeof navRevealFolder === 'function'){ navRevealFolder(id); navFolder = id; navSetOpen(true); navRender(); }
    return;
  }
  if(!navEntry(kind, id)) return;
  dashSetOpen(false);
  if(kind === 'canvas') return openNote(id);
  if(kind === 'markdown') return navOpenMarkdown(id);
  return navOpenAsset(id);
}

/* ================= wiring ================= */
$('#dashBtn').addEventListener('click', dashToggle);
$('#dashClose').addEventListener('click', () => dashSetOpen(false));
$('#dashPrev').addEventListener('click', () => dashStep(-1));
$('#dashNext').addEventListener('click', () => dashStep(1));
$('#dashToday').addEventListener('click', () => dashPick(dashKey(dashToday())));
/* the squares, the days and the rows are all drawn as markup and delegated to,
   so redrawing the panel never leaves a listener behind */
$('#dash').addEventListener('click', e => {
  const day = e.target.closest('[data-dash-day]');
  if(day){ dashPick(day.dataset.dashDay); return; }
  const row = e.target.closest('[data-dash-open]');
  if(row){ const [kind, id] = row.dataset.dashOpen.split(':'); dashOpenEntry(kind, id); }
});
/* The gallery and the dashboard are two ways of looking at the same library;
   only one of them is ever on top. shelf.js knows nothing about this. */
$('#dashGraphFit').addEventListener('click', dashGraphFit);
$('#dashGraphRelax').addEventListener('click', () => { DASHG.sig = ''; dashGraphBuild(); });
$('#dashGraph').addEventListener('pointerdown', dashGraphDown);
$('#dashGraph').addEventListener('pointermove', dashGraphMove);
$('#dashGraph').addEventListener('pointerup', dashGraphUp);
$('#dashGraph').addEventListener('pointercancel', () => { DASHG.drag = null; });
$('#dashGraph').addEventListener('pointerleave', () => { if(!DASHG.drag) dashGraphHot(-1); });
$('#dashGraph').addEventListener('wheel', dashGraphWheel, { passive:false });
/* the keyboard reaches a dot too: it is a button, whatever it is drawn as */
$('#dashGraph').addEventListener('keydown', e => {
  const dot = e.target.closest && e.target.closest('.gphN');
  if(!dot) return;
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); dashGraphOpen(+dot.dataset.i); }
});
$('#dashGraph').addEventListener('focusin', e => {
  const dot = e.target.closest && e.target.closest('.gphN');
  if(dot) dashGraphHot(+dot.dataset.i);
});
window.addEventListener('resize', () => { if(dashIsOpen()) dashGraphFit(); });
$('#shelfBtn').addEventListener('click', () => dashSetOpen(false));
document.querySelector('.brand').addEventListener('click', () => dashSetOpen(false));
/* Opening anything at all puts the dashboard away — otherwise a click in the
   explorer, which stays reachable over the panel, changes only what is behind
   it. A canvas comes through the registry's own hook; the explorer's other two
   kinds are read off the click, in capture, before the row acts on it. */
onNoteOpen(() => dashSetOpen(false));
document.addEventListener('click', e => {
  if(!dashIsOpen()) return;
  const row = e.target.closest('#navTree .nav-row-main');
  if(row && row.closest('.nav-row').dataset.kind !== 'folder'){ dashSetOpen(false); return; }
  const cmd = e.target.closest('#navMenu [data-nav-cmd="open"]');
  if(cmd && navContext && navContext.kind !== 'folder') dashSetOpen(false);
}, true);
/* capture, so Escape closes the dashboard before core/keys.js reads it as a
   command for the sheet underneath */
window.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd'){
    e.preventDefault(); e.stopPropagation(); dashToggle(); return;
  }
  if(!dashIsOpen()) return;
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); dashSetOpen(false); return; }
  if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
    const el = document.activeElement;
    if(el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
    e.preventDefault(); e.stopPropagation(); dashStep(e.key === 'ArrowLeft' ? -1 : 1);
  }
}, true);

/* ---- how it looks ---- */
addCSS('dashboard', `
/* ---------- the dashboard ---------- */
/* One dark surface over the desk, like the gallery, so the note's own colours
   are never what a chart is read against — only the accent comes through. */
.dash{position:fixed;inset:0;z-index:55;display:none;overflow:auto;font-family:var(--mono);color:#e4e1d8;
  padding:calc(34px + env(safe-area-inset-top)) calc(26px + env(safe-area-inset-right)) calc(70px + env(safe-area-inset-bottom)) calc(26px + env(safe-area-inset-left));
  background:#0c0f12 radial-gradient(120% 80% at 50% 0%,rgba(255,255,255,.055),transparent 60%);
  --h0:rgba(255,255,255,.055);
  --h1:color-mix(in srgb,var(--accent2) 26%,#12161a);
  --h2:color-mix(in srgb,var(--accent2) 50%,#12161a);
  --h3:color-mix(in srgb,var(--accent2) 74%,#12161a);
  --h4:var(--accent2)}
.dash.open{display:block}
/* The map floats over the desk at a higher layer than any full-screen panel —
   while the dashboard is the screen there is no desk for it to be a map of. */
body.dash-open .cmap{display:none}
.dashHead{position:relative;max-width:1180px;margin:0 auto 26px;text-align:center}
.dashHead h2{font-family:var(--disp);font-size:clamp(26px,4vw,38px);text-transform:uppercase;letter-spacing:.04em;color:#efece4;margin:0}
.dashHead .sub{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8f8c84;margin-top:6px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dashClose{position:absolute;right:0;top:6px}
.dashWrap{display:grid;gap:18px;max-width:1180px;margin:0 auto;align-content:start;
  grid-template-columns:minmax(300px,360px) minmax(0,1fr);
  grid-template-areas:"stats stats" "heat heat" "graph graph" "cal recent" "day recent"}
.dashStats{grid-area:stats;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(168px,1fr))}
.dashTile{padding:14px 16px;border:1px solid rgba(255,255,255,.09);border-radius:4px;background:rgba(255,255,255,.025)}
.dashTile b{display:block;font-family:var(--disp);font-weight:600;font-size:36px;line-height:.95;color:#f2efe7}
.dashTile span{display:block;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#a8a49b;margin-top:7px}
.dashTile i{display:block;font-style:normal;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#7c7970;margin-top:4px}
.dashCard{border:1px solid rgba(255,255,255,.09);border-radius:4px;background:rgba(255,255,255,.025);padding:15px 16px 17px;min-width:0}
.dashCard > header{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.dashCard h3{font-family:var(--disp);font-size:19px;line-height:1;letter-spacing:.05em;text-transform:uppercase;color:#efece4;margin:0}
.dashMeta{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#84817a}
.dashCard > header .dashMeta{margin-left:auto;text-align:right}
.dashCard.cal{grid-area:cal}.dashCard.recent{grid-area:recent}.dashCard.heat{grid-area:heat}
.dashCard.day{grid-area:day}.dashCard.graph{grid-area:graph}
/* ---- the links between the files ---- */
/* the two buttons here are words, not arrows */
.dashCard.graph>header .dashMeta{margin-left:0}
.dashCard.graph .dashNav button{width:auto;padding:0 9px;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
#dashGraph{height:clamp(250px,38vh,400px);margin:-4px -6px -8px;position:relative;
  overflow:hidden;border-radius:3px;touch-action:none;cursor:grab}
#dashGraph:active{cursor:grabbing}
.gphSvg{display:block;width:100%;height:100%;--gphk:1}
.gphE{stroke:rgba(255,255,255,.17);stroke-width:calc(var(--gphk)*1px);stroke-linecap:round}
.gphE.on{stroke:color-mix(in srgb,var(--accent2) 90%,#fff);stroke-width:calc(var(--gphk)*1.8px)}
.gphE.off{stroke:rgba(255,255,255,.05)}
.gphN{cursor:pointer}
.gphN circle{fill:var(--accent2);stroke:#0c0f12;stroke-width:calc(var(--gphk)*1.2px);
  transition:fill .12s ease}
.gphN.canvas circle{fill:var(--accent)}
.gphN.ghost circle{fill:none;stroke:color-mix(in srgb,var(--accent2) 60%,transparent);
  stroke-width:calc(var(--gphk)*1.4px);stroke-dasharray:calc(var(--gphk)*2.4px) calc(var(--gphk)*2.4px)}
.gphN text{font-family:var(--mono);font-size:calc(var(--gphk)*9px);fill:#b8b4ac;
  text-anchor:middle;pointer-events:none;paint-order:stroke;
  stroke:#0c0f12;stroke-width:calc(var(--gphk)*2.6px);stroke-linejoin:round}
.gphSvg.dense .gphN text{opacity:0;transition:opacity .12s ease}
.gphN.on text,.gphN.lit text{opacity:1;fill:#f2efe7}
.gphN.on circle{fill:#f2efe7}
.gphN.ghost.on circle{fill:none;stroke:#f2efe7}
.gphN.off{opacity:.26}
.gphN:focus-visible{outline:none}
.gphN:focus-visible circle{stroke:#fff;stroke-width:calc(var(--gphk)*2px)}
.gphN:hover circle{fill:#f2efe7}
/* ---- the month ---- */
.dashNav{margin-left:auto;display:flex;align-items:center;gap:4px}
.dashNav button{width:26px;height:24px;border-radius:3px;color:#a8a49b;font:12px var(--mono);border:1px solid rgba(255,255,255,.12)}
.dashNav button#dashToday{width:auto;padding:0 8px;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
.dashNav button:hover{color:#fff;border-color:var(--accent2);background:rgba(255,255,255,.06)}
/* The days are squares, so the month is only ever as wide as seven of them —
   a full-width month on a phone would make each day a card the size of a
   postcard, and a grid item with an aspect ratio does not stretch to fill. */
#dashCal{max-width:364px;margin:0 auto}
.calHead,.calGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.calHead{margin-bottom:5px}
.calHead span{text-align:center;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#77746d}
.calHead abbr{text-decoration:none;border:0;cursor:help}
.calDay,.calPad{aspect-ratio:1;border-radius:3px}
.calDay{position:relative;display:grid;place-items:center;background:var(--h0);color:#c9c5bc;font:11px var(--mono);
  border:1px solid transparent;transition:transform .12s ease,border-color .12s ease}
.calDay[data-lv="1"]{background:var(--h1);color:#e7e4dc}
.calDay[data-lv="2"]{background:var(--h2);color:#f2efe8}
.calDay[data-lv="3"]{background:var(--h3);color:#fbf9f4}
.calDay[data-lv="4"]{background:var(--h4);color:#0d1013}
.calDay:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.35)}
.calDay.ahead{opacity:.32}
.calDay.today{box-shadow:inset 0 0 0 1.5px var(--accent)}
.calDay.picked{border-color:#fff}
.calDot{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.75}
/* ---- the year ---- */
.heatScroll{overflow-x:auto;overflow-y:hidden;padding-bottom:4px;scrollbar-width:thin;scrollbar-color:#41474c transparent}
.heatWrap{--cell:11px;display:grid;gap:3px;grid-template-columns:auto 1fr;grid-template-areas:". months" "wd cells";min-width:min-content}
.heatMonths{grid-area:months;display:grid;grid-template-columns:repeat(var(--weeks),var(--cell));gap:3px;
  font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#84817a;height:11px}
.heatMonths span{grid-row:1;white-space:nowrap}
.heatWD{grid-area:wd;display:grid;grid-template-rows:repeat(7,var(--cell));gap:3px;padding-right:3px;
  font-size:7.5px;letter-spacing:.06em;text-transform:uppercase;color:#77746d}
.heatWD span{display:grid;align-items:center}
.heatCells{grid-area:cells;display:grid;grid-auto-flow:column;gap:3px;
  grid-template-columns:repeat(var(--weeks),var(--cell));grid-template-rows:repeat(7,var(--cell))}
.heatCell{width:var(--cell);height:var(--cell);padding:0;border-radius:2px;background:var(--h0);border:1px solid transparent}
.heatCell[data-lv="1"]{background:var(--h1)}
.heatCell[data-lv="2"]{background:var(--h2)}
.heatCell[data-lv="3"]{background:var(--h3)}
.heatCell[data-lv="4"]{background:var(--h4)}
.heatCell.ahead{background:transparent}
.heatCell:hover{border-color:rgba(255,255,255,.55)}
.heatCell.picked{border-color:#fff}
.heatKey{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:9px;
  font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#7c7970}
.heatKey i{width:11px;height:11px;border-radius:2px;background:var(--h0)}
.heatKey i[data-lv="1"]{background:var(--h1)}
.heatKey i[data-lv="2"]{background:var(--h2)}
.heatKey i[data-lv="3"]{background:var(--h3)}
.heatKey i[data-lv="4"]{background:var(--h4)}
/* ---- the lists ---- */
.dashRow{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border-radius:4px;text-align:left;color:#c9c5bc}
.dashRow:hover{background:rgba(255,255,255,.055);color:#fff}
.dashRow .nav-glyph{flex:0 0 21px}
.dashFolder{color:var(--accent2);font-size:13px}
.dashRowText{flex:1;min-width:0}
.dashRowName{display:block;font-size:11px;letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dashRowPath{display:block;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#7c7970;margin-top:3px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dashRowWhen{flex:0 0 auto;text-align:right;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#8f8c84}
.dashRowWhen i{display:block;font-style:normal;font-size:8px;color:#6e6b64;margin-top:3px}
.dashEmpty{padding:22px 6px;color:#7c7970;font-size:10px;line-height:1.6;text-align:center}
.dash .vh{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (max-width:920px){
  .dashWrap{grid-template-columns:minmax(0,1fr);
    grid-template-areas:"stats" "heat" "graph" "cal" "day" "recent"}
}
@media (pointer:coarse){
  .heatWrap{--cell:14px}
  .dashRow{padding:11px 8px}
  .dashNav button{width:34px;height:32px}
}
@media (prefers-reduced-motion:reduce){
  .calDay{transition:none}.calDay:hover{transform:none}
  .gphN circle,.gphSvg.dense .gphN text{transition:none}
}
@media (prefers-contrast:more){
  .dash{background:#05070a}
  .dashCard,.dashTile{border-color:#fff}
  .calDay.picked,.heatCell.picked{outline:2px solid #fff}
}
`);
