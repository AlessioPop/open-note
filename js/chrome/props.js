/* Open Note — ui/props.js
   the properties popover — a small glass panel of sliders and dials.

   A feature opens it over one of its toolbar buttons and says what its rows
   are; this file owns the glass, the warp in and out, the sliders, and the
   sweep dial you drag round. Nothing here knows what a torus is.

     openProps(button, {
       title: 'Torus',
       rows: [
         { t:'range', label:'Outer radius', min:30, max:115, step:1,
           get:() => …, set:v => {…}, fmt:v => v + '%' },
         { t:'angle', label:'Sweep', min:15, get:() => …, set:v => {…} },
         { t:'steps', label:'Rows', min:1, max:8, get, set },      // a − n + stepper
         { t:'btn', label:'', text:'M² on the page'|() => '…',     // one deed
           hint:'…', act(){} }
       ],
       onchange(){},   // after every set — repaint the thing being measured
       onsave(){},     // a gesture ended, or the panel closed — persist
       onreset(){}     // ↺ — back to how it started
     })

   Getters are read back after every change (syncProps), so rows whose limits
   lean on each other — an inner radius pinned under an outer — stay honest,
   and a drag on the shape itself can push its numbers into an open panel. */

let PROPS_SPEC = null, PROPS_ANCHOR = null;
function propsEl(){
  let d = $('#props');
  if(d) return d;
  d = document.createElement('div');
  d.className = 'props glass';
  d.id = 'props';
  d.innerHTML = '<div class="prhead"><b class="prtitle"></b>' +
    '<button class="prreset" title="Back to how it started">↺</button></div><div class="prrows"></div>';
  document.body.appendChild(d);
  d.querySelector('.prreset').addEventListener('click', () => {
    if(PROPS_SPEC && PROPS_SPEC.onreset){ PROPS_SPEC.onreset(); syncProps(); }
  });
  return d;
}

/* ---- the sweep dial ---- */
const dialSVG = () => '<svg class="prdial" viewBox="0 0 52 52">' +
  '<circle class="prtrack" cx="26" cy="26" r="20"/><path class="prarc"/>' +
  '<circle class="prknob" r="4.5"/></svg>';
function setDial(row, deg){
  const th = deg * Math.PI / 180;
  const x = 26 + 20 * Math.cos(th), y = 26 - 20 * Math.sin(th);   /* 0° east, anticlockwise */
  const arc = row.querySelector('.prarc');
  if(deg >= 359.5) arc.setAttribute('d', 'M46 26A20 20 0 1 1 45.99 25.55A20 20 0 0 1 46 26');
  else arc.setAttribute('d', 'M46 26A20 20 0 ' + (deg > 180 ? 1 : 0) + ' 0 ' + rd1(x) + ' ' + rd1(y));
  const k = row.querySelector('.prknob');
  k.setAttribute('cx', rd1(x)); k.setAttribute('cy', rd1(y));
}
function wireDial(row, r){
  const svg = row.querySelector('.prdial');
  const put = (deg, exact) => {
    if(!exact) deg = Math.round(deg / 5) * 5;       /* the dial lands on fives; typing is exact */
    r.set(clamp(Math.round(deg), r.min || 15, 360));
    syncProps();
    if(PROPS_SPEC && PROPS_SPEC.onchange) PROPS_SPEC.onchange();
  };
  svg.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const pid = e.pointerId;
    try{ svg.setPointerCapture(pid); }catch(err){}
    const mv = ev => {
      const b = svg.getBoundingClientRect();
      const dx = ev.clientX - (b.left + b.width / 2), dy = (b.top + b.height / 2) - ev.clientY;
      let a = Math.atan2(dy, dx) * 180 / Math.PI;
      if(a <= 2) a += 360;                          /* just under east reads as full, not as nothing */
      put(a);
    };
    mv(e);
    const up = ev => {
      if(ev.pointerId !== pid) return;
      svg.removeEventListener('pointermove', mv);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
      if(PROPS_SPEC && PROPS_SPEC.onsave) PROPS_SPEC.onsave();
    };
    svg.addEventListener('pointermove', mv);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  });
  const inp = row.querySelector('.prdeg');
  inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if(isFinite(v)) put(v, 1);
    syncProps();
    if(PROPS_SPEC && PROPS_SPEC.onsave) PROPS_SPEC.onsave();
  });
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Enter'){ e.preventDefault(); inp.blur(); }
    if(e.key === 'Escape'){ e.preventDefault(); inp.blur(); }
  });
}

