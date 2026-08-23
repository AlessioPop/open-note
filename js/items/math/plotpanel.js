/* Open Note — items/math/plotpanel.js
   the list beside a plot — every expression, series and vector on it, each
   with its colour, a switch, and the typeset picture of what was typed

   It is part of the plot item, built only on the live page (print and an
   export never see it), and it hangs off the left of the picture the way the
   logic editor's rail does, so it zooms with the sheet and never changes the
   plot's own box. The rows are <input>s on purpose: the LaTeX editor that
   follows the caret in a writing box only ever engages with a contenteditable,
   so it stays out of here by construction. */

const XP_W = 272;                                   // the panel's width, in plain px — it is chrome, not paper
const XP_OPEN = it => it.xp === 1;                  // absent is closed: an old note opens it when asked
let XP_RAF = 0;

/* ---- what goes in the list ---- */
function xpRows(it){
  const out = [];
  for(const f of fnsOf(it)) out.push({ kind:'fn', o:f });
  for(const d of datOf(it)) out.push({ kind:'dat', o:d });
  for(const v of vecsOf(it)) out.push({ kind:'vec', o:v });
  return out;
}
const xpSig = it => xpRows(it).map(r => r.kind + ':' + r.o.id).join(' ');
function xpSummary(r){
  const o = r.o;
  if(r.kind === 'dat') return (o.lab || 'data') + ' · ' + datPts(o).length + (datPts(o).length === 1 ? ' point' : ' points');
  return (o.lab ? o.lab + ' ' : '') + '(' + mfmt(nz(o.x, 0), 2) + ', ' + mfmt(nz(o.y, 0), 2) + ')';
}
/* a picture is worth drawing when the text alone would not say it: a power, a
   fraction, a root, a function, a Greek letter, a ≤ */