/* every row reads its getter again — see the head of the file for why */
function syncProps(){
  if(!PROPS_SPEC) return;
  for(const r of PROPS_SPEC.rows){
    if(!r.el) continue;
    if(r.t === 'range'){
      const v = r.get();
      r.el.querySelector('input').value = v;
      r.el.querySelector('.prval').textContent = r.fmt ? r.fmt(v) : v;
    } else if(r.t === 'angle'){
      const v = Math.round(r.get());
      setDial(r.el, v);
      const inp = r.el.querySelector('.prdeg');
      if(document.activeElement !== inp) inp.value = v;
    } else if(r.t === 'steps'){
      const v = r.get();
      r.el.querySelector('.prn').textContent = r.fmt ? r.fmt(v) : v;
      r.el.querySelector('.prdec').classList.toggle('dim', v <= r.min);
      r.el.querySelector('.princ').classList.toggle('dim', v >= r.max);
    } else if(r.t === 'btn'){
      const b = r.el.querySelector('.prgo');
      b.textContent = typeof r.text === 'function' ? r.text() : (r.text || 'go');
    }
  }
}

function openProps(anchor, spec){
  const el = propsEl();
  if(el.classList.contains('open') && PROPS_ANCHOR === anchor) return closeProps();
  PROPS_SPEC = spec; PROPS_ANCHOR = anchor;
  el.querySelector('.prtitle').textContent = spec.title || '';
  const rows = el.querySelector('.prrows');
  rows.innerHTML = '';
  for(const r of spec.rows){
    const d = document.createElement('div');
    if(r.t === 'range'){
      d.className = 'prrow';
      d.innerHTML = '<label>' + esc(r.label) + '</label><input type="range" min="' + r.min +
        '" max="' + r.max + '" step="' + (r.step || 1) + '"><b class="prval"></b>';
      const inp = d.querySelector('input');
      inp.addEventListener('input', () => {
        r.set(+inp.value);
        syncProps();
        if(PROPS_SPEC && PROPS_SPEC.onchange) PROPS_SPEC.onchange();
      });
      inp.addEventListener('change', () => { if(PROPS_SPEC && PROPS_SPEC.onsave) PROPS_SPEC.onsave(); });
    } else if(r.t === 'angle'){
      d.className = 'prrow prangle';
      d.innerHTML = '<label>' + esc(r.label) + '</label>' + dialSVG() +
        '<span class="prdeg-wrap"><input class="prdeg" inputmode="numeric">°</span>';
      wireDial(d, r);
    } else if(r.t === 'steps'){
      d.className = 'prrow prsteps';
      d.innerHTML = '<label>' + esc(r.label) + '</label><span class="prstep">' +
        '<button class="prdec" title="Fewer">−</button><b class="prn"></b>' +
        '<button class="princ" title="More">+</button></span>';
      const go = dir => {
        const v = clamp(r.get() + dir, r.min, r.max);
        if(v === r.get()) return;
        r.set(v);
        syncProps();
        if(PROPS_SPEC && PROPS_SPEC.onchange) PROPS_SPEC.onchange();
        if(PROPS_SPEC && PROPS_SPEC.onsave) PROPS_SPEC.onsave();  /* a step is a whole gesture */
      };
      d.querySelector('.prdec').addEventListener('click', () => go(-1));
      d.querySelector('.princ').addEventListener('click', () => go(1));
    } else if(r.t === 'btn'){
      d.className = 'prrow prbtn';
      d.innerHTML = '<label>' + esc(r.label || '') + '</label><button class="prgo"' +
        (r.hint ? ' title="' + esc(r.hint) + '"' : '') + '></button>';
      d.querySelector('.prgo').addEventListener('click', () => {
        if(r.act) r.act();
        syncProps();
      });
    }
    r.el = d;
    rows.appendChild(d);
  }
  el.classList.add('open');
  syncProps();
  /* above the button it came from; when the top of the screen is in the way,
     step to whichever side has more room — never over the thing being
     measured, which the whole point is to watch changing. Below is last. */
  const r = anchor.getBoundingClientRect();
  /* stepping sideways, it steps past the whole toolbar the button sits in —
     half a toolbar hidden behind the panel is half a toolbar lost */
  const tr = (anchor.closest('.tools') || anchor).getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let x, y;
  if(r.top - h - 10 >= 8){
    x = r.left + r.width / 2 - w / 2; y = r.top - h - 10;
  } else {
    /* towards the nearer screen edge first — that is usually bare desk, and
       never the middle of the page the shape is standing on */
    const toLeft = r.left + r.width / 2 < innerWidth / 2;
    const fitsL = tr.left - w - 12 >= 8, fitsR = tr.right + w + 12 <= innerWidth - 8;
    if((toLeft && fitsL) || (!fitsR && fitsL)){ x = tr.left - w - 12; y = r.top - 6; }
    else if(fitsR){ x = tr.right + 12; y = r.top - 6; }
    else { x = r.left + r.width / 2 - w / 2; y = r.bottom + 10; }
  }
  el.style.left = clamp(x, 8, innerWidth - w - 8) + 'px';
  el.style.top = clamp(y, 8, innerHeight - h - 8) + 'px';
  warpIn(el, r.left + r.width / 2, r.top + r.height / 2);
}
function closeProps(){
  const el = $('#props');
  if(!el || !el.classList.contains('open') || !PROPS_SPEC) return;
  if(PROPS_SPEC.onsave) PROPS_SPEC.onsave();
  PROPS_SPEC = null; PROPS_ANCHOR = null;
  warpOut(el, () => { if(!PROPS_SPEC) el.classList.remove('open'); });
}
window.addEventListener('pointerdown', e => {
  if(PROPS_SPEC && !e.target.closest('#props') &&
     !(PROPS_ANCHOR && (e.target === PROPS_ANCHOR || PROPS_ANCHOR.contains(e.target))))
    closeProps();
});
window.addEventListener('keydown', e => {
  const inPanel = e.target && e.target.closest && e.target.closest('#props');
  if(PROPS_SPEC && e.key === 'Escape' && !inPanel){
    e.stopPropagation();
    closeProps();
  }
}, true);