const xpWorth = src => /[\^\/(|{θπ]|<=|>=|[a-zA-Z]{2,}/.test(src);

function xpRowHTML(r, i){
  const o = r.o, c = esc(o.c || '#888'), id = esc(o.id);
  const dot = '<button class="xpdot" role="switch" aria-checked="' + (hidden(o) ? 'false' : 'true') +
    '" aria-label="Show it on the plot" title="' + (hidden(o) ? 'Hidden — click to show it' : 'Shown — click to hide it') +
    ' · right-click or hold for a colour"></button>';
  const del = '<button class="xpdel" aria-label="Delete" title="Take it off the plot">✕</button>';
  if(r.kind !== 'fn')
    return '<li class="xprow xp' + r.kind + (hidden(o) ? ' off' : '') + '" data-o="' + r.kind + ':' + id + '" style="--c:' + c + '">' +
      dot + '<span class="xpsum">' + esc(xpSummary(r)) + '</span>' +
      (r.kind === 'dat' ? '<button class="xpfit" aria-label="Fit the view to the points" title="Fit the view to the points">⤢</button>' : '') +
      del + '</li>';
  return '<li class="xprow xpfn' + (hidden(o) ? ' off' : '') + '" data-o="fn:' + id + '" style="--c:' + c + '">' + dot +
    '<span class="xppre" aria-hidden="true"></span>' +
    '<input class="xpin" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" ' +
      'aria-label="Expression ' + (i + 1) + '" aria-describedby="xpe-' + id + ' xph-' + id + '" ' +
      'placeholder="sin(x), x^2+y^2=1, y<x…" value="' + esc(o.expr || '') + '">' + del +
    '<div class="xppv" aria-hidden="true"></div>' +
    '<p class="xperr" id="xpe-' + id + '" role="status"></p>' +
    '<p class="xphint" id="xph-' + id + '"></p>' +
    '<span class="xpdom" hidden><label>from <input class="xpd" data-k="0" aria-label="Where the parameter starts" size="5"></label>' +
    '<label>to <input class="xpd" data-k="1" aria-label="Where the parameter stops" size="5"></label></span></li>';
}
function xpListHTML(it){
  return xpRows(it).map(xpRowHTML).join('');
}
function xpHTML(it){
  const aid = 'xpa-' + esc(it.id);
  return '<aside class="xpanel glass-lite' + (XP_OPEN(it) ? ' open' : '') + '" role="group" aria-label="Expressions">' +
    '<header class="xphead"><h3 class="xptitle">Expressions</h3>' +
    '<div class="xpacts"><div class="xpadvwrap"><button class="xpadv" aria-expanded="false" aria-controls="' + aid +
      '" aria-label="Advanced axes options" title="Advanced axes options">' + icn('xpadv') + '</button>' +
      xpFootHTML(it, aid) + '</div>' +
    '<button class="xpfold" aria-expanded="true" aria-label="Hide the expressions" title="Hide the list (Esc)">' + icn('xpfold') + '</button></div></header>' +
    '<ul class="xplist" role="list" data-sig="' + esc(xpSig(it)) + '">' + xpListHTML(it) + '</ul>' +
    '<button class="xpadd" title="Add an expression (⏎ at the end of a row does too)">＋ expression</button></aside>';
}
/* the axes themselves: the lattice, the scales, and what they are called */
function xpFootHTML(it, id){
  const sw = (a, lab, on, title) => '<button class="xpsw" data-a="' + a + '" role="switch" aria-checked="' + (on ? 'true' : 'false') +
    '" title="' + esc(title) + '">' + lab + '</button>';
  return '<div class="xpfoot" id="' + id + '" role="group" aria-label="Advanced axes options">' +
    '<div class="xpfoottitle">Axes options</div>' +
    '<div class="xpseg" role="radiogroup" aria-label="Lattice">' +
      '<button class="xpseg1" data-a="cart" role="radio" aria-checked="' + (it.pol === 1 ? 'false' : 'true') + '" title="A square lattice">cartesian</button>' +
      '<button class="xpseg1" data-a="polar" role="radio" aria-checked="' + (it.pol === 1 ? 'true' : 'false') + '" title="Rings and spokes — r = cos(3θ) and friends">polar</button></div>' +
    '<div class="xpsws">' + sw('logx', 'log x', it.lx === 1, 'Decades along x — the basis goes back to standard') +
      sw('logy', 'log y', it.ly === 1, 'Decades along y — the basis goes back to standard') + '</div>' +
    '<div class="xplabs"><label><span>x</span><input class="xpal" data-k="xl" aria-label="Name of the x axis" placeholder="name" value="' + esc(it.xl || '') + '"></label>' +
    '<label><span>y</span><input class="xpal" data-k="yl" aria-label="Name of the y axis" placeholder="name" value="' + esc(it.yl || '') + '"></label></div>' +
    '</div>';
}
function xpFootSync(panel, it){
  const q = panel.querySelector.bind(panel);
  const set = (sel, on) => { const b = q(sel); if(b && b.getAttribute('aria-checked') !== String(on)) b.setAttribute('aria-checked', String(on)); };
  set('[data-a="cart"]', it.pol !== 1); set('[data-a="polar"]', it.pol === 1);
  set('[data-a="logx"]', it.lx === 1); set('[data-a="logy"]', it.ly === 1);
  panel.querySelectorAll('.xpal').forEach(n => { const v = it[n.dataset.k] || ''; if(document.activeElement !== n && n.value !== v) n.value = v; });
}

/* ---- keeping it true ----
   paintPlot asks on every repaint, which is every frame of a drag; so this
   touches only what changed, and never rebuilds a row somebody is typing in */
function xpRowSync(el, it, row, r, sel){
  const o = r.o, c = o.c || '#888';
  if(row.style.getPropertyValue('--c') !== c) row.style.setProperty('--c', c);
  const off = hidden(o);
  row.classList.toggle('off', off);
  row.classList.toggle('sel', !!sel && sel.kind === r.kind && sel.id === o.id);
  const dot = row.querySelector('.xpdot');
  if(dot.getAttribute('aria-checked') !== String(!off)){
    dot.setAttribute('aria-checked', String(!off));
    dot.title = (off ? 'Hidden — click to show it' : 'Shown — click to hide it') + ' · right-click or hold for a colour';
  }
  if(r.kind !== 'fn'){
    const sum = row.querySelector('.xpsum'), txt = xpSummary(r);
    if(sum.textContent !== txt) sum.textContent = txt;
    return;
  }
  const inp = row.querySelector('.xpin');
  if(document.activeElement !== inp && inp.value !== (o.expr || '')) inp.value = o.expr || '';
  const src = String(o.expr || ''), cx = mxCompile(src);
  const err = cx.err || '';
  const ep = row.querySelector('.xperr');
  if(ep.textContent !== err) ep.textContent = err;
  if(inp.getAttribute('aria-invalid') !== String(!!err)) inp.setAttribute('aria-invalid', String(!!err));
  const pre = !cx.ast || cx.rel || cx.kind === 'points' || cx.kind === 'param' || cx.kind === 'bad' ? ''
            : cx.kind === 'polar' ? 'r =' : 'y =';
  const pn = row.querySelector('.xppre');
  if(pn.textContent !== pre) pn.textContent = pre;
  row.classList.toggle('nopre', !pre);
  /* the picture: the last good one stays, dimmed, while a half-typed
     command is being finished — mathpad's rule, for the same reason */
  const pv = row.querySelector('.xppv');
  const want = cx.ast && !err && xpWorth(src) ? cx.tex : (cx.ast || src ? '' : '');
  if(!src){ pv.innerHTML = ''; pv.dataset.tex = ''; pv.classList.remove('stale'); }
  else if(err) pv.classList.toggle('stale', !!pv.dataset.tex);
  else if(want !== pv.dataset.tex){
    pv.classList.remove('stale');
    pv.dataset.tex = want;
    pv.innerHTML = '';
    if(want){ try{ pv.appendChild(texCompile(want, false)); }catch(e){ pv.dataset.tex = ''; } }
  } else pv.classList.remove('stale');
  const hint = row.querySelector('.xphint'), ht = xpHint(cx);
  if(hint.textContent !== ht) hint.textContent = ht;
  /* a curve on a parameter says where the parameter runs */
  const dom = row.querySelector('.xpdom'), ranged = cx.kind === 'polar' || cx.kind === 'param';
  if(dom.hidden === ranged){
    dom.hidden = !ranged;
    if(ranged) dom.querySelector('label').firstChild.textContent = (cx.kind === 'polar' ? 'θ' : 't') + ' from ';
  }
  if(ranged){
    const d = Array.isArray(o.dom) && o.dom.length === 2 ? o.dom : [0, Math.PI * 2];
    dom.querySelectorAll('.xpd').forEach((n, k) => {
      if(document.activeElement !== n && !n.classList.contains('bad')) n.value = xpDomText(d[k]);
    });
  }
}
/* what the list says under a row: the kind of thing it is, in a few words */
function xpHint(cx){
  if(!cx.ast || cx.err) return '';
  if(cx.kind === 'ineq') return cx.strict ? 'strict · dashed boundary' : 'inclusive · solid boundary';
  if(cx.kind === 'implicit') return 'equation in x and y';
  if(cx.kind === 'polar') return 'polar';
  if(cx.kind === 'param') return 'parametric';
  if(cx.kind === 'points') return (cx.complex ? 'on the complex plane · ' : '') + cx.pts.length + (cx.pts.length === 1 ? ' point' : ' points');
  if(cx.kind === 'expx') return 'a function of y';
  if(cx.complex) return 'complex · re solid, im dashed';
  return '';
}
const xpDomText = v => Math.abs(v - Math.PI * 2) < 1e-9 ? '2π' : Math.abs(v - Math.PI) < 1e-9 ? 'π' : Math.abs(v + Math.PI) < 1e-9 ? '-π' : mfmt(v, 4);
function xpSync(el, it){
  const panel = el.querySelector('.xpanel');
  if(!panel) return;
  const list = panel.querySelector('.xplist'), rows = xpRows(it), sig = xpSig(it);
  if(list.dataset.sig !== sig){
    /* the set of things changed: rebuild, and put the caret back where it was */
    const act = document.activeElement, inRow = act && act.classList && act.classList.contains('xpin') && list.contains(act);
    const keep = inRow ? { id:act.closest('.xprow').dataset.o, pos:act.selectionStart } : null;
    list.innerHTML = xpListHTML(it);
    list.dataset.sig = sig;
    if(keep){
      const again = list.querySelector('.xprow[data-o="' + keep.id + '"] .xpin');
      if(again){ again.focus(); try{ again.setSelectionRange(keep.pos, keep.pos); }catch(e){} }
    }
  }
  const sel = mathSel && mathSel.pid === it.id ? mathSel : null;
  const els = list.children;
  rows.forEach((r, i) => { if(els[i]) xpRowSync(el, it, els[i], r, sel); });
  xpFootSync(panel, it);
  xpPlace(el, panel);
}
/* on the left of the picture, or the right when the paper's edge is too close
   — .page clips whatever hangs past it */
function xpPlace(el, panel){
  panel = panel || el.querySelector('.xpanel');
  if(!panel || !panel.classList.contains('open') || !el.classList.contains('sel')) return;
  const page = el.closest('.page');
  if(!page) return;
  const r = el.getBoundingClientRect(), pr = page.getBoundingClientRect();
  const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
  panel.classList.toggle('right', r.left - pr.left < (XP_W + 16) * k);
}

/* ---- doing things to the list ---- */
function xpRowOf(n){ const row = n && n.closest ? n.closest('.xprow') : null; return row ? String(row.dataset.o).split(':') : null; }
function xpFocusRow(el, id, atEnd){
  const inp = el.querySelector('.xprow[data-o="fn:' + id + '"] .xpin');
  if(!inp) return false;
  inp.focus();
  if(atEnd){ const n = inp.value.length; try{ inp.setSelectionRange(n, n); }catch(e){} }
  return true;
}
function xpShow(el, it, page, on){
  const panel = el.querySelector('.xpanel');
  if(!panel) return;
  if(!on) xpAdvanced(panel, false);
  it.xp = on ? 1 : 0;
  panel.classList.toggle('open', !!on);
  const fold = panel.querySelector('.xpfold');
  if(fold) fold.setAttribute('aria-expanded', String(!!on));
  queueSave(page.id, false);                       /* remembered, but not a step to undo */
  if(on) xpPlace(el, panel);
}
function xpToggle(el, it, page){
  const on = !XP_OPEN(it);
  xpShow(el, it, page, on);
  if(on){
    select(it.id);
    const first = el.querySelector('.xprow .xpin');
    if(first) first.focus(); else el.querySelector('.xpadd').focus();
  } else {
    const b = [...el.querySelectorAll('.tools button')].find(x => x.textContent === 'ƒ(x)');
    if(b) b.focus();
  }
}
/* a new empty row — after the one given, or at the end */
function xpAdd(el, it, page, afterId){
  if(!XP_OPEN(it)) xpShow(el, it, page, true);
  const f = { id:uid(), expr:'', c:nextColor(it), s:'solid' };
  const fns = fnsOf(it), at = afterId ? fns.findIndex(x => x.id === afterId) : -1;
  if(at >= 0) fns.splice(at + 1, 0, f); else fns.push(f);
  queueSave(page.id); SND.plop();
  paintPlot(el, it);
  const row = el.querySelector('.xprow[data-o="fn:' + f.id + '"]');
  if(row) row.classList.add('new');
  xpFocusRow(el, f.id);
  return f;
}
function xpRemove(el, it, page, kind, id){
  const arr = mathArr(it, kind), o = mathObj(it, kind, id);
  if(!o) return;
  const fns = fnsOf(it), i = kind === 'fn' ? fns.indexOf(o) : -1;
  arr.splice(arr.indexOf(o), 1);
  if(mathSel && mathSel.pid === it.id && mathSel.id === id) mathSel = null;
  queueSave(page.id); SND.pluck();
  paintPlot(el, it); syncMathState();
  if(kind === 'fn'){
    const prev = fns[Math.max(0, i - 1)];
    if(!prev || !xpFocusRow(el, prev.id, true)) el.querySelector('.xpadd').focus();
  }
}
function xpMove(el, it, page, id, dir){
  const fns = fnsOf(it), i = fns.findIndex(f => f.id === id), j = i + dir;
  if(i < 0 || j < 0 || j >= fns.length) return;
  const pos = el.querySelector('.xprow[data-o="fn:' + id + '"] .xpin').selectionStart;
  fns.splice(j, 0, fns.splice(i, 1)[0]);
  queueSave(page.id);
  paintPlot(el, it);
  const inp = el.querySelector('.xprow[data-o="fn:' + id + '"] .xpin');
  if(inp){ inp.focus(); try{ inp.setSelectionRange(pos, pos); }catch(e){} }
}
function xpColour(el, it, page, kind, id, dot){
  const o = mathObj(it, kind, id);
  if(!o) return;
  openProps(dot, {
    title:'Colour',
    rows:[{ t:'swatch', colors:MATH_COLORS, wheel:true, get:() => o.c || '#888',
      pick:c => {
        o.c = c;
        /* picking a colour by hand takes the colour wire off, if there is one */
        if(o.cs){ delete o.cs; if(typeof ndLay === 'function') ndLay(); }
      } }],
    onchange:() => paintPlot(el, it),
    onsave:() => queueSave(page.id)
  });
}
function xpVisible(el, it, page, kind, id){
  const o = mathObj(it, kind, id);
  if(!o) return;
  if(hidden(o)) delete o.on; else o.on = 0;
  queueSave(page.id);
  paintPlot(el, it);
}

function xpAdvanced(panel, on, focus){
  const b = panel && panel.querySelector('.xpadv');
  if(!b) return;
  panel.classList.toggle('adv-open', !!on);
  b.setAttribute('aria-expanded', String(!!on));
  if(focus) b.focus();
}

/* ---- wired up ---- */
function xpWire(el, it, page){
  const panel = el.querySelector('.xpanel');
  if(!panel) return;
  const list = panel.querySelector('.xplist');
  /* the item underneath must not start a drag, a double-click must not flip the
     plot into move mode, and the wheel scrolls the list rather than the desk */
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  panel.addEventListener('dblclick', e => e.stopPropagation());
  panel.addEventListener('wheel', e => e.stopPropagation(), { passive:true });
  /* the sheet's right-click opens the palette from anywhere — not from here */
  panel.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    const dot = e.target.closest('.xpdot'), p = xpRowOf(dot);
    if(p) xpColour(el, it, page, p[0], p[1], dot);
  });
  el.addEventListener('pointerdown', e => {
    if(panel.classList.contains('adv-open') && !e.target.closest('.xpadvwrap')) xpAdvanced(panel, false);
    requestAnimationFrame(() => xpPlace(el, panel));
  }, true);
  panel.addEventListener('focusin', () => xpPlace(el, panel));
  /* being picked is what shows the panel, and core says so only through the
     item's class — so that is what is watched */
  new MutationObserver(() => {
    if(!el.classList.contains('sel')) xpAdvanced(panel, false);
    xpPlace(el, panel);
  }).observe(el, { attributes:true, attributeFilter:['class'] });

  panel.querySelector('.xpadv').addEventListener('click', e => {
    e.stopPropagation();
    xpAdvanced(panel, !panel.classList.contains('adv-open'));
  });
  panel.querySelector('.xpfold').addEventListener('click', () => xpToggle(el, it, page));
  panel.querySelector('.xpadd').addEventListener('click', () => xpAdd(el, it, page));
  const foot = panel.querySelector('.xpfoot');
  foot.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]');
    if(!b) return;
    const a = b.dataset.a;
    if(a === 'cart'){ if(it.pol === 1) plotAct('polar', it, page); }
    else if(a === 'polar'){ if(it.pol !== 1) plotAct('polar', it, page); }
    else plotAct(a, it, page);
    SND.plop();
  });
  foot.addEventListener('input', e => {
    const n = e.target.closest('.xpal');
    if(!n) return;
    const v = n.value.slice(0, 40);
    if(v) it[n.dataset.k] = v; else delete it[n.dataset.k];
    queueSave(page.id);
    if(!XP_RAF) XP_RAF = requestAnimationFrame(() => { XP_RAF = 0; paintPlot(el, it); });
  });
  foot.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      if(e.target.closest('.xpal')) e.target.blur();
      xpAdvanced(panel, false, true); return;
    }
    if(e.target.closest('.xpal') && e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); e.target.blur(); }
  });

  /* a finger held on the dot is the right-click it does not have */
  let hold = 0, held = null;
  list.addEventListener('pointerdown', e => {
    const dot = e.target.closest('.xpdot');
    if(!dot || e.button !== 0) return;
    held = null;
    hold = setTimeout(() => { held = dot; const p = xpRowOf(dot); if(p) xpColour(el, it, page, p[0], p[1], dot); }, 450);
    const stop = () => { clearTimeout(hold); dot.removeEventListener('pointerup', stop); dot.removeEventListener('pointerleave', stop); };
    dot.addEventListener('pointerup', stop); dot.addEventListener('pointerleave', stop);
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('button'), p = xpRowOf(e.target);
    if(!p) return;
    if(b && b.classList.contains('xpdot')){
      if(held === b){ held = null; return; }        /* the hold already opened the colours */
      return xpVisible(el, it, page, p[0], p[1]);
    }
    if(b && b.classList.contains('xpdel')) return xpRemove(el, it, page, p[0], p[1]);
    if(b && b.classList.contains('xpfit')){ plotFitData(it); queueSave(page.id); paintPlot(el, it); syncMathState(); return; }
    /* the row itself picks the thing, the way the key under the picture does */
    if(!e.target.closest('.xpin')){ select(it.id); selectMath(it.id, p[0], p[1]); }
  });
  list.addEventListener('focusin', e => {
    const p = xpRowOf(e.target);
    if(p && p[0] === 'fn' && !(mathSel && mathSel.id === p[1])){ select(it.id); selectMath(it.id, 'fn', p[1]); }
  });
  list.addEventListener('input', e => {
    const p = xpRowOf(e.target), o = p && mathObj(it, 'fn', p[1]);
    if(!o) return;
    const dn = e.target.closest('.xpd');
    if(dn){
      /* both ends of the range, the second past the first, or nothing changes */
      const ins = [...dn.parentNode.parentNode.querySelectorAll('.xpd')];
      const vs = ins.map(n => mxNum(n.value));
      ins.forEach((n, k) => n.classList.toggle('bad', !!vs[k].err));
      if(vs.some(v => v.err) || !(vs[1].v > vs[0].v)) return;
      o.dom = [vs[0].v, vs[1].v];
      queueSave(page.id);
      if(!XP_RAF) XP_RAF = requestAnimationFrame(() => { XP_RAF = 0; paintPlot(el, it); });
      return;
    }
    const inp = e.target.closest('.xpin');
    if(!inp) return;
    o.expr = inp.value;
    queueSave(page.id);
    /* one repaint per frame however fast the typing */
    if(!XP_RAF) XP_RAF = requestAnimationFrame(() => { XP_RAF = 0; paintPlot(el, it); });
  });
  list.addEventListener('keydown', e => {
    const inp = e.target.closest('.xpin'), dot = e.target.closest('.xpdot');
    const p = xpRowOf(e.target);
    if(!p) return;
    if(e.target.closest('.xpd')){ if(e.key === 'Enter' || e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); e.target.blur(); } return; }
    const k = e.key, alt = e.altKey, rows = [...list.querySelectorAll('.xprow.xpfn')];
    const i = rows.findIndex(r => r.dataset.o === 'fn:' + p[1]);
    const take = () => { e.preventDefault(); e.stopPropagation(); };
    if(dot && k === 'Enter' && alt){ take(); return xpColour(el, it, page, p[0], p[1], dot); }
    if(!inp) return;
    if(k === 'Enter'){
      take();
      if(e.shiftKey) return inp.blur();
      if(e.ctrlKey || e.metaKey) return xpAdd(el, it, page);
      /* an empty last row is the end of the list, not a request for another */
      if(!inp.value.trim() && i === rows.length - 1) return panel.querySelector('.xpadd').focus();
      return xpAdd(el, it, page, p[1]);
    }
    if(k === 'ArrowUp' || k === 'ArrowDown'){
      take();
      if(alt) return xpMove(el, it, page, p[1], k === 'ArrowUp' ? -1 : 1);
      const j = i + (k === 'ArrowUp' ? -1 : 1);
      if(j < 0) return panel.querySelector('.xpfold').focus();
      if(j >= rows.length) return panel.querySelector('.xpadd').focus();
      const n = rows[j].querySelector('.xpin'); n.focus();
      const at = Math.min(inp.selectionStart, n.value.length);
      try{ n.setSelectionRange(at, at); }catch(err){}
      return;
    }
    if((k === 'Backspace' || k === 'Delete') && (alt || !inp.value)){
      take(); return xpRemove(el, it, page, 'fn', p[1]);
    }
    if(k === 'Escape'){
      take(); inp.blur();
      const d = e.target.closest('.xprow').querySelector('.xpdot'); if(d) d.focus();
    }
  });
  xpSync(el, it);                                  /* the prefixes and pictures the markup left out */
}
/* keys arriving while a button in the panel has the focus — the inputs are
   already the browser's own, and core steps round any of those */