/* ---- how it looks ---- */
addCSS('props', `
/* ---------- the properties popover ---------- */
.props{position:fixed;z-index:82;display:none;width:238px;border-radius:15px;padding:12px 13px 13px;
  font-family:var(--mono);will-change:transform,filter,opacity}
.props.open{display:block}
.prhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.prtitle{font-size:10px;font-weight:400;letter-spacing:.18em;text-transform:uppercase;opacity:.85}
.prreset{padding:3px 8px;border-radius:7px;font-size:12px;color:rgba(233,234,239,.7);
  background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.prreset:hover{color:#fff;background:rgba(255,255,255,.1)}
.prrow{display:grid;grid-template-columns:1fr 104px 40px;align-items:center;gap:8px;padding:6px 0}
.prrow label{font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(233,234,239,.62)}
.prrow .prval{font-size:10px;font-weight:400;text-align:right;opacity:.85;font-variant-numeric:tabular-nums}
.prrow input[type=range]{width:100%;height:16px;margin:0;accent-color:var(--accent);cursor:pointer}
.prangle{grid-template-columns:1fr 52px 52px}
.prdial{width:52px;height:52px;cursor:pointer;touch-action:none}
.prdial .prtrack{fill:none;stroke:rgba(255,255,255,.14);stroke-width:3}
.prdial .prarc{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round}
.prdial .prknob{fill:#fff;stroke:rgba(0,0,0,.35);stroke-width:1}
.prdeg-wrap{display:flex;align-items:baseline;gap:2px;justify-content:flex-end;font-size:11px;opacity:.9}
.prdeg-wrap .prdeg{width:34px;background:rgba(255,255,255,.07);border:0;outline:0;border-radius:6px;
  color:inherit;font-family:var(--mono);font-size:11px;text-align:right;padding:3px 5px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);font-variant-numeric:tabular-nums}
.prdeg-wrap .prdeg:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}
.prsteps{grid-template-columns:1fr auto}
.prstep{display:flex;align-items:center;gap:7px;justify-self:end}
.prstep button{width:24px;height:24px;border-radius:7px;font-size:13px;line-height:1;
  color:rgba(233,234,239,.85);background:rgba(255,255,255,.06);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.prstep button:hover{background:rgba(255,255,255,.13);color:#fff}
.prstep button.dim{opacity:.3;pointer-events:none}
.prstep .prn{min-width:2.2ch;text-align:center;font-size:11px;font-weight:400;font-variant-numeric:tabular-nums}
.prbtn{grid-template-columns:1fr}
.prbtn label:empty{display:none}
.prbtn .prgo{justify-self:stretch;padding:6px 10px;border-radius:8px;font-size:10.5px;
  letter-spacing:.06em;color:rgba(233,234,239,.9);background:rgba(255,255,255,.07);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.prbtn .prgo:hover{background:var(--accent);color:#fff}
`);