function xpKey(e){
  const a = document.activeElement, panel = a && a.closest ? a.closest('.xpanel') : null;
  if(!panel) return false;
  const el = panel.closest('.item'), f = el && findItem(el.dataset.id);
  if(!f) return false;
  const p = xpRowOf(a);
  if(e.key === 'Escape' && panel.classList.contains('adv-open')){ e.preventDefault(); xpAdvanced(panel, false, true); return true; }
  if(e.key === 'Escape'){ e.preventDefault(); xpToggle(el, f.it, f.page); return true; }
  if((e.key === 'Delete' || e.key === 'Backspace') && p){ e.preventDefault(); xpRemove(el, f.it, f.page, p[0], p[1]); return true; }
  if(e.key === 'Enter' && e.altKey && p && a.classList.contains('xpdot')){ e.preventDefault(); xpColour(el, f.it, f.page, p[0], p[1], a); return true; }
  return false;
}

defineIcon('xpfold', '<path d="M15 6l-6 6 6 6"/>');
defineIcon('xpadv', '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"/>');

addCSS('plotpanel', `
/* ---------- the expressions beside a plot ---------- */
.xpanel{position:absolute;right:100%;top:0;margin-right:10px;z-index:22;width:min(${XP_W}px,calc(100vw - 24px));
  max-height:min(520px,62vh);display:flex;flex-direction:column;padding:0 0 8px;border-radius:14px;
  color:#e9eaef;font-family:var(--mono);box-shadow:0 16px 48px rgba(0,0,0,.28);
  visibility:hidden;opacity:0;transform:translateX(-8px);pointer-events:none;
  transition:opacity .22s,transform .22s cubic-bezier(.2,.9,.27,1),visibility 0s .22s}
.xpanel.right{right:auto;left:100%;margin:0 0 0 10px;transform:translateX(8px)}
.item.sel .xpanel.open{visibility:visible;opacity:1;transform:none;pointer-events:auto;
  transition:opacity .34s,transform .34s cubic-bezier(.2,.9,.27,1),visibility 0s}
/* the plot whose list is out stands above its neighbours — an item's own
   z-index is written inline, so this has to insist */
.item.sel:has(.xpanel.open){z-index:58!important}
.xphead{position:relative;z-index:3;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 8px 8px 14px}
.xptitle{margin:0;font:600 10px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;color:rgba(233,234,239,.62)}
.xpacts{display:flex;align-items:center;gap:3px}.xpadvwrap{position:relative;display:flex}
.xpfold,.xpadv{width:26px;height:26px;border-radius:8px;color:rgba(233,234,239,.7);background:rgba(255,255,255,.05)}
.xpfold .ic,.xpadv .ic{width:16px;height:16px}
.xpfold:hover,.xpfold:focus-visible,.xpadv:hover,.xpadv:focus-visible{background:rgba(255,255,255,.12);color:#fff}
.xpadv[aria-expanded="true"]{background:color-mix(in srgb,var(--accent2) 28%,rgba(255,255,255,.08));color:#fff}
.xplist{list-style:none;margin:0;padding:0 8px;min-height:0;overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
.xprow{display:grid;grid-template-columns:18px auto minmax(0,1fr) 22px;grid-template-areas:"dot pre in del" "x pv pv pv" "x err err err" "x hint hint hint" "x dom dom dom";
  align-items:center;column-gap:7px;padding:6px 6px 6px 8px;border-radius:9px;box-shadow:inset 2px 0 0 transparent;
  transition:opacity .2s,background .12s,box-shadow .12s}
.xprow.nopre{grid-template-columns:18px 0 minmax(0,1fr) 22px;column-gap:0}
.xprow.nopre .xpdot{margin-right:7px}.xprow.nopre .xpdel{margin-left:7px}
.xprow+.xprow{margin-top:2px}
.xprow.off{opacity:.55}
.xprow.sel{background:rgba(255,255,255,.06)}
.xprow:focus-within{background:rgba(255,255,255,.07);box-shadow:inset 2px 0 0 var(--c)}
.xprow.new{animation:xprowin .26s cubic-bezier(.2,.9,.27,1)}
@keyframes xprowin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.xpdot{grid-area:dot;width:16px;height:16px;padding:0;border-radius:50%;background:var(--c);
  box-shadow:inset 0 0 0 2px var(--c);transition:background .15s,transform .1s}
.xprow.off .xpdot{background:transparent}
.xpdot:active{transform:scale(.9)}
.xppre{grid-area:pre;font-size:12px;letter-spacing:.04em;opacity:.6;white-space:nowrap}
.xprow.nopre .xppre{display:none}
.xpin{grid-area:in;min-width:0;width:100%;min-height:30px;padding:5px 8px;border:0;border-radius:7px;color:#fff;
  font:12px/1.3 var(--mono);letter-spacing:.04em;background:rgba(255,255,255,.07);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);user-select:text}
.xpin::placeholder{color:rgba(233,234,239,.3)}
.xpin:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--accent2)}
.xpin[aria-invalid="true"]:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}
.xpsum{grid-area:in;font-size:11px;letter-spacing:.03em;color:rgba(233,234,239,.84);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:6px 2px}
.xprow.xpdat,.xprow.xpvec{grid-template-columns:18px minmax(0,1fr) auto 22px;grid-template-areas:"dot in fit del"}
.xprow.xpdat .xpdot,.xprow.xpvec .xpdot{margin-right:0}
.xpfit{grid-area:fit;border-radius:6px;padding:3px 6px;font-size:12px;color:rgba(233,234,239,.7);background:rgba(255,255,255,.05)}
.xpdel{grid-area:del;width:22px;height:22px;border-radius:6px;font-size:11px;color:rgba(233,234,239,.45);background:none}
.xpdel:hover,.xpdel:focus-visible,.xpfit:hover,.xpfit:focus-visible{background:var(--accent);color:#fff}
.xppv{grid-area:pv;display:flex;align-items:center;min-height:0;padding:4px 2px 0;overflow-x:auto;color:#f4f5f9;
  font-family:"Latin Modern Math","STIX Two Math","Cambria Math","Noto Sans Math",math,serif;scrollbar-width:thin}
.xppv>*{flex:none}
.xppv math{font-size:17px}
.xppv:empty{display:none}
.xppv.stale{opacity:.3}
.xperr{grid-area:err;margin:3px 0 0;font-size:9px;letter-spacing:.06em;line-height:1.35;color:var(--accent)}
.xperr:empty{display:none}
.xphint{grid-area:hint;margin:3px 0 0;font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(233,234,239,.42)}
.xphint:empty{display:none}
.xpdom{grid-area:dom;display:flex;gap:8px;margin-top:4px;font-size:9px;letter-spacing:.06em;color:rgba(233,234,239,.6)}
.xpdom[hidden]{display:none}
.xpdom label{display:flex;align-items:center;gap:4px}
.xpd{width:52px;min-height:22px;padding:2px 5px;border:0;border-radius:5px;color:#fff;font:10px/1.2 var(--mono);
  background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);user-select:text}
.xpd:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--accent2)}
.xpd.bad{color:#ff9d8a}
.xpadd{margin:6px 8px 0;padding:7px 10px;border-radius:8px;text-align:left;font:600 10px/1 var(--mono);letter-spacing:.12em;
  text-transform:uppercase;color:rgba(233,234,239,.7);background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.xpadd:hover,.xpadd:focus-visible{background:rgba(255,255,255,.12);color:#fff}
.xpfoot{position:absolute;right:0;top:calc(100% + 7px);z-index:4;width:244px;padding:10px;display:grid;gap:7px;
  border-radius:11px;color:#e9eaef;background:color-mix(in srgb,var(--desk) 28%,#171a20 96%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 15px 34px rgba(0,0,0,.42);
  visibility:hidden;opacity:0;pointer-events:none;transform:translateY(-3px) scale(.98);transform-origin:top right;
  transition:opacity .14s,transform .18s cubic-bezier(.2,.9,.27,1),visibility 0s .18s}
.xpanel.adv-open .xpfoot{visibility:visible;opacity:1;pointer-events:auto;transform:none;transition:opacity .18s,transform .2s cubic-bezier(.2,.9,.27,1),visibility 0s}
.xpfoottitle{font:600 9px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:rgba(233,234,239,.52);padding:1px 1px 2px}
.xpseg{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:2px;border-radius:8px;background:rgba(255,255,255,.05)}
.xpseg1,.xpsw{padding:6px 8px;border-radius:6px;font:600 9px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;
  color:rgba(233,234,239,.62);background:none;transition:background .12s,color .12s}
.xpseg1[aria-checked="true"]{background:rgba(255,255,255,.14);color:#fff}
.xpsws{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.xpsw{background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.xpsw[aria-checked="true"]{background:color-mix(in srgb,var(--accent2) 32%,transparent);color:#fff;box-shadow:inset 0 0 0 1px var(--accent2)}
.xpseg1:hover,.xpsw:hover,.xpseg1:focus-visible,.xpsw:focus-visible{color:#fff}
.xplabs{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.xplabs label{display:flex;align-items:center;gap:5px;font-size:10px;letter-spacing:.06em;color:rgba(233,234,239,.6)}
.xpal{min-width:0;width:100%;min-height:26px;padding:3px 7px;border:0;border-radius:6px;color:#fff;font:11px/1.2 var(--mono);
  background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);user-select:text}
.xpal::placeholder{color:rgba(233,234,239,.3)}
.xpal:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--accent2)}
/* on a phone the list is a sheet under the picture, with room for a finger */
@media (pointer:coarse){
  .xpanel,.xpanel.right{right:0;left:0;top:100%;margin:8px 0 0;width:auto;max-height:44vh;transform:translateY(6px)}
  .xpin{min-height:40px}.xpdot{width:22px;height:22px}.xpdel{width:30px;height:30px}
}
@media (prefers-reduced-motion:reduce){.xpanel,.xpanel.right,.xpfoot{transition:opacity .1s;transform:none}}
@media (prefers-reduced-transparency:reduce){.xpanel{backdrop-filter:none;background:#20242a}}
@media (prefers-contrast:more){
  .xpanel{background:#14171c;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)}
  .xpdot{box-shadow:inset 0 0 0 2px var(--c),0 0 0 1px #fff}
}
`);
